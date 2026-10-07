# Export — development plan

Status: **agreed with Artem 2026-10-06 (two review rounds of the draft; see §Agreed decisions).
Phases 2-5 implemented 2026-10-06 (heurist and heurist-explorer); nothing committed, not yet checked in a
browser by Artem. Tests: heurist `tests/ExportWriterTest.php` (81 checks), `JobRunnerTest` (40) and
`ReportsApiTest` (28) unchanged; client `npm test` (1050).** §Implementation notes at the end list where
the implementation differs from this plan.

## Context

Record export is still legacy code: `hserv/controller/record_output.php` →
`hserv/records/export/ExportRecords{JSON,GEOJSON,GEPHI,XML,IIIF,RDF,HTML}.php`,
`RecordsExportCSV.php` (2100 lines, including aggregations and joined tables),
`export/xml/flathml.php` (HML) and `export/xml/kml.php`. It loads records one at a time
(`recordSearchByID`), expands links with `depth`/`linkmode` instead of rules, and sends the
file in the HTTP response.

The goal is a new export with three parts:
- a port to `srv/Records/Export` that runs as a background job (`srv/Jobs`, as in Reports);
- one Explorer tool that works on the current DataSource: scope, columns, expansion rules,
  value formats;
- a downloadable file at the end, with Stop and restore after a page reload.

## Agreed decisions (2026-10-06)

Answers to the questions:
- **API:** jobs only. The job type is `export`. The `/jobs` endpoints and the `export` params
  schema go into `heurist/documentation/api/heurist-openapi.yaml`. There is no streaming HTTP
  endpoint now.
- **File access:** private.
  - The file is kept in `filestore/<db>/scratch/jobs/<jobId>/`.
  - Only the job owner can download it, through `GET /jobs/{id}/result` (streamed).
  - It is deleted together with the job after 7 days.
- **Graph "Export Gephi":** Graph builds GEXF in the browser from the visible graph; the
  button becomes "Export GEXF". It uses the same attribute layout as the server writer.
- **HML:** only the importable core of flathml is ported (see §Server, step 4).

Review of the first draft by Artem:
- Enum outputs use the **report names**: `term`, `code`, `conceptid`, `desc`, `internalid`
  (`HFieldTree` `enumOutputs`, Smarty subfields).
- **JSON and GeoJSON reuse the existing srv writers.** JSON is the `/records` API envelope;
  GeoJSON goes through `GeoJsonStreamWriter` and the `MapFeatureService` feature generator
  (see §Server).
- **`H-ID` is a CSV header only.** The other formats keep `rec_ID`.
- **Scope is a select**, not a radio group.

## Why there is no HTTP streaming export endpoint

1. **Server load.**
   - A streamed export holds one PHP worker and one database connection for minutes.
   - Nothing limits how many run at once. A few scripts, crawlers or impatient users clicking
     again can use up the Apache/FPM workers, and then the whole server stops answering.
   - Jobs have limits: 1 export per user and `maxJobs` per database.
2. **Time limits cut the file.**
   - `max_execution_time` and proxy timeouts (nginx often 60 s, Cloudflare 100 s) end the
     response. The user then gets a truncated file without noticing.
   - A job runs detached, under its own limit.
3. **Errors after the start cannot be reported.**
   - Once "200 OK" and the first bytes are sent, an error in the middle cannot change the
     status. The client receives a file that looks valid but is incomplete.
   - `GeoJsonStreamWriter` stages its output in a temporary file for this reason.
   - A job renames its temporary file only on success, and its status says `failed` with a
     message.
4. **No Stop, no progress.**
   - The only way to stop a stream is to close the connection. PHP often notices late (output
     buffers), and the SQL keeps running.
   - Jobs have Stop with `KILL QUERY`, progress, and restore after a page reload.
5. **Data exposure.** The visibility rules are the same in both cases (the user sees the same
   records). The risk is in how the data leaves the server:
   - one URL returns the whole data set;
   - a GET URL with the query ends up in server and proxy logs, browser history, Referer
     headers and shared links;
   - an anonymous caller can download every public record in one request (bulk scraping);
   - a page on another site can make a logged-in browser start a heavy export by loading the
     URL. It cannot read the answer, but it creates the load.
   - With jobs, only logged-in users can start an export, only the owner can download the
     file, and the file is deleted after 7 days.
6. **Some formats need a whole file first.** A zip of several CSVs is built with `ZipArchive`
   on disk. In GEXF, all nodes must be written before the edges. The full id list and the
   expansion are computed before the first record is written. A "stream" would buffer most of
   it anyway.
7. **Scripts already have an API.** `/records` is paged (`limit`/`offset`, `total: false`) and
   `/map` gives GeoJSON pages. A REST client can page through results without one huge request.
8. **One code path.** Writers run only inside jobs, so there is one way to secure, limit and
   test them.
9. **A download can be repeated.** If a download breaks, the user downloads the finished file
   again; the export does not run again.

## Answers to the open points of the proposal

| # | Point | Proposal |
|---|---|---|
| 1 | Streaming vs pagination | Records are loaded in batches of 100 with `RecordDataService::loadRecords` and appended to a temporary file. The writers are streaming classes (header / record / footer), as `GeoJsonStreamWriter` already is. |
| 2 | Where the client lives | `apps/explorer/src/tools/export/`, loaded with a dynamic `import()` from `openTool('export')`. This lets it reuse Explorer's `HFieldSetEditor` (column picker) and `HRuleBuilder` (rules) without moving them to shared. No new app. The rail button `export` and `toolTitle` already exist. |
| 3 | Scope | Current result, Selection, or By record types. "By record types" is a checklist with counts from `POST /records {q, detail:'rectypes'}`, which already exists (`RecordSearchService:300`). |
| 3a | Columns, by format | csv/tsv: **required**, per record type. geojson/kml: optional properties (default: H-ID, title, record type). json/xml(hml)/gephi: no column choice; all fields are exported. |
| 3a | Column fields and rules of the DataSource | Two checkboxes: "Use column fields of the data source" (`presentation.data.fields`, including `ext`) and "Use expansion rules of the data source" (`request.rules`). Either can be edited for this export only. The DataSource does not change. |
| 3a | rec_ID column | CSV only: `rec_ID` is always the first column, with the header `H-ID`. JSON, GeoJSON, KML, HML and GEXF keep `rec_ID` / their own id attribute. |
| 3b | Mixed record types in CSV | One CSV per record type, packed in a zip. One record type gives a plain `.csv`. No aggregations (they go to Crosstabs). |
| 3c | Value formats | Defaults per field type, which a column's `ext` can override. See the table below. |
| 4 | Expansion without duplicates | Before writing anything, the job builds the complete ordered id list with `ExpansionEngine`: main result first, then each level's new ids. Every record is therefore written exactly once. Pointers to records that are not in the export are written as ids only. |
| 4a | Existing Gephi | Graph's button is a vis-network JSON dump, not GEXF. It is replaced by a client GEXF export (agreed above). The server writes gephi for the whole result plus rules. |
| 5 | JSON record structure | Removed. JSON is the `/records` API envelope `{records, meta}` with `resolveDetails`. Terms already carry `trm_ConceptCode`, and `meta.fields.details` already carries `dty_ConceptCode`. New: `meta.recordTypes {id: {name, conceptCode}}`. There is no pagination block. |
| 6 | IIIF, RDF | Not in this plan; to be discussed separately. The legacy exports stay. |
| 7 | HuNI | Not ported. The legacy flathml HuNI mode stays. |

### Value formats (defaults; one choice per field type in "Value formats")

| Field type | Choices (default first) | Notes |
|---|---|---|
| date | `as is` (temporal JSON or simple date) / `start date` / `start–end` | GeoJSON/KML: the `when`/TimeSpan comes from the start and end values. |
| geo | `WKT` | GeoJSON: geometry (`GeoJsonGeometryConverter`). KML: KML geometry. JSON: WKT plus a `geo` type. |
| file | `URL` / `obfuscated id` / `details` (id, name, mime, url) | CSV with `details` adds sub-columns, as the legacy export did. |
| pointer / relmarker | `id` / `id + title` | A title adds a "<field> title" column. |
| enum / relationtype | `term` / `code` / `conceptid` / `desc` / `internalid` | Same names as the report field tree and the Smarty subfields. A column's `ext` from the QSE column picker is read with these names; its stored `id` is read as `internalid`, so old Query Sources keep working. `desc` is read from the definitions snapshot, because `formatValue` has no term description. |
| CSV only | separator `,` `;` tab (tsv) or custom, quote `"` or none, multi-value separator `\|`, header row on/off, line break | |
| All formats | record limit | The default and the maximum come from the database setting `exportMaxRecords` (default 100,000). |

## Server — heurist repo, `srv/Records/Export/` (namespace `Heurist\Records\Export`)

1. **`ExportRequest`**: normalizes and validates the job params:
   - `format`: `csv` | `tsv` | `json` | `geojson` | `kml` | `xml` | `gephi`;
   - `scope`: `{query, ids?, rectypes?}`;
   - `rules?`, `columns {rtyId: [field paths with ext]}`, `values {date, geo, file, pointer, enum}`,
     `csv {sep, quote, mvsep, header, eol}`, `limit`, `fileName?`.
2. **`ExportPlanner`**: resolves the ids.
   - It runs `RecordSearchService` on the query, filtered by `ids` or `rectypes`, reading pages
     of 100,000 as `ReportJobPlanner` does.
   - Then it runs `ExpansionEngine::expand(new ExpansionRequest(seedIds, rules))`.
   - It returns the ordered unique id list and, for gephi, the edges.
   - It refuses an export over the limit.
3. **Record loading is shared, not new.**
   - Move the body of `RecordQueryController::recordsResponse()` (`loadRecords` +
     `attachLinkedValues` per traversal + `loadFieldMetadata`) into a service
     `srv/Records/Data/RecordPageAssembler::assemble(ids, selection, options)`.
   - The controller calls it, so the `/records` output does not change.
   - Export calls it per batch of 100 ids, with columns parsed by the existing
     `RecordFieldSelector`. These are the same field paths as Data module columns, linked
     (`via`) columns included.
4. **Writers**: `ExportWriterInterface` (`begin(meta)`, `write(records)`, `end()`, `files()`).
   - `JsonExportWriter`: a thin streaming wrapper around the `/records` envelope:
     `{"records":[`, then the batch records from `RecordPageAssembler`, then
     `],"meta":{database, entity, fields, recordTypes}}`.
   - GeoJSON: **`GeoJsonStreamWriter` unchanged**, given the job's file handle as output.
     - The feature generator in `MapFeatureService::createStream()` is split into
       `featuresForIds(ids, selection, mode, simplify, extraProperties)`. `createStream()` keeps
       its search and calls it, so the Map output does not change.
     - Export passes the planner's ids.
     - `extraProperties` adds the chosen columns, flattened by `ValueFormatter`, to the
       properties.
     - Mode `records` (one feature per record) is the default.
     - Export wraps the generator so that `JobContext::check()` runs every batch.
   - `CsvExportWriter`: one temporary file per record type, zipped by `ZipArchive` when there
     is more than one. Header and row logic is ported from `RecordsExportCSV`; aggregations
     and joined tables are dropped.
   - `KmlExportWriter`: port of `export/xml/kml.php`.
   - `HmlExportWriter`: flat HML core from `flathml.php`:
     - included: header, records, details, temporals, files, relationships;
     - left out: stubs, xinclude, fc, rectype_templates, HuNI;
     - the output must be accepted by the legacy HML import.
   - `GexfExportWriter`: port of the `ExportRecordsGEPHI` attribute layout. Nodes are the
     records; edges are the expansion edges plus pointers and relationships among exported
     records.
5. **`ValueFormatter`**: turns the resolved values (`formatValue` output with
   `resolveDetails`) into flat cells for CSV, KML and GeoJSON properties.
   - Enum outputs use the report names; `desc` comes from `DefinitionSnapshotService`.
   - The file URL is built as in `ReportEnvironment::fileUrl`.
   - JSON and HML write the resolved values as they are.
6. **`ExportJob implements JobHandlerInterface`**:
   - type `export`;
   - `replacesPrevious()` = false (one export per user);
   - the limit is the setting `exportTimeLimit` (default 600 s);
   - it calls `context->check()` and `progress(done, total)` for each batch;
   - it writes `job-tmp-*` files and renames them on success;
   - the result is `{file, size, records, format, rectypes}`.
   - Register it in `ServiceFactory` next to `reportJobHandlers()` and wire it in
     `hserv/controller/api.php`.
7. **`JobController` result for files**:
   - when the result has a file, `GET /jobs/{id}/result` streams it with
     `Content-Disposition: attachment`;
   - owner check;
   - `JobStore` cleanup also removes the job's folder.
8. **Settings and docs**:
   - `exportMaxRecords` and `exportTimeLimit` (with a `SystemSettings` file, as Reports has);
   - `srv/Records/Export/_README.md`;
   - OpenAPI: `/jobs`, `/jobs/{id}`, `/jobs/{id}/cancel`, `/jobs/{id}/result`, and the
     `ExportJobParams` schema.

## Client — this repo

1. **`apps/explorer/src/tools/export/ExportTool.js`** (+ css):
   - loaded lazily from `ExplorerApplication.openTool('export')`, following
     `_createReportsTool` / `mountDirectReports`;
   - the Tools header is built with `toolHeader()`;
   - closing it follows the `_closeReportsTool` pattern.
2. **Form sections**, as one scrolling panel:
   - Scope: a select (Current result | Selection | By record types). "By record types" shows a
     record-type checklist with counts. Selection is disabled when nothing is selected.
   - Format: a select; it shows or hides the format-dependent sections.
   - Columns: for each record type in scope, an `HFieldSetEditor` (multi-select, enum outputs),
     pre-filled from the DataSource when "Use column fields" is checked.
   - Expansion rules: "Use rules of the data source" (with a summary), or Edit, which opens
     `HRuleBuilder` on a copy.
   - Value formats, CSV options, limit, file name.
   - Export button.
3. **Job**:
   - `JobClient.start('export', params)` and `HJobMonitor` (progress, Stop, result link =
     `jobClient.resultUrl(id)`);
   - on open, `jobs.list()` restores a running `export` job, as `ReportsApplication.restoreJobs()`
     does;
   - the last settings are kept in localStorage, keyed by DataSource reference.
4. **Data the tool needs**: the tool is part of Explorer, so it reads `this.sync.dataSource`
   (`request.q`, `rules`, `presentation.data.fields`, `meta.count`) and `sync.selection`
   directly. No bridge is needed.
5. **Graph**:
   - `GraphApplication.exportGephi()` writes GEXF 1.2 from `graph.records` / `graph.edges`
     with the server's attribute layout (`apps/graph/src/core/gexfWriter.js` + test);
   - the button is renamed in the localization files.
6. **Enum names in the QSE column fields**: `HFieldSelectionEditor` saves `ext: 'internalid'`
   (not `id`), so stored columns use the report names. The Data table and the export accept
   both `id` and `internalid`.
7. Localization (`eng`/`fre`), and a user-manual page `user-manual/explorerExportEng.htm`.

## Phases

1. This document.
2. Server:
   - refactor `RecordPageAssembler` and `MapFeatureService::featuresForIds` (check that
     `/records` and `/map` output does not change);
   - request, planner, `ValueFormatter`;
   - CSV, JSON and GeoJSON writers;
   - `ExportJob`, the file result, settings, OpenAPI.
3. Client: the Export tool (scope, format, columns, rules, values, CSV options, job monitor,
   restore).
4. Server: KML, HML and GEXF writers. Client: Graph GEXF.
5. Docs: `_README.md`, user manual, plan implementation notes. Update CLAUDE.md "Current work".

## Verification

- Server (from `heurist/`):
  - `php tests/ExportWriterTest.php --db=osmak_mapping`:
    - each format on a fixed id set;
    - CSV zip with several record types, `H-ID` first;
    - rules: no duplicate records;
    - HML output imported into a scratch database (or parsed by the legacy HML import parser);
    - GeoJSON is valid;
    - `/records` and `/map` responses for fixed requests are byte-identical before and after
      the refactor;
    - CSV has `H-ID` only in its header; JSON and GeoJSON keep `rec_ID`;
    - enum `term|code|conceptid|desc|internalid`, and `ext: 'id'` gives the internal id;
    - GEXF parses.
  - `php tests/JobRunnerTest.php` still passes; a new export case checks start, progress,
    cancel and the file result download.
  - The download is refused for another user.
- Client:
  - `npm test`, including new `apps/explorer/test/exportTool.test.js` (params from form state)
    and `apps/graph/test/gexfWriter.test.js`;
  - the architecture test;
  - `npm run build:explorer`: the export chunk is lazy (not in the main chunk).
- Browser (`osmak_mapping`): export the current result as CSV with two record types (zip),
  the selection as GeoJSON, and a result with rules as JSON. Stop a long export, reload the page
  during an export (progress comes back), and download the result.

## Implementation notes

### 2026-10-06 — Phases 2-5

Server (heurist repo):
- `srv/Records/Data/RecordPageAssembler.php`: record assembly moved out of
  `RecordQueryController::recordsResponse()`. `MapFeatureService::featuresForIds()` split out of
  `createStream()` (new options `properties`, `onBatch`). The responses of `/records` and `/map`
  for 8 fixed requests are byte-identical before and after.
- `srv/Records/Export/`: `ExportRequest`, `ExportSettings` (settings file "Export":
  `maxRecords`, `timeLimit`; `'Export' => 'export.json'` added to hserv `SystemSettings`),
  `ExportPlanner`, `ExportDefinitions`, `ValueFormatter`, `ExportColumns`, `ExportService`,
  `ExportJob`, `Writer/` (Csv, Json, Hml, Kml, Gexf); GeoJSON is written by `ExportService` with
  `featuresForIds` + `GeoJsonStreamWriter`. `ServiceFactory::exportJobHandlers()`; `api.php`
  registers the job type with the report jobs. README `srv/Records/Export/_README.md`.
- Jobs: `JobStore::resultDirectory()/resultFilePath()` (folder `<jobId>/`, removed by cleanup),
  `JobContext::resultDirectory()`, `JobRunner::resultFile()`, `JobController` streams the file
  (`Content-Disposition: attachment`). A result with `download: true` is a file.
- OpenAPI: tag Jobs, `/jobs`, `/jobs/{jobId}`, `/jobs/{jobId}/cancel`, `/jobs/{jobId}/result`,
  schemas `Job` and `ExportJobParams`, parameter `JobId`.

Client (this repo):
- `apps/explorer/src/tools/export/` (`ExportTool.js` + css, `exportParams.js`): own lazy chunk
  `heurist-explorer-ExportTool.js`; `ExplorerApplication._createExportTool()` /
  `_closeExportTool()`. Test `apps/explorer/test/exportTool.test.js`.
- `HJobMonitor`: a result with `download` links to `jobClient.resultUrl(id)` (with file size).
- Graph: `apps/graph/src/core/gexfWriter.js`; "Export GEXF (Gephi)" writes the graph as shown.
  Test `apps/graph/test/gexfWriter.test.js`.
- `HFieldSelectionEditor` saves the enum output `internalid`; the Data, Graph and Record view
  formatters accept `id` and `internalid`.
- Manual: section Export in `explorerUserManualEng.htm` (and Fre).

Differences from the plan and decisions taken:
- **Bug fixed in `RecordDataService`**: `trm_ConceptCode` was the originating database id only
  (e.g. `"2"`), `dty_ConceptCode` was `<originating db>-<local id>`. Both now follow
  `DefinitionSnapshotService::conceptCode()` (`2-414`). This also corrects the Concept ID column
  output of Data, Graph and Record view.
- **No user manual file of its own**: the Export section is in the Explorer manual.
- **Columns are per record type in all formats** (the form shows one editor per record type of the
  scope). GEXF has one attribute list: the client merges the lists into `"*"`. Record types reached
  only through expansion rules get the `"*"` columns, else the title (CSV).
- **HML**: details carry `id`, `conceptID`, `name`, `basename`; terms `termID`, `termConceptID`
  (the legacy import reads these); reverse pointers and relationships among the exported records
  are written; relationship records between exported records are added after the records.
  `ImportHeurist::hmlToJson` reads every record (test).
- **HML dates** (Artem, 2026-10-06): written as the detail text in the date format of the export,
  as in the other writers (default: simple dates and temporal JSON objects as stored). The
  outdated `|VER=..|TYP=..` temporal output of flathml (`<raw>`, `<temporal>`, `<year>`...) and its
  constants are not ported.
- **XML writers use XMLWriter** (Artem, 2026-10-06): HML, GEXF and KML write through
  `Writer/XmlStreamWriter` (PHP XMLWriter into the file, flushed after every batch) instead of
  hand-built tags. XMLWriter escapes text and attributes and tracks open elements; the wrapper
  replaces control characters not allowed in XML 1.0 (`[?]`, as flathml) and gives `<name/>` for
  an empty text. Only the KML geometry from geoPHP is inserted as raw XML. The flathml `%` →
  `&#37;` replacement is gone; KML time and description are elements (the description link is
  escaped text instead of CDATA). SimpleXML/DOM were not used: they build the whole document in
  memory.
- **GEXF edges** are the pointers and relationships among the exported records (`recLinks`),
  not the expansion edges; relationship start/end dates are attributes 4/5. The legacy extra
  attributes of relationship fields are not ported.
- **Relationship marker fields** have no values in `/records` and are empty in CSV; relationships
  are exported with `rt`/`rf`/`r` path columns.
- **Download link**: a plain link, so it needs the session cookie (Explorer in Heurist). An Explorer
  that uses only a bearer token cannot download with it yet.
- **Workload**: under mod_php a job also occupies an Apache worker while it runs (detached from
  the user). The difference from streaming is that `maxJobs` and one export per user cap it.
- Found: in the expansion-rule compact notation the path `52:lt917:52` reaches the records that
  52 points to through 917 (the inverse of the field-path notation `52:lf917:52:1` of `/records`).
  Not changed; the client sends canonical rules.

### Review by Artem, 2026-10-06

Export tool:
- **Follows the DataSource**: ExplorerApplication registers the open tool with the SyncEngine
  (`tool:export`: `setDataSource`, `setSelection`, `setRules`); the scope select, record types and
  rules are rebuilt, settings of the new source are restored, a running export stays shown.
- **Scope** is one select: Current result (N), Selection (n), then a "Record type" group with the
  record types of the result and their counts (one type; the checklist was removed).
- **Columns** (CSV, TSV, GeoJSON, KML, Gephi): "Remove all fields" button; rows are reordered by
  drag and drop - the drag code moved from `HFieldSetEditor` into the base `HFieldSelectionEditor`
  (`_dragHandle()`, `_enableDrag()`), which no longer has up/down buttons (only the export used
  them); new options `removeAll`, `onChange`. Compact field lists everywhere (Artem: also in the
  QSE column, geo and time field helpers; `QuerySourceHelpers.css`): rows padding 0, no gap,
  `.h-btn-small` min-height 16px inside `.h-qse-helper`, helper margin 4px; dragged row half
  transparent.
- **Expansion** is a select: No expansion | Any link (kind: any pointer or relationship, any
  pointer, any outgoing pointer, any incoming pointer, any relationship; depth 1-4 - one rule
  `{query: {<kind>: []}}` nested to the depth) | Use the expansion rules of the data source |
  Custom expansion rules (rule builder dialog, for this export only).
- **Value formats** are used only by the formats that write values as text: CSV/TSV cells, GeoJSON
  properties, KML ExtendedData, GEXF attributes (`ValueFormatter`/`ExportColumns`). The section is
  shown only for those formats; JSON and HML ignore it (HML dates are written as stored again).
- **Additional properties**: CSV options (CSV, TSV); "Include human-readable names and local IDs for
  everything" (JSON, HML).
- **Record limit** is a select: All, 1K, 5K, 10K, 100K, 500K. Gephi: 1K, 5K, 10K (default 10K); the
  server caps a Gephi export at 10,000 records in all (`ExportRequest::GEPHI_MAX`; expanded records
  after the result are cut).

Server:
- `names` parameter (json, xml). **JSON without names** (default) identifies record types, fields
  and terms by concept codes only: records `{rec_ID, rec_RecTypeConceptID, rec_Title, rec_URL,
  rec_ScratchPad, rec_NonOwnerVisibility, rec_Added, rec_Modified, details: {"<field concept>":
  [values]}}` - term = its concept code, pointer = record id, file = {nonce, name, mime,
  description, url}; meta `form: "concepts"`, `registeredId`. With names: the `/records` envelope
  as before (`form: "full"`).
- **HML without names** = the flathml default: `conceptID` / `termConceptID` only (term label as
  text); with names: `id`, `name`, `basename`, `termID`, term labels (flathml
  human_readable_names). The legacy import reads both (fields by concept code, test).
- Test: `tests/ExportWriterTest.php` 67 checks; client `exportTool.test.js` and new
  `exportToolRender.test.js` (fake DOM: scope options, DataSource/selection updates, format
  sections, expansion modes, Gephi limits, job parameters).

### Review by Artem, 2026-10-07

Export tool:
- **Direct search**: its DataSource has no `meta.count`, so the result was shown with 0 records. The
  total now comes from the `detail=rectypes` answer (the count of the query); `meta.count` only when
  that is missing.
- **XML (HML) is the default format**; formats are listed XML, JSON, CSV, TSV, GeoJSON, KML, Gephi.
- **Expansion** only for JSON, XML and Gephi (hidden otherwise; the server ignores `rules` for csv,
  tsv, geojson, kml). The "Any" link select has no option group.
- **Columns** only for CSV, TSV, GeoJSON, KML and Gephi:
  - "Use data source settings: [] column fields [] geo fields [] time fields" (each shown when the
    DataSource has such fields; geo fields only for GeoJSON and KML);
  - per record type a radio group Minimal | Metadata | All | Custom; the field selector is shown only
    for Custom; Custom without fields = Minimal. Minimal = `rec_ID`, `rec_RecTypeID`, `rec_Title`;
    Metadata = these and `rec_URL`, `rec_Added`, `rec_Modified`, `rec_AddedByUGrpID`,
    `rec_OwnerUGrpID`, `rec_NonOwnerVisibility`; All = Metadata and every field of the record type
    (no separators, no relationship markers);
  - the marked data source settings are merged with the preset (each field and output once);
  - geo fields of the data source are also sent as `geofields` (GeoJSON, KML: the geometry comes
    from them, linked paths included); time fields as `timefields` (KML: time span of their values).
- **Gephi** has expansion and columns; columns are sent per record type and the GEXF has one
  attribute per distinct column; record types without columns (e.g. reached by expansion) get the
  minimal attributes (name = title, rectype, url). CSV: a record type without columns gets
  H-ID, Record type ID, Title (was the title only).
- **Value formats**: Temporals Raw | Human readable (`Temporal::toReadable`); Files File URL | Full
  info | ID; checkboxes "Title for target pointers" (`pointerTitle`, was a select) and "Terms
  hierarchy" (`termHierarchy`: "Parent.Child" without the vocabulary, as the legacy
  `getTermLabel(..., true)`). The default term output select was removed (term columns keep their
  own output; default Term). The old date formats start/range were removed (`asis` is read as
  `raw`).
- CSV repeated values separator: one character (input size 1).
- Record limit: All, 50, 1K, 5K, 10K, 100K, 500K (Gephi 50 ... 10K); a format change resets it to
  All (Gephi: 10K).
- CSS: `.h-qse-helper` min-width 300px (all field helpers); `.h-export-tool` min-width 380px.

Tests: heurist `tests/ExportWriterTest.php` 77 checks (readable temporal "1990 to 1996", term
hierarchy, minimal CSV columns, GEXF attributes per record type, geo fields, rules ignored for CSV);
client `exportTool.test.js` 12, `exportToolRender.test.js` 7; `npm test` 1042.

### Review by Artem, 2026-10-07 (second round)

- **No progress, "Loading..." when reopened** while an export ran: the job's PHP process kept the
  session lock, so every other request of the browser (polling, the tool's own requests) waited until
  the job ended. Legacy `SessionStore::get()` reopens the session and does not close it;
  `JobController::sendAndRun` now closes the session before the job runs (once the response is sent,
  the session cannot be started again). This also affected long report generations.
- The tool shows a running export at once: `jobs.list()` runs in parallel with the definitions and
  counts; the form is filled when they arrive.
- **Toolbar on top**: Export (the bottom button was removed) and **Export results** - a dropdown of the
  user's finished exports, laid out as the generated files of the reports manager: name (download),
  date, size, download icon, delete (new `DELETE /jobs/{id}`, `JobClient.remove`). The popover moved
  from `apps/reports/src/ui/popover.js` to `shared/src/widgets/popover/` (frame class `.h-popover`); the
  reports file is a wrapper that adds `.h-reports-popover`.
- **While an export runs** the toolbar, the problems and the form (intro and sections) are hidden;
  only the job monitor is shown. Afterwards the form is shown again, the monitor keeps the download
  link.
- **Columns**: the field selector was shown for every preset - `HFieldSelectionEditor` replaces the
  class of its container, so the `[hidden]` rule of the record type body no longer applied. The editor
  now has its own element; the selector is shown only for Custom. "Use data source settings" is
  hidden when none of its checkboxes is shown (e.g. only geo fields and CSV).
- "Title for target pointers" and "Terms hierarchy" are checked by default.

### Review by Artem, 2026-10-07 (third round)

- The job monitor is hidden until an export starts (or an error is shown).
- "Title for target pointers" and "Terms hierarchy" are checked whenever the tool opens; they are no
  longer restored from the settings remembered in the browser (old saved settings kept them off).
- Export button also at the bottom of the form (hidden with the form while an export runs).
- **Export results was slow**: every `GET /jobs` sent all jobs of the user with their stored parameters
  (report test jobs keep the template text). New `GET /jobs?type=export&brief=1` (`JobRunner::listJobs`
  type and brief); the tool loads this list once when it opens (also to find a running export) and
  shows it at once in the dropdown, refreshed in the background.
- Delete in Export results closes the list at once (no second click) and asks with the Heurist
  dialog (`HMsg`), not the browser's confirm.
- **Removed** the server limits text in Output and its endpoint `GET /jobs/types/{type}`
  (`JobRunner::typeInfo`, `ExportJob::info`, `JobClient.typeInfo`): one value did not justify an
  endpoint. `DELETE /jobs/{id}` stays (delete of results).

### Review by Artem, 2026-10-07 (fourth round)

- **Expansion rules dialog** (`HRuleBuilder`, also used by the Export tool's custom rules): Apply removes
  duplicate rules - the same source, link and target can be added several times. `dedupeRules()`:
  same query (object keys in any order) and same steps, compared at every level; names are ignored;
  the first is kept. Test in `hRuleBuilder.test.js`.
- **Column fields** (`HFieldSetEditor`): the Aggregation select is not shown (a stored value stays in
  the field); the title and width inputs are lower (22px).
- **Tools header** (Reports, Export): the close icon is `fa-xmark`, as in the other panels (was
  `fa-times-circle`).

### 2026-10-07 (fifth round)

- `maxRecords` default raised to **500,000** (Export settings; up to 5,000,000). The time limit stays
  600 s - see the memory/time notes discussed earlier (expansion, HML/GEXF links, heartbeat).
- Fixed: `QuerySourcePresentationService::validateOptions` refused the column output `internalid`,
  which the QSE column editor saves since 2026-10-06; it now accepts `term, code, conceptid, desc,
  internalid` and the older `id`.
- One definitions loader and consistent term names: agreed and done the same day (see below).

### One definitions loader, consistent term names (2026-10-07, agreed with Artem)

- **`srv/Definitions/DefinitionLookup.php`** (moved from `Records/Export/ExportDefinitions.php`): the one
  srv loader of record types, fields, structure names, terms and user/group names, and the one
  concept-code rule `conceptCodeFor()` (other database's origin and id, else registered id - 0 when not
  registered - and local id). Used by `DefinitionSnapshotService`, `Reports/Smarty/ReportDefinitions`
  (its own term loader was removed), record export and `RecordDataService`.
- **Term names everywhere**: `internalid, term, code, conceptid, desc` - the names of the report field
  tree and the Smarty term subfields (existing templates use them). `DefinitionLookup::term()` gives them
  (plus parent, inverse, domain); the **snapshot** (format 3; cached `def-snapshot.json` files are rebuilt)
  has `{term, code?, conceptid, desc?, domain?, inverse?}`; **`HDbDefs.term()`** returns
  `{internalid, term, code, conceptid, desc}` and `termTree()` nodes the same (+ children). `HDbDefs`
  still reads `label`/`concept` of older snapshots (browser cache, test fixtures).
- Updated users: filter builder (term select, operators list), inline helper (term and relation-type
  suggestions), `vocabularyItems` (value pickers), `HFilterForm` term options (HInput options keep their own
  `{id, label, depth}` shape and are mapped explicitly), export writers, `ReportDefinitions`/`TemplateApi`.
- Unchanged on purpose: `/records` values (`trm_ID, trm_Label, trm_Code, trm_ConceptCode` - public API) and
  the query-language aliases (`label`, `concept`); the Smarty record arrays keep their legacy meaning
  (`term` = label with hierarchy, `label` = translated label).
- Concept codes now follow one rule; it differs from the legacy `ConceptCode` only in edge cases (origin
  0-0 gave "0-0", an unregistered database "0000-<id>"). `ReportEngineCompareTest`: all 10 templates the
  same.
- Tests: heurist `DefinitionSnapshotTest` 41 (term names), `ExportWriterTest` 86, `ReportsApiTest` 28,
  `JobRunnerTest` 40, `ReportEngineCompareTest` same 10; client `hDbDefs.test.js` checks that `term()` has
  exactly the five names and reads older snapshots; `npm test` 1051.
- **The deployed bundles must be redeployed** (`npm run deploy:all`): bundles built before this change read
  `label`/`concept` from the snapshot.

### Metadata (header) fields in column fields and export (2026-10-07, bug reported by Artem)

- **Bug**: header leaves of the field tree (ID, Title, Added, ...) have a name, not a field id
  (`{dty: 'title'}`), and `fieldPathCode()` dropped them: Title of the record gave `10` (the record type
  id, shown and exported as field 10 "Start date"); ID of linked records gave `10:lt241:12` (shown as the
  last link, refused by the server).
- `fieldPathCode()` maps the header leaves to the `/records` header codes (`ids`→`rec_ID`, `title`→
  `rec_Title`, `added`→`rec_Added`, `modified`→`rec_Modified`, `addedby`→`rec_AddedByUGrpID`,
  `url`→`rec_URL`, `owner`→`rec_OwnerUGrpID`, `access`→`rec_NonOwnerVisibility`, `notes`→
  `rec_ScratchPad`): the record itself `rec_Title`, linked records `10:lt241:12:rec_ID`.
  `fieldCodeLabel()`/`fieldPathLabel()` name them ("Place of death > Record ID").
- **Server**: a linked path may end with a header field (`RecordFieldSelector`: entry `header`, fieldId 0);
  `RecordDataService::attachLinkedHeaders()` reads the Records columns of the linked records and attaches
  `{value, path}` entries as for linked field values; field metadata `dty_Type: header`. Export captions
  name them ("<link> > Record ID").
- Columns saved with the wrong codes before this fix (e.g. `10` for Title) stay wrong: re-add them.
- Tests: `querySourceFieldPath.test.js` (codes and labels), `ExportWriterTest` (CSV with linked
  `rec_ID`/`rec_Title`).

### Export folder (2026-10-07, Artem)

- **Kept 24 hours** (was 7 days): `ExportJob::keepSeconds()` = 86400; `JobRunner` removes finished jobs of a
  type with `keepSeconds()` after that time (`JobStore::cleanupType`), on start and on every list.
- **100 MB per user**: `ExportJob::maxResultBytes()`; `JobRunner::start` refuses a new export with "Clear your
  export folder first" while the user's export result files (`JobStore::resultBytes`) take more.
- **Export results** dropdown: a checkbox before each name, no delete icon; bottom panel "Remove marked" and
  "Remove all" (the list closes at once, Heurist confirmation, then `DELETE /jobs/{id}` per file). New icon
  **Open in a new tab**: `GET /jobs/{id}/result?inline=1` (Content-Disposition inline; JSON and XML as such,
  CSV/TSV/GeoJSON/KML/GEXF as plain text; not offered for a zip).
- The same list layout is meant for the generated files of the reports manager later (not changed yet).
- CSV pointer columns: "<field> H-ID" and "<field> Record Title" (legacy names); a linked record id column
  "<link> > H-ID".
- (later the same day) `HJobMonitor` shows **Open in a new tab** (`?inline=1`, not for a zip) next to the
  download link of a finished export. The **reports manager's generated files** got the same list: checkbox
  before the name (the name still shows the file in the frame), date, size, open in a new window, download;
  no delete icon; bottom panel Remove marked / Remove all (Heurist confirmation, the list closes at once).

