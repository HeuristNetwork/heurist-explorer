/**
 * @file MapLayerProvider.js
 * @brief Loads and validates public MapLayer API responses and converts them to the application domain format.
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

import {
  MAP_LAYER_FORMAT,
  MAP_LAYER_VERSION,
  normalizeMapLayer
} from '../core/MapLayer.js';
import { HeuristApiError } from '#shared/api';
import { loadMapRecord } from '#shared/data/MapRecordProvider.js';

/** Loads and validates MapLayer records through the public Heurist API. */
export class MapLayerProvider {
  /** @param {{apiClient: object}} options Heurist API client. */
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /**
   * Load and validate a MapLayer record by id.
   *
   * @param {number|string} recordId MapLayer record ID.
   * @param {{signal?: AbortSignal, defaults?: object}} [options] Request options; `defaults` seeds the layer's inherited style.
   * @returns {Promise<object>} Normalized MapLayer.
   * @throws {TypeError} When `recordId` is not a positive integer.
   * @throws {HeuristApiError} When the response is invalid or has an unsupported format/version.
   */
  async getById(recordId, { signal, defaults } = {}) {
    const id = requireRecordId(recordId);
    const response = await loadMapRecord(this.apiClient, 'layer', id, { signal });

    validateResponse(response);
    return normalizeMapLayer(response, { defaults });
  }
}

/** Normalize a value to a positive integer record id, or throw a `TypeError`. */
function requireRecordId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new TypeError('MapLayer record ID must be a positive integer');
  }
  return id;
}

/** Validate a response's shape and declared format/version, throwing a `HeuristApiError` otherwise. */
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
