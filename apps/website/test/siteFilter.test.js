/**
 * The Filter widget of a website page (plan 27l §3): start with the Saved filter of the URL, the item of a same-page
 * link, a run for the modules of the page, the designer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const { mountPageFilter } = await import('../src/siteFilter.js');
const { PageSync } = await import('../src/PageSync.js');

const instance = { kind: 'widget', type: 'filter', settings: { items: [{ kind: 'source', id: 12, title: 'People' },
  { kind: 'filter', id: 34, title: 'Places' }], mode: 'list' } };
const config = { runtime: { apiBaseUrl: 'https://h/api', database: 'db' } };
const request = (id, missing = []) => ({ dataSource: { reference: { type: 'source', id }, request: { q: { t: '10' } } },
  raw: { reference: { type: 'source', id }, request: { q: { t: '10', title: '$X$' } } }, values: {}, missing });

/** The definitions are not read in these tests. */
async function withoutFetch(run) {
  const before = globalThis.fetch;
  const warn = console.warn;
  globalThis.fetch = async () => { throw new Error('offline'); };
  console.warn = () => {};
  try {
    return await run();
  } finally {
    globalThis.fetch = before;
    console.warn = warn;
  }
}

test('designer: a widget without filters says what it needs; the list without running', async () => {
  const host = document.createElement('div');
  const empty = await mountPageFilter(host, { kind: 'widget', type: 'filter', settings: {} }, { runtime: { design: true } },
    { id: 'f1', sync: null, pageRequest: async () => null });
  assert.equal(empty, null);
  assert.match(host.textContent, /choose its filters/);
  const list = await mountPageFilter(document.createElement('div'), instance, { runtime: { design: true } },
    { id: 'f1', sync: null, pageRequest: async () => null });
  assert.equal(list.items.length, 2);
  assert.equal(list.options.onRun({ request: { q: 't:1' } }), undefined);
});

test('page: the item of the URL is marked; a same-page link marks its item; a run goes to the page', async () => {
  await withoutFetch(async () => {
    const sync = new PageSync();
    const filter = await mountPageFilter(document.createElement('div'), instance, config,
      { id: 'f1', sync, pageRequest: async () => request(12) });
    assert.equal(filter.selectedKey, 'source:12');
    assert.ok(filter.stopButton, 'Stop of the page requests');

    await sync.setRequest({ dataSource: { reference: { type: 'filter', id: 34 }, request: { q: { t: '5' } } } }, { origin: 'links' });
    assert.equal(filter.selectedKey, 'filter:34');

    await filter.options.onRun({ reference: { type: 'source', id: 12 }, request: { q: { t: '11' } } });
    assert.deepEqual(sync.request.dataSource.request.q, { t: '11' });
    assert.equal(filter.selectedKey, 'filter:34', 'its own run does not come back');
    await filter.destroy();
    await sync.setRequest(request(12), { origin: 'links' });
    assert.equal(filter.selectedKey, 'filter:34', 'destroyed: not listening');
  });
});

test('page: missing values of the URL are asked in the Filter Form of the item', async () => {
  await withoutFetch(async () => {
    const sync = new PageSync();
    const shown = [];
    const { HFilter } = await import('#shared/widgets/filter/HFilter.js');
    const original = HFilter.prototype.showSource;
    HFilter.prototype.showSource = async function (source, values, options) { shown.push([source.request.q.title, options.key]); };
    try {
      await mountPageFilter(document.createElement('div'), instance, config, { id: 'f1', sync, pageRequest: async () => request(12, ['X']) });
    } finally {
      HFilter.prototype.showSource = original;
    }
    assert.deepEqual(shown, [['$X$', 'source:12']]);
  });
});
