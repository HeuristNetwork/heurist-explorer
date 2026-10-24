/**
 * @file richTextHtml.test.js
 * @brief Blocktext HTML for display (plan 25): without a real DOM (Node) the safe fallback;
 *        the DOM path is checked in a browser.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { sanitizeRichHtml } = await import("../../src/recordview/richTextHtml.js");

test("without a DOM: the inline tags and p / br only, no attributes, no script", () => {
  const html = sanitizeRichHtml('<p onclick="x()">A <b class="c">b</b><br><script>alert(1)</script><a href="javascript:x">l</a></p>');
  assert.equal(html, "<p>A <b>b</b><br>l</p>");
});
