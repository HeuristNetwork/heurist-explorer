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
import { featureBounds, normalizeStoryMapSettings, temporalSortValue } from '../src/widgets/storymap/storyMapModel.js';
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
        { id: 1, title: 'Birth', rectype: 48, date: 1960, fields: {}, places: { begin: [PLACES.get(96)], transition: [], end: [] }, geo: [] },
        { id: 2, title: 'Visited', rectype: 48, date: 2010, fields: {}, places: { begin: [PLACES.get(74)], transition: [], end: [] }, geo: [] }
      ];
      return { source: { id, title: 'John' }, elements: list, fieldId: (code) => Number(code) };
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
    async showBackground(background) { calls.push(['background', background?.mapDocument ?? null]); },
    async showStory(features) { calls.push(['story', features.length]); },
    async showElement(features) { calls.push(['element', features.map((feature) => feature.properties.rec_ID)]); },
    async clearStory() { calls.push(['clearStory']); },
    async clear() { calls.push(['clear']); }
  };
}

/** A stand-in of HRecordList (the fake DOM can not render its template): records, options, the current record. */
function fakeList() {
  const list = {
    options: null,
    records: [],
    current: [],
    async initialize(context) { this.context = context; this.options = context.options; },
    async applyConfiguration(options) { this.options = { ...this.options, ...options }; },
    async setData({ records }) { this.records = records; },
    setCurrentRecord(id) { this.current.push(id); },
    async content(ids) { return this.context.onRecordContentRequest({ records: ids.map((id) => ({ rec_ID: id })) }); },
    async destroy() { this.destroyed = true; }
  };
  return list;
}

async function mount(options) {
  installFakeDom();
  const { HStoryMap } = await import('../src/widgets/storymap/HStoryMap.js');
  const host = document.createElement('div');
  const lists = [];
  const widget = new HStoryMap().attach(host, { createList: () => { const list = fakeList(); lists.push(list); return list; }, ...options }).render();
  await flush(5);
  return { host, widget, lists };
}

test('HStoryMap: intro message, then the story of the last selected record in an Extended list, the map on its first element', async () => {
  const service = fakeService();
  const binding = fakeBinding();
  const { host, widget, lists } = await mount({ service, binding, settings: { element: { template: 7 },
    presentation: { messages: { intro: { def: 'Pick a person' } } }, map: { background: { mapDocument: 25 } } } });
  assert.equal(widget.message.textContent, 'Pick a person');
  assert.deepEqual(binding.calls[0], ['background', 25]);
  await widget.setSelection([151, 153]);
  assert.deepEqual(service.calls.stories, [153], 'the last selected');
  assert.equal(widget.message.hidden, true);
  const list = lists[0];
  assert.equal(list.options.viewMode, 'big');
  assert.equal(list.options.trackCurrent, true);
  assert.equal(list.options.controls.pagination, false);
  assert.equal(list.options.interaction.selectionEnabled, false);
  assert.deepEqual(list.records.map((record) => [record.rec_ID, record.rec_Title]), [[1, 'Birth'], [2, 'Visited']]);
  assert.equal(widget.current, 0);
  assert.deepEqual(list.current, [1], 'the list shows the first element');
  assert.ok(host.classList.contains('h-storymap-highlight'));
  assert.deepEqual(binding.calls.find((call) => call[0] === 'element'), ['element', [1]]);
  const content = await list.content([2]);
  assert.equal(content.get(2), '<h3>card 2</h3>', 'the element template, loaded by the list');
  // the list reports another current record (scroll, click)
  list.context.onCurrentRecordChange(2, 1);
  assert.equal(widget.current, 1);
  assert.deepEqual(binding.calls.at(-1), ['element', [2]]);
  assert.deepEqual(list.current, [1], 'not sent back to the list');
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
  const second = await mount({ service: empty, settings: { presentation: { messages: { empty: { def: 'No story of {title}' } } } } });
  await second.widget.setSelection([153]);
  assert.equal(second.widget.message.textContent, 'No story of John');
  assert.equal(second.widget.message.hidden, false);
  await second.widget.destroy();
});

test('HStoryMap: tabs with the start info as a tab; the start shows the whole story; layout changes without reading again', async () => {
  const service = fakeService();
  const binding = fakeBinding();
  const settings = {
    presentation: { layout: 'tabs', distinct: 'veil' }, start: { mode: 'tab', text: { def: 'Life of {title}' } }, end: { mode: 'footer', text: { def: 'The end' } }
  };
  const { host, widget, lists } = await mount({ service, binding, settings });
  await widget.setSelection([153]);
  await flush(5);
  const list = lists[0];
  assert.deepEqual(widget.items.map((item) => item.kind), ['start', 'element', 'element']);
  assert.deepEqual([list.options.viewMode, list.options.fullNav], ['full', 'tabs']);
  assert.deepEqual(list.records.map((record) => record.rec_Title), ['John', 'Birth', 'Visited']);
  const start = (await list.content([-1])).get(-1);
  assert.equal(start.textContent, 'Life of John');
  assert.equal(widget.footer.textContent, 'The end');
  assert.ok(!host.classList.contains('h-storymap-veil'), 'veil only in Vertical');
  assert.deepEqual(binding.calls.find((call) => call[0] === 'element'), ['element', [1, 2]], 'start: all places');
  list.context.onCurrentRecordChange(2, 2);
  assert.deepEqual(binding.calls.at(-1), ['element', [2]]);

  await widget.setSettings({ ...settings, presentation: { layout: 'carousel' } });
  assert.equal(service.calls.stories.length, 1, 'a layout is applied to the shown story');
  assert.deepEqual([list.options.viewMode, list.options.fullNav], ['full', 'buttons']);
  assert.equal(widget.items[widget.current].element.id, 2, 'the current element stays (the start is above the list now)');
  await widget.setSettings({ ...settings, story: { order: { by: 'rule' } } });
  assert.equal(service.calls.stories.length, 2, 'a new order reads the story again');
  await widget.destroy();
});

test('service: preset and elements from /records answers; places per role from /map with geo paths', async () => {
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
  assert.deepEqual(element.places, { begin: [], transition: [], end: [] });

  const requests = [];
  const answers = {
    '/records': (params) => (params.get('fields') === '_all'
      ? { records: [{ rec_ID: '2', rec_Title: 'Visited', rec_RecTypeID: '48', details: { 9: ['{"estMinDate":2010}'], 134: ['74'] } },
        { rec_ID: '1', rec_Title: 'Birth', rec_RecTypeID: '48', details: { 9: ['1960'], 134: ['96'] } }],
      meta: { fields: { details: [{ dty_ID: '9', dty_Type: 'date', dty_ConceptCode: '2-9' }, { dty_ID: '134', dty_Type: 'resource', dty_ConceptCode: '2-134' }] } } }
      : { records: [{ rec_ID: '153', rec_Title: 'John' }] }),
    // the features of the elements: rec_ID = the element (top record), one per geometry
    '/map': (params) => (params.get('geofields') === '48:lt134:12:28'
      ? { features: [{ id: '1:1:96:28:1', properties: { rec_ID: '1' }, geometry: PLACES.get(96) },
        { id: '2:1:74:28:1', properties: { rec_ID: '2' }, geometry: PLACES.get(74) }] }
      : { features: [{ id: '2', properties: { rec_ID: '2' }, geometry: PLACES.get(96) }] })
  };
  const fetchImpl = async (url) => {
    const parsed = new URL(url, 'http://x');
    requests.push(parsed);
    const path = parsed.pathname.replace('/api/db', '');
    return { ok: true, json: async () => answers[path](parsed.searchParams), text: async () => '<p>card</p>' };
  };
  const service = new StoryMapService({ apiBaseUrl: '/api', database: 'db', fetchImpl });
  const settings = normalizeStoryMapSettings({ story: { rule: { query: { t: 48, 'lf:240': [] } }, limit: 50 },
    map: { places: { begin: ['48:lt134:12:28'] } } });
  const story = await service.loadStory(settings, 153);
  assert.deepEqual(story.elements.map((item) => item.id), [1, 2], 'ordered by date');
  assert.equal(story.source.title, 'John');
  assert.deepEqual(story.elements[0].places.begin, [PLACES.get(96)]);
  assert.deepEqual(story.elements[1].places.begin, [PLACES.get(74)]);
  const map = requests.filter((url) => url.pathname.endsWith('/map'));
  assert.equal(map.length, 1, 'one call per role with fields');
  assert.equal(map[0].searchParams.get('geoOutputMode'), 'features');
  assert.equal(requests.find((url) => url.searchParams.get('fields') === '_all').searchParams.get('limit'), '50');
  assert.equal(story.fieldId('2-134'), 134);

  const own = await service.loadStory(normalizeStoryMapSettings({ story: { rule: { query: { t: 48, 'lf:240': [] } } } }), 153);
  assert.deepEqual(own.elements.find((item) => item.id === 2).geo, [PLACES.get(96)], 'without places: the own geometry');
  assert.equal(await service.renderCard(3, 1), '<p>card</p>');
  await service.renderCard(3, 1);
  assert.equal(requests.filter((url) => url.pathname.endsWith('/execute')).length, 1, 'cards are cached');
});

test('binding: element places and lines as inline GeoJSON layers in the active document, then a flight; background', async () => {
  const calls = [];
  let serial = 0;
  let active = 'dyn';
  let documents = [{ id: 'dyn' }];
  const api = {
    getActiveMapDocument: () => ({ id: active }),
    getMapDocuments: () => documents,
    loadMapDocuments: async () => { calls.push(['list']); documents = [{ id: 'dyn' }, { id: 25 }]; },
    activateMapDocument: async (id) => { calls.push(['activate', id]); active = id; },
    addLayer: async (definition, options) => {
      calls.push(['add', definition.source.type, definition.source.data.features.length, options.documentId]);
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
  await binding.showBackground({ mapDocument: 25 });
  assert.deepEqual(calls.filter((call) => call[0] !== 'remove').slice(-2), [['list'], ['activate', 25]], 'listed first, then activated');
  assert.equal(calls.at(-2)[0], 'remove', 'the layers of the story leave the document before');
  calls.length = 0;
  await binding.showBackground({ mapDocument: 25 });
  assert.deepEqual(calls, [], 'active already');
  await binding.showBackground(null);
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
