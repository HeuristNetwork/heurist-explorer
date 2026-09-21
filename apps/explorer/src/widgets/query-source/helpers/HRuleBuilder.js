/**
 * @file HRuleBuilder.js
 * @brief Native Explorer expansion-rule editor and dialog facade.
 *
 * Reimplements the legacy hclient/widgets/search/ruleBuilder dialog without
 * jQuery, iframe or host callbacks. Persisted rule objects remain unchanged:
 *   { query: Object, levels: Array<Object> }
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR, HMsg } from '#shared/ui';
import { HFilterBuilder } from '../../filter-builder/HFilterBuilder.js';
import queryVocabulary from '../../../utils/queryVocabulary.json' with { type: 'json' };
import './QuerySourceHelpers.css';

const MAX_LEVEL = 3;
const LINK_NAMES = ['links', 'lt', 'lf', 'rt', 'rf', 'related'];

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

  /** Restrict the starting type(s) of first-level rules. */
  setRecordTypes(recordTypes) {
    const values = Array.isArray(recordTypes) ? recordTypes : [recordTypes];
    this.recordTypes = values.map(Number).filter((id) => id > 0);
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

    const help = document.createElement('p');
    help.className = 'h-rule-builder-help h-muted';
    help.textContent = $HR('Expand the result by following pointers or relationships. Add a step to continue from the records found by the previous step.');

    this._list = document.createElement('div');
    this._list.className = 'h-rule-builder-list';
    this._add = button(`+ ${$HR('Add rule')}`, $HR('Add expansion rule'), () => this._addRoot());
    this.container.append(help, this._list, this._add);
    this.state = 'rendered';
    this._syncRows();
    return this;
  }

  async destroy() {
    for (const row of this._rows) row.destroy();
    this._rows = [];
    return super.destroy();
  }

  _syncRows() {
    if (!this._list) return;
    for (const row of this._rows) row.destroy();
    this._rows = [];
    this._list.replaceChildren();
    for (const rule of this.rules) this._addRoot(rule);
    if (!this._rows.length) this._addRoot();
  }

  _addRoot(rule = null) {
    if (!this._list) return;
    const row = new RuleRow({
      dbdefs: this.dbdefs,
      lang: this.lang,
      level: 1,
      rule,
      recordTypes: this.recordTypes,
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
  constructor({ dbdefs, lang, level, rule = null, recordTypes = [], sourceType = null, onRemove }) {
    this.dbdefs = dbdefs;
    this.lang = lang;
    this.level = level;
    this.recordTypes = recordTypes;
    this.fixedSourceType = Number(sourceType) || null;
    this.onRemove = onRemove;
    this.children = [];
    this._initial = rule ? decodeRule(rule) : null;
    this._genericKind = this._initial?.kind === 'related' ? 'related' : null;

    this.element = document.createElement('div');
    this.element.className = 'h-rule-row-wrap';
    this._render();
  }

  destroy() {
    for (const child of this.children) child.destroy();
    this.children = [];
  }

  getRule() {
    const source = Number(this.source.value) || 0;
    if (!source) return null;
    const selected = this._fields.get(this.field.value) || null;
    const target = Number(this.target.value) || 0;
    const relation = Number(this.relation.value) || 0;
    const query = encodeRuleQuery({ source, selected, target, relation, filter: this.filter.value, kindOverride: !selected ? this._genericKind : null });
    const rule = { query, levels: this.children.map((child) => child.getRule()).filter(Boolean) };
    return Object.assign(rule, describeExpansionRule(rule, this.dbdefs));
  }

  _render() {
    const card = document.createElement('div');
    card.className = 'h-rule-row';
    card.style.setProperty('--h-rule-depth', String(this.level - 1));

    const step = document.createElement('span');
    step.className = 'h-rule-step';
    step.textContent = this.level === 1 ? $HR('Rule') : `${$HR('Step')} ${this.level - 1}`;

    this.source = select('h-rule-source', $HR('Starting record type'));
    this.field = select('h-rule-field', $HR('Pointer or relationship'));
    this.relation = select('h-rule-relation', $HR('Relationship type'));
    this.target = select('h-rule-target', $HR('Target record type'));
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
    if (this.level >= MAX_LEVEL) this.addStep.hidden = true;

    this.element.append(card, this.addStep, this.childHost);
    this.source.addEventListener('change', () => this._sourceChanged());
    this.field.addEventListener('change', () => { this._genericKind = null; this._fieldChanged(); });
    this.target.addEventListener('change', () => this._syncAddStep());

    this._fillSources();
    if (this._initial) this._restore(this._initial);
    else this._sourceChanged();
  }

  _fillSources() {
    this.source.replaceChildren();
    const allowed = this.fixedSourceType ? [this.fixedSourceType]
      : (this.recordTypes.length ? this.recordTypes : this.dbdefs.rectypes().map((rt) => rt.id));
    if (!this.fixedSourceType && allowed.length !== 1) addOption(this.source, '', $HR('select…'));
    for (const id of allowed) addOption(this.source, id, this.dbdefs.rectypeName(id) || String(id));
    if (this.fixedSourceType) {
      this.source.value = String(this.fixedSourceType);
      this.source.disabled = true;
    }
  }

  _sourceChanged() {
    const source = Number(this.source.value) || 0;
    this._fields = collectLinkFields(this.dbdefs, source);
    const current = this.field.value;
    this.field.replaceChildren();
    const values = [...this._fields.values()];
    const hasPointer = values.some((x) => !x.isRelation);
    const hasRelation = values.some((x) => x.isRelation);
    addOption(this.field, '', hasPointer && hasRelation ? $HR('Any pointer or relationship') : hasRelation ? $HR('Any relationship') : $HR('Any pointer'));
    for (const item of values.filter((x) => !x.reverse)) addOption(this.field, item.key, item.label);
    for (const item of values.filter((x) => x.reverse)) addOption(this.field, item.key, item.label);
    this.field.value = this._fields.has(current) ? current : '';
    this._fieldChanged();
  }

  _fieldChanged() {
    const item = this._fields.get(this.field.value) || null;
    this.relation.replaceChildren();
    this.relation.hidden = !item?.isRelation;
    this.relation.disabled = !item?.isRelation;
    if (item?.isRelation) {
      addOption(this.relation, '', $HR('Any relationship type'));
      const root = Number(item.vocabulary) || 0;
      const terms = root ? this.dbdefs.termTree(root, { flat: true }) : [];
      for (const term of terms) {
        if (Number(term.id) === root) continue;
        addOption(this.relation, term.id, term.label || String(term.id));
      }
    } else {
      addOption(this.relation, '', '');
    }

    this.target.replaceChildren();
    const targets = item ? item.targets : collectAnyTargets(this._fields);
    if (targets.length !== 1) addOption(this.target, '', $HR('Any record type'));
    for (const id of targets) addOption(this.target, id, this.dbdefs.rectypeName(id) || String(id));
    if (targets.length === 1) this.target.value = String(targets[0]);
    this.target.disabled = targets.length <= 1;
    this._syncAddStep();
  }

  _restore(data) {
    this.source.value = data.source ? String(data.source) : this.source.value;
    this._sourceChanged();
    if (data.fieldKey && this._fields.has(data.fieldKey)) this.field.value = data.fieldKey;
    else this.field.value = '';
    this._fieldChanged();
    if (data.relation) this.relation.value = String(data.relation);
    if (data.target) this.target.value = String(data.target);
    this.filter.value = data.filter || '';
    for (const rule of data.levels || []) this._addChild(rule);
    this._syncParentLock();
    this._syncAddStep();
  }

  _addChild(rule = null) {
    if (this.level >= MAX_LEVEL) return;
    const target = Number(this.target.value) || 0;
    if (!target) return;
    const child = new RuleRow({
      dbdefs: this.dbdefs,
      lang: this.lang,
      level: this.level + 1,
      rule,
      sourceType: target,
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

  _syncParentLock() {
    const locked = this.children.length > 0;
    this.source.disabled = locked || Boolean(this.fixedSourceType);
    this.field.disabled = locked;
    this.relation.disabled = locked || this.relation.hidden;
    this.target.disabled = locked || this.target.options.length <= 1;
  }

  _syncAddStep() {
    if (!this.addStep) return;
    this.addStep.disabled = !(Number(this.target.value) > 0);
  }

  async _editFilter() {
    const target = Number(this.target.value) || 0;
    if (!target) {
      HMsg.showMsgFlash?.($HR('Select a target record type first'));
      return;
    }
    const builder = new HFilterBuilder({ dbdefs: this.dbdefs, vocabulary: queryVocabulary, lang: this.lang });
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

/** Decode the stable persisted rule format into editor values. */
export function decodeRule(rule) {
  const query = rule?.query && typeof rule.query === 'object' && !Array.isArray(rule.query) ? rule.query : {};
  const linkKey = Object.keys(query).find((key) => LINK_NAMES.includes(key.split(':')[0])) || '';
  const [kind = 'links', fieldPart = ''] = linkKey.split(':');
  const linkData = Array.isArray(query[linkKey]) ? query[linkKey] : [];
  const source = Number(linkData.find((item) => item && item.t != null)?.t) || 0;
  const relation = Number(linkData.find((item) => item && item.r != null)?.r) || 0;
  const target = Number(query.t) || 0;
  const fieldId = Number(fieldPart) || 0;
  const reverse = kind === 'lt' || kind === 'rt';
  const fieldKey = fieldId ? `${fieldId}${reverse ? `r${target || ''}` : ''}` : '';
  const extras = Object.entries(query).filter(([key]) => key !== 't' && key !== linkKey);
  let filter = '';
  if (extras.length === 1 && extras[0][0] === 'plain') filter = String(extras[0][1] ?? '');
  else if (extras.length) filter = JSON.stringify(extras.map(([key, value]) => ({ [key]: value })));
  return { source, target, relation, kind, fieldId, fieldKey, filter, levels: Array.isArray(rule?.levels) ? rule.levels : [] };
}

/** Encode one editor row using the same query form produced by the legacy ruleBuilder. */
export function encodeRuleQuery({ source, selected, target = 0, relation = 0, filter = '', kindOverride = null }) {
  let kind = kindOverride === 'related' ? 'related' : 'links';
  if (selected) {
    if (selected.isRelation) kind = selected.reverse ? 'rt' : 'rf';
    else kind = selected.reverse ? 'lt' : 'lf';
  }
  const key = selected?.id ? `${kind}:${selected.id}` : kind;
  const query = target > 0 ? { t: target } : {};
  query[key] = [{ t: source }];
  if (selected?.isRelation && relation > 0) query[key].push({ r: relation });
  mergeFilter(query, filter);
  return query;
}

/** Generate the same reusable name/description labels as the legacy UI helper. */
export function describeExpansionRule(rule, dbdefs) {
  const predicates = (value) => Array.isArray(value) ? Object.assign({}, ...value) : (value || {});
  const typeName = (id) => id ? (dbdefs.rectypeName(id) || `${$HR('Record type')} ${id}`) : $HR('Records');
  const step = (value) => {
    const q = predicates(value?.query);
    const key = Object.keys(q).find((item) => /^(lf|lt|rf|rt|links|related)(:|$)/.test(item)) || 'links';
    const parent = predicates(q[key]);
    const arrow = /^(lf|rf)(:|$)/.test(key) ? ' → ' : /^(lt|rt)(:|$)/.test(key) ? ' ← ' : ' ↔ ';
    const fieldId = Number(key.split(':')[1]) || 0;
    const field = fieldId ? (dbdefs.fieldGlobal(fieldId)?.name || `${$HR('Field')} ${fieldId}`) : $HR('Links');
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

function collectAnyTargets(fields) {
  const ids = new Set();
  for (const item of fields.values()) for (const id of item.targets) if (Number(id) > 0) ids.add(Number(id));
  return [...ids].sort((a, b) => a - b);
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
