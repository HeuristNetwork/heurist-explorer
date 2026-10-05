/**
 * @file HSmartyEditor.js
 * @brief Smarty template text editor (CodeMirror 6, loaded on first use).
 *
 * One editor for every place Smarty is written: report templates (mode
 * `report`, `$results` loop) and single-record snippets (mode `record`: card
 * reports, calculated fields, later record titles). The mode only changes the
 * starter text and the variables offered by completion; the field tree and the
 * snippet builder are shared as well (HFieldTree, smartySnippetBuilder.js).
 *
 * When CodeMirror cannot be loaded the editor falls back to a plain textarea.
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

import { HBaseWidget } from '../widgets/HBaseWidget.js';
import './HSmartyEditor.css';

/** Smarty template editor. */
export class HSmartyEditor extends HBaseWidget {
  /**
   * @param {HTMLElement} container Editor host.
   * @param {object} [options]
   * @param {string} [options.value=''] Initial text.
   * @param {'report'|'record'} [options.mode='report'] Template kind.
   * @param {boolean} [options.readOnly=false]
   * @param {function(string): void} [options.onChange] Called after each change.
   * @param {function(): void} [options.onSave] Ctrl+S.
   * @param {function(): Array<{label: string, detail?: string}>} [options.completions] Extra variables.
   * @param {Function} [options.loadSetup] Loads `codemirrorSetup.js` (tests).
   * @returns {HSmartyEditor}
   */
  attach(container, options = {}) {
    super.attach(container, { mode: 'report', value: '', ...options });
    this._saved = String(this.options.value ?? '');
    this._value = this._saved;
    this._editor = null;
    this._textarea = null;
    this.container.classList.add('h-smarty-editor');
    return this;
  }

  /**
   * Create the editor (loads CodeMirror).
   *
   * @returns {Promise<HSmartyEditor>}
   */
  async load() {
    const load = this.options.loadSetup || (() => import('./codemirrorSetup.js'));
    try {
      const { createSmartyEditorView } = await load();
      if (!this.container) return this;
      this.container.replaceChildren();
      this._editor = createSmartyEditorView({
        parent: this.container,
        value: this._value,
        readOnly: this.options.readOnly === true,
        completions: this.options.completions,
        onSave: this.options.onSave,
        onChange: (text) => {
          this._value = text;
          this.options.onChange?.(text);
        }
      });
    } catch (error) {
      console.warn('CodeMirror could not be loaded; plain text editor used', error);
      this._createTextarea();
    }
    return this;
  }

  /** The template text. */
  getValue() {
    return this._value;
  }

  /**
   * Replace the text.
   *
   * @param {string} text New text.
   * @param {{saved?: boolean}} [options] `saved`: the new text is the saved state.
   */
  setValue(text, { saved = false } = {}) {
    const value = String(text ?? '');
    this._value = value;
    if (saved) this._saved = value;
    const view = this._editor?.view;
    if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    else if (this._textarea) this._textarea.value = value;
  }

  /**
   * Insert text at the cursor (replacing the selection) and focus the editor.
   *
   * @param {string} text Text to insert.
   */
  insertAtCursor(text) {
    const value = String(text ?? '');
    const view = this._editor?.view;
    if (view) {
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: value },
        selection: { anchor: from + value.length },
        scrollIntoView: true
      });
      view.focus();
      return;
    }
    if (this._textarea) {
      const area = this._textarea;
      const start = area.selectionStart ?? area.value.length;
      const end = area.selectionEnd ?? start;
      area.value = area.value.slice(0, start) + value + area.value.slice(end);
      area.selectionStart = area.selectionEnd = start + value.length;
      this._value = area.value;
      this.options.onChange?.(this._value);
      area.focus?.();
      return;
    }
    this._value += value;
  }

  /** Whether the text differs from the saved text. */
  isModified() {
    return this._value !== this._saved;
  }

  /** Mark the current text as saved. */
  markSaved() {
    this._saved = this._value;
  }

  /** Switch read-only on or off. */
  setReadOnly(flag) {
    this.options.readOnly = flag === true;
    this._editor?.setReadOnly(this.options.readOnly);
    if (this._textarea) this._textarea.readOnly = this.options.readOnly;
  }

  /** Focus the editor. */
  focus() {
    this._editor?.view.focus();
    this._textarea?.focus?.();
  }

  /** Remove the editor. */
  async destroy() {
    this._editor?.view.destroy();
    this._editor = null;
    this._textarea = null;
    this.container?.classList.remove('h-smarty-editor');
    await super.destroy();
  }

  /** Plain textarea fallback. */
  _createTextarea() {
    const area = document.createElement('textarea');
    area.className = 'h-smarty-editor-textarea';
    area.spellcheck = false;
    area.value = this._value;
    area.readOnly = this.options.readOnly === true;
    area.addEventListener('input', () => {
      this._value = area.value;
      this.options.onChange?.(this._value);
    });
    this.container.replaceChildren(area);
    this._textarea = area;
  }
}
