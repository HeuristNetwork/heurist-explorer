/**
 * @file ReportsHostAdapter.js
 * @brief What the reports manager may ask of its host (Explorer or a legacy page).
 *
 * Every call has a safe fallback when the host does not offer it: without a
 * record editor the "Properties" actions are hidden; without a current result
 * the test run uses the selection only.
 *
 * Bridge functions used:
 *   editRecord(id) / addRecord(rtyId) -> Promise<{saved, recordId}>, canEditRecords()
 *   getCurrentQuery() -> {query, title} | null      (executable query of the active DataSource)
 *   getSelection() -> number[]                      (selected record ids)
 *   getQuerySources() -> [{id, title, parametrized}] (for schedules and generation)
 *   getUserGroups() -> {currentUserId, users, groups} (owner group names)
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-reports
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Host bridge with fallbacks. */
export class ReportsHostAdapter {
  /** @param {object|null} bridge Host bridge (may be null when standalone). */
  constructor(bridge = null) {
    this.bridge = bridge || {};
  }

  /** Whether the host can open the record editor. */
  canEditRecords() {
    if (typeof this.bridge.editRecord !== 'function') return false;
    return typeof this.bridge.canEditRecords === 'function' ? this.bridge.canEditRecords() === true : true;
  }

  /** Open the record editor; resolves `{saved}`. */
  async editRecord(id) {
    if (!this.canEditRecords()) throw new Error('The record editor is not available here');
    return (await this.bridge.editRecord(id)) || { saved: false };
  }

  /** Open the record editor for a new record; resolves `{saved, recordId}`. */
  async addRecord(recordTypeId) {
    if (typeof this.bridge.addRecord !== 'function') throw new Error('The record editor is not available here');
    return (await this.bridge.addRecord(recordTypeId)) || { saved: false };
  }

  /** `{query, title}` of the host's current result, or null. */
  async getCurrentQuery() {
    try {
      const current = await this.bridge.getCurrentQuery?.();
      return current?.query ? current : null;
    } catch {
      return null;
    }
  }

  /** Selected record ids in the host. */
  async getSelection() {
    try {
      const ids = await this.bridge.getSelection?.();
      return (Array.isArray(ids) ? ids : []).map(Number).filter((id) => id > 0);
    } catch {
      return [];
    }
  }

  /** Query Sources known to the host: `[{id, title}]`. */
  async getQuerySources() {
    try {
      const list = await this.bridge.getQuerySources?.();
      return (Array.isArray(list) ? list : [])
        .map((item) => ({
          id: Number(item.id ?? item.recordId),
          title: String(item.title || item.name || item.id),
          parametrized: item.parametrized === true
        }))
        .filter((item) => item.id > 0);
    } catch {
      return [];
    }
  }

  /** Users and groups data for owner group names, or null. */
  async getUserGroups() {
    try {
      return (await this.bridge.getUserGroups?.()) || null;
    } catch {
      return null;
    }
  }
}
