/**
 * @file HStoryMap.js
 * @brief The story map (plan 27q1 §5, §15): the story of one topic in an HRecordList without header and tools —
 *        Vertical = Extended view, Horizontal = Row, Carousel = Full record view with prev / next, Tabs = Full record
 *        view with a tab per element — the start and end info, the messages, the background map and the current
 *        element on the map. Used by the Explorer tool pane `storymap` and the website element `storymap`; the data
 *        come from StoryMapService, the map from StoryMapBinding (optional).
 *
 *   const story = new HStoryMap().attach(host, { service, binding, settings, sourceQuery, language }).render();
 *   story.setSelection([151]);     // the last selected record; one source record shows its story without a selection
 *
 * The cards are Smarty reports (`/report/{id}/execute`), loaded lazily by HRecordList when they come into view. The
 * start / end info is a record of the list (as the first / last element, or a tab) or a card above / below it.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HBaseWidget } from '../HBaseWidget.js';
import { $HR } from '../../ui/i18n/HResource.js';
import { HRecordList } from '../record-list/HRecordList.js';
import { elementFeatures, normalizeStoryMapSettings, storySourceId, storyText } from './storyMapModel.js';
import './HStoryMap.css';

/** Layout of the story → HRecordList view mode and navigation. */
const LIST_MODES = Object.freeze({
  list: { viewMode: 'big' },
  horizontal: { viewMode: 'row' },
  carousel: { viewMode: 'full', fullNav: 'buttons' },
  tabs: { viewMode: 'full', fullNav: 'tabs' }
});

/** Record ids of the start and end info in the list. */
const START_ID = -1;
const END_ID = -2;

/** Settings whose change needs the story to be read again. */
const storyKey = (settings) => JSON.stringify([settings.story, settings.map.places]);

/** The story map widget. */
export class HStoryMap extends HBaseWidget {
  /**
   * @param {HTMLElement} container
   * @param {object} options
   * @param {import('./storyMapService.js').StoryMapService} options.service Data of the story.
   * @param {import('./storyMapBinding.js').StoryMapBinding|null} [options.binding] The map (none: cards only).
   * @param {object|string} [options.settings] Settings of the Presentation set (normalised here).
   * @param {*} [options.sourceQuery] Query of the source records: with one result its story is shown at once.
   * @param {string} [options.language] Language of the cards and texts.
   * @param {(index: number, item: object) => void} [options.onCurrent] The current element changed.
   * @param {() => object} [options.createList] The list widget (an HRecordList by default; tests give a stand-in).
   * @returns {HStoryMap}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.settings = normalizeStoryMapSettings(options.settings);
    this.selection = [];
    this.sourceIds = [];
    this.story = null;
    this.items = [];
    this.current = -1;
    this._token = 0;
    this.list = null;
    return this;
  }

  /**
   * Build the widget: the intro message and the background map; a source query with one result shows its story.
   *
   * @returns {HStoryMap}
   */
  render() {
    this.container.classList.add('h-storymap');
    this.message = element('div', 'h-storymap-message');
    this.header = element('div', 'h-storymap-header');
    this.body = element('div', 'h-storymap-body');
    this.footer = element('div', 'h-storymap-footer');
    this.container.replaceChildren(this.message, this.header, this.body, this.footer);
    this._showMessage('intro');
    this.state = 'rendered';
    void this._start();
    return this;
  }

  /**
   * New settings (the settings form of Explorer). The story is read again only when its rule, order, limit or places
   * changed; otherwise the shown story is laid out again.
   *
   * @param {object|string} settings
   * @param {object} [options]
   * @param {*} [options.sourceQuery] Query of the source records.
   * @param {boolean} [options.reload] Read the story again in any case.
   * @returns {Promise<void>}
   */
  async setSettings(settings, { sourceQuery = this.options.sourceQuery, reload = false } = {}) {
    const previous = this.settings;
    this.settings = normalizeStoryMapSettings(settings);
    const sourceChanged = JSON.stringify(sourceQuery ?? null) !== JSON.stringify(this.options.sourceQuery ?? null);
    this.options = { ...this.options, settings, sourceQuery };
    if (this.options.binding) this.options.binding.map = this.settings.map;
    if (sourceChanged) this.sourceIds = [];
    if (reload || sourceChanged || storyKey(previous) !== storyKey(this.settings)) {
      await this._start();
      return;
    }
    if (JSON.stringify(previous.map.background) !== JSON.stringify(this.settings.map.background)) await this._showBackground();
    if (!this.story) {
      this._showMessage('intro');
      return;
    }
    if (!this.story.elements.length) {
      this._showMessage('empty');
      return;
    }
    // the same item stays current (start / end may move out of the list)
    const before = this.items[this.current];
    await this._build();
    const same = this.items.findIndex((item) => item.kind === before?.kind && item.element?.id === before?.element?.id);
    await this.options.binding?.showStory?.(this._allFeatures()).catch((error) => console.warn('Story map: places', error));
    this._setCurrent(Math.max(0, same), { force: true, scroll: true });
  }

  /**
   * The selection of the page or of Explorer: the story of the last selected record.
   *
   * @param {Array<number|string>} ids
   * @returns {Promise<void>}
   */
  async setSelection(ids) {
    this.selection = Array.isArray(ids) ? [...ids] : [];
    await this._showSource();
  }

  /**
   * Ids of the source result (Explorer: its current result): one record shows its story without a selection.
   *
   * @param {Array<number|string>} ids
   * @returns {Promise<void>}
   */
  async setSourceIds(ids) {
    this.sourceIds = Array.isArray(ids) ? [...ids] : [];
    if (!this.selection.length) await this._showSource();
  }

  /**
   * No story: the selection and the source result are forgotten, the story and its places go, the intro is shown
   * (another story map was opened in Explorer).
   *
   * @returns {Promise<void>}
   */
  async clear() {
    this.selection = [];
    this.sourceIds = [];
    await this.showStory(0);
  }

  /**
   * The story again with fresh cards (after a change of a template).
   *
   * @returns {Promise<void>}
   */
  async refresh() {
    this.options.service?.clearCache?.();
    const id = this.story?.source?.id;
    if (id) await this.showStory(id, { force: true });
  }

  /**
   * Show the story of a source record.
   *
   * @param {number} sourceId
   * @param {{force?: boolean}} [options] `force`: also when it is shown already.
   * @returns {Promise<void>}
   */
  async showStory(sourceId, { force = false } = {}) {
    const id = Number(sourceId) || 0;
    if (!force && id && this.story?.source?.id === id) return;
    const token = ++this._token;
    if (!id) {
      await this._clearStory();
      await this.options.binding?.clearStory?.().catch(() => {});
      this._showMessage('intro');
      return;
    }
    this.container.classList.add('h-storymap-loading');
    let story = null;
    try {
      story = await this.options.service.loadStory(this.settings, id);
    } catch (error) {
      if (token !== this._token) return;
      this.container.classList.remove('h-storymap-loading');
      await this._clearStory();
      this._showMessage('error', error?.message || String(error));
      return;
    }
    if (token !== this._token || !this.container) return;
    this.container.classList.remove('h-storymap-loading');
    await this._clearStory();
    this.story = story;
    if (!story.elements.length) {
      await this.options.binding?.clearStory?.().catch(() => {});
      this._showMessage('empty');
      return;
    }
    this._showMessage(null);
    await this._build();
    if (token !== this._token) return;
    await this.options.binding?.showStory?.(this._allFeatures()).catch((error) => console.warn('Story map: places', error));
    this._setCurrent(0, { force: true });
  }

  /**
   * Features of an item for the map: the places of an element; start and end show the whole story.
   *
   * @param {object} item `{kind, element?}`.
   * @returns {Array<object>}
   */
  featuresOf(item) {
    if (!this.story) return [];
    if (item?.kind !== 'element') return this._allFeatures();
    return elementFeatures(item.element, { connect: this.settings.map.places.connect });
  }

  /** @returns {Promise<void>} */
  async destroy() {
    this._token++;
    await this.list?.destroy?.();
    this.list = null;
    await this.options.binding?.clear?.().catch(() => {});
    this.container?.replaceChildren();
    this.container?.classList.remove('h-storymap');
    await super.destroy();
  }

  /** @private The background map and, with one source record, its story. */
  async _start() {
    await this._showBackground();
    if (!this.sourceIds.length && this.options.sourceQuery != null && this.options.service) {
      this.sourceIds = await this.options.service.queryIds(this.options.sourceQuery, 2).catch(() => []);
    }
    const shown = this.story?.source?.id;
    await this._showSource({ force: Boolean(shown) });
  }

  /** @private The background map document of the settings. */
  async _showBackground() {
    await this.options.binding?.showBackground?.(this.settings.map.background).catch((error) => console.warn('Story map: background', error));
  }

  /** @private The story of the last selected record, or of the only source record. */
  async _showSource({ force = false } = {}) {
    await this.showStory(storySourceId(this.selection, this.sourceIds), { force });
  }

  /** @private Places of every element. */
  _allFeatures() {
    return (this.story?.elements || []).flatMap((item) => this.featuresOf({ kind: 'element', element: item }));
  }

  /** @private The message `intro`, `empty`, `error` (with a text), or none. */
  _showMessage(kind, detail = '') {
    if (!this.message) return;
    const language = this.options.language || 'def';
    const texts = this.settings.presentation.messages;
    const defaults = {
      intro: 'Select a record to see its story',
      // the topic by its title (review 4, 2026-11-20)
      empty: 'There are no elements to show for "{title}". They may exist but not be public.',
      error: 'The story can not be shown'
    };
    const title = this.story?.source?.title || (this.story?.source?.id ? `#${this.story.source.id}` : '');
    let text = '';
    if (kind === 'intro') text = storyText(texts.intro, language) || $HR(defaults.intro);
    else if (kind === 'empty') text = storyText(texts.empty, language, title) || $HR(defaults.empty).replaceAll('{title}', title);
    else if (kind === 'error') text = `${$HR(defaults.error)}${detail ? `: ${detail}` : ''}`;
    this.message.textContent = text;
    this.message.hidden = !text;
    this.message.className = `h-storymap-message${kind ? ` h-storymap-message-${kind}` : ''}`;
    if (kind && this.body) this.body.hidden = true;
  }

  /** @private Remove the story: the list, the start / end cards. */
  async _clearStory() {
    const list = this.list;
    this.list = null;
    await list?.destroy?.();
    this.story = null;
    this.items = [];
    this.current = -1;
    for (const part of [this.header, this.body, this.footer]) part?.replaceChildren();
    this.container?.classList.remove('h-storymap-highlight', 'h-storymap-veil');
  }

  /**
   * @private The story in its layout: the list of elements with start / end, cards above / below it.
   * @returns {Promise<void>} When the list shows the records.
   */
  async _build() {
    const { layout, distinct } = this.settings.presentation;
    const { start, end } = this.settings;
    const mode = LIST_MODES[layout] || LIST_MODES.list;
    // start / end as the first / last record of the list (in Tabs: the first / last tab), or above / below the list
    const own = (value) => value === 'inline';
    const outside = (value, place) => value === place;
    this.items = [
      ...(own(start.mode) ? [{ kind: 'start' }] : []),
      ...this.story.elements.map((item) => ({ kind: 'element', element: item })),
      ...(own(end.mode) ? [{ kind: 'end' }] : [])
    ];
    for (const part of [this.header, this.footer]) part.replaceChildren();
    if (outside(start.mode, 'header')) this.header.append(this._infoCard('start'));
    if (outside(end.mode, 'footer')) this.footer.append(this._infoCard('end'));
    // Vertical and Horizontal (review 4, 2026-11-20); Carousel and Tabs show one element
    const scrolled = layout === 'list' || layout === 'horizontal';
    this.container.classList.toggle('h-storymap-highlight', scrolled && distinct === 'highlight');
    this.container.classList.toggle('h-storymap-veil', scrolled && distinct === 'veil');
    this.container.setAttribute('data-h-layout', layout);
    this.body.hidden = false;
    const records = this.items.map((item) => this._recordOf(item));
    const options = {
      ...mode,
      pageLength: 1000,
      fontSize: 12,
      trackCurrent: true,
      // the template is chosen by onRecordContentRequest: any name makes Row load it
      cardTemplate: 'story',
      viewTemplate: 'story',
      emptyResultMessage: '',
      controls: { pageSize: false, search: false, counter: false, pagination: false, viewMode: false, selectionActions: false },
      interaction: { editEnabled: false, selectionEnabled: false, persistentSelectionEnabled: false, popupEnabled: false, adminInfoEnabled: false }
    };
    if (this.list) {
      await this.list.applyConfiguration(options);
      await this.list?.setData({ querySource: null, records });
      return;
    }
    const host = element('div', 'h-storymap-list');
    this.body.replaceChildren(host);
    this.list = this.options.createList ? this.options.createList() : new HRecordList();
    await this.list.initialize({
      container: host,
      options,
      onRecordContentRequest: (request) => this._content(request),
      onCurrentRecordChange: (id, index) => this._setCurrent(index, { fromList: true })
    });
    await this.list?.setData({ querySource: null, records });
  }

  /** @private A record of the list: the element as found, the start (the topic) or the end. */
  _recordOf(item) {
    if (item.kind === 'element') {
      const record = item.element.record || {};
      return { ...record, rec_ID: item.element.id, rec_Title: item.element.title || record.rec_Title || `#${item.element.id}` };
    }
    return { rec_ID: item.kind === 'start' ? START_ID : END_ID, rec_Title: this._itemTitle(item), rec_RecTypeID: 0 };
  }

  /** @private Title of an item: the element, the topic (start) or End. */
  _itemTitle(item) {
    if (item.kind === 'element') return item.element.title || `#${item.element.id}`;
    if (item.kind === 'start') return this.story?.source?.title || $HR('Overview');
    return $HR('End');
  }

  /**
   * @private The content of records of the list (HRecordList `onRecordContentRequest`): the element template on each
   * element, the start / end info on the topic. A record without content keeps the title of HRecordList.
   */
  async _content({ records }) {
    const result = new Map();
    await Promise.all((records || []).map(async (record) => {
      const id = Number(record.rec_ID);
      const html = id === START_ID ? await this._infoHtml('start') : (id === END_ID ? await this._infoHtml('end') : await this._elementHtml(id));
      if (html) result.set(id, html);
    }));
    return result;
  }

  /** @private The card of one element (its template), '' without a template. */
  async _elementHtml(id) {
    const template = this.settings.element.template;
    if (!template) return '';
    return this.options.service.renderCard(template, id, this.options.language || '');
  }

  /** @private The start / end info: its template on the topic, or its text (`{title}` = the topic). */
  async _infoHtml(kind) {
    const part = this.settings[kind];
    const language = this.options.language || '';
    if (part.template) return this.options.service.renderCard(part.template, this.story?.source?.id, language);
    const text = storyText(part.text, language || 'def', this.story?.source?.title || '');
    if (!text) return '';
    const body = element('div', 'h-storymap-card-text');
    body.textContent = text;
    return body;
  }

  /** @private A card above / below the list (start / end info). */
  _infoCard(kind) {
    const card = element('div', `h-storymap-card h-storymap-${kind}`);
    const caption = element('div', 'h-storymap-card-title');
    caption.textContent = this._itemTitle({ kind });
    card.append(caption);
    void this._infoHtml(kind).then((html) => {
      if (!html) return;
      if (typeof html === 'string') card.innerHTML = html;
      else card.replaceChildren(html);
    });
    return card;
  }

  /** @private Make an item the current one: in the list (unless it told us), and on the map. */
  _setCurrent(index, { fromList = false, force = false, scroll = false } = {}) {
    if (index < 0 || index >= this.items.length || (index === this.current && !force)) return;
    this.current = index;
    const item = this.items[index];
    if (!fromList) {
      const record = this._recordOf(item);
      this.list?.setCurrentRecord?.(record.rec_ID, { scroll });
    }
    void this.options.binding?.showElement?.(this.featuresOf(item)).catch((error) => console.warn('Story map: element', error));
    this.options.onCurrent?.(index, item);
  }
}

/** A new element with a class. */
function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
