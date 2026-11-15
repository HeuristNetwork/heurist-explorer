/**
 * @file cmsSavedFilter.js
 * @brief The CMS action Saved filter (plan 27j): a public query source, a target page and the values of its parameters.
 *
 * Stored as a reference (not as the resolved query): `{source: <query source id>, page: <page id>, values: {X1: 'Paris',
 * X2: ['a', 'b']}}` (an action menu item has the page in `target`). The link opens the target page with
 * `?source=<id>&v.<NAME>=<value>` (an array repeats the key); the site runtime of that page reads it, fills the values
 * into the query (`resolveQueryParameters`) and gives the result to every record module of the page. A missing value
 * leaves its predicate out; Explorer asks for the missing values in its filter form.
 *
 * Limits (short URLs, CMS_FILTER_LIMITS = SavedFilterLink::LIMITS): 8 values, 200 characters a value, 10 items an
 * array, 2000 characters the query string. The checks refuse more; reading a URL ignores what is over the limits.
 *
 * Values from the record (phase B): a stored value may be `{record: 'id'}` (the id of the record) or `{field: '<concept
 * code or id>'}` (the values of a field of the record). The server fills them in for each record when it writes the
 * link (cards, gallery, media of a record, Record field, the action menu of a record page); the query string leaves
 * them out until then.
 *
 *   cmsFilterQuery(12, {X1: 'Paris'})          // 'source=12&v.X1=Paris'
 *   parseCmsFilterQuery('?source=12&v.X1=Paris') // {source: 12, values: {X1: 'Paris'}}
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

import { queryParameterNames, resolveQueryParameters } from '../data/queryParameters.js';
import { extentFromWkt, extentToWkt, isExtent, roundExtent } from '../utils/geoExtent.js';

/** Limits of the values of a Saved filter link (SavedFilterLink::LIMITS). */
export const CMS_FILTER_LIMITS = Object.freeze({ values: 8, length: 200, items: 10, query: 2000 });

/** Module types that show records: the target modules of a Saved filter (not RecordView). */
export const CMS_FILTER_MODULES = Object.freeze(['explorer', 'data', 'map', 'timeline', 'graph']);

/** Name of a parameter (`$NAME$` of the query). */
const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** A field of a value from the record: concept code or local id (SavedFilterLink::FIELD_CODE). */
const FIELD_CODE = /^\d+(?:-\d+)?$/;

/**
 * The reference of a value from the record: 'id' (`{record: 'id'}`), the field code (`{field: '2-1'}`), or null.
 *
 * @param {*} value
 * @returns {string|null}
 */
export function cmsFilterReference(value) {
  if (!isMap(value) || Object.keys(value).length !== 1) return null;
  if (value.record === 'id') return 'id';
  return typeof value.field === 'string' && FIELD_CODE.test(value.field) ? value.field : null;
}

/**
 * The values within the limits: names of parameters, trimmed strings (a number becomes a string), arrays of strings,
 * values from the record (`{record: 'id'}`, `{field}`); empty values left out.
 *
 * @param {*} values
 * @returns {{values: Object<string, string|string[]|object>, dropped: boolean}} `dropped`: something was over a limit or
 *          not valid.
 */
export function normalizeCmsFilterValues(values) {
  const result = {};
  let dropped = false;
  if (values == null) return { values: result, dropped };
  if (!isMap(values)) return { values: result, dropped: true };
  const text = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value !== 'string') return null;
    return value.trim();
  };
  for (const [name, value] of Object.entries(values)) {
    if (!NAME.test(name)) {
      dropped = true;
      continue;
    }
    let item;
    const reference = cmsFilterReference(value);
    if (reference) {
      item = reference === 'id' ? { record: 'id' } : { field: reference };
    } else if (isMap(value)) {
      dropped = true;
      continue;
    } else if (Array.isArray(value)) {
      const list = value.map(text);
      if (list.some((entry) => entry === null || entry.length > CMS_FILTER_LIMITS.length) || list.length > CMS_FILTER_LIMITS.items) dropped = true;
      item = list.filter((entry) => entry && entry.length <= CMS_FILTER_LIMITS.length).slice(0, CMS_FILTER_LIMITS.items);
      if (!item.length) continue;
    } else {
      item = text(value);
      if (item === null || item.length > CMS_FILTER_LIMITS.length) {
        dropped = true;
        continue;
      }
      if (!item) continue;
    }
    if (Object.keys(result).length >= CMS_FILTER_LIMITS.values) {
      dropped = true;
      continue;
    }
    result[name] = item;
  }
  return { values: result, dropped };
}

/**
 * The query string of the target page: `source=<id>&v.<NAME>=<value>` (an array repeats the key); '' when it is longer
 * than the limit or the source is not an id.
 *
 * @param {number|string} source Query source id.
 * @param {object} [values]
 * @returns {string}
 */
export function cmsFilterQuery(source, values = {}) {
  const id = positiveId(source);
  if (!id) return '';
  const parts = [`source=${id}`];
  for (const [name, value] of Object.entries(normalizeCmsFilterValues(values).values)) {
    // a value from the record is filled in by the server (phase B)
    if (cmsFilterReference(value)) continue;
    for (const item of [value].flat()) parts.push(`v.${name}=${encodeURIComponent(item)}`);
  }
  const query = parts.join('&');
  return query.length > CMS_FILTER_LIMITS.query ? '' : query;
}

/**
 * The URL of the target page with the query of a Saved filter; '' without a page URL or a query.
 *
 * @param {string} pageUrl
 * @param {number|string} source
 * @param {object} [values]
 * @returns {string}
 */
export function cmsFilterHref(pageUrl, source, values = {}) {
  const query = cmsFilterQuery(source, values);
  const url = String(pageUrl || '');
  if (!url || !query) return '';
  const [base, hash = ''] = url.split('#');
  return `${base}${base.includes('?') ? '&' : '?'}${query}${hash ? `#${hash}` : ''}`;
}

/**
 * The Saved filter asked by a page URL (the site runtime): the source and the values, within the limits (what is over
 * them is ignored); null without `source`.
 *
 * @param {string|URLSearchParams} search `location.search`.
 * @returns {{source: number, values: Object<string, string|string[]>}|null}
 */
export function parseCmsFilterQuery(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(String(search || ''));
  const source = positiveId(params.get('source'));
  if (!source) return null;
  const raw = {};
  for (const [key, value] of params) {
    if (!key.startsWith('v.')) continue;
    const name = key.slice(2);
    if (Object.hasOwn(raw, name)) raw[name] = [raw[name]].flat().concat(value);
    else raw[name] = value;
  }
  // over the limits: ignored (the URL may come from anywhere)
  const limited = Object.fromEntries(Object.entries(raw).slice(0, CMS_FILTER_LIMITS.values)
    .map(([name, value]) => [name, Array.isArray(value) ? value.slice(0, CMS_FILTER_LIMITS.items) : value]));
  return { source, values: normalizeCmsFilterValues(limited).values };
}

/**
 * Why a stored Saved filter is not valid, or null: a query source and a page (ids), the values within the limits.
 *
 * @param {{source?: *, page?: *, target?: *, values?: *}} settings `target` (an action menu item) or `page`.
 * @returns {string|null}
 */
export function cmsFilterProblem(settings = {}) {
  if (!positiveId(settings.source)) return 'a Saved filter needs a query source';
  if (!positiveId(settings.page ?? settings.target)) return 'a Saved filter needs a target page';
  const { values, dropped } = normalizeCmsFilterValues(settings.values);
  if (dropped) {
    return `the values of a Saved filter: at most ${CMS_FILTER_LIMITS.values}, ${CMS_FILTER_LIMITS.length} characters each, `
      + `arrays of ${CMS_FILTER_LIMITS.items}`;
  }
  if (!cmsFilterQuery(settings.source, values)) return `the values of a Saved filter are longer than ${CMS_FILTER_LIMITS.query} characters`;
  return null;
}

/**
 * The stored form of a Saved filter: `{source, page, values}` (values within the limits, empty ones left out), or null.
 *
 * @param {object} settings
 * @returns {{source: number, page: number, values: object}|null}
 */
export function cmsFilterSettings(settings = {}) {
  if (!settings || cmsFilterProblem(settings)) return null;
  return { source: positiveId(settings.source), page: positiveId(settings.page ?? settings.target),
    values: normalizeCmsFilterValues(settings.values).values };
}

/**
 * The names of the parameters of a query source definition (`$NAME$` of its query).
 *
 * @param {{source?: {query?: *}}} querySource Normalized query source (QuerySource).
 * @returns {string[]}
 */
export function cmsFilterParameters(querySource) {
  return querySource?.source?.query ? queryParameterNames(querySource.source.query) : [];
}

/**
 * The request of a Saved filter for the modules of the target page: the DataSource with the given values filled in (a
 * missing value leaves its predicate out), the DataSource of the source as it is (`raw`, for the filter form of
 * Explorer), the given values and the names of the missing ones.
 *
 * @param {object} querySource Normalized query source (QuerySource: id, title, source.query, rules, fields, map,
 *        timefields, filterForm).
 * @param {object} [values]
 * @returns {{dataSource: object, raw: object, values: object, missing: string[]}}
 */
export function cmsFilterRequest(querySource, values = {}) {
  const query = querySource.source.query;
  const names = queryParameterNames(query);
  const given = Object.fromEntries(Object.entries(normalizeCmsFilterValues(values).values).filter(([name]) => names.includes(name)));
  const missing = names.filter((name) => !Object.hasOwn(given, name));
  const id = positiveId(querySource.id);
  const base = {
    reference: { type: 'source', id },
    title: querySource.title || querySource.source?.title || `Source ${id}`,
    presentation: {
      data: { fields: clone(querySource.fields || []) },
      map: {
        geoFields: (querySource.map?.geoFields || []).map((field) => field.field),
        dynamicRequests: querySource.map?.dynamicRequests === true,
        minZoom: querySource.map?.minZoom ?? null,
        maxZoom: querySource.map?.maxZoom ?? null,
        geoOutputMode: querySource.map?.geoOutputMode || 'records'
      },
      timeline: { fields: (querySource.timefields || []).map((field) => field.field) },
      graph: null,
      filterForm: clone(querySource.filterForm || null)
    },
    meta: { origin: 'saved-filter' }
  };
  const request = (q) => ({ q, ...(querySource.rules?.length ? { rules: clone(querySource.rules) } : {}) });
  const resolved = names.length ? resolveQueryParameters(query, given, querySource.filterForm || null) : { q: clone(query) };
  const dataSource = { ...clone(base), request: request(resolved.q) };
  if (resolved.extent) dataSource.request.extent = resolved.extent;
  return { dataSource, raw: { ...clone(base), request: request(clone(query)) }, values: given, missing };
}

/**
 * A value of a Filter Form as a value of a link: a map extent (west, south, east, north) becomes a WKT rectangle with at
 * most 5 decimals (it fills a `geo` parameter as it is, review 2026-11-15); other values unchanged.
 *
 * @param {*} value
 * @returns {*}
 */
export function cmsFilterLinkValue(value) {
  if (!isExtent(value)) return value;
  const rounded = roundExtent(value);
  const short = Object.fromEntries(Object.entries(rounded).map(([key, number]) => [key, Number(Number(number).toFixed(5))]));
  return extentToWkt(short);
}

/**
 * The values of a link for a Filter Form: a WKT rectangle becomes the extent its map input shows (review 2026-11-15).
 *
 * @param {object} values
 * @returns {object}
 */
export function cmsFilterFormValues(values = {}) {
  return Object.fromEntries(Object.entries(values || {}).map(([name, value]) => {
    const extent = typeof value === 'string' && /^POLYGON\s*\(\(/i.test(value) ? extentFromWkt(value) : null;
    return [name, extent || value];
  }));
}

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function isMap(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
