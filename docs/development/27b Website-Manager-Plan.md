# Plan 27b — Website manager and publisher (plan 27, phase 2)

**Status 2026-10-28: review round 1 (§11) implemented, not committed, not checked in a browser: items 1–9 (§11.1),
item 10 *Publish this view* (§11.2 proposal, §11.3 decisions and implementation).** Phase 2 itself (2026-10-26) is
committed. Next: plan for phase 3, the CMS designer (§12). As implemented and deviations: §10. General directions and decisions 1–23 are
in `27 CMS-and-Web-Publishing-Plan.md`, the v4 format in `27a Website-Format-v4-Plan.md`; this plan uses them and
does not repeat them. Decisions are in §9.

## 1. Goal

1. A **Website manager** in `apps/website/`, opened in Explorer as a pane tool (like Reports): list of websites and
   standalone pages, create a v4 website, open / edit / check / generate.
2. **Publish** in every module and in Explorer writes a standalone `RT_CMS_PAGE` (v4) instead of a JSON file.
3. `PublicationService.php`, `PublicationController.php` and the `pub_id` URLs are **removed** (both repos).
4. A first **Generate** job: the live renderer writes all pages of a site into files (decision 23).

Not in this phase: the designer (phase 3 — until then *Edit* is the record editor), templates, more widgets,
serving built sites by URL (phase 6), conversion of legacy sites (phase 8).

## 2. What exists today (checked 2026-10-26)

| Item | Fact | Consequence |
|---|---|---|
| Module *Publish* | Data, Map, Timeline, Graph, Record View: `openPublishDialog()` → module configuration dialog in `publish` mode → `publish()` → `HostAdapter.publish(payload)` (shared, `shared/src/host/HostAdapter.js`) → FrontController `PublicationController save` → JSON file; result `{id, url}` shown by `shared/src/ui/PublishedDialog.js`. | **One place** to change: `HostAdapter.publish`. The module dialogs stay as they are. |
| Payload | `{format: 'heurist-publication', version: 1, options, config, state}`; the server turns it into the bootstrap `{runtime, settings: {format: 'heurist-<type>-settings', version, options, config}, state}` (`PublicationService::buildBootstrap`). | The same `settings` / `state` go into the page instance (27a §4). |
| Legacy host | `hclient/framecontent/publishDialog.js` and `HeuristModuleData.js` pass an optional `openPublishDialog` to the bridge (legacy map / search links, not the JSON files). | Not changed. |
| Explorer | Tool type `publish` exists (rail button *Publish*, "coming soon"; `ExplorerUiConfig.TOOL_TYPES`, `ExplorerToolModule` placeholder). Explorer itself has no `publish()`. | The Website manager fills this tool. Explorer publish is new (§6). |
| Explorer configuration | Layout from `settings.layout`, data source / selection from `state` (`ExplorerApplication`); UI configuration (panes, toolbar, query source lists) from **localStorage** (`ExplorerUiConfig.load()`). | A published Explorer needs its UI configuration from the bootstrap (§6). |
| Reports app | `apps/reports`: `direct.js`, `ReportsApplication` + `ReportManager` (toolbar, list popover, viewer), `JobClient` / `HJobMonitor`, `ensureInstalled()` → `POST /reports/setup`. | Same build, entry and setup pattern. |
| HRecordManager | `manager` mode lists some record types with Add / Edit / View; `recordTools` per item only in `relations` mode. | Add a general `recordTools` option (§4). |
| srv Website | `WebsiteRepository` (records with the visitor's rights, menu tree, standalone page = term 2-6254 of 2-928), `WebsiteService::context`, `PageRenderer`, `SiteUrls`, `GET /website/{id}/check`, `POST /website/setup`. | The manager reads through these; the build job uses `PageRenderer`. |
| Website logo | 99-51 requires the logo 2-38 (27a §10). | A new website needs a logo or a changed requirement (§9 Q3). |
| Jobs | `srv/Jobs` with types `report-*`, `export`; result files downloaded by `GET /jobs/{id}/result` (owner only). | `website-build` is one more type. |

## 3. Website manager — layout

`apps/website/src/manager/`, a lazy chunk; the public site runtime (`src/main.js`, `siteRuntime.js`) stays separate
so visitors never load manager code.

```
┌ toolbar: [+ New website] [Publish this view]¹ │ [Edit] [Open] [Check] [Generate ▾] [Add to menu]² [Delete] ┐
├ list (HRecordManager, manager mode)   ┬ details of the selected record                                     ┤
│  🌐 Collections site       v4         │  Collections site · v4 · eng, fre                                  │
│  🌐 Old project site       legacy     │  URL  /osmak_mapping/site/207627            [Copy] [Open]          │
│  📄 Map of sites           v4         │  Pages  Home · About ▸ History · Data                              │
│  📄 Explorer: persons      v4         │  Problems  2 warnings (host without configuration n4 …)            │
│                                       │  Builds  2026-10-26 14:02  done  [Download]                        │
└───────────────────────────────────────┴────────────────────────────────────────────────────────────────────┘
¹ only inside Explorer   ² standalone pages only
```

- **List:** `RT_CMS_HOME` and standalone `RT_CMS_PAGE` (2-928 = 2-6254). Menu pages are not listed; they are shown
  in the website's page tree. A mark per item: `v4` or `legacy` (2-49 < 4 or empty). Built-in filter of
  HRecordManager (title, owner) as for other types.
- **Details** (from `GET /api/{db}/website/{id}`, §5): name, version, languages, live URL, page tree (each page with
  Edit / Open), problems of `CmsValidator` (= *Check*), builds of this site (job list of type `website-build`).
- **Actions** (toolbar for the selection; the same in the item toolset of the list):

| Action | Records | Does |
|---|---|---|
| New website | — | §5 *Create*: dialog (name, languages), then the new site is selected |
| Publish this view | — | inside Explorer only: Explorer as a new standalone page (§6) |
| Edit | v4 | record editor of the website / page (`editRecord` of the host). Phase 3: *Edit* opens the designer, *Properties* keeps the record editor. |
| Open | all | live URL in a new tab: v4 `/{db}/site/{id}`, legacy `/{db}/web/{id}` |
| Check | v4 | `GET /website/{id}/check`; the problems in the details |
| Generate | v4 | `website-build` job with `HJobMonitor`; result downloaded as a ZIP (§7) |
| Add to menu | v4 standalone page | pick a v4 website (HRecordManager `select`), then a parent (top menu or a page); the page becomes a menu page (§5 *Menu*) |
| Delete | v4 | a standalone page: the record, after one question; a website: the home record and, after a second question, its menu pages that no other site uses (§9 Q8) |
| Legacy editor | legacy | opens the legacy CMS editor (as from the legacy UI). Conversion is phase 8. |

- **Setup:** before *New website* or *Publish*, `ensureInstalled()` as in Reports: if 2-49 / 2-1187 / 2-1202 are not
  in the structures, a manager is asked to run `POST /website/setup`; other users are told to ask the owner.
- **Rights:** the normal record rights. The list shows what the user may see; Edit / Delete / Generate only for
  records the user may edit (`canEdit` of the record list item).

## 4. Explorer and shared changes

- **Explorer tool** `publish`: `create` loads `apps/website/src/direct.js` → `mountWebsiteManager({container,
  bootstrap, host})` (lazy, like Reports). `host` gives `editRecord`, `viewRecord`, `captureView()` (§6) and the
  shared `apiClient` / `dbdefs`. The rail button loses "coming soon". Caption: §9 Q1.
- **Standalone use:** `apps/website/manager.html` (dev and deploy) mounts the manager without Explorer (no
  *Publish this view*); the legacy UI can open it later. Not linked from the legacy menu in this phase.
- **HRecordManager:** `recordTools: (record) => HTMLElement[]` and `recordBadge: (record) → {text, title}` options in
  `manager` mode too (today `relations` only). Used for the `v4` / `legacy` mark and the per-item actions.
- **Architecture rule:** Explorer may import `apps/website/src/direct.js` (as it does Data / Reports); the existing
  rule test gets the new entry. `direct.js` must not import the site runtime.

## 5. Server (heurist repository)

| Endpoint | Does |
|---|---|
| `GET /api/{db}/website/{id}` | summary for the details: type (website / standalone / menu page), version, title, languages, live URL, page tree (`WebsiteRepository` menu tree), `canEdit` |
| `GET /api/{db}/website/{id}/check` | exists; unchanged |
| `POST /api/{db}/website` | **Create** a v4 website: home record (2-49 = 4, name, languages, header with an HMenu host, footer, default `styles.base`, home content 2-4) + one page *About* in the top menu (§9 Q7). One transaction; answer `{id, url}`. |
| `POST /api/{db}/website/{id}/menu` | **Menu**: `{pageId, parentId?, position?}` adds the pointer (99-742 on the website or 99-761 on the parent page) and sets 2-928 of the page to menu page; `DELETE …/menu/{pageId}` removes it (the page record stays) |
| `POST /api/{db}/website/setup` | exists; also makes 2-38 optional on 99-51 if §9 Q3 says so |

- Create and menu go through `RecordStore` (plan 15 rules), never direct SQL; the save check `CmsRecordCheck` runs
  as usual. These endpoints are also what the AI agent API (phase 7) will use, so they live in
  `srv/Website/WebsiteEditService.php`, not in the controller.
- The starter content of a new website is one PHP constant set (`WebsiteStarter.php`), later replaced by templates
  (phase 4).

## 6. Publish (modules and Explorer)

### Modules

`HostAdapter.publish(payload)` (shared) is rewritten; the module code and its dialogs do not change:

1. A small shared dialog **Publish as page** (`shared/src/site/PublishPageDialog.js`): page title, and
   *Update "<title>"* (the page this module published last, §9 Q4) or *New page*.
2. `shared/src/site/modulePage.js` builds the page: HTML `<div data-h-node="n…" data-h-instance="i…"></div>`
   (fallback text "This page needs JavaScript."), 2-1187 `{schema: 'heurist-cms/4', instances: {i…: {kind:
   'module', type, configVersion: 1, settings: {format: 'heurist-<type>-settings', version: 1, options, config},
   state}}, styles: {nodes: {n…: {height: '100vh'}}}}`, 2-928 = standalone, 2-49 = 4. No PHP copy of this builder:
   the server only validates the page on save.
3. Write with `RecordEditClient`: a new page by `POST /records`; an update reads the page, replaces only this
   module's instance in 2-1187 (and the title) and saves with `PATCH /records/{id}`. The HTML is not touched while
   the host is still there, so what the author added later in the designer is kept.
4. Result `{id, url, embed}` → `PublishedDialog`, extended with the embed snippet
   (`<iframe src="…" style="width:100%;height:600px;border:0"></iframe>`) and *Open in Website manager* (when inside
   Explorer).

`HostAdapter` needs the srv API: it builds a `HeuristApiClient` from `baseUrl` + `api` (as `apiBaseUrl` elsewhere)
or takes the module's own client. A guest (no user) gets "Log in to publish" — as today the server refuses.

### Explorer

*Publish this view* in the Website manager (Explorer only) — Explorer becomes one `explorer` instance:

- `settings`: `{format: 'heurist-explorer-settings', version: 1, layout, ui, modules}` — `layout` as today's
  `settings.layout`, `ui` = the `ExplorerUiConfig` value (panes, toolbar, query source lists), `modules` = the module
  preferences Explorer holds now.
- `state`: `{dataSource, selection}` (as the existing `config.state`).
- `createHeuristExplorerConfig`: when `published` and `settings.ui` is given, `ExplorerUiConfig` is made from it and
  **never saved** (no localStorage writes on a public page). Content: §9 Q5.

### Removal (decision 21)

| Repository | Removed / changed |
|---|---|
| heurist | `srv/Publication/` (whole folder), `srv/Controller/PublicationController.php`, `ServiceFactory::publicationController()` and the publication directory setting, `FrontController` branch for `PublicationController` / `pub_id`, the comment in `PageRenderer`; the publications folder in the filestore is not touched (no files in use) |
| heurist-explorer | `HostAdapter.publish` (rewritten), `normalizePublicationResult` (`pub_id` handling) in Data and Record View, `heurist-publication` mentions in docs (`integration.md`, `configuration.md`) |

A `?pub_id=` URL then gives the normal "unknown request" answer.

## 7. Generate (first build job)

- Job type `website-build` (`srv/Website/Build/WebsiteBuildJob.php`, handler from
  `ServiceFactory::websiteJobHandlers()`, registered in `hserv/controller/api.php`). Parameters `{id}` (website or
  standalone page). One active build per user (job rules).
- Renders every page × every site language with **guest rights** (what an anonymous visitor sees; no author session
  in the output): `PageRenderer` in a *static* mode of `SiteUrls` — links `{lang}/{page id}.html`, `index.html` =
  home of the first language, `hreflang` links (27a §4 *Languages*). The site runtime and module bundles stay
  absolute URLs to this server: a built site is not an offline copy (plan 27 §7).
- Output: the job folder `<id>/site/…` zipped to `<id>/website-<id>.zip`; downloaded by `GET /jobs/{id}/result`
  (owner only). Serving a built site at a URL and keeping the previous build: phase 6 (§9 Q6).
- Progress per page; Stop between pages (`JobContext::check()`).

## 8. Changes by file

### heurist repository

| File | Change |
|---|---|
| `srv/Website/WebsiteEditService.php` (new) | create website, add / remove menu entry |
| `srv/Website/WebsiteStarter.php` (new) | starter HTML and configuration of a new site |
| `srv/Website/WebsiteService.php` | `summary()` for `GET /website/{id}` |
| `srv/Website/SiteUrls.php`, `PageRenderer.php` | static mode (file links, absolute asset URLs) |
| `srv/Website/Build/WebsiteBuildJob.php` (new) | §7 |
| `srv/Website/WebsiteSetup.php`, `hserv/web/WebsiteDefinitions.php` | logo requirement if §9 Q3 |
| `srv/Controller/WebsiteController.php` | new endpoints of §5 |
| `srv/Runtime/ServiceFactory.php`, `hserv/controller/api.php` | wiring, job handler |
| removal | §6 *Removal* |
| `srv/Website/_README.md`, `documentation/api/heurist-openapi.yaml` | `/website` endpoints (27a left OpenAPI open) |
| `tests/WebsiteEditTest.php` (new) | create, menu add / remove, summary, delete; uses `osmak_mapping`, cleans up |
| `tests/WebsiteBuildTest.php` (new) | builds test site 207627, checks files, links and that no session id is in the output |

### this repository

| File | Change |
|---|---|
| `apps/website/src/direct.js` (new) | `mountWebsiteManager()` |
| `apps/website/src/manager/WebsiteApplication.js`, `WebsiteApi.js`, `WebsiteManager.js` (+ `.css`), `WebsiteDetails.js`, `websiteForms.js` | §3 (controller, API calls, view, details pane, New website / Add to menu forms) |
| `apps/website/manager.html` | standalone manager page (dev, deploy) |
| `apps/explorer/src/core/ExplorerApplication.js`, `ui/ExplorerControlPanel.js` | tool `publish` creates the manager; `captureView()`; no "coming soon" |
| `apps/explorer/src/explorerConfig.js`, `core/ExplorerUiConfig.js` | UI configuration from `settings.ui`, read-only when published |
| `shared/src/host/HostAdapter.js` | `publish()` writes the page (§6) |
| `shared/src/site/modulePage.js`, `PublishPageDialog.js` (new) | page from a payload; the title / update dialog |
| `shared/src/ui/PublishedDialog.js` | embed snippet, optional *Open in Website manager* |
| `shared/src/widgets/record-manager/HRecordManager.js` | `recordTools`, `recordBadge` in `manager` mode |
| `apps/data/src/host/HeuristDataPublicApi.js`, `apps/recordview/src/host/HeuristRecordViewPublicApi.js` | drop `pub_id` handling |
| `test/architecture` | Explorer may import `apps/website/src/direct.js` |
| tests | `shared/test/modulePage.test.js`, `apps/website/test/websiteManager.test.js`, Explorer `explorerUiConfig.test.js` (published read-only) |
| docs | `architecture.md`, `configuration.md`, `integration.md` (publish = page), localization `eng` / `fre` |

## 9. Decisions (Artem, 2026-10-26)

Q1–Q7: the proposals were accepted as written. Q8 was changed.

| # | Question | Decision |
|---|---|---|
| Q1 | Name of the Explorer tool: *Publish* (id `publish`, as now) or *Websites*? | Keep id `publish`, caption **Websites**, rail tooltip "Websites and published pages". |
| Q2 | Legacy websites in the list? | **Yes**, marked `legacy`, only *Open* and *Legacy editor*. They can not be edited here. |
| Q3 | 99-51 requires a logo (2-38). A new v4 site has none. | Setup makes 2-38 **optional** on 99-51 (the legacy editor still asks for it on legacy sites). |
| Q4 | How does *Publish* know which page to update? | The last page published by this module type, kept in localStorage per database (checked: exists, v4, editable); the dialog always offers *New page*. Not in the module state, so a module embedded in several places does not overwrite a page by accident. |
| Q5 | What does *Publish this view* take from Explorer? | Layout, UI configuration (panes, toolbar, query source lists), module preferences, current data source and selection. The visitor can not change and save any of it. |
| Q6 | Generate in phase 2 | ZIP download only; serving at a URL and keeping the previous build in phase 6. |
| Q7 | New website starter | Home content + header with menu + footer + one *About* page; base settings from the Heurist defaults. |
| Q8 | Delete | **Standalone pages can be deleted too** (Delete in the manager, one question). A website: ask twice; its menu pages that no other site uses are deleted with it. |

Request 2026-10-26 (after the review): the endpoint `GET /api/{db}/website/{id}/check` is renamed **`validate`**, as the
other endpoints (`/records/{id}/validate`, `/files/{id}/validate`). It stays a GET: it checks the stored record, not a body.

## 10. As implemented (2026-10-26)

**heurist repository**

- `srv/Website/WebsiteEditService.php` (new): `status()`, `summary()`, `create()`, `publishModule()`, `addToMenu()`,
  `removeFromMenu()`, `delete()`, `buildable()`; writes through `RecordSaveService` / `RecordDeleteService`.
- `srv/Website/WebsiteStarter.php` (new): header with the site title and a menu host, home content, footer, one
  *About* page; new ids per site.
- `srv/Website/Build/WebsiteBuilder.php`, `WebsiteBuildJob.php` (new): job `website-build` (§7).
- `srv/Website/SiteUrls.php`: `files()` (built site: `../{lang}/{page}.html`), `legacy()` (`/{db}/web/{id}`).
- `srv/Website/WebsiteRepository.php`: concepts `menuPage` (2-6253), `logo` (2-38); `ids()` public.
- `srv/Website/WebsiteSetup.php`, `WebsiteDefinitionsInterface::makeOptional()`, `hserv/web/WebsiteDefinitions.php`:
  setup makes the logo 2-38 of 99-51 optional (Q3).
- `srv/Controller/WebsiteController.php`: the endpoints of §5, `check` → `validate`; writes only from the same site,
  JSON body; record save errors with their issues.
- `srv/Runtime/ServiceFactory.php`: `recordWriteParts()` (record save / delete services shared by the record edit
  controller and the website manager), `websiteEditService()`, `websiteJobHandlers()` (guest `RuntimeContext` for the
  build), no publication directory; `hserv/controller/api.php`: website methods GET/POST/DELETE with the JSON body,
  job type `website-build`.
- Removed: `srv/Publication/`, `srv/Controller/PublicationController.php`, the `PublicationController` / `pub_id`
  branches of `FrontController.php` and `index.php`; READMEs updated.
- `tests/WebsiteEditTest.php` (43 checks; create, summary, publish, menu, build, job prepare, delete). The build checks
  are in this test, not in a separate `WebsiteBuildTest.php`. `WebsiteRenderTest`, `CmsFormatTest`,
  `DataAccessBoundaryTest` pass.

**this repository**

- `shared/src/api/WebsiteClient.js` (new), `shared/src/site/modulePublisher.js` (new), `shared/src/ui/PublishPageDialog.js`
  (new); `shared/src/host/HostAdapter.js` `publish()` (§6); `shared/src/ui/PublishedDialog.js` embed code and actions.
- `shared/src/widgets/record-manager/HRecordManager.js`: options `recordTools` (also outside the relations mode) and
  `listFields` (instead of the planned `recordBadge`: the badge is one of the record tools).
- `apps/website/src/direct.js`, `src/manager/` (`WebsiteApplication`, `WebsiteManager` + css, `WebsiteDetails`,
  `websiteForms`).
- Explorer: tool `publish` = Websites (`_createWebsiteTool`, `_websiteBridge`, `openWebsiteManager`, `captureView`),
  bridge `openWebsiteManager` for modules (`IframeModuleAdapter`), `ExplorerUiConfig.fromValue()` (published Explorer),
  `moduleAssetUrls.website`, captions and localization.
- Modules: Data, Map, Timeline, Graph, Record View stop when the page dialog is cancelled; `pub_id` code and the unused
  `loadPublishedMap` / `deletePublishedMap` of Map removed.
- Tests: `shared/test/modulePublisher.test.js`, `apps/website/test/websiteManager.test.js`, Explorer
  `explorerUiConfig.test.js` (published read-only), Graph publish test updated; the three adapter tests of the
  `PublicationController` call were removed. 1,437 JS tests and all eight builds pass; bundles deployed.

**Deviations and findings**

| Item | What was done |
|---|---|
| Page of a published module (§6) | Built and written by the **server** (`POST /website/publish`, `WebsiteEditService::publishModule`), not by `modulePage.js` + `RecordEditClient` in the client: modules in iframes have no definitions to turn concept codes into local ids, and the AI agent API (phase 7) needs the same service. On update only this module's instance (the first one with a host) and the title are replaced; text and other instances added later stay; a second module type adds a host. |
| Legacy editor action | Not added: the legacy CMS editor has no URL of its own. A legacy website shows *Open* and a note "edit it in the legacy website editor". |
| `manager.html` | Not added: the manager runs in Explorer; a standalone page can come with the legacy UI link. |
| Owner of new pages | `RecordSaveService` gives every new `RT_CMS_PAGE` the owner group 1 (database managers) and public visibility (legacy rule). A user who is not a manager can create a page but not change it later: *Publish* then offers only *New page*, and the page can not be added to a menu by that user. **To decide.** |
| Explorer module preferences | `settings.modules` is written by *Publish this view* but not yet read when Explorer starts (Explorer does not read `config.settings.modules` today). |
| Website delete | Menu pages pointed to by records outside the website are kept and listed (`kept`). |
| URL in CLI | `SiteUrls` takes the scheme from the base URL; in CLI tests that is `https://127.0.0.1`. |
| Not done | OpenAPI description of `/website` (also open from 27a); the browser check. |

## 11. Review round 1 (Artem, 2026-10-28)

### 11.1 Website manager and Explorer menu — implemented 2026-10-28, not committed

| # | Request | Done |
|---|---|---|
| 1 | Explorer options menu, after *Manage groups*: *Publish this view*, *Websites and published pages*; separators after *Getting started*, *Manage groups*, *Websites and published pages* | Gear menu of `ExplorerPaneToolbar` (separators `h-menu-divider`); the same two buttons in the footer of the Explorer configuration dialog (the other toolbar positions have no gear menu). `ExplorerApplication.publishView()` / `openWebsiteManager()`. |
| 2 | "Websites" is not a module of the Configuration dialog (a management tool, like Database design) | `publish` removed from `TOOL_TYPES`, defaults, simplified layout, `LayoutManager`, the configuration dialog, compact mode and the rail. A saved configuration that has `publish` loses it on load (only known types are kept). Tour step *Publication* points to Options. |
| 3, 4 | Open as the template editor: over the whole screen; header with a big Close on the right | Explorer puts `div.h-website-manager-host` (fixed, `inset: 0`, z-index 10000) on `document.body` and mounts the manager there; `mountWebsiteManager({onClose})`; the header has the title and a *Close* button (icon + caption). Record editor and messages are HMsg dialogs (top layer), so they are above it. Opening it again only selects the record. |
| 5, 8 | `HCardinalLayout`: west = list, center = toolbar above the details | West: `HRecordManager` (40 % of the width, min 260 px); center: toolbar, setup notice, details. |
| 6, 8 | List without view mode, selection menu, page size; 500 per page; no "i" | `listOptions: {pageLength: 500, controls: {viewMode, selectionActions, pageSize: false}, interaction: {popupEnabled: false}}`. `HRecordManager` no longer applies the remembered view mode when the host hides the view mode control. |
| 7 | Search by title does not work again | **Not a client bug.** The list sends `filter: {title}`; the server uses the FULLTEXT index of `rec_Title` (word-prefix `MATCH`). In `osmak_mapping` this index is **stale** for some rows: `rec_Title LIKE '%webpage%'` = 35 rows, `MATCH('+webpage*')` = 33; the two missing rows (205072 "FIRST ALONE", 207132 "TEST!!!") were modified 2026-10-08 … 10-19, so no word of their titles is found. Fix in the database: rebuild the index (`OPTIMIZE TABLE Records` or drop / add the FULLTEXT index). The cause (which write left the index behind) is not known; to watch on other databases. |
| 9 | Remove *Publish this view* from the manager | Removed (manager toolbar, `WebsiteApplication.publishView`, bridge `captureView`); it is in Explorer's menu (item 1). *Edit* stays the record editor until the designer exists (phase 3). |

Phase 3 (item 9): the CMS designer opens **over the whole screen** in Explorer, as the manager (agreed 2026-10-28:
"let's try"); the site preview is an iframe in it.

### 11.2 Publish this view (item 10) — proposal (agreed with the changes of §11.3)

**What is published.** `captureView()` already leaves out the tools (Report, Export, Actions, Crosstabs). A
published Explorer (`config.published`) also has:

- no left and right rails (toolbars), no QSE / Query Source editor, no lists of the Search (West) pane (Filters,
  Entities, Sources, Favorites, History, Workspace), no Filter Builder;
- instead an **HFilter** in the West pane (or North, see below) with the filters chosen in the dialog.

**The dialog** is Explorer's publication form, built as the module forms of plan 29 (`ModuleConfigurationDialog`,
HEditForm JSON `apps/explorer/src/ui/config/explorerPublicationForm.json`, the same *Publish to* section
New page | Update the page from `publishTarget(client, 'explorer', …)`):

| Field | Name | Type |
|---|---|---|
| Page title | `publish.title` | freetext (*Publish to* section) |
| Language | `settings.ui.language` | enum of `UI_LANGUAGES` (auto = the language of now, as the modules) |
| Filters | `settings.filter.items` | enum, multiple: the saved filters and query sources the user sees, and *Current query* |
| Active on start | `settings.filter.active` | enum (select) of the same list, empty label "None"; must be one of *Filters* |
| Presentation | `settings.filter.mode` | `buttons` \| `list` \| `select` |
| Placement | `settings.filter.placement` | `west` \| `north` (proposal: `north` suits `buttons`) |

**Question "filters and query sources use different endpoints — one HValuePicker?"** Not with the record
picker: a `resource` field searches `/records` only, and saved filters are still read from `/sys?q={t:'filter'}`
(their record format is plan 20 phase 4c). But one field **is** possible as an `enum` with
`multiple: true` (as *Allowed base maps* of the map): Explorer has both lists loaded already
(`SavedFilterManager`, `QuerySourceManager`), so the form gets one term list with ids `filter:12`,
`source:34`, `current` and labels with a mark of the kind (and *(parameterized)*). No new endpoint. After plan 20
4c both kinds could also go into one record picker.

**Stored in the page** (`settings.filter`):

```json
{ "mode": "buttons", "placement": "west", "active": "source:34",
  "items": [
    { "key": "filter:12", "kind": "filter", "id": 12, "title": "Persons", "request": {"q": [...]}, "filterForm": null },
    { "key": "source:34", "kind": "source", "id": 34, "title": "Map of sites", "request": {"q": [...], "rules": [...]}, "filterForm": {...} },
    { "key": "current", "kind": "query", "title": "Current query", "request": {"q": [...]} }
  ] }
```

Proposal: each item keeps its **resolved definition** (query, rules, Filter Form) at the time of publication, with
its id. Reason: a visitor is a guest and may not be allowed to read a private saved filter or query source; the
page then works as published. To change a filter the author publishes again (*Update the page*). **Q1: snapshot
(proposal) or reference only (read at start, always the latest version, but private filters fail for guests)?**

**HFilter** (`shared/src/widgets/filter/HFilter.js` + css, the simplest version):

- shows the items in the given mode: a row of buttons, a list, or a select;
- choosing an item runs it (the DataSource of the item → Explorer's `activateDataSource`);
- a parameterized item shows its Filter Form (`HFilterForm`) below the list; **no Builder button** (no
  `onOpenBuilder`) and no Close when it is the only item;
- one item only: no HFilter pane when it is not parameterized (the item runs at start); when it is
  parameterized, the pane shows only its Filter Form, without Close;
- `active` runs at start; without `active` the page starts with the saved state (`state.dataSource`) as now.

**Q2:** Placement North for `buttons` and West for `list` / `select` automatically, or a field (proposal: a field)?
**Q3:** Should the visitor's selection, Favorites and History be kept in the browser on a published page?
Proposal: no (nothing saved, as the UI configuration, §6).

### 11.3 Decisions (Artem, 2026-10-28) and implementation

| # | Decision |
|---|---|
| Q1 | **References, not snapshots.** Only public filters can be put on a page: saved filters of group 4 "Website filters" (hard-coded until saved filters and query sources are merged) and query sources with public visibility. HFilter keeps the ids and reads the latest version when the page opens. |
| Q2 | The position (West / North) is chosen in the publish form. Note for later: HFilter, HMenu, HBadges are widgets a page can hold on their own. |
| Q3 | No Favorites or History are read or written on a published page. |
| 9 | The designer opens over the whole screen (§11.1). |

Implemented 2026-10-28 (not committed, not checked in a browser):

| Part | Where |
|---|---|
| Publish form | `apps/explorer/src/ui/config/explorerPublication.js`: form JSON (language; *Available filters* = one multiple enum with `filter:12`, `source:34`, `current`; *Active on start*; *Presentation* buttons / list / select; *Position* West / North), values, page settings. Opened by `ExplorerApplication.publishView()` in the shared `ModuleConfigurationDialog` (mode publication) with the *Publish to* section of plan 29 (`publishTarget(client, 'explorer')`); written by `publishModuleTo`. The lists: `_publicFilterLists()` = saved filters of group 4 (`/sys`, owner 4) and the query sources of `[{t: QS}, {access: 'public'}]`. |
| Page settings | `settings.filter = {items: [{key, kind: filter\|source\|query, id \| request, title}], active, mode, placement}`; the current query keeps its request (it has no id). `normalizePublishedFilter` (`apps/explorer/src/core/publishedView.js`). |
| Published Explorer | `config.published`: `publishedUiConfig()` (toolbar vertical and hidden by CSS `.h-explorer-published .h-explorer-rail`, no docked lists, not simplified, tools in Unused); no Query Source editor, no query trace, no lists; pane tabs (`ExplorerPaneTabs`) switch the modules of a pane; History, Workspace, Favorites and the dock settings in memory storage; only the page's saved filters are loaded (`filterIds`). Start: `active` → HFilter runs it; else the saved state (`state.dataSource`). A parameterized source is run only from its Filter Form. |
| HFilter | `shared/src/widgets/filter/HFilter.js` + css: buttons / list / select; `resolve(item)` → DataSource, `onRun`; a parameterized one shows `HFilterForm` without Builder and Close; one item: no list, `needsPane()` false for one item without parameters (the host hides the pane and runs it). |
| Server (heurist) | `hserv/controller/api.php`: GET `/sys` is allowed without login. `SystemQueryBuilder::appendAccess` already gives a guest only the saved filters of group 4 and nothing of the other types (checked: users, groups, tags, bookmarks = 0 records for a guest; `/sys/user/{id}/image` still 401). Needed: a guest reads the page's saved filters. |
| Tests | `apps/explorer/test/explorerPublication.test.js`, `shared/test/hfilter.test.js`; 1,518 JS tests pass; Explorer and Website builds deployed. |

Not done: a browser check; the Filter Form of a parameterized source in the North position is not tuned (it uses the
form's own orientation); a page published before 2026-10-28 has no `settings.filter` and opens without a Search pane.

### 11.4 Review round 2 (Artem, 2026-10-29) — fixed, not committed, browser check pending

1. *Current query* as a page filter failed with "Unsupported DataSource reference type": the item is now
   resolved as a DataSource of reference type `query` (`ExplorerApplication#_resolvePublishedItem`).
2. Published Explorer: HFilter stays in the outer layout (`ExplorerAuthoringDock`), the modules in the inner
   one; the module panes now behave as "In panes" without a toolbar (`ExplorerPaneToolbar#startPublished`):
   pane tabs, shrink/grow buttons on the dividers of both layouts, every configured pane shown (collapsed
   until opened; this made the Timeline in the south reachable).
3. HFilter: buttons as wide as the pane, at most 290px, caption truncated (title = full caption); the Filter
   Form opens above the list and has Close (back to the list); a single parameterized filter (no list) has
   no Close.

### 11.5 Review round 3 (Artem, 2026-10-29) — done, not committed, browser check pending

1. Modules of a published Explorer have no Help, Options and Publish buttons: Explorer creates them with
   `options.ui.showHelp/showOptions/showPublish = false` (`publishedView.js#publishedModuleSettings`).
2. The Search pane is in the West only: `FILTER_PLACEMENTS = ['west']`, the Position option is removed from
   the publication form (an old `north` value is read as `west`).
3. Search pane head: magnifier, "Search" and « at the top right; collapsed it is a 34px strip with the
   magnifier and the vertical "Search" (as the Structure pane of the record editor), a click expands it.
   The outer divider has no shrink/grow buttons any more (the module layout keeps them).
4. Map: the host context of a published Explorer has `published: true`; symbology edits then last for the
   session only (`MapApplication#isSessionSymbology`: no Map Layer write, no preferences save), and the
   thematic map button is hidden (capability `thematicEditing`).

## 12. Next

Item 11 of the review: CMS designer = plan 27 phase 3, over the whole screen in Explorer (§11.1); a new plan document.
