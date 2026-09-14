/**
 * LayerLoaderRegistry.js - Layer loader registry
 *
 * @fileOverview Registers source-specific layer loaders and dispatches MapLayer definitions to the appropriate loader.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

export class LayerLoaderRegistry {
  /**
   * Create and initialize the class instance.
   */
  constructor() {
    this.loaders = new Map();
  }

  /**
   * Register a loader for one or more MapLayer source types.
   * @returns {*} Method result.
   */
  register(sourceTypes, loader) {
    const types = Array.isArray(sourceTypes) ? sourceTypes : [sourceTypes];
    for (const sourceType of types) {
      this.loaders.set(sourceType, loader);
    }
    return this;
  }

  /**
   * Send a GET request to the public Heurist API.
   * @returns {*} Method result.
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
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async load(mapLayer, context) {
    return this.get(mapLayer.source.type).load(mapLayer, context);
  }
}
