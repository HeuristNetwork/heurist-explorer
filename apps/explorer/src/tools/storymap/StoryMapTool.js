/**
 * @file StoryMapTool.js
 * @brief Story map tool of Explorer (a pane module, plan 27q1 §7, §15): the viewer and the editor of story maps.
 *
 * A story map is a Presentation set (2-1112) of kind StoryMap: its name, the source query (2-12, the story topics) and
 * the settings (Configuration 2-1187, storyMapModel.js). The toolbar is the one of the Report and Website managers:
 * New story | Story selector | Story editor (the form) | Record editor | Save | Delete | Run. The form (HEditForm,
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
import { askChoice, askSaveDiscard } from '#shared/ui/askChoice.js';
import { HEditForm } from '#shared/widgets/edit-form/HEditForm.js';
import { showPopover, closePopover } from '#shared/widgets/popover/popover.js';
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
   * @param {object} options.runtime `{apiBaseUrl, database, requestHeaders, accessToken, language}`.
   */
  constructor(options) {
    super();
    this.tool = options;
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
    this.container.classList.add('h-storymap-tool');
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
    this.container.replaceChildren(this.toolbar, this.main);
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

  /** @returns {Promise<void>} */
  async destroy() {
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
    const answer = await this.tool.apiClient.get('/report', { query: { fields: 'rec_ID', limit: 5000 } }).catch(() => null);
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

  /** @private Save the story map (a new one gets a name first). @returns {Promise<boolean>} Saved. */
  async _save() {
    const ids = this._ids();
    if (!ids.rectype || !ids.configuration || !ids.type) {
      HMsg.showMsgErr?.($HR('This database has no record type Presentation set (2-1112)'));
      return false;
    }
    if (!(await this._checkForm())) return false;
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
      const id = this.preset?.id || 0;
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

  /** @private Unsaved changes: Save | Discard | Cancel. @returns {Promise<boolean>} The caller may go on. */
  async _confirmLeave() {
    if (!this._dirty) return true;
    const answer = await askSaveDiscard('Story has been changed. Save changes?');
    if (answer === 'save') return this._save();
    return answer === 'discard';
  }

  /** @private Delete the story map (refused while website pages use it). */
  async _delete() {
    const id = this.preset?.id;
    if (!id) return;
    const answer = await askChoice(`${$HR('Delete the story map')} "${this.preset.title}"?`, $HR('Delete'), [['delete', $HR('Delete')]]);
    if (answer !== 'delete') return;
    try {
      await this.tool.apiClient.request(`/presentation/${id}`, { method: 'DELETE' });
    } catch (error) {
      const pages = error?.payload?.pages ?? error?.payload?.data?.pages;
      HMsg.showMsgErr?.(Array.isArray(pages) && pages.length
        ? `${$HR('The story map is used by website pages and can not be deleted')}: ${pages.map((page) => page.title || `#${page.id ?? page}`).join(', ')}`
        : errorText(error));
      return;
    }
    this.presets = this.presets.filter((item) => item.id !== id);
    this._dirty = false;
    // nothing selected: the form is cleared and closed (review 3, 2026-11-20)
    await this._new({ ask: false, open: false });
    HMsg.showMsgFlash?.($HR('Deleted'), { showDelay: 1500 });
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

  /** @private Toolbar as in the Report / Website manager. */
  _renderToolbar() {
    const bar = this.toolbar;
    bar.replaceChildren();
    tool(bar, 'fa-plus', 'New story', 'New story map', () => this._new());
    separator(bar);
    const select = element('button', 'h-btn h-storymap-tool-select');
    select.type = 'button';
    select.title = $HR('Story map');
    select.setAttribute('aria-haspopup', 'listbox');
    const icon = element('i', 'fa-solid fa-book-open');
    icon.setAttribute('aria-hidden', 'true');
    const label = element('span', 'h-storymap-tool-select-label');
    label.textContent = this.preset?.title || (this.preset ? '' : $HR('Select story map'));
    select.append(icon, label, element('span', 'h-caret'));
    select.addEventListener('click', () => this._toggleList(select));
    select.disabled = !this.presets.length;
    bar.append(select);
    // without an open or a new story map only New story (and Help) work (review 3, 2026-11-20)
    const active = Boolean(this.preset) || this.editing === true;
    this.editorButton = tool(bar, 'fa-pen-ruler', 'Story editor', 'Show or hide the configuration of the story map', () => void this._toggleForm());
    this.editorButton.classList.toggle('is-active', !this.formPane.hidden);
    this.editorButton.disabled = !active;
    // icons only (review 2, 2026-11-20)
    const record = tool(bar, 'fa-pen', 'Record editor', 'Name, owner and visibility of the story map', () => void this._editRecord(), false);
    record.disabled = !this.preset?.id || !this.tool.editRecord;
    const save = tool(bar, 'fa-floppy-disk', 'Save', 'Save the story map', () => void this._save(), false);
    save.disabled = !active;
    const remove = tool(bar, 'fa-trash-can', 'Delete', 'Delete the story map', () => void this._delete(), false);
    remove.disabled = !this.preset?.id;
    separator(bar);
    const run = tool(bar, 'fa-bolt', 'Run', 'Run the query of the story topics and show the story of the first one', () => void this._run());
    run.disabled = !active;
    const help = tool(bar, 'fa-circle-question', 'Help', 'Help of the story map', () => this.tool.openManual?.('storymap'), false);
    help.classList.add('h-storymap-tool-help');
    help.hidden = !this.tool.openManual;
  }

  /** @private The list of story maps in a popover under the selector. */
  _toggleList(anchor) {
    if (anchor.getAttribute('aria-expanded') === 'true') {
      closePopover();
      return;
    }
    const list = element('div', 'h-storymap-tool-list');
    list.setAttribute('role', 'listbox');
    for (const item of this.presets) {
      const row = element('button', 'h-storymap-tool-list-item');
      row.type = 'button';
      row.textContent = item.title;
      row.classList.toggle('is-active', item.id === this.preset?.id);
      row.addEventListener('click', async () => {
        closePopover();
        if (item.id !== this.preset?.id && (await this._confirmLeave())) await this.openPreset(item.id);
      });
      list.append(row);
    }
    if (!this.presets.length) {
      const empty = element('div', 'h-storymap-tool-list-empty');
      empty.textContent = $HR('No story maps');
      list.append(empty);
    }
    showPopover(anchor, list, { className: 'h-storymap-tool-popover' });
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

/**
 * A toolbar button as in the Report / Website manager: icon and label (the label is hidden in a narrow pane);
 * `caption: false`: the icon only.
 */
function tool(parent, icon, label, title, onClick, caption = true) {
  const node = element('button', 'h-btn h-storymap-tool-btn');
  node.type = 'button';
  node.title = $HR(title);
  node.setAttribute('aria-label', $HR(label));
  const glyph = element('i', `fa-solid ${icon}`);
  glyph.setAttribute('aria-hidden', 'true');
  node.append(glyph);
  if (caption) {
    const text = element('span', 'h-storymap-tool-label');
    text.textContent = $HR(label);
    node.append(text);
  }
  node.addEventListener('click', onClick);
  parent.append(node);
  return node;
}

/** A separator of the toolbar. */
function separator(parent) {
  const node = element('span', 'h-storymap-tool-separator');
  node.setAttribute('aria-hidden', 'true');
  parent.append(node);
}

/** Text of an error of the API. */
function errorText(error) {
  return error?.payload?.message || error?.message || String(error);
}
