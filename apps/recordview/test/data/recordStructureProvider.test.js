/**
 * @file recordStructureProvider.test.js
 * @brief Tests building sectioned field structure from a raw `/rst` response, and per-rectype caching.
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
import { RecordStructureProvider } from "../../src/data/RecordStructureProvider.js";

// Modeled on rectype 10 ("Person") in `osmak_mapping`, confirmed live: a real
// `separator` row starts the first section, followed by ordinary fields.
const RST_ROWS = [
  {
    rst_DetailTypeID: "1000",
    rst_DisplayName: "Primary information",
    rst_DisplayOrder: "00001",
    rst_RequirementType: "optional",
    rst_DefaultValue: "tabs",
    rst_DisplayHelpText: "Core biographical fields",
    dty_Type: "separator",
  },
  {
    rst_DetailTypeID: "1",
    rst_DisplayName: "Surname",
    rst_DisplayOrder: "00002",
    rst_RequirementType: "required",
    rst_DefaultValue: "",
    rst_DisplayHelpText: "",
    dty_Type: "freetext",
  },
  {
    rst_DetailTypeID: "2",
    rst_DisplayName: "Forename",
    rst_DisplayOrder: "00003",
    rst_RequirementType: "optional",
    rst_DefaultValue: "",
    rst_DisplayHelpText: "",
    dty_Type: "freetext",
  },
];

test("fieldSections() requests the trimmed /rst columns for the given record type", async () => {
  let request;
  const provider = new RecordStructureProvider({
    apiClient: {
      get: async (path, options) => {
        request = { path, options };
        return { items: RST_ROWS };
      },
    },
  });
  await provider.fieldSections(10);
  assert.equal(request.path, "/rst/10");
  assert.match(request.options.query.details, /rst_DetailTypeID/);
  assert.match(request.options.query.details, /dty_Type/);
});

test("fieldSections() starts a new section at each separator row, with title/helpText/layout", async () => {
  const provider = new RecordStructureProvider({
    apiClient: { get: async () => ({ items: RST_ROWS }) },
  });
  const sections = await provider.fieldSections(10);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].title, "Primary information");
  assert.equal(sections[0].helpText, "Core biographical fields");
  assert.equal(sections[0].layout, "tabs");
  assert.deepEqual(
    sections[0].fields.map((field) => field.name),
    ["Surname", "Forename"],
  );
});

test("fieldSections() puts fields before the first separator into an untitled initial section", async () => {
  // A field whose display order (00000) precedes the separator's (00001) —
  // e.g. a title field shown before any section heading, like legacy's form.
  const precedingField = {
    rst_DetailTypeID: "3",
    rst_DisplayName: "Note",
    rst_DisplayOrder: "00000",
    rst_RequirementType: "optional",
    rst_DefaultValue: "",
    rst_DisplayHelpText: "",
    dty_Type: "freetext",
  };
  const rows = [...RST_ROWS, precedingField];
  const provider = new RecordStructureProvider({
    apiClient: { get: async () => ({ items: rows }) },
  });
  const sections = await provider.fieldSections(10);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].title, null);
  assert.deepEqual(
    sections[0].fields.map((field) => field.name),
    ["Note"],
  );
  assert.equal(sections[1].title, "Primary information");
  assert.deepEqual(
    sections[1].fields.map((field) => field.name),
    ["Surname", "Forename"],
  );
});

test("fieldSections() caches per record type, issuing only one request", async () => {
  let calls = 0;
  const provider = new RecordStructureProvider({
    apiClient: {
      get: async () => {
        calls++;
        return { items: RST_ROWS };
      },
    },
  });
  await provider.fieldSections(10);
  await provider.fieldSections(10);
  await provider.fieldSections(10);
  assert.equal(calls, 1);
});

test("fieldSections() rejects an invalid record type id", async () => {
  const provider = new RecordStructureProvider({ apiClient: { get: async () => ({ items: [] }) } });
  await assert.rejects(() => provider.fieldSections("not-an-id"), { name: "TypeError" });
});
