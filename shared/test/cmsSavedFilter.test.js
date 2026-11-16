import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CMS_FILTER_LIMITS, cmsFilterHref, cmsFilterProblem, cmsFilterQuery, cmsFilterRequest, cmsFilterSettings,
  normalizeCmsFilterValues, parseCmsFilterQuery
} from '../src/site/cmsSavedFilter.js';
import { cmsMediaProblem } from '../src/site/cmsDocument.js';

// The cases are shared with the server (heurist tests/SavedFilterLinkTest.php, plan 27j)
const cases = JSON.parse(await readFile(path.resolve('shared/test/fixtures/saved-filter-links.json'), 'utf8'));

// a case with `filter`: a saved filter in place of a query source (plan 27l §7.2)
const sourceOf = (item) => (item.filter ? { filter: item.filter } : item.source);

test('Saved filter: the query string of the shared cases', () => {
  for (const item of cases.query) assert.equal(cmsFilterQuery(sourceOf(item), item.values), item.expect, JSON.stringify(item.values));
  for (const item of cases.href) assert.equal(cmsFilterHref(item.url, sourceOf(item), item.values), item.expect, item.url);
  for (const item of cases.problem) assert.equal(cmsFilterProblem(item.settings), item.expect, JSON.stringify(item.settings));
});

test('Saved filter: the limits of the values and of the query string', () => {
  assert.deepEqual(CMS_FILTER_LIMITS, { values: 8, length: 200, items: 10, query: 2000 });
  const long = 'x'.repeat(CMS_FILTER_LIMITS.length + 1);
  assert.deepEqual(normalizeCmsFilterValues({ A: long, B: 'b' }), { values: { B: 'b' }, dropped: true });
  assert.deepEqual(normalizeCmsFilterValues(null), { values: {}, dropped: false });
  // 8 values of 200 characters fit the 2000 characters of the query only when they are short when encoded
  const many = Object.fromEntries('ABCDEFGH'.split('').map((name) => [name, '%'.repeat(CMS_FILTER_LIMITS.length)]));
  assert.equal(cmsFilterQuery(3, many), '', 'longer than the query limit');
  assert.match(cmsFilterProblem({ source: 3, page: 7, values: many }), /longer than 2000/);
  assert.deepEqual(cmsFilterSettings({ source: '3', target: 7, values: { X: ' a ', Y: '' } }), { source: 3, page: 7, values: { X: 'a' } });
  assert.equal(cmsFilterSettings({ source: 3 }), null);
});

test('Saved filter: the page URL is read within the limits', () => {
  assert.equal(parseCmsFilterQuery('?lang=fre'), null);
  assert.deepEqual(parseCmsFilterQuery('?source=12&v.X1=Paris&v.T=a&v.T=b&lang=fre&v.bad%20name=x'),
    { kind: 'source', id: 12, source: 12, values: { X1: 'Paris', T: ['a', 'b'] } });
  // a saved filter (plan 27l §7.2)
  assert.deepEqual(parseCmsFilterQuery('?filter=34&v.X1=Paris'), { kind: 'filter', id: 34, filter: 34, values: { X1: 'Paris' } });
  assert.deepEqual(cmsFilterSettings({ filter: '34', target: 7, values: {} }), { filter: 34, page: 7, values: {} });
  // over the limits: ignored
  const many = Array.from({ length: 12 }, (_, index) => `v.P${index}=${index}`).join('&');
  assert.equal(Object.keys(parseCmsFilterQuery(`?source=1&${many}`).values).length, CMS_FILTER_LIMITS.values);
  const items = Array.from({ length: 15 }, (_, index) => `v.T=${index}`).join('&');
  assert.equal(parseCmsFilterQuery(`?source=1&${items}`).values.T.length, CMS_FILTER_LIMITS.items);
  assert.equal(parseCmsFilterQuery('?source=abc'), null);
});

test('Saved filter: the request fills the given values and lists the missing ones', () => {
  const querySource = {
    id: 12, title: 'People', source: { query: { t: '10', title: '$X1$', f: { 9: '$D1$' } } }, rules: [{ levels: 1 }],
    fields: [{ field: '1' }], map: { geoFields: [{ field: '28' }] }, timefields: [], filterForm: null
  };
  const request = cmsFilterRequest(querySource, { X1: 'Paris', Z: 'not a parameter' });
  assert.deepEqual(request.values, { X1: 'Paris' });
  assert.deepEqual(request.missing, ['D1']);
  assert.equal(JSON.stringify(request.dataSource.request.q).includes('$'), false, 'no parameter left in the query');
  assert.equal(JSON.stringify(request.dataSource.request.q).includes('Paris'), true);
  assert.deepEqual(request.raw.request.q, querySource.source.query, 'the source as it is for the filter form');
  assert.deepEqual(request.dataSource.reference, { type: 'source', id: 12 });
  assert.deepEqual(request.dataSource.request.rules, [{ levels: 1 }]);
  assert.deepEqual(request.dataSource.presentation.map.geoFields, ['28']);
  const plain = cmsFilterRequest({ ...querySource, source: { query: { t: '10' } } }, {});
  assert.deepEqual(plain.missing, []);
  assert.deepEqual(plain.dataSource.request.q, { t: '10' });
});

test('Saved filter: a media element with the action is checked (cmsMediaProblem)', () => {
  assert.equal(cmsMediaProblem({ file: 'abc', action: 'savedFilter', source: 3, page: 7, values: { X: 'a' } }), null);
  assert.equal(cmsMediaProblem({ file: 'abc', action: 'savedFilter', page: 7 }), 'a Saved filter needs a query source or a saved filter');
});

test('Saved filter: a map extent is kept as a WKT rectangle and shown again as an extent (review 2026-11-15)', async () => {
  const { cmsFilterFormValues, cmsFilterLinkValue } = await import('../src/site/cmsSavedFilter.js');
  const wkt = cmsFilterLinkValue({ west: 2.123456789, south: 48.123456789, east: 2.5234567, north: 48.9876543 });
  assert.match(wkt, /^POLYGON\(\(/);
  assert.ok(wkt.length <= CMS_FILTER_LIMITS.length, `short enough for a value: ${wkt.length}`);
  assert.equal(cmsFilterLinkValue('Paris'), 'Paris');
  const shown = cmsFilterFormValues({ G: wkt, X1: 'Paris' });
  assert.equal(shown.X1, 'Paris');
  assert.equal(typeof shown.G, 'object');
  assert.ok(Math.abs(shown.G.west - 2.12345) < 0.0001);
  // the WKT fills the geo parameter of the query as it is
  const request = cmsFilterRequest({ id: 1, source: { query: { t: '10', geo: '$G$' } } }, { G: wkt });
  assert.equal(request.dataSource.request.q.geo, wkt);
});

test('Saved filter phase B: values from the record are kept and left out of the query until filled in', async () => {
  const { cmsFilterReference } = await import('../src/site/cmsSavedFilter.js');
  assert.equal(cmsFilterReference({ record: 'id' }), 'id');
  assert.equal(cmsFilterReference({ field: '2-1' }), '2-1');
  assert.equal(cmsFilterReference({ field: 'x' }), null);
  assert.equal(cmsFilterReference('2-1'), null);
  assert.deepEqual(normalizeCmsFilterValues({ A: { record: 'id' }, B: { field: '15' }, C: 'c' }),
    { values: { A: { record: 'id' }, B: { field: '15' }, C: 'c' }, dropped: false });
  assert.equal(cmsFilterQuery(3, { A: { record: 'id' } }), 'source=3');
});
