/**
 * @file ExplorerTour.js
 * @brief Guided tour: a popup next to the described element with Back / Next,
 *        a highlight ring around the element and no veil, so the page stays usable.
 *        Steps are supplied by the host (see explorerTourSteps.js); their text comes
 *        from a per-language HTML file with one <section id="step-id"> per step.
 *        See docs/development/11 Getting-Started-Plan.md, Phase 2.
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

import { $HR } from '#shared/ui';
import './ExplorerTour.css';

const MARGIN = 12;
const EDGE = 8;
const SIDES = ['right', 'bottom', 'left', 'top'];

/**
 * A tour step.
 * @typedef {object} TourStep
 * @property {string} id Step id; also the id of its <section> in the text file.
 * @property {string} topic Topic id (see TourTopic).
 * @property {string} title Fallback title when the text file has no section for the step.
 * @property {() => (Element|null)} target The element to describe; null or invisible skips the step.
 * @property {() => (void|Promise<void>)} [before] Makes the target visible (opens a pane, a section...).
 * @property {'right'|'bottom'|'left'|'top'} [placement] Preferred side of the popup.
 * @property {string} [manualAnchor] Manual section opened by "Read more".
 */

/**
 * @typedef {object} TourTopic
 * @property {string} id Topic id.
 * @property {string} title Topic title shown above the step title.
 */

/** Guided tour over host-supplied steps. */
export class ExplorerTour {
  /**
   * @param {object} options
   * @param {Array<TourStep>} options.steps Steps in order.
   * @param {Array<TourTopic>} [options.topics] Topics, in order.
   * @param {() => Promise<Map<string, Element>>} [options.loadText] Resolves step texts by step id.
   * @param {(anchor: string) => void} [options.onReadMore] Opens the manual at an anchor.
   * @param {() => boolean} [options.isCompact] Narrow screen: the popup is centred.
   * @param {() => void} [options.onClose] Called once when the tour closes.
   */
  constructor({ steps, topics = [], loadText = null, onReadMore = null, isCompact = null, onClose = null } = {}) {
    this.steps = Array.isArray(steps) ? steps : [];
    this.topics = topics;
    this.loadText = loadText;
    this.onReadMore = onReadMore;
    this.isCompact = isCompact;
    this.onClose = onClose;
    this.index = -1;
    this.texts = new Map();
    this.popup = null;
    this.ring = null;
    this._target = null;
    this._frame = 0;
  }

  /** @returns {boolean} Whether the tour is open. */
  isOpen() { return this.popup !== null; }

  /**
   * Open the tour at a step.
   *
   * @param {number} [index=0] Step to start with.
   * @returns {Promise<boolean>} Whether a step could be shown.
   */
  async start(index = 0) {
    if (!this.steps.length) return false;
    if (!this.texts.size && typeof this.loadText === 'function') {
      try { this.texts = await this.loadText() || new Map(); } catch { this.texts = new Map(); }
    }
    this._build();
    const shown = await this.show(index, 1);
    if (!shown) this.close();
    return shown;
  }

  /** Show the next step that can be shown, or finish after the last one. */
  async next() {
    if (!(await this.show(this.index + 1, 1))) this.close();
  }

  /** Show the previous step that can be shown. */
  async back() { await this.show(this.index - 1, -1); }

  /**
   * Show a step; a step whose target can't be shown is skipped in the direction of travel.
   *
   * @param {number} index Step index.
   * @param {1|-1} [direction=1] Where to look when the step is skipped.
   * @returns {Promise<boolean>} Whether a step was shown (false: none left that way).
   */
  async show(index, direction = 1) {
    for (let i = index; i >= 0 && i < this.steps.length; i += direction) {
      const step = this.steps[i];
      try { await step.before?.(); } catch { /* the target check decides */ }
      await nextFrame();
      if (!this.popup) return false;
      const target = safeTarget(step);
      if (!isVisible(target)) continue;
      this.index = i;
      this._render(step, target);
      return true;
    }
    return false;
  }

  /** Close the tour and remove its elements and listeners. */
  close() {
    if (!this.popup) return;
    for (const el of [this.popup, this.ring]) {
      try { el.hidePopover?.(); } catch { /* not shown as a popover */ }
      el.remove();
    }
    this.popup = null;
    this.ring = null;
    this._target = null;
    window.removeEventListener('resize', this._onMove);
    window.removeEventListener('scroll', this._onMove, true);
    document.removeEventListener('keydown', this._onKey, true);
    this._observer?.disconnect();
    this.onClose?.();
  }

  /** @private Create the popup, ring and listeners. */
  _build() {
    if (this.popup) return;
    this.ring = el('div', 'h-tour-ring');
    this.popup = el('div', 'h-tour');
    this.popup.setAttribute('role', 'dialog');
    this.popup.setAttribute('aria-live', 'polite');
    this._arrow = el('div', 'h-tour-arrow');

    const header = el('div', 'h-tour-header');
    this._topic = el('span', 'h-tour-topic');
    const close = button('', $HR('Close'), () => this.close(), 'heurist-icon-button h-tour-close');
    close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    header.append(this._topic, close);
    this._title = el('h3', 'h-tour-title');
    this._title.id = 'h-tour-title';
    this.popup.setAttribute('aria-labelledby', this._title.id);
    this._text = el('div', 'h-tour-text');

    const footer = el('div', 'h-tour-footer');
    this._more = button($HR('Read more'), $HR('Open this topic in the manual'), () => this._readMore(), 'h-btn h-btn-small h-tour-more');
    this._count = el('span', 'h-tour-count');
    this._back = button($HR('Back'), $HR('Previous step'), () => void this.back(), 'h-btn h-btn-small h-tour-back');
    this._next = button($HR('Next'), $HR('Next step'), () => void this.next(), 'h-btn h-btn-small h-btn-primary h-tour-next');
    footer.append(this._more, this._count, this._back, this._next);

    this.popup.append(this._arrow, header, this._title, this._text, footer);
    for (const node of [this.ring, this.popup]) {
      if (typeof node.showPopover === 'function') node.popover = 'manual';
      document.body.append(node);
      try { node.showPopover?.(); } catch { /* shown in place */ }
    }

    this._onMove = () => this._schedulePosition();
    this._onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
      if (isTyping(event.target)) return;
      if (event.key === 'ArrowRight') void this.next();
      else if (event.key === 'ArrowLeft') void this.back();
    };
    window.addEventListener('resize', this._onMove);
    window.addEventListener('scroll', this._onMove, true);
    document.addEventListener('keydown', this._onKey, true);
    if (typeof ResizeObserver === 'function') this._observer = new ResizeObserver(this._onMove);
  }

  /** @private Fill the popup for a step and place it next to its target. */
  _render(step, target) {
    const topicIndex = this.topics.findIndex((topic) => topic.id === step.topic);
    const topic = this.topics[topicIndex];
    this._topic.textContent = topic ? `${topicIndex + 1}. ${$HR(topic.title)}` : '';

    const section = this.texts.get(step.id);
    const body = section ? section.cloneNode(true) : null;
    const heading = body?.querySelector('h1,h2,h3');
    this._title.textContent = heading?.textContent?.trim() || $HR(step.title);
    heading?.remove();
    this._text.replaceChildren(...(body ? [...body.childNodes] : []));
    // recordings: loaded only when their step is shown
    for (const video of this._text.querySelectorAll('video')) {
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      void video.play?.()?.catch?.(() => {});
    }

    this._more.hidden = !(step.manualAnchor && this.onReadMore);
    this._count.textContent = `${this.index + 1} / ${this.steps.length}`;
    this._back.disabled = this.index === 0;
    this._next.textContent = this.index === this.steps.length - 1 ? $HR('Finish') : $HR('Next');

    this._observer?.disconnect();
    this._target = target;
    this._step = step;
    this._observer?.observe(target);
    this._observer?.observe(this.popup);
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    this._position();
    this._next.focus?.({ preventScroll: true });
  }

  _readMore() {
    if (this._step?.manualAnchor) this.onReadMore?.(this._step.manualAnchor);
  }

  _schedulePosition() {
    if (this._frame) return;
    this._frame = requestFrame(() => { this._frame = 0; this._position(); });
  }

  /**
   * @private
   * Place the ring over the target and the popup on the first side with room
   * (preferred side first), else centred over the target. Compact: centred.
   */
  _position() {
    const target = this._target;
    if (!this.popup || !target) return;
    if (!isVisible(target)) { this.ring.hidden = true; return; }
    const rect = target.getBoundingClientRect();
    this.ring.hidden = false;
    Object.assign(this.ring.style, {
      top: `${rect.top - 3}px`, left: `${rect.left - 3}px`,
      width: `${rect.width + 6}px`, height: `${rect.height + 6}px`
    });

    const width = this.popup.offsetWidth || 320;
    const height = this.popup.offsetHeight || 180;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const compact = this.isCompact?.() === true;
    const order = [this._step?.placement, ...SIDES].filter((side, i, all) => side && all.indexOf(side) === i);
    let side = 'center';
    let left = rect.left + rect.width / 2 - width / 2;
    let top = rect.top + rect.height / 2 - height / 2;
    if (!compact) {
      for (const candidate of order) {
        const place = placeOn(candidate, rect, width, height);
        if (fits(candidate, place, width, height, vw, vh)) { side = candidate; ({ left, top } = place); break; }
      }
    } else {
      left = vw / 2 - width / 2;
      top = vh / 2 - height / 2;
    }
    left = clamp(left, EDGE, vw - width - EDGE);
    top = clamp(top, EDGE, vh - height - EDGE);
    Object.assign(this.popup.style, { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` });
    this.popup.dataset.side = side;

    // arrow on the popup edge facing the target, pointing at its centre
    this._arrow.hidden = side === 'center';
    if (side === 'left' || side === 'right') {
      this._arrow.style.top = `${clamp(rect.top + rect.height / 2 - top, 16, height - 16)}px`;
      this._arrow.style.left = '';
    } else if (side === 'top' || side === 'bottom') {
      this._arrow.style.left = `${clamp(rect.left + rect.width / 2 - left, 16, width - 16)}px`;
      this._arrow.style.top = '';
    }
  }
}

/**
 * Load step texts from a tour file: one <section id="step-id"> per step. Relative
 * links and media sources are resolved against the file. Falls back to a second URL
 * (e.g. the English file when a translation is missing).
 *
 * @param {string} url Tour file for the active language.
 * @param {string|null} [fallbackUrl] Tour file used when `url` can't be loaded.
 * @returns {Promise<Map<string, Element>>} Sections by id.
 */
export async function loadTourText(url, fallbackUrl = null) {
  const sections = await loadSections(url);
  // missing translation: a 404, or (dev server) a 200 page without sections
  if (!sections.size && fallbackUrl && fallbackUrl !== url) return loadSections(fallbackUrl);
  return sections;
}

/** Fetch one tour file and return its sections by id (empty when it can't be loaded). */
async function loadSections(url) {
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) return new Map();
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  const base = new URL(url, window.location.href);
  for (const node of doc.querySelectorAll('[src],[href],[poster]')) {
    for (const name of ['src', 'href', 'poster']) {
      const value = node.getAttribute(name);
      if (value && !value.startsWith('#')) node.setAttribute(name, new URL(value, base).href);
    }
  }
  // links open outside the tour
  for (const link of doc.querySelectorAll('a[href]')) link.target = '_blank';
  const sections = new Map();
  for (const section of doc.querySelectorAll('section[id]')) sections.set(section.id, section);
  return sections;
}

/** Popup position on one side of the target. */
function placeOn(side, rect, width, height) {
  switch (side) {
    case 'right': return { left: rect.right + MARGIN, top: rect.top + rect.height / 2 - height / 2 };
    case 'left': return { left: rect.left - MARGIN - width, top: rect.top + rect.height / 2 - height / 2 };
    case 'bottom': return { left: rect.left + rect.width / 2 - width / 2, top: rect.bottom + MARGIN };
    default: return { left: rect.left + rect.width / 2 - width / 2, top: rect.top - MARGIN - height };
  }
}

/**
 * Whether the popup fits on a side: inside the viewport on that side's axis (the
 * other axis is clamped), so it never covers the target.
 */
function fits(side, place, width, height, vw, vh) {
  if (side === 'left' || side === 'right') return place.left >= EDGE && place.left + width <= vw - EDGE;
  return place.top >= EDGE && place.top + height <= vh - EDGE;
}

function safeTarget(step) { try { return step.target?.() || null; } catch { return null; } }

/** Connected, not inside a hidden element, and with an area. */
function isVisible(target) {
  if (!target?.isConnected || target.closest?.('[hidden]')) return false;
  const rect = target.getBoundingClientRect?.();
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function isTyping(node) { return Boolean(node?.closest?.('input,textarea,select,[contenteditable="true"]')); }
function clamp(value, min, max) { return Math.max(min, Math.min(value, Math.max(min, max))); }
function nextFrame() { return new Promise((resolve) => requestFrame(resolve)); }
function requestFrame(callback) { return (globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 0)))(callback); }
function el(tag, className) { const node = document.createElement(tag); node.className = className; return node; }
function button(text, title, handler, className) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  node.title = title;
  node.addEventListener('click', handler);
  return node;
}
