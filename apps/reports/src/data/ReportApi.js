/**
 * @file ReportApi.js
 * @brief Client of the entities `report` and `output` (plan 30): reports and generated reports are
 *        named by their record id; the file names stay on the server.
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

/** Records of one search. */
const SEARCH_LIMIT = 5000;

/** Calls of the reports manager. */
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
   * State of the definitions, the report records and the template files without a record.
   *
   * @returns {Promise<{installed: boolean, reports: Array<object>, unregistered: Array<object>,
   *   missingDefinitions: string[], canSetup: boolean, allowDynamicReports: boolean, settings: object}>}
   */
  async list() {
    const status = await this.apiClient.get('/report/setup');
    const reports = status?.installed ? await this.reports() : [];
    return {
      ...status,
      missingDefinitions: status?.missing || [],
      reports,
      unregistered: (status?.unregistered || []).map((file) => ({ ...file, id: null, canEdit: true, isCardView: false, fileExists: true, outputCount: 0 }))
    };
  }

  /** @returns {Promise<Array<object>>} The visible reports, with their values (`meta.items`). */
  async reports() {
    return described(await this.apiClient.get('/report', { query: { fields: 'rec_ID,rec_Title', limit: SEARCH_LIMIT } }));
  }

  /** @returns {Promise<Array<object>>} The visible outputs, with their report, query, language and file. */
  async outputs() {
    return described(await this.apiClient.get('/output', { query: { fields: 'rec_ID,rec_Title', limit: SEARCH_LIMIT } }));
  }

  /** Template body: `{report, body}`. */
  async readTemplate(reportId) {
    return this.apiClient.get(`${path(reportId)}/asset`);
  }

  /** Save a template body; returns the report. */
  async saveTemplate(reportId, body) {
    return this.apiClient.request(`${path(reportId)}/asset`, { method: 'PUT', body: { body } });
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
    return Number(response?.records?.[0]?.rec_ID) || 0;
  }

  /**
   * Copy a report: the copy has its own template file, named after the title.
   *
   * @param {number} reportId Report.
   * @param {string} title Title of the copy.
   * @returns {Promise<number>} Id of the copy.
   */
  async duplicate(reportId, title) {
    const response = await this.apiClient.post(`${path(reportId)}/duplicate`, { body: { title } });
    return Number(response?.records?.[0]?.rec_ID) || 0;
  }

  /** Delete a report and its template file; refused (409) while outputs point to it. */
  async remove(reportId) {
    return this.apiClient.request(path(reportId), { method: 'DELETE' });
  }

  /** Delete a template file without a record. */
  async removeFile(file) {
    return this.apiClient.request('/report/setup', { method: 'DELETE', query: { file } });
  }

  /** Delete an output and its file. */
  async deleteOutput(outputId) {
    return this.apiClient.request(outputPath(outputId), { method: 'DELETE' });
  }

  /** Delete the file of an output; the record stays. */
  async deleteOutputFile(outputId) {
    return this.apiClient.request(`${outputPath(outputId)}/asset`, { method: 'DELETE' });
  }

  /** Install the report record types and convert old schedules (managers). */
  async setup() {
    return this.apiClient.post('/report/setup', { body: {} });
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
    const response = await this.apiClient.fetchImpl(this.apiClient.buildUrl('/report/import'), {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      headers: this._headers()
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || `Import failed (${response.status})`);
    return payload;
  }

  /** URL that downloads the template with concept codes (.gpl). */
  exportUrl(reportId) {
    return this.apiClient.buildUrl(`${path(reportId)}/export`);
  }

  /** URL that renders one record with a report. */
  renderUrl(reportId, recordId) {
    return this.apiClient.buildUrl(`${path(reportId)}/execute`, { recordId });
  }

  /**
   * URL of the generated file of an output.
   *
   * @param {number} outputId Output.
   * @param {{download?: boolean}} [options] `download`: as a file named by the title of the output.
   * @returns {string}
   */
  outputUrl(outputId, { download = false } = {}) {
    return this.apiClient.buildUrl(`${outputPath(outputId)}/asset`, download ? { download: 1 } : null);
  }

  /**
   * The query of a Query Source.
   *
   * @param {number} sourceId Query Source record.
   * @returns {Promise<*>}
   */
  async querySourceQuery(sourceId) {
    const response = await this.apiClient.get(`/records/querysource/${Number(sourceId)}`);
    return response?.source?.query ?? null;
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

/** The rows of a search: `{id, title, ...meta.items[id]}`. */
function described(response) {
  const items = response?.meta?.items || {};
  return (response?.records || []).map((record) => ({
    id: Number(record.rec_ID),
    title: String(record.rec_Title ?? ''),
    ...items[record.rec_ID]
  }));
}

/** `/report/<id>` */
function path(reportId) {
  const id = Number(reportId);
  if (!(id > 0)) throw new TypeError('A report record id is required');
  return `/report/${id}`;
}

/** `/output/<id>` */
function outputPath(outputId) {
  const id = Number(outputId);
  if (!(id > 0)) throw new TypeError('An output record id is required');
  return `/output/${id}`;
}
