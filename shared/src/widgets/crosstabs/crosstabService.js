/**
 * @file crosstabService.js
 * @brief Data of the crosstabs (plan 27q2): the Presentation set (kind Crosstab), the number of records of a query and
 *        the crosstab itself (`/records/aggregate?op=count|crosstab`). Only existing endpoints. Used by Explorer (tool
 *        pane) and the website (element `crosstabs`).
 *
 *   const service = new CrosstabService({ apiBaseUrl: runtime.apiBaseUrl, database: runtime.database });
 *   const preset = await service.loadPreset(12);              // {id, title, query, settings, configuration}
 *   const answer = await service.tabulate(preset.query, crosstabRequest(preset.settings));
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { presetFromRecords } from '../storymap/storyMapService.js';
import { normalizeCrosstabSettings } from './crosstabModel.js';

/** Longest GET URL; a longer request is a POST. */
const MAX_GET = 4000;

/** Crosstab data over the Heurist API (fetch). */
export class CrosstabService {
  /**
   * @param {object} options
   * @param {string} options.apiBaseUrl `…/api`.
   * @param {string} options.database Database name.
   * @param {object} [options.headers] Request headers (access token of Explorer).
   * @param {typeof fetch} [options.fetchImpl]
   */
  constructor({ apiBaseUrl, database, headers = {}, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
    this.base = `${String(apiBaseUrl || '').replace(/\/$/, '')}/${encodeURIComponent(database || '')}`;
    this.headers = headers || {};
    this.fetchImpl = fetchImpl;
  }

  /**
   * A request of a path of the database: GET, or POST with a JSON body when the URL would be too long.
   *
   * @param {string} path `/records/aggregate` ...
   * @param {object} [params] Parameters; objects are sent as JSON.
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<object>}
   */
  async request(path, params = {}, { signal } = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null) continue;
      query.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    const text = query.toString();
    const url = `${this.base}${path}`;
    const post = url.length + text.length > MAX_GET;
    const response = await this.fetchImpl(post ? url : `${url}${text ? `?${text}` : ''}`, {
      method: post ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: post ? { ...this.headers, 'Content-Type': 'application/json' } : this.headers,
      body: post ? JSON.stringify(params) : undefined,
      signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error?.message || `${path}: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload?.data ?? payload;
  }

  /**
   * One Presentation set with the crosstab settings.
   *
   * @param {number} id
   * @returns {Promise<{id: number, title: string, query: *, configuration: string, settings: object, typeTerm: number}|null>}
   */
  async loadPreset(id) {
    if (!(Number(id) > 0)) return null;
    const preset = presetFromRecords(await this.request('/records', { q: `ids:${Number(id)}`, fields: '_all', limit: 1 }));
    return preset ? { ...preset, settings: normalizeCrosstabSettings(preset.configuration) } : null;
  }

  /**
   * The number of records of a query.
   *
   * @param {*} query
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<number>}
   */
  async count(query, options = {}) {
    if (query == null || query === '') return 0;
    const answer = await this.request('/records/aggregate', { op: 'count', q: query }, options);
    return Number(answer?.total) || 0;
  }

  /**
   * The crosstab of a query.
   *
   * @param {*} query
   * @param {object} crosstab The `crosstab` parameter (crosstabRequest).
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<object>} The answer of op=crosstab.
   */
  tabulate(query, crosstab, options = {}) {
    return this.request('/records/aggregate', { op: 'crosstab', q: query, crosstab }, options);
  }
}
