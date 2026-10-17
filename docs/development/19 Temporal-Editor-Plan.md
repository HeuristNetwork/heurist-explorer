# Temporal editor — development plan

Status: **agreed and implemented 2026-10-17, not committed.** Checked in headless Edge (scratch page:
date fields, popup tabs, OK). Not yet checked in the record editor of Explorer. Native calendars are a
later phase (§6).

## 1. Context

Date fields of the new edit form (`HEditField` → `HInputDate`, flatpickr) could hold only a simple date.
A complex date (circa / before / after, ranges, radiometric) is stored as temporal JSON text (rec 151 of
`osmak_mapping`, field 10: `{"timestamp":{"in":"1969","type":"s","before":true},"comment":"1970",...}`);
the form showed that JSON as text in the date input, and flatpickr changed it on blur. Legacy edits it
with `heurist/hclient/widgets/editing/editTemporalObject.php/.js` (4 tabs, legacy plain `|VER=` strings,
jQuery calendars).

## 2. Request (Artem, 2026-10-17) and decisions

| # | Request | Decision |
|---|---|---|
| 1 | Port the legacy temporal edit form to a new helper popup | `openTemporalEditor` in `shared/src/widgets/temporal/HTemporalEditor.js`. |
| 2 | Date fields show *Show raw* and *Edit*, unless suppressed | **Date input + Show raw + Edit** (agreed). A complex value shows its readable text in place of the input; clear empties it and brings the input back. Suppressed by the field property `"temporal": false`. |
| 3 | Separate JSONs for the four kinds of temporal | Four HEditForm JSONs, one per tab. |
| 4 | Read temporal JSON into the form JSON, write it back on apply | `temporalValues.js` (§4). |
| 5 | No support for the legacy plain string | A `|VER=` value opens an empty Simple date with a note; Show raw still shows the text. |
| — | Calendars (legacy: 13 with jquery.calendars) | **Gregorian only** in this phase (agreed). A value with another calendar opens read only with a note; its calendar and native text are kept. |
| — | Where the code is | Everything in one folder `shared/src/widgets/temporal/` (agreed): popup, value mapping, form JSONs. |

## 3. Files

| File | Content |
|---|---|
| `shared/src/widgets/temporal/HTemporalEditor.js` + `.css` | `openTemporalEditor(value, {readOnly, title})` → new value text, `''` when emptied, `undefined` when cancelled. HMsg dialog: tab strip of the four kinds (classes of the HEditForm tabs), one HEditForm for the active kind, note for non-Gregorian / unreadable values, OK = form checks + `validateTemporal` → `formToTemporal`. A tab switch keeps the values and carries the dates over (`carry`): simple date → earliest / TPQ, range → TPQ / TAQ and back. Slots: the range line "N years M months D days apart" under the simple range dates; buttons "Probable begin = TPQ", "Probable end = TAQ" in the fuzzy range. |
| `shared/src/widgets/temporal/temporalValues.js` | Pure functions (no DOM): `temporalToForm`, `formToTemporal`, `validateTemporal`, `rangeApart`, `decimalToYMD`, `isTemporalObject`. |
| `shared/src/widgets/temporal/temporalSimple.json`, `temporalRange.json`, `temporalFuzzy.json`, `temporalRadiometric.json` | The four forms (`heurist-edit-form/1`); date inputs have `temporal: false`. The same value names in every form (`comment`, `determination`...) so a tab switch keeps them. |
| `shared/src/widgets/form/inputs/HInputTemporal.js` + `.css` | Date input of edit forms (createHInput type `temporal`, extends HInputDate): date input or readable text, *Show raw* (editable text area with the stored text), *Edit* (loads the popup on first use, lazy chunk). |
| `HEditField.inputType` | `date` → `temporal`, unless `field.temporal === false` or the host gives a special editor. The record editor gets it for every date field. |
| `HInputDate` | With `allowLegacyText` (edit forms) a typed partial date (`1624`, `1624-05`, `-375`) is kept: flatpickr re-parsed it on blur and Enter (it became another date or was cleared). |

## 4. Values

| Kind (tab) | Form values | Temporal JSON |
|---|---|---|
| `s` Simple date | `date`, `time`, `zone`, `approx` (exact / circa / before / after), `determination`, `comment` | `{timestamp:{in:"date[ time[ zone]]", type:"s", circa\|before\|after:true}, determination, comment}`. A date alone is plain text (`1969-05-03`, `1624`, `-375`). |
| `r` Simple range | `earliest`, `latest`, `profile` (0-3), `determination`, `comment` | `{start:{earliest}, end:{latest}, profile, determination, comment}` |
| `p` Fuzzy range | `tpq`, `pdb`, `pde`, `taq`, `startProfile`, `endProfile`, `determination`, `comment` | `{start:{earliest, latest, profile}, end:{earliest, latest, profile}, ...}` |
| `c` Radiometric | `meanType` (bce / bp), `mean`, `devType` (sym / asym), `dev`, `devPos`, `devNeg`, `labcode`, `calibrated`, `comment` | `{timestamp:{in: -mean \| 1950-mean, type:"c", bp, deviation:"PnY" \| deviation_positive / deviation_negative}, native:"n BP" \| "n BCE", labcode, calibrated:1, comment}` |

Reading rules (as legacy):
- `start` / `end` with `start.latest` or `end.earliest` → Fuzzy range, otherwise Simple range.
- A timestamp with `deviation` (old fuzzy date, type `f`) → Simple range from `estMinDate` / `estMaxDate`.
- Plain date text → Simple date; other text → empty Simple date with the text in the comment (legacy did
  the same); `|VER=` → empty with a note.
- `calendar` other than Gregorian → read only (only Close).
- `estMinDate` / `estMaxDate` are not written: the server computes them on save
  (`RecordValidator` → `Temporal::getValueForRecDetails`, which stores a simple date as plain text).
  Checked: every output kind is a valid `Heurist\Utilities\Temporal` with min / max.

Checks: a Simple date needs a date; a Simple range both dates, earliest before latest; a Fuzzy range TPQ
and TAQ, dates in order TPQ ≤ PDB ≤ PDE ≤ TAQ; Radiometric the mean; every date must be readable.

## 5. Tests

`shared/test/temporalValues.test.js` (7): the four kinds both ways (rec 151 value, time and zone, old
fuzzy date, other calendar, old format, text), checks, range distance, `inputType`. The test JSON of the
*Test edit form* tool has three date fields (with Edit, a temporal default, `temporal: false`).
`npm test`: all pass.

## 6. Later

- Native calendars: npm `world-calendars` (the jQuery-free core of jquery.calendars) and a port of
  Heurist's Japanese calendar (`hclient/core/jquery.calendars.japanese.js`); a calendar select that
  converts the dates and stores `calendar` + `native`.
