# 27l Modules on one page: page sync, Filter widget, Stop

**Status (2026-11-16):** agreed (§1, open points §7 answered). **Phases A (§8), B (§9) and C (§10) implemented**, not
committed. Review round 1 (§11): fixes (§11.1) and items 4-7 (§11.2-11.6) done 2026-11-16, not committed; checked in a
headless browser on test page 209739 (not the designer forms). Review round 2 (§12, agreed 2026-11-16): *Records and
selection* replaces `sync` (sources of the records + selection links); phases E1 (§12.6) and E2 (§12.7) done 2026-11-16,
not committed.
Phase D later. Phase 5 of plan 27 (§6 *PageController*, §9), item 21 a-c of the review list.

## Context

A v4 page can hold several record modules (Data, Map, Timeline, Graph, Explorer), but they are independent
(`apps/website/src/siteRuntime.js`: "synchronization (PageController) comes in phase 5"). Today the only link between
them is the Saved filter of the page URL (plan 27j): `pageFilterState` / `applyPageFilter` give the same DataSource to
every record module at start or on a same-page link. There is no selection sync, no filter widget on a page and no
Stop. Legacy CMS used `search_realm` (search domain) for this: response to search start / stop / results and to
selection.

Wanted (21 a-c):
- a) modules of a page work together, simply; later perhaps parent-child links (selection in one module = search in
  another), requirements not known yet.
- b) HFilter as a separate element of the page: central control of filter runs.
- c) a Stop button in HFilter, as in the main Explorer.

## 1. Decisions (2026-11-16)

1. **One page = one domain** ("a virtual Explorer"). Every record module follows the page; a module setting lets it
   opt out (§2.4).
2. **HFilter does not change the page URL** when it runs a filter. Only the Saved filter action / link does, as now
   (27j).

## 2. Page sync: reuse Explorer's SyncEngine

What the page needs, Explorer already has:
- `apps/explorer/src/core/SyncEngine.js`: modules by id, `setDataSource`, `setSelection` (echo guard, origin
  skipped), `setActiveMapDocument`. No Explorer internals in it.
- `apps/explorer/src/modules/IframeModuleAdapter.js`: the knowledge per module type — how Data / Graph / Map /
  Timeline take a DataSource, how they take a selection (Map `selectRecords`), which events mean "selection
  changed" (`heurist-<type>-selection-changed`, echo and `_applyingSelection` guards). `siteRuntime.applyFilterToModule`
  is already a second copy of the DataSource part.

### 2.1 Shared code
1. `SyncEngine` moves to `shared/src/sync/SyncEngine.js`; Explorer imports it from there, no change of behaviour.
2. The per-type part of `IframeModuleAdapter` (setDataSource / setSelection / setActiveMapDocument / selection
   event binding) goes to `shared/src/sync/ModuleHandle.js`: it wraps one module **public API** (direct or iframe
   API object) and is an EventTarget with `selectionchange` / `mapdocumentchange`. `IframeModuleAdapter` uses it
   (mount, bridge and state stay in Explorer). `siteRuntime.applyFilterToModule` is replaced by
   `handle.setDataSource`.

### 2.2 PageSync (the PageController of plan 27 §6)
`apps/website/src/PageSync.js`, thin: one `SyncEngine` per page.
- `register(instanceId, type, api, sync)` after `mountInstance`; `unregister` in `unmountInstance` (sections of the
  navigation modes swap / scroll, parts replaced by the designer).
- Keeps the current page DataSource, so **late modules** (in tabs, sections loaded by the navigator) start with it
  (the start state of `filterInstanceState`, as today).
- Not in the designer preview (`runtime.design`).

### 2.3 Where a page DataSource comes from
- the Filter widget (§3);
- the Saved filter of the URL / a same-page link (27j): `pageFilterState` / `applyPageFilter` go through PageSync;
- later: a module that gives its own source to the page.

### 2.4 Instance setting `sync`
Stored in the instance settings of every record module, edited in the designer properties, validated in
`srv/Website/CmsValidator.php` and the format fixture `shared/test/fixtures/cms-v4`:

| Value | Results of the page | Selection |
|---|---|---|
| `all` (default) | yes | yes |
| `selection` | no, keeps its own stored source (e.g. a fixed *Team* list) | yes |
| `none` | no | no |

SyncEngine gets a per-module choice for DataSource vs selection (small option, useful in Explorer later too).

### 2.5 Explorer on a page
Explorer is **one** member (plan 27 §6): it takes page results through its existing `applyPageRequest`; its own
modules stay in its own SyncEngine. Selection between Explorer and the page modules is not in this plan (Explorer has
no public selection event yet) — open point §7.

### 2.6 Legacy
No global window events as in `search_realm`. The conversion (phase 8) maps the realm of the modules to `sync: all`,
modules of other realms to `none` (one domain per page).

### 2.7 Later: bindings between modules (not built now)
A *binding* = "when module A changes its selection, module B gets a DataSource made from it" (parent-child Data
modules, Map → Data). Stored later in the instance settings, e.g. `sync: {from: '<instanceId>', query: 'ids' | <query
template with the selected ids>}`; PageSync listens to A's `selectionchange` and calls `setDataSource` on B only.
Nothing in §2.1-2.4 blocks this: modules are kept by instance id, and handles have both events and setters.

## 3. HFilter as a page widget `filter`

- New widget `filter` (`kind: widget`), mounted in `mountInstance` beside `menu` / `actionmenu`, on the existing
  `shared/src/widgets/filter/HFilter.js` + `HFilterForm`.
- Settings = the item format of the Explorer publication filter (`apps/explorer/src/core/publishedView.js`
  `{items, active, mode}`; items = public query sources and group-4 saved filters by id), edited in the designer
  with the same picker as `apps/explorer/src/ui/config/explorerPublication.js` (moved to shared if needed: an app does
  not import another app).
- Reading an item: query source `GET /records/querysource/{id}` (as `pageFilterRequest`), saved filter through `/sys`
  (as Explorer `_resolvePublishedItem`) — one shared resolver in `shared/src/site/` for both. No new endpoint.
- `onRun(dataSource)` → `PageSync.setDataSource` (modules with `sync: all`). `active` = item run at start when the
  URL has no Saved filter.
- A Saved filter of the URL whose source is an item of the widget: the widget marks that item and shows its form with
  the given values; missing values are asked in that form (as Explorer does) instead of being left out.
- No URL change on run (§1.2).
- Server: `CmsValidator` accepts `filter`; `PageRenderer` writes only the host (client widget, like `menu`). Designer:
  *Filter* in the widget group of the element picker. Localization texts.

## 4. Stop in HFilter (and the same in Explorer)

- A page `RequestMonitor` (`shared/src/api/RequestMonitor.js`) in PageSync. The website gives a small host `bridge`
  to direct mounts (`mount({container, bootstrap, bridge, assetBaseUrl})`, as `DirectModuleAdapter` does) with
  `registerRequestMonitor` → `monitor.attachChild`. Modules already make their monitor through
  `createModuleRequestMonitor(config.host?.bridge, …)`: no change in the modules.
- HFilter gets the option `requestMonitor`: while `inFlightCount > 0` (after the short delay `RUNNING_QUERY_DELAY` of
  `ExplorerApplication._bindRunningQueries`) it shows **Stop** (beside Run of the form / above the list); a click calls
  `monitor.abortAll()` (fetches aborted + `POST /records/cancel`, existing).
- The published Explorer gives its own `requestMonitor` to its HFilter (`_createPublishedFilter`): the same Stop as
  the rail of the main Explorer.

## 5. Phases

| Phase | Content |
|---|---|
| A | Shared sync: `SyncEngine` + `ModuleHandle` in `shared/src/sync/`, Explorer on them (`apps/explorer/test/syncEngine.test.js` green, architecture test) |
| B | PageSync in the site runtime, instance setting `sync`, 27j filter through PageSync, selection sync, bridge + page RequestMonitor |
| C | Widget `filter` (runtime, designer picker, validator, fixture) + Stop in HFilter (page and published Explorer) |
| D | Later: bindings between modules (§2.7), Explorer selection on the page (§2.5) |

## 6. Files

- `apps/explorer/src/core/SyncEngine.js`, `apps/explorer/src/modules/IframeModuleAdapter.js` (split)
- `apps/website/src/siteRuntime.js` (`mountInstance`, `unmountInstance`, `pageFilterState`, `applyPageFilter`),
  `apps/website/src/siteNavigator.js` (register / unregister of sections), new `apps/website/src/PageSync.js`
- `shared/src/widgets/filter/HFilter.js` (Stop, `requestMonitor`, item from the URL)
- `shared/src/api/RequestMonitor.js`, `shared/src/site/cmsSavedFilter.js` (reused)
- `apps/explorer/src/core/ExplorerApplication.js` (`_createPublishedFilter`, `_resolvePublishedItem`)
- designer properties `apps/website/src/designer/`; heurist `srv/Website/CmsValidator.php`; fixture `shared/test/fixtures/cms-v4`

Verification: `npm test` (sync engine, module handle per type, PageSync `all` / `selection` / `none`, late module,
unregister, Stop shown and `abortAll` called), `npm run build:all`, heurist `php tests/CmsFormatTest.php`,
`php tests/WebsiteEditTest.php`. Browser (osmak_mapping, site 207627): Filter widget + Data + Map + a `selection`-only
Data; run a filter → Data and Map change, the fixed Data does not; select on the Map → both Data lists select; a slow
query → Stop appears and stops it; a Saved filter link with a missing value → the Filter form asks for it.

## 7. Open points (answered 2026-11-16)

1. Selection between an Explorer on the page and the other page modules (§2.5): **phase D**.
2. A saved filter of the Filter widget (not only a query source) is usable by the Saved filter action too: **yes**
   (phase C; the action then refers to a saved filter as well as a query source).
3. The active map document is synchronized between Map and Timeline of a page (as in Explorer) for `sync: all`:
   **yes** (phase B).

## 8. Phase A — implemented 2026-11-16 (not committed, no browser check)

- `apps/explorer/src/core/DataSource.js` → `shared/src/data/DataSource.js`, `apps/explorer/src/core/SyncEngine.js` →
  `shared/src/sync/SyncEngine.js` (git mv; Explorer imports `#shared/...`); tests moved to
  `shared/test/dataSource.test.js` and `shared/test/syncEngine.test.js` (the test has its own small module class:
  shared tests do not import Explorer).
- `shared/src/sync/selection.js`: `normalizeIds`, `sameSelection` (Explorer's `ExplorerModule` re-exports
  `normalizeIds`).
- SyncEngine: module property `syncMode` (`all` default | `selection` | `none`; `SYNC_MODES`, `syncModeOf`):
  `selection` takes only the selection (no DataSource, rules or map document; its own DataSource / document events
  are ignored), `none` takes nothing and its events are not sent on. Explorer modules have none: unchanged.
- `shared/src/sync/ModuleHandle.js`: the per-type part of `IframeModuleAdapter` (setDataSource with the loading
  state and AbortError, setRules, setSelection with the echo guard, setActiveMapDocument, `bind()` of the public
  selection / document events → `selectionchange` / `mapdocumentchange`). Option `showDynamic` of `setDataSource`
  (Map / Timeline show the document of the current result first; used by the page). A DataSource without a reference
  uses its `request.q` as it is.
- `IframeModuleAdapter` (and so `DirectModuleAdapter`) keeps mount, bridge and state; `api` is a getter / setter of
  `this.handle.api`; the setters and `_bindChildEvents` delegate to the handle.
- `siteRuntime.applyFilterToModule`: Explorer `applyPageRequest`, the other modules `ModuleHandle.setDataSource(…,
  {showDynamic: true})`. Difference: an old Timeline API without `setDynamicDataSources` gets `setQuery(q, {title})`
  as in Explorer (no `reload`); the current Timeline API has `setDynamicDataSources`.
- Tests: `shared/test/moduleHandle.test.js` (new), sync modes in `syncEngine.test.js`; `npm test` 1,816 pass;
  builds of explorer and website pass.

## 9. Phase B — implemented 2026-11-16 (both repos, not committed, no browser check)

- `apps/website/src/PageSync.js`: one SyncEngine + one page `RequestMonitor` per page. Members by instance id:
  record modules through `ModuleHandle` (Map / Timeline show the document of the current result with a page result),
  Explorer as one member (`applyPageRequest` with the whole request: values, missing values). `register` /
  `unregister`, `setRequest` (the page result is kept: `request`, `dataSource`), `bridge()` (only
  `registerRequestMonitor`: the modules guard every other bridge method, so they behave as without a host),
  `stopAll()`. A module mounted later gets the current selection; a module that fails is logged, the others go on.
  `instanceSyncMode(instance)`: `all` by default; Explorer `selection` = `none` (phase D).
- **One PageSync per configuration block** (`pageSyncOf(config)` in `siteRuntime.js`, a WeakMap): the first page and
  every page section loaded by the navigator (swap / scroll) is its own domain. None in the designer preview.
- `mountInstance`: direct mounts get the page bridge (not Explorer: own monitor and Stop) and join the PageSync;
  `unmountInstance` unregisters (sections dropped by the navigator, parts replaced by the designer). A module in an
  iframe stays independent.
- Start state (`pageFilterState`): only modules with `sync: all` take the Saved filter of the URL; without one in the
  URL, the result the page has now (a module mounted later); the first request is kept by the PageSync.
- `applyPageFilter` (same-page link, navigator) = `PageSync.setRequest` (modules mounted earlier join first);
  `applyFilterToModule` removed.
- Selection and map document go between the members by the engine (selection: `all` and `selection`; map document:
  `all`, §7.3).
- Instance key `sync` (beside `mount`; `all` not stored): `cmsInstanceProblem` / `CmsValidator::instanceProblem`
  (`SYNC_MODES`, issue `sync`), fixture `hosts.json`, `PageRenderer::instances` writes it, `WebsiteEditService`
  keeps it when a module page is published again, `CmsRecordDocument.setInstance({sync})`.
- Designer: *Page sync* select above the configuration of a module (`CmsDesigner._syncRow`, applied at once; Explorer:
  all / none), CSS `.h-cms-config-sync`, localization eng / fre.
- Tests: `apps/website/test/pageSync.test.js` (new), `savedFilter.test.js`, `cmsDocument.test.js`, `cmsEdit.test.js`;
  `npm test` 1,822 pass, `build:all` passes; heurist `CmsFormatTest.php` 18 pass, `WebsiteEditTest.php` 82 pass.

## 10. Phase C — implemented 2026-11-16 (both repos, not committed, no browser check)

**Moved to shared** (needed outside Explorer to read saved filters):
- `apps/explorer/src/legacy/*` → `shared/src/data/legacy/` (LegacySavedFilterConverter and helpers),
  `apps/explorer/src/utils/parseTextQuery.js` + `queryPredicates.js` → `shared/src/data/query/` (git mv, importers updated;
  `parseTextQuery.test.js` → `shared/test/`).
- `shared/src/data/savedFilters.js`: `parseSavedFilterDefinition`, `executableRequest`, `isEmptySearchRequest`,
  `hasExpansionRules`, `savedFilterRecord` (record of `/sys/filter/{id}`), `savedFilterDataSource(filter, {legacyConverter})`;
  Explorer's `SavedFilterManager.resolveDataSource` uses it.

**Filter widget (§3)**:
- Type `filter` (`kind: widget`) in `CMS_TYPES` / `CmsValidator::TYPES`, element `filter` in `CMS_ELEMENTS` (`cmsEdit`
  creates a `<div>` host), catalog entry *Filter* (Widgets, before Main menu), tree icon `fa-filter`. The server writes
  nothing for it (client widget).
- `shared/src/site/cmsFilterWidget.js`: settings `{items: [{kind: source|filter, id, title}], active, mode}`
  (`cmsFilterWidgetSettings`, `storedCmsFilterWidget`, key `source:12` / `filter:34`), `CMS_WEBSITE_FILTERS_GROUP` = 4,
  `resolveCmsFilterItem` (query source: its DataSource with the parameters; saved filter: `/sys/filter/{id}`, legacy
  kinds converted).
- `apps/website/src/siteFilter.js` (lazy chunk): `mountPageFilter` — HFilter with its own API client (its requests report
  to the page monitor), the definitions read once per page (`pageDefinitions`, also for the legacy converter); a run =
  `PageSync.setRequest(…, {origin})`; at start the Saved filter of the URL (item marked, missing values in its Filter
  Form), else `active` when the page has no result; a same-page link marks the item (`PageSync` event
  `requestchange`). The designer shows the list only (no run) or a hint without filters.
- Designer form `openFilterWidgetForm` (widgetForms.js): Available filters (saved filters of "Website filters" =
  `CmsDesigner._websiteSavedFilters()` by `/sys` owner 4, public query sources), Active on start, Presentation.
- Deviation from §3: Explorer keeps its own managers to resolve items (they also list and cache); the shared part is the
  saved filter reading (`savedFilters.js`, legacy converter), not one resolver for both. Item titles are the titles
  stored by the designer (not translated per language yet).

**Stop (§4)**: HFilter option `requestMonitor` → button *Stop* (hidden, shown after `STOP_DELAY` = 300 ms while
`inFlightCount > 0`, `abortAll()`); new `mark(key)` and `showSource(source, values, {key})`. The page widget passes the
page monitor; the published Explorer passes `this.requestMonitor`.

**Saved filter action with saved filters (§7.2)**: stored `{filter: <id>, page, values}` in place of `source`; URL
`?filter=<id>&v.NAME=`; Record field link `filter:<page>:f<id>`. JS `cmsFilterTarget` / `cmsFilterKeys`, query / href /
parse / problem / settings take either kind, `cmsFilterDataSourceRequest` (the request from any DataSource with
parameters; `cmsFilterRequest` uses it); PHP `SavedFilterLink::target`, `query` / `href` take a target or settings
(`PageContent::filterLink`, `fieldLink`, `PageRenderer` action menu items), StoredText accepts `filter:\d+:f?\d+`.
Site runtime: `pageFilterRequest` reads `/sys/filter/{id}` for `?filter=` (conversion in the lazy chunk,
`savedFilterRequest`). Designer: the Saved filter popup lists query sources and saved filters (`[source]` / `[filter]`,
value `source:<id>` / `filter:<id>`), `savedFilterDefinition` gives a saved filter in the shape of a query source; action
menu checks, record actions, Record field link. `CmsRecordReferences` checks query sources only (a saved filter is not a
record). Error text now "a Saved filter needs a query source or a saved filter" (fixture + PHP test).

Tests: `shared/test/cmsFilterWidget.test.js`, `apps/website/test/siteFilter.test.js` (new), HFilter Stop / mark,
`cmsSavedFilter.test.js` + fixture `saved-filter-links.json` (saved filter cases), `savedFilter.test.js` (`?filter=`,
link `f`), heurist `SavedFilterLinkTest.php` 38 pass; `npm test` 1,831 pass, `build:all` passes; `CmsFormatTest` 18,
`WebsiteEditTest` 82, `StoredTextTest` 117 pass.

## 11. Review round 1 (Artem, 2026-11-16)

### 11.1 Done (not committed, no browser check)

1. *Add element*: **Filter** is in the group *Modules* (after Record view), not in *Widgets*.
2. **Map showed "No layers"** for a page result: `setDynamicDataSources` of Map works only inside Explorer (it answers
   `false` for any other host). `ModuleHandle.setDataSource` now gives the query to the Filtered Result layer
   (`setQuery`) when the answer is `false`. Explorer is not changed (it gets the answer of `setDynamicDataSources`).
3. **Page sync and Apply**: the select was applied at once, so Apply then said "No changes". Now *Page sync* is read and
   applied with Apply, with the settings of the module (one undo step).
4a. **HFilter veil**: while requests run (after 300 ms) a loading veil with a spinner covers the whole widget and Stop
   is above it, the same look as the query panel of Explorer (`is-loading`, `h-btn-danger`, `fa-circle-stop`).
   The published Explorer gets the same (it uses HFilter).
- Also fixed: `hasPageFilter` / `splitFilterUrl` knew only `?source=`; a `?filter=` link to the same page loaded the page
  again instead of giving the records to the modules.

**4b. Is it the same HFilter as in Explorer?** Yes for the published Explorer: one shared
`shared/src/widgets/filter/HFilter.js` (list, Filter Form, Stop, `mark`, `showSource`) for the page widget and the
filter pane of a published Explorer. The authoring Explorer does not use HFilter: it has the saved filter tree and the
query panel (QuerySourcePanel, its own veil and Stop, and Stop in the rail). What is not the same: how an item is read
(Explorer's managers / `resolveCmsFilterItem` of the page); both use the shared `savedFilters.js` and the legacy
converter.

### 11.2 Item 4: Filter Form open = list hidden (agreed 2026-11-16)

Artem: as in Explorer, the list of filters is hidden while a Filter Form is open and shown again on Close. HFilter does
this already (checked on the published page and in the design preview, headless browser). **Cause of the bug**: on any
change of the draft the designer preview (`CmsPreview.apply`) keeps a mounted host but wrote its classes again, keeping
only `h-site-*` / `h-slider`; HFilter lost `h-widget h-filter`, so `.h-filter > [hidden]` no longer applied and the hidden
list was shown beside the form. Now every `h-` class of the kept host stays (with the custom classes of the draft). The
proposal of a title row with *All filters* is dropped.

### 11.3 Item 5: section *Page sync and Query source* (agreed 2026-11-16, done)

- A section of the module configuration form in the CMS designer only (mode `website`; not in the configuration of
  Explorer or in Publish). It replaces the *Page sync* row above the form.
- *Page sync*: all | selection only | independent.
- For *Selection only* and *Independent*: where the records of the module come from, one of
  - **Query source**: a select of the saved filters of "Website filters" and the public query sources **without
    parameters** (as in the Filter widget form, `[filter]` / `[source]`),
  - **Query**: text + Filter Builder icon, the same field as Record cards (no parameters).
  Choosing one clears the other. Both empty: the module keeps its stored start (as now).
- Record View + *Independent*: **Record** (HInputResource, one record) in place of the pair. Record View + *Selection
  only*: nothing (it shows the selected record).
- Stored as the instance key `dataSource` beside `sync`: `{source: id}` | `{filter: id}` | `{query: [...]}` |
  `{record: id}` (Record View). Not stored with `sync: all` (removed on Apply). Checked by `cmsInstanceProblem` (JS) and
  `CmsValidator` (PHP) with the fixture `hosts.json`; kept on republish (`WebsiteEditService`).
- Site runtime: `pageFilterState` for `selection` / `none` with a `dataSource`: query source (`/records/querysource/{id}`),
  saved filter (`/sys/filter/{id}` + converter, lazy chunk) or the query as it is → `filterInstanceState` (the same start
  keys as the Saved filter of the URL); Record View `state.recordId`. A source that can not be read: the stored start
  and a warning in the console.
- Website check (`CmsRecordReferences`): the query sources and the record of `dataSource` (not public = warning).
- Answered: yes; with `sync: all` the module gets the page result, also the Saved filter of a link from another page.

### 11.4 Item 6: Query source in Record cards (agreed 2026-11-16: public query sources without parameters only; done)

- *Source* of Record cards: Manual pickup | **Query source** (new) | Query | Record of the page URL; the radio makes them
  exclusive. Only **public query sources without parameters** (no saved filters: the server can not read legacy ones).
- Stored `settings.mode: 'source'` + `settings.querySource: <id>` (`settings.source` is taken by the Saved filter action).
- Server `PageContent::cards`: the query of the query source read on every render (service `querySource` of
  `ServiceFactory::pageContent` = `QuerySourcePresentationService::getQuerySource`, public records only), so the cards
  follow later changes of the query; at most 50 cards. Preview of the designer (`siteWidgets.previewCards`): the query
  from `/records/querysource/{id}`. Website check: kind `cards`.

### 11.5 Item 7: queries in the preview of the designer (agreed 2026-11-16: always on; done)

- The preview (`design=1`) gets a PageSync too: the Filter widget runs its filters, the modules take the results and
  sync their selection, Stop works.
- Nothing goes into the draft: results and selection are runtime state of the mounted modules; Save Page stores only
  what the forms of the designer give (the preview state is never read back).
- Clicks keep selecting the element in the tree (the preview listens in the capture phase and does not stop the click).
- A module mounted again by a change of its settings starts as a late module (the current page result when `sync: all`).
- No switch in the toolbar (always on).

### 11.6 Implementation (2026-11-16, both repos, not committed)

- **Format**: instance key `dataSource` (`cmsInstanceDataSource` / `CMS_SOURCE_MODULES` in `cmsDocument.js` =
  `CmsValidator::instanceDataSource` / `SOURCE_MODULES`; issue `data_source`; fixture `hosts.json`); `setInstance({sync,
  dataSource})` keeps it only with sync selection / none; `PageRenderer::instances` writes it with `sync`;
  `WebsiteEditService` keeps it on republish; website check kind `module` (*Own records of a module*).
- **Designer**: `createPageSyncSection` / `pageSyncForm` / `pageSyncValues` / `pageSyncResult` / `pageSyncIssues`
  (widgetForms.js), an inline HEditForm above the module form, read by Apply (Explorer: page sync only). Lists:
  `CmsDesigner._ownSourceChoices` (saved filters of "Website filters" and public query sources without parameters; the
  lists now read the query: `parameterized`); a stored one not offered any more is kept as `#id`.
- **Site runtime**: `pageFilterState` starts a module with sync selection / none and a `dataSource` with its own records
  (`instanceSourceRequest`: query source, saved filter through the lazy chunk, query as it is; Record View
  `state.recordId`); `readFilterTarget` shared with `pageFilterRequest`.
- **Preview (§11.5)**: `pageSyncOf` also in design mode, one per runtime object of the page (the designer copies the
  configuration block with each draft); the Filter widget reads the definitions there too; `CmsPreview` instance key and
  `applyInstanceSettings` include `sync` / `dataSource` (a change mounts the module again).
- Tests: `apps/website/test/moduleOwnSource.test.js` (new), heurist `SavedFilterLinkTest.php` 40 (references, `instanceDataSource`);
  `npm test` 1,837, `build:all`, `CmsFormatTest` 18, `WebsiteEditTest` 82, `StoredTextTest` 117 pass. Headless browser
  (Edge, page 209739, bundles deployed): the filter list hidden while the form is open (page and design preview), Map
  gets the filter result (94 features), a Data module with `sync: none` + own query source shows its records and does not
  follow the filter, a filter run in the design preview reaches Data and Map. Not checked: the designer forms (login).

## 12. Records and selection (review round 2, Artem 2026-11-16; agreed 2026-11-16)

### 12.0 Context

Round 1 (§11) added `sync: all | selection | none` + `dataSource` (own records) and a section *Page sync and Query
source*. Artem (2026-11-16): the names "Page sync" / "Results of the page and selection" do not explain anything; the
designer has to define two things apart: **where the records of a module come from** (its sources) and **which modules
share the selection**. Explorer (item 2) and Record View (item 3) need their own variants. Nothing of 27l is committed,
so `sync` can be replaced without a migration (the test page 209739 is read with a small fallback, below).

Agreed in the discussion (2026-11-16): names *Records and selection*; a module that takes its records from another
module follows **everything** that module shows (not only its own query).

### 12.1 Model

#### 1.1 Sources of the records of a module ("Records from")

- **Own query** (internal): non-Explorer: one saved filter / public query source without parameters, or a query without
  parameters (Filter Builder) — as now (`dataSource`); Explorer: its own filters (Available filters, Active on start,
  Presentation); Record View: one record.
- **Saved filter links** (external): a Saved filter action / link on this page, or the Saved filter in the URL coming
  from another page (`?source=` / `?filter=`).
- **Filter widget** «name» (external): each Filter widget of the page, listed by its element name.
- **Module** «name» (external): another module of the page that has an own query (not Explorer, not Record View). The
  module follows everything that module shows (its own query at start, later results it takes).

**Mixed sources — the answer to "can a module take records from several sources?": yes, any combination.** There is no
merging of result sets: the module shows the **latest** search of any of its sources. At start: the Saved filter of the
URL (when *Saved filter links* is chosen), else the own query, else the stored start. With *Own query* and an external
source the designer shows the note "The first records come from the own query; a later search from the other sources
replaces them."

Explorer: only *Own filters* and *Saved filter links* (no Filter widget, no module). Record View: no external sources
(below).

#### 1.2 Selection links ("Share selection with other modules")

- Phase E1: on / off per module (default on). Modules with it on share the selection with each other (no direction).
  The map document of Map / Timeline goes with it (as now).
- Phase D (later): a list "All modules / chosen modules".
- Explorer: not shown yet (no page selection of Explorer: Phase D).

#### 1.3 Record View

`Shows: ( ) Own record [record picker] ( ) Selected record`. Selected record = the selection link on, no own record;
own record = the selection link off.

#### 1.4 Future (Phase D): records from the selection of another module ("mixed")

Like the values of a Saved filter action: the designer chooses a query source / query with parameters used only in
record pointer predicates (ids), and a module whose selection gives the record ids for them (`params: {X: {selection:
'<instanceId>'}}`). A new selection in that module runs the query again. Documented, not built now.

### 12.2 Storage (instance keys)

```json
"records": { "from": ["own", "links", "filter:<instanceId>", "module:<instanceId>"] },
"dataSource": { "source": 12 },            // own query, as now: {source}|{filter}|{query}|{record}
"selection": true                          // share selection; Phase D: ["<instanceId>", ...]
```

- Not stored = the default of a new module: `from` = `links` + every Filter widget of the page, `selection: true`
  (what `sync: all` did).
- Record View: `dataSource {record}` + `selection: false`, or `selection: true` without `dataSource`; no `records`.
- Explorer: `records.from` ⊆ `own | links`; *own* = its `settings.filter` items; `selection` not written.
- Replaces `sync`. Reading an old `sync` (test pages only): `all` → default, `selection` → `from: [own]` +
  selection, `none` → `from: [own]`, no selection.
- Checks: JS `cmsInstanceProblem` + PHP `CmsValidator::instanceProblem` (tokens, ids = instances of the page, a module
  source must have an own query), fixture `hosts.json`; `PageRenderer::instances` writes `records` / `selection` /
  `dataSource`; `WebsiteEditService` keeps them on republish; website check (`CmsRecordReferences`) as now.

### 12.3 Designer: section *Records and selection* (item 1: fieldset + legend)

- An HEditForm group with `label` → `<fieldset class="h-edit-form-group"><legend>` like every other section
  (`pageSyncForm` → renamed `recordsForm` in `apps/website/src/designer/widgetForms.js`; the own `<section>/<h4>` and its
  CSS in `designer.css` go).
- Fields: *Records from* (enum, `multiple`, checkboxes; terms built from the page: Own query, Saved filter links, each
  Filter widget, each module with an own query except itself); *Query source* / *Query* (shown with Own query; one
  clears the other, as now); the note of §1.1 (shown with Own query + any other); *Share selection with other modules*
  (boolean). Record View: *Shows* radio + Record picker.
- Element names in the list: the designer's tree label of the node (instance type + caption), e.g. "Filter (n6ph5pq)".
- Explorer (phase E2, item 2): one fieldset with the same legend; *Records from* = Own filters | Saved filter links;
  Explorer's own *Available filters / Active on start / Presentation* shown only with Own filters. Done through the
  bridge: `createExplorerInstancePanel({value, recordsSection})` puts the designer's fields at the top of its Filters
  fieldset (legend *Records and selection*) and gets `showFilters(shown)`; unchecking Own filters stores no filter items
  (no filter pane on the page).

### 12.4 Site runtime

- `PageSync` routes results by **origin**: `setRequest(request, {origin})` with origin `links` | `filter:<id>` |
  `module:<id>`; each member has its `from` list and takes only accepted origins. The latest request per origin is kept
  (with a sequence number), so a module mounted later starts with the newest accepted one.
- A module's own query, and every result a module takes, is sent on as origin `module:<id>` to the modules that take
  from it; a `path` of instance ids stops loops (A from B and B from A).
- `SyncEngine` keeps only selection and map document for the page: members with `selection: false` are `syncMode
  'none'` for selection; results go through PageSync (no change to Explorer's own SyncEngine).
- `pageFilterState` start order: URL Saved filter (if `links`) → own query (`instanceSourceRequest`) → newest accepted
  page request → stored start.
- Filter widget: `onRun` → `setRequest(…, {origin: 'filter:<instanceId>'})`; Saved filter links → origin `links`.
- Design preview: as now (queries run, nothing in the draft).

### 12.5 Phases

- **E1** (after agreement): §12 in the plan; fieldset + legend; storage + checks (JS, PHP, fixture); the section for
  Data, Map, Timeline, Graph and the Record View variant; PageSync origins, module sources with the loop guard,
  selection on/off; tests.
- **E2**: Explorer variant (bridge `createExplorerInstancePanel` options `recordsSection` / `showFilters`, Explorer panel,
  legacy wrapper untouched).
- **Phase D** (later): selection lists per module, records from the selection of another module (§1.4), Explorer
  selection on the page.

### 12.6 Phase E1 — implemented 2026-11-16 (both repos, not committed)

- **Rules** `shared/src/site/cmsRecords.js`: `cmsInstanceRecords` (defaults: Saved filter links + every Filter widget,
  selection shared; an older `sync` read; Record View own record / selected record; Explorer `own | links`, no
  selection), `cmsDefaultRecordsFrom`, `cmsTakesRecords`. Format: `CMS_RECORDS_TOKEN` / `cmsRecordsValid`
  (`cmsDocument.js`) = `CmsValidator::RECORDS_TOKEN` / `recordsValid`, issue `records`, fixture `hosts.json`.
  `setInstance({records, selection, dataSource})` removes `sync`; `PageRenderer::instances` writes `records`,
  `selection`, `dataSource` (and an older `sync`); `WebsiteEditService` keeps them; website check: own records when
  `from` has `own` (or an older `sync`, or Record View).
- **PageSync** (rewritten): searches by origin (`links`, `filter:<id>`, `module:<id>`), the latest one per origin kept
  (`remember`, `latest`), a member gets the searches of its `from`; what a module shows goes on as `module:<id>` (path =
  loop guard); a module registered after a search of its sources was sent gets it then (modules mount side by side);
  the SyncEngine of the page only for the modules that share the selection (selection, map document). `PageSync.request`
  = the latest page search (not what modules send on).
- **Site runtime**: `moduleStart` (URL Saved filter when `links`, own query, the newest kept search, the stored start;
  Record View `state.recordId`); `joinPageSync` passes the search the module started with; Filter widget origin
  `filter:<id>`, it marks its item only for `links`.
- **Designer**: `createRecordsSection` / `recordsForm` / `recordsValues` / `recordsResult` / `recordsIssues`
  (widgetForms.js): one HEditForm group = a fieldset with the legend *Records and selection* (item 1); *Records from*
  (checkboxes: Own query, Saved filter links, each Filter widget, each module with an own query —
  `CmsDesigner._pageRecordSources`), Query source / Query with Own query, the note of §12.1, *Share selection with other
  modules*; Record View *Shows* Own record (picker) / Selected record; Explorer *Records from* Own filters / Saved filter
  links (its filters stay in its own form until E2). The default is not stored. Preview: instance key and
  `applyInstanceSettings` include `records` / `selection`. Old round-1 texts removed from the localization.
- Tests: `apps/website/test/pageSync.test.js` (rewritten: origins, module source, late module, loop, selection),
  `moduleOwnSource.test.js` (records values / result / issues, setInstance), `cmsEdit.test.js`; `npm test` 1,838 pass,
  `build:all`; heurist `CmsFormatTest` 18, `WebsiteEditTest` 82, `SavedFilterLinkTest` 40, `StoredTextTest` 117 pass.
  Headless Edge, page 209739 (config patched): Data with own query (103) + Filter widget starts with its records, then
  shows the filter result; Map *from module Data* shows Data's records (94 features), then follows Data's filter result;
  Record View *Own record* shows record 151; with `?source=103` the default Map takes it, a Data that takes only the
  Filter widget does not. Not checked: the designer form (login).
- Note: the stored page 209739 has a Data module with `sync: selection` + own query `[{"t":"117"},{"f:1163":"Malawi"}]`
  (0 records), set in the designer in round 1; it is read as Own query + selection.

### 12.7 Phase E2 — implemented 2026-11-16 (not committed)

- Explorer instance in the designer: one fieldset *Records and selection*. The designer makes its section inline
  (`createRecordsSection({inline: true, onFromChange})`: no legend of its own, class `is-inline`) and gives it to the
  bridge: `createExplorerInstancePanel({value, recordsSection})` → `ExplorerApplication._explorerInstancePanel` →
  `createExplorerWebsitePanel({recordsSection})`, which puts it after the legend of its filters fieldset and renames the
  legend *Records and selection*. *Records from*: Own filters | Saved filter links.
- The panel gets `showFilters(shown)`: Available filters / Active on start / Presentation shown only with Own filters
  (called at start and on each change of *Records from*); without Own filters `read()` stores no filter items and no
  active filter (no filter pane on the page). An Explorer without the option (older bundle): the section above its form.
- Runtime as in E1: Explorer takes Saved filter links only when `links` is in its `from`.
- Tests: `apps/explorer/test/explorerWebsitePanel.test.js` (new), PageSync case (Explorer without links); `npm test`
  1,840 pass, `build:all`; bundles deployed. Not checked: the designer form (login).

### 12.8 Captions of the Filter widget (Artem 2026-11-16)

The buttons of the Filter widget showed the title stored by the designer (the record title, e.g. "all persons [ q = …
]"), not the name of the query source in the language of the page as the published Explorer does. Now one shared rule
for both: `filterItemCaptions(items, names, language)` in `shared/src/site/cmsFilterWidget.js` (moved from
`ExplorerApplication._createPublishedFilter`, which now calls it): a query source shows its DT_NAME in the language of
the page (`valueInLanguage` over the name and its translations `fre:…`), a saved filter its stored title (no
translations yet). The widget reads the names with `querySourceNames(apiClient, ids, DT_NAME)` (one `/records` request,
rights of the visitor). The designer lists query sources by DT_NAME (the value without a language) instead of the
record title. Fixes the open point "item titles are not translated" of §10. Test `shared/test/cmsFilterWidget.test.js`;
headless check page 209739: "all persons", "Bundes Landes", "Events (params)", "geonames PARAMS".
