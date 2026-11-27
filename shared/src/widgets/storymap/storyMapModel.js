/**
 * @file storyMapModel.js
 * @brief Pure functions of the story map (plan 27q1 §4, §15): settings of a Presentation set of kind `storymap`, the
 *        query of the story of one topic, the order of the story elements, the default places of an element type and
 *        the GeoJSON of one element (places by role and the connection line). No DOM, no API: HStoryMap and the map
 *        bindings use them.
 *
 *   const settings = normalizeStoryMapSettings(JSON.parse(configuration));
 *   const query = storyQuery(settings, personId);            // → /records?q=…
 *   const elements = sortStoryElements(found, settings.story.order, { sourceId: personId });
 *   const features = elementFeatures(element, { connect: settings.map.places.connect });
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

import { expansionLevelQuery, ruleDepth, ruleTargetTypes } from '../../data/expansionRules.js';

/** Layouts of the story elements: Vertical, Horizontal, Carousel, Tabs (review 1, 2026-11-20). */
export const STORY_LAYOUTS = Object.freeze(['list', 'horizontal', 'carousel', 'tabs']);

/** How the current element is distinguished (Vertical). */
export const STORY_DISTINCT = Object.freeze(['highlight', 'veil', 'none']);

/** Where the start info is shown (no own tab since review 3, 2026-11-20: a stored `tab` is `inline`). */
export const STORY_START_MODES = Object.freeze(['inline', 'header', 'none']);

/** Where the end info is shown. */
export const STORY_END_MODES = Object.freeze(['inline', 'footer', 'none']);

/** Orders of the story elements besides a field. */
export const STORY_ORDERS = Object.freeze(['date', 'rule', 'manual']);

/** Roles of the places of an element, in their order on the line. */
export const PATH_ROLES = Object.freeze(['begin', 'transition', 'end']);

/** Story elements read for one topic: default and most. */
export const STORY_LIMIT = Object.freeze({ default: 100, max: 500 });

/**
 * Fields used as places of a new story by default (when the element type has them): concept codes per role. 2-28 is
 * the element's own geo field; the pointers lead to a Place and its location.
 */
export const DEFAULT_PLACE_CODES = Object.freeze({
  begin: Object.freeze(['2-28', '2-134', '1414-1092']),
  transition: Object.freeze(['1414-1090']),
  end: Object.freeze(['2-864'])
});

const isObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);
const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);
const positiveId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};
const isField = (value) => positiveId(value) != null || (typeof value === 'string' && /^\d+-\d+$/.test(value));

/**
 * A geographic field path as in Query sources (`MapFieldSelector.php`): `rty:dty` (own field) or
 * `rty:lt<ptr>:rty:…:dty` (a field of linked records).
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isGeoPath(value) {
  return typeof value === 'string' && /^\d+(?::(?:lt|lf|rt|rf|r)\d*:\d+)*:\d+$/i.test(value.trim());
}

/** Texts by language (`{def, fre}`); anything else gives `{}`. */
function texts(value) {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === 'string'));
}

/** Geo field paths of a role. */
function paths(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter(isGeoPath).map((item) => item.trim()))];
}

/** The manual orders: topic id → element ids. */
function manualOrders(value) {
  if (!isObject(value)) return {};
  const result = {};
  for (const [topic, ids] of Object.entries(value)) {
    const list = (Array.isArray(ids) ? ids : []).map(positiveId).filter(Boolean);
    if (positiveId(topic) && list.length) result[positiveId(topic)] = list;
  }
  return result;
}

/** The places of the stored settings; the older `patterns` (a path) give their geo paths and `connect`. */
function places(map) {
  const own = isObject(map.places);
  const stored = own ? map.places : (Array.isArray(map.patterns) ? map.patterns.find((item) => item?.type === 'path') : null);
  const result = {};
  for (const role of PATH_ROLES) result[role] = paths(stored?.[role]);
  result.connect = own ? map.places.connect === true : Boolean(stored);
  return result;
}

/**
 * The settings of a story map with all defaults (plan 27q1 §15). Unknown values fall back to the default; older
 * settings (`patterns`, `overview`, `messages` at the top, `slideshow`) are converted.
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
  const by = STORY_ORDERS.includes(order.by) ? order.by : (isField(order.by) ? (positiveId(order.by) ?? order.by) : 'date');
  const limit = Number(story.limit);
  const part = (key, modes, fallback) => {
    const stored = isObject(settings[key]) ? settings[key] : {};
    const mode = stored.mode === 'tab' ? 'inline' : stored.mode;
    return { mode: oneOf(mode, modes, fallback), template: positiveId(stored.template), text: texts(stored.text) };
  };
  const presentation = isObject(settings.presentation) ? settings.presentation : {};
  const messages = isObject(presentation.messages) ? presentation.messages : (isObject(settings.messages) ? settings.messages : {});
  const layout = presentation.layout === 'slideshow' ? 'carousel' : presentation.layout;
  const map = isObject(settings.map) ? settings.map : {};
  const background = isObject(map.background) ? map.background : {};
  const duration = Number(map.duration);
  return {
    story: {
      // the record type of the story topics (27q3 Story map review, 2026-11-25): the range of Show for
      topicType: positiveId(story.topicType),
      rule,
      order: { by, dir: order.dir === 'desc' ? 'desc' : 'asc', manual: manualOrders(order.manual) },
      limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, STORY_LIMIT.max) : STORY_LIMIT.default
    },
    element: { template: positiveId(settings.element?.template) },
    start: part('start', STORY_START_MODES, 'none'),
    end: part('end', STORY_END_MODES, 'none'),
    presentation: {
      layout: oneOf(layout, STORY_LAYOUTS, 'list'),
      distinct: oneOf(presentation.distinct, STORY_DISTINCT, 'highlight'),
      messages: { intro: texts(messages.intro), empty: texts(messages.empty) }
    },
    map: {
      background: positiveId(background.mapDocument)
        ? { mapDocument: positiveId(background.mapDocument), timeFilter: background.timeFilter === true }
        : null,
      places: places(map),
      elementSymbology: isObject(map.elementSymbology) ? structuredClone(map.elementSymbology) : null,
      lineSymbology: isObject(map.lineSymbology) ? structuredClone(map.lineSymbology) : null,
      duration: Number.isFinite(duration) && duration >= 0 ? duration : 1500,
      keep: map.keep === true
    },
    actions: Array.isArray(settings.actions) ? structuredClone(settings.actions) : null
  };
}

/** Most records of a topic range (Show for in Explorer, Topics range of the website element) offered by a picker. */
export const RANGE_LIMIT = 500;

/**
 * A query restricted to one record type (a topic range, 27q3 §12-13): a JSON query gets `{t}` added, a text query `t:<type>`.
 *
 * @param {*} query
 * @param {number|null} type
 * @returns {*}
 */
export function withType(query, type) {
  if (!type || query == null || query === '') return query;
  if (typeof query === 'string') return `${query.trim()} t:${type}`;
  if (Array.isArray(query)) return [...query, { t: String(type) }];
  return [query, { t: String(type) }];
}

/**
 * The record type of the story topics: the stored one; for an older story map the first type of its query (`t:10`,
 * `{"t":"10"}` or `[{"t":"10,12"}]`).
 *
 * @param {object} settings Normalised settings.
 * @param {*} [query] The story topics query (DT_QUERY_STRING), text or JSON.
 * @returns {number|null} Record type id.
 */
export function storyTopicType(settings, query = null) {
  const stored = positiveId(settings?.story?.topicType);
  if (stored) return stored;
  let value = query;
  if (typeof value === 'string') {
    const text = value.trim();
    try {
      value = JSON.parse(text);
    } catch {
      const match = /(?:^|\s)t(?:ype)?:\s*"?(\d+)/i.exec(text);
      return match ? positiveId(match[1]) : null;
    }
  }
  const parts = Array.isArray(value) ? value : [value];
  for (const part of parts) {
    if (!isObject(part)) continue;
    const type = part.t ?? part.type;
    const first = positiveId(String(type ?? '').split(',')[0]);
    if (first) return first;
  }
  return null;
}

/**
 * The record types of the story elements: the target types of the deepest level of the rule (its last branch).
 *
 * @param {object|null} rule Expansion rule.
 * @returns {number[]} Empty: any type (or no rule).
 */
export function storyElementTypes(rule) {
  let step = rule;
  while (step?.levels?.length) step = step.levels[step.levels.length - 1];
  return step ? ruleTargetTypes(step) : [];
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
 * - a field: the first value of `element.fields[field]` (dates as temporalSortValue; `fieldId` resolves a concept code);
 * - `rule`: as found;
 * - `manual`: the ids stored for the topic (`order.manual[sourceId]`), the other elements after them as found.
 * Empty values go last, also in `desc`.
 *
 * @param {Array<object>} elements `{id, title, date, fields: {fieldId: [values]}}`.
 * @param {{by: string|number, dir: string, manual?: object}} order Order of the settings.
 * @param {object} [options]
 * @param {(code: string|number) => number} [options.fieldId] Local id of a field code.
 * @param {number|null} [options.sourceId] The story topic (manual order).
 * @returns {Array<object>} New sorted array.
 */
export function sortStoryElements(elements, order = { by: 'date', dir: 'asc' }, { fieldId = (code) => positiveId(code), sourceId = null } = {}) {
  const list = Array.isArray(elements) ? [...elements] : [];
  if (order?.by === 'rule') return list;
  if (order?.by === 'manual') {
    const ids = order.manual?.[positiveId(sourceId)] || [];
    const position = new Map(ids.map((id, index) => [id, index]));
    return list
      .map((element, index) => ({ element, index, at: position.get(positiveId(element?.id)) ?? Infinity }))
      .sort((a, b) => (a.at === b.at ? a.index - b.index : (a.at < b.at ? -1 : 1)))
      .map((item) => item.element);
  }
  const field = order?.by === 'date' || order?.by == null ? null : fieldId(order.by);
  const key = (element) => {
    if (!field) return element?.date;
    const value = element?.fields?.[field]?.[0];
    return temporalSortValue(value) ?? value;
  };
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

/**
 * The default places of a story element type (DEFAULT_PLACE_CODES): its own geo field as `rty:dty`, a pointer to a
 * Place as `rty:lt<ptr>:<place>:<geo>`.
 *
 * @param {number} rectypeId Type of the story elements.
 * @param {object} definitions
 * @param {(code: string) => ({id: number, type: string, targets: number[]}|null)} definitions.fieldOf The field of the
 *        concept code in the record type, or null.
 * @param {number} definitions.placeType Local id of Place (3-1009).
 * @param {number} definitions.geoField Local id of the location field (2-28).
 * @returns {{begin: string[], transition: string[], end: string[]}}
 */
export function defaultPlaces(rectypeId, { fieldOf, placeType, geoField }) {
  const result = { begin: [], transition: [], end: [] };
  const rty = positiveId(rectypeId);
  if (!rty || typeof fieldOf !== 'function') return result;
  for (const role of PATH_ROLES) {
    for (const code of DEFAULT_PLACE_CODES[role]) {
      const field = fieldOf(code);
      if (!field?.id) continue;
      if (field.type === 'geo') {
        result[role].push(`${rty}:${field.id}`);
      } else if (field.type === 'resource' && placeType && geoField && (field.targets || []).map(Number).includes(Number(placeType))) {
        result[role].push(`${rty}:lt${field.id}:${placeType}:${geoField}`);
      }
    }
  }
  return result;
}

/**
 * Connection lines of a path (legacy `_createPointLinks`): one begin → transitions → one end as a LineString.
 * Several begins or ends: lines from each begin to the first transition, the transitions, lines from the last
 * transition to each end; without transitions: a star from one begin to every end (or to one end from every begin),
 * else one line per pair.
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
    } else if (begin.length === 1) {
      for (const point of end) lines.push([begin[0], point]);
    } else if (end.length === 1) {
      for (const point of begin) lines.push([point, end[0]]);
    } else if (begin.length === end.length) {
      begin.forEach((point, index) => lines.push([point, end[index]]));
    }
    return lines.length ? { type: 'MultiLineString', coordinates: lines } : null;
  }
  const line = [...begin.slice(0, 1), ...transition, ...end.slice(0, 1)];
  return line.length > 1 ? { type: 'LineString', coordinates: line } : null;
}

/** The point a line starts or ends at: a point, or the centre of the bounds of a line or polygon. */
function anchorOf(geometry) {
  if (geometry?.type === 'Point') return geometry.coordinates;
  if (geometry?.type === 'MultiPoint') return geometry.coordinates?.[0] ?? null;
  const bounds = featureBounds([{ geometry }]);
  return bounds ? [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2] : null;
}

/**
 * GeoJSON features of one story element: its places by role (`begin`, `transition`, `end`; `place` for the element's
 * own geometry when no place was found) and, with `connect`, the line begin → transition → end (`role: 'line'`).
 * Polygons stay polygons (morphing later, §6.1); a line starts at their centre. Every feature has `rec_ID` =
 * `story_ID` = the element.
 *
 * @param {object} element `{id, places: {begin: [geometry], transition, end}, geo: [geometry]}`.
 * @param {{connect?: boolean}} [options]
 * @returns {Array<object>} Features.
 */
export function elementFeatures(element, { connect = false } = {}) {
  const storyId = positiveId(element?.id);
  const feature = (geometry, role) => ({ type: 'Feature', geometry, properties: { rec_ID: storyId, story_ID: storyId, role } });
  const features = [];
  const anchors = {};
  for (const role of PATH_ROLES) {
    anchors[role] = [];
    for (const geometry of element?.places?.[role] || []) {
      if (!geometry) continue;
      features.push(feature(geometry, role));
      const point = anchorOf(geometry);
      if (point) anchors[role].push(point);
    }
  }
  if (!features.length) {
    for (const geometry of element?.geo || []) if (geometry) features.push(feature(geometry, 'place'));
  }
  if (connect) {
    const line = pathGeometry(anchors.begin, anchors.transition, anchors.end);
    if (line) features.push(feature(line, 'line'));
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

/**
 * Whether two bounds are the same or nearly the same (27q3 §13, 2026-11-27: the map does not fly then). Each edge
 * may differ by `tolerance` of the larger width / height of the two (at least 0.001 degree, for single points).
 *
 * @param {{west: number, south: number, east: number, north: number}|null} a
 * @param {{west: number, south: number, east: number, north: number}|null} b
 * @param {number} [tolerance] Part of the width / height.
 * @returns {boolean}
 */
export function boundsNearlyEqual(a, b, tolerance = 0.02) {
  if (!a || !b) return false;
  const width = Math.max(a.east - a.west, b.east - b.west, 0.05);
  const height = Math.max(a.north - a.south, b.north - b.south, 0.05);
  return Math.abs(a.west - b.west) <= width * tolerance && Math.abs(a.east - b.east) <= width * tolerance
    && Math.abs(a.south - b.south) <= height * tolerance && Math.abs(a.north - b.north) <= height * tolerance;
}
