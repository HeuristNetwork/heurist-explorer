/**
 * ImageLayerLoader.js - Image overlay layer loader
 *
 * @fileOverview Converts public image MapLayer definitions into engine-neutral
 * runtime image overlays with normalized bounds, opacity, and CSS filters.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import { normalizeBounds } from '../../utils/normalizeBounds.js';
import {
  normalizeImageFilter,
  normalizeOpacity
} from '../../utils/normalizeImageFilter.js';

/**
 * Loads static georeferenced image MapLayers.
 */
export class ImageLayerLoader {
  /**
   * Load an image MapLayer.
   *
   * @param {Object} mapLayer Normalized public MapLayer.
   * @param {Object} context Layer-loading context.
   * @returns {Promise<Object>} Engine-neutral runtime image layer.
   */
  async load(mapLayer, context) {
    const source = mapLayer.source;
    if (!source.url) {
      throw new TypeError('image source requires url');
    }

    const bounds = normalizeBounds(source.bounds);
    if (!bounds) {
      throw new TypeError('image source requires valid bounds');
    }

    const symbol = mapLayer.style?.symbol || {};

    return {
      id: context.reference.id ?? `map-layer-${context.reference.recordId}`,
      recordId: mapLayer.id,
      title: mapLayer.title,
      description: mapLayer.description,
      type: 'image',
      visible: mapLayer.visible !== false,
    visibilityMinZoom: mapLayer.options?.effectiveMinZoom ?? mapLayer.options?.minZoom,
    visibilityMaxZoom: mapLayer.options?.effectiveMaxZoom ?? mapLayer.options?.maxZoom,
      selectable: false,
      url: source.url,
      bounds,
      opacity: normalizeOpacity(symbol.opacity, 1),
      imageFilter: normalizeImageFilter(symbol),
      options: {
        ...(mapLayer.options || {}),
        ...(source.options || {})
      },
      source,
      order: context.reference.order ?? 0
    };
  }
}
