/**
 * @file CrosstabsTool.js
 * @brief The Crosstabs pane of Explorer (plan 27q2 §17, presentation-sources.md): the viewer of crosstabs. It changes no
 *        configuration: Edit and New open the full screen designer (CrosstabsDesigner, through Explorer).
 *
 * Toolbar: crosstab chooser | Source (Current result / Own query) | Edit | New | Publish | Help. With the source *Current
 * result* the pane counts Explorer's result (AND the record type of the crosstab) and the chooser lists first the crosstabs
 * whose record type is in the result (with the count), the others below and disabled; when exactly one fits and none is
 * chosen it is opened. With *Own query* it counts the query of the crosstab; `$SELECTED$` gets the selection, other
 * parameters are asked in a Filter Form above the crosstab. The choices are kept in the browser (a convenience).
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
import { showPopover, closePopover } from '#shared/widgets/popover/popover.js';
import { HCrosstab } from '#shared/widgets/crosstabs/HCrosstab.js';
import { CrosstabService } from '#shared/widgets/crosstabs/crosstabService.js';
import { HFilterForm } from '#shared/widgets/filter/HFilterForm.js';
import { resolveQueryParameters } from '#shared/data/queryParameters.js';
import { ownQuery, SELECTED_PARAMETER } from '#shared/data/presentationSource.js';
import { loadScopeRecordTypes } from '../toolScope.js';
import {
  crosstabFieldLabel, crosstabLabels, element, groupCrosstabPresets, loadCrosstabPresets, presetSelector, toolButton,
  toolSeparator
} from './crosstabsPresets.js';
import './CrosstabsTool.css';

/** Key prefix of the choices kept in the browser (per database). */
const STORAGE_KEY = 'heurist.crosstabs';

/** The Crosstabs viewer pane. */
export class CrosstabsTool extends HBaseWidget {
  /**
   * @param {object} options Tool options.
   * @param {object} options.apiClient API client of Explorer.
   * @param {function(): Promise<object>} options.getDbDefs Database definitions (HDbDefs).
   * @param {function(): object|null} options.getDataSource Current DataSource.
   * @param {function(): number[]} options.getSelection Selected record ids.
   * @param {function(number): Promise<{presetId: number}|null>} [options.openDesigner] The full screen designer of a
   *        crosstab (0: a new one); resolves when it is closed.
   * @param {function({presetId: number, query: *}): Promise<void>} [options.publish] Publish the crosstab with the query.
   * @param {function(string): void} [options.openManual] Explorer manual at a section (Help: `crosstabs`).
   * @param {object} options.runtime `{apiBaseUrl, database, requestHeaders, accessToken, language}`.
   */
  constructor(options) {
    super();
    this.tool = options;
    this.language = options.runtime?.language || 'eng';
    const headers = { ...(options.runtime?.requestHeaders || {}) };
    if (options.runtime?.accessToken) headers.Authorization = `Bearer ${options.runtime.accessToken}`;
    this.service = new CrosstabService({
      apiBaseUrl: options.runtime?.apiBaseUrl, database: options.runtime?.database, headers, apiClient: options.apiClient || null
    });
    this.preset = null;
    this.presets = [];
    this.recordTypes = null;
    this.values = {};
    const kept = this._kept();
    this.sourceMode = kept.source === 'own' ? 'own' : 'current';
  }

  /**
   * Toolbar, parameter form and the crosstab.
   *
   * @returns {Promise<CrosstabsTool>}
   */
  async render() {
    this.dbdefs = await this.tool.getDbDefs().catch(() => null);
    this.container.classList.add('h-crosstabs-tool', 'h-crosstabs-viewer');
    this.toolbar = element('div', 'h-toolbar h-crosstabs-tool-toolbar');
    this.toolbar.setAttribute('role', 'toolbar');
    this.paramsHost = element('div', 'h-crosstabs-viewer-params');
    this.paramsHost.hidden = true;
    this.view = element('div', 'h-crosstabs-tool-view');
    this.container.replaceChildren(this.toolbar, this.paramsHost, this.view);
    this.crosstab = new HCrosstab().attach(this.view, {
      service: this.service,
      level: 'display',
      language: this.language,
      database: this.tool.runtime?.database || '',
      labels: crosstabLabels(this.dbdefs),
      fieldLabel: (code) => crosstabFieldLabel(this.dbdefs, code),
      emptyText: 'Choose a crosstab'
    }).render();
    this.presets = await loadCrosstabPresets(this.tool.apiClient, this.dbdefs);
    this._renderToolbar();
    await this._refreshRecordTypes();
    const kept = this._kept();
    if (Number(kept.preset) > 0 && this.presets.some((item) => item.id === Number(kept.preset))) await this.openPreset(Number(kept.preset));
    else await this._autoOpen();
    if (!this.preset) await this._apply();
    this.state = 'rendered';
    return this;
  }

  /**
   * Show a crosstab.
   *
   * @param {number} id Presentation set id.
   * @returns {Promise<boolean>} False when it was not found.
   */
  async openPreset(id) {
    const preset = await this.service.loadPreset(id).catch(() => null);
    if (!preset) {
      HMsg.showMsgErr?.($HR('The crosstab was not found'));
      return false;
    }
    this.preset = preset;
    this.values = {};
    this._keep({ preset: preset.id, ...(preset.settings.fields.rectype ? { [`rt${preset.settings.fields.rectype}`]: preset.id } : {}) });
    this._renderToolbar();
    await this.crosstab?.setSettings(preset.settings, { reload: false });
    await this._apply();
    return true;
  }

  /** Explorer's result changed. */
  async setDataSource(source) {
    this.source = source;
    if (this.sourceMode !== 'current') return;
    await this._refreshRecordTypes();
    if (!this.preset) await this._autoOpen();
    await this._apply();
  }

  /** Explorer's selection changed: the parameter `$SELECTED$` of the own query. */
  async setSelection(ids) {
    this.selection = [...(ids || [])];
    if (this.sourceMode === 'own' && this._usesSelection()) await this._apply();
  }

  /** @returns {boolean} The pane has nothing to save. */
  hasUnsavedChanges() {
    return false;
  }

  /** The designer saved or deleted crosstabs: read the list again and show the one closed (or the current one). */
  async reload(presetId = 0) {
    this.presets = await loadCrosstabPresets(this.tool.apiClient, this.dbdefs);
    const id = Number(presetId) || this.preset?.id || 0;
    if (id && this.presets.some((item) => item.id === id)) {
      await this.openPreset(id);
      return;
    }
    this.preset = null;
    this._renderToolbar();
    await this._apply();
  }

  /** @returns {Promise<void>} */
  async destroy() {
    await this.paramsForm?.destroy?.();
    await this.crosstab?.destroy();
    this.crosstab = null;
    await super.destroy();
  }

  // ------------------------------------------------------------------ records

  /** @private The query of Explorer's current result. */
  _currentQuery() {
    const source = this.source ?? this.tool.getDataSource?.();
    return source?.request?.q ?? null;
  }

  /** @private Whether the own query uses the selection. */
  _usesSelection() {
    return ownQuery(this.preset?.query ?? null).names.includes(SELECTED_PARAMETER);
  }

  /** @private The record types of the current result (the chooser); null without a result or with the own query. */
  async _refreshRecordTypes() {
    const query = this.sourceMode === 'current' ? this._currentQuery() : null;
    const key = query == null ? '' : JSON.stringify(query);
    if (key === this._typesKey) return;
    this._typesKey = key;
    this.recordTypes = query == null ? null
      : (await loadScopeRecordTypes(this.tool.apiClient, query, this.dbdefs).catch(() => null))?.recordTypes || null;
  }

  /** @private No crosstab chosen: the one that fits the result alone, or the last one chosen for its record type. */
  async _autoOpen() {
    if (this.preset || this.sourceMode !== 'current' || !this.recordTypes) return;
    const { fitting } = groupCrosstabPresets(this.presets, this.recordTypes);
    const kept = this._kept();
    const remembered = fitting.find((item) => kept[`rt${item.rectype}`] === item.id);
    const chosen = remembered || (fitting.length === 1 ? fitting[0] : null);
    if (chosen) await this.openPreset(chosen.id);
  }

  /** @private The crosstab counts the records of the source. */
  async _apply() {
    if (!this.crosstab) return;
    this._renderParams(null);
    if (!this.preset) {
      this.crosstab.clear(this.presets.length ? 'Choose a crosstab' : 'There is no crosstab yet: New opens the designer');
      return;
    }
    if (this.sourceMode === 'current') {
      const query = this._currentQuery();
      const rectype = this.preset.settings.fields.rectype;
      if (query == null) {
        this.crosstab.clear('Search for records: the crosstab counts the current result');
        return;
      }
      if (rectype && Array.isArray(this.recordTypes) && !this.recordTypes.some((item) => item.id === rectype)) {
        const name = this.dbdefs?.rectypeName?.(rectype) || `#${rectype}`;
        this.crosstab.clear(`${$HR('The current result has no records of type')} ${name}. ${$HR('Choose another crosstab')}`);
        return;
      }
      await this.crosstab.setQuery(query);
      return;
    }
    const own = ownQuery(this.preset.query ?? null, {
      values: this.values, selection: this.selection ?? this.tool.getSelection?.() ?? [], filterForm: this.preset.settings.filterForm
    });
    if (own.q == null) {
      this.crosstab.clear('The crosstab has no query of its own');
      return;
    }
    const asked = own.missing.filter((name) => name !== SELECTED_PARAMETER);
    if (asked.length) {
      this._renderParams(own);
      this.crosstab.clear(`${$HR('The query needs a value of')} ${asked.join(', ')}`);
      return;
    }
    if (own.missing.length) {
      this.crosstab.clear('Select records: the query of the crosstab uses the selection');
      return;
    }
    await this.crosstab.setQuery(own.q);
  }

  /** @private The Filter Form of the parameters of the own query (hidden without missing values). */
  _renderParams(own) {
    if (!own) {
      if (this.paramsForm) void this.paramsForm.destroy?.();
      this.paramsForm = null;
      this.paramsHost.replaceChildren();
      this.paramsHost.hidden = true;
      return;
    }
    if (this.paramsForm) return;
    this.paramsHost.hidden = false;
    this.paramsForm = new HFilterForm();
    this.paramsForm.attach(this.paramsHost, {
      definition: { query: this.preset.query, filterForm: this.preset.settings.filterForm },
      values: this.values,
      dbdefs: this.dbdefs,
      apiClient: this.tool.apiClient,
      composeQuery: (item, values) => resolveQueryParameters(item.query, values, item.filterForm),
      runtimeMode: 'main',
      onSubmit: ({ values }) => {
        this.values = { ...(values || {}) };
        void this._apply();
      }
    }).render();
  }

  // ------------------------------------------------------------------ toolbar

  /** @private Chooser | Source | Edit | New | Publish | Help. */
  _renderToolbar() {
    const bar = this.toolbar;
    bar.replaceChildren();
    const select = presetSelector(bar, this.preset?.title || $HR('Choose a crosstab'), (anchor) => void this._toggleList(anchor));
    select.disabled = !this.presets.length;
    const source = element('select', 'h-select h-compact h-crosstabs-viewer-source');
    source.title = $HR('Records counted: the current result of Explorer, or the query of the crosstab');
    for (const [value, text] of [['current', 'Current result'], ['own', 'Own query']]) {
      const option = element('option');
      option.value = value;
      option.textContent = $HR(text);
      source.append(option);
    }
    source.value = this.sourceMode;
    source.addEventListener('change', async () => {
      this.sourceMode = source.value;
      this._keep({ source: this.sourceMode });
      this.values = {};
      await this._refreshRecordTypes();
      await this._apply();
    });
    bar.append(source);
    toolSeparator(bar);
    const edit = toolButton(bar, 'fa-pen-ruler', 'Edit', 'Open the crosstab in the designer (full screen)', () => void this._design(this.preset?.id || 0));
    edit.disabled = !this.preset || !this.tool.openDesigner;
    const create = toolButton(bar, 'fa-plus', 'New', 'A new crosstab in the designer (full screen)', () => void this._design(0), false);
    create.disabled = !this.tool.openDesigner;
    const publish = toolButton(bar, 'fa-globe', 'Publish', 'Publish the crosstab with the records shown as a web page', () => void this._publish(), false);
    publish.disabled = !this.preset || !this.tool.publish;
    const help = toolButton(bar, 'fa-circle-question', 'Help', 'Help of the crosstabs', () => this.tool.openManual?.('crosstabs'), false);
    help.classList.add('h-crosstabs-tool-right');
    help.hidden = !this.tool.openManual;
  }

  /** @private The crosstabs under the chooser: those for the current result first, the others disabled. */
  async _toggleList(anchor) {
    if (anchor.getAttribute('aria-expanded') === 'true') {
      closePopover();
      return;
    }
    const grouped = groupCrosstabPresets(this.presets, this.sourceMode === 'current' ? this.recordTypes : null);
    const list = element('div', 'h-crosstabs-tool-list');
    list.setAttribute('role', 'listbox');
    const heading = (text) => {
      const node = element('div', 'h-crosstabs-tool-list-heading');
      node.textContent = $HR(text);
      list.append(node);
    };
    const row = (item, enabled) => {
      const button = element('button', 'h-crosstabs-tool-list-item');
      button.type = 'button';
      const type = item.rectype ? (this.dbdefs?.rectypeName?.(item.rectype) || `#${item.rectype}`) : '';
      button.textContent = item.title;
      if (type) {
        const note = element('span', 'h-crosstabs-tool-list-note');
        note.textContent = item.count != null ? `${type} (${item.count.toLocaleString()})` : type;
        button.append(note);
      }
      button.classList.toggle('is-active', item.id === this.preset?.id);
      button.disabled = !enabled;
      button.addEventListener('click', () => {
        closePopover();
        if (item.id !== this.preset?.id) void this.openPreset(item.id);
      });
      list.append(button);
    };
    if (grouped.other.length && grouped.fitting.length) heading('For the current result');
    for (const item of grouped.fitting) row(item, true);
    if (grouped.other.length) {
      heading(grouped.fitting.length ? 'Other configurations' : 'No crosstab for the record types of the current result');
      for (const item of grouped.other) row(item, false);
    }
    showPopover(anchor, list, { className: 'h-crosstabs-tool-popover' });
  }

  /** @private The designer (full screen); the pane shows the crosstab closed there. */
  async _design(presetId) {
    const result = await this.tool.openDesigner?.(presetId);
    await this.reload(result?.presetId || 0);
  }

  /** @private Publish the crosstab with the records shown now (presentation-sources.md §6). */
  async _publish() {
    if (!this.preset) return;
    const query = this.sourceMode === 'current' ? this._currentQuery() : this.crosstab?.query ?? null;
    await this.tool.publish?.({ presetId: this.preset.id, title: this.preset.title, query });
  }

  // ------------------------------------------------------------------ choices kept in the browser

  /** @private The choices kept for this database (empty when the storage can not be read). */
  _kept() {
    try {
      return JSON.parse(globalThis.localStorage?.getItem(`${STORAGE_KEY}.${this.tool.runtime?.database || ''}`) || '{}') || {};
    } catch {
      return {};
    }
  }

  /** @private Keep choices (the crosstab, the source, the last crosstab of a record type). */
  _keep(values) {
    try {
      globalThis.localStorage?.setItem(`${STORAGE_KEY}.${this.tool.runtime?.database || ''}`, JSON.stringify({ ...this._kept(), ...values }));
    } catch {
      // the storage is not available: the choices are not kept
    }
  }
}
