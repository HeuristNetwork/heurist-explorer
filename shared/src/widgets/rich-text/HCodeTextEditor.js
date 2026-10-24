/**
 * @file HCodeTextEditor.js
 * @brief The code editor (CodeMirror 6) of a blocktext value (plan 25): HTML, or JavaScript /
 *        CSS for the CMS script and CSS fields. Loaded on first use (a lazy chunk), as the
 *        legacy "codeeditor" mode of the record editor.
 *
 *   const editor = await createCodeTextEditor(host, { value, language: 'html', onChange });
 *   editor.getValue(); editor.destroy();
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

import { basicSetup } from 'codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { indentWithTab } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';

/** Language support by name. */
const LANGUAGES = Object.freeze({ html: () => html(), javascript: () => javascript(), css: () => css() });

/**
 * Create the editor in a host element.
 *
 * @param {HTMLElement} host Element the editor is put in.
 * @param {{value?: string, language?: 'html'|'javascript'|'css', onChange?: (value: string) => void}} [options]
 * @returns {Promise<{getValue: () => string, focus: () => void, destroy: () => void}>}
 */
export async function createCodeTextEditor(host, { value = '', language = 'html', onChange = null } = {}) {
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: String(value ?? ''),
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        (LANGUAGES[language] || LANGUAGES.html)(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange?.(update.state.doc.toString());
        })
      ]
    })
  });
  return {
    getValue: () => view.state.doc.toString(),
    focus: () => view.focus(),
    destroy: () => view.destroy()
  };
}
