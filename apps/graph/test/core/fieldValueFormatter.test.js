/**
 * @file fieldValueFormatter.test.js
 * @brief Tests Heurist field value formatting.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDatasetFields } from "../../src/core/Dataset.js";
import {
  displayFieldValue,
  projectFieldValue,
  sanitizeTextHtml,
  stripHtml,
} from "../../src/core/FieldValueFormatter.js";

test("Dataset accepts Output as the field Ext alias", () => {
  assert.equal(
    normalizeDatasetFields([{ field: "12", output: "code" }])[0].ext,
    "code",
  );
});

test("field output extensions resolve common Heurist structured values", () => {
  assert.equal(
    projectFieldValue({ trm_Label: "Label", trm_Code: "ABC" }, "term"),
    "Label",
  );
  assert.equal(
    projectFieldValue({ trm_Label: "Label", trm_Code: "ABC" }, "code"),
    "ABC",
  );
  assert.equal(
    projectFieldValue({ trm_ConceptCode: "2-123" }, "conceptid"),
    "2-123",
  );
  assert.equal(
    projectFieldValue({ file: { fullPath: "/file.jpg" } }, "url"),
    "/file.jpg",
  );
  assert.equal(
    projectFieldValue({ geo: { wkt: "POINT(151.2 -33.8)" } }, "wkt"),
    "POINT(151.2 -33.8)",
  );
  assert.equal(
    projectFieldValue({ geo: { wkt: "POINT(151.2 -33.8)" } }, "pair"),
    "-33.8,151.2",
  );
  assert.equal(
    displayFieldValue(
      { details: { 12: [{ label: "One" }, { label: "Two" }] } },
      { field: "12", ext: "term" },
    ),
    "One | Two",
  );
});

test("text sanitizing keeps only supported emphasis tags", () => {
  const input =
    '<b class="x">Bold</b><span> text</span><script>alert(1)</script><em>em</em>';
  assert.equal(sanitizeTextHtml(input), "<b>Bold</b> text<em>em</em>");
  assert.equal(stripHtml(input), "Bold textem");
});
