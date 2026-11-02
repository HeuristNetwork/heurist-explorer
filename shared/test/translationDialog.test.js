/**
 * @file translationDialog.test.js
 * @brief HTranslationDialog (plan 25, 27c §26): translations of a single-line value - rows with badges, the
 *        language selector, clear = removed, the original required with translations, Translate (source, HTML,
 *        escaped / decoded), one language without translation features.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';

installFakeDom();
const { createTranslationForm, openTranslationDialog } = await import('../src/widgets/translation/HTranslationDialog.js');
const { encodeTextForTranslation, decodeTranslatedText } = await import('../src/widgets/translation/translationControls.js');
const { HMsg } = await import('../src/ui/HMsg.js');

const messages = [];
HMsg.showMsgFlash = (text) => messages.push(text);
HMsg.showMsgErr = (text) => messages.push(text);

const badges = (form) => form.element.querySelectorAll('.h-input-text-lang').map((badge) => badge.textContent);
const inputs = (form) => form.element.querySelectorAll('input');

test('rows with badges; the selector adds a row and is hidden when no language is left', () => {
  const form = createTranslationForm({ value: 'Hello', translations: { FRE: 'Bonjour' }, languages: ['ENG', 'FRE', 'GER'], original: 'ENG' });
  assert.deepEqual(badges(form), ['ENG', 'FRE']);
  const select = form.element.querySelector('select');
  assert.deepEqual(select.children.map((option) => option.value), ['', 'GER'], 'the original and used languages left out');
  select.value = 'GER';
  select.fire('change');
  assert.deepEqual(badges(form), ['ENG', 'FRE', 'GER']);
  assert.equal(form.element.querySelector('.h-translation-add').hidden, true, 'no language left');
  assert.equal(form.element.querySelector('.h-translation-translate'), null, 'no translation service: no Translate');
  inputs(form)[2].value = 'Hallo';
  assert.deepEqual(form.read(), { value: 'Hello', translations: { FRE: 'Bonjour', GER: 'Hallo' } });
});

test('a cleared translation is not returned; an empty original with translations is refused', () => {
  const form = createTranslationForm({ value: 'Hello', translations: { FRE: 'Bonjour' }, languages: ['FRE'], original: 'ENG' });
  inputs(form)[1].value = '';
  assert.deepEqual(form.read(), { value: 'Hello', translations: {} });
  inputs(form)[1].value = 'Bonjour';
  inputs(form)[0].value = '';
  assert.equal(form.read(), null);
  assert.match(messages.at(-1), /original/);
  const required = createTranslationForm({ value: '', required: true });
  assert.equal(required.read(), null, 'required');
});

test('one language or none: only the original row; no original language: badge "-" and Default', () => {
  const form = createTranslationForm({ value: 'Caption', languages: ['eng'], original: 'eng' });
  assert.deepEqual(badges(form), ['ENG']);
  assert.equal(form.element.querySelector('.h-translation-add').hidden, true);
  const unknown = createTranslationForm({ value: 'x', languages: ['FRE'] });
  const badge = unknown.element.querySelector('.h-input-text-lang');
  assert.equal(badge.textContent, '—');
  assert.equal(badge.title, 'Default');
  assert.deepEqual(badges(createTranslationForm({ value: 'x' })), [], 'no languages at all: no badge');
});

test('Translate: disabled for an empty original; source, HTML and escaped text sent; the answer decoded', async () => {
  const calls = [];
  const translator = { available: true, translate: async (request) => { calls.push(request); return 'Caf&eacute; &lt;b&gt; &amp; <span translate="no">Heurist</span>'; } };
  const form = createTranslationForm({ value: '', translations: { FRE: '' }, languages: ['FRE'], original: 'ENG', translator });
  const [placeholder, button] = form.element.querySelectorAll('.h-translation-translate');
  assert.ok(placeholder.classList.contains('is-placeholder'), 'the original row keeps the place of the button');
  assert.equal(button.disabled, true);
  assert.equal(button.title, 'Enter the original value first');
  inputs(form)[0].value = 'Coffee <b> & <span translate="no">Heurist</span>';
  inputs(form)[0].fire('input');
  assert.equal(button.disabled, false);
  button.click();
  await flush();
  assert.deepEqual(calls, [{ string: 'Coffee &lt;b&gt; &amp; <span translate="no">Heurist</span>', target: 'FRE', source: 'ENG', format: 'html' }]);
  assert.equal(inputs(form)[1].value, 'Caf&eacute; <b> & <span translate="no">Heurist</span>', 'known entities decoded, the mark kept');
});

test('encode / decode helpers', () => {
  assert.equal(encodeTextForTranslation('a < b & c'), 'a &lt; b &amp; c');
  assert.equal(encodeTextForTranslation('<span class="x notranslate">N</span> <i>'), '<span class="x notranslate">N</span> &lt;i&gt;');
  assert.equal(decodeTranslatedText('&#39;a&#x27; &quot;b&quot; &nbsp;'), '\'a\' "b"  ');
});

test('the popup: OK with a refused value stays open; Cancel gives null', async () => {
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  const dialogs = [];
  HMsg.showMsgDlg = (body, options) => { dialogs.push({ body, ...options }); return null; };
  HMsg.closeMsgDlg = () => {};
  try {
    const answer = openTranslationDialog({ title: 'Caption', value: '', translations: { fre: 'Accueil' }, languages: ['eng', 'fre'], original: 'eng' });
    dialogs[0].buttons[0].onClick();
    let settled = false;
    void answer.then(() => { settled = true; });
    await flush();
    assert.equal(settled, false, 'empty original with a translation: stays open');
    dialogs[0].body.querySelectorAll('input')[0].value = 'Home';
    dialogs[0].buttons[0].onClick();
    assert.deepEqual(await answer, { value: 'Home', translations: { fre: 'Accueil' } });
    const cancelled = openTranslationDialog({ value: 'x' });
    dialogs[1].buttons[1].onClick();
    assert.equal(await cancelled, null);
  } finally {
    HMsg.showMsgDlg = show;
    HMsg.closeMsgDlg = close;
  }
});
