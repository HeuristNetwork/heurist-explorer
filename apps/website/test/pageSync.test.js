/**
 * Page sync (plan 27l §2, §12): records by origin (Saved filter links, Filter widgets, other modules), the latest search
 * of the origins a module takes, modules mounted later, loops; selection and map document between the modules that
 * share the selection; the request monitor of the page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { PageSync, instanceLinks } = await import('../src/PageSync.js');
const { RequestMonitor } = await import('#shared/api');

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A module public API that records the calls and can send its public events. */
function fakeApi(type, calls) {
  const events = new EventTarget();
  return {
    events,
    addEventListener: (...args) => events.addEventListener(...args),
    removeEventListener: (...args) => events.removeEventListener(...args),
    setDataSource: async (source) => calls.push([type, 'records', source.request.q.t]),
    setDynamicDataSources: async ({ currentDataSource }) => calls.push([type, 'records', currentDataSource.request.q.t]),
    getDynamicDocument: () => ({ id: `${type}-dyn` }),
    activateMapDocument: async (id) => calls.push([type, 'document', id]),
    setSelection: async (ids) => calls.push([type, 'selection', ids])
  };
}

const request = (t) => ({ dataSource: { reference: { type: 'source', id: 4 }, title: 'People', request: { q: { t } } },
  raw: {}, values: {}, missing: [] });
const records = (calls) => calls.filter(([, kind]) => kind === 'records');

test('instanceLinks: the default sources (links and every Filter widget), own query, an older sync, Record View, Explorer', () => {
  const instances = { f1: { kind: 'widget', type: 'filter' }, m1: { kind: 'widget', type: 'menu' } };
  assert.deepEqual(instanceLinks({ type: 'data' }, instances), { from: ['links', 'filter:f1'], selection: true, own: null });
  assert.deepEqual(instanceLinks({ type: 'map', records: { from: ['own', 'module:d1'] }, selection: false, dataSource: { source: 3 } }),
    { from: ['own', 'module:d1'], selection: false, own: { source: 3 } });
  assert.deepEqual(instanceLinks({ type: 'data', sync: 'selection', dataSource: { source: 3 } }).from, ['own'], 'sync of round 1');
  assert.equal(instanceLinks({ type: 'data', sync: 'none' }).selection, false);
  assert.deepEqual(instanceLinks({ type: 'recordview', dataSource: { record: 5 } }), { from: ['own'], selection: false, own: { record: 5 } });
  assert.deepEqual(instanceLinks({ type: 'recordview' }), { from: [], selection: true, own: null });
  assert.deepEqual(instanceLinks({ type: 'explorer', records: { from: ['links', 'filter:f1'] } }), { from: ['links'], selection: false, own: null });
});

test('a search goes to the modules that take its origin; Explorer takes Saved filter links with the whole request', async () => {
  const sync = new PageSync();
  const calls = [];
  sync.register('d1', 'data', fakeApi('data', calls), { from: ['links', 'filter:f1'] });
  sync.register('d2', 'data', fakeApi('fixed', calls), { from: ['own'] });
  sync.register('m1', 'map', fakeApi('map', calls), { from: ['filter:f1'] });
  const pages = [];
  sync.register('x1', 'explorer', { applyPageRequest: (value) => pages.push(value) }, { from: ['own', 'links'] });
  const given = request('10');
  await sync.setRequest(given, { origin: 'links' });
  assert.deepEqual(records(calls), [['data', 'records', '10']]);
  assert.equal(pages[0], given);
  calls.length = 0;
  await sync.setRequest(request('11'), { origin: 'filter:f1' });
  assert.deepEqual(records(calls), [['data', 'records', '11'], ['map', 'records', '11']]);
  assert.deepEqual(calls.find(([type, kind]) => type === 'map' && kind === 'document'), ['map', 'document', 'map-dyn']);
  assert.equal(pages.length, 1, 'Explorer does not take a Filter widget');
  assert.equal(sync.dataSource.request.q.t, '11');
  // Explorer with its own filters only (phase E2): no Saved filter links
  const own = [];
  sync.register('x2', 'explorer', { applyPageRequest: (value) => own.push(value) }, { from: ['own'] });
  await sync.setRequest(request('12'), { origin: 'links' });
  assert.equal(own.length, 0);
  assert.equal(pages.length, 2);
});

test('a module follows another module: its start and every search it takes; a loop stops', async () => {
  const sync = new PageSync();
  const calls = [];
  // the map follows the data module, which has its own query and takes the Filter widget
  sync.register('m1', 'map', fakeApi('map', calls), { from: ['module:d1'] });
  sync.register('d1', 'data', fakeApi('data', calls), { from: ['own', 'filter:f1'] }, request('20'));
  await tick();
  assert.deepEqual(records(calls), [['map', 'records', '20']], 'the own query of d1');
  calls.length = 0;
  await sync.setRequest(request('21'), { origin: 'filter:f1' });
  assert.deepEqual(records(calls), [['data', 'records', '21'], ['map', 'records', '21']]);
  // a module mounted later starts with the newest search of its origins; registered after it was sent: given then
  assert.equal(sync.latest(['module:d1']).dataSource.request.q.t, '21');
  calls.length = 0;
  sync.register('g1', 'graph', fakeApi('late', calls), { from: ['module:d1'] });
  await tick();
  assert.deepEqual(records(calls), [['late', 'records', '21']]);
  calls.length = 0;
  const started = sync.latest(['module:d1']);
  sync.register('g2', 'graph', fakeApi('started', calls), { from: ['module:d1'] }, started);
  await tick();
  assert.deepEqual(records(calls), [], 'it started with it');
  assert.equal(sync.latest(['links']), null);
  // A from B and B from A
  const loop = new PageSync();
  const seen = [];
  loop.register('a', 'data', fakeApi('a', seen), { from: ['module:b', 'links'] });
  loop.register('b', 'data', fakeApi('b', seen), { from: ['module:a'] });
  await loop.setRequest(request('30'), { origin: 'links' });
  assert.deepEqual(records(seen), [['a', 'records', '30'], ['b', 'records', '30']]);
});

test('selection goes only between the modules that share it', async () => {
  const sync = new PageSync();
  const calls = [];
  const data = fakeApi('data', calls);
  sync.register('d1', 'data', data, { from: ['links'] });
  sync.register('d2', 'data', fakeApi('fixed', calls), { from: ['own'], selection: true });
  sync.register('m1', 'map', fakeApi('map', calls), { from: ['links'] });
  sync.register('n1', 'graph', fakeApi('alone', calls), { from: ['own'], selection: false });
  data.events.dispatchEvent(new CustomEvent('heurist-data-selection-changed', { detail: { selection: [7, 8] } }));
  await tick();
  assert.deepEqual(calls, [['fixed', 'selection', [7, 8]], ['map', 'selection', [7, 8]]]);
});

test('map document of Map goes to Timeline; a module mounted later gets the selection; unregister stops it', async () => {
  const sync = new PageSync();
  const calls = [];
  const map = fakeApi('map', calls);
  sync.register('m1', 'map', map, { from: ['links'] });
  sync.register('t1', 'timeline', fakeApi('timeline', calls), { from: ['links'] });
  map.events.dispatchEvent(new CustomEvent('heurist-map-document-activated', { detail: { document: { id: 33, active: true } } }));
  await tick();
  assert.deepEqual(calls, [['timeline', 'document', '33']]);
  calls.length = 0;
  const data = fakeApi('data', calls);
  sync.register('d1', 'data', data, { from: ['links'] });
  data.events.dispatchEvent(new CustomEvent('heurist-data-selection-changed', { detail: { selection: [5] } }));
  await tick();
  calls.length = 0;
  sync.register('d2', 'data', fakeApi('late', calls), { from: ['links'] });
  assert.deepEqual(calls, [['late', 'selection', [5]]]);

  sync.unregister('d1');
  calls.length = 0;
  data.events.dispatchEvent(new CustomEvent('heurist-data-selection-changed', { detail: { selection: [6] } }));
  await tick();
  assert.deepEqual(calls, []);
  assert.equal(sync.register('w', 'menu', {}), null);
});

test('a module that fails does not stop the others', async () => {
  const sync = new PageSync();
  const calls = [];
  const warn = console.warn;
  console.warn = () => {};
  try {
    sync.register('g1', 'graph', { setDataSource: async () => { throw new Error('Server error'); } }, { from: ['links'] });
    sync.register('d1', 'data', fakeApi('data', calls), { from: ['links'] });
    await sync.setRequest(request('12'));
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(records(calls), [['data', 'records', '12']]);
});

test('the requests of the modules report to the page monitor: stopAll stops them', () => {
  const sync = new PageSync();
  const child = new RequestMonitor({ source: 'data' });
  sync.bridge().registerRequestMonitor(child);
  let aborted = 0;
  child.abortAll = () => { aborted += 1; return ['r1']; };
  sync.stopAll();
  assert.equal(aborted, 1);
});
