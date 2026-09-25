import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacySavedFilterConverter } from '../src/legacy/LegacySavedFilterConverter.js';
import { convertLegacyRules } from '../src/legacy/legacyRules.js';
import { strictTextToJson } from '../src/legacy/legacyQuery.js';
import { SavedFilterManager } from '../src/core/SavedFilterManager.js';
import { resolveQueryParameters } from '../../../shared/src/data/queryParameters.js';

// Stored svs_Query values copied from the digital_harlem (DH), judaism_and_rome (JR)
// and libraries_readers (LR) exports.
const DH_104 = '?q=t:14 f:74:4339&rules=[{"query":"t:10 relatedfrom:14 ","codes":["14","109","","10","",4],"levels":[]}]';
const DH_86 = '?q=t:14 f:74:4389 [{"query":"t:12 links:14 ","codes":["14","",null,"12","",0],"levels":[]}]';
const DH_115 = '?q=[{"t":"12"},{"linkedfrom:16:90":[{"t":"16"},{"f:89":"4035"}]},{"linkedfrom:16:90":[{"t":"16"},{"f:10":"1914-12-31T23:59:59.999Z<>1931-01-01"}]}]&rules=[{"query":"t:12 links:16 ","codes":["16","","","12","",0],"levels":[{"query":"t:16 linked_to:12-90 ","codes":["12","90","","16","",1],"levels":[]}]}]';
const DH_44 = '?q=[{"t":"14"},{"related_to:109":[{"t":"10"},{"f:20":"415"}]}]';
const LR_8 = '?w=bookmark&q=[{"t":"10"},{"f:10":">=1800"},{"sortby":"f:10"}]&rules=[{"query":{"t":55,"lt:1106":[{"t":10}]},"levels":[]}]&rulesonly=1';
const DH_11 = '?q=shearn&w=all&rtfilters={"1":["12","13","10","15"]}&layout=srch:l-i-l|nav:|app:,Map';
const JR_25 = '{"ui_name":"demo","ui_notes":"","q":"[{\\"t\\":\\"123\\"},{\\"f:1126\\":\\"NULL\\"},{\\"sortby\\":\\"t\\"}]","w":"all","rules":"[{\\"query\\":{\\"t\\":128,\\"lf:1016\\":[{\\"t\\":123}]},\\"levels\\":[]}]","rulesonly":"2","viewmode":""}';
const DH_20 = '{"isadvanced":false,"rectype_as_facets":false,"fieldtypes":["enum"],"rectypes":["14"],"facets":[[{"title":"RecTitle","type":"freetext","query":"t:10 title","fieldid":"recTitle"}]],"domain":null}';
const DH_66 = {
  rectypes: ['14'],
  facets: [
    { var: 10382, code: '14:1', title: 'Title of event', help: '', isfacet: '0', type: 'freetext', order: 0 },
    { var: 95535, code: '14:74', title: 'Type of event', help: '', isfacet: '1', type: 'enum', order: 1 },
    { var: 87740, code: '14:10', title: 'Start date', help: '', isfacet: '1', groupby: null, type: 'date', order: 2 },
    { var: 16103, code: '14:75', title: 'Start (general time of day)', help: '', isfacet: '1', type: 'enum', order: 3 },
    { var: 87960, code: '14:rt100:15:77', title: 'Source type', help: '', isfacet: '1', type: 'enum', order: 4 }
  ],
  version: 2,
  domain: 'all',
  rules: '[{"query":"t:12 relatedfrom:14 ","codes":["14","99","","12","",4],"levels":[]},{"query":"t:10 relatedfrom:14 ","codes":["14","109","","10","",4],"levels":[{"query":"t:12 relatedfrom:10-4527 ","codes":["10","142","4527","12","",4],"levels":[]}]}]',
  sup_filter: '{"f:10":"1912-12-31T23:59:59.999Z<>1930-12-31T23:59:59.999Z"}',
  ui_title: '',
  search_on_reset: false
};

const VOCABULARIES = { 99: 5099, 100: 5100, 109: 5109, 142: 5142 };
const dbdefs = {
  vocabRoot: (id) => VOCABULARIES[id] ?? null,
  fieldName: (rty, dty) => ({ 1: 'Title of event', 74: 'Event type' })[dty] ?? null
};
const converter = new LegacySavedFilterConverter({ getDbDefs: async () => dbdefs });

test('detects the legacy storage kinds', () => {
  assert.equal(converter.detect(DH_104), 'url');
  assert.equal(converter.detect(JR_25), 'json');
  assert.equal(converter.detect(JSON.stringify(DH_66)), 'faceted');
  assert.equal(converter.detect(DH_20), 'faceted-v1');
  assert.equal(converter.detect('t:10 harris'), 'text');
  assert.equal(converter.detect(''), 'empty');
  assert.equal(converter.isParameterized(DH_66), true);
  assert.equal(converter.isParameterized(DH_104), false);
});

test('URL filter: text query kept, rule rebuilt from codes', async () => {
  const result = await converter.convert(DH_104);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.definition, {
    q: 't:14 f:74:4339',
    w: 'all',
    rules: [{ query: { t: 10, 'rf:109': [{ t: 14 }] }, levels: [] }],
    rulesonly: 0
  });
});

test('URL filter: JSON query, bookmark domain, canonical rules and rulesonly', async () => {
  const { definition } = await converter.convert(LR_8);
  assert.deepEqual(definition.q, [{ t: '10' }, { 'f:10': '>=1800' }, { sortby: 'f:10' }]);
  assert.equal(definition.w, 'bookmark');
  assert.equal(definition.rulesonly, 1);
  assert.deepEqual(definition.rules, [{ query: { t: 55, 'lt:1106': [{ t: 10 }] }, levels: [] }]);
});

test('URL filter: legacy two-part link keys become lt/lf with the field id', async () => {
  const { definition } = await converter.convert(DH_115);
  assert.deepEqual(definition.q[1], { 'lf:90': [{ t: '16' }, { 'f:89': '4035' }] });
  assert.deepEqual(definition.rules, [{
    query: { t: 12, links: [{ t: 16 }] },
    levels: [{ query: { t: 16, 'lt:90': [{ t: 12 }] }, levels: [] }]
  }]);
});

test('URL filter: relmarker key becomes a relation constrained by the vocabulary root', async () => {
  const { definition } = await converter.convert(DH_44);
  assert.deepEqual(definition.q, [{ t: '14' }, { rt: [{ t: '10' }, { r: 5109 }, { 'f:20': '415' }] }]);
});

test('URL filter: rules appended to q without &rules= are recovered', async () => {
  const { definition } = await converter.convert(DH_86);
  assert.equal(definition.q, 't:14 f:74:4389');
  assert.deepEqual(definition.rules, [{ query: { t: 12, links: [{ t: 14 }] }, levels: [] }]);
});

test('URL filter: unknown legacy UI parameters are ignored', async () => {
  const { definition } = await converter.convert(DH_11);
  assert.equal(definition.q, 'shearn');
});

test('JSON request filter: embedded JSON strings, string rulesonly and name', async () => {
  const { definition } = await converter.convert(JR_25);
  assert.deepEqual(definition.q, [{ t: '123' }, { 'f:1126': 'NULL' }, { sortby: 't' }]);
  assert.deepEqual(definition.rules, [{ query: { t: 128, 'lf:1016': [{ t: 123 }] }, levels: [] }]);
  assert.equal(definition.rulesonly, 2);
  assert.equal(definition.ui_name, 'demo');
});

test('faceted search becomes a parameterized query and filter form', async () => {
  const result = await converter.convert(JSON.stringify(DH_66));
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.definition.q, [
    { t: '14' },
    { 'f:1': '$X1$' },
    { 'f:74': '$X2$' },
    { 'f:10': '$X3$<>$X3_to$' },
    { 'f:75': '$X4$' },
    { related: [{ t: '15' }, { r: 5100 }, { 'f:77': '$X5$' }] },
    { 'f:10': '1912-12-31T23:59:59.999Z<>1930-12-31T23:59:59.999Z' },
    { sortby: 't' }
  ]);
  assert.deepEqual(result.definition.filterForm, {
    version: 1,
    settings: { skipEmptySearch: true },
    groups: [{ id: 'main', type: 'section', children: [
      { input: 'X1' },
      { input: 'X2', label: 'Type of event' },
      { input: 'X3', label: 'Start date', widget: { type: 'range', control: 'direct' } },
      { input: 'X4', label: 'Start (general time of day)' },
      { input: 'X5', label: 'Source type' }
    ] }]
  });
  assert.deepEqual(result.definition.rules[1], {
    query: { t: 10, 'rf:109': [{ t: 14 }] },
    levels: [{ query: { t: 12, 'rf:142': [{ t: 10 }, { r: 4527 }] }, levels: [] }]
  });
});

test('converted faceted query drops blank relation branches at run time', async () => {
  const { definition } = await converter.convert(DH_66);
  const { q } = resolveQueryParameters(definition.q, { X2: '4339' });
  assert.deepEqual(q, [
    { t: '14' },
    { 'f:74': '4339' },
    { 'f:10': '1912-12-31T23:59:59.999Z<>1930-12-31T23:59:59.999Z' },
    { sortby: 't' }
  ]);
});

test('faceted: linked paths share branches; lists, multiselect, help, spatial and search-everything', async () => {
  const { definition, warnings } = await converter.convert({
    rectypes: ['12'], version: 2, search_on_reset: true, domain: 'bookmark', ui_title: 'Places',
    ui_additional_filter: true, ui_additional_filter_label: 'Text search',
    ui_spatial_filter: false, ui_spatial_filter_init: true, ui_spatial_filter_initial: 'POLYGON((0 0,1 0,1 1,0 1,0 0))',
    sort_order: '-a',
    facets: [
      { var: 1, code: '12:lf90:16:89', title: 'Usage type', isfacet: '3', multisel: true, type: 'enum', help: 'Pick one or more' },
      { var: 2, code: '12:lf90:16:10', title: 'Start date', isfacet: '1', type: 'date', srange: 'between' },
      { var: 3, code: '12:lt73:11:1', title: 'Street name', isfacet: '2', type: 'freetext' },
      { var: 4, code: '12:lt238', title: 'Place', isfacet: '1', type: 'resource' }
    ]
  });
  assert.deepEqual(warnings, []);
  assert.deepEqual(definition.q, [
    { t: '12' },
    { 'lf:90': [{ t: '16' }, { 'f:89': '$X1$' }, { 'f:10': '$X2$><$X2_to$' }] },
    { 'lt:73': [{ t: '11' }, { 'f:1': '$X3$' }] },
    { 'lt:238': [{ title: '$X4$' }] },
    { f: '$SEARCH$' },
    { geo: 'POLYGON((0 0,1 0,1 1,0 1,0 0))' },
    { sortby: '-a' }
  ]);
  assert.equal(definition.w, 'bookmark');
  assert.equal(definition.title, 'Places');
  assert.equal(definition.filterForm.settings, undefined);
  assert.deepEqual(definition.filterForm.groups[0].children[0],
    { input: 'X1', label: 'Usage type', help: 'Pick one or more', mode: 'checkbox', multiple: true });
  assert.deepEqual(definition.filterForm.groups[0].children.at(-1), { input: 'SEARCH', label: 'Text search' });
});

test('faceted: record-type facets are skipped with a warning', async () => {
  const result = await converter.convert({
    rectypes: ['121', '122'], version: 2,
    facets: [
      { var: '5', code: '121,122:typename', title: 'Type', isfacet: '3' },
      { var: '6', code: '121,122:1', title: 'Title', isfacet: '0', type: 'freetext' }
    ]
  });
  assert.equal(result.status, 'warning');
  assert.match(result.warnings[0], /Type.*not supported/);
  assert.deepEqual(result.definition.q, [{ t: '121,122' }, { 'f:1': '$X1$' }, { sortby: 't' }]);
});

test('faceted: text preliminary filter is merged, its sortby used when there is no sort_order', async () => {
  const { definition, warnings } = await converter.convert({
    rectypes: ['7'], version: 2, facets: [], sup_filter: 't:7 sortby:-m', ui_temporal_filter_initial: 'after:"1 week ago"'
  });
  assert.deepEqual(warnings, []);
  assert.deepEqual(definition.q, [{ t: '7' }, { after: '1 week ago' }, { t: '7' }, { sortby: '-m' }]);
});

test('faceted: unconvertible preliminary filter is reported with the old query', async () => {
  const result = await converter.convert({
    rectypes: ['16'], version: 2, facets: [], sup_filter: 't:16 f:89:3999 OR f:89:4036'
  });
  assert.equal(result.status, 'warning');
  assert.match(result.warnings[0], /convert it manually: t:16 f:89:3999 OR f:89:4036/);
  assert.deepEqual(result.definition.q, [{ t: '16' }, { sortby: 't' }]);
});

test('faceted: preliminary filter toggled off initially is not applied', async () => {
  const { definition } = await converter.convert({
    rectypes: ['16'], version: 2, facets: [], sup_filter: '{"t":"16"}',
    ui_prelim_filter_toggle: true, ui_prelim_filter_toggle_init: false, ui_prelim_filter_toggle_mode: 0
  });
  assert.deepEqual(definition.q, [{ t: '16' }, { sortby: 't' }]);
});

test('faceted: nested any/all preliminary filter keeps its grouping', async () => {
  const { definition } = await converter.convert({
    rectypes: ['14'], version: 2, facets: [],
    sup_filter: '{"any":[{"f:10":"1934<>1936"}, {"all":[{"f:10":"<1935"},{"f:11":">1935"}]}]}'
  });
  assert.deepEqual(definition.q[1], { any: [{ 'f:10': '1934<>1936' }, { all: [{ 'f:10': '<1935' }, { 'f:11': '>1935' }] }] });
});

test('faceted v1 is reported as legacy, cannot open', async () => {
  const result = await converter.convert(DH_20);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.definition, null);
  assert.match(result.warnings[0], /cannot open/);
});

test('missing relmarker vocabulary drops the constraint with a warning', async () => {
  const plain = new LegacySavedFilterConverter();
  const result = await plain.convert(DH_44);
  assert.equal(result.status, 'warning');
  assert.deepEqual(result.definition.q[1], { rt: [{ t: '10' }, { 'f:20': '415' }] });
});

test('strict text conversion refuses OR, bare words and link keys', () => {
  assert.deepEqual(strictTextToJson('t:7 sortby:-m'), [{ t: '7' }, { sortby: '-m' }]);
  assert.equal(strictTextToJson('t:14 f:74:4806 OR f:74:4784'), null);
  assert.equal(strictTextToJson('harris'), null);
  assert.equal(strictTextToJson('t:12 relatedfrom:14'), null);
});

test('rule conversion keeps JSON rules, reads bare text rules and drops garbage with a warning', () => {
  const warnings = [];
  assert.deepEqual(convertLegacyRules([{ query: 't:12 linkedfrom:16-90 ' }], warnings),
    [{ query: { t: 12, 'lf:90': [{ t: 16 }] }, levels: [] }]);
  assert.deepEqual(convertLegacyRules('not json', warnings), []);
  assert.equal(warnings.length, 1);
});

test('SavedFilterManager uses the legacy converter for classification and resolution', async () => {
  const records = {
    66: { rec_ID: 66, rec_Title: 'Events', details: { query: [{ value: JSON.stringify(DH_66) }] } },
    20: { rec_ID: 20, rec_Title: 'Relation test', details: { query: [{ value: DH_20 }] } },
    86: { rec_ID: 86, rec_Title: 'Fashion Shows', details: { query: [{ value: DH_86 }] } }
  };
  const apiClient = {
    async get(path) {
      if (path === '/sys') return Object.values(records);
      return records[Number(path.split('/').at(-1))];
    }
  };
  const manager = new SavedFilterManager({ apiClient, legacyConverter: converter });
  await manager.load();
  assert.equal(manager.list({ type: 'parametrized' }).map((item) => item.id).join(), '66');

  const faceted = await manager.resolveDataSource(66);
  assert.equal(faceted.request.q[2]['f:74'], '$X2$');
  assert.equal(faceted.presentation.filterForm.groups[0].children.length, 5);
  assert.equal(faceted.meta.warnings, undefined);

  const url = await manager.resolveDataSource(86);
  assert.equal(url.request.q, 't:14 f:74:4389');

  await assert.rejects(manager.resolveDataSource(20), (error) => {
    assert.match(error.message, /Relation test: .*cannot open/);
    assert.equal(error.legacyQuery, DH_20);
    return true;
  });
});

test('faceted: shown spatial filter becomes a GEO field; the initial area is its default', async () => {
  const area = 'POLYGON((0 0,1 0,1 1,0 1,0 0))';
  const shown = await converter.convert({
    rectypes: ['12'], version: 2, facets: [],
    ui_spatial_filter: true, ui_spatial_filter_label: 'Map area',
    ui_spatial_filter_init: true, ui_spatial_filter_initial: { geo: area }
  });
  assert.deepEqual(shown.definition.q, [{ t: '12' }, { geo: '$GEO$' }, { sortby: 't' }]);
  assert.deepEqual(shown.definition.filterForm.groups[0].children,
    [{ input: 'GEO', label: 'Map area', default: area }]);

  // not applied at start: the initial area only seeded the legacy map digitizer
  const notApplied = await converter.convert({
    rectypes: ['12'], version: 2, facets: [], ui_spatial_filter: true, ui_spatial_filter_initial: area
  });
  assert.deepEqual(notApplied.definition.filterForm.groups[0].children, [{ input: 'GEO' }]);
  const hidden = await converter.convert({
    rectypes: ['12'], version: 2, facets: [], ui_spatial_filter: false, ui_spatial_filter_initial: area
  });
  assert.deepEqual(hidden.definition.q, [{ t: '12' }, { sortby: 't' }]);
});
