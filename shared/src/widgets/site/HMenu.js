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
 * `presentation` of an action menu: row, icons, expand (the items behind a button, `open` on hover / focus / click or on
 * a click only, `icon` of the button, `buttonText` its name shown; a stored dropdown = expand opened by a click, review
 * 2026-11-16) or grow (icons that show their name on hover), stored `links` / `buttons` = row with that style; `style` of
 * the items (plan 27k §1): plain, links, underline, pills, buttons or outline (`lineWidth` / `lineColor` of the underline,
 * menuStyle); `orientation` of an action menu horizontal / vertical. An item: title, url, current, home (the home page:
 * its caption is "Home", review 2026-11-16),
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
import { MENU_EXPAND_ICON, faIcon, menuClass, menuLook, menuStyle } from '../../site/cmsMenu.js';
import './HMenu.css';

// the rules of the settings are in shared/src/site/cmsMenu.js (no CSS: the designer forms import them, plan 27k §7)
export { ITEM_COLORS, MENU_ANIMATIONS, MENU_EXPAND_ICON, MENU_PRESENTATIONS, MENU_STYLES, menuClass, menuLook, menuStyle } from '../../site/cmsMenu.js';

/** Time of the animation of the full-screen menu (plan 27k §5, HMenu.css), ms. */
const OVERLAY_MS = 300;

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
    const { presentation, buttonText } = menuLook(settings);
    // a div: the host is the <nav> (one navigation landmark, review 2026-11-15)
    const nav = document.createElement('div');
    nav.className = menuClass(settings);
    // the underline and the full-screen colours of the settings (review 2026-11-16)
    const inline = menuStyle(settings);
    if (inline) nav.setAttribute('style', inline);
    // the website menu, not an action menu (PageRenderer::menuHtml; the shrunk header keeps it, plan 27k §4)
    if (presentation === 'menu') nav.classList.add('h-site-menu-main');
    nav.setAttribute('data-h-label', this.options.label || 'Site menu');
    const items = [...(this.options.items || [])];
    if (settings.showHome && this.options.homeItem) items.unshift(this.options.homeItem);
    if (['menu', 'expand'].includes(presentation)) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'h-site-menu-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      if (presentation === 'expand') expandIcon(toggle, settings.icon, settings.label || $HR(buttonText ? 'Menu' : 'Actions'), buttonText);
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
    // an action menu behind a button (plan 27k §2; h-site-menu-dropdown: a page written before 2026-11-16): its list
    // opens over the page
    const popup = nav.classList.contains('h-site-menu-dropdown') || nav.classList.contains('h-site-menu-expanding');
    if (toggle) {
      if (!popup) menuIcon(toggle);
      const setOpen = (open) => {
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
      };
      // the full-screen website menu (plan 27k §5): the open collapsed menu over the whole window
      const fullscreen = !popup && nav.classList.contains('h-site-menu-fullscreen');
      if (fullscreen) {
        this._toggle$ = toggle;
        this._closeOverlay = () => {
          setOpen(false);
          this._showOverlay(nav, false);
        };
      }
      this.listen(toggle, 'click', () => {
        const open = !nav.classList.contains('is-open');
        setOpen(open);
        if (popup) {
          if (open) this._placeDropdown(nav);
        } else if (fullscreen) {
          this._showOverlay(nav, open && nav.classList.contains('is-narrow'));
        } else {
          this._showPanel(nav, open && nav.classList.contains('is-narrow'));
        }
      });
      if (popup) {
        // closed by a click outside and by Esc; the expanding list is placed before it opens on hover
        if (globalThis.document) {
          this.listen(document, 'click', (event) => {
            if (nav.classList.contains('is-open') && !nav.contains?.(event.target)) setOpen(false);
          });
        }
        this.listen(nav, 'keydown', (event) => {
          if (event.key !== 'Escape' || !nav.classList.contains('is-open')) return;
          setOpen(false);
          toggle.focus?.();
        });
        if (nav.classList.contains('h-site-menu-expanding') && !nav.classList.contains('h-site-menu-open-click')) {
          this.listen(nav, 'mouseenter', () => this._placeDropdown(nav));
        }
      }
    }
    // the drop-downs of a horizontal menu: to the left of their page near the right edge of the window (review 2026-11-16)
    if (!popup) {
      const place = (event) => this._placeSub(event.target?.closest?.('.h-site-menu-item.has-children'));
      this.listen(nav, 'mouseover', place);
      this.listen(nav, 'focusin', place);
    }
    // the home page: "Home" in the language of the page (review 2026-11-16; the server writes Home)
    for (const text of nav.querySelectorAll?.('.h-site-menu-item.is-home .h-site-menu-text') || []) text.textContent = $HR('Home');
    // the website menu: a tree when vertical or collapsed (its expanders are shown then)
    if (toggle && !popup) this._expanders(nav);
    else if (nav.classList.contains('h-site-menu-vertical') || nav.classList.contains('h-site-menu-auto')) this._expanders(nav);
    if (toggle && !popup) this._fitWidth(nav, toggle);
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
    // always collapsed (plan 27k §5): the menu button on every screen
    const always = nav.classList.contains('h-site-menu-always-collapsed');
    const fit = () => {
      // the open full-screen menu has the list: measured again when it is closed
      if (this._fitting || this._overlay) return;
      this._fitting = true;
      const open = nav.classList.contains('is-open');
      // measured in its place, shown in one row
      this._showPanel(nav, false);
      nav.classList.remove('is-narrow');
      const column = globalThis.getComputedStyle?.(list).flexDirection === 'column';
      const narrow = always || (!column && list.scrollWidth > list.clientWidth + 1);
      nav.classList.toggle('is-narrow', narrow);
      if (narrow && open) {
        if (!nav.classList.contains('h-site-menu-fullscreen')) this._showPanel(nav, true);
      } else if (open) {
        // the menu fits again: the open list is closed
        nav.classList.remove('is-open');
        toggle?.setAttribute('aria-expanded', 'false');
      }
      this._fitting = false;
    };
    fit();
    this._fit = fit;
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
    // the classes of the menu: its look and its tree; its variables (line colour ...: the panel is outside the menu, review
    // 2026-11-16: else the line took the text colour)
    panel.className = `${nav.className} h-site-menu-panel`;
    if (nav.getAttribute('style')) panel.setAttribute('style', nav.getAttribute('style'));
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

  /**
   * The full-screen website menu (plan 27k §5): the list moves into an overlay over the whole window (a dialog with a
   * close button; Esc, a link and the button close it; Tab stays inside; the page does not scroll behind it), shown
   * with the animation of the menu (class h-site-menu-anim-*, CSS); back into the menu after it is closed.
   *
   * @param {HTMLElement} nav The menu.
   * @param {boolean} show
   */
  _showOverlay(nav, show) {
    const list = this._list$;
    if (!list) return;
    const doc = nav.ownerDocument || document;
    if (!show) {
      const overlay = this._overlay;
      if (!overlay) return;
      this._overlay = null;
      doc.documentElement?.classList.remove('h-site-menu-locked');
      overlay.classList.remove('is-open');
      const panel = this._overlayPanel;
      this._overlayPanel = null;
      const finish = () => {
        // not when it was opened again meanwhile (the list is in the new overlay)
        if (list.parentElement === panel) nav.append(list);
        overlay.remove();
        this._fit?.();
      };
      const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      if (reduced || typeof globalThis.setTimeout !== 'function') finish(); else globalThis.setTimeout(finish, OVERLAY_MS);
      this._toggle$?.focus?.();
      return;
    }
    if (this._overlay) return;
    const label = $HR(nav.getAttribute('data-h-label') || this.options.label || 'Site menu');
    const overlay = doc.createElement('div');
    overlay.className = ['h-site-menu-overlay', ...['right', 'fade'].filter((name) => nav.classList.contains(`h-site-menu-anim-${name}`))
      .map((name) => `h-site-menu-anim-${name}`), nav.closest?.('.h-site-header') ? 'h-site-menu-overlay-header' : ''].filter(Boolean).join(' ');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    // the colours of the full-screen menu (review 2026-11-16): variables of the menu, the overlay is outside it
    if (nav.getAttribute('style')) overlay.setAttribute('style', nav.getAttribute('style'));
    overlay.setAttribute('aria-label', label);
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'h-site-menu-close';
    close.title = $HR('Close');
    close.setAttribute('aria-label', close.title);
    close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    const panel = doc.createElement('div');
    // the classes of the menu: its look and its tree
    panel.className = `${nav.className} h-site-menu-panel`;
    panel.append(list);
    overlay.append(close, panel);
    (doc.body || nav.parentElement).append(overlay);
    this._overlay = overlay;
    this._overlayPanel = panel;
    doc.documentElement?.classList.add('h-site-menu-locked');
    this.listen(close, 'click', () => this._closeOverlay?.());
    // a link closes it (the page opens, or the navigator of swap / scroll shows it)
    this.listen(overlay, 'click', (event) => {
      if (event.target?.closest?.('a[href]')) this._closeOverlay?.();
    });
    this.listen(overlay, 'keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault?.();
        this._closeOverlay?.();
      } else if (event.key === 'Tab') {
        trapFocus(overlay, event);
      }
    });
    // the start of its animation: the class after it is in the page
    const start = () => overlay.classList.add('is-open');
    if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(start); else start();
    close.focus?.();
  }

  /** Stop observing the size; the list back from an open panel or full-screen menu. */
  destroy() {
    this._observer?.disconnect?.();
    const nav = (this._panel || this._overlay) && this.container?.querySelector?.('.h-site-menu');
    if (nav) this._showPanel(nav, false);
    if (this._overlay) {
      if (nav && this._list$) nav.append(this._list$);
      this._overlay.ownerDocument?.documentElement?.classList.remove('h-site-menu-locked');
      this._overlay.remove();
      this._overlay = null;
    }
    this._panel?.remove();
    super.destroy?.();
  }

  /**
   * The open list of a dropdown action menu: below the button, aligned to its left edge; to its right edge (class
   * is-end) when it would leave the window on the right and there is room on the left (2026-11-12). The list of an
   * expanding menu (plan 27k §2): beside its button (below when vertical), on the other side (is-end) the same way.
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
   * A drop-down of a horizontal menu (a sub menu shown on hover / focus): opened to the left of its page (class is-end)
   * when it would leave the window on the right and there is room on the left; deeper levels the same way. Not in a tree.
   *
   * @param {HTMLElement|null} item An item with sub pages.
   */
  _placeSub(item) {
    const sub = item && [...item.children].find((child) => child.classList?.contains('h-site-menu-sub'));
    if (!sub?.getBoundingClientRect) return;
    item.classList.remove('is-end');
    const width = globalThis.innerWidth || document.documentElement?.clientWidth || 0;
    const box = sub.getBoundingClientRect();
    if (!width || !box.width || globalThis.getComputedStyle?.(sub).position !== 'absolute') return;
    const left = item.getBoundingClientRect().right - box.width;
    if (box.right > width && left >= 0) item.classList.add('is-end');
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

  /** The form of a search box in the designer's draft (PageRenderer::searchForm without its target). */
  _searchForm(item) {
    const form = document.createElement('form');
    form.className = 'h-site-search';
    form.setAttribute('role', 'search');
    const placeholder = String(item.search.placeholder || '').trim() || $HR('Search');
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'h-site-search-input';
    input.name = `v.${item.search.param}`;
    input.placeholder = placeholder;
    input.setAttribute('aria-label', placeholder);
    const button = document.createElement('button');
    button.type = 'submit';
    button.className = 'h-site-search-button';
    button.title = placeholder;
    button.setAttribute('aria-label', placeholder);
    const glyph = document.createElement('i');
    glyph.className = item.fa || 'fa-solid fa-magnifying-glass';
    glyph.setAttribute('aria-hidden', 'true');
    button.append(glyph);
    form.append(input, button);
    this.listen(form, 'submit', (event) => event.preventDefault());
    return form;
  }

  /** A list of menu items with all their sub items (PageRenderer::menuList). */
  _list(items, className, selectableParent) {
    const list = document.createElement('ul');
    list.className = className;
    for (const item of items) {
      const entry = document.createElement('li');
      entry.className = 'h-site-menu-item';
      if (item.search) {
        // a search box of an action menu (plan 27k §6, PageRenderer::searchForm): the draft of the designer sends nothing
        entry.classList.add('h-site-menu-search');
        entry.append(this._searchForm(item));
        list.append(entry);
        continue;
      }
      if (item.hidden) entry.classList.add('is-menu-hidden');
      if (item.home) entry.classList.add('is-home');
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
 *        addRecord, recordPage, back, savedFilter, search, toggle.
 * @param {{language?: string, pageUrl?: (id: number) => string}} [context]
 * @returns {Array<object>}
 */
export function actionMenuItems(settings = {}, { language = '', pageUrl = () => '#' } = {}) {
  const items = [];
  for (const item of Array.isArray(settings.items) ? settings.items : []) {
    if (!item || typeof item !== 'object') continue;
    const entry = {
      // fa-solid when the icon has no style (review 2026-11-16)
      title: item.labels?.[language] ?? item.label ?? '', url: '#', fa: faIcon(item.icon),
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
    // a search box (plan 27k §6): a form of the server; in the designer's draft only shown
    else if (item.action === 'search') entry.search = { param: String(item.param || ''), placeholder: entry.title };
    // Show / hide an element (plan 27n §10): the node id of the element
    else if (item.action === 'toggle') Object.assign(entry, { action: 'toggle', target: String(item.target ?? '') });
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

/** Keep Tab inside a dialog: from the last focusable element to the first and back (Shift+Tab). */
function trapFocus(dialog, event) {
  const items = [...dialog.querySelectorAll('a[href], button')].filter((item) => !item.disabled && item.offsetParent !== null);
  if (!items.length) return;
  const active = dialog.ownerDocument?.activeElement;
  const [first, last] = [items[0], items.at(-1)];
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function hasCurrent(items) {
  return items.some((item) => item.current || hasCurrent(item.children || []));
}

/**
 * The button of an action menu behind a button (plan 27k §2, PageRenderer::actionMenuHtml): its icon, its name shown
 * (`text`, review 2026-11-16: the former drop-down) or as the rollover, and for screen readers. Without an icon and
 * name: MENU_EXPAND_ICON.
 *
 * @param {HTMLButtonElement} toggle
 * @param {string} icon Font Awesome classes.
 * @param {string} label
 * @param {boolean} [text] The name on the button.
 */
function expandIcon(toggle, icon, label, text = false) {
  const nodes = [];
  const valid = faIcon(icon);
  if (valid || !text) {
    const glyph = document.createElement('i');
    glyph.className = valid || MENU_EXPAND_ICON;
    glyph.setAttribute('aria-hidden', 'true');
    nodes.push(glyph);
  }
  if (text) {
    const name = document.createElement('span');
    name.className = 'h-site-menu-toggle-text';
    name.textContent = label;
    nodes.push(name);
  }
  toggle.replaceChildren(...nodes);
  toggle.title = label;
  toggle.setAttribute('aria-label', label);
}

/** The button of a collapsed website menu: the "3 bars" icon, its name for screen readers (2026-11-14). */
function menuIcon(toggle) {
  toggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
  toggle.title = $HR('Menu');
  toggle.setAttribute('aria-label', toggle.title);
}
