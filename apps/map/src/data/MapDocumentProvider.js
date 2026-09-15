/**
 * @file MapDocumentProvider.js
 * @brief Loads and validates public MapDocument API responses and converts them to the application domain format.
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
  MAP_DOCUMENT_FORMAT,
  MAP_DOCUMENT_VERSION,
  normalizeMapDocument
} from '../core/MapDocument.js';
import { HeuristApiError } from '#shared/api';

/** Loads and validates MapDocument records through the public Heurist API. */
export class MapDocumentProvider {
  /** @param {{apiClient: object}} options Heurist API client. */
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /**
   * Load and validate a MapDocument record by id.
   *
   * @param {number|string} recordId MapDocument record ID.
   * @param {{signal?: AbortSignal}} [options] Request options.
   * @returns {Promise<object>} Normalized MapDocument.
   * @throws {TypeError} When `recordId` is not a positive integer.
   * @throws {HeuristApiError} When the response is invalid or has an unsupported format/version.
   */
  async getById(recordId, { signal } = {}) {
    const id = requireRecordId(recordId, 'MapDocument');
    const response = await this.apiClient.get(`/map/document/${id}`, { signal });

    validateFormat(response, MAP_DOCUMENT_FORMAT, MAP_DOCUMENT_VERSION, 'MapDocument');
    return normalizeMapDocument(response);
  }
}

/** Normalize a value to a positive integer record id, or throw a labeled `TypeError`. */
function requireRecordId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new TypeError(`${label} record ID must be a positive integer`);
  }
  return id;
}

/** Validate a response's shape and declared format/version, throwing a labeled `HeuristApiError` otherwise. */
function validateFormat(value, format, version, label) {
  if (!value || typeof value !== 'object') {
    throw new HeuristApiError(`The ${label} API returned an invalid response`);
  }
  if (value.format !== format) {
    throw new HeuristApiError(
      `Unsupported ${label} format "${value.format ?? 'missing'}"; expected "${format}"`
    );
  }
  if (value.version !== version) {
    throw new HeuristApiError(
      `Unsupported ${label} version "${value.version ?? 'missing'}"; expected ${version}`
    );
  }
}
