import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { HMsg } = await import('#shared/ui');
const { openInsertFieldsDialog } = await import('../../src/ui/editor/insertFieldsDialog.js');

/** Replace HMsg with a recorder: the form, its buttons and whether it is closed. */
function stubDialog() {
  const state = { form: null, buttons: {}, closed: 0, shown: 0 };
  HMsg.showMsgDlg = (form, options) => {
    state.shown++;
    state.form = form;
    for (const button of options.buttons) state.buttons[button.label] = button.onClick;
    return { addEventListener: () => {} };
  };
  HMsg.closeMsgDlg = () => { state.closed++; };
  state.heading = () => state.form.querySelector('strong').textContent;
  return state;
}

const items = ['Name', 'Gender', 'Photo'].map((label) => ({ label, segments: [{ kind: 'field', fieldId: label }] }));

test('one dialog for all fields: Insert field and Skip show the next field, closed after the last', async () => {
  const dialog = stubDialog();
  const inserted = [];
  const done = openInsertFieldsDialog({
    items,
    options: { addCaption: true },
    isRepeatable: (item) => item.label === 'Gender',
    onInsert: (item, options) => inserted.push([item.label, options.addLoop]),
    onInsertAll: () => assert.fail('not used')
  });
  assert.equal(dialog.heading(), 'Name');
  dialog.buttons['Insert field']();
  assert.equal(dialog.heading(), 'Gender', 'the next field in the same dialog');
  assert.equal(dialog.closed, 0);
  dialog.buttons.Skip();
  assert.equal(dialog.heading(), 'Photo');
  assert.equal(dialog.closed, 0, 'Skip does not close');
  dialog.buttons['Insert field']();
  assert.equal(dialog.closed, 1, 'closed after the last field');
  assert.equal(dialog.shown, 1, 'one dialog');
  assert.deepEqual(inserted, [['Name', false], ['Photo', false]]);
  assert.equal((await done).addCaption, true);
});

test('Insert all inserts the remaining fields; Cancel closes', async () => {
  let dialog = stubDialog();
  let rest = null;
  const all = openInsertFieldsDialog({
    items, options: {}, isRepeatable: () => false,
    onInsert: () => {}, onInsertAll: (remaining) => { rest = remaining.map((item) => item.label); }
  });
  dialog.buttons.Skip();
  dialog.buttons['Insert all']();
  await all;
  assert.deepEqual(rest, ['Gender', 'Photo']);
  assert.equal(dialog.closed, 1);

  dialog = stubDialog();
  const cancelled = openInsertFieldsDialog({
    items, options: {}, isRepeatable: () => false, onInsert: () => assert.fail('cancelled'), onInsertAll: () => {}
  });
  dialog.buttons.Cancel();
  await cancelled;
  assert.equal(dialog.closed, 1);
});
