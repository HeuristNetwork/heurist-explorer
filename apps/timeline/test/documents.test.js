/**
 * @file documents.test.js
 * @brief Verifies TimelineDocumentApplication's MapDocument/DataSource band management.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { TimelineDocumentApplication } from '../src/core/TimelineDocumentApplication.js';

const source = (id, q = `t:${id}`, profile = {}) => ({ reference: { key: `source:${id}`, type: 'source', id }, title: `Source ${id}`, request: { q }, presentation: { timeline: profile } });
const response = { records: [{ rec_ID: 1, rec_Title: 'Dated record', when: [['1990', '', '', '1990', '', 0, 0, 1, 9]] }] };
function fixture() {
  const calls = [], renders = [], shown = [];
  const app = new TimelineDocumentApplication({ container: {}, config: { settings: {}, source: {}, explorerHost: true },
    host: { supportsEditing: () => true, bridge: { showDatasource: (value) => shown.push(value) } },
    engine: { setData: async (data) => renders.push(data), setSelection: async () => {}, scrollToBand: (id) => calls.push(['scroll', id]) },
    provider: { load: async (band) => { calls.push(band.query); return response; } },
    apiClient: { get: async (url) => {
      if (url.includes('/document/')) return { format: 'heurist-map-document', version: 1, title: 'Document', layers: [{ id: 10 }, { id: 11 }] };
      return { format: 'heurist-map-layer', version: 1, id: Number(url.split('/').at(-1)), title: 'Layer',
        source: url.endsWith('/11') ? { type: 'tile' } : { type: 'heurist-query', query: 't:10' } };
    } }
  });
  return { app, calls, renders, shown };
}

test('Workspace selection preserves current result and hidden bands defer loading', async () => {
  const { app, calls, renders } = fixture();
  await app.setDynamicDataSources({ currentDataSource: source(1), workspaceDataSources: [source(2)] });
  assert.deepEqual(calls, ['t:1', 't:2']);
  assert.equal(app.getLayers()[0].id, 'current-results');
  await app.setDynamicDataSources({ currentDataSource: source(2) });
  assert.equal(app.currentDataSource.reference.id, 1);
  assert.equal(app.getLayers()[1].activeDataSource, true);
  assert.equal(calls.length, 2);
  await app.setLayerVisibility('current-results', false);
  await app.setDynamicDataSources({ currentDataSource: source(3) });
  assert.equal(calls.length, 2);
  await app.setLayerVisibility('current-results', true);
  assert.equal(calls.at(-1), 't:3');
  assert.equal(renders.at(-1).fit, false);
});

test('ordinary documents replace bands, suppress unsupported sources and retain pending results', async () => {
  const { app, calls } = fixture();
  await app.setDynamicDataSources({ currentDataSource: source(1) });
  await app.activateMapDocument(5);
  assert.equal(app.contexts.length, 1);
  assert.equal(app.getLayers()[0].recordId, 10);
  const count = calls.length;
  const own = app.contexts[0].options.dataSource;
  await app.setDynamicDataSources({ currentDataSource: own });
  assert.equal(app.getLayers()[0].activeDataSource, true);
  assert.equal(app.currentDataSource.reference.id, 1);
  await app.setDynamicDataSources({ currentDataSource: source(3) });
  assert.equal(calls.length, count);
  assert.equal(app.activeDocumentId, '5');
  await app.activateMapDocument('dynamic');
  assert.equal(calls.at(-1), 't:3');
});

test('Show Data preserves layers, selects and scrolls the visible band', async () => {
  const { app, calls, shown } = fixture();
  await app.setDynamicDataSources({ currentDataSource: source(1), workspaceDataSources: [source(2)] });
  const id = app.getLayers()[1].id;
  await app.showLayerDataSource(id);
  assert.equal(app.currentDataSource.reference.id, 1);
  assert.deepEqual(calls.at(-1), ['scroll', id]);
  assert.equal(shown[0].reference.id, 2);
  await app.setLayerVisibility(id, false);
  const count = calls.length;
  await app.showLayerDataSource(id);
  assert.equal(calls.length, count);
});

test('band errors and empty results are distinct, and stale requests cannot attach', async () => {
  const { app } = fixture();
  let resolve;
  app.provider.load = () => new Promise((done) => { resolve = done; });
  const slow = app.setDynamicDataSources({ currentDataSource: source(1) });
  await new Promise((done) => setImmediate(done));
  app.provider.load = async () => ({ records: [] });
  await app.setDynamicDataSources({ currentDataSource: source(2) });
  resolve(response);
  await slow;
  assert.equal(app.getLayers()[0].count, 0);
  assert.equal(app.getLayers()[0].loadState, 'loaded');
  app.provider.load = async () => { throw new Error('Failed'); };
  await app.setDynamicDataSources({ currentDataSource: source(3) });
  assert.equal(app.getLayers()[0].loadState, 'error');
});

test('restoration applies hidden band state before fetching temporal records', async () => {
  const { app, calls } = fixture();
  await app.restoreState({ activeDocumentId: 'dynamic', currentDataSource: source(1),
    bandVisibility: { dynamic: { 'current-results': false } } });
  assert.equal(calls.length, 0);
  assert.equal(app.getLayers()[0].visible, false);
});
