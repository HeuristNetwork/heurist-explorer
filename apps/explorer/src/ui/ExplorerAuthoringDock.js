/**
 * @file ExplorerAuthoringDock.js
 * @brief Outer Explorer layout: the authoring pane (Query Source editor / Filter
 *        Form) in the west, the presentation-module layout in the center.
 *
 * The module layout's host element is created once and never re-parented, so
 * showing, hiding or resizing the authoring pane never reloads a module iframe.
 * The pane remembers one width per mode ('editor' | 'form'), per database.
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
const MODES = ['editor', 'form'];

/** Outer two-region layout hosting the authoring pane beside the module layout. */
export class ExplorerAuthoringDock {
  /**
   * @param {HTMLElement} container Element the outer layout fills (the Explorer workspace).
   * @param {object} [options]
   * @param {string} [options.database] Database name; scopes the persisted widths.
   * @param {Storage|null} [options.storage] Storage backend; defaults to `localStorage`.
   */
  constructor(container, { database = '', storage = null } = {}) {
    this.storage = storage ?? defaultStorage();
    this.storageKey = `heurist.explorer.${encodeURIComponent(String(database || '').trim() || 'default')}.authoringDock`;
    this.widths = loadWidths(this.storage, this.storageKey);
    this.mode = 'editor';
    this._drawer = false;
    this._splitVisible = true;

    this.cardinal = new HCardinalLayout(container, {
      westSize: this.widths.editor,
      minWest: AUTHORING_MIN_WIDTH
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
      if (region !== 'west' || !interactive) return;
      this.widths[this.mode] = size;
      saveWidths(this.storage, this.storageKey, this.widths);
    };
    this.cardinal.addEventListener('regionresize', this._onResize);
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

  /**
   * Drawer mode (compact screens, see ExplorerCompactMode): the pane is never
   * hidden, it collapses to a rail; show/hide expand and collapse it. Leaving
   * drawer mode restores the split pane's visibility from before.
   *
   * @param {boolean} on Whether to use drawer behavior.
   * @returns {ExplorerAuthoringDock} This dock.
   */
  setDrawerMode(on) {
    const next = on === true;
    if (next === this._drawer) return this;
    if (next) {
      this._splitVisible = this.isVisible();
      this._drawer = true;
      this.cardinal.collapse('west');
    } else {
      this._drawer = false;
      this.cardinal.expand('west');
      if (!this._splitVisible) this.cardinal.hide('west');
    }
    return this;
  }

  /** @returns {boolean} Whether drawer mode is on. */
  isDrawerMode() { return this._drawer; }

  /** Show the authoring pane (expand the drawer). @returns {boolean} True when state changed. */
  show() { return this._drawer ? this.cardinal.expand('west') : this.cardinal.show('west'); }

  /** Hide the authoring pane (collapse the drawer to its rail). @returns {boolean} True when state changed. */
  hide() { return this._drawer ? this.cardinal.collapse('west') : this.cardinal.hide('west'); }

  /** @returns {boolean} Whether the authoring pane is visible (drawer: expanded). */
  isVisible() {
    const west = this.cardinal.state.west;
    return west.visible === true && !(this._drawer && west.collapsed);
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
}

/** Read per-mode widths, falling back to the minimum for missing/invalid values. */
function loadWidths(storage, key) {
  let stored = null;
  try { stored = JSON.parse(storage?.getItem?.(key) || 'null'); } catch { stored = null; }
  const widths = {};
  for (const mode of MODES) {
    const value = Number(stored?.widths?.[mode]);
    widths[mode] = Number.isFinite(value) && value >= AUTHORING_MIN_WIDTH ? Math.round(value) : AUTHORING_MIN_WIDTH;
  }
  return widths;
}

/** Persist per-mode widths, tolerating unavailable storage. */
function saveWidths(storage, key, widths) {
  try { storage?.setItem?.(key, JSON.stringify({ widths })); } catch { /* storage may be unavailable */ }
}

/** Return `localStorage` when accessible, otherwise `null`. */
function defaultStorage() { try { return globalThis.localStorage ?? null; } catch { return null; } }
