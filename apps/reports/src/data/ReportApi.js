/**
 * @file ReportApi.js
 * @brief Client of the reports manager API (`/api/{db}/reports`).
 *
 * A report is addressed by its Custom Report record id or, for a template file
 * without a record ("unregistered"), by its file name.
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

import { aggregate } from '#shared/data/aggregate.js';

/** Reports API calls. */
export class ReportApi {
  /**
   * @param {object} options
   * @param {import('#shared/api').HeuristApiClient} options.apiClient Heurist API client.
   */
  constructor({ apiClient }) {
    if (!apiClient) throw new TypeError('ReportApi requires an apiClient');
    this.apiClient = apiClient;
  }

  /**
   * Reports list: records, unregistered files, setup state.
   *
   * @param {'all'|'card'|'set'} [scope='all']
   * @returns {Promise<{installed: boolean, reports: Array<object>, unregistered?: Array<object>,
   *   missingDefinitions?: string[], canSetup?: boolean, allowDynamicReports?: boolean}>}
   */
  async list(scope = 'all') {
    return data(await this.apiClient.get('/reports', { query: { scope } }));
  }

  /** One report (record id or file name). */
  async get(reference) {
    return data(await this.apiClient.get(path(reference)));
  }

  /** Template body: `{report, body}`. */
  async readTemplate(reference) {
    return data(await this.apiClient.get(`${path(reference)}/template`));
  }

  /** Save a template body; returns the report. */
  async saveTemplate(reference, body) {
    return data(await this.apiClient.request(`${path(reference)}/template`, { method: 'PUT', body: { body } }));
  }

  /**
   * Create a report record; its template file comes with it (ReportEntityHandler, without a file name from the title).
   *
   * @param {number} rectypeId Record type Custom Report.
   * @param {Object<number, Array>} details Values by field id.
   * @returns {Promise<number>} Record id.
   */
  async createRecord(rectypeId, details) {
    const response = await this.apiClient.post('/report/0', { body: { rec_RecTypeID: rectypeId, details } });
    return Number(response?.records?.[0]?.rec_ID ?? response?.data?.records?.[0]?.rec_ID) || 0;
  }

  /**
   * Delete a report record with its unused file, or a template file without a record.
   *
   * @param {string|number} reference Record id or file name.
   * @param {{keepFile?: boolean}} [options]
   */
  async remove(reference, { keepFile = false } = {}) {
    const url = /^\d+$/.test(String(reference)) ? `/report/${reference}` : path(reference);
    return data(await this.apiClient.request(url, { method: 'DELETE', query: keepFile ? { keepFile: 1 } : null }));
  }

  /** All visible schedules, each with `reportTitle` and its last `generated` file. */
  async schedules() {
    return data(await this.apiClient.get('/reports/schedules'));
  }

  /** Delete a schedule record. */
  async deleteSchedule(scheduleId) {
    return data(await this.apiClient.request(`/output/${encodeURIComponent(scheduleId)}`, { method: 'DELETE' }));
  }

  /**
   * Files in generated-reports, newest first.
   *
   * @param {string} [report] Only the files of a report (record id or file name).
   */
  async generated(report = '') {
    return data(await this.apiClient.get('/reports/generated', { query: report ? { report } : null }));
  }

  /** Delete a generated file. */
  async deleteGenerated(file) {
    return data(await this.apiClient.request(`/reports/generated/${encodeURIComponent(file)}`, { method: 'DELETE' }));
  }

  /** Install the report record types and convert old schedules (managers). */
  async setup() {
    return data(await this.apiClient.post('/reports/setup', { body: {} }));
  }

  /**
   * Import a .gpl/.tpl file.
   *
   * @param {File} file Uploaded file.
   * @returns {Promise<object>} The new report.
   */
  async importFile(file) {
    const form = new FormData();
    form.append('import_template', file, file.name);
    const response = await this.apiClient.fetchImpl(this.apiClient.buildUrl('/reports/import'), {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      headers: this._headers()
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || `Import failed (${response.status})`);
    return data(payload);
  }

  /** URL that downloads the template with concept codes (.gpl). */
  exportUrl(reference) {
    return this.apiClient.buildUrl(`${path(reference)}/export`);
  }

  /** URL that renders one record with a report. */
  renderUrl(reference, recordId) {
    return this.apiClient.buildUrl(`${path(reference)}/render`, { rec: recordId });
  }

  /**
   * First record ids of a query (test runs).
   *
   * @param {*} query Executable query (JSON array/object or text).
   * @param {number} [limit=50]
   * @returns {Promise<number[]>}
   */
  async queryIds(query, limit = 50) {
    // total: false - the server does not count the whole result for this page
    const response = await this.apiClient.post('/records', { body: { query, detail: 'ids', limit, total: false } });
    const ids = response?.ids ?? response?.data?.ids ?? response?.records ?? [];
    return (Array.isArray(ids) ? ids : []).map(Number).filter((id) => id > 0).slice(0, limit);
  }

  /**
   * Number of records of a query.
   *
   * @param {*} query Executable query.
   * @returns {Promise<number>}
   */
  async queryCount(query) {
    const response = await aggregate(this.apiClient, 'count', { query }, { method: 'POST' });
    return Number(response?.total ?? response?.data?.total ?? 0) || 0;
  }

  /** Authorization headers for raw fetches. */
  _headers() {
    const headers = { Accept: 'application/json', ...this.apiClient.headers };
    if (this.apiClient.accessToken) headers.Authorization = `Bearer ${this.apiClient.accessToken}`;
    return headers;
  }
}

/** `/reports/<encoded reference>` */
function path(reference) {
  const value = String(reference ?? '').trim();
  if (!value) throw new TypeError('A report reference is required');
  return `/reports/${encodeURIComponent(value)}`;
}

/** The `data` member of a `{status, data}` envelope. */
function data(response) {
  return response?.data ?? response;
}
