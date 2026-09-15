/**
 * @file TileLayerLoader.js
 * @brief Converts public tile MapLayer definitions into engine-neutral runtime tile layers.
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

import { normalizeImageFilter, normalizeOpacity } from '../../utils/normalizeImageFilter.js';

/** Loads XYZ tile MapLayers into engine-neutral runtime tile layers. */
export class TileLayerLoader {
  /**
   * Load a tile MapLayer.
   *
   * @param {object} mapLayer Normalized public MapLayer.
   * @param {object} context Layer-loading context.
   * @returns {Promise<object>} Engine-neutral runtime tile layer.
   * @throws {TypeError} When the source has no `url`.
   */
  async load(mapLayer, context) {
    const source = mapLayer.source;
    if (!source.url) {
      throw new TypeError('tile source requires url');
    }

    const symbol = mapLayer.style?.symbol || {};

    return {
      id: context.reference.id ?? `map-layer-${context.reference.recordId}`,
      recordId: mapLayer.id,
      title: mapLayer.title,
      description: mapLayer.description,
      type: 'tile',
      visible: mapLayer.visible !== false,
      visibilityMinZoom: mapLayer.options?.effectiveMinZoom ?? mapLayer.options?.minZoom,
      visibilityMaxZoom: mapLayer.options?.effectiveMaxZoom ?? mapLayer.options?.maxZoom,
      selectable: false,
      url: source.url,
      tms: (source.tms===true),
      attribution: source.attribution || '',
      minZoom: source.minZoom,
      maxZoom: source.maxZoom,
      subdomains: source.subdomains,
      bounds: source.bounds,
      opacity: normalizeOpacity(symbol.opacity ?? source.opacity ?? mapLayer.options?.opacity, 1),
      imageFilter: normalizeImageFilter(symbol),
      noWrap: source.noWrap ?? Boolean(source.bounds),
      options: {
        ...(mapLayer.options || {}),
        ...(source.options || {})
      },
      source,
      order: context.reference.order ?? 0
    };
  }
}
