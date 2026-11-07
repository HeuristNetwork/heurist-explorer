/**
 * @file HSlider.js
 * @brief Helper of the website widgets Record cards and Media gallery (plan 27e §10): works on the HTML elements the
 *        server wrote into the host. Slideshow (`slider`): one element visible, fade, start / stop and `<< < > >>`.
 *        Carousel (`carousel`, plan 27e §29): one element visible, `< >` only, no rotation. `<<` and `>>` only from
 *        NAV_ENDS_MIN elements. Action `url`:
 *        a click on a card opens its `data-h-url` in a new window. The action Player / Viewer is HMediaViewer, for the
 *        whole page: the class `h-slider-running` tells it that this host rotates. Option `design` (the CMS designer):
 *        no rotation and no actions. It knows nothing about the Heurist API.
 *
 *   new HSlider().attach(host, { presentation: 'slider', action: 'none',
 *     slider: { duration: 4000, fade: 500, navigation: true, fit: 'contain' } }).render();
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
import './HSlider.css';

/** Defaults of the slider (ms). */
export const SLIDER_DEFAULTS = Object.freeze({ duration: 4000, fade: 500, navigation: true });

/** Number of slides from which the navigation has `<<` and `>>`. */
export const NAV_ENDS_MIN = 6;

/** Presentations with one element visible. */
export const ONE_VISIBLE = Object.freeze(['slider', 'carousel']);

/** Position of an image in a slider without a choice. */
export const SLIDER_FIT = 'contain';

/** Slider and actions over the elements of a host. */
export class HSlider extends HBaseWidget {
  /**
   * @param {HTMLElement} container Host; its child elements are the slides or cards.
   * @param {object} [options]
   * @param {'list'|'carousel'|'slider'} [options.presentation='list'] All visible, or one: with buttons only
   *        (carousel), or rotating (slider, a slideshow).
   * @param {'none'|'url'|'viewer'} [options.action='none'] `url`: a click opens `data-h-url`; `viewer`: nothing here.
   * @param {boolean} [options.design=false] In the designer: the slider without rotation and actions.
   * @param {{duration?: number, fade?: number, navigation?: boolean, fit?: string}} [options.slider] Settings of the
   *        slider; `fit`: position of an image (contain, height, width, none, cover, fill).
   * @returns {HSlider}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.items = [...container.children];
    this.index = 0;
    this.timer = null;
    this.slider = { ...SLIDER_DEFAULTS, ...(options.slider || {}) };
    return this;
  }

  /**
   * Activate the host.
   *
   * @returns {HSlider}
   */
  render() {
    this.container.classList.remove('h-slider-pending');
    if (!this.options.design && this.options.action === 'url') this._links();
    if (ONE_VISIBLE.includes(this.options.presentation) && this.items.length) this._slider();
    this.state = 'rendered';
    return this;
  }

  /**
   * Show one element.
   *
   * @param {number} index Position; it wraps around at both ends.
   * @returns {void}
   */
  show(index) {
    const count = this.items.length;
    if (!count) return;
    this.index = ((index % count) + count) % count;
    this.items.forEach((item, position) => {
      const active = position === this.index;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-hidden', String(!active));
    });
  }

  /** Start the automatic change (not with a single element). */
  start() {
    if (this.timer !== null || this.items.length < 2) return;
    this.timer = setInterval(() => this.show(this.index + 1), Math.max(500, Number(this.slider.duration) || SLIDER_DEFAULTS.duration));
    this._syncRunning();
  }

  /** Stop the automatic change. */
  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this._syncRunning();
  }

  /** @returns {Promise<void>} Completion after the timer is removed. */
  async destroy() {
    this.stop();
    await super.destroy();
  }

  /** A click on a card with a URL opens it in a new window. */
  _links() {
    for (const item of this.items) {
      const url = item.getAttribute('data-h-url');
      if (!url) continue;
      item.classList.add('h-slider-link');
      this.listen(item, 'click', () => globalThis.open?.(url, '_blank', 'noopener'));
    }
  }

  /** Whether the slides rotate: a slideshow, not a carousel. */
  _rotates() {
    return this.options.presentation === 'slider';
  }

  /** The slides, the navigation and the start. */
  _slider() {
    const host = this.container;
    host.classList.add('h-slider');
    host.style.setProperty('--h-slider-fade', `${Math.max(0, Number(this.slider.fade) || 0)}ms`);
    if (this.slider.fit) host.setAttribute('data-h-fit', this.slider.fit);
    for (const item of this.items) item.classList.add('h-slider-item');
    this.show(0);
    // a carousel moves only by its buttons
    if ((this.slider.navigation !== false || !this._rotates()) && this.items.length > 1) host.append(this._navigation());
    // no automatic movement in the designer and for visitors who asked for reduced motion
    if (this._rotates() && !this.options.design && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) this.start();
    this._syncRunning();
  }

  /** `<<`, `<`, start / stop, `>`, `>>`; `<<` `>>` from NAV_ENDS_MIN slides, start / stop of a slideshow only. */
  _navigation() {
    const bar = document.createElement('div');
    bar.className = 'h-slider-nav';
    const button = (icon, title, run) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.title = $HR(title);
      element.setAttribute('aria-label', element.title);
      const glyph = document.createElement('i');
      glyph.className = `fa-solid ${icon}`;
      glyph.setAttribute('aria-hidden', 'true');
      element.append(glyph);
      this.listen(element, 'click', run);
      bar.append(element);
      return element;
    };
    const ends = this.items.length >= NAV_ENDS_MIN;
    if (ends) button('fa-backward-fast', 'First', () => this._go(0));
    button('fa-backward-step', 'Previous', () => this._go(this.index - 1));
    if (!this.options.design && this._rotates()) this.toggle = button('fa-pause', 'Stop', () => (this.timer !== null ? this.stop() : this.start()));
    button('fa-forward-step', 'Next', () => this._go(this.index + 1));
    if (ends) button('fa-forward-fast', 'Last', () => this._go(this.items.length - 1));
    return bar;
  }

  /** The visitor chose a slide: the automatic change stops. */
  _go(index) {
    this.stop();
    this.show(index);
  }

  /** The host and the start / stop button follow the state. */
  _syncRunning() {
    const running = this.timer !== null;
    this.container?.classList.toggle('h-slider-running', running);
    if (!this.toggle) return;
    this.toggle.title = $HR(running ? 'Stop' : 'Start');
    this.toggle.setAttribute('aria-label', this.toggle.title);
    const glyph = this.toggle.querySelector('i');
    if (glyph) glyph.className = `fa-solid ${running ? 'fa-pause' : 'fa-play'}`;
  }
}
