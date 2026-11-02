/**
 * @file HTranslationDialog.js
 * @brief Translations of a single-line value in a popup (record editor freetext fields, CMS captions; plan 25,
 *        27c §26):
 *
 *          [ENG] [Value          ] [x]
 *          [FRE] [Valeur         ] [x] [translate]
 *          [Add a language v]
 *
 *        The first row is the original (the value without a language). A language chosen in the selector adds
 *        its row above it; the selector is hidden when no language is left. With a translation service each
 *        translation row has a Translate button (from the original; not for an empty original). The text is
 *        sent as HTML (escaped) so that `<span translate="no">` keeps a part untranslated. Without other
 *        languages only the original row is shown.
 *
 *   const result = await openTranslationDialog({ value: 'Hello', translations: {FRE: 'Bonjour'}, languages: ['FRE', 'GER'], original: 'ENG' });
 *   // result = {value, translations: {code: text}} with the non-empty translations, or null
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';
import { HInputText } from '../form/inputs/HInputText.js';
import { decodeTranslatedText, encodeTextForTranslation, languageSelect } from './translationControls.js';
import './HTranslationDialog.css';

const DIALOG_ID = 'h-translation-dialog';

/**
 * Open the popup.
 *
 * @param {object} options See createTranslationForm; also `title` and `dialogId`.
 * @returns {Promise<{value: string, translations: Object<string, string>}|null>} null when cancelled.
 */
export function openTranslationDialog(options = {}) {
  const dialogId = options.dialogId || DIALOG_ID;
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      done = true;
      HMsg.closeMsgDlg(dialogId);
      resolve(value);
    };
    const submit = () => {
      const value = form.read();
      if (value) finish(value);
    };
    const form = createTranslationForm({ ...options, onSubmit: submit });
    const dialog = HMsg.showMsgDlg(form.element, {
      dialogId,
      title: $HR(options.title || 'Translations'),
      buttons: [
        { label: 'OK', class: 'h-btn h-btn-primary', onClick: submit },
        { label: 'Cancel', class: 'h-btn', onClick: () => finish(null) }
      ]
    });
    dialog?.classList.add('h-dialog-translation');
    dialog?.addEventListener('close', () => {
      dialog.classList.remove('h-dialog-translation');
      form.destroy();
      if (!done) resolve(null);
    }, { once: true });
    form.focus();
  });
}

/**
 * The content of the popup.
 *
 * @param {object} options
 * @param {string} [options.value] The original value.
 * @param {Object<string, string>} [options.translations] Translations by language code.
 * @param {string[]} [options.languages] Languages offered for translations (the original is left out).
 * @param {string} [options.original] Language of the original value ('' = not known: badge "—").
 * @param {{available: boolean, translate: Function}|null} [options.translator] TranslationClient.
 * @param {number} [options.maxLength] Longest value (all inputs).
 * @param {boolean} [options.required] The original can not be empty.
 * @param {string} [options.language] The input of this translation gets the cursor (else the original).
 * @param {() => void} [options.onSubmit] Enter in an input.
 * @returns {{element: HTMLElement, read: () => ({value: string, translations: Object<string, string>}|null),
 *        focus: () => void, destroy: () => void}}
 */
export function createTranslationForm({
  value = '', translations = {}, languages = [], original = '', translator = null, maxLength = 0,
  required = false, language = '', onSubmit = null
} = {}) {
  const originalKey = String(original ?? '').toUpperCase();
  const offered = [...new Set(languages.map(String))].filter((code) => code.toUpperCase() !== originalKey);
  const canTranslate = Boolean(translator?.available);
  const rows = [];

  const root = element('div', 'h-translation');
  const list = element('div', 'h-translation-rows');
  const adder = element('div', 'h-translation-add');
  root.append(list, adder);

  const makeInput = (host, text, code) => {
    const input = new HInputText().attach(host, {
      value: text, langCode: code, suppressLabel: true, valueTools: true, visibilityToggle: false
    }).render();
    if (maxLength > 0 && input.control) input.control.maxLength = maxLength;
    input.control?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onSubmit?.();
      }
    });
    return input;
  };

  // the original row
  const originalRow = element('div', 'h-translation-row h-translation-original');
  const originalHost = element('div', 'h-translation-input');
  originalRow.append(originalHost);
  list.append(originalRow);
  // no language at all (a website without languages): no badge
  const multilingual = Boolean(originalKey) || offered.length > 0 || Object.keys(translations || {}).length > 0;
  const originalInput = makeInput(originalHost, String(value ?? ''), multilingual ? originalKey || '—' : '');
  if (originalInput.actionsLead) originalInput.actionsLead.title = originalKey ? `${$HR('Original')}: ${originalKey}` : $HR('Default');

  const syncTranslate = () => {
    const empty = !originalInput.getValue().trim();
    for (const row of rows) {
      if (!row.button || row.busy) continue;
      row.button.disabled = empty;
      row.button.title = $HR(empty ? 'Enter the original value first' : 'Translate from original language');
      row.button.setAttribute('aria-label', row.button.title);
    }
  };
  if (canTranslate) {
    // the place of the Translate button of the other rows: the inputs are as wide
    const placeholder = element('span', 'heurist-icon-button h-translation-translate is-placeholder');
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.append(element('i', 'fa-solid fa-language'));
    originalRow.append(placeholder);
  }
  originalInput.control?.addEventListener('input', syncTranslate);
  originalInput.container.addEventListener('h-input-change', syncTranslate);

  const translate = async (row) => {
    const string = originalInput.getValue().trim();
    if (!string || row.busy) return;
    row.busy = true;
    row.button.disabled = true;
    row.icon.classList.add('fa-spin');
    row.input.setReadOnly(true);
    try {
      const text = await translator.translate({
        string: encodeTextForTranslation(string),
        target: row.code.toUpperCase(),
        ...(originalKey ? { source: originalKey } : {}),
        format: 'html'
      });
      row.input.setValue(decodeTranslatedText(text));
    } catch (error) {
      HMsg.showMsgErr?.(error?.message || String(error));
    } finally {
      row.busy = false;
      row.icon.classList.remove('fa-spin');
      row.input.setReadOnly(false);
      syncTranslate();
    }
  };

  const addRow = (code, text) => {
    const row = { code, element: element('div', 'h-translation-row') };
    const host = element('div', 'h-translation-input');
    row.element.append(host);
    list.append(row.element);
    row.input = makeInput(host, text, code.toUpperCase());
    if (canTranslate) {
      row.button = element('button', 'heurist-icon-button h-translation-translate');
      row.button.type = 'button';
      row.icon = element('i', 'fa-solid fa-language');
      row.icon.setAttribute('aria-hidden', 'true');
      row.button.append(row.icon);
      row.button.addEventListener('click', () => void translate(row));
      row.element.append(row.button);
    }
    rows.push(row);
    return row;
  };

  for (const [code, text] of Object.entries(translations || {})) addRow(code, String(text ?? ''));

  const renderAdder = () => {
    adder.replaceChildren();
    const used = new Set(rows.map((row) => row.code.toUpperCase()));
    const free = offered.filter((code) => !used.has(code.toUpperCase()));
    adder.hidden = !free.length;
    if (!free.length) return;
    const chooser = languageSelect({
      languages: [{ code: '', label: $HR('Add a language') }, ...free.map((code) => ({ code, label: code.toUpperCase() }))],
      value: '',
      title: 'Add a translation in this language',
      onChange: (code) => {
        if (!code) return;
        const row = addRow(code, '');
        renderAdder();
        syncTranslate();
        row.input.control?.focus?.();
      }
    });
    adder.append(chooser.element);
  };

  renderAdder();
  syncTranslate();

  return {
    element: root,
    read: () => {
      const result = { value: originalInput.getValue(), translations: {} };
      for (const row of rows) {
        const text = row.input.getValue();
        if (text.trim()) result.translations[row.code] = text;
      }
      if (!result.value.trim() && (required || Object.keys(result.translations).length)) {
        HMsg.showMsgFlash?.($HR(required ? 'A value is required' : 'Enter the original value: translations need it'), { showDelay: 2500 });
        originalInput.control?.focus?.();
        return null;
      }
      return result;
    },
    focus: () => {
      const row = language ? rows.find((item) => item.code.toUpperCase() === String(language).toUpperCase()) : null;
      (row?.input || originalInput).control?.focus?.();
    },
    destroy: () => {
      void originalInput.destroy();
      for (const row of rows) void row.input.destroy();
    }
  };
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
