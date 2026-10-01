import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

const document = installFakeDom();
const { GraphApplication } = await import('../src/core/GraphApplication.js');
const { GraphDocument } = await import('../src/core/GraphDocument.js');

function envelope(records = []) {
  return {
    query: 't:10', total: records.length, offset: 0, limit: 1000,
    graph: new GraphDocument({ graph: { records, edges: [], links: {}, paths: {},
      limits: { maxNodes: 5000, maxEdges: 10000, maxDepth: 5, nodesReturned: records.length, edgesReturned: 0, truncated: false } } }),
  };
}

function application(provider, limits = {}) {
  const app = new GraphApplication({
    config: { selection: [], limits, engineOptions: {} },
    provider,
    engine: { setGraph: async () => {}, setSelection: async () => {} },
    host: {},
  });
  const area = document.createElement('div');
  app.canvasElement = document.createElement('div');
  area.append(app.canvasElement);
  app.messageElement = document.createElement('div');
  return { app, area };
}

test('the main result shows a loading indicator instead of "No records" while it loads', async () => {
  let during = null;
  const { app, area } = application({
    load: async () => {
      during = { loading: area.classList.contains('heurist-graph-loading'), message: app.messageElement.hidden };
      return envelope([]);
    },
  });
  await app.load({ query: 't:10' });
  assert.deepEqual(during, { loading: true, message: true });
  assert.equal(area.classList.contains('heurist-graph-loading'), false);
  assert.equal(app.messageElement.hidden, false, '"No records" after an empty result');
  assert.equal(app.messageElement.textContent, 'No records');
});

test('a failed load removes the loading indicator', async () => {
  const { app, area } = application({ load: async () => { throw new Error('boom'); } });
  await assert.rejects(app.load({ query: 't:10' }));
  assert.equal(area.classList.contains('heurist-graph-loading'), false);
});

test('the node limit is reached when the graph shows the maximum allowed nodes', async () => {
  const records = [1, 2, 3].map((id) => ({ rec_ID: id, rec_RecTypeID: 10, rec_Title: `R${id}` }));
  const { app } = application({ load: async () => envelope(records) }, { maxNodes: 3 });
  await app.load({ query: 't:10' });
  assert.equal(app.nodeLimitReached(), 3);
  app.config.limits.maxNodes = 10;
  assert.equal(app.nodeLimitReached(), 0);
});
