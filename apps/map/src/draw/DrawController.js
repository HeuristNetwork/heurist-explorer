/**
 * @file DrawController.js
 * @brief Public drawing-session coordinator.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { DrawGeometryService } from './DrawGeometryService.js';

/** Coordinates one drawing session's lifecycle and geometry, delegating rendering to the map engine. */
export class DrawController {
  /**
   * @param {object} options Controller dependencies.
   * @param {object} options.mapEngine Map engine adapter that renders the active drawing.
   * @param {Function|null} [options.dispatch] Called with `(eventName, detail)` to emit public drawing events.
   */
  constructor({ mapEngine, dispatch = null } = {}) {
    this.mapEngine = mapEngine;
    this.dispatch = typeof dispatch === 'function' ? dispatch : null;
    this.geometry = new DrawGeometryService();
    this.active = false;
    this.options = {};
  }

  /**
   * Start a drawing session, optionally seeded with an initial geometry.
   *
   * @param {object} [options] Session options; see `normalizeOptions`.
   * @returns {Promise<object|null>} The session's current geometry; see `get`.
   */
  async begin(options = {}) {
    this.options = normalizeOptions(options);
    await this.mapEngine.beginDrawing(this.options, (detail) => {
      this.dispatch?.('heurist-map-drawing-changed', detail);
    });
    this.active = true;
    this.dispatch?.('heurist-map-drawing-session-started', { options: { ...this.options } });
    const initial = this.options.geojson ?? this.options.wkt ?? null;
    if (initial) {
      await this.set(initial, { clear: true, zoom: this.options.zoomToGeometry !== false });
      if (['image', 'rectangle', 'filter'].includes(this.options.mode)) {
        await this.mapEngine.startDrawingEdit?.();
      }
    }
    return this.get();
  }

  /**
   * Replace the session's current geometry.
   *
   * @param {*} value WKT string, GeoJSON, or bare coordinates; see `DrawGeometryService#parse`.
   * @param {{clear?: boolean, zoom?: boolean}} [options] `clear` removes the drawing when `value` is empty; `zoom` reframes the viewport.
   * @returns {Promise<object|null>} The session's current geometry, or `null` when cleared.
   * @throws {Error} When no drawing session is active.
   */
  async set(value, { clear = true, zoom = true } = {}) {
    this.assertActive();
    const geojson = this.geometry.parse(value, { mode: this.options.mode });
    if (!geojson) {
      if (clear) await this.clear();
      return null;
    }
    await this.mapEngine.setDrawingGeoJson(geojson, { clear });
    if (zoom) await this.zoom();
    return this.get();
  }

  /**
   * Read the session's current geometry as `{type, wkt, geojson}`.
   *
   * @returns {object|null} Serialized geometry, or `null` when nothing is drawn.
   * @throws {Error} When no drawing session is active.
   */
  get() {
    this.assertActive();
    return this.geometry.serialize(this.mapEngine.getDrawingGeoJson());
  }

  /**
   * Read the session's current options.
   *
   * @returns {object} Cloned session options.
   */
  getOptions() { return { ...this.options, style: { ...(this.options.style || {}) } }; }

  /**
   * Remove the current drawing without ending the session.
   *
   * @returns {Promise<null>}
   * @throws {Error} When no drawing session is active.
   */
  async clear() {
    this.assertActive();
    await this.mapEngine.clearDrawing();
    return null;
  }

  /**
   * Restart the session with updated options, preserving the current geometry.
   *
   * @param {object} [changes] Option changes merged over the current session options.
   * @returns {Promise<object|null>} The restarted session's current geometry; see `get`.
   * @throws {Error} When no drawing session is active.
   */
  async updateOptions(changes = {}) {
    this.assertActive();
    const current = this.get()?.geojson || null;
    return this.begin({
      ...this.options,
      ...changes,
      geojson: current,
      wkt: null,
      zoomToGeometry: false
    });
  }

  /**
   * Fit the viewport to the current drawing.
   *
   * @returns {Promise<*>} Result of the engine's zoom call.
   * @throws {Error} When no drawing session is active.
   */
  async zoom() {
    this.assertActive();
    return this.mapEngine.zoomToDrawing();
  }

  /**
   * Finish the session, optionally capturing a screenshot.
   *
   * @returns {Promise<object>} The finished session's geometry, with `imgData` when a screenshot was requested and succeeded.
   * @throws {Error} When nothing has been drawn.
   */
  async finish() {
    const result = this.get();
    if (!result) throw new Error('You have to draw a shape');
    if (this.options.needScreenshot === true) {
      try { result.imgData = await this.mapEngine.captureDrawingImage(); } catch { /* Optional compatibility output. */ }
    }
    return result;
  }

  /**
   * Cancel the session. Reserved for parity with the legacy drawing API.
   *
   * @returns {Promise<null>}
   */
  async cancel() { return null; }

  /**
   * End the drawing session and release the engine's drawing mode.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    if (this.active) await this.mapEngine.endDrawing();
    this.active = false;
  }

  /**
   * Throw when no drawing session is active.
   *
   * @returns {void}
   * @throws {Error} When no drawing session is active.
   */
  assertActive() {
    if (!this.active) throw new Error('No drawing session is active');
  }
}

/** Normalize raw drawing-session options (mode, seed geometry, style, screenshot flag). */
function normalizeOptions(options) {
  const requested = String(options.mode || options.tool || options.tool_option || 'full').toLowerCase();
  const mode = requested === 'image' ? 'image'
    : requested === 'filter' || options.geofilter === true ? 'filter'
      : requested === 'rectangle' ? 'rectangle' : 'full';
  return {
    mode,
    wkt: options.wkt || null,
    geojson: options.geojson || null,
    allowMultiple: options.allowMultiple === true,
    zoomToGeometry: options.zoomToGeometry !== false,
    style: options.style && typeof options.style === 'object' ? { ...options.style } : {},
    imageUrl: options.imageUrl || options.imageurl || null,
    needScreenshot: options.needScreenshot === true || options.need_screenshot === true
  };
}
