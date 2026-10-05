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

  /** Create a report (template file and record); `file` without ".tpl", or empty for a name from the title. */
  async create({ title, isCardView = false, body = '', description = '', file = '' }) {
    return data(await this.apiClient.post('/reports', { body: { title, isCardView, body, description, file } }));
  }

  /**
   * Change a report: title, description, card flag, file name (renames the template).
   *
   * @param {string|number} reference Record id or file name.
   * @param {{title?: string, description?: string, isCardView?: boolean, file?: string}} values
   * @returns {Promise<object>} The changed report.
   */
  async update(reference, values) {
    return data(await this.apiClient.request(path(reference), { method: 'PUT', body: values }));
  }

  /** Create the record of an unregistered template file. */
  async register(file, { title = '', isCardView = false } = {}) {
    return data(await this.apiClient.post(`${path(file)}/register`, { body: { title, isCardView } }));
  }

  /** Delete a report record (and its unused file) or an unregistered file. */
  async remove(reference, { keepFile = false } = {}) {
    return data(await this.apiClient.request(path(reference), { method: 'DELETE', query: keepFile ? { keepFile: 1 } : null }));
  }

  /** Add a schedule to a report; returns the report. */
  async createSchedule(reportId, schedule) {
    return data(await this.apiClient.post(`${path(reportId)}/schedules`, { body: schedule }));
  }

  /** Change a schedule of a report; returns the report. */
  async updateSchedule(reportId, scheduleId, schedule) {
    return data(await this.apiClient.request(`${path(reportId)}/schedules/${encodeURIComponent(scheduleId)}`, { method: 'PUT', body: schedule }));
  }

  /** All visible schedules, each with `reportTitle` and its last `generated` file. */
  async schedules() {
    return data(await this.apiClient.get('/reports/schedules'));
  }

  /** Delete a schedule of a report; returns the report. */
  async deleteSchedule(reportId, scheduleId) {
    return data(await this.apiClient.request(`${path(reportId)}/schedules/${encodeURIComponent(scheduleId)}`, { method: 'DELETE' }));
  }

  /**
   * Files in generated-reports, newest first.
   *
   * @param {string} [prefix] Only files whose name starts with it (a report's file name).
   */
  async generated(prefix = '') {
    return data(await this.apiClient.get('/reports/generated', { query: prefix ? { prefix } : null }));
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
    const response = await this.apiClient.post('/records', { body: { query, detail: 'count' } });
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
