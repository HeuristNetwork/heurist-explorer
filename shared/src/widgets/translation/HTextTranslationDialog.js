/**
 * @file HTextTranslationDialog.js
 * @brief One popup to edit a rich text and its translations (CMS text blocks, multilingual blocktext fields of
 *        the record editor; plan 27c §26, plan 25). A toolbar above the editor:
 *
 *          [ ] Side by side  [ENG] [FRE] [GER]                       [Show HTML]
 *          [x] Side by side  [ENG v] [Translate =>] | [FRE v]          [Show HTML]
 *
 *        The language buttons work as a radio group (a selector with more than ten languages). Side by side:
 *        the left language is shown read only beside the editor and the right one is edited; the two selectors
 *        exclude each other (choosing the language of the other one swaps them). Translate (the translation
 *        service of the server, when it has one) puts the translation of the left text into the editor. Show
 *        HTML replaces TinyMCE with the code editor. With one language there are no language controls. The
 *        editor fills the popup.
 *
 *   const result = await openTextTranslationDialog({ texts: {eng: '<p>A</p>'}, languages: [{code: 'eng', label: 'ENG'}] });
 *   // result = {texts: {code: html}} with the changed languages only, or null
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
import { languageChooser, languageSelect } from './translationControls.js';
import './HTextTranslationDialog.css';

const DIALOG_ID = 'h-text-translation-dialog';

/**
 * Open the popup.
 *
 * @param {object} options See createTextTranslationForm; also `title` and `dialogId`.
 * @returns {Promise<{texts: Object<string, string>}|null>} The changed languages, or null when cancelled.
 */
export async function openTextTranslationDialog(options = {}) {
  const form = createTextTranslationForm(options);
  const dialogId = options.dialogId || DIALOG_ID;
  const result = new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      done = true;
      HMsg.closeMsgDlg(dialogId);
      resolve(value);
    };
    const dialog = HMsg.showMsgDlg(form.element, {
      dialogId,
      title: $HR(options.title || 'Edit text'),
      buttons: [
        { label: 'OK', class: 'h-btn h-btn-primary', onClick: () => finish(form.read()) },
        { label: 'Cancel', class: 'h-btn', onClick: () => finish(null) }
      ]
    });
    dialog?.classList.add('h-dialog-text-translation');
    dialog?.addEventListener('close', () => {
      dialog.classList.remove('h-dialog-text-translation');
      if (!done) resolve(null);
    }, { once: true });
  });
  // the editor is made in the open dialog (TinyMCE moves its menus into it)
  try {
    await form.start();
  } catch (error) {
    HMsg.showMsgErr?.(error?.message || String(error));
  }
  return result.finally(() => form.destroy());
}

/**
 * The content of the popup.
 *
 * @param {object} options
 * @param {Object<string, string>} [options.texts] HTML by language code; `languages[0]` is the original.
 * @param {Array<{code: string, label: string}>} [options.languages] The languages, the original first; one or
 *        none: no language controls.
 * @param {string} [options.language] Language edited first (default: the original).
 * @param {{available: boolean, translate: Function}|null} [options.translator] TranslationClient.
 * @param {string} [options.baseUrl] Heurist base URL (TinyMCE).
 * @param {Function} [options.insertMedia] TinyMCE Media button.
 * @param {Function} [options.insertRecordLink] TinyMCE Record button.
 * @param {string} [options.codeLanguage='html'] Language of the code editor.
 * @param {boolean} [options.codeOnly] Only the code editor (no Show HTML toggle).
 * @param {{sideBySide?: boolean, showHtml?: boolean}} [options.remember] Read and updated: kept by the caller
 *        between openings.
 * @param {boolean} [options.sideBySide] Side by side for this opening, whatever is remembered (not remembered).
 * @param {string} [options.originalCode] Language of the code '' (the value of a record editor field), sent
 *        to the translation service as the source / target language.
 * @param {Function} [options.createEditor] createTinyMceEditor (default: lazy import; tests).
 * @param {Function} [options.createCodeEditor] createCodeTextEditor (default: lazy import; tests).
 * @returns {{element: HTMLElement, start: () => Promise<void>, read: () => {texts: Object<string, string>},
 *        destroy: () => void}}
 */
export function createTextTranslationForm({
  texts = {}, languages = [], language = null, translator = null, baseUrl = '', insertMedia = null,
  insertRecordLink = null, codeLanguage = 'html', codeOnly = false, remember = {}, originalCode = '', sideBySide = undefined, createEditor = null,
  createCodeEditor = null
} = {}) {
  const list = languages.length ? languages : [{ code: '', label: '' }];
  const codes = list.map((item) => item.code);
  const multilingual = codes.length > 1;
  const initial = new Map(codes.map((code) => [code, String(texts[code] ?? '')]));
  const draft = new Map(initial);
  const canTranslate = Boolean(translator?.available) && multilingual;
  const state = {
    current: codes.includes(language) ? language : codes[0],
    source: null,
    fixed: false,
    html: codeOnly || remember.showHtml === true
  };
  let editor = null;
  let loaded = null; // editor value after loading: unchanged text is not taken (TinyMCE rewrites HTML)
  let destroyed = false;
  let queue = Promise.resolve();

  const root = element('div', 'h-text-translation');
  const toolbar = element('div', 'h-text-translation-toolbar');
  const body = element('div', 'h-text-translation-body');
  const fixedPane = element('div', 'h-text-translation-fixed');
  const host = element('div', 'h-text-translation-host');
  body.append(fixedPane, host);
  root.append(toolbar, body);

  const store = () => {
    if (!editor) return;
    const value = editor.getValue();
    if (value !== loaded) draft.set(state.current, value);
  };

  const load = () => {
    if (!editor) return;
    editor.setValue(draft.get(state.current));
    loaded = editor.getValue();
  };

  // one editor change at a time (Show HTML clicked twice...)
  const serial = (run) => {
    queue = queue.then(run, run);
    return queue;
  };

  const mount = () => serial(async () => {
    store();
    editor?.destroy();
    editor = null;
    host.replaceChildren();
    if (destroyed) return;
    const value = draft.get(state.current);
    if (state.html) {
      const create = createCodeEditor || (await import('../rich-text/HCodeTextEditor.js')).createCodeTextEditor;
      editor = await create(host, { value, language: codeLanguage });
    } else {
      const create = createEditor || (await import('../rich-text/HTinyMceEditor.js')).createTinyMceEditor;
      editor = await create(host, { value, baseUrl, insertMedia, insertRecordLink, fill: true, compact: true });
    }
    if (destroyed) {
      editor.destroy();
      editor = null;
      return;
    }
    loaded = editor.getValue();
    editor.focus?.();
  });

  const renderFixed = () => {
    fixedPane.hidden = !state.fixed;
    fixedPane.replaceChildren();
    if (!state.fixed) return;
    const value = draft.get(state.source);
    if (state.html) {
      const pre = element('pre', 'h-text-translation-raw');
      pre.textContent = value;
      fixedPane.append(pre);
    } else {
      const content = element('div', 'h-text-translation-original');
      content.innerHTML = value;
      fixedPane.append(content);
    }
  };

  const setTarget = (code) => {
    if (code === state.current) return;
    store();
    if (state.fixed && code === state.source) state.source = state.current;
    state.current = code;
    load();
    renderToolbar();
    renderFixed();
  };

  const setSource = (code) => {
    if (code === state.source) return;
    if (code === state.current) {
      store();
      state.current = state.source;
      load();
    }
    state.source = code;
    renderToolbar();
    renderFixed();
  };

  // Side by side: the original on the left; the editor shows a translation (the next language when it showed
  // the original). Returns whether the edited language changed.
  const fixOriginal = () => {
    state.source = codes[0];
    if (state.current !== codes[0]) return false;
    state.current = codes[1];
    return true;
  };

  const setFixed = (fixed) => {
    store();
    state.fixed = fixed && multilingual;
    remember.sideBySide = state.fixed;
    if (state.fixed && fixOriginal()) load();
    body.classList.toggle('is-fixed', state.fixed);
    renderToolbar();
    renderFixed();
  };

  const translate = async (button) => {
    const string = draft.get(state.source);
    if (!string.trim()) {
      HMsg.showMsgFlash?.($HR('The text to translate is empty'), { showDelay: 2000 });
      return;
    }
    const label = button.textContent;
    button.disabled = true;
    button.textContent = $HR('Translating...');
    const target = state.current;
    // code '' (the value itself in the record editor) is the original language
    const sourceCode = state.source || originalCode;
    try {
      const text = await translator.translate({
        string, target: (target || originalCode).toUpperCase(), format: codeOnly ? 'text' : 'html', ...(sourceCode ? { source: sourceCode.toUpperCase() } : {})
      });
      if (destroyed || !editor || state.current !== target) return;
      editor.setValue(text);
    } catch (error) {
      HMsg.showMsgErr?.(error?.message || String(error));
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  };

  function renderToolbar() {
    toolbar.replaceChildren();
    toolbar.classList.toggle('is-fixed', state.fixed);
    const lead = element('span', 'h-text-translation-lead');
    const main = element('span', 'h-text-translation-main');
    if (multilingual) {
      const label = element('label', 'h-text-translation-fix');
      const box = element('input');
      box.type = 'checkbox';
      box.checked = state.fixed;
      box.addEventListener('change', () => setFixed(box.checked));
      const caption = element('span', 'h-i18n');
      caption.textContent = $HR('Side by side');
      label.title = $HR('Show the original read only beside the editor');
      label.append(box, caption);
      lead.append(label);
      if (state.fixed) {
        lead.append(languageSelect({ languages: list, value: state.source, onChange: setSource, title: 'Language shown read only' }).element);
        if (canTranslate) {
          const button = element('button', 'h-btn h-compact h-text-translation-translate');
          button.type = 'button';
          button.textContent = `${$HR('Translate')} ⇒`;
          button.title = $HR('Translate the text on the left into the language of the editor (translation service)');
          button.disabled = !(state.current || originalCode);
          button.addEventListener('click', () => void translate(button));
          lead.append(button);
        }
        main.append(languageSelect({ languages: list, value: state.current, onChange: setTarget, title: 'Language of the editor' }).element);
      } else {
        lead.append(languageChooser({ languages: list, value: state.current, onChange: setTarget }).element);
      }
    }
    main.append(element('span', 'h-text-translation-spacer'));
    if (!codeOnly) {
      const button = element('button', 'h-btn h-compact h-text-translation-mode');
      button.type = 'button';
      button.textContent = $HR(state.html ? 'Show rich editor' : 'Show HTML');
      button.setAttribute('aria-pressed', String(state.html));
      button.addEventListener('click', () => {
        state.html = !state.html;
        remember.showHtml = state.html;
        renderToolbar();
        renderFixed();
        void mount();
      });
      main.append(button);
    }
    toolbar.append(lead, main);
  }

  // `sideBySide` given: for this opening only (a badge of the record editor); else the remembered mode
  state.fixed = (sideBySide ?? remember.sideBySide === true) && multilingual;
  if (state.fixed) fixOriginal(); // before the editor is made: it opens in the translation
  body.classList.toggle('is-fixed', state.fixed);
  renderToolbar();
  renderFixed();

  return {
    element: root,
    start: () => mount(),
    read: () => {
      store();
      const changed = {};
      for (const code of codes) if (draft.get(code) !== initial.get(code)) changed[code] = draft.get(code);
      return { texts: changed };
    },
    destroy: () => {
      destroyed = true;
      editor?.destroy();
      editor = null;
    }
  };
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
