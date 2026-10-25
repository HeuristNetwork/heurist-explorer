/**
 * @file HInputText.js
 * @brief Single-line and multiline text input for shared forms. A URL input
 *        (`inputType: 'url'`) has an icon after it that opens the address. A translated
 *        value (`langCode: 'FRE'`, plan 25) shows its language code before the input.
 *        A blocktext with `richText` (plan 25) has the links `text · wysiwyg · codeeditor` under it:
 *        the HTML editor (TinyMCE) or the code editor (CodeMirror) is made on demand, one at a
 *        time on the page (richTextEditors.js); `richText.autoWysiwyg` opens a value with HTML in
 *        the HTML editor at once (when no other editor is open).
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

import { HInput } from './HInput.js';
import { HMsg } from '../../../ui/HMsg.js';
import { $HR } from '../../../ui/i18n/HResource.js';
import { TEXT_MODES, activateRichEditor, activeRichEditorOwner, hasHtml, releaseRichEditor } from '../../rich-text/richTextEditors.js';
import './HInputText.css';

/** Edits a plain text value. */
export class HInputText extends HInput {
  /**
   * Create a text box or text area.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLElement} Text control.
   */
  renderControl(host) {
    const multiline = this.options.multiline === true;
    const control = document.createElement(multiline ? 'textarea' : 'input');
    control.className = `h-input h-input-text${multiline ? ' h-input-text-multiline' : ''}`;

    if (multiline) {
      control.rows = Math.max(2, Number(this.options.rows) || 3);
    } else {
      control.type = ['url', 'password'].includes(this.options.inputType) ? this.options.inputType : 'text';
      if (this.options.inputType === 'password') control.autocomplete = 'new-password';
    }

    this.listen(control, 'input', () => {
      this._syncClearButton();
      this._syncLink();
    });
    this._commitOnEnterOrBlur(control, { enter: !multiline });
    // a translation: its language code in the actions slot before the input (plan 25; HInput actionsLead)
    const lang = String(this.options.langCode ?? '').trim().toUpperCase();
    if (lang) {
      const badge = document.createElement('span');
      badge.className = 'h-input-text-lang';
      badge.textContent = lang;
      badge.title = `${$HR('Translation')}: ${lang}`;
      this.actionsLead = badge;
      this.langCode = lang;
    }
    host.append(control);
    if (multiline && this.options.richText) this._renderModes(host);
    if (!multiline && this.options.inputType === 'url') {
      // the address opens in a new tab (also read only: e.g. a download URL)
      this.link = document.createElement('a');
      this.link.className = 'h-input-url-open';
      this.link.target = '_blank';
      this.link.rel = 'noopener noreferrer';
      this.link.title = $HR('Open the link');
      this.link.setAttribute('aria-label', this.link.title);
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-arrow-up-right-from-square';
      icon.setAttribute('aria-hidden', 'true');
      this.link.append(icon);
      host.after(this.link);
    }
    return control;
  }

  /** Show the link icon for an http(s) address only. */
  _syncLink() {
    if (!this.link) return;
    const url = this.getValue().trim();
    const usable = /^https?:\/\/\S+$/i.test(url);
    this.link.hidden = !usable;
    if (usable) this.link.href = url;
    else this.link.removeAttribute('href');
  }

  /** @returns {string} Current text (of the open editor, if any). */
  getValue() {
    if (this.editor) return this.editor.getValue();
    return this.control?.value ?? String(this.value ?? '');
  }

  /**
   * Set the displayed text.
   *
   * @param {*} value Text value.
   * @returns {HInputText} This input.
   */
  setValue(value) {
    // a new value: the editor goes, the text shows it
    if (this.editor) this._closeEditor();
    super.setValue(value);
    if (this.control) this.control.value = String(value ?? '');
    this._syncLink();
    return this;
  }

  /** @returns {string[]} Validation errors. */
  validate() {
    return this.options.required && !this.getValue().trim() ? ['A value is required'] : [];
  }

  /** Read only: no editor and no mode links. */
  setReadOnly(readOnly) {
    super.setReadOnly(readOnly);
    if (readOnly && this.editor) this._closeEditor();
    if (this.modesBar) this.modesBar.hidden = Boolean(readOnly);
    return this;
  }

  /**
   * Show the value as text, in the HTML editor or in the code editor (plan 25). Opening an
   * editor closes the one open elsewhere on the page.
   *
   * @param {'text'|'wysiwyg'|'codeeditor'} mode Mode.
   * @returns {Promise<void>}
   */
  async setTextMode(mode) {
    const rich = this.options.richText;
    if (!rich || !TEXT_MODES.includes(mode) || mode === this.textMode || this._switching) return;
    this._switching = true;
    try {
      this._closeEditor();
      if (mode !== 'text') {
        await activateRichEditor({ owner: this, close: () => this.setTextMode('text') });
        this.control.hidden = true;
        this.editorHost.hidden = false;
        const common = { value: this.control.value, onChange: (value) => this._editorChanged(value) };
        if (mode === 'wysiwyg') {
          const { createTinyMceEditor } = await import('../../rich-text/HTinyMceEditor.js');
          this.editor = await createTinyMceEditor(this.editorHost, {
            ...common, baseUrl: rich.baseUrl, insertMedia: rich.insertMedia, insertRecordLink: rich.insertRecordLink
          });
        } else {
          const { createCodeTextEditor } = await import('../../rich-text/HCodeTextEditor.js');
          this.editor = await createCodeTextEditor(this.editorHost, { ...common, language: rich.codeLanguage || 'html' });
        }
      }
      this.textMode = mode;
    } catch (error) {
      this._closeEditor();
      this.textMode = 'text';
      HMsg.showMsgErr(error?.message || String(error));
    } finally {
      this._switching = false;
      this._syncModes();
    }
  }

  /** @returns {Promise<void>} Completion after the editor is removed. */
  async destroy() {
    this._closeEditor();
    await super.destroy();
  }

  /** The links "text · wysiwyg · codeeditor" under the text area (code fields: no wysiwyg). */
  _renderModes(host) {
    const rich = this.options.richText;
    this.textMode = 'text';
    this.editor = null;
    this.editorHost = document.createElement('div');
    this.editorHost.className = 'h-input-text-editor';
    this.editorHost.hidden = true;
    this.modesBar = document.createElement('div');
    this.modesBar.className = 'h-input-text-modes';
    this.modeLinks = new Map();
    const modes = rich.codeOnly ? ['text', 'codeeditor'] : TEXT_MODES;
    for (const mode of modes) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'h-input-text-mode';
      link.dataset.mode = mode;
      link.textContent = $HR(mode);
      this.listen(link, 'click', () => void this.setTextMode(mode));
      this.modesBar.append(link);
      this.modeLinks.set(mode, link);
    }
    host.append(this.editorHost, this.modesBar);
    this._syncModes();
    // a value with HTML in the HTML editor at once (configuration), when no other editor is open
    if (rich.autoWysiwyg && !rich.codeOnly && hasHtml(this.control.value) && !activeRichEditorOwner()) {
      queueMicrotask(() => { if (!activeRichEditorOwner() && this.container) void this.setTextMode('wysiwyg'); });
    }
  }

  /** Underline the active mode. */
  _syncModes() {
    for (const [mode, link] of this.modeLinks || []) {
      const active = mode === (this.textMode || 'text');
      link.classList.toggle('is-active', active);
      link.setAttribute('aria-pressed', String(active));
    }
  }

  /** The editor changed: the text area keeps the value; the form hears of it after a pause. */
  _editorChanged(value) {
    this.control.value = value;
    this.value = value;
    clearTimeout(this._changeTimer);
    this._changeTimer = setTimeout(() => this.notifyChange(), 300);
  }

  /** Remove the open editor; its value stays in the text area. */
  _closeEditor() {
    if (!this.editor) return;
    const value = this.editor.getValue();
    clearTimeout(this._changeTimer);
    this.editor.destroy();
    this.editor = null;
    this.editorHost?.replaceChildren();
    if (this.editorHost) this.editorHost.hidden = true;
    if (this.control) {
      this.control.hidden = false;
      this.control.value = value;
    }
    this.value = value;
    this.textMode = 'text';
    releaseRichEditor(this);
    this._syncModes();
  }
}
