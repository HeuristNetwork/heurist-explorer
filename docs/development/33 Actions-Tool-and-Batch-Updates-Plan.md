# 33 Actions tool and batch field updates (plan 32 Phase 2)

**Status 2026-11-10: agreed with Artem; Field values (Add, Replace, Delete), and in Phase 2 (§8) Ownership, titles,
calculated fields and Delete records implemented in both repos, not committed,
not checked in a browser (§6).** Other actions: listed, disabled.

## 1. Context

Plan 32 Phase 1 gave a fast field-level PATCH for one record. Artem (2026-11-10) wants the batch part as the
Explorer **Actions** tool (pane module `actions`, today a "Not implemented yet" placeholder in
`apps/explorer/src/tools/ExplorerToolModule.js`), built like the Export tool and loaded lazily.
Rules agreed:
- a set of records = a background **job** (`POST /jobs`, no new endpoint); one record = the normal `PATCH /records/{id}`;
- batch uses the same rules as PATCH: records that would break them (last value of a required field, too many values)
  are **skipped and reported**, not written (answer 2026-11-10);
- field selector for a mixed scope = **one united flat list** of the fields of all record types in scope (answer 2026-11-10);
- first group implemented: **Field values** (Add, Replace, Delete). Other entries are listed but disabled.

## 2. UI (this repo, `apps/explorer/src/tools/actions/`)

Lazy chunk like Export: `ExplorerApplication._createToolModule` gets `actions: (body) => this._createActionsTool(body)`
and `loadActionsTool()` = `import('../tools/actions/ActionsTool.js')`. Options as ExportTool (apiClient, getDbDefs,
getDataSource, getSelection, database, language) plus `showRecords(ids, title)` (opens ids as a new Explorer result,
through the existing search entry of ExplorerApplication).

Files:
- `actionCatalog.js`: groups and entries `{id, group, name, description, implemented}`, texts from Artem's list
  (Metadata: Ownership and visibility, Rebuild record titles, Convert to record type, Add or Remove Tags, Rate,
  Unbookmark; Field values: Add, Replace, Delete, Add Link or Relation, Rebuild calculation fields; Verify values
  (later); Dangerous zone: Delete records, Correct and define missed descriptions). Only `field-add`,
  `field-replace`, `field-delete` have `implemented: true`.
- `ActionsTool.js` + `ActionsTool.css` (HBaseWidget):
  1. **List pane**: group headings, rows with two columns Name | Description; not implemented rows disabled.
     A click opens the action pane.
  2. **Action pane**: Back to the list; a) help text (the description); b) **Scope** section (same as Export);
     c) the action form; Run button (+ problems list as in Export). Confirm before run: "Change N records?".
  3. **Job**: as Export: `JobClient.start('record-action', params)`, `HJobMonitor` while it runs (form hidden),
     running job restored after a reload (`jobs.list({type: 'record-action', brief: true})`), one job at a time
     (Run disabled while one runs; the server refuses a second one). Toolbar button **Last result** shows the
     report of the newest finished job (also a stopped or failed one, §3).
  4. **Report** (`ActionReport.js`): records in scope; records with the field; changed; unchanged (no match / no
     value); skipped by reason (no rights, required, max values, single value, not in structure); errors (id +
     message, first 100); values found (matched or existing); values added; values removed; time. Buttons
     *Show changed records* / *Show skipped records* / *Show records with errors* → `showRecords(ids)`.
- **Field values action** (`FieldValuesAction.js`; mode fixed by the entry). Everything is **inline** in the action
  pane, no popups: the field list, and below it, once a field is picked, the form.
  - **Field**: `ActionFieldList.js` - flat united list of the fields of all record types in scope
    (`dbdefs.fields(rty)` per type, each field id once, types freetext, blocktext, date, float, enum; no header
    fields, pointers, files, relmarkers). Row: field name, type icon, "in N record types" (tooltip: names). Filter box
    on top. Single selection.
  - **Form = HEditForm** (`fieldValuesForm.json`, `heurist-edit-form/1`, `docs/development/Edit-Form-Format.md`),
    rebuilt when another field is picked. Its fields:
    - `matchMode` radio *All values* / *Conditionally* (Replace, Delete);
    - group with `slot: "condition"` (`showWhen` matchMode = conditional): the owner mounts `HFilterBuilderItem`
      (`apps/explorer/src/widgets/filter-builder/`) there in `onReady`, with a new option `fixedField: true` (field
      button and remove hidden; `setField({dty, fieldType})`), so operators and value inputs are the Filter Builder ones.
      The condition = `composeQuery({rows: [row]}, queryVocabulary)` → the value of `f:<dty>` (e.g. `=Johnson`, `son%`,
      `-Johnson`, `<>1900,2000`). A result that is not one string (several values joined by AND/OR) → problem "Use one condition";
    - `addIfNone` checkbox *Insert as new value if none exist* (Replace, `showWhen` conditional);
    - `value` "Value to be added" (Add) / "Replace with" (Replace): an HEditForm field whose `type` (and `vocabulary`
      for enum) is copied from the picked field, so the normal HEditField input is used (date = HInputTemporal,
      enum = term picker). Not shown for Delete.
- **Scope**: extract the scope part of Export into `apps/explorer/src/tools/toolScope.js` (options: current result,
  selection, one record type of the result; record type counts by `aggregate('rectypes')`; `scopeParams()` =
  `{query, ids?, rectypes?}`), used by ExportTool and ActionsTool. Export behaviour unchanged.
- **One record** in scope (selection of 1, or a result of 1): `RecordEditClient.patch(id, body, {force: true, fields:
  'rec_ID,rec_Modified'})`; the report is built from `meta.changed` or the 422/403 answer. No job.
- Localization: texts with `h-i18n` / `$HR`, `apps/explorer/public/assets/localization/localization_eng.txt`, `_fre.txt`.

Request of one action (the job params; the PATCH body is the same `details` / `detailsAdd` / `detailsMatch` / `addIfNone`):
```json
{ "action": "field-replace", "title": "Replace Name: Johnson → Smith",
  "scope": { "query": [...], "ids": [], "rectypes": [] },
  "field": 1, "values": ["Smith"], "match": "=Johnson", "addIfNone": false }
```

## 3. Server (heurist repo)

- **Job type `record-action`** (one type for every action → one running action per user, `JobRunner` rule):
  `srv/Records/Actions/RecordActionJob.php` (JobHandlerInterface, like `Records/Export/ExportJob.php`),
  `RecordActionRequest.php` (validation in `prepare()`: action known and implemented, field id, values, match string),
  `FieldValueAction.php` (one record: builds a `RecordInput` and calls `RecordSaveService::save('PATCH', $id, $input,
  force: true)`; maps `RecordEditException` 403 → skipped `rights`, 422 codes `required` / `single_value` / `max_values` →
  skipped by code, field not in the record type → skipped `structure` before the call, other → error).
  One transaction per record (keep simple; the job reports progress every record, `JobContext::check()` for Stop).
- **Scope ids**: move the paging search of `ExportPlanner::searchIds()` to `srv/Records/Search/RecordScope.php`
  (`ids(query, ids, rectypes, max)`), used by Export and Actions; at most `maxRecords` (Export setting reused).
- **No write when nothing changes** (`RecordSaveService::patchFields`): when every `changed` count is 0 and no header
  key is sent, return without the transaction (rec_Modified stays). Also for single PATCH.
- **Report also for a stopped job** (Stop, time limit, failure): records before the current one are committed (one
  transaction per record), so the counts are true. `JobContext` gets `setPartialResult(array)`; the action updates it
  after every record (written with the progress, `WRITE_INTERVAL`), and `JobRunner::run` stores it as `result` when the
  job ends as `cancelled`, `timeout` or `failed` (today the result is dropped). The partial result has
  `interrupted: {status, stage, done, total, lastRecordId}` - stage `scope` (searching the records) or `records`
  (record N of M; the current one is rolled back). The report shows "Stopped at record N of M (last changed #id)" above
  the counts. Export and reports do not set a partial result, so they are unchanged.
- Result of the job: the counts of §2 report; id lists `changed`, `skipped` (by reason), `errors` (each at most 10,000
  ids; messages for the first 100 errors). Stored as the job result (no file).
- `ServiceFactory::recordActionJobHandlers()`; registered with the other job types in `hserv/controller/api.php`.
- Docs: `srv/Jobs/_README.md` (new type), `srv/Records/Actions/_README.md`, OpenAPI tag Jobs (params of `record-action`).

## 4. Documents

- Plan 32: status line and §6 (route agreed, see plan 33). Plan 23 §15 item 2 → plan 33.
- CLAUDE.md "Current work" entry; memory `field-patch-plan32.md` updated.

## 5. Verification

- Server `heurist/tests/RecordActionTest.php` (osmak_mapping, own test records, deleted at the end): add / replace /
  delete for ids and for a query scope; conditional replace with and without `addIfNone`; skipped required (delete of the
  last value), skipped max (add to a single-value field), skipped `structure`; report counts and id lists; unchanged
  records keep `rec_Modified`; Stop of a running job → status `cancelled` with a partial result (stage, done, counts
  equal to the records really changed). `ExportWriterTest.php` still passes after the scope move.
- JS `apps/explorer/test/actionsTool.test.js`: catalog (disabled entries), united field list (one entry per field,
  allowed types), condition from the Filter Builder row (`=x`, `x%`, `-x`, range; several values → problem), job params,
  one-record PATCH path, restore of a running job. Existing Export tests pass. `npm test`, `npm run build:all`.
- Browser (Artem): Actions pane, each mode on a mixed result, report buttons, reload during a job.

## 6. Implementation (2026-11-10)

### 6.1 Done

Server (heurist):
- `srv/Records/Actions/`: `RecordActionJob` (type `record-action`), `RecordActionRequest` (parameters, `patchBody()`),
  `FieldValueAction` (one record, PATCH rules, skip codes), `RecordActionReport` (counts, id lists, partial report).
- `srv/Records/Query/RecordScope.php`: ids of a tool scope; `ExportPlanner::searchIds` uses it.
- `srv/Jobs`: `JobContext::setPartialResult(callable)` / `hasPartialResult()` / `partialResult()`; `JobRunner::run`
  stores it as `result` of a cancelled, timed-out or failed job.
- `RecordSaveService::patchFields`: no write when nothing changes and no header field is sent (rec_Modified stays);
  answer `values` = field => {found, added, removed}; `RecordEditController` gives it as `meta.values`.
- `ServiceFactory::recordActionJobHandlers()` (limits: `maxRecords` and `timeLimit` of the Export settings),
  registered in `hserv/controller/api.php`.
- Test `tests/RecordActionTest.php` (35 checks with `--write`, including a job stopped by its time limit).

Client (this repo):
- `apps/explorer/src/tools/toolScope.js` (scope of Export and Actions), `apps/explorer/src/tools/actions/`
  (`ActionsTool`, `actionCatalog`, `FieldValuesAction`, `fieldValueParams`, `ActionReport`, CSS), lazy chunk from
  `ExplorerApplication._createActionsTool`; `showRecords` = `showDatasource({request: {q: [{ids}]}})`.
- `HFilterBuilderItem` option `fixedField`; `RecordEditClient.patch` returns `values`.
- Test `apps/explorer/test/actionsTool.test.js`; localization texts (eng, fre).

### 6.2 Differences from the plan

- One record by PATCH only for a **selection of one record**; a result of one record runs as a job (the client does not
  know the id of the result).
- `RecordScope` is in `srv/Records/Query/` (beside `RecordSearchService`), not `Records/Search/`.
- The partial result is a callback (`setPartialResult(callable)`), read only when the job ends: copying the id lists
  after every record would cost too much on large sets. It is not written while the job runs, so a "lost" job
  (PHP killed) has no report.
- With `fixedField` the word operators (all words, any word, no words) are also left out: they search the whole record.
- PATCH answer has `meta.values` (new), so the one-record report has the same value counts as a job.
- The long action descriptions are not in the localization files (only the short texts).

### 6.3 Results

`RecordActionTest.php --write` 35 pass; `FieldPatchTest.php --write` 52, `JobRunnerTest.php` 35,
`ExportWriterTest.php` 87, `DataAccessBoundaryTest.php` pass. `npm test` 1,693 pass; `npm run build:explorer` ok
(`heurist-explorer-ActionsTool.js` own chunk, 25 kB).

## 7. Review round 1 (Artem, 2026-11-10; done, not committed)

1. "Correct and define missed descriptions" was a task, not an action: entry removed; the descriptions of the entries
   that had placeholder texts (Add Link or Relation, Rebuild calculation fields, Ownership, Tags, Rate, Unbookmark,
   Verify values, Delete records) written.
2. "All actions" (Back) is not shown on the list (`[hidden]` of a `.h-btn` in the toolbar).
3. Field list: record types column of fixed width (16em), names joined and cut with an ellipsis; tooltip with all.
4. Field type filter of HFieldTree (`fieldTypeFilters.js`: all, text, enum, date, numeric; only types in the list).
5. Descriptions under keys in the localization files (`valueadd_desc`, `valuereplace_desc`, `valuedelete_desc`,
   `valuelink_desc`, `valuecalc_desc`, `metaowner_desc`, ...; eng + fre); `actionDescription()` falls back to the
   English text of the catalog.
6. Group order: Field values, Metadata, Verify values, Dangerous zone.
7. Bug: "contains linda" did not match "Belinda". The text condition of the search is a word / word-start match
   (FULLTEXT `MATCH ... AGAINST`), by design for searching. Value matching (PATCH `detailsMatch`, plan 32) now uses a
   plain substring: `FieldPredicateCompiler::valueCondition(..., $substring = true)` → `LIKE %x%` (one record, no index
   needed). Search unchanged. Check in `tests/RecordActionTest.php` (36 pass).

## 8. Phase 2: Ownership, titles, calculated fields, delete (agreed and implemented 2026-11-10; not committed, no browser check)

Agreed (Artem 2026-11-10):
- **Ownership and visibility** with the form of HRecordEditor Summary → Admin (`HRecordAccess`, no edit groups: the
  stored ones are kept): `OwnershipAction.js`; server = PATCH of the header; unchanged records are not written
  (`RecordSaveService::headerChanged`, answer `header`, `meta.headerChanged`).
- **Rebuild record titles** and **Rebuild calculation fields**: scope only (`NoFormAction`); server
  `RecordSaveService::rebuildTitle()` (a blank new title is not written: skipped `blank`; children through
  `refreshTitles`) and `rebuildCalculated()` (`CalculatedFields::update(..., &$changed)`; title and child titles by
  `FieldDependencies`); always the job, also for one record.
- **Delete records**: warning icon in the list, the pane title and the help box; `DeleteAction.js`. Server
  `DeleteGuard`: up to 10 records free; more need the server password **`$passwordForServerFunctions`** (read in
  `ServiceFactory::fromLegacySystem`, checked as `System::verifyActionPassword`, never stored with the job); more than
  10 that are **half of the database or more** only for the database owner (others: "Use Database administration >
  Clear database"). `prepare()` stores the resolved ids: exactly the confirmed records are deleted. One selected
  record: `DELETE /records/{id}?force=1`.
- After records were changed or deleted Explorer runs the current result again (`onRecordsChanged`).

Server: `srv/Records/Actions/` `RecordActionInterface`, `RecordWriteAction` (ownership, titles, calculations, delete),
`DeleteGuard`; `RecordActionRequest` (new actions, `password` not stored, `withIds`), `RecordActionJob` (handlers,
guard), `RecordActionReport` (no value counts for other actions); `FieldValueAction::refusal()` shared (403 rights,
404 missing). Tests: `tests/RecordActionTest.php --write` 62 pass (ownership, titles, calculations, delete with and
without the password, frozen ids); FieldPatch 53, JobRunner 35, WebsiteEdit 79, ExportWriter 87, boundary test pass.

Client: catalog `form` / `danger`, `OwnershipAction`, `simpleActions.js` (`NoFormAction`, `DeleteAction`), report rows
"Records deleted" / reasons `blank`, `missing`; `RecordEditClient.patch` gives `headerChanged`. `npm test` 1,699 pass.

Differences: deleted records are not in the scope of a later job at all (the scope search drops them), so `missing`
appears only for records deleted while a job runs. The pane shows the database share only when Explorer has the record
type counts.
