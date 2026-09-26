import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from '../../../shared/test/helpers/fakeDom.js';

const document = installFakeDom();
const { IframeModuleAdapter } = await import('../src/modules/IframeModuleAdapter.js');
const { DataSourceActions } = await import('../src/widgets/query-source/DataSourceActions.js');

test('the child bridge of an embedded module forwards canEditRecords (editRecord always exists)', () => {
  const bridge = (hostActions) => new IframeModuleAdapter({
    id: 'data-1', type: 'data', container: document.createElement('div'), url: 'x', hostActions
  })._createChildHostBridge();
  assert.equal(typeof bridge({}).editRecord, 'function');
  assert.equal(bridge({}).canEditRecords(), false, 'no outer check: cannot edit');
  assert.equal(bridge({ canEditRecords: () => false }).canEditRecords(), false);
  assert.equal(bridge({ canEditRecords: () => true }).canEditRecords(), true);
});

test('QSE actions: Save as Filter / Save as Source are hidden when the host cannot save', async () => {
  const render = (options) => {
    const actions = new DataSourceActions(options).attach(document.createElement('div')).render();
    actions.setDataSource({ request: { q: [{ t: '10' }] } });
    return actions;
  };
  const guest = render({ canSaveFilter: () => false, canSaveSource: () => false });
  await flush();
  assert.equal(guest._filter.hidden, true);
  assert.equal(guest._source.hidden, true);
  assert.equal(guest._workspace.hidden, false, 'workspace stays');
  const user = render({ canSaveFilter: () => true, canSaveSource: () => true });
  await flush();
  assert.equal(user._filter.hidden, false);
  assert.equal(user._source.hidden, false);
  const legacy = render({});
  await flush();
  assert.equal(legacy._source.hidden, false, 'without checks: shown as before');
});
