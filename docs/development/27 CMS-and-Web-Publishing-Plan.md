# CMS and web publishing — general plan

**Status 2026-10-26: draft 2, general directions. No implementation.** Draft 1 (2026-10-25) was reviewed and
answered by Artem on 2026-10-26; this draft takes in his answers (§2), including the open points of draft 2
(decisions 11–15). Plan 27 only fixes the directions and the
order of work. Every phase in §9 gets its own plan before it is implemented.

This plan replaces `Explorer-Publication-and-Website-Development-Plan.md` (2026-09-22): its page synchronization
(PageController) and HFilter move here; separate publication of single modules is dropped (§7).

## 1. Request (Artem, 2026-10-25)

1. A new website format, version 4: HTML holds the page structure; styles and module/widget settings are kept
   apart from it and linked by ids. No second structure tree in JSON.
2. A website designer: structure tree, TinyMCE for text, CodeMirror for HTML/CSS/JSON, layout and style controls.
3. Templates and external styles (Bootstrap and others).
4. Helper widgets: filter, menus, system menu, badges, gallery, report content.
5. Page synchronization of modules and navigation between pages.
6. Publication: from one module, to Explorer, to a full multilingual website.
7. Conversion of legacy websites (v1, v2, v3).
8. An API that an AI agent can use to build and edit websites.

## 2. Decisions (Artem, 2026-10-26)

| # | Question (review of draft 1) | Decision |
|---|---|---|
| 1 | The stored text policy removes `<script>` blocks and `data-h-*` attributes on save | Keep code for named record types and fields, checked by `StoredText::allowsCode` (extend the list for v4 fields). |
| 2 | Page content is one value cut into 64 KB chunks and has no translation rows | New storage for **system records** in plan 28 (§3): large text and a language column. |
| 3 | Version field | Field **2-49** on the home record. v4 sets it to **4**; the legacy viewer (`websiteRecord.php`) must refuse it. v4 sites (in the new tables of plan 28) are not reachable from the legacy UI at all. |
| 4 | Live or built? | **Both.** The designer always works live. A site can also be built into static files. Old and new sites are not mixed, not even by URL. The designer offers to load a legacy website and convert it to v4. |
| 5 | Pages, menus and "routes" | Pages and menus stay records (§5). A **route** is an action: on selection in a module, or on a click on a record link in text, open a given page and pass the record as the search value (e.g. a Person link opens the Person page filtered by that person). |
| 6 | Fixtures | 7 exports in `D:/xampp/htdocs/heuirist_web/` (§8). They are samples of legacy formats and differ in details; ask Artem for more when needed. |
| 7 | Earlier publication plan | Included here: PageController (sync of modules on a page). Single publication services are dropped: module settings are stored in a website/webpage record and published by the normal website engine. |
| 8 | Instance names mix widget classes and module names | Separate widgets from modules (§4). |
| 9 | Writing style | Plain and short, like the other plans: request, decisions, file paths, phases. |
| 10 | Scope | Plan 27 is the general direction only. Each phase gets its own plan. |

### Open points of draft 2 (Artem, 2026-10-26)

| # | Question | Decision |
|---|---|---|
| 11 | Page configuration: own JSON field or `<script>` blocks in the HTML | **Separate fields** (configuration JSON and styles apart from the page HTML). |
| 12 | URL word for v4 | **`/site/`**: `/{database}/site/{site id}/{page id}`. |
| 13 | Menu pointers as child records (plan 26) | **No.** Pages stay ordinary pointed records. |
| 14 | Template baseline | **Plain HTML with CSS grid/flex** and theme values first. Bootstrap and other style libraries later. |
| 15 | First conversion test | Conversion is the **last** phase. First settle the format and build a good designer. |

### Answers of 2026-10-26 (second round)

| # | Question | Decision |
|---|---|---|
| 16 | Plan 28 | **Deferred.** v4 uses the current tables (test database first). Field 2-49 = 4 keeps v4 sites out of the legacy viewer. Note: `websiteRecord.php` checks `__getValue($rec, '2-49') == 3`, so it must become `>= 3` (phase 1). `$rec` there is the website or a standalone page, so both get 2-49. |
| 17 | Module configuration | An instance's configuration = the module's options + its bootstrap parameters (the bootstrap contract of `docs/configuration.md`). |
| 18 | New phase after phase 1 | **Website manager / publisher** `apps/website/`, like `apps/reports`, with HRecordManager for `RT_CMS_HOME` / `RT_CMS_PAGE` instead of the report preview (§7). Publishing a module or Explorer creates an `RT_CMS_PAGE`; `PublicationService.php` is removed. |
| 19 | When PageController | After *Templates, menus, languages, helper widgets*, when a page can hold several modules without Explorer (§9). |

### Answers of 2026-10-26 (third round)

| # | Question | Decision |
|---|---|---|
| 20 | Node styles | **In the styles JSON**; text formatting in the HTML (§4). |
| 21 | Publish workflow for a module / Explorer | **As proposed** (§7). Existing published JSON files are **dropped** (none in use); no conversion script. |
| 22 | Standalone page URL | `/{database}/site/{page id}` (§5). |
| 23 | *Generate* in phase 2 | **Yes**: a first build job in phase 2; phase 6 completes it. |

## 3. Storage of system records — plan 28 (deferred)

**Deferred 2026-10-26 (decision 16).** Kept here as input for later. Plan **28 "New Records/details structure"**
would define separate tables `sysRecords` / `sysRecDetails` for system data.

System record types (as opposed to user data): Map Document, Map Layer, Data source (including Query Source),
User, Group, Bookmark, Reminder, Report, Report Schedule, Export configuration, Crosstab configuration, Website,
Webpage, MenuAction (2-107).

Today `recDetails.dtl_Value` is `TEXT` (64 KB; with utf8mb4 that can be only ~16 000 characters), so long page
content is cut into chunks, and a translation is stored as an `xx:` prefix in the value
(`RecordValidator::isMultilang` excludes page content).

Answers to the storage questions, as input for plan 28:

| Option | Cost | Note |
|---|---|---|
| `dtl_Value` as `MEDIUMTEXT` (16 MB) | +1 byte per row (3-byte length instead of 2) | Simplest. InnoDB (row format DYNAMIC) already stores long values off the row page with a 20-byte pointer, so short values cost the same as now. The prefix index `dtl_Value(63)` and the FULLTEXT index work on `MEDIUMTEXT`. |
| Extra column `dtl_Text MEDIUMTEXT NULL` used by <10% of rows | Almost nothing when NULL (1 bit in the NULL bitmap) | Every reader must check two columns. It gives nothing over the option above, because InnoDB already moves long values out of the row. |
| Separate table for large values | A join or a second query for every read | Only worth it if large values must not be read with the normal details; not needed here. |
| `dtl_Lang` `CHAR(3) NULL` (NULL = default / no language) | 3 bytes per row with a value, ~nothing when NULL | Replaces the `xx:` prefix. A translated value of any length becomes a normal row; can be indexed with record and field. |

**Recommendation for plan 28:** `sysRecDetails.dtl_Value MEDIUMTEXT` plus `dtl_Lang CHAR(3) NULL`; no chunks and
no separate large-value table. Plan 15 helps: srv code reads tables only through `RecordRepository` /
`RecordStore` and the compiler's table keys (`{records}` ... resolved by `Compiler/SqlTables`), so system types can
point to the new tables in one place. Questions for plan 28: record ids unique across both tables (shared sequence
or separate ranges); pointers between user records and system records (`recLinks`, a page pointing to a user
record, a layer pointing to a data source); moving the existing system records.

Without plan 28 the phase 1 plan must still answer two things in the current tables: page HTML longer than one
`TEXT` value (check that srv reads and writes the chunks of `DT_EXTENDED_DESCRIPTION`), and translated page
content (the `xx:` rows of plan 25 do not apply to it).

## 4. Format v4

HTML holds the elements, their order and the static text. Two JSON resources hold the rest, linked by stable ids:

- **Styles:** theme values and element rules keyed by node id; optional custom CSS.
- **Configuration:** module and widget instances, their settings, sync groups, sources and route actions. A module
  instance holds the module's options and its bootstrap parameters (decision 17) — the same settings the module's
  `publish()` produces today, so each module reuses its own configuration dialog and schema.

### Styles: in the HTML or in JSON? (decision 20)

Two kinds of style, two places. Note on the CMS exception: `DT_EXTENDED_DESCRIPTION`, `DT_CMS_HEADER` and
`DT_CMS_FOOTER` of `RT_CMS_HOME` / `RT_CMS_PAGE` keep everything, inline styles included — **but only on
installations where `isJavaScriptAllowed()` is true**. Elsewhere these fields get the normal blocktext policy, and
inline node styles would be lost. Keeping node styles in JSON makes a site look the same on every server.

| Style | Where | Why |
|---|---|---|
| **Text formatting** inside a text block: font, size, colour on `span`, `text-align` on `p` / `div` / `h1`–`h6` | in the HTML, as TinyMCE writes it | It belongs to the text and moves with it. The server keeps exactly these styles (`Stored-text-security-policy.md`). |
| **Node styles** of a `data-h-node`: grid / flex, gap, width, padding, margin, background, border, show/hide per screen size | in the styles JSON, keyed by node id | Inline `style` on these elements is removed on save without the CMS exception; screen-size rules (media queries) and theme values cannot be inline; the designer edits one place. |
| Classes from a template (`class="h-card"`) | in the HTML | `class` is kept on save; the CSS is in the template. |
| Free CSS for advanced authors | `DT_CMS_CSS` | Kept only with the CMS code exception, as today. |

The renderer turns the styles JSON into one `<style>` block for the page, with selectors
`[data-h-node="intro"] { ... }` and `@media` rules for screen sizes. Example:

```json
{"tokens": {"accent": "#345d77"},
 "nodes": {"main":  {"display": "grid", "gap": "1rem", "gridTemplateColumns": "1fr 2fr"},
           "intro": {"padding": "1rem", "background": "var(--accent)",
                     "narrow": {"gridColumn": "1 / -1"}}}}
```

The styles JSON is not checked as CSS by `StoredText` (it only cleans HTML inside JSON strings). The renderer must
therefore write only known properties with checked values (no `url(` except media files, no `expression(`, no
`</style>`), the same way HTMLPurifier checks the span styles.

Instance names (decision 8): every instance has `kind` and `type`, both lowercase.

| kind | types |
|---|---|
| `module` | `explorer`, `data`, `map`, `timeline`, `graph`, `recordview` (the apps in `apps/`) |
| `widget` | `filter`, `menu`, `sysmenu`, `badges`, `gallery`, `report` (shared widgets, not apps) |

Example (illustrative; field names will be fixed in the phase 1 plan):

```html
<main data-h-node="main">
  <section data-h-node="intro"><h1>Collections</h1><p>Explore the collections.</p></section>
  <nav data-h-node="sources" data-h-instance="filter-1"></nav>
  <div data-h-node="map" data-h-instance="map-1"><p>The map needs JavaScript.</p></div>
</main>
```

```json
{
  "schema": "heurist-cms/4",
  "instances": {
    "filter-1": {"kind": "widget", "type": "filter", "configVersion": 1,
                 "settings": {"entries": ["all"], "group": "g1"}},
    "map-1":    {"kind": "module", "type": "map", "configVersion": 1,
                 "settings": {}, "state": {}, "sync": {"group": "g1", "source": true, "selection": true}}
  },
  "sources": {"all": {"label": "All collections", "query": "..."}},
  "groups":  {"g1": {"initialSource": "all"}}
}
```

Rules:

- HTML is the only structure. The designer's structure tree is read from the HTML.
- The configuration and the styles are stored in **separate fields** (decision 11), not in `<script>` blocks
  inside the HTML. JSON fields keep their structure under `StoredText` without the code exception, so the site
  works even where `isJavaScriptAllowed()` is false. `<script type="application/json">` blocks are used only in
  an exported single HTML file. The `data-h-node` / `data-h-instance` attributes must be added to the blocktext
  allowlist for the CMS fields (today all `data-*` except three are removed, see `Stored-text-security-policy.md`).
- Ids survive text edits and moves. Copying a part of a page gives new ids.
- A broken configuration shows a message for that instance; the HTML still shows.
- On save: duplicate ids, a host without configuration, configuration without a host, unknown types — reported,
  not guessed.
- Unknown HTML and unsupported legacy widgets are kept as they are, with a visible placeholder.

## 5. Website model

The existing records stay the base (constants in `hserv/consts.php`):

| Record / field | Use in v4 |
|---|---|
| `RT_CMS_HOME` (99-51) | the website: name, 2-49 = 4, `DT_LANGUAGE` (2-967) site languages, `DT_CMS_HEADER` / `DT_CMS_FOOTER`, `DT_CMS_CSS`, `DT_CMS_EXTFILES`, template |
| `RT_CMS_PAGE` (99-52) | a page or a menu entry; `DT_EXTENDED_DESCRIPTION` = page HTML; `DT_CMS_PAGETYPE` menu or standalone |
| `DT_CMS_TOP_MENU` (99-742), `DT_CMS_MENU` (99-761) | the menu tree: home → pages → sub pages |
| new field (phase 1 plan) | page configuration JSON (§4) and page styles |

The menu pointers do **not** make pages child records of the website (decision 13).

URLs (decisions 4, 12). Legacy: `/{database}/web/{site id}/{page id}` and the parameter form `?db=..&website&id=..`,
handled by `hserv/controller/RequestRouter.php` and `websiteRecord.php`. v4:
`/{database}/site/{site id}/{page id}`, the same shape with another word, served by srv (live) or from the
built files when the site is published as static. The legacy `/web/` path is never used for v4 sites.
A standalone page (published module or Explorer, §7) is `/{database}/site/{page id}` (decision 22); the server
sees from the record type whether the id is a website or a page.

## 6. Page runtime and widgets

- **Instance mounting** (phase 1): finds the hosts in the HTML and starts each module or widget with its
  configuration. Instances are independent; one module or Explorer (which has its own `SyncEngine`) needs nothing
  more.
- **PageController** (from the earlier plan, phase 5): synchronization of modules on one page. Shared code, built from
  the reusable parts of Explorer's `SyncEngine`. Modules are independent unless they are in the same sync group;
  a group has one initial source; late modules get the current state; Explorer is joined through one bridge, not
  module by module. Legacy `search_realm` becomes a sync group on conversion.
- **Navigation** (routes, decision 5) is not PageController's job. Proposed name `HSiteNavigator`: opens a page,
  passes a record or a query as the search value, keeps the browser history and language.
- Widgets (§4 `kind: widget`): `filter` (curated query sources / saved filters with their forms — the HFilter of
  the earlier plan), `menu`, `sysmenu` (language switch, login, add record), `badges` (logo sets), `gallery`
  (fixed or query-based media), `report` (static report output or a live Smarty report).

Proposed places: `shared/src/site/` (format, validation, PageController, navigator, instance mounting),
`shared/src/widgets/site/` (the widgets), `apps/website/` (manager and designer, lazy like `apps/reports`), server
`srv/Website/` (read, validate, live render, build). To be fixed in the phase plans.

## 7. Publication

### Website manager — `apps/website/` (phase 2, decision 18)

Built like `apps/reports` (lazy chunk, Explorer pane tool, `direct.js` entry). In place of the report preview:
HRecordManager for `RT_CMS_HOME` and `RT_CMS_PAGE` records. Actions per record, besides the standard Edit and View:

| Action | Record | Does |
|---|---|---|
| Open editor | website, page | opens the CMS designer (phase 3; until then the record editor + the page in a new tab) |
| Open site | website, page | the live URL (§5) |
| Generate | website, page | the build job (§7 *Built*) with the job monitor of reports (`HJobMonitor`) |
| New website | — | a website record with one empty page, 2-49 = 4 |

### Publishing a module or Explorer (decision 21)

Today each module's *Publish* saves a JSON file through `srv/Publication/PublicationService.php` and
`srv/Controller/PublicationController.php`. New workflow:

1. *Publish* in a module (or Explorer) opens the module's configuration dialog in publish mode, as today.
2. On save the client writes an `RT_CMS_PAGE` through the srv record API (`POST /records`): page type standalone,
   page HTML = one host `<div data-h-node="main" data-h-instance="map-1"></div>`, configuration field = that
   instance (module options + bootstrap parameters), 2-49 = 4 (a standalone page is opened directly, so it
   needs the version field too).
3. The module keeps the page id in its state. The next *Publish* updates the same page (PATCH); *Publish as new*
   creates another.
4. The dialog shows the page URL `/{database}/site/{page id}` and an embed snippet, as the published-link dialog does now.
5. In the Website manager the page can be opened in the designer, or added to a website menu.

Then `PublicationService.php`, `PublicationController.php` and their routes are removed, and the `publish` bridge
calls in the modules' host adapters write the page instead (both repos). Existing published JSON files are dropped,
none are in use (decision 21).

### Live and built
- **Live:** srv renders a page from its records on every visit (like `websiteRecord.php` today, but in srv).
- **Built:** a job (`srv/Jobs`, like report and export jobs) writes HTML, CSS and assets into a folder for that
  site. Interactive modules still call the Heurist API; a built site is not an offline copy. A failed build keeps
  the previous one.
- What the visitor sees is checked with the visitor's rights. No author session or token goes into the output.

`hserv/web/WebSite.php` (legacy builder into `generated-html`) is read for ideas only; srv does not use it.

## 8. Legacy conversion

Samples in `D:/xampp/htdocs/heuirist_web/` (plus `MapOfTheAbsentees.html`):

| Export | Hosts `data-heurist-app-id` | Notes from draft 1 |
|---|---|---|
| `Export_MapOfTheAbsentees_...xml` | 2 | v1: HTML with a map host, multilingual |
| `Export_Ergaleion_...xml` | 4 | v2 JSON tree with HTML strings and CSS |
| `Export_judaism_and_rome_...xml` | 1 | v2, object and array trees, `search_realm`, gallery |
| `Export_GrandFichier_RB_...xml` | 0 | v2, external Bootstrap / font stylesheets |
| `Export_parramatta_food_cultures_...xml` | 0 | v3 |
| `Export_CAIRMOD_...xml` | 0 | not yet looked at |
| `Export_WSU_China_Australia_Heritage_Corridor_...xml` | 0 | not yet looked at |

Conversion is started by the author in the designer (decision 4). It reads the legacy site, writes a **new** v4
site and a report per page and widget: converted / kept as it is / needs manual work. The legacy site is not
changed. One converter per legacy widget type.

## 9. Phases — each gets its own plan

| Phase | Content | Depends on |
|---|---|---|
| 1 | Format v4: fields, styles JSON, validation, StoredText rules, live render in `srv/Website/` with instance mounting, URL `/site/`, field 2-49 = 4 | test database |
| 2 | Website manager / publisher `apps/website/`: HRecordManager actions, publish module / Explorer as `RT_CMS_PAGE`, remove `PublicationService`; a first *Generate* job (the live renderer writing files, decision 23) | 1 |
| 3 | Designer first version: structure tree, TinyMCE, CodeMirror, layout and styles | 1, 2 |
| 4 | Templates, menus, languages, helper widgets without sync (`menu`, `sysmenu`, `badges`, `gallery`, `report`) | 3 |
| 5 | Several modules on a page: PageController, sync groups, `filter` widget, routes (navigator) | 4 |
| 6 | Built publication completed (assets, dependencies, keeping the previous build) | 2 |
| 7 | API for an AI agent (the same services as the designer, with revision checks) | 3 |
| 8 | Legacy conversion in the designer — **last** (decision 15) | 3, 4 |
| 28 | New record storage for system records (§3) — deferred (decision 16) | — |

PageController timing (decision 19): correct, with two notes. (a) The `filter` widget and routes also need it — a
filter drives modules through a sync group, and a route hands a record to the target page's group — so they are in
the same phase 5. (b) Phase 1 still needs simple instance mounting (§6), because a published module or Explorer
page must run before PageController exists.

Templates in phase 4 start with plain HTML, CSS grid/flex and theme values; Bootstrap and other style libraries
come later (decision 14).

## 10. Open points

None (all answered 2026-10-26, decisions 1–23). Phase plans are named `27a`, `27b`, ...: phase 1 =
`27a Website-Format-v4-Plan.md` (implemented 2026-10-26), phase 2 = `27b Website-Manager-Plan.md` (draft 2026-10-26).
