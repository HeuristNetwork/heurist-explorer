/**
 * @file HMenu.js
 * @brief Website menu and action menu (plan 27a decision 3, plan 27f §4 and §6).
 *
 * One class for two widgets: the website menu (type `menu`: the pages of the website) and the action
 * menu (type `actionmenu`: items of its settings). The server writes the list into the host (for
 * crawlers and visitors without JS) and render() activates it; without it (the designer's draft) the
 * list is built here from the same items.
 *
 * Settings: `orientation` horizontal (drop-downs on hover and focus) / vertical (a tree with expandable
 * levels) / auto (vertical in a vertical header); `showHome` a Home entry first (website menu);
 * `selectableParent` (default true) a page with sub pages opens, else its title opens the sub menu;
 * `presentation` of an action menu: links, buttons, icons or dropdown. An item: title, url, current,
 * children, icon (image URL), fa (Font Awesome classes), format name / icon / both, newTab, hidden (a page hidden in the
 * main menu: class is-menu-hidden, review 2026-11-11).
 * On a narrow screen, or when it does not fit its place in one row (plan 27f §13), the horizontal website menu is
 * behind a menu button.
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

/** Presentations of an action menu (plan 27f §6); `menu` is the website menu. */
export const MENU_PRESENTATIONS = Object.freeze(['menu', 'links', 'buttons', 'icons', 'dropdown']);

/**
 * Classes of a menu (PageRenderer::menuClass).
 *
 * @param {object} settings
 * @returns {string}
 */
export function menuClass(settings = {}) {
  const orientation = settings.orientation;
  const presentation = MENU_PRESENTATIONS.includes(settings.presentation) ? settings.presentation : 'menu';
  return ['h-site-menu', ['vertical', 'auto'].includes(orientation) ? `h-site-menu-${orientation}` : '',
    presentation !== 'menu' ? `h-site-menu-${presentation}` : ''].filter(Boolean).join(' ');
}

/** Website menu or action menu of a v4 page. */
export class HMenu extends HBaseWidget {
  /**
   * Attach the menu.
   *
   * @param {HTMLElement} container Host element (its fallback content is replaced).
   * @param {object} [options]
   * @param {Array<object>} [options.items] Menu tree (see the file header).
   * @param {object} [options.settings] orientation, showHome, selectableParent, presentation, label (dropdown).
   * @param {object|null} [options.homeItem] The home page as an item (showHome).
   * @param {string} [options.label] aria-label of the navigation.
   * @returns {HMenu}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    return this;
  }

  /**
   * Render the menu into the container (or activate the menu the server wrote).
   *
   * @returns {HMenu}
   */
  render() {
    const written = this.container.querySelector?.('.h-site-menu');
    if (written) return this._activate(written);
    const settings = this.options.settings || {};
    const presentation = MENU_PRESENTATIONS.includes(settings.presentation) ? settings.presentation : 'menu';
    const nav = document.createElement('nav');
    nav.className = menuClass(settings);
    nav.setAttribute('aria-label', $HR(this.options.label || 'Site menu'));
    const items = [...(this.options.items || [])];
    if (settings.showHome && this.options.homeItem) items.unshift(this.options.homeItem);
    if (presentation === 'menu' || presentation === 'dropdown') {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'h-site-menu-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = presentation === 'dropdown' ? (settings.label || $HR('Menu')) : $HR('Menu');
      nav.append(toggle);
    }
    nav.append(this._list(items, 'h-site-menu-list', settings.selectableParent !== false));
    this.container.replaceChildren(nav);
    return this._activate(nav);
  }

  /** The menu button, and the expanders of a vertical menu. */
  _activate(nav) {
    const toggle = [...nav.children].find((child) => child.classList?.contains('h-site-menu-toggle'));
    if (toggle) {
      if (!nav.classList.contains('h-site-menu-dropdown')) toggle.textContent = $HR('Menu');
      this.listen(toggle, 'click', () => {
        const open = !nav.classList.contains('is-open');
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        if (open && nav.classList.contains('h-site-menu-dropdown')) this._placeDropdown(nav);
      });
    }
    if (nav.classList.contains('h-site-menu-vertical') || nav.classList.contains('h-site-menu-auto')) this._expanders(nav);
    if (toggle && !nav.classList.contains('h-site-menu-dropdown')) this._fitWidth(nav);
    if (!nav.getAttribute('aria-label')) nav.setAttribute('aria-label', $HR(this.options.label || 'Site menu'));
    this.state = 'rendered';
    return this;
  }

  /**
   * A horizontal website menu that needs more than one row goes behind its menu button (class is-narrow), as on a
   * narrow screen; checked again when its place changes size.
   */
  _fitWidth(nav) {
    const list = [...nav.children].find((child) => child.classList?.contains('h-site-menu-list'));
    const Observer = globalThis.ResizeObserver;
    if (!list || !Observer) return;
    const fit = () => {
      nav.classList.remove('is-narrow');
      // a column (vertical menu, vertical header): nothing to fit
      if (globalThis.getComputedStyle?.(list).flexDirection === 'column') return;
      const first = list.firstElementChild;
      const wraps = Boolean(first) && list.offsetHeight > first.offsetHeight * 1.5;
      nav.classList.toggle('is-narrow', wraps);
    };
    fit();
    this._observer?.disconnect?.();
    this._observer = new Observer(fit);
    this._observer.observe(this.container);
  }

  /** Stop observing the size. */
  destroy() {
    this._observer?.disconnect?.();
    super.destroy?.();
  }

  /**
   * The open list of a dropdown action menu: below the button, aligned to its left edge; to its right edge (class
   * is-end) when it would leave the window on the right and there is room on the left (2026-11-12).
   */
  _placeDropdown(nav) {
    const list = [...nav.children].find((child) => child.classList?.contains('h-site-menu-list'));
    if (!list?.getBoundingClientRect) return;
    nav.classList.remove('is-end');
    const width = globalThis.innerWidth || document.documentElement?.clientWidth || 0;
    const box = list.getBoundingClientRect();
    if (width && box.right > width && nav.getBoundingClientRect().right - box.width >= 0) nav.classList.add('is-end');
  }

  /** Vertical menu: a button beside each page with sub pages opens / closes them; the branch of the current page is open. */
  _expanders(nav) {
    nav.classList.add('h-site-menu-js');
    for (const item of nav.querySelectorAll('.has-children')) {
      if (item.classList.contains('is-current-parent') || item.classList.contains('is-current')) item.classList.add('is-expanded');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'h-site-menu-expand';
      button.setAttribute('aria-expanded', String(item.classList.contains('is-expanded')));
      button.setAttribute('aria-label', $HR('Sub pages'));
      const sub = [...item.children].find((child) => child.classList?.contains('h-site-menu-sub'));
      if (sub) item.insertBefore ? item.insertBefore(button, sub) : sub.before(button);
      this.listen(button, 'click', () => {
        const open = !item.classList.contains('is-expanded');
        item.classList.toggle('is-expanded', open);
        button.setAttribute('aria-expanded', String(open));
      });
      // a title that is not a link opens its sub pages too
      const label = [...item.children].find((child) => child.classList?.contains('h-site-menu-label'));
      if (label) this.listen(label, 'click', () => button.click());
    }
  }

  /** A list of menu items with all their sub items (PageRenderer::menuList). */
  _list(items, className, selectableParent) {
    const list = document.createElement('ul');
    list.className = className;
    for (const item of items) {
      const entry = document.createElement('li');
      entry.className = 'h-site-menu-item';
      if (item.hidden) entry.classList.add('is-menu-hidden');
      const children = item.children || [];
      let target;
      if (children.length && !selectableParent) {
        target = document.createElement('span');
        target.className = 'h-site-menu-label';
        target.setAttribute('tabindex', '0');
      } else {
        target = document.createElement('a');
        target.href = item.url || '#';
        if (item.newTab) {
          target.setAttribute('target', '_blank');
          target.setAttribute('rel', 'noopener');
        }
        if (item.action) {
          target.setAttribute('data-h-action', item.action);
          target.setAttribute('data-h-target', String(item.target ?? ''));
        }
        if (item.format === 'icon' || (item.fa && !item.title)) target.setAttribute('title', item.title || '');
      }
      target.append(...menuLabel(item));
      if (item.current) {
        entry.classList.add('is-current');
        if (target.tagName === 'A') target.setAttribute('aria-current', 'page');
      }
      entry.append(target);
      if (children.length) {
        entry.classList.add('has-children');
        if (hasCurrent(children)) entry.classList.add('is-current-parent');
        entry.append(this._list(children, 'h-site-menu-sub', selectableParent));
      }
      list.append(entry);
    }
    return list;
  }
}

/**
 * Items of an action menu from its settings (PageRenderer::actionMenuHtml), for the designer's draft: a page of the
 * website, an external URL or an action (Add record).
 *
 * @param {object} settings `items`: [{label, labels, icon, iconOnly, action, target, record, newTab}]; actions page, url,
 *        addRecord, recordPage, back.
 * @param {{language?: string, pageUrl?: (id: number) => string}} [context]
 * @returns {Array<object>}
 */
export function actionMenuItems(settings = {}, { language = '', pageUrl = () => '#' } = {}) {
  const items = [];
  for (const item of Array.isArray(settings.items) ? settings.items : []) {
    if (!item || typeof item !== 'object') continue;
    const entry = {
      title: item.labels?.[language] ?? item.label ?? '', url: '#', fa: /^[a-z0-9 -]{1,80}$/.test(item.icon || '') ? item.icon : '',
      format: item.iconOnly ? 'icon' : 'name', newTab: Boolean(item.newTab), children: []
    };
    if (item.action === 'page') entry.url = pageUrl(Number(item.target)) || '#';
    else if (item.action === 'url') entry.url = String(item.target || '#');
    else if (item.action === 'addRecord') Object.assign(entry, { action: 'addRecord', target: String(item.target ?? '') });
    // a record on a record page, the page before (plan 27g): links of the server; in the designer's draft only shown
    else if (item.action === 'recordPage') entry.url = '#';
    else if (item.action === 'back') Object.assign(entry, { url: '#', action: 'back' });
    else continue;
    items.push(entry);
  }
  return items;
}

/** Icon and / or title of an entry (PageRenderer::menuLabel). */
function menuLabel(item) {
  const nodes = [];
  const format = item.format || 'name';
  if (item.fa) {
    const glyph = document.createElement('i');
    glyph.className = `h-site-menu-fa ${item.fa}`;
    glyph.setAttribute('aria-hidden', 'true');
    nodes.push(glyph);
  } else if (format !== 'name' && item.icon) {
    const image = document.createElement('img');
    image.className = 'h-site-menu-icon';
    image.src = item.icon;
    image.alt = '';
    nodes.push(image);
  }
  const text = document.createElement('span');
  text.className = 'h-site-menu-text';
  if ((format === 'icon' && (item.icon || item.fa)) || (item.fa && format === 'icon')) text.classList.add('h-site-visually-hidden');
  text.textContent = item.title || '';
  nodes.push(text);
  return nodes;
}

function hasCurrent(items) {
  return items.some((item) => item.current || hasCurrent(item.children || []));
}
