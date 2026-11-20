/**
 * @file hStoryMap.test.js
 * @brief Story map (plan 27q1): the widget with a fake service and map, the service over a fake fetch, the map binding.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';
import { featureBounds, temporalSortValue } from '../src/widgets/storymap/storyMapModel.js';
import { StoryMapBinding } from '../src/widgets/storymap/storyMapBinding.js';
import { StoryMapService, presetFromRecords, storyElement } from '../src/widgets/storymap/storyMapService.js';

const PLACES = new Map([[96, { type: 'Point', coordinates: [13.4, 52.5] }], [74, { type: 'Point', coordinates: [-84.4, 33.7] }]]);

/** A story of person 153 with two events (Berlin, Atlanta). */
function fakeService({ elements = null } = {}) {
  const calls = { stories: [], cards: [] };
  return {
    calls,
    async queryIds(query) { return query === 'one' ? [153] : [153, 151]; },
    async loadStory(settings, id) {
      calls.stories.push(id);
      const list = elements ?? [
        { id: 1, title: 'Birth', rectype: 48, date: 1960, fields: { 134: ['96'] }, geo: [] },
        { id: 2, title: 'Visited', rectype: 48, date: 2010, fields: { 134: ['74'] }, geo: [] }
      ];
      return { source: { id, title: 'John' }, elements: list, places: PLACES, fieldId: (code) => ({ '2-134': 134 }[code] ?? Number(code)),
        placeFields: new Set([134]), allowed: new Map() };
    },
    async renderCard(template, id) { calls.cards.push(id); return `<h3>card ${id}</h3>`; },
    clearCache() { calls.cleared = true; }
  };
}

/** A map binding that records its calls. */
function fakeBinding() {
  const calls = [];
  return {
    calls,
    map: {},
    async showOverview(query) { calls.push(['overview', query]); },
    async showStory(features) { calls.push(['story', features.length]); },
    async showElement(features) { calls.push(['element', features.map((feature) => feature.properties.rec_ID)]); },
    async clearStory() { calls.push(['clearStory']); },
    async clear() { calls.push(['clear']); }
  };
}

async function mount(options) {
  installFakeDom();
  const { HStoryMap } = await import('../src/widgets/storymap/HStoryMap.js');
  const host = document.createElement('div');
  const widget = new HStoryMap().attach(host, options).render();
  await flush(5);
  return { host, widget };
}

test('HStoryMap: intro message, then the story of the last selected record with the map on its first element', async () => {
  const service = fakeService();
  const binding = fakeBinding();
  const { host, widget } = await mount({ service, binding, settings: { element: { template: 7 }, messages: { intro: { def: 'Pick a person' } } },
    overviewQuery: { t: 10 } });
  assert.equal(widget.message.textContent, 'Pick a person');
  assert.deepEqual(binding.calls[0], ['overview', { t: 10 }]);
  await widget.setSelection([151, 153]);
  assert.deepEqual(service.calls.stories, [153], 'the last selected');
  assert.equal(widget.message.hidden, true);
  assert.equal(widget.cards.length, 2);
  assert.equal(widget.current, 0);
  assert.equal(widget.cards[0].classList.contains('is-current'), true);
  assert.ok(host.classList.contains('h-storymap-highlight'));
  assert.deepEqual(binding.calls.find((call) => call[0] === 'element'), ['element', [96]]);
  await flush(5);
  assert.deepEqual(service.calls.cards.sort(), [1, 2], 'the current card and its neighbour');
  // a click on the second card
  widget.cards[1].querySelector('h3')?.click?.();
  widget.body.dispatchEvent(Object.assign(new Event('click'), {}));
  widget._setCurrent(1, { fromList: true });
  assert.deepEqual(binding.calls.at(-1), ['element', [74]]);
  await widget.setSelection([153]);
  assert.equal(service.calls.stories.length, 1, 'the same story is not loaded again');
  await widget.destroy();
});

test('HStoryMap: one source record shows its story without a selection; nothing found shows the empty message', async () => {
  const service = fakeService();
  const { widget } = await mount({ service, binding: null, settings: {}, sourceQuery: 'one' });
  await flush(5);
  assert.deepEqual(service.calls.stories, [153]);
  await widget.destroy();

  const empty = fakeService({ elements: [] });
  const second = await mount({ service: empty, settings: { messages: { empty: { def: 'No story of {title}' } } } });
  await second.widget.setSelection([153]);
  assert.equal(second.widget.message.textContent, 'No story of John');
  assert.equal(second.widget.message.hidden, false);
  await second.widget.destroy();
});

test('HStoryMap: tabs with start and end tabs; the start shows the whole story on the map', async () => {
  const service = fakeService();
  const binding = fakeBinding();
  const { host, widget } = await mount({ service, binding, settings: {
    presentation: { layout: 'tabs', distinct: 'veil' }, start: { mode: 'tab', text: { def: 'Life of {title}' } }, end: { mode: 'footer', text: { def: 'The end' } }
  } });
  await widget.setSelection([153]);
  await flush(5);
  assert.deepEqual(widget.items.map((item) => item.kind), ['start', 'element', 'element']);
  assert.deepEqual(widget.slider.tabs.map((tab) => tab.textContent), ['John', 'Birth', 'Visited']);
  assert.equal(widget.cards[0].textContent, 'Life of John');
  assert.equal(widget.footer.textContent, 'The end');
  assert.ok(host.classList.contains('h-storymap-veil'));
  assert.deepEqual(binding.calls.find((call) => call[0] === 'element'), ['element', [96, 74]], 'start: all places');
  widget.slider._go(2);
  assert.equal(widget.current, 2);
  assert.deepEqual(binding.calls.at(-1), ['element', [74]]);
  await widget.destroy();
});

test('service: preset and elements from /records answers; story with places from /map', async () => {
  const meta = { fields: { details: [
    { dty_ID: '1', dty_ConceptCode: '2-1' }, { dty_ID: '12', dty_ConceptCode: '2-12' }, { dty_ID: '1180', dty_ConceptCode: '2-1187' },
    { dty_ID: '1200', dty_ConceptCode: '2-1203' }
  ] } };
  const preset = presetFromRecords({ records: [{ rec_ID: '5', rec_Title: 'x', details: { 1: ['Lives'], 12: ['{"t":10}'], 1180: ['{"presentation":{"layout":"tabs"}}'], 1200: ['10822'] } }], meta });
  assert.equal(preset.title, 'Lives');
  assert.deepEqual(preset.query, { t: 10 });
  assert.equal(preset.settings.presentation.layout, 'tabs');
  assert.equal(preset.typeTerm, 10822);
  assert.equal(presetFromRecords({ records: [] }), null);
  const element = storyElement({ rec_ID: '7', rec_Title: 'Birth', rec_RecTypeID: '48', details: { 9: ['1960-09-20'], 134: ['96'] } }, new Map([[9, 'date'], [134, 'resource']]));
  assert.equal(element.date, 1960.092);
  assert.deepEqual(element.fields[134], ['96']);

  const requests = [];
  const answers = {
    '/records': (params) => (params.get('fields') === '_all'
      ? { records: [{ rec_ID: '2', rec_Title: 'Visited', rec_RecTypeID: '48', details: { 9: ['{"estMinDate":2010}'], 134: ['74'] } },
        { rec_ID: '1', rec_Title: 'Birth', rec_RecTypeID: '48', details: { 9: ['1960'], 134: ['96'] } }],
      meta: { fields: { details: [{ dty_ID: '9', dty_Type: 'date', dty_ConceptCode: '2-9' }, { dty_ID: '134', dty_Type: 'resource', dty_ConceptCode: '2-134' }] } } }
      : { records: [{ rec_ID: '153', rec_Title: 'John' }] }),
    '/map': () => ({ features: [{ properties: { rec_ID: '96' }, geometry: PLACES.get(96) }, { properties: { rec_ID: '74' }, geometry: PLACES.get(74) }] })
  };
  const fetchImpl = async (url) => {
    const parsed = new URL(url, 'http://x');
    requests.push(parsed.pathname);
    const path = parsed.pathname.replace('/api/db', '');
    return { ok: true, json: async () => answers[path](parsed.searchParams), text: async () => '<p>card</p>' };
  };
  const service = new StoryMapService({ apiBaseUrl: '/api', database: 'db', fetchImpl });
  const story = await service.loadStory(preset.settings.story ? { ...preset.settings, story: { rule: { query: { t: 48, 'lf:240': [] } }, order: { by: 'date', dir: 'asc' } } } : null, 153);
  assert.deepEqual(story.elements.map((item) => item.id), [1, 2], 'ordered by date');
  assert.equal(story.source.title, 'John');
  assert.equal(story.places.size, 2);
  assert.equal(story.fieldId('2-134'), 134);
  assert.ok(story.placeFields.has(134));
  assert.equal(await service.renderCard(3, 1), '<p>card</p>');
  await service.renderCard(3, 1);
  assert.equal(requests.filter((path) => path.endsWith('/execute')).length, 1, 'cards are cached');
});

test('binding: element places and lines as inline GeoJSON layers in the active document, then a flight', async () => {
  const calls = [];
  let serial = 0;
  const api = {
    getActiveMapDocument: () => ({ id: 'dyn' }),
    addLayer: async (definition, options) => {
      calls.push(definition.source.type === 'heurist-query' ? ['query', definition.source.query]
        : ['add', definition.source.type, definition.source.data.features.length, options.documentId]);
      return { id: `l${++serial}` };
    },
    removeLayer: async (id, options) => { calls.push(['remove', id, options.documentId]); },
    flyTo: async (bounds, options) => { calls.push(['fly', bounds, options.duration]); }
  };
  const binding = new StoryMapBinding({ getMap: () => api, settings: { map: { duration: 900, keep: false } } });
  const line = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [2, 1]] }, properties: { role: 'line' } };
  const place = { type: 'Feature', geometry: { type: 'Point', coordinates: [2, 1] }, properties: { role: 'end' } };
  await binding.showElement([place, line]);
  assert.deepEqual(calls, [['add', 'inline-geojson', 1, 'dyn'], ['add', 'inline-geojson', 1, 'dyn'], ['fly', { west: 0, south: 0, east: 2, north: 1 }, 900]]);
  await binding.showElement([place]);
  assert.deepEqual(calls.slice(3, 5).map((call) => call[0]).sort(), ['remove', 'remove'], 'the layers of the element before go');
  await binding.showStory([place]);
  assert.equal(calls.filter((call) => call[0] === 'add').length, 3, 'map.keep false: no layer of the whole story');
  await binding.showOverview({ t: 10 });
  assert.deepEqual(calls.at(-1), ['query', { t: 10 }]);
  await binding.clear();
  const nothing = new StoryMapBinding({ getMap: () => null });
  await nothing.showElement([place]);
});

test('model helpers: temporal sort values and bounds', () => {
  assert.equal(temporalSortValue('{"estMinDate":2000,"estMaxDate":2001}'), 2000);
  assert.equal(temporalSortValue('1960-09-20'), 1960.092);
  assert.equal(temporalSortValue('1990'), 1990);
  assert.equal(temporalSortValue(''), null);
  assert.equal(temporalSortValue('{bad'), null);
  assert.deepEqual(featureBounds([{ geometry: { type: 'Polygon', coordinates: [[[1, 2], [3, 4], [1, 4]]] } }]), { west: 1, south: 2, east: 3, north: 4 });
  assert.equal(featureBounds([]), null);
});
