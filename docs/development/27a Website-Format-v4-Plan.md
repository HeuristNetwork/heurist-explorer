# Plan 27a — Website format v4 and live pages (plan 27, phase 1)

**Status 2026-10-26: implemented (both repos), not committed.** Checked with tests and a headless Edge; not yet
checked in a browser by Artem. Field 2-1202 must still be created in the reference database 2 (§10). General directions and decisions 1–23 are in
`27 CMS-and-Web-Publishing-Plan.md`; this plan uses them and does not repeat them.

## 1. Goal

A v4 website or a standalone page, stored in the current CMS records, opens live at
`/{database}/site/{site id}/{page id}` or `/{database}/site/{page id}`. It shows its HTML, its node styles and its
modules (mounted directly), tabs, accordions and a simple menu. The legacy viewer refuses it. No designer,
manager or synchronization yet: test sites are made by a script or by hand in the record editor.

## 2. What exists today (checked 2026-10-26)

| Item | Fact | Consequence |
|---|---|---|
| `RT_CMS_HOME` (99-51), `RT_CMS_PAGE` (99-52) | Local ids 51 / 52 in `osmak_mapping`. Home has title, logo, languages 2-967, menu pointers 99-742, header 2-929, footer 2-940, CSS 99-946, JS 2-927, ext. files 2-939, home content 2-4 (max 1). Page has name, page type 2-928, submenus 99-761, content 2-4, CSS 99-946, JS 2-927. | v4 reuses these fields. |
| Version 2-49 | Field exists ("Version Number", freetext) but is **not in the structure** of 99-51 / 99-52. | Phase 1 adds it to both structures. |
| `DT_CONFIGURATION` 2-1187 | Exists (blocktext JSON, plan 20, used by Files). | Reused for the page configuration; no new field (§4). |
| Long page content | srv splits `RT_CMS_PAGE` 2-4 into several values on save (`RecordValidator`) and joins them on read (`RecordDataService`). Home 2-4 is **not** split. | Pages: no limit problem. Home content: keep it short (or move home content to a page, §4). |
| Legacy version check | `websiteRecord.php`: `if(__getValue($rec, '2-49')==3)` on the website or standalone page record. | Change to `>= 3`. |
| Legacy URL | `hserv/controller/RequestRouter.php`: `/{db}/web/...` and `/{db}/{site}/{page}`; `site` is free. | Add the action `site`, handled by srv. |
| Published page today | `PublicationController::showPublication` writes a small HTML page that loads one module bundle with `window.heuristModuleBootstrap = {runtime, settings, state}`. | The same envelope is the module configuration in v4 (decision 17); the same page is the module frame (§5). |
| Module entry points | Data, Record View, Reports have `direct.js` (`mount…({container, bootstrap})`); Map, Timeline, Graph, Explorer start from a global bootstrap. | Phase 1 adds `direct.js` to the other four (§5). |
| StoredText blocktext | Keeps `id`, `class`, `lang`, `data-heurist-*`; **removes** other `data-*` and the HTML5 elements `section`, `article`, `aside`, `nav`, `header`, `footer`, `main` (tags dropped, text kept). | Phase 1 adds them (§6). |

## 3. Request and decisions (Artem, 2026-10-26)

Go to phase 1 of plan 27: the v4 format.

| # | Question | Decision |
|---|---|---|
| 1 | One JSON field or two | **One field**, 2-1187 `DT_CONFIGURATION`, with `instances` and `styles`. |
| 2 | Iframes or direct mounting | **Direct mounting** (§5). Iframe stays possible per instance as an option. |
| 3 | Menu in phase 1 | **The simplest HMenu** widget now; phase 4 extends it. |
| 4 | Translations | **To discuss** — see §4 *Languages* (new proposal). |
| 5 | Screen sizes | `narrow` ≤ 640 px, `medium` ≤ 1024 px. |
| 6 | New elements and attributes | Allowed in **all** blocktext fields. |
| L1 | Layout controls | Besides grid / flex: **tabs and accordions**, reusing the code of HEditForm (§4 *Layout controls*). |
| L2 | Styles in the editor | Most node styles are hidden behind *More*; the author normally sets **base settings** per website / page: font size, font family, colours, border radius (§4). |
| 7 | Translations (2026-10-26, second round) | **Way c**: one layout, translated text blocks in *Page translations* (§4 *Languages*). Concept code **2-1202** (`DT_CMS_PAGE_TRANSLATIONS`). |
| 8 | Tab labels | The **first heading** of each panel. |
| 9 | Base settings | The list is to discuss (§4 *Base settings, classes and module styles*). |
| 10 | CSS classes | As in legacy, the author can give a node class names and define them in the custom CSS (99-946); no full CSS editor. |
| 11 | Base settings (2026-10-26, third round) | The 11 values of §4, mapped to the existing `--h-*` variables. |
| 12 | Custom CSS | 99-946 is kept **without** the JavaScript permission, checked by a CSS sanitizer. JavaScript (2-927) keeps the code exception. |
| 13 | Module styling | Base settings + host node + module options only; inner classes are not edited in the designer and are not a stable interface. |
| 14 | Concept code | *Page translations* = **2-1202**. |

**Why not iframes (answer to question 2).** An iframe isolates the module: its CSS and globals cannot clash with
the site's CSS and custom scripts, and no module app needs changes. Against it: every iframe loads its own copy of
the bundle and libraries (slower, more memory); its height must be set from outside; modules in different frames
need a message bridge to synchronize (phase 5); printing, scrolling and focus are worse. With iframes, yes, a single
published module or Explorer would also be an iframe inside the site page — a wasted layer. So direct mounting.

## 4. Format

### Records and fields

| Record | Field | v4 content |
|---|---|---|
| website `RT_CMS_HOME` | 2-49 | `4` |
| | 2-929 header, 2-940 footer | v4 HTML (same rules as page HTML) |
| | 2-4 home content | v4 HTML of the home page |
| | 2-1187 `DT_CONFIGURATION` | site JSON: instances in header / footer / home content, base settings, site node styles |
| | 2-967, 2-1, logo, 99-742 | as today |
| | 99-946 CSS, 2-927 JS, 2-939 ext. files | as today, only with the CMS code exception |
| page `RT_CMS_PAGE` | 2-49 | `4` (needed on a standalone page; on site pages too, so a page is never opened by the legacy viewer) |
| | 2-4 | v4 HTML of the page |
| | 2-1187 | page JSON: instances and node styles of this page |
| | 2-928 page type | menu page or standalone page, as today |

Configuration and node styles are in **one JSON field** (2-1187) with two parts, `instances` and `styles`
(decision 1). That keeps them apart from the HTML (plan 27 decision 11) without a new concept code.

### Page HTML

```html
<section data-h-node="n1"><h1>Collections</h1><p>Explore the collections.</p></section>
<div data-h-node="n2" data-h-instance="i1"></div>
```

- `data-h-node` marks an element the designer and the styles know. Not every element needs one — only containers
  and hosts.
- `data-h-instance` marks a host: its content is replaced by the module or widget. Text inside a host is the
  fallback shown without JavaScript.
- Ids: short random strings (`n` / `i` + 6 characters), unique in the rendered page (header + content + footer).
  The validator reports duplicates.
- No inline node styles (decision 20). Text formatting from TinyMCE stays inline.

### Configuration JSON (2-1187)

```json
{
  "schema": "heurist-cms/4",
  "instances": {
    "i1": {"kind": "module", "type": "map", "configVersion": 1,
           "settings": {"format": "heurist-map-settings", "version": 1, "options": {}, "config": {}},
           "state": {}}
  },
  "styles": {
    "base": {"font-family": "Arial, sans-serif", "site-font-size": "15px", "color-text": "#222",
             "color-bg": "#fff", "color-primary": "#345d77", "radius": "4px"},
    "nodes": {
      "n1": {"padding": "1rem", "background-color": "var(--h-color-primary)"},
      "n2": {"height": "600px", "narrow": {"height": "400px"}}
    }
  }
}
```

- `instances`: `kind` + `type` (decision 8). For a module, `settings` and `state` are the bootstrap envelope that
  `publish()` makes today (decision 17); the server adds `runtime` (database, base URL, `runtimeMode: 'published'`,
  language) when it renders. Optional `"mount": "iframe"` puts one instance in an iframe (decision 2). Phase 1
  knows `kind: module` and one widget, `menu` (§4 *Menu*); other widgets come in phase 4.
- `styles.base` (decision L2): the **base settings** an average author sets (list below); a key is the CSS
  variable name without `--h-`. Website values apply to all pages; a page may override any of them.
- `styles.nodes`: CSS property names as in CSS (kebab case). Screen-size overrides in `narrow` (≤ 640 px) and
  `medium` (≤ 1024 px). In the designer (phase 3) these are hidden behind *More* on a node.
- Phase 5 adds `sources`, `groups` and route actions; unknown top-level keys are kept, not removed.

Allowed style properties (phase 1; the designer of phase 3 uses the same list):

| Group | Properties |
|---|---|
| Layout | `display` (block, flex, grid, none), `flex-direction`, `flex-wrap`, `justify-content`, `align-items`, `gap`, `grid-template-columns`, `grid-template-rows`, `grid-column`, `grid-row`, `order` |
| Size | `width`, `min-width`, `max-width`, `height`, `min-height`, `max-height`, `overflow` |
| Box | `margin*`, `padding*`, `border*`, `border-radius`, `box-shadow` |
| Colour, text | `color`, `background-color`, `background-image` (only Heurist file URLs), `font-family`, `font-size`, `font-weight`, `line-height`, `text-align` |

Values: numbers with units, keywords, colours, `var(--h-…)`, `repeat(…)` / `minmax(…)` / `fr` for grids. Not
allowed: other `url(…)`, `expression(…)`, `\`, `<`, `;`, `{`, `}`. A bad value is dropped with a warning.

### Languages

To discuss (decision 4). The two simple ways both have problems:

| Way | Problem |
|---|---|
| a) all languages in one HTML (`<p lang="fre">`) | the value grows with every language; hard to edit; the number of languages is limited in practice |
| b) one full HTML per language | the layout (`data-h-node`, hosts) must be kept the same in every copy; it drifts |

**Decided (7): c) one layout, translated texts apart.**

- The page HTML (2-4) holds the layout **and the texts in the site's first language** — as now.
- A text block is a node marked `data-h-text`: `<div data-h-node="n1" data-h-text>…TinyMCE HTML…</div>`. Only the
  inner HTML of text blocks is translated; layout, hosts and module configuration are shared by all languages.
- A translation is one JSON value per language: `{"n1": "<h1>Collections</h1><p>Explorez…</p>", "n4": "…"}`,
  stored as `xx:` rows (plan 25 form, `fre:{…}`). HTML inside the JSON strings is cleaned by StoredText as now.
- Where: a new repeatable blocktext field *Page translations* **2-1202** on 99-51 / 99-52, split into
  chunks per language like page content (srv `RecordValidator` / `RecordDataService` change: split and join per
  language prefix). Plan 28 can later turn these into `dtl_Lang` rows.
- The renderer replaces the inner HTML of each text block with the translation; if a block has no translation,
  the first-language text shows. The validator reports translations of deleted blocks and blocks not yet translated.
- The designer (phase 3) has a language switch: in another language the layout is locked and only text blocks are
  editable; a list shows what is missing per language.
- Menu labels and page titles use the normal `xx:` rows of 2-1 (plan 25). Module texts follow `runtime.language`.

Cost: each language adds only its texts, not the layout; any number of languages; layout changes are made once.

**Generated site (phase 2):** yes — the build writes one copy per language, `…/{lang}/{page}.html`, with
`hreflang` links between them and the root opening the first language. Live pages use `?lang=xxx` (legacy
parameter), else the first site language.

### Base settings, classes and module styles (decisions 11–13)

Three levels, from easy to expert. The designer offers 1 and 2; level 3 is for experienced authors.

**1. Base settings** (`styles.base`). The modules already draw everything from the CSS variables of
`shared/src/ui/heurist-ui.css` (`--h-font-family`, `--h-color-primary`, `--h-radius`, ...). So most base settings
**are** these variables: the renderer writes them on the page root, and text, menus, tabs **and the modules**
take the site's look at once, with no module change.

| Base setting | CSS variable | Used by |
|---|---|---|
| Font | `--h-font-family` | site text and modules |
| Text colour | `--h-color-text` | site text and modules |
| Background | `--h-color-bg` | page and modules |
| Panel background | `--h-color-surface` | menus, tabs, cards, module toolbars |
| Main colour | `--h-color-primary` (+ `-hover`, `-text` derived) | buttons, active menu item / tab, module buttons |
| Link colour | `--h-color-link` | links |
| Border colour | `--h-color-border` | borders, tables, modules |
| Corner radius | `--h-radius` | buttons, panels, modules |
| Text size | `--h-site-font-size` (new, site only) | site text; **not** `--h-font-size`, which is the compact module UI size (12) |
| Heading font / colour | `--h-site-heading-font`, `--h-site-heading-color` (new) | `h1`–`h6` |
| Content width | `--h-site-width` (new) | the main column |

**2. Classes** (decision 10). Each node has a *Class* input in the designer: free class names, with suggestions
from the template and from the custom CSS. `class` is already kept by StoredText. The classes are defined in the
custom CSS (99-946 on the website or page), as in legacy. No full CSS editor — CodeMirror for the custom CSS.

Note: today 99-946 is **cleared** on save unless the installation allows JavaScript (`StoredText`, code
exception). **Decided (12):** treat CSS apart from JavaScript — keep 99-946 always, but checked by a CSS sanitizer
(no `expression(`, no `javascript:` / `data:` URLs except images, no `@import` of other sites, no `</style>`).
CSS can't run code, so it does not need the JavaScript permission.

**3. Modules.** The designer does **not** edit a module's inner classes. A module gets:

- the base settings (level 1) — its colours, font and radius follow the site;
- its host node — size, border, padding, class (level 2), like any node;
- its own options in its configuration dialog (as today).

Experienced authors can still write custom CSS such as `[data-h-instance="i1"] .h-...`. Inner class names are
**not** a stable interface and may change between Heurist versions; a short list of stable per-module CSS variables
can be published later if authors need it.

### Layout controls (decision L1)

Besides grid / flex containers, two controls, stored as plain HTML that reads well without JavaScript:

```html
<div data-h-node="n5" data-h-control="tabs">
  <section data-h-node="n6"><h3>Overview</h3>…</section>
  <section data-h-node="n7"><h3>Sources</h3>…</section>
</div>
<details data-h-node="n8"><summary>More information</summary>…</details>
```

- **Tabs:** each child is a panel; its first heading is the tab label (so it is translated like any text). The
  runtime builds the tab strip; without JavaScript the panels show one after another.
- **Accordion:** native `<details>` / `<summary>` (works without JavaScript); `open` = initial state. A group of
  them with `data-h-control="accordion"` on the parent opens one at a time.
- Code: the tab strip and the accordion of HEditForm (`_renderTabs`, `_accordion` in
  `shared/src/widgets/edit-form/HEditForm.js`) move into small shared helpers in `shared/src/widgets/layout/`
  (`tabs.js`, `accordion.js`) used by both HEditForm and the site runtime. Same CSS classes, styled through the
  base settings.
- A module in a hidden panel is told to resize when its panel is shown (`resize` on the module API).

### Menu (decision 3)

The simplest **HMenu** widget (`kind: widget`, `type: menu`) in phase 1: a horizontal list of the website's top
pages (99-742) with one level of sub pages (99-761) as drop-downs, current page marked, narrow screen → a menu
button. Placed by the author as a host in the header HTML. Phase 4 adds vertical / collapsible forms, icons, the
legacy menu options (2-1104, 2-1149) and keyboard handling.

## 5. Live render (srv)

`GET /{database}/site/{id}[/{page id}][?lang=xxx]`, routed by `RequestRouter` (action `site`) to
`srv/Controller/WebsiteController.php`:

1. Read the record `{id}` through `RecordRepository` / `RecordDataService` with the visitor's rights. A website
   (99-51) shows its home content or `{page id}`; a page (99-52) shows itself as a standalone page. 2-49 must be 4,
   otherwise 404 with "not a v4 website".
2. Validate (§7). Errors in one instance show a message in its host; the rest renders.
3. Build the HTML document:
   - `<head>`: title, meta keywords, `heurist-ui.css`, the compiled `<style>` (base settings + site node styles + page
     node styles), the CMS CSS / ext. files only with the code exception.
   - `<body>`: header (website only), page content, footer.
   - Texts of the current language (§4 *Languages*).
   - Hosts keep their fallback text; their configuration goes into one
     `<script type="application/json" id="h-site-config">` block (written by the server, escaped, not stored).
   - The site runtime script (`apps/website`, §6).
4. `Cache-Control: no-cache` for now (built files in phase 2).

**Direct mounting (decision 2).** The site runtime reads `h-site-config`, and for each host loads the module's
direct entry as a lazy chunk and calls `mount({container, bootstrap, assetBaseUrl})` — the way Explorer already
mounts Data and Reports. Only the modules used on the page are loaded. Then it builds tabs / accordions and
mounts the menu.

- Map, Timeline, Graph and Explorer get a `src/direct.js` like `apps/data/src/direct.js`: no global bootstrap,
  no `window.heurist…` global (`exposeGlobal = false`), unique container ids, so two instances of one module can
  share a page.
- The architecture rule "an app never imports another app; Explorer may import a direct entry" is extended:
  **`apps/website` may import the direct entries too** (update `test/architecture`).
- Module CSS is loaded once per module type. A module's `style.css` must not style `html` / `body` when mounted
  directly — to check per module.
- `"mount": "iframe"` on an instance: `GET /{database}/site/{id}/frame/{instance id}` returns the page that
  `showPublication` writes today. Kept as a way out for a module that clashes with custom site scripts.
- A single published module or Explorer is one host on a page: mounted directly, no extra layer.

The renderer never puts the author's session into the page; modules call the API with the visitor's session.

## 6. Changes by file

### heurist repository

| File | Change |
|---|---|
| `srv/Website/_README.md` | new folder description |
| `srv/Website/CmsDocument.php` | reads a v4 record set: HTML fields + parsed 2-1187 JSON; site + page; menu tree (99-742 / 99-761) |
| `srv/Website/CmsValidator.php` | §7 checks; used by the renderer and on save |
| `srv/Website/StyleCompiler.php` | styles JSON → CSS, with the property and value rules of §4 |
| `srv/Website/PageRenderer.php` | §5 document, texts of the current language, `h-site-config` block, iframe frames |
| `srv/Website/WebsiteSetup.php` | adds 2-49, 2-1187 and *Page translations* to the structures of 99-51 / 99-52 if missing (like `POST /reports/setup`) |
| `srv/Records/Edit/RecordValidator.php`, `srv/Records/Data/RecordDataService.php` | *Page translations*: split / join chunks per `xx:` language |
| `srv/Controller/WebsiteController.php` | page, frame, `POST /api/{db}/website/setup` |
| `srv/Runtime/ServiceFactory.php` | wiring, codes (`DT_CONFIGURATION`, `DT_CMS_HEADER` … ) through `DefinitionLookup` |
| `srv/Records/Edit/RecordSaveService.php` | for 99-51 / 99-52 with 2-49 = 4: run `CmsValidator`; JSON errors block the save, other problems are warnings |
| `srv/Utilities/StoredText.php` | all blocktext (decision 6): attributes `data-h-node`, `data-h-instance`, `data-h-text`, `data-h-control`; elements `section`, `article`, `aside`, `nav`, `header`, `footer`, `main`, `details` (`open`), `summary` |
| `srv/Utilities/StoredCss.php` (new) | CSS sanitizer for 99-946 (decision 12); `StoredText` uses it for that field instead of clearing it; same checks for `styles.nodes` values |
| `hserv/consts.php`, `srv/Definitions/DefinitionSnapshotService.php` | `DT_CMS_PAGE_TRANSLATIONS` = 2-1202; `DT_CONFIGURATION`, `DT_CMS_CSS` in the snapshot |
| `hserv/controller/RequestRouter.php`, `FrontController.php` | action `site` → `WebsiteController` |
| `hclient/widgets/cms/websiteRecord.php` | version check `>= 3`; the legacy CMS editors refuse v4 records too |
| `tests/CmsFormatTest.php` | validator and style compiler (no database) |
| `tests/WebsiteRenderTest.php` | creates a v4 site with two pages and a standalone map page in `osmak_mapping`, renders, deletes |
| `tests/StoredTextTest.php` | the new attributes and elements |

### this repository

| File | Change |
|---|---|
| `apps/website/` | new build target (`npm run build:website`, dev port 5180). Phase 1: the public runtime `src/site.js` (mount modules directly, tabs, accordions, HMenu). Phase 2 adds the manager here. |
| `apps/map/src/direct.js`, `apps/timeline/src/direct.js`, `apps/graph/src/direct.js`, `apps/explorer/src/direct.js` | direct mount entries (§5) |
| `shared/src/widgets/layout/tabs.js`, `accordion.js` | moved out of HEditForm; HEditForm uses them |
| `shared/src/widgets/site/HMenu.js` (+ `.css`) | the simplest menu (§4 *Menu*) |
| `test/architecture` | `apps/website` may import direct entries |
| `shared/src/site/cmsDocument.js` | the same checks as `CmsValidator` in JS, for the designer and the manager later |
| `shared/test/cmsDocument.test.js` | runs the shared cases |
| `shared/test/fixtures/cms-v4/*.json` | test cases used by **both** PHP and JS tests, so the two validators stay the same |
| `docs/configuration.md`, `docs/integration.md`, `package.json`, deploy script | the new target |
| `Stored-text-security-policy.md` | the new attributes and elements |

## 7. Validation

| Check | Result |
|---|---|
| 2-1187 is not valid JSON, or `schema` is not `heurist-cms/4` | error (save blocked) |
| duplicate `data-h-node` or `data-h-instance` id in the rendered page | warning; the second one is ignored |
| host without configuration / configuration without host | warning; host shows "not configured" / config kept |
| unknown `kind` / `type`, or `configVersion` newer than known | warning; host shows a placeholder, config kept |
| bad style property or value | warning; that value is not written |

Nothing is guessed or removed from the stored record by the validator.

## 8. Tests and acceptance

- PHP: `CmsFormatTest`, `WebsiteRenderTest`, `StoredTextTest`, `DataAccessBoundaryTest` (srv/Website reads only
  through the repository classes).
- JS: `shared/test/cmsDocument.test.js`, the shared suite, build of all targets.
- Browser: the test site in `osmak_mapping` — home with header/footer, two pages, a page with a map module, a
  standalone Data page, `?lang=fre`; the legacy URL `/{db}/web/{id}` refuses the v4 site.

## 9. Questions

None: all answered 2026-10-26 (§3, decisions 1–14).

## 10. As implemented (2026-10-26)

**heurist repository**

- `srv/Website/`: `WebsiteRepository` (codes by concept code, records with the visitor's rights, menu tree),
  `WebsiteService` (what a URL shows, language, problems; `WebsiteException` with the HTTP status), `PageRenderer`
  (document, `#h-site-config`, instance frame), `CmsHtml` (nodes, translated text blocks), `CmsValidator` (§7),
  `StyleCompiler`, `SiteUrls` (pretty or parameter form, as the request), `CmsRecordCheck` (save check),
  `WebsiteSetup` + `WebsiteDefinitionsInterface`; `_README.md`.
- `srv/Controller/WebsiteController.php`: pages and frames; `GET /api/{db}/website/{id}/check`, `POST /api/{db}/website/setup`.
- `srv/Utilities/StoredCss.php` (new); `StoredText`: HTML5 sections, `details`/`summary`, `data-h-*`; CSS field through `StoredCss`.
- `RecordValidator`: `addRecordCheck()` (so `Records` does not depend on `Website`); page translations
  (`xx:{json}`, "fr:" saved as "fre:", cleaned as JSON, split into rows per language); `RecordDataService` joins them.
- `LanguageCodes::code2()`; `ServiceFactory::websiteController()`; `hserv/consts.php` `DT_CMS_PAGE_TRANSLATIONS`.
- Routing: `RequestRouter` action `site` (`/{db}/site/{id}[/{page}][/frame/{instance}]`), `index.php` and
  `FrontController` (parameter `site`), `api.php` resource `website`.
- `hserv/web/WebsiteDefinitions.php`: imports missing fields from database 2, adds them (optional) to 99-51 / 99-52.
- `hclient/widgets/cms/websiteRecord.php`: version ≥ 4 refused with a link to `/site/`.
- Tests: `CmsFormatTest.php` (8, shared fixtures), `WebsiteRenderTest.php` (32; `--setup`, `--keep`,
  `--create-missing`), `StoredTextTest.php` (90).

**this repository**

- `apps/website/` (target `website`, port **5180** — 5179 is Reports): `src/main.js`, `src/siteRuntime.js` (tabs,
  one-open accordions, HMenu, modules direct or in an iframe), `style.css` (base settings), dev `index.html`, test.
- `direct.js` for Map, Timeline, Graph, Explorer (`mount…`; `create…Config(bootstrap, {bridge, containerId})` split out
  of `get…Config()`; no global when `exposeGlobal === false`).
- `shared/src/site/cmsDocument.js` (same checks and CSS as the server), `shared/test/fixtures/cms-v4/` (6 cases),
  `shared/src/widgets/layout/tabs.js`, `accordion.js` (HEditForm uses them), `shared/src/widgets/site/HMenu.js`.
- Docs: architecture, configuration, integration, stored text policy.

**Deviations and findings**

| Item | What was done |
|---|---|
| Module CSS in another page | Each app's `html` / `body` / `:root` rules moved to `src/page.css` (imported by `main.js` only); id selectors have a class form `:is(#heurist-map, .heurist-map-host)` (same specificity). Timeline and Graph put toolbar / panel beside their element, so `direct.js` makes a frame `.heurist-timeline-direct` / `.heurist-graph-direct`; the graph panel is `absolute` there, not `fixed`. |
| Module host size | A module renders into `.h-site-module-root` inside the host: module CSS loaded later could otherwise override the host's node styles (seen with Data). Default host height 480 px. |
| Menu classes | `h-site-menu…` — `.h-menu` / `.h-menu-item` are the shared dropdown classes. |
| `data-h-text` | Saved as `data-h-text=""`; the editor must write it so (else `html_sanitized` warning). |
| Explorer on a page | `runtimeMode: 'published'` → config `published`: no welcome popup, no reopening of the visitor's last query. Map: no loading of the user's preferences in `published` mode. |
| Field 2-1202 | Not in the reference database 2 yet: setup reports it and adds the other fields. The test database got a local copy (`WebsiteRenderTest --create-missing`, dty 1199, a copy of the 2-1187 row). **Create 2-1202 "Page translations" (blocktext) in database 2.** |
| Website logo | 99-51 requires the logo (2-38), as before; the test uses an existing file. |
| Custom CSS at render | Cleaned again by `StoredCss` unless JavaScript is allowed now (a value saved under the exception stays safe after the permission is removed). |

**Test data kept in `osmak_mapping`:** website 207627 (home, pages 207625 About and 207626 Data, French),
standalone pages 207628 (Data in an iframe) and 207629 (all six modules in tabs, accordion), page 207624 without
version 4. Open `/osmak_mapping/site/207627`, `/osmak_mapping/site/207627/207625?lang=fre`, `/osmak_mapping/site/207629`.
Delete them with the record API when done.

**Not done:** OpenAPI description of `/website`; a module's dialogs appended to `body` take the site's font size.
