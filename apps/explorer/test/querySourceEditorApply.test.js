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

test('changing the record type asks before dropping settings, also while More is hidden', async () => {
  const { HMsg } = await import('#shared/ui');
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  HMsg.closeMsgDlg = () => {};
  const asked = [];
  const qse = new QuerySourceEditor({ dbdefs: {} });
  qse.setDataSource({ reference: { type: 'source', id: 7, key: 'source:7' }, title: 'People', request: { q: 't:10', rules: [{ levels: [] }] }, presentation: {} });
  assert.equal(qse.isExpanded(), false);
  try {
    // Cancel: the query goes back, the rules stay
    HMsg.showMsgDlg = (message, { buttons }) => { asked.push(message); buttons[1].onClick(); };
    qse.draft.request.q = 't:12';
    assert.equal(await qse._ensureRecordTypeConsistency(), false);
    assert.equal(asked.length, 1);
    assert.equal(qse.draft.request.q, 't:10');
    assert.equal(qse.draft.request.rules.length, 1);
  } finally {
    HMsg.showMsgDlg = show;
    HMsg.closeMsgDlg = close;
  }
});

test('render: five panes, the sentence in p3, More from the Layout menu', async () => {
  const changes = [];
  const qse = new QuerySourceEditor({ dbdefs: {}, onExpandedChange: (value) => changes.push(value), onHelp: () => {} });
  qse.attach(document.createElement('div')).render();
  const root = qse.container;
  for (const pane of ['h-qse-p1', 'h-qse-p2', 'h-qse-p3', 'h-qse-advanced', 'h-qse-p5']) {
    assert.ok(root.querySelector(`.${pane}`), pane);
  }
  assert.ok(root.classList.contains('is-vertical'));
  assert.ok(root.querySelector('.h-qse-p3').querySelector('.h-fih-sentence'), 'sentence placed in p3');
  assert.equal(qse.actionsSlot.parentElement, root.querySelector('.h-qse-p2'));
  assert.equal(root.querySelector('.h-qse-advanced').hidden, true);
  qse._openLayoutMenu();
  qse._menuItems.more.click();
  assert.equal(root.querySelector('.h-qse-advanced').hidden, false);
  assert.deepEqual(changes, [true]);
  qse.setOrientation('horizontal');
  assert.ok(root.classList.contains('is-horizontal'));
  assert.ok(!root.classList.contains('is-vertical'));
  await qse.destroy();
});

test('horizontal fit: wrap when the height allows, otherwise drop captions, then shrink the query', async () => {
  const qse = new QuerySourceEditor({ dbdefs: {}, orientation: 'horizontal', expanded: true });
  qse.attach(document.createElement('div')).render();
  const root = qse.container;
  qse._p5.offsetWidth = 22;
  const fit = (width, height) => { qse._row.clientWidth = width; qse._row.clientHeight = height; qse._fitHorizontal(); };
  // 2 buttons in p2 (no Save/Add attached here), 4 config buttons + Title in p4
  fit(1400, 30);
  assert.equal(root.classList.contains('is-collapsed'), false, 'captions fit in one row');
  assert.equal(root.style['--qse-btn-w'], '90px');
  fit(1150, 30);
  assert.equal(root.classList.contains('is-collapsed'), true, 'one row only: captions dropped');
  assert.equal(root.classList.contains('is-wrapped'), false);
  fit(1150, 64);
  assert.equal(root.classList.contains('is-collapsed'), false, 'two rows allowed: wrapped with captions');
  assert.equal(root.classList.contains('is-wrapped'), true);
  qse.setOrientation('vertical');
  assert.equal(root.classList.contains('is-wrapped'), false, 'vertical clears the horizontal fit');
  await qse.destroy();
});
