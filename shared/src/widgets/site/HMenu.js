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
 * children, icon (image URL), fa (Font Awesome classes), format name / icon / both, description (the rollover of every
 * format, review 2026-11-14), newTab, hidden (a page hidden in the main menu: class is-menu-hidden, review 2026-11-11).
 *
 * The rules of the website menu (review 2026-11-15):
 * - its items are in one row, never wrapped; it collapses behind its menu button when they do not fit its place, at
 *   any screen width (a vertical menu is a tree only from 641 px; on narrower screens it is a row as the horizontal one);
 * - the open collapsed menu opens inside the header (no drop-down): a full-width block below the row of the menu that
 *   moves the content down, a tree with sub pages below their page, opened and closed by their button;
 * - one <nav>: the host of the widget is the <nav> (its aria-label), the menu in it a div (`data-h-label` its name).
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
    // a div: the host is the <nav> (one navigation landmark, review 2026-11-15)
    const nav = document.createElement('div');
    nav.className = menuClass(settings);
    nav.setAttribute('data-h-label', this.options.label || 'Site menu');
    const items = [...(this.options.items || [])];
    if (settings.showHome && this.options.homeItem) items.unshift(this.options.homeItem);
    if (presentation === 'menu' || presentation === 'dropdown') {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'h-site-menu-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      if (presentation === 'dropdown') toggle.textContent = settings.label || $HR('Menu');
      else menuIcon(toggle);
      nav.append(toggle);
    }
    nav.append(this._list(items, 'h-site-menu-list', settings.selectableParent !== false));
    this.container.replaceChildren(nav);
    return this._activate(nav);
  }

  /** The menu button, the expanders of the tree (vertical, collapsed), the name of the navigation. */
  _activate(nav) {
    const toggle = [...nav.children].find((child) => child.classList?.contains('h-site-menu-toggle'));
    const dropdown = nav.classList.contains('h-site-menu-dropdown');
    if (toggle) {
      if (!dropdown) menuIcon(toggle);
      this.listen(toggle, 'click', () => {
        const open = !nav.classList.contains('is-open');
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        if (dropdown) {
          if (open) this._placeDropdown(nav);
        } else {
          this._showPanel(nav, open && nav.classList.contains('is-narrow'));
        }
      });
    }
    // the website menu: a tree when vertical or collapsed (its expanders are shown then)
    if (toggle && !dropdown) this._expanders(nav);
    else if (nav.classList.contains('h-site-menu-vertical') || nav.classList.contains('h-site-menu-auto')) this._expanders(nav);
    if (toggle && !dropdown) this._fitWidth(nav, toggle);
    this._label(nav);
    this.state = 'rendered';
    return this;
  }

  /**
   * The name of the navigation: on the <nav> host; a host that is not a nav (an older page): the menu is the
   * navigation itself.
   */
  _label(nav) {
    const label = $HR(nav.getAttribute('data-h-label') || nav.getAttribute('aria-label') || this.options.label || 'Site menu');
    if (nav.tagName === 'NAV') {
      if (!nav.getAttribute('aria-label')) nav.setAttribute('aria-label', label);
      return;
    }
    const host = this.container;
    if (host?.tagName === 'NAV') {
      if (!host.getAttribute('aria-label')) host.setAttribute('aria-label', label);
      return;
    }
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', label);
  }

  /**
   * The website menu: its items in one row (class h-site-menu-fit: no wrapping); behind its button when they do not
   * fit the width of the menu (class is-narrow), at any screen width; checked again when its place changes size. A
   * tree (a vertical menu from 641 px) has the room it needs.
   */
  _fitWidth(nav, toggle) {
    const list = [...nav.children].find((child) => child.classList?.contains('h-site-menu-list'));
    const Observer = globalThis.ResizeObserver;
    if (!list || !Observer) return;
    this._list$ = list;
    nav.classList.add('h-site-menu-fit');
    const fit = () => {
      if (this._fitting) return;
      this._fitting = true;
      const open = nav.classList.contains('is-open');
      // measured in its place, shown in one row
      this._showPanel(nav, false);
      nav.classList.remove('is-narrow');
      const column = globalThis.getComputedStyle?.(list).flexDirection === 'column';
      const narrow = !column && list.scrollWidth > list.clientWidth + 1;
      nav.classList.toggle('is-narrow', narrow);
      if (narrow && open) {
        this._showPanel(nav, true);
      } else if (open) {
        // the menu fits again: the open list is closed
        nav.classList.remove('is-open');
        toggle?.setAttribute('aria-expanded', 'false');
      }
      this._fitting = false;
    };
    fit();
    this._observer?.disconnect?.();
    this._observer = new Observer(fit);
    this._observer.observe(this.container);
  }

  /**
   * The open collapsed menu inside the header (review 2026-11-15, as before plan 27f: no drop-down): the list moves
   * into a panel, a full-width block after the row of the menu (out of every flex row around the menu, not out of
   * the header), so it moves the content below it down; back into the menu when closed.
   *
   * @param {HTMLElement} nav The menu.
   * @param {boolean} show
   */
  _showPanel(nav, show) {
    const list = this._list$;
    if (!list) return;
    if (!show) {
      if (this._panel) {
        nav.append(list);
        this._panel.remove();
        this._panel = null;
      }
      return;
    }
    if (this._panel) return;
    const panel = document.createElement('div');
    // the classes of the menu: its look and its tree
    panel.className = `${nav.className} h-site-menu-panel`;
    panel.setAttribute('role', 'navigation');
    panel.setAttribute('aria-label', $HR(nav.getAttribute('data-h-label') || this.options.label || 'Site menu'));
    const stop = nav.closest?.('.h-site-header') || null;
    let anchor = this.container || nav;
    while (anchor.parentElement && anchor.parentElement !== stop
      && /flex|grid/.test(globalThis.getComputedStyle?.(anchor.parentElement).display || '')) {
      anchor = anchor.parentElement;
    }
    anchor.after(panel);
    panel.append(list);
    this._panel = panel;
  }

  /** Stop observing the size; the list back from an open panel. */
  destroy() {
    this._observer?.disconnect?.();
    const nav = this._panel && this.container?.querySelector?.('.h-site-menu');
    if (nav) this._showPanel(nav, false);
    this._panel?.remove();
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

  /**
   * The tree of a vertical or collapsed menu: a button beside each page with sub pages opens / closes them (shown by
   * the CSS only in a tree); the branch of the current page is open.
   */
  _expanders(nav) {
    if (nav.classList.contains('h-site-menu-js')) return;
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
        // the rollover: the description of the page in every mode, else the title of an icon only entry (review 2026-11-14)
        const rollover = String(item.description || '').trim() || (item.format === 'icon' || (item.fa && !item.title) ? item.title || '' : '');
        if (rollover) target.setAttribute('title', rollover);
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
    // Saved filter (plan 27j): a link of the server; in the designer's draft only shown
    else if (item.action === 'savedFilter') entry.url = '#';
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

/** The button of a collapsed website menu: the "3 bars" icon, its name for screen readers (2026-11-14). */
function menuIcon(toggle) {
  toggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
  toggle.title = $HR('Menu');
  toggle.setAttribute('aria-label', toggle.title);
}
