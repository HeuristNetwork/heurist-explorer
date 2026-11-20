/**
 * @file storyMapBinding.js
 * @brief The map of a story map (plan 27q1 §6): the overview as a query layer, the places of the story and of the
 *        current element as inline GeoJSON layers (places and lines apart, each with its symbology), and the flight to
 *        the current element. The layers go into the active map document (only its layers are drawn). Works over the
 *        public API of a Map module (HeuristMapPublicApi): `addLayer`, `removeLayer`, `getActiveMapDocument`, `flyTo`; the caller gives a function that returns that API (the Map module of
 *        Explorer, or the map instance chosen on a website page), so a map mounted later is found too.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { featureBounds } from './storyMapModel.js';

/** Line of a path when the settings have no line symbology. */
export const DEFAULT_LINE_STYLE = Object.freeze({ color: '#d7301f', weight: 3, opacity: 0.9 });

/** Places of the current element when the settings have no element symbology. */
export const DEFAULT_ELEMENT_STYLE = Object.freeze({ color: '#d7301f', fillColor: '#fc8d59', weight: 2, fillOpacity: 0.6 });

/** Places of the whole story (map.keep): quieter than the current element. */
export const STORY_STYLE = Object.freeze({ color: '#777777', fillColor: '#bbbbbb', weight: 1, opacity: 0.7, fillOpacity: 0.4 });

/** An inline GeoJSON source of features. */
const inline = (features) => ({ type: 'inline-geojson', data: { type: 'FeatureCollection', features } });

/** The map of a story map over a Map public API. */
export class StoryMapBinding {
  /**
   * @param {object} options
   * @param {() => (object|null|Promise<object|null>)} options.getMap The Map public API (null: no map yet).
   * @param {object} [options.settings] Normalised story map settings (`map`).
   * @param {string} [options.title] Title of the layers.
   */
  constructor({ getMap, settings = null, title = 'Story' }) {
    this.getMap = getMap;
    this.map = settings?.map || {};
    this.title = title;
    this.layers = { overview: null, story: null, places: null, lines: null };
  }

  /**
   * The overview: the initial set on the map (a query layer).
   *
   * @param {*} query Query of the overview; null removes it.
   * @returns {Promise<void>}
   */
  async showOverview(query) {
    const api = await this._api();
    if (!api) return;
    await this._remove(api, 'overview');
    if (query == null) return;
    this.layers.overview = await this._add(api, `${this.title}: overview`, { type: 'heurist-query', query }, STORY_STYLE);
  }

  /**
   * The places of the whole story (map.keep: they stay while the elements change).
   *
   * @param {Array<object>} features Features of all elements.
   * @returns {Promise<void>}
   */
  async showStory(features) {
    const api = await this._api();
    if (!api) return;
    await this._remove(api, 'story');
    if (!this.map.keep || !features?.length) return;
    this.layers.story = await this._add(api, `${this.title}: all places`, inline(features), STORY_STYLE);
  }

  /**
   * The current element: its places and lines; the map flies to them.
   *
   * @param {Array<object>} features elementFeatures of the element.
   * @param {object} [options]
   * @param {number} [options.duration] Duration of the flight (ms); 0 jumps.
   * @returns {Promise<void>}
   */
  async showElement(features, { duration = this.map.duration ?? 1500 } = {}) {
    const api = await this._api();
    if (!api) return;
    await Promise.all([this._remove(api, 'places'), this._remove(api, 'lines')]);
    const lines = (features || []).filter((feature) => feature.properties?.role === 'line');
    const places = (features || []).filter((feature) => feature.properties?.role !== 'line');
    // the lines below the places
    if (lines.length) this.layers.lines = await this._add(api, `${this.title}: path`, inline(lines), this.map.lineSymbology || DEFAULT_LINE_STYLE);
    if (places.length) this.layers.places = await this._add(api, `${this.title}: places`, inline(places), this.map.elementSymbology || DEFAULT_ELEMENT_STYLE);
    const bounds = featureBounds(features);
    if (bounds && typeof api.flyTo === 'function') await api.flyTo(bounds, { duration });
  }

  /** Remove every layer of the story map. */
  async clear() {
    const api = await this._api();
    if (!api) return;
    await Promise.all(Object.keys(this.layers).map((key) => this._remove(api, key)));
  }

  /** Remove the layers of the story, keep the overview. */
  async clearStory() {
    const api = await this._api();
    if (!api) return;
    await Promise.all(['story', 'places', 'lines'].map((key) => this._remove(api, key)));
  }

  /** @private The map API, or null. */
  async _api() {
    try {
      return (await this.getMap?.()) || null;
    } catch {
      return null;
    }
  }

  /**
   * @private A layer in the active document of the map.
   * @returns {Promise<{id: string, documentId: *}|null>}
   */
  async _add(api, title, source, style) {
    if (typeof api.addLayer !== 'function') return null;
    const documentId = api.getActiveMapDocument?.()?.id ?? null;
    const layer = await api.addLayer({ title, visible: true, selectable: true, source, style: { ...style } },
      documentId != null ? { documentId } : {});
    return layer?.id != null ? { id: layer.id, documentId } : null;
  }

  /** @private Remove one of the layers from its document (it may be gone already). */
  async _remove(api, key) {
    const layer = this.layers[key];
    this.layers[key] = null;
    if (!layer) return;
    try {
      await api.removeLayer?.(layer.id, layer.documentId != null ? { documentId: layer.documentId } : {});
    } catch {
      // removed by the visitor in the map's legend, or its document is gone
    }
  }
}
