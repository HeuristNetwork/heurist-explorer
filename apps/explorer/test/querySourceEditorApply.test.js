import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { QuerySourceEditor } = await import('../src/widgets/query-source/QuerySourceEditor.js');

function editor(onApply) {
  const qse = new QuerySourceEditor({ dbdefs: {}, onApply });
  qse.setDataSource({ reference: { type: 'query', key: 'q1' }, title: '', request: { q: 't:10' }, presentation: {} });
  return qse;
}

test('applying a presentation dialog applies the draft to the modules at once (no Test button)', async () => {
  const applied = [];
  const qse = editor((source) => applied.push(source));
  qse.draft.presentation.map = { geoFields: ['10:28'] };
  qse._settingsChanged();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0].presentation.map.geoFields, ['10:28']);
  assert.equal(qse.isDirty(), true, 'still to be saved as a Query Source');
});

test('a cancelled dialog applies nothing', async () => {
  const applied = [];
  const qse = editor((source) => applied.push(source));
  qse._showEditorDialog = async () => null;
  await qse._openFieldEditor('Time fields', { setRecordType() { return this; }, setValue() { return this; } }, [], () => {});
  assert.equal(applied.length, 0);
});

test('closing the Expansion rules dialog with Cancel (or an unchanged Apply) does not update the DataSource', async () => {
  const { HRuleBuilder } = await import('../src/widgets/query-source/helpers/HRuleBuilder.js');
  const open = HRuleBuilder.prototype.open;
  const applied = [];
  const qse = editor((source) => applied.push(source));
  qse.draft.request.rules = [{ query: { lt: [] }, levels: [] }];
  qse._ensureRecordTypeConsistency = async () => true;
  try {
    HRuleBuilder.prototype.open = async () => null; // Cancel
    await qse.openRuleBuilder();
    HRuleBuilder.prototype.open = async () => [{ query: { lt: [] }, levels: [] }]; // Apply, nothing changed
    await qse.openRuleBuilder();
    assert.equal(applied.length, 0);
    HRuleBuilder.prototype.open = async () => [{ query: { lf: [] }, levels: [] }]; // Apply, changed
    await qse.openRuleBuilder();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(applied.length, 1);
    assert.deepEqual(applied[0].request.rules, [{ query: { lf: [] }, levels: [] }]);
  } finally {
    HRuleBuilder.prototype.open = open;
  }
});
