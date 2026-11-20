/**
 * @file ExplorerOptionsMenu.js
 * @brief The Options menu of Explorer: Configuration, Base style settings, Help, the management tools and the
 *        temporary test tools. One menu for the gear of the "In panes" toolbar (ExplorerPaneToolbar) and the
 *        Options button of the right rail (Vertical / Horizontal toolbar; 2026-11-20, the buttons of the
 *        Configuration popup footer moved here).
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

/**
 * The items of the Options menu: [label, action]; null is a separator.
 *
 * @param {object} app The Explorer application.
 * @returns {Array<[string, Function]|null>}
 */
export function optionsMenuItems(app) {
  return [
    ['Configuration', () => app.controlPanel?.openConfiguration()],
    // colours and fonts of the Explorer UI (2026-11-20)
    ['Base style settings', () => void app.controlPanel?.openBaseStyle()],
    ['Help', () => app.controlPanel?.openHelp()],
    ['Getting started', () => app.showWelcome?.()],
    null,
    ['Manage tags', () => void app.manageTags?.()],
    ['Manage registered files', () => void app.manageFiles?.()],
    ['Manage users', () => void app.manageUsers?.()],
    ['Manage groups', () => void app.manageGroups?.()],
    null,
    // plan 27b §11: management tools, not pane modules
    ['Publish this view', () => void app.publishView?.()],
    ['Websites and published pages', () => void app.openWebsiteManager?.()],
    null,
    ['Query tracer', () => app.showQueryTrace?.()],
    // temporary (plan 14a)
    ['Test edit form', () => void app.controlPanel?.openEditFormTest()],
    // temporary (plan 29)
    ['Test module configuration', () => void app.controlPanel?.openModuleConfigurationTest()]
  ];
}

/**
 * The menu list (`ul.h-menu`) of the Options menu.
 *
 * @param {object} app The Explorer application.
 * @param {Function} onPick Called before the action of a chosen item (closes the menu).
 * @returns {HTMLUListElement}
 */
export function createOptionsMenuList(app, onPick) {
  const menu = document.createElement('ul');
  menu.className = 'h-menu h-explorer-options-menu';
  menu.setAttribute('role', 'menu');
  for (const entry of optionsMenuItems(app)) {
    const item = document.createElement('li');
    if (!entry) {
      item.setAttribute('role', 'separator');
      const divider = document.createElement('hr');
      divider.className = 'h-menu-divider';
      item.append(divider);
      menu.append(item);
      continue;
    }
    const [label, action] = entry;
    // no query tracer in the simplified interface (CSS on h-explorer-simplified)
    if (label === 'Query tracer') item.className = 'h-explorer-pane-toolbar-trace';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'h-menu-item h-i18n';
    button.setAttribute('role', 'menuitem');
    button.textContent = $HR(label);
    button.addEventListener('click', () => {
      onPick?.();
      action();
    });
    item.append(button);
    menu.append(item);
  }
  return menu;
}

/**
 * Put a dropdown menu next to its button, in fixed position: below it, or to the
 * right of it when the button is in the narrow collapsed strip or in a vertical rail;
 * kept in the window.
 *
 * @param {HTMLElement} menu The `.h-menu` list.
 * @param {HTMLElement} anchor The button that opened it.
 * @returns {void}
 */
export function placeMenu(menu, anchor) {
  const box = anchor.getBoundingClientRect();
  const width = menu.offsetWidth || 180;
  const height = menu.offsetHeight || 0;
  const inStrip = Boolean(anchor.closest('.h-cardinal-west.is-collapsed'));
  let left = inStrip ? box.right + 2 : box.right - width;
  let top = inStrip ? box.bottom - height : box.bottom + 2;
  left = Math.max(4, Math.min(left, window.innerWidth - width - 4));
  top = Math.max(4, Math.min(top, window.innerHeight - height - 4));
  Object.assign(menu.style, { position: 'fixed', left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
}

/**
 * The Options menu opened by a button (the Options button of the right rail): a floating
 * menu in Explorer's container, closed by a choice, a click outside or Escape.
 */
export class ExplorerOptionsPopup {
  /**
   * @param {object} app The Explorer application.
   */
  constructor(app) {
    this.app = app;
    this.menu = null;
    this.anchor = null;
    this._onOutsidePointer = (event) => {
      if (!this.menu?.contains(event.target) && !this.anchor?.contains(event.target)) this.close();
    };
    this._onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      const anchor = this.anchor;
      this.close();
      anchor?.focus?.();
    };
  }

  /** @returns {boolean} Whether the menu is open. */
  isOpen() { return Boolean(this.menu); }

  /**
   * Open the menu at a button, or close it when it is open (a second click on the button).
   *
   * @param {HTMLElement} anchor The button.
   * @returns {void}
   */
  toggle(anchor) {
    if (this.menu) {
      this.close();
      return;
    }
    this.anchor = anchor;
    this.menu = createOptionsMenuList(this.app, () => this.close());
    this.menu.classList.add('h-explorer-options-popup');
    (this.app.container || document.body).append(this.menu);
    placeMenu(this.menu, anchor);
    document.addEventListener('pointerdown', this._onOutsidePointer, true);
    document.addEventListener('keydown', this._onKey, true);
    this.menu.querySelector('button')?.focus();
  }

  /**
   * Close the menu.
   *
   * @returns {void}
   */
  close() {
    document.removeEventListener('pointerdown', this._onOutsidePointer, true);
    document.removeEventListener('keydown', this._onKey, true);
    this.menu?.remove();
    this.menu = null;
    this.anchor = null;
  }
}
