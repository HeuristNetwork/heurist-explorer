/**
 * TileLayerLoader.js - Tile layer loader
 *
 * @fileOverview Converts public tile MapLayer definitions into engine-neutral runtime tile layers.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import { normalizeImageFilter, normalizeOpacity } from '../../utils/normalizeImageFilter.js';

export class TileLayerLoader {
  /**
   * Load a MapLayer using the loader registered for its source type.
   * @returns {Promise<*>} Resolves when the operation completes.
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
