/**
 * ThematicAttributeProvider.js - Thematic record attribute provider
 *
 * @fileOverview Loads selected direct or linked Heurist record details through the public records API.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import { HeuristApiError } from '#shared/api';

/**
 * Loads thematic attribute values for Heurist record IDs.
 */
export class ThematicAttributeProvider {
  /**
   * Create and initialize the class instance.
   */
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /**
   * Retrieve requested thematic fields for the supplied record IDs.
   *
   * @param {Object} options Request options.
   * @param {Array<number|string>} options.recordIds Heurist record IDs.
   * @param {Array<string>} options.fieldCodes Full Heurist field-path codes.
   * @param {AbortSignal} [options.signal] Optional request cancellation signal.
   * @returns {Promise<Object>} Public records API response.
   */
  async load({ recordIds, fieldCodes, signal } = {}) {
    const ids = normalizeRecordIds(recordIds);
    const fields = normalizeFieldCodes(fieldCodes);

    if (!ids.length || !fields.length) {
      return { records: [], meta: null };
    }

    const response = await this.apiClient.post('/records', {
      body: { ids, fields, resolveDetails: true },
      signal
    });
    return validateResponse(response);
  }
}

function normalizeRecordIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0))];
}

function normalizeFieldCodes(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean))];
}

function validateResponse(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.records)) {
    throw new HeuristApiError(
      'The records API returned an invalid response'
    );
  }
  return value;
}
