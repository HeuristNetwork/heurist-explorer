/**
 * @file recordViewRenderer.test.js
 * @brief Tests the `builtin` engine's header/media/sections/footer rendering, source-level
 *        (matching this project's DOM-renderer test convention — see `apps/map/test/ui/legend.test.js`
 *        — since the test tree has no DOM/jsdom dependency).
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

const rendererSource = await readFile(new URL("../../src/ui/RecordViewRenderer.js", import.meta.url), "utf8");

test("record type icon uses the legacy ?db=&icon= convention", () => {
  assert.match(rendererSource, /\?db=\$\{encodeURIComponent\(this\.database\)\}&icon=\$\{recordTypeId\}/);
});

test("file thumbnails use the legacy ?db=&thumb= convention", () => {
  assert.match(rendererSource, /\?db=\$\{encodeURIComponent\(this\.database\)\}&thumb=\$\{encodeURIComponent\(fileId\)\}/);
});

test("image files link to OpenSeadragon; everything else links to Mirador", () => {
  assert.match(rendererSource, /openSeadragonViewer\.php\?db=\$\{encodeURIComponent\(this\.database\)\}&recID=/);
  assert.match(rendererSource, /miradorViewer\.php\?db=\$\{encodeURIComponent\(this\.database\)\}&id=/);
  assert.match(rendererSource, /const isImage = String\(file\.fxm_MimeType \|\| ""\)\.startsWith\("image\/"\)/);
  assert.match(rendererSource, /if \(isImage\) \{\s*link\.href = this\.#osdUrl\(fileId\);/);
});

test("the edit button only renders when canEdit is true, and calls onEdit with the record id", () => {
  assert.match(rendererSource, /if \(canEdit\) \{/);
  assert.match(rendererSource, /edit\.addEventListener\("click", \(\) => onEdit\(record\?\.rec_ID\)\)/);
});

test("media items are built only from file-type fields, keyed by detail-type id", () => {
  assert.match(rendererSource, /if \(field\.type !== "file"\) continue;/);
  assert.match(rendererSource, /record\?\.details\?\.\[String\(field\.id\)\]/);
});

test("sections skip file-type fields (already shown in the media strip) and drop empty sections", () => {
  assert.match(rendererSource, /if \(field\.type === "file"\) continue;/);
  assert.match(rendererSource, /if \(!rows\.length\) continue;/);
});

test("resource-field values render as links that call onNavigate with rec_ID, not a request", () => {
  assert.match(rendererSource, /if \(field\.type === "resource"\) \{/);
  assert.match(rendererSource, /if \(value\?\.rec_ID\) onNavigate\(value\.rec_ID\)/);
  assert.match(rendererSource, /value\?\.rec_Title \|\| `#\$\{value\?\.rec_ID/);
});

test("non-resource, non-file, non-blocktext fields render plain text via the shared FieldValueFormatter", () => {
  assert.match(rendererSource, /import \{ fieldValues, sanitizeTextHtml, looksLikeJson \} from "..\/core\/FieldValueFormatter\.js"/);
  assert.match(rendererSource, /line\.textContent = String\(text \?\? ""\)/);
});

test("blocktext fields render sanitized HTML (u/i/b/strong/em/p), or a system-format notice when the content is JSON", () => {
  assert.match(rendererSource, /field\.type === "blocktext"/);
  assert.match(rendererSource, /looksLikeJson\(plain\)/);
  assert.match(rendererSource, /\$HR\("Data in system format"\)/);
  assert.match(rendererSource, /sanitizeTextHtml\(plain, \{ extraTags: \["p"\] \}\)/);
});

test("the record title is rendered as sanitized HTML (u/i/b/strong/em), not plain text", () => {
  assert.match(rendererSource, /title\.innerHTML = sanitizeTextHtml\(record\?\.rec_Title/);
});

test("each field value renders on its own line, so the label sits inline with the first value", () => {
  assert.match(rendererSource, /heurist-recordview-value-line/);
});

test("the footer shows created/modified/owner/visibility and omits rating/tags (deferred)", () => {
  assert.match(rendererSource, /\$HR\("Created"\)/);
  assert.match(rendererSource, /\$HR\("Modified"\)/);
  assert.match(rendererSource, /\$HR\("Owner"\)/);
  assert.match(rendererSource, /\$HR\("Visibility"\)/);
  assert.doesNotMatch(rendererSource, /\$HR\("Rating"\)|\$HR\("Tags"\)/);
});

test("icon/media links are skipped entirely when baseUrl/database are not configured", () => {
  assert.match(rendererSource, /#isConfigured\(\) \{\s*return Boolean\(this\.baseUrl && this\.database\);/);
  assert.match(rendererSource, /if \(!this\.#isConfigured\(\)\) return null;/);
});
