import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from '../../../shared/test/helpers/fakeDom.js';

const document = installFakeDom();
// HCardinalLayout of the editor
globalThis.Node ??= globalThis.HTMLElement;
const { StoryMapTool, withType, RANGE_LIMIT } = await import('../src/tools/storymap/StoryMapTool.js');
const { formValues, storyMapForm, valuesSettings } = await import('../src/tools/storymap/storyMapForm.js');
const { normalizeStoryMapSettings } = await import('#shared/widgets/storymap/storyMapModel.js');

const CONSTS = {
  RT_PRESENTATION_SET: 50, DT_NAME: 1, DT_QUERY_STRING: 2, DT_EXPANSION_RULES: 3, DT_CONFIGURATION: 4,
  DT_PRESENTATION_TYPE: 5, TRM_PRESENTATION_STORYMAP: 6, RT_MAP_DOCUMENT: 7
};

const dbdefs = {
  dbconst: (code) => CONSTS[code] || 0,
  rectypes: () => [{ id: 10, name: 'Person' }, { id: 12, name: 'Place' }],
  rectypeName: (id) => ({ 10: 'Person', 12: 'Place' }[id] || `#${id}`),
  fields: () => [],
  field: () => null,
  fieldGlobal: () => null,
  localId: () => 0
};

const PRESETS = {
  1: { id: 1, title: 'Lives', query: 't:10', configuration: { story: { topicType: 10 } } },
  2: { id: 2, title: 'No query', query: null, configuration: { story: { topicType: 10 } } }
};

/** A story map tool with stubbed services; `calls` records the range queries and the stories shown. */
async function mountTool({ mode = 'viewer', source = null, ownMap = false } = {}) {
  globalThis.sessionStorage?.clear?.();
  const calls = { queries: [], stories: [], mounted: [], published: [] };
  const host = document.createElement('div');
  document.body.append(host);
  const ownApi = { id: 'own-map', destroy: async () => { calls.mounted.push('map-destroyed'); } };
  const tool = new StoryMapTool({
    mode,
    apiClient: {
      get: async (path) => (path === '/records'
        ? { records: [{ rec_ID: 1, rec_Title: 'Lives', details: { 5: [6] } }, { rec_ID: 2, rec_Title: 'No query', details: { 5: [6] } }] }
        : { meta: { items: {} } })
    },
    getDbDefs: async () => dbdefs,
    getDataSource: () => source,
    getSelection: () => [77],
    getMap: async () => ({ id: 'explorer-map' }),
    openDesigner: async () => null,
    publish: async (options) => { calls.published.push(options); },
    mountOwnMap: ownMap ? async (container) => { calls.mounted.push('map'); return ownApi; } : undefined,
    mountOwnTimeline: ownMap ? async () => { calls.mounted.push('timeline'); return { setQuery: async () => {}, setSelection: async () => {}, clearSelection: async () => {} }; } : undefined,
    runtime: { apiBaseUrl: '/api', database: 'test' }
  });
  tool.service.loadPreset = async (id) => structuredClone(PRESETS[id] || null);
  tool.service.queryIds = async (query, limit) => {
    calls.queries.push({ query, limit });
    return [101, 102];
  };
  tool.service.loadStory = async (settings, id) => {
    calls.stories.push(id);
    return { source: { id, title: `#${id}` }, elements: [] };
  };
  tool.attach(host);
  await tool.render();
  return { tool, host, calls, ownApi };
}

test('withType: the range of Show for has the topic type only', () => {
  assert.equal(withType('f:1:"x"', 10), 'f:1:"x" t:10');
  assert.deepEqual(withType([{ t: '10,12' }], 10), [{ t: '10,12' }, { t: '10' }]);
  assert.deepEqual(withType({ title: 'a' }, 10), [{ title: 'a' }, { t: '10' }]);
  assert.equal(withType('t:5', null), 't:5');
});

test('Show for: Story topics only for a story map with a query; Current result takes the result of Explorer', async () => {
  const { tool, host, calls } = await mountTool({ source: { request: { q: 't:10,12' } } });
  await tool.openPreset(1);
  await flush();
  const values = () => [...(host.querySelector('.h-presentation-scope-select')?.children || [])].map((option) => option.value);
  assert.deepEqual(values(), ['current', 'own', 'any']);
  // All <type> by default (27q3 review 7)
  assert.equal(tool.scope, 'any');
  assert.equal(tool.rangeIds, null);
  tool.scope = 'current';
  await tool._refreshRange();
  assert.deepEqual(calls.queries.at(-1), { query: 't:10,12 t:10', limit: RANGE_LIMIT });
  assert.deepEqual(tool.rangeIds, [101, 102]);
  await tool.openPreset(2);
  await flush();
  assert.deepEqual(values(), ['current', 'any']);
  await tool.destroy();
});

test('Show for = Any: no range query, all records of the type', async () => {
  const { tool, calls } = await mountTool();
  await tool.openPreset(1);
  const before = calls.queries.length;
  tool.scope = 'any';
  await tool._refreshRange();
  assert.equal(calls.queries.length, before);
  assert.equal(tool.rangeIds, null);
  await tool.destroy();
});

test('the story does not follow the selection of Explorer; a chosen topic is shown', async () => {
  const { tool, calls } = await mountTool();
  await tool.openPreset(1);
  await tool.setSelection([55]);
  await flush();
  assert.equal(calls.stories.includes(55), false);
  assert.equal(calls.stories.includes(77), false, 'the selection at start is not used');
  await tool._showTopic(101);
  await flush();
  assert.equal(calls.stories.at(-1), 101);
  assert.equal(tool.story.story.source.id, 101);
  await tool.destroy();
});

test('opened from the CMS designer: Show for = Story topics and the first topic is shown', async () => {
  const { tool, calls } = await mountTool();
  await tool.openPreset(1, { showSource: true });
  await flush();
  assert.equal(tool.scope, 'own');
  assert.deepEqual(calls.queries.at(-1).query, 't:10 t:10');
  assert.equal(tool.topicId, 101);
  await tool.destroy();
});

test('the editor opens the form of an existing story map', async () => {
  const { tool, host } = await mountTool({ mode: 'editor', ownMap: true });
  await tool.openPreset(1);
  await flush();
  assert.equal(tool.formPane.hidden, false);
  assert.ok(tool.form, 'the configuration form is shown');
  assert.equal(host.querySelector('.h-storymap-tool-form').hidden, false);
  await tool.destroy();
});

test('the editor has its own map and timeline; the story is drawn on it', async () => {
  const { tool, calls, ownApi } = await mountTool({ mode: 'editor', ownMap: true });
  await flush();
  await tool._ownMapReady;
  assert.deepEqual(calls.mounted.slice(0, 2), ['map', 'timeline']);
  assert.equal(await tool._mapApi(), ownApi);
  await tool.destroy();
  assert.ok(calls.mounted.includes('map-destroyed'));
});

test('View: Own map toggles between the own map and Explorer\'s Map module', async () => {
  const { tool, host, ownApi } = await mountTool({ ownMap: true });
  await tool.openPreset(1);
  assert.equal(tool.ownMapOn, false);
  assert.equal((await tool._mapApi()).id, 'explorer-map');
  const button = [...host.querySelectorAll('.h-presentation-btn')].find((item) => item.getAttribute('aria-label') === 'Own map');
  assert.ok(button, 'Own map button');
  await tool._setOwnMap(true);
  assert.equal(await tool._mapApi(), ownApi);
  assert.equal(tool.geo.hidden, false);
  await tool._setOwnMap(false);
  assert.equal((await tool._mapApi()).id, 'explorer-map');
  assert.equal(tool.geo.hidden, true);
  await tool.destroy();
});

test('form: the story topic record type is required, the query is not; the type is kept', () => {
  const ids = { query: 2, rules: 3, mapDocument: 7 };
  const form = storyMapForm({ ids });
  const fields = form.groups[0].children;
  const type = fields.find((field) => field.name === 'topicType');
  const query = fields.find((field) => field.name === '2');
  assert.equal(type.req, 'required');
  // the shared record type picker (27q3 §17.4)
  assert.equal(type.source, 'rectypes');
  assert.equal(query.req, undefined);
  const settings = normalizeStoryMapSettings({ story: { topicType: 10 } });
  const values = formValues({ title: 'A', query: '', settings }, ids);
  assert.equal(values.topicType, '10');
  assert.equal(valuesSettings(values, ids).settings.story.topicType, 10);
});

test('own map and timeline: beside vertical stories, under horizontal ones', async () => {
  const { tool } = await mountTool({ mode: 'editor', ownMap: true });
  await tool.openPreset(1);
  await tool._ownMapReady;
  Object.defineProperty(tool.container, 'clientWidth', { value: 1200, configurable: true });
  tool.applied.presentation.layout = 'vertical';
  tool._layout();
  assert.ok(tool.content.classList.contains('is-geo-beside'));
  tool.applied.presentation.layout = 'horizontal';
  tool._layout();
  assert.ok(tool.content.classList.contains('is-geo-below'));
  assert.equal(tool.content.classList.contains('is-geo-beside'), false);
  // a pane too narrow for the map beside: under the stories
  tool.applied.presentation.layout = 'vertical';
  // the editor: the width of the story part (the center of its layout)
  Object.defineProperty(tool.content, 'clientWidth', { value: 500, configurable: true });
  tool._layout();
  assert.ok(tool.content.classList.contains('is-geo-below'));
  await tool.destroy();
});

test('List: the story and the own map are hidden, the List is shown', async () => {
  const { tool, host } = await mountTool({ ownMap: true });
  await tool.openPreset(1);
  await tool._setOwnMap(true);
  // HPresentationList itself does not run in the fake DOM; the tool hides its parts before it renders
  await tool.toggleList(true).catch(() => null);
  assert.equal(tool.content.hidden, true);
  assert.equal(tool.toolbar.hidden, true);
  assert.ok(host.querySelector('.h-storymap-tool-list-mode'));
  await tool.toggleList(false);
  assert.equal(tool.content.hidden, false);
  await tool.destroy();
});

test('editor: the form is on the west of HCardinalLayout, the story in the center', async () => {
  const { tool } = await mountTool({ mode: 'editor', ownMap: true });
  await tool.openPreset(1);
  await flush();
  assert.ok(tool.layout, 'HCardinalLayout');
  assert.equal(tool.formPane.parentElement, tool.layout.getRegionElement('west'));
  assert.equal(tool.content.parentElement, tool.layout.getRegionElement('center'));
  assert.notEqual(tool.formPane.parentElement, tool.main);
  // horizontal stories: the form stays on the west
  tool.applied.presentation.layout = 'horizontal';
  tool._layout();
  assert.equal(tool.formPane.parentElement, tool.layout.getRegionElement('west'));
  assert.equal(tool.view.hidden, false);
  await tool.destroy();
});

test('Publish: a message without a story topic, else the story map with the chosen topic', async () => {
  const { tool, calls } = await mountTool();
  await tool.openPreset(1);
  const shown = [];
  const { HMsg } = await import('#shared/ui');
  const original = HMsg.showMsgDlg;
  HMsg.showMsgDlg = (text) => { shown.push(text); return null; };
  try {
    tool.topicId = 0;
    await tool._publish();
    assert.equal(calls.published.length, 0);
    assert.equal(shown.length, 1);
    await tool._showTopic(101);
    await tool._publish();
    assert.deepEqual(calls.published.map(({ presetId, topic }) => ({ presetId, topic })), [{ presetId: 1, topic: 101 }]);
  } finally {
    HMsg.showMsgDlg = original;
  }
  await tool.destroy();
});

test('Close and clear: no story map, the own map closed, the pane minimised (27q3 §13)', async () => {
  const { tool, host, calls } = await mountTool({ ownMap: true });
  let minimised = 0;
  tool.tool.minimizePane = () => { minimised += 1; return true; };
  await tool.openPreset(1);
  await tool._setOwnMap(true);
  await tool._showTopic(101);
  await tool.closeAndClear();
  assert.equal(tool.preset, null);
  assert.equal(tool.topicId, 0);
  assert.equal(tool.ownMapOn, false);
  assert.ok(calls.mounted.includes('map-destroyed'));
  assert.equal(minimised, 1);
  assert.equal(host.querySelector('.h-storymap-tool-picker-input'), null);
  await tool.destroy();
});

test('form switches: optional properties and help tips above the form, kept in the browser', async () => {
  globalThis.localStorage?.clear?.();
  const { tool, host } = await mountTool();
  const switches = [...(tool.formPane.querySelector('.h-presentation-form-switches')?.querySelectorAll('input') || [])];
  assert.equal(switches.length, 2);
  assert.equal(switches[0].checked, false, 'optional properties hidden by default');
  assert.equal(switches[1].checked, true, 'help tips shown by default');
  await tool.destroy();
});
