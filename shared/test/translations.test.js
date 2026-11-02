/**
 * @file translations.test.js
 * @brief Translated values (plan 25): value rows with the language code, the translation popup of
 *        single-line fields, the switch "Show translations" and TranslationClient (the translation
 *        service of the server).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
const { HEditField } = await import('../src/widgets/edit-form/HEditField.js');
const { TranslationClient } = await import('../src/data/TranslationClient.js');
const { HMsg } = await import('../src/ui/HMsg.js');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
// no TinyMCE in node: the text popup reports the failed import (also after a test ended)
HMsg.showMsgErr = () => {};
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
  assert.ok(actions.children[0].classList.contains('h-input-text-lang'));
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

test('the language icon of a single-line field opens the translation popup; the result changes the rows, hidden kept', async () => {
  await withDialog(async (dialogs) => {
    const widget = field({ state: { values: [{ value: 'Hello', hidden: false }], translations: [{ lang: 'FRE', value: 'Bonjour', hidden: true }, { lang: 'GER', value: 'Hallo', hidden: false }] } });
    const icon = widget.container.querySelector('.h-edit-field-translate');
    icon.click();
    await flush();
    const dialog = dialogs[0];
    assert.equal(dialog.title, 'Title');
    const badges = dialog.body.querySelectorAll('.h-input-text-lang').map((badge) => badge.textContent);
    assert.deepEqual(badges, ['ENG', 'FRE', 'GER'], 'the original in ENG, then the translations');
    const inputs = dialog.body.querySelectorAll('input');
    inputs[1].value = 'Salut';
    inputs[2].value = '';
    dialog.buttons[0].onClick();
    await flush();
    assert.deepEqual(widget.getState().translations, [{ lang: 'FRE', value: 'Salut', hidden: true }], 'changed (hidden kept), GER removed');
  });
});

test('translation rows are hidden by default; the switch of a field shows them in the whole form', async () => {
  const { HEditForm } = await import('../src/widgets/edit-form/HEditForm.js');
  const told = [];
  const form = new HEditForm().attach(document.createElement('div'), {
    form: { groups: [{ id: 'g', label: 'G', children: [FIELD, { ...FIELD, name: 'subtitle', dty: 2, label: 'Subtitle' }] }] },
    values: { title: 'Hello', subtitle: 'Sub' },
    languages: ['ENG', 'FRE'],
    onShowTranslations: (show) => told.push(show)
  }).render();
  const hosts = () => form.container.querySelectorAll('.h-edit-field-translations');
  assert.deepEqual(hosts().map((host) => host.hidden), [true, true]);
  const toggle = form.container.querySelectorAll('.h-edit-field-translations-toggle')[1];
  assert.equal(toggle.title, 'Show translations');
  toggle.click();
  assert.deepEqual(hosts().map((host) => host.hidden), [false, false], 'all fields');
  assert.deepEqual(told, [true]);
  assert.equal(form.container.querySelectorAll('.h-edit-field-translations-toggle')[0].title, 'Hide translations');
});

test('a translation badge opens the popup at its language; rich text: side by side for that opening only', async () => {
  await withDialog(async (dialogs) => {
    const widget = field();
    const badge = widget._translationRows[0].input.container.querySelector('.h-input-text-lang');
    assert.equal(badge.tagName, 'BUTTON');
    badge.click();
    await flush();
    const inputs = dialogs[0].body.querySelectorAll('input');
    assert.equal(document.activeElement, inputs[1], 'the cursor in the FRE row');
    dialogs[0].buttons[1].onClick();

    const text = new HEditField().attach(document.createElement('div'), {
      field: { name: 'text', dty: 3, type: 'blocktext', label: 'Text', multilang: true, max: 1 },
      state: { values: [{ value: '<p>Hello</p>', hidden: false }], translations: [{ lang: 'FRE', value: '<p>Bonjour</p>', hidden: false }] },
      languages: ['ENG', 'FRE', 'GER'],
      richText: { baseUrl: '' }
    }).render();
    text._translationRows[0].input.container.querySelector('.h-input-text-lang').click();
    await flush();
    const [source, target] = dialogs[1].body.querySelectorAll('select');
    assert.equal(source.value, '', 'the value (ENG) on the left');
    assert.equal(target.value, 'FRE', 'the clicked language in the editor');
    assert.equal(dialogs[1].body.querySelector('.h-text-translation-original').innerHTML, '<p>Hello</p>');
    dialogs[1].buttons[1].onClick();
    // the language icon: the remembered mode (not side by side)
    text.container.querySelector('.h-edit-field-translate').click();
    await flush();
    assert.equal(dialogs[2].body.querySelectorAll('select').length, 0, 'side by side was not remembered');
    dialogs[2].buttons[1].onClick();
  });
});

test('read only: the badge is a plain label', () => {
  const widget = field({ readOnly: true });
  assert.equal(widget._translationRows[0].input.container.querySelector('.h-input-text-lang').tagName, 'SPAN');
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
