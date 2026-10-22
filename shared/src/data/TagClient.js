/**
 * @file TagClient.js
 * @brief Tags (keywords) on `/sys/tag` in the record format (plan 20, Phase 4a).
 *
 * A tag is a record of the Tag type: its text is the DT_NAME field (2-1), its
 * description DT_SHORT_SUMMARY (2-3), the number of tagged records the read-only
 * field Usage (2-1189; `rec_Usage` in a database without it), its owner (a user or a
 * group) is `rec_OwnerUGrpID`; the record type is Tag 2-1109. This client gives plain tag
 * objects to the widgets (HTagManager, HTagSelector) and sends the writes:
 * add, rename / describe, delete, assign / remove on records, merge.
 *
 * Errors are RecordEditError: `code` "duplicate" (the owner has this text already;
 * `details.existing` is that tag), "tag_in_use" (`details.usage`, `details.records`),
 * "conflict".
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

import { RecordEditClient, RecordEditError } from './RecordEditClient.js';

/** Concept codes of the tag fields (plan 20, §10.3). */
export const TAG_FIELDS = Object.freeze({ name: '2-1', description: '2-3', usage: '2-1189' });

/** Concept code of the Tag record type (plan 20, §10.3). */
export const TAG_RECORD_TYPE = '2-1109';

/** The length of a tag (the legacy column) and the shortest text the legacy manager accepted. */
export const TAG_MAX_LENGTH = 63;
export const TAG_MIN_LENGTH = 3;

/**
 * @typedef {object} Tag
 * @property {number} id Tag id.
 * @property {string} name The tag.
 * @property {string} description Its description ('' when none).
 * @property {number} owner Owner: a user or a group id.
 * @property {string} ownerName Name of the owner ('' when not asked for).
 * @property {number} usage Number of tagged records.
 * @property {string|null} modified rec_Modified (the concurrency token).
 */

/** Reads and writes tags. */
export class TagClient {
  /**
   * @param {object} options
   * @param {object} options.apiClient HeuristApiClient (needs `get` and `request`).
   * @param {object} [options.dbdefs] HDbDefs (the field ids of the concept codes; without it 1 and 3).
   */
  constructor({ apiClient, dbdefs = null }) {
    if (typeof apiClient?.request !== 'function') throw new TypeError('TagClient requires an API client');
    this.apiClient = apiClient;
    this.dbdefs = dbdefs;
    this.records = new RecordEditClient({ apiClient, domain: 'sys', type: 'tag' });
  }

  /** @returns {{name: number, description: number, usage: number}} Local ids of the tag fields (usage 0: not in the database). */
  fieldIds() {
    const id = (code, fallback) => Number(this.dbdefs?.localId?.('dty', code)) || fallback;
    return { name: id(TAG_FIELDS.name, 1), description: id(TAG_FIELDS.description, 3), usage: id(TAG_FIELDS.usage, 0) };
  }

  /**
   * The tags of the current user and of the user's groups (or of one record).
   *
   * @param {{record?: number|string, signal?: AbortSignal}} [options] `record`: only the tags on it.
   * @returns {Promise<{currentUserId: number, tags: Tag[]}>}
   */
  async list({ record = null, signal } = {}) {
    const q = { t: 'tag', user: 'current', ...(record ? { record: String(record) } : {}) };
    const response = await this.apiClient.get('/sys', {
      signal,
      query: { q, fields: '_all,rec_OwnerName', limit: 5000, sort: 'title' }
    });
    const tags = (Array.isArray(response?.records) ? response.records : []).map((row) => this.toTag(row));
    return { currentUserId: Number(response?.meta?.currentUser?.id) || 0, tags };
  }

  /**
   * Add a tag.
   *
   * @param {{name: string, owner?: number, description?: string}} tag Owner: the user by default.
   * @returns {Promise<Tag>}
   */
  async create({ name, owner = null, description = '' }) {
    const ids = this.fieldIds();
    const record = {
      rec_ID: '0',
      ...(owner ? { rec_OwnerUGrpID: String(owner) } : {}),
      details: { [ids.name]: [String(name ?? '').trim()], ...(description ? { [ids.description]: [description] } : {}) }
    };
    return this.toTag((await this.records.insert(record)).record);
  }

  /**
   * Change a tag (only the given properties).
   *
   * @param {number} id Tag id.
   * @param {{name?: string, description?: string, owner?: number, modified?: string}} changes
   *        `modified`: the rec_Modified the change is based on (a conflict when the tag changed since).
   * @returns {Promise<Tag>}
   */
  async update(id, { name, description, owner, modified } = {}) {
    const ids = this.fieldIds();
    const details = {};
    if (name !== undefined) details[ids.name] = [String(name).trim()];
    if (description !== undefined) details[ids.description] = description ? [description] : [];
    const changes = {
      ...(Object.keys(details).length ? { details } : {}),
      ...(owner ? { rec_OwnerUGrpID: String(owner) } : {}),
      ...(modified ? { rec_Modified: modified } : {})
    };
    return this.toTag((await this.records.patch(id, changes)).record);
  }

  /**
   * Delete a tag; a tag on records only with `force` (its links are removed too).
   *
   * @returns {Promise<{deleted: number, removed: number}>}
   */
  async remove(id, { force = false } = {}) {
    return this.records.remove(id, { force });
  }

  /**
   * Put tags on records and take tags off (`replace`: the given tags become the tags of
   * the records, among the tags the user may change).
   *
   * @param {{records: Array<number>, add?: Array<number>, remove?: Array<number>, replace?: boolean}} change
   * @returns {Promise<{processed: number, added: number, removed: number, bookmarks: number}>}
   */
  async assign({ records, add = [], remove = [], replace = false }) {
    return this.records._call('POST', '/sys/tag/assign', {
      body: { records: (records || []).map(Number), add: add.map(Number), remove: remove.map(Number), replace: Boolean(replace) }
    });
  }

  /**
   * Merge a tag into another tag of the same owner: its records get the other tag, it is deleted.
   *
   * @returns {Promise<Tag>} The tag merged into.
   */
  async merge(id, into) {
    const payload = await this.records._call('POST', `/sys/tag/${Number(id)}/merge`, { body: { into: Number(into) } });
    const record = payload?.records?.[0];
    if (!record) throw new RecordEditError('The merged tag could not be read back');
    return this.toTag(record);
  }

  /**
   * Plain tag of a record of `/sys/tag`.
   *
   * @param {object} row Record.
   * @returns {Tag}
   */
  toTag(row) {
    const ids = this.fieldIds();
    const first = (fieldId) => {
      const value = row?.details?.[String(fieldId)]?.[0];
      return value && typeof value === 'object' ? value.value : value;
    };
    return {
      id: Number(row?.rec_ID) || 0,
      name: String(first(ids.name) ?? row?.rec_Title ?? ''),
      description: String(first(ids.description) ?? ''),
      owner: Number(row?.rec_OwnerUGrpID) || 0,
      ownerName: String(row?.rec_OwnerName ?? ''),
      // the Usage field, or the header of a database without it
      usage: Number((ids.usage ? first(ids.usage) : null) ?? row?.rec_Usage) || 0,
      modified: row?.rec_Modified ?? null
    };
  }
}

/**
 * Problem of a tag text (empty, too short or too long), or '' when it can be saved.
 * The shortest length is the rule of the legacy tag manager (new and renamed tags only).
 *
 * @param {string} text Tag text.
 * @returns {string} A message key, or ''.
 */
export function tagTextProblem(text) {
  const value = String(text ?? '').trim();
  if (!value) return 'Enter the tag';
  if (value.length < TAG_MIN_LENGTH) return 'A tag has at least 3 characters';
  if (value.length > TAG_MAX_LENGTH) return 'A tag has at most 63 characters';
  return '';
}
