/**
 * @file storyMapModel.js
 * @brief Pure functions of the story map (plan 27q1 §4): settings of a Presentation set of kind `storymap`, the query
 *        of the story of one source record, the order of the story elements, the place pattern of each element and
 *        its GeoJSON (places and connection lines). No DOM, no API: HStoryMap and the map bindings use them.
 *
 *   const settings = normalizeStoryMapSettings(JSON.parse(configuration));
 *   const query = storyQuery(settings, personId);            // → /records?q=…
 *   const elements = sortStoryElements(found, settings.story.order);
 *   const features = elementFeatures(element, choosePattern(element, settings.map.patterns, { fieldId }), places);
 *
 * The server checks the same form in srv/Presentations/StoryMapSettings.php.
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

import { expansionLevelQuery, ruleDepth } from '../../data/expansionRules.js';

/** Layouts of the story elements (Record cards: list, carousel, slider (slideshow), tabs). */
export const STORY_LAYOUTS = Object.freeze(['list', 'horizontal', 'tabs', 'carousel', 'slideshow']);

/** How the current element is distinguished. */
export const STORY_DISTINCT = Object.freeze(['highlight', 'veil', 'none']);

/** Where the start (overview) element is shown. */
export const STORY_START_MODES = Object.freeze(['inline', 'tab', 'header', 'none']);

/** Where the end element is shown. */
export const STORY_END_MODES = Object.freeze(['inline', 'tab', 'footer', 'none']);

/** Place patterns of 27q1; star, pairs and change come with their own plan (§6.1). */
export const STORY_PATTERNS = Object.freeze(['points', 'path']);

/** Roles of the place fields of a `path`, in their order on the line. */
export const PATH_ROLES = Object.freeze(['begin', 'transition', 'end']);

/** The legacy place fields of a path (start 2-134 / 1414-1092, transition 1414-1090, end 2-864). */
export const DEFAULT_PATH = Object.freeze({
  type: 'path', begin: Object.freeze(['2-134', '1414-1092']), transition: Object.freeze(['1414-1090']), end: Object.freeze(['2-864'])
});

const isObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);
const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);
const positiveId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};
const isField = (value) => positiveId(value) != null || (typeof value === 'string' && /^\d+-\d+$/.test(value));

/** Texts by language (`{def, fre}`); anything else gives `{}`. */
function texts(value) {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === 'string'));
}

/** A field list of a pattern: local ids as numbers, concept codes as strings. */
function fields(value) {
  return (Array.isArray(value) ? value : []).filter(isField).map((item) => positiveId(item) ?? item);
}

/**
 * One place pattern with its defaults, or `null` for an unknown type.
 *
 * @param {object} pattern Stored pattern.
 * @returns {object|null} `{type, rectypes, filter}` (points) or `{type, rectypes, begin, transition, end}` (path).
 */
function normalizePattern(pattern) {
  if (!isObject(pattern) || !STORY_PATTERNS.includes(pattern.type)) return null;
  const rectypes = fields(pattern.rectypes).filter((item) => typeof item === 'number');
  if (pattern.type === 'points') {
    return { type: 'points', rectypes, filter: pattern.filter != null && typeof pattern.filter === 'object' ? pattern.filter : null };
  }
  const result = { type: 'path', rectypes };
  for (const role of PATH_ROLES) result[role] = fields(pattern[role]);
  return PATH_ROLES.some((role) => result[role].length) ? result : null;
}

/**
 * The settings of a story map with all defaults (plan 27q1 §4). Unknown values fall back to the default; a draft
 * without a rule or a template is kept as it is.
 *
 * @param {object|string|null} raw Stored configuration (2-1187), as JSON text or object.
 * @returns {object} Normalised settings.
 */
export function normalizeStoryMapSettings(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = value.trim() ? JSON.parse(value) : {};
    } catch {
      value = {};
    }
  }
  const settings = isObject(value) ? value : {};
  const story = isObject(settings.story) ? settings.story : {};
  const rule = isObject(story.rule) && story.rule.query != null && typeof story.rule.query === 'object' ? structuredClone(story.rule) : null;
  const order = isObject(story.order) ? story.order : {};
  const by = ['date', 'rule'].includes(order.by) ? order.by : (isField(order.by) ? (positiveId(order.by) ?? order.by) : 'date');
  const part = (key, modes, fallback) => {
    const stored = isObject(settings[key]) ? settings[key] : {};
    return { mode: oneOf(stored.mode, modes, fallback), template: positiveId(stored.template), text: texts(stored.text) };
  };
  const presentation = isObject(settings.presentation) ? settings.presentation : {};
  const interval = Number(presentation.interval);
  const messages = isObject(settings.messages) ? settings.messages : {};
  const map = isObject(settings.map) ? settings.map : {};
  const overview = isObject(map.overview) && (positiveId(map.overview.querySource) || (map.overview.query != null && typeof map.overview.query === 'object'))
    ? (positiveId(map.overview.querySource) ? { querySource: positiveId(map.overview.querySource) } : { query: structuredClone(map.overview.query) })
    : null;
  const patterns = Array.isArray(map.patterns) ? map.patterns.map(normalizePattern).filter(Boolean) : [];
  const duration = Number(map.duration);
  return {
    story: { rule, order: { by, dir: order.dir === 'desc' ? 'desc' : 'asc' } },
    element: { template: positiveId(settings.element?.template) },
    start: part('start', STORY_START_MODES, 'none'),
    end: part('end', STORY_END_MODES, 'none'),
    presentation: {
      layout: oneOf(presentation.layout, STORY_LAYOUTS, 'list'),
      distinct: oneOf(presentation.distinct, STORY_DISTINCT, 'highlight'),
      interval: Number.isFinite(interval) && interval > 0 ? interval : 5000
    },
    messages: { intro: texts(messages.intro), empty: texts(messages.empty) },
    map: {
      overview,
      patterns: patterns.length ? patterns : [{ type: 'points', rectypes: [], filter: null }],
      elementSymbology: isObject(map.elementSymbology) ? structuredClone(map.elementSymbology) : null,
      lineSymbology: isObject(map.lineSymbology) ? structuredClone(map.lineSymbology) : null,
      duration: Number.isFinite(duration) && duration >= 0 ? duration : 1500,
      keep: map.keep === true,
      layers: (Array.isArray(map.layers) ? map.layers : []).map(positiveId).filter(Boolean)
    },
    actions: Array.isArray(settings.actions) ? structuredClone(settings.actions) : null
  };
}

/**
 * The query of the story elements of one source record: the expansion rule from that record; a rule of several
 * levels gives the elements of its last level.
 *
 * @param {object} settings Normalised settings.
 * @param {number|string} sourceId The selected (or only) source record.
 * @returns {object|null} Query, or `null` without a rule or a record.
 */
export function storyQuery(settings, sourceId) {
  const rule = settings?.story?.rule;
  const id = positiveId(sourceId);
  if (!rule || !id) return null;
  return expansionLevelQuery(null, [rule], ruleDepth(rule), { parentIds: [id] });
}

/**
 * The source record whose story is shown: the last one of the selection; a source query with one result shows that
 * record without a selection (plan 27q1 §4).
 *
 * @param {Array<number|string>} selection Selected record ids, in the order they were selected.
 * @param {Array<number|string>} [sourceIds] Ids of the source query result.
 * @returns {number|null} Record id.
 */
export function storySourceId(selection, sourceIds = []) {
  const selected = (Array.isArray(selection) ? selection : []).map(positiveId).filter(Boolean);
  if (selected.length) return selected[selected.length - 1];
  const found = (Array.isArray(sourceIds) ? sourceIds : []).map(positiveId).filter(Boolean);
  return found.length === 1 ? found[0] : null;
}

/** Compares two values: numbers as numbers, everything else as text; empty values last. */
function compareValues(a, b) {
  const emptyA = a == null || a === '';
  const emptyB = b == null || b === '';
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : (emptyA ? 1 : -1);
  const numberA = Number(a);
  const numberB = Number(b);
  if (Number.isFinite(numberA) && Number.isFinite(numberB)) return numberA - numberB;
  return String(a).localeCompare(String(b));
}

/**
 * The story elements in the order of the settings.
 *
 * - `date`: `element.date` (a sortable value: the start of the first temporal field), then the title;
 * - a field: the first value of `element.fields[field]` (`fieldId` resolves a concept code);
 * - `rule`: as found.
 * Empty values go last, also in `desc`.
 *
 * @param {Array<object>} elements `{id, title, date, fields: {fieldId: [values]}}`.
 * @param {{by: string|number, dir: string}} order Order of the settings.
 * @param {object} [options]
 * @param {(code: string|number) => number} [options.fieldId] Local id of a field code.
 * @returns {Array<object>} New sorted array.
 */
export function sortStoryElements(elements, order = { by: 'date', dir: 'asc' }, { fieldId = (code) => positiveId(code) } = {}) {
  const list = Array.isArray(elements) ? [...elements] : [];
  if (order?.by === 'rule') return list;
  const field = order?.by === 'date' || order?.by == null ? null : fieldId(order.by);
  const key = (element) => (field ? element?.fields?.[field]?.[0] : element?.date);
  const direction = order?.dir === 'desc' ? -1 : 1;
  return list
    .map((element, index) => ({ element, index }))
    .sort((a, b) => {
      const keyA = key(a.element);
      const keyB = key(b.element);
      const emptyA = keyA == null || keyA === '';
      const emptyB = keyB == null || keyB === '';
      if (emptyA !== emptyB) return emptyA ? 1 : -1;
      return (direction * compareValues(keyA, keyB)) || compareValues(a.element?.title, b.element?.title) || (a.index - b.index);
    })
    .map((item) => item.element);
}

/** Values of the fields of an element (codes resolved), flattened. */
function fieldValues(element, list, fieldId) {
  return list.flatMap((code) => element?.fields?.[fieldId(code)] || []);
}

/**
 * The place pattern of one story element: the first pattern that fits (its record types; a path needs a value in one
 * of its fields); the last pattern when none fits; points without patterns.
 *
 * @param {object} element `{rectype, fields}`.
 * @param {Array<object>} patterns Normalised `map.patterns`.
 * @param {object} [options]
 * @param {(code: string|number) => number} [options.fieldId] Local id of a field code.
 * @returns {object} Pattern.
 */
export function choosePattern(element, patterns, { fieldId = (code) => positiveId(code) } = {}) {
  const list = Array.isArray(patterns) && patterns.length ? patterns : [{ type: 'points', rectypes: [], filter: null }];
  const fits = (pattern) => {
    if (pattern.rectypes?.length && !pattern.rectypes.includes(Number(element?.rectype))) return false;
    if (pattern.type !== 'path') return true;
    return PATH_ROLES.some((role) => fieldValues(element, pattern[role] || [], fieldId).length > 0);
  };
  return list.find(fits) || list[list.length - 1];
}

/**
 * Connection lines of a path (legacy `_createPointLinks`): one begin → transitions → one end as a LineString.
 * Several begins or ends: lines from each begin to the first transition, the transitions, lines from the last
 * transition to each end; without transitions and with as many begins as ends: one line per pair.
 *
 * @param {Array<number[]>} begin Coordinates of the begin points.
 * @param {Array<number[]>} transition Coordinates of the transition points, in order.
 * @param {Array<number[]>} end Coordinates of the end points.
 * @returns {object|null} GeoJSON geometry, or `null` when there is no line.
 */
export function pathGeometry(begin = [], transition = [], end = []) {
  if (begin.length > 1 || end.length > 1) {
    const lines = [];
    if (transition.length) {
      for (const point of begin) lines.push([point, transition[0]]);
      if (transition.length > 1) lines.push([...transition]);
      for (const point of end) lines.push([transition[transition.length - 1], point]);
    } else if (begin.length === end.length) {
      begin.forEach((point, index) => lines.push([point, end[index]]));
    }
    return lines.length ? { type: 'MultiLineString', coordinates: lines } : null;
  }
  const line = [...begin.slice(0, 1), ...transition, ...end.slice(0, 1)];
  return line.length > 1 ? { type: 'LineString', coordinates: line } : null;
}

/** Coordinates of a point geometry (or the first point of a multipoint), else null. */
function pointOf(geometry) {
  if (geometry?.type === 'Point') return geometry.coordinates;
  if (geometry?.type === 'MultiPoint') return geometry.coordinates?.[0] ?? null;
  return null;
}

/**
 * GeoJSON features of one story element by its pattern: the places (one feature per place, with `role`) and, for a
 * path, the connection line (`role: 'line'`). Every feature has `story_ID` = the element.
 *
 * @param {object} element `{id, fields, geo: [geometry]}`; place fields hold place record ids.
 * @param {object} pattern Pattern of the element (choosePattern).
 * @param {Map<number, object>|object} places Place record id → GeoJSON geometry.
 * @param {object} [options]
 * @param {(code: string|number) => number} [options.fieldId] Local id of a field code.
 * @param {Set<number>|null} [options.allowed] Points: the places that pass the pattern's filter (null = all).
 * @param {Set<number>|null} [options.placeFields] Points: the pointer fields to read (null = all fields of the element).
 * @returns {Array<object>} Features.
 */
export function elementFeatures(element, pattern, places, { fieldId = (code) => positiveId(code), allowed = null, placeFields = null } = {}) {
  const geometryOf = (id) => (places instanceof Map ? places.get(Number(id)) : places?.[id]) ?? null;
  const storyId = positiveId(element?.id);
  const feature = (geometry, placeId, role) => ({
    type: 'Feature', geometry, properties: { rec_ID: placeId ?? storyId, story_ID: storyId, role }
  });
  const features = [];
  if (pattern?.type === 'path') {
    const points = {};
    for (const role of PATH_ROLES) {
      points[role] = [];
      for (const id of fieldValues(element, pattern[role] || [], fieldId)) {
        const geometry = geometryOf(id);
        if (!geometry) continue;
        features.push(feature(geometry, positiveId(id), role));
        const point = pointOf(geometry);
        if (point) points[role].push(point);
      }
    }
    const line = pathGeometry(points.begin, points.transition, points.end);
    if (line) features.push(feature(line, null, 'line'));
    return features;
  }
  const seen = new Set();
  for (const [field, values] of Object.entries(element?.fields || {})) {
    if (placeFields && !placeFields.has(Number(field))) continue;
    for (const id of values || []) {
      const placeId = positiveId(id);
      if (!placeId || seen.has(placeId) || (allowed && !allowed.has(placeId))) continue;
      const geometry = geometryOf(placeId);
      if (!geometry) continue;
      seen.add(placeId);
      features.push(feature(geometry, placeId, 'place'));
    }
  }
  for (const geometry of element?.geo || []) {
    if (geometry) features.push(feature(geometry, null, 'place'));
  }
  return features;
}

/**
 * A text of the settings in a language (`def` as fallback), with `{title}` replaced by the title of the source record.
 *
 * @param {object} byLanguage `{def, fre, …}`.
 * @param {string} [language] Language code.
 * @param {string} [title] Title of the source record.
 * @returns {string} Text (may be empty).
 */
export function storyText(byLanguage, language = 'def', title = '') {
  const text = byLanguage?.[language] ?? byLanguage?.def ?? '';
  return String(text).replaceAll('{title}', title ?? '');
}

/**
 * A sortable number of a date value: a temporal object (JSON) gives its `estMinDate`, a plain date `YYYY-MM-DD` gives
 * YYYY.MMDD (the same form), a year gives the year.
 *
 * @param {string|number|object|null} value Stored value of a date field.
 * @returns {number|null}
 */
export function temporalSortValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let parsed = value;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (parsed && typeof parsed === 'object') {
    const estimate = Number(parsed.estMinDate);
    return Number.isFinite(estimate) ? estimate : null;
  }
  const match = /^\s*(-?\d{1,6})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/.exec(String(parsed));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2] || 0);
  const day = Number(match[3] || 0);
  return year + (year < 0 ? -1 : 1) * (month * 100 + day) / 10000;
}

/**
 * Bounds of GeoJSON features.
 *
 * @param {Array<object>} features
 * @returns {{west: number, south: number, east: number, north: number}|null} Null without coordinates.
 */
export function featureBounds(features) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = (coordinates) => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      west = Math.min(west, coordinates[0]);
      east = Math.max(east, coordinates[0]);
      south = Math.min(south, coordinates[1]);
      north = Math.max(north, coordinates[1]);
      return;
    }
    for (const item of coordinates) visit(item);
  };
  for (const feature of features || []) {
    const geometry = feature?.geometry;
    if (geometry?.type === 'GeometryCollection') for (const part of geometry.geometries || []) visit(part.coordinates);
    else visit(geometry?.coordinates);
  }
  return Number.isFinite(west) ? { west, south, east, north } : null;
}
