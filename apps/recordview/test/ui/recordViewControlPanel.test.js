/**
 * @file recordViewControlPanel.test.js
 * @brief Tests `.heurist-source-header` caption rendering, source-level (see
 *        `recordViewRenderer.test.js` for why this project tests DOM-building code this way).
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panelSource = await readFile(new URL("../../src/ui/RecordViewControlPanel.js", import.meta.url), "utf8");

test("the record's own title is rendered as sanitized HTML, matching the builtin engine's header", () => {
  assert.match(panelSource, /import \{ sanitizeTextHtml \} from "..\/core\/FieldValueFormatter\.js"/);
  assert.match(panelSource, /this\.sourceHeader\.innerHTML = sanitizeTextHtml\(fallbackTitle\)/);
});

test("a configured headerTitle stays plain text, not HTML", () => {
  assert.match(panelSource, /if \(headerTitle\) \{\s*this\.sourceHeader\.textContent = headerTitle;/);
});
