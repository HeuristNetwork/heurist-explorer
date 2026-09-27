/**
 * @file RecordDataProvider.js
 * @brief Fetches exactly one fully-resolved record by id, for the `builtin` render engine.
 *
 * Never queries the active DataSource/search — Record View only ever needs
 * the single displayed record's own fields, so `load()` always issues an
 * `ids:<id>` query for one record, regardless of what the shared selection
 * or any presentation module's DataSource currently is.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
// Extra headers requested alongside `_all` (every populated detail, fully
// resolved) — the footer's date/owner/visibility fields, plus rec_Title
// since `_all` alone does not imply it. `rec_OwnerName` is deliberately not
// requested: it's a virtual (extra join), not a plain Records column, and
// is left out of `_all`'s own header expansion server-side too.
const FOOTER_FIELDS = ["rec_Title", "rec_Added", "rec_Modified", "rec_OwnerUGrpID", "rec_NonOwnerVisibility"];

/** Fetches one fully-resolved record by id. */
export class RecordDataProvider {
  /** @param {{apiClient: object}} options Heurist API client. */
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /**
   * Load exactly one record, with every detail value resolved, plus the
   * footer's header fields — in one request via the `fields=_all` sentinel.
   *
   * @param {{id: number|string, signal?: AbortSignal}} options Load options.
   * @returns {Promise<object|null>} The resolved record, or `null` when not found.
   * @throws {TypeError} When `id` is invalid, or the response is missing `records`.
   */
  async load({ id, signal } = {}) {
    const recordId = Number(id);
    if (!Number.isInteger(recordId) || recordId < 1) {
      throw new TypeError("A valid Heurist record id is required");
    }
    const response = await this.apiClient.post("/records", {
      signal,
      body: {
        q: `ids:${recordId}`,
        limit: 1,
        resolveDetails: 1,
        fields: ["_all", ...FOOTER_FIELDS].join(","),
      },
    });
    if (!response || !Array.isArray(response.records)) {
      throw new TypeError("Records API response is missing records");
    }
    return response.records[0] || null;
  }

  /**
   * Tags of one record that the current user sees: their personal tags and the
   * tags of their groups (`GET /sys` `{t:"tag", record, user:"current"}`), each
   * with its owner's name. Guests and failures give no tags - the view still renders.
   *
   * @param {{id: number|string, signal?: AbortSignal}} options Load options.
   * @returns {Promise<{currentUserId: number, tags: Array<{id:number, name:string, owner:number, ownerName:string}>}>}
   */
  async loadTags({ id, signal } = {}) {
    const recordId = Number(id);
    const none = { currentUserId: 0, tags: [] };
    if (!Number.isInteger(recordId) || recordId < 1 || typeof this.apiClient?.get !== "function") return none;
    try {
      const response = await this.apiClient.get("/sys", {
        signal,
        query: { q: { t: "tag", record: String(recordId), user: "current" }, fields: "owner,ownername", limit: 1000 },
      });
      const tags = (Array.isArray(response?.records) ? response.records : []).map((row) => ({
        id: Number(row.rec_ID),
        name: String(row.rec_Title ?? ""),
        owner: Number(row.rec_OwnerUGrpID),
        ownerName: String(row.details?.ownerName?.[0]?.value ?? ""),
      }));
      return { currentUserId: Number(response?.meta?.currentUser?.id) || 0, tags };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return none;
    }
  }
}
