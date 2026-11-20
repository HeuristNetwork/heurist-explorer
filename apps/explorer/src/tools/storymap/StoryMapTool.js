/**
 * @file StoryMapTool.js
 * @brief Story map tool of Explorer (a pane module, plan 27q1 §7): the viewer and the editor of story maps.
 *
 * A story map is a Presentation set (2-1112) of kind StoryMap: its name, the source query (2-12) and the settings
 * (Configuration 2-1187, storyMapModel.js). The toolbar chooses one (New, Save, Save as, Refresh, Settings,
 * Source records); the settings form sits above the story and is applied at once (Apply) or stored (Save). The story is
 * HStoryMap: the story of the last record selected in Explorer (or of the only record of the result), its current
 * element on Explorer's Map module (StoryMapBinding over the Map public API). Opened by the CMS designer with
 * `?tool=storymap&preset=<id>` (ExplorerApplication.openStoryMap): the preset, its source records as the result and
 * the first record selected.
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
import { HStoryMap } from '#shared/widgets/storymap/HStoryMap.js';
import { StoryMapBinding } from '#shared/widgets/storymap/storyMapBinding.js';
import { StoryMapService, presetFromRecords } from '#shared/widgets/storymap/storyMapService.js';
import {
  DEFAULT_PATH, STORY_DISTINCT, STORY_END_MODES, STORY_LAYOUTS, STORY_START_MODES, normalizeStoryMapSettings
} from '#shared/widgets/storymap/storyMapModel.js';
import { HRuleBuilder, describeExpansionRule } from '../../widgets/query-source/helpers/HRuleBuilder.js';
import './StoryMapTool.css';

/** Captions of the choices of the form. */
const CAPTIONS = Object.freeze({
  list: 'Vertical list', horizontal: 'Horizontal', tabs: 'Tabs', carousel: 'Carousel', slideshow: 'Slideshow',
  highlight: 'Highlight the current element', veil: 'Veil the others', none: 'None',
  inline: 'As the first / last element', tab: 'As a tab', header: 'Above the story', footer: 'Below the story',
  date: 'Date', rule: 'As found', field: 'Field'
});

/** Story map tool widget. */
export class StoryMapTool extends HBaseWidget {
  /**
   * @param {object} options Tool options.
   * @param {object} options.apiClient API client of Explorer (writes).
   * @param {function(): Promise<object>} options.getDbDefs Database definitions (HDbDefs).
   * @param {function(): object|null} options.getDataSource Current DataSource.
   * @param {function(): number[]} options.getSelection Selected record ids.
   * @param {function(): (object|null|Promise<object|null>)} options.getMap Public API of Explorer's Map module.
   * @param {function(): Array<{id: number, title: string}>} [options.getQuerySources] Query sources (map overview).
   * @param {function(object, string): Promise<*>} [options.showRecords] Show a query as the result of Explorer.
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
  }

  /**
   * Toolbar, settings form (closed) and the story.
   *
   * @returns {Promise<StoryMapTool>}
   */
  async render() {
    this.dbdefs = await this.tool.getDbDefs().catch(() => null);
    this.container.classList.add('h-storymap-tool');
    this.toolbar = element('div', 'h-storymap-tool-toolbar');
    this.form = element('div', 'h-storymap-tool-form');
    this.form.hidden = true;
    this.view = element('div', 'h-storymap-tool-view');
    this.container.replaceChildren(this.toolbar, this.form, this.view);
    await Promise.all([this._loadPresets(), this._loadTemplates()]);
    this._renderToolbar();
    this._mountStory();
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
    if (!this.presets.some((item) => item.id === preset.id)) this.presets.push({ id: preset.id, title: preset.title });
    this._renderToolbar();
    if (!this.form.hidden) this._renderForm();
    await this._applyStory();
    if (showSource && preset.query != null && this.tool.showRecords) {
      await this.tool.showRecords(preset.query, preset.title);
    }
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
    await this.story?.destroy();
    this.story = null;
    await super.destroy();
  }

  // ------------------------------------------------------------------ data

  /** @private Field and term ids of the Presentation set. */
  _ids() {
    const id = (code) => Number(this.dbdefs?.dbconst?.(code)) || 0;
    return {
      rectype: id('RT_PRESENTATION_SET'), name: id('DT_NAME'), query: id('DT_QUERY_STRING'),
      configuration: id('DT_CONFIGURATION'), type: id('DT_PRESENTATION_TYPE'), storymap: id('TRM_PRESENTATION_STORYMAP')
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

  /** @private The card templates (reports marked "Single record (card)"). */
  async _loadTemplates() {
    const answer = await this.tool.apiClient.get('/report', { query: { fields: 'rec_ID', limit: 5000 } }).catch(() => null);
    this.templates = Object.values((answer?.data ?? answer)?.meta?.items ?? {})
      .filter((report) => report.id != null)
      .map((report) => ({ id: Number(report.id), title: report.title || report.file || `#${report.id}`, card: Boolean(report.isCardView) }))
      .sort((a, b) => Number(b.card) - Number(a.card) || a.title.localeCompare(b.title));
  }

  /** @private Values of the form from a preset (or a new one). */
  _valuesOf(preset) {
    return {
      title: preset?.title || '',
      query: preset?.query == null ? '' : (typeof preset.query === 'string' ? preset.query : JSON.stringify(preset.query)),
      settings: normalizeStoryMapSettings(preset?.configuration || { map: { patterns: [DEFAULT_PATH, { type: 'points' }] } })
    };
  }

  /** @private The stored configuration: the settings without the defaults that are not needed. */
  _configuration() {
    const settings = structuredClone(this.values.settings);
    if (!settings.actions) delete settings.actions;
    return JSON.stringify(settings);
  }

  /** @private Save the story map (as a new one: `asNew`). */
  async _save({ asNew = false } = {}) {
    this._readForm();
    const ids = this._ids();
    if (!ids.rectype || !ids.configuration || !ids.type) {
      HMsg.showMsgErr?.($HR('This database has no record type Presentation set (2-1112)'));
      return;
    }
    let title = this.values.title.trim();
    if (asNew || !title) {
      title = (await askName(title || $HR('New story map'))) || '';
      if (!title) return;
    }
    const details = {
      [ids.name]: [title],
      [ids.type]: [ids.storymap],
      [ids.configuration]: [this._configuration()],
      [ids.query]: this.values.query.trim() ? [this.values.query.trim()] : []
    };
    try {
      const id = !asNew && this.preset?.id ? this.preset.id : 0;
      const answer = id
        ? await this.tool.apiClient.request(`/presentation/${id}`, { method: 'PATCH', body: { details } })
        : await this.tool.apiClient.post('/presentation/0', { body: { rec_RecTypeID: ids.rectype, details } });
      const saved = Number((answer?.data ?? answer)?.records?.[0]?.rec_ID ?? (answer?.data ?? answer)?.recordId ?? id) || 0;
      this._dirty = false;
      await this._loadPresets();
      if (saved) await this.openPreset(saved);
      HMsg.showMsgFlash?.($HR('Saved'), { showDelay: 1500 });
    } catch (error) {
      HMsg.showMsgErr?.(errorText(error));
    }
  }

  // ------------------------------------------------------------------ story

  /** @private The story widget over the current values. */
  _mountStory() {
    this.binding = new StoryMapBinding({ getMap: this.tool.getMap, settings: this.values.settings, title: $HR('Story map') });
    this.story = new HStoryMap().attach(this.view, {
      service: this.service,
      binding: this.binding,
      settings: this.values.settings,
      language: this.language
    }).render();
    const selection = this.tool.getSelection?.() || [];
    if (selection.length) void this.story.setSelection(selection);
    const source = this.tool.getDataSource?.();
    if (source) void this.setDataSource(source);
  }

  /** @private New settings for the story (Apply, a preset opened). */
  async _applyStory() {
    let overviewQuery = null;
    const overview = this.values.settings.map.overview;
    if (overview?.query) overviewQuery = overview.query;
    else if (overview?.querySource) overviewQuery = await this.service.querySourceQuery(overview.querySource).catch(() => null);
    await this.story?.setSettings(this.values.settings, { sourceQuery: null, overviewQuery });
  }

  // ------------------------------------------------------------------ toolbar

  /** @private Story map selector and the buttons. */
  _renderToolbar() {
    const select = element('select', 'h-select h-storymap-tool-preset');
    select.title = $HR('Story map');
    addOptions(select, [['', $HR('(new story map)')], ...this.presets.map((item) => [String(item.id), item.title])]);
    select.value = this.preset?.id ? String(this.preset.id) : '';
    select.addEventListener('change', () => {
      if (select.value) void this.openPreset(Number(select.value));
      else this._new();
    });
    const buttons = [
      button('fa-gear', 'Settings', () => this._toggleForm()),
      button('fa-floppy-disk', 'Save', () => void this._save()),
      button('fa-copy', 'Save as', () => void this._save({ asNew: true })),
      button('fa-rotate', 'Refresh', () => void this._refresh()),
      button('fa-list', 'Source records', () => void this._showSource())
    ];
    this.toolbar.replaceChildren(select, ...buttons);
  }

  /** @private A new story map: the form opens. */
  _new() {
    this.preset = null;
    this.values = this._valuesOf(null);
    this._dirty = false;
    this.form.hidden = true;
    this._toggleForm();
    void this._applyStory();
  }

  /** @private The story again with fresh cards and the story map as stored (after a change in another window). */
  async _refresh() {
    await this._loadTemplates();
    if (this.preset?.id && !this._dirty) {
      await this.openPreset(this.preset.id);
    }
    await this.story?.refresh();
  }

  /** @private The source records of the story map as the result of Explorer. */
  async _showSource() {
    this._readForm();
    const text = this.values.query.trim();
    if (!text) {
      HMsg.showMsgFlash?.($HR('The story map has no query of source records'), { showDelay: 2000 });
      return;
    }
    await this.tool.showRecords?.(parseQuery(text), this.values.title || $HR('Story map'));
  }

  // ------------------------------------------------------------------ settings form

  /** @private Show / hide the settings form. */
  _toggleForm() {
    this.form.hidden = !this.form.hidden;
    if (!this.form.hidden) this._renderForm();
  }

  /** @private The settings form (plan 27q1 §4). */
  _renderForm() {
    const settings = this.values.settings;
    const controls = {};
    this._controls = controls;
    const text = (name, value, { area = false, placeholder = '' } = {}) => {
      const input = element(area ? 'textarea' : 'input', area ? 'h-input h-storymap-tool-area' : 'h-input');
      if (!area) input.type = 'text';
      input.value = value ?? '';
      input.placeholder = placeholder;
      input.addEventListener('input', () => { this._dirty = true; });
      controls[name] = input;
      return input;
    };
    const choice = (name, value, options) => {
      const select = element('select', 'h-select');
      addOptions(select, options.map((option) => (Array.isArray(option) ? option : [option, $HR(CAPTIONS[option] || option)])));
      select.value = value == null ? '' : String(value);
      select.addEventListener('change', () => { this._dirty = true; });
      controls[name] = select;
      return select;
    };
    const check = (name, value, caption) => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = Boolean(value);
      box.addEventListener('change', () => { this._dirty = true; });
      controls[name] = box;
      const label = element('label', 'h-storymap-tool-check');
      label.append(box, document.createTextNode(` ${$HR(caption)}`));
      return label;
    };
    const templates = [['', $HR('(none)')], ...this.templates.map((item) => [String(item.id), `${item.title}${item.card ? '' : ` (${$HR('not a card')})`}`])];
    const sources = [['', $HR('(none)')], ...(this.tool.getQuerySources?.() || []).map((item) => [String(item.id), item.title])];
    const path = settings.map.patterns.find((pattern) => pattern.type === 'path') || null;
    const points = settings.map.patterns.find((pattern) => pattern.type === 'points') || null;
    const language = (texts) => texts?.def ?? '';
    const orderBy = ['date', 'rule'].includes(settings.story.order.by) ? settings.story.order.by : 'field';

    // the rule: summary and the rule builder
    this._rule = settings.story.rule ? structuredClone(settings.story.rule) : null;
    const ruleText = element('span', 'h-storymap-tool-rule');
    const showRule = () => {
      ruleText.textContent = this._rule ? (describeRule(this._rule, this.dbdefs) || JSON.stringify(this._rule.query)) : $HR('No rule: choose the story elements');
    };
    showRule();
    const editRule = button('fa-diagram-project', 'Edit rule', async () => {
      if (!this.dbdefs) return;
      const builder = new HRuleBuilder({ dbdefs: this.dbdefs, lang: this.language });
      const source = this.values.query.trim() ? { request: { q: parseQuery(this.values.query) } } : this.tool.getDataSource?.();
      const rules = await builder.setRules(this._rule ? [this._rule] : []).open({ dataSource: source || null });
      if (rules == null) return;
      this._rule = rules[0] || null;
      this._dirty = true;
      showRule();
    }, true);
    const current = button('fa-filter', 'Current filter', () => {
      const query = this.tool.getDataSource?.()?.request?.q;
      if (query != null) {
        controls.query.value = typeof query === 'string' ? query : JSON.stringify(query);
        this._dirty = true;
      }
    }, true);

    const sections = [
      section('Story map', [
        row('Name', text('title', this.values.title)),
        row('Source records', text('query', this.values.query, { area: true, placeholder: '[{"t":10}]' }), current),
        row('Story elements', ruleText, editRule),
        row('Order', choice('orderBy', orderBy, ['date', 'rule', 'field']), text('orderField', orderBy === 'field' ? settings.story.order.by : '', { placeholder: '2-9' }),
          choice('orderDir', settings.story.order.dir, [['asc', $HR('Ascending')], ['desc', $HR('Descending')]])),
        row('Element template', choice('template', settings.element.template, templates))
      ]),
      section('Presentation', [
        row('Show as', choice('layout', settings.presentation.layout, STORY_LAYOUTS)),
        row('Current element', choice('distinct', settings.presentation.distinct, STORY_DISTINCT)),
        row('Slideshow interval (ms)', text('interval', settings.presentation.interval))
      ]),
      section('Start and end', [
        row('Start (overview)', choice('startMode', settings.start.mode, STORY_START_MODES), choice('startTemplate', settings.start.template, templates)),
        row('Start text', text('startText', language(settings.start.text), { area: true, placeholder: $HR('Without a template; {title} = the record') })),
        row('End', choice('endMode', settings.end.mode, STORY_END_MODES), choice('endTemplate', settings.end.template, templates)),
        row('End text', text('endText', language(settings.end.text), { area: true }))
      ]),
      section('Messages', [
        row('Introduction', text('intro', language(settings.messages.intro), { area: true, placeholder: $HR('Select a record to see its story') })),
        row('No story found', text('empty', language(settings.messages.empty), { area: true }))
      ]),
      section('Map', [
        row('Initial set (query source)', choice('overview', settings.map.overview?.querySource ?? '', sources)),
        row('', check('path', Boolean(path), 'Connect the places: begin → transition → end')),
        row('Begin fields', text('begin', (path?.begin || DEFAULT_PATH.begin).join(', '))),
        row('Transition fields', text('transition', (path?.transition || DEFAULT_PATH.transition).join(', '))),
        row('End fields', text('end', (path?.end || DEFAULT_PATH.end).join(', '))),
        row('Places filter', text('filter', points?.filter ? JSON.stringify(points.filter) : '', { placeholder: '{"t":12}' })),
        row('Flight (ms)', text('duration', settings.map.duration)),
        row('', check('keep', settings.map.keep, 'Keep the places of the whole story on the map')),
        row('Element symbology', text('elementSymbology', settings.map.elementSymbology ? JSON.stringify(settings.map.elementSymbology) : '', { placeholder: '{"color":"#d7301f"}' })),
        row('Line symbology', text('lineSymbology', settings.map.lineSymbology ? JSON.stringify(settings.map.lineSymbology) : '', { placeholder: '{"color":"#d7301f","weight":3}' }))
      ])
    ];
    const apply = button('fa-check', 'Apply', () => {
      this._readForm();
      void this._applyStory();
    }, true);
    const footer = element('div', 'h-storymap-tool-form-footer');
    footer.append(apply);
    this.form.replaceChildren(...sections, footer);
  }

  /** @private The values of the form into `this.values`. */
  _readForm() {
    const controls = this._controls;
    if (!controls || this.form.hidden) return;
    const value = (name) => String(controls[name]?.value ?? '').trim();
    const texts = (name) => (value(name) ? { def: value(name) } : {});
    const json = (name) => {
      if (!value(name)) return null;
      try {
        return JSON.parse(value(name));
      } catch {
        HMsg.showMsgFlash?.(`${$HR('Not valid JSON')}: ${name}`, { showDelay: 2000 });
        return null;
      }
    };
    const list = (name) => value(name).split(/[\s,]+/).filter(Boolean);
    const orderBy = value('orderBy') === 'field' ? (value('orderField') || 'date') : value('orderBy');
    const patterns = [];
    if (controls.path?.checked) patterns.push({ type: 'path', begin: list('begin'), transition: list('transition'), end: list('end') });
    patterns.push({ type: 'points', filter: json('filter') });
    this.values = {
      title: value('title'),
      query: value('query'),
      settings: normalizeStoryMapSettings({
        story: { rule: this._rule, order: { by: orderBy, dir: value('orderDir') } },
        element: { template: Number(value('template')) || null },
        start: { mode: value('startMode'), template: Number(value('startTemplate')) || null, text: texts('startText') },
        end: { mode: value('endMode'), template: Number(value('endTemplate')) || null, text: texts('endText') },
        presentation: { layout: value('layout'), distinct: value('distinct'), interval: Number(value('interval')) || 5000 },
        messages: { intro: texts('intro'), empty: texts('empty') },
        map: {
          overview: Number(value('overview')) > 0 ? { querySource: Number(value('overview')) } : null,
          patterns,
          elementSymbology: json('elementSymbology'),
          lineSymbology: json('lineSymbology'),
          duration: Number(value('duration')),
          keep: controls.keep?.checked === true,
          layers: this.values.settings.map.layers
        },
        actions: this.values.settings.actions
      })
    };
  }
}

/** A summary of a rule (HRuleBuilder's describer). */
function describeRule(rule, dbdefs) {
  try {
    return describeExpansionRule?.(rule, dbdefs) || '';
  } catch {
    return '';
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

/** Ask the name of a story map (OK / Cancel); resolves to the name or null. */
function askName(value) {
  return new Promise((resolve) => {
    const id = `h-storymap-name-${Date.now()}`;
    const input = element('input', 'h-input h-storymap-tool-name');
    input.type = 'text';
    input.value = value || '';
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      HMsg.closeMsgDlg(id);
      resolve(result);
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(input.value.trim() || null);
    });
    HMsg.showMsgDlg(input, {
      dialogId: id,
      title: $HR('Name of the story map'),
      buttons: [
        { label: $HR('OK'), class: 'h-btn h-btn-primary', onClick: () => finish(input.value.trim() || null) },
        { label: $HR('Cancel'), class: 'h-btn', onClick: () => finish(null) }
      ],
      onClose: () => finish(null)
    });
    input.focus?.();
  });
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** A form section with a legend. */
function section(title, rows) {
  const box = element('fieldset', 'h-storymap-tool-section');
  const legend = document.createElement('legend');
  legend.textContent = $HR(title);
  box.append(legend, ...rows);
  return box;
}

/** A labelled row of controls. */
function row(text, ...controls) {
  const box = element('div', 'h-storymap-tool-row');
  const caption = element('span', 'h-storymap-tool-label');
  caption.textContent = text ? $HR(text) : '';
  box.append(caption, ...controls);
  return box;
}

/** A toolbar button with an icon (and its caption: `withText`). */
function button(icon, title, onClick, withText = false) {
  const node = element('button', 'h-btn h-compact');
  node.type = 'button';
  node.title = $HR(title);
  const glyph = element('i', `fa-solid ${icon}`);
  glyph.setAttribute('aria-hidden', 'true');
  node.append(glyph);
  if (withText) node.append(document.createTextNode(` ${$HR(title)}`));
  else node.setAttribute('aria-label', node.title);
  node.addEventListener('click', onClick);
  return node;
}

/** Append `[value, text]` options to a select. */
function addOptions(parent, options) {
  for (const [value, text] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    parent.append(option);
  }
}

/** Text of an error of the API. */
function errorText(error) {
  return error?.payload?.message || error?.message || String(error);
}
