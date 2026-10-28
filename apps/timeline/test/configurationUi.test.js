import test from 'node:test';
import assert from 'node:assert/strict';
import { HeuristTimelinePublicApi } from '../src/host/HeuristTimelinePublicApi.js';

test('options apply to the engine and are exposed in state', () => {
  let applied;
  const application = { config: { settings: { stack:true, labelMode:'full', labelPosition:'bar', orientation:'both' } }, engine: { setOptions: value => { applied = value; } }, dispatch() {}, getState: () => ({ contexts: [] }) };
  const api = new HeuristTimelinePublicApi(application);
  api.applyOptions({ labelMode:'hidden', stack:false });
  assert.equal(applied.labelMode, 'hidden');
  assert.equal(api.getState().options.stack, false);
  assert.throws(() => api.applyOptions({ labelMode:'fixed' }), /Invalid timeline option/);
  assert.equal(api.getState().options.labelMode, 'hidden');
});

test('failed engine updates do not commit settings', () => {
  const settings = { labelMode:'full' };
  const api = new HeuristTimelinePublicApi({ config:{ settings }, engine:{ setOptions() { throw new Error('Engine failure'); } } });
  assert.throws(() => api.applyOptions({ labelMode:'hidden' }), /Engine failure/);
  assert.equal(api.application.config.settings, settings);
});

test('getConfiguration / setConfiguration: the settings envelope, applied to engine, panel and host', () => {
  let engineOptions; let panelOptions; let saved;
  const application = {
    config: { settings: { labelMode: 'full' }, ui: {}, interaction: { editEnabled: true }, documents: { query: null } },
    engine: { setOptions: (value) => { engineOptions = value; } },
    controlPanel: { applyOptions: (value) => { panelOptions = value; } },
    host: { bridge: { updateSettings: (value) => { saved = value; } } },
    dispatch() {},
  };
  const api = new HeuristTimelinePublicApi(application);
  const current = api.getConfiguration();
  assert.equal(current.format, 'heurist-timeline-settings');
  assert.equal(current.options.ui.initiallyExpanded, false, 'default (plan 29)');
  api.setConfiguration({ options: { timeline: { labelMode: 'hidden' }, ui: { showHelp: false },
    interaction: { editEnabled: false } } });
  assert.equal(engineOptions.labelMode, 'hidden');
  assert.equal(panelOptions.showHelp, false);
  assert.equal(application.config.interaction.editEnabled, false);
  assert.equal(saved.options.timeline.labelMode, 'hidden');
});

test('publication: Explorer gets the page settings and the state, the timeline does not publish', async () => {
  let request;
  const application = {
    config: { settings: {}, ui: {}, interaction: { editEnabled: true }, documents: { query: [5] }, language: 'fre' },
    activeDocumentId: 7,
    host: { bridge: { openConfiguration: async (value) => { request = value; return { id: 3, url: 'u' }; } } },
    getState: () => ({ contexts: [], selection: [1] }),
  };
  const api = new HeuristTimelinePublicApi(application);
  assert.equal(api.getHostCapabilities().mapPublishing, true);
  assert.deepEqual(await api.openPublishDialog(), { id: 3, url: 'u' });
  assert.equal(request.mode, 'publication');
  assert.deepEqual(request.state, { contexts: [], selection: [1] });
  assert.equal(request.value.options.ui.language, 'fre');
  assert.equal(request.value.options.mapDocuments.initiallyActive, '7');
  assert.equal(request.value.options.interaction.editEnabled, false);
});

test('without Explorer there is no publication', async () => {
  const api = new HeuristTimelinePublicApi({ config: {}, host: { baseUrl: 'x', database: 'db', bridge: {} } });
  assert.equal(api.getHostCapabilities().mapPublishing, false);
  assert.equal(await api.openPublishDialog(), null);
});

test('with a host form (Explorer) the settings come back through the bridge and are applied', async () => {
  let request; let engineOptions;
  const application = {
    config: { settings: {}, ui: {}, interaction: { editEnabled: true }, documents: {}, simplified: true },
    engine: { setOptions: (value) => { engineOptions = value; } },
    host: { bridge: {
      openConfiguration: async (value) => { request = value; return { options: { timeline: { labelMode: 'truncate' } } }; },
      updateSettings() {}
    } },
    dispatch() {},
  };
  const api = new HeuristTimelinePublicApi(application);
  await api.openPreferencesDialog();
  assert.equal(request.mode, 'configuration');
  assert.equal(request.simplified, true);
  assert.equal(request.value.format, 'heurist-timeline-settings');
  assert.equal(engineOptions.labelMode, 'truncate');
});
