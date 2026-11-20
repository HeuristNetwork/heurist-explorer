/**
 * @file storyMapService.js
 * @brief Data of the story map (plan 27q1): the Presentation set, the source records, the story elements with their
 *        places and the Smarty cards. Only existing endpoints: `/records`, `/map` (GeoJSON), `/records/querysource/{id}`
 *        and `/report/{id}/execute`. Used by Explorer (tool pane) and the website (element `storymap`).
 *
 *   const service = new StoryMapService({ apiBaseUrl: runtime.apiBaseUrl, database: runtime.database });
 *   const preset = await service.loadPreset(12);            // {id, title, query, settings, kind}
 *   const story = await service.loadStory(preset.settings, 151);
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

import {
  normalizeStoryMapSettings, sortStoryElements, storyQuery, temporalSortValue
} from './storyMapModel.js';

/** Concept codes of the fields of a Presentation set (2-1112). */
export const PRESENTATION_FIELDS = Object.freeze({
  name: '2-1', summary: '2-3', query: '2-12', configuration: '2-1187', type: '2-1203'
});

/** Concept code of the term StoryMap of Presentation Type. */
export const STORYMAP_TERM = '2-10644';

/** Most story elements read for one story. */
export const STORY_LIMIT = 500;

/** Text of a stored value (`{value}` of a translated value). */
const textOf = (value) => (value != null && typeof value === 'object' ? String(value.value ?? '') : String(value ?? ''));

/**
 * Field ids of a `/records` answer by concept code, and their types.
 *
 * @param {object} payload Answer with `meta.fields.details`.
 * @returns {{byCode: Map<string, number>, types: Map<number, string>}}
 */
export function recordFieldIndex(payload) {
  const byCode = new Map();
  const types = new Map();
  for (const field of payload?.meta?.fields?.details || []) {
    const id = Number(field.dty_ID);
    if (!(id > 0)) continue;
    if (field.dty_ConceptCode) byCode.set(String(field.dty_ConceptCode), id);
    types.set(id, String(field.dty_Type || ''));
  }
  return { byCode, types };
}

/**
 * A Presentation set from a `/records` answer (`fields=_all`).
 *
 * @param {object} payload
 * @returns {{id: number, title: string, query: Array|object|null, settings: object, configuration: string,
 *           typeTerm: number}|null}
 */
export function presetFromRecords(payload) {
  const record = payload?.records?.[0];
  if (!record) return null;
  const { byCode } = recordFieldIndex(payload);
  const first = (code) => {
    const values = record.details?.[byCode.get(code)];
    return Array.isArray(values) && values.length ? textOf(values[0]) : '';
  };
  let query = null;
  const text = first(PRESENTATION_FIELDS.query).trim();
  if (text) {
    try {
      query = JSON.parse(text);
    } catch {
      query = text;
    }
  }
  const configuration = first(PRESENTATION_FIELDS.configuration);
  return {
    id: Number(record.rec_ID),
    title: first(PRESENTATION_FIELDS.name) || String(record.rec_Title || ''),
    summary: first(PRESENTATION_FIELDS.summary),
    query,
    configuration,
    settings: normalizeStoryMapSettings(configuration),
    typeTerm: Number(first(PRESENTATION_FIELDS.type)) || 0
  };
}

/**
 * A story element from a record of `/records`.
 *
 * @param {object} record `{rec_ID, rec_Title, rec_RecTypeID, details}`.
 * @param {Map<number, string>} types Field types.
 * @returns {{id: number, title: string, rectype: number, date: number|null, fields: object, geo: Array}}
 */
export function storyElement(record, types) {
  const fields = {};
  let date = null;
  for (const [key, values] of Object.entries(record?.details || {})) {
    const id = Number(key);
    const list = (Array.isArray(values) ? values : [values]).map(textOf);
    fields[id] = list;
    if (date == null && types.get(id) === 'date') date = temporalSortValue(list[0]);
  }
  return { id: Number(record.rec_ID), title: String(record.rec_Title ?? ''), rectype: Number(record.rec_RecTypeID) || 0, date, fields, geo: [] };
}

/** Story map data over the Heurist API (fetch). */
export class StoryMapService {
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
    this._cards = new Map();
  }

  /**
   * GET of a path of the database.
   *
   * @param {string} path `/records` ...
   * @param {object} [query] Parameters; objects are sent as JSON.
   * @param {'json'|'text'} [as]
   * @returns {Promise<*>}
   */
  async get(path, query = {}, as = 'json') {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value == null) continue;
      params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    const text = params.toString();
    const response = await this.fetchImpl(`${this.base}${path}${text ? `?${text}` : ''}`, { credentials: 'same-origin', headers: this.headers });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return as === 'text' ? response.text() : response.json();
  }

  /**
   * One Presentation set.
   *
   * @param {number} id
   * @returns {Promise<object|null>} presetFromRecords.
   */
  async loadPreset(id) {
    if (!(Number(id) > 0)) return null;
    return presetFromRecords(await this.get('/records', { q: `ids:${Number(id)}`, fields: '_all', limit: 1 }));
  }

  /**
   * The query of a query source (map overview).
   *
   * @param {number} id
   * @returns {Promise<*>} Its query, null when unknown.
   */
  async querySourceQuery(id) {
    const payload = await this.get(`/records/querysource/${Number(id)}`);
    return (payload?.querySource || payload)?.source?.query ?? null;
  }

  /**
   * The first ids of a query (the source records: one result shows its story at once).
   *
   * @param {*} query
   * @param {number} [limit=2]
   * @returns {Promise<number[]>}
   */
  async queryIds(query, limit = 2) {
    if (query == null || query === '') return [];
    const payload = await this.get('/records', { q: query, detail: 'ids', limit });
    return (payload?.ids || payload?.records || []).map((item) => Number(item?.rec_ID ?? item)).filter((id) => id > 0);
  }

  /**
   * The story of one source record: its title, the elements in order with their place fields, and the geometries of
   * their places and of their own geo fields.
   *
   * @param {object} settings Normalised settings.
   * @param {number} sourceId
   * @returns {Promise<{source: {id: number, title: string}, elements: Array<object>, places: Map<number, object>,
   *          fieldId: (code: string|number) => number|null, placeFields: Set<number>, allowed: Map<object, Set<number>>}>}
   */
  async loadStory(settings, sourceId) {
    const query = storyQuery(settings, sourceId);
    const [found, head] = await Promise.all([
      query ? this.get('/records', { q: query, fields: '_all', limit: STORY_LIMIT }) : Promise.resolve({ records: [] }),
      this.get('/records', { q: `ids:${Number(sourceId)}`, fields: 'rec_ID,rec_Title', limit: 1 }).catch(() => null)
    ]);
    const { byCode, types } = recordFieldIndex(found);
    const fieldId = (code) => (byCode.has(String(code)) ? byCode.get(String(code)) : (Number(code) > 0 ? Number(code) : null));
    const placeFields = new Set([...types].filter(([, type]) => type === 'resource').map(([id]) => id));
    const elements = sortStoryElements((found?.records || []).map((record) => storyElement(record, types)), settings.story.order, { fieldId });
    // the places: every pointer value of the elements, and the elements themselves (their own geo fields)
    const placeIds = new Set();
    for (const element of elements) {
      for (const field of placeFields) for (const value of element.fields[field] || []) if (Number(value) > 0) placeIds.add(Number(value));
    }
    const ids = [...placeIds, ...elements.map((element) => element.id)];
    const places = new Map();
    if (ids.length) {
      const geo = await this.get('/map', { q: `ids:${ids.join(',')}`, limit: ids.length }).catch(() => null);
      for (const feature of geo?.features || []) {
        const id = Number(feature?.properties?.rec_ID ?? feature?.id);
        if (id > 0 && feature.geometry) places.set(id, feature.geometry);
      }
    }
    for (const element of elements) {
      if (places.has(element.id) && !placeIds.has(element.id)) element.geo = [places.get(element.id)];
    }
    // points with a filter: the places that pass it
    const allowed = new Map();
    for (const pattern of settings.map.patterns) {
      if (pattern.type !== 'points' || !pattern.filter || !placeIds.size) continue;
      const filter = Array.isArray(pattern.filter) ? pattern.filter : [pattern.filter];
      const passed = await this.queryIds([{ ids: [...placeIds].join(',') }, ...filter], placeIds.size).catch(() => []);
      allowed.set(pattern, new Set(passed));
    }
    const sourceTitle = String(head?.records?.[0]?.rec_Title ?? '');
    return { source: { id: Number(sourceId), title: sourceTitle }, elements, places, fieldId, placeFields, allowed };
  }

  /**
   * The Smarty card of a record (cached).
   *
   * @param {number} template Report id.
   * @param {number} recordId
   * @param {string} [language]
   * @returns {Promise<string>} HTML, '' when it fails.
   */
  async renderCard(template, recordId, language = '') {
    if (!(Number(template) > 0) || !(Number(recordId) > 0)) return '';
    const key = `${template}:${recordId}:${language}`;
    if (!this._cards.has(key)) {
      this._cards.set(key, this.get(`/report/${Number(template)}/execute`, { recordId: Number(recordId), lang: language || null }, 'text')
        .catch(() => ''));
    }
    return this._cards.get(key);
  }

  /** Forget the cached cards (Refresh after a template was changed). */
  clearCache() {
    this._cards.clear();
  }
}
