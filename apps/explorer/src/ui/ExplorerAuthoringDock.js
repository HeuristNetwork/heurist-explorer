/**
 * @file ExplorerAuthoringDock.js
 * @brief Outer Explorer layout: the authoring pane (Query Source editor / Filter
 *        Form) in the west or north, the presentation-module layout in the center.
 *
 * The module layout's host element is created once and never re-parented, so
 * showing, hiding or resizing the authoring pane never reloads a module iframe.
 * The pane remembers one width per mode ('editor' | 'form'), its north height,
 * its placement and the editor's More state, per database.
 * See docs/development/Explorer-Authoring-Dock-and-Compact-Mode-Plan.md.
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

import { HCardinalLayout } from './HCardinalLayout.js';
import './ExplorerAuthoringDock.css';

export const AUTHORING_MIN_WIDTH = 300;
export const AUTHORING_MIN_HEIGHT = 66;
const AUTHORING_DEFAULT_HEIGHT = 100;
const MODES = ['editor', 'form'];
const PLACEMENTS = ['west', 'north'];

/**
 * Outer layout hosting the authoring pane beside (west, Vertical) or above
 * (north, Horizontal) the module layout. Dispatches `placementchange` with
 * `{ region }` whenever the pane moves to another region.
 */
export class ExplorerAuthoringDock extends EventTarget {
  /**
   * @param {HTMLElement} container Element the outer layout fills (the Explorer workspace).
   * @param {object} [options]
   * @param {string} [options.database] Database name; scopes the persisted settings.
   * @param {Storage|null} [options.storage] Storage backend; defaults to `localStorage`.
   */
  constructor(container, { database = '', storage = null } = {}) {
    super();
    this.storage = storage ?? defaultStorage();
    this.storageKey = `heurist.explorer.${encodeURIComponent(String(database || '').trim() || 'default')}.authoringDock`;
    this.settings = loadSettings(this.storage, this.storageKey);
    this.widths = this.settings.widths;
    this.mode = 'editor';
    this._drawer = false;
    this._splitVisible = true;
    this._temporary = null;
    this.region = 'west';

    this.cardinal = new HCardinalLayout(container, {
      westSize: this.widths.editor,
      minWest: AUTHORING_MIN_WIDTH,
      northSize: this.settings.northHeight,
      minNorth: AUTHORING_MIN_HEIGHT
    });
    this.cardinal.root?.classList.add('h-explorer-authoring-dock');

    /** Host for the Query Source panel. */
    this.paneElement = document.createElement('div');
    this.paneElement.className = 'h-explorer-authoring';
    /** Host for the presentation-module layout (LayoutManager). */
    this.modulesElement = document.createElement('div');
    this.modulesElement.className = 'h-explorer-modules';
    this.cardinal.setContent('west', this.paneElement);
    this.cardinal.setContent('center', this.modulesElement);

    this._onResize = (event) => {
      const { region, size, interactive } = event.detail || {};
      if (!interactive) return;
      if (region === 'west') this.widths[this.mode] = size;
      else if (region === 'north') this.settings.northHeight = size;
      else return;
      this._save();
    };
    this.cardinal.addEventListener('regionresize', this._onResize);
    this._moveTo(this._effectiveRegion());
  }

  /**
   * Switch the pane to a mode's remembered width.
   *
   * @param {'editor'|'form'} mode Query Source editor or runtime Filter Form.
   * @returns {ExplorerAuthoringDock} This dock.
   */
  setMode(mode) {
    const next = MODES.includes(mode) ? mode : 'editor';
    if (next === this.mode) return this;
    this.mode = next;
    this.cardinal.setSize('west', this.widths[next]);
    return this;
  }

  /** @returns {'west'|'north'} The user's placement: west (Vertical) or north (Horizontal). */
  getPlacement() { return this.settings.placement; }

  /** @returns {'west'|'north'} The region the pane occupies now (compact mode and the Filter Form may force west). */
  getRegion() { return this.region; }

  /**
   * Set and remember the user's placement. Only the pane moves: the module
   * layout in the center is never re-parented, so no module iframe reloads.
   *
   * @param {'west'|'north'} placement West (Vertical) or north (Horizontal).
   * @returns {ExplorerAuthoringDock} This dock.
   */
  setPlacement(placement) {
    const next = PLACEMENTS.includes(placement) ? placement : 'west';
    if (next === this.settings.placement) return this;
    this.settings.placement = next;
    this._save();
    this._moveTo(this._effectiveRegion());
    return this;
  }

  /**
   * Temporarily place the pane in a region without changing the user's
   * placement, e.g. west while a vertical Filter Form is open.
   *
   * @param {'west'|'north'|null} region Region to use, or null to return to the user's placement.
   * @returns {ExplorerAuthoringDock} This dock.
   */
  setTemporaryPlacement(region) {
    this._temporary = PLACEMENTS.includes(region) ? region : null;
    this._moveTo(this._effectiveRegion());
    return this;
  }

  /** @returns {boolean} Whether the Query Source editor's advanced settings (More) are shown. */
  getAdvanced() { return this.settings.advanced; }

  /**
   * Remember whether the Query Source editor's advanced settings (More) are shown.
   *
   * @param {boolean} value Whether they are shown.
   * @returns {ExplorerAuthoringDock} This dock.
   */
  setAdvanced(value) {
    this.settings.advanced = value === true;
    this._save();
    return this;
  }

  /**
   * Drawer mode (compact screens, see ExplorerCompactMode): the pane moves to
   * west and is never hidden, it collapses to a rail; show/hide expand and
   * collapse it. Leaving drawer mode restores the split pane's visibility and
   * the user's placement from before.
   *
   * @param {boolean} on Whether to use drawer behavior.
   * @returns {ExplorerAuthoringDock} This dock.
   */
  setDrawerMode(on) {
    const next = on === true;
    if (next === this._drawer) return this;
    if (next) {
      this._splitVisible = this.isVisible();
      this._moveTo('west');
      this._drawer = true;
      this.cardinal.collapse('west');
    } else {
      this._drawer = false;
      this.cardinal.expand('west');
      if (!this._splitVisible) this.cardinal.hide('west');
      this._moveTo(this._effectiveRegion());
    }
    return this;
  }

  /** @returns {boolean} Whether drawer mode is on. */
  isDrawerMode() { return this._drawer; }

  /** Show the authoring pane (expand the drawer). @returns {boolean} True when state changed. */
  show() { return this._drawer ? this.cardinal.expand('west') : this.cardinal.show(this.region); }

  /** Hide the authoring pane (collapse the drawer to its rail). @returns {boolean} True when state changed. */
  hide() { return this._drawer ? this.cardinal.collapse('west') : this.cardinal.hide(this.region); }

  /** @returns {boolean} Whether the authoring pane is visible (drawer: expanded). */
  isVisible() {
    const state = this.cardinal.state[this.region];
    return state.visible === true && !(this._drawer && state.collapsed);
  }

  /** @returns {boolean} The new visibility. */
  toggle() {
    if (this.isVisible()) this.hide();
    else this.show();
    return this.isVisible();
  }

  /** Remove the outer layout and its listeners. */
  destroy() {
    this.cardinal.removeEventListener('regionresize', this._onResize);
    this.cardinal.destroy();
  }

  /**
   * @private
   * @returns {'west'|'north'} Region the pane belongs in now.
   */
  _effectiveRegion() {
    if (this._drawer) return 'west';
    return this._temporary || this.settings.placement;
  }

  /**
   * Move the pane to a region, keeping its visibility. The pane element is
   * appended (not set as region content), so other children of the region,
   * e.g. the compact drawer's rail, stay.
   *
   * @private
   * @param {'west'|'north'} region Target region.
   * @returns {void}
   */
  _moveTo(region) {
    const target = this.cardinal.getRegionElement(region);
    if (region === this.region && this.paneElement.parentElement === target) return;
    const visible = this.isVisible();
    const previous = this.region;
    if (previous !== region) this.cardinal.hide(previous);
    target.append(this.paneElement);
    this.region = region;
    if (visible) this.cardinal.show(region);
    else this.cardinal.hide(region);
    if (previous !== region) this.dispatchEvent(new CustomEvent('placementchange', { detail: { region } }));
  }

  /** @private Persist widths, north height, placement and the More state. */
  _save() { saveSettings(this.storage, this.storageKey, this.settings); }
}

/** Read per-mode widths, north height, placement and More state; invalid or missing values fall back to defaults. */
function loadSettings(storage, key) {
  let stored = null;
  try { stored = JSON.parse(storage?.getItem?.(key) || 'null'); } catch { stored = null; }
  const widths = {};
  for (const mode of MODES) {
    const value = Number(stored?.widths?.[mode]);
    widths[mode] = Number.isFinite(value) && value >= AUTHORING_MIN_WIDTH ? Math.round(value) : AUTHORING_MIN_WIDTH;
  }
  const height = Number(stored?.northHeight);
  return {
    widths,
    northHeight: Number.isFinite(height) && height >= AUTHORING_MIN_HEIGHT ? Math.round(height) : AUTHORING_DEFAULT_HEIGHT,
    placement: PLACEMENTS.includes(stored?.placement) ? stored.placement : 'west',
    advanced: stored?.advanced === true
  };
}

/** Persist the dock settings, tolerating unavailable storage. */
function saveSettings(storage, key, settings) {
  try { storage?.setItem?.(key, JSON.stringify(settings)); } catch { /* storage may be unavailable */ }
}

/** Return `localStorage` when accessible, otherwise `null`. */
function defaultStorage() { try { return globalThis.localStorage ?? null; } catch { return null; } }
