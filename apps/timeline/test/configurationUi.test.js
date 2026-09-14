import test from 'node:test';
import assert from 'node:assert/strict';
import { HMsg } from '#shared/ui';
import { HeuristTimelinePublicApi } from '../src/host/HeuristTimelinePublicApi.js';
import { TimelineConfigurationDialog } from '../src/ui/TimelineConfigurationDialog.js';

test('options apply to the engine and are exposed in state', () => {
  let applied;
  const application = { config: { settings: { stack:true, labelMode:'full', labelPosition:'bar', orientation:'both' } }, engine: { setOptions: value => { applied = value; } }, dispatch() {}, getState: () => ({ contexts: [] }) };
  const api = new HeuristTimelinePublicApi(application);
  api.applyOptions({ labelMode:'hidden', stack:false });
  assert.equal(applied.labelMode, 'hidden');
  assert.equal(api.getState().options.stack, false);
  assert.throws(() => api.applyOptions({ labelMode:'fixed' }), /Invalid timeline option/);
  assert.equal(api.getState().options.labelMode, 'hidden');
});

test('failed engine updates do not commit settings', () => {
  const settings = { labelMode:'full' };
  const api = new HeuristTimelinePublicApi({ config:{ settings }, engine:{ setOptions() { throw new Error('Engine failure'); } } });
  assert.throws(() => api.applyOptions({ labelMode:'hidden' }), /Engine failure/);
  assert.equal(api.application.config.settings, settings);
});

test('discard confirmation preserves changes until explicitly accepted', () => {
  const original = HMsg.showMsgDlg;
  const editor = new TimelineConfigurationDialog({ api:{} });
  editor.fields = new Map([['labelMode', { value:'hidden' }]]);
  editor.initialState = JSON.stringify({ labelMode:'full' });
  let closed = false;
  let buttons;
  editor.close = () => { closed = true; };
  HMsg.showMsgDlg = (_message, options) => { buttons = options.buttons; return { open:true, close() { this.open=false; } }; };
  try {
    assert.equal(editor.cancel(), false);
    buttons[0].onClick();
    assert.equal(closed, false);
    editor.cancel();
    buttons[1].onClick();
    assert.equal(closed, true);
  } finally { HMsg.showMsgDlg = original; }
});
