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
   * @param {Function} [options.onApply] Called with the draft DataSource when presentation settings change
   *        (on Apply of the rules, geographic, time or column field dialog), so modules show them at once.
   * @param {Function} [options.onDirtyChange] Called with (dirty, draft) whenever the dirty state changes.
   * @param {'vertical'|'horizontal'} [options.orientation='vertical'] Layout: west pane (vertical) or north pane (horizontal).
   * @param {boolean} [options.expanded=false] Whether the presentation settings (More) are shown at start.
   * @param {Function} [options.onExpandedChange] Called with the new More state when the user toggles it.
   * @param {Function} [options.onLayoutChange] Called with `'vertical'` or `'horizontal'` when the user picks a
   *        layout in the Layout menu; without it the editor only changes its own orientation.
   * @param {Function} [options.canChangeLayout] `() → boolean`: whether Vertical/Horizontal are offered
   *        (not in compact mode, which is always vertical).
   * @param {Function} [options.onHelp] Opens the query language help; the Help button is hidden without it.
   */
  constructor({ dbdefs, lang = 'eng', openFilterBuilder, editRules, describeRules, onExecute, onApply, onDirtyChange,
    orientation = 'vertical', expanded = false, onExpandedChange, onLayoutChange, canChangeLayout, onHelp } = {}) {
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
    this.orientation = orientation === 'horizontal' ? 'horizontal' : 'vertical';
    this._expanded = expanded === true;
    this.onExpandedChange = onExpandedChange;
    this.onLayoutChange = onLayoutChange;
    this.canChangeLayout = canChangeLayout;
    this.onHelp = onHelp;
    /** Host for the Save/Add buttons (DataSourceActions inline mode), laid out beside Filter and Builder. */
    this.actionsSlot = null;
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
    this._applyOrientation();

    // panes: p1 query, p2 main actions, p4 presentation settings (More), p5 small tools;
    // p3 the query sentence. CSS arranges them per orientation (see the stylesheet).
    const body = div('h-qse-body');
    const row = div('h-qse-row1');
    const p1 = div('h-qse-p1');
    this._query = document.createElement('textarea');
    this._query.className = 'h-input h-qse-query';
    this._query.rows = 3;
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
    // p0: Clear and Help, always a column left of the query
    const p0 = div('h-qse-p0');
    const clear = iconButton('fa-eraser', $HR('Clear the query and detach from Query Source, clearing its title and presentation settings'), () => this.clearSettings(), 'h-qse-clear');
    const help = iconButton('fa-circle-question', $HR('Query language help'), () => this.onHelp?.(), 'h-qse-help');
    help.hidden = typeof this.onHelp !== 'function';
    p0.append(clear, help);
    p1.append(p0, this._query);

    const p2 = div('h-qse-p2');
    this._run = button('', $HR('Filter'), () => void this._runClicked(), 'h-btn h-btn-primary h-qse-run');
    this._run.innerHTML = iconCaption('fa-filter', $HR('Filter'));
    const builder = button('', $HR('Open the Filter Builder'), () => void this._openBuilder(), 'h-btn h-qse-builder');
    builder.innerHTML = iconCaption('fa-sliders', $HR('Builder'));
    this.actionsSlot = div('h-qse-actions');
    p2.append(this._run, builder, this.actionsSlot);

    this._advanced = div('h-qse-advanced');
    this._advanced.hidden = !this._expanded;
    this._advanced.append(
      this._configRow('Expansion rules', 'rules', 'fa-hexagon-nodes', () => void this.openRuleBuilder(), 'Rules used by Graph to expand the result through linked records.'),
      this._configRow('Geographic fields', 'geo', 'fa-map-location-dot', () => void this.openGeoFieldSelector(), 'Fields used by Map to obtain geometry, including linked geographic fields.'),
      this._configRow('Time fields', 'time', 'fa-clock', () => void this.openTimeFieldSelector(), 'Date and year fields used by Timeline.'),
      this._configRow('Column fields', 'fields', 'fa-table', () => void this.openFieldSetEditor(), 'Columns and formatting used by the Data table presentation.')
    );
    const titleRow = div('h-qse-title-row');
    const titleLabel = document.createElement('span'); titleLabel.className = 'h-qse-title-label'; titleLabel.textContent = $HR('Title');
    this._title = document.createElement('input'); this._title.className = 'h-input h-qse-title'; this._title.type = 'text';
    this._title.placeholder = $HR('Title');
    this._title.setAttribute('aria-label', $HR('Title'));
    this._title.addEventListener('input', () => { if (this.draft) { this.draft.title = this._title.value; this._markDirty(); } });
    titleRow.append(titleLabel, this._title);
    this._advanced.append(titleRow);

    const p5 = div('h-qse-p5');
    this._layoutButton = iconButton('fa-ellipsis', $HR('Layout and more options'), () => this._toggleLayoutMenu(), 'h-qse-layout');
    this._layoutButton.setAttribute('aria-haspopup', 'menu');
    p5.append(this._layoutButton);

    const p3 = div('h-qse-p3');
    row.append(p1, p2, this._advanced, p5);
    body.append(row, p3);
    this._menu = this._buildLayoutMenu();
    this.container.append(body, this._menu);
    Object.assign(this, { _row: row, _p1: p1, _p2: p2, _p5: p5 });
    if (typeof ResizeObserver === 'function') {
      this._fitObserver = new ResizeObserver(() => this._fitHorizontal());
      this._fitObserver.observe(row);
    }
    // Save/Add (DataSourceActions) may be hidden later, e.g. for a guest
    if (typeof MutationObserver === 'function') {
      this._fitMutations = new MutationObserver(() => this._fitHorizontal());
      this._fitMutations.observe(p2, { subtree: true, childList: true, attributeFilter: ['hidden'] });
    }
    this.inlineHelper = new HFilterInlineHelper({
      vocabulary: queryVocabulary,
      lang: this.lang,
      dbdefs: this.dbdefs,
      onOpenBuilder: () => void this._openBuilder(),
      onChange: () => {
        if (this._syncingDraft) return;
        if (this.draft) {
          this.draft.request.q = parseQueryText(this._query.value);
          this._markDirty();
          this._renderSummary();
          this._updateControlState();
        }
      }
    });
    this.inlineHelper.attach(this._query, { showBuilderButton: false, sentenceHost: p3 }).render();
    this.state = 'rendered';
    this._syncFromDraft();
    return this;
  }

  /**
   * @param {object|null} source DataSource to load as the edit baseline, or null for a blank draft.
   * @returns {QuerySourceEditor} this, for chaining.
   */
  setDataSource(source) {
    this.dataSource = source ? clone(source) : null;
    this.draft = this.dataSource ? clone(this.dataSource) : blankDraft();
    this._baseline = editableFingerprint(this.draft);
    this._acceptedQuery = clone(this.draft?.request?.q);
    this._acceptedRecordTypeId = inferRecordTypeId(this._acceptedQuery);
    this._setDirty(false);
    if (this.isRendered) this._syncFromDraft();
    return this;
  }

  /**
   * Replace the draft's expansion rules (edited or extended from a presentation);
   * the draft becomes dirty so the author can save them.
   *
   * @param {Array<object>} rules Expansion rules.
   * @returns {QuerySourceEditor} this, for chaining.
   */
  setRules(rules) {
    if (!this.draft) return this;
    this.draft.request ||= {};
    this.draft.request.rules = clone(Array.isArray(rules) ? rules : []);
    this._markDirty();
    this._renderSummary();
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
    this._fitHorizontal();
    return this;
  }

  /** @returns {'vertical'|'horizontal'} The current layout. */
  getOrientation() { return this.orientation; }

  /**
   * Lay the editor out for the west pane (vertical) or the north pane (horizontal).
   * Only classes change; nothing is rebuilt.
   *
   * @param {'vertical'|'horizontal'} orientation Layout.
   * @returns {QuerySourceEditor} this, for chaining.
   */
  setOrientation(orientation) {
    this.orientation = orientation === 'horizontal' ? 'horizontal' : 'vertical';
    this._applyOrientation();
    this._fitHorizontal();
    return this;
  }

  _applyOrientation() {
    this.container?.classList.toggle('is-horizontal', this.orientation === 'horizontal');
    this.container?.classList.toggle('is-vertical', this.orientation !== 'horizontal');
  }

  /**
   * Horizontal layout: choose how the p2 and p4 buttons are arranged. In order of
   * preference, with the query at its full width: buttons with captions in one
   * row, then wrapped into more rows (as many as the pane height allows), then
   * without captions (one row, then wrapped). Only when nothing fits does the query
   * shrink to its minimum width, trying the same order again. All buttons have one
   * width. p4 puts its Title after the buttons in one row, or on its own row below
   * them when wrapped.
   */
  _fitHorizontal() {
    const root = this.container;
    if (!root || !this._row) return;
    const vars = ['--qse-btn-w', '--qse-p2-columns', '--qse-p4-columns'];
    if (this.orientation !== 'horizontal') {
      for (const name of vars) root.style.removeProperty?.(name);
      root.classList.remove('is-collapsed', 'is-wrapped');
      return;
    }
    const width = this._row.clientWidth;
    const height = this._row.clientHeight;
    if (!(width > 0)) return;
    const visible = (el) => !el.hidden && !el.closest('[hidden]');
    const buttons = [...this._p2.querySelectorAll('.h-btn')].filter(visible).length;
    const advanced = this._expanded;
    const fixed = this._p5.offsetWidth || 22;
    const maxRows = Math.max(1, Math.floor((height + FIT.gap) / (FIT.button + FIT.gap)));
    const span = (count, size) => count * size + (count - 1) * FIT.gap;
    const layout = (query, size, rows) => {
      const p2 = Math.ceil(buttons / rows);
      const p4 = rows === 1 ? FIT.config : Math.ceil(FIT.config / (rows - 1));
      let total = query + FIT.paneGap + span(p2, size) + FIT.paneGap + fixed;
      if (advanced) total += FIT.paneGap + FIT.p4Padding + span(p4, size) + (rows === 1 ? FIT.gap + FIT.title : 0);
      return { size, rows, p2, p4, fits: total <= width };
    };
    let chosen = null;
    for (const query of [FIT.queryMax, FIT.queryMin]) {
      for (const size of [FIT.captioned, FIT.button]) {
        for (let rows = 1; rows <= maxRows && !chosen; rows++) {
          const candidate = layout(query, size, rows);
          if (candidate.fits) chosen = candidate;
        }
      }
      if (chosen) break;
    }
    chosen ||= layout(FIT.queryMin, FIT.button, maxRows);
    root.classList.toggle('is-collapsed', chosen.size === FIT.button);
    root.classList.toggle('is-wrapped', chosen.rows > 1);
    root.style.setProperty('--qse-btn-w', `${chosen.size}px`);
    root.style.setProperty('--qse-p2-columns', `repeat(${chosen.p2}, ${chosen.size}px)`);
    root.style.setProperty('--qse-p4-columns', chosen.rows === 1
      ? `repeat(${FIT.config}, ${chosen.size}px) ${FIT.title}px`
      : `repeat(${chosen.p4}, ${chosen.size}px)`);
  }

  /**
   * Layout menu: Vertical, Horizontal (not in compact mode) and More/Less. Shown as
   * a popover in the top layer, so the north pane's overflow cannot clip it.
   */
  _buildLayoutMenu() {
    const menu = div('h-menu h-qse-layout-menu');
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    if (typeof menu.showPopover === 'function') menu.popover = 'manual';
    const item = (key, label, handler) => {
      const b = button('', '', handler, 'h-menu-item h-qse-layout-item');
      b.dataset.item = key;
      b.setAttribute('role', 'menuitem');
      const check = document.createElement('i');
      check.className = 'fa-solid fa-check fa-fw h-qse-layout-check';
      check.setAttribute('aria-hidden', 'true');
      b.caption = document.createElement('span');
      b.caption.textContent = $HR(label);
      b.append(check, b.caption);
      return b;
    };
    this._menuItems = {
      vertical: item('vertical', 'Vertical', () => this._pickLayout('vertical')),
      horizontal: item('horizontal', 'Horizontal', () => this._pickLayout('horizontal')),
      more: item('more', 'More', () => {
        this._closeLayoutMenu();
        this.setExpanded(!this._expanded);
        this.onExpandedChange?.(this._expanded);
      })
    };
    this._menuDivider = document.createElement('hr');
    this._menuDivider.className = 'h-menu-divider';
    menu.append(this._menuItems.vertical, this._menuItems.horizontal, this._menuDivider, this._menuItems.more);
    return menu;
  }

  _toggleLayoutMenu() {
    if (this._menu?.hidden === false) this._closeLayoutMenu();
    else this._openLayoutMenu();
  }

  _openLayoutMenu() {
    if (!this._menu) return;
    const layouts = typeof this.canChangeLayout !== 'function' || this.canChangeLayout() === true;
    for (const key of ['vertical', 'horizontal']) {
      this._menuItems[key].hidden = !layouts;
      this._menuItems[key].classList.toggle('is-current', this.orientation === key);
    }
    this._menuDivider.hidden = !layouts;
    this._menuItems.more.caption.textContent =this._expanded ? $HR('Less') : $HR('More');
    this._menuItems.more.title = this._expanded ? $HR('Hide the presentation settings') : $HR('Show the presentation settings');
    this._menu.hidden = false;
    try { this._menu.showPopover?.(); } catch { /* not supported: shown in place */ }
    const rect = this._layoutButton.getBoundingClientRect();
    this._menu.style.top = `${Math.round(rect.bottom + 2)}px`;
    this._menu.style.left = `${Math.max(4, Math.round(rect.right - (this._menu.offsetWidth || 150)))}px`;
    this._onMenuOutside = (event) => {
      if (!this._menu.contains(event.target) && !this._layoutButton.contains(event.target)) this._closeLayoutMenu();
    };
    this._onMenuKey = (event) => { if (event.key === 'Escape') this._closeLayoutMenu(); };
    document.addEventListener('pointerdown', this._onMenuOutside, true);
    document.addEventListener('keydown', this._onMenuKey, true);
  }

  _closeLayoutMenu() {
    if (!this._menu || this._menu.hidden) return;
    try { this._menu.hidePopover?.(); } catch { /* not shown as a popover */ }
    this._menu.hidden = true;
    document.removeEventListener('pointerdown', this._onMenuOutside, true);
    document.removeEventListener('keydown', this._onMenuKey, true);
  }

  _pickLayout(orientation) {
    this._closeLayoutMenu();
    if (orientation === this.orientation) return;
    if (typeof this.onLayoutChange === 'function') this.onLayoutChange(orientation);
    else this.setOrientation(orientation);
  }

  /** @returns {QuerySourceEditor} this, for chaining. Discards the draft and reloads it from the last committed DataSource. */
  resetDraft() { this.setDataSource(this.dataSource); return this; }

  /**
   * Clear the query and detach the draft from a persisted Query Source, clearing
   * its title and presentation settings. A parameterized query becomes an empty,
   * editable one.
   * @returns {QuerySourceEditor} this, for chaining.
   */
  clearSettings() {
    if (!this.draft) return this;
    this.draft.reference = { type: 'query', id: null, key: 'query:draft' };
    this.draft.title = '';
    this.draft.request ||= {};
    this.draft.request.q = '';
    this.draft.request.rules = [];
    this.draft.request.rulesonly = 0;
    this.draft.presentation ||= {};
    this.draft.presentation.data = null;
    this.draft.presentation.map = null;
    this.draft.presentation.graph = null;
    this.draft.presentation.timeline = null;
    this.draft.presentation.filterForm = null;
    delete this.draft.meta;
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

  /**
   * Explicit Filter-button click. After a search actually ran, dispatch a bubbling
   * `h-query-source-run` event (hosts may then hide the editor, e.g. the compact
   * drawer). Enter in the query box and a parameterized query, which opens the
   * Filter Form instead, do not dispatch it.
   */
  async _runClicked() {
    this._commitQueryInput();
    const query = this.draft?.request?.q;
    const searches = hasQuery(query) && !hasQueryParameters(query);
    const result = await this.execute();
    if (searches && result != null) {
      this.container?.dispatchEvent(new CustomEvent('h-query-source-run', { bubbles: true }));
    }
  }

  /**
   * Commit the query input and invoke `onApply` with the draft DataSource, if a query
   * is present. Called after each presentation dialog is applied.
   */
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
    await this.execute();
  }

  /** Open the native expansion-rules editor and apply the result to the draft. */
  async openRuleBuilder() {
    if (!this.draft || !(await this._ensureRecordTypeConsistency())) return;
    const editor = new HRuleBuilder({ dbdefs: this.dbdefs, lang: this.lang, describeRules: this.describeRules });
    editor.setRules(this.draft.request.rules || []).setRecordTypes([this._recordTypeId()]);
    const rules = await editor.open({ dataSource: this.getDraftDataSource() });
    // Cancel resolves null; an unchanged Apply changes nothing either
    if (!rules || JSON.stringify(rules) === JSON.stringify(this.draft.request.rules || [])) return;
    this.draft.request.rules = clone(rules);
    this._settingsChanged();
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
    if (!applied || JSON.stringify(applied) === JSON.stringify(this.draft.presentation?.map || {})) return;
    this.draft.presentation.map = applied;
    this._settingsChanged();
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
    if (!result) return;
    const before = editableFingerprint(this.draft);
    apply(result);
    // an unchanged Apply does not reload the modules
    if (editableFingerprint(this.draft) !== before) this._settingsChanged();
  }

  /** A presentation dialog was applied: mark the draft dirty and apply it to the modules at once. */
  _settingsChanged() {
    this._markDirty();
    this._renderSummary();
    void this.apply();
  }

  _showEditorDialog(title, editor, getResult) {
    const host = document.createElement('div');
    host.className = editor instanceof HFieldSetEditor ? 'h-qse-dialog-wide' : 'h-qse-dialog';
    editor.attach(host).render();
    return new Promise((resolve) => {
      let dlg = null;
      // own dialog: a message shown meanwhile (e.g. a flash) must not replace the editor
      const dialogId = 'h-qse-editor-dialog';
      const finish = async (value) => { dlg?.classList.remove('h-qse-dialog-wide-shell'); HMsg.closeMsgDlg?.(dialogId); await editor.destroy(); resolve(value); };
      dlg = HMsg.showMsgDlg(host, {
        dialogId, title: $HR(title), preventClose: true,
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
    edit.dataset.hint = edit.title;
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
    const current = this._query?.readOnly ? this.draft?.request?.q
      : parseQueryText(this._query?.value ?? '');
    const enabled = hasQuery(current);
    if (this._run) this._run.disabled = !enabled;
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

    // asked whether or not the settings (More) are shown: they are lost either way
    if (this._hasSourceConfiguration()) {
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
  async destroy() { this._closeLayoutMenu(); this._fitObserver?.disconnect(); this._fitMutations?.disconnect(); await this.inlineHelper?.destroy?.(); this.inlineHelper = null; await super.destroy(); }
}

/**
 * Horizontal layout sizes (px), mirrored in QuerySourceEditor.css: button height and
 * gap, button width with and without caption, query width range, the gap between
 * panes, the p4 left padding, the number of p4 config buttons, and the Title width
 * (4 buttons without captions).
 */
const FIT = { button: 30, gap: 4, captioned: 90, queryMin: 270, queryMax: 600, paneGap: 6, p4Padding: 8, config: 4, title: 4 * 30 + 3 * 4 };

function div(className) { const el = document.createElement('div'); el.className = className; return el; }
function iconCaption(icon, caption) { return `<i class="fa-solid ${icon}" aria-hidden="true"></i><span class="h-qse-caption">${escapeHtml(caption)}</span>`; }
function iconButton(icon, title, handler, className) {
  const b = button('', title, handler, `heurist-icon-button ${className}`);
  b.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
  b.setAttribute('aria-label', title);
  return b;
}
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
function setSummary(root, key, text) {
  const el = root?.querySelector(`[data-summary="${key}"]`);
  if (!el) return;
  el.textContent = text;
  // horizontal layout hides the value: the button tooltip carries it
  const edit = el.parentElement?.querySelector('.h-qse-config-edit');
  if (edit) edit.title = `${edit.dataset.hint || ''}\n${$HR('Current')}: ${text}`.trim();
}
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
