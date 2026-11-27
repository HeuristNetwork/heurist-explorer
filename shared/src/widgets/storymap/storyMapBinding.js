/**
 * @file storyMapBinding.js
 * @brief The map of a story map (plan 27q1 §6, §15): the background map document, the places of the story and of the
 *        current element as inline GeoJSON layers (places and lines apart, each with its symbology), and the flight to
 *        the current element. The layers go into the active map document (only its layers are drawn). Works over the
 *        public API of a Map module (HeuristMapPublicApi): `addLayer`, `removeLayer`, `getActiveMapDocument`,
 *        `loadMapDocuments`, `activateMapDocument`, `flyTo`; the caller gives a function that returns that API (the Map
 *        module of Explorer, or the map instance chosen on a website page), so a map mounted later is found too.
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

import { $HR } from '../../ui/i18n/HResource.js';
import { boundsNearlyEqual, featureBounds } from './storyMapModel.js';

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
   * @param {string|function(): string} [options.title] Title of the layers ("StoryMap: <name>", 27q3 review 6); a
   *        function is read when a layer is added.
   */
  constructor({ getMap, settings = null, title = 'Story' }) {
    this.getMap = getMap;
    this.map = settings?.map || {};
    this.title = title;
    this.layers = { story: null, places: null, lines: null };
    // the bounds of the last flight: the same place again is not flown to
    this._flown = null;
  }

  /**
   * The background map: a map document is loaded (when the map does not list it yet) and activated. The story layers
   * go into the active document, so this comes before the story.
   *
   * @param {{mapDocument: number}|null} background `map.background` of the settings; null keeps the map as it is.
   * @returns {Promise<void>}
   */
  async showBackground(background) {
    const id = Number(background?.mapDocument) || 0;
    if (!id) return;
    const api = await this._api();
    if (!api || typeof api.activateMapDocument !== 'function') return;
    if (Number(api.getActiveMapDocument?.()?.id) === id) return;
    const listed = () => (api.getMapDocuments?.() || []).some((item) => Number(item.id) === id);
    if (!listed()) await api.loadMapDocuments?.(null, { activateFirst: false });
    if (!listed()) {
      console.warn(`Story map: map document ${id} is not available`);
      return;
    }
    // the layers of the story stay in the document they were added to
    await this.clearStory();
    await api.activateMapDocument(id);
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
    this.layers.story = await this._add(api, `${this._title()} (${$HR('all places')})`, inline(features), STORY_STYLE);
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
    if (lines.length) this.layers.lines = await this._add(api, `${this._title()} (${$HR('path')})`, inline(lines), this.map.lineSymbology || DEFAULT_LINE_STYLE);
    if (places.length) this.layers.places = await this._add(api, this._title(), inline(places), this.map.elementSymbology || DEFAULT_ELEMENT_STYLE);
    const bounds = featureBounds(features);
    // no flight to the same place (27q3 §13): e.g. Start and End, or elements at one place
    if (!bounds || boundsNearlyEqual(bounds, this._flown) || typeof api.flyTo !== 'function') return;
    this._flown = bounds;
    await api.flyTo(bounds, { duration });
  }

  /** Remove every layer of the story map. */
  async clear() {
    this._flown = null;
    const api = await this._api();
    if (!api) return;
    await Promise.all(Object.keys(this.layers).map((key) => this._remove(api, key)));
  }

  /** Remove the layers of the story (the background map stays). */
  async clearStory() {
    this._flown = null;
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

  /** @private The title of the layers now. */
  _title() {
    return String((typeof this.title === 'function' ? this.title() : this.title) || 'Story');
  }

  /**
   * @private A layer in the active document of the map.
   * @returns {Promise<{id: string, documentId: *}|null>}
   */
  async _add(api, title, source, style) {
    if (typeof api.addLayer !== 'function') return null;
    // the background map document of the story (review 3, 2026-11-20), else the active one
    const documentId = Number(this.map.background?.mapDocument) || (api.getActiveMapDocument?.()?.id ?? null);
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
