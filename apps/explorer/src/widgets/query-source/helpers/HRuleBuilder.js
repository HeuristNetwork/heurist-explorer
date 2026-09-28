/**
 * @file HRuleBuilder.js
 * @brief Native Explorer expansion-rule editor and dialog facade.
 *
 * Reimplements the legacy hclient/widgets/search/ruleBuilder dialog without
 * jQuery, iframe or host callbacks. Persisted rule objects remain unchanged:
 *   { query: Object, levels: Array<Object> }
 * An empty parent query (`{"t":10,"lf":[]}`) starts from any record type, i.e.
 * the parent result; `connected` follows pointers and relationships. `t` may
 * list several record types (`{"t":[10,12]}`).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR, HMsg } from '#shared/ui';
import { createHInput } from '#shared/widgets/form/inputs/createHInput.js';
import { TermSource, RectypeSource } from '#shared/data/valueSources/index.js';
import { MAX_RULE_DEPTH, typeIds } from '#shared/data/expansionRules.js';
import { HFilterBuilder, hideUnusedToggle } from '../../filter-builder/HFilterBuilder.js';
import queryVocabulary from '../../../utils/queryVocabulary.json' with { type: 'json' };
import './QuerySourceHelpers.css';

const LINK_NAMES = ['connected', 'links', 'lt', 'lf', 'rt', 'rf', 'related'];
/**
 * Traversals without a field, in menu order. `rf`/`rt` are offered only to keep
 * a loaded rule that uses them.
 */
const GENERIC_KINDS = [
  { kind: 'connected', label: 'Any pointer or relationship', pointers: true, relations: true },
  { kind: 'links', label: 'Any pointer', pointers: true },
  { kind: 'lf', label: 'Any outgoing pointer', pointers: true, reverse: false },
  { kind: 'lt', label: 'Any incoming pointer', pointers: true, reverse: true },
  { kind: 'related', label: 'Any relationship', relations: true },
  { kind: 'rf', label: 'Any outgoing relationship', relations: true, reverse: false, legacyOnly: true },
  { kind: 'rt', label: 'Any incoming relationship', relations: true, reverse: true, legacyOnly: true }
];
const genericKey = (kind) => `any:${kind}`;

/** Native expansion-rule editor. `open()` is the dialog facade used by QuerySourceEditor. */
export class HRuleBuilder extends HBaseWidget {
  /**
   * @param {object} options
   * @param {object} options.dbdefs HDbDefs instance.
   * @param {string} [options.lang='eng'] UI/query language.
   * @param {Function|null} [options.describeRules] Optional summary formatter.
   */
  constructor({ dbdefs, lang = 'eng', describeRules = null } = {}) {
    super();
    if (!dbdefs) throw new TypeError('HRuleBuilder requires dbdefs');
    this.dbdefs = dbdefs;
    this.lang = lang;
    this.describeRules = describeRules;
    this.rules = [];
    this.recordTypes = [];
    this._rows = [];
    // shared by every row: hide record types without records from the selectors
    this._prefs = { hideUnused: true };
  }

  setRules(rules) {
    this.rules = Array.isArray(rules) ? clone(rules) : [];
    if (this.isRendered) this._syncRows();
    return this;
  }

  getRules() {
    if (this.isRendered) this.rules = this._rows.map((row) => row.getRule()).filter(Boolean);
    return clone(this.rules);
  }

  /** Record type(s) of the current data source: listed first and preselected in new rules. */
  setRecordTypes(recordTypes) {
    const values = Array.isArray(recordTypes) ? recordTypes : [recordTypes];
    this.recordTypes = [...new Set(values.map(Number).filter((id) => id > 0))];
    return this;
  }

  /** Open the native rule builder dialog. Resolves to edited rules or the original rules on Cancel. */
  async open(options = {}) {
    if (options.recordTypes) this.setRecordTypes(options.recordTypes);
    if (!this.recordTypes.length) {
      const rty = inferRecordTypeId(options.dataSource?.request?.q);
      if (rty) this.setRecordTypes([rty]);
    }

    const original = this.getRules();
    const host = document.createElement('div');
    host.className = 'h-rule-builder-dialog';
    this.attach(host).render();

    return new Promise((resolve) => {
      const id = `h-rule-builder-${Date.now()}`;
      let finished = false;
      const finish = async (apply) => {
        if (finished) return;
        finished = true;
        const value = apply ? this.getRules() : original;
        HMsg.closeMsgDlg(id);
        await this.destroy();
        resolve(clone(value));
      };
      const dlg = HMsg.showMsgDlg(host, {
        dialogId: id,
        title: $HR('Expansion rules'),
        preventClose: true,
        buttons: [
          { label: $HR('Apply'), class: 'h-btn h-btn-primary', onClick: () => void finish(true) },
          { label: $HR('Cancel'), class: 'h-btn', onClick: () => void finish(false) }
        ]
      });
      dlg?.classList.add('h-rule-builder-dialog-shell');
    });
  }

  render() {
    if (!this.container) throw new Error('HRuleBuilder must be attached before render');
    this.container.className = 'h-rule-builder';
    this.container.replaceChildren();

    const head = document.createElement('div');
    head.className = 'h-rule-builder-head';
    const help = document.createElement('p');
    help.className = 'h-rule-builder-help h-muted';
    help.textContent = $HR('Expand the result by following pointers or relationships. Add a step to continue from the records found by the previous step.');
    head.append(help);
    if (this.dbdefs.hasRectypeCounts?.()) {
      head.append(hideUnusedToggle(this._prefs.hideUnused, (on) => {
        this._prefs.hideUnused = on;
        for (const row of this._rows) row.refresh();
      }));
    }

    this._list = document.createElement('div');
    this._list.className = 'h-rule-builder-list';
    this._add = button(`+ ${$HR('Add rule')}`, $HR('Add expansion rule'), () => this._addRoot());
    this._add.classList.add('h-rule-add');
    this.container.append(head, this._list, this._add, this._renderPreview());
    // any edit (selects, pickers, filter text, added/removed rows) refreshes the preview
    for (const type of ['change', 'input', 'h-input-change', 'click']) {
      this.container.addEventListener(type, () => this._schedulePreview());
    }
    this.state = 'rendered';
    this._syncRows();
    return this;
  }

  async destroy() {
    for (const row of this._rows) row.destroy();
    this._rows = [];
    return super.destroy();
  }

  /** `[ ] Preview` and the read-only rule queries below it. */
  _renderPreview() {
    const wrap = document.createElement('div');
    wrap.className = 'h-rule-preview';
    const label = document.createElement('label');
    label.className = 'h-rule-preview-toggle';
    this._previewToggle = document.createElement('input');
    this._previewToggle.type = 'checkbox';
    const caption = document.createElement('span');
    caption.textContent = $HR('Preview');
    label.append(this._previewToggle, caption);
    this._previewText = document.createElement('textarea');
    this._previewText.className = 'h-input h-rule-preview-text';
    this._previewText.readOnly = true;
    this._previewText.hidden = true;
    this._previewText.setAttribute('aria-label', $HR('Rule queries'));
    this._previewToggle.addEventListener('change', () => {
      this._previewText.hidden = !this._previewToggle.checked;
      this._updatePreview();
    });
    wrap.append(label, this._previewText);
    return wrap;
  }

  _schedulePreview() {
    if (!this._previewToggle?.checked || this._previewPending) return;
    this._previewPending = true;
    // after the row handlers that react to the same event
    setTimeout(() => { this._previewPending = false; this._updatePreview(); }, 0);
  }

  _updatePreview() {
    if (!this._previewToggle?.checked || !this._list) return;
    this._previewText.value = rulesPreview(this._rows.map((row) => row.getRule()).filter(Boolean));
  }

  /** Rebuild rows from `rules`. With no rules the list stays empty until "Add rule". */
  _syncRows() {
    if (!this._list) return;
    for (const row of this._rows) row.destroy();
    this._rows = [];
    this._list.replaceChildren();
    for (const rule of this.rules) this._addRoot(rule);
  }

  _addRoot(rule = null) {
    if (!this._list) return;
    const row = new RuleRow({
      dbdefs: this.dbdefs,
      lang: this.lang,
      level: 1,
      rule,
      recordTypes: this.recordTypes,
      prefs: this._prefs,
      onRemove: (item) => {
        item.destroy();
        this._rows = this._rows.filter((x) => x !== item);
        item.element.remove();
      }
    });
    this._rows.push(row);
    this._list.append(row.element);
  }
}

class RuleRow {
  /**
   * @param {object} options
   * @param {number[]|null} [options.parentTypes] Previous step's target types: null for a rule,
   *        [] when the previous target is any record type.
   */
  constructor({ dbdefs, lang, level, rule = null, recordTypes = [], parentTypes = null, prefs = {}, onRemove }) {
    this.dbdefs = dbdefs;
    this.prefs = prefs;
    this.lang = lang;
    this.level = level;
    this.recordTypes = recordTypes;
    this.parentTypes = parentTypes;
    this.onRemove = onRemove;
    this.children = [];
    this._initial = rule ? decodeRule(rule) : null;
    this._relationWidget = null;
    this._relationValue = this._initial?.relation || 0;
    this._sourceValue = this._initialSources();
    this._targetValue = this._initial?.targets || [];
    this._sourceWidget = null;
    this._targetWidget = null;

    this.element = document.createElement('div');
    this.element.className = 'h-rule-row-wrap';
    this.element.style.setProperty('--h-rule-depth', String(this.level - 1));
    this._render();
  }

  destroy() {
    for (const child of this.children) child.destroy();
    this.children = [];
    for (const widget of [this._relationWidget, this._sourceWidget, this._targetWidget]) void widget?.destroy?.();
    this._relationWidget = this._sourceWidget = this._targetWidget = null;
  }

  /** Rebuild the selectors after the "hide record types without records" preference changed. */
  refresh() {
    const field = this.field.value;
    this._sourceValue = this._sources();
    this._targetValue = this._targets();
    this._relationValue = this._relation();
    this._renderSource();
    this._sourceChanged();
    if (this._fields.has(field)) this.field.value = field;
    this._fieldChanged();
    this._syncParentLock();
    for (const child of this.children) child.refresh();
  }

  /** A loaded rule's source types, a step's single parent type, or the data source's type for a new rule. */
  _initialSources() {
    if (this.parentTypes?.length === 1) return [this.parentTypes[0]];
    if (this._initial) return this._initial.sources;
    return this.parentTypes === null && this.recordTypes.length ? [this.recordTypes[0]] : [];
  }

  /** Whether a record type is offered: used, or already chosen (current or loaded rule value). */
  _offered(id, keep) {
    return !this.prefs.hideUnused || keep.has(Number(id)) || this.dbdefs.isRectypeUsed?.(id) !== false;
  }

  /** Selected source types; [] = any record type. */
  _sources() { return this._sourceWidget ? typeIds(this._sourceWidget.getValue()) : this._sourceValue; }

  /** Selected target types; [] = any record type. */
  _targets() { return this._targetWidget ? typeIds(this._targetWidget.getValue()) : this._targetValue; }

  _relation() {
    return this._relationWidget ? (Number(this._relationWidget.getValue()) || 0) : 0;
  }

  getRule() {
    const selected = this._fields.get(this.field.value) || null;
    const query = encodeRuleQuery({
      source: this._sources(), selected, target: this._targets(), relation: this._relation(), filter: this.filter.value
    });
    const rule = { query, levels: this.children.map((child) => child.getRule()).filter(Boolean) };
    return Object.assign(rule, describeExpansionRule(rule, this.dbdefs));
  }

  _render() {
    const card = document.createElement('div');
    card.className = 'h-rule-row';

    const step = document.createElement('span');
    step.className = 'h-rule-step';
    step.textContent = this.level === 1 ? $HR('Rule') : `${$HR('Step')} ${this.level - 1}`;

    this.source = pickerHost('h-rule-source', $HR('Starting record type'));
    this.field = select('h-rule-field', $HR('Pointer or relationship'));
    this.relation = pickerHost('h-rule-relation', $HR('Relationship type'));
    this.target = pickerHost('h-rule-target', $HR('Target record type'));
    this.filter = document.createElement('input');
    this.filter.type = 'text';
    this.filter.className = 'h-input h-rule-filter';
    this.filter.placeholder = $HR('Additional filter');
    this.filter.title = $HR('Additional Heurist query filter');

    const filterEdit = iconButton('fa-pen', $HR('Edit additional filter'), () => void this._editFilter());
    const remove = iconButton('fa-xmark', $HR('Delete this rule step'), () => this.onRemove?.(this));
    card.append(step, this.source, this.field, this.relation, this.target, this.filter, filterEdit, remove);

    this.childHost = document.createElement('div');
    this.childHost.className = 'h-rule-children';
    this.addStep = button(`+ ${$HR('Add step')}`, $HR('Add another step to this rule'), () => this._addChild());
    this.addStep.classList.add('h-btn-small', 'h-rule-add-step');
    this.addStep.hidden = this.level >= MAX_RULE_DEPTH;

    this.element.append(card, this.addStep, this.childHost);
    this.field.addEventListener('change', () => { this._relationValue = 0; this._fieldChanged(); });

    this._renderSource();
    this._sourceChanged();
    if (this._initial) this._restore(this._initial);
  }

  /**
   * Source picker. A rule: every record type, the data source's types first. A step:
   * locked to the previous step's single target, limited to its several targets, or
   * every type when the previous target is any record type.
   */
  _renderSource() {
    const keep = new Set(this._sourceValue);
    const locked = this.parentTypes?.length === 1;
    const ids = this.parentTypes?.length > 1 ? this.parentTypes : null;
    this._sourceWidget = this._picker(this.source, this._sourceWidget, {
      source: new RectypeSource(this.dbdefs, {
        ids, priority: this.parentTypes === null ? this.recordTypes : [],
        filter: ids || locked ? null : (id) => this._offered(id, keep)
      }),
      value: this._sourceValue,
      emptyLabel: $HR(ids ? 'Any of the previous types' : 'Any record type'),
      onChange: () => this._sourceChanged()
    });
    this._sourceWidget.setReadOnly?.(locked);
  }

  _sourceChanged() {
    const sources = this._sources();
    const current = this.field.value;
    const keep = new Set([current, this._initial?.fieldKey || '']);
    const keepTypes = new Set(this._targets());
    // a reverse pointer is hidden when the record type holding it has no records
    const offeredFields = (source) => [...collectLinkFields(this.dbdefs, source)]
      .filter(([key, item]) => !item.reverse || keep.has(key) || this._offered(item.targets[0], keepTypes));
    const single = sources.length === 1 ? offeredFields(sources[0]) : [];
    // several sources: only the generic traversals; their targets come from every source's fields
    this._targetFields = new Map(sources.length > 1 ? sources.flatMap(offeredFields) : single);
    const groups = fieldOptionGroups(new Map(single), { anySource: sources.length !== 1, keep: this._initial?.fieldKey || '' });
    this._fields = new Map(groups.flatMap((group) => group.options.map((option) => [option.value, option.item])));
    fillGroups(this.field, groups);
    this.field.value = this._fields.has(current) ? current : (groups[0]?.options[0]?.value ?? '');
    this._fieldChanged();
  }

  _fieldChanged() {
    const item = this._fields.get(this.field.value) || null;
    this._renderRelation(item);

    const current = this._targets();
    const keep = new Set(current);
    const allTypes = () => this.dbdefs.rectypes().map((rt) => Number(rt.id));
    const fields = this._targetFields?.size ? this._targetFields : this._fields;
    const targets = linkTargets(item, fields, allTypes).filter((id) => this._offered(id, keep));
    // a field with a single target type fixes it; a generic traversal keeps "any"
    this._singleTarget = Boolean(item && !item.generic) && targets.length === 1;
    this._targetValue = this._singleTarget ? [targets[0]] : current.filter((id) => targets.includes(id));
    this._targetWidget = this._picker(this.target, this._targetWidget, {
      source: new RectypeSource(this.dbdefs, { ids: targets }),
      value: this._targetValue,
      emptyLabel: $HR('Any record type')
    });
    this._targetWidget.setReadOnly?.(this._singleTarget || this.children.length > 0);
  }

  /** Relationship-type picker for a relation-marker field; hidden otherwise. */
  _renderRelation(item) {
    const vocabulary = item?.isRelation ? Number(item.vocabulary) || 0 : 0;
    this.relation.hidden = !vocabulary;
    if (!vocabulary) {
      void this._relationWidget?.destroy?.();
      this._relationWidget = null;
      this.relation.replaceChildren();
      return;
    }
    this._relationWidget = this._picker(this.relation, this._relationWidget, {
      source: new TermSource(this.dbdefs, vocabulary),
      value: this._relationValue || null,
      multiple: false,
      emptyLabel: $HR('Any relationship type')
    });
  }

  /**
   * Replace a picker. Each picker gets its own host: a replaced picker's async
   * destroy() clears its container later and must not wipe the new one.
   */
  _picker(container, previous, { source, value, multiple = true, emptyLabel, onChange = null }) {
    void previous?.destroy?.();
    container.replaceChildren();
    const host = document.createElement('div');
    container.append(host);
    const widget = createHInput('enum', host, { suppressLabel: true, source, value, multiple, emptyLabel });
    if (onChange) host.addEventListener('h-input-change', onChange);
    return widget;
  }

  _restore(data) {
    if (this._fields.has(data.fieldKey)) this.field.value = data.fieldKey;
    this._targetValue = data.targets;
    this._fieldChanged();
    this.filter.value = data.filter || '';
    for (const rule of data.levels || []) this._addChild(rule);
    this._syncParentLock();
  }

  _addChild(rule = null) {
    if (this.level >= MAX_RULE_DEPTH) return;
    const child = new RuleRow({
      dbdefs: this.dbdefs,
      lang: this.lang,
      level: this.level + 1,
      rule,
      parentTypes: this._targets(),
      prefs: this.prefs,
      onRemove: (item) => {
        item.destroy();
        this.children = this.children.filter((x) => x !== item);
        item.element.remove();
        this._syncParentLock();
      }
    });
    this.children.push(child);
    this.childHost.append(child.element);
    this._syncParentLock();
  }

  /** A step's source depends on this row's target: lock the row while it has steps. */
  _syncParentLock() {
    const locked = this.children.length > 0;
    this._sourceWidget?.setReadOnly?.(locked || this.parentTypes?.length === 1);
    this.field.disabled = locked;
    this._relationWidget?.setReadOnly?.(locked);
    this._targetWidget?.setReadOnly?.(locked || this._singleTarget);
  }

  async _editFilter() {
    const targets = this._targets();
    if (targets.length !== 1) {
      HMsg.showMsgFlash?.($HR('Select one target record type first'));
      return;
    }
    const target = targets[0];
    const builder = new HFilterBuilder({
      dbdefs: this.dbdefs, vocabulary: queryVocabulary, lang: this.lang, hideUnusedRectypes: this.prefs.hideUnused
    });
    const host = document.createElement('div');
    host.className = 'h-rule-filter-builder';
    builder.attach(host).render();
    builder.setRecordType(target, { locked: true, allowParameters: false });
    builder.setQuery(filterToBuilderQuery(this.filter.value, target));
    const id = `h-rule-filter-${Date.now()}`;
    let dlg = null;
    const close = async (apply) => {
      if (apply) this.filter.value = builderQueryToFilter(builder.getQuery(), target);
      HMsg.closeMsgDlg(id);
      dlg?.classList.remove('h-rule-filter-dialog-shell');
      await builder.destroy();
    };
    dlg = HMsg.showMsgDlg(host, {
      dialogId: id,
      title: $HR('Additional filter'),
      preventClose: true,
      buttons: [
        { label: $HR('Apply'), class: 'h-btn h-btn-primary', onClick: () => void close(true) },
        { label: $HR('Cancel'), class: 'h-btn', onClick: () => void close(false) }
      ]
    });
    dlg?.classList.add('h-rule-filter-dialog-shell');
  }
}

/** Rule queries for the preview: the executable part only (no name/description). */
export function rulesPreview(rules) {
  const strip = (rule) => ({
    query: rule.query,
    ...(rule.ignore ? { ignore: true } : {}),
    levels: (rule.levels || []).map(strip)
  });
  return JSON.stringify((rules || []).map(strip), null, 2);
}

/**
 * Decode the stable persisted rule format into editor values. `sources`/`targets`
 * are record-type lists ([] = any record type); `source`/`target` their first entry or 0.
 */
export function decodeRule(rule) {
  const query = rule?.query && typeof rule.query === 'object' && !Array.isArray(rule.query) ? rule.query : {};
  const linkKey = Object.keys(query).find((key) => LINK_NAMES.includes(key.split(':')[0])) || '';
  const [kind = 'links', fieldPart = ''] = linkKey.split(':');
  const linkData = Array.isArray(query[linkKey]) ? query[linkKey] : [];
  const sources = typeIds(linkData.find((item) => item && item.t != null)?.t);
  const relation = Number(linkData.find((item) => item && item.r != null)?.r) || 0;
  const targets = typeIds(query.t);
  const [source = 0] = sources;
  const [target = 0] = targets;
  const fieldId = Number(fieldPart) || 0;
  const reverse = kind === 'lt' || kind === 'rt';
  const fieldKey = fieldId ? `${fieldId}${reverse ? `r${target || ''}` : ''}` : genericKey(kind);
  const extras = Object.entries(query).filter(([key]) => key !== 't' && key !== linkKey);
  let filter = '';
  if (extras.length === 1 && extras[0][0] === 'plain') filter = String(extras[0][1] ?? '');
  else if (extras.length) filter = JSON.stringify(extras.map(([key, value]) => ({ [key]: value })));
  return {
    source, target, sources, targets, relation, kind, fieldId, fieldKey, filter,
    levels: Array.isArray(rule?.levels) ? rule.levels : []
  };
}

/**
 * Encode one editor row using the query form produced by the legacy ruleBuilder.
 * `selected` is a field item, a generic `{ generic: kind }`, or null (`kindOverride` or links).
 * `source`/`target` are a record-type ID or list; none (0, []) is any record type:
 * no `t`, and an empty parent query - the parent result.
 */
export function encodeRuleQuery({ source, selected, target = 0, relation = 0, filter = '', kindOverride = null }) {
  let kind = selected?.generic || (kindOverride === 'related' ? 'related' : 'links');
  if (selected && !selected.generic) {
    if (selected.isRelation) kind = selected.reverse ? 'rt' : 'rf';
    else kind = selected.reverse ? 'lt' : 'lf';
  }
  const key = selected?.id ? `${kind}:${selected.id}` : kind;
  const types = (value) => { const ids = typeIds(value); return ids.length > 1 ? ids : ids[0]; };
  const targets = types(target);
  const sources = types(source);
  const query = targets ? { t: targets } : {};
  query[key] = sources ? [{ t: sources }] : [];
  if (selected?.isRelation && relation > 0) query[key].push({ r: relation });
  mergeFilter(query, filter);
  return query;
}

/** Generate the same reusable name/description labels as the legacy UI helper. */
export function describeExpansionRule(rule, dbdefs) {
  const predicates = (value) => Array.isArray(value) ? Object.assign({}, ...value) : (value || {});
  const typeName = (value) => {
    const ids = typeIds(value);
    return ids.length
      ? ids.map((id) => dbdefs.rectypeName(id) || `${$HR('Record type')} ${id}`).join(', ')
      : $HR('Records');
  };
  const step = (value) => {
    const q = predicates(value?.query);
    const key = Object.keys(q).find((item) => /^(lf|lt|rf|rt|links|related|connected)(:|$)/.test(item)) || 'links';
    const parent = predicates(q[key]);
    const arrow = /^(lf|rf)(:|$)/.test(key) ? ' → ' : /^(lt|rt)(:|$)/.test(key) ? ' ← ' : ' ↔ ';
    const fieldId = Number(key.split(':')[1]) || 0;
    const generic = GENERIC_KINDS.find((item) => item.kind === key.split(':')[0]);
    const field = fieldId ? (dbdefs.fieldGlobal(fieldId)?.name || `${$HR('Field')} ${fieldId}`) : $HR(generic?.label || 'Links');
    return { source: typeName(parent.t), target: typeName(q.t), arrow, field };
  };
  const continuation = (value) => {
    const current = step(value);
    const children = Array.isArray(value?.levels) ? value.levels : [];
    let tail = '';
    if (children.length === 1) tail = continuation(children[0]);
    else if (children.length > 1) {
      const parts = children.map(continuation);
      const arrows = children.map((child) => step(child).arrow);
      tail = arrows.every((arrow) => arrow === arrows[0])
        ? `${arrows[0]}(${parts.map((part) => part.slice(arrows[0].length)).join(', ')})`
        : ` (${parts.map((part) => part.trim()).join(', ')})`;
    }
    return current.arrow + current.target + tail;
  };
  const paths = (value, prefix) => {
    const current = step(value);
    const text = prefix + current.arrow + current.field + current.arrow + current.target;
    const children = Array.isArray(value?.levels) ? value.levels : [];
    return children.length ? children.flatMap((child) => paths(child, text)) : [text];
  };
  const first = step(rule);
  return { name: first.source + continuation(rule), description: paths(rule, first.source).join('\n') };
}

/**
 * Pointer/relationship select groups: the generic traversals first, then this
 * type's pointer and relationship fields, then fields referencing it.
 *
 * @param {Map<string, object>} fields `collectLinkFields` result.
 * @param {object} [options]
 * @param {boolean} [options.anySource] Source is any record type: only the generic group.
 * @param {string} [options.keep] Key of a loaded rule's traversal, kept even when not otherwise offered.
 * @returns {Array<{label: string, options: Array<{value: string, label: string, item: object}>}>} Groups.
 */
export function fieldOptionGroups(fields, { anySource = false, keep = '' } = {}) {
  const items = [...fields.values()];
  const has = (test) => anySource || items.some(test);
  const available = {
    pointers: has((x) => !x.isRelation), relations: has((x) => x.isRelation),
    forward: has((x) => !x.isRelation && !x.reverse), backward: has((x) => !x.isRelation && x.reverse)
  };
  const generic = GENERIC_KINDS.filter((spec) => {
    if (genericKey(spec.kind) === keep) return true;
    if (spec.legacyOnly) return false;
    if (spec.pointers && !available.pointers) return false;
    if (spec.relations && !available.relations) return false;
    if (spec.reverse === false && spec.pointers) return available.forward;
    if (spec.reverse === true && spec.pointers) return available.backward;
    return true;
  }).map((spec) => ({ value: genericKey(spec.kind), label: $HR(spec.label), item: { generic: spec.kind } }));

  const groups = [{ label: $HR('Any'), options: generic }];
  if (anySource) return groups.filter((group) => group.options.length);
  const option = (item) => ({ value: item.key, label: item.label, item });
  const forward = items.filter((x) => !x.reverse);
  const reverse = items.filter((x) => x.reverse);
  if (forward.length) {
    const pointers = forward.some((x) => !x.isRelation);
    const relations = forward.some((x) => x.isRelation);
    const label = pointers && relations ? 'Pointers > and Relationships >>' : (pointers ? 'Pointers >' : 'Relationships >>');
    groups.push({ label: $HR(label), options: forward.map(option) });
  }
  if (reverse.length) groups.push({ label: $HR('Referenced by'), options: reverse.map(option) });
  return groups.filter((group) => group.options.length);
}

/**
 * Target types for a traversal: a field's target types, or for a generic kind the
 * targets of the matching fields. All types when the source is any record type
 * or a matching pointer is unconstrained.
 */
export function linkTargets(item, fields, allTypes) {
  if (item && !item.generic) return item.targets.length ? item.targets : allTypes();
  const kind = item?.generic || 'links';
  const matches = [...fields.values()].filter((x) => !x.generic && matchesKind(x, kind));
  if (!matches.length || matches.some((x) => !x.targets.length)) return allTypes();
  const ids = new Set();
  for (const x of matches) for (const id of x.targets) if (Number(id) > 0) ids.add(Number(id));
  return [...ids];
}

function matchesKind(item, kind) {
  switch (kind) {
    case 'connected': return true;
    case 'links': return !item.isRelation;
    case 'lf': return !item.isRelation && !item.reverse;
    case 'lt': return !item.isRelation && item.reverse;
    case 'related': return item.isRelation;
    case 'rf': return item.isRelation && !item.reverse;
    case 'rt': return item.isRelation && item.reverse;
    default: return false;
  }
}

function collectLinkFields(dbdefs, source) {
  const map = new Map();
  if (!(source > 0)) return map;
  for (const field of dbdefs.fields(source)) {
    if (!['resource', 'relmarker'].includes(field.type)) continue;
    const global = dbdefs.fieldGlobal(field.id) || field;
    const targets = Array.isArray(global.targetTypes) ? global.targetTypes.map(Number).filter(Boolean) : [];
    const isRelation = field.type === 'relmarker';
    map.set(String(field.id), {
      key: String(field.id), id: Number(field.id), reverse: false, isRelation,
      vocabulary: Number(global.vocabulary) || 0, targets,
      label: `${isRelation ? '>>' : '>'} ${field.name}`
    });
  }
  for (const rt of dbdefs.rectypes()) {
    if (Number(rt.id) === source) continue;
    for (const field of dbdefs.fields(rt.id)) {
      if (!['resource', 'relmarker'].includes(field.type)) continue;
      const global = dbdefs.fieldGlobal(field.id) || field;
      const targets = Array.isArray(global.targetTypes) ? global.targetTypes.map(Number) : [];
      if (!targets.includes(source)) continue;
      const isRelation = field.type === 'relmarker';
      const key = `${field.id}r${rt.id}`;
      map.set(key, {
        key, id: Number(field.id), reverse: true, isRelation,
        vocabulary: Number(global.vocabulary) || 0, targets: [Number(rt.id)],
        label: `${isRelation ? '<<' : '<'} ${field.name} [${$HR('in')} ${rt.name}]`
      });
    }
  }
  return map;
}

function mergeFilter(query, text) {
  const value = String(text || '').trim();
  if (!value) return;
  try {
    let parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) parsed = [parsed];
    let merged = false;
    for (const token of parsed) {
      if (!token || typeof token !== 'object' || Array.isArray(token)) continue;
      for (const [key, item] of Object.entries(token)) { query[key] = item; merged = true; }
    }
    if (merged) return;
  } catch { /* plain legacy query fragment */ }
  query.plain = value;
}

/** Replace a select's options with groups; a group without a label is added ungrouped. */
function fillGroups(selectEl, groups) {
  selectEl.replaceChildren();
  for (const group of groups) {
    let parent = selectEl;
    if (group.label) {
      parent = document.createElement('optgroup');
      parent.label = group.label;
      selectEl.append(parent);
    }
    for (const option of group.options) addOption(parent, option.value, option.label);
  }
}

export function filterToBuilderQuery(filter, target) {
  const text = String(filter || '').trim();
  if (!text) return [{ t: String(target) }];
  try {
    let parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) parsed = [parsed];
    return [{ t: String(target) }, ...parsed];
  } catch {
    return `t:${target} ${text}`;
  }
}

export function builderQueryToFilter(query, target) {
  const rows = Array.isArray(query) ? query.filter((row) => !isRecordTypePredicate(row, target)) : [];
  if (!rows.length) return '';
  return JSON.stringify(rows);
}

function isRecordTypePredicate(row, target) {
  return Boolean(row && typeof row === 'object' && !Array.isArray(row)
    && Object.keys(row).length === 1
    && Object.prototype.hasOwnProperty.call(row, 't')
    && String(row.t) === String(target));
}

function inferRecordTypeId(query) {
  if (Array.isArray(query)) {
    const hit = query.find((item) => item && typeof item === 'object' && item.t != null);
    return Number(hit?.t) || 0;
  }
  if (query && typeof query === 'object') return Number(query.t) || 0;
  const match = /(?:^|\s)t:(\d+)/.exec(String(query || ''));
  return Number(match?.[1]) || 0;
}

function pickerHost(className, title) {
  const el = document.createElement('div'); el.className = className; el.title = title; return el;
}
function select(className, title) {
  const el = document.createElement('select'); el.className = `h-select ${className}`; el.title = title; return el;
}
function addOption(selectEl, value, label) {
  const option = document.createElement('option'); option.value = String(value ?? ''); option.textContent = label; selectEl.append(option);
}
function button(text, title, onClick) {
  const el = document.createElement('button'); el.type = 'button'; el.className = 'h-btn'; el.textContent = text; el.title = title; el.addEventListener('click', onClick); return el;
}
function iconButton(icon, title, onClick) {
  const el = button('', title, onClick); el.classList.add('h-btn-small', 'h-rule-icon'); el.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`; return el;
}
function clone(value) { return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
