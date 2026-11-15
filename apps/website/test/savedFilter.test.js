/**
 * Saved filter (plan 27j): the designer helper (target pages, checks, values of the Filter Form), the field link of a
 * Record field, and the site runtime (the page URL, the start state of each module).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { filterPageTerms, formFilterValues, savedFilterIssue, savedFilterSummary, storedSavedFilter } = await import('../src/designer/savedFilterField.js');
const { filterInstanceState, pageFilterRequest } = await import('../src/siteRuntime.js');
const { CmsRecordDocument } = await import('#shared/site/cmsEdit.js');

test('Saved filter designer: target pages are the pages with a record module, not record pages', () => {
  const site = {
    id: 10, modules: [], pages: [
      { id: 11, title: 'Map', modules: ['map'], children: [{ id: 12, title: 'Search', modules: ['explorer'], children: [] }] },
      { id: 13, title: 'About', modules: [], children: [] },
      { id: 14, title: 'Person', record: true, modules: ['data'], children: [] },
      { id: 15, title: 'Card', modules: ['recordview'], children: [] }
    ]
  };
  assert.deepEqual(filterPageTerms(site).map((term) => [term.id, term.explorer]), [[11, false], [12, true]]);
  // a summary without modules (an older server): every page, Explorer not known
  assert.deepEqual(filterPageTerms({ id: 10, pages: [{ id: 11, title: 'A' }] }).map((term) => [term.id, term.explorer]), [[10, null], [11, null]]);
  assert.deepEqual(filterPageTerms(null), []);
});

test('Saved filter designer: checks, values of the Filter Form, summary', () => {
  const ok = { source: 3, page: 7, values: { X1: 'a' } };
  assert.equal(savedFilterIssue(ok, { parameters: ['X1', 'X2'], explorer: false }), null, 'a value missing: left out');
  assert.match(savedFilterIssue({ source: 3, page: 7, values: {} }, { parameters: ['X1'], explorer: false }), /at least one value/);
  assert.equal(savedFilterIssue({ source: 3, page: 7, values: {} }, { parameters: ['X1'], explorer: true }), null, 'Explorer asks for it');
  assert.equal(savedFilterIssue({ source: 3, page: 7, values: {} }, { parameters: [], explorer: false }), null, 'no parameters');
  assert.match(savedFilterIssue({ page: 7 }), /query source/);
  assert.match(savedFilterIssue({ source: 3 }), /target page/);
  assert.deepEqual(formFilterValues({ X1: 'a', D1: 1900, T: [4, '5'], E: '', N: null, L: [] }), { X1: 'a', D1: '1900', T: ['4', '5'] });
  assert.equal(formFilterValues({ G: { north: 1 } }), null, 'an extent can not be kept in a link');
  assert.equal(savedFilterSummary(ok, { sources: [{ id: 3, title: 'People' }], pages: [{ id: 7, label: '  Map' }] }), 'People → Map · 1 value');
  assert.deepEqual(storedSavedFilter({ action: 'savedFilter', source: 3, target: 7, values: { X1: 'a' } }), ok);
  assert.equal(storedSavedFilter({ action: 'page', page: 7 }), null);
});

test('Saved filter: a Record field link keeps its values (data-h-link-values)', () => {
  const doc = new CmsRecordDocument({ parts: { content: '<div data-h-node="f" data-h-field="12.2-1" data-h-text></div>' } });
  assert.equal(doc.setFieldLink('f', 'filter:7:3', { X1: 'Paris', bad: { a: 1 } }), true);
  assert.equal(doc.fieldLink('f'), 'filter:7:3');
  assert.deepEqual(doc.fieldLinkValues('f'), { X1: 'Paris' });
  doc.setFieldLink('f', 'url', { X1: 'Paris' });
  assert.equal(doc.fieldLinkValues('f'), null, 'values only with a Saved filter');
  doc.setFieldLink('f', 'filter:x:3');
  assert.equal(doc.fieldLink('f'), null, 'not a valid link');
});

test('Saved filter site runtime: the page URL loads the query source once and fills the values', async () => {
  const calls = [];
  const load = async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ querySource: { id: 3, title: 'People', source: { query: { t: '10', title: '$X1$', f: { 9: '$D1$' } } } } }) };
  };
  const runtime = { apiBaseUrl: 'http://h/api', database: 'db' };
  const search = '?source=3&v.X1=Paris';
  assert.equal(await pageFilterRequest(runtime, '?lang=fre', load), null);
  const [first, second] = await Promise.all([pageFilterRequest(runtime, search, load), pageFilterRequest(runtime, search, load)]);
  assert.equal(first, second);
  assert.deepEqual(calls, ['http://h/api/db/records/querysource/3'], 'one load for all modules of the page');
  assert.deepEqual(first.missing, ['D1']);
  assert.equal(JSON.stringify(first.dataSource.request.q).includes('Paris'), true);
  // a source the visitor can not read: nothing
  const refused = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await pageFilterRequest(runtime, '?source=4', refused), null);
  } finally {
    console.warn = warn;
  }
});

test('Saved filter site runtime: the start state of each module', () => {
  const request = {
    dataSource: { reference: { type: 'source', id: 3 }, title: 'People', request: { q: { t: '10' }, rules: [{ levels: 1 }] },
      presentation: { data: { fields: [{ field: '1' }] } } },
    raw: {}, values: {}, missing: []
  };
  const stored = { activeDocumentId: 55, selection: [1] };
  assert.deepEqual(filterInstanceState('explorer', stored, request), { ...stored, pageRequest: request });
  assert.deepEqual(filterInstanceState('map', stored, request), { activeDocumentId: 'dynamic', selection: [1], query: { t: '10' } });
  const data = filterInstanceState('data', { querySourceId: 9 }, request);
  assert.equal(data.querySourceId, null);
  assert.deepEqual(data.query, { t: '10' });
  assert.deepEqual(data.fields, [{ field: '1' }]);
  assert.deepEqual(filterInstanceState('graph', null, request).expansions, { rules: [{ levels: 1 }] });
  const timeline = filterInstanceState('timeline', { moduleState: { x: 1 }, contexts: [{}] }, request);
  assert.equal('moduleState' in timeline || 'contexts' in timeline, false);
  assert.equal(timeline.currentDataSource, request.dataSource);
  assert.deepEqual(filterInstanceState('recordview', stored, request), stored);
});

test('Saved filter designer: the button stays beside the summary field after the summary is written (review 2026-11-15)', async () => {
  const { HEditForm } = await import('#shared/widgets/edit-form/HEditForm.js');
  const { savedFilterField, attachSavedFilter } = await import('../src/designer/savedFilterField.js');
  const host = document.createElement('div');
  const edit = new HEditForm().attach(host, {
    form: { groups: [{ id: 'main', children: [{ name: 'action', type: 'freetext', max: 1 }, savedFilterField({ action: 'savedFilter' })] }] },
    values: { action: 'savedFilter', savedFilter: '' }
  }).render();
  const holder = { value: { source: 3, page: 7, values: { X1: 'a' } } };
  attachSavedFilter(edit, { querySources: async () => [{ id: 3, title: 'People' }], filterPages: () => [{ id: 7, label: 'Map' }] }, holder);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(edit.getValues().savedFilter, 'People → Map · 1 value');
  assert.ok(edit.getFieldWidget('savedFilter').container.querySelector('.h-cms-saved-filter-edit'), 'the button is there');
});

test('Saved filter phase B: fields of record types as values from the record, record types of a query', async () => {
  const { queryRecordTypes, recordFilterFieldTerms, recordTypesOf } = await import('../src/designer/savedFilterField.js');
  const fields = {
    10: [{ id: 1, name: 'Name', type: 'freetext' }, { id: 38, name: 'Image', type: 'file' }, { id: 9, name: 'Date', type: 'date' }],
    12: [{ id: 1, name: 'Name', type: 'freetext' }, { id: 4, name: 'Text', type: 'blocktext' }, { id: 75, name: 'Author', type: 'resource' }]
  };
  const dbdefs = {
    rectypes: () => [{ id: 10 }, { id: 12 }],
    fields: (type) => fields[type] || [],
    fieldGlobal: (id) => ({ concept: `2-${id}` })
  };
  assert.deepEqual(recordFilterFieldTerms(dbdefs, [10]), [{ id: '2-9', label: 'Date' }, { id: '2-1', label: 'Name' }]);
  assert.deepEqual(recordFilterFieldTerms(dbdefs).map((term) => term.id), ['2-75', '2-9', '2-1'], 'every record type, no file / blocktext');
  assert.deepEqual(queryRecordTypes([{ t: '10,12' }, { 'f:1': 'x' }]), [10, 12]);
  assert.deepEqual(queryRecordTypes({ t: 5 }), [5]);
  assert.deepEqual(queryRecordTypes(null), []);
  const apiClient = { get: async (path, { query }) => ({ records: query.ids.split(',').map((id) => ({ rec_ID: id, rec_RecTypeID: Number(id) > 100 ? 12 : 10 })) }) };
  assert.deepEqual(await recordTypesOf(apiClient, [5, 200, 6]), [10, 12]);
  assert.deepEqual(await recordTypesOf(apiClient, []), []);
});

test('Saved filter phase C: the URL without the filter, the records for each mounted module', async () => {
  const { applyFilterToModule, applyPageFilter, attachSamePageFilters, hasPageFilter, splitFilterUrl } = await import('../src/siteRuntime.js');
  assert.deepEqual(splitFilterUrl('https://h/db/site/5/7?lang=fre&source=3&v.X1=a&v.T=1&v.T=2#top'),
    { page: 'https://h/db/site/5/7?lang=fre', search: '?source=3&v.X1=a&v.T=1&v.T=2' });
  assert.deepEqual(splitFilterUrl('https://h/db/site/5/7'), { page: 'https://h/db/site/5/7', search: '' });
  assert.equal(hasPageFilter('https://h/x?source=3'), true);
  assert.equal(hasPageFilter('https://h/x?lang=fre'), false);
  const request = { dataSource: { title: 'People', request: { q: { t: '10' } } }, raw: {}, values: {}, missing: [] };
  const calls = [];
  await applyFilterToModule('explorer', { applyPageRequest: (value) => calls.push(['explorer', value === request]) }, request);
  await applyFilterToModule('data', { setDataSource: (ds, options) => calls.push(['data', options.reload]) }, request);
  await applyFilterToModule('graph', { setDataSource: () => calls.push(['graph']) }, request);
  await applyFilterToModule('map', { getDynamicDocument: () => ({ id: 'dyn' }), activateMapDocument: (id) => calls.push(['map doc', id]),
    setDynamicDataSources: (value) => calls.push(['map', value.currentDataSource === request.dataSource]) }, request);
  await applyFilterToModule('timeline', { setQuery: (q, options) => calls.push(['timeline', q.t, options.reload]) }, request);
  assert.deepEqual(calls, [['explorer', true], ['data', true], ['graph'], ['map doc', 'dyn'], ['map', true], ['timeline', '10', true]]);

  // reload mode: a filter link to this page applies the records without a reload
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: 4, title: 'P', source: { query: { t: '12', title: '$X$' } } }) });
  try {
    const given = [];
    const mounted = new Map([['m1', { setDataSource: (ds) => given.push(ds.request.q) }], ['w1', { destroy() {} }]]);
    const config = { runtime: { apiBaseUrl: 'https://h/api', database: 'db' }, instances: { m1: { kind: 'module', type: 'data' }, w1: { kind: 'widget', type: 'menu' } } };
    assert.equal(await applyPageFilter(mounted, config, '?source=4&v.X=Zed'), true);
    assert.deepEqual(given, [{ t: '12', title: 'Zed' }]);
    assert.equal(await applyPageFilter(mounted, config, '?lang=fre'), false);

    const listeners = {};
    const root = { addEventListener: (type, handler) => { listeners[type] = handler; }, removeEventListener() {} };
    const pushed = [];
    const win = { location: { href: 'https://h/db/site/5/7', reload() {} }, history: { pushState: (state, title, url) => pushed.push(url) },
      addEventListener() {}, removeEventListener() {} };
    attachSamePageFilters({ root, config, mounted, win });
    const link = (href) => ({ getAttribute: (name) => (name === 'href' ? href : null) });
    const event = (href) => ({ button: 0, target: { closest: () => link(href) }, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
    const same = event('https://h/db/site/5/7?source=4&v.X=Amy');
    listeners.click(same);
    assert.equal(same.defaultPrevented, true);
    assert.deepEqual(pushed, ['https://h/db/site/5/7?source=4&v.X=Amy']);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(given.at(-1), { t: '12', title: 'Amy' });
    const other = event('https://h/db/site/5/8?source=4&v.X=Amy');
    listeners.click(other);
    assert.equal(other.defaultPrevented, false, 'another page: loaded as usual');
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
