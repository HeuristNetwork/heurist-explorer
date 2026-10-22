/**
 * @file RecordEditClient.js
 * @brief Client of the record write API (plan 14): load, insert, replace,
 *        patch, delete, duplicate and validate one record.
 *
 * The record object is the write format of the server - the record of
 * `GET /records/{id}?fields=_all` (`rec_*` headers, `details` keyed by field
 * id, arrays of values). Failed writes throw a `RecordEditError` with the HTTP
 * status, the error code (`validation`, `conflict`, `references`, ...), the
 * field issues of a 422 answer, the references of a refused delete and the
 * stored `rec_Modified` of a conflict.
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

/** Failure of a record write, with the server's details. */
export class RecordEditError extends Error {
  /**
   * @param {string} message Message for people.
   * @param {object} [options] Details.
   * @param {number|null} [options.status] HTTP status.
   * @param {string|null} [options.code] Server error code.
   * @param {Array<object>} [options.issues] Field issues `{field, index, code, severity, message}`.
   * @param {object|null} [options.references] References of a refused delete `{pointers, relationships}`.
   * @param {string|null} [options.recModified] Stored `rec_Modified` of a conflict.
   * @param {object} [options.details] The whole error body of the server (e.g. `existing` of a refused
   *        duplicate tag, `usage` and `records` of a tag in use).
   * @param {Error} [options.cause] Underlying error.
   */
  constructor(message, { status = null, code = null, issues = [], references = null, recModified = null, details = {}, cause } = {}) {
    super(message, { cause });
    this.name = 'RecordEditError';
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.references = references;
    this.recModified = recModified;
    this.details = details || {};
  }

  /** @returns {boolean} The record has invalid values (422). */
  get isValidation() {
    return this.status === 422;
  }

  /** @returns {boolean} Someone else changed the record after it was loaded (409 conflict). */
  get isConflict() {
    return this.status === 409 && this.code === 'conflict';
  }

  /** @returns {boolean} A delete was refused because other records refer to the record. */
  get hasReferences() {
    return this.status === 409 && this.code === 'references';
  }
}

/**
 * Reads and writes single records through `/records/{id}`, `/files/{id}` (file records, plan 20)
 * or `/sys/{type}/{id}` (system records in the record format: tags, plan 20 §10).
 */
export class RecordEditClient {
  /**
   * @param {{apiClient: object, domain?: 'records'|'files'|'sys', type?: string}} options HeuristApiClient
   *        (needs `request`); API domain of the records (`files`: registered files; `sys`: with `type`,
   *        e.g. `tag`).
   */
  constructor({ apiClient, domain = 'records', type = null }) {
    if (typeof apiClient?.request !== 'function') throw new TypeError('RecordEditClient requires an API client');
    if (!['records', 'files', 'sys'].includes(domain)) throw new TypeError(`Unknown record domain: ${domain}`);
    if (domain === 'sys' && !/^[a-z]+$/.test(String(type || ''))) throw new TypeError('A /sys record client needs its type');
    this.apiClient = apiClient;
    this.domain = domain;
    // path of the records: /records, /files, /sys/<type>
    this.basePath = domain === 'sys' ? `/sys/${type}` : `/${domain}`;
  }

  /**
   * Load a record in the write format (headers, every detail, edit groups and
   * hidden values for editors; pointer, term and file values resolved).
   *
   * @param {number|string} id Record id.
   * @param {{signal?: AbortSignal}} [options] Request options.
   * @returns {Promise<{record: object|null, meta: object}>} The record (null when missing or not visible).
   */
  async load(id, { signal } = {}) {
    const recordId = positiveId(id);
    const payload = await this._call('GET', `${this.basePath}/${recordId}`, { query: { fields: '_all', resolveDetails: 1, defs: 1 }, signal });
    return { record: payload?.records?.[0] || null, meta: payload?.meta || {} };
  }

  /**
   * Insert a record. `rec_ID` 0 (or missing) takes the next id; a negative id gives the id.
   *
   * @param {object} record Record in the write format.
   * @returns {Promise<{record: object, issues: Array<object>}>} The saved record and its warnings.
   */
  async insert(record) {
    const id = Number(record?.rec_ID) || 0;
    if (id > 0) throw new TypeError('insert() needs rec_ID 0 or a negative id');
    return this._saved(await this._call('POST', `${this.basePath}/${id}`, { body: { ...record, rec_ID: String(id) } }));
  }

  /**
   * Replace a stored record (PUT): fields and groups missing from `record` are cleared.
   *
   * @param {object} record Record in the write format, with `rec_ID` and `rec_Modified`.
   * @param {{force?: boolean}} [options] `force`: save even when someone else changed it.
   * @returns {Promise<{record: object, issues: Array<object>}>}
   */
  async update(record, { force = false } = {}) {
    const id = positiveId(record?.rec_ID);
    return this._saved(await this._call('PUT', `${this.basePath}/${id}`, { body: record, query: force ? { force: 1 } : null }));
  }

  /**
   * Change some fields of a stored record (PATCH); `[]` clears a field.
   *
   * @param {number|string} id Record id.
   * @param {object} changes Headers and/or `details` to change.
   * @param {{force?: boolean}} [options]
   * @returns {Promise<{record: object, issues: Array<object>}>}
   */
  async patch(id, changes, { force = false } = {}) {
    return this._saved(await this._call('PATCH', `${this.basePath}/${positiveId(id)}`, { body: changes || {}, query: force ? { force: 1 } : null }));
  }

  /**
   * Delete a record. Without `force` a record with references is not deleted
   * (`RecordEditError.hasReferences`, the list in `references`).
   *
   * @param {number|string} id Record id.
   * @param {{force?: boolean}} [options] `force`: remove the references too.
   * @returns {Promise<{deleted: string[], pointersRemoved: number, relationshipsDeleted: number}>}
   */
  async remove(id, { force = false } = {}) {
    return this._call('DELETE', `${this.basePath}/${positiveId(id)}`, { query: force ? { force: 1 } : null });
  }

  /**
   * Copy a record ("Copy of ..." name).
   *
   * @param {number|string} id Record id.
   * @returns {Promise<{record: object, issues: Array<object>}>} The new record.
   */
  async duplicate(id) {
    return this._saved(await this._call('POST', `${this.basePath}/${positiveId(id)}/duplicate`, { body: {} }));
  }

  /**
   * Run the checks of a save without saving (insert when `rec_ID` is 0 or negative).
   *
   * @param {object} record Record in the write format.
   * @returns {Promise<{valid: boolean, issues: Array<object>}>} Issues of a record that cannot be
   *          saved come back as `{valid: false, issues}` (no exception).
   */
  async validate(record) {
    const id = Number(record?.rec_ID) || 0;
    try {
      const payload = await this._call('POST', `${this.basePath}/${id}/validate`, { body: record });
      return { valid: true, issues: payload?.issues || [] };
    } catch (error) {
      if (error instanceof RecordEditError && error.isValidation) return { valid: false, issues: error.issues };
      throw error;
    }
  }

  /** @returns {{record: object, issues: Array<object>}} Record and warnings of a save answer. */
  _saved(payload) {
    const record = payload?.records?.[0] || null;
    if (!record) throw new RecordEditError('The saved record could not be read back');
    return { record, issues: payload?.meta?.issues || [] };
  }

  /** Send one request; API failures become RecordEditError. */
  async _call(method, path, { body, query = null, signal } = {}) {
    try {
      return await this.apiClient.request(path, { method, body, query, signal });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      const details = error?.details && typeof error.details === 'object' ? error.details : {};
      throw new RecordEditError(details.message || error?.message || 'The record could not be saved', {
        status: error?.status ?? null,
        code: typeof details.error === 'string' ? details.error : (error?.code ?? null),
        issues: Array.isArray(details.errors) ? details.errors : [],
        references: details.references || null,
        recModified: details.rec_Modified || null,
        details,
        cause: error
      });
    }
  }
}

/** @returns {number} A positive record id, or throws. */
function positiveId(id) {
  const value = Number(id);
  if (!Number.isInteger(value) || value < 1) throw new TypeError('A valid record id is required');
  return value;
}
