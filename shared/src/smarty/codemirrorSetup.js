/**
 * @file codemirrorSetup.js
 * @brief CodeMirror 6 editor for Smarty templates. Loaded only by HSmartyEditor
 *        (dynamic import), so CodeMirror stays out of the bundles that do not edit templates.
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
import { EditorState, Compartment } from '@codemirror/state';
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { indentWithTab } from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';
import { token, startState, copyState, SMARTY_KEYWORDS } from './smartyTokenizer.js';

/** Smarty + HTML language for CodeMirror. */
export const smartyLanguage = StreamLanguage.define({
  name: 'smarty',
  startState,
  copyState,
  token,
  languageData: { commentTokens: { block: { open: '{*', close: '*}' } } }
});

/** Colours of the Smarty tokens. */
const smartyHighlight = HighlightStyle.define([
  { tag: tags.comment, color: '#8a8a8a', fontStyle: 'italic' },
  { tag: tags.keyword, color: '#7a1fa2', fontWeight: 'bold' },
  { tag: tags.variableName, color: '#1a5fb4' },
  { tag: tags.string, color: '#a31515' },
  { tag: tags.number, color: '#098658' },
  { tag: tags.operator, color: '#555' },
  { tag: tags.bracket, color: '#b5651d', fontWeight: 'bold' },
  { tag: tags.typeName, color: '#116644' },
  { tag: tags.attributeName, color: '#795e26' }
]);

/**
 * Create the editor view.
 *
 * @param {object} options
 * @param {HTMLElement} options.parent Element the editor is placed in.
 * @param {string} options.value Initial text.
 * @param {boolean} [options.readOnly=false]
 * @param {function(string): void} [options.onChange] Called after each change.
 * @param {function(): Array<{label: string, detail?: string}>} [options.completions] Extra completions (field variables).
 * @param {function(): void} [options.onSave] Ctrl+S / Cmd+S.
 * @returns {{view: EditorView, setReadOnly: function(boolean): void}}
 */
export function createSmartyEditorView({ parent, value, readOnly = false, onChange = null, completions = null, onSave = null }) {
  const readOnlyCompartment = new Compartment();
  const saveKeymap = onSave ? [{ key: 'Mod-s', preventDefault: true, run: () => { onSave(); return true; } }] : [];
  const state = EditorState.create({
    doc: value,
    extensions: [
      basicSetup,
      keymap.of([...saveKeymap, indentWithTab]),
      smartyLanguage,
      syntaxHighlighting(smartyHighlight),
      EditorView.lineWrapping,
      autocompletion({ override: [smartyCompletionSource(completions)] }),
      readOnlyCompartment.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange?.(update.state.doc.toString());
      }),
      EditorView.theme({
        '&': { height: '100%', fontSize: '13px' },
        '.cm-scroller': { fontFamily: 'Consolas, "Courier New", monospace' }
      })
    ]
  });
  const view = new EditorView({ state, parent });
  return {
    view,
    setReadOnly(flag) {
      view.dispatch({ effects: readOnlyCompartment.reconfigure([EditorState.readOnly.of(flag), EditorView.editable.of(!flag)]) });
    }
  };
}

/** Completion of Smarty keywords after `{` and of `$...` variables. */
function smartyCompletionSource(extra) {
  return (context) => {
    const variable = context.matchBefore(/\$[\w.]*/);
    if (variable) {
      const options = [
        { label: '$r', detail: 'record', type: 'variable' },
        { label: '$results', detail: 'record ids', type: 'variable' },
        { label: '$heurist', detail: 'report functions', type: 'variable' },
        ...((extra?.() || []).map((item) => ({ type: 'variable', ...item })))
      ];
      return { from: variable.from, options, validFor: /^\$[\w.]*$/ };
    }
    const keyword = context.matchBefore(/\{\/?\w*/);
    if (keyword) {
      const slash = keyword.text.startsWith('{/') ? 2 : 1;
      return {
        from: keyword.from + slash,
        options: SMARTY_KEYWORDS.map((word) => ({ label: word, type: 'keyword' })),
        validFor: /^\w*$/
      };
    }
    return null;
  };
}
