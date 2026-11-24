/**
 * @file storyMapService.js
 * @brief Data of the story map (plan 27q1): the Presentation set, the source records, the story elements with their
 *        places and the Smarty cards. Only existing endpoints: `/records`, `/map` (GeoJSON), `/records/querysource/{id}`
 *        and `/presentation/{id}/execute` (a card report, plan 27q3). Used by Explorer (tool pane) and the website (element `storymap`).
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
  PATH_ROLES, normalizeStoryMapSettings, sortStoryElements, storyQuery, temporalSortValue
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
 * @returns {{id: number, title: string, rectype: number, date: number|null, fields: object, places: object, geo: Array,
 *           record: object}} `record`: the record as found (HRecordList).
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
  return {
    id: Number(record.rec_ID), title: String(record.rec_Title ?? ''), rectype: Number(record.rec_RecTypeID) || 0, date, fields,
    places: { begin: [], transition: [], end: [] }, geo: [], record
  };
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
   * The story of one topic: its title, the elements in order, and the places of each element by role (the geo field
   * paths of `map.places`, `/map?geofields=…&geoOutputMode=features`, one call per role). Without places the element's
   * own geometry is read.
   *
   * @param {object} settings Normalised settings.
   * @param {number} sourceId
   * @returns {Promise<{source: {id: number, title: string}, elements: Array<object>,
   *          fieldId: (code: string|number) => number|null}>}
   */
  async loadStory(settings, sourceId) {
    const query = storyQuery(settings, sourceId);
    const limit = Math.min(Number(settings.story?.limit) || STORY_LIMIT, STORY_LIMIT);
    const [found, head] = await Promise.all([
      query ? this.get('/records', { q: query, fields: '_all', limit }) : Promise.resolve({ records: [] }),
      this.get('/records', { q: `ids:${Number(sourceId)}`, fields: 'rec_ID,rec_Title', limit: 1 }).catch(() => null)
    ]);
    const { byCode, types } = recordFieldIndex(found);
    const fieldId = (code) => (byCode.has(String(code)) ? byCode.get(String(code)) : (Number(code) > 0 ? Number(code) : null));
    const elements = sortStoryElements((found?.records || []).map((record) => storyElement(record, types)), settings.story.order,
      { fieldId, sourceId });
    await this._loadPlaces(elements, settings.map?.places || {});
    const sourceTitle = String(head?.records?.[0]?.rec_Title ?? '');
    return { source: { id: Number(sourceId), title: sourceTitle }, elements, fieldId };
  }

  /** @private The geometries of the elements by role (`element.places`), or their own (`element.geo`). */
  async _loadPlaces(elements, places) {
    if (!elements.length) return;
    const ids = `ids:${elements.map((element) => element.id).join(',')}`;
    const byId = new Map(elements.map((element) => [element.id, element]));
    const roles = PATH_ROLES.filter((role) => places[role]?.length);
    const read = async (geofields) => {
      const payload = await this.get('/map', { q: ids, geofields, geoOutputMode: geofields ? 'features' : null, limit: elements.length })
        .catch((error) => {
          console.warn('Story map: places', error);
          return null;
        });
      return (payload?.features || []).filter((feature) => feature?.geometry);
    };
    if (!roles.length) {
      for (const feature of await read(null)) {
        const element = byId.get(Number(feature.properties?.rec_ID ?? feature.id));
        if (element) element.geo = [feature.geometry];
      }
      return;
    }
    const results = await Promise.all(roles.map((role) => read(places[role].join(','))));
    roles.forEach((role, index) => {
      for (const feature of results[index]) {
        const element = byId.get(Number(feature.properties?.rec_ID ?? String(feature.id).split(':')[0]));
        if (element) (element.places[role] ||= []).push(feature.geometry);
      }
    });
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
      this._cards.set(key, this.get(`/presentation/${Number(template)}/execute`, { recordId: Number(recordId), lang: language || null }, 'text')
        .catch(() => ''));
    }
    return this._cards.get(key);
  }

  /** Forget the cached cards (Refresh after a template was changed). */
  clearCache() {
    this._cards.clear();
  }
}
