/**
 * @file HStoryMap.js
 * @brief The story map (plan 27q1 §5): the story of one source record as cards (list, horizontal, tabs, carousel or
 *        slideshow), the start (overview) and end elements, the messages, and the current element on the map. Used by
 *        the Explorer tool pane `storymap` and the website element `storymap`; the data come from StoryMapService, the
 *        map from StoryMapBinding (optional).
 *
 *   const story = new HStoryMap().attach(host, { service, binding, settings, sourceQuery, language }).render();
 *   story.setSelection([151]);     // the last selected record; one source record shows its story without a selection
 *
 * The cards are Smarty reports (`/report/{id}/execute`), loaded for the current card and its neighbours. Tabs,
 * carousel and slideshow use HSlider. The current element: the most visible card of a list (scroll) or a click; the
 * shown slide or tab. `highlight` marks it, `veil` dims the others.
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
import { HSlider } from '../site/HSlider.js';
import {
  choosePattern, elementFeatures, normalizeStoryMapSettings, storySourceId, storyText
} from './storyMapModel.js';
import './HStoryMap.css';

/** Layouts shown by HSlider (story map name → HSlider presentation). */
const SLIDER_LAYOUTS = Object.freeze({ tabs: 'tabs', carousel: 'carousel', slideshow: 'slider' });

/** Cards loaded around the current one. */
const NEIGHBOURS = 1;

/** The story map widget. */
export class HStoryMap extends HBaseWidget {
  /**
   * @param {HTMLElement} container
   * @param {object} options
   * @param {import('./storyMapService.js').StoryMapService} options.service Data of the story.
   * @param {import('./storyMapBinding.js').StoryMapBinding|null} [options.binding] The map (none: cards only).
   * @param {object|string} [options.settings] Settings of the Presentation set (normalised here).
   * @param {*} [options.sourceQuery] Query of the source records: with one result its story is shown at once.
   * @param {*} [options.overviewQuery] Query of the map overview (a query source resolved by the caller).
   * @param {string} [options.language] Language of the cards and texts.
   * @param {(index: number, item: object) => void} [options.onCurrent] The current element changed.
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
    this.slider = null;
    this.observer = null;
    return this;
  }

  /**
   * Build the widget: the intro message and the map overview; a source query with one result shows its story.
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
    // a click on a card makes it the current one (one listener for every story)
    this.listen(this.body, 'click', (event) => {
      const card = event.target?.closest?.('[data-h-index]');
      if (card && !event.target.closest('a, button, video, audio, iframe')) this._setCurrent(Number(card.getAttribute('data-h-index')), { fromList: true });
    });
    this._showMessage('intro');
    this.state = 'rendered';
    void this._start();
    return this;
  }

  /**
   * New settings (the settings form of Explorer): the current story again.
   *
   * @param {object|string} settings
   * @param {object} [options]
   * @param {*} [options.sourceQuery]
   * @param {*} [options.overviewQuery]
   * @returns {Promise<void>}
   */
  async setSettings(settings, { sourceQuery = this.options.sourceQuery, overviewQuery = this.options.overviewQuery } = {}) {
    this.settings = normalizeStoryMapSettings(settings);
    this.options = { ...this.options, settings, sourceQuery, overviewQuery };
    if (this.options.binding) this.options.binding.map = this.settings.map;
    await this._start();
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
   * The story again with fresh cards (Refresh after a change of a template).
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
      this._clearStory();
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
      this._clearStory();
      this._showMessage('error', error?.message || String(error));
      return;
    }
    if (token !== this._token || !this.container) return;
    this.container.classList.remove('h-storymap-loading');
    this._clearStory();
    this.story = story;
    if (!story.elements.length) {
      await this.options.binding?.clearStory?.().catch(() => {});
      this._showMessage('empty');
      return;
    }
    this._showMessage(null);
    this._build();
    await this.options.binding?.showStory?.(this._allFeatures()).catch((error) => console.warn('Story map: places', error));
    this._setCurrent(0);
  }

  /**
   * Features of an item for the map: an element by its pattern; start and end show the whole story.
   *
   * @param {object} item `{kind, element?}`.
   * @returns {Array<object>}
   */
  featuresOf(item) {
    if (!this.story) return [];
    if (item?.kind !== 'element') return this._allFeatures();
    const { places, fieldId, placeFields, allowed } = this.story;
    const pattern = choosePattern(item.element, this.settings.map.patterns, { fieldId });
    return elementFeatures(item.element, pattern, places, { fieldId, placeFields, allowed: allowed?.get(pattern) || null });
  }

  /** @returns {Promise<void>} */
  async destroy() {
    this._token++;
    this.observer?.disconnect();
    this.observer = null;
    await this.slider?.destroy();
    this.slider = null;
    await this.options.binding?.clear?.().catch(() => {});
    this.container?.replaceChildren();
    this.container?.classList.remove('h-storymap');
    await super.destroy();
  }

  /** @private The overview and, with one source record, its story. */
  async _start() {
    const binding = this.options.binding;
    if (binding && this.options.overviewQuery != null) {
      await binding.showOverview(this.options.overviewQuery).catch((error) => console.warn('Story map: overview', error));
    }
    if (!this.sourceIds.length && this.options.sourceQuery != null && this.options.service) {
      this.sourceIds = await this.options.service.queryIds(this.options.sourceQuery, 2).catch(() => []);
    }
    const shown = this.story?.source?.id;
    await this._showSource({ force: Boolean(shown) });
  }

  /** @private The story of the last selected record, or of the only source record. */
  async _showSource({ force = false } = {}) {
    await this.showStory(storySourceId(this.selection, this.sourceIds), { force });
  }

  /** @private Places of every element. */
  _allFeatures() {
    return (this.items || []).filter((item) => item.kind === 'element').flatMap((item) => this.featuresOf(item));
  }

  /** @private The message `intro`, `empty`, `error` (with a text), or none. */
  _showMessage(kind, detail = '') {
    if (!this.message) return;
    const language = this.options.language || 'def';
    const texts = this.settings.messages;
    const defaults = {
      intro: 'Select a record to see its story',
      empty: 'There are no elements to show for this record. They may exist but not be public.',
      error: 'The story can not be shown'
    };
    let text = '';
    if (kind === 'intro') text = storyText(texts.intro, language) || $HR(defaults.intro);
    else if (kind === 'empty') text = storyText(texts.empty, language, this.story?.source?.title) || $HR(defaults.empty);
    else if (kind === 'error') text = `${$HR(defaults.error)}${detail ? `: ${detail}` : ''}`;
    this.message.textContent = text;
    this.message.hidden = !text;
    this.message.className = `h-storymap-message${kind ? ` h-storymap-message-${kind}` : ''}`;
  }

  /** @private Remove the cards of the story. */
  _clearStory() {
    this.observer?.disconnect();
    this.observer = null;
    void this.slider?.destroy();
    this.slider = null;
    this.story = null;
    this.items = [];
    this.current = -1;
    for (const part of [this.header, this.body, this.footer]) part?.replaceChildren();
    if (this.body) this.body.className = 'h-storymap-body';
    this.container?.classList.remove('h-storymap-highlight', 'h-storymap-veil');
  }

  /** @private The cards of the story in its layout. */
  _build() {
    const { layout, distinct } = this.settings.presentation;
    const { start, end } = this.settings;
    const sliderLayout = SLIDER_LAYOUTS[layout] || null;
    // start / end as an element of the list (inline) or as a tab; header / footer outside it
    const own = (mode) => mode === 'inline' || (mode === 'tab' && sliderLayout !== null);
    this.items = [
      ...(own(start.mode) ? [{ kind: 'start' }] : []),
      ...this.story.elements.map((item) => ({ kind: 'element', element: item })),
      ...(own(end.mode) ? [{ kind: 'end' }] : [])
    ];
    if (start.mode === 'header' || (start.mode === 'tab' && !sliderLayout)) this.header.append(this._card({ kind: 'start' }, -1));
    if (end.mode === 'footer' || (end.mode === 'tab' && !sliderLayout)) this.footer.append(this._card({ kind: 'end' }, -1));
    for (const part of [this.header, this.footer]) {
      const card = part.querySelector('.h-storymap-card');
      if (card) void this._fill(card, card.item);
    }
    this.container.classList.toggle('h-storymap-highlight', distinct === 'highlight');
    this.container.classList.toggle('h-storymap-veil', distinct === 'veil');
    this.body.className = `h-storymap-body h-storymap-${sliderLayout ? 'slides' : layout}`;
    this.cards = this.items.map((item, index) => this._card(item, index));
    this.body.append(...this.cards);
    if (sliderLayout) {
      this.slider = new HSlider().attach(this.body, {
        presentation: sliderLayout,
        slider: { duration: this.settings.presentation.interval, navigation: true },
        design: Boolean(this.options.design),
        onChange: (index) => this._setCurrent(index)
      }).render();
      return;
    }
    this._observe();
  }

  /** @private One card: the title until the Smarty card is loaded. */
  _card(item, index) {
    const card = element('div', `h-storymap-card h-storymap-${item.kind}`);
    const title = this._itemTitle(item);
    card.setAttribute('data-h-label', title);
    if (item.kind === 'element') card.setAttribute('data-h-rec', String(item.element.id));
    if (index >= 0) card.setAttribute('data-h-index', String(index));
    const caption = element('div', 'h-storymap-card-title');
    caption.textContent = title;
    card.append(caption);
    card.item = item;
    return card;
  }

  /** @private Title of an item: the element, the source record (start) or End. */
  _itemTitle(item) {
    if (item.kind === 'element') return item.element.title || `#${item.element.id}`;
    if (item.kind === 'start') return this.story?.source?.title || $HR('Overview');
    return $HR('End');
  }

  /** @private The content of a card: its Smarty template, or the text of start / end. */
  async _fill(card, item) {
    if (!card || card.getAttribute('data-h-filled')) return;
    card.setAttribute('data-h-filled', '1');
    const language = this.options.language || '';
    const service = this.options.service;
    if (item.kind === 'element') {
      const html = this.settings.element.template ? await service.renderCard(this.settings.element.template, item.element.id, language) : '';
      if (html) setHtml(card, html);
      return;
    }
    const part = this.settings[item.kind];
    if (part.template) {
      const html = await service.renderCard(part.template, this.story?.source?.id, language);
      if (html) setHtml(card, html);
      return;
    }
    const text = storyText(part.text, language || 'def', this.story?.source?.title || '');
    if (text) {
      const body = element('div', 'h-storymap-card-text');
      body.textContent = text;
      card.replaceChildren(body);
    }
  }

  /** @private List and horizontal: the most visible card is the current one; cards are loaded when they come near. */
  _observe() {
    const Observer = globalThis.IntersectionObserver;
    if (typeof Observer !== 'function') {
      this.cards.forEach((card) => void this._fill(card, card.item));
      return;
    }
    const ratios = new Map();
    let timer = null;
    this.observer = new Observer((entries) => {
      for (const entry of entries) {
        const index = Number(entry.target.getAttribute('data-h-index'));
        if (entry.isIntersecting) void this._fill(entry.target, entry.target.item);
        ratios.set(index, entry.isIntersecting ? entry.intersectionRatio : 0);
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (this._scrollLock && Date.now() < this._scrollLock) return;
        let best = -1;
        let ratio = 0;
        for (const [index, value] of ratios) if (value > ratio + 0.01 || (value === ratio && index < best)) [best, ratio] = [index, value];
        if (best >= 0 && ratio > 0.5) this._setCurrent(best);
      }, 150);
    }, { root: this.body, threshold: [0, 0.5, 0.75, 1], rootMargin: '200px' });
    this.cards.forEach((card) => this.observer.observe(card));
  }

  /** @private Make an item the current one: classes, cards around it, the map. */
  _setCurrent(index, { fromList = false } = {}) {
    if (index < 0 || index >= this.items.length || index === this.current) return;
    this.current = index;
    this.cards?.forEach((card, position) => card.classList.toggle('is-current', position === index));
    for (let position = index - NEIGHBOURS; position <= index + NEIGHBOURS; position++) {
      const card = this.cards?.[position];
      if (card) void this._fill(card, card.item);
    }
    // a click in a list: the card comes into view, the scroll does not choose another one meanwhile
    if (fromList && !this.slider) {
      this._scrollLock = Date.now() + 800;
      this.cards[index]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    if (this.slider && this.slider.index !== index) this.slider.show(index);
    const item = this.items[index];
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

/** The HTML of a Smarty card (sanitised by the server) into a card. */
function setHtml(card, html) {
  card.innerHTML = html;
}
