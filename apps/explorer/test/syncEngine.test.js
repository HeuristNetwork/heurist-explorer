import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncEngine } from '../src/core/SyncEngine.js';
import { ExplorerModule } from '../src/core/ExplorerModule.js';

test('document synchronization excludes origin and suppresses echoes without changing datasource', async () => {
  const sync = new SyncEngine();
  const calls = [];
  for (const type of ['map', 'timeline', 'data']) {
    const module = new ExplorerModule({ id: type, type, container: null });
    module.setActiveMapDocument = async (id) => {
      calls.push([type, id]);
      module.dispatchEvent(new CustomEvent('mapdocumentchange', { detail: { documentId: id } }));
    };
    sync.register(module);
  }
  await sync.setActiveMapDocument('12', { origin: 'map' });
  assert.deepEqual(calls, [['timeline', '12']]);
  await sync.setActiveMapDocument('dynamic', { origin: 'timeline' });
  assert.deepEqual(calls.at(-1), ['map', 'dynamic']);
  assert.equal(sync.dataSource, null);
});

test('SyncEngine propagates datasource and selection between modules', async () => {
  const sync = new SyncEngine();
  const a = new ExplorerModule({ id: 'a', type: 'data', container: null });
  const b = new ExplorerModule({ id: 'b', type: 'map', container: null });
  sync.register(a);
  sync.register(b);
  await sync.setDataSource({ type: 'query', query: { q: 't:12' } }, { origin: 'a' });
  assert.equal(b.dataSource.request.q, 't:12');
  assert.equal(b.dataSource.reference.type, 'query');
  await sync.setSelection([2, 2, 3], { origin: 'b' });
  assert.deepEqual(a.selection, [2, 3]);
});

test('SyncEngine preserves non-active data views', async () => {
  const sync = new SyncEngine();
  const current = new ExplorerModule({ id: 'data', type: 'data', container: null });
  const saved = new ExplorerModule({ id: 'data-filter-7', type: 'data', container: null });
  const map = new ExplorerModule({ id: 'map', type: 'map', container: null });
  await current.setDataSource({ type: 'query', query: { q: 't:1' } });
  await saved.setDataSource({ type: 'filter', id: 7, query: { q: 't:7' } });
  sync.register(current); sync.register(saved); sync.register(map);

  await sync.setDataSource(
    { type: 'filter', id: 8, query: { q: 't:8' } },
    { preserveDataViews: true, dataModuleId: 'data' }
  );

  assert.equal(current.dataSource.reference.id, 8);
  assert.equal(saved.dataSource.id, 7);
  assert.equal(map.dataSource.reference.id, 8);
});

test('SyncEngine unifies Dataset and MapSource and isolates module copies', async () => {
  class MutatingModule extends ExplorerModule {
    async setDataSource(source) {
      await super.setDataSource(source);
      source.request.q = 'changed';
    }
  }

  const sync = new SyncEngine();
  const data = new MutatingModule({ id: 'data', type: 'data', container: null });
  const map = new ExplorerModule({ id: 'map', type: 'map', container: null });
  sync.register(data);
  sync.register(map);

  await sync.setDataSource({ type: 'mapsource', id: 11, query: { q: 't:12' } });
  assert.equal(sync.dataSource.reference.key, 'source:11');
  assert.equal(map.dataSource.request.q, 't:12');
});

test('module datasource requests can use the application activation path', () => {
  let request = null;
  const sync = new SyncEngine({
    onDataSourceRequest: (source, options) => { request = { source, options }; }
  });
  const data = new ExplorerModule({ id: 'data', type: 'data', container: null });
  sync.register(data);

  data.dispatchEvent(new CustomEvent('datasourcechange', {
    detail: { dataSource: { type: 'dataset', id: 14, query: { q: 't:12' } } }
  }));

  assert.equal(request.source.id, 14);
  assert.equal(request.options.origin, 'data');
  assert.equal(sync.dataSource, null);
});

test('SyncEngine ignores echoed programmatic selection events', async () => {
  class EchoModule extends ExplorerModule {
    constructor(options) {
      super(options);
      this.calls = 0;
    }

    async setSelection(ids) {
      this.calls += 1;
      await super.setSelection(ids);
      this.dispatchEvent(new CustomEvent('selectionchange', {
        detail: { selection: [...this.selection] }
      }));
      return this.selection;
    }
  }

  const sync = new SyncEngine();
  const graph = new EchoModule({ id: 'graph', type: 'graph', container: null });
  const data = new EchoModule({ id: 'data', type: 'data', container: null });

  sync.register(graph);
  sync.register(data);

  graph.dispatchEvent(new CustomEvent('selectionchange', {
    detail: { selection: [11, 12] }
  }));

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(sync.selection, [11, 12]);
  assert.deepEqual(data.selection, [11, 12]);
  assert.equal(graph.calls, 0);
  assert.equal(data.calls, 1);
});

test('SyncEngine supports a datasource-only HFilter participant', async () => {
  class FilterTarget extends EventTarget {
    constructor() {
      super();
      this.id = 'filter';
      this.type = 'filter';
      this.query = '';
    }
    async setDataSource(source) {
      this.query = source?.request?.q ?? '';
    }
  }

  const sync = new SyncEngine();
  const filter = new FilterTarget();
  sync.register(filter);
  await sync.setDataSource({ type: 'query', query: { q: 't:12' } });
  assert.equal(filter.query, 't:12');
  await sync.setSelection([1, 2]);
  assert.deepEqual(sync.selection, [1, 2]);
});
