/**
 * @file QuerySourceEditor.js
 * @brief Explorer Query Source authoring widget. Edits a draft DataSource only;
 *        persistence/workspace operations are owned by DataSourceActions.
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
import { $HR, HMsg } from '#shared/ui';
import { HFilterInlineHelper } from '../filter-builder/HFilterInlineHelper.js';
import queryVocabulary from '../../utils/queryVocabulary.json' with { type: 'json' };
import { queryDescribe } from '../../utils/queryDescribe.js';
import { HFieldSetEditor } from './helpers/HFieldSetEditor.js';
import { HGeoFieldSelector } from './helpers/HGeoFieldSelector.js';
import { HTimeFieldSelector } from './helpers/HTimeFieldSelector.js';
import { HRuleBuilder } from './helpers/HRuleBuilder.js';
import { inferRecordTypeId, fieldCodeLabel } from './helpers/fieldPathUtils.js';
import { hasQueryParameters } from '#shared/data/queryParameters.js';
import './QuerySourceEditor.css';

/** Explorer Query Source authoring widget. Edits a draft DataSource only. */
export class QuerySourceEditor extends HBaseWidget {
  /**
   * @param {object} options Widget configuration.
   * @param {object} options.dbdefs Database definitions used to resolve and label fields (required).
   * @param {string} [options.lang] Vocabulary/description language code.
   * @param {Function} [options.openFilterBuilder] Opens the Filter Builder with the current query, resolving to a new query or null.
   * @param {Function} [options.editRules] Opens the host Rule Builder for expansion rules.
   * @param {Function} [options.describeRules] Resolves expansion rules to human-readable summaries.
   * @param {Function} [options.onExecute] Called with the draft DataSource when the user runs the query.
   * @param {Function} [options.onApply] Called with the draft DataSource when the user tests/applies presentation settings.
   * @param {Function} [options.onDirtyChange] Called with (dirty, draft) whenever the dirty state changes.
   */
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
    this._acceptedQuery = null;
    this._acceptedRecordTypeId = null;
  }

  /**
   * @param {HTMLElement} container Element to render into.
   * @param {object} [options] Forwarded to HBaseWidget#attach.
   * @returns {QuerySourceEditor} this, for chaining.
   */
  attach(container, options = {}) { super.attach(container, options); return this; }

  /** @returns {QuerySourceEditor} this, for chaining. */
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
      this._updateControlState();
    });
    this._query.addEventListener('change', () => {
      if (!this.draft) return;
      this.draft.request.q = parseQueryText(this._query.value);
      void this._ensureRecordTypeConsistency();
    });

    this._run = button('', $HR('Filter'), () => void this.execute(), 'h-btn h-btn-primary h-qse-run');
    const run = this._run;
    run.innerHTML = '<i class="fa-solid fa-filter" aria-hidden="true"></i><span class="h-qse-run-caption">' + escapeHtml($HR('Filter')) + '</span>';
    const builder = button($HR('Builder'), $HR('Open the Filter Builder'), () => void this._openBuilder());
    this._more = button('', $HR('More Query Source options'), () => this.setExpanded(!this._expanded), 'h-btn h-btn-small h-qse-more');
    this._renderMoreButton();
    queryRow.append(this._query, run, builder, this._more);
    compact.append(queryRow);

    this._advanced = div('h-qse-advanced');
    this._advanced.hidden = true;
    this._advanced.append(
      this._configRow('Expansion rules', 'rules', 'fa-hexagon-nodes', () => void this.openRuleBuilder(), 'Rules used by Graph to expand the result through linked records.'),
      this._configRow('Geographic fields', 'geo', 'fa-map-location-dot', () => void this.openGeoFieldSelector(), 'Fields used by Map to obtain geometry, including linked geographic fields.'),
      this._configRow('Time fields', 'time', 'fa-clock', () => void this.openTimeFieldSelector(), 'Date and year fields used by Timeline.'),
      this._configRow('Column fields', 'fields', 'fa-table', () => void this.openFieldSetEditor(), 'Columns and formatting used by the Data table presentation.')
    );
    const testRow = div('h-qse-test-row');
    const clear = button($HR('Clear'), $HR('Clear Query Source title and presentation settings'), () => this.clearSettings(), 'h-btn h-btn-small h-qse-clear');
    const titleLabel = document.createElement('span'); titleLabel.className = 'h-qse-title-label'; titleLabel.textContent = $HR('Title');
    this._title = document.createElement('input'); this._title.className = 'h-input h-qse-title'; this._title.type = 'text';
    this._title.addEventListener('input', () => { if (this.draft) { this.draft.title = this._title.value; this._markDirty(); } });
    this._test = button($HR('Test'), $HR('Test Query Source settings'), () => void this.apply(), 'h-btn');
    testRow.append(clear, titleLabel, this._title, this._test);
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

  /**
   * @param {object|null} source DataSource to load as the edit baseline, or null for a blank draft.
   * @returns {QuerySourceEditor} this, for chaining.
   */
  setDataSource(source) {
    this.setExpanded(false);
    this.dataSource = source ? clone(source) : null;
    this.draft = this.dataSource ? clone(this.dataSource) : blankDraft();
    this._baseline = editableFingerprint(this.draft);
    this._acceptedQuery = clone(this.draft?.request?.q);
    this._acceptedRecordTypeId = inferRecordTypeId(this._acceptedQuery);
    this._setDirty(false);
    if (this.isRendered) this._syncFromDraft();
    return this;
  }

  /** @returns {object|null} A clone of the current draft DataSource, with the query input committed. */
  getDraftDataSource() {
    this._commitQueryInput();
    return this.draft ? clone(this.draft) : null;
  }

  /** @returns {*} A clone of the draft's query (`request.q`). */
  getQuery() { return clone(this.draft?.request?.q); }

  /**
   * @param {*} query Query to set as the draft's `request.q`.
   * @returns {QuerySourceEditor} this, for chaining.
   */
  setQuery(query) {
    if (!this.draft) return this;
    this.draft.request.q = clone(query.query || query);
    this.draft.presentation.filterForm = clone(query.filterForm || null);
    this._markDirty();
    if (this.isRendered) this._syncFromDraft();
    return this;
  }

  /** @returns {boolean} Whether the draft has unsaved changes. */
  isDirty() { return this._dirty; }

  /** @returns {boolean} Whether the advanced (presentation configuration) section is expanded. */
  isExpanded() { return this._expanded; }

  /**
   * @param {boolean} value Whether to show the advanced (presentation configuration) section.
   * @returns {QuerySourceEditor} this, for chaining.
   */
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

  /** @returns {QuerySourceEditor} this, for chaining. Discards the draft and reloads it from the last committed DataSource. */
  resetDraft() { this.setDataSource(this.dataSource); return this; }

  /**
   * Clear the draft's title and expansion rules/presentation settings, keeping only the query.
   * @returns {QuerySourceEditor} this, for chaining.
   */
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
  /**
   * @param {object|null} [source] DataSource to adopt as committed; defaults to the current draft.
   * @returns {QuerySourceEditor} this, for chaining.
   */
  markCommitted(source = null) {
    if (source) this.setDataSource(source);
    else {
      this.dataSource = this.draft ? clone(this.draft) : null;
      this._baseline = editableFingerprint(this.draft);
      this._setDirty(false);
      this.setExpanded(false);
    }
    return this;
  }

  _commitQueryInput() {
    if (!this.draft || !this._query || this._query.readOnly) return;
    this.draft.request ||= {};
    this.draft.request.q = parseQueryText(this._query.value);
  }

  /** Commit the query input and invoke `onExecute` with the draft DataSource, if a query is present. */
  async execute() {
    this._commitQueryInput();
    if (!(await this._ensureRecordTypeConsistency())) return null;
    const source = this.getDraftDataSource();
    if (!hasQuery(source?.request?.q) || typeof this.onExecute !== 'function') return null;
    return this.onExecute(source);
  }

  /** Commit the query input and invoke `onApply` with the draft DataSource, if a query is present. */
  async apply() {
    this._commitQueryInput();
    if (!(await this._ensureRecordTypeConsistency())) return null;
    const source = this.getDraftDataSource();
    if (!hasQuery(source?.request?.q) || typeof this.onApply !== 'function') return null;
    return this.onApply(source);
  }

  async _openBuilder() {
    if (!this.draft || typeof this.openFilterBuilder !== 'function') return;
    const query = await this.openFilterBuilder(clone(this.draft.request.q),
      clone(this.draft.presentation?.filterForm || null));
    if (query == null) return;
    this.draft.request.q = clone(query.query || query);
    this.draft.presentation.filterForm = clone(query.filterForm || null);
    if (!(await this._ensureRecordTypeConsistency())) return;
    this._markDirty();
    this._syncFromDraft();
  }

  /** Open the expansion-rules editor (host Rule Builder or fallback) and apply the result to the draft. */
  async openRuleBuilder() {
    if (!this.draft || !(await this._ensureRecordTypeConsistency())) return;
    const editor = new HRuleBuilder({ editRules: this.editRules, describeRules: this.describeRules });
    editor.setRules(this.draft.request.rules || []);
    const rules = await editor.open({ dataSource: this.getDraftDataSource() });
    if (rules) { this.draft.request.rules = clone(rules); this._markDirty(); this._renderSummary(); }
  }

  /** Open the Data-presentation column field-set editor and apply the result to the draft. */
  async openFieldSetEditor() {
    if (!(await this._ensureRecordTypeConsistency())) return;
    return this._openFieldEditor('Column fields', new HFieldSetEditor({ dbdefs: this.dbdefs }),
      this.draft?.presentation?.data?.fields || [],
      (value) => { this._ensurePresentation('data').fields = value; });
  }

  /** Open the Map geographic-field and viewport/zoom editor and apply the result to the draft. */
  async openGeoFieldSelector() {
    if (!this.draft || !(await this._ensureRecordTypeConsistency())) return;
    const editor = new HGeoFieldSelector({ dbdefs: this.dbdefs });
    editor.setRecordType(this._recordTypeId());
    editor.setMapProfile(this.draft.presentation?.map || {});
    const applied = await this._showEditorDialog('Geographic fields', editor, () => editor.getMapProfile());
    if (applied) { this.draft.presentation.map = applied; this._markDirty(); this._renderSummary(); }
  }

  /** Open the Timeline date/year field editor and apply the result to the draft. */
  async openTimeFieldSelector() {
    if (!(await this._ensureRecordTypeConsistency())) return;
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
    const q = this.draft.request.q;
    if (this._title) this._title.value = this.draft.title || '';

    // Always keep the real query visible in the editor.  Structured JSON is
    // displayed as JSON; only parameterized JSON is protected from direct edits.
    const queryText = queryToInputText(q);
    this._query.hidden = false;
    this._query.disabled = false;
    this._query.readOnly = false;
    this._query.value = queryText;

    const parameterized = isParameterizedQuery(q);
    this._query.disabled = false;
    this._query.readOnly = parameterized;
    this._query.title = parameterized
      ? $HR('Parameterized queries are edited in Filter Builder.')
      : '';

    this._syncingDraft = true;
    try { this.inlineHelper?.refreshSentence?.(); }
    finally { this._syncingDraft = false; }

    // HFilterInlineHelper must never become the owner of the query input value.
    // Re-assert the draft value after its sentence refresh so datasource loading
    // cannot leave h-qse-query blank.
    if (this._query.value !== queryText) this._query.value = queryText;

    this._renderSummary();
    this._updateControlState();
  }

  _renderSummary() {
    if (!this.draft) return;
    const q = this.draft.request?.q;
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
  _setDirty(value) {
    const next = value === true;
    this._dirty = next;
    this.container?.classList.toggle('is-dirty', next);
    // Dirty-state notification must be side-effect free. In particular, do not
    // call getDraftDataSource() here because it commits the current textarea
    // value back into the draft. During setDataSource() the textarea has not
    // yet been synchronized, so doing that would overwrite request.q with ''.
    this.onDirtyChange?.(next, this.draft ? clone(this.draft) : null);
  }

  _updateControlState() {
    const enabled = hasQuery(this.draft?.request?.q);
    if (this._run) this._run.disabled = !enabled;
    if (this._test) this._test.disabled = !enabled;
  }

  /** Return a persisted Query Source draft with an automatic human-readable title when blank. */
  prepareDraftForSave() {
    this._commitQueryInput();
    const source = this.getDraftDataSource();
    if (!source) return source;
    if (!String(source.title || '').trim()) source.title = this._suggestTitle(source.request?.q);
    return source;
  }

  _suggestTitle(query) {
    const description = String(this._describe(query) || '').trim().replace(/^Find\s+/i, '').trim();
    return description || $HR('Query Source');
  }

  _hasSourceConfiguration() {
    const d = this.draft || {};
    const p = d.presentation || {};
    return !!String(d.title || '').trim()
      || (Array.isArray(d.request?.rules) && d.request.rules.length > 0)
      || hasProfile(p.data) || hasProfile(p.map) || hasProfile(p.graph) || hasProfile(p.timeline) || hasProfile(p.filterForm);
  }

  /** True when a transient query has Query Source-specific configuration worth protecting on navigation. */
  hasConfiguredFields() {
    const d = this.draft || {};
    const p = d.presentation || {};
    return (Array.isArray(d.request?.rules) && d.request.rules.length > 0)
      || hasProfile(p.data) || hasProfile(p.map) || hasProfile(p.graph) || hasProfile(p.timeline) || hasProfile(p.filterForm);
  }

  _detachForRecordTypeChange() {
    if (!this.draft) return;
    this.draft.reference = { type: 'query', id: null, key: 'query:draft' };
    this.draft.title = '';
    this.draft.request ||= {};
    this.draft.request.rules = [];
    this.draft.request.rulesonly = 0;
    this.draft.presentation = { data: null, map: null, graph: null, timeline: null, filterForm: null };
    this.draft.count = null;
    this.draft.origin = 'search';
  }

  async _ensureRecordTypeConsistency() {
    if (!this.draft) return true;
    const query = clone(this.draft.request?.q);
    const nextType = inferRecordTypeId(query);
    const previousType = this._acceptedRecordTypeId;
    if (!(previousType > 0) || !(nextType > 0) || previousType === nextType) {
      if (nextType > 0) this._acceptedRecordTypeId = nextType;
      this._acceptedQuery = query;
      return true;
    }

    if (this._expanded && this._hasSourceConfiguration()) {
      const accepted = await confirmRecordTypeChange();
      if (!accepted) {
        this.draft.request.q = clone(this._acceptedQuery);
        this._syncFromDraft();
        this._markDirty();
        return false;
      }
    }

    this._detachForRecordTypeChange();
    this._acceptedRecordTypeId = nextType;
    this._acceptedQuery = query;
    this._markDirty();
    this._syncFromDraft();
    return true;
  }

  /** Tear down the inline query helper and the widget itself. */
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
function hasQuery(q) { return q != null && (typeof q !== 'string' || q.trim().length > 0); }
function hasProfile(value) { return value != null && (typeof value !== 'object' || Object.keys(value).length > 0); }
function queryToInputText(query) {
  if (query == null) return '';
  if (typeof query === 'string') return query;
  try { return JSON.stringify(query); } catch { return String(query); }
}
function parseQueryText(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        && !('q' in parsed) && !('builderModel' in parsed) && !('parameters' in parsed)
        ? [parsed] : parsed;
    } catch { /* keep plain query text until Builder/validation handles it */ }
  }
  return value;
}
function isParameterizedQuery(query) { return hasQueryParameters(query); }

function confirmRecordTypeChange() {
  return new Promise((resolve) => {
    const finish = (value) => { HMsg.closeMsgDlg?.(); resolve(value); };
    HMsg.showMsgDlg($HR('Changing the record type will clear the Query Source title and presentation configuration. Continue?'), {
      title: $HR('Change record type'),
      preventClose: true,
      buttons: [
        { label: $HR('Change record type'), class: 'h-btn h-btn-primary', onClick: () => finish(true) },
        { label: $HR('Cancel'), class: 'h-btn', onClick: () => finish(false) }
      ]
    });
  });
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
