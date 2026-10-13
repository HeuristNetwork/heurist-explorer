/**
 * @file ExplorerCompactToolbar.js
 * @brief Toolbar position "Compact": the toolbar buttons next to the panes they act
 *        on. All switching into and out of it lives here; the other toolbar
 *        positions do not know it exists.
 *
 * While active, the Explorer root carries `h-toolbar-compact` and:
 * - the left rail is a row of small buttons at the top of the West pane (a column in
 *   its collapsed strip). Search is hidden: the Query Source editor is always shown
 *   (unless a Filter Form covers it); a «/» button collapses and expands the pane.
 *   With the editor placed north (Horizontal), the buttons stay in the West pane;
 * - the right rail is a narrow column of small tool buttons, without the
 *   presentation buttons;
 * - presentations are switched by tabs on the module panes (ExplorerPaneTabs) and by
 *   shrink/grow buttons on the dividers (collapsed → normal → maximized). A pane
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
import './ExplorerCompactToolbar.css';

const COMPACT_CLASS = 'h-toolbar-compact';
const EDGE_REGIONS = ['north', 'west', 'east', 'south'];

/** Switches Explorer's toolbar into and out of the Compact position. */
export class ExplorerCompactToolbar {
  /**
   * @param {object} options
   * @param {import('../core/ExplorerApplication.js').ExplorerApplication} options.application Explorer instance.
   */
  constructor({ application } = {}) {
    if (!application) throw new TypeError('ExplorerCompactToolbar requires application');
    this.application = application;
    this.active = false;
    this.tabs = new ExplorerPaneTabs({ application });
    this._toggle = null;
    this._onWestChange = () => {
      this._syncToggle();
      this._resizeModules();
    };
    this._onModuleRegionChange = (event) => {
      void this._fillRegion(event.detail?.region);
      this._resizeModules();
    };
  }

  /** @returns {boolean} Whether the Compact toolbar is on. */
  isActive() { return this.active; }

  /**
   * Switch the Compact toolbar on or off (called by the control panel's toolbar configuration).
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

    app.container?.classList.toggle(COMPACT_CLASS, next);

    if (next) {
      // the editor is always shown; collapsing the West pane is the only way to hide it
      dock?.show();
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
    button.className = 'heurist-icon-button h-explorer-compact-pane-toggle';
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.application.authoringDock?.cardinal.toggle('west');
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
    button.title = $HR(collapsed ? 'Show the left pane' : 'Hide the left pane');
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-expanded', String(!collapsed));
  }

  /**
   * A pane with configured modules is never hidden in Compact: a hidden one (its
   * modules deferred at start, or hidden before) becomes a collapsed strip with
   * its modules' icons. Not in Tools mode, which owns the layout meanwhile.
   *
   * @private
   * @returns {void}
   */
  _revealConfiguredPanes() {
    const layout = this.application.layout;
    if (!layout || layout.isToolMode?.()) return;
    const cardinal = layout.cardinal;
    for (const [region, types] of this.tabs.paneTypes()) {
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
    if (!state?.visible || state.collapsed || layout.isToolMode?.()) return;
    if (layout.getModuleForRegion(region)) return;
    const type = this.tabs.paneTypes().get(region)?.[0];
    if (type) await this.application.showPresentation(type);
  }

  /**
   * Leaving Compact: maximized panes back to normal, collapsed ones expanded, and
   * the strips of panes without a module hidden again.
   *
   * @private
   * @returns {void}
   */
  _restoreRegions() {
    const layout = this.application.layout;
    if (!layout || layout.isToolMode?.()) return;
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
