/**
 * @file modulePublisher.test.js
 * @brief Publish a module as a standalone page (plan 27b §6): instance settings from the module
 *        payload, remembered page, cancel, and the website API client.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { embedCode, instanceFromPayload, lastPublishedPageId, publishModulePage, publishModuleTo } from '../src/site/modulePublisher.js';
import { WebsiteClient } from '../src/api/WebsiteClient.js';

/** Storage double. */
function memoryStorage(values = {}) {
  const data = { ...values };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    data
  };
}

/** WebsiteClient double: records the calls. */
function fakeClient({ summary = null, publishResult = null } = {}) {
  const calls = [];
  return {
    calls,
    async summary(id) {
      calls.push(['summary', id]);
      if (!summary) throw new Error('not found');
      return summary;
    },
    async publish(values) {
      calls.push(['publish', values]);
      return publishResult || { id: 55, url: 'http://h/db/site/55', title: values.title, created: !values.pageId };
    }
  };
}

test('instanceFromPayload: the module payload becomes instance settings and state', () => {
  assert.deepEqual(instanceFromPayload('map', { format: 'heurist-publication', version: 1, options: { a: 1 }, config: { b: 2 }, state: { q: 'x' } }), {
    settings: { format: 'heurist-map-settings', version: 1, options: { a: 1 }, config: { b: 2 } },
    state: { q: 'x' }
  });
  assert.deepEqual(instanceFromPayload('data', null), {
    settings: { format: 'heurist-data-settings', version: 1, options: {}, config: {} }, state: null
  });
});

test('embedCode escapes the URL and title', () => {
  assert.equal(embedCode('http://h/?a=1&b="2"', 'T<'),
    '<iframe src="http://h/?a=1&amp;b=&quot;2&quot;" title="T&lt;" style="width:100%;height:600px;border:0"></iframe>');
});

test('publishModulePage: new page, remembered for the next publish', async () => {
  const storage = memoryStorage();
  const client = fakeClient();
  let dialog;
  const result = await publishModulePage({
    client, database: 'db1', type: 'map', payload: { options: { a: 1 }, state: { s: 1 } }, storage,
    openDialog: async (options) => { dialog = options; return { title: 'My map', pageId: 0 }; }
  });
  assert.equal(dialog.lastPage, null);
  assert.match(dialog.title, /^Map – \d{4}-\d\d-\d\d$/);
  assert.deepEqual(client.calls[0], ['publish', { type: 'map', settings: { format: 'heurist-map-settings', version: 1,
    options: { a: 1 }, config: {} }, state: { s: 1 }, title: 'My map', pageId: 0 }]);
  assert.equal(result.url, 'http://h/db/site/55');
  assert.match(result.embed, /^<iframe src="http:\/\/h\/db\/site\/55"/);
  assert.deepEqual(JSON.parse(storage.data['heurist.publish.page.db1.map']), { id: 55, title: 'My map' });
});

test('publishModulePage: the remembered page is offered when it can still be updated', async () => {
  const storage = memoryStorage({ 'heurist.publish.page.db1.graph': JSON.stringify({ id: 9, title: 'Old' }) });
  const client = fakeClient({ summary: { v4: true, kind: 'standalone', canEdit: true, title: 'Graph page' } });
  let dialog;
  await publishModulePage({
    client, database: 'db1', type: 'graph', payload: {}, storage,
    openDialog: async (options) => { dialog = options; return { title: 'Graph page', pageId: 9 }; }
  });
  assert.deepEqual(dialog.lastPage, { id: 9, title: 'Graph page' });
  assert.equal(client.calls[1][1].pageId, 9);
});

test('publishModulePage: a page in a menu, not editable or gone is not offered', async () => {
  for (const summary of [{ v4: true, kind: 'page', canEdit: true }, { v4: true, kind: 'standalone', canEdit: false }, null]) {
    const storage = memoryStorage({ 'heurist.publish.page.db1.data': JSON.stringify({ id: 9, title: 'Old' }) });
    let dialog;
    await publishModulePage({
      client: fakeClient({ summary }), database: 'db1', type: 'data', payload: {}, storage,
      openDialog: async (options) => { dialog = options; return null; }
    });
    assert.equal(dialog.lastPage, null);
  }
});

test('publishModulePage: cancel publishes nothing', async () => {
  const client = fakeClient();
  const result = await publishModulePage({ client, database: 'db1', type: 'data', payload: {}, storage: memoryStorage(),
    openDialog: async () => null });
  assert.equal(result, null);
  assert.equal(client.calls.length, 0);
});

test('publishModulePage: Explorer passes settings and state directly', async () => {
  const client = fakeClient();
  await publishModulePage({ client, database: 'db1', type: 'explorer', settings: { format: 'heurist-explorer-settings', ui: {} },
    state: { dataSource: null }, storage: memoryStorage(), openDialog: async () => ({ title: 'E', pageId: 0 }) });
  assert.deepEqual(client.calls[0][1].settings, { format: 'heurist-explorer-settings', ui: {} });
  assert.deepEqual(client.calls[0][1].state, { dataSource: null });
});

test('WebsiteClient: paths, methods and bodies of the website and page entities (plan 27d)', async () => {
  const requests = [];
  const codes = { name: 1, languages: 967, page: 52 };
  const client = new WebsiteClient({ apiClient: { request: async (path, options) => {
    requests.push([path, options]);
    if (path === '/website/setup') return { installed: true, codes };
    if (path === '/website/0') return { records: [{ rec_ID: '12' }] };
    if (path === '/website/5') return { records: [{ rec_ID: '5' }], meta: { canEdit: true, website: { id: 5, kind: 'website' } } };
    return { data: { ok: path } };
  } } });
  assert.deepEqual(await client.summary(5), { id: 5, kind: 'website', canEdit: true, details: {} });
  await client.validate(5, { page: 7, entity: 'website' });
  assert.deepEqual(await client.create({ title: 'S', languages: ['eng'] }), { id: 12, record: { rec_ID: '12' } });
  await client.publish({ type: 'map', pageId: 9 });
  await client.publish({ type: 'map' });
  await client.addToMenu(5, 8, 2);
  await client.assign(5, 8, { index: 0 });
  await client.removeFromMenu(5, 8);
  await client.remove(5, { pages: true, entity: 'website' });
  await client.build(20, { entity: 'page' });
  await client.setup();
  assert.deepEqual(requests.map(([path, options]) => [options.method, path, options.query]), [
    ['GET', '/website/5', { fields: 'rec_ID' }],
    ['GET', '/website/5/validate', { page: 7 }],
    ['GET', '/website/setup', null],
    ['POST', '/website/0', null],
    ['POST', '/page/9/import', null],
    ['POST', '/page/0/import', null],
    ['POST', '/website/5/assign', null],
    ['POST', '/website/5/assign', null],
    ['DELETE', '/website/5/assign', { page: 8 }],
    ['DELETE', '/website/5', { pages: 1 }],
    ['POST', '/page/20/execute', null],
    ['POST', '/website/setup', null]
  ]);
  assert.deepEqual(requests[3][1].body, { rec_ID: 0, details: { 1: 'S', 967: ['eng'] } }, 'create: a record body');
  assert.deepEqual(requests[4][1].body, { type: 'map' }, 'import: the page id is in the path');
  assert.deepEqual(requests[6][1].body, { page: 8, parent: 2 });
  assert.deepEqual(requests[7][1].body, { page: 8, parent: 0, index: 0 });
  await assert.rejects(() => client.summary(0), TypeError);
});

test('WebsiteClient.summary: a page after a 404 of the website entity', async () => {
  const paths = [];
  const client = new WebsiteClient({ apiClient: { request: async (path) => {
    paths.push(path);
    if (path === '/website/20') throw Object.assign(new Error('Record 20 is not a website'), { status: 404 });
    return { records: [{ rec_ID: '20' }], meta: { canEdit: false, website: { id: 20, kind: 'standalone' } } };
  } } });
  assert.deepEqual(await client.summary(20), { id: 20, kind: 'standalone', canEdit: false, details: {} });
  assert.deepEqual(paths, ['/website/20', '/page/20']);
});

test('publishModuleTo: the page chosen in the form, remembered as the last one (plan 29)', async () => {
  const client = fakeClient();
  const storage = memoryStorage();
  const settings = { format: 'heurist-timeline-settings', version: 1, options: {}, config: {} };
  const result = await publishModuleTo({ client, database: 'db1', type: 'timeline', settings, state: { s: 1 },
    title: 'My page', pageId: 0, storage });
  assert.deepEqual(client.calls[0], ['publish', { type: 'timeline', settings, state: { s: 1 }, title: 'My page', pageId: 0 }]);
  assert.ok(result.embed.includes('http://h/db/site/55'));
  assert.equal(lastPublishedPageId('db1', 'timeline', storage), 55);
  assert.equal(lastPublishedPageId('db2', 'timeline', storage), 0);
  await publishModuleTo({ client, database: 'db1', type: 'timeline', settings, title: ' ', pageId: 9, storage });
  assert.match(client.calls[1][1].title, /^Timeline – \d{4}-\d{2}-\d{2}$/, 'an empty title: the default one');
  assert.equal(client.calls[1][1].pageId, 9);
});

test('WebsiteClient.pages: standalone pages of a module, by a record search', async () => {
  const requests = [];
  const codes = { page: 52, version: 980, pageType: 928, standalonePage: 6254, name: 1, configuration: 1180 };
  const config = (type) => JSON.stringify({ schema: 'heurist-cms/4', instances: { i1: { kind: 'module', type } } });
  const client = new WebsiteClient({ apiClient: { request: async (path, options) => {
    requests.push([path, options.query]);
    if (path === '/website/setup') return { codes };
    return { records: [
      { rec_ID: '3', rec_Title: '<b>A</b>', rec_Modified: '2026-10-01', details: { 1: ['Map A'], 1180: [config('map')] } },
      { rec_ID: '4', rec_Title: 'B', rec_Modified: '2026-10-02', details: { 1180: [config('graph')] } },
      { rec_ID: '5', rec_Title: '<b>C</b>', rec_Modified: '2026-10-03', details: { 1180: [config('map')] } }
    ] };
  } } });
  assert.deepEqual(await client.pages('map'), [
    { id: 5, title: 'C', modified: '2026-10-03' },
    { id: 3, title: 'Map A', modified: '2026-10-01' }
  ]);
  assert.equal(requests[1][0], '/records');
  assert.deepEqual(JSON.parse(requests[1][1].q), [{ t: '52' }, { 'f:980': '4' }, { 'f:928': '6254' }]);
  assert.equal(requests[1][1].fields, 'rec_ID,rec_Title,rec_Modified,1,1180');
});
