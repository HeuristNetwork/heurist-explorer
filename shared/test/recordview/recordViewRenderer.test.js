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
import { installFakeDom } from "../helpers/fakeDom.js";

const rendererSource = await readFile(new URL("../../src/recordview/RecordViewRenderer.js", import.meta.url), "utf8");
installFakeDom();
const { buildFileMediaItem, fileMediaUrls } = await import("../../src/recordview/fileMediaItem.js");
const urls = fileMediaUrls("http://h/heurist/", "db1");
const linkTexts = (item) => item.querySelectorAll("a").map((a) => a.textContent);

test("record type icon uses the legacy ?db=&icon= convention", () => {
  assert.match(rendererSource, /\?db=\$\{encodeURIComponent\(this\.database\)\}&icon=\$\{recordTypeId\}/);
});

test("file thumbnails use the legacy ?db=&thumb= convention", () => {
  assert.match(rendererSource, /\?db=\$\{encodeURIComponent\(this\.database\)\}&thumb=\$\{encodeURIComponent\(fileId\)\}/);
});

test("media items come from the shared file media builder (fileMediaItem.js)", () => {
  assert.match(rendererSource, /return buildFileMediaItem\(file, \{ urls: fileMediaUrls\(this\.baseUrl, this\.database\) \}\);/);
});

test("file media: OSD for images; Mirador for images/audio/video; Download; legacy ?db=&file= / &thumb= URLs", () => {
  const image = buildFileMediaItem({ ulf_ObfuscatedFileID: "k1", fxm_MimeType: "image/png" }, { urls });
  assert.deepEqual(linkTexts(image), ["Show in OSD", "Show in Mirador", "Download"]);
  assert.equal(image.querySelector("a").href, "http://h/heurist/hclient/widgets/viewers/openSeadragonViewer.php?db=db1&recID=k1");
  assert.equal(image.querySelector("img").src, "http://h/heurist/?db=db1&thumb=k1");
  const doc = buildFileMediaItem({ ulf_ObfuscatedFileID: "k2", fxm_MimeType: "application/pdf" }, { urls });
  assert.deepEqual(linkTexts(doc), ["Download"]);
  const plain = buildFileMediaItem({ ulf_ObfuscatedFileID: "k2", fxm_MimeType: "application/pdf" }, { urls, download: false });
  assert.deepEqual(linkTexts(plain), []);
});

test("file media: uploaded audio/video render as native players, not static thumbnails", () => {
  const video = buildFileMediaItem({ ulf_ObfuscatedFileID: "k3", fxm_MimeType: "video/mp4" }, { urls });
  const player = video.querySelector("video");
  assert.ok(player);
  assert.equal(player.controls, true);
  assert.equal(player.querySelector("source").src, "http://h/heurist/?db=db1&file=k3");
  assert.ok(buildFileMediaItem({ ulf_ObfuscatedFileID: "k4", fxm_MimeType: "audio/mpeg" }, { urls }).querySelector("audio"));
});

test("file media: an external file gets 'Show in new tab' with its raw URL", () => {
  const item = buildFileMediaItem({ ulf_ObfuscatedFileID: "k5", ulf_ExternalFileReference: "https://x.org/a.pdf" }, { urls });
  const link = item.querySelectorAll("a").find((a) => a.textContent === "Show in new tab");
  assert.equal(link.href, "https://x.org/a.pdf");
});

test("file media: a click on an image toggles thumbnail / large image and the expanded class", () => {
  const item = buildFileMediaItem({ ulf_ObfuscatedFileID: "k6", ulf_OrigFileName: "map.JPG" }, { urls });
  const thumb = item.querySelector("img");
  assert.ok(thumb.classList.contains("heurist-recordview-media-thumb-zoomable"), "an image by its extension");
  thumb.click();
  assert.ok(item.classList.contains("heurist-recordview-media-item-expanded"));
  assert.equal(thumb.src, "http://h/heurist/?db=db1&file=k6");
  thumb.click();
  assert.equal(thumb.src, "http://h/heurist/?db=db1&thumb=k6");
});

test("file media: Download and Close (the record editor's file input)", () => {
  let closed = 0;
  const item = buildFileMediaItem({ ulf_ObfuscatedFileID: "k7", fxm_MimeType: "image/png" },
    { urls, download: true, onClose: () => { closed++; } });
  assert.deepEqual(linkTexts(item), ["Show in OSD", "Show in Mirador", "Download", "Close"]);
  assert.equal(item.querySelectorAll("a")[2].href, "http://h/heurist/?db=db1&download=1&file=k7");
  item.querySelectorAll("a")[3].click();
  assert.equal(closed, 1);
});

test("the edit button only renders when canEdit is true, sits inside the meta line next to the record id, and calls onEdit with the record id", () => {
  assert.match(rendererSource, /if \(canEdit\) \{/);
  assert.match(rendererSource, /edit\.addEventListener\("click", \(\) => onEdit\(record\?\.rec_ID\)\)/);
  assert.match(rendererSource, /meta\.append\(edit\);/);
});

test("each render measures the widest section label and pins every section's dt column to it", () => {
  assert.match(rendererSource, /this\.#alignFieldLabels\(\);/);
  assert.match(rendererSource, /#alignFieldLabels\(retry = true\) \{/);
  assert.match(rendererSource, /dl\.style\.setProperty\("--heurist-recordview-label-width", `\$\{maxWidth\}px`\);/);
});

test("labels keep their natural width when measured before the record is on the page (no 0px column)", () => {
  assert.match(rendererSource, /if \(!maxWidth\) \{\s*if \(retry && typeof requestAnimationFrame === "function"\) \{\s*requestAnimationFrame\(\(\) => this\.#alignFieldLabels\(false\)\);/);
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

test("resource-field link titles are rendered as sanitized HTML, matching the record's own title", () => {
  assert.match(rendererSource, /link\.innerHTML = sanitizeTextHtml\(value\?\.rec_Title \|\| `#\$\{value\?\.rec_ID/);
});

test("non-resource, non-file, non-blocktext fields render plain text via the shared FieldValueFormatter", () => {
  assert.match(rendererSource, /import \{ fieldValues, sanitizeTextHtml, looksLikeJson \} from "\.\/FieldValueFormatter\.js"/);
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

test("the footer shows created/modified/owner/visibility and omits rating (deferred)", () => {
  assert.match(rendererSource, /\$HR\("Created"\)/);
  assert.match(rendererSource, /\$HR\("Modified"\)/);
  assert.match(rendererSource, /\$HR\("Owner"\)/);
  assert.match(rendererSource, /\$HR\("Visibility"\)/);
  assert.doesNotMatch(rendererSource, /\$HR\("Rating"\)/);
});

test("icon/media links are skipped entirely when baseUrl/database are not configured", () => {
  assert.match(rendererSource, /#isConfigured\(\) \{\s*return Boolean\(this\.baseUrl && this\.database\);/);
  assert.match(rendererSource, /if \(!this\.#isConfigured\(\)\) return null;/);
});

test("Tags section rows: personal tags first, then each group's tags by name", async () => {
  const { tagGroups } = await import("../../src/recordview/RecordViewRenderer.js");
  const groups = tagGroups({ currentUserId: 2, tags: [
    { id: 7, name: "WEBFIL 1", owner: 4, ownerName: "Website filters" },
    { id: 2, name: "key2", owner: 2, ownerName: "osmakov" },
    { id: 6, name: "DBM 25", owner: 1, ownerName: "Database Managers" },
    { id: 1, name: "key1", owner: 2, ownerName: "osmakov" },
    { id: 9, name: "new tag 34", owner: 1, ownerName: "Database Managers" }
  ] });
  assert.deepEqual(groups, [
    { label: "Personal tags", tags: [{ id: 1, name: "key1" }, { id: 2, name: "key2" }] },
    { label: "Database Managers tags", tags: [{ id: 6, name: "DBM 25" }, { id: 9, name: "new tag 34" }] },
    { label: "Website filters tags", tags: [{ id: 7, name: "WEBFIL 1" }] }
  ]);
  assert.deepEqual(tagGroups(null), []);
});

test("tags are a separate \"Tags\" section of links that search the tag", () => {
  assert.match(rendererSource, /legend\.textContent = \$HR\("Tags"\)/);
  assert.match(rendererSource, /heurist-recordview-tag-link/);
  assert.match(rendererSource, /onSearchTag\(tag\)/);
  assert.doesNotMatch(rendererSource, /heurist-recordview-footer-item heurist-recordview-tags/);
});

test("the links button appears only for a record with links or relationships", async () => {
  const { hasLinks } = await import("../../src/recordview/RecordViewRenderer.js");
  assert.equal(hasLinks({ details: { 1: [{ value: "x" }] } }, null), false);
  assert.equal(hasLinks({ details: { 134: [{ value: "41", rec_ID: "41" }] } }, null), true);
  assert.equal(hasLinks({ details: {} }, { related: { 245: [{ id: 5 }] } }), true);
  assert.equal(hasLinks({ details: {} }, { related: { 245: [] }, relationsFrom: [], linkedFrom: [{ id: 76 }] }), true);
  assert.equal(hasLinks({ details: {} }, { related: {}, relationsFrom: [], linkedFrom: [] }), false);
  assert.match(rendererSource, /fa-solid fa-hexagon-nodes/);
});
