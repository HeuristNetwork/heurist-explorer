/**
 * @file ReportsHostAdapter.js
 * @brief What the reports manager may ask of its host (Explorer or a legacy page).
 *
 * Every call has a safe fallback when the host does not offer it: without a
 * record editor the "Properties" actions are hidden; without a current result
 * the test run uses the selection only.
 *
 * Bridge functions used:
 *   editRecord(id) / addRecord(rtyId, {values, access}) -> Promise<{saved, recordId}>, canEditRecords()
 *   describeQuery(query) -> text                    (a query in words)
 *   getCurrentQuery() -> {query, title} | null      (executable query of the active DataSource)
 *   getSelection() -> number[]                      (selected record ids)
 *   getQueryChoices() -> query sources and saved filters (listQueryChoices, for generation, review 7)
 *   getQueryChoiceDefinition(choice) -> {query, filterForm}
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
  async addRecord(recordTypeId, options = {}) {
    if (typeof this.bridge.addRecord !== 'function') throw new Error('The record editor is not available here');
    return (await this.bridge.addRecord(recordTypeId, options)) || { saved: false };
  }

  /** Definitions of the database changed (report record types installed): the host loads them again. */
  definitionsChanged() {
    try {
      this.bridge.definitionsChanged?.();
    } catch {
      // the host keeps its definitions
    }
  }

  /** A stored query in words; the text of the query without a host. */
  describeQuery(query) {
    try {
      return this.bridge.describeQuery?.(query) || String(query ?? '');
    } catch {
      return String(query ?? '');
    }
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

  /** Query sources and saved filters of the host (the one list, review 7): `[{value, kind, id, label, parameterized}]`. */
  async getQueryChoices() {
    try {
      const list = await this.bridge.getQueryChoices?.();
      return (Array.isArray(list) ? list : []).filter((item) => item && Number(item.id) > 0 && item.value);
    } catch {
      return [];
    }
  }

  /** The query of a query choice, or null. */
  async getQueryChoiceDefinition(choice) {
    try {
      return (await this.bridge.getQueryChoiceDefinition?.(choice)) || null;
    } catch {
      return null;
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
