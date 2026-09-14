/**
 * DrawController.js - Public drawing-session coordinator
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 */

import { DrawGeometryService } from './DrawGeometryService.js';

export class DrawController {
  constructor({ mapEngine, dispatch = null } = {}) {
    this.mapEngine = mapEngine;
    this.dispatch = typeof dispatch === 'function' ? dispatch : null;
    this.geometry = new DrawGeometryService();
    this.active = false;
    this.options = {};
  }

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

  get() {
    this.assertActive();
    return this.geometry.serialize(this.mapEngine.getDrawingGeoJson());
  }

  getOptions() { return { ...this.options, style: { ...(this.options.style || {}) } }; }

  async clear() {
    this.assertActive();
    await this.mapEngine.clearDrawing();
    return null;
  }

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

  async zoom() {
    this.assertActive();
    return this.mapEngine.zoomToDrawing();
  }

  async finish() {
    const result = this.get();
    if (!result) throw new Error('You have to draw a shape');
    if (this.options.needScreenshot === true) {
      try { result.imgData = await this.mapEngine.captureDrawingImage(); } catch { /* Optional compatibility output. */ }
    }
    return result;
  }

  async cancel() { return null; }

  async destroy() {
    if (this.active) await this.mapEngine.endDrawing();
    this.active = false;
  }

  assertActive() {
    if (!this.active) throw new Error('No drawing session is active');
  }
}

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
