/**
 * Explorer Query Source authoring widget. Edits a draft DataSource only;
 * persistence/workspace operations are owned by DataSourceActions.
 */
import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR, HMsg } from '#shared/ui';
import { normalizeDataSource, cloneDataSource } from '../../core/DataSource.js';
import { HFilterInlineHelper } from '../filter-builder/HFilterInlineHelper.js';
import queryVocabulary from '../../utils/queryVocabulary.json';
import { queryDescribe } from '../../utils/queryDescribe.js';
import { HFieldSetEditor } from './helpers/HFieldSetEditor.js';
import { HGeoFieldSelector } from './helpers/HGeoFieldSelector.js';
import { HTimeFieldSelector } from './helpers/HTimeFieldSelector.js';
import { HRuleBuilder } from './helpers/HRuleBuilder.js';
import { inferRecordTypeId, fieldCodeLabel } from './helpers/fieldPathUtils.js';
import './QuerySourceEditor.css';

export class QuerySourceEditor extends HBaseWidget {
  constructor({ dbdefs, lang = 'eng', openFilterBuilder, editRules, describeRules, onExecute, onApply, onDirtyChange } = {}) {
    super();
    if (!dbdefs) throw new TypeError('QuerySourceEditor requires dbdefs');
    this.dbdefs = dbdefs;
    this.lang = lang;
    this.openFilterBuilder = openFilterBuilder;
    this.editRules = editRules;
    this.describeRules = describeRules;
    this.onExecute = onExecute;
    this.onApply = onApply;
    this.onDirtyChange = onDirtyChange;
    this.dataSource = null;
    this.draft = null;
    this._dirty = false;
    this._baseline = null;
    this._expanded = false;
    this.inlineHelper = null;
    this._syncingDraft = false;
  }

  attach(container, options = {}) { super.attach(container, options); return this; }

  render() {
    if (!this.container) throw new Error('QuerySourceEditor must be attached before render');
    this.container.className = 'h-qse';
    this.container.replaceChildren();

    const compact = div('h-qse-compact');
    const queryRow = div('h-qse-query-row');
    this._query = document.createElement('textarea');
    this._query.className = 'h-input h-qse-query';
    this._query.rows = 1;
    this._query.setAttribute('aria-label', $HR('Query'));
    this._query.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        void this.execute();
      }
    });
    this._query.addEventListener('input', () => {
      if (!this.draft) return;
      this.draft.request.q = this._query.value;
      this._markDirty();
      this._renderSummary();
    });
    this._structured = div('h-qse-structured');
    this._structured.hidden = true;

    const run = button('', $HR('Filter'), () => void this.execute(), 'h-btn h-btn-primary h-qse-run');
    run.innerHTML = '<i class="fa-solid fa-filter" aria-hidden="true"></i><span class="h-qse-run-caption">' + escapeHtml($HR('Filter')) + '</span>';
    const builder = button($HR('Builder'), $HR('Open the Filter Builder'), () => void this._openBuilder());
    this._more = button('', $HR('More Query Source options'), () => this.setExpanded(!this._expanded), 'h-btn h-btn-small h-qse-more');
    this._renderMoreButton();
    queryRow.append(this._query, this._structured, run, builder, this._more);

    this._sentence = div('h-qse-sentence h-muted');
    compact.append(queryRow, this._sentence);

    this._advanced = div('h-qse-advanced');
    this._advanced.hidden = true;
    this._advanced.append(
      this._configRow('Expansion rules', 'rules', 'fa-hexagon-nodes', () => void this.openRuleBuilder(), 'Rules used by Graph to expand the result through linked records.'),
      this._configRow('Geographic fields', 'geo', 'fa-map-location-dot', () => void this.openGeoFieldSelector(), 'Fields used by Map to obtain geometry, including linked geographic fields.'),
      this._configRow('Time fields', 'time', 'fa-clock', () => void this.openTimeFieldSelector(), 'Date and year fields used by Timeline.'),
      this._configRow('Column fields', 'fields', 'fa-table', () => void this.openFieldSetEditor(), 'Columns and formatting used by the Data table presentation.')
    );
    const clearRow = div('h-qse-clear-row');
    const clear = button($HR('Clear'), $HR('Clear Query Source title and presentation settings'), () => this.clearSettings(), 'h-btn h-btn-small h-qse-clear');
    clearRow.append(clear);
    this._advanced.append(clearRow);
    const testRow = div('h-qse-test-row');
    const titleLabel = document.createElement('span'); titleLabel.className = 'h-qse-title-label'; titleLabel.textContent = $HR('Title');
    this._title = document.createElement('input'); this._title.className = 'h-input h-qse-title'; this._title.type = 'text';
    this._title.addEventListener('input', () => { if (this.draft) { this.draft.title = this._title.value; this._markDirty(); } });
    const test = button($HR('Test'), $HR('Test Query Source settings'), () => void this.apply(), 'h-btn');
    testRow.append(titleLabel, this._title, test);
    this._advanced.append(testRow);

    this.container.append(compact, this._advanced);
    this.inlineHelper = new HFilterInlineHelper({
      vocabulary: queryVocabulary,
      lang: this.lang,
      dbdefs: this.dbdefs,
      onOpenBuilder: () => void this._openBuilder(),
      onChange: () => {
        if (this._syncingDraft) return;
        if (this.draft && typeof this.draft.request.q === 'string' && this.draft.request.q !== this._query.value) {
          this.draft.request.q = this._query.value;
          this._markDirty();
        }
      }
    });
    this.inlineHelper.attach(this._query, { showBuilderButton: false }).render();
    this.state = 'rendered';
    this._syncFromDraft();
    return this;
  }

  setDataSource(source) {
    this.setExpanded(false);
    this.dataSource = source ? normalizeDataSource(source) : null;
    this.draft = this.dataSource ? cloneDataSource(this.dataSource) : blankDraft();
    this._baseline = editableFingerprint(this.draft);
    this._setDirty(false);
    if (this.isRendered) this._syncFromDraft();
    return this;
  }

  getDraftDataSource() { return this.draft ? safeCloneDataSource(this.draft) : null; }
  getQuery() { return clone(this.draft?.request?.q); }
  setQuery(query) {
    if (!this.draft) return this;
    this.draft.request.q = clone(query);
    this._markDirty();
    if (this.isRendered) this._syncFromDraft();
    return this;
  }
  isDirty() { return this._dirty; }
  isExpanded() { return this._expanded; }
  setExpanded(value) {
    this._expanded = value === true;
    if (this._advanced) this._advanced.hidden = !this._expanded;
    this._renderMoreButton();
    return this;
  }
  _renderMoreButton() {
    if (!this._more) return;
    const label = this._expanded ? $HR('Less') : $HR('More');
    const icon = this._expanded ? 'fa-angle-up' : 'fa-angle-down';
    this._more.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span class="h-qse-more-caption">${escapeHtml(label)}</span>`;
    this._more.title = this._expanded ? $HR('Less Query Source options') : $HR('More Query Source options');
  }
  resetDraft() { this.setDataSource(this.dataSource); return this; }
  clearSettings() {
    if (!this.draft) return this;
    this.draft.title = '';
    this.draft.request ||= {};
    this.draft.request.rules = [];
    this.draft.request.rulesonly = 0;
    this.draft.presentation ||= {};
    this.draft.presentation.data = null;
    this.draft.presentation.map = null;
    this.draft.presentation.graph = null;
    this.draft.presentation.timeline = null;
    this._markDirty();
    this._syncFromDraft();
    return this;
  }
  markCommitted(source = null) {
    if (source) this.setDataSource(source);
    else {
      this.dataSource = this.draft ? cloneDataSource(this.draft) : null;
      this._baseline = editableFingerprint(this.draft);
      this._setDirty(false);
      this.setExpanded(false);
    }
    return this;
  }

  async execute() {
    const source = this.getDraftDataSource();
    if (!hasQuery(source?.request?.q) || typeof this.onExecute !== 'function') return null;
    return this.onExecute(source);
  }

  async apply() {
    const source = this.getDraftDataSource();
    if (!hasQuery(source?.request?.q) || typeof this.onApply !== 'function') return null;
    return this.onApply(source);
  }

  async _openBuilder() {
    if (!this.draft || typeof this.openFilterBuilder !== 'function') return;
    const query = await this.openFilterBuilder(clone(this.draft.request.q));
    if (query == null) return;
    this.draft.request.q = clone(query);
    this._markDirty();
    this._syncFromDraft();
  }

  async openRuleBuilder() {
    if (!this.draft) return;
    const editor = new HRuleBuilder({ editRules: this.editRules, describeRules: this.describeRules });
    editor.setRules(this.draft.request.rules || []);
    const rules = await editor.open({ dataSource: this.getDraftDataSource() });
    if (rules) { this.draft.request.rules = clone(rules); this._markDirty(); this._renderSummary(); }
  }

  async openFieldSetEditor() {
    return this._openFieldEditor('Column fields', new HFieldSetEditor({ dbdefs: this.dbdefs }),
      this.draft?.presentation?.data?.fields || [],
      (value) => { this._ensurePresentation('data').fields = value; });
  }

  async openGeoFieldSelector() {
    if (!this.draft) return;
    const editor = new HGeoFieldSelector({ dbdefs: this.dbdefs });
    editor.setRecordType(this._recordTypeId());
    editor.setMapProfile(this.draft.presentation?.map || {});
    const applied = await this._showEditorDialog('Geographic fields', editor, () => editor.getMapProfile());
    if (applied) { this.draft.presentation.map = applied; this._markDirty(); this._renderSummary(); }
  }

  async openTimeFieldSelector() {
    return this._openFieldEditor('Time fields', new HTimeFieldSelector({ dbdefs: this.dbdefs }),
      (this.draft?.presentation?.timeline?.fields || []).map((field) => typeof field === 'object' ? field : { field }),
      (value) => { this._ensurePresentation('timeline').fields = value.map((item) => item.field); });
  }

  async _openFieldEditor(title, editor, value, apply) {
    if (!this.draft) return;
    editor.setRecordType(this._recordTypeId()).setValue(value);
    const result = await this._showEditorDialog(title, editor, () => editor.getValue());
    if (result) { apply(result); this._markDirty(); this._renderSummary(); }
  }

  _showEditorDialog(title, editor, getResult) {
    const host = document.createElement('div');
    host.className = editor instanceof HFieldSetEditor ? 'h-qse-dialog-wide' : 'h-qse-dialog';
    editor.attach(host).render();
    return new Promise((resolve) => {
      let dlg = null;
      const finish = async (value) => { dlg?.classList.remove('h-qse-dialog-wide-shell'); HMsg.closeMsgDlg?.(); await editor.destroy(); resolve(value); };
      dlg = HMsg.showMsgDlg(host, {
        title: $HR(title), preventClose: true,
        buttons: [
          { label: $HR('Apply'), class: 'h-btn h-btn-primary', onClick: () => void finish(getResult()) },
          { label: $HR('Cancel'), class: 'h-btn', onClick: () => void finish(null) }
        ]
      });
      dlg?.classList.toggle('h-qse-dialog-wide-shell', editor instanceof HFieldSetEditor);
    });
  }

  _configRow(label, key, icon, onEdit, hint = '') {
    const row = div('h-qse-config-row');
    const edit = button('', hint ? $HR(hint) : `${$HR('Edit')} ${$HR(label)}`, onEdit);
    edit.classList.add('h-qse-config-edit');
    edit.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span class="h-qse-config-caption">${escapeHtml($HR(label))}…</span>`;
    edit.setAttribute('aria-label', $HR(label));
    const value = div('h-qse-config-value h-muted'); value.dataset.summary = key;
    row.append(edit, value); return row;
  }

  _syncFromDraft() {
    if (!this._query || !this.draft) return;
    const q = this.draft.request?.q;
    if (this._title) this._title.value = this.draft.title || '';
    const structured = q != null && typeof q === 'object';
    this._query.hidden = structured;
    this._structured.hidden = !structured;
    if (structured) this._structured.textContent = this._describe(q) || $HR('Structured query');
    else this._query.value = String(q ?? '');
    this._syncingDraft = true;
    try { this.inlineHelper?.refreshSentence?.(); }
    finally { this._syncingDraft = false; }
    this._renderSummary();
  }

  _renderSummary() {
    if (!this.draft) return;
    const q = this.draft.request?.q;
    if (this._sentence) this._sentence.textContent = typeof q === 'object' ? (this._describe(q) || $HR('Structured query')) : '';
    void this._renderRuleSummary();
    setSummary(this.container, 'fields', summarizeFields(this.draft.presentation?.data?.fields, this.dbdefs, 'default'));
    const map = this.draft.presentation?.map || {};
    let geo = summarizeFields(map.geoFields, this.dbdefs, 'default');
    if (map.dynamicRequests) geo += ` · ${$HR('load by extent')}`;
    if (map.geoOutputMode === 'features') geo += ` · ${$HR('individual linked map features')}`;
    if (map.minZoom != null || map.maxZoom != null) geo += ` · zoom ${map.minZoom ?? 0}–${map.maxZoom ?? 22}`;
    setSummary(this.container, 'geo', geo);
    setSummary(this.container, 'time', summarizeFields(this.draft.presentation?.timeline?.fields, this.dbdefs, 'default'));
  }

  async _renderRuleSummary() {
    const rules = Array.isArray(this.draft?.request?.rules) ? this.draft.request.rules : [];
    if (!rules.length) { setSummary(this.container, 'rules', $HR('none')); return; }
    let rows = rules;
    if (typeof this.describeRules === 'function') {
      try { rows = await this.describeRules(rules) || rules; } catch { rows = rules; }
    }
    const labels = rows.map((r, i) => r?.title || r?.description || r?.name || `${$HR('Rule')} ${i + 1}`);
    setSummary(this.container, 'rules', summarizeLabels(labels, 'rule'));
  }

  _describe(q) { try { return queryDescribe(q, { dbdefs: this.dbdefs, vocabulary: queryVocabulary, lang: this.lang }); } catch { return ''; } }
  _recordTypeId() { return inferRecordTypeId(this.draft?.request?.q); }
  _ensurePresentation(key) { this.draft.presentation ||= {}; this.draft.presentation[key] ||= {}; return this.draft.presentation[key]; }
  _markDirty() { this._setDirty(editableFingerprint(this.draft) !== this._baseline); }
  _setDirty(value) { const next = value === true; if (next === this._dirty) return; this._dirty = next; this.container?.classList.toggle('is-dirty', next); this.onDirtyChange?.(next, this.getDraftDataSource()); }

  async destroy() { await this.inlineHelper?.destroy?.(); this.inlineHelper = null; await super.destroy(); }
}

function div(className) { const el = document.createElement('div'); el.className = className; return el; }
function button(text, title, handler, className = 'h-btn h-btn-small') { const b = document.createElement('button'); b.type = 'button'; b.className = className; b.textContent = text; b.title = title; b.addEventListener('click', handler); return b; }
function clone(value) { return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
function summarizeFields(value, dbdefs, emptyLabel = 'default') {
  const values = Array.isArray(value) ? value : [];
  const labels = values.map((item) => { const field = typeof item === 'object' ? item?.field : item; return (typeof item === 'object' && item?.title) || fieldCodeLabel(field, dbdefs) || String(field || ''); }).filter(Boolean);
  return labels.length ? summarizeLabels(labels, 'field') : $HR(emptyLabel);
}
function summarizeLabels(labels, noun) {
  if (!labels.length) return $HR('None');
  const shown = labels.slice(0, 3).join(', ');
  const rest = labels.length - 3;
  return rest > 0 ? `${shown} · ${rest} ${$HR('more ' + noun + (rest === 1 ? '' : 's'))}` : shown;
}
function setSummary(root, key, text) { const el = root?.querySelector(`[data-summary="${key}"]`); if (el) el.textContent = text; }
function editableFingerprint(source) {
  if (!source) return '';
  const request = source.request || {};
  const presentation = source.presentation || {};
  return JSON.stringify({
    title: source.title || '',
    request: {
      q: request.q ?? null,
      rules: request.rules ?? null,
      rulesonly: request.rulesonly ?? null,
      filter: request.filter ?? null,
      sort: request.sort ?? null
    },
    presentation: {
      data: presentation.data ?? null,
      map: presentation.map ?? null,
      graph: presentation.graph ?? null,
      timeline: presentation.timeline ?? null,
      filterForm: presentation.filterForm ?? null
    }
  });
}
function blankDraft() { return { reference: { type: 'query', id: null, key: 'query:draft' }, title: null, request: { q: '' }, presentation: { data: null, map: null, graph: null, timeline: null, filterForm: null } }; }
function safeCloneDataSource(source) { try { return cloneDataSource(source); } catch { return clone(source); } }
function hasQuery(q) { return q != null && (typeof q !== 'string' || q.trim().length > 0); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
