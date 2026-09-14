import test from 'node:test';
import assert from 'node:assert/strict';
import { HMsg } from '#shared/ui';
import { MapConfigurationDialog } from '../../src/ui/config/MapConfigurationDialog.js';

test('dirty cancellation waits for explicit discard and keep-editing preserves changes', () => {
  const original = HMsg.showMsgDlg;
  let buttons;
  let cancelled = 0;
  const dialog = new MapConfigurationDialog({ onCancel: () => cancelled++ });
  dialog.initialFormState = 'original';
  dialog.formStateSignature = () => 'changed';
  HMsg.showMsgDlg = (_message, options) => {
    buttons = options.buttons;
    return { open: true, close() { this.open = false; } };
  };
  try {
    assert.equal(dialog.cancel(), false);
    assert.equal(cancelled, 0);
    buttons[0].onClick();
    assert.equal(dialog.initialFormState, 'original');
    assert.equal(cancelled, 0);
    dialog.cancel();
    buttons[1].onClick();
    assert.equal(cancelled, 1);
    assert.equal(dialog.initialFormState, null);
  } finally { HMsg.showMsgDlg = original; }
});

test('host editor rejection restores modality and focus before reporting failure', async () => {
  const previousDocument = globalThis.document;
  const calls = [];
  globalThis.document = { activeElement: { isConnected: true, focus: () => calls.push('focus') } };
  const editor = new MapConfigurationDialog();
  editor.dialog = { isConnected: true, close: () => calls.push('close'), showModal: () => calls.push('modal') };
  try {
    await assert.rejects(editor.withHostEditor(async () => {
      calls.push('editor');
      throw new Error('Host unavailable');
    }), /Host unavailable/);
    assert.deepEqual(calls, ['close', 'editor', 'modal', 'focus']);
  } finally { globalThis.document = previousDocument; }
});

test('failed save preserves the editor and reports the error', async () => {
  const editor = new MapConfigurationDialog({ onSave: async () => { throw new Error('Save failed'); } });
  let message;
  let closed = false;
  editor.showError = value => { message = value; };
  editor.close = () => { closed = true; };
  assert.equal(await editor.save(), false);
  assert.equal(message, 'Save failed');
  assert.equal(closed, false);
});
