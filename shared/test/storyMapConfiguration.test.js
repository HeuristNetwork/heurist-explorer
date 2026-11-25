import test from 'node:test';
import assert from 'node:assert/strict';
import { storyMapConfiguration } from '../src/widgets/storymap/storyMapConfiguration.js';
import { storyTimelineSync } from '../src/widgets/storymap/storyMapTimeline.js';

test('story map publication: the story map, the chosen topic and its own map', () => {
  const { settings } = storyMapConfiguration.preparePublication({
    settings: { preset: 5 }, values: { preset: ['5'] }, publication: { presetId: 5, topic: 101 }
  });
  assert.deepEqual(settings, { preset: 5, topic: 101, ownMap: true });
  // another story map chosen in the form: the topic of the first one is not given
  const other = storyMapConfiguration.preparePublication({ values: { preset: '6' }, publication: { presetId: 5, topic: 101 } });
  assert.deepEqual(other.settings, { preset: 6, ownMap: true });
  assert.deepEqual(storyMapConfiguration.normalize({ preset: 'x', topic: 0 }), { preset: null });
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
