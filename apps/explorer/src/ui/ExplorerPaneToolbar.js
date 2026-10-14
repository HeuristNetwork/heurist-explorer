/**
 * @file ExplorerPaneToolbar.js
 * @brief Toolbar position "In panes": the toolbar buttons next to the panes they act
 *        on. All switching into and out of it lives here; the other toolbar
 *        positions do not know it exists.
 *
 * While active, the Explorer root carries `h-toolbar-panes` and:
 * - the left rail is a row of small buttons at the top of the West pane (a column in
 *   its collapsed strip). Search is hidden: the Query Source editor is always shown
 *   (unless a Filter Form covers it); a «/» button collapses and expands the pane.
 *   With the editor placed north (Horizontal), the buttons stay in the West pane;
 *   a gear at the end of the row opens a menu: Configuration, Help, Getting started,
 *   Query tracer;
 * - there is no right rail: presentations and tools (both placed in panes by the
 *   configuration) are switched by tabs on the module panes (ExplorerPaneTabs) and
 *   by shrink/grow buttons on the dividers (collapsed → normal → maximized). A pane
 *   with configured modules is never hidden, only collapsed; growing an empty pane
 *   creates its first module.
 *
 * Not to be confused with ExplorerCompactMode (narrow screens), which wins: it
 * switches the toolbar to horizontal, and so this off, below its breakpoint.
 * See docs/development/16 Compact-Toolbar-Plan.md.
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
import { ExplorerPaneTabs } from './ExplorerPaneTabs.js';
import './ExplorerPaneToolbar.css';

const PANES_CLASS = 'h-toolbar-panes';
const EDGE_REGIONS = ['north', 'west', 'east', 'south'];

/** Switches Explorer's toolbar into and out of the "In panes" position. */
export class ExplorerPaneToolbar {
  /**
   * @param {object} options
   * @param {import('../core/ExplorerApplication.js').ExplorerApplication} options.application Explorer instance.
   */
  constructor({ application } = {}) {
    if (!application) throw new TypeError('ExplorerPaneToolbar requires application');
    this.application = application;
    this.active = false;
    this.tabs = new ExplorerPaneTabs({ application });
    this._toggle = null;
    this._settings = null;
    this._onOutsidePointer = (event) => {
      if (this._settings?.open && !this._settings.contains(event.target)) this._settings.open = false;
    };
    this._onWestChange = () => {
      this._syncToggle();
      this._resizeModules();
    };
    this._onModuleRegionChange = (event) => {
      void this._fillRegion(event.detail?.region);
      this._resizeModules();
    };
  }

  /** @returns {boolean} Whether the "In panes" toolbar is on. */
  isActive() { return this.active; }

  /**
   * Switch the "In panes" toolbar on or off (called by the control panel's toolbar configuration).
   *
   * @param {boolean} on Whether it should be active.
   * @returns {void}
   */
  setActive(on) {
    const next = on === true;
    if (next === this.active) return;
    this.active = next;
    const app = this.application;
    const dock = app.authoringDock;
    const layout = app.layout;
    const rail = app.controlPanel?.leftRail;

    app.container?.classList.toggle(PANES_CLASS, next);

    if (next) {
      // the editor is always shown; collapsing the West pane is the only way to hide it
      dock?.show();
      this._mountSettings(rail);
      this._mountToggle(rail);
      dock?.setToolbar(rail?.element || null);
      dock?.cardinal.addEventListener('regioncollapsechange', this._onWestChange);
      layout?.cardinal.setSplitterButtons(true);
      layout?.addEventListener('regioncollapsechange', this._onModuleRegionChange);
      layout?.addEventListener('regionmaximizechange', this._onModuleRegionChange);
      this.tabs.start();
      this.refresh();
    } else {
      dock?.cardinal.removeEventListener('regioncollapsechange', this._onWestChange);
      layout?.removeEventListener('regioncollapsechange', this._onModuleRegionChange);
      layout?.removeEventListener('regionmaximizechange', this._onModuleRegionChange);
      this.tabs.stop();
      layout?.cardinal.setSplitterButtons(false);
      this._restoreRegions();
      dock?.setToolbar(null);
      if (rail?.element) app.container?.append(rail.element);
      this._toggle?.remove();
      this._toggle = null;
      this._settings?.remove();
      this._settings = null;
      document.removeEventListener('pointerdown', this._onOutsidePointer, true);
    }

    app.syncSearchButton?.();
    app.controlPanel?.refreshPresentationState?.();
    this._resizeModules();
  }

  /**
   * Re-apply after the layout or the configuration changed: panes with configured
   * modules are shown (collapsed when they have no module yet), the tabs follow.
   *
   * @returns {void}
   */
  refresh() {
    if (!this.active) return;
    this._revealConfiguredPanes();
    this.tabs.render();
    this._syncToggle();
  }

  /** Switch off and drop listeners. */
  destroy() {
    this.setActive(false);
  }

  /**
   * The gear at the end of the left rail (before «/»): a menu with what the right
   * rail's settings buttons offer in the other toolbar positions.
   *
   * @private
   * @param {import('./ExplorerRail.js').ExplorerRail|null} rail Left rail.
   * @returns {void}
   */
  _mountSettings(rail) {
    if (!rail?.element) return;
    const app = this.application;
    const details = document.createElement('details');
    details.className = 'h-dropdown h-explorer-pane-toolbar-settings';
    const summary = document.createElement('summary');
    summary.className = 'heurist-icon-button';
    summary.title = $HR('Configuration and help');
    summary.setAttribute('aria-label', summary.title);
    const icon = document.createElement('span');
    icon.className = 'fa-solid fa-gear';
    icon.setAttribute('aria-hidden', 'true');
    summary.append(icon);

    const menu = document.createElement('ul');
    menu.className = 'h-menu';
    menu.setAttribute('role', 'menu');
    const items = [
      ['Configuration', () => app.controlPanel?.openConfiguration()],
      ['Help', () => app.controlPanel?.openHelp()],
      ['Getting started', () => app.showWelcome?.()],
      ['Query tracer', () => app.showQueryTrace?.()]
    ];
    for (const [label, action] of items) {
      const item = document.createElement('li');
      // no query tracer in the simplified interface (CSS on h-explorer-simplified)
      if (label === 'Query tracer') item.className = 'h-explorer-pane-toolbar-trace';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'h-menu-item h-i18n';
      button.setAttribute('role', 'menuitem');
      button.textContent = $HR(label);
      button.addEventListener('click', () => {
        details.open = false;
        action();
      });
      item.append(button);
      menu.append(item);
    }

    details.append(summary, menu);
    // fixed position next to the gear: the collapsed West strip clips its content
    details.addEventListener('toggle', () => {
      if (details.open) {
        placeMenu(menu, summary);
        document.addEventListener('pointerdown', this._onOutsidePointer, true);
      } else {
        document.removeEventListener('pointerdown', this._onOutsidePointer, true);
      }
    });
    details.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !details.open) return;
      event.stopPropagation();
      details.open = false;
      summary.focus();
    });
    rail.element.append(details);
    this._settings = details;
  }

  /**
   * The «/» button at the end of the left rail: collapses / expands the West pane.
   *
   * @private
   * @param {import('./ExplorerRail.js').ExplorerRail|null} rail Left rail.
   * @returns {void}
   */
  _mountToggle(rail) {
    if (!rail?.element) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'heurist-icon-button h-explorer-pane-toolbar-toggle';
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const cardinal = this.application.authoringDock?.cardinal;
      const opening = cardinal?.state.west.collapsed === true;
      cardinal?.toggle('west');
      // opened by «/»: the Saved Filters list unless another list is shown (2026-10-14)
      if (opening) this.application.controlPanel?.showDefaultList?.();
    });
    this._toggleIcon = icon;
    rail.element.append(button);
    this._toggle = button;
    this._syncToggle();
  }

  /** @private Icon and tip of the «/» button from the West pane's state. */
  _syncToggle() {
    const button = this._toggle;
    if (!button) return;
    const collapsed = this.application.authoringDock?.cardinal.state.west.collapsed === true;
    this._toggleIcon.className = `fa-solid ${collapsed ? 'fa-angles-right' : 'fa-angles-left'}`;
    button.title = $HR(collapsed ? 'Show the search pane' : 'Hide the search pane');
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-expanded', String(!collapsed));
  }

  /**
   * A pane with configured modules is never hidden "In panes": a hidden one (its
   * modules deferred at start, or hidden before) becomes a collapsed strip with
   * its modules' icons. A pane left without modules (all moved elsewhere or to
   * Unused) is hidden.
   *
   * @private
   * @returns {void}
   */
  _revealConfiguredPanes() {
    const layout = this.application.layout;
    if (!layout) return;
    const cardinal = layout.cardinal;
    const panes = this.tabs.paneTypes();
    for (const region of EDGE_REGIONS) {
      if (!panes.has(region) && !layout.getModuleForRegion(region)) cardinal.hide(region);
    }
    for (const [region, types] of panes) {
      if (!types.length || cardinal.state[region]?.visible) continue;
      if (!EDGE_REGIONS.includes(region)) void this.application.showPresentation(types[0]);
      // hidden while collapsed keeps the flag: collapse() would not show it
      else if (cardinal.state[region].collapsed) cardinal.show(region);
      else cardinal.collapse(region);
    }
  }

  /**
   * A pane given space (expanded or maximized) with no module yet: create and show
   * its first configured module.
   *
   * @private
   * @param {string} region Pane region.
   * @returns {Promise<void>}
   */
  async _fillRegion(region) {
    const layout = this.application.layout;
    const state = region ? layout?.cardinal.state[region] : null;
    if (!state?.visible || state.collapsed) return;
    if (layout.getModuleForRegion(region)) return;
    const type = this.tabs.paneTypes().get(region)?.[0];
    if (type) await this.application.showPresentation(type);
  }

  /**
   * Leaving "In panes": maximized panes back to normal, collapsed ones expanded, and
   * the strips of panes without a module hidden again.
   *
   * @private
   * @returns {void}
   */
  _restoreRegions() {
    const layout = this.application.layout;
    if (!layout) return;
    const cardinal = layout.cardinal;
    for (const region of EDGE_REGIONS) {
      cardinal.restore(region);
      if (!cardinal.state[region].collapsed) continue;
      if (layout.getModuleForRegion(region)) cardinal.expand(region);
      else cardinal.hide(region);
    }
  }

  /** @private Panes changed size: let map/timeline/graph engines re-measure (after the layout). */
  _resizeModules() {
    const modules = this.application.modules;
    if (!modules?.size) return;
    (globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 0)))(() => {
      for (const module of modules.values()) void module.resize?.();
    });
  }
}

/**
 * Put a dropdown menu next to its button, in fixed position: below it, or to the
 * right of it when the button is in the narrow collapsed strip; kept in the window.
 *
 * @param {HTMLElement} menu The `.h-menu` list.
 * @param {HTMLElement} anchor The button that opened it.
 * @returns {void}
 */
function placeMenu(menu, anchor) {
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
