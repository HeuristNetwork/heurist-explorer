import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RecordListLoader, RECORD_LIST_FIELDS } from '../../src/data/RecordListLoader.js';

/** Fake api client: records the request bodies, answers with `total` records. */
function fakeApi(total = 3) {
  const calls = [];
  return {
    calls,
    async post(path, { body, signal }) {
      calls.push({ path, body, signal });
      const records = Array.from({ length: Math.min(body.limit, total) }, (_, i) => ({ rec_ID: i + 1, rec_Title: `R${i + 1}` }));
      return { records, pagination: { total: body.total === false ? -1 : total }, meta: {} };
    }
  };
}

test('load sends query, fields, page and sort to POST /records', async () => {
  const api = fakeApi(3);
  const loader = new RecordListLoader({ apiClient: api, query: [{ t: '10' }], sort: 'title' });
  const page = await loader.load({ offset: 0, limit: 50 });
  assert.equal(api.calls[0].path, '/records');
  assert.deepEqual(api.calls[0].body.q, [{ t: '10' }]);
  assert.equal(api.calls[0].body.fields, RECORD_LIST_FIELDS.join(','));
  assert.equal(api.calls[0].body.sort, 'title');
  assert.equal(api.calls[0].body.offset, 0);
  assert.equal(api.calls[0].body.limit, 50);
  assert.equal(page.records.length, 3);
  assert.equal(page.recordsTotal, 3);
  assert.equal(page.recordsFiltered, 3);
});

test('a counted query and filter is not counted again on the next page', async () => {
  const api = fakeApi(3);
  const loader = new RecordListLoader({ apiClient: api, query: [{ t: '10' }] });
  await loader.load({ offset: 0, limit: 2 });
  const second = await loader.load({ offset: 2, limit: 2 });
  assert.equal(api.calls[1].body.total, false);
  assert.equal(second.recordsFiltered, 3);
  // a title filter is counted on its own; the unfiltered total stays
  const filtered = await loader.load({ offset: 0, limit: 2, filter: { f: 'abc' } });
  assert.equal(api.calls[2].body.total, undefined);
  assert.deepEqual(api.calls[2].body.filter, { f: 'abc' });
  assert.equal(filtered.recordsTotal, 3);
  // an empty search is no filter
  await loader.load({ offset: 0, limit: 2, filter: { f: '' } });
  assert.equal(api.calls[3].body.filter, undefined);
  // the search box of HRecordList sends the title (plan 24 review): it is a filter too
  await loader.load({ offset: 0, limit: 2, filter: { title: 'abc' } });
  assert.deepEqual(api.calls[4].body.filter, { title: 'abc' });
  await loader.load({ offset: 0, limit: 2, filter: { title: '' } });
  assert.equal(api.calls[5].body.filter, undefined);
  assert.equal(api.calls[3].body.total, false);
});

test('setQuery forgets the totals; no query gives an empty page without a request', async () => {
  const api = fakeApi(3);
  const loader = new RecordListLoader({ apiClient: api, query: [{ t: '10' }] });
  await loader.load({ limit: 2 });
  loader.setQuery([{ t: '11' }]);
  await loader.load({ limit: 2 });
  assert.equal(api.calls[1].body.total, undefined);
  loader.setQuery(null);
  const empty = await loader.load({ limit: 2 });
  assert.deepEqual(empty, { records: [], meta: {}, recordsTotal: 0, recordsFiltered: 0 });
  assert.equal(api.calls.length, 2);
});

test('a newer request aborts the one still running', async () => {
  const signals = [];
  const api = {
    post(path, { signal }) {
      signals.push(signal);
      return new Promise((resolve) => setTimeout(() => resolve({ records: [], pagination: { total: 0 } }), 5));
    }
  };
  const loader = new RecordListLoader({ apiClient: api, query: [{ t: '10' }] });
  const first = loader.load({ limit: 10 });
  const second = loader.load({ limit: 10 });
  await Promise.all([first, second]);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
});

test('HRecordList: top bar, single selection and double-click activation (plan 21)', async () => {
  const source = await readFile(new URL('../../src/widgets/record-list/HRecordList.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../../src/widgets/record-list/HRecordList.html', import.meta.url), 'utf8');
  // the top bar row comes before the toolbar and starts hidden
  assert.ok(html.indexOf('data-role="topbar"') < html.indexOf('data-role="toolbar"'));
  assert.match(html, /data-role="topbar" hidden/);
  assert.match(source, /setTopBarContent\(element\)/);
  assert.match(source, /selectionMode: options\.selectionMode === "single" \? "single" : "multi"/);
  // single selection: a click replaces the selection, "Select all on page" is hidden
  assert.match(source, /if \(this\._isSingleSelection\(\)\) \{\s*this\.selected = new Set\(\[id\]\);/);
  assert.match(source, /pageAction\.hidden = this\._isSingleSelection\(\)/);
  // double-click: onRecordActivate first, edit otherwise
  assert.match(source, /typeof this\.onRecordActivate === "function"\) \{\s*this\.onRecordActivate\(id\);\s*return;/);
});

test('record type domains: records by default, files for RT_REGISTERED_FILE, system with a type path', async () => {
  const { recordTypeDomain, recordDomain, recordTypesDomain } = await import('../../src/data/recordDomains.js');
  const consts = { RT_REGISTERED_FILE: 60, RT_USER_BOOKMARKS: 70 };
  const dbdefs = { dbconst: (code) => consts[code] || 0 };
  assert.deepEqual(recordTypeDomain(dbdefs, 10), { domain: 'records', type: null, path: '/records' });
  assert.deepEqual(recordTypeDomain(dbdefs, 60), { domain: 'files', type: null, path: '/files' });
  assert.deepEqual(recordTypeDomain(dbdefs, 70), { domain: 'system', type: 'bookmark', path: '/system/bookmark' });
  // a code the database does not have matches nothing
  assert.equal(recordDomain(dbdefs, 0), 'records');
  assert.equal(recordDomain(null, 60), 'records');
  // a list: one domain, unconstrained = records, mixed domains refused
  assert.equal(recordTypesDomain(dbdefs, [10, 11]).path, '/records');
  assert.equal(recordTypesDomain(dbdefs, []).path, '/records');
  assert.equal(recordTypesDomain(dbdefs, [60]).path, '/files');
  assert.throws(() => recordTypesDomain(dbdefs, [10, 60]), /different API domains/);
});

test('the loader searches on the path of its domain', async () => {
  const api = fakeApi(1);
  const loader = new RecordListLoader({ apiClient: api, query: [{ t: '60' }], path: '/files' });
  await loader.load({ limit: 10, filter: { f: 'photo' } });
  assert.equal(api.calls[0].path, '/files');
  assert.deepEqual(api.calls[0].body.filter, { f: 'photo' });
});
