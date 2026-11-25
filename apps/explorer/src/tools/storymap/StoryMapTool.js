/**
 * @file StoryMapTool.js
 * @brief Story map tool of Explorer (plan 27q1 §7, §15; plan 27q3): the viewer pane and the full screen editor of story
 *        maps (one widget, `mode` viewer | editor).
 *
 * A story map is a Presentation set (2-1112) of kind StoryMap: its name, the source query (2-12, the story topics) and
 * the settings (Configuration 2-1187, storyMapModel.js). **Viewer** (the pane, 27q3 §2): New | selector | Edit | Own
 * map ‖ Show for | Refresh | Publish, and on the header of the pane List and Help; List shows the story maps of the database and the website pages of the selected
 * one (field 2-1204), Delete is there. **Editor** (full screen, ExplorerApplication.openStoryMapDesigner): header with
 * Close and the common toolbar of the presentations (presentationShell.js): New | selector | Properties | Save | Save as ‖
 * Show for | Refresh | Publish; the form is always open. Publish (both modes): a web page with the story map and the
 * story topic chosen in Show for (Explorer's publication form).
 * The form (HEditForm, storyMapForm.js) is applied at once, except the query, the rule and the background map: they
 * make Apply primary and are applied after a question.
 * **Show for** (Story map review, 2026-11-25), in both modes: *Current result* | *Story topics* (the own query) | *Any
 * <topic type>*, and a record picker (HInputResource) of the story topic record type in that range; the story is the
 * story of the chosen record. Explorer's selection is not followed (a click on the Map or in Data does not change the
 * story). The story is HStoryMap, its current element on a map (StoryMapBinding over the Map public API): the editor
 * has its own map with a timeline under it (the direct entries of Map and Timeline, mounted by Explorer); the View
 * has them when *Own map* is on, else Explorer's Map module.
 * The editor has HCardinalLayout: the form on the west whatever the orientation of the stories, the story in the
 * center. The own map and timeline are beside vertical stories and under horizontal ones; the List hides them with the
 * story. Opened by the CMS designer with `?tool=storymap&preset=<id>`
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
import { HCardinalLayout } from '#shared/widgets/layout/HCardinalLayout.js';
import {
  confirmLeave, createScopeSelect, createSourceHeader, presentationButton, renderHeaderActions, renderPresentationToolbar,
  togglePresentationList
} from '#shared/widgets/presentation/presentationShell.js';
import { createHInput } from '#shared/widgets/form/inputs/createHInput.js';
import { RecordTitleSource } from '#shared/data/valueSources/FieldValueSource.js';
import { HPresentationList } from '#shared/widgets/presentation/HPresentationList.js';
import { describePresentationUse, renderPresentationPages } from '#shared/widgets/presentation/presentationPages.js';
import { HTree } from '#shared/widgets/tree/HTree.js';
import { HStoryMap } from '#shared/widgets/storymap/HStoryMap.js';
import { StoryMapBinding } from '#shared/widgets/storymap/storyMapBinding.js';
import { StoryMapService } from '#shared/widgets/storymap/storyMapService.js';
import { storyTimelineSync } from '#shared/widgets/storymap/storyMapTimeline.js';
import {
  defaultPlaces, normalizeStoryMapSettings, storyElementTypes, storyTopicType
} from '#shared/widgets/storymap/storyMapModel.js';
import { fieldCodeLabel } from '#shared/data/fieldPathCodes.js';
import { HGeoFieldSelector } from '../../widgets/query-source/helpers/HGeoFieldSelector.js';
import { showHelperDialog } from '../../widgets/query-source/helpers/showHelperDialog.js';
import { MANUAL_APPLY, formValues, orderTerms, storyMapForm, valuesSettings } from './storyMapForm.js';
import './StoryMapTool.css';

/** Width of the pane below which the story is hidden while the form is open: side by side / one above the other. */
const NARROW = Object.freeze({ side: 600, above: 400 });

/** Width of the story part below which the own map and timeline go under the stories instead of beside them. */
const NARROW_GEO = 600;

/** Most records of a Show for range (Current result, Story topics) offered by the record picker. */
export const RANGE_LIMIT = 500;

/** The choices of Show for (27q3 Story map review, 2026-11-25). */
export const SHOW_FOR = Object.freeze(['current', 'own', 'any']);

/** Session keys: Show for and the chosen topic per story map, the Own map toggle of the View. */
const SCOPE_KEY = 'h-storymap-scope';
const OWN_MAP_KEY = 'h-storymap-own-map';

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
   * @param {function({id: number, kind: string, site: object|null}): *} [options.editPage] Viewer, List: edit a website page that shows a story map.
   * @param {HTMLElement|null} [options.headerActions] Viewer: the buttons on the header of the pane (List, Help).
   * @param {function({presetId: number}): void} [options.onClose] Editor: closed (unsaved changes asked first).
   * @param {function({presetId: number, title: string, topic: number, presets: Array}): Promise<*>} [options.publish]
   *        Publish the story map with a story topic as a web page.
   * @param {function(HTMLElement): Promise<object>} [options.mountOwnMap] Mount a Map of its own (its public API).
   * @param {function(HTMLElement): Promise<object>} [options.mountOwnTimeline] Mount a Timeline of its own.
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
    // Show for and the chosen story topic
    this.scope = 'current';
    this.topicId = 0;
    this.rangeIds = null;
    // the editor always has its own map and timeline; the View when Own map is on
    this.ownMapOn = this.mode === 'editor' || readSession(OWN_MAP_KEY) === true;
    this.ownMap = null;
    this.ownTimeline = null;
    this._timeline = storyTimelineSync(() => this.ownTimeline);
  }

  /**
   * Toolbar, form (closed) and the story.
   *
   * @returns {Promise<StoryMapTool>}
   */
  async render() {
    this.dbdefs = await this.tool.getDbDefs().catch(() => null);
    // Browse of the record picker of Show for
    this._services = (await this.tool.formServices?.().catch(() => null)) || null;
    this.container.classList.add('h-storymap-tool', `is-${this.mode}`);
    // the editor: the header with Help | Close (27q3 §2.3, review 3)
    this.header = this.mode === 'editor'
      ? createSourceHeader({
        title: '',
        closeTitle: 'Close the story map editor',
        onClose: () => void this.close(),
        actions: [this.tool.openManual ? { icon: 'fa-circle-question', label: 'Help of the story map', run: () => this.tool.openManual('storymap') } : null]
      })
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
    // the editor: the form on the west of HCardinalLayout whatever the orientation of the stories (review 2026-11-25)
    if (this.mode === 'editor') this.main.append(this.view);
    else this.main.append(this.formPane, this.view);
    // the own map above the own timeline (Story map review, 2026-11-25)
    this.geo = element('div', 'h-storymap-tool-geo');
    this.mapHost = element('div', 'h-storymap-tool-map');
    this.timelineHost = element('div', 'h-storymap-tool-timeline');
    this.geo.append(this.mapHost, this.timelineHost);
    this.geo.hidden = true;
    this.content = element('div', 'h-storymap-tool-content');
    this.content.append(this.main, this.geo);
    if (this.mode === 'editor') {
      this.layoutHost = element('div', 'h-storymap-tool-layout');
      this.container.replaceChildren(this.header.element, this.toolbar, this.layoutHost);
      this.layout = new HCardinalLayout(this.layoutHost, { westSize: 420, minWest: 300, minCenterWidth: 320 });
      this.layout.setContent('west', this.formPane);
      this.layout.setContent('center', this.content);
      this._syncWest();
    } else {
      this.container.replaceChildren(...(this.header ? [this.header.element] : []), this.toolbar, this.content);
    }
    await Promise.all([this._loadPresets(), this._loadTemplates()]);
    this._renderToolbar();
    this._mountStory();
    if (this.ownMapOn) void this._setOwnMap(true);
    if (typeof ResizeObserver === 'function') {
      this._resize = new ResizeObserver(() => this._layout());
      this._resize.observe(this.container);
      // the divider of the editor changes the width of the story without a resize of the tool
      if (this.layout) this._resize.observe(this.content);
    }
    this._layout();
    this.state = 'rendered';
    return this;
  }

  /**
   * Open a story map: Show for and the topic kept for it in this session. `showSource`: Show for = Story topics, its
   * records become the result of Explorer and the first one is shown.
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
    const kept = readSession(`${SCOPE_KEY}-${preset.id}`) || {};
    this.scope = showSource && this._hasQuery() ? 'own' : this._validScope(kept.scope);
    this.topicId = showSource ? 0 : Number(kept.topic) || 0;
    if (!this.presets.some((item) => item.id === preset.id)) this.presets.push({ id: preset.id, title: preset.title });
    // the editor: the form is always open (Story map review item 1, 2026-11-25)
    if (this.mode === 'editor') this.editing = true;
    this._renderToolbar();
    if (this.mode === 'editor' && this.formPane.hidden) await this._toggleForm();
    else if (!this.formPane.hidden) await this._renderForm({ read: false });
    this._layout();
    // the story of the story map before goes
    await this.story?.clear();
    await this.story?.setSettings(this.applied, { sourceQuery: null, reload: true });
    if (showSource && preset.query != null && this.tool.showRecords) await this.tool.showRecords(preset.query, preset.title);
    await this._refreshRange();
    // opened from the CMS designer: the first story topic is shown
    if (showSource && !this.topicId && this.rangeIds?.length) await this._showTopic(this.rangeIds[0]);
    return true;
  }

  /** Explorer's result changed: the range of Show for = Current result (no story is chosen by it). */
  async setDataSource(source) {
    this.source = source;
    if (this.scope === 'current') await this._refreshRange();
  }

  /**
   * Explorer's selection changed: not followed (Story map review item 6, 2026-11-25): the story is chosen in Show for.
   *
   * @returns {Promise<void>}
   */
  async setSelection() {}

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
      this.content.hidden = false;
      this._renderHeaderActions();
      return;
    }
    if (this.list || this.mode !== 'viewer') return;
    // the List only: no story, no own map or timeline (review 2026-11-25)
    this.toolbar.hidden = true;
    this.content.hidden = true;
    this.listHost = element('div', 'h-storymap-tool-list-mode');
    this.container.append(this.listHost);
    const design = Boolean(this.tool.openDesigner);
    this.list = new HPresentationList().attach(this.listHost, {
      apiClient: this.tool.apiClient,
      dbdefs: this.dbdefs,
      kinds: ['storymap'],
      title: 'Story maps',
      newLabel: 'New story map',
      // New, Help and View are on the header of the pane (27q3 review 3)
      showBar: false,
      selectHint: 'Select a story map in the list',
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
    // after this.list is set: the buttons of the List
    this._renderHeaderActions();
    await this.list.render();
  }

  /** @returns {Promise<void>} */
  async destroy() {
    await this.list?.destroy();
    this.list = null;
    this.tool.headerActions?.replaceChildren();
    this._resize?.disconnect();
    clearTimeout(this._applyTimer);
    this.picker?.destroy?.();
    this.picker = null;
    await this.form?.destroy();
    await this.story?.destroy();
    this.story = null;
    await this._destroyOwnMap();
    this.layout?.destroy();
    this.layout = null;
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
    const query = preset?.query == null ? '' : (typeof preset.query === 'string' ? preset.query : JSON.stringify(preset.query));
    const settings = normalizeStoryMapSettings(preset?.configuration || null);
    // an older story map: the topic type of its query (Story map review, 2026-11-25)
    if (!settings.story.topicType) settings.story.topicType = storyTopicType(settings, query || null);
    return { title: preset?.title || '', query, settings };
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
        // a new story map is public, as a new crosstab (27q3 review 3); Properties changes it
        : await this.tool.apiClient.post('/presentation/0', { body: { rec_RecTypeID: ids.rectype, rec_NonOwnerVisibility: 'public', details } });
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

  // ------------------------------------------------------------------ Show for (Story map review, 2026-11-25)

  /** @private The record type of the story topics (the form's value, else the stored one, else the query's type). */
  _topicType() {
    return storyTopicType(this.values.settings, this.values.query || null);
  }

  /** @private The story map has a query of story topics. */
  _hasQuery() {
    return String(this.values.query || '').trim() !== '';
  }

  /** @private A Show for choice that is offered now (Story topics only with a query). */
  _validScope(scope) {
    if (scope === 'own' && !this._hasQuery()) return 'current';
    return SHOW_FOR.includes(scope) ? scope : 'current';
  }

  /** @private Keep Show for and the topic of this story map in the session. */
  _keepScope() {
    if (this.preset?.id) writeSession(`${SCOPE_KEY}-${this.preset.id}`, { scope: this.scope, topic: this.topicId || 0 });
  }

  /**
   * @private The query of the range of Show for, of the topic type only: Current result or the Story topics query;
   * null for Any.
   */
  _rangeQuery() {
    const type = this._topicType();
    const query = this.scope === 'current'
      ? (this.source?.request?.q ?? this.tool.getDataSource?.()?.request?.q ?? null)
      : (this.scope === 'own' && this._hasQuery() ? parseQuery(this.values.query.trim()) : null);
    if (this.scope === 'any' || query == null || query === '') return null;
    return withType(query, type);
  }

  /**
   * @private The ids of the range (Current result, Story topics), at most RANGE_LIMIT; null for Any. Then the picker
   * is made again; a range of one record shows its story when no topic is chosen.
   * @returns {Promise<void>}
   */
  async _refreshRange() {
    const serial = (this._rangeSerial = (this._rangeSerial || 0) + 1);
    let ids = null;
    if (this.scope !== 'any') {
      const query = this._rangeQuery();
      ids = query == null ? [] : await this.service.queryIds(query, RANGE_LIMIT).catch(() => []);
    }
    if (serial !== this._rangeSerial) return;
    this.rangeIds = ids;
    this._renderPicker();
    if (!this.topicId && ids?.length === 1) {
      await this._showTopic(ids[0]);
      return;
    }
    if (this.topicId && this.story?.story?.source?.id !== this.topicId) await this._showTopic(this.topicId);
  }

  /** @private Show for: the select of the range and the record picker beside it. */
  _scopeBox() {
    const type = this._topicType();
    const typeName = type ? (this.dbdefs?.rectypeName?.(type) || `#${type}`) : '';
    const choices = [
      ['current', 'Current result'],
      ...(this._hasQuery() ? [['own', 'Story topics']] : []),
      ['any', typeName ? `${$HR('Any')} ${typeName}` : 'Any record']
    ];
    this.scope = this._validScope(this.scope);
    const box = element('span', 'h-storymap-tool-scope');
    box.append(createScopeSelect({
      choices,
      value: this.scope,
      label: 'Show for',
      title: 'The records whose story can be chosen',
      onChange: (value) => {
        this.scope = this._validScope(value);
        this._keepScope();
        void this._refreshRange();
      }
    }));
    this.pickerHost = element('span', 'h-storymap-tool-picker');
    box.append(this.pickerHost);
    return box;
  }

  /**
   * @private The record picker (HInputResource) of the topic type in the range of Show for; Browse is the record
   * manager of Explorer.
   */
  _renderPicker() {
    if (!this.pickerHost) return;
    this.picker?.destroy?.();
    this.picker = null;
    this.pickerHost.replaceChildren();
    const type = this._topicType();
    if (!this.preset && !this.editing) return;
    if (!type) {
      const note = element('span', 'h-storymap-tool-picker-note');
      note.textContent = $HR('Choose the story topic record type in the configuration');
      this.pickerHost.append(note);
      return;
    }
    const ids = this.rangeIds;
    const query = Array.isArray(ids) ? [{ ids: ids.length ? ids.join(',') : '0' }] : [];
    const services = this._services || { apiClient: this.tool.apiClient, dbdefs: this.dbdefs };
    const host = element('span', 'h-storymap-tool-picker-input');
    this.pickerHost.append(host);
    this.picker = createHInput('resource', host, {
      suppressLabel: true,
      clearButton: false,
      value: this.topicId || null,
      apiClient: this.tool.apiClient,
      dbdefs: this.dbdefs,
      targetTypes: [type],
      source: new RecordTitleSource(this.tool.apiClient, { rtyId: type, query }),
      pointerMode: 'dropdown',
      showBrowse: typeof services.browseRecords === 'function',
      showAdd: false,
      // Browse: the records of the range only (Any: all of the type)
      browseFilter: Array.isArray(ids) ? query : null,
      ...(typeof services.browseRecords === 'function' ? { browseRecords: services.browseRecords } : {}),
      ...(typeof services.viewRecord === 'function' ? { viewRecord: services.viewRecord } : {})
    });
    host.addEventListener('h-input-change', () => {
      const id = Number([this.picker?.getValue()].flat()[0]) || 0;
      if (id && id !== this.topicId) void this._showTopic(id);
    });
    if (Array.isArray(ids) && !ids.length) host.title = $HR('No records of this type in the chosen range');
  }

  /**
   * @private Show the story of a topic (the picker shows it, Show for keeps it). It is the selection of HStoryMap, so a
   * change of the settings keeps it.
   */
  async _showTopic(id) {
    this.topicId = Number(id) || 0;
    this._keepScope();
    if (this.picker && Number([this.picker.getValue()].flat()[0]) !== this.topicId) this.picker.setValue(this.topicId || null);
    await this.story?.setSelection(this.topicId ? [this.topicId] : []);
    this._syncTimeline(this.story?.items?.[this.story.current] || null);
  }

  /** @private Refresh: the story again with fresh cards and places. */
  async _reloadStory() {
    if (this.mode === 'editor') this._readForm();
    if (this.topicId) await this.story?.refresh();
    else await this._refreshRange();
  }

  // ------------------------------------------------------------------ own map and timeline

  /**
   * @private The own map and timeline on / off. Off: the story goes back to Explorer's Map module.
   * @param {boolean} on
   * @returns {Promise<void>}
   */
  async _setOwnMap(on) {
    const want = Boolean(on) && typeof this.tool.mountOwnMap === 'function';
    if (this.mode === 'viewer') writeSession(OWN_MAP_KEY, Boolean(on));
    await this.binding?.clearStory?.().catch(() => {});
    if (!want) {
      this.ownMapOn = false;
      await this._destroyOwnMap();
    } else {
      this.ownMapOn = true;
      this.geo.hidden = false;
      if (!this.ownMap) {
        this._ownMapReady = this._mountOwn();
        await this._ownMapReady;
      }
    }
    this.ownMapButton?.classList.toggle('is-active', this.ownMapOn);
    this.ownMapButton?.setAttribute('aria-pressed', String(this.ownMapOn));
    this._layout();
    // the background and the story on the map now used
    await this.binding?.showBackground?.(this.applied.map.background);
    if (this.story?.story) await this.story.refresh();
    this._timeline.reset();
    this._syncTimeline();
  }

  /** @private Mount the own map and timeline (Explorer gives the direct entries). */
  async _mountOwn() {
    try {
      this.ownMap = await this.tool.mountOwnMap(this.mapHost);
    } catch (error) {
      console.warn('Story map: own map', error);
      this.ownMap = null;
    }
    if (typeof this.tool.mountOwnTimeline === 'function') {
      try {
        this.ownTimeline = await this.tool.mountOwnTimeline(this.timelineHost);
      } catch (error) {
        console.warn('Story map: own timeline', error);
        this.ownTimeline = null;
      }
    }
    this.timelineHost.hidden = !this.ownTimeline;
  }

  /** @private Destroy the own map and timeline. */
  async _destroyOwnMap() {
    const map = this.ownMap;
    const timeline = this.ownTimeline;
    this.ownMap = null;
    this.ownTimeline = null;
    this._ownMapReady = null;
    await Promise.resolve(timeline?.destroy?.()).catch(() => {});
    await Promise.resolve(map?.destroy?.()).catch(() => {});
    this.mapHost?.replaceChildren();
    this.timelineHost?.replaceChildren();
    if (this.geo) this.geo.hidden = true;
  }

  /** @private The map of the story: the own one (when on), else Explorer's Map module. */
  async _mapApi() {
    if (this.ownMapOn) {
      await this._ownMapReady;
      return this.ownMap;
    }
    return this.tool.getMap?.() ?? null;
  }

  /**
   * @private The own timeline: the elements of the shown story (a new story: its query), the current element selected.
   * @param {object} [item] The current item of the story (`{kind, element}`).
   */
  _syncTimeline(item = null) {
    this._timeline.sync(this.story?.story || null, item);
  }

  // ------------------------------------------------------------------ story

  /**
   * @private The story widget over the applied settings, on the own map or Explorer's Map module. Explorer's selection
   * is not given to it: the story is chosen in Show for (Story map review, 2026-11-25).
   */
  _mountStory() {
    this.binding = new StoryMapBinding({ getMap: () => this._mapApi(), settings: this.applied, title: $HR('Story map') });
    this.story = new HStoryMap().attach(this.view, {
      service: this.service,
      binding: this.binding,
      settings: this.applied,
      language: this.language,
      onCurrent: (index, item) => this._syncTimeline(item)
    }).render();
    this.source = this.tool.getDataSource?.() || null;
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
    const newQuery = this.pending.has(MANUAL_APPLY.query);
    this.pending.clear();
    this._syncApply();
    this.applied = structuredClone(this.values.settings);
    this._layout();
    await this.story?.setSettings(this.applied, { sourceQuery: null, reload: queries });
    // a new query of the story topics: Show for offers it (Run is gone, Story map review 2026-11-25)
    if (newQuery) {
      this._renderToolbar();
      await this._refreshRange();
    }
  }

  // ------------------------------------------------------------------ toolbar and layout

  /**
   * @private The toolbar: the viewer's New | selector | Edit | Own map ‖ Show for | Refresh (the slots of the editor, as
   * the Crosstabs pane, 27q3 review 3; Show for and Own map: Story map review 2026-11-25), or the editor's.
   */
  _renderToolbar() {
    if (this.mode === 'editor') {
      this._renderEditorToolbar();
      return;
    }
    // New and Edit: the editor over the whole screen (not on a website page)
    const design = Boolean(this.tool.openDesigner);
    const made = renderPresentationToolbar(this.toolbar, {
      new: design ? { label: 'New story map', title: 'A new story map in the editor (full screen)', run: () => void this._design(0) } : null,
      selector: {
        icon: 'fa-book-open', label: this.preset?.title || $HR('Select story map'), title: 'Story map', disabled: !this.presets.length,
        run: (anchor) => togglePresentationList(anchor, this.presets, {
          current: this.preset?.id,
          onSelect: (item) => { if (item.id !== this.preset?.id) void this.openPreset(item.id); }
        })
      },
      edit: design ? {
        title: 'Open the story map in the editor (full screen)', disabled: !this.preset, run: () => void this._design(this.preset?.id || 0)
      } : null,
      scope: this.preset ? this._scopeBox() : null,
      refresh: { title: 'Reload the story', disabled: !this.preset, run: () => void this._reloadStory() },
      publish: this.tool.publish ? {
        title: 'Publish the story map as a web page, with the story topic chosen in Show for', disabled: !this.preset,
        run: () => void this._publish()
      } : null
    });
    // Own map: the story on a map and timeline of its own (not Explorer's Map module)
    this.ownMapButton = null;
    if (typeof this.tool.mountOwnMap === 'function') {
      const anchor = made.edit || made.selector;
      const button = presentationButton(this.toolbar, {
        icon: 'fa-map', label: 'Own map', title: 'Show the story on its own map and timeline', caption: false,
        run: () => void this._setOwnMap(!this.ownMapOn)
      });
      button.classList.toggle('is-active', this.ownMapOn);
      button.setAttribute('aria-pressed', String(this.ownMapOn));
      anchor?.after(button);
      this.ownMapButton = button;
    }
    this._renderHeaderActions();
    if (this.preset) this._renderPicker();
  }

  /** @private Editor: New | selector | Properties | Save | Save as ‖ Show for | Refresh (Help | Close on the header). */
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
      // Show for and Refresh as in the View (Run is gone, Story map review 2026-11-25)
      scope: active ? this._scopeBox() : null,
      refresh: { title: 'Reload the story', disabled: !active, run: () => void this._reloadStory() },
      // Publish (review 2026-11-25): saved first, the chosen story topic
      publish: this.tool.publish ? {
        title: 'Publish the story map as a web page, with the story topic chosen in Show for', disabled: !active,
        run: () => void this._publish()
      } : null
    });
    if (active) this._renderPicker();
  }

  /**
   * @private Viewer: the buttons on the header of the pane, the mode switch last (as the Crosstabs pane, 27q3 review 3):
   * viewer Help | List, List New | Help | View.
   */
  _renderHeaderActions() {
    if (this.mode !== 'viewer') return;
    const design = Boolean(this.tool.openDesigner);
    renderHeaderActions(this.tool.headerActions, [
      this.list && design ? { icon: 'fa-circle-plus', label: 'New story map', run: () => void this._design(0) } : null,
      this.tool.openManual ? { icon: 'fa-circle-question', label: 'Help of the story map', run: () => this.tool.openManual('storymap') } : null,
      design ? {
        icon: this.list ? 'fa-book-open' : 'fa-list-ul',
        label: this.list ? 'Back to the story map' : 'List of the story maps and their published pages',
        run: () => void this.toggleList()
      } : null
    ]);
  }

  /**
   * @private Publish (review 2026-11-25): the story map as a web page with the story topic chosen in Show for; the
   * editor saves it first. Without a chosen topic: a message only.
   */
  async _publish() {
    if (!this.tool.publish) return;
    if (this.mode === 'editor' && (this._dirty || !this.preset?.id) && !(await this._save())) return;
    if (!this.preset?.id) return;
    if (!this.topicId) {
      HMsg.showMsgDlg?.($HR('Choose a story topic in Show for first: the published page shows its story'),
        { title: $HR('Publish story map') });
      return;
    }
    await this.tool.publish({
      presetId: this.preset.id, title: this.preset.title, topic: this.topicId, presets: this.presets
    });
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
    this.scope = 'current';
    this.topicId = 0;
    this.rangeIds = null;
    clearTimeout(this._applyTimer);
    await this.story?.clear();
    await this.form?.destroy();
    this.form = null;
    this.formHost.replaceChildren();
    this.formFooter.replaceChildren();
    this.formPane.hidden = true;
    this._syncWest();
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
    this._syncWest();
    this._layout();
  }

  /** @private Editor: the west region of the layout is there while the form is open. */
  _syncWest() {
    if (!this.layout) return;
    if (this.formPane.hidden) this.layout.hide('west');
    else this.layout.show('west');
  }

  /**
   * @private The viewer: form and story side by side for vertical stories, one above the other for horizontal ones; the
   * story is hidden while the form is open in a narrow pane. The editor: the form is on the west of its layout.
   */
  _layout() {
    if (!this.main) return;
    const above = this.applied.presentation.layout === 'horizontal';
    const width = this.container.clientWidth || this.container.getBoundingClientRect?.().width || 0;
    const narrow = width > 0 && width < (above ? NARROW.above : NARROW.side);
    this.main.classList.toggle('is-above', above);
    this.main.classList.toggle('is-side', !above);
    this.view.hidden = !this.layout && !this.formPane.hidden && narrow;
    // the own map and timeline follow the stories: beside vertical ones, under horizontal ones; under them too when the
    // place of the story is too narrow for the map beside (review 2026-11-25)
    if (this.geo) {
      const room = this.layout ? (this.content.clientWidth || 0) : width;
      const beside = !above && !(room > 0 && room < NARROW_GEO);
      this.geo.hidden = !this.ownMapOn;
      this.content.classList.toggle('has-geo', !this.geo.hidden);
      this.content.classList.toggle('is-geo-beside', beside);
      this.content.classList.toggle('is-geo-below', !beside);
    }
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
      form: storyMapForm({
        ids, templates: this.templates, dateFields: this._dateFields(this._formType),
        rectypes: (this.dbdefs?.rectypes?.() || []).slice().sort((x, y) => String(x.name).localeCompare(String(y.name)))
      }),
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
    // another topic type: Show for offers its records, the topic chosen before goes
    if (name === 'topicType') {
      this._readForm();
      this.topicId = 0;
      void this.story?.clear();
      this._renderToolbar();
      void this._refreshRange();
    }
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

/**
 * A query restricted to one record type: a JSON query gets `{t}` added, a text query `t:<type>`.
 *
 * @param {*} query
 * @param {number|null} type
 * @returns {*}
 */
export function withType(query, type) {
  if (!type || query == null || query === '') return query;
  if (typeof query === 'string') return `${query.trim()} t:${type}`;
  if (Array.isArray(query)) return [...query, { t: String(type) }];
  return [query, { t: String(type) }];
}

/** A value kept in the session storage (null when there is none or it can not be read). */
function readSession(key) {
  try {
    const text = globalThis.sessionStorage?.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Keep a value in the session storage. */
function writeSession(key, value) {
  try {
    globalThis.sessionStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // no session storage (a private window)
  }
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
