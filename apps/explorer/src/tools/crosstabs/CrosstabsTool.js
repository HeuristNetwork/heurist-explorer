/**
 * @file CrosstabsTool.js
 * @brief The Crosstabs pane of Explorer (plan 27q2 §17, presentation-sources.md): the viewer of crosstabs. It changes no
 *        configuration: Edit and New open the full screen designer (CrosstabsDesigner, through Explorer).
 *
 * Toolbar (27q3 review 1, 2026-11-25, as the editor): New | crosstab chooser | Edit ‖ Show for (Current result / Own
 * query) | Refresh; on the header of the pane Publish | Help | List. **List** (plan 27q3 §2.1) shows the crosstabs of the
 * database in the pane instead of the viewer, with New | Help | View on the header (no toolbar): Edit (or a double click)
 * opens the designer, the pen the record editor, the trash asks first; the right side lists the website pages that show
 * the selected crosstab (field 2-1204). With no crosstab yet the List opens the designer at once. With the source *Current
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
import { CrosstabParams, ownCount } from '#shared/widgets/crosstabs/crosstabParams.js';
import { ownQuery, SELECTED_PARAMETER } from '#shared/data/presentationSource.js';
import { HPresentationList } from '#shared/widgets/presentation/HPresentationList.js';
import { createScopeSelect, renderHeaderActions, renderPresentationToolbar } from '#shared/widgets/presentation/presentationShell.js';
import { describePresentationUse, renderPresentationPages } from '#shared/widgets/presentation/presentationPages.js';
import { loadScopeRecordTypes } from '../toolScope.js';
import {
  crosstabFieldLabel, crosstabLabels, element, groupCrosstabPresets, loadCrosstabPresets
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
   * @param {function(number): Promise<{saved?: boolean}>} [options.editRecord] The record editor (Properties of the List).
   * @param {function({id: number, kind: string, site: object|null}): *} [options.editPage] Edit a website page that
   *        shows a crosstab (the List): the CMS editor.
   * @param {function(string): void} [options.openManual] Explorer manual at a section (Help: `crosstabs`).
   * @param {Function} [options.selectExtent] Map extent picker of geo parameters of the Filter Form.
   * @param {HTMLElement|null} [options.headerActions] The buttons on the header of the pane (Publish | Help | List).
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
    // the form and the crosstab: a vertical form at the left, a horizontal one above (review 6)
    const body = element('div', 'h-crosstabs-viewer-body h-crosstab-params-layout');
    // the Filter Form of an own query with parameters: it stays after Filter (review 2026-11-23)
    this.params = new CrosstabParams(this.paramsHost, {
      dbdefs: this.dbdefs,
      apiClient: this.tool.apiClient,
      layout: body,
      selectExtent: this.tool.selectExtent || null,
      onSubmit: (values) => {
        this.values = values;
        void this._apply();
      }
    });
    this.view = element('div', 'h-crosstabs-tool-view');
    body.append(this.paramsHost, this.view);
    this.bodyElement = body;
    this.container.replaceChildren(this.toolbar, body);
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
    // the same query as counted (new rules, another title): nothing to count again
    if (this.sourceMode !== 'current' || (this.preset && JSON.stringify(this._currentQuery() ?? null) === this._countedKey)) return;
    await this._refreshRecordTypes();
    // a crosstab opened now has counted the result already
    if (!this.preset && await this._autoOpen()) return;
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

  /**
   * The List of the crosstabs in the pane (27q3 §2.1), or the viewer again.
   *
   * @param {boolean} [show] Show the List; default: the other one.
   * @returns {Promise<void>}
   */
  async toggleList(show = !this.list) {
    if (!show) {
      await this.list?.destroy();
      this.list = null;
      this.listHost?.remove();
      this.listHost = null;
      this.toolbar.hidden = false;
      this.bodyElement.hidden = false;
      this._renderHeaderActions();
      return;
    }
    if (this.list) return;
    this.toolbar.hidden = true;
    this.bodyElement.hidden = true;
    this.listHost = element('div', 'h-crosstabs-tool-list-mode');
    this.container.append(this.listHost);
    const publish = this.tool.publish;
    this.list = new HPresentationList().attach(this.listHost, {
      apiClient: this.tool.apiClient,
      dbdefs: this.dbdefs,
      kinds: ['crosstabs'],
      title: 'Crosstabs',
      newLabel: 'New crosstab',
      // New, Help and View are on the header of the pane (27q3 review 1)
      showBar: false,
      selectHint: 'Select a crosstab in the list',
      selectedId: this.preset?.id || null,
      canEdit: Boolean(this.tool.openDesigner),
      onNew: this.tool.openDesigner ? () => void this._design(0) : null,
      onEdit: this.tool.openDesigner ? (id) => void this._design(id) : null,
      editRecord: this.tool.editRecord || null,
      describeUse: (id) => describePresentationUse(this.tool.apiClient, this.dbdefs, id),
      onDeleted: (id) => void this._deleted(id),
      // no crosstab yet: the designer at once (27q3 §2.2)
      onEmpty: this.tool.openDesigner ? () => void this._design(0) : null,
      renderOutputs: (id, host) => renderPresentationPages(host, {
        apiClient: this.tool.apiClient,
        dbdefs: this.dbdefs,
        presentationId: id,
        editPage: this.tool.editPage || null,
        publish: publish ? () => void this._publishPreset(id) : null
      }),
      baseUrl: this.tool.runtime?.baseUrl,
      database: this.tool.runtime?.database
    });
    // after this.list is set: New | Help | View (review 2, 2026-11-25)
    this._renderHeaderActions();
    await this.list.render();
  }

  /** @returns {Promise<void>} */
  async destroy() {
    await this.list?.destroy();
    this.list = null;
    this.params?.hide();
    this.tool.headerActions?.replaceChildren();
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
    const scope = query == null ? null : await loadScopeRecordTypes(this.tool.apiClient, query, this.dbdefs).catch(() => null);
    this.recordTypes = scope?.recordTypes || null;
    this.total = scope?.total ?? null;
  }

  /** @private The records of the current result the crosstab counts (from the record types; null: not known). */
  _currentCount() {
    const rectype = this.preset?.settings.fields.rectype;
    if (!rectype) return this.total;
    const item = this.recordTypes?.find((type) => type.id === rectype);
    return item ? item.count : null;
  }

  /**
   * @private No crosstab chosen: the one that fits the result alone, or the last one chosen for its record type.
   * @returns {Promise<boolean>} True when a crosstab was opened (and counted).
   */
  async _autoOpen() {
    if (this.preset || this.sourceMode !== 'current' || !this.recordTypes) return false;
    const { fitting } = groupCrosstabPresets(this.presets, this.recordTypes);
    const kept = this._kept();
    const remembered = fitting.find((item) => kept[`rt${item.rectype}`] === item.id);
    const chosen = remembered || (fitting.length === 1 ? fitting[0] : null);
    return chosen ? this.openPreset(chosen.id) : false;
  }

  /** @private The crosstab counts the records of the source. */
  async _apply() {
    if (!this.crosstab) return;
    this._countedKey = this.sourceMode === 'current' ? JSON.stringify(this._currentQuery() ?? null) : null;
    // the form of the own query: shown while the source is Own query, closed with Current result or another crosstab
    if (this.sourceMode !== 'own' || !this.preset) this.params.hide();
    else this.params.show(this.preset, this.values);
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
      await this.crosstab.setQuery(query, { count: this._currentCount() });
      return;
    }
    // some values are enough: the empty parameters are left out (review 6)
    const own = ownCount(this.preset.query ?? null, {
      values: this.values, selection: this.selection ?? this.tool.getSelection?.() ?? [], filterForm: this.preset.settings.filterForm,
      dbdefs: this.dbdefs
    });
    if (own.q == null) {
      this.crosstab.clear(own.message || 'The crosstab has no query of its own');
      return;
    }
    await this.crosstab.setQuery(own.q);
  }

  // ------------------------------------------------------------------ toolbar

  /**
   * @private New | chooser | Edit ‖ Show for | Refresh (the slots of the editor, 27q3 review 1); Publish | Help | List on
   * the header. A published Explorer (a website page) has no New, Edit, Publish, List.
   */
  _renderToolbar() {
    const design = Boolean(this.tool.openDesigner);
    const scope = createScopeSelect({
      value: this.sourceMode,
      label: 'Show for',
      title: 'Records counted: the current result of Explorer, or the query of the crosstab',
      onChange: async (value) => {
        this.sourceMode = value;
        this._keep({ source: this.sourceMode });
        this.values = {};
        await this._refreshRecordTypes();
        await this._apply();
      }
    });
    renderPresentationToolbar(this.toolbar, {
      new: design ? { label: 'New crosstab', title: 'A new crosstab in the editor (full screen)', run: () => void this._design(0) } : null,
      selector: {
        icon: 'fa-table-cells', label: this.preset?.title || $HR('Choose a crosstab'), title: 'Crosstab',
        disabled: !this.presets.length, run: (anchor) => void this._toggleList(anchor)
      },
      edit: design ? {
        title: 'Open the crosstab in the editor (full screen)', disabled: !this.preset,
        run: () => void this._design(this.preset?.id || 0)
      } : null,
      scope,
      refresh: { title: 'Count the records again', run: () => void this._refresh() }
    });
    this._renderHeaderActions();
  }

  /** @private Refresh: the record types of the current result again, and the crosstab. */
  async _refresh() {
    this._typesKey = null;
    await this._refreshRecordTypes();
    await this._apply();
  }

  /**
   * @private The buttons on the header of the pane (icon buttons as the module panels), the mode switch last:
   * viewer Publish | Help | List, List New | Help | View. None on a website but Help.
   */
  _renderHeaderActions() {
    const design = Boolean(this.tool.openDesigner);
    renderHeaderActions(this.tool.headerActions, [
      this.list && design ? { icon: 'fa-circle-plus', label: 'New crosstab', run: () => void this._design(0) } : null,
      !this.list && this.tool.publish
        ? { icon: 'fa-share-nodes', label: 'Publish the crosstab as a web page', disabled: !this.preset, run: () => void this._publish() } : null,
      this.tool.openManual ? { icon: 'fa-circle-question', label: 'Help of the crosstabs', run: () => this.tool.openManual('crosstabs') } : null,
      // the List of the crosstabs and their pages (27q3 §2.1), not on a website
      design ? {
        icon: this.list ? 'fa-table-cells' : 'fa-list-ul',
        label: this.list ? 'Back to the crosstab' : 'List of the crosstabs and their published pages',
        run: () => void this.toggleList()
      } : null
    ]);
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
    // with headings the items are indented under them
    list.classList.toggle('has-groups', grouped.other.length > 0);
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

  /** @private The designer (full screen); the pane shows the crosstab closed there (and the List is read again). */
  async _design(presetId) {
    const result = await this.tool.openDesigner?.(presetId);
    await this.reload(result?.presetId || 0);
    if (this.list) {
      this.list.selectedId = result?.presetId || this.list.selectedId;
      await this.list.reload();
    }
  }

  /** @private A crosstab was deleted in the List. */
  async _deleted(id) {
    if (this.preset?.id === id) this.preset = null;
    await this.reload(0);
  }

  /** @private Publish a crosstab of the List (with its own query). */
  async _publishPreset(id) {
    const item = this.presets.find((preset) => preset.id === Number(id));
    await this.tool.publish?.({ presetId: Number(id), title: item?.title || '', query: null, source: 'own', presets: this.presets });
    await this.list?.select(Number(id));
  }

  /** @private Publish the crosstab with the records shown now (presentation-sources.md §6). */
  async _publish() {
    if (!this.preset) return;
    await this.tool.publish?.({
      presetId: this.preset.id, title: this.preset.title, query: this._currentQuery(), source: this.sourceMode, presets: this.presets
    });
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
