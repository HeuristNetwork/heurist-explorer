/**
 * @file RecentRecords.js
 * @brief Database-scoped list of the records last shown in Record View.
 *
 * Most recent first, each record once (showing it again moves it to the top),
 * at most `limit` entries. Kept in `localStorage` - a per-browser convenience;
 * an unavailable storage just gives an empty list.
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

const DEFAULT_LIMIT = 12;

/** Most-recently-viewed records of one database. */
export class RecentRecords {
  /**
   * @param {object} [options] Store configuration.
   * @param {string|null} [options.database] Heurist database name; scopes the storage key.
   * @param {Storage|null} [options.storage] Storage backend; defaults to `localStorage`.
   * @param {number} [options.limit=12] Maximum number of records kept.
   */
  constructor({ database = null, storage = null, limit = DEFAULT_LIMIT } = {}) {
    this.storage = storage ?? defaultStorage();
    this.limit = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
    this.storageKey = `heurist.recordview.${encodeURIComponent(String(database || "").trim() || "default")}.recent`;
  }

  /**
   * Put a record at the top of the list (moving it there when already listed).
   *
   * @param {number|string} id Record ID.
   * @param {string|null} [title] Record title; an untitled view keeps the title known before.
   * @returns {Array<{id:number, title:string}>} The updated list.
   */
  add(id, title = null) {
    const recordId = Number(id);
    if (!Number.isInteger(recordId) || recordId < 1) return this.list();
    const entries = this.list();
    const previous = entries.find((entry) => entry.id === recordId);
    const text = String(title ?? "").trim() || previous?.title || "";
    const next = [{ id: recordId, title: text }, ...entries.filter((entry) => entry.id !== recordId)].slice(0, this.limit);
    try { this.storage?.setItem?.(this.storageKey, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
    return next;
  }

  /**
   * The recent records, most recent first.
   *
   * @returns {Array<{id:number, title:string}>}
   */
  list() {
    let value;
    try { value = JSON.parse(this.storage?.getItem?.(this.storageKey) || "[]"); } catch { value = []; }
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const entries = [];
    for (const item of value) {
      const id = Number(item?.id);
      if (!Number.isInteger(id) || id < 1 || seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, title: String(item?.title ?? "") });
      if (entries.length >= this.limit) break;
    }
    return entries;
  }
}

/** `localStorage` when accessible, otherwise `null`. */
function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
