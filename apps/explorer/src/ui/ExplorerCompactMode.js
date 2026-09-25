/**
 * @file ExplorerCompactMode.js
 * @brief Narrow-screen (phone) presentation of Explorer. All switching into and
 *        out of compact mode lives here; the desktop code does not know it exists.
 *
 * While the breakpoint matches, the Explorer root carries `h-compact` and
 * ExplorerCompactMode.css turns the layout into:
 * - a vertical, scrollable stack of the visible presentation modules, each one
 *   screen high, under a thin title strip that stays touchable for scrolling
 *   (maps and iframes capture touch gestures). A toolbar presentation button
 *   shows a hidden module and scrolls to it, scrolls to a visible module that is
 *   off screen, and hides a module that is on screen. Up/Down buttons on the
 *   drawer rail scroll to the previous/next module. Activating a tool (report,
 *   crosstabs, actions, export) scrolls to its panel.
 *   Regions are re-flowed with CSS only - slots are never re-parented, which
 *   would reload module iframes;
 * - the authoring pane (Query Source editor / Filter Form) as a drawer that
 *   overlays the modules when expanded and shrinks to a rail when collapsed.
 *   Picking a filter/source expands it; only an explicit Filter-button click -
 *   in the Filter Form (`h-filter-form-apply`) or the Query Source editor
 *   (`h-query-source-run`) - collapses it;
 * - toolbar buttons as small icons without captions.
 *
 * Removing this module leaves a working desktop Explorer.
 * See docs/development/Explorer-Authoring-Dock-and-Compact-Mode-Plan.md, Part B.
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
import './ExplorerCompactMode.css';

/** The only place the compact breakpoint is defined. */
export const COMPACT_MEDIA_QUERY = '(max-width: 700px)';

const COMPACT_CLASS = 'h-compact';
const REGIONS = ['north', 'west', 'center', 'east', 'south'];
const MODULE_TITLES = { data: 'Data', map: 'Map', graph: 'Graph', timeline: 'Timeline', recordview: 'Record' };
const TOOL_TITLES = { report: 'Report', crosstabs: 'Crosstabs', actions: 'Actions', export: 'Export' };

/** Switches an ExplorerApplication between its desktop and compact presentations. */
export class ExplorerCompactMode {
  /**
   * @param {object} options
   * @param {import('../core/ExplorerApplication.js').ExplorerApplication} options.application Explorer instance.
   * @param {string} [options.mediaQuery] Breakpoint override (tests, hosts).
   */
  constructor({ application, mediaQuery = COMPACT_MEDIA_QUERY } = {}) {
    if (!application) throw new TypeError('ExplorerCompactMode requires application');
    this.application = application;
    this.mediaQuery = mediaQuery;
    this.active = false;
    this._media = null;
    this._rail = null;
    this._close = null;
    this._onMediaChange = () => this._sync();
    this._onFilterApply = () => {
      if (!this.active) return;
      this.application.authoringDock?.hide();
      this.application.syncSearchButton();
    };
    this._onModuleVisibility = (event) => {
      if (!this.active) return;
      this._labelRegions();
      if (event.detail?.visible) this._reveal(event.detail.region);
    };
    this._onAssignment = () => { if (this.active) this._labelRegions(); };
    // a tool panel takes the center region: scroll to it on activation
    this._onModeChange = (event) => {
      if (!this.active) return;
      this._labelRegions();
      if (event.detail?.mode === 'tool') this._reveal('center');
    };
  }

  /** Start watching the breakpoint and apply the current state. @returns {ExplorerCompactMode} This instance. */
  start() {
    this._media = globalThis.matchMedia?.(this.mediaQuery) || null;
    this._media?.addEventListener?.('change', this._onMediaChange);
    this._sync();
    return this;
  }

  /**
   * Compact handling of a toolbar presentation button. A hidden module is left to
   * the desktop path (it shows it; the visibility event scrolls to it). A visible
   * module is hidden by the desktop path when it is on screen, otherwise scrolled to.
   *
   * @param {string} type Module type.
   * @returns {boolean|null} New visibility when handled here; `null` to use the desktop behavior.
   */
  togglePresentation(type) {
    if (!this.active) return null;
    const element = this._moduleRegionElement(type);
    if (!element || this._onScreen(element)) return null;
    this._scrollTo(element);
    return true;
  }

  /**
   * Scroll the stack to a shown module of this type (after the pending layout).
   *
   * @param {string} type Module type.
   * @returns {boolean} Whether compact mode is active (the scroll is scheduled).
   */
  scrollToPresentation(type) {
    if (!this.active) return false;
    requestFrame(() => {
      const element = this._moduleRegionElement(type);
      if (element) this._scrollTo(element);
    });
    return true;
  }

  /**
   * Scroll the module stack to the previous or next module.
   *
   * @param {-1|1} step Direction.
   * @returns {boolean} Whether there was a module to scroll to.
   */
  scrollModule(step) {
    const scroller = this._scroller();
    const regions = this._visibleRegions();
    if (!scroller || !regions.length) return false;
    // the module whose top is nearest the current scroll position
    const top = scroller.scrollTop;
    let current = 0;
    regions.forEach((element, index) => {
      if (Math.abs(element.offsetTop - top) < Math.abs(regions[current].offsetTop - top)) current = index;
    });
    const target = regions[current + (step < 0 ? -1 : 1)];
    if (!target) return false;
    this._scrollTo(target);
    return true;
  }

  /** Re-apply compact-only overrides after the host changed its configuration. */
  refresh() {
    if (this.active) this._applyToolbar(true);
  }

  /** Leave compact mode and stop watching the breakpoint. */
  destroy() {
    this._media?.removeEventListener?.('change', this._onMediaChange);
    this._media = null;
    this._setActive(false);
  }

  /** Follow the breakpoint. */
  _sync() {
    this._setActive(this._media?.matches === true);
  }

  /**
   * Enter or leave compact mode.
   *
   * @param {boolean} on Whether compact mode should be active.
   * @returns {void}
   */
  _setActive(on) {
    const next = on === true;
    if (next === this.active) return;
    this.active = next;
    const app = this.application;
    const dock = app.authoringDock;
    const layout = app.layout;

    app.container?.classList.toggle(COMPACT_CLASS, next);
    dock?.setDrawerMode(next);
    this._applyToolbar(next);

    if (next) {
      this._mountDrawerControls();
      dock?.paneElement.addEventListener('h-filter-form-apply', this._onFilterApply);
      dock?.paneElement.addEventListener('h-query-source-run', this._onFilterApply);
      layout?.addEventListener('modulevisibilitychange', this._onModuleVisibility);
      layout?.addEventListener('moduleassignmentchange', this._onAssignment);
      layout?.addEventListener('modechange', this._onModeChange);
      this._labelRegions();
    } else {
      this._unmountDrawerControls();
      dock?.paneElement.removeEventListener('h-filter-form-apply', this._onFilterApply);
      dock?.paneElement.removeEventListener('h-query-source-run', this._onFilterApply);
      layout?.removeEventListener('modulevisibilitychange', this._onModuleVisibility);
      layout?.removeEventListener('moduleassignmentchange', this._onAssignment);
      layout?.removeEventListener('modechange', this._onModeChange);
      this._clearRegionLabels();
    }

    app.syncSearchButton?.();
    // every module's box changed size: let map/timeline/graph engines re-measure
    requestFrame(() => { for (const module of app.modules?.values?.() || []) void module.resize?.(); });
  }

  /** Small icons without captions while compact; the configured size otherwise. */
  _applyToolbar(compact) {
    const toolbar = this.application.uiConfigValue?.toolbar || {};
    this.application.controlPanel?.applyToolbarConfig({
      ...toolbar,
      buttonSize: compact ? 'small' : toolbar.buttonSize
    });
  }

  /**
   * Rail (collapsed drawer: Show search, previous/next module) and close button
   * (collapses the expanded drawer).
   */
  _mountDrawerControls() {
    const region = this.application.authoringDock?.cardinal.getRegionElement('west');
    if (!region) return;
    this._rail = document.createElement('div');
    this._rail.className = 'h-compact-drawer-rail';
    this._rail.append(
      iconButton('fa-magnifying-glass', $HR('Show search'), 'h-btn h-compact-drawer-search', () => this.application.showQuerySourcePanel()),
      iconButton('fa-sort-up', $HR('Previous module'), 'h-btn', () => this.scrollModule(-1)),
      iconButton('fa-sort-down', $HR('Next module'), 'h-btn', () => this.scrollModule(1))
    );
    this._close = iconButton('fa-xmark', $HR('Hide search'), 'heurist-icon-button h-compact-drawer-close', () => {
      this.application.authoringDock?.hide();
      this.application.syncSearchButton();
    });
    region.append(this._rail, this._close);
  }

  /** Remove the drawer's rail and close buttons. */
  _unmountDrawerControls() {
    this._rail?.remove();
    this._close?.remove();
    this._rail = null;
    this._close = null;
  }

  /** Put the occupying module's title on each module region (shown in its title strip). */
  _labelRegions() {
    const layout = this.application.layout;
    if (!layout) return;
    for (const region of REGIONS) {
      const element = layout.cardinal.getRegionElement(region);
      const moduleId = layout.getModuleForRegion(region);
      const module = moduleId ? this.application.modules?.get(moduleId) : null;
      // the tool panel's slot is not a module
      const tool = moduleId && !module && layout.isToolMode?.() ? layout.activeToolId : null;
      const title = module ? (MODULE_TITLES[module.type] || module.type) : (tool ? (TOOL_TITLES[tool] || tool) : '');
      if (title) element.dataset.compactTitle = $HR(title);
      else delete element.dataset.compactTitle;
    }
  }

  /** Drop the title-strip labels. */
  _clearRegionLabels() {
    const layout = this.application.layout;
    if (!layout) return;
    for (const region of REGIONS) delete layout.cardinal.getRegionElement(region).dataset.compactTitle;
  }

  /** Scroll a module region that has just been shown into view. */
  _reveal(region) {
    const element = region ? this.application.layout?.cardinal.getRegionElement(region) : null;
    if (element) requestFrame(() => this._scrollTo(element));
  }

  /** Scroll the stack so a module region starts at its top. */
  _scrollTo(element) {
    element.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }

  /** @returns {HTMLElement|null} The module stack's scroll container. */
  _scroller() {
    return this.application.layout?.cardinal.root || null;
  }

  /** @returns {HTMLElement[]} Shown module regions, in stack order. */
  _visibleRegions() {
    const layout = this.application.layout;
    if (!layout) return [];
    return REGIONS.map((region) => layout.cardinal.getRegionElement(region))
      .filter((element) => element && !element.hidden);
  }

  /** @returns {HTMLElement|null} The shown region occupied by a module of this type. */
  _moduleRegionElement(type) {
    const layout = this.application.layout;
    const module = [...(this.application.modules?.values?.() || [])].find((item) => item.type === type);
    const region = module ? layout?.getRegionForModule(module.id) : null;
    if (!region || layout.getModuleForRegion(region) !== module.id) return null;
    const element = layout.cardinal.getRegionElement(region);
    return element && !element.hidden ? element : null;
  }

  /** Whether at least half of the stack's viewport shows this module. */
  _onScreen(element) {
    const scroller = this._scroller();
    if (!scroller) return true;
    const view = scroller.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const visible = Math.min(view.bottom, box.bottom) - Math.max(view.top, box.top);
    return visible >= view.height / 2;
  }
}

/** Build a small icon button. */
function iconButton(icon, title, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
  button.addEventListener('click', onClick);
  return button;
}

/** Run after the next layout. */
function requestFrame(callback) {
  (globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 0)))(callback);
}
