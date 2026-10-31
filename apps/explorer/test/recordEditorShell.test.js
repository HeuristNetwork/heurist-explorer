/**
 * @file recordEditorShell.test.js
 * @brief Explorer in editor mode (plan 21 §2.4): the mode and the record from the
 *        bootstrap or the URL, the messages to the opener, the window that closes itself.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

const document = installFakeDom();
const { urlBootstrap, editorTarget } = await import('../src/explorerConfig.js');
const { RecordEditorShell, RecordEditorShellApi, EDITOR_MESSAGE_SOURCE } = await import('../src/editor/RecordEditorShell.js');

test('URL fallback: explorerViewer.html?db=&mode=editor&recID= / &rty=', () => {
  const page = 'http://127.0.0.1/heurist/hclient/modules/explorer/explorerViewer.html';
  const edit = urlBootstrap(new URL(`${page}?db=osmak_mapping&mode=editor&recID=151`));
  assert.equal(edit.runtime.runtimeMode, 'editor');
  assert.equal(edit.runtime.database, 'osmak_mapping');
  assert.equal(edit.runtime.baseUrl, 'http://127.0.0.1/heurist/');
  assert.equal(edit.runtime.apiBaseUrl, 'http://127.0.0.1/heurist/api');
  assert.deepEqual(edit.state, { recordId: 151 });
  assert.deepEqual(urlBootstrap(new URL(`${page}?db=x&mode=editor&rty=12`)).state, { rectypeId: '12' });
  // not the editor mode, or no database: nothing
  assert.deepEqual(urlBootstrap(new URL(`${page}?db=x`)), {});
  assert.deepEqual(urlBootstrap(new URL(`${page}?mode=editor&recID=1`)), {});
  assert.deepEqual(urlBootstrap(null), {});
});

test('URL fallback: the CMS designer of a website (plan 27c §6)', async () => {
  const page = 'http://127.0.0.1/heurist/hclient/modules/explorer/explorerViewer.html';
  const cms = urlBootstrap(new URL(`${page}?db=osmak_mapping&mode=cms&site=10&page=12`));
  assert.equal(cms.runtime.runtimeMode, 'main');
  assert.equal(cms.runtime.baseUrl, 'http://127.0.0.1/heurist/');
  assert.deepEqual(cms.state, { cms: { site: 10, page: 12 } });
  const { createHeuristExplorerConfig } = await import('../src/explorerConfig.js');
  assert.deepEqual(createHeuristExplorerConfig(cms).cms, { site: 10, page: 12 });
  assert.equal(createHeuristExplorerConfig({ runtime: { database: 'x' } }).cms, null);
});

test('editor target from the bootstrap state', () => {
  assert.deepEqual(editorTarget({ recordId: '7' }), { recordId: 7, rectypeId: null, access: null });
  assert.deepEqual(editorTarget({ rectypeId: 'RT_MAP_LAYER', access: { owner: 2 } }), { recordId: 0, rectypeId: 'RT_MAP_LAYER', access: { owner: 2 } });
  assert.deepEqual(editorTarget(null), { recordId: 0, rectypeId: null, access: null });
});

/** A window stand-in: top-level or framed, with or without opener. */
function fakeWindow({ framed = false, opener = false } = {}) {
  const posted = [];
  const target = { postMessage: (message, origin) => posted.push({ message, origin }) };
  const win = { location: { origin: 'http://127.0.0.1' }, closed: false, close() { this.closed = true; } };
  win.parent = framed ? target : win;
  win.opener = opener ? target : null;
  return { win, posted };
}

/** A shell with a stand-in record editor host. */
function shell({ bridge = null, framed = false, opener = false } = {}) {
  const { win, posted } = fakeWindow({ framed, opener });
  const container = document.createElement('div');
  const instance = new RecordEditorShell({ container, config: { hostBridge: bridge }, window: win });
  const mounted = [];
  instance.host = {
    mount: async (host, target) => {
      let close;
      const closed = new Promise((resolve) => { close = resolve; });
      const editor = {
        close: async () => { close({ saved: true, recordId: target.recordId || 9, record: { rec_ID: String(target.recordId || 9) } }); return true; },
        isDirty: () => false,
        getRecord: () => ({ rec_ID: String(target.recordId || 9) }),
        destroy: async () => {}
      };
      mounted.push(target);
      return { editor, closed };
    }
  };
  return { instance, win, posted, mounted };
}

test('saves and the close go to the bridge callbacks and as postMessage to the parent frame', async () => {
  const calls = [];
  const bridge = { onRecordSaved: (detail) => calls.push(['saved', detail]), onEditorClosed: (detail) => calls.push(['closed', detail]) };
  const { instance, win, posted, mounted } = shell({ bridge, framed: true });
  await instance.open({ recordId: 151 });
  assert.deepEqual(mounted, [{ recordId: 151 }]);
  instance._notify('saved', { record: { rec_ID: '151', rec_RecTypeID: '10' }, created: false });
  assert.deepEqual(calls[0][0], 'saved');
  assert.deepEqual(posted[0], {
    message: { source: EDITOR_MESSAGE_SOURCE, type: 'saved', recordId: 151, rectypeId: 10, created: false, saved: true },
    origin: 'http://127.0.0.1'
  });
  await instance.close();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.at(-1)[0], 'closed');
  assert.equal(calls.at(-1)[1].recordId, 151);
  assert.equal(posted.at(-1).message.type, 'closed');
  assert.equal(posted.at(-1).message.saved, true);
  assert.equal(win.closed, false, 'a frame does not close itself');
  assert.equal(instance.container.querySelector('.h-record-editor-shell-message').textContent, 'Saved. The editor is closed.');
});

test('a window opened for the editor tells its opener and closes itself', async () => {
  const { instance, win, posted } = shell({ opener: true });
  await instance.open({ rectypeId: 12 });
  await instance.close();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(posted.at(-1).message.type, 'closed');
  assert.equal(win.closed, true);
});

test('the public API of the editor mode', async () => {
  const { instance, mounted } = shell();
  const api = new RecordEditorShellApi(instance);
  assert.equal(api.mode, 'editor');
  await api.open({ recordId: 5 });
  assert.equal(api.isDirty(), false);
  assert.deepEqual(api.getRecord(), { rec_ID: '5' });
  // another record: the current one is closed first
  await api.open({ recordId: 6 });
  assert.deepEqual(mounted.map((target) => target.recordId), [5, 6]);
  assert.equal(await api.close(), true);
});
