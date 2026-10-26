/**
 * @file HMenu.js
 * @brief The simplest website menu (plan 27a, decision 3): top pages, one level of sub pages.
 *
 * A horizontal list of the website's top pages with their sub pages as drop-downs
 * (shown on hover and keyboard focus), the current page marked, and the site
 * languages as links. On a narrow screen the list is behind a menu button.
 * Phase 4 adds vertical / collapsible forms, icons and the legacy menu options.
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
import './HMenu.css';

/** Website menu of a v4 page. */
export class HMenu extends HBaseWidget {
  /**
   * Attach the menu.
   *
   * @param {HTMLElement} container Host element (its fallback content is replaced).
   * @param {object} [options]
   * @param {Array<{id: number, title: string, url: string, current: boolean, children: Array}>} [options.items] Menu tree.
   * @param {Array<{code: string, url: string}>} [options.languages] Site languages (links shown when there are two or more).
   * @param {string|null} [options.language] Current language (3 letters).
   * @returns {HMenu}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    return this;
  }

  /**
   * Render the menu into the container.
   *
   * @returns {HMenu}
   */
  render() {
    const nav = document.createElement('nav');
    nav.className = 'h-site-menu';
    nav.setAttribute('aria-label', $HR('Site menu'));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'h-site-menu-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = $HR('Menu');
    const list = this._list(this.options.items || [], 'h-site-menu-list');
    const languages = this.options.languages || [];
    if (languages.length > 1) list.append(this._languages(languages));
    this.listen(toggle, 'click', () => {
      const open = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.append(toggle, list);
    this.container.replaceChildren(nav);
    this.state = 'rendered';
    return this;
  }

  /** A list of menu items, with their sub pages one level down. */
  _list(items, className, depth = 0) {
    const list = document.createElement('ul');
    list.className = className;
    for (const item of items) {
      const entry = document.createElement('li');
      entry.className = 'h-site-menu-item';
      const link = document.createElement('a');
      link.href = item.url || '#';
      link.textContent = item.title || '';
      if (item.current) {
        entry.classList.add('is-current');
        link.setAttribute('aria-current', 'page');
      }
      entry.append(link);
      const children = depth === 0 ? (item.children || []) : [];
      if (children.length) {
        entry.classList.add('has-children');
        if (children.some((child) => child.current)) entry.classList.add('is-current-parent');
        entry.append(this._list(children, 'h-site-menu-sub', depth + 1));
      }
      list.append(entry);
    }
    return list;
  }

  /** Links to the page in the other languages. */
  _languages(languages) {
    const entry = document.createElement('li');
    entry.className = 'h-site-menu-item h-site-menu-languages';
    for (const language of languages) {
      const link = document.createElement('a');
      link.href = language.url;
      link.textContent = String(language.code || '').toUpperCase();
      link.setAttribute('hreflang', language.code || '');
      if (language.code === this.options.language) {
        link.classList.add('is-current');
        link.setAttribute('aria-current', 'true');
      }
      entry.append(link);
    }
    return entry;
  }
}
