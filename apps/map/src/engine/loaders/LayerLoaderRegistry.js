/**
 * @file LayerLoaderRegistry.js
 * @brief Registers source-specific layer loaders and dispatches MapLayer definitions
 *        to the appropriate loader.
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

/** Registers per-source-type layer loaders and dispatches MapLayer loads to the right one. */
export class LayerLoaderRegistry {
  /** Create an empty registry. */
  constructor() {
    this.loaders = new Map();
  }

  /**
   * Register a loader for one or more MapLayer source types.
   *
   * @param {string|Array<string>} sourceTypes One or more MapLayer `source.type` values.
   * @param {object} loader Loader with a `load(mapLayer, context)` method.
   * @returns {LayerLoaderRegistry} This instance, for chaining.
   */
  register(sourceTypes, loader) {
    const types = Array.isArray(sourceTypes) ? sourceTypes : [sourceTypes];
    for (const sourceType of types) {
      this.loaders.set(sourceType, loader);
    }
    return this;
  }

  /**
   * Look up the loader registered for a MapLayer source type.
   *
   * @param {string} sourceType MapLayer `source.type` value.
   * @returns {object} The registered loader.
   * @throws {Error} When no loader is registered for `sourceType`.
   */
  get(sourceType) {
    const loader = this.loaders.get(sourceType);
    if (!loader) {
      throw new Error(`MapLayer source type "${sourceType}" is not supported`);
    }
    return loader;
  }

  /**
   * Load a MapLayer using the loader registered for its source type.
   *
   * @param {object} mapLayer Normalized public MapLayer.
   * @param {object} context Layer-loading context.
   * @returns {Promise<object>} Engine-neutral runtime layer.
   * @throws {Error} When no loader is registered for the layer's source type.
   */
  async load(mapLayer, context) {
    return this.get(mapLayer.source.type).load(mapLayer, context);
  }
}
