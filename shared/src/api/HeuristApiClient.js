/**
 * HeuristApiClient.js - Heurist public API client
 *
 * @fileOverview Provides request construction, authentication headers, cancellation, JSON parsing, and consistent errors for the public Heurist API.
 * @project     Heurist academic knowledge management system
 * @package     client-core.api
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
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

/**
 * Small fetch-based client for the public Heurist API.
 */
export class HeuristApiClient {
  /**
   * Create and initialize the class instance.
   */
  constructor({
    apiBaseUrl,
    database,
    accessToken = null,
    headers = {},
    fetchImpl = defaultFetch
  } = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('A fetch implementation is required');
    }

    this.apiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
    this.database = normalizeDatabase(database);
    this.accessToken = accessToken;
    this.headers = { ...headers };
    this.fetchImpl = fetchImpl;
  }

  /**
   * Return whether the API client has the required base URL and database.
   * @returns {boolean} Operation result.
   */
  isConfigured() {
    return Boolean(this.apiBaseUrl && this.database);
  }

  /**
   * Send a GET request to the public Heurist API.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async get(path, { query, signal, headers } = {}) {
    return this.request(path, { method: 'GET', query, signal, headers });
  }

  /**
   * Send a POST request to the public Heurist API.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async post(path, { body, signal, headers } = {}) {
    return this.request(path, { method: 'POST', body, signal, headers });
  }

  /**
   * Send a public Heurist API request and parse its JSON response.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async request(path, {
    method = 'GET',
    query = null,
    body = undefined,
    signal,
    headers = {}
  } = {}) {
    this.assertConfigured();

    const url = this.buildUrl(path, query);
    const requestHeaders = {
      Accept: 'application/json',
      ...this.headers,
      ...headers
    };

    if (this.accessToken) {
      requestHeaders.Authorization = `Bearer ${this.accessToken}`;
    }

    const init = {
      method,
      headers: requestHeaders,
      signal
    };

    if (body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) {
        throw error;
      }

      throw new HeuristApiError(
        `Cannot connect to the Heurist API at ${url}`,
        { url, method, cause: error }
      );
    }

    const payload = await readResponsePayload(response);

    if (!response.ok) {
      throw createResponseError(response, payload, method, url);
    }

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
   * @returns {*} Method result.
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
   * @returns {*} Method result.
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

function normalizeDatabase(value) {
  const result = value == null ? '' : String(value).trim();
  return result || null;
}

function serializeQueryValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(value);
}

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
