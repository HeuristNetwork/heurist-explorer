# Query trace, termination and expansion guards — development plan

Status: **agreed with Artem 2026-10-01; Phases 1–4 and Phase 5 items 1 (as a candidate pre-filter) and 3 committed (`a0f44b6`); FULLTEXT "contains" committed (server `8df18a96d`). Trace panel hidden since 2026-10-03. Open items: §Open items at the end.** Server tests: `tests/QueryTraceTest.php` (19 checks); client: `shared/test/requestMonitor.test.js`. §Implementation notes at the end lists measurements and where the implementation differs from this plan.


## Context

On a slow notebook, expansion actions (linked/related/connected) take several seconds, even though `recLinks` has only 122 rows. Hanging queries also cannot be stopped.

Exploration found the reasons:

- **The SQL grows with each expansion level.** `expansionLevelQuery()` (`shared/src/data/expansionRules.js:164`) nests the whole parent query inside each level. On the server, `QueryBuilder` compiles each traversal into a correlated `EXISTS` (`srv/Records/Query/Compiler/QueryBuilder.php:256-387`). `connected` becomes 4 such `EXISTS` joined with `OR`. Each linked record also gets its own access-check subqueries. The result is that the full `Records` table is scanned with dependent subqueries roughly 4^depth times.
- **The query runs twice.** The ids query and the count query both run in full (`RecordSearchService.php:284-285`).
- **There are no measurements.** No timing, `debug` or `EXPLAIN` exists anywhere in `srv/`.
- **Nothing stops a query.** There is no statement timeout and no KILL anywhere. Aborting `fetch()` in the browser leaves the MySQL query running.
- **The client has no common place to stop or trace requests.** Every app builds its own `HeuristApiClient` (`shared/src/api/HeuristApiClient.js`). Each module aborts only the requests it has superseded; there is no global stop and no trace hook.

**Goal:** measure first, then make termination reliable, then add guards against runaway expansion, then fix the SQL shape using the measurements.

Agreed with Artem (2026-10-01):
- **Stop button:** in the rail, and the QSE "Filter" button turns into "Stop" while its query runs. Graph also gets its own stop.
- **Termination:** a server statement time limit, plus a cancel endpoint that runs `KILL QUERY`.
- **Trace scope:** `/records`, `/graph`, `/map` and `/time`, from Explorer and from all modules.
- **Performance:** trace first, then fix in this same plan.

On approval, this text is saved as `docs/development/10 Query-Trace-and-Termination-Plan.md`, with a `Status:` line in the same style as plan 09. Decisions and deviations are recorded there with dates.

---

## Phase 1 — Server `debug` section (heurist repo, `srv/`)

1. **`srv/Runtime/QueryTrace.php` (new).** A request-scoped collector with:
   - `enabled`, `startPhase(name)` / `endPhase()`
   - `record(sql, params, ms, rows, phase)`
   - `toArray()`
2. **`srv/Database/AbstractDatabase.php:77-97`.** If a trace is attached, time each `prepare`/`execute` with `hrtime(true)` and record it. All SQL passes through here, including `RecordDataService` and term lookups.
3. **`srv/Runtime/ServiceFactory.php`.** Create the trace and pass it to the database and the controllers.
4. **`RecordSearchService::search()`.** Wrap each step in a named phase: `resolve-f` (311-371), `ids` (284), `count` (285) and `fallback` (288). Record which path ran (`sql` or `fallback`) and the main `CompiledQuery`.
5. **`RecordQueryController::recordsResponse()` (271-275).** If `debug=1`, add `debug` next to `pagination`. Also cover the `count`, `rectypes` and `ids` early returns (187-199). Do the same in `GraphController`, `MapDataController` and `TimeDataController`.
6. **`hserv/controller/api.php:772-777`.** Add `debug` to the POST whitelist. Remove `debug` from `pagination.next`.

The `debug` section looks like this:
```json
"debug": {
  "requestId": "…", "path": "sql",              // or "fallback"
  "mainMs": 812.4,        // ids query only (the "main" query)
  "countMs": 790.1, "detailsMs": 35.2,
  "sqlMs": 1650.3, "statements": 14,             // all SQL in this request
  "totalMs": 1702.0,      // from $_SERVER['REQUEST_TIME_FLOAT'], so it includes bootstrap
  "peakMemoryMb": 12.5,
  "query": { … },         // the normalized query as the server understood it
  "mainSql": "SELECT DISTINCT r.rec_ID …", "mainParams": [ … ],
  "shape": { "exists": 9, "linkDepth": 2 },      // counted from the compiled SQL
  "phases": [ {"name":"ids","ms":812.4,"rows":40}, … ],
  "statementLimitSec": 30,
  "explain": [ … ]        // only when debug=2: EXPLAIN of mainSql with the same params
}
```
The main SQL is returned **only to logged-in users** (or the DB owner, to be decided in the plan doc). Everything else is safe to return to anyone.

## Phase 2 — Client tracing and the trace panel

1. **`shared/src/api/HeuristApiClient.js`.** Add an optional `requestMonitor` option and use it in `request()` (101-160) for data endpoints (`/records`, `/graph`, `/map`, `/time`). It:
   - creates a request id (`rid`) and sends it as the `X-Heurist-Request-Id` header;
   - adds `debug=1` while tracing is on;
   - registers the request's `AbortController` in a per-client in-flight set, combining it with the caller's signal (`AbortSignal.any`, with a fallback);
   - calls `onStart(entry)` / `onEnd(entry)`. An entry has `{rid, module, endpoint, method, query summary, startedAt, clientMs, httpStatus, status: ok|error|aborted|timeout|cancelled, debug}`.
   - New method `abortAll()` aborts all in-flight requests and returns their ids.
2. **`shared/src/api/RequestMonitor.js` (new).** A small `EventTarget` with an in-flight map and a ring buffer of the last 200 entries.
   - Explorer owns the main monitor.
   - Each module gets a thin monitor that forwards entries to Explorer through a new bridge function `reportRequest(entry)` (`IframeModuleAdapter._createChildHostBridge`, :101-130). Without a host bridge it is local only.
   - `runtime.traceRequests` (bootstrap, `ExplorerApplication.js:247-254`) switches `debug=1` on and off. A bridge call `setTraceRequests(bool)` changes it at runtime.
3. **Wire the monitor into every client construction:** `ExplorerApplication.js:112`, `initHeuristData.js:48`, `initHeuristGraph.js:43`, `initHeuristMap.js:74`, `initHeuristTimeline.js:45`, and the config variants.
4. **`apps/explorer/src/widgets/query-source/QueryTracePanel.js` and `.css` (new).**
   - It is an `HBaseWidget` with a collapsible header ("Query trace", with an enable checkbox, an in-flight count and a **Clear** button) and a log pane (newest first, monospace).
   - Each line shows: time, module, endpoint, `totalMs`/`mainMs`/client ms, row count and status. Clicking a line expands it to show the main SQL, phases, `shape` and a copy button.
   - It is mounted as a 4th host after `actionsHost` in `QuerySourcePanel.js:56`. It stays outside the editor and actions hosts so it remains visible in Filter Form mode (`_setFilterFormVisible`, :175-188).
   - Collapsed state and the enabled flag are kept in localStorage.
5. **Localization:** add the new strings to the explorer `localization_eng.txt` / `_fre.txt`.

## Phase 3 — Termination

**Server**
1. **`srv/Database/MysqlDatabase.php:40-56`.** After connecting, set a statement time limit: MariaDB `SET SESSION max_statement_time=N`, or MySQL `SET SESSION max_execution_time=N*1000`, detected from the version string.
   - N comes from a Heurist config value, default 30 s. The `/sys` and admin paths are exempt.
   - Map the "interrupted / max_statement_time exceeded" errors (MariaDB 1969, MySQL 3024, 1317) to an API error `query_timeout` (HTTP 503) or `query_cancelled`.
2. **Cancel registry `srv/Runtime/RequestRegistry.php` (new).**
   - When a request has a request id, it stores `{connectionId: SELECT CONNECTION_ID(), userId, db}` in a temp file `heurist_rq_<db>_<rid>`, and deletes it on shutdown.
   - New route `POST /api/<db>/records/cancel {rid}` (`api.php` routes) reads the file, checks the user is the same, and runs `KILL QUERY <id>`.

**Client**

3. **Explorer.**
   - `_withResultCount` (`ExplorerApplication.js:657-675`) gets a signal.
   - New `stopAllQueries()`: it aborts Explorer's own client, calls a new module API method `abortRequests()` through `IframeModuleAdapter` on every module, and then POSTs cancel for each in-flight request id known to the monitor.
   - `abortRequests()` is added to the public APIs of Data, Graph, Map and Timeline; each calls its `client.abortAll()`. Their existing `AbortError` handling already resets loading state; check that `expansionBusy` and the map's `loadState` also reset.
4. **Stop UI.**
   - A Stop item in the rail (`ExplorerControlPanel.js:1488` list, `ExplorerRail.js`) is shown only while the monitor's in-flight count is above 0, after a 300 ms delay so short queries don't make it flicker.
   - The QSE `h-qse-run` button (`QuerySourceEditor.js:107`) and the Filter Form "Filter" button (`HFilterForm.js:166`) turn into "Stop" while their own query runs.
   - Graph shows a small stop next to its expansion controls while `expansionBusy` is set.
5. **QSE veil.** Extend the existing `is-loading` veil (`QuerySourcePanel.css:12-34`, `setLoading` :146) to the whole panel root, with `pointer-events:auto` so it blocks clicks. The Stop button sits above it (z-index). The panel calls `setLoading` around `onExecute` in editor mode too (:64-65), not only in Filter Form mode.

## Phase 4 — Guards

1. **Map dynamic (viewport) loading** (`MapApplication.refreshDynamicLayer`, :2876-2959).
   - After each load, check the result: `resultMeta.isPartial` (it hit `maxFeatures`) and the time taken (`debug.totalMs`, or client ms when there is no debug).
   - If the result is partial, or slower than `dynamicLoadingSlowMs` (map config, default 5000), show a warning bar in the map and **pause** dynamic loading. The warning reads: "Too many features / slow query — zoom in or refine the query".
   - While paused, `scheduleDynamicLayerRefresh` doesn't send requests. Loading resumes when the user zooms in to a smaller extent than the one that triggered the pause, when the query changes, or when they click "Resume".
2. **Expansion** (Graph `runExpansion`/`setExpansionDepth`, :723-900; Data `ExpansionLevelView`):
   - **Seed limit:** refuse to expand from more than `maxExpansionSeeds` records (default 500), with a message.
   - **Growth limit:** if a step returns more than `maxExpansionResults` (default 2000), or grows more than `maxGrowthFactor` times (default 20), stop the remaining levels in `setExpansionDepth` and tell the user. The user can continue explicitly.
   - **Time budget:** if a step took longer than 5 s, ask before running the next level.
   - **Hub records:** report records with very many links in the trace (`debug.hubs`). Excluding them from expansion is a later option, not part of this plan.
   - The limits live in the Graph and Data configuration defaults.

## Phase 5 — Performance fix (decided after Phase 1 measurements)

Measure first with `debug=2` (EXPLAIN) on `osmak_mapping` for levels 1–3 of `lt`, `related` and `connected`. The expected fixes:

1. **Resolve inner levels first** (in `QueryBuilder` / `RecordSearchService`). For a traversal whose child query is itself a traversal, or is not trivial:
   - run the child query first to get an id list, capped at `MAX_PRECOMPUTED_CANDIDATES`;
   - compile the outer level as a semi-join that the optimizer can drive from `recLinks`: `r.rec_ID IN (SELECT rl_SourceID FROM recLinks WHERE rl_TargetID IN (…) AND …)`.

   This follows the pattern already in `ExpansionEngine::readEdgePass` (197-238).
2. **`connected` / `links`:** use one `IN (SELECT … UNION SELECT …)` instead of 4 `EXISTS` joined with `OR`.
3. **Skip the count query** when `offset=0` and fewer ids than `limit` came back, because the count is then just the number of ids.
4. **Access conditions:** only add them for linked aliases when the user is not the owner or admin, and check whether they can be applied once to the final result instead of to every alias.
5. **Indexes:** confirm that `recLinks` has indexes on `rl_SourceID`, `rl_TargetID` and `(rl_RelationID)`; add a migration if one is missing.

After each change, compare the debug numbers against the Phase 1 measurements, and record them in the plan doc.

---

## Critical files

- **Server:** `srv/Database/AbstractDatabase.php`, `MysqlDatabase.php`, `srv/Runtime/ServiceFactory.php` and the new `QueryTrace.php` / `RequestRegistry.php`, `srv/Controller/RecordQueryController.php`, `GraphController.php`, `MapDataController.php`, `TimeDataController.php`, `srv/Records/Query/RecordSearchService.php`, `Compiler/QueryBuilder.php`, `hserv/controller/api.php`.
- **Client:** `shared/src/api/HeuristApiClient.js` and the new `RequestMonitor.js`, `shared/src/host/*` (bridge `reportRequest`, `setTraceRequests`, `abortRequests`), `apps/explorer/src/modules/IframeModuleAdapter.js`, `ExplorerApplication.js`, `widgets/query-source/QuerySourcePanel.js`/`.css`, `QuerySourceEditor.js`, the new `QueryTracePanel.js`/`.css`, `ui/ExplorerControlPanel.js`, `ExplorerRail.js`, `shared/src/widgets/filter/HFilterForm.js`, `apps/map/src/MapApplication.js`, `apps/graph/src/GraphApplication.js`, `apps/data/src/core/ExpansionLevelView.js`, and each app's `init*.js` and public API.
- **Bridge contract order** (per CLAUDE.md): `shared/src/host` → app host adapter and public API → the legacy wrapper in `heurist/hclient`, done separately.

## Verification

- **Server:** new PHP tests in `heurist/tests/`:
  - `QueryTraceTest.php`: `debug=1` returns the section with `mainMs <= sqlMs <= totalMs`.
  - `StatementLimitTest.php`: `SELECT SLEEP(5)` with a 1 s limit gives `query_timeout`.
  - `CancelTest.php`: two processes; the cancel kills a `SLEEP`.

  Manual check: `curl "http://127.0.0.1/api/osmak_mapping/records?q=ids:151&debug=2"`.
- **Client:**
  - `npm test`, including `test/architecture` (no shared→apps imports).
  - New node tests for `RequestMonitor` and for `HeuristApiClient` `abortAll` and debug-flag injection.
- **Browser** (`npm run dev:explorer`):
  - Enable the trace and run a QSE filter: entries from Explorer (count), Data, Map and Graph appear with server times.
  - Run a level-3 `connected` expansion: Stop appears in the rail; clicking it ends the requests and the trace shows `cancelled`. A server process list check (`SHOW PROCESSLIST`) shows no leftover query.
  - The QSE veil blocks input while the query runs.
  - Map: zoom out over a dense area to get a partial or slow warning and a pause; zooming in resumes loading.
  - Graph: an expansion that goes over the seed or growth limits shows the message and stops.
- **Before and after:** Phase 5 timings for the same expansion queries, recorded in the plan doc.

---

**2026-10-03 — trace panel hidden.** Agreed with Artem: the query trace panel is hidden
until a better place is found (`TRACE_PANEL_SHOWN = false` in `ExplorerApplication`; the
panel code stays). While hidden, the RequestMonitor runs with tracing off, so requests carry
no `debug` flag. Stop and the guards are unchanged. See plan 06 Part C.

## Implementation notes (2026-10-01)

### Measurements (osmak_mapping, anonymous user, local XAMPP)

`Records` has **204 970 rows**, `recLinks` 122. EXPLAIN showed the cause: MySQL scans all
`Records` by primary key (`ORDER BY rec_ID`) and runs the correlated `EXISTS` subqueries for
every row. The cost is the outer scan, not the link tables.

| Query (from `ids:151`) | before: ids + count | after: whole request |
|---|---|---|
| `connected` level 1 | 1817 + 1845 ms (total 3.8 s) | 142 ms |
| `connected` level 2 | 1626 + 1634 ms (total 3.4 s) | 128 ms |
| `connected` level 3 | 3059 + 2865 ms (total 6.0 s) | 190 ms (SQL 70 ms) |
| `related` level 2 | 790 + 780 ms (total 1.8 s) | 115 ms |
| `lt` level 3 | 3 ms | unchanged |

Every request pays about 70–110 ms for the legacy bootstrap (`bootMs`), before srv/ code runs.

### Where the implementation differs from the plan

- **Phase 5 item 1 is a candidate pre-filter, not "resolve inner levels first".**
  `RecordSearchService::linkCandidates()` reads a superset of the records that can match the
  traversal predicates from `recLinks` alone (child `ids` sets are followed; unknown children mean
  "any linked record"; `not` groups and `exists:NULL` are skipped; capped at
  `MAX_PRECOMPUTED_CANDIDATES`). It is added as an extra `ids` condition, so the compiled
  `EXISTS` predicates are unchanged and the results are identical; they now run for a few hundred
  rows instead of 205 000. An empty candidate set returns an empty result without the main query.
  Items 2 (`UNION` instead of `OR`), 4 (access conditions) and 5 (indexes) were not needed:
  `recLinks` already has indexes on source, target and relation.
- **Phase 5 item 3:** the count query is skipped when the page is shorter than `limit`.
- **QueryTrace and StatementLimit are in `Heurist\Database`**, not `Runtime`, so the database
  layer does not depend on Runtime. `ApiResponse::send()` adds `debug` to every srv/ JSON
  response (also errors); the GeoJSON stream writer appends it for `/map`. `debug` is also read
  from the URL for POST requests. Extra fields: `bootMs`, `mainRows`, `mainKind`, `notes`,
  `sql` (first 50 statements, logged-in users only).
- **Statement limit:** `HEURIST_QUERY_TIME_LIMIT` (default 30 s); command-line scripts and tests
  are not limited (`FieldValueCounterTest` runs queries over 30 s). The local server is MySQL
  (`max_execution_time`, error 3024), not MariaDB. All srv/ endpoints are limited, `/sys` too.
- **PHP session lock:** `SessionStore::get()` leaves the session open, so every request held the
  session lock until it ended — parallel module requests were serialized, and a cancel request
  would have waited for the query it should stop. `ServiceFactory::fromLegacySystem()` now calls
  `session_write_close()` (srv/ never writes the session).
- **Cancel:** `X-Heurist-Request-Id` header → temp file `heurist_rq_<md5 db>_<rid>.json` with the
  connection id; `POST /records/cancel {rid: id | [ids]}` runs `KILL QUERY` for the same user.
  Verified: a 3 s query stopped after 1 s with `503 query_cancelled`.
- **Client stop without module API changes:** each module's `RequestMonitor` registers with
  Explorer through the bridge function `registerRequestMonitor`; Explorer's monitor receives the
  entries and its `abortAll()` reaches every module's clients. No `abortRequests()` was added to
  the public APIs. `HeuristApiClient` also cancels the server SQL whenever a caller aborts a
  traced request (superseded Data pages, map viewports, Graph expansions).
- **Stop UI:** Stop button in the left rail (after 300 ms). Instead of turning the QSE / Filter
  Form "Filter" button into Stop, a Stop button sits on the panel's loading veil, which covers
  both modes without changing the shared `HFilterForm`. Graph has a Stop button in the levels
  navigator (`api.stopExpansion()`, expansions only).
- **Map pause:** no Resume button; loading resumes when the query changes or the extent shrinks
  below 80 % of the paused one. Map configuration `dynamicLoadingSlowMs` (default 5000).
- **Expansion guards are Graph only.** The Data level pane sends one server query per level (no
  growing seed sets), so it relies on the pre-filter, the time limit and Stop. Graph limits:
  `limits.maxExpansionSeeds` 500 (hard), `maxExpansionResults` 2000, `maxExpansionGrowth` 20,
  `slowExpansionMs` 5000; the soft limits keep the loaded level and stop deeper ones, and the
  next Expand click continues anyway. Hub records (`debug.hubs`) were not done.
- Legacy hosts in `heurist/hclient` need no change: the new bridge functions are optional.


## Text "contains" uses the FULLTEXT index (agreed with Artem 2026-10-03)

`LIKE '%Orange%'` cannot use an index. On a 200K-record database a title-field search took 14 s
locally / 4.8 s on production, run twice (ids + count). `Records.rec_Title` and
`recDetails.dtl_Value` already have FULLTEXT indexes, so:

- **Contains** on these two columns compiles to
  `MATCH(col) AGAINST('+word1* +word2*' IN BOOLEAN MODE)`: every word, as a word or the start
  of a word. This is a behaviour change: `Orange` finds "Orange", "Oranges", but no longer
  "Blood-range"-style substrings in the middle of a word. Applies to `title`, freetext/blocktext
  fields (`f:N`, also with a language prefix), any-field search (`f`) and the value-picker text
  filter (`detail=values&text=`, `FieldValueCounter::appendText`).
- When the text is more than one indexable word, a `LIKE '%text%'` on the narrowed rows keeps
  the phrase and the short words / stopwords that the index skips (length < 3, legacy stopword list).
- Falls back to LIKE when the text has no indexable word (e.g. `an`) or the index is missing
  (`admin/utilities/purgeFullTextIndexes.php` drops it on inactive databases; checked once per
  request in `information_schema.STATISTICS`). Unlike legacy, the search does not create it.
- **Does not contain** (`-text`) uses `NOT (MATCH …)` with the same meaning, so contains and
  not-contains still split the records. It cannot use the index and stays slow.
- **Starts with** (`text%`) and any value with `%` / `_` stay LIKE (`'Orange%'` uses the normal index).
- **Ends with** is hidden in the Filter Builder operator list and the inline helper
  (`"hidden": true` in `queryVocabulary.json`); queries that already use `%text` still load,
  show "ends with" and run as LIKE.
- Code: `FieldPredicateCompiler::containsCondition()` / `wordPrefixMatch()`,
  `QueryBuilder::wordPrefixMatch()`.
- Measured on `osmak_mapping` (203K records), title contains "Santa": LIKE 126 ms, MATCH 6 ms
  once warm (the first MATCH after a restart loads the FULLTEXT cache, about 0.7–2 s).

## Open items (2026-10-03)

- Trace panel: hidden; find a better place (e.g. a developer option) and show it again.
- Hub records (`debug.hubs`) in the trace and excluding them from expansion — not done.
- Server tests planned but not written: `StatementLimitTest.php`, `CancelTest.php`; no test
  for the FULLTEXT "contains" compilation.
- "Does not contain" (`NOT MATCH`) cannot use the index and stays slow.
- The browser checks listed under Verification were not recorded as done.
