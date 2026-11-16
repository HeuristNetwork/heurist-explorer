import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleHandle } from '../src/sync/ModuleHandle.js';

test('ModuleHandle gives a DataSource by type, with the loading state around it', async () => {
  const calls = [];
  const data = new ModuleHandle({ type: 'data', api: {
    setLoading: (loading) => calls.push(`loading:${loading}`),
    setDataSource: async (source, options) => { calls.push(['data', source.request.q, options.reload]); return 'ok'; }
  } });
  assert.equal(await data.setDataSource({ request: { q: 't:1' } }), 'ok');
  assert.deepEqual(calls, ['loading:true', ['data', 't:1', true], 'loading:false']);

  const graph = new ModuleHandle({ type: 'graph', api: { load: async ({ query }) => query } });
  assert.equal(await graph.setDataSource({ request: { q: 't:2' } }), 't:2');

  const dynamic = [];
  const map = new ModuleHandle({ type: 'map', api: {
    getDynamicDocument: () => ({ id: 'dyn-1' }),
    activateMapDocument: async (id) => dynamic.push(id),
    setDynamicDataSources: async (value) => value.currentDataSource.request.q
  } });
  assert.equal(await map.setDataSource({ request: { q: 't:3' } }), 't:3');
  assert.deepEqual(dynamic, []);
  await map.setDataSource({ request: { q: 't:3' } }, { showDynamic: true });
  assert.deepEqual(dynamic, ['dyn-1']);

  // Map outside Explorer (a website page, review 2026-11-16): setDynamicDataSources answers false, the query goes to
  // its Filtered Result layer
  const queries = [];
  const pageMap = new ModuleHandle({ type: 'map', api: {
    activateMapDocument: async () => {},
    setDynamicDataSources: async () => false,
    setQuery: async (query, options) => { queries.push([query, options.title]); return 'layer'; }
  } });
  assert.equal(await pageMap.setDataSource({ title: 'People', request: { q: 't:5' } }, { showDynamic: true }), 'layer');
  assert.deepEqual(queries, [['t:5', 'People']]);

  assert.equal(await new ModuleHandle({ type: 'recordview', api: {} }).setDataSource({ request: { q: 't:4' } }), false);
});

test('ModuleHandle: a replaced request is not an error, others are', async () => {
  const abort = Object.assign(new Error('replaced'), { name: 'AbortError' });
  const replaced = new ModuleHandle({ type: 'graph', api: { setDataSource: async () => { throw abort; } } });
  assert.equal(await replaced.setDataSource({ request: { q: 't:1' } }), null);
  const failed = new ModuleHandle({ type: 'graph', api: { setDataSource: async () => { throw new Error('Server error'); } } });
  await assert.rejects(() => failed.setDataSource({ request: { q: 't:1' } }), /Server error/);
});

test('ModuleHandle sends selection changes of the visitor, not echoes', async () => {
  const events = new EventTarget();
  const handle = new ModuleHandle({ type: 'map', api: {
    addEventListener: (...args) => events.addEventListener(...args),
    removeEventListener: (...args) => events.removeEventListener(...args),
    setSelection: async () => {
      // feedback of the map while the selection is applied
      events.dispatchEvent(new CustomEvent('heurist-map-selection-changed', { detail: { selection: null } }));
    }
  } }).bind();
  const sent = [];
  handle.addEventListener('selectionchange', (event) => sent.push(event.detail.selection));
  await handle.setSelection([17]);
  assert.deepEqual(handle.selection, [17]);
  events.dispatchEvent(new CustomEvent('heurist-map-selection-changed', { detail: { selection: { features: [{ recordId: 17 }] } } }));
  assert.deepEqual(sent, []);
  events.dispatchEvent(new CustomEvent('heurist-map-selection-changed', { detail: { selection: { features: [{ recordId: 18 }] } } }));
  assert.deepEqual(sent, [[18]]);
  handle.unbind();
  events.dispatchEvent(new CustomEvent('heurist-map-selection-changed', { detail: { selection: [19] } }));
  assert.deepEqual(sent, [[18]]);
});

test('ModuleHandle sends map document changes of the visitor only', async () => {
  const events = new EventTarget();
  const handle = new ModuleHandle({ type: 'timeline', api: {
    addEventListener: (...args) => events.addEventListener(...args),
    activateMapDocument: async (id) => events.dispatchEvent(new CustomEvent('heurist-timeline-document-activated', {
      detail: { document: { id, active: true, loadState: 'loaded' } }
    }))
  } }).bind();
  const sent = [];
  handle.addEventListener('mapdocumentchange', (event) => sent.push(event.detail.documentId));
  await handle.setActiveMapDocument(12);
  assert.deepEqual(sent, []);
  await handle.api.activateMapDocument(13);
  assert.deepEqual(sent, ['13']);
  assert.equal(await new ModuleHandle({ type: 'data', api: {} }).setActiveMapDocument(1), false);
});
