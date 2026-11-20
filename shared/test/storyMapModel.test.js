import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStoryMapSettings, storyQuery, storySourceId, sortStoryElements, choosePattern, pathGeometry,
  elementFeatures, storyText, DEFAULT_PATH
} from '../src/widgets/storymap/storyMapModel.js';

// fields of osmak_mapping: Person 10 → Life events 240 (child pointer) → Life event 48
const CODES = { '2-134': 134, '1414-1092': 1087, '1414-1090': 1088, '2-864': 864 };
const fieldId = (code) => CODES[code] ?? (Number(code) || null);

test('settings: defaults for empty, invalid and draft configurations', () => {
  for (const raw of [null, '', '{bad', '[1,2]', {}]) {
    const settings = normalizeStoryMapSettings(raw);
    assert.equal(settings.story.rule, null);
    assert.deepEqual(settings.story.order, { by: 'date', dir: 'asc' });
    assert.equal(settings.element.template, null);
    assert.deepEqual(settings.start, { mode: 'none', template: null, text: {} });
    assert.equal(settings.end.mode, 'none');
    assert.deepEqual(settings.presentation, { layout: 'list', distinct: 'highlight', interval: 5000 });
    assert.equal(settings.map.overview, null);
    assert.deepEqual(settings.map.patterns, [{ type: 'points', rectypes: [], filter: null }]);
    assert.equal(settings.map.duration, 1500);
    assert.equal(settings.map.keep, false);
    assert.equal(settings.actions, null);
  }
});

test('settings: given values are kept, wrong ones fall back', () => {
  const settings = normalizeStoryMapSettings(JSON.stringify({
    story: { rule: { query: { t: 48, 'lf:240': [] } }, order: { by: '2-9', dir: 'desc' } },
    element: { template: '12' },
    start: { mode: 'header', text: { def: 'Life of {title}', fre: 3 } },
    end: { mode: 'header' },
    presentation: { layout: 'tabs', distinct: 'veil', interval: -5 },
    map: {
      overview: { querySource: '7' },
      patterns: [{ type: 'star' }, DEFAULT_PATH, { type: 'path' }, { type: 'points', filter: { t: 12 }, rectypes: [48, 'x'] }],
      duration: 0, keep: true, layers: [25, 'a', 0]
    },
    actions: [{ scope: 'all' }]
  }));
  assert.deepEqual(settings.story.rule, { query: { t: 48, 'lf:240': [] } });
  assert.deepEqual(settings.story.order, { by: '2-9', dir: 'desc' });
  assert.equal(settings.element.template, 12);
  assert.deepEqual(settings.start, { mode: 'header', template: null, text: { def: 'Life of {title}' } });
  assert.equal(settings.end.mode, 'none', 'header is not a mode of the end element');
  assert.deepEqual(settings.presentation, { layout: 'tabs', distinct: 'veil', interval: 5000 });
  assert.deepEqual(settings.map.overview, { querySource: 7 });
  assert.deepEqual(settings.map.patterns, [
    { type: 'path', rectypes: [], begin: ['2-134', '1414-1092'], transition: ['1414-1090'], end: ['2-864'] },
    { type: 'points', rectypes: [48], filter: { t: 12 } }
  ], 'unknown types and a path without fields are dropped');
  assert.equal(settings.map.duration, 0);
  assert.equal(settings.map.keep, true);
  assert.deepEqual(settings.map.layers, [25]);
  assert.deepEqual(settings.actions, [{ scope: 'all' }]);
  assert.deepEqual(normalizeStoryMapSettings({ map: { overview: { query: { t: 12 } } } }).map.overview, { query: { t: 12 } });
});

test('story query: the rule from the selected record, the last level of a longer rule', () => {
  const settings = normalizeStoryMapSettings({ story: { rule: { query: { t: 48, 'lf:240': [] } } } });
  assert.deepEqual(storyQuery(settings, 151), { t: 48, 'lf:240': [{ all: { ids: [151] } }] });
  assert.equal(storyQuery(settings, 0), null);
  assert.equal(storyQuery(normalizeStoryMapSettings({}), 151), null);
  const twoLevels = normalizeStoryMapSettings({ story: { rule: { query: { t: 48, 'lf:240': [] }, levels: [{ query: { t: 12, 'lt:134': [] } }] } } });
  assert.deepEqual(storyQuery(twoLevels, 151), { t: 12, 'lt:134': [{ all: { t: 48, 'lf:240': [{ all: { ids: [151] } }] } }] });
});

test('source record: the last selected; a single result without a selection', () => {
  assert.equal(storySourceId([5, '7', 9]), 9);
  assert.equal(storySourceId([], [42]), 42, 'a query with one result (e.g. Mongol Empire) shows its story at once');
  assert.equal(storySourceId([], [1, 2]), null);
  assert.equal(storySourceId(null, null), null);
  assert.equal(storySourceId([3], [42]), 3, 'a selection wins');
});

test('order: by date, by field, as found; empty values last', () => {
  const elements = [
    { id: 1, title: 'b', date: 1990, fields: { 9: ['z'] } },
    { id: 2, title: 'a', date: null, fields: { 9: ['a'] } },
    { id: 3, title: 'c', date: 1960, fields: {} },
    { id: 4, title: 'a', date: 1990, fields: { 9: ['m'] } }
  ];
  const ids = (list) => list.map((element) => element.id);
  assert.deepEqual(ids(sortStoryElements(elements)), [3, 4, 1, 2], 'date, then title');
  assert.deepEqual(ids(sortStoryElements(elements, { by: 'date', dir: 'desc' })), [4, 1, 3, 2], 'empty date stays last');
  assert.deepEqual(ids(sortStoryElements(elements, { by: 9, dir: 'asc' })), [2, 4, 1, 3]);
  assert.deepEqual(ids(sortStoryElements(elements, { by: 'rule' })), [1, 2, 3, 4]);
  assert.deepEqual(ids(sortStoryElements([{ id: 1, fields: { 5: ['10'] } }, { id: 2, fields: { 5: ['9'] } }], { by: 5 })), [2, 1], 'numbers as numbers');
  assert.deepEqual(sortStoryElements(null), []);
});

test('pattern per element: path when its fields have values, else the fallback', () => {
  const { map } = normalizeStoryMapSettings({ map: { patterns: [DEFAULT_PATH, { type: 'points' }] } });
  assert.equal(choosePattern({ rectype: 48, fields: { 134: [500], 864: [501] } }, map.patterns, { fieldId }).type, 'path');
  assert.equal(choosePattern({ rectype: 48, fields: { 1088: [502] } }, map.patterns, { fieldId }).type, 'path');
  assert.equal(choosePattern({ rectype: 48, fields: { 3: ['text'] } }, map.patterns, { fieldId }).type, 'points');
  const byType = normalizeStoryMapSettings({ map: { patterns: [{ type: 'points', rectypes: [55] }, DEFAULT_PATH] } }).map.patterns;
  assert.equal(choosePattern({ rectype: 55, fields: {} }, byType, { fieldId }).type, 'points');
  assert.equal(choosePattern({ rectype: 48, fields: {} }, byType, { fieldId }).type, 'path', 'the last pattern when none fits');
  assert.equal(choosePattern({ fields: {} }, []).type, 'points');
});

test('path lines: as legacy _createPointLinks', () => {
  const [a, b, c, d, e] = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]];
  assert.deepEqual(pathGeometry([a], [b, c], [d]), { type: 'LineString', coordinates: [a, b, c, d] });
  assert.deepEqual(pathGeometry([a], [], [d]), { type: 'LineString', coordinates: [a, d] });
  assert.equal(pathGeometry([a], [], []), null, 'one point is no line');
  assert.deepEqual(pathGeometry([a, b], [c, d], [e]), { type: 'MultiLineString', coordinates: [[a, c], [b, c], [c, d], [d, e]] }, 'star to the first transition');
  assert.deepEqual(pathGeometry([a], [c], [d, e]), { type: 'MultiLineString', coordinates: [[a, c], [c, d], [c, e]] }, 'star from the last transition');
  assert.deepEqual(pathGeometry([a, b], [], [d, e]), { type: 'MultiLineString', coordinates: [[a, d], [b, e]] }, 'pairs');
  assert.equal(pathGeometry([a, b], [], [d]), null, 'unequal begins and ends without transition');
});

test('features: places with roles and the line of a path; points read only place fields', () => {
  const places = new Map([[500, { type: 'Point', coordinates: [10, 50] }], [501, { type: 'Point', coordinates: [20, 40] }],
    [502, { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }]]);
  const element = { id: 204874, rectype: 48, fields: { 134: [500], 864: [501], 9: ['500'] }, geo: [] };
  const path = choosePattern(element, [{ type: 'path', begin: ['2-134'], transition: [], end: ['2-864'] }], { fieldId });
  const features = elementFeatures(element, path, places, { fieldId });
  assert.deepEqual(features.map((feature) => feature.properties.role), ['begin', 'end', 'line']);
  assert.deepEqual(features[2].geometry, { type: 'LineString', coordinates: [[10, 50], [20, 40]] });
  assert.ok(features.every((feature) => feature.properties.story_ID === 204874));
  assert.equal(features[0].properties.rec_ID, 500);

  const points = { type: 'points', rectypes: [], filter: null };
  const own = { type: 'Point', coordinates: [1, 2] };
  const all = elementFeatures({ ...element, fields: { 134: [500, 502], 864: [500], 9: ['501'] }, geo: [own] }, points, places,
    { placeFields: new Set([134, 864]) });
  assert.deepEqual(all.map((feature) => feature.properties.rec_ID), [500, 502, 204874], 'no doubles, a date value is no place, own geo');
  const filtered = elementFeatures({ ...element, fields: { 134: [500, 502] } }, points, places, { allowed: new Set([502]) });
  assert.deepEqual(filtered.map((feature) => feature.properties.rec_ID), [502]);
});

test('texts: language with def fallback and {title}', () => {
  assert.equal(storyText({ def: 'Life of {title}', fre: 'Vie de {title}' }, 'fre', 'Kurt'), 'Vie de Kurt');
  assert.equal(storyText({ def: 'Life of {title}' }, 'ger', 'Kurt'), 'Life of Kurt');
  assert.equal(storyText(undefined), '');
});
