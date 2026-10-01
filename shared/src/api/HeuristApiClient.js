/**
 * @file HeuristApiClient.js
 * @brief Request construction, authentication headers, cancellation, JSON parsing, and consistent errors for the public Heurist API.
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

import { HeuristApiError } from './HeuristApiError.js';

/**
 * Invoke the native fetch implementation without losing its required global
 * receiver in browsers.
 *
 * @param {...*} args Arguments passed to fetch.
 * @returns {Promise<Response>} Fetch response.
 */
function defaultFetch(...args) {
  return globalThis.fetch(...args);
}

/** Data endpoints whose requests are traced, can be stopped, and get a request id. */
const TRACED_PATH = /^\/(records|graph|map|time)(\/|$)/;

/** Endpoint that cancels running queries on the server; never traced itself. */
const CANCEL_PATH = '/records/cancel';

let requestCounter = 0;

/**
 * Create a request id that is unique per page and hard to guess.
 *
 * @returns {string} Request id sent in the `X-Heurist-Request-Id` header.
 */
function createRequestId() {
  requestCounter += 1;
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 16)
    || Math.random().toString(36).slice(2, 14);
  return `${Date.now().toString(36)}${requestCounter.toString(36)}${random}`;
}

/** Small fetch-based client for the public Heurist API. */
export class HeuristApiClient {
  /**
   * @param {object} options Client configuration.
   * @param {string} options.apiBaseUrl Base URL of the Heurist installation; normalized to end in `/api`.
   * @param {string} options.database Target Heurist database name.
   * @param {string|null} [options.accessToken] Bearer token added to every request's Authorization header.
   * @param {object} [options.headers] Extra headers merged into every request.
   * @param {Function} [options.fetchImpl] Fetch implementation to use instead of the global `fetch`.
   * @param {import('./RequestMonitor.js').RequestMonitor|null} [options.requestMonitor] Observer of data requests (trace, stop).
   */
  constructor({
    apiBaseUrl,
    database,
    accessToken = null,
    headers = {},
    fetchImpl = defaultFetch,
    requestMonitor = null
  } = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('A fetch implementation is required');
    }

    this.apiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
    this.database = normalizeDatabase(database);
    this.accessToken = accessToken;
    this.headers = { ...headers };
    this.fetchImpl = fetchImpl;
    this.requestMonitor = requestMonitor;
    this._running = new Map();
    requestMonitor?.attachClient(this);
  }

  /**
   * Stop all running data requests of this client: abort the fetch and ask the
   * server to stop the SQL (KILL QUERY). Callers see an `AbortError`.
   *
   * @returns {string[]} Request ids that were stopped.
   */
  abortAll() {
    const ids = [...this._running.keys()];
    for (const controller of this._running.values()) controller.abort();
    this._running.clear();
    this._cancelOnServer(ids);
    return ids;
  }

  /**
   * Ask the server to stop the SQL of aborted requests (KILL QUERY). Ids of one
   * turn of the event loop are sent together; unknown or finished ids are ignored.
   *
   * @private
   * @param {string[]} ids Request ids.
   * @returns {void}
   */
  _cancelOnServer(ids) {
    if (!ids.length) return;
    this._pendingCancel ||= new Set();
    ids.forEach((id) => this._pendingCancel.add(id));
    if (this._cancelQueued) return;
    this._cancelQueued = true;
    queueMicrotask(() => {
      const rid = [...this._pendingCancel];
      this._pendingCancel.clear();
      this._cancelQueued = false;
      this.request(CANCEL_PATH, { method: 'POST', body: { rid } })
        .catch((error) => console.warn('Cancel request failed', error));
    });
  }

  /**
   * Whether the client has both a base URL and a database, and can issue requests.
   *
   * @returns {boolean} True once both `apiBaseUrl` and `database` are configured.
   */
  isConfigured() {
    return Boolean(this.apiBaseUrl && this.database);
  }

  /**
   * Send a GET request to the public Heurist API.
   *
   * @param {string} path API path relative to the database root.
   * @param {{query?: object, signal?: AbortSignal, headers?: object}} [options] Request options.
   * @returns {Promise<*>} Parsed JSON response body.
   */
  async get(path, { query, signal, headers } = {}) {
    return this.request(path, { method: 'GET', query, signal, headers });
  }

  /**
   * Send a POST request to the public Heurist API.
   *
   * @param {string} path API path relative to the database root.
   * @param {{body?: *, signal?: AbortSignal, headers?: object}} [options] Request options.
   * @returns {Promise<*>} Parsed JSON response body.
   */
  async post(path, { body, signal, headers } = {}) {
    return this.request(path, { method: 'POST', body, signal, headers });
  }

  /**
   * Send a public Heurist API request and parse its JSON response.
   *
   * @param {string} path API path relative to the database root.
   * @param {object} [options] Request options.
   * @param {string} [options.method='GET'] HTTP method.
   * @param {object|null} [options.query] Query-string parameters.
   * @param {*} [options.body] Request body; serialized as JSON when present.
   * @param {AbortSignal} [options.signal] Abort signal for cancellation.
   * @param {object} [options.headers] Extra headers merged into this request.
   * @returns {Promise<*>} Parsed JSON response body.
   * @throws {HeuristApiError} When the client is unconfigured, the network request fails, or the API returns an error.
   */
  async request(path, {
    method = 'GET',
    query = null,
    body = undefined,
    signal,
    headers = {}
  } = {}) {
    this.assertConfigured();

    const apiPath = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`;
    const traced = TRACED_PATH.test(apiPath) && !apiPath.startsWith(CANCEL_PATH);
    const monitor = traced ? this.requestMonitor : null;
    if (monitor?.traceEnabled) {
      query = { ...(query || {}), debug: 1 };
    }

    const url = this.buildUrl(path, query);
    const requestHeaders = {
      Accept: 'application/json',
      ...this.headers,
      ...headers
    };

    let rid = null;
    let controller = null;
    // the caller gave up (superseded request, Stop): end the fetch and the server SQL
    const onCallerAbort = () => {
      controller?.abort();
      if (rid && this._running.delete(rid)) this._cancelOnServer([rid]);
    };
    if (traced) {
      // own controller: abortAll() can stop the request even when the caller passed no signal
      rid = createRequestId();
      requestHeaders['X-Heurist-Request-Id'] = rid;
      controller = new AbortController();
      if (signal?.aborted) controller.abort();
      else signal?.addEventListener('abort', onCallerAbort, { once: true });
      this._running.set(rid, controller);
    }
    const entry = monitor ? {
      rid,
      method,
      path: apiPath,
      summary: requestSummary(query, body),
      startedAt: Date.now(),
      status: 'running'
    } : null;
    if (entry) monitor.begin(entry);
    const finish = (patch) => {
      signal?.removeEventListener?.('abort', onCallerAbort);
      if (rid) this._running.delete(rid);
      if (!entry) return;
      Object.assign(entry, patch, { clientMs: Date.now() - entry.startedAt });
      monitor.end(entry);
    };

    if (this.accessToken) {
      requestHeaders.Authorization = `Bearer ${this.accessToken}`;
    }

    const init = {
      method,
      headers: requestHeaders,
      signal: controller?.signal || signal
    };

    if (body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response;
    let payload;
    try {
      response = await this.fetchImpl(url, init);
      payload = await readResponsePayload(response);
    } catch (error) {
      if (error?.name === 'AbortError' || init.signal?.aborted) {
        finish({ status: 'aborted' });
        throw error;
      }
      finish({ status: 'error', httpStatus: response?.status ?? null, error: error?.message || String(error) });
      if (error instanceof HeuristApiError) throw error;

      throw new HeuristApiError(
        `Cannot connect to the Heurist API at ${url}`,
        { url, method, cause: error }
      );
    }

    if (!response.ok) {
      const code = payload?.error;
      finish({
        status: code === 'query_timeout' ? 'timeout' : (code === 'query_cancelled' ? 'cancelled' : 'error'),
        httpStatus: response.status,
        error: extractErrorMessage(payload) || response.statusText,
        debug: payload?.debug || null
      });
      throw createResponseError(response, payload, method, url);
    }

    finish({
      status: 'ok',
      httpStatus: response.status,
      total: resultTotal(payload),
      debug: payload?.debug || null
    });

    if (payload === null && response.status !== 204) {
      throw new HeuristApiError(
        `The Heurist API returned an empty response for ${method} ${url}`,
        { status: response.status, statusText: response.statusText, url, method }
      );
    }

    return payload;
  }

  /**
   * Build an absolute API URL for the configured database.
   *
   * @param {string} path API path relative to the database root.
   * @param {object|null} [query] Query-string parameters to append.
   * @returns {string} Absolute request URL.
   */
  buildUrl(path, query = null) {
    const normalizedPath = String(path || '').startsWith('/')
      ? String(path)
      : `/${String(path || '')}`;

    const url = new URL(
      `${this.apiBaseUrl}/${encodeURIComponent(this.database)}${normalizedPath}`,
      globalThis.location?.href || 'http://localhost/'
    );

    if (query && typeof query === 'object') {
      for (const [name, value] of Object.entries(query)) {
        if (value === undefined || value === null) {
          continue;
        }
        url.searchParams.set(name, serializeQueryValue(value));
      }
    }

    return url.toString();
  }

  /**
   * Throw when required API configuration is missing.
   *
   * @returns {void}
   * @throws {HeuristApiError} When `apiBaseUrl` or `database` is not configured.
   */
  assertConfigured() {
    if (!this.apiBaseUrl) {
      throw new HeuristApiError(
        'Heurist API base URL is not configured. Set bootstrap.runtime.apiBaseUrl.'
      );
    }
    if (!this.database) {
      throw new HeuristApiError(
        'Heurist database is not configured. Set bootstrap.runtime.database.'
      );
    }
  }
}

/** Normalize a base URL, ensuring it ends in `/api` and has no trailing slash. */
function normalizeApiBaseUrl(value) {
  if (!value) {
    return null;
  }

  let result = String(value).trim().replace(/\/+$/, '');
  if (!result) {
    return null;
  }

  if (!/\/api$/i.test(result)) {
    result += '/api';
  }

  return result;
}

/** Normalize a database name, returning `null` for empty input. */
function normalizeDatabase(value) {
  const result = value == null ? '' : String(value).trim();
  return result || null;
}

/** Short text of the query of a request, for the trace log. */
function requestSummary(query, body) {
  const source = body && typeof body === 'object'
    ? (body.query ?? body.q ?? body.rule ?? body)
    : (query?.q ?? query?.query ?? query?.ids ?? null);
  let text = typeof source === 'string' ? source : JSON.stringify(source ?? '');
  const detail = (body && typeof body === 'object' ? body.detail : null) ?? query?.detail;
  if (detail) text = `[${detail}] ${text}`;
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

/** Result size reported by the different data endpoints, when present. */
function resultTotal(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.pagination?.total ?? payload.total ?? payload.meta?.count
    ?? payload.meta?.total ?? (Array.isArray(payload.features) ? payload.features.length : null);
}

/** Serialize one query-string value as a string, JSON-encoding non-primitives. */
function serializeQueryValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(value);
}

/** Read a response body as JSON, returning `null` for an empty body. */
async function readResponsePayload(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new HeuristApiError(
      `The Heurist API returned invalid JSON for ${response.url}`,
      {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        details: text.slice(0, 1000),
        cause: error
      }
    );
  }
}

/** Build a HeuristApiError describing a non-OK response. */
function createResponseError(response, payload, method, url) {
  const message = extractErrorMessage(payload)
    || `${response.status} ${response.statusText}`.trim()
    || 'Heurist API request failed';

  return new HeuristApiError(
    `Heurist API request failed: ${message}`,
    {
      status: response.status,
      statusText: response.statusText,
      url,
      method,
      code: payload?.error?.code ?? payload?.code ?? null,
      details: payload
    }
  );
}

/** Extract a human-readable message from an error response payload, when present. */
function extractErrorMessage(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return payload.error?.message
    || payload.error?.error
    || payload.message
    || payload.error
    || null;
}
