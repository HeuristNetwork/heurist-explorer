import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphApplication } from '../src/core/GraphApplication.js';
import { GraphDocument } from '../src/core/GraphDocument.js';

const rule = (field, levels = []) => ({ query: { t:10, [`lf:${field}`]:[{ t:10 }] }, levels });
const edge = (from, to, fieldId = 1) => ({ from, to, fieldId });
const graph = (ids, edges = []) => new GraphDocument({ records:ids.map(id => ({ id, recordTypeId:10 })), edges });
// setExpansionRules() was removed with the "Define expansions" UI; replicate
// its override-scoping directly (the same path GraphApplication#restoreExpansions
// uses to apply a published view's saved override).
async function setRules(app, rules) {
  app.ruleOverrides.set(app.config.querySourceId ? `querySource:${app.config.querySourceId}` : 'current', structuredClone(rules));
  app.expansions?.setRules(rules);
  await app.renderExpansions();
}
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

test('advanceExpansion from an untouched graph enables defined rules and shows the first level only', async () => {
  // rule(1, [rule(2)]) has its own maxDepth of 2 (one fork level); the fix
  // must still land on depth 1, not jump straight to the rule's full depth.
  const { app, calls } = await fixture([rule(1, [rule(2)])], async (field, seeds) => field === '1'
    ? { ids: [3], edges: [edge(1, 3)] } : { ids: [4], edges: [edge(3, 4, 2)] },
    graph([1, 2], []));
  const before = app.getExpansionState();
  assert.equal(before.maxDepth, 0, 'rules start disabled, so nothing is expandable yet');
  await app.advanceExpansion();
  const [a] = app.getLegend().rules;
  assert.equal(a.enabled, true);
  assert.equal(app.getExpansionState().maxDepth, 2);
  assert.equal(app.getExpansionState().depth, 1, 'lands on the first level, not the rule\'s full max depth');
  assert.equal(calls.length, 1);
});

test('forks use parent targets; prune drops descendants while overlap with base survives', async () => {
  const { app, enable, calls } = await fixture([rule(1, [rule(2),rule(3)])], async (field, seeds) => {
    if(field==='1') return { ids:[3], edges:[edge(1,3)] };
    assert.deepEqual(seeds, [3]);
    return field==='2' ? { ids:[2,4], edges:[edge(3,2,2),edge(3,4,2)] } : { ids:[4,5], edges:[edge(3,4,3),edge(3,5,3)] };
  });
  await enable(0);
  assert.deepEqual(app.graph.recordIds, [1,2,3], 'checking a rule loads it to the current level only');
  await app.setExpansionDepth(2);
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
  await setRules(app, [{ ...rule(2), name:'Renamed' },rule(3)]);
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

test('source overrides stay local to their Query Source and Current Results', async () => {
  const { app } = await fixture([], async () => ({ ids:[], edges:[] }));
  app.querySourceProvider = { load:async id => ({ title:`Query Source ${id}`, source:{query:'t:10'}, rules:[rule(id)] }) };
  await setRules(app, [rule(7)]);
  await app.setQuerySource(12); await setRules(app, [rule(8)]);
  await app.setQuerySource(13);
  assert.deepEqual(app.getExpansionRules(), [rule(13)]);
  await app.setQuerySource(12);
  assert.deepEqual(app.getExpansionRules(), [rule(8)]);
  await app.resetExpansionRules();
  assert.deepEqual(app.getExpansionRules(), [rule(12)]);
  // Restoring the remembered Filtered Result query is now the caller's job:
  // clear the active source so the plain-query guard doesn't block the reload,
  // and clear the Query Source identity so expansion rules key off 'current'.
  app.querySource = null;
  app.dataSource = null;
  app.activeLoad = null;
  app.config.querySourceId = null;
  app.config.querySourceTitle = null;
  await app.load({ query: app.currentResultsQuery, remember: false });
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


test('the level applies to the whole graph and ignores the selection', async () => {
  const { app, enable } = await fixture([rule(1, [rule(2)])], async field => field === '1'
    ? { ids:[3], edges:[edge(1,3)] } : { ids:[4], edges:[edge(3,4,2)] });
  await enable(0);
  await app.setSelection([2]);
  await app.advanceExpansion();
  assert.equal(app.getExpansionState().depth, 2);
  assert.deepEqual(app.graph.recordIds, [1,2,3,4]);
});

test('changed rules apply without reloading: cache, enabled state and level are kept', async () => {
  const { app, enable, calls } = await fixture([rule(1)], async field => ({ ids:[Number(field)+2], edges:[edge(1,Number(field)+2)] }));
  let loads = 0;
  const load = app.load.bind(app);
  app.load = (...args) => { loads += 1; return load(...args); };
  await enable(0);
  // the rule grows a step: its first level is reused, the rule stays checked
  await app.setDataSourceRules([rule(1, [rule(2)])]);
  assert.equal(app.getLegend().rules[0].enabled, true);
  assert.equal(app.getExpansionState().depth, 1);
  await app.advanceExpansion();
  assert.deepEqual(app.graph.recordIds, [1,2,3,4]);
  assert.equal(calls.length, 2, 'only the new step is fetched');
  assert.equal(loads, 0, 'the base graph is not reloaded');
});

test('a DataSource that differs only in rules does not reload the graph', async () => {
  const { app } = await fixture([], async () => ({ ids:[], edges:[] }));
  await app.setDataSource({ request:{ q:'t:10', rules:[] } });
  let loads = 0;
  const load = app.load.bind(app);
  app.load = (...args) => { loads += 1; return load(...args); };
  await app.setDataSource({ request:{ q:'t:10', rules:[rule(1)] } });
  assert.equal(loads, 0);
  assert.deepEqual(app.getExpansionRules(), [rule(1)]);
  await app.setDataSource({ request:{ q:'t:48', rules:[rule(1)] } });
  assert.equal(loads, 1, 'a new query reloads');
});

test('quick expansion saves a connected step through the host and shows it (authors only)', async () => {
  const { app } = await fixture([rule(1)], async (field, seeds) => ({ ids:[9], edges:[edge(seeds[0],9)] }));
  assert.equal(app.canQuickExpand(), false, 'hidden without the host capability');
  let saved = null;
  app.host = {
    getCapabilities: () => ({ rulesEditing:true }),
    updateRules: async (rules) => { saved = rules; await app.setDataSourceRules(rules); return rules; },
  };
  app.provider.load = async request => {
    if (!request.rule) return { graph:graph([1,2]), total:2 };
    return { graph:graph([...request.query.ids, 9], [edge(request.query.ids[0], 9)]), expansion:{ targetIds:[9] } };
  };
  assert.equal(app.canQuickExpand(), true);
  assert.equal(await app.quickExpand(), true);
  assert.deepEqual(saved[0].levels, [{ query:{ connected:[{ t:10 }] }, levels:[] }]);
  assert.equal(app.getExpansionState().depth, 2);
  assert.equal(app.getLegend().rules[0].enabled, true);
});
