/**
 * @file RecordTypeProvider.js
 * @brief Resolves Heurist record types by concept code.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
/** Resolves Heurist record-type IDs and definitions. */
export class RecordTypeProvider {
  constructor({ apiClient }) {
    this.apiClient = apiClient;
    this.cache = new Map();
  }

  async getIdByConceptCode(conceptCode, { signal } = {}) {
    if (this.cache.has(conceptCode)) return this.cache.get(conceptCode);
    const payload = await this.apiClient.get(
      `/rty/${encodeURIComponent(conceptCode)}`,
      {
        query: { details: "rty_ID" },
        signal,
      },
    );
    const candidate = Number.isInteger(payload)
      ? payload
      : (payload?.rty_ID ??
        payload?.item?.rty_ID ??
        payload?.items?.[0]?.rty_ID ??
        payload?.records?.[0]?.rty_ID ??
        payload?.records?.[0]?.rec_ID);
    const id = Number(candidate);
    if (!Number.isInteger(id) || id < 1) {
      throw new Error(
        `Record type ${conceptCode} did not return a valid rty_ID`,
      );
    }
    this.cache.set(conceptCode, id);
    return id;
  }
}
