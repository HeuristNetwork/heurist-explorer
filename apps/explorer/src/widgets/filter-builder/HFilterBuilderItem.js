/**
 * @file HFilterBuilderItem.js
 * @brief One flat field criterion row in the Filter Builder (field · operator · value).
 *
 * Framework-free re-implementation of the legacy `heurist.searchBuilderItem`
 * (`hclient/widgets/search/searchBuilderItem.js`), scoped to M3: a single field
 * predicate on one record type. Layout mirrors the legacy row:
 *   [field selector] [× remove] [operator] [ value column ]
 * The value column stacks multiple values; a value conjunction selector sits in
 * front of the 2nd value and a static AND/OR label in front of the 3rd+.
 * Emits/consumes the `FieldRow` shape from `src/utils/queryModel.js`.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { createHInput } from '#shared/widgets/form/inputs/createHInput.js';
import { extentToWkt, isExtent, roundExtent } from '#shared/utils';
import { $HR } from '#shared/ui';
import { emptyFieldRow } from '../../utils/queryModel.js';
import { HEADER_KEYWORDS } from '../../utils/queryPredicates.js';
import { str, kindFor, operatorsFor, operatorByKey } from '../../utils/vocabHelpers.js';

const HEADER_LABELS = {
  title: 'Title', url: 'URL', notes: 'Notes', added: 'Date added',
  modified: 'Date modified', ids: 'Record ID', owner: 'Owner',
  addedby: 'Creator', access: 'Visibility', tag: 'Tags', user: 'Bookmarked by'
};
const MULTI_INPUTS = ['text', 'term', 'record', 'tag'];

/** One flat field criterion row (field · operator · value) in the Filter Builder. */
export class HFilterBuilderItem extends HBaseWidget {
  /**
   * @param {{dbdefs:object, vocabulary:object, lang:string,
   *          onChange?:Function, onRequestFieldPick?:Function, scopeRtyId?:(number|string),
   *          relationVocabRoots?:(() => number[])}} deps
   */
  constructor({ dbdefs, vocabulary, lang = 'eng', onChange, onRequestFieldPick,
    selectExtent, scopeRtyId = '', relationVocabRoots = null } = {}) {
    super();
    // vocabulary roots for a relation-type row of a related branch (set by LinkPanel)
    this._relationVocabRoots = relationVocabRoots;
    this.dbdefs = dbdefs;
    this.vocab = vocabulary;
    this.lang = lang;
    this._onChange = onChange || (() => {});
    this._onRequestFieldPick = onRequestFieldPick || null;
    this.scopeRtyId = scopeRtyId;
    this.selectExtent = selectExtent;
    this.row = emptyFieldRow();
    this._valueWidgets = [];
  }

  /**
   * Attach the widget to its container.
   *
   * @param {HTMLElement} container Container element.
   * @param {object} [options] Widget options.
   * @returns {HFilterBuilderItem} This instance, for chaining.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    return this;
  }

  /**
   * Render the field selector, remove button, operator select, and value column.
   *
   * @returns {HFilterBuilderItem} This instance, for chaining.
   * @throws {Error} When the widget has not been attached yet.
   */
  render() {
    if (!this.container) throw new Error('HFilterBuilderItem must be attached before render');
    this.container.classList.add('h-fbitem');
    this.container.replaceChildren();

    // field selector button
    this._fieldBtn = document.createElement('button');
    this._fieldBtn.type = 'button';
    this._fieldBtn.className = 'h-btn h-fbitem-field';
    this._fieldBtn.addEventListener('click', () => this._onRequestFieldPick?.(this, this._fieldBtn));

    // remove (between field selector and operator, per legacy)
    const remove = mkbtn('×', 'heurist-icon-button h-fbitem-remove', () => {
      this.destroy();
      this._onChange({ removed: true });
    });
    remove.title = $HR('Remove this search token');

    // operator (borderless)
    this._opSel = document.createElement('select');
    this._opSel.className = 'h-select h-fbitem-op';
    this._opSel.addEventListener('change', () => {
      const wasCount = this.row.op === 'op.count';
      this.row.op = this._opSel.value;
      if (wasCount !== (this.row.op === 'op.count')) {
        // a count and a field value are different things (a number vs a date,
        // WKT, text …) - never carry one over as the other
        this.row.values = [''];
        this.row.geoExtent = null;
      } else if (operatorByKey(this.vocab, this.row.kind, this.row.op)?.input !== 'range') {
        this.row.values = [this.row.values[0] ?? ''];
      }
      this._renderValues();
      this._emit();
    });

    // value column
    this._valuesHost = document.createElement('div');
    this._valuesHost.className = 'h-fbitem-values';

    this.container.append(this._fieldBtn, remove, this._opSel, this._valuesHost);

    this._syncField();
    this._renderOperators();
    this._renderValues();
    this.state = 'rendered';
    return this;
  }

  // -------------------------------------------------------------- row model ---

  /** @returns {import('../../utils/queryModel.js').FieldRow} */
  getRowModel() {
    return { ...this.row, values: this.row.values.map((v) => String(v ?? '')) };
  }

  /** @param {import('../../utils/queryModel.js').FieldRow} row */
  setRowModel(row) {
    this.row = { ...emptyFieldRow(), ...row };
    if (typeof this.row.dty === 'number' || /^\d+$/.test(String(this.row.dty))) {
      const fieldType = this.dbdefs?.fieldType?.(this.scopeRtyId, this.row.dty)
        || this.dbdefs?.fieldGlobal?.(this.row.dty)?.type;
      if (fieldType) this.row.kind = kindFor(this.vocab, fieldType);
    }
    if (!Array.isArray(this.row.values) || !this.row.values.length) this.row.values = [''];
    if (this.isRendered) {
      this._syncField();
      this._renderOperators();
      this._renderValues();
    }
    return this;
  }

  /** Called by the field-tree pick. @param {{dty:(number|string), fieldType?:string}} pick */
  setField({ dty, fieldType, rel = false }) {
    this.row.dty = dty;
    this.row.selected = true;
    this.row.rel = rel;
    const isHeader = typeof dty === 'string' && !/^\d+$/.test(dty) && dty !== 'anyfield' && dty !== 'reltype';
    this.row.kind = dty === 'exists' ? 'exists' : dty === 'reltype' ? 'term' : isHeader
      ? kindFor(this.vocab, null, HEADER_KEYWORDS[dty] ? dty : null)
      : kindFor(this.vocab, fieldType || this.dbdefs?.fieldType?.(null, dty) || 'freetext');
    if (this.row.kind !== 'enum') this.row.enumField = null;
    this.row.op = this._operators()[0]?.i18nKey || null;
    this.row.values = [''];
    this.row.geoExtent = null;
    this.row.placeholderIds = [];
    if (this.isRendered) {
      this._syncField();
      this._renderOperators();
      this._renderValues();
    }
    this._emit();
  }

  /**
   * Change the row's scope record type (affects field-name resolution).
   *
   * @param {number|string} rtyId Scope record type id.
   * @returns {void}
   */
  setScope(rtyId) {
    this.scopeRtyId = rtyId;
  }

  /** Open the shared field picker for this condition. */
  openFieldPicker() {
    this._onRequestFieldPick?.(this, this._fieldBtn);
  }

  // ---------------------------------------------------------------- private ---

  /**
   * Refresh the field selector button's label from the current row's field.
   *
   * @private
   * @returns {void}
   */
  _syncField() {
    const d = this.row.dty;
    let label;
    if (d === 'reltype') label = $HR('Relation type');
    else if (this.row.rel && /^\d+$/.test(String(d))) {
      const relRty = this.dbdefs?.dbconst?.('RT_RELATION') ?? 1;
      label = `${$HR('Relationship')} · ${this.dbdefs?.fieldName?.(relRty, d) || `field ${d}`}`;
    }
    else if (d === 'anyfield' || d === '' || d == null) label = this.row.selected ? $HR('Any field') : $HR('Select field');
    else if (typeof d === 'string' && !/^\d+$/.test(d)) label = $HR(HEADER_LABELS[d] || d);
    else {
      label = this.dbdefs?.fieldName?.(this.scopeRtyId, d) || this.dbdefs?.fieldGlobal?.(d)?.name || `field ${d}`;
      if (this.row.enumField) label += ` · ${this.row.enumField}`;
    }
    this._fieldBtn.textContent = label + ' ▾';
  }

  /**
   * Rebuild the operator select's options for the row's current field kind, reconciling its value.
   *
   * @private
   * @returns {void}
   */
  _renderOperators() {
    const list = this._operators();
    this._opSel.replaceChildren();
    for (let index = 0; index < list.length; index++) {
      const op = list[index];
      if (index > 0 && (op.i18nKey === 'op.is_set'
        || (op.i18nKey === 'op.count' && !list.some((entry) => entry.i18nKey === 'op.is_set')))) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '────────';
        this._opSel.append(separator);
      }
      const o = document.createElement('option');
      o.value = op.i18nKey;
      o.textContent = op.i18nKey === 'op.count' ? $HR('count of values')
        : op.i18nKey === 'op.exists' ? $HR('exists')
          : op.i18nKey === 'op.missing' ? $HR('missing')
            : str(this.vocab, this.lang, op.i18nKey);
      this._opSel.append(o);
    }
    if (!this.row.op || !list.some((o) => o.i18nKey === this.row.op)) {
      this.row.op = this._reconcileOp(list);
    }
    this._opSel.value = this.row.op || (list[0]?.i18nKey ?? '');
  }

  /**
   * Terms offered by a term/enum value picker: the field's vocabulary, or for the
   * relation type of a related branch the relmarker's vocabulary. With several
   * vocabularies (branch of unknown relmarker) each root is kept as a heading term.
   *
   * @private
   * @returns {Array<{id:number,label:string,depth:number}>}
   */
  _termOptions() {
    const roots = this.row.dty === 'reltype'
      ? (this._relationVocabRoots?.() || [])
      : [this.dbdefs?.vocabRoot?.(this.row.dty) || 0].filter(Boolean);
    if (roots.length === 1) return flattenTerms(this.dbdefs.termTree(roots[0])).slice(1);
    return roots.flatMap((root) => flattenTerms(this.dbdefs.termTree(root)));
  }

  /** Operators available for the selected field. */
  _operators() {
    // relation types are matched only positively (`r` has no negation)
    if (this.row.dty === 'reltype') return [{ token: '', input: 'term', i18nKey: 'op.is' }];
    const list = operatorsFor(this.vocab, this.row.kind)
      .filter((op) => !this.row.rel || op.i18nKey !== 'op.count');   // relf has no count form
    if (['owner', 'access', 'addedby'].includes(this.row.dty)) {
      return [
        { token: '', input: 'text', i18nKey: 'op.is' },
        { token: '-', input: 'text', i18nKey: 'op.is_not' }
      ];
    }
    const noNull = ['ids', 'title', 'added', 'modified', 'addedby', 'owner', 'access', 'anyfield'].includes(this.row.dty);
    return list.filter((op) => (!noNull || !['op.is_set', 'op.is_empty'].includes(op.i18nKey))
      && (/^\d+$/.test(String(this.row.dty)) || op.i18nKey !== 'op.count'));
  }

  /** Pick an operator i18nKey from a raw token carried over by parseQuery. */
  _reconcileOp(list) {
    if (['owner', 'access', 'addedby'].includes(this.row.dty) && this.row.negate) {
      this.row.negate = false;
      return 'op.is_not';
    }
    if (this.row.opToken != null) {
      const exact = list.filter((o) => (o.token || '') === this.row.opToken && !o.pattern);
      if (exact.length) return exact[0].i18nKey;
      const any = list.find((o) => (o.token || '') === this.row.opToken);
      if (any) return any.i18nKey;
    }
    return list[0]?.i18nKey ?? null;
  }

  /**
   * Localized, upper-cased AND/OR word for the row's current value conjunction.
   *
   * @private
   * @returns {string}
   */
  _conjWord() {
    const key = this.row.valueConj === 'all' ? 'phrase.and' : 'phrase.or';
    return (str(this.vocab, this.lang, key).trim() || this.row.valueConj).toUpperCase();
  }

  /**
   * Rebuild the value column for the row's current operator (none/range/single/multi-value).
   *
   * @private
   * @returns {void}
   */
  _renderValues() {
    const opDef = operatorByKey(this.vocab, this.row.kind, this.row.op) || { input: 'text' };
    const input = opDef.whole ? 'none' : (opDef.input || 'text');
    if (opDef.whole) this.row.placeholderIds = [];
    for (const widget of this._valueWidgets) void widget.destroy();
    this._valueWidgets = [];
    this._valuesHost.replaceChildren();

    if (input === 'none') return;

    if (input === 'range') {
      if (this.row.values.length < 2) this.row.values = [this.row.values[0] || '', ''];
      const line = valRow();
      line.append(
        conjSlot(),
        this._valueControl(this.row.kind === 'date' ? 'date' : 'number', 0, $HR('from')),
        Object.assign(document.createElement('span'), { className: 'h-fbitem-rangesep', textContent: '–' }),
        this._valueControl(this.row.kind === 'date' ? 'date' : 'number', 1, $HR('to'))
      );
      this._valuesHost.append(line);
      return;
    }

    if (input === 'count') {
      const control = this._valueControl('text', 0, $HR('Use >N, <N or <>N where N is count'));
      control.title = $HR('Use >N, <N or <>N where N is count');
      this._valuesHost.append(control);
      return;
    }

    const multiOk = MULTI_INPUTS.includes(input);
    for (let i = 0; i < this.row.values.length; i++) {
      const line = valRow();
      line.append(this._conjPrefix(i, multiOk));
      line.append(this._valueControl(input, i));
      if (this.row.values.length > 1) {
        line.append(mkbtn('−', 'heurist-icon-button h-fbitem-delval', () => {
          this.row.values.splice(i, 1);
          this._renderValues();
          this._emit();
        }));
      }
      this._valuesHost.append(line);
    }
  }

  /**
   * Fixed-width cell in front of value `index`:
   *   0  -> the "add value" button (multi inputs only)
   *   1  -> the AND/OR selector
   *   2+ -> a static AND/OR label
   */
  _conjPrefix(index, multiOk = false) {
    if (index === 0) {
      const slot = conjSlot();
      if (multiOk) {
        const add = mkbtn('+', 'heurist-icon-button h-fbitem-addval', () => {
          this.row.values.push('');
          this._renderValues();
          this._emit();
        });
        add.title = $HR('Add another value');
        slot.append(add);
      }
      return slot;
    }

    if (index === 1) {
      const sel = document.createElement('select');
      sel.className = 'h-select h-fbitem-conj';
      for (const [val, key] of [['any', 'phrase.or'], ['all', 'phrase.and']]) {
        const o = document.createElement('option');
        o.value = val;
        o.textContent = (str(this.vocab, this.lang, key).trim() || val).toUpperCase();
        sel.append(o);
      }
      sel.value = this.row.valueConj;
      sel.addEventListener('change', () => {
        this.row.valueConj = sel.value;
        this._renderValues();
        this._emit();
      });
      return sel;
    }

    const lbl = document.createElement('span');
    lbl.className = 'h-fbitem-conjlabel';
    lbl.textContent = this._conjWord();
    return lbl;
  }

  /**
   * Build one value control (term select, bool select, record input, WKT textarea, or plain input).
   *
   * @private
   * @param {string} input Input kind: `term`, `bool`, `record`, `wkt`, `number`, `date`, or `text`.
   * @param {number} index Index into `this.row.values` this control edits.
   * @param {string} [placeholder=''] Placeholder text for text-like inputs.
   * @returns {HTMLElement}
   */
  _valueControl(input, index, placeholder = '') {
    const set = (v) => { this.row.values[index] = v; this._emit(); };
    const current = this.row.values[index] ?? '';

    if (this.row.dty === 'access') {
      return choiceControl([
        ['', '— select —'], ['viewable', 'viewable'], ['hidden', 'hidden'],
        ['public', 'public'], ['pending', 'pending']
      ], current, set);
    }

    if (this.row.dty === 'owner' || this.row.dty === 'addedby') {
      const user = globalThis.window?.hWin?.HAPI4?.currentUser;
      if (user?.ugr_ID) {
        const options = [['', '— select —'], [String(user.ugr_ID), user.ugr_FullName || 'Current user']];
        if (current && !options.some(([value]) => value === current)) options.push([current, current]);
        return choiceControl(options, current, set);
      }
    }

    if (['text', 'number', 'date', 'term'].includes(input)) {
      const host = document.createElement('div');
      host.className = 'h-fbitem-value-widget';
      const type = { text: 'text', number: 'numeric', date: 'date', term: 'enum' }[input];
      const terms = input === 'term' ? this._termOptions() : [];
      const widget = createHInput(type, host, {
        suppressLabel: true,
        value: current,
        integer: this.dbdefs?.fieldGlobal?.(this.row.dty)?.type === 'integer',
        terms,
        emptyLabel: $HR('— select —'),
        allowLegacyText: input === 'date',
        placeholder
      });
      host.addEventListener('h-input-change', () => set(widget.getValue() ?? ''));
      this._valueWidgets.push(widget);
      return host;
    }

    if (input === 'term') {
      const sel = document.createElement('select');
      sel.className = 'h-select';
      const root = this.dbdefs?.vocabRoot?.(this.row.dty) || 0;
      const opts = root ? this.dbdefs.termTree(root, { flat: true }) : [];
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = $HR('— select —');
      sel.append(blank);
      for (const term of opts) {
        if (!term || term.id === root) continue;
        const o = document.createElement('option');
        o.value = String(term.id);
        o.textContent = term.label;
        sel.append(o);
      }
      sel.value = current;
      sel.addEventListener('change', () => set(sel.value));
      return sel;
    }

    if (input === 'bool') {
      const sel = document.createElement('select');
      sel.className = 'h-select';
      for (const [v, label] of [['', '—'], ['1', $HR('yes')], ['0', $HR('no')]]) {
        const o = document.createElement('option');
        o.value = v; o.textContent = label; sel.append(o);
      }
      sel.value = current;
      sel.addEventListener('change', () => set(sel.value));
      return sel;
    }

    if (input === 'record') {
      const wrap = document.createElement('span');
      wrap.className = 'h-fbitem-record';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'h-input';
      inp.placeholder = $HR('record id(s)');
      inp.value = current;
      inp.addEventListener('input', () => set(inp.value));
      const pick = mkbtn($HR('Pick…'), 'h-btn h-btn-small', null);
      pick.disabled = true;
      pick.title = $HR('Record picker — coming soon');
      wrap.append(inp, pick);
      return wrap;
    }

    if (input === 'wkt') {
      const host = document.createElement('div');
      host.className = 'h-fbitem-value-widget';
      const widget = createHInput('geo', host, {
        suppressLabel: true,
        value: this.row.geoExtent || current,
        selectExtent: this.selectExtent
      });
      host.addEventListener('h-input-change', () => {
        const value = widget.getValue();
        // an extent is kept (and composed) as {west,south,east,north}, rounded
        // to a precision that suits its size; the WKT copy only marks the row as filled
        const extent = isExtent(value) ? roundExtent(value) : null;
        if (extent) widget.setValue(extent);
        this.row.geoExtent = extent;
        set(extent ? extentToWkt(extent) : String(value ?? ''));
      });
      this._valueWidgets.push(widget);
      return host;
    }

    const inp = document.createElement('input');
    inp.className = 'h-input';
    inp.type = input === 'number' ? 'number' : 'text';
    if (input === 'date') inp.placeholder = placeholder || 'YYYY-MM-DD';
    else if (placeholder) inp.placeholder = placeholder;
    inp.value = current;
    inp.addEventListener('input', () => set(inp.value));
    return inp;
  }

  /**
   * Notify the owning builder of the row's current model.
   *
   * @private
   * @returns {void}
   */
  _emit() {
    this._onChange({ row: this.getRowModel() });
  }

  /**
   * Clear the row's DOM.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    for (const widget of this._valueWidgets) await widget.destroy();
    this._valueWidgets = [];
    this.container?.replaceChildren();
    this.container?.classList.remove('h-fbitem');
    await super.destroy();
  }
}

/** Flatten a vocabulary tree while retaining each term's depth. */
function flattenTerms(root) {
  if (!root) return [];
  const result = [];
  const visit = (term, depth) => {
    result.push({ ...term, depth });
    for (const child of term.children || []) visit(child, depth + 1);
  };
  visit(root, 0);
  return result;
}

/** Build a labeled button with an optional click handler. */
function mkbtn(text, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** Build one value row's container element. */
function valRow() {
  const d = document.createElement('div');
  d.className = 'h-fbitem-valrow';
  return d;
}

/** Build the fixed-width conjunction-prefix slot element. */
function conjSlot() {
  const s = document.createElement('span');
  s.className = 'h-fbitem-conjslot';
  return s;
}

/** Build a small native dropdown for fixed metadata choices. */
function choiceControl(choices, current, onChange) {
  const select = document.createElement('select');
  select.className = 'h-select';
  for (const [value, label] of choices) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = $HR(label);
    select.append(option);
  }
  select.value = current;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}
