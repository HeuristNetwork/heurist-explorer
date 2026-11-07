/**
 * @file HLangSwitch.js
 * @brief Language switch of a v4 website (plan 27f §5): the current page in the other languages of the website.
 *
 * The server writes the links (`.h-site-lang` with a list of `a[hreflang]`, for crawlers and visitors without JS)
 * and render() activates them; in the designer's draft the list is built here. `appearance`: list (the links),
 * select (a drop-down) or auto (the drop-down when the links do not fit in the host). A website with one language
 * shows nothing. A language change always loads the whole page.
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
import './HLangSwitch.css';

/** Appearances (instance setting `appearance`); the first is the default. */
export const LANG_APPEARANCES = Object.freeze(['auto', 'list', 'select']);

/** Width of one language link (px) used by auto to decide whether the links fit. */
const LINK_WIDTH = 36;

/** The language switch of a website page. */
export class HLangSwitch extends HBaseWidget {
  /**
   * Attach the switch.
   *
   * @param {HTMLElement} container Host element.
   * @param {object} [options]
   * @param {Array<{code: string, url: string, label?: string}>} [options.languages] Languages of the website.
   * @param {string|null} [options.language] Current language (3 letters).
   * @param {string} [options.appearance] auto, list or select.
   * @param {(url: string) => void} [options.navigate] Opens a URL (window.location.assign).
   * @returns {HLangSwitch}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    return this;
  }

  /**
   * Render (or activate) the switch.
   *
   * @returns {HLangSwitch}
   */
  render() {
    let box = this.container.querySelector?.('.h-site-lang');
    const languages = box ? this._readLinks(box) : (this.options.languages || []).map((item) => ({
      code: String(item.code || '').toLowerCase(), url: item.url, label: item.label || String(item.code || '').toUpperCase(),
      current: String(item.code || '').toLowerCase() === String(this.options.language || '').toLowerCase()
    }));
    if (languages.length < 2) {
      this.container.replaceChildren();
      this.container.hidden = true;
      this.state = 'rendered';
      return this;
    }
    const appearance = LANG_APPEARANCES.includes(this.options.appearance) ? this.options.appearance
      : (box ? LANG_APPEARANCES.find((name) => box.classList.contains(`h-site-lang-${name}`)) || 'auto' : 'auto');
    if (!box) {
      box = document.createElement('div');
      box.className = `h-site-lang h-site-lang-${appearance}`;
      const list = document.createElement('ul');
      list.className = 'h-site-lang-list';
      list.setAttribute('aria-label', $HR('Language'));
      for (const language of languages) {
        const entry = document.createElement('li');
        const link = document.createElement('a');
        link.href = language.url;
        link.setAttribute('hreflang', language.code);
        link.textContent = language.label;
        if (language.current) {
          link.classList.add('is-current');
          link.setAttribute('aria-current', 'true');
        }
        entry.append(link);
        list.append(entry);
      }
      box.append(list);
      this.container.replaceChildren(box);
    }
    if (appearance !== 'list') this._select(box, languages, appearance);
    this.state = 'rendered';
    return this;
  }

  /** Languages of the links the server wrote. */
  _readLinks(box) {
    return [...box.querySelectorAll('a')].filter((link) => link.hasAttribute('hreflang')).map((link) => ({
      code: link.getAttribute('hreflang'), url: link.getAttribute('href'), label: link.textContent,
      current: link.classList.contains('is-current')
    }));
  }

  /** The drop-down (select, or auto when the links do not fit). */
  _select(box, languages, appearance) {
    const select = document.createElement('select');
    select.className = 'h-site-lang-dropdown';
    select.setAttribute('aria-label', $HR('Language'));
    for (const language of languages) {
      const option = document.createElement('option');
      option.value = language.url;
      option.textContent = language.label;
      option.setAttribute('data-h-lang-code', language.code);
      if (language.current) option.selected = true;
      select.append(option);
    }
    this.listen(select, 'change', () => {
      const navigate = this.options.navigate || ((url) => globalThis.window?.location?.assign(url));
      navigate(select.value);
    });
    box.append(select);
    if (appearance !== 'auto') return;
    const fit = () => box.classList.toggle('is-narrow', (this.container.clientWidth || Infinity) < languages.length * LINK_WIDTH);
    fit();
    const Observer = globalThis.ResizeObserver;
    if (Observer) {
      const observer = new Observer(fit);
      observer.observe(this.container);
      this._observer = observer;
    }
  }

  /** Stop observing the size. */
  destroy() {
    this._observer?.disconnect?.();
    super.destroy?.();
  }
}
