/**
 * MapDocumentProvider.js - MapDocument data provider
 *
 * @fileOverview Loads and validates public MapDocument API responses and converts them to the application domain format.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import {
  MAP_DOCUMENT_FORMAT,
  MAP_DOCUMENT_VERSION,
  normalizeMapDocument
} from '../core/MapDocument.js';
import { HeuristApiError } from '#shared/api';

/**
 * Loads and validates MapDocument records through the public Heurist API.
 */
export class MapDocumentProvider {
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
  async getById(recordId, { signal } = {}) {
    const id = requireRecordId(recordId, 'MapDocument');
    const response = await this.apiClient.get(`/map/document/${id}`, { signal });

    validateFormat(response, MAP_DOCUMENT_FORMAT, MAP_DOCUMENT_VERSION, 'MapDocument');
    return normalizeMapDocument(response);
  }
}

function requireRecordId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new TypeError(`${label} record ID must be a positive integer`);
  }
  return id;
}

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
