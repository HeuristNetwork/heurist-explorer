/**
 * @file JobClient.js
 * @brief Client of the background jobs API (`/api/{db}/jobs`): start, poll, stop, result.
 *
 * A job is started with POST; the server answers with the queued job and then
 * runs it. `wait()` polls the job state (faster at first, then every two
 * seconds) until it ends: done, failed, cancelled, timeout or lost.
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

/** Job statuses of a job that has not finished. */
export const ACTIVE_JOB_STATUSES = Object.freeze(['queued', 'running']);

/**
 * Whether a job has finished (any status other than queued/running).
 *
 * @param {object|null} job Job state.
 * @returns {boolean}
 */
export function isJobFinished(job) {
  return Boolean(job) && !ACTIVE_JOB_STATUSES.includes(job.status);
}

/** Start, follow and stop background jobs. */
export class JobClient {
  /**
   * @param {object} options Client options.
   * @param {import('./HeuristApiClient.js').HeuristApiClient} options.apiClient Heurist API client.
   * @param {Function} [options.sleep] Delay function (tests).
   */
  constructor({ apiClient, sleep = null } = {}) {
    if (!apiClient) throw new TypeError('JobClient requires an apiClient');
    this.apiClient = apiClient;
    this.sleep = sleep || ((ms, signal) => new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason || new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }));
  }

  /**
   * Start a job.
   *
   * @param {string} type Job type (e.g. `report-preview`).
   * @param {object} params Job parameters.
   * @returns {Promise<object>} The queued job.
   */
  async start(type, params = {}) {
    const response = await this.apiClient.post('/jobs', { body: { type, params } });
    return response?.data ?? response;
  }

  /**
   * Current state of a job.
   *
   * @param {string} id Job id.
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<object>} Job state.
   */
  async get(id, { signal } = {}) {
    const response = await this.apiClient.get(`/jobs/${encodeURIComponent(id)}`, { signal });
    return response?.data ?? response;
  }

  /**
   * Ask a job to stop.
   *
   * @param {string} id Job id.
   * @returns {Promise<object>} Job state with `cancelRequested`.
   */
  async cancel(id) {
    const response = await this.apiClient.post(`/jobs/${encodeURIComponent(id)}/cancel`, { body: {} });
    return response?.data ?? response;
  }

  /**
   * Jobs of the current user (managers: all jobs with `all`).
   *
   * @param {{all?: boolean}} [options]
   * @returns {Promise<Array<object>>}
   */
  async list({ all = false } = {}) {
    const response = await this.apiClient.get('/jobs', { query: all ? { all: 1 } : null });
    return response?.data ?? response ?? [];
  }

  /**
   * URL of the stored result content of a finished job (to load in a frame).
   *
   * @param {string} id Job id.
   * @returns {string}
   */
  resultUrl(id) {
    return this.apiClient.buildUrl(`/jobs/${encodeURIComponent(id)}/result`);
  }

  /**
   * Stored result content of a finished job (e.g. preview HTML).
   *
   * @param {string} id Job id.
   * @returns {Promise<string>}
   */
  async result(id) {
    const url = this.apiClient.buildUrl(`/jobs/${encodeURIComponent(id)}/result`);
    const headers = { Accept: 'text/html', ...this.apiClient.headers };
    if (this.apiClient.accessToken) headers.Authorization = `Bearer ${this.apiClient.accessToken}`;
    const response = await this.apiClient.fetchImpl(url, { headers, credentials: 'same-origin' });
    const text = await response.text();
    if (!response.ok) throw new Error(errorMessage(text) || `Job result request failed (${response.status})`);
    return text;
  }

  /**
   * Poll a job until it has finished.
   *
   * @param {string|object} jobOrId Job (as returned by `start`) or its id.
   * @param {object} [options]
   * @param {function(object): void} [options.onUpdate] Called with each new state.
   * @param {AbortSignal} [options.signal] Stops polling (the job keeps running).
   * @returns {Promise<object>} Final job state.
   */
  async wait(jobOrId, { onUpdate = null, signal } = {}) {
    const id = typeof jobOrId === 'string' ? jobOrId : jobOrId?.id;
    if (!id) throw new TypeError('A job id is required');
    let job = typeof jobOrId === 'object' ? jobOrId : null;
    if (job) onUpdate?.(job);
    for (let attempt = 0; !isJobFinished(job); attempt++) {
      await this.sleep(pollDelay(attempt), signal);
      job = await this.get(id, { signal });
      onUpdate?.(job);
    }
    return job;
  }

  /**
   * Start a job and wait for its end.
   *
   * @param {string} type Job type.
   * @param {object} params Job parameters.
   * @param {object} [options] See `wait()`.
   * @returns {Promise<object>} Final job state.
   */
  async run(type, params, options = {}) {
    const job = await this.start(type, params);
    return this.wait(job, options);
  }
}

/** Poll delay: 300 ms, 600 ms, 1 s, then every 2 s. */
export function pollDelay(attempt) {
  return [300, 600, 1000][attempt] ?? 2000;
}

/** Message of a JSON error envelope, or null. */
function errorMessage(text) {
  try {
    const payload = JSON.parse(text);
    return payload?.message || null;
  } catch {
    return null;
  }
}
