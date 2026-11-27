import test from 'node:test';
import assert from 'node:assert/strict';
import { storyMapConfiguration, storyMapTopicRangeTerms } from '../src/widgets/storymap/storyMapConfiguration.js';
import { boundsNearlyEqual } from '../src/widgets/storymap/storyMapModel.js';
import { storyTimelineLayer, storyTimelineSync } from '../src/widgets/storymap/storyMapTimeline.js';
import { storyTopicInputOptions, topicRangeQuery } from '../src/widgets/storymap/storyTopicInput.js';

test('story map publication: the story map, the chosen topic, Map and Timeline elements beside it (27q3 review 7)', () => {
  const { settings, companions } = storyMapConfiguration.preparePublication({
    settings: { preset: 5 }, values: { preset: ['5'] },
    publication: { presetId: 5, topic: 101, companionDefaults: { map: { settings: { options: { a: 1 } }, state: null } } }
  });
  assert.deepEqual(settings, { preset: 5, topic: 101, map: 'none', timeline: 'none', ui: { language: 'auto' } });
  assert.deepEqual(companions, [
    { role: 'map', type: 'map', settings: { options: { a: 1 } }, state: null },
    { role: 'timeline', type: 'timeline', settings: {}, state: null }
  ]);
  // another story map chosen in the form: the topic of the first one is not given
  const other = storyMapConfiguration.preparePublication({ values: { preset: '6' }, publication: { presetId: 5, topic: 101 } });
  assert.deepEqual(other.settings, { preset: 6, map: 'none', timeline: 'none', ui: { language: 'auto' } });
  assert.deepEqual(storyMapConfiguration.normalize({ preset: 'x', topic: 0 }),
    { preset: null, topicSelect: false, topicRange: 'story', map: 'none', timeline: 'none' });
});

test('story map publication: topic selection, Current result keeps the query, map / timeline switches, interface', () => {
  const values = storyMapConfiguration.normalize({
    preset: '5', topicSelect: true, topicRange: 'current', showMap: false, showTimeline: true,
    ui: { showSourceHeader: true, language: 'fre' }
  });
  const { settings, companions } = storyMapConfiguration.preparePublication({
    settings: storyMapConfiguration.serialize(values), values, publication: { presetId: 5, topic: 101, query: 't:10' }
  });
  assert.deepEqual(settings, {
    preset: 5, topic: 101, topicSelect: true, topicRange: 'current', query: 't:10', map: 'none', timeline: 'none',
    ui: { showSourceHeader: true, language: 'fre' }
  });
  // Add a Map element off: only the timeline is added
  assert.deepEqual(companions.map((item) => item.role), ['timeline']);
  // another range: no query kept
  const story = storyMapConfiguration.preparePublication({
    values: { preset: 5, topicSelect: true, topicRange: 'story' }, publication: { presetId: 5, topic: 101, query: 't:10' }
  });
  assert.equal(story.settings.query, undefined);
});

test('story map element: older settings (own map: none now, a page map) and the stored form', () => {
  assert.deepEqual(storyMapConfiguration.normalize({ preset: 5, topic: 7, ownMap: true, map: 'own' }),
    { preset: 5, topic: 7, topicSelect: false, topicRange: 'story', map: 'none', timeline: 'none' });
  const page = storyMapConfiguration.normalize({ preset: 5, map: 'map1' });
  assert.equal(page.map, 'map1');
  assert.equal(page.timeline, 'none');
  assert.deepEqual(storyMapConfiguration.serialize({ preset: 5, map: 'map1', timeline: 'tl2', topicSelect: true, topicRange: 'links' }),
    { preset: 5, topicSelect: true, topicRange: 'links', map: 'map1', timeline: 'tl2' });
  assert.deepEqual(storyMapConfiguration.serialize({ preset: 5, topicRange: 'any' }), { preset: 5 });
});

test('topic ranges by mode', () => {
  assert.deepEqual(storyMapTopicRangeTerms('publication', { typeName: 'Person' }).map((term) => term.id), ['story', 'any', 'current']);
  assert.deepEqual(storyMapTopicRangeTerms('website', { hasQuery: false }).map((term) => term.id), ['any', 'links']);
  assert.equal(storyMapTopicRangeTerms('website', { typeName: 'Person' })[1].label, 'All Person');
});

test('bounds nearly equal: no flight to the same place', () => {
  const a = { west: 10, south: 40, east: 12, north: 42 };
  assert.equal(boundsNearlyEqual(a, { west: 10.01, south: 40.01, east: 12.02, north: 41.99 }), true);
  assert.equal(boundsNearlyEqual(a, { west: 10.5, south: 40, east: 12, north: 42 }), false);
  // single points: at least 0.001 degree
  assert.equal(boundsNearlyEqual({ west: 1, south: 1, east: 1, north: 1 }, { west: 1.0005, south: 1, east: 1.0005, north: 1 }), true);
  assert.equal(boundsNearlyEqual(a, null), false);
});

test('story timeline: the elements once per story, the current element selected', () => {
  const calls = [];
  const timeline = {
    setQuery: (query) => calls.push(['query', query]),
    setSelection: (ids) => calls.push(['select', ids]),
    clearSelection: () => calls.push(['clear'])
  };
  const sync = storyTimelineSync(() => timeline);
  const story = { source: { id: 7 }, elements: [{ id: 1 }, { id: 2 }] };
  sync.sync(story, { kind: 'element', element: { id: 2 } });
  sync.sync(story, { kind: 'source' });
  assert.deepEqual(calls, [['query', [{ ids: '1,2' }]], ['select', [2]], ['clear']]);
  sync.reset();
  sync.sync(story, null);
  assert.equal(calls.filter(([kind]) => kind === 'query').length, 2);
});

test('story in a timeline of the host: a band of its own, replaced for another topic, removed by reset (27q3 review 6)', async () => {
  const calls = [];
  const timeline = {
    addLayer: (layer) => calls.push(['add', layer.id, layer.title, layer.query]),
    removeLayer: (id) => calls.push(['remove', id]),
    setSelection: (ids) => calls.push(['select', ids])
  };
  let current = timeline;
  const layer = storyTimelineLayer(() => current, () => 'StoryMap: Napoleon');
  const story = { source: { id: 7, title: 'Napoleon' }, elements: [{ id: 11 }, { id: 12 }] };
  await layer.sync(story, { kind: 'element', element: { id: 12 } });
  assert.deepEqual(calls, [['add', 'storymap-story', 'StoryMap: Napoleon', [{ ids: '11,12' }]], ['select', [12]]]);
  calls.length = 0;
  // the same topic: no new band; the start card selects nothing
  await layer.sync(story, { kind: 'start' });
  assert.deepEqual(calls, []);
  // no timeline any more (the own one is on): the band goes
  current = null;
  await layer.sync(story, null);
  assert.deepEqual(calls, [['remove', 'storymap-story']]);
  calls.length = 0;
  current = timeline;
  await layer.sync(story, null);
  await layer.reset();
  assert.deepEqual(calls.map((call) => call[0]), ['add', 'remove']);
});

test('story topic picker: one form, the range as query and Browse filter (27q3 review 8)', () => {
  assert.deepEqual(topicRangeQuery(null), []);
  assert.deepEqual(topicRangeQuery([]), [{ ids: '0' }]);
  const browse = () => null;
  const ranged = storyTopicInputOptions({ apiClient: { get: () => null }, type: 10, ids: [1, 2], value: 2, browseRecords: browse });
  assert.equal(ranged.pointerMode, 'dropdown');
  assert.deepEqual(ranged.targetTypes, [10]);
  assert.equal(ranged.showBrowse, true);
  assert.deepEqual(ranged.browseFilter, [{ ids: '1,2' }]);
  assert.equal(ranged.value, 2);
  const all = storyTopicInputOptions({ apiClient: { get: () => null }, type: 10 });
  assert.equal(all.showBrowse, false);
  assert.equal(all.browseFilter, null);
});
