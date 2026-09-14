import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphApplication } from '../src/core/GraphApplication.js';
import { GraphDocument } from '../src/core/GraphDocument.js';

const rule = (field, levels = []) => ({ query: { t:10, [`lf:${field}`]:[{ t:10 }] }, levels });
const edge = (from, to, fieldId = 1) => ({ from, to, fieldId });
const graph = (ids, edges = []) => new GraphDocument({ records:ids.map(id => ({ id, recordTypeId:10 })), edges });
async function fixture(rules, steps, base = graph([1,2], [edge(1,2)])) {
  const calls = [];
  const engine = { setGraph:async g => { engine.graph = g; }, setSelection:async () => {} };
  const app = new GraphApplication({ config:{ query:'t:10', rules, limits:{} }, engine,
    provider:{ load:async request => {
      if (!request.rule) return { graph:base, total:2 };
      calls.push(request);
      const field = Object.keys(request.rule.query).find(k => k.startsWith('lf:')).slice(3);
      const response = await steps(field, request.query.ids);
      return { graph:graph([...new Set([...request.query.ids, ...response.ids])], response.edges), expansion:{ targetIds:response.ids } };
    } } });
  await app.load();
  return { app, calls, engine, enable:async i => app.setRuleEnabled(app.getLegend().rules[i].id, true) };
}

test('base, two rules, and shared physical edges retain independent ownership', async () => {
  const { app, enable, calls } = await fixture([rule(1),rule(2)], async field => field==='1'
    ? { ids:[2,3], edges:[edge(1,2),edge(2,3)] } : { ids:[3,4], edges:[edge(2,3),edge(3,4,2)] });
  await enable(0); await enable(1);
  assert.deepEqual(app.graph.recordIds, [1,2,3,4]);
  assert.equal(app.graph.edges.length, 3);
  const [a,b] = app.getLegend().rules;
  await app.setRuleEnabled(a.id, false);
  assert.deepEqual(app.graph.recordIds, [1,2,3,4]);
  assert.equal(app.graph.edges.length, 3);
  await app.setRuleEnabled(b.id, false);
  assert.deepEqual(app.graph.recordIds, [1,2]);
  assert.equal(app.graph.edges.length, 1);
  await enable(0);
  assert.equal(calls.length, 2, 're-enabling uses cache');
  assert.equal(app.config.query, 't:10', 'expansion never replaces the base query');
});

test('forks use parent targets; prune drops descendants while overlap with base survives', async () => {
  const { app, enable, calls } = await fixture([rule(1, [rule(2),rule(3)])], async (field, seeds) => {
    if(field==='1') return { ids:[3], edges:[edge(1,3)] };
    assert.deepEqual(seeds, [3]);
    return field==='2' ? { ids:[2,4], edges:[edge(3,2,2),edge(3,4,2)] } : { ids:[4,5], edges:[edge(3,4,3),edge(3,5,3)] };
  });
  await enable(0);
  assert.deepEqual(app.graph.recordIds, [1,2,3,4,5]);
  await app.pruneExpansion();
  assert.deepEqual(app.graph.recordIds, [1,2,3]);
  await app.pruneExpansion();
  assert.deepEqual(app.graph.recordIds, [1,2]);
  await app.advanceExpansion(); await app.advanceExpansion();
  assert.equal(calls.length, 3);
});

test('same node at multiple depths and cycles do not acquire permanent ownership', async () => {
  const { app, enable } = await fixture([rule(1, [rule(2)])], async field => field==='1'
    ? { ids:[3], edges:[edge(1,3)] } : { ids:[1,3,4], edges:[edge(3,1,2),edge(3,4,2)] });
  await enable(0); await app.setExpansionDepth(1);
  assert.deepEqual(app.graph.recordIds, [1,2,3]);
  await app.setRuleEnabled(app.getLegend().rules[0].id, false);
  assert.deepEqual(app.graph.recordIds, [1,2]);
});

test('editing preserves unchanged cached rules and invalidates changed definitions', async () => {
  const { app, enable, calls } = await fixture([rule(1),rule(2)], async field => ({ ids:[Number(field)+2], edges:[edge(1,Number(field)+2)] }));
  await enable(0); await enable(1);
  const oldId = app.getLegend().rules[1].id;
  await app.setExpansionRules([{ ...rule(2), name:'Renamed' },rule(3)]);
  assert.equal(app.getLegend().rules[0].id, oldId);
  assert.equal(app.getLegend().rules[0].enabled, true);
  assert.deepEqual(app.graph.recordIds, [1,2,4]);
  await enable(1);
  assert.equal(calls.length, 3);
});

test('failed execution rolls back activation and can be retried', async () => {
  let fail = true;
  const { app, enable } = await fixture([rule(1)], async () => {
    if(fail) throw new Error('network failure');
    return { ids:[3], edges:[edge(1,3)] };
  });
  await assert.rejects(enable(0), /network failure/);
  assert.equal(app.getLegend().rules[0].enabled, false);
  assert.deepEqual(app.graph.recordIds, [1,2]);
  fail = false; await enable(0);
  assert.deepEqual(app.graph.recordIds, [1,2,3]);
});

test('late response cannot resurrect an unchecked rule or a replaced graph', async () => {
  let finish;
  const { app, enable } = await fixture([rule(1)], () => new Promise(resolve => { finish = resolve; }));
  const pending = enable(0);
  await new Promise(resolve => setImmediate(resolve));
  await app.setRuleEnabled(app.getLegend().rules[0].id, false);
  finish({ ids:[3], edges:[edge(1,3)] }); await pending;
  assert.deepEqual(app.graph.recordIds, [1,2]);
  const next = enable(0); await new Promise(resolve => setImmediate(resolve));
  await app.load({ query:'t:48' });
  finish({ ids:[4], edges:[edge(1,4)] }); await next;
  assert.deepEqual(app.graph.recordIds, [1,2]);
});

test('selected-node descendants suspend when their seed loses its last source', async () => {
  const { app, enable } = await fixture([rule(1),rule(2)], async (field, seeds) => field==='1'
    ? { ids:seeds.includes(1) ? [3] : [], edges:seeds.includes(1) ? [edge(1,3)] : [] }
    : { ids:seeds.includes(3) ? [4] : [], edges:seeds.includes(3) ? [edge(3,4,2)] : [] });
  await enable(0); await enable(1); await app.expandNode(3);
  assert.deepEqual(app.graph.recordIds, [1,2,3,4]);
  await app.setRuleEnabled(app.getLegend().rules[0].id, false);
  assert.deepEqual(app.graph.recordIds, [1,2]);
  await enable(0);
  assert.deepEqual(app.graph.recordIds, [1,2,3,4]);
});

test('source overrides stay local to their Dataset and Current Results', async () => {
  const { app } = await fixture([], async () => ({ ids:[], edges:[] }));
  app.datasetProvider = { load:async id => ({ title:`Dataset ${id}`, source:{query:'t:10'}, rules:[rule(id)] }) };
  await app.setExpansionRules([rule(7)]);
  await app.setDataset(12); await app.setExpansionRules([rule(8)]);
  await app.setDataset(13);
  assert.deepEqual(app.getExpansionRules(), [rule(13)]);
  await app.setDataset(12);
  assert.deepEqual(app.getExpansionRules(), [rule(8)]);
  await app.resetExpansionRules();
  assert.deepEqual(app.getExpansionRules(), [rule(12)]);
  await app.activateCurrentResults();
  assert.deepEqual(app.getExpansionRules(), [rule(7)]);
});

test('prune uses the displayed effective depth after the longest rule is unchecked', async () => {
  const { app, enable } = await fixture([rule(1,[rule(2)]),rule(3)], async field => ({ ids:[Number(field)+2], edges:[edge(1,Number(field)+2)] }));
  await enable(0); await enable(1);
  await app.setRuleEnabled(app.getLegend().rules[0].id, false);
  assert.equal(app.getExpansionState().depth, 1);
  await app.pruneExpansion();
  assert.deepEqual(app.graph.recordIds, [1,2]);
  assert.equal(app.getExpansionState().depth, 0);
});

test('a multi-selection keeps the surviving seed contribution when another seed disappears', async () => {
  const { app, enable } = await fixture([rule(1),rule(2)], async (field,seeds) => {
    if(field==='1') return { ids:seeds.includes(1)?[3]:[], edges:seeds.includes(1)?[edge(1,3)]:[] };
    return { ids:seeds.includes(3)?[4]:[5], edges:seeds.includes(3)?[edge(3,4,2)]:[edge(2,5,2)] };
  });
  await enable(0); await enable(1);
  await app.setExpansionDepth(1,[2,3]);
  await app.setRuleEnabled(app.getLegend().rules[0].id,false);
  assert.deepEqual(app.graph.recordIds,[1,2,5]);
});
