/**
 * @file richTextEditors.js
 * @brief The rich editors of blocktext values (plan 25): at most one TinyMCE or CodeMirror
 *        editor is live at a time; opening another returns the previous one to plain text
 *        (its HTML kept). Light helpers only - the editors are loaded on demand.
 *
 *   await activateRichEditor({ owner: input, close: () => input.setTextMode('text') });
 *   releaseRichEditor(input);
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

/** Text modes of a blocktext value. */
export const TEXT_MODES = Object.freeze(['text', 'wysiwyg', 'codeeditor']);

/** The live editor: {owner, close}. */
let active = null;

/**
 * Make an editor the live one: the previous one (of another owner) is closed first.
 *
 * @param {{owner: object, close: () => Promise<void>|void}} entry The new editor.
 * @returns {Promise<void>}
 */
export async function activateRichEditor(entry) {
  const previous = active;
  active = entry;
  if (previous && previous.owner !== entry.owner) await previous.close();
}

/**
 * The owner's editor is closed.
 *
 * @param {object} owner The input.
 * @returns {void}
 */
export function releaseRichEditor(owner) {
  if (active?.owner === owner) active = null;
}

/** @returns {object|null} The owner of the live editor. */
export function activeRichEditorOwner() {
  return active?.owner || null;
}

/**
 * Whether a text has HTML markup (a tag as a browser reads it: "<" and a letter or "/").
 *
 * @param {*} value Text.
 * @returns {boolean}
 */
export function hasHtml(value) {
  return /<\/?[a-z][^>]*>/i.test(String(value ?? ''));
}

/**
 * The HTML of the editor as the value: one plain paragraph is its text (as legacy).
 *
 * @param {string} html Editor content.
 * @returns {string} Value.
 */
export function editorValue(html) {
  const text = String(html ?? '').trim();
  const single = /^<p>([\s\S]*)<\/p>$/.exec(text);
  if (single && !/<\/?(p|div|h[1-6]|ul|ol|table|figure|blockquote|pre)\b/i.test(single[1])) return single[1];
  return text;
}
