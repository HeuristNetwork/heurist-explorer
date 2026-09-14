/**
 * MapLayerProvider.js - MapLayer data provider
 *
 * @fileOverview Loads and validates public MapLayer API responses and converts them to the application domain format.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import {
  MAP_LAYER_FORMAT,
  MAP_LAYER_VERSION,
  normalizeMapLayer
} from '../core/MapLayer.js';
import { HeuristApiError } from '#shared/api';

/**
 * Loads and validates MapLayer records through the public Heurist API.
 */
export class MapLayerProvider {
  /**
   * Create and initialize the class instance.
   */
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /**
   * Load and validate a public API entity by record ID.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async getById(recordId, { signal, defaults } = {}) {
    const id = requireRecordId(recordId);
    const response = await this.apiClient.get(`/map/layer/${id}`, { signal });

    validateResponse(response);
    return normalizeMapLayer(response, { defaults });
  }
}

function requireRecordId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new TypeError('MapLayer record ID must be a positive integer');
  }
  return id;
}

function validateResponse(value) {
  if (!value || typeof value !== 'object') {
    throw new HeuristApiError('The MapLayer API returned an invalid response');
  }
  if (value.format !== MAP_LAYER_FORMAT) {
    throw new HeuristApiError(
      `Unsupported MapLayer format "${value.format ?? 'missing'}"; expected "${MAP_LAYER_FORMAT}"`
    );
  }
  if (value.version !== MAP_LAYER_VERSION) {
    throw new HeuristApiError(
      `Unsupported MapLayer version "${value.version ?? 'missing'}"; expected ${MAP_LAYER_VERSION}`
    );
  }
}
