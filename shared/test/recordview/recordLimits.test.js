/**
 * @file recordLimits.test.js
 * @brief Limits of the built-in record view for very large records (plan 23 §3): normalizing
 *        the limits, and the renderer building only the first fields, values, thumbnails and
 *        links with a "Show all (N)" link for the others.
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "../helpers/fakeDom.js";

installFakeDom();
const {
  DEFAULT_RECORD_LIMITS, RECORD_LIMIT_OPTIONS, normalizeRecordLimits, recordLimitsDiffer,
} = await import("../../src/recordview/recordLimits.js");
const { RecordViewRenderer, buildLinksRow, buildLinkedFromSection } = await import("../../src/recordview/RecordViewRenderer.js");

/** A record with `count` freetext fields 1..count in sections of `perSection` fields. */
function bigRecord(count, perSection) {
  const details = {};
  const sections = [];
  for (let id = 1; id <= count; id++) {
    details[id] = [`value ${id}`];
    if ((id - 1) % perSection === 0) sections.push({ title: `Group ${sections.length + 1}`, fields: [] });
    sections.at(-1).fields.push({ id, type: "freetext", name: `Field ${id}` });
  }
  return { record: { rec_ID: 1, rec_Title: "Big", details }, sections };
}

/** Render a record and return the renderer's container. */
function render(record, sections, options = {}) {
  const container = document.createElement("div");
  new RecordViewRenderer({ container, ...options }).showBuiltin(record, { sections });
  return container;
}

/** The "Show all" link of an element (the first one below it). */
function showAll(element) {
  return element.querySelector(".heurist-recordview-show-all")?.querySelector("a") || null;
}

test("limits: defaults and options as agreed (fields 50, values 10, thumbs 10, links 20)", () => {
  assert.deepEqual({ ...DEFAULT_RECORD_LIMITS }, { fields: 50, values: 10, thumbs: 10, links: 20 });
  assert.deepEqual([...RECORD_LIMIT_OPTIONS], [10, 20, 50, 100, 500]);
});

test("limits: unknown or missing values fall back to the defaults; numbers given as text are read", () => {
  assert.deepEqual(normalizeRecordLimits(null), { ...DEFAULT_RECORD_LIMITS });
  assert.deepEqual(normalizeRecordLimits({ fields: 100, values: "20", thumbs: 7, links: -1 }),
    { fields: 100, values: 20, thumbs: 10, links: 20 });
  assert.equal(recordLimitsDiffer({ fields: 50 }, null), false);
  assert.equal(recordLimitsDiffer({ fields: 100 }, null), true);
});

test("fields: only the first `fields` are built, then 'Show all fields (N)' builds the others", () => {
  const { record, sections } = bigRecord(60, 30);
  let grown = 0;
  const container = render(record, sections, { onGrow: () => { grown++; } });
  assert.equal(container.querySelectorAll("dt").length, 50);
  const link = showAll(container.querySelector(".heurist-recordview-sections"));
  assert.equal(link.textContent, "Show all fields (60)");
  link.click();
  assert.equal(container.querySelectorAll("dt").length, 60);
  assert.equal(container.querySelector(".heurist-recordview-show-all"), null);
  assert.equal(grown, 1);
  // the fields stay in their sections and order
  const second = container.querySelectorAll("fieldset")[1];
  assert.deepEqual(second.querySelectorAll("dt").map((dt) => dt.textContent).slice(-2), ["Field 59", "Field 60"]);
});

test("fields: a section with no field under the limit is hidden until 'Show all fields'", () => {
  const { record, sections } = bigRecord(30, 10);
  const container = render(record, sections, { limits: { fields: 10 } });
  const fieldsets = container.querySelectorAll("fieldset");
  assert.deepEqual(fieldsets.map((fieldset) => fieldset.hidden), [false, true, true]);
  showAll(container).click();
  assert.deepEqual(fieldsets.map((fieldset) => fieldset.hidden), [false, false, false]);
  assert.equal(container.querySelectorAll("dt").length, 30);
});

test("fields: no link when the record has no more fields than the limit", () => {
  const { record, sections } = bigRecord(50, 25);
  const container = render(record, sections);
  assert.equal(container.querySelectorAll("dt").length, 50);
  assert.equal(container.querySelector(".heurist-recordview-show-all"), null);
});

test("values: the first `values` values of a field, then 'Show all values (N)' in the same dd", () => {
  const values = Array.from({ length: 25 }, (_, index) => `v${index + 1}`);
  const container = render({ rec_ID: 1, details: { 7: values } }, [{ title: "", fields: [{ id: 7, type: "freetext", name: "Names" }] }]);
  const dd = container.querySelector("dd");
  assert.equal(dd.querySelectorAll(".heurist-recordview-value-line").length, 10);
  const link = showAll(dd);
  assert.equal(link.textContent, "Show all values (25)");
  link.click();
  const lines = dd.querySelectorAll(".heurist-recordview-value-line");
  assert.equal(lines.length, 25);
  assert.equal(lines.at(-1).textContent, "v25");
});

test("values: pointer fields are limited too (their titles are already resolved)", () => {
  const values = Array.from({ length: 30 }, (_, index) => ({ rec_ID: index + 1, rec_Title: `R${index + 1}` }));
  const container = render({ rec_ID: 1, details: { 9: values } }, [{ title: "", fields: [{ id: 9, type: "resource", name: "Persons" }] }],
    { limits: { values: 20 } });
  assert.equal(container.querySelectorAll(".heurist-recordview-resource-link").length, 20);
  showAll(container.querySelector("dd")).click();
  assert.equal(container.querySelectorAll(".heurist-recordview-resource-link").length, 30);
});

test("thumbnails: the first `thumbs` files of the media strip, then 'Show all files (N)'", () => {
  const files = Array.from({ length: 15 }, (_, index) => ({ file: { ulf_ObfuscatedFileID: `f${index}`, fxm_MimeType: "image/png" } }));
  const container = render({ rec_ID: 1, details: { 3: files } }, [{ title: "", fields: [{ id: 3, type: "file", name: "Images" }] }],
    { baseUrl: "http://h/heurist/", database: "db1" });
  const media = container.querySelector(".heurist-recordview-media");
  assert.equal(media.querySelectorAll("img").length, 10);
  const link = showAll(media);
  assert.equal(link.textContent, "Show all files (15)");
  link.click();
  assert.equal(media.querySelectorAll("img").length, 15);
});

test("links: a row of linked records shows `limit` links, then 'Show all (N)'", () => {
  const items = Array.from({ length: 30 }, (_, index) => ({ id: index + 1, title: `T${index + 1}`, rty: 10, relation: "" }));
  const [, dd] = buildLinksRow("Persons", items, () => {});
  assert.equal(dd.querySelectorAll("a").length, 21, "20 links (default) + the Show all link");
  showAll(dd).click();
  assert.equal(dd.querySelectorAll(".heurist-recordview-resource-link").length, 30);

  const [, small] = buildLinksRow("Persons", items, () => {}, false, { limit: 10 });
  assert.equal(small.querySelectorAll(".heurist-recordview-resource-link").length, 10);
});

test("links: the Linked from section has one row per group, each cut at the limit", () => {
  const items = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, title: `T${index + 1}`, rty: 10, relation: "" }));
  const relations = { related: {}, relationsFrom: [], linkedFrom: [{ rty: 10, label: "Persons", items, total: 25, query: null, more: null }] };
  const section = buildLinkedFromSection(relations, () => {}, { limit: 10 });
  assert.equal(section.querySelectorAll(".heurist-recordview-resource-link").length, 10);
  assert.equal(section.querySelector("dt").textContent, "Persons (25)", "a cut row has the count in its label");
  assert.equal(showAll(section).textContent, "Show all (25)", "everything loaded: shown in place");
});

test("links: a group with more records than loaded offers its search, with the row label", () => {
  const items = Array.from({ length: 20 }, (_, index) => ({ id: index + 1, title: `T${index + 1}`, rty: 10, relation: "" }));
  const query = [{ t: "10" }, { lt: "7" }];
  const searches = [];
  const [dt, dd] = buildLinksRow("Persons", { items, total: 1234, query, more: async () => [] }, () => {}, false,
    { limit: 20, onSearch: (q, label) => searches.push([q, label]) });
  assert.equal(dt.textContent, "Persons (1234)");
  const link = showAll(dd);
  assert.equal(link.textContent, "Show all (1234) in search");
  link.click();
  assert.deepEqual(searches, [[query, "Persons"]]);
});

test("links: without a search, 'Show more' shows the next `limit` records, loading them by more()", async () => {
  const make = (from, count) => Array.from({ length: count }, (_, index) => ({ id: from + index, title: `T${from + index}`, rty: 10, relation: "" }));
  const group = { items: make(1, 5), total: 12, query: [{ t: "10" }], more: null };
  let loads = 0;
  group.more = async () => {
    loads++;
    const next = make(group.items.length + 1, Math.min(5, group.total - group.items.length));
    group.items.push(...next);
    return next;
  };
  let grown = 0;
  const [, dd] = buildLinksRow("Persons", group, () => {}, false, { limit: 5, onGrow: () => { grown++; } });
  const titles = () => dd.querySelectorAll(".heurist-recordview-resource-link").map((a) => a.innerHTML);
  assert.equal(showAll(dd).textContent, "Show more (5 / 12)");

  showAll(dd).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(titles().length, 10);
  assert.equal(showAll(dd).textContent, "Show more (10 / 12)");
  showAll(dd).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(titles().slice(-2), ["T11", "T12"]);
  assert.equal(showAll(dd), null, "all shown: the link goes");
  assert.deepEqual([loads, grown], [2, 2]);
});

test("links: a relmarker field's group renders in its section row with the relation type", () => {
  const container = document.createElement("div");
  const relations = {
    related: { 245: { label: "Persons", items: [{ id: 5, title: "Kurt", rty: 10, relation: "is Secretary Of" }], total: 1, query: null, more: null } },
    relationsFrom: [], linkedFrom: [],
  };
  new RecordViewRenderer({ container }).showBuiltin({ rec_ID: 1, details: {} },
    { sections: [{ title: "", fields: [{ id: 245, type: "relmarker", name: "Participants" }] }], relations });
  assert.equal(container.querySelector("dt").textContent, "Participants");
  assert.equal(container.querySelector(".heurist-recordview-relation-type").textContent, "is Secretary Of");
});

test("loading: 'Loading...' with the rotating icon while a record loads", () => {
  const container = document.createElement("div");
  const renderer = new RecordViewRenderer({ container });
  renderer.showLoading();
  const loading = container.querySelector(".heurist-recordview-loading");
  assert.ok(loading.classList.contains("h-loading"));
  assert.ok(loading.querySelector(".h-spinner"));
  assert.equal(loading.textContent, "Loading...");
});
