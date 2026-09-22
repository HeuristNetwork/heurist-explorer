import test from 'node:test';
import assert from 'node:assert/strict';
import { MapApplication } from '../../src/core/MapApplication.js';

function createApplication({ initiallyActive = false, dynamicDocument = {}, defaults = {}, interaction = {} } = {}) {
  const rendered = [];
  const removed = [];
  const zoomLimits = [];
  const mapEngine = {
    async initialize() {},
    setInteractionHandlers() {},
    async destroy() {},
    async addLayer(definition) { rendered.push(definition); return { id: definition.id }; },
    async removeLayer(id) { removed.push(id); return true; },
    async setLayerVisibility() {},
    async setLayerOpacity() {},
    async setBaseMap() {},
    async fitBounds() {},
    async setView() {},
    async setZoomLimits(value) { zoomLimits.push(value); },
    getViewState() { return null; },
    async getVisibleLayerBounds() { return null; },
    getCapabilities() { return {}; }
  };
  const layerLoaders = {
    async load(mapLayer, context) {
      return {
        id: context.reference.id,
        recordId: mapLayer.id,
        title: mapLayer.title,
        type: 'geojson',
        visible: mapLayer.visible !== false,
        selectable: mapLayer.selectable !== false,
        data: { type: 'FeatureCollection', features: [] },
        source: mapLayer.source,
        style: mapLayer.style,
        popup: { enabled: true },
        options: mapLayer.options,
        order: context.reference.order
      };
    }
  };
  const application = new MapApplication({
    container: { dispatchEvent() {} },
    config: {
      mapDocument: {},
      documents: { initiallyActive: initiallyActive ? 'dynamic' : null },
      defaults,
      interaction,
      dynamicDocument: {
        enabled: true,
        id: 'dynamic',
        title: 'Runtime map',
        keepContent: true,
        layers: [],
        ...dynamicDocument
      },
      ui: { showCurrentDocument: true },
      baseMaps: [],
      readonly: true
    },
    mapEngine,
    host: {
      async initialize() {}, async destroy() {},
      supportsEditing() { return false; },
      getHostContext() { return { name: 'heurist-explorer' }; }
    },
    providers: {
      mapLayer: {
        async getById(id) {
          return {
            id,
            title: `Layer ${id}`,
            visible: true,
            selectable: true,
            source: { type: 'heurist-query', query: `ids:${id}` },
            style: {}, options: {}
          };
        }
      }
    },
    layerLoaders
  });
  return { application, rendered, removed, zoomLimits };
}

test('every application has one lightweight dynamic MapDocument', () => {
  const { application } = createApplication();
  assert.deepEqual(application.getDynamicDocument(), {
    id: 'dynamic',
    kind: 'dynamic',
    persistent: false,
    title: 'Runtime map',
    active: false,
    activating: false,
    loadState: 'available',
    error: null,
    showInPanel: true
  });
});

test('Filtered Result Map applies its document-specific zoom limits', async () => {
  const { application, zoomLimits } = createApplication({
    dynamicDocument: { minZoom: 3, maxZoom: 11 }
  });
  await application.activateMapDocument('dynamic');
  assert.deepEqual(zoomLimits.at(-1), { minZoom: 3, maxZoom: 11 });
});

test('Filtered Result Map startup applies its document-specific zoom limits', async () => {
  const { application, zoomLimits } = createApplication({
    initiallyActive: true,
    dynamicDocument: { minZoom: 4, maxZoom: 12 }
  });
  await application.initialize();
  assert.deepEqual(zoomLimits.at(-1), { minZoom: 4, maxZoom: 12 });
});

test('global interaction selection policy restricts otherwise selectable layers', async () => {
  const { application, rendered } = createApplication({
    initiallyActive: true,
    interaction: { selectionEnabled: false, popupEnabled: false }
  });
  await application.addQueryLayer('t:10', { id: 'current-results' });
  assert.equal(rendered.at(-1).selectable, false);
  assert.equal(rendered.at(-1).popup.enabled, false);
});

test('Explorer dynamic document keeps an empty current row and stable Workspace rows', async () => {
  const { application, rendered } = createApplication();
  const current = dataSource('filter:7', 'Current places', 't:12', 20, { dynamicRequests: true });
  const sameWorkspace = dataSource('filter:7', 'Saved places', 't:12', 20, {
    dynamicRequests: true, style: { symbol: { color: '#123456' } }, opacity: 0.4, visible: true
  });
  const large = dataSource('source:9', 'Large source', 't:10', 200, { dynamicRequests: true });
  await application.setDynamicDataSources({ currentDataSource: current, workspaceDataSources: [sameWorkspace, large] });
  assert.equal(application.getDynamicDocumentEntry().layerDefinitions.length, 3);
  assert.equal(rendered.length, 0);
  await application.activateMapDocument('dynamic');
  const stored = application.getDynamicDocumentEntry().layerDefinitions;
  assert.equal(stored.length, 3);
  assert.equal(stored[0].reference.id, 'current-results');
  assert.equal(stored[0].mapLayer.title, 'Current result');
  assert.equal(stored[0].mapLayer.options.emptyCurrentResult, true);
  assert.equal(stored[1].runtimeOpacity, 0.4);
  assert.equal(stored[1].mapLayer.style.symbol.color, '#123456');
  assert.equal(stored[0].mapLayer.options.dynamicRequests, false);
  assert.equal(stored[2].mapLayer.options.dynamicRequests, true);
  assert.equal(application.getLayers().find((item) => item.activeDataSource)?.title, 'Saved places');
});

test('a query-only Current-result update keeps the layer definition identity, not a remove/re-add', async () => {
  // Mirrors a Filter Form re-search: the same saved/parameterized source
  // (same reference key/title), only its resolved query text - and thus its
  // result count, almost always different - changes.
  const { application } = createApplication({ initiallyActive: true });
  const first = dataSource('filter:7', 'Saved filter', 't:1', 10, { dynamicRequests: true });
  const second = dataSource('filter:7', 'Saved filter', 't:2', 37, { dynamicRequests: true });
  await application.setDynamicDataSources({ currentDataSource: first });
  const before = application.getDynamicDocumentEntry().layerDefinitions
    .find((item) => item.reference.id === 'current-results');
  assert.ok(before);
  await application.setDynamicDataSources({ currentDataSource: second });
  const after = application.getDynamicDocumentEntry().layerDefinitions
    .find((item) => item.reference.id === 'current-results');
  // A remove-then-re-add would splice out `before` and push a new object,
  // momentarily leaving the panel/legend with no current-results row.
  assert.equal(after, before);
  assert.equal(after.mapLayer.source.query, 't:2');
});

test('incoming results load only in a visible current row; Workspace selection preserves it', async () => {
  const { application, rendered } = createApplication({ initiallyActive: true });
  const first = dataSource('query:1', 'First', 't:1', 10);
  const second = dataSource('query:2', 'Second', 't:2', 10);
  const workspace = dataSource('source:3', 'Workspace', 't:3', 10);
  await application.setDynamicDataSources({ currentDataSource: first, workspaceDataSources: [workspace] });
  const ids = application.getLayers().map((layer) => layer.id);
  const count = rendered.length;
  await application.setDynamicDataSources({ currentDataSource: workspace, workspaceDataSources: [workspace] });
  assert.equal(rendered.length, count);
  assert.equal(application.currentDataSource.title, 'First');
  assert.deepEqual(application.getLayers().map((layer) => layer.id), ids);
  assert.equal(application.getLayers().find((layer) => layer.activeDataSource).title, 'Workspace');
  await application.setLayerVisibility('current-results', false);
  await application.setDynamicDataSources({ currentDataSource: second });
  assert.equal(rendered.length, count);
  assert.equal(application.getLayer('current-results').title, 'Second');
  assert.equal(application.getLayer('current-results').visible, false);
  await application.setLayerVisibility('current-results', true);
  assert.equal(rendered.at(-1).source.query, 't:2');
  await application.setDynamicDataSources({ currentDataSource: first });
  assert.equal(rendered.at(-1).source.query, 't:1');
});

test('ordinary document matches select its layer and unrelated results wait for dynamic activation', async () => {
  const { application, rendered } = createApplication();
  application.mapDocuments.set(42, { id: 42, layerDefinitions: [], active: true });
  application.activeMapDocumentId = 42;
  const own = dataSource('source:1', 'Ordinary layer', 't:1', 10);
  await application.addLayer({ id: 'ordinary', title: own.title, source: { type: 'heurist-query', query: 't:1' }, options: { dataSource: own } });
  const count = rendered.length;
  await application.setDynamicDataSources({ currentDataSource: own });
  assert.equal(application.getLayers()[0].activeDataSource, true);
  assert.equal(application.currentDataSource, null);
  const incoming = dataSource('query:2', 'Pending', 't:2', 10);
  await application.setDynamicDataSources({ currentDataSource: incoming });
  assert.equal(rendered.length, count);
  assert.equal(application.activeMapDocumentId, 42);
  assert.equal(application.getLayers()[0].activeDataSource, false);
  await application.activateMapDocument('dynamic');
  assert.equal(application.getLayers()[0].title, 'Pending');
  assert.equal(application.getLayers()[0].activeDataSource, true);
});

test('Show Data selects an existing row without replacing current-result or loading layers', async () => {
  const { application, rendered } = createApplication({ initiallyActive: true });
  const current = dataSource('query:1', 'Current', 't:1', 10);
  const workspace = dataSource('source:2', 'Workspace', 't:2', 10);
  await application.setDynamicDataSources({ currentDataSource: current, workspaceDataSources: [workspace] });
  const calls = [];
  application.host.showDatasource = (source) => calls.push(source);
  const workspaceId = application.getLayers()[1].id;
  const count = rendered.length;
  await application.showLayerDataSource(workspaceId);
  assert.equal(application.currentDataSource.title, 'Current');
  assert.equal(application.getLayers()[1].activeDataSource, true);
  await application.setDynamicDataSources({ workspaceDataSources: [workspace] });
  await application.showLayerDataSource('current-results');
  assert.equal(application.getLayers()[0].activeDataSource, true);
  assert.equal(rendered.length, count);
  assert.deepEqual(calls.map((source) => source.title), ['Workspace', 'Current']);
});

function dataSource(key, title, q, count, map = {}) {
  const [type, id] = key.split(':');
  return {
    reference: { type, id: Number(id), key }, title,
    request: { q }, presentation: { map }, meta: { count }
  };
}

test('successive datasource updates finish with the latest result even when the first search is slow', async () => {
  const { application } = createApplication({ initiallyActive: true });
  const load = application.layerLoaders.load;
  let release;
  let started;
  const loading = new Promise((resolve) => { started = resolve; });
  application.layerLoaders.load = async (layer, context) => {
    if (layer.source.query === 't:1') {
      started();
      await new Promise((resolve) => { release = resolve; });
    }
    return load(layer, context);
  };
  const first = application.setDynamicDataSources({ currentDataSource: dataSource('query:1', 'Slow', 't:1', 10) });
  await loading;
  const second = application.setDynamicDataSources({ currentDataSource: dataSource('query:2', 'Latest', 't:2', 10) });
  release();
  await Promise.all([first, second]);
  assert.equal(application.getLayer('current-results').title, 'Latest');
  assert.equal(application.getLayers()[0].activeDataSource, true);
});

test('query layer added while dynamic document is inactive is retained but not rendered', async () => {
  const { application, rendered } = createApplication();
  const layer = await application.addQueryLayer({ t: 10 }, { id: 'current-results', title: 'Filtered Result' });
  assert.equal(layer.id, 'current-results');
  assert.equal(rendered.length, 0);

  await application.activateMapDocument('dynamic');
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].id, 'current-results');
  assert.deepEqual(rendered[0].source.query, { t: 10 });
});

test('setQueryForLayer keeps layer identity and reloads active dynamic layer', async () => {
  const { application, rendered, removed } = createApplication({ initiallyActive: true });
  await application.addQueryLayer('t:10', { id: 'current-results' });
  await application.setQueryForLayer('current-results', 't:20');
  assert.deepEqual(removed, ['current-results']);
  assert.equal(rendered.at(-1).id, 'current-results');
  assert.equal(rendered.at(-1).source.query, 't:20');
});

test('setQueryForLayer shows a loading state (not a vanished row) while the new query is in flight', async () => {
  const { application } = createApplication({ initiallyActive: true });
  await application.addQueryLayer('t:10', { id: 'current-results' });
  assert.equal(application.getLayer('current-results').loadState, 'loaded');

  const load = application.layerLoaders.load;
  let release;
  const pendingLoad = new Promise((resolve) => { release = resolve; });
  application.layerLoaders.load = async (layer, context) => {
    await pendingLoad;
    return load(layer, context);
  };

  const reload = application.setQueryForLayer('current-results', 't:20');
  // The runtime layer has been torn down for the new query, but the panel
  // row must stay present and flagged loading, not disappear.
  assert.equal(application.getLayer('current-results')?.loadState, 'loading');
  release();
  await reload;
  assert.equal(application.getLayer('current-results').loadState, 'loaded');
  assert.equal(application.getLayer('current-results').source.query, 't:20');
});

test('clearLayer keeps definition while removeLayer removes it', async () => {
  const { application } = createApplication({ initiallyActive: true });
  await application.addQueryLayer('t:10', { id: 'current-results' });
  assert.equal(await application.clearLayer('current-results'), true);
  assert.equal(application.getLayer('current-results').loadState, 'deferred');
  assert.equal(await application.removeLayer('current-results'), true);
  assert.equal(application.getLayer('current-results'), null);

  await application.activateMapDocument('dynamic', { force: true });
  assert.equal(application.getLayers().length, 0);
});

test('addLayer accepts a persisted MapLayer record ID for the active document', async () => {
  const { application, rendered } = createApplication({ initiallyActive: true });
  const layer = await application.addLayer(45);
  assert.equal(layer.id, '45');
  assert.equal(rendered[0].recordId, 45);
});

test('getDocumentLayer exposes inactive dynamic query layer state', async () => {
  const { application, rendered } = createApplication();
  await application.addQueryLayer('t:10', {
    id: 'current-results',
    title: 'Filtered Result',
    visible: true
  });

  assert.equal(rendered.length, 0);
  const stored = application.getDocumentLayer('current-results', 'dynamic');
  assert.equal(stored.id, 'current-results');
  assert.equal(stored.title, 'Filtered Result');
  assert.equal(stored.visible, true);
  assert.equal(stored.selectable, true);
  assert.equal(stored.source.type, 'heurist-query');
  assert.equal(stored.source.query, 't:10');
  assert.equal(stored.loadState, 'stored');
  assert.equal(stored.error, null);
});

test('failed current-results load can be retried through stored layer definition', async () => {
  let shouldFail = true;
  const rendered = [];
  const mapEngine = {
    async initialize() {}, setInteractionHandlers() {}, async destroy() {},
    async addLayer(definition) { rendered.push(definition); return { id: definition.id }; },
    async removeLayer() { return true; }, async setLayerVisibility() {},
    async setLayerOpacity() {}, async setBaseMap() {}, async fitBounds() {},
    async setView() {}, async getVisibleLayerBounds() { return null; },
    getCapabilities() { return {}; }
  };
  const application = new MapApplication({
    container: { dispatchEvent() {} },
    config: {
      mapDocument: {},
      documents: { initiallyActive: 'dynamic' }, defaults: {}, interaction: {},
      dynamicDocument: { enabled: true, id: 'dynamic', title: 'Runtime map', layers: [] },
      ui: { showCurrentDocument: true }, baseMaps: [], readonly: true
    },
    mapEngine,
    host: { async initialize() {}, async destroy() {}, supportsEditing() { return false; } },
    providers: {},
    layerLoaders: {
      async load(mapLayer, context) {
        if (shouldFail) throw new Error('Invalid GeoJSON');
        return {
          id: context.reference.id, title: mapLayer.title, type: 'geojson', visible: true,
          selectable: true, data: { type: 'FeatureCollection', features: [] },
          source: mapLayer.source, style: {}, options: {}, order: context.reference.order
        };
      }
    }
  });

  await assert.rejects(
    application.addQueryLayer('bad-query', { id: 'current-results' }),
    /Invalid GeoJSON/
  );
  assert.equal(application.getLayer('current-results'), null);
  assert.equal(application.getDocumentLayer('current-results', 'dynamic').id, 'current-results');

  shouldFail = false;
  await application.setQueryForLayer('current-results', 'good-query');
  assert.equal(application.getLayer('current-results').loadState, 'loaded');
  assert.equal(application.getLayer('current-results').source.query, 'good-query');
  assert.equal(rendered.length, 1);
});


test('applyConfiguration updates live UI/current-results settings without switching document', async () => {
  const { application } = createApplication({ initiallyActive: true });
  application.controlPanel = {
    applied: null,
    applyOptions(options) { this.applied = { ...options }; }
  };
  await application.addQueryLayer('t:10', { id: 'current-results', title: 'Old title' });
  const activeBefore = application.activeMapDocumentId;

  const result = await application.applyConfiguration({
    options: {
      ui: { initiallyExpanded: false, showMapDocuments: false, controlCss: 'font-size:11px' },
      mapDocuments: { initiallyActive: 123 }
    },
    config: {
      defaults: { maxAllowedFeatures: 2000, markerClustering: false },
      dynamicDocument: { title: 'Configured map', minimumZoomKm: 2, maximumZoomKm: 100 }
    }
  });

  assert.equal(result.applied, true);
  assert.equal(result.requiresReload, false);
  assert.equal(application.activeMapDocumentId, activeBefore);
  assert.equal(application.getDynamicDocument().title, 'Configured map');
  assert.equal(application.getDocumentLayer('current-results', 'dynamic').title, 'Old title');
  assert.equal(application.getDocumentLayer('current-results', 'dynamic').selectable, true);
  assert.equal(application.config.defaults.maxAllowedFeatures, 2000);
  assert.equal(application.controlPanel.applied.showMapDocuments, false);
  assert.equal(application.config.documents.initiallyActive, 123);
});


test('applyConfiguration enforces interaction policy on already loaded layers', async () => {
  const { application, rendered } = createApplication({ initiallyActive: true });
  await application.addQueryLayer('t:10', { id: 'current-results' });
  assert.equal(rendered.at(-1).selectable, true);
  assert.equal(rendered.at(-1).popup.enabled, true);

  await application.applyConfiguration({
    options: { interaction: { selectionEnabled: false, popupEnabled: false, zoomOnSelection: true } },
    config: { defaults: {} }
  });

  assert.equal(application.getLayer('current-results').selectable, false);
  assert.equal(rendered.at(-1).popup.enabled, false);
});
