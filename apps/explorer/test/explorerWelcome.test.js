import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { ExplorerWelcome, WELCOME_SHOWN_KEY } = await import('../src/ui/ExplorerWelcome.js');
const { HMsg } = await import('#shared/ui');

function memoryStorage() {
  const data = {};
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = String(value); } };
}

test('the welcome is a first visit until it was shown once', () => {
  const storage = memoryStorage();
  const welcome = new ExplorerWelcome({ storage });
  assert.equal(welcome.isFirstVisit(), true);
  welcome.markShown();
  assert.equal(storage.data[WELCOME_SHOWN_KEY], '1');
  assert.equal(new ExplorerWelcome({ storage }).isFirstVisit(), false);
});

test('without storage it is never a first visit (no popup on every start)', () => {
  const broken = { getItem() { throw new Error('blocked'); } };
  assert.equal(new ExplorerWelcome({ storage: broken }).isFirstVisit(), false);
});

test('open() remembers the visit and offers Getting started', () => {
  const storage = memoryStorage();
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  let options = null;
  let started = 0;
  try {
    HMsg.showMsgDlg = (_content, value) => { options = value; return null; };
    HMsg.closeMsgDlg = () => {};
    new ExplorerWelcome({ storage, onGettingStarted: () => started++ }).open();
    assert.equal(storage.data[WELCOME_SHOWN_KEY], '1');
    assert.equal(options.buttons.length, 2);
    options.buttons[0].onClick();
    assert.equal(started, 1);
  } finally {
    HMsg.showMsgDlg = show;
    HMsg.closeMsgDlg = close;
  }
});
