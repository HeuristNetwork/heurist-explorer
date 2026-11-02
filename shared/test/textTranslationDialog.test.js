/**
 * @file textTranslationDialog.test.js
 * @brief The text and translations popup (HTextTranslationDialog, plan 27c §26 / plan 25): language buttons or
 *        a selector, Fix original with two exclusive selectors, Translate, Show HTML, changed languages only;
 *        the record editor's multilingual blocktext (link "editor", changes applied to the rows).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';

const document = installFakeDom();
const { createTextTranslationForm, openTextTranslationDialog } = await import('../src/widgets/translation/HTextTranslationDialog.js');
const { HEditField } = await import('../src/widgets/edit-form/HEditField.js');
const { HMsg } = await import('../src/ui/HMsg.js');

// no TinyMCE in node: the record editor's popup reports the failed import (also after a test ended)
HMsg.showMsgErr = () => {};

const LANGUAGES = [{ code: 'eng', label: 'ENG' }, { code: 'fre', label: 'FRE' }, { code: 'ger', label: 'GER' }];

/** A fake editor; `kind` tells TinyMCE from the code editor. */
function fakeEditors() {
  const made = [];
  const factory = (kind) => async (host, { value }) => {
    const editor = {
      kind,
      value,
      getValue: () => editor.value,
      setValue: (text) => { editor.value = text; },
      focus() {},
      destroy() { editor.destroyed = true; }
    };
    made.push(editor);
    return editor;
  };
  return { made, createEditor: factory('tiny'), createCodeEditor: factory('code'), last: () => made[made.length - 1] };
}

async function form(options = {}) {
  const editors = fakeEditors();
  const remember = options.remember || {};
  const value = createTextTranslationForm({
    texts: { eng: '<p>Hello</p>', fre: '<p>Bonjour</p>' },
    languages: LANGUAGES,
    createEditor: editors.createEditor,
    createCodeEditor: editors.createCodeEditor,
    ...options,
    remember
  });
  await value.start();
  return { form: value, editors, remember, toolbar: value.element.querySelector('.h-text-translation-toolbar') };
}

const buttonsOf = (toolbar) => toolbar.querySelectorAll('.h-translation-language');
const selectsOf = (toolbar) => toolbar.querySelectorAll('select');

test('one language: no language controls, only Show HTML; the editor fills the popup', async () => {
  const { toolbar, editors, form: value } = await form({ languages: [{ code: 'eng', label: 'ENG' }], texts: { eng: 'A' } });
  assert.equal(buttonsOf(toolbar).length, 0);
  assert.equal(toolbar.querySelector('input'), null, 'no Fix original');
  assert.equal(toolbar.querySelector('.h-text-translation-mode').textContent, 'Show HTML');
  assert.equal(editors.last().kind, 'tiny');
  assert.deepEqual(value.read(), { texts: {} });
});

test('language buttons are a radio group; switching keeps the draft; only changed languages are returned', async () => {
  const { toolbar, editors, form: value } = await form({ language: 'fre' });
  const editor = editors.last();
  assert.equal(editor.value, '<p>Bonjour</p>', 'opens in the given language');
  assert.deepEqual(buttonsOf(toolbar).map((button) => button.getAttribute('aria-checked')), ['false', 'true', 'false']);
  editor.value = '<p>Salut</p>';
  buttonsOf(toolbar)[2].click();
  assert.equal(editor.value, '', 'a language without a translation is empty');
  editor.value = '<p>Hallo</p>';
  buttonsOf(toolbar)[1].click();
  assert.equal(editor.value, '<p>Salut</p>', 'the draft of the language');
  assert.deepEqual(value.read(), { texts: { fre: '<p>Salut</p>', ger: '<p>Hallo</p>' } });
});

test('more than ten languages: a selector', async () => {
  const languages = Array.from({ length: 11 }, (_, index) => ({ code: `l${index}`, label: `L${index}` }));
  const { toolbar } = await form({ languages, texts: {} });
  assert.equal(buttonsOf(toolbar).length, 0);
  assert.equal(selectsOf(toolbar).length, 1);
  assert.equal(selectsOf(toolbar)[0].children.length, 11);
});

test('Fix original: the original read only on the left, two exclusive selectors; remembered', async () => {
  const { form: value, editors, remember } = await form({ language: 'fre' });
  const editor = editors.last();
  const box = value.element.querySelector('.h-text-translation-toolbar').querySelector('input');
  box.checked = true;
  box.fire('change');
  assert.equal(remember.fixOriginal, true);
  const toolbar = value.element.querySelector('.h-text-translation-toolbar');
  assert.ok(toolbar.classList.contains('is-fixed'));
  const fixed = value.element.querySelector('.h-text-translation-fixed');
  assert.equal(fixed.hidden, false);
  assert.equal(fixed.querySelector('.h-text-translation-original').innerHTML, '<p>Hello</p>');
  let [source, target] = selectsOf(toolbar);
  assert.equal(source.value, 'eng');
  assert.equal(target.value, 'fre');
  // the language of the other selector swaps them
  editor.value = '<p>Salut</p>';
  source.value = 'fre';
  source.fire('change');
  [source, target] = selectsOf(value.element.querySelector('.h-text-translation-toolbar'));
  assert.equal(source.value, 'fre');
  assert.equal(target.value, 'eng');
  assert.equal(editor.value, '<p>Hello</p>', 'the editor shows the other language');
  assert.equal(fixed.querySelector('.h-text-translation-original').innerHTML, '<p>Salut</p>', 'the edited draft on the left');
  assert.deepEqual(value.read(), { texts: { fre: '<p>Salut</p>' } });
});

test('Fix original remembered from an earlier opening; on the original the second language is fixed', async () => {
  const { form: value } = await form({ remember: { fixOriginal: true } });
  const [source, target] = selectsOf(value.element.querySelector('.h-text-translation-toolbar'));
  assert.equal(target.value, 'eng');
  assert.equal(source.value, 'fre');
});

test('Translate: only with a translator; the translation of the left text goes into the editor', async () => {
  const none = await form({ remember: { fixOriginal: true }, language: 'fre' });
  assert.equal(none.toolbar.querySelector('.h-text-translation-translate'), null, 'no translation service: no Translate');

  const calls = [];
  const translator = { available: true, translate: async (request) => { calls.push(request); return '<p>Bonjour !</p>'; } };
  const { form: value, editors } = await form({ remember: { fixOriginal: true }, language: 'fre', translator });
  const button = value.element.querySelector('.h-text-translation-translate');
  button.click();
  await flush();
  assert.deepEqual(calls, [{ string: '<p>Hello</p>', target: 'FRE', format: 'html', source: 'ENG' }]);
  assert.equal(editors.last().value, '<p>Bonjour !</p>');
  assert.deepEqual(value.read(), { texts: { fre: '<p>Bonjour !</p>' } });
});

test('Show HTML: the code editor with the current value, raw HTML on the fixed side; code only: no toggle', async () => {
  const { form: value, editors, remember } = await form({ remember: { fixOriginal: true }, language: 'fre' });
  editors.last().value = '<p>Salut</p>';
  const toggle = value.element.querySelector('.h-text-translation-mode');
  toggle.click();
  await flush();
  assert.equal(remember.showHtml, true);
  assert.equal(editors.last().kind, 'code');
  assert.equal(editors.last().value, '<p>Salut</p>');
  assert.equal(editors.made[0].destroyed, true);
  assert.equal(value.element.querySelector('.h-text-translation-raw').textContent, '<p>Hello</p>');
  assert.equal(value.element.querySelector('.h-text-translation-mode').textContent, 'Show rich editor');

  const code = await form({ codeOnly: true });
  assert.equal(code.editors.last().kind, 'code');
  assert.equal(code.toolbar.querySelector('.h-text-translation-mode'), null);
});

test('the popup: OK gives the changed languages, Cancel null', async () => {
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  const dialogs = [];
  HMsg.showMsgDlg = (body, options) => { dialogs.push({ body, ...options }); return null; };
  HMsg.closeMsgDlg = () => {};
  try {
    const editors = fakeEditors();
    const open = (extra = {}) => openTextTranslationDialog({ texts: { eng: 'A' }, languages: LANGUAGES, createEditor: editors.createEditor, ...extra });
    const answer = open({ title: 'Text' });
    await flush();
    assert.equal(dialogs[0].title, 'Text');
    editors.last().value = 'B';
    dialogs[0].buttons[0].onClick();
    assert.deepEqual(await answer, { texts: { eng: 'B' } });
    assert.equal(editors.last().destroyed, true);
    const cancelled = open();
    await flush();
    dialogs[1].buttons[1].onClick();
    assert.equal(await cancelled, null);
  } finally {
    HMsg.showMsgDlg = show;
    HMsg.closeMsgDlg = close;
  }
});

test('record editor: a multilingual blocktext has the link "editor"; the popup result changes the rows', () => {
  const widget = new HEditField().attach(document.createElement('div'), {
    field: { name: 'text', dty: 3, type: 'blocktext', label: 'Text', multilang: true, max: 1 },
    state: { values: [{ value: 'Hello', hidden: false }], translations: [{ lang: 'FRE', value: 'Bonjour', hidden: false }, { lang: 'GER', value: 'Hallo', hidden: false }] },
    languages: ['FRE', 'GER', 'SPA'],
    richText: { baseUrl: '' }
  }).render();
  assert.ok(widget.container.querySelector('.h-input-text-popup'), 'the link "editor"');
  assert.equal(typeof widget._richTextOptions().openDialog, 'function');
  widget._applyTexts({ '': 'Hi', FRE: 'Salut', GER: '', SPA: 'Hola' });
  assert.deepEqual(widget.getState().values.map((entry) => entry.value), ['Hi']);
  assert.deepEqual(widget.getState().translations, [{ lang: 'FRE', value: 'Salut', hidden: false }, { lang: 'SPA', value: 'Hola', hidden: false }],
    'changed, removed (empty) and added');

  const readOnly = new HEditField().attach(document.createElement('div'), {
    field: { name: 'text', dty: 3, type: 'blocktext', label: 'Text', multilang: true, max: 1, readOnly: true },
    state: { values: [{ value: 'Hello', hidden: false }], translations: [] },
    richText: { baseUrl: '' }
  }).render();
  assert.equal(readOnly._richTextOptions().openDialog, undefined, 'read only: no popup');
});

test('record editor: the value is in the first language of the setting; a row in that language is still shown', async () => {
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  const dialogs = [];
  HMsg.showMsgDlg = (body, options) => { dialogs.push({ body, ...options }); return null; };
  HMsg.closeMsgDlg = () => {};
  const labels = (dialog) => dialog.body.querySelectorAll('.h-translation-language').map((button) => button.textContent);
  try {
    const fieldOf = (translations, languages) => new HEditField().attach(document.createElement('div'), {
      field: { name: 'text', dty: 3, type: 'blocktext', label: 'Text', multilang: true, max: 1 },
      state: { values: [{ value: 'Hello', hidden: false }], translations },
      languages,
      richText: { baseUrl: '' }
    }).render();
    const widget = fieldOf([{ lang: 'FRE', value: 'Bonjour', hidden: false }], ['ENG', 'FRE', 'GER']);
    assert.deepEqual(widget._freeLanguages(), ['GER'], 'no translation into the language of the value');
    void widget._openTextDialog('');
    await flush();
    assert.deepEqual(labels(dialogs[0]), ['ENG', 'FRE', 'GER']);
    assert.equal(dialogs[0].body.querySelectorAll('.h-translation-language')[0].dataset.code, '', 'ENG is the value itself');
    dialogs[0].buttons[1].onClick();

    const tagged = fieldOf([{ lang: 'ENG', value: 'Hello (tagged)', hidden: false }], ['ENG', 'FRE']);
    void tagged._openTextDialog('');
    await flush();
    assert.deepEqual(labels(dialogs[1]), ['ENG', 'FRE', 'ENG'], 'an existing ENG row is not hidden');
    dialogs[1].buttons[1].onClick();

    const none = fieldOf([], []);
    void none._openTextDialog('');
    await flush();
    const select = dialogs[2].body.querySelector('select');
    assert.equal(select.children[0].textContent, 'Default', 'no setting: Default, then the 11 built-in languages (a selector)');
    assert.equal(select.children[1].textContent, 'ENG');
    dialogs[2].buttons[1].onClick();
  } finally {
    HMsg.showMsgDlg = show;
    HMsg.closeMsgDlg = close;
  }
});
