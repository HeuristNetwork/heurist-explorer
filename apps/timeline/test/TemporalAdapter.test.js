/**
 * @file TemporalAdapter.test.js
 * @brief Verifies core temporal conversion logic and timeline initialization validation.
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";

import { TemporalAdapter } from "../src/core/TemporalAdapter.js";
import { initHeuristTimeline } from "../src/initHeuristTimeline.js";

const context = { id: "band-1" };

function item(when) {
  return TemporalAdapter.convertWhen(
    context,
    { rec_ID: 7, rec_Title: "Test", rec_RecTypeID: 42 },
    when,
    0,
  );
}

test("exact point", () =>
  assert.equal(item(["1990", "", "", "1990", "", 0, 0, 1, 9]).temporalKind, "exact"));

test("plain start/end span is a scaled range", () => {
  const range = item(["1990", "", "", "1995", "", 0, 0, 1, 9]);
  assert.equal(range.temporalKind, "range");
  assert.ok(range.end instanceof Date);
});

test("single date + profile 1 is circa", () =>
  assert.equal(item(["1992", "", "", "1992", "", 1, 0, 2, 9]).temporalKind, "circa"));

test("single date + profile 2 is before", () =>
  assert.equal(item(["1990", "", "", "1990", "", 2, 0, 0, 9]).temporalKind, "before"));

test("single date + profile 3 is after", () =>
  assert.equal(item(["1992", "", "", "1992", "", 3, 0, 0, 9]).temporalKind, "after"));

test("circa/before/after are vis points with no end", () => {
  for (const profile of [1, 2, 3]) {
    const it = item(["1992", "", "", "1992", "", profile, 0, 1, 9]);
    assert.equal(it.type, "point");
    assert.equal("end" in it, false);
  }
});

test("a span with a start profile is a scaled fuzzy range, not a point", () => {
  const it = item(["1999", "", "", "2000", "", 2, 0, 1, 9]);
  assert.equal(it.temporalKind, "fuzzy-range");
  assert.equal(it.type, "range");
  assert.ok(it.end instanceof Date);
  assert.equal(it.fuzzy.headPct, 0);
  assert.equal(it.fuzzy.tailPct, 0);
});

test("fuzzy range exposes gradient-cap widths as span percentages", () => {
  const fuzzy = item(["1000", "1100", "1400", "1500", "", 2, 3, 1, 9]);
  assert.equal(fuzzy.temporalKind, "fuzzy-range");
  assert.equal(fuzzy.fuzzy.headPct, 20);
  assert.equal(fuzzy.fuzzy.tailPct, 20);
});

test("record type id is carried for the marker icon", () =>
  assert.equal(item(["1990", "", "", "1990", "", 0, 0, 1, 9]).rectypeId, 42));

test("fuzzy range uses populated inner limits and profiles", () =>
  assert.equal(item(["1990", "1991", "1994", "1996", "", 2, 3, 1, 9]).temporalKind, "fuzzy-range"));

test("selection identity is stable per context/record/when", () =>
  assert.equal(item(["1990", "", "", "1990", "", 0, 0, 0, 9]).id, "band-1:7:0"));

test("init requires a config object with a container id", async () => {
  await assert.rejects(
    () => initHeuristTimeline(),
    /config.*containerId|containerId.*config|Timeline container/,
  );

  await assert.rejects(
    () => initHeuristTimeline({}),
    /containerId|Timeline container/,
  );
});
