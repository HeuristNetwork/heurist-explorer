/**
 * QueryGeoDataProvider.js - GeoJSON data provider
 *
 * @fileOverview Loads record and query GeoJSON from the public map API, including paging, POST fallback, validation, and cancellation.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import { HeuristApiError } from '#shared/api';

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

/**
 * Loads GeoJSON from the public /map endpoints.
 */
export class QueryGeoDataProvider {
  /**
   * Create and initialize the class instance.
   */
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /**
   * Load GeoJSON for one Heurist record.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async getRecord(recordId, {
    simplify = false,
    geoFields = null,
    geoOutputMode = 'records',
    extent = null,
    signal
  } = {}) {
    const id = requireRecordId(recordId);
    const normalizedExtent = normalizeExtent(extent);
    const response = await this.apiClient.get(`/map/${id}`, {
      query: {
        simplify,
        geoOutputMode: normalizeOutputMode(geoOutputMode),
        ...(Array.isArray(geoFields) && geoFields.length ? { geofields: geoFields.join(',') } : {}),
        ...(normalizedExtent ? { extent: normalizedExtent } : {})
      },
      signal
    });
    return validateGeoJsonResponse(response);
  }

  /**
   * Load one page of GeoJSON for a Heurist query.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async search({
    query,
    limit = DEFAULT_LIMIT,
    offset = 0,
    simplify = false,
    geoFields = null,
    geoOutputMode = 'records',
    extent = null,
    method = 'auto',
    signal
  }) {
    if (query === undefined || query === null || query === '') {
      throw new TypeError('A Heurist query is required');
    }

    const normalizedLimit = normalizeLimit(limit);
    const normalizedOffset = normalizeOffset(offset);
    const normalizedExtent = normalizeExtent(extent);
    const normalizedOutputMode = normalizeOutputMode(geoOutputMode);
    const hasGeoFields = Array.isArray(geoFields) && geoFields.length > 0;
    const usePost = method === 'post'
      || (method === 'auto' && (hasGeoFields || shouldUsePost(query)));


    const response = usePost
      ? await this.apiClient.post('/map', {
          body: {
            query,
            limit: normalizedLimit,
            offset: normalizedOffset,
            simplify: Boolean(simplify),
            geoOutputMode: normalizedOutputMode,
            ...(normalizedExtent ? { extent: normalizedExtent } : {}),
            ...(hasGeoFields ? { geofields: geoFields } : {})
          },
          signal
        })
      : await this.apiClient.get('/map', {
          query: {
            q: query,
            limit: normalizedLimit,
            offset: normalizedOffset,
            simplify: Boolean(simplify),
            geoOutputMode: normalizedOutputMode,
            ...(normalizedExtent ? { extent: normalizedExtent } : {}),
            ...(hasGeoFields ? { geofields: geoFields } : {})
          },
          signal
        });

    return validateGeoJsonResponse(response);
  }

  /**
   * Load every API page and merge it into one FeatureCollection.
   */
  async searchAll({
    query,
    limit = DEFAULT_LIMIT,
    simplify = false,
    geoFields = null,
    geoOutputMode = 'records',
    extent = null,
    method = 'auto',
    signal,
    maxPages = 100,
    maxFeatures = null
  }) {
    const pageSize = normalizeLimit(limit);
    const featureLimit = normalizeFeatureLimit(maxFeatures);
    const features = [];
    let offset = 0;
    let page = 0;
    let latestMeta = {};
    const linkedRecords = new Map();
    const paths = {};
    let complete = false;
    let truncatedByFeatureLimit = false;

    while (page < maxPages) {
      throwIfAborted(signal);

      if (featureLimit != null && features.length >= featureLimit) {
        complete = true;
        break;
      }

      const response = await this.search({
        query,
        limit: pageSize,
        offset,
        simplify,
        geoFields,
        geoOutputMode,
        extent,
        method,
        signal
      });

      const remaining = featureLimit == null
        ? response.features.length
        : Math.max(0, featureLimit - features.length);
      const accepted = featureLimit == null
        ? response.features
        : response.features.slice(0, remaining);
      if (accepted.length < response.features.length) {
        truncatedByFeatureLimit = true;
      }
      features.push(...accepted);
      latestMeta = response.meta || {};
      for (const record of response.meta?.records || []) {
        const id = Number(record?.rec_ID);
        if (Number.isInteger(id) && id > 0) linkedRecords.set(id, record);
      }
      Object.assign(paths, response.meta?.paths || {});
      page += 1;

      const total = Number(latestMeta.totalRecords ?? latestMeta.total);
      const received = response.features.length;
      const returnedRecords = Number(latestMeta.returnedRecords);
      const recordStep = Number.isFinite(returnedRecords) && returnedRecords >= 0
        ? returnedRecords
        : received;
      offset += recordStep;

      if ((featureLimit != null && features.length >= featureLimit)
        || recordStep === 0
        || (Number.isFinite(total) && offset >= total)) {
        complete = true;
        break;
      }
    }

    if (!complete && page >= maxPages) {
      throw new HeuristApiError(
        `GeoJSON search exceeded the safety limit of ${maxPages} pages`
      );
    }

    const totalRecords = Number(latestMeta.totalRecords ?? latestMeta.total);
    return {
      type: 'FeatureCollection',
      features,
      meta: {
        ...latestMeta,
        ...(linkedRecords.size ? { records: [...linkedRecords.values()] } : {}),
        ...(Object.keys(paths).length ? { paths } : {}),
        offset: 0,
        limit: pageSize,
        returnedFeatures: features.length,
        isPartial: truncatedByFeatureLimit
          || (Number.isFinite(totalRecords) ? offset < totalRecords : Boolean(latestMeta.isPartial))
      }
    };
  }
}

function validateGeoJsonResponse(value) {
  if (!value || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) {
    throw new HeuristApiError(
      'The map API returned an invalid GeoJSON FeatureCollection'
    );
  }

  if (!value.meta || typeof value.meta !== 'object') {
    throw new HeuristApiError('The map API response is missing its meta object');
  }

  return value;
}

function shouldUsePost(query) {
  return typeof query === 'object' || String(query).length > 1500;
}

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(number, MAX_LIMIT);
}

function normalizeFeatureLimit(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, MAX_LIMIT) : null;
}

function normalizeOffset(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function normalizeOutputMode(value) {
  return String(value || '').toLowerCase() === 'features' ? 'features' : 'records';
}

/** Normalize engine-neutral viewport bounds without changing the stored query. */
export function normalizeExtent(value) {
  if (!value || typeof value !== 'object') return null;
  const west = Number(value.west);
  const south = Number(value.south);
  const east = Number(value.east);
  const north = Number(value.north);
  if (![west, south, east, north].every(Number.isFinite)) return null;
  return {
    west: clamp(west, -180, 180),
    south: clamp(south, -90, 90),
    east: clamp(east, -180, 180),
    north: clamp(north, -90, 90)
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function requireRecordId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new TypeError('Record ID must be a positive integer');
  }
  return id;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('The request was aborted', 'AbortError');
  }
}
