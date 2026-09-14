/**
 * @file HFilterBuilderItem.js
 * @brief One flat field criterion row in the Filter Builder (field · operator · value).
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer.widgets.filter
 * @link        https://HeuristNetwork.org
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 *
 * Framework-free re-implementation of the legacy `heurist.searchBuilderItem`
 * (`hclient/widgets/search/searchBuilderItem.js`), scoped to M3: a single field
 * predicate on one record type. Layout mirrors the legacy row:
 *   [field selector] [× remove] [operator] [ value column ]
 * The value column stacks multiple values; a value conjunction selector sits in
 * front of the 2nd value and a static AND/OR label in front of the 3rd+.
 * Emits/consumes the `FieldRow` shape from `src/utils/queryModel.js`.
 */

import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
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

export class HFilterBuilderItem extends HBaseWidget {
  /**
   * @param {{dbdefs:object, vocabulary:object, lang:string,
   *          onChange?:Function, onRequestFieldPick?:Function, scopeRtyId?:(number|string)}} deps
   */
  constructor({ dbdefs, vocabulary, lang = 'eng', onChange, onRequestFieldPick, scopeRtyId = '' } = {}) {
    super();
    this.dbdefs = dbdefs;
    this.vocab = vocabulary;
    this.lang = lang;
    this._onChange = onChange || (() => {});
    this._onRequestFieldPick = onRequestFieldPick || null;
    this.scopeRtyId = scopeRtyId;
    this.row = emptyFieldRow();
  }

  attach(container, options = {}) {
    super.attach(container, options);
    return this;
  }

  render() {
    if (!this.container) throw new Error('HFilterBuilderItem must be attached before render');
    this.container.className = 'h-fbitem';
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
      this.row.op = this._opSel.value;
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
    if (!Array.isArray(this.row.values) || !this.row.values.length) this.row.values = [''];
    if (this.isRendered) {
      this._syncField();
      this._renderOperators();
      this._renderValues();
    }
    return this;
  }

  /** Called by the field-tree pick. @param {{dty:(number|string), fieldType?:string}} pick */
  setField({ dty, fieldType }) {
    this.row.dty = dty;
    const isHeader = typeof dty === 'string' && !/^\d+$/.test(dty) && dty !== 'anyfield';
    this.row.kind = isHeader
      ? kindFor(this.vocab, null, HEADER_KEYWORDS[dty] ? dty : null)
      : kindFor(this.vocab, fieldType || this.dbdefs?.fieldType?.(null, dty) || 'freetext');
    if (this.row.kind !== 'enum') this.row.enumField = null;
    this.row.op = operatorsFor(this.vocab, this.row.kind)[0]?.i18nKey || null;
    this.row.values = [''];
    if (this.isRendered) {
      this._syncField();
      this._renderOperators();
      this._renderValues();
    }
    this._emit();
  }

  setScope(rtyId) {
    this.scopeRtyId = rtyId;
  }

  // ---------------------------------------------------------------- private ---

  _syncField() {
    const d = this.row.dty;
    let label;
    if (d === 'anyfield' || d === '' || d == null) label = $HR('Select field');
    else if (typeof d === 'string' && !/^\d+$/.test(d)) label = $HR(HEADER_LABELS[d] || d);
    else {
      label = this.dbdefs?.fieldName?.(this.scopeRtyId, d) || this.dbdefs?.fieldGlobal?.(d)?.name || `field ${d}`;
      if (this.row.enumField) label += ` · ${this.row.enumField}`;
    }
    this._fieldBtn.textContent = label + ' ▾';
  }

  _renderOperators() {
    const list = operatorsFor(this.vocab, this.row.kind);
    this._opSel.replaceChildren();
    for (const op of list) {
      const o = document.createElement('option');
      o.value = op.i18nKey;
      o.textContent = str(this.vocab, this.lang, op.i18nKey);
      this._opSel.append(o);
    }
    if (!this.row.op || !list.some((o) => o.i18nKey === this.row.op)) {
      this.row.op = this._reconcileOp(list);
    }
    this._opSel.value = this.row.op || (list[0]?.i18nKey ?? '');
  }

  /** Pick an operator i18nKey from a raw token carried over by parseQuery. */
  _reconcileOp(list) {
    if (this.row.opToken != null) {
      const exact = list.filter((o) => (o.token || '') === this.row.opToken && !o.pattern);
      if (exact.length) return exact[0].i18nKey;
      const any = list.find((o) => (o.token || '') === this.row.opToken);
      if (any) return any.i18nKey;
    }
    return list[0]?.i18nKey ?? null;
  }

  _conjWord() {
    const key = this.row.valueConj === 'all' ? 'phrase.and' : 'phrase.or';
    return (str(this.vocab, this.lang, key).trim() || this.row.valueConj).toUpperCase();
  }

  _renderValues() {
    const opDef = operatorByKey(this.vocab, this.row.kind, this.row.op) || { input: 'text' };
    const input = opDef.whole ? 'none' : (opDef.input || 'text');
    this._valuesHost.replaceChildren();

    if (input === 'none') return;

    if (input === 'range') {
      if (this.row.values.length < 2) this.row.values = [this.row.values[0] || '', ''];
      const line = valRow();
      line.append(
        conjSlot(),
        this._valueControl('text', 0, $HR('from')),
        Object.assign(document.createElement('span'), { className: 'h-fbitem-rangesep', textContent: '–' }),
        this._valueControl('text', 1, $HR('to'))
      );
      this._valuesHost.append(line);
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

  _valueControl(input, index, placeholder = '') {
    const set = (v) => { this.row.values[index] = v; this._emit(); };
    const current = this.row.values[index] ?? '';

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
      const ta = document.createElement('textarea');
      ta.className = 'h-input h-fbitem-wkt';
      ta.rows = 2;
      ta.placeholder = $HR('WKT or bounding box');
      ta.value = current;
      ta.addEventListener('input', () => set(ta.value));
      return ta;
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

  _emit() {
    this._onChange({ row: this.getRowModel() });
  }

  async destroy() {
    this.container?.replaceChildren();
    this.container?.classList.remove('h-fbitem');
    await super.destroy();
  }
}

function mkbtn(text, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
function valRow() {
  const d = document.createElement('div');
  d.className = 'h-fbitem-valrow';
  return d;
}
function conjSlot() {
  const s = document.createElement('span');
  s.className = 'h-fbitem-conjslot';
  return s;
}
