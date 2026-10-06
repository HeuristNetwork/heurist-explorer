# Smarty Reports — development plan

Status: **agreed with Artem 2026-10-04 (see §Agreed decisions). Phases 1-2 (server) implemented
2026-10-04, Phases 3-5 (client) 2026-10-05; nothing committed, not yet checked in a browser by Artem
(a headless smoke test of the bundle and of the CodeMirror editor passed). Tests: heurist
`tests/ReportsApiTest.php` (48 checks), `tests/JobRunnerTest.php` (40); client `npm test` (1010).
Four review rounds by Artem on 2026-10-05 (see the end). Phase 6 (srv engine) implemented
2026-10-05: same output as the legacy engine on osmak_mapping (`tests/ReportEngineCompareTest.php`);
the new API always uses it (no switch, 2026-10-05). Next: Artem's browser check. §Implementation notes at the end lists where the implementation differs from this plan.**

## Context

Today a report is a file, `HEURIST_FILESTORE/<db>/smarty-templates/*.tpl`. It is managed by
legacy code:
- Server: `hserv/controller/ReportController.php` (actions `execute`, `list`, `get`, `save`,
  `delete`, `import`, `export`, `check`, `rename`, `update`), `hserv/report/ReportExecute.php`,
  `ReportRecord.php` and `ReportTemplateMgr.php`.
- Client: jQuery widgets `hclient/widgets/report/reportViewer.js` (947 lines) and
  `reportEditor.js` (2528 lines, CodeMirror 5, fancytree field tree, snippet builder).
- Schedules: the table `usrReportSchedule` (`rps_Title`, `rps_FileName`, `rps_HQuery`,
  `rps_Template`, `rps_IntervalMinutes`, `rps_URL`, …). It is read by
  `ReportController::updateTemplate()` and `admin/setup/dboperations/dailyCronJobs.php`.
  Output goes to `generated-reports/`.

What already exists and can be reused:
- **Interrupt.** `ReportRecord::startInterrupt()/tickInterrupt()` (`ReportRecord.php:1484-1522`)
  has a timeout and a `terminate` flag in the session progress table.
  `ReportTerminatedException` is caught in `ReportExecute::executeTemplateContinue()` (:664).
- **Preview limit.** In preview, records are limited to 50 by the `smarty-output-limit`
  preference (`ReportExecute::setLimit()`, :304).
- **Duplicated client code.** Four apps (`data`, `graph`, `map`, `recordview`) each have their
  own copy of `ReportTemplateProvider.js` (template list from the legacy controller). `data`,
  `graph` and `recordview` each have their own `RecordContentProvider.js`
  (`?snippet=1&publish=1&q=ids:N&template=…`).
- **Explorer has a place for it.** The right rail already has a `report` button in the
  `tools` group (`ExplorerControlPanel.js:1666`). `ExplorerApplication.openTool()` (:1303)
  opens Tools mode (Data | Tool), currently with a placeholder.
- **Concept codes.** `DT_NAME` 2-1, `DT_SHORT_SUMMARY` 2-3, `DT_EXTENDED_DESCRIPTION` 2-4,
  `DT_MIME_TYPE` 2-29, `DT_FILE_NAME` 2-62, `DT_DATA_SOURCE` 3-1083, `RT_QUERY_SOURCE` 3-1021
  (`hserv/consts.php`). There is no `DT_DESCRIPTION`; use `DT_SHORT_SUMMARY`.
- **Termination and statement limits in `srv/`.** These come from plan 10:
  `Runtime/RequestRegistry`, `Database/StatementLimit`, `QueryCancelController`.
- **Owner grouping.** Query Sources are already grouped by owner group: `groupByOwner` in
  `ExplorerControlPanel.js:1676`.

**Goal:** a modern Reports manager and editor in Explorer. Reports are described by records.
Long generation runs in a background job that can be watched and stopped. Presentation modules
show only safe single-record (card) reports. A generic job framework is reused later for batch
actions and exports.

## Agreed decisions (2026-10-04)

1. **Record types now.** Metadata is edited in the legacy record editor through the host
   `editRecord`/`addRecord` bridge, as Map does. We do not wait for HEditForm.
2. **Template body stays in the `.tpl` file.** The record refers to it by `DT_FILE_NAME`.
3. **Dynamic multi-record runs** are allowed only while the DB setting *Allow dynamic reports*
   is on. It is ON for existing databases and OFF for new ones. The following are always
   allowed: single-record render, editor test (≤ 50 records, logged-in user), and serving
   generated files.
4. **Job state is kept in JSON files**: `filestore/<db>/scratch/jobs/<jobId>.json`.
5. **New app `apps/reports`.** Explorer loads it lazily through `apps/reports/src/direct.js`.
   CodeMirror goes into the lazy chunk only. Reports is not part of Explorer in publication
   mode, because the `tools` rail group is hidden there.

6. **"Is card view"** uses the existing Flag vocabulary (Yes|No); no new vocabulary.
   Yes = single-record report (popups, cards, Record view). No or empty = record-set report.
7. **Concept codes** (from Artem, 2026-10-04): `RT_CUSTOM_REPORT` 2-1104,
   `RT_REPORT_SCHEDULE` 2-1105, `DT_IS_CARD_VIEW` 2-1182, `DT_REPORT` 2-1183,
   `DT_INTERVAL_MINUTES` 2-1184. Record-type and field codes are separate lists, so they do not
   clash with `DT_CMS_MENU_FORMAT` 2-1104 and `DT_TIMELINE_FIELDS` 2-1105.
8. **Schedules** can be created only by members of the report's owner group or by the
   database owner.
9. **Generated files are kept** when a Schedule is deleted.
10. **Default limits** are accepted: preview 30 s, generate 600 s, 1 job per user, N per DB.
11. **The card-report list** (`scope=card`) returns every Custom Report record that the
    current user can view, under the normal record access rules.
12. **One shared Smarty editor and snippet builder** in `shared/`, used by Reports, calculated
    fields and, later, record titles (Phase 5).

## Remarks on the proposal

- **Interval** is an integer number of minutes, the same as `rps_IntervalMinutes`. Empty means
  manual only. The Schedule also gets `DT_NAME` as its title.
- **DT_MIME_TYPE** (2-29) is a term field. The allowed outputs stay as in
  `ReportExecute::setParameters()`: `html`, `js`, `txt`, `csv`, `xml`, `json`.
- **`srv/` must stay independent of `hserv/`, but Smarty execution lives in `hserv`.** We
  therefore use a renderer interface in `srv/` and implement it in `hserv`. The two are wired
  in `hserv/controller/api.php`.
- **Should the Report classes be ported to `srv/`? Yes, but as Phase 6, not first.**
  - `ReportRecord` (~1500 lines) depends on about 18 legacy functions: `recordSearch`,
    `recordSearchByID` (one query per record), `dbs_GetTerms`/`dbs_GetDetailTypes`,
    `mysql__select_*`, `usrRecPermissions` checks, file URLs and relationship lookups.
    `ReportExecute` (~1850 lines) adds output, sanitizing and the CMS/JS filters.
  - Gains from the port:
    - no dependency on legacy code;
    - batched record loading through `RecordDataService` (much faster for large reports);
    - the same access checks, statement limit, cancel and trace as other `srv/` endpoints.
  - Risk: existing user templates depend on the exact template API (`$heurist->getRecord`,
    `{wrap}`, `{out}`, the `file_data` and `label` modifiers, term translation). The output must
    stay the same.
  - Approach:
    - Phases 1–5 use the renderer interface, so the client and the API do not change when the
      engine changes.
    - Phase 6 adds `srv/Reports/Smarty/` and runs a compatibility test: render the existing
      templates of test databases with both engines and compare the output.
    - Switch per database when the outputs match.
- **Only the server can enforce 5b.** The Explorer UI alone cannot, because the
  `ReportController` `execute` URL is public.

## Phase 1 — Record types, migration and the reports API (heurist repo)

1. **Core definitions** (concept codes in decision 7):
   - Record types: `RT_CUSTOM_REPORT` (DT_NAME, DT_SHORT_SUMMARY, DT_FILE_NAME,
     `DT_IS_CARD_VIEW`) and `RT_REPORT_SCHEDULE` (DT_NAME, DT_DATA_SOURCE, `DT_REPORT`,
     DT_FILE_NAME, DT_MIME_TYPE, `DT_INTERVAL_MINUTES`).
   - New fields: `DT_IS_CARD_VIEW` (Flag vocabulary Yes|No), `DT_REPORT` (pointer → Custom
     Report) and `DT_INTERVAL_MINUTES` (integer).
   - Add them to `hserv/consts.php` and to the `ServiceFactory` code lists.
2. **Migration** (on demand, `POST /reports/setup` — see §Implementation notes):
   - Each `usrReportSchedule` row → a Schedule record. If no Query Source matches
     `rps_HQuery`, create one with `DT_QUERY_STRING`.
   - Templates referenced by schedules → Custom Report records.
   - The table stays read-only until cron uses only the records (Phase 2).
3. **Unregistered files.** `.tpl` files without a record are listed as *Unregistered*, with a
   **Register** action (create the record with the file name filled in). Nothing is created
   automatically.
4. **`srv/Reports/`**: `ReportRepository` (records + files), `ReportTemplateStore` (file CRUD
   and safe names, logic taken from `ReportTemplateMgr`), `ReportRendererInterface`,
   `ReportPolicy` (setting from decision 3, owner/group rights) and `ReportController`.
   Endpoints:
   - `GET /api/{db}/reports[?scope=card]`: records + unregistered files, with owner group,
     card flag and schedules. `scope=card` returns every card record the current user can view.
   - `ReportPolicy`: schedule create, edit and delete are allowed only for the owner group or
     the DB owner.
   - `GET|PUT /reports/{id}/template`; `POST /reports/import`; `GET /reports/{id}/export`;
     `DELETE /reports/{id}` (the record, plus the file if no other record uses it).
   - `GET /reports/{id}/render?rec=N`: HTML for one record. This replaces the
     `snippet=1&q=ids:N` URL.
   - `GET /reports/generated`: list of output files (name, size, modified, schedule, URL).
5. **`hserv/report/SmartyReportRenderer`** implements the interface on top of
   `ReportExecute`. Import and export with concept-code conversion reuse
   `ReportTemplateMgr::convertTemplate()`.
6. **Policy in legacy `ReportController::execute`:** a run with more than one record and no
   test limit is refused when *Allow dynamic reports* is off.

## Phase 2 — Generic background jobs

1. **`srv/Jobs/`**:
   - `JobStore`: JSON file per job, `{id, type, db, user, status: queued|running|done|failed|
     cancelled|timeout|lost, progress {done,total,message}, heartbeat, startedAt, limitSec,
     result, error}`.
   - `JobContext`: `progress()`, `check()` (throws on cancel or timeout, throttled to 0.5 s as
     in `tickInterrupt`), `heartbeat`.
   - `JobHandlerInterface` and `JobRunner`.
   - `JobController`: `POST /api/{db}/jobs` (start), `GET /jobs[?mine=1]`, `GET /jobs/{id}`,
     `POST /jobs/{id}/cancel`, `GET /jobs/{id}/result`.
2. **Detached run.** The start request writes the job file, sends `{jobId}`, closes the
   connection (`fastcgi_finish_request()` when available, otherwise `Content-Length` +
   `Connection: close` + flush), sets `ignore_user_abort(true)` and
   `set_time_limit(limitSec+30)`, then runs the job. A later option is a CLI spawn
   (`php …/jobs-run.php`) controlled by a server setting.
3. **Limits.**
   - Time limits are per job type: preview 30 s and generate 600 s (defaults, set in the DB
     settings).
   - The SQL statement limit is applied to the job's connection.
   - At most 1 running report job per user and N per database.
   - A job whose heartbeat is older than 30 s is marked `lost`.
   - Job files older than 7 days are deleted.
4. **Interrupt.** `ReportRecord` interrupt takes a callback (`JobContext::check`) instead of
   only the session id. The session path stays for the legacy viewer.
5. **Report handlers** (in hserv, registered in `api.php`):
   - `report-preview`: ≤ 50 ids, or an unsaved body. The result is HTML kept in the job file.
   - `report-generate`: a Schedule or a Query Source + report. The result is a file in
     `generated-reports/`.
   - Cron (`dailyCronJobs.php`) runs the same generate handler for Schedule records whose
     interval has passed.

## Phase 3 — Shared client pieces (this repo)

1. **`shared/src/api/JobClient.js`**: start, poll with backoff, cancel, result. It uses
   `HeuristApiClient`.
2. **`shared/src/widgets/job/HJobMonitor.js`** (+ css): progress bar, elapsed time, **Stop**,
   status, and a result link. It is reused later for batch actions and exports.
3. **`shared/src/data/ReportTemplateProvider.js`** and **`RecordContentProvider.js`**: one copy
   each, replacing the copies in `data`, `graph`, `map` and `recordview`. Template pickers in
   module configuration use `scope=card`. Rendering uses `/reports/{id}/render`. The legacy
   name-based URL is kept as a fallback for old saved configurations.
4. If needed, move `groupByOwner` to `shared/src/utils` so that Explorer lists and Reports use
   the same grouping.

## Phase 4 — `apps/reports`: the manager

1. **New target `reports`**: dev port 5179, `build:reports`, `deploy:reports`, `test:reports`,
   localization files, a public API `HeuristReportsPublicApi`, a host adapter, and
   `src/direct.js`. Update the architecture test so that Explorer is also allowed to import
   `apps/reports/src/direct.js`.
2. **Explorer:** in `openTool('report')`, use `await import(...direct.js)` and mount it in
   Tools mode (Data | Reports).
   - The host bridge provides: current result ids and selection (for tests), `editRecord` and
     `addRecord` (record type Custom Report or Schedule), and the trace monitor.
   - In publication mode the `tools` group is hidden.
3. **Manager UI:**
   - A list grouped by owner group, with a scope filter (Card / Record set) and a search box.
     Unregistered files appear in their own group.
   - A details pane: description, file, scope, schedules, and generated outputs (view,
     download, regenerate).
   - Actions: New, Edit template, Edit properties (`editRecord`), Duplicate, Import, Export,
     Delete, Register, Add schedule, Test with current result, Generate now.
   - Running jobs are shown with `HJobMonitor`.

## Phase 5 — Shared Smarty editor (`shared/src/smarty/`), used by `apps/reports`

The editor is **one shared component, not separate editors**. The legacy `reportEditor`
already has two modes: `publish=0` for reports and `publish=4` for calculated-field snippets.
Record titles are planned to move to Smarty as well. One snippet builder and one field tree
keep the generated code the same everywhere. Each user (Reports, calculated-field editor,
title editor, later HEditFormDesigner) imports it lazily.

1. **`HSmartyEditor`** (CodeMirror 6). The current npm versions are `codemirror` 6.0.2 and
   `@codemirror/view` 6.43.x; 6 is the current major version (CM5 is legacy).
   - HTML language with a Smarty `{…}` overlay (`StreamLanguage`). Check whether
     `@codemirror/legacy-modes` 6.5 has a Smarty mode.
   - Search, bracket matching, and completion of field names.
   - Option `mode`:
     - `report`: `$results` loop, test with up to 50 records;
     - `record`: single `$r`, test with 1 record. Used for card reports, calculated fields and
       titles.
   - CodeMirror is loaded only with this component, through a dynamic import.
2. **Field tree.** Reuse **`HFieldTree`** from the Filter Builder
   (`apps/explorer/src/widgets/filter-builder/HFieldTree.js`, tests in `hFieldTree.test.js`).
   - Move it to `shared/src/widgets/field-tree/`, because an app cannot import another app.
     Explorer's Filter Builder then imports it from shared.
   - Add an option for enum/relationtype fields to choose the output: **label, code or id**.
     The legacy editor has the same choice (`_isTermSubfield`).
   - Remove the fancytree tree.
3. **Snippet builder.** Port `reportEditor.js` `_buildSmartySnippetForNode`,
   `_buildSelectionTree`, `_renderLeafExpression`, the relationship snippets, etc.
   (lines 1361–2528) to pure functions in `shared/src/smarty/smartySnippetBuilder.js`, with
   tests. Also port the patterns menu (`_insertPattern`).
   - Tests compare the output with the legacy editor's output for the same selections.
4. **Test run.** The editor starts a `report-preview` job with the selection, or the first 50
   records of the current result, plus the unsaved body. The result is shown in a sandboxed
   iframe, with **Stop** and a time limit. Error levels (`replevel` 0–3) are kept.
5. Keep the legacy editor's save, save as, unsaved-changes warning on close, and delete.
6. `apps/reports` puts `HSmartyEditor` (mode `report` or `record`, from the card flag) together
   with the manager.

## Phase 6 — Port the Smarty engine to `srv/Reports/Smarty/`

1. Port `ReportRecord` on top of `RecordDataService`:
   - batch-load records with details, terms, files and relationships;
   - check access with the `srv` rules.
2. Port `ReportExecute`: output modes, sanitizing, JS/CMS filters, term translation and the
   `{wrap}`/`{out}` plugins.
3. Implement `ReportRendererInterface`. A compatibility test renders all templates of the
   test databases with both engines and compares the output. Switch per database with a
   setting, and remove the hserv adapter when all outputs match.

Implemented 2026-10-05; see §Implementation notes, "Phase 6".

## Later (not in this plan)

- A CMS editor element "Generated report", using `GET /reports/generated`.
- Legacy hclient: replace `reportViewer`/`reportEditor` with the `heurist-reports` bundle
  through a wrapper.
- Record title masks in Smarty, using `HSmartyEditor` in `record` mode. A separate decision is
  needed: speed, because the title is recomputed on every save, and conversion of the existing
  masks.
- Use the job framework for records batch actions and exports.
- Remove `usrReportSchedule` once all databases are migrated.

## Open questions

- Who may run "Generate now" without a schedule. Proposal: any logged-in user who can view
  the report; the output file name gets the user id.
- Whether Phase 6 waits for Phases 1–5, or starts after Phase 2.

## Verification (for the implementation phases)

- Server: `php tests/ReportsApiTest.php`, `tests/JobRunnerTest.php`,
  `tests/ReportMigrationTest.php` (run from `heurist/`), plus manual tests on `osmak_mapping`:
  - start, poll, cancel and time out a generate job;
  - check that *Allow dynamic reports* off blocks `execute` with `q=` for a record set.
- Client: `npm test` (new `shared/test/jobClient.test.js`, `apps/reports/test/**`, including
  snippet builder tests ported from the legacy outputs), the architecture test, and
  `npm run build:all` + `verify:build`. The Explorer main chunk must not contain CodeMirror.
- Browser: open Report in Explorer, edit a template, test with the current selection, Stop a
  long test, generate, view the output, and check that a card report renders in a Map popup and
  in Record view.
- Phase 6: the engine compatibility test produces no output differences on the test databases.

## Implementation notes

### Phase 1 (2026-10-04)

Server files (heurist repo): `srv/Reports/` (`ReportService`, `ReportRepository`,
`ReportTemplateStore`, `ReportPolicy`, `ReportRendererInterface`,
`ReportRecordWriterInterface`), `srv/Controller/ReportController.php`,
`hserv/report/SmartyReportRenderer.php`, `hserv/report/ReportRecordWriter.php`, the route in
`hserv/controller/api.php`, `ServiceFactory::reportController()`. Routes are listed in the
header of `srv/Controller/ReportController.php`.

Differences from the plan:
- **File name field is `DT_FILE_NAME` 2-62** (Artem, 2026-10-04; the first version of the
  record types used `8-62`, replaced by 2-62 in Heurist_Core_Definitions the same day).
  **Description is `2-4`** (`DT_EXTENDED_DESCRIPTION`); `DT_SHORT_SUMMARY` is read as a fallback.
- **No DB upgrade step.** The definitions are installed on demand by `POST /reports/setup`
  (database owner or manager): DbsImport of 2-1104 and 2-1105 from Heurist_Core_Definitions,
  like `checkPresenceOfRectype` in the legacy client. The same call converts `usrReportSchedule`
  rows. The list returns `installed`, `missingDefinitions` and `canSetup`, so the manager
  (Phase 4) can offer the setup.
- **Converted schedules**: one Query Source per row (`q` taken from `rps_HQuery`), the report
  record is found by file name or created, owner group 1 (Database managers), visibility
  `viewable`. A row is skipped when a schedule with the same output file name exists, so setup
  can run again. The table is kept.
- **Reference = record id or file name.** `/reports/{ref}` accepts a record id or a template
  file name (URL-encoded, with `.tpl`), so unregistered files and the template names stored
  in old module configurations work: `GET /reports/{name}.tpl/render?rec=N`.
- **Extra routes**: `POST /reports` (new report: file name from the title, plus its record),
  `POST /reports/{file}/register`, `POST /reports/setup`.
- **Rights**: a record can be changed by the DB owner, managers, and members of its owner
  group; unregistered files by any logged-in user (as in the legacy editor).
- **Setting**: `settings/reports.json` (`SystemSettings` name "Reports"),
  `{"allowDynamicReports": false}` is written for new databases in
  `DbUtils::databaseCreateFolders`. The legacy `ReportController` "execute" refuses other
  record-set runs when it is false; one record (`q=ids:N` or a one-id recordset), `publish=4`
  (calculated fields) and the editor test with `template_body` stay allowed.
- **Render** uses the same parameters as the old popup URL (`publish=1`, `snippet=1`,
  `q=ids:N`); the output was compared with the legacy URL and is the same.
- `PresentationRecordRepository::accessCondition()` was extracted so report lists use the same
  visibility rules as Query Sources.
- Fixed in legacy `ReportTemplateMgr::convertTemplate()`: import of a template without any
  `{...}` expression failed (mode 1 returned a string instead of an array).

Found during Phase 1, for Artem:
- Done 2026-10-04: field `8-62` replaced with `2-62` in Custom Report and Custom Report Schedule
  (Heurist_Core_Definitions; in `osmak_mapping` the two structures were updated directly).
- The **"Mime Type" vocabulary (2-29, local 3328) has only image types**. Report schedules
  need `text/html`, `text/plain`, `text/csv`, `text/xml`, `application/json`,
  `text/javascript`, `text/css` (or a separate vocabulary). Until then the format is `html`
  when the term is missing; the setup report names the formats it could not set.
- The new record types have **no title mask** in Heurist_Core_Definitions; records get the
  default "Please edit any Custom Report record…" title. The API uses the Name field.

Tests: `php tests/ReportsApiTest.php --db=osmak_mapping --user=2 --rec=151 [--write]`
(25 read-only checks, 44 with `--write`). Checked over HTTP: anonymous card list, 401 for
anonymous writes, render = legacy output, the `allowDynamicReports` switch. Schedule
conversion was checked on `osmak_mapping` with two temporary rows (converted once, skipped on
the second run, then removed). `osmak_mapping` now has the two report record types.

### Phase 2 (2026-10-04)

Server files (heurist repo): `srv/Jobs/` (`JobRunner`, `JobStore`, `JobContext`,
`JobHandlerInterface`, `JobInterruptedException`), `srv/Controller/JobController.php`,
`srv/Reports/ReportJobPlanner.php`, `hserv/report/ReportJobBase.php`, `ReportPreviewJob.php`,
`ReportGenerateJob.php`, `admin/setup/dboperations/runReportSchedules.php`, the `/jobs` route in
`hserv/controller/api.php`, `ServiceFactory::jobController()/jobRunner()/reportJobPlanner()`.

API (`/api/{db}/jobs`, logged-in users only):
- `POST /jobs {"type", "params"}` answers 202 with the queued job, closes the connection
  (`Content-Length` + `Connection: close`, `fastcgi_finish_request()` when available) and runs
  the job in the same PHP process. Checked under XAMPP Apache (mod_php): the client got the
  answer while the job ran.
- `GET /jobs[?all=1]`, `GET /jobs/{id}`, `POST /jobs/{id}/cancel`, `GET /jobs/{id}/result`.
- `report-preview {report?, body?, ids (1..50), replevel?}`: the HTML is the job result.
- `report-generate {schedule}` or `{report, querySource | query, format?, output?}`.

Differences from the plan and decisions taken:
- **Stop** is a separate `<id>.cancel` file (no race with the running job over the state file),
  and runs `KILL QUERY` on the connections the job registered: the legacy mysqli connection of
  the Smarty run and the PDO connection of the search.
- **Records of a generation are found with the modern search** (`RecordSearchService`, the Query
  Source query as Explorer runs it), at most 100,000; the ids are passed to the engine as a
  recordset. Expansion rules of the Query Source are not used (main records only).
- **The time limit reaches the engine** through a callback (`ReportExecute::setInterrupt()`,
  `ReportRecord::startInterruptCallback()`, checked while records are read); the legacy session
  progress path stays for the old viewer. The legacy connection also gets the job's statement
  time limit; the search connection keeps the normal 30 s limit.
- **Failed generation never replaces the last good file**: the engine writes `job-tmp-<id>.<ext>`,
  which is renamed only on success (the engine writes its error text into the output file).
- **"Generate now" without a schedule** (open question): any logged-in user who can view the
  report; the output name gets `_u<userId>`.
- **Limits** are Reports settings: `previewTimeLimit` (30 s), `generateTimeLimit` (600 s),
  `maxJobs` (3 per database); one active job of the same type per user; lost after 90 s without
  heartbeat; job files kept 7 days.
- **Cron**: `dailyCronJobs.php report` runs `runReportSchedules.php --db=X` in a separate PHP
  process per database that has 2-1105 (record type constants are fixed per process; the cron
  loop changes databases). A schedule is due when it has an interval and its file is missing or
  older than the interval. As before, cron generates as an anonymous user, so only public records
  are in the file. The legacy `updateTemplate()` skips `usrReportSchedule` rows whose output file
  name belongs to a schedule record, so nothing is generated twice.
- Fixed in legacy `ReportExecute`: a test of an unsaved template body within the same second as
  the previous test ran the previous compiled body (the temporary file is named per user and
  file times have 1 s resolution); temporary bodies are now always recompiled.
- Smarty record fields are `recID`, `recTitle`, ... (the first test template used `rec_Title`).

### Phases 3-5 (2026-10-05)

Client files (this repo):
- Phase 3 (shared): `shared/src/api/JobClient.js` (start, poll 0.3 s → 2 s, cancel, result),
  `shared/src/widgets/job/HJobMonitor.js` (+css: title, status, progress bar, elapsed time,
  Stop, result link), `shared/src/data/ReportTemplateProvider.js` and
  `shared/src/data/reportRenderUrl.js`, `shared/src/recordview/RecordContentProvider.js`,
  `shared/src/utils/ownerSections.js` (moved from ExplorerControlPanel, re-exported there).
  The copies of ReportTemplateProvider (data, graph, map, recordview) and RecordContentProvider
  (data, graph) were removed; Map's PopupProvider and Record view's provider use the shared URL.
- Phase 4: new app `apps/reports` (target `reports`, port 5179, manuals
  `user-manual/reportsUserManual{Eng,Fre}.htm`): `core/ReportsApplication`, `data/ReportApi`,
  `host/ReportsHostAdapter` and `HeuristReportsPublicApi`, `ui/ReportManager` (toolbar, setup
  banner, list grouped by owner, details/editor pane), `ui/ReportDetails` (actions, schedules,
  generated files, job monitor, test result), `ui/formDialog`. Explorer: `openTool('report')`
  mounts it in Tools mode with a dynamic import of `apps/reports/src/direct.js`; Back / another
  tool asks before closing an editor with unsaved changes.
- Phase 5: `shared/src/smarty/` (`HSmartyEditor`, `codemirrorSetup.js`, `smartyTokenizer.js`,
  `smartySnippetBuilder.js`, `smartyPatterns.js`), `HFieldTree` moved to
  `shared/src/widgets/field-tree/`, `apps/reports/src/ui/editor/ReportEditorPanel.js`.

Differences from the plan and decisions taken:
- **Values of the card template list stay template names without ".tpl"**, as the legacy list
  stored them in module configurations. When the report record types are not installed (or
  `/reports` is missing), the list falls back to all legacy template files.
- **Render URL**: `/api/{db}/reports/{name}.tpl/render?rec=N`; templates of the legacy default
  folder (`def/...`) keep the old URL.
- **No result-ids API in Explorer**: the bridge gives Reports the current query (and the
  selection); Reports takes the first 50 ids with `POST /records {detail: ids}`. Generate on
  the current result sends the query to `report-generate`.
- **Add schedule**: the legacy record editor cannot pre-fill fields, so a schedule is created by a
  new endpoint `POST /reports/{id}/schedules` (owner group of the report, `viewable`) and edited
  afterwards with `editRecord`; `DELETE /reports/{id}/schedules/{sid}` deletes it.
- **Repeatable fields**: the definitions snapshot had no max values. Structure rows now have
  `max` (`rst_MaxValues`), snapshot `meta.format` = 2 (older cached snapshots are rebuilt);
  `HDbDefs.isRepeatable(rty, dty)`.
- **CodeMirror 6**: `codemirror`, `@codemirror/{state,view,language,commands,search,autocomplete}`
  and `@lezer/highlight` added. `@codemirror/legacy-modes` has no Smarty mode, so
  `smartyTokenizer.js` (Smarty tags, variables, keywords, strings, comments, `{literal}`, HTML
  tags and attributes; "{ " is not a tag, so CSS/JS braces stay plain) is a StreamLanguage.
  CodeMirror is only in the lazy chunks `*-codemirrorSetup.js` / `*-ReportEditorPanel.js`
  (checked in the Explorer build). Without CodeMirror the editor falls back to a textarea.
- **Field tree**: `HFieldTree.mount()` shows the tree inline and keeps it open after a pick;
  `enumOutputs` turns an enum field into a folder Label / Code / Internal ID (Smarty subfields
  `label`, `code`, `internalid`); `includeFiles` lists file fields. Up to 3 link hops.
- **Snippet builder**: one click inserts one field with the insert options of the legacy dialog
  (test if value exists, line break, caption, loop, comment, wrapper; kept in localStorage).
  Generated code is the legacy code (tests compare whole snippets). New: relationship hops (`r`)
  loop over `getRelatedRecords` filtered by record type; the legacy tree had a separate
  "Relationship" root instead. `buildGroupedSnippet` (legacy "Insert all") is implemented and
  tested but not offered in the UI yet (the tree picks one field at a time).
- **Patterns**: the legacy texts, with the stray "}}" fixed; "Add record link" left out (needs the
  legacy new-record dialog); "Related records" added.
- **Test run** in the editor runs the text as shown (saved or not; a read-only template from
  its file), with the error level of the legacy editor (off / notices / all / debug console);
  the HTML is shown in a sandboxed iframe.
- **Publication mode** does not exist in Explorer yet; when it is added, the `tools` rail group
  (with Report) must be hidden there.


### Review by Artem, 2026-10-05 (first browser check)

Changes made after the review:
- **One toolbar** (the details pane was removed): New, Import, Select report (popover list) |
  for the selected report Template, Register / Edit, Export, Delete | Test, Generate (split
  button: the dropdown lists the report's generated files), Schedule. Below 820 px of width
  (container query) only the icons are shown. `.h-reports` fills the Tools pane (100% width).
- **Report list** like the Query Source list: search, group selector, type selector (all /
  card / record set / without record), accordions by owner group; file names are not shown.
- **Own forms instead of the legacy record editor** (until HEditForm): New, Register, Edit
  (title, description, card flag, template file name) and the schedule form. New server
  endpoint `PUT /reports/{ref}` (also renames the template file); `PUT /reports/{id}/schedules/{sid}`.
- **File names** of templates and the suffix of generated files accept only `A-Za-z0-9 -_`
  (filtered while typing; checked on the server). A legacy file name with other characters
  is not renamed unless the user changes it.
- **Generated file name = the report's file name + an optional suffix** (shown as a fixed
  prefix before the input); `report-generate` adds `_u<user id>`. So the generated files of a
  report are found by prefix: `GET /reports/generated?prefix=` (answer to Artem's question:
  yes). `DELETE /reports/generated/{file}` (managers, editors of the report, or the user who
  generated it).
- **Generate form**: count of the current result shown; the Query Source selector appears only
  when "Query Source" is chosen; parameterized Query Sources are not listed.
- **The form closed when an option of a select was chosen**: a shared `HMsg` bug (a click on
  an option of a native select list reports coordinates outside the dialog box and was taken
  for a backdrop click). Fixed in `shared/src/ui/HMsg.js`: only clicks on the dialog element
  itself close it.
- **Test**: output frame fills the main area (100% width and height); the progress panel is
  hidden 1.5 s after success (a failure stays with its message); Test is disabled while a
  test runs; the section header of the result was removed. With the editor open, Test runs
  the editor's text (shown below the editor, full width).
- **Generated files dropdown**: name (truncated), date, size, show in the frame, open in a new
  window, delete. Files over 5 MB are shown in the frame only after a warning.
- **Schedule**: opens the Schedules dialog filtered to the report, or the new-schedule form
  when the report has none. All visible schedules are loaded once (`GET /reports/schedules`,
  with the report title and the last generated file) and filtered in the browser: search by
  name, report selector. Columns: run now, name, report, interval, last generated, open,
  edit, delete. Interval is a choice: No, 1 hour, 1 day, 7 days, 1 month, 6 months.

Tests: heurist `tests/ReportsApiTest.php` 68 checks with `--write`, `tests/JobRunnerTest.php` 34;
client `npm test` 999.

### Review by Artem, 2026-10-05 (second round)

- Without a selected report every button after the report selector is hidden.
- The setup banner was removed: New and Register ask a manager to install the report record
  types when they are missing (other users are told to ask the database owner).
- Test, Generate and showing a generated file hide the report information and the previous
  output first. Bug fixed: the test output frame was replaced by the report information after
  every run (the toolbar update re-rendered the information); now the information is shown
  again only when another report is selected.
- Record limit of a generated report: it was a fixed 100000 in `ReportJobPlanner` (the search
  API also returns at most 100000 ids per request). Now the database setting
  `generateMaxRecords` (Reports settings file, default 100000, up to 5000000); the ids are read
  in pages of 100000.
- `HJobMonitor`: the progress bar and Stop are hidden when the job has finished, stopped or failed.
- Generated files dropdown: aligned to the right edge of the Generate button; the eye icon was
  removed, a click on the file name shows the file.
- Schedules: run-now icon `fa-bolt`; after the first schedule of a report is added the
  Report schedules dialog opens.
- File names may also contain "(" and ")" (client filter and server check).
- The template editor covers the whole manager, its toolbar included; it has its own Test
  button again (disabled while the test runs), output below the text.

### Review by Artem, 2026-10-05 (third round)

- Buttons after the report selector were still shown without a selection: the CSS
  `display: inline-flex` of the button groups overrode the `hidden` attribute. Fixed with
  `[hidden] { display: none }` rules (checked with computed styles in a headless browser).
- Output is always loaded **by URL**, never copied into the page (`srcdoc` is not used any
  more): a test result from `GET /api/{db}/jobs/{id}/result`, a generated file from its file
  URL. The frame is sandboxed without scripts (`allow-same-origin`, so the request carries the
  login). The engine writes its errors into the output itself.
- The Generate form takes the record count from the DataSource (`meta.count`, passed by the
  bridge's `getCurrentQuery`); it asks the server only when the DataSource has none.
- Test on the current result: the first 50 ids were selected with `LIMIT 50`, but a full page
  also ran the count over the whole result. New option `total: false` of `/records`
  (`SearchRequest::$countTotal`): no count query, `total` is -1. Reports uses it.
- Generated file name: report file name, a **space**, the user's suffix (was "_").
- Report schedules list: Query Source column (title from the host's list, else `#id`).
- Explorer Tools header uses `heurist-module-panel-header` (same look as the module panels).

### Review by Artem, 2026-10-05 (fourth round)

Explorer Tools header:
- The caption uses `heurist-source-header` and reads "Custom reports manager and editor".
- "Back to presentation" is an icon button (`heurist-icon-button`, `fa-times-circle`); the
  text is its tooltip. The placeholder tools use the same header (`toolHeader()` in
  `ExplorerApplication.js`).

Template editor:
- It is a modal layer over the **whole screen** (`position: fixed` on `document.body`, not
  inside the manager). HMsg dialogs open above it (browser top layer).
- Three panes in `HCardinalLayout`: west - patterns and fields, center - the Smarty text,
  east - the test area. **`HCardinalLayout` moved from `apps/explorer/src/ui/` to
  `shared/src/widgets/layout/`** (an app cannot import another app); Explorer imports it
  from there. Its `collapsedSize` option gives the 40px folded strip.
- Pane headers (`heurist-source-header`):
  - west: "Insert Patterns/Variable" and `<<`;
  - center: "Edit: <report title>", unsaved mark, Save (primary) | Save As | Close;
  - east: `>>`, "Test Area", error level, Test.
  A folded pane is 40px wide: the toggle on top, the title written upwards (CSS
  `writing-mode: vertical-rl` + `rotate(180deg)`; it looks the same as `rotate(-90deg)`
  but keeps the strip's layout). Double-click on a splitter also folds. The test area starts
  folded and opens with the first test.
- West pane: Patterns select, "Add fields" (was "Insert fields"), record type, a large primary
  button **Add Selected Fields** (`fa-hand-point-right`, with the number of marked fields),
  and the field tree.
- `HFieldTree` new scope options:
  - `multiSelect`: a click marks a leaf (square / checked-square icon) instead of picking it;
    `getSelectedPaths()`, `clearSelection(paths, {inserted})` (inserted leaves are shown in
    green, as the legacy editor did), `onSelectionChange(count)`; a third header checkbox
    **"Select all visible options"** marks every leaf shown in open folders;
  - enum outputs are now **Term | Code | Concept ID | Description | Internal ID**
    (subfields `term`, `code`, `conceptid`, `desc`, `internalid`);
  - `relationships`: a root "Relationship" folder as in the legacy tree (Relation Type, Notes,
    StartDate, EndDate and the other fields of the Relationship record type, without source,
    target, type, summary and dates);
  - `valuesOnly` hides the query-only leaves "Any field" and "<record type> records" (fifth round).
- Insertion is the port of `reportEditor._insertFields` / `_insertFieldStart` /
  `_insertSelectedVars`: for each marked field a dialog "Inserting fields in report" with the
  legacy options (test if value exists, line break, precede with field name, loop - checked and
  disabled for a repeatable field, field name as comment, wrapper) and **Insert field / Insert
  all / Skip / Cancel**. "Insert all" inserts the remaining fields with these options through
  `buildGroupedSnippet` (fields of one branch share loops; enum outputs of one field give
  `<br> Term: {$r.f20.term}`, `<br> Code: {$r.f20.code}`, ...). Inserted fields are unmarked;
  skipped ones stay marked. The last options are remembered in the browser.
  Deviation: marked fields are grouped by branch in the order the branches were first marked
  (the legacy editor used the tree order), so fields of one branch always share their loop.
- New in the snippet builder: `relationship` segments and `buildRelationshipSnippet()`
  (port of `_buildGroupedRelationshipSnippet` and the Relationship case of
  `_buildSmartySnippetForNode`): one `{foreach $r.Relationships as $Relationship}` with
  `$Relationship.recRelationType`, `$Relationship.relationRecord.f<id>`, ...
- Checked in headless Edge with a probe page on the dev server (fake data): layout, folded
  panes, the dialog, and "Insert all" output.

### Review by Artem, 2026-10-05 (fifth round)

- Field tree of the editor: the "<record type> records" leaf (an "exists" condition of the
  Filter Builder) is hidden too. One scope option `valuesOnly` hides both query-only leaves
  ("Any field" and "<record type> records"); it replaces `anyField: false`.
- "Inserting fields in report" is **one dialog** for all marked fields
  (`apps/reports/src/ui/editor/insertFieldsDialog.js`): Insert field and Skip show the next
  field in the same dialog (the options chosen so far stay), Insert all inserts the remaining
  fields, Cancel stops; it closes when every field is processed. Before, a new dialog was
  opened per field.
- Old code removed: the one-click insertion (`insertField()`) was already replaced in round 4;
  now also the per-field `formDialog` options of round 4 (`actions`, `disabled`, `strong`)
  and the localization keys of the old insert panel.
- Repeatable enum field with several outputs (e.g. Honorific: Term and Concept ID) gave
  wrong code, also in the legacy editor: a loop over `$r.f19s` with a second loop over
  `$f19.f19s` inside it for each output. Now each output has its own loop over `$r.f19s`
  (deviation from the legacy output, agreed with Artem). Also fixed in every value loop: the
  caption is shown before the **first** value (`{if $smarty.foreach.<loop>.first}`; the legacy
  code had `!...first`, i.e. before every other value), and the caption and comma tests use the
  loop's own name (`valueloop2`, ... inside other loops).
- Main toolbar: Template and Test are primary buttons (`h-btn-primary`).
- HMsg dialog titles: `Generic_Title` = "Heurist" and `Error_Title` = "Info" (fre "Information") added to the
  dictionaries of all apps. The neutral "Info" is used because HMsg.showMsgErr also shows messages that
  are not errors.

### Running jobs after a page reload (2026-10-05, agreed with Artem)

Problem: a generation started before a page reload kept running on the server, and a second
Generate failed with "You already have a running job of this kind"; the user could not see or
stop the first job. The client never cancelled jobs (closing only stopped the polling).

Decision: **keep Generate jobs and restore them; replace Test jobs.**
- A generation (shared file, up to 10 minutes) continues when the manager is closed or the page
  reloaded. On open, `ReportsApplication.restoreJobs()` (`GET /jobs`) finds the user's running
  `report-generate` job, selects its report (when nothing is selected) and the manager follows it
  with progress and Stop; the generated file is shown at the end.
- The progress is shown while the job's report is selected; for another report it is hidden
  (`ReportViewer.stopFollowing()`, the job continues) and comes back when its report is selected
  again. The report list marks that report with a spinner.
- Generate while a generation runs (or one started in another tab): no second job; the running
  one is shown with the message "A report is still being generated. Wait for it to finish, or
  stop it."
- Test runs are replaced: `JobHandlerInterface::replacesPrevious()` (true for
  `ReportPreviewJob`); `JobRunner::start()` asks the user's older job of that type to stop, and
  the per-user check skips jobs asked to stop (`JobStore::activeJobs(..., skipCancelled)`). They
  still count for the database limit until they end. Closing the manager or the editor also
  stops the test it started.
- Generate job params carry `reportId` (null for a file without a record); older jobs are matched
  by `templateFile`.

### Test of a single record (card) report (2026-10-05)

A card report is tested on **one record**: the first selected record, or the first record of
the current result (`ReportsApplication.testLimit()`; record-set reports keep 50). Card templates
usually gather all linked and related data of a record, so 50 records can take long. The Test
tips and hints of the manager, the editor and the information panel say which records are used.

### Phase 6 — srv Smarty engine (2026-10-05)

Questions of Artem and the answers (agreed 2026-10-05):
- **New classes in `srv/Reports/Smarty/`** (namespace `Heurist\Reports\Smarty`), not copies:
  `ReportRecord` → `TemplateApi` (the `$heurist` object) + `ReportRecordAssembler` (batched loading,
  record arrays) + `ReportDefinitions`; `ReportExecute` → `SmartyTemplateRunner` + `ValueFormatter`
  (`{wrap}`/`{out}`, file players) + `OutputSanitizer`; `smartyInit.php` → `SmartyEngineFactory` +
  `ReportSecurityPolicy` + `TemplateModifiers`; `SrvSmartyRenderer` implements
  `ReportRendererInterface`. `ReportTemplateMgr` (import/export with concept codes) is not ported:
  the srv renderer passes import/export to the legacy renderer.
- **No conflict of endpoints.** The legacy engine is reached only by legacy URLs (`?template=`,
  `snippet=1`, `controller=ReportController`, `viewers/smarty`, `/{db}/tpl/`), CMS widgets and
  calculated fields; they keep it. The srv engine is used only behind `/api/{db}/reports` and
  `/api/{db}/jobs` and by cron schedules. Both engines run side by side. Shared state: both read
  `smarty-templates/` and write `generated-reports/`; the compile folder is separate
  (`smarty-templates/compiled-srv/`).
- Scope: the new API only. Legacy bugs are fixed in the srv engine; the compare test lists differences.

What was done:
- Engine switch: Reports setting `engine` (`settings/reports.json`: `"srv"` or `"legacy"`, default
  legacy), `ServiceFactory::reportEngine()` / `reportRenderer($legacy)`. Wired in `api.php` (reports,
  jobs) and `runReportSchedules.php`.
- `ReportRendererInterface::renderIds(source, ids, {purpose preview|file, mode, replevel}, JobContext)`.
  The job types moved to `srv/Reports/Jobs/` (`ReportPreviewJob`, `ReportGenerateJob`,
  `ServiceFactory::reportJobHandlers()`); they work with either engine. The hserv `ReportJobBase`,
  `ReportPreviewJob`, `ReportGenerateJob` are removed; their engine code is
  `SmartyReportRenderer::renderIds`.
- Data: `RecordDataService::loadRecords` (all details, resolved values) in batches of 100 records of
  the report; visibility through `PresentationRecordRepository::accessCondition`; relationships and
  pointers read `recLinks` directly. Deviation from the plan: no new `RecordLinkService` /
  `TranslationService` / `FileUrls` in `srv/Records` — the engine has small helpers of its own
  (`ReportDefinitions`, `ReportEnvironment::fileUrl`); they can move when other srv code needs them.
- Installation values (URLs, folders, JavaScript allowed, fonts, TinyMCE formats, registered id,
  user, record links, constants) come from `ReportEnvironment`, filled by `ServiceFactory` from the
  legacy System; the engine never imports hserv.
- Template bodies of the editor run as Smarty `string:` resources (no temporary file).
- Smarty: `composer install` brought vendor to the locked versions (Smarty 5.4.1 → 5.8.4,
  HTMLPurifier, PHPMailer, ...); the legacy engine passes its tests with them.

Differences from the legacy engine (fixed in srv):
- only records the user may view are returned and used (legacy loaded any record);
- `|translate` translates terms and file captions (legacy always returned the original);
- txt/csv/xml/json keep the content of `<body>` (legacy regex with an invalid modifier did nothing);
- `getRecord($id)` after `getRecord($id, false)` returns the full record;
- `{wrap}` adds "px" to numeric width/height;
- a TypeError in a template gives an error message (legacy caught only `\Exception`, so e.g.
  `getRecordsAggr(0, …)` killed the PHP process).
Found on the way (legacy, not changed): in CLI scripts `HEURIST_DIR` is not the Heurist folder, so
the legacy `getLangCode3()` fails on language-prefixed text (affects cron); the srv engine reads the
language list from its own folder.

Tests (heurist repo):
- `tests/ReportEngineCompareTest.php --db=osmak_mapping`: record arrays of 143 sample records, all 10
  templates of the database (20 records each) and a template using the whole `$heurist` API — all
  the same; the srv engine is 2-5 times faster.
- `tests/JobRunnerTest.php --engine=srv [--write]` 40/44 checks, `tests/ReportsApiTest.php --write
  --engine=srv` 66 checks; the same tests pass with the legacy engine.

### No engine switch (2026-10-05, agreed with Artem)

The Reports setting `engine` is removed: only the new client calls `/api/{db}/reports` and
`/api/{db}/jobs`, so the new API (and cron schedules) always uses the srv engine. The legacy client keeps
the hserv engine through its own URLs. `ServiceFactory::reportRenderer($legacy)` returns the srv renderer;
the legacy renderer only converts templates on import/export. The tests keep `--engine=legacy` for
comparison (`JobRunnerTest`, `ReportsApiTest`, `ReportEngineCompareTest`).
- Removed (2026-10-05): the job interrupt callback of the legacy engine (`ReportExecute::setInterrupt`,
  `ReportRecord::startInterruptCallback`) and the job context in `SmartyReportRenderer::renderIds`: jobs always
  use the srv engine. The legacy files differ from git only by the `setForceCompile` fix of the editor test.

### Report settings for the client (2026-10-05, agreed with Artem)

The new apps had no server settings (the legacy client gets them in sysinfo, e.g. `custom_js_allowed`).
`GET /reports` now gives logged-in users `settings: {javaScriptAllowed, testRecordLimit}`
(`ReportService::listReports`; `javaScriptAllowed` from `isJavaScriptAllowed()`, read only for this list).
- Client: `ReportsApplication.testLimit(report, settings)` uses `testRecordLimit` (card reports 1);
  `scriptsAllowed()`; the Test tip shows the limit.
- Output frame sandbox (`ReportViewer.setScriptsAllowed`): always `allow-same-origin` (requests carry
  the login: test result, files of private records), `allow-popups` (links open new tabs) and
  `allow-popups-to-escape-sandbox` (those tabs are normal pages); `allow-scripts` only when the
  database is authorised. With scripts and same origin together, a script in the frame has the rights
  of the Heurist page — acceptable only for databases the server admin authorised.
- When JavaScript is not allowed the toolbar shows "CSS and Javascript are disabled by default. Request
  authorisation from server admin if required" (text hidden on narrow screens, kept as tooltip).
- No client check of `generateMaxRecords`: the server refuses and its message is shown.
