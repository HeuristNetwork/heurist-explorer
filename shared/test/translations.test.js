/**
 * @file translations.test.js
 * @brief Translated values (plan 25): value rows with the language code, the
 *        "Insert translated value" dialog (Translate / Insert blank / Cancel) and
 *        TranslationClient (the legacy translator).
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

test('Insert translated value: the free languages; Insert blank adds an empty row; without DeepL no Translate', async () => {
  await withDialog(async (dialogs) => {
    const widget = field();
    await widget._openTranslateDialog();
    const dialog = dialogs[0];
    assert.equal(dialog.title, 'Insert translated value');
    const select = dialog.body.querySelector('select');
    assert.deepEqual(select.children.map((option) => option.value), ['ENG', 'GER'], 'FRE is used');
    assert.deepEqual(dialog.buttons.map((button) => button.label), ['Insert blank', 'Cancel']);
    assert.match(dialog.body.textContent, /DeepL/);
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
    assert.deepEqual(asked, [{ string: 'Hello', target: 'GER' }]);
    assert.deepEqual(widget.getState().translations.map((entry) => [entry.lang, entry.value]), [['FRE', 'Bonjour'], ['GER', 'Hallo']]);
  });
});

test('TranslationClient: the legacy translator request and its answer; errors', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, Object.fromEntries(init.body), init.method]);
    return { status: 200, json: async () => ({ status: 'ok', data: 'Bonjour' }) };
  };
  const client = new TranslationClient({ baseUrl: 'http://host/heurist', database: 'db', available: true, fetchImpl });
  assert.equal(await client.translate({ string: 'Hello', target: 'FRE', source: 'ENG' }), 'Bonjour');
  assert.deepEqual(calls[0], ['http://host/heurist/hserv/controller/usr_info.php',
    { a: 'translate_string', db: 'db', string: 'Hello', target: 'FRE', source: 'ENG' }, 'POST']);
  const failing = new TranslationClient({
    baseUrl: 'http://host/heurist/', database: 'db', available: true,
    fetchImpl: async () => ({ status: 200, json: async () => ({ status: 'invalid', message: 'Quota exceeded' }) })
  });
  await assert.rejects(() => failing.translate({ string: 'x', target: 'FRE' }), /Quota exceeded/);
  assert.equal(new TranslationClient({ baseUrl: 'http://h/', database: 'db' }).available, false, 'no DeepL key');
});
