/**
 * @file MapRecordProvider.js
 * @brief Fetches the common Heurist map document/layer API representation, shared by every
 *        renderer without applying renderer-specific defaults.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HeuristApiError } from '#shared/api';

/**
 * Fetch and validate one MapDocument or MapLayer record by kind and id.
 *
 * @param {object} apiClient Heurist API client.
 * @param {'document'|'layer'} kind Record kind to fetch (`/map/<kind>/<id>`).
 * @param {number|string} id Record id.
 * @param {{signal?: AbortSignal}} [options] Request options.
 * @returns {Promise<object>} The raw `heurist-map-<kind>` v1 response.
 * @throws {TypeError} When `id` is not a positive integer.
 * @throws {HeuristApiError} When the response has an unsupported format or version.
 */
export async function loadMapRecord(apiClient, kind, id, { signal } = {}) {
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new TypeError('A positive record ID is required');
  const value = await apiClient.get(`/map/${kind}/${Number(id)}`, { signal });
  if (value?.format !== `heurist-map-${kind}` || Number(value?.version) !== 1) {
    throw new HeuristApiError(`Unsupported Map${kind} response format/version`);
  }
  return value;
}
