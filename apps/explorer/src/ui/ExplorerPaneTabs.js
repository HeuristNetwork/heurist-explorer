/**
 * @file ExplorerPaneTabs.js
 * @brief "In panes" toolbar position: a tab strip (icon and name) on each module pane
 *        that holds more than one module; a collapsed pane shows its modules' icons.
 *
 * The tabs list the module types configured for the pane (Explorer configuration,
 * Layout): presentations and tools, also those deferred at start and not created
 * yet. A tab shows its module (ExplorerApplication#showPresentation); in a collapsed
 * or squeezed pane it first gives the pane its space back. When the names do not fit
 * the pane's width, the strip shows icons only and wraps. A collapsed pane shows its
 * tabs in the toolbar buttons size (Explorer configuration), and a click anywhere
 * on it expands it with its shown module. HCardinalLayout stays
 * module-agnostic: the strips are Explorer's. See docs/development/16 DONE Compact-Toolbar-Plan.md.
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
import { moduleTypesInOrder } from '../core/ExplorerUiConfig.js';
import { rightButtons } from './ExplorerControlPanel.js';
import './ExplorerPaneTabs.css';

const REGIONS = ['north', 'west', 'center', 'east', 'south'];
const EDGE_REGIONS = ['north', 'west', 'east', 'south'];
const LAYOUT_EVENTS = ['moduleassignmentchange', 'modulevisibilitychange'];

/** Tab strips over the module panes. */
export class ExplorerPaneTabs {
  /**
   * @param {object} options
   * @param {import('../core/ExplorerApplication.js').ExplorerApplication} options.application Explorer instance.
   */
  constructor({ application } = {}) {
    if (!application) throw new TypeError('ExplorerPaneTabs requires application');
    this.application = application;
    this.active = false;
    this.strips = new Map();
    // width of each strip with the tab names, measured while they were shown
    this._fullWidths = new Map();
    this._buttons = new Map(rightButtons().map((definition) => [definition.id, definition]));
    this._onLayoutChange = () => this.render();
    // hosts given the click-to-expand listener
    this._clickHosts = new WeakSet();
    this._resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => this._fitAll())
      : null;
  }

  /** Show the strips and follow the layout. @returns {ExplorerPaneTabs} This instance. */
  start() {
    if (this.active) return this;
    this.active = true;
    for (const name of LAYOUT_EVENTS) this.application.layout?.addEventListener(name, this._onLayoutChange);
    this.render();
    return this;
  }

  /** Remove the strips and stop following the layout. */
  stop() {
    if (!this.active) return;
    this.active = false;
    for (const name of LAYOUT_EVENTS) this.application.layout?.removeEventListener(name, this._onLayoutChange);
    this._resizeObserver?.disconnect();
    for (const region of [...this.strips.keys()]) this._removeStrip(region);
  }

  /**
   * Module types configured for each pane, in toolbar order (none in Unused).
   *
   * @returns {Map<string, Array<string>>} Region → module types.
   */
  paneTypes() {
    const config = this.application.uiConfigValue || {};
    const panes = new Map();
    for (const type of moduleTypesInOrder(config)) {
      const region = config.regions?.[type];
      if (!REGIONS.includes(region)) continue;
      if (!panes.has(region)) panes.set(region, []);
      panes.get(region).push(type);
    }
    return panes;
  }

  /** Rebuild every pane's strip from the configuration and the current occupants. */
  render() {
    if (!this.active) return;
    const layout = this.application.layout;
    if (!layout) return;
    const panes = this.paneTypes();

    for (const region of REGIONS) {
      const types = panes.get(region) || [];
      if (!types.length) {
        this._removeStrip(region);
        continue;
      }
      const tabs = types.map((type) => ({ id: type, ...this._definition(type) }));
      this._renderStrip(region, tabs, this._activeTab(region));
    }
  }

  /**
   * Show a pane's module from its tab: give the pane its space back (collapsed or
   * squeezed by a maximized pane), then show the module.
   *
   * @param {string} region Pane region.
   * @param {string} type Module type.
   * @returns {Promise<boolean>} Whether a module is shown.
   */
  async select(region, type) {
    const cardinal = this.application.layout?.cardinal;
    if (!cardinal) return false;
    for (const other of EDGE_REGIONS) {
      if (other !== region && cardinal.isMaximized(other)) cardinal.restore(other);
    }
    if (region !== 'center' && cardinal.state[region]?.collapsed) cardinal.expand(region);
    return Boolean(await this.application.showPresentation(type));
  }

  /** @private The module type shown in a pane. */
  _activeTab(region) {
    const layout = this.application.layout;
    const moduleId = layout.getModuleForRegion(region);
    return moduleId ? layout.getSlot(moduleId)?.dataset.moduleType || null : null;
  }

  /** @private Icon and title of a module type (the right rail's buttons). */
  _definition(id) {
    const definition = this._buttons.get(id);
    return { icon: definition?.icon || 'fa-solid fa-square', title: definition?.title || String(id || '') };
  }

  /**
   * Build or update one pane's strip. A pane with one module keeps its strip, which
   * is shown only while the pane is collapsed (its icon tells what is there).
   *
   * @private
   * @param {string} region Pane region.
   * @param {Array<{id: string, icon: string, title: string}>} tabs Tabs, in order.
   * @param {string|null} activeId The shown module type.
   * @returns {void}
   */
  _renderStrip(region, tabs, activeId) {
    const host = this.application.layout.cardinal.getRegionElement(region);
    let strip = this.strips.get(region);
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'h-explorer-pane-tabs';
      strip.setAttribute('role', 'tablist');
      this.strips.set(region, strip);
      this._resizeObserver?.observe(host);
    }
    if (strip.parentElement !== host || host.children?.[0] !== strip) host.prepend(strip);
    if (!this._clickHosts.has(host)) {
      this._clickHosts.add(host);
      host.addEventListener('click', (event) => this._onCollapsedClick(region, host, event));
    }
    strip.classList.toggle('is-single', tabs.length < 2);
    host.classList.add('has-pane-tabs');
    host.classList.toggle('has-pane-tab-strip', tabs.length > 1);

    // other tabs: their names are measured again
    const key = tabs.map((tab) => tab.id).join(',');
    if (strip.dataset.tabs !== key) {
      this._fullWidths.delete(region);
      strip.classList.remove('is-icons');
    }
    strip.dataset.tabs = key;
    strip.replaceChildren(...tabs.map((tab) => this._tab(region, tab, tab.id === activeId)));
    this._fit(region);
  }

  /**
   * A click anywhere on a collapsed (or squeezed) pane, other than on a tab, expands
   * it with the module it shows (its first module when it has none yet).
   *
   * @private
   * @param {string} region Pane region.
   * @param {HTMLElement} host The pane's region element.
   * @param {MouseEvent} event The click.
   * @returns {void}
   */
  _onCollapsedClick(region, host, event) {
    if (!this.active || !host.classList.contains('is-collapsed')) return;
    if (event.target?.closest?.('.h-explorer-pane-tab')) return;
    const type = this._activeTab(region) || this.paneTypes().get(region)?.[0];
    if (type) void this.select(region, type);
  }

  /** @private Re-fit every strip (a pane was resized). */
  _fitAll() {
    for (const region of this.strips.keys()) this._fit(region);
  }

  /**
   * Icons only (wrapped) when the tab names do not fit the pane's width; the names
   * come back when the pane is wide enough for them again.
   *
   * @private
   * @param {string} region Pane region.
   * @returns {void}
   */
  _fit(region) {
    const strip = this.strips.get(region);
    if (!strip || strip.classList.contains('is-single') || !strip.clientWidth) return;
    if (!strip.classList.contains('is-icons')) {
      if (strip.scrollWidth <= strip.clientWidth) return;
      this._fullWidths.set(region, strip.scrollWidth);
      strip.classList.add('is-icons');
    } else if (strip.clientWidth >= (this._fullWidths.get(region) || Infinity)) {
      strip.classList.remove('is-icons');
    }
  }

  /** @private One tab button. */
  _tab(region, tab, active) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'h-explorer-pane-tab';
    button.dataset.type = tab.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(active));
    button.classList.toggle('active', active);
    button.title = $HR(tab.title);
    const icon = document.createElement('span');
    icon.className = tab.icon;
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'h-explorer-pane-tab-label';
    label.textContent = $HR(tab.title);
    button.append(icon, label);
    button.addEventListener('click', () => void this.select(region, tab.id));
    return button;
  }

  /** @private Remove a pane's strip and its classes. */
  _removeStrip(region) {
    const strip = this.strips.get(region);
    const host = strip?.parentElement;
    host?.classList.remove('has-pane-tabs', 'has-pane-tab-strip');
    if (host) this._resizeObserver?.unobserve(host);
    strip?.remove();
    this.strips.delete(region);
    this._fullWidths.delete(region);
  }
}
