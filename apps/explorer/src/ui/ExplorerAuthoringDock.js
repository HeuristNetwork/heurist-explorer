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
    // the pane (QSE / Filter Form) and the docked list each have their own visibility;
    // the West region is shown while either of them is in it
    this._paneShown = true;
    this._listShown = false;
    this._formCover = false;

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
    /** Host for the docked Filters / Entities / Sources list, below the pane in the West. */
    this.listElement = document.createElement('div');
    this.listElement.className = 'h-explorer-authoring-list';
    this.listElement.hidden = true;
    this.cardinal.setContent('west', this.paneElement);
    this.cardinal.getRegionElement('west').append(this.listElement);
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
      this._splitVisible = this._paneShown;
      this._drawer = true;
      this._moveTo('west');
      // the drawer holds only the pane: no docked list
      this.paneElement.hidden = false;
      this.listElement.hidden = true;
      this.cardinal.getRegionElement('west').classList.remove('has-list');
      this.cardinal.collapse('west');
    } else {
      this._drawer = false;
      this.cardinal.expand('west');
      this._paneShown = this._splitVisible;
      this._moveTo(this._effectiveRegion());
      this._syncRegions();
    }
    return this;
  }

  /** @returns {boolean} Whether drawer mode is on. */
  isDrawerMode() { return this._drawer; }

  /** Show the authoring pane (expand the drawer). @returns {boolean} True when state changed. */
  show() {
    if (this._drawer) return this.cardinal.expand('west');
    const changed = !this._paneShown;
    this._paneShown = true;
    this._syncRegions();
    return changed;
  }

  /** Hide the authoring pane (collapse the drawer to its rail). @returns {boolean} True when state changed. */
  hide() {
    if (this._drawer) return this.cardinal.collapse('west');
    const changed = this._paneShown;
    this._paneShown = false;
    this._syncRegions();
    return changed;
  }

  /** @returns {boolean} Whether the authoring pane is visible (drawer: expanded). */
  isVisible() {
    const state = this.cardinal.state[this.region];
    if (this._drawer) return state.visible === true && !state.collapsed;
    return this._paneShown && state.visible === true;
  }

  /**
   * Show or hide the docked list (Filters, Entities or Sources) below the pane in
   * the West region. Not used in drawer mode.
   *
   * @param {boolean} shown Whether the list is shown.
   * @returns {ExplorerAuthoringDock} This dock.
   */
  setListShown(shown) {
    this._listShown = shown === true;
    this._syncRegions();
    return this;
  }

  /** @returns {boolean} Whether the docked list is shown (and not covered by the Filter Form). */
  isListShown() { return this._listShown && !this._formCover && !this._drawer; }

  /**
   * The Filter Form fills the whole West region: the docked list is hidden while it is open.
   *
   * @param {boolean} cover Whether the Filter Form is open in the West region.
   * @returns {ExplorerAuthoringDock} This dock.
   */
  setFormCover(cover) {
    this._formCover = cover === true;
    this._syncRegions();
    return this;
  }

  /** @returns {boolean} Whether the Filter Form fills the West region. */
  isFormCover() { return this._formCover; }

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
    const previous = this.region;
    // in the West the pane goes first: the docked list stays below it
    if (region === 'west') target.prepend(this.paneElement);
    else target.append(this.paneElement);
    this.region = region;
    if (this._drawer) {
      if (previous !== region) this.cardinal.hide(previous);
      this.cardinal.show(region);
    } else {
      this._syncRegions();
    }
    if (previous !== region) this.dispatchEvent(new CustomEvent('placementchange', { detail: { region } }));
  }

  /**
   * Show the regions that hold something: north while the pane is there and shown;
   * West while the pane is there and shown, or a list is docked. The Filter Form
   * in the West hides the list.
   *
   * @private
   * @returns {void}
   */
  _syncRegions() {
    if (this._drawer) return;
    const list = this._listShown && !(this._formCover && this.region === 'west');
    const paneWest = this.region === 'west' && this._paneShown;
    this.paneElement.hidden = !this._paneShown;
    this.listElement.hidden = !list;
    const west = this.cardinal.getRegionElement('west');
    west.classList.toggle('has-list', list && paneWest);
    if (this.region === 'north' && this._paneShown) this.cardinal.show('north');
    else this.cardinal.hide('north');
    if (paneWest || list) this.cardinal.show('west');
    else this.cardinal.hide('west');
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
