# 32 Field-level PATCH and Batch updates

**Status 2026-11-10: Phase 1 implemented in both repos (not committed, not checked in a browser), see §9.**
Phase 2 = batch updates: route agreed 2026-11-10 (§6), implemented by plan 33 (Explorer Actions tool).

## 1. Context

Saving a page in the CMS designer is slow. The client sends only the changed fields
(`changedDetails`, `apps/website/src/designer/designerData.js`), but the server treats PATCH almost like PUT
(`srv/Records/Edit/RecordSaveService.php`):

1. reads all stored values and joins the split ones (`planUpdate`, `SplitValues::joinDetails`);
2. validates every field of the merged record;
3. `RecordStore::replaceDetails` deletes **all** detail rows and inserts them again, one INSERT per row;
4. runs **all** calculated fields, fills the title mask, compares the child state before and after (plan 26);
5. answers with the whole record (`RecordEditController::savedRecord`, `fields=_all`).

Legacy had a quick one-field write: `RecordMgr.batch_details` `a: add | replace | addreplace | delete` →
`hserv/controller/record_batch.php` → `hserv/records/batch/field/RecordsBatchDetail{Add,Replace,Delete}.php`. The old
map symbology save and the old CMS editor used it. srv has no port. Since plan 17 (heurist `d569e56748`) map
symbology, the designer, Query sources, relationship terms and parent links all use the slow PATCH.

Goal: PATCH writes only the given fields (add, replace, delete, optionally only values that match a condition), and
recalculates titles and calculated fields only when a cached dependency says so. Then the same operations in a batch
(Phase 2). **No new endpoint for Phase 1** (plan 28 §9.4: "a change of one field = PATCH with that field in the body").
PUT and POST stay as they are.

## 2. Request format (Phase 1)

`PATCH /{entity}/{id}` or `/records/{id}`:

```json
{
  "rec_Modified": "2026-11-10 10:00:00",
  "details":      { "1203": ["<new value>"], "1204": [], "1": ["Smith"] },
  "detailsMatch": { "1": "=Johnson" },
  "addIfNone":    ["1"],
  "detailsAdd":   { "1202": ["fre:{...}"] }
}
```

| Operation | Body | Rule |
|---|---|---|
| replace | `details: {f: [values]}` | without a match: all values of f are replaced (as now). With `detailsMatch[f]`: only the matching values are removed and the new values are inserted once. Nothing matches: no change, unless f is in `addIfNone` → the new values are added. |
| delete | `details: {f: []}` | without a match: f is removed. With `detailsMatch[f]`: only the matching values are removed. **Refused (422) if f is `required` and no value would be left.** |
| add | `detailsAdd: {f: [values]}` | appends values. **Refused (422) on a single-value field that has a value** (`rst_MaxValues` = 1; an empty one gets the value, changed 2026-11-10, plan 33 §9); refused if stored + new count > max (when max > 1). |

- **Value matching** = the value conditions of the Heurist query format, the same as `f:N:<value>`:
  `=Johnson` exact, `==Johnson` case-sensitive exact, `son` contains, `son%` starts with, `%son` ends with,
  `-Johnson` not / does not contain, `>` `<` `>=` `<=` `<>` ranges for numbers and dates, term id / label for enums,
  language prefix rules for text. Not allowed for the split page content field (one joined value) → 422.
- A field may be in only one of `details` / `detailsAdd`. `detailsMatch` and `addIfNone` only for fields in `details`.
- `forbidden` fields are refused (422) as now. Header fields (owner, visibility, URL, scratchpad, groups) are written as now.
  `rec_Modified` is checked if given (409).
- An `add` of a language that already has a value (multilingual fields, 2-1202) gets a warning only.
- `?fields=` sets the response fields (default `_all`, so existing callers keep working). The response `meta` gets
  `changed: {fieldId: count of removed + inserted values}`.

## 3. Phase 1 server changes (heurist repo)

### 3.1 Value matching: reuse the query compiler
`srv/Records/Query/Compiler/FieldPredicateCompiler.php`: split the inner part of `fieldCondition()` into a public
`valueCondition(int $fieldId, $value, SqlBuildContext $state, string $alias = 'd'): string` (the condition on one detail
row: numeric / term / language text / scalar; dates through `{dateIndex}` on `rdi_DetailID = d.dtl_ID`).
`fieldCondition()` calls it, so search behaviour does not change.
`RecordRepository::matchingDetailIds(int $recordId, int $fieldId, string $conditionSql, array $binds): array<int>`
runs `SELECT d.dtl_ID FROM {details} d WHERE d.dtl_RecID=? AND d.dtl_DetailTypeID=? AND <condition>`. Only the record
layer reads the details tables (plan 15 boundary test).

### 3.2 `srv/Records/Edit/RecordSaveService.php`
New private path `patchFields()` used by `save()` for PATCH (PUT/POST unchanged):
1. Header, owners, permissions, 409 check: shared with `planUpdate` (split out).
2. Operations from `RecordInput`: `details()`, new `detailsAdd()`, `detailsMatch()`, `addIfNone()`. Checks: forbidden,
   match not on split fields, required for delete (remaining count = stored count − matched ids), multi-value + max for add.
3. Validate only the sent values: `$validator->validate($rectype, $sent, ['required' => false])`. Record checks
   (`CmsRecordCheck`) need the whole record: only for the record types they are registered for, the stored values are read
   (`editValues` + `SplitValues::joinDetails`, reads only), merged, and given to the record checks (option `recordDetails`).
4. Workflow stage: `applyWorkflow` only when the stage field is sent.
5. One transaction: `updateRecord` (header + `rec_Modified=NOW()`), `setPermissions` only when groups are sent,
   `RecordStore::deleteFields($id, $fieldIds)` (no match) / `deleteDetailIds($id, $dtlIds)` (match), `insertDetails`.
6. Recalculation from the dependency cache (§4).

### 3.3 Other server files
- `srv/Records/Store/RecordStore.php`: `deleteFields(int $recordId, array $fieldIds)`, `deleteDetailIds(int $recordId, array $dtlIds)`.
- `srv/Records/Edit/RecordInput.php`: `detailsAdd()`, `detailsMatch()`, `addIfNone()`.
- `srv/Records/Edit/RecordValidator.php`: `addRecordCheck(callable $check, array $rectypes = [])`, `recordCheckTypes()`,
  option `recordDetails`. `ServiceFactory` passes the website and page types for `CmsRecordCheck`.
- `srv/Controller/RecordEditController.php`: `savedRecord()` uses `$params['fields']` when given (default `_all`).

## 4. Dependency cache and recalculation (agreed 2026-11-10)

New `srv/Records/Edit/FieldDependencies.php` (§9.2), cached as **`def-snapshot-dependencies.json`** in the database `entity`
folder next to `def-snapshot.json` and `def-snapshot-constants.json`. Legacy `System::cleanDefCache()`
(`hserv/System.php`) deletes `def-snapshot*.json` on every definition change, so this file goes with the snapshots and is
built again on the next use (whole database at once: all title masks and formulas, a few ms).

Content, per record type → per field id:

```json
{ "version": 1,
  "rectypes": { "12": {
      "fields": { "1":  { "title": true,  "calc": [1105], "childTitle": [57] },
                  "1203": { "title": false, "calc": [],     "childTitle": [] } },
      "titleUnknown": false,
      "childFields": [1223] } } }
```

- a) `title`: f is the first part of a `[token]` of the title mask of the record type (resolved by the same rules as
  `TitleMask::fieldId()`, exposed as `TitleMask::fieldIds(int $rectype): ?array`). A mask that cannot be parsed →
  `titleUnknown: true` (always fill). Without a mask: DT_NAME counts as a title field.
- b) `calc`: the calculated fields of the record type whose formula names f (`f{id}`, `f{id}s`, `f{id}_originalvalue`
  and the concept code form, if Smarty supports it: check in `ReportRecordAssembler`).
- c) `childTitle`: child record types (plan 26, `DefinitionLookup::childLinks`) whose title mask uses
  `[Parent entity.f ...]` / `[2-247.f ...]`. `childFields`: the child pointer fields of the record type.

Use on PATCH (changed fields F):
| What | Runs when |
|---|---|
| Own title | `titleUnknown`, or a field in F has `title` |
| Calculated fields | only the union of `calc` of F (`CalculatedFields::update($id, $rectype, ?array $onlyFields)`; `null` = all for PUT/POST) |
| Child titles | a field in F has `childTitle` → the children of those types; the own title changed → the children whose mask uses the parent title (`[Parent entity]` alone, counted as `childTitle` of the title fields); a field in F is in `childFields` → the added / removed children |

Accepted limitations (written in the plan document): formulas that read f only through `$heurist->getRecord(...)`, and
titles of non-child records that point to this record, are not refreshed (the same as today). A PUT refreshes them.
Check during implementation: does a change of `defCalcFunctions` call `cleanDefCache()`? If not, the cache must also
compare the latest modified time of `defCalcFunctions`.

## 5. Phase 1 client changes (this repo)

- `shared/src/data/RecordEditClient.js`: `patch(id, changes, { force, fields })`; JSDoc for `detailsAdd`, `detailsMatch`, `addIfNone`.
- `apps/website/src/designer/CmsDesigner.js` `_patchRecord` / `_saveField`: `fields=rec_ID,rec_Modified,rec_Title`.
- `shared/src/symbology/SymbologyService.js`, `shared/src/data/relationStores.js`, `shared/src/data/parentRecords.js`:
  short `fields` where the callers do not use the returned record (check each).

## 6. Phase 2: Batch updates

**Agreed 2026-11-10 (Artem):** a set of records = the background job `record-action` (`POST /jobs`, no new endpoint),
one record = the normal `PATCH /records/{id}`; records that break the PATCH rules are skipped and reported. UI = the
Explorer Actions tool. Implemented by `33 Actions-Tool-and-Batch-Updates-Plan.md`. The design notes below are kept;
the job type is `record-action`, one transaction per record, no small synchronous sets.


Same operations (`details`, `detailsAdd`, `detailsMatch`, `addIfNone`) for many records:
- target: a list of ids or a Heurist query (the existing `/records` search compiler gives the ids);
- per record: the Phase 1 `patchFields()` (one transaction per record, or per chunk), the dependency cache decides the
  recalculation once per record type, not per record;
- large sets run as a background job (`srv/Jobs`, job type `records-batch`, progress + report: changed / skipped
  (required, max, no match) / errors per record), small sets synchronously;
- permissions per record (skipped records in the report), no `rec_Modified` check (or `force`);
- clients: replaces `RecordMgr.batch_details` in the new UI (Explorer *Actions* tool, plan 23 §15 item 2).
- **Open, to agree with Artem before Phase 2 (plan 28 rule):** the route. Candidates: `PATCH /records?q=...|ids=...`
  (domain-wide action), or a job `POST /jobs` with type `records-batch`.

## 7. Documents

- New `docs/development/32 Field-PATCH-and-Batch-Updates-Plan.md` (this plan, dated decisions; status line kept up to date).
- Plan 28: PATCH rules (line ~105, §2.4): `detailsAdd`, `detailsMatch`, `addIfNone`, `?fields=`; §9.4 "implemented by plan 32".
- Plan 23 §15: item 1 server part → plan 32 Phase 1; item 2 → plan 32 Phase 2.
- `heurist/srv/Records/Edit/_README.md`, `srv/Definitions/_README.md`, header comment of `RecordSaveService.php`.
- CLAUDE.md "Current work": entry for plan 32.

## 8. Verification

- New `heurist/tests/FieldPatchTest.php` (osmak_mapping, test records created and deleted by the test):
  replace / delete / add; match `=x`, `x`, `x%`, `-x`, number range, enum term; `addIfNone` with and without a match;
  delete of the last value of a required field → 422 (with a match that leaves a value → ok); add on a single-value field
  → 422; add over max → 422; match on page content → 422; the `dtl_ID`s of other fields unchanged (no full rewrite);
  title unchanged when f is not in the mask, changed when it is; calculated field runs only when its formula names f;
  child title refreshed via `[Parent entity.f]`; CMS page with an invalid configuration in a PATCH still refused; 409.
- `tests/FieldDependenciesTest.php`: cache built, file written next to `def-snapshot.json`, removed by `cleanDefCache()`, built again.
- Search unchanged after the `valueCondition` split: existing query tests (`tests/*Query*`, `ConnectedPredicateTest.php`).
- Existing: `WebsiteEditTest.php`, `TitleMaskCompareTest.php`, `StoredTextTest.php`, `DataAccessBoundaryTest.php`,
  record edit tests; `npm test`, `npm run build:all`.
- Timing: one-field PATCH of page 207628 before / after (curl with the login cookie); designer Save in the browser (Artem).

## 9. Implementation (Phase 1, 2026-11-10)

### 9.1 Done
- heurist: `RecordInput` (`detailsAdd`, `detailsMatch`, `addIfNone`, `hasPatchOptions`), `RecordSaveService`
  (`patchFields`, `planHeader` split out of `planUpdate`, `refreshTitles` split out of `refreshChildTitles`),
  `FieldPredicateCompiler::valueCondition` (`fieldCondition` uses it; date values through the date index),
  `RecordRepository::matchingDetailIds` / `fieldCounts` / `editValues(..., $excludeIds)`, `RecordStore::deleteFields` /
  `deleteDetailIds`, `RecordValidator::addRecordCheck($check, $rectypes)` + `hasRecordCheck` + option `recordDetails`,
  `TitleMask::maskReferences` / `resolveField`, `CalculatedFields::update(..., $onlyFields)`,
  `DefinitionLookup::allCalculatedFields`, `FieldDependencies`, `RecordEditController` (`?fields=`, `meta.changed`),
  `ServiceFactory` wiring. Legacy `DbEntityBase::_cleanDbDefCache` also cleans for `cfn` (calculation functions), so
  the cache file goes when a formula changes.
- explorer: `RecordEditClient.patch(id, changes, { force, fields })` returns `changed` too; the designer
  (`_patchRecord`, `_saveField`) asks for the header only and keeps the sent fields as the saved state (Discard after a
  save); symbology, relationship term and parent link saves ask for a short answer.
- Tests: `heurist/tests/FieldPatchTest.php` (16 read-only + 36 write checks, all pass); `apps/website/test/cmsDesigner.test.js`
  (short answer, Discard after a save). `npm test` 1,682 pass, `build:all` ok. Server tests with the same results as
  before: RecordEditApiTest, WebsiteEditTest, ReportsApiTest, StoredTextTest, DataAccessBoundaryTest, System*Test,
  ConnectedPredicateTest, TemporalSearchTest, GeoPredicateTest, FieldValue*Test, RelationshipPredicateTest.
  RecordEditAllTypesTest #51, #52, #124, WebsiteContentTest, CaseSensitiveQueryTest and VirtualParentTest fail
  before this change as well (checked on the stashed code).

### 9.2 Differences from the plan
- `FieldDependencies` is in `srv/Records/Edit/` (not `srv/Definitions/`): it uses `TitleMask` (Records layer).
- Cache format: per record type `title` (ids), `titleUnknown`, `calc` (calculated field => ids its formula names),
  `childTitle` (parent field => child types), `childOnTitle` (child types of `[Parent entity]` alone), `childAny`
  (a parent field the child mask names that the parent type does not have = any change), `childFields`.
  A calculated field that runs counts as changed for other formulas and for the title.
- `detailsAdd` of a language the page translations (2-1202) have already is **refused** (422): its parts would be
  joined into one value on read. Other multilingual fields: a warning. Values in another language (`fre:`) of a
  multilingual field do not count for `rst_MaxValues`, so a translation can be added to the single-value name field.
- `detailsMatch` is refused on both fields saved in parts (page content and page translations).
- PATCH no longer adds the default values of missing required fields (it does not look at fields that are not sent).

### 9.3 Timing (osmak_mapping, XAMPP on Windows)
PATCH of the configuration field of a copy of a v4 page (best of 5, full answer):

| Page | Rows / bytes | Before | After |
|---|---|---|---|
| 207601 | 6 / 88,546 | 316 ms | 116 ms |
| 208204 | 18 / 16,187 | 439 ms | 164 ms |

Without the write, a PATCH takes about 2 ms (checks, record check, dependencies). The rest is the MySQL commit: one
empty `UPDATE` with autocommit takes 56 ms, a small transaction about 95 ms, because the server runs with
`innodb_flush_log_at_trx_commit=1`, `log_bin=ON`, `sync_binlog=1` (two disk syncs per commit) and archive triggers
on `Records` / `recDetails`. A local development server can use `innodb_flush_log_at_trx_commit=2` and `sync_binlog=0`.

### 9.4 Found, fixed 2026-11-12
`POST /records/{id}/duplicate` of a page whose content is saved in parts (> 64 KB, e.g. 207601) failed with
"Data too long for column dtl_Value" (also before this change). Cause: `RecordDuplicateService` cleaned every stored
part alone; a part is cut HTML, the cleaner closed its tags and the part grew over the column. Fix: the parts of the
page content and of the page translations are joined, cleaned as a whole and split again as a save does
(`RecordValidator::isSplitField` / `splitValue`, `RecordDuplicateService::cleanSplitField`; rows are written again
only when they change). Check in `tests/RecordEditApiTest.php --write` (73 pass); page 207601 duplicates.

### 9.5 Bug fixed 2026-11-10: PUT answered 500 after the save
`RecordEditController::savedRecord` read `$params['fields']` (the `?fields=` of §2). Legacy `hserv/controller/api.php`
puts the whole JSON body into `fields` when the URL has none, so every PUT of the record editor (no `?fields=`) built its
answer with `fields = "Array"`: the record was saved, then the answer failed ("Invalid linked output field path",
HTTP 500, the editor showed "The record could not be saved"). Now only a text `fields` is used; check added to
`tests/FieldPatchTest.php` (53 pass).
