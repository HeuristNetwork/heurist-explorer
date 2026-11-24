/**
 * @file StoryMapTool.js
 * @brief Story map tool of Explorer (plan 27q1 §7, §15; plan 27q3): the viewer pane and the full screen editor of story
 *        maps (one widget, `mode` viewer | editor).
 *
 * A story map is a Presentation set (2-1112) of kind StoryMap: its name, the source query (2-12, the story topics) and
 * the settings (Configuration 2-1187, storyMapModel.js). **Viewer** (the pane, 27q3 §2): selector | Edit | New, and on
 * the header of the pane List and Help; List shows the story maps of the database and the website pages of the selected
 * one (field 2-1204), Delete is there. **Editor** (full screen, ExplorerApplication.openStoryMapDesigner): header with
 * Close and the common toolbar of the presentations (presentationShell.js): New | selector | Properties | Save | Save as ‖
 * Run ‖ Help; the form is always open. Publish of a story map comes with its publication (27q3 §6, not yet). The map of
 * the editor's preview is to be described separately (27q3 §2.3): the story still uses Explorer's Map module. The form (HEditForm,
 * storyMapForm.js) is applied at once, except the query, the rule and the background map: they make Apply primary and
 * are applied after a question. The story is HStoryMap: the story of the last record selected in Explorer (or of the
 * only record of the result), its current element on Explorer's Map module (StoryMapBinding over the Map public API).
 * Form and story are side by side (vertical stories) or one above the other (horizontal); the story is hidden while
 * the form is open in a narrow pane. Opened by the CMS designer with `?tool=storymap&preset=<id>`
 * (ExplorerApplication.openStoryMap).
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
import { askChoice } from '#shared/ui/askChoice.js';
import { HEditForm } from '#shared/widgets/edit-form/HEditForm.js';
import {
  confirmLeave, createSourceHeader, presentationButton, presentationSelector, renderPresentationToolbar, togglePresentationList
} from '#shared/widgets/presentation/presentationShell.js';
import { HPresentationList } from '#shared/widgets/presentation/HPresentationList.js';
import { describePresentationUse, renderPresentationPages } from '#shared/widgets/presentation/presentationPages.js';
import { HTree } from '#shared/widgets/tree/HTree.js';
import { HStoryMap } from '#shared/widgets/storymap/HStoryMap.js';
import { StoryMapBinding } from '#shared/widgets/storymap/storyMapBinding.js';
import { StoryMapService } from '#shared/widgets/storymap/storyMapService.js';
import { defaultPlaces, normalizeStoryMapSettings, storyElementTypes } from '#shared/widgets/storymap/storyMapModel.js';
import { fieldCodeLabel } from '#shared/data/fieldPathCodes.js';
import { HGeoFieldSelector } from '../../widgets/query-source/helpers/HGeoFieldSelector.js';
import { showHelperDialog } from '../../widgets/query-source/helpers/showHelperDialog.js';
import { MANUAL_APPLY, formValues, orderTerms, storyMapForm, valuesSettings } from './storyMapForm.js';
import './StoryMapTool.css';

/** Width of the pane below which the story is hidden while the form is open: side by side / one above the other. */
const NARROW = Object.freeze({ side: 600, above: 400 });

/** Delay of the instant apply after a change of the form (ms). */
const APPLY_DELAY = 300;

/** Story map tool widget. */
export class StoryMapTool extends HBaseWidget {
  /**
   * @param {object} options Tool options.
   * @param {object} options.apiClient API client of Explorer (writes).
   * @param {function(): Promise<object>} options.getDbDefs Database definitions (HDbDefs).
   * @param {function(): object|null} options.getDataSource Current DataSource.
   * @param {function(): number[]} options.getSelection Selected record ids.
   * @param {function(): (object|null|Promise<object|null>)} options.getMap Public API of Explorer's Map module.
   * @param {function(object, string): Promise<*>} [options.showRecords] Show a query as the result of Explorer.
   * @param {function(number[]): Promise<*>} [options.selectRecords] Select records in Explorer.
   * @param {function(number): Promise<{saved: boolean}>} [options.editRecord] Explorer's record editor.
   * @param {function(object): Object<number, object>} [options.specialEditors] Special editors of the record editor
   *        by field id (RecordEditorHost.specialEditors): the query and the rule.
   * @param {function(): Promise<object>} [options.formServices] Services of pointer fields (RecordEditorHost.formServices).
   * @param {function(object, object): Promise<object|null>} [options.editSymbology] Symbology editor (plan 17).
   * @param {function(string): void} [options.openManual] Explorer manual at a section (Help: `storymap`).
   * @param {'viewer'|'editor'} [options.mode='viewer'] The pane, or the full screen editor.
   * @param {function(number): Promise<{presetId: number}|null>} [options.openDesigner] Viewer: the editor of a story map
   *        (0: a new one); resolves when it is closed.
   * @param {function(number): *} [options.editPage] Viewer, List: edit a website page that shows a story map.
   * @param {HTMLElement|null} [options.headerActions] Viewer: the buttons on the header of the pane (List, Help).
   * @param {function({presetId: number}): void} [options.onClose] Editor: closed (unsaved changes asked first).
   * @param {object} options.runtime `{apiBaseUrl, database, requestHeaders, accessToken, language}`.
   */
  constructor(options) {
    super();
    this.tool = options;
    this.mode = options.mode === 'editor' ? 'editor' : 'viewer';
    this.language = options.runtime?.language || 'eng';
    const headers = { ...(options.runtime?.requestHeaders || {}) };
    if (options.runtime?.accessToken) headers.Authorization = `Bearer ${options.runtime.accessToken}`;
    this.service = new StoryMapService({ apiBaseUrl: options.runtime?.apiBaseUrl, database: options.runtime?.database, headers });
    this.preset = null;
    this.presets = [];
    this.templates = [];
    this.values = this._valuesOf(null);
    // the settings shown by the story (the query, the rule and the background map wait for Apply)
    this.applied = this.values.settings;
    this.pending = new Set();
    this._dirty = false;
  }

  /**
   * Toolbar, form (closed) and the story.
   *
   * @returns {Promise<StoryMapTool>}
   */
  async render() {
    this.dbdefs = await this.tool.getDbDefs().catch(() => null);
    this.container.classList.add('h-storymap-tool', `is-${this.mode}`);
    // the editor: the header with Close (27q3 §2.3)
    this.header = this.mode === 'editor'
      ? createSourceHeader({ title: '', closeTitle: 'Close the story map editor', onClose: () => void this.close() })
      : null;
    this.toolbar = element('div', 'h-toolbar h-storymap-tool-toolbar');
    this.toolbar.setAttribute('role', 'toolbar');
    this.main = element('div', 'h-storymap-tool-main');
    this.formPane = element('div', 'h-storymap-tool-form');
    this.formHost = element('div', 'h-storymap-tool-form-body');
    this.formFooter = element('div', 'h-storymap-tool-form-footer');
    this.formPane.append(this.formHost, this.formFooter);
    this.formPane.hidden = true;
    this.view = element('div', 'h-storymap-tool-view');
    this.main.append(this.formPane, this.view);
    this.container.replaceChildren(...(this.header ? [this.header.element] : []), this.toolbar, this.main);
    await Promise.all([this._loadPresets(), this._loadTemplates()]);
    this._renderToolbar();
    this._mountStory();
    if (typeof ResizeObserver === 'function') {
      this._resize = new ResizeObserver(() => this._layout());
      this._resize.observe(this.container);
    }
    this._layout();
    this.state = 'rendered';
    return this;
  }

  /**
   * Open a story map; `showSource`: its source records become the result of Explorer and the first one is selected.
   *
   * @param {number} id Presentation set id.
   * @param {{showSource?: boolean}} [options]
   * @returns {Promise<boolean>} False when it was not found.
   */
  async openPreset(id, { showSource = false } = {}) {
    const preset = await this.service.loadPreset(id).catch(() => null);
    if (!preset) {
      HMsg.showMsgErr?.($HR('The story map was not found'));
      return false;
    }
    this.preset = preset;
    this.values = this._valuesOf(preset);
    this.applied = this.values.settings;
    this.pending.clear();
    this._dirty = false;
    if (!this.presets.some((item) => item.id === preset.id)) this.presets.push({ id: preset.id, title: preset.title });
    this._renderToolbar();
    if (!this.formPane.hidden) await this._renderForm({ read: false });
    this._layout();
    // the story of the story map before goes: Run or a selection shows a story of this one
    if (!showSource) await this.story?.clear();
    await this.story?.setSettings(this.applied, { sourceQuery: null, reload: true });
    if (showSource && preset.query != null && this.tool.showRecords) await this.tool.showRecords(preset.query, preset.title);
    return true;
  }

  /** Explorer's result changed: one record shows its story without a selection. */
  async setDataSource(source) {
    this.source = source;
    const query = source?.request?.q;
    const ids = query == null ? [] : await this.service.queryIds(query, 2).catch(() => []);
    await this.story?.setSourceIds(ids);
  }

  /** Explorer's selection changed. */
  async setSelection(ids) {
    await this.story?.setSelection(ids);
  }

  /** @returns {boolean} Changes of the form that are not saved. */
  hasUnsavedChanges() {
    return this._dirty === true;
  }

  /**
   * Editor: a new story map (the form open).
   *
   * @returns {Promise<void>}
   */
  newStoryMap() {
    return this._new({ ask: false, open: true });
  }

  /**
   * Editor: close (Save | Discard | Cancel first when there are changes).
   *
   * @returns {Promise<boolean>} False when the user stays.
   */
  async close() {
    if (!(await this._confirmLeave())) return false;
    this._dirty = false;
    this.tool.onClose?.({ presetId: this.preset?.id || 0 });
    return true;
  }

  /**
   * Viewer: the story maps were changed in the editor: read the list again and show the one closed there.
   *
   * @param {number} [presetId]
   * @returns {Promise<void>}
   */
  async reload(presetId = 0) {
    await this._loadPresets();
    const id = Number(presetId) || this.preset?.id || 0;
    if (id && this.presets.some((item) => item.id === id)) {
      await this.openPreset(id);
      return;
    }
    this.preset = null;
    this._renderToolbar();
    await this.story?.setSettings(this._valuesOf(null).settings, { sourceQuery: null, reload: true });
  }

  /**
   * Viewer: the List of the story maps in the pane (27q3 §2.1), or the story again.
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
      this.main.hidden = false;
      this._renderHeaderActions();
      return;
    }
    if (this.list || this.mode !== 'viewer') return;
    this.toolbar.hidden = true;
    this.main.hidden = true;
    this.listHost = element('div', 'h-storymap-tool-list-mode');
    this.container.append(this.listHost);
    this._renderHeaderActions();
    const design = Boolean(this.tool.openDesigner);
    this.list = new HPresentationList().attach(this.listHost, {
      apiClient: this.tool.apiClient,
      dbdefs: this.dbdefs,
      kinds: ['storymap'],
      title: 'Story maps',
      newLabel: 'New story map',
      selectedId: this.preset?.id || null,
      canEdit: design,
      onNew: design ? () => void this._design(0) : null,
      onEdit: design ? (id) => void this._design(id) : null,
      editRecord: this.tool.editRecord || null,
      describeUse: (id) => describePresentationUse(this.tool.apiClient, this.dbdefs, id),
      onDeleted: (id) => void this.reload(this.preset?.id === id ? -1 : 0),
      // no story map yet: the editor at once (27q3 §2.2)
      onEmpty: design ? () => void this._design(0) : null,
      renderOutputs: (id, host) => renderPresentationPages(host, {
        apiClient: this.tool.apiClient, dbdefs: this.dbdefs, presentationId: id, editPage: this.tool.editPage || null
      }),
      baseUrl: this.tool.runtime?.baseUrl,
      database: this.tool.runtime?.database
    });
    await this.list.render();
  }

  /** @returns {Promise<void>} */
  async destroy() {
    await this.list?.destroy();
    this.list = null;
    this.tool.headerActions?.replaceChildren();
    this._resize?.disconnect();
    clearTimeout(this._applyTimer);
    await this.form?.destroy();
    await this.story?.destroy();
    this.story = null;
    await super.destroy();
  }

  // ------------------------------------------------------------------ data

  /** @private Field, type and term ids of the database. */
  _ids() {
    const id = (code) => Number(this.dbdefs?.dbconst?.(code)) || 0;
    return {
      rectype: id('RT_PRESENTATION_SET'), name: id('DT_NAME'), query: id('DT_QUERY_STRING'), rules: id('DT_EXPANSION_RULES'),
      configuration: id('DT_CONFIGURATION'), type: id('DT_PRESENTATION_TYPE'), storymap: id('TRM_PRESENTATION_STORYMAP'),
      mapDocument: id('RT_MAP_DOCUMENT')
    };
  }

  /** @private The story maps of the database (Presentation sets of kind StoryMap). */
  async _loadPresets() {
    const ids = this._ids();
    if (!ids.rectype) {
      this.presets = [];
      return;
    }
    const answer = await this.tool.apiClient.get('/records', {
      query: { q: JSON.stringify([{ t: String(ids.rectype) }]), fields: `rec_ID,rec_Title,${ids.type}`, limit: 1000 }
    }).catch(() => null);
    this.presets = ((answer?.data ?? answer)?.records || [])
      .filter((record) => {
        const type = Number([record.details?.[ids.type]].flat()[0]) || 0;
        return !type || type === ids.storymap;
      })
      .map((record) => ({ id: Number(record.rec_ID), title: String(record.rec_Title || `#${record.rec_ID}`) }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  /** @private The report templates (cards first). */
  async _loadTemplates() {
    // reports are Presentation sets (plan 27q3): meta.items has the reports only
    const answer = await this.tool.apiClient.get('/presentation', { query: { fields: 'rec_ID', limit: 5000 } }).catch(() => null);
    this.templates = Object.values((answer?.data ?? answer)?.meta?.items ?? {})
      .filter((report) => report.id != null)
      .map((report) => ({ id: Number(report.id), title: report.title || report.file || `#${report.id}`, card: Boolean(report.isCardView) }))
      .sort((a, b) => Number(b.card) - Number(a.card) || a.title.localeCompare(b.title));
  }

  /** @private Name, query text and settings of a preset (or a new story map). */
  _valuesOf(preset) {
    return {
      title: preset?.title || '',
      query: preset?.query == null ? '' : (typeof preset.query === 'string' ? preset.query : JSON.stringify(preset.query)),
      settings: normalizeStoryMapSettings(preset?.configuration || null)
    };
  }

  /** @private Type of the story elements (the rule's last level), 0 for any or none. */
  _elementType(settings = this.values.settings) {
    const types = storyElementTypes(settings.story.rule);
    return types.length === 1 ? types[0] : 0;
  }

  // ------------------------------------------------------------------ save, delete, run

  /**
   * @private Save the story map; `asNew`: a new Presentation set with the values of the form (Save as), its name with
   * "(copy)" when it was not changed.
   * @returns {Promise<boolean>} Saved.
   */
  async _save({ asNew = false } = {}) {
    const ids = this._ids();
    if (!ids.rectype || !ids.configuration || !ids.type) {
      HMsg.showMsgErr?.($HR('This database has no record type Presentation set (2-1112)'));
      return false;
    }
    if (!(await this._checkForm())) return false;
    if (asNew && this.values.title.trim() === String(this.preset?.title || '').trim()) {
      this.values.title = `${this.values.title.trim()} (${$HR('copy')})`;
    }
    const title = this.values.title.trim();
    const settings = structuredClone(this.values.settings);
    if (!settings.actions) delete settings.actions;
    const details = {
      [ids.name]: [title],
      [ids.type]: [ids.storymap],
      [ids.configuration]: [JSON.stringify(settings)],
      [ids.query]: this.values.query.trim() ? [this.values.query.trim()] : []
    };
    try {
      const id = asNew ? 0 : (this.preset?.id || 0);
      const answer = id
        ? await this.tool.apiClient.request(`/presentation/${id}`, { method: 'PATCH', body: { details } })
        : await this.tool.apiClient.post('/presentation/0', { body: { rec_RecTypeID: ids.rectype, details } });
      const saved = Number((answer?.data ?? answer)?.records?.[0]?.rec_ID ?? (answer?.data ?? answer)?.recordId ?? id) || 0;
      this._dirty = false;
      await this._loadPresets();
      if (saved) await this.openPreset(saved);
      HMsg.showMsgFlash?.($HR('Saved'), { showDelay: 1500 });
      return true;
    } catch (error) {
      HMsg.showMsgErr?.(errorText(error));
      return false;
    }
  }

  /**
   * @private The check of the form before Save and Apply (required fields and formats, marked in the form as in every
   * HEditForm); a closed form is opened for it. The values are read into `this.values`.
   * @returns {Promise<boolean>} The form is fine.
   */
  async _checkForm() {
    if (this.formPane.hidden) await this._toggleForm();
    if (!this.form) return false;
    const problems = this.form.validate();
    this._readForm();
    if (!problems.length) return true;
    HMsg.showMsgFlash?.($HR('Fill in the required fields of the configuration'), { showDelay: 2500 });
    return false;
  }

  /** @private Unsaved changes: Save | Discard | Cancel (27q3 §3.2). @returns {Promise<boolean>} The caller may go on. */
  _confirmLeave() {
    return confirmLeave({ dirty: this._dirty, save: () => this._save(), message: 'Story has been changed. Save changes?' });
  }

  /** @private Viewer: the editor (full screen); the pane shows the story map closed there, the List is read again. */
  async _design(presetId) {
    const result = await this.tool.openDesigner?.(Number(presetId) || 0);
    await this.reload(result?.presetId || 0);
    if (this.list) {
      this.list.selectedId = result?.presetId || this.list.selectedId;
      await this.list.reload();
    }
  }

  /** @private The Presentation set in the record editor (name, owner, visibility). */
  async _editRecord() {
    const id = this.preset?.id;
    if (!id || !this.tool.editRecord || !(await this._confirmLeave())) return;
    const result = await this.tool.editRecord(id);
    if (result?.saved === false) return;
    await this._loadPresets();
    await this.openPreset(id);
  }

  /** @private Run: the story topics as the result of Explorer, the first one selected (its story is shown). */
  async _run() {
    this._readForm();
    const text = this.values.query.trim();
    if (!text) {
      HMsg.showMsgFlash?.($HR('The story map has no query of story topics'), { showDelay: 2000 });
      return;
    }
    const query = parseQuery(text);
    await this.tool.showRecords?.(query, this.values.title || $HR('Story map'));
    const [first] = await this.service.queryIds(query, 1).catch(() => []);
    if (first) await this.tool.selectRecords?.([first]);
    // the editor is not in Explorer's sync: its story follows the selection here
    if (first && this.mode === 'editor') await this.story?.setSelection([first]);
  }

  // ------------------------------------------------------------------ story

  /** @private The story widget over the applied settings. */
  _mountStory() {
    this.binding = new StoryMapBinding({ getMap: this.tool.getMap, settings: this.applied, title: $HR('Story map') });
    this.story = new HStoryMap().attach(this.view, {
      service: this.service,
      binding: this.binding,
      settings: this.applied,
      language: this.language
    }).render();
    const selection = this.tool.getSelection?.() || [];
    if (selection.length) void this.story.setSelection(selection);
    const source = this.tool.getDataSource?.();
    if (source) void this.setDataSource(source);
  }

  /**
   * @private The settings of the form on the story at once; the query, the rule and the background map as applied
   * before (they wait for Apply).
   */
  _applyInstant() {
    clearTimeout(this._applyTimer);
    this._applyTimer = setTimeout(() => {
      this._readForm();
      const settings = structuredClone(this.values.settings);
      if (this.pending.has(MANUAL_APPLY.rules)) settings.story.rule = this.applied.story.rule;
      if (this.pending.has(MANUAL_APPLY.background)) settings.map.background = this.applied.map.background;
      this.applied = settings;
      this._layout();
      void this.story?.setSettings(settings, { sourceQuery: null });
    }, APPLY_DELAY);
  }

  /** @private Apply: the query, the rule and the background map after a question. */
  async _apply() {
    clearTimeout(this._applyTimer);
    if (!(await this._checkForm())) return;
    const queries = this.pending.has(MANUAL_APPLY.query) || this.pending.has(MANUAL_APPLY.rules);
    const map = this.pending.has(MANUAL_APPLY.background);
    if (queries || map) {
      const question = [queries ? 'Apply new queries?' : '', map ? 'Apply new map document?' : ''].filter(Boolean).map((text) => $HR(text)).join(' ');
      if ((await askChoice(question, $HR('Apply'), [['apply', $HR('Apply')]])) !== 'apply') return;
    }
    const runQuery = this.pending.has(MANUAL_APPLY.query);
    this.pending.clear();
    this._syncApply();
    this.applied = structuredClone(this.values.settings);
    this._layout();
    await this.story?.setSettings(this.applied, { sourceQuery: null, reload: queries });
    if (runQuery) await this._run();
  }

  // ------------------------------------------------------------------ toolbar and layout

  /** @private The toolbar: the viewer's (selector | Edit | New) or the editor's (the common one, 27q3 §3). */
  _renderToolbar() {
    if (this.mode === 'editor') {
      this._renderEditorToolbar();
      return;
    }
    const bar = this.toolbar;
    bar.replaceChildren();
    presentationSelector(bar, {
      icon: 'fa-book-open', label: this.preset?.title || $HR('Select story map'), title: 'Story map', disabled: !this.presets.length,
      run: (anchor) => togglePresentationList(anchor, this.presets, {
        current: this.preset?.id,
        onSelect: (item) => { if (item.id !== this.preset?.id) void this.openPreset(item.id); }
      })
    });
    // Edit / New: the editor over the whole screen (not on a website page)
    if (this.tool.openDesigner) {
      presentationButton(bar, {
        icon: 'fa-pen-ruler', label: 'Edit', title: 'Open the story map in the editor (full screen)', primary: true,
        disabled: !this.preset, run: () => void this._design(this.preset?.id || 0)
      });
      presentationButton(bar, { icon: 'fa-plus', label: 'New', title: 'A new story map in the editor (full screen)', caption: false, run: () => void this._design(0) });
    }
    this._renderHeaderActions();
  }

  /** @private Editor: New | selector | Properties | Save | Save as ‖ Run ‖ Help (Close on the header). */
  _renderEditorToolbar() {
    this.header?.setTitle(`${$HR('Story map editor')}: ${this.preset?.title || $HR('New story map')}`);
    const active = Boolean(this.preset) || this.editing === true;
    renderPresentationToolbar(this.toolbar, {
      new: { label: 'New story', title: 'New story map', run: () => void this._new() },
      selector: {
        icon: 'fa-book-open', label: this.preset?.title || $HR('New story map'), title: 'Story map', disabled: !this.presets.length,
        run: (anchor) => togglePresentationList(anchor, this.presets, {
          current: this.preset?.id,
          onSelect: async (item) => {
            if (item.id !== this.preset?.id && (await this._confirmLeave())) await this.openPreset(item.id);
          }
        })
      },
      properties: { title: 'Name, owner and visibility of the story map', disabled: !this.preset?.id || !this.tool.editRecord, run: () => void this._editRecord() },
      save: { title: 'Save the story map', disabled: !active, run: () => void this._save() },
      saveAs: { title: 'Save the changes as a new story map', disabled: !this.preset?.id, run: () => void this._save({ asNew: true }) },
      // Run: the story topics as the result of Explorer, the first one selected (the Refresh slot)
      refresh: { icon: 'fa-play', label: 'Run', title: 'Run the query of the story topics and show the story of the first one', disabled: !active, run: () => void this._run() },
      help: this.tool.openManual ? { title: 'Help of the story map', run: () => this.tool.openManual('storymap') } : null
    });
  }

  /** @private Viewer: List and Help on the header of the pane (as the Crosstabs pane). */
  _renderHeaderActions() {
    const host = this.tool.headerActions;
    if (!host || this.mode !== 'viewer') return;
    host.replaceChildren();
    const button = (icon, title, run) => {
      const node = element('button', 'heurist-icon-button');
      node.type = 'button';
      node.title = $HR(title);
      node.setAttribute('aria-label', $HR(title));
      node.append(element('span', `fa-solid ${icon}`));
      node.addEventListener('click', run);
      host.append(node);
      return node;
    };
    if (this.tool.openDesigner) {
      button(this.list ? 'fa-book-open' : 'fa-list-ul', this.list ? 'Back to the story map' : 'List of the story maps and their published pages',
        () => void this.toggleList()).classList.toggle('is-active', Boolean(this.list));
    }
    if (this.tool.openManual) button('fa-circle-question', 'Help of the story map', () => this.tool.openManual('storymap'));
  }

  /** @private A new story map: the form opens. */
  async _new({ ask = true, open = true } = {}) {
    if (ask && !(await this._confirmLeave())) return;
    this.preset = null;
    this.editing = open;
    this.values = this._valuesOf(null);
    this.applied = this.values.settings;
    this.pending.clear();
    this._dirty = false;
    clearTimeout(this._applyTimer);
    await this.form?.destroy();
    this.form = null;
    this.formHost.replaceChildren();
    this.formFooter.replaceChildren();
    this.formPane.hidden = true;
    this._renderToolbar();
    if (open) await this._toggleForm();
    else this._layout();
    await this.story?.setSettings(this.applied, { sourceQuery: null, reload: true });
  }

  /** @private Show / hide the form (only for a story map that is open or new). */
  async _toggleForm() {
    if (this.formPane.hidden && !this.preset && !this.editing) return;
    if (this.formPane.hidden) {
      this.formPane.hidden = false;
      await this._renderForm();
    } else {
      this._readForm();
      this.formPane.hidden = true;
    }
    this.editorButton?.classList.toggle('is-active', !this.formPane.hidden);
    this._layout();
  }

  /**
   * @private Form and story: side by side for vertical stories, one above the other for horizontal ones; the story is
   * hidden while the form is open in a narrow pane.
   */
  _layout() {
    if (!this.main) return;
    const above = this.applied.presentation.layout === 'horizontal';
    const width = this.container.clientWidth || this.container.getBoundingClientRect?.().width || 0;
    const narrow = width > 0 && width < (above ? NARROW.above : NARROW.side);
    this.main.classList.toggle('is-above', above);
    this.main.classList.toggle('is-side', !above);
    this.view.hidden = !this.formPane.hidden && narrow;
  }

  // ------------------------------------------------------------------ form

  /** @private The form (HEditForm) with the values of the story map. */
  async _renderForm({ read = true } = {}) {
    const ids = this._ids();
    // another story map was opened: its values, not the ones of the form before (review 4, 2026-11-20)
    if (read) this._readForm();
    await this.form?.destroy();
    this.form = null;
    const services = (await this.tool.formServices?.().catch(() => null)) || { apiClient: this.tool.apiClient, dbdefs: this.dbdefs };
    this._formType = this._elementType();
    this.form = new HEditForm().attach(this.formHost, {
      ...services,
      form: storyMapForm({ ids, templates: this.templates, dateFields: this._dateFields(this._formType) }),
      values: formValues(this.values, ids),
      keepHidden: true,
      labelPos: 'above',
      specialEditors: this._specialEditors(ids),
      onChange: (form, change) => this._changed(change.name)
    });
    this.form.render();
    const apply = element('button', 'h-btn h-storymap-tool-apply');
    apply.type = 'button';
    apply.textContent = $HR('Apply');
    apply.addEventListener('click', () => void this._apply());
    this.applyButton = apply;
    this.formFooter.replaceChildren(apply);
    this._syncApply();
  }

  /** @private The values of the form into `this.values` (the form open). */
  _readForm() {
    if (!this.form || this.formPane?.hidden) return;
    this.values = valuesSettings(this.form.getValues(), this._ids(), this.values.settings);
  }

  /** @private A value of the form changed: instant apply, or Apply for the query, the rule and the background map. */
  _changed(name) {
    if (name == null) return;
    this._dirty = true;
    const ids = this._ids();
    const manual = {
      [String(ids.query || MANUAL_APPLY.query)]: MANUAL_APPLY.query,
      [String(ids.rules || MANUAL_APPLY.rules)]: MANUAL_APPLY.rules,
      [MANUAL_APPLY.background]: MANUAL_APPLY.background
    }[String(name)];
    if (manual) {
      this.pending.add(manual);
      this._readForm();
      this._syncApply();
      return;
    }
    this._applyInstant();
  }

  /** @private Apply is primary while a query, the rule or the background map waits. */
  _syncApply() {
    this.applyButton?.classList.toggle('h-btn-primary', this.pending.size > 0);
  }

  /** @private Date fields of the element type (the Order choices). */
  _dateFields(rectypeId) {
    if (!rectypeId) return [];
    return (this.dbdefs?.fields?.(rectypeId) || []).filter((field) => ['date', 'year'].includes(field.type))
      .map((field) => ({ id: Number(field.id), label: field.name }));
  }

  /** @private Special editors of the form: query and rule of the record editor, geo fields, manual order, symbology. */
  _specialEditors(ids) {
    const record = this.tool.specialEditors?.(this.dbdefs) || {};
    const parse = (value) => {
      try {
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    };
    const rules = record[ids.rules];
    const symbology = {
      json: true,
      icon: 'fa-palette',
      title: 'Edit symbology',
      describe: (value) => describeSymbol(parse(value)),
      edit: async (value) => {
        if (!this.tool.editSymbology) return undefined;
        const result = await this.tool.editSymbology(parse(value), { complete: true });
        return result == null ? undefined : JSON.stringify(result);
      }
    };
    return {
      query: record[ids.query] || null,
      rules: rules ? { ...rules, edit: (value, context) => this._editRule(rules, value, context) } : null,
      geoFields: {
        list: true,
        icon: 'fa-map-location-dot',
        title: 'Geographic fields of the story element or of linked records',
        describe: (value) => [value ?? []].flat().filter(Boolean).map((code) => fieldCodeLabel(code, this.dbdefs) || code).join(', '),
        edit: (value) => this._editGeoFields(value)
      },
      manualOrder: {
        json: true,
        icon: 'fa-arrow-down-short-wide',
        title: 'Order the elements of the shown story',
        describe: (value) => {
          const count = Object.keys(parse(value) || {}).length;
          return count ? `${count} ${$HR('stories ordered')}` : '';
        },
        edit: (value) => this._editManualOrder(parse(value) || {})
      },
      symbology
    };
  }

  /**
   * @private The rule editor of the record editor; the elements must be of one record type. A new type asks first
   * and gives the order and the places of the new type.
   */
  async _editRule(base, value, context) {
    const result = await base.edit(value, context);
    if (result === undefined) return undefined;
    const rules = (() => {
      try {
        return result ? JSON.parse(result) : [];
      } catch {
        return [];
      }
    })();
    const rule = rules[0] || null;
    if (rules.length > 1) {
      HMsg.showMsgErr?.($HR('A story map has one rule: the first one is used'));
    }
    const types = storyElementTypes(rule);
    if (rule && types.length !== 1) {
      HMsg.showMsgErr?.($HR('All story elements must be of one record type: choose one type in the last step of the rule'));
      return undefined;
    }
    const before = this._formType;
    const after = types[0] || 0;
    if (before && after && before !== after) {
      const ok = await askChoice('Changing the record type of the story elements will distort the presentation configuration. Continue?',
        $HR('Story elements'), [['yes', $HR('Continue')]]);
      if (ok !== 'yes') return undefined;
    }
    if (after && after !== before) void this._typeChanged(after);
    return rule ? JSON.stringify([rule]) : '';
  }

  /**
   * @private A new element type (after the rule field has its new value): the order choices and the places of that
   * type in the form; they wait for Apply with the rule.
   */
  async _typeChanged(rectypeId) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!this.form) return;
    this._formType = rectypeId;
    const order = this.form.getValue('order');
    await this.form.updateField('order', { terms: orderTerms(this._dateFields(rectypeId)) });
    await this.form.setValue('order', ['date', 'rule', 'manual'].includes(order) ? order : 'date');
    await this.form.setValue('manual', '');
    const places = this._defaultPlaces(rectypeId);
    for (const role of ['begin', 'transition', 'end']) await this.form.setValue(role, places[role]);
    await this.form.setValue('connect', places.begin.length > 0 && (places.transition.length + places.end.length) > 0);
    this._readForm();
  }

  /** @private The default places of a story element type (2-28, 2-134, 1414-1092 / 1414-1090 / 2-864). */
  _defaultPlaces(rectypeId) {
    const dbdefs = this.dbdefs;
    const fields = new Map((dbdefs?.fields?.(rectypeId) || []).map((field) => [Number(field.id), field]));
    return defaultPlaces(rectypeId, {
      fieldOf: (code) => {
        const id = Number(dbdefs?.localId?.('dty', code)) || 0;
        const field = fields.get(id);
        return field ? { id, type: field.type, targets: dbdefs.fieldGlobal?.(id)?.targetTypes || [] } : null;
      },
      placeType: Number(dbdefs?.localId?.('rty', '3-1009')) || 0,
      geoField: Number(dbdefs?.localId?.('dty', '2-28')) || 0
    });
  }

  /** @private Geographic fields of the element type: HGeoFieldSelector with the field tree only. */
  async _editGeoFields(value) {
    const rectypeId = this._formType || this._elementType();
    if (!rectypeId) {
      HMsg.showMsgFlash?.($HR('Choose the story elements first'), { showDelay: 2000 });
      return undefined;
    }
    const editor = new HGeoFieldSelector({ dbdefs: this.dbdefs, viewportOptions: false, autoSelect: false, outputMode: false });
    editor.setRecordType(rectypeId);
    editor.setMapProfile({ geoFields: [value ?? []].flat().filter(Boolean) });
    const result = await showHelperDialog('Geographic fields', editor, () => editor.getMapProfile());
    return result == null ? undefined : (result.geoFields || []).map(String);
  }

  /** @private The manual order of the shown story: its elements in a tree that is ordered by drag and drop. */
  async _editManualOrder(manual) {
    const story = this.story?.story;
    if (!story?.elements?.length) {
      HMsg.showMsgFlash?.($HR('Select a story topic with story elements first'), { showDelay: 2000 });
      return undefined;
    }
    const topic = story.source.id;
    let items = story.elements.map((item) => ({ id: item.id, label: item.title || `#${item.id}`, icon: 'fa-solid fa-grip-vertical', draggable: true }));
    const stored = manual[topic] || [];
    items.sort((a, b) => {
      const at = (id) => (stored.includes(id) ? stored.indexOf(id) : Infinity);
      return at(a.id) - at(b.id);
    });
    const host = element('div', 'h-storymap-tool-order');
    const tree = new HTree().attach(host, {
      items,
      canDrop: (dragId, targetId, position) => position !== 'inside',
      onDrop: (dragId, targetId, position) => {
        const moved = items.find((item) => item.id === Number(dragId));
        items = items.filter((item) => item.id !== Number(dragId));
        const index = items.findIndex((item) => item.id === Number(targetId));
        items.splice(position === 'after' ? index + 1 : index, 0, moved);
        tree.setItems(items);
      }
    }).render();
    const done = await new Promise((resolve) => {
      const dialogId = 'h-storymap-order-dialog';
      HMsg.showMsgDlg(host, {
        dialogId,
        title: `${$HR('Order of the story')}: ${story.source.title}`,
        buttons: [
          { label: $HR('Apply'), class: 'h-btn h-btn-primary', onClick: () => { HMsg.closeMsgDlg(dialogId); resolve(true); } },
          { label: $HR('Cancel'), class: 'h-btn', onClick: () => { HMsg.closeMsgDlg(dialogId); resolve(false); } }
        ],
        onClose: () => resolve(false)
      });
    });
    await tree.destroy?.();
    if (!done) return undefined;
    return JSON.stringify({ ...manual, [topic]: items.map((item) => item.id) });
  }
}

/** Symbology in words (colours, icon). */
function describeSymbol(symbology) {
  if (!symbology || typeof symbology !== 'object') return '';
  const symbol = symbology.symbol && typeof symbology.symbol === 'object' ? symbology.symbol : symbology;
  const parts = [];
  if (symbol.color) parts.push(`${$HR('line')} ${symbol.color}`);
  if (symbol.fillColor) parts.push(`${$HR('fill')} ${symbol.fillColor}`);
  if (symbol.iconType || symbol.iconUrl) parts.push(`${$HR('icon')} ${symbol.iconType || ''}`.trim());
  return parts.join(', ') || $HR('Symbology defined');
}

/** A query of the form: JSON, else the text (Heurist query language). */
function parseQuery(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Text of an error of the API. */
function errorText(error) {
  return error?.payload?.message || error?.message || String(error);
}
