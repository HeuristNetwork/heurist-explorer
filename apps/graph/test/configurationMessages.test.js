import test from 'node:test';
import assert from 'node:assert/strict';
import { HMsg } from '#shared/ui';
import { GraphConfigurationDialog } from '../src/ui/config/GraphConfigurationDialog.js';

test('configuration cancellation waits for explicit discard', () => {
  const original = HMsg.showMsgDlg;
  let buttons;
  let cancelled = 0;
  const editor = new GraphConfigurationDialog({ onCancel: () => cancelled++ });
  editor.initialState = 'original';
  editor.signature = () => 'changed';
  HMsg.showMsgDlg = (_message, options) => {
    buttons = options.buttons;
    return { open: true, close() { this.open = false; } };
  };
  try {
    assert.equal(editor.cancel(), false);
    assert.equal(cancelled, 0);
    buttons[0].onClick();
    assert.equal(editor.initialState, 'original');
    assert.equal(cancelled, 0);
    editor.cancel();
    buttons[1].onClick();
    assert.equal(cancelled, 1);
    assert.equal(editor.initialState, null);
  } finally { HMsg.showMsgDlg = original; }
});

test('save errors preserve the editor and report the failure', async () => {
  const editor = new GraphConfigurationDialog({ onSave: async () => { throw new Error('Save failed'); } });
  let message;
  let closed = false;
  editor.showError = value => { message = value; };
  editor.close = () => { closed = true; };
  assert.equal(await editor.save(), false);
  assert.equal(message, 'Save failed');
  assert.equal(closed, false);
});

test('loadProviderOptions reports a template-loading failure', async () => {
  const editor = new GraphConfigurationDialog();
  let message;
  editor.loadTemplateOptions = async () => { throw new Error('Templates unavailable'); };
  editor.showError = value => { message = value; };
  await editor.loadProviderOptions();
  assert.equal(message, 'Templates unavailable');
});
