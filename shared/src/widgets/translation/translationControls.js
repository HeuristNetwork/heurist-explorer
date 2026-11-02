/**
 * @file translationControls.js
 * @brief Language controls of the translation dialogs (HTextTranslationDialog, HTranslationDialog): a
 *        language chooser (buttons as a radio group, a selector with more than ten languages), a language
 *        selector, and a plain text as HTML for the translation service and back.
 *
 *   const chooser = languageChooser({ languages: [{code: 'eng', label: 'ENG'}], value: 'eng', onChange });
 *   box.append(chooser.element); chooser.value;
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

import { $HR } from '../../ui/i18n/HResource.js';

/** More languages than this: a selector instead of buttons. */
export const MAX_LANGUAGE_BUTTONS = 10;

/**
 * Language buttons that work as a radio group, or a selector when there are more than ten languages.
 *
 * @param {{languages: Array<{code: string, label: string}>, value: string, onChange: (code: string) => void}} options
 * @returns {{element: HTMLElement, value: string}}
 */
export function languageChooser({ languages, value, onChange }) {
  if (languages.length > MAX_LANGUAGE_BUTTONS) return languageSelect({ languages, value, onChange });
  const box = document.createElement('span');
  box.className = 'h-translation-languages';
  box.setAttribute('role', 'radiogroup');
  box.setAttribute('aria-label', $HR('Language'));
  const chooser = { element: box, value };
  const buttons = languages.map((language) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'h-btn h-compact h-translation-language';
    button.dataset.code = language.code;
    button.textContent = language.label;
    button.setAttribute('role', 'radio');
    button.addEventListener('click', () => {
      if (chooser.value === language.code) return;
      chooser.value = language.code;
      sync();
      onChange(language.code);
    });
    box.append(button);
    return button;
  });
  const sync = () => {
    for (const button of buttons) {
      const selected = button.dataset.code === chooser.value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
    }
  };
  sync();
  return chooser;
}

/**
 * A plain text as HTML for the translation service (format html): `& < >` escaped, so the text stays as it is;
 * the marks `<span translate="no">` / `class="notranslate"` typed by the user are kept, so the part inside them
 * is not translated.
 *
 * @param {string} text
 * @returns {string}
 */
export function encodeTextForTranslation(text) {
  const escaped = String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const marked = /&lt;span\b[^&]*?(?:translate=(["'])no\1|class=(["'])[^"']*\bnotranslate\b[^"']*\2)[^&]*?&gt;/gi;
  if (!marked.test(escaped)) return escaped;
  return escaped
    .replace(marked, (tag) => tag.replace(/^&lt;/, '<').replace(/&gt;$/, '>'))
    .replace(/&lt;\/span&gt;/gi, '</span>');
}

/**
 * The answer of the translation service for encodeTextForTranslation as plain text: entities decoded (the marks
 * stay as the user typed them).
 *
 * @param {string} html
 * @returns {string}
 */
export function decodeTranslatedText(html) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(html ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return named[name.toLowerCase()] ?? entity;
  });
}

/**
 * A language selector.
 *
 * @param {{languages: Array<{code: string, label: string}>, value: string, onChange: (code: string) => void,
 *        title?: string}} options
 * @returns {{element: HTMLSelectElement, value: string}}
 */
export function languageSelect({ languages, value, onChange, title = 'Language' }) {
  const select = document.createElement('select');
  select.className = 'h-select h-compact h-translation-select';
  select.title = $HR(title);
  select.setAttribute('aria-label', select.title);
  for (const language of languages) {
    const option = document.createElement('option');
    option.value = language.code;
    option.textContent = language.label;
    select.append(option);
  }
  select.value = value;
  const chooser = { element: select, value };
  select.addEventListener('change', () => {
    chooser.value = select.value;
    onChange(select.value);
  });
  return chooser;
}
