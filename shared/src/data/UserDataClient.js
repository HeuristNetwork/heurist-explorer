/**
 * @file UserDataClient.js
 * @brief Bookmarks and reminders on `/sys/bookmark` and `/sys/reminder` in the record
 *        format (plan 20, Phase 4b).
 *
 * The fields come from the hard-coded structures (systemEntities.js); the clients give
 * plain objects keyed as there (`{rating, notes, privateInfo}`, `{recipient, email,
 * message, startDate, frequency}`) and send the writes. A bookmark belongs to the
 * current user only; its private note is decrypted for them by the server.
 *
 * Errors are RecordEditError: `code` "duplicate" (the record is bookmarked already;
 * `details.existing`), "has_personal_tags", "conflict", "not_sent".
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

import { RecordEditClient } from './RecordEditClient.js';
import { systemDetails, systemValues } from './systemEntities.js';

/**
 * @typedef {object} Bookmark
 * @property {number} id Bookmark id.
 * @property {number} recordId The bookmarked record.
 * @property {number} rating 0 (not rated) to 5.
 * @property {string} notes Personal notes.
 * @property {string} privateInfo The private note ('' when none or unreadable).
 * @property {boolean} unreadable The private note was encrypted with another key.
 * @property {string|null} modified rec_Modified.
 */

/**
 * @typedef {object} Reminder
 * @property {number} id Reminder id.
 * @property {number} recordId The record.
 * @property {number} owner The user who made it.
 * @property {string} recipient A user or group id ('' when e-mails).
 * @property {string} email E-mail addresses.
 * @property {string} message Message.
 * @property {string} startDate YYYY-MM-DD.
 * @property {string} frequency Term id of the frequency.
 * @property {string|null} modified rec_Modified.
 */

/** Shared reads and writes of one system type of the user's data. */
class UserDataClient {
  /**
   * @param {object} options
   * @param {object} options.apiClient HeuristApiClient (needs `get` and `request`).
   * @param {object} options.dbdefs HDbDefs (the field ids of the concept codes).
   * @param {string} type 'bookmark' | 'reminder'.
   */
  constructor({ apiClient, dbdefs }, type) {
    if (typeof apiClient?.request !== 'function') throw new TypeError('A user data client requires an API client');
    this.apiClient = apiClient;
    this.dbdefs = dbdefs;
    this.type = type;
    this.records = new RecordEditClient({ apiClient, domain: 'sys', type });
  }

  /**
   * The items of the user on one record.
   *
   * @param {number|string} recordId Record.
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<{items: Array<object>, meta: object}>}
   */
  async ofRecord(recordId, { signal } = {}) {
    const response = await this.apiClient.get('/sys', {
      signal,
      query: { q: { t: this.type, 'f:record': String(recordId) }, fields: '_all', limit: 500, sort: 'id' }
    });
    const rows = Array.isArray(response?.records) ? response.records : [];
    return { items: rows.map((row) => this.toItem(row, response?.meta)), meta: response?.meta || {} };
  }

  /**
   * Add an item.
   *
   * @param {number|string} recordId Record.
   * @param {object} values Plain values (keys of the structure).
   * @returns {Promise<{item: object, issues: Array<object>}>}
   */
  async create(recordId, values) {
    const details = systemDetails(this.type, { ...values, record: String(recordId) }, this.dbdefs);
    const saved = await this.records.insert({ rec_ID: '0', details });
    return { item: this.toItem(saved.record), issues: saved.issues };
  }

  /**
   * Change the given values of an item.
   *
   * @param {number} id Item id.
   * @param {object} values Plain values ('' clears).
   * @param {{modified?: string|null}} [options] The rec_Modified the change is based on.
   * @returns {Promise<{item: object, issues: Array<object>}>}
   */
  async update(id, values, { modified = null } = {}) {
    const { record, ...rest } = values || {};
    const saved = await this.records.patch(id, {
      details: systemDetails(this.type, rest, this.dbdefs),
      ...(modified ? { rec_Modified: modified } : {})
    });
    return { item: this.toItem(saved.record), issues: saved.issues };
  }

  /** Delete an item. */
  async remove(id) {
    return this.records.remove(id);
  }

  /** @returns {object} Plain item of a record. */
  toItem(row) {
    const values = systemValues(this.type, row, this.dbdefs);
    return {
      id: Number(row?.rec_ID) || 0,
      recordId: Number(values.record) || 0,
      owner: Number(row?.rec_OwnerUGrpID) || 0,
      modified: row?.rec_Modified ?? null,
      ...values
    };
  }
}

/** Bookmarks of the current user. */
export class BookmarkClient extends UserDataClient {
  /** @param {{apiClient: object, dbdefs: object}} options */
  constructor(options) {
    super(options, 'bookmark');
  }

  /**
   * The bookmark of the user on a record, or null; `encrypted`: whether the installation
   * encrypts the private notes.
   *
   * @returns {Promise<{bookmark: Bookmark|null, encrypted: boolean}>}
   */
  async ofRecord(recordId, options) {
    const { items, meta } = await super.ofRecord(recordId, options);
    return { bookmark: items[0] || null, encrypted: meta?.privateInfo?.encrypted !== false };
  }

  /** @returns {Bookmark} */
  toItem(row, meta = null) {
    const item = super.toItem(row);
    const unreadable = (meta?.privateInfo?.unreadable || []).map(Number).includes(item.id);
    return { ...item, rating: Number(item.rating) || 0, unreadable };
  }
}

/** Reminders of the current user. */
export class ReminderClient extends UserDataClient {
  /** @param {{apiClient: object, dbdefs: object}} options */
  constructor(options) {
    super(options, 'reminder');
  }

  /**
   * The reminders of the user on a record.
   *
   * @returns {Promise<Reminder[]>}
   */
  async ofRecord(recordId, options) {
    return (await super.ofRecord(recordId, options)).items;
  }

  /**
   * E-mail a reminder now, without saving it (legacy "Send immediately").
   *
   * @param {number|string} recordId Record.
   * @param {object} values Plain values of the reminder.
   * @returns {Promise<{sent: boolean, record: number}>}
   */
  async send(recordId, values) {
    const details = systemDetails(this.type, { ...values, record: String(recordId) }, this.dbdefs);
    return this.records._call('POST', '/sys/reminder/send', { body: { details } });
  }
}
