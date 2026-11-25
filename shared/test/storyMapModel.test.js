import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStoryMapSettings, storyQuery, storySourceId, sortStoryElements, pathGeometry, elementFeatures, storyText,
  storyElementTypes, defaultPlaces, isGeoPath, storyTopicType, STORY_LIMIT
} from '../src/widgets/storymap/storyMapModel.js';

test('settings: defaults for empty, invalid and draft configurations', () => {
  for (const raw of [null, '', '{bad', '[1,2]', {}]) {
    const settings = normalizeStoryMapSettings(raw);
    assert.equal(settings.story.rule, null);
    assert.deepEqual(settings.story.order, { by: 'date', dir: 'asc', manual: {} });
    assert.equal(settings.story.limit, STORY_LIMIT.default);
    assert.equal(settings.element.template, null);
    assert.deepEqual(settings.start, { mode: 'none', template: null, text: {} });
    assert.equal(settings.end.mode, 'none');
    assert.deepEqual(settings.presentation, { layout: 'list', distinct: 'highlight', messages: { intro: {}, empty: {} } });
    assert.equal(settings.map.background, null);
    assert.deepEqual(settings.map.places, { begin: [], transition: [], end: [], connect: false });
    assert.equal(settings.map.duration, 1500);
    assert.equal(settings.map.keep, false);
    assert.equal(settings.actions, null);
  }
});

test('settings: given values are kept, wrong ones fall back', () => {
  const settings = normalizeStoryMapSettings(JSON.stringify({
    story: { rule: { query: { t: 48, 'lf:240': [] } }, order: { by: 'manual', dir: 'desc', manual: { 153: [5, 'x', 6], x: [1] } },
      limit: 900 },
    element: { template: '12' },
    start: { mode: 'header', text: { def: 'Life of {title}', fre: 3 } },
    end: { mode: 'header' },
    presentation: { layout: 'tabs', distinct: 'veil', messages: { intro: { def: 'Pick' } } },
    map: {
      background: { mapDocument: '7', timeFilter: true },
      places: { begin: ['48:28', '2-134', '48:lt134:12:28'], end: ['48:lt864:12:28'], connect: true },
      duration: 0, keep: true
    },
    actions: [{ scope: 'all' }]
  }));
  assert.deepEqual(settings.story.rule, { query: { t: 48, 'lf:240': [] } });
  assert.deepEqual(settings.story.order, { by: 'manual', dir: 'desc', manual: { 153: [5, 6] } });
  assert.equal(settings.story.limit, STORY_LIMIT.max);
  assert.equal(settings.element.template, 12);
  assert.deepEqual(settings.start, { mode: 'header', template: null, text: { def: 'Life of {title}' } });
  assert.equal(settings.end.mode, 'none', 'header is not a mode of the end info');
  assert.deepEqual(settings.presentation, { layout: 'tabs', distinct: 'veil', messages: { intro: { def: 'Pick' }, empty: {} } });
  assert.deepEqual(settings.map.background, { mapDocument: 7, timeFilter: true });
  assert.deepEqual(settings.map.places, { begin: ['48:28', '48:lt134:12:28'], transition: [], end: ['48:lt864:12:28'], connect: true },
    'a concept code is no geo path');
  assert.equal(settings.map.duration, 0);
  assert.equal(settings.map.keep, true);
  assert.deepEqual(settings.actions, [{ scope: 'all' }]);
});

test('settings: the form of 2026-11-18 is converted', () => {
  const settings = normalizeStoryMapSettings({
    presentation: { layout: 'slideshow', interval: 3000 },
    messages: { intro: { def: 'Select' } },
    map: { overview: { querySource: 7 }, patterns: [{ type: 'path', begin: ['48:lt134:12:28'] }, { type: 'points' }] }
  });
  assert.equal(settings.presentation.layout, 'carousel');
  assert.deepEqual(settings.presentation.messages.intro, { def: 'Select' });
  assert.equal(settings.map.background, null, 'an overview query is not a map document');
  assert.deepEqual(settings.map.places, { begin: ['48:lt134:12:28'], transition: [], end: [], connect: true });
});

test('geo paths as in Query sources', () => {
  for (const path of ['48:28', '10:lt240:48:lt134:12:28', '48:r:12:28', '48:rf5:12:28']) assert.equal(isGeoPath(path), true, path);
  for (const path of ['2-134', '48', '48:lt134:12', 'lt134:12:28', 48]) assert.equal(isGeoPath(path), false, String(path));
});

test('story query: the rule from the selected record, the last level of a longer rule', () => {
  const settings = normalizeStoryMapSettings({ story: { rule: { query: { t: 48, 'lf:240': [] } } } });
  assert.deepEqual(storyQuery(settings, 151), { t: 48, 'lf:240': [{ all: { ids: [151] } }] });
  assert.equal(storyQuery(settings, 0), null);
  assert.equal(storyQuery(normalizeStoryMapSettings({}), 151), null);
  const twoLevels = normalizeStoryMapSettings({ story: { rule: { query: { t: 48, 'lf:240': [] }, levels: [{ query: { t: 12, 'lt:134': [] } }] } } });
  assert.deepEqual(storyQuery(twoLevels, 151), { t: 12, 'lt:134': [{ all: { t: 48, 'lf:240': [{ all: { ids: [151] } }] } }] });
});

test('element types: the targets of the deepest level of the rule', () => {
  assert.deepEqual(storyElementTypes({ query: { t: 48, 'lf:240': [] } }), [48]);
  assert.deepEqual(storyElementTypes({ query: { t: 48 }, levels: [{ query: { t: '12,13' } }] }), [12, 13]);
  assert.deepEqual(storyElementTypes({ query: { 'lf:240': [] } }), [], 'any type');
  assert.deepEqual(storyElementTypes(null), []);
});

test('source record: the last selected; a single result without a selection', () => {
  assert.equal(storySourceId([5, '7', 9]), 9);
  assert.equal(storySourceId([], [42]), 42, 'a query with one result (e.g. Mongol Empire) shows its story at once');
  assert.equal(storySourceId([], [1, 2]), null);
  assert.equal(storySourceId(null, null), null);
  assert.equal(storySourceId([3], [42]), 3, 'a selection wins');
});

test('order: by date, by field, as found, manual; empty values last', () => {
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
  assert.deepEqual(ids(sortStoryElements([{ id: 1, fields: { 5: ['1990-05-01'] } }, { id: 2, fields: { 5: ['{"estMinDate":1850.0101}'] } }], { by: 5 })),
    [2, 1], 'a date field as dates');
  const manual = { by: 'manual', manual: { 153: [4, 2] } };
  assert.deepEqual(ids(sortStoryElements(elements, manual, { sourceId: 153 })), [4, 2, 1, 3], 'the stored ids, then the others as found');
  assert.deepEqual(ids(sortStoryElements(elements, manual, { sourceId: 9 })), [1, 2, 3, 4], 'another topic: as found');
  assert.deepEqual(sortStoryElements(null), []);
});

test('default places of an element type', () => {
  const fields = {
    '2-28': { id: 28, type: 'geo' },
    '2-134': { id: 134, type: 'resource', targets: [12] },
    '1414-1090': { id: 1088, type: 'resource', targets: [12, 13] },
    '2-864': { id: 864, type: 'resource', targets: [55] }
  };
  const places = defaultPlaces(48, { fieldOf: (code) => fields[code] || null, placeType: 12, geoField: 28 });
  assert.deepEqual(places, { begin: ['48:28', '48:lt134:12:28'], transition: ['48:lt1088:12:28'], end: [] }, 'a pointer not to Place is no place');
  assert.deepEqual(defaultPlaces(0, { fieldOf: () => null }), { begin: [], transition: [], end: [] });
});

test('path lines: as legacy _createPointLinks', () => {
  const [a, b, c, d, e] = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]];
  assert.deepEqual(pathGeometry([a], [b, c], [d]), { type: 'LineString', coordinates: [a, b, c, d] });
  assert.deepEqual(pathGeometry([a], [], [d]), { type: 'LineString', coordinates: [a, d] });
  assert.equal(pathGeometry([a], [], []), null, 'one point is no line');
  assert.deepEqual(pathGeometry([a, b], [c, d], [e]), { type: 'MultiLineString', coordinates: [[a, c], [b, c], [c, d], [d, e]] }, 'star to the first transition');
  assert.deepEqual(pathGeometry([a], [c], [d, e]), { type: 'MultiLineString', coordinates: [[a, c], [c, d], [c, e]] }, 'star from the last transition');
  assert.deepEqual(pathGeometry([a, b], [], [d, e]), { type: 'MultiLineString', coordinates: [[a, d], [b, e]] }, 'pairs');
  assert.deepEqual(pathGeometry([a], [], [d, e]), { type: 'MultiLineString', coordinates: [[a, d], [a, e]] }, 'several ends: a star');
  assert.deepEqual(pathGeometry([a, b], [], [d]), { type: 'MultiLineString', coordinates: [[a, d], [b, d]] }, 'several begins: a star');
  assert.equal(pathGeometry([a, b, c], [], [d, e]), null, 'unequal begins and ends without transition');
});

test('features: places with roles, the line when connected, the own geometry without places', () => {
  const polygon = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] };
  const element = { id: 204874, places: { begin: [{ type: 'Point', coordinates: [10, 50] }], transition: [], end: [polygon] },
    geo: [{ type: 'Point', coordinates: [1, 2] }] };
  const features = elementFeatures(element, { connect: true });
  assert.deepEqual(features.map((feature) => feature.properties.role), ['begin', 'end', 'line']);
  assert.deepEqual(features[2].geometry, { type: 'LineString', coordinates: [[10, 50], [1, 1]] }, 'a polygon gives its centre');
  assert.ok(features.every((feature) => feature.properties.story_ID === 204874 && feature.properties.rec_ID === 204874));
  assert.deepEqual(elementFeatures(element).map((feature) => feature.properties.role), ['begin', 'end'], 'not connected');
  const own = elementFeatures({ ...element, places: { begin: [], transition: [], end: [] } }, { connect: true });
  assert.deepEqual(own.map((feature) => feature.properties.role), ['place']);
});

test('texts: language with def fallback and {title}', () => {
  assert.equal(storyText({ def: 'Life of {title}', fre: 'Vie de {title}' }, 'fre', 'Kurt'), 'Vie de Kurt');
  assert.equal(storyText({ def: 'Life of {title}' }, 'ger', 'Kurt'), 'Life of Kurt');
  assert.equal(storyText(undefined), '');
});

test('topic record type: stored, else the first type of the query (Story map review, 2026-11-25)', () => {
  assert.equal(normalizeStoryMapSettings({}).story.topicType, null);
  assert.equal(normalizeStoryMapSettings({ story: { topicType: '10' } }).story.topicType, 10);
  assert.equal(normalizeStoryMapSettings({ story: { topicType: 'x' } }).story.topicType, null);
  const none = normalizeStoryMapSettings({});
  assert.equal(storyTopicType(normalizeStoryMapSettings({ story: { topicType: 12 } }), 't:10'), 12);
  assert.equal(storyTopicType(none, 't:10 sortby:t'), 10);
  assert.equal(storyTopicType(none, '{"t":"10,12"}'), 10);
  assert.equal(storyTopicType(none, [{ t: '14' }, { title: 'a' }]), 14);
  assert.equal(storyTopicType(none, 'f:1:"abc"'), null);
  assert.equal(storyTopicType(none, null), null);
});
