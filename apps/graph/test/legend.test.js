import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphApplication } from '../src/core/GraphApplication.js';
import { GraphDocument } from '../src/core/GraphDocument.js';
import { VocabularyProvider } from '../src/data/VocabularyProvider.js';
import { GraphLegend, relationForest } from '../src/ui/GraphLegend.js';

function fixture() {
  const records = [1, 2, 3].map(id => ({ id, recordTypeId: id === 3 ? 48 : 10 }));
  const graph = new GraphDocument({ records, edges: [
    { id: 'a', from: 1, to: 2, field: 6, relationship: 101, link: 'l1' },
    { id: 'b', from: 2, to: 1, field: 6, relationship: 102, link: 'l1' },
    { id: 'c', from: 1, to: 3, field: 240, link: 'l2' },
    { id: 'd', from: 1, to: 2, field: 6, relationship: 101, link: 'l3' },
  ], links: { l1: '10:rt100:10', l2: '10:lt240:48' }, limits: { truncated: true } });
  const requests = [];
  const engine = { setGraph: async value => { engine.graph = value; }, setSelection: async () => {} };
  const app = new GraphApplication({ config: { query: 't:10', rules: [], links: 'all' }, engine,
    provider: { load: async request => { requests.push(request); return { graph, total: 500000 }; } },
    datasetProvider: { load: async () => ({ title: 'Family', source: { query: 't:10' }, links: ['10:rt100:10'], rules: [{ name: 'Parents', description: 'Find parents' }] }) } });
  app.graph = graph;
  app.response = { total: 500000 };
  app.recordTypeNames = new Map([[10, 'Persons'], [48, 'Events']]);
  app.edgeLabels = { fields: new Map([[240, 'Life Event']]), relationTypes: new Map([[100, 'Ancestry']]) };
  return { app, engine, requests };
}

test('legend uses loaded counts, total query size, vocabulary and endpoint types', () => {
  const { app } = fixture();
  const legend = app.getLegend();
  assert.equal(legend.total, 500000);
  assert.equal(legend.recordTypes[0].label, 'Persons');
  assert.equal(legend.recordTypes[0].count, 2);
  assert.equal(legend.links[0].label, 'Ancestry');
  assert.deepEqual(legend.links[1].endpoints, ['Persons → Events']);
  assert.deepEqual(legend.links[0].relationships.map(row => row.count), [1, 1]);
});

test('subtree visibility is scoped to a link and combines with node visibility', async () => {
  const { app, engine } = fixture();
  let events = 0;
  app.addEventListener('heurist-graph-visibility-changed', () => events++);
  await app.setRelationshipVisibility('link:l1', [100, 101], false);
  assert.deepEqual(engine.graph.edges.map(e => e.id), ['b', 'c', 'd']);
  await app.setRecordTypeVisibility(48, false);
  assert.deepEqual(engine.graph.edges.map(e => e.id), ['b', 'd']);
  assert.equal(app.getLegend().links[0].count, 2);
  await app.setRelationshipVisibility('link:l1', [100, 101], true);
  assert.deepEqual(engine.graph.edges.map(e => e.id), ['a', 'b', 'd']);
  assert.equal(events, 3);
});

test('dataset links and rule hints follow the active source and current results restore correctly', async () => {
  const { app, requests } = fixture();
  await app.setDataset(12);
  assert.deepEqual(requests.at(-1).links, ['10:rt100:10']);
  assert.equal(app.getLegend().rules[0].description, 'Find parents');
  await app.activateCurrentResults();
  assert.equal(requests.at(-1).links, 'all');
  assert.deepEqual(app.getLegend().rules, []);
  await app.load({ query: 't:48' });
  assert.equal(requests.at(-1).query, 't:48');
});

test('relation forest nests observed descendants once and prunes unused branches', () => {
  const mother = { id: 101, label: 'Mother', children: [] };
  const father = { id: 102, label: 'Father', children: [] };
  const parent = { id: 100, label: 'Parent', children: [mother, father] };
  const roots = relationForest({ relationships: [{ id: 101 }] }, { 100: parent, 101: mother });
  assert.equal(roots.length, 1);
  assert.equal(roots[0].id, 100);
  assert.deepEqual(roots[0].children.map(row => row.id), [101]);
});

test('record type names are cached and node-only graphs resolve their legend', async () => {
  const requests = [];
  const provider = new VocabularyProvider({ apiClient: { get: async (path, options) => {
    requests.push([path, options.query]); return { items: [{ rty_ID: 10, rty_Name: 'Person', rty_Plural: 'Persons' }] };
  } } });
  assert.equal((await provider.getRecordTypeNames([10, 10])).get(10), 'Persons');
  await provider.getRecordTypeNames([10]);
  assert.equal(requests.length, 1);
  const { app } = fixture();
  app.vocabularyProvider = provider;
  app.provider.load = async () => ({ total: 1, graph: new GraphDocument({ records: [{ id: 1, recordTypeId: 10 }] }) });
  await app.load();
  assert.equal(app.getLegend().recordTypes[0].label, 'Persons');
});

 test('relationship groups share one vocabulary tree with each edge type once', () => {
   const groups = [
     { relationships: [{ id: 101, count: 2 }] },
     { relationships: [{ id: 102, count: 1 }] },
     { relationships: [{ id: 101, count: 3 }] },
   ];
   const forest = relationForest({ relationships: groups.flatMap(group => group.relationships) }, {
     100: { id: 100, label: 'Family', children: [
       { id: 101, label: 'Mother', children: [] },
       { id: 102, label: 'Father', children: [] },
     ] },
   });
   assert.equal(forest.length, 1);
   assert.deepEqual(forest[0].children.map(node => node.id), [101, 102]);
 });

 test('shared hierarchy sums counts and toggles matching terms in every link group', async () => {
   const calls = [];
   const legend = new GraphLegend({ api: {
     setRelationshipVisibility: async (...args) => calls.push(args),
   } });
   legend.checkbox = (label, count, checked, mixed, key, handler) => ({
     label, count, checked, mixed, key, handler, querySelector: () => ({}),
   });
   legend.branch = (key, row, children) => ({ key, row, children });
   const groups = [
     { key: 'a', visible: true, relationships: [{ id: 101, count: 2, visible: true }] },
     { key: 'b', visible: true, relationships: [{ id: 101, count: 3, visible: false }, { id: 102, count: 1, visible: true }] },
   ];
   const result = legend.term(groups, { id: 100, label: 'Family', children: [
     { id: 101, label: 'Mother', children: [] }, { id: 102, label: 'Father', children: [] },
   ] });
   assert.equal(result.row.count, 6);
   assert.equal(result.row.mixed, true);
   assert.equal(result.children[0].count, 5);
   await result.children[0].handler(false);
   assert.deepEqual(calls, [['a', [101], false], ['b', [101], false]]);
 });
