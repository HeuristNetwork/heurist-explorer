# Current work

Status of the open development plans: what is done, committed, checked in a browser, and what comes next. Moved from
`CLAUDE.md` on 2026-11-18. The Status line at the top of each plan in this folder is the source; update both when a plan
changes. Newest first.

**`docs/development/27q1 Story-Map-Plan.md`** (agreed 2026-11-18; phases A-E done 2026-11-18, not committed, no browser check: entity `presentation`, srv/Presentations, HStoryMap + service + map binding, Explorer tool `storymap` (East), website element `storymap`, tabs in Record cards, map `flyTo`): story map as a stored *Presentation set*
record (also for crosstabs and export), designed in an Explorer tool pane, chosen in the CMS (Edit in new window +
Refresh); source query + expansion rule; layouts list / horizontal / tabs / carousel / slideshow (tabs also in Record
cards); map patterns per element, only points and path now. Entity name `presentation` agreed.

**Next plans, order and dates: `roadmap.md`** (agreed 2026-11-18): 27o multilevel layout, 27p conversion of three
websites, 33a other Actions, 27q other CMS widgets; then 35 srv bootstrap and authorisation, 36 login / logout, 28b
database structure, 27r AI agent API, 27s legacy website conversion.

**2026-11-18: plans 14a, 24, 27a-27n, 28a, 29, 30, 32, 33 and 34 are DONE** (all committed, explorer `e1d54de`, heurist
`97008004b`; files renamed). Their open items: `docs/development/leftovers 24, 27-34.md`. The entries below keep their
history; *not committed* in them is older than this line.

**`docs/development/27n DONE Page-Editor-Element-Panel-Plan.md`** (agreed 2026-11-17, from Artem's review; Phases A-D + reviews 1-9 (§14-23) done, not committed,
no browser check): one element panel with tabs Configuration | Own style (below the tree / beside Site-Page / popup with
Dock, Cancel, Apply), gear + trash on every tree row, sections Source / Presentation / Caption(s) / Behaviour /
Identification, element name `data-h-name`, action `toggle` (Show / hide element), reveal effects incl. `hidden`, item
colour schemes (Inverted), font-size variables, Add element regrouped. Phases A (font size, catalog, reveal) → B (format)
→ C (panel) → D (sections).

**`docs/development/27m DONE Website-SEO-Proposal.md`** (2026-11-16, agreed; Phases A-D done, not committed, no browser check,
not deployed, §8-9: canonical / x-default / description / noindex, sitemap as a guest, `layout.searchEngines`; job
`website-build` with options (body of execute, kept in `manifest.json`), `srv/Website/Build/GeneratedSites|GeneratedPages`,
record pages by query, `GET|DELETE /{entity}/{id}/asset`, `meta.generated`; own domain `"site"` mapping
(`routeOwnDomainSite`, `SiteUrls::domain`, files rewritten when sent); Website manager Generate dialog + *Generated site*):
website publication and SEO. One public URL `/{db}/site/{id}[/{page}[/{record}]]`: a generated file in `{db files}/generated-sites/{site id}/`
is served by default, else live; `?live=1` / `?design=1` = live + `noindex`; frames, filter parameters, API always
live. No previous build / Revert; `manifest.json`; Website manager card section *Generated site* (date, size, files,
Delete). Generate options (§2.1, kept in the website configuration `generate`): languages, target folder | zip | both
(ZIP = relative links, optional base URL), record pages by query (limit per build, guest visibility checked before a
record file is sent). `?lang=` stays, slugs postponed. Phases A (metadata, noindex, sitemap) → B (folder build +
serving + manager section) → C (own-domain v4 routing) → D (ZIP with base URL).

**`docs/development/27l DONE Page-Modules-Sync-and-Filter-Plan.md`** (2026-11-16, agreed; phase 5 of plan 27; Phases A-C done,
not committed, no browser check, §8-10: `DataSource.js` + `SyncEngine.js` moved to shared, `ModuleHandle`, `syncMode`;
`apps/website/src/PageSync.js` one per configuration block (`pageSyncOf`), instance key `sync`, designer *Page sync*;
widget `filter` (`siteFilter.js`, `cmsFilterWidget.js`), Stop in HFilter, Saved filter action with saved filters (`filter`
key, `?filter=`, link `f<id>`), legacy converter + saved filter reading moved to `shared/src/data/`; review round 1 §11:
fixes (Filter in Modules, Map page result via `setQuery`, Page sync with Apply, HFilter veil, preview keeps `h-` classes),
instance key `dataSource` (own records with sync selection | none, section *Page sync and Query source*), Record cards
`mode: 'source'` + `querySource`, page sync also in the design preview; review round 2 §12: *Records and selection*
replaces `sync` (`records.from` own | links | filter:<id> | module:<id>, `selection`, `shared/src/site/cmsRecords.js`,
PageSync by origin), phases E1 + E2 (Explorer: one fieldset, bridge `recordsSection` / `showFilters`) done; not committed;
Phase D later):
one page = one domain; `SyncEngine` + per-type `ModuleHandle` moved to `shared/src/sync/`, `apps/website/src/PageSync.js`,
instance setting `sync: all | selection | none`; widget `filter` (HFilter, no URL change); Stop in HFilter through a page
`RequestMonitor` (also the published Explorer). Later: bindings between modules (selection → search).

**`docs/development/34 DONE File-Endpoints-Transition-Plan.md`** (2026-11-16, agreed; phases 1-4 implemented in both repos, not
committed, no browser check, bundles not deployed): every file URL of heurist-explorer on the file endpoints
`/api/{db}/files/{key}/asset|web|thumbnail` (`content` renamed `asset`; `/web` = reduced copy, `srv/Files/WebImageCache`,
cache named by the file key). One URL rule `shared/src/data/fileUrls.js` = `srv/Files/FileUrls.php` (fixture
`shared/test/fixtures/file-urls.json`); stored form `./api/{db}/files/{key}/{kind}`, legacy `?file=` rewritten on output
(designer load, TinyMCE load, Record View, PageRenderer, StyleCompiler / compileCmsStyles, Smarty); server player
`srv/Files/FilePlayerHtml.php` (Smarty `mode="player"`), same choice as `buildCmsMedia` / `mediaTag` (fixture
`file-players.json`); exports and viewer pages stay legacy.

**`docs/development/27k DONE Website-Element-Options-Plan.md`** (2026-11-15, agreed; Phase A committed, §7: `menuLook()` in
`shared/src/site/cmsMenu.js` = `PageRenderer::menuLook`, classes `h-site-menu-style-*` / `-expanding`; designer code must not
import a site widget with CSS (§7.1); Phases B-E done, not committed, no browser check, §8: tabs `data-h-orientation` / `data-h-item-style`;
§9: `layout.header.onScroll` keep | shrink, `attachHeaderShrink`, website menu class `h-site-menu-main`; §10: menu `collapse:
fullscreen`, `animation` down | right | fade, `alwaysCollapsed`, `HMenu._showOverlay`; §11: `layout.backToTop`, accordion
`data-h-multiple` / `data-h-first-open`, `data-h-reveal`, menu `scope: section`, widget `breadcrumbs` (`siteBreadcrumbs.js`),
action menu item `search` (`PageRenderer::searchForm`); review 2026-11-16 §12, not committed, no browser check: own style of
header / footer = `styles.header|footer` (`partStyle`, `StyleCompiler::PARTS`; heights / own colours removed from Navigation and
layout), drop-down + icons behind a button = one presentation `expand` (`open` hover | click, `buttonText`), presentation `grow`,
`menuStyle()` = `PageRenderer::menuStyleAttr` (underline line, full-screen colours), Home caption, section menu fallback to the
first level, shrink in the designer, `fullres=1` background images; §13: links of menus / breadcrumbs / logo in the preview open
their page in the designer, `CmsPreview.previewPageOf` + `onNavigate` → `CmsDesigner._navigate`; §13.1 the language switch of
the page → `onLanguage` → `_previewLanguage` (stays in design mode); no swap / scroll in the designer): item `style` for menus
and tabs (`plain | links | underline | pills | buttons | outline`, apart from `presentation` `row | column | dropdown |
icons | expand`), action menu orientation + icons that expand on hover, vertical tabs, *Shrink on scroll* for a fixed
horizontal header (small logo + menu + languages), full-screen collapsed website menu (`collapse: fullscreen`, slide
down / right), extras: back to top, accordion one open, reveal on scroll, section menu (`scope: section`), breadcrumbs
(`path` server / `history` client trail of record pages), search box = action menu item with the 27j Saved filter
action (typed text = `v.<NAME>`). Phases A (§1-2) → B (§3) → C (§4) → D (§5) → E (§6).

**`docs/development/27j DONE Saved-Filter-Action-Plan.md`** (2026-11-15, agreed; Phases A-C implemented, A-B committed, C (client only) not committed,
no browser check, §7-9; values from the record `{record: 'id'}` / `{field}` filled in by the server; shared `shared/src/site/cmsSavedFilter.js` = `srv/Website/SavedFilterLink.php`, designer
`savedFilterField.js`, site runtime `pageFilterRequest` / `filterInstanceState`, Explorer `state.pageRequest`): CMS action *Saved filter* =
a public query source + target page + values (stored as a reference, not a query); URL `?source=<id>&v.<NAME>=` (limits:
8 values, 200 chars, arrays of 10); every record module of the target page takes the result, read by the site runtime
(`runtime.filter`), not by the modules; missing values: Explorer asks for them (its filter form, filled in), other
modules leave their predicates out (at least one value for a parametrized source). Phases
A (constants) / B (values from the record) / C (same page, swap / scroll).

**`docs/development/27i DONE Website-Page-Templates-Plan.md`** (2026-11-12; rework 2026-11-13, review 2026-11-14, implemented in
both repos, not committed, no browser check):
- §9 (phase D): page templates built from the Add page form (`shared/src/site/cmsPageTemplates.js`, every element with a
  first value, placeholders and banners of `apps/website/public/assets/cms`, media setting `placeholder`); groups are grids,
  the page is the root group (`styles.page`), background video of a group = `data-h-bg-video`.
- §11 (review 2026-11-14): Add page = one popup, the form of the chosen template beside the list
  (`templateForms.createTemplateForm`, hide flags for Cover only); the page popup (`openPageForm`, pen of the root); the
  inline form beside the tree keeps only Own style (+ caption of a group), every other edit is a popup (pen / gear);
  phase F dropped; menu rollover = page description. Open: where to keep the sample images (§11.3). Blog / starter pack =
  phase C, to discuss.

**`docs/development/27h DONE Email-Form-Widget-Plan.md`** (2026-11-12, agreed and implemented in both repos, not committed, no
browser check, no real message sent): widget `email` written by the server (`srv/Website/EmailFormHtml.php`, display
inline | button + dialog), `shared/src/widgets/site/HEmailForm.js` asks the captcha and sends; `GET` / `POST
/api/{db}/external/email` (guests, same site, captcha in the session as legacy, 5 per hour,
`srv/ExternalService/EmailForm/`), recipient DT_EMAIL of the website else the db owner (`srv/Website/WebsiteContact.php`),
mail through `$mailSmtp` SMTP relay or the legacy mailer (`srv/ExternalService/Mail/`). Test `heurist/tests/EmailFormTest.php`.

**`docs/development/27g DONE Record-Page-Plan.md`** (2026-11-11, agreed; Phase 1 server implemented, not committed, no browser check, §5):
record page = ordinary CMS page with a Record cards widget in `mode: 'url'` (`CmsValidator::recordCards`), URL
`/{db}/site/{site}/{page}/{record}` (`&rec=`), `record.` field source, title / meta / canonical from the record, 404 without a
visible record, left out of website menus, action menu actions `recordPage` (page + record) and `back`. Phase 2 (§6-7, done, not
committed): actions None / Open record URL / Open record page / Saved filter (disabled) on Record cards, Record field (`data-h-link`),
media and gallery (Any record), shared `apps/website/src/designer/recordPageField.js` (Define new record page popup), links written by
the server (`PageContent::recordLinks`, `.h-site-rec-link`). Phase 3 (§8, done, not committed): navigator views (`{page}/{record}`),
hidden / record pages shown alone in scroll mode, Back = history back from this website. Later: caching, sitemap, RecordView element.

**`docs/development/33 DONE Actions-Tool-and-Batch-Updates-Plan.md`** (2026-11-10, plan 32 Phase 2; Field values implemented in both
repos, not committed, no browser check, §6): Explorer Actions tool `apps/explorer/src/tools/actions/` (lazy chunk; list of actions
by group, only Field values Add / Replace / Delete enabled; inline united field list + HEditForm with the Filter Builder row
(`HFilterBuilderItem` `fixedField`) as condition), scope shared with Export (`tools/toolScope.js`). Server job `record-action`
(`srv/Records/Actions`, one transaction per record via PATCH, skipped records reported, `srv/Records/Query/RecordScope.php`);
a stopped / failed job keeps its report (`JobContext::setPartialResult`); one selected record = PATCH (`meta.values`).
Test `heurist/tests/RecordActionTest.php`.

**`docs/development/32 DONE Field-PATCH-and-Batch-Updates-Plan.md`** (2026-11-10; Phase 1 implemented in both repos, not committed,
no browser check, §9): PATCH writes only the given fields (`RecordSaveService::patchFields`): `details` replace / `[]` delete
(refused for required fields), `detailsAdd` (multi-value fields), `detailsMatch` (value condition of the query format,
`FieldPredicateCompiler::valueCondition`), `addIfNone`, `?fields=` short answer, `meta.changed`. Title, calculated fields
and child titles only when they depend on a changed field: `srv/Records/Edit/FieldDependencies.php`, cache
`def-snapshot-dependencies.json` in the `entity` folder (legacy `cleanDefCache` removes it; `cfn` added to
`DbEntityBase`). Designer saves ask for the header only. Test `heurist/tests/FieldPatchTest.php`. Phase 2 (batch updates)
= plan 33 (job `record-action`).

**`docs/development/27f DONE Website-Layout-and-Helper-Widgets-Plan.md`** (plan 27 Phase 4b; phases A-E implemented 2026-11-07 in both repos,
not committed, no browser check, §10): navigation modes `reload|swap|scroll` (`layout` in 2-1187, tab *Navigation and layout*;
swap/scroll fetch the full page, `<section data-h-page>` + page styles scoped, `apps/website/src/siteNavigator.js`), header/footer
position classes + page hide flags, header templates + footer composer, HMenu options (one class for `menu` and `actionmenu`),
HLangSwitch (`language`), action menu (`actionmenu`, social = preset, Add record via Explorer public API `addRecord`), badges
(`badges`; Hosted at = `source: host`, `srv/Website/HostInfo.php`). No per-page script/CSS in v4 (§9.3).
Review 2026-11-08 (§11, not committed, no browser check): Saving spinner in the designer, Check of all pages + non-public
records (`/website/{id}/validate` → `records`, `srv/Website/CmsRecordReferences.php`, widget `apps/website/src/manager/WebsiteCheck.js`,
Check button in the designer), only db admins create websites and change owners of websites/pages (`assertOwnerRule`, `HRecordAccess.ownerLocked`).
Review 2026-11-09 (§12, not committed, no browser check): only used types in the record type filter of unconstrained pickers,
Width / Height of a file Record field, header position Fixed by default, Delete back in the Website manager. Round 2 (§13,
not committed, no browser check): header positions `fixed|scroll|slide|none` (slide = expand / collapse button,
`attachHeaderToggle`; Shrink removed), element `headerSet` (header default set arranged by CSS, the five header templates
removed), `layout.header.rows`, header / footer `theme` + own `colors`, banner 99-951 (`PageRenderer::layoutCss`), website
fields form `apps/website/src/manager/websiteFields.js` (New website popup on HEditForm, Header block of Navigation and layout),
Layout button below the page tree, HMenu collapses when it does not fit. Round 4 (§13.3, 2026-11-10, not committed): layout
sizes `header.height|width`, `footer.height`, fixed footer at the bottom of the window, field names in the part tree.

**`docs/development/31 DONE Temporal-Text-Language-Plan.md`** (DONE 2026-11-07, committed, no browser check): date text by
language, words in `shared/src/utils/temporalLocale.js` + `srv/Utilities/TemporalLocale.php` (not the localization files; `eng`, `fre`), `temporalToHuman(value, { language })`,
last parameter `$language` of `Temporal::toHumanReadable`; titles and exports stay English; `lang` in `POST /time` for timeline labels; 30-day months fixed in srv and client, not in hserv.

**`docs/development/28 OpenAPI-Rules-and-Database-Structure-Plan.md`** (draft 2, 2026-11-06; §11 = tasks moved from plan 20, 2026-11-07): API rules above,
endpoint table §2.4, hserv / srv split §2.5, domain / entity table with legacy tables and classes, special endpoints,
current → target mapping, dispatch through an entity registry + hooks + action handlers, database structure (table pairs,
`MEDIUMTEXT` + `dtl_Lang`, global ids). §9.7 revised 2026-11-06: `/sys/{entity}` is an accepted alias, `/{entity}?q=` = search.
`image` → `asset`, `schedule` → `output`. Open: terms domain, QName. Not for immediate implementation.

**`docs/development/28a DONE Unify-System-Entities-Plan.md`** (DONE 2026-11-07, committed; routes as a logged-in user and browser not checked; §7): `/{entity}` for user,
group, bookmark, reminder, tag; legacy `/users`, `/groups`, `/tag`, `/rem`, `/reminders` removed (not used by any client);
`t` = name, id or concept code; `/sys` over website, page, report, output; client off `/records`.

**`docs/development/30 DONE Custom-Report-System-Plan.md`** (phases 0-5 + §12-13 committed, no browser check; one name rule in `ReportTemplateStore` done 2026-11-07 (§14.1, uncommitted); 2-62 guard + legacy read-only 2-62 done 2026-11-07 (uncommitted); DONE 2026-11-12: css mode = plain text; §11): `/reports` removed, API
by record id only, entity `output` (UI Generated report), `/report/{id}/asset|execute|export`, `/output/{id}/asset|execute`,
template files keep their names (set once), generated files `{outputId}.{ext}`, test and generate stay jobs, one dialog Generated reports, Generate looks for outputs with the same query first. Review round 2026-11-07 (§12, not committed): New mode of Generated reports replaces the Generate popups, `term` translated in srv, count of the current result from the server.
§15 (2026-11-11, not committed): install notice with Install button when 2-1104/2-1105 are missing (bridge `definitionsChanged`);
constants renamed `RT_REPORT_TEMPLATE` (2-1104) / `RT_REPORT_OUTPUT` (2-1105), no aliases.

**`docs/development/27d DONE Website-API-Plan.md`** (2026-10-30, agreed and implemented in both repos, not committed, not
checked in a browser): website / page = first record-based entities on the generic record controller
(`/website/{id}`, `/page/{id}`, `meta.canEdit` + `meta.website`), `srv/Records/Entity` registry + handler,
`srv/Website/WebsiteEntityHandler`, `assign` (menu add / move with index / remove), `page/{id}/import` (module
publish), `execute` (build job), setup returns local `codes`; `WebsiteController` keeps only pages; group-1 rule for
new pages removed. Client `WebsiteClient` on the entities (pages list = `/records` search). Tests: heurist
`tests/WebsiteEditTest.php` 54 pass, JS 1,521 pass. 27c can now be implemented on this API.

**`docs/development/09 Expansion-Levels-Graph-and-Data-Plan.md`**
- Phases 1–2 (rule builder, Graph levels, Explorer `editRules`/`updateRules`) are
  implemented and committed (`ec2aef1`).
- §11 (relationship predicates `rt`/`rf`/`related[:N]` and path notation `r<field>`) was
  agreed 2026-09-29 and is in commit `8aa2890` (client) / `9bca7dafe` (server).
- **Next: Phase 3 — Data module** (§7): shared `expansionLevelQuery()` in
  `shared/src/data/expansionRules.js`, level selector in `h-recordlist-toolbar`, second
  `HRecordList` filtered by the main list's selection.
- Phase 4 (Map, Timeline) is postponed.

**`docs/development/10 DONE Query-Trace-and-Termination-Plan.md`** (2026-10-01): `debug=1|2` section on
srv/ endpoints, query trace panel under `h-dsa`, Stop (rail, QSE veil, Graph), statement time
limit + `POST /records/cancel`, recLinks candidate pre-filter, Map/Graph guards. Implemented,
not committed, not yet checked in a browser.

**`06 Explorer-Authoring-Dock-and-Compact-Mode-Plan.md` Part C** (2026-10-03): compact QSE in
five panes, Vertical (west) / Horizontal (north) placement from the QSE Layout menu, More
remembered, query trace panel hidden. Implemented, not committed, not yet checked in a browser.

**`docs/development/11 Getting-Started-Plan.md`** (2026-10-03): Phases 1–2 done (last history
entry reopened at start, first-visit welcome popup, Getting started in Explorer configuration,
guided tour `ui/ExplorerTour.js` + `explorerTourSteps.js`, texts in
`user-manual/explorerGettingStartedEng.htm`), not committed. Next: Phase 3 content (recordings
from Artem).

**`docs/development/12 DONE Smarty-Reports-Plan.md`** (2026-10-04): Custom Report / Report Schedule
record types (edited via `editRecord`), `srv/Reports` API with a renderer interface implemented
in hserv, generic background jobs (`srv/Jobs`, JSON job files), new app `apps/reports` loaded
lazily in Explorer Tools mode, shared `HSmartyEditor` (CodeMirror 6) + `HFieldTree` moved to
shared, later port of the Smarty engine to `srv/`. Codes: RT 2-1104/2-1105, DT 2-1182..1184,
file name DT_FILE_NAME 2-62. Phase 1 (server: `/api/{db}/reports`, `POST /reports/setup`, `allowDynamicReports`)
done; Phase 2 (`/api/{db}/jobs`: background jobs in `srv/Jobs`, `report-preview` / `report-generate`,
cron `runReportSchedules.php`) done (heurist repo); Phases 3-5 (2026-10-05, this repo): shared
`JobClient`/`HJobMonitor`/`ReportTemplateProvider`, new app `apps/reports` (Report tool in Explorer,
lazy), `shared/src/smarty/` (`HSmartyEditor`, CodeMirror 6, tokenizer, snippet builder), `HFieldTree`
moved to `shared/src/widgets/field-tree/`. Four review rounds by Artem (2026-10-05); round 4: full-screen
template editor in three panes, `HCardinalLayout` moved to `shared/src/widgets/layout/`, multi-select
field tree with the legacy per-field insert dialog. Phase 6 (2026-10-05, heurist repo): srv Smarty engine
`srv/Reports/Smarty/`, jobs in `srv/Reports/Jobs/`, used by the new API (no switch),
`tests/ReportEngineCompareTest.php` shows the same output. Nothing committed; not yet checked by Artem.

**`docs/development/13 DONE Export-Plan.md`** (2026-10-06): port of record export to `srv/Records/Export`
as a background job type `export` (no HTTP streaming endpoint — reasons in the plan), formats
csv/tsv (one file per record type, zipped), json (`/records` envelope), geojson (`GeoJsonStreamWriter`),
kml, xml (importable HML core), gephi (GEXF); private result file via `GET /jobs/{id}/result`; Export
tool in Explorer (lazy chunk `apps/explorer/src/tools/export/`); enum outputs use the report names
`term|code|conceptid|desc|internalid`. Phases 2-5 implemented 2026-10-06 (both repos), not
committed, not yet checked in a browser; server test `tests/ExportWriterTest.php`.

**`docs/development/14 DONE Record-Editing-Plan.md`** (2026-10-12, DONE 2026-10-26): srv write API for system records
(POST insert / PUT / PATCH / DELETE on `/records/{id}`, format input = GET output), generic `RecordValidator`,
`RecordStore`, shared `HRecordEditor` used only for whitelisted system types (QS, reports, map docs/layers/sources,
CMS), Explorer `RecordEditorHost` with special fields, bridge `canEditRecordType`, QS save via PATCH. Phases 1-3
committed (heurist `81526abd7`, explorer `3423c49`). Title mask fill (`srv/Records/Edit/TitleMask`, port of legacy fill only) and calculated fields on save
(`CalculatedFields`, srv Smarty) done 2026-10-13, not committed; `tests/TitleMaskCompareTest.php` = legacy.
Phase 4 (Records manager) deferred.

**`docs/development/14a DONE Edit-Form-Plan.md`** (2026-10-17; committed, format agreed, documented in `docs/development/Edit-Form-Format.md`; openEditForm dropped; not DONE: consumers §19 item 3): generic `HEditForm` made from JSON
(`heurist-edit-form/1`, `shared/src/data/editFormSchema.js`, `shared/src/widgets/edit-form/`), `HRecordField`
moved to `edit-form/HEditField`, HRecordEditor uses HEditForm; `showWhen` in JSON, `onReady`/`onChange` hooks;
temporary left rail tool *Test edit form* (`apps/explorer/src/dev/`). Phases 1-2 done, three review rounds;
HSymbolEditor moved to HEditForm (`symbolEditorForms.js`, group `columns`). Not committed. Next: bridge
`openEditForm`, then report/config/crosstab forms.

**`docs/development/15 DONE Data-Access-Layer-Plan.md`** (2026-10-13): agreed. Phase 1 (DatabaseSettings, DefinitionLookup as the only definitions reader, one concept-code rule, ConceptCode.php removed, tests/DefinitionLookupTest.php) and Phase 2 (`Records/Store/`: RecordSchema, RecordRepository, RecordAccess, RecordStore moved there; FileRepository/UserGroupRepository started; all record reads outside the search compiler moved; tests/RecordRepositoryTest.php) and Phase 3 (FileRepository, UserGroupRepository complete, DefinitionLookup::groupName removed; tests/FileUserRepositoryTest.php) and Phase 4 (compiler writes table keys `{records}` etc. resolved by `Compiler/SqlTables`; one visibility rule `RecordRepository::accessSql`; facet SQL error for non-owners and `access:` list fixed; value visibility only on output via `RecordRepository::valueVisible`, search does not check it) and Phase 5 (tests/DataAccessBoundaryTest.php passes, empty exception list) done 2026-10-13, not committed. Phase 6 (plan 14 title mask + calculated fields) done too: plan 15 complete, not committed. srv code must not query
Records/recDetails/recLinks/files/users/def* tables directly; only `DefinitionLookup` (one concept-code rule,
lazy per item), `RecordRepository`/`RecordStore` + `RecordSchema`, `FileRepository`, `UserGroupRepository`,
`DatabaseSettings`; boundary test. Plan 14 title mask fill and calculated fields wait for its Phases 1-2.

**`docs/development/16 DONE Compact-Toolbar-Plan.md`** (2026-10-13): toolbar position *In panes* (config
`panes`, was *Compact* until 2026-10-14; not the narrow-screen compact mode): left rail as a small row
at the top of the West pane with a gear menu and `«`/`»`, Search hidden, no right rail, pane tabs
(`ui/ExplorerPaneTabs.js`), divider buttons and maximize in shared `HCardinalLayout`; all switching in
`ui/ExplorerPaneToolbar.js`. Part 1 committed (`bb44f67`). Part 2 (2026-10-14): tools (Report, Crosstabs,
Actions, Export, Publish) are pane modules (`tools/ExplorerToolModule.js`; Tools mode removed), *Unused*
bucket in the configuration (Result can not go there), pinned-button height fix. Parts 3-4 (2026-10-14):
simplified interface `isSimplifiedUI` (fixed layout, QSE in Result via heurist-data `setHeaderContent`,
Data module simplified settings and toolbar Sort / See-hide owners). Not committed, not yet
checked in a browser.

**`docs/development/17 DONE Symbology-and-Thematic-Map-Editors-Plan.md`** (2026-10-13): ports of the legacy
symbol editor, thematic map editor and image filter to `shared/src/widgets/symbology/`, shared
symbology core (`shared/src/symbology/`), range definitions (`shared/src/data/ranges/`, for crosstabs
later), DT_SYMBOLOGY in the record editor (Style / Thematic maps), Map module on the same editors with
PATCH save; legacy `editSymbology` bridge removed (both repos); 2026-10-14 a new `editSymbology` bridge (Explorer opens
the shared editors, Map saves) and `openHelp` (module manuals in Explorer, `useHostHelp`). Implemented, not committed, not checked in a browser.

**`docs/development/18 DONE Record-Edit-Form-Cosmetics-and-Summary-Plan.md`** (2026-10-14, DONE 2026-11-07; Phase 2 done by plan 20 4a/4b): record edit form
cosmetics (hover remove/clear and eye icons, Add/Translate after the label, label colours by requirement,
radios for ≤5 flat terms), shared form layout options `labelPos`/`inputPos` (`widgets/form/formLayout.js`,
also in HSymbolEditor), "Non-standard fields" group, Record summary pane (Admin, Linked records via
RecordView code, Scratchpad; Private/Tags = Phase 2, needs srv). Phase 1 implemented, not committed.

**`docs/development/19 DONE Temporal-Editor-Plan.md`** (2026-10-17): port of the legacy temporal editor:
`shared/src/widgets/temporal/` (popup `HTemporalEditor`, `temporalValues.js` JSON ↔ form values, four form
JSONs), date fields of edit forms = `HInputTemporal` (date input + Show raw + Edit; `temporal: false`
suppresses). Gregorian only; native calendars later. Implemented, not committed, not checked in Explorer.

**`docs/development/20 DONE System-Data-Transition-and-Files-Plan.md`** (DONE 2026-11-07; open tasks moved to plan 28 §11): all data
(not definitions) in the Records/recDetails format; files RT_REGISTERED_FILE 2-1106 on `/files` (read, chunked upload,
`LegacyFileStore` / `RecordFileStore`, `FileWriteService`), `/{domain}/aggregate`. **Phases 4-5 redesigned 2026-10-22
(§10):** `/sys` itself gets the record format (numeric `rec_RecTypeID`, details by field id, `fields=_all`) and CRUD,
no `/system`; tags stay in `usrTags` for good; editors = HEditForm on hard-coded `/rst`-format structures (also files);
order 4a tags (+ `srv/System/Entity` base classes, Files on them, HTagManager, Summary → Tags) → 4b bookmarks,
reminders → 4c saved filters → 4d users, groups (password write-only), entity-image mode of HInputFile.
**Phase 4a done 2026-10-22 (§10.8), not committed:** `srv/System/Entity` bases (Files on them), `srv/System/Tags`,
`srv/Records/UserData`, `SystemEditController` (`/sys/tag` writes, assign, merge), client `TagClient`, `HTagManager`,
`HTagSelector` (Summary → Tags), Explorer "Manage tags"; definitions imported (Tag 2-1109 = 137 ... Reminder 2-1111 = 136,
fields 2-1189..1193). **Phase 4b done 2026-10-22 (§10.10), not committed:** `srv/System/Bookmarks` (private note
AES-256-GCM `PrivateInfoCipher`, key `$privateInfo_Secret` per installation, owner only; legacy DbUsrBookmarks and
recordSearch decrypt), `srv/System/Reminders` (Send now = legacy mailer closure, `POST /sys/reminder/send`), shared
`System/Entity/EntityRecordOutput`; client `systemEntities.js` (hard-coded `/rst` structures), `UserDataClient.js`,
`widgets/user-data/HRecordPrivate` (Summary → Private, popup forms, sent at once); tests
`SystemBookmarkReminderTest.php`, `shared/test/userData.test.js`. **File editor (§10.11, 2026-10-23, not committed):**
hard-coded file structure by type (`fileEditStructure`), HRecordEditor `structure`/`structurePane`/`summarySections`/
`linkedRecords`, HInputFile `replace` mode, srv MIME rule + tiled replace fix; MIME vocabulary SQL
`docs/development/20-mime-vocabulary.sql` + `20-file-extensions.sql` for Artem to review. **4d users and groups (§10.13,
2026-10-23, not committed):** /sys/user, /sys/group in the record format + writes (fields by DT_* constants, codes in
`srv/System/Users/UserGroupCodes.php`; user codes 2-1194..1199, 2-9, 2-1189, 2-37, vocabulary 2-10566 given 2026-10-24; group membership = relmarker 2-1200, plan 24), members action, entity images
(`EntityImageStorage`, `/sys/{type}/{id}/image`), Explorer "Manage users" / "Manage groups". Next: 4c saved filters.
Open points §10.7. Each phase
needs its own planning session.

**`docs/development/21 DONE Record-Manager-and-Pointer-Modes-Plan.md`** (2026-10-22): DONE. HRecordManager, pointer
modes, HRecordAccess, every record type in HRecordEditor, Explorer editor mode, built-in filter forms. Leftovers moved
(§11): tags/bookmarks → plan 20; remote video/audio players → files task; rich blocktext editors → own task; srv save
gaps → a later plan; configuration → future.

**`docs/development/22 DONE Relationship-Marker-Input-Plan.md`** (2026-10-22, DONE): `HInputRelmarker` for relmarker fields
(relation type ▸ target, Edit / View of target and relationship record, delete after a warning, no visibility eye),
popup `shared/src/widgets/relationship/relationshipDialog.js` (HEditForm with source / type / target; Create Link,
Save and Edit Attributes), data `shared/src/data/relmarkerRelations.js`, reverse fields in the last group
"Relationships from other records" (`reverseRelmarkerGroup`), a new record is saved before its first relationship.
Committed (`b07bc66`, `3df305f`), checked by Artem.

**`docs/development/23 DONE Large-Records-Plan.md`** (2026-10-22): DONE, committed (`3df305f`). Configurable limits
(Explorer configuration *Record View and Edit limits*, `runtime.recordLimits`), Linked from groups with counts,
HEditForm `lazyGroups` / `setViewFilter`, automatic groups, HEditField `valueLimit`, lazy HValueCombo picker,
Structure west pane `HStructureTree`. Future tasks (§15): PATCH save of changed fields, batch update of records.

**`docs/development/24 DONE Relationship-Manager-Plan.md`** (2026-10-24, DONE): one-to-many relationships. HRecordManager mode
`relations` (`shared/src/data/relationStores.js`: relationship records or group memberships; toolset per list item via
HRecordList `recordTools`; "Find or Add" in `select_multi`; writes at once), repeatable relmarker fields get "Manage
relationships" (HEditField `isManagedRelmarker`), group / user forms edit memberships through relmarker 2-1200.
Checked by Artem; three review rounds (built-in Extended view in the manager, /sys thumbnails and title search, tabs).

**`docs/development/25 DONE Text-Editing-and-Translations-Plan.md`** (2026-10-24): translations as value rows with
the language code and *Insert translated value* (DeepL through the legacy `usr_info.php translate_string`,
`meta.translator`), blocktext `text · wysiwyg · codeeditor` (TinyMCE 8 / CodeMirror 6, one live editor,
`shared/src/widgets/rich-text/`), viewer blocktext HTML (`recordview/richTextHtml.js`), *Record editor* options in
the configuration, reverse group as closed accordion, `heurist/tests/StoredTextTest.php`. DONE, committed; round 2 browser check pending.

**`docs/development/26 DONE Virtual-Parent-Pointer-Plan.md`** (2026-10-24): DONE, committed; browser review pending. Snapshot format 8 adds structure `createChild`; HDbDefs parentLinks/isChildRectype; transient Parent record field and creation warning in HRecordEditor, context through RecordEditorHost, forward-only assignment via RecordEditClient; HFieldTree parent branches reuse incoming `lf` paths with linked-from off. Server RecordRepository.parentLinks derives parents through existing link reads; existing title aliases and Smarty fN/fNs use virtual values, affected child titles refresh on parent saves. 1,405 JS tests, 13 isolated PHP checks and all seven builds pass. Review fixes 2026-10-25 (§11): DT_PARENT_ENTITY constant instead of the concept code, `DefinitionLookup::childLinks/childFields`, faster parentLinks and child title refresh. Legacy schema edits retain the existing title-regeneration workflow. See plan for validation and compatibility boundaries.

**Reports in HRecordEditor (2026-11-05, both repos, not committed, not checked in a browser; note at the end of plan 12):** report and schedule
records in HRecordEditor, all writes through the common record workflow (entities `report`, `schedule`, `srv/Reports/ReportEntityHandler`), schedule query = 2-12 without parameters, language in the
schedules list and in the test run. `rst_EntryMask` is not supported in the new editor or srv (plan 21 §10). Artem: remove 3-1083 from 2-1105.

**Next tasks (Artem, 2026-10-22):** 1) plan 20 Phases 4-5 (tags, bookmarks, reminders; then saved filters, users,
groups); 2) files: file record structure, test of the file edit form and manager, players for external video and audio
services (thumbnail in Record View and editor, native player when expanded); 3) rich HTML and code editors for
blocktext (TinyMCE, CodeMirror).

**`docs/development/27 CMS-and-Web-Publishing-Plan.md`** (draft 3, 2026-10-26; plan 28 deferred, new phase 2 = Website manager `apps/website/` replacing PublicationService): general directions only, each
phase gets its own plan. Website format v4 (HTML = structure, styles and instance configuration apart, field 2-49 = 4,
not reachable from legacy UI), live and built publication, URL `/{db}/site/{site}/{page}`, PageController (sync) and
HFilter taken from the earlier publication plan (now replaced), legacy conversion in the designer. Depends on
**plan 28 "OpenAPI rules and Database structure"** §7 (`sysRecords`/`sysRecDetails` for system record types, `MEDIUMTEXT`
value + `dtl_Lang`), table conversion deferred 2026-10-26; its server side follows plan 27d. **Phase 1 plan: `27a DONE Website-Format-v4-Plan.md`** (implemented 2026-10-26, both repos, not committed, not yet checked by Artem): heurist `srv/Website/` + `WebsiteController` (`/{db}/site/{id}[/{page}]`, `/api/{db}/website/{id}/check|setup`), `StoredCss`, page translations 2-1202 (missing in reference db 2 - Artem creates it), legacy viewer refuses 2-49 >= 4; client `apps/website` (target port 5180: site runtime, tabs/accordions, `HMenu`), `direct.js` for map/timeline/graph/explorer with `page.css` split, `shared/src/site/cmsDocument.js` + shared fixtures `shared/test/fixtures/cms-v4` (also run by `tests/CmsFormatTest.php`). Test pages kept in osmak_mapping: site 207627, standalone 207628/207629. Phase 2 plan: **`27b DONE Website-Manager-Plan.md`** (implemented 2026-10-26, both repos, not committed, browser check
pending): Website manager `apps/website/src/direct.js` + `src/manager/` as Explorer tool `publish` (Websites),
`HostAdapter.publish` → `POST /api/{db}/website/publish` (server builds the standalone v4 page), PublicationService
removed, `srv/Website/WebsiteEditService`, job `website-build` (ZIP), endpoint `/website/{id}/validate` (was `check`),
`tests/WebsiteEditTest.php`. Open: owner group 1 of new CMS pages (§10). Review round 1 (2026-10-28, §11): Website
manager over the whole screen (not a pane module any more), opened from the Explorer options menu with *Publish this
view*. Item 10 (§11.3): publish form `ui/config/explorerPublication.js` (public filters only: saved filters of group 4 +
public query sources, by id), published Explorer without rails/QSE/lists/history (`core/publishedView.js`), shared
`widgets/filter/HFilter.js`; guests may GET `/sys` (heurist `api.php`; access rule gives them group-4 filters only).
All done, not committed, not checked in a browser; review rounds 2-3 (2026-10-29, §11.4-11.5) done, not committed.
**Phase 3 plan: `27c DONE CMS-Designer-Plan.md`** (DONE 2026-11-02, committed, checked by Artem; leftovers moved to
phase 4, §27): full-screen designer `apps/website/src/designer/` (`CmsDesigner`, `CmsPreview`,
`designerData`, `designerDialogs`) from the Website manager (*Open editor*) inside Explorer only; website tree (drag and
drop = `assign`, add page Title + Preset, delete with sub pages delete / move up, Styles saved at once), preview iframe
`?design=1` without reloads (draft into header/main/footer, mounted instances kept; outside the designer the page opens
`explorerViewer.html?mode=cms&site=&page=`), part tree + element picker + properties; draft per part, Save = PATCH of
changed fields + `rec_Modified` per record, undo/redo, 409 Reload/Overwrite; translations; shared
`shared/src/site/cmsEdit.js` (record document) and `shared/src/widgets/tree/HTree.js`; format: `styles.kinds` /
`styles.presets` / `data-h-style` / control `group` (JS + PHP + fixture), starter kinds and presets. Texts and
captions with translations in the shared popups `shared/src/widgets/translation/` (`HTextTranslationDialog`,
`HTranslationDialog`, also used by the record editor; translation service `POST /api/{db}/external/translate`).

**Phase 4a plan: `27e DONE Website-Templates-and-Content-Sources-Plan.md`** (draft 2, agreed 2026-11-04; phases 1-5 implemented
2026-11-04 in both repos, not committed, not checked in a browser, see §17):
static text; one field of a record in `data-h-text` (`data-h-field="207439.2-1"`, also `website.` / `page.`, snapshot in
the element); three widgets: Custom report (schedule output per language, schedule gets DT_LANGUAGE 2-967), Record cards
(manual ids or query + card template, hard limit 50), Media gallery; server generator by classes, HSlider and HMenu over
server-written elements, options in `h-site-config`. Server: `GET /records/{id}/{field}` and a language
option of the report renderer (both done). Templates: page Team, Website header. §28 (2026-11-07, not committed): Generated Report
falls back to another language, preview of the file, the Generated Reports panel of apps/reports in the form (bridge `createReportOutputsPanel`),
`display` full / cut (100 KB + Show more) / link. §29: cards grid in the designer, query as the special field with the Filter Builder, card template
picker, presentation List / Carousel / Slideshow, `<<` `>>` from 6 slides. **Next: browser check, localization texts.** Phase 4b (other helper widgets) later. 27c §28-§38 (designer cosmetics, grid,
media element `data-h-media`, strict custom CSS, IIIF, record manager kept per field) done 2026-11-03, partly committed.

**`docs/development/29 DONE Module-Configuration-and-Publish-Plan.md`** (draft 1, 2026-10-28): one agreed option table
per module (map, timeline, graph, data, recordview; columns incl. adv / configuration / website / publication / help),
HEditForm JSON forms that replace the hand-written configuration dialogs one by one (HEditForm gets `advanced`,
`modes`, `forced`, `termsSource: 'smartyTemplates'`), shared `ModuleConfigurationDialog` with Reset, common
configuration API (incl. `describeConfiguration` for AI agents, `publish({target})` without UI), test popup with
module and mode selectors, Publication section New page | Update the page (any standalone page of the module type,
since plan 27d a `/records` search by `WebsiteClient.pages`). `options.ui.language` for all modules; Data `nativeControls.sort` / `showOwner`.
Phase 1 agreed 2026-10-28. Phase 2 done 2026-10-28, not committed (§16): HEditForm rules (`req` optional/forbidden,
`modes`, `forced`, `simplified`, `keepHidden`, `emptyLabel`, `resolveTermsSources`), Timeline defaults/schema, new keys,
five form JSONs `apps/<m>/src/ui/config/<m>ConfigurationForm.json`, configuration entries `apps/<m>/src/configuration.js`
(allowed by the architecture test), `shared/src/ui/config/ModuleConfigurationDialog.js`, Explorer Options → *Test module
configuration*. Phase 2 committed. Phase 3 (§17) done: all five modules on the common form. The form opens in Explorer's
window (bridge `openConfiguration`), and Explorer publishes (Publish to section; page list by a `/records` search since 27d). Phases 3-4
committed (all modules on the common form, Explorer publishes; module language rule `moduleLanguage()`). Phase 5
(2026-10-28, §18, not committed): configuration API on all modules through shared base classes
`shared/src/host/HeuristModuleConfigurationApi.js` / `HeuristModulePublicApi.js` (get/set/patch/reset, validate,
describeConfiguration for AI agents, getState/setState, event `heurist-module-configuration-changed`); every module
has a `Heurist*ConfigurationApi` (`viewerMode: 'configuration'`); no `publish()` on modules (Explorer only).

Also still open: `06 Explorer-Authoring-Dock-and-Compact-Mode-Plan.md` (narrow-screen leftovers).
