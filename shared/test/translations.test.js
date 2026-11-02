/**
 * @file translations.test.js
 * @brief Translated values (plan 25): value rows with the language code, the
 *        "Insert translated value" dialog (Translate / Insert blank / Cancel) and
 *        TranslationClient (the translation service of the server).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
const { HEditField } = await import('../src/widgets/edit-form/HEditField.js');
const { TranslationClient } = await import('../src/data/TranslationClient.js');
const { HMsg } = await import('../src/ui/HMsg.js');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const FIELD = { name: 'title', dty: 1, type: 'freetext', label: 'Title', multilang: true, max: 1 };

/** A multilang field with a value and its translations. */
function field(options = {}) {
  return new HEditField().attach(document.createElement('div'), {
    field: FIELD,
    state: { values: [{ value: 'Hello', hidden: false }], translations: [{ lang: 'FRE', value: 'Bonjour', hidden: false }] },
    languages: ['ENG', 'FRE', 'GER'],
    ...options
  }).render();
}

/** Run with HMsg.showMsgDlg replaced: the dialog body and buttons are recorded. */
async function withDialog(run) {
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  const dialogs = [];
  HMsg.showMsgDlg = (body, options) => { dialogs.push({ body, ...options }); return null; };
  HMsg.closeMsgDlg = () => {};
  try {
    await run(dialogs);
  } finally {
    HMsg.showMsgDlg = show;
    HMsg.closeMsgDlg = close;
  }
}

test('translations are value rows with the language code before the input; their state as before', () => {
  const widget = field();
  assert.equal(widget._translationRows.length, 1);
  const row = widget._translationRows[0];
  assert.equal(row.input.langCode, 'FRE');
  // in the actions slot, so the input is aligned with the others (2026-10-25); Add / Translate do not remove it
  const actions = row.input.container.querySelector('.h-form-input-actions');
  assert.equal(actions.querySelector('.h-input-text-lang').textContent, 'FRE');
  row.input.setActions([document.createElement('button')]);
  assert.equal(actions.children[0].className, 'h-input-text-lang');
  assert.equal(actions.children.length, 2);
  assert.equal(row.input.getValue(), 'Bonjour');
  assert.ok(row.element.classList.contains('h-edit-field-translation'));
  assert.deepEqual(widget.getState().translations, [{ lang: 'FRE', value: 'Bonjour', hidden: false }]);
  row.input.setValue('Salut');
  assert.deepEqual(widget.getState().translations, [{ lang: 'FRE', value: 'Salut', hidden: false }]);
  // removed: no translation
  row.input.container.dispatchEvent(new CustomEvent('h-input-remove', { bubbles: true }));
  assert.deepEqual(widget.getState().translations, []);
});

test('Insert translated value: the free languages; Insert blank adds an empty row; without a translation service no Translate', async () => {
  await withDialog(async (dialogs) => {
    const widget = field();
    await widget._openTranslateDialog();
    const dialog = dialogs[0];
    assert.equal(dialog.title, 'Insert translated value');
    const select = dialog.body.querySelector('select');
    assert.deepEqual(select.children.map((option) => option.value), ['GER'], 'ENG is the language of the value, FRE is used');
    assert.deepEqual(dialog.buttons.map((button) => button.label), ['Insert blank', 'Cancel']);
    assert.match(dialog.body.textContent, /translation service/);
    select.value = 'GER';
    dialog.buttons[0].onClick();
    assert.deepEqual(widget._translationRows.map((row) => [row.entry.lang, row.input.getValue()]), [['FRE', 'Bonjour'], ['GER', '']]);
  });
});

test('Insert translated value: Translate translates the first value into the chosen language', async () => {
  await withDialog(async (dialogs) => {
    const asked = [];
    const translator = { available: true, translate: async (request) => { asked.push(request); return 'Hallo'; } };
    const widget = field({ translator });
    await widget._openTranslateDialog();
    const dialog = dialogs[0];
    assert.deepEqual(dialog.buttons.map((button) => button.label), ['Translate', 'Insert blank', 'Cancel']);
    dialog.body.querySelector('select').value = 'GER';
    await dialog.buttons[0].onClick();
    await flush();
    assert.deepEqual(asked, [{ string: 'Hello', target: 'GER', format: 'text' }]);
    assert.deepEqual(widget.getState().translations.map((entry) => [entry.lang, entry.value]), [['FRE', 'Bonjour'], ['GER', 'Hallo']]);
  });
});

test('TranslationClient: POST /external/translate of the translation service; errors', async () => {
  const calls = [];
  const apiClient = {
    async request(path, options) {
      calls.push([path, options.method, options.body]);
      return { text: 'Bonjour' };
    }
  };
  const client = new TranslationClient({ apiClient, available: true });
  assert.equal(await client.translate({ string: 'Hello', target: 'FRE', source: 'ENG', format: 'text' }), 'Bonjour');
  assert.deepEqual(calls[0], ['/external/translate', 'POST', { text: 'Hello', target: 'fre', source: 'eng', format: 'text' }]);
  await client.translate({ string: '<p>Hello</p>', target: 'fr' });
  assert.deepEqual(calls[1][2], { text: '<p>Hello</p>', target: 'fr', format: 'html' }, 'html by default, no source: detected');
  await assert.rejects(() => client.translate({ string: 'x'.repeat(5001), target: 'FRE' }), /too long/);
  assert.equal(calls.length, 2, 'a text too long is not sent');
  const failing = new TranslationClient({ apiClient: { request: async () => { throw new Error('Quota exceeded'); } }, available: true });
  await assert.rejects(() => failing.translate({ string: 'x', target: 'FRE' }), /Quota exceeded/);
  assert.equal(new TranslationClient({ apiClient }).available, false, 'no translation service');
  assert.equal(new TranslationClient({ available: true }).available, false, 'no API client');
});
