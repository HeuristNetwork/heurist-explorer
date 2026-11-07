# 27f Website layout and helper widgets (plan 27, Phase 4b)

**Status:** draft 1, 2026-11-07, decisions in §9. **Phases A-E implemented 2026-11-07 in both repos (§10), not committed,
not checked in a browser.** Bundles website and explorer deployed locally.

Scope: how pages of a website are loaded (navigation modes), position and templates of the header and footer, and the
helper widgets HMenu (options), HLangSwitch, HActionMenu (with social media) and HBadges. 27e (Phase 4a) covered
templates of page content and the widgets Custom report, Record cards and Media gallery.

## 1. Background (what exists, 2026-11-07)

- **Rendering.** `srv/Website/PageRenderer::render()` writes one complete document:
  `<header class="h-site-header">` (website field DT_CMS_HEADER 2-929), `<main class="h-site-main">` (page 2-4; the home
  page is the website's own 2-4), `<footer class="h-site-footer">` (website DT_CMS_FOOTER 2-940), the style block
  `#h-site-styles` (site styles, then page styles, `StyleCompiler::compile`) and the configuration block
  `#h-site-config` (one `instances` map for all three parts). A standalone page has no header and footer. The server
  sends `Cache-Control: no-cache`; there is no server cache.
- **No main-only output.** No endpoint returns only the main part. `GET /page/{id}` returns the record JSON.
- **Navigation is a full reload.** HMenu writes plain `<a href>` links; there is no `pushState` in v4. The legacy CMS
  loaded pages into `#main-content` with a page cache and `pushState` (`hclient/widgets/cms/websiteScriptAndStyles.php`,
  `loadPageContent()`).
- **No unmount.** `apps/website/src/siteRuntime.js startSite()` mounts the instances and returns a `Map`; nothing
  destroys them. The only swap code is the designer preview `CmsPreview.apply()` (keeps hosts whose settings did not
  change, never destroys the old ones).
- **Static build.** `WebsiteBuilder::build()` writes `{lang}/{id}.html` with relative URLs.
- **Styles dialog.** *General Website Styles* (`designerDialogs.openStylesDialog` → `designerStyles.createStylesForm`):
  tabs Base settings, Layout styles, Presets, Custom CSS. Values go to `styles.base|kinds|presets` of the website's
  configuration 2-1187.
- **HMenu** (`shared/src/widgets/site/HMenu.js`): no options, one sub level, a Menu button on narrow screens. The
  language links are part of HMenu (`_languages`, `PageRenderer::menuHtml`). Menu data: 99-742 / 99-761
  (`WebsiteRepository::menu`). The legacy fields DT_CMS_MENU_FORMAT 2-1104, DT_CMS_MENU_HOME 2-1149,
  DT_CMS_TOPMENUSELECTABLE 2-938 and the page icon DT_THUMBNAIL 2-39 are not used by v4.
- **Catalog.** *Add element* lists `actionmenu`, `badges`, `language`, `email` as not available. The *Website header*
  template (`cmsEdit._create('siteHeader')`, PHP `WebsiteStarter::website()`) is a group of logo, title and menu.
- Font Awesome 7 solid and regular are loaded on site pages; brands is not.

## 2. Navigation modes (Phase A, first)

A new tab **Layout** in *General Website Styles*. Stored in the website's 2-1187 as a new top-level key `layout` (JS
`parseCmsConfig`, PHP `CmsValidator`, shared fixture):

```json
"layout": {"navigation": "reload", "cache": 8, "header": {}, "footer": {}}
```

| Mode | What happens |
|---|---|
| `reload` (default) | As today: each link loads the whole page. No JS. |
| `swap` | Header and footer stay; only the main part changes. Visited pages are kept in a cache. |
| `scroll` | One long page: pages are stacked in menu order and loaded lazily when they come near the viewport (like the extended view of HRecordList). |

`swap` and `scroll` are done in JS by a new `apps/website/src/siteNavigator.js` (plan 27 §5 called it HSiteNavigator).
The server writes the same pages in all modes, so a website can always go back to `reload`, and links work without JS.

### 2.1 Main part only, or the full page?

| | (a) Fetch the full page (same URL), take `<main>`, its instances and its styles | (b) Fragment endpoint or a request header for the main part |
|---|---|---|
| Server | Nothing new | New endpoint (an exception under plan 28) |
| Static build | Works the same | Needs extra fragment files |
| Crawlers, no JS | Every URL is a complete page | Same, but two kinds of response to keep equal |
| Cost | Header and footer sent and rendered again (a few KB) | Smaller response |

**Decision (§9.1): (a).**

### 2.2 Rules

- **Section wrapper.** The server writes the page content inside `<main>` as
  `<section class="h-site-page" data-h-page="{pageId}">`, in all modes, so the DOM is the same everywhere. `swap`
  shows one section and hides the others (the cache); `scroll` shows them all.
- **Instances** belong to a section by position (hosts inside it); the configuration format does not change. After a
  fetch the runtime reads the page's `#h-site-config`, takes the instances of its `<main>` and mounts them inside the
  new section only.
- **Unmount.** New `unmountInstance()` in siteRuntime: calls `destroy()` (HBaseWidget, module public APIs), removes an
  iframe, detaches the media viewer. `swap` keeps at most `layout.cache` sections (default 8, the oldest used is
  destroyed first).
- **Styles.** Page-level rules (nodes, kinds and presets of a page) get the scope `[data-h-page="{id}"] ` from the
  server (`StyleCompiler` scope parameter, the same in JS `compileCmsStyles`). Harmless in `reload`; in `scroll` two
  pages can not override each other's kinds. The runtime adds the page block of a fetched page as
  `<style data-h-page="{id}">`.
- **Full reload in every mode:** a language change, a link to another site or to a standalone page, a fetch error
  (also an unpacked build opened from disk, `file://`). There are no per-page scripts in v4 (§9.3).
- **After a swap:** `history.pushState` and `popstate`, `document.title`, the `hreflang` links and the language switch
  URLs, `is-current` in menus, scroll to the top, focus on the section (accessibility).
- **Scroll mode:** a placeholder with a minimum height for each page; an `IntersectionObserver` loads one page ahead.
  A menu click loads the target and scrolls to it (pages in between stay placeholders). `replaceState` and
  `is-current` follow the section in view. Modules mount only when visible. Links in the content to a page of the
  site scroll to its section.
- **Designer:** the preview always works as `reload` (one page). The Layout tab explains the modes and has the note:
  in `scroll` only the first page is in the initial HTML of the home URL, but each page URL is still a complete page.

### 2.3 Phase A tasks

1. `layout` key: JS, PHP, fixture.
2. Layout tab in *General Website Styles* (navigation, cache; header / footer settings come in Phase B).
3. Section wrapper and style scope: `PageRenderer`, `StyleCompiler`, `compileCmsStyles`, `CmsPreview` (preview keeps
   working).
4. `unmountInstance()` in siteRuntime; `CmsPreview` uses it too (fixes the preview leak).
5. `siteNavigator.js`: `swap`, then `scroll`.
6. Tests: shared node tests for the navigator (fake fetch and DOM), `tests/CmsFormatTest.php` / `WebsiteEditTest.php`
   for the wrapper and the scope.

## 3. Header and footer (Phase B)

- `layout.header.position`: `default` (scrolls away) / `fixed` (sticky at the top) / `slide` (hides when scrolling down,
  shows when scrolling up) / `none`.
- `layout.header.orientation`: `horizontal` / `vertical` (the header becomes a sticky left column, the menu turns
  vertical). On narrow screens a vertical header becomes a top bar with the Menu button.
- `layout.footer.position`: `default` / `fixed` (sticky at the bottom) / `none`.
- Page level: *hide header* / *hide footer* in the page's 2-1187 (`layout.hideHeader`, `layout.hideFooter`), used by
  the *Cover* page template.
- **Responsive: always on, no setting** (recommendation). CSS in `heurist-website-main.css` with the screen sizes of
  `SCREENS` (medium 1024, narrow 640): on medium a smaller title font, logo and header height; on narrow the title and
  subtitle are hidden and the logo is smaller. It works through the classes `h-site-logo`, `h-site-title`,
  `h-site-subtitle` written by the templates. New Base setting: logo height. The menu handles its own width.

### 3.1 Header templates

A picker with a preview (catalog *Website header*):

| Template | Content |
|---|---|
| **Basic** | Surface colour. Row 1: logo (`website.2-38`), title (`website.2-1`) with a subtitle below in a smaller font (a plain `data-h-text` with the placeholder "define subtitle", §9.7). Row 2: HMenu, HLangSwitch. |
| **Compact** | Everything in one row, smaller logo and title. |
| **Centered** (suggested) | Logo and title centred, menu centred below. |
| **Banner** (suggested) | A background image across the full width with the title over it, menu below (replaces the legacy banner field). |
| **Sidebar** (suggested) | For the vertical orientation: logo, title, vertical menu, language switch and action menu at the bottom. |

Other content for a header: HActionMenu (login, add record, contact), HLangSwitch, HBadges (a partner logo on the
right). A search box (HFilter) comes later (§9.5).

### 3.2 Footer composer

A dialog with a checklist of blocks. It writes normal editable HTML (a group in columns), changed later in the designer
as any other content:

- Sponsors / participants (HBadges, Phase E).
- Follow us in social media (action menu, social preset, Phase D).
- Copyright text (static text with the year).
- Links to selected pages, e.g. Legal info, Conditions of use, Contact (HActionMenu links, Phase D).
- *Powered by Heurist*.
- *Hosted at*: the logo and URL of the organisation that hosts this Heurist installation (§9.6). Written by the
  server when the page is rendered (also at build), as a link with the logo; nothing is shown when there is no logo.

Blocks that need Phases D / E are added to the composer when those exist. The starter website
(`WebsiteStarter::website()`, `cmsEdit._create('siteHeader')`) uses Basic and a composed footer.

## 4. HMenu (Phase C)

Settings of the menu instance (form in `widgetForms.js`, replaces the message "it has no settings"):

- `orientation`: horizontal / vertical / auto (follows the header orientation). Vertical = a tree with expandable
  levels.
- `showHome`: a Home entry first.
- `selectableParent`: a page with sub pages can be opened; otherwise its title only opens the sub menu.
- More than one sub level (up to `MENU_DEPTH`).
- Icon per page: DT_CMS_MENU_FORMAT 2-1104 of the page (title only / icon only / icon and title), icon = DT_THUMBNAIL
  2-39 of the page. `WebsiteRepository::menu` reads both; `PageRenderer::menuHtml` writes them. The legacy website
  fields 2-1149 / 2-938 are only defaults when a legacy site is converted.
- The language links move out of HMenu into HLangSwitch (§5). v4 is not in production, so no migration; the test site
  in osmak_mapping gets HLangSwitch in its header.
- One class for the main menu and the action menu (27c §12, §19): `HMenu` with item source `website` (pages) or `items`
  (actions, §6), and the presentations of §6.

## 5. HLangSwitch (Phase C)

- New widget type `language`.
- `appearance`: `select` / `list` / `auto` (select when the container is narrow, by `ResizeObserver`).
- Hidden for a website with one language (the server does not write it).
- Data: `config.site.languages`, `config.site.language`. The server writes links (works without JS). A language change is
  a full reload in every mode.

## 6. HActionMenu and social media (Phase D)

- New widget type `actionmenu`. `presentation`: `dropdown` (label and icon) / `buttons` / `links` / `icons`.
- Item: `{label (translatable), icon (fa class), action, target, newTab}`.
- Actions: page of this website (follows the navigation mode), external URL, add record of a type. Later: login /
  logout, admin actions for a logged-in user.
- Add record and admin actions need an **Explorer instance on the site** (§9.4): the action menu sends them to that
  instance through its public API. Without an Explorer instance the form does not offer them.
- Page and URL items are written by the server as `<a href>` (crawlable, no JS). JS only for the other actions.
- **Social media = a preset of the action menu**, not its own widget type. The designer opens a social form: a table of
  popular networks with three columns, fa-brands icon | name | URL input. The list is hard-coded in the client
  (Facebook, X, Instagram, LinkedIn, YouTube, Mastodon, Bluesky, GitHub, ORCID, email, RSS ...). Networks with a URL
  become items with `presentation: 'icons'`; `settings.preset = 'social'` makes the designer open the social form
  again. `brands.min.css` is imported in `apps/website/src/main.js` (the font loads only when used).

## 7. HBadges (Phase E)

- Two widgets on two bases: **badges** = images with links (gallery code), **social media** = icons with links (action
  menu, §6).
- New widget type `badges` on the gallery code (`cmsMedia.buildCmsGalleryItem`, files or media records) without the
  presentation and slider options.
- Form: a list image | title (tooltip, alt) | URL, plus height, alignment, gap and "grey until hover".
- The designer builds the HTML per language as for the gallery; the server outputs it.

## 8. Order of phases

1. **A** navigation modes (§2).
2. **B** header and footer position, responsive CSS, header templates, footer composer (§3).
3. **C** HMenu options, HLangSwitch (§4, §5).
4. **D** HActionMenu and social media (§6).
5. **E** HBadges (§7).

Each new widget type is added in: `CMS_ELEMENTS` and `_create` (`cmsEdit.js`), `CMS_TYPES` (`cmsDocument.js`) =
`CmsValidator::TYPES` and the fixtures, a form in `widgetForms.js`, `PageContent::widget()` / `PageRenderer::fill()`,
`PageRenderer::publicSettings()`, `siteRuntime.mountInstance()` / `SITE_WIDGETS`, the catalog entry set available.
Each phase: localization texts (`apps/website/public/assets/localization/localization_eng.txt`, `_fre.txt`) and a
user manual note.

## 9. Decisions (Artem, 2026-11-07) and open points

1. `swap` and `scroll` fetch the full page (§2.1 a). Agreed.
2. Section wrapper `data-h-page` and the page style scope in all modes. Agreed.
3. **No per-page custom script, CSS or external files in v4** (Artem; agreed, it removes the reload exception and the
   loading and unloading of page scripts). Custom CSS (2-946), script (2-927) and files (2-939) exist only on the
   website record, and on a standalone page (its own website). `PageRenderer` ignores them on page records of a v4
   site; the designer does not offer them for pages; `CmsValidator` gives a warning, not an error, when a page has
   them (e.g. after a legacy conversion), so the rule is not strict. A language change is always a full reload.
4. Add record and other admin actions need an Explorer instance on the site. How the action finds it (on the same
   page, or a page of the site opened first) is settled in Phase D.
5. Search box in the header: later, not in 27f.
6. Social networks: hard-coded list in the client. Hosting info (Artem, 2026-11-07): two files in the parent folder of
   the Heurist installation, `organisation_url.txt` and `organisation_logo.png` (legacy also accepts `.jpg`). One host
   per installation, not a list. Legacy reads them in `hserv/utilities/USystem::getHostLogoAndUrl()` and serves the
   logo at `HEURIST_BASE_URL?logo=host`. srv must not use hserv, so a small srv reader (in `srv/Website`, same files,
   same rule) gives the logo and URL to the footer block. The logo URL stays the legacy `?logo=host`; the static build
   copies the logo file into the build.
7. Subtitle (Artem, 2026-11-07): no field. The header templates place a `data-h-text` with the placeholder
   "define subtitle".

## 10. Implementation (2026-11-07)

All five phases are implemented in heurist-explorer and heurist (`srv/Website`). Nothing is committed; nothing is checked in a
browser yet. Tests: JS 1,679 pass (new `apps/website/test/siteNavigator.test.js`, `helperWidgets.test.js`, more cases in
`siteRuntime.test.js`, `cmsContent.test.js`, `cmsDesigner.test.js`, fixture `shared/test/fixtures/cms-v4/layout.json`); PHP
`tests/WebsiteRenderTest.php` 50, `WebsiteContentTest.php` 43, `CmsFormatTest.php` 14, `WebsiteEditTest.php` 62 pass.

**Phase A, navigation modes**
- `layout` in 2-1187: `CMS_LAYOUT` / `CMS_LAYOUT_CACHE` + `cmsLayoutProblems` (cmsDocument.js) = `CmsValidator::LAYOUT` /
  `layoutProblems` (warning `layout`; a `layout` that is not an object is the error `cms_json`).
- `PageRenderer`: `<section class="h-site-page" data-h-page>` in `<main>`; the website styles in `#h-site-styles`, the page styles
  in `<style id="h-page-styles" data-h-page>` below the section (`StyleCompiler::compile(..., $scope)`, `compileCmsStyles(...,
  {scope})`); `site.layout` and `site.pages` (Home + menu, depth first; only for swap / scroll) in `h-site-config`.
- **Change:** the base settings of a page are now variables of its section (they were merged into `html.h-site`), so a page
  no longer changes the header and footer.
- `siteRuntime.js`: `mountHosts`, `unmountInstance` (also used by the designer preview: instances removed by the draft are
  destroyed); `apps/website/src/siteNavigator.js` (lazy chunk, started by `main.js` for swap / scroll only).
- The tab is called **Navigation and layout** and is the last tab of *General Website Styles* (the tab Layout styles exists).
- §9.3: `PageRenderer` writes custom CSS, script and files of the website (or the standalone page) only; `CmsRecordCheck`
  warns `page_custom_code` when a page of a website has them.

**Phase B, header and footer**
- Body classes (`PageRenderer::bodyClasses`): `h-site-header-fixed|slide`, `h-site-header-vertical`, `h-site-footer-fixed`,
  `h-site-hide-header|footer` (page flags, toggled by the navigator); position `none` = no element. Slide out:
  `attachHeaderSlide` in siteRuntime. CSS in `apps/website/src/style.css`.
- Base setting `site-logo-height` (both sides); classes `h-site-logo`, `h-site-logo-small`, `h-site-title`, `h-site-subtitle`.
- Page tool *Header and footer on this page* in the website tree (`openPageLayoutForm`).
- Templates: catalog group **Header and footer** with Header: Basic (`siteHeader`), Compact, Centered, Banner, Sidebar and the
  Footer composer (`cmsEdit._header` / `_footer`, `CMS_HEADER_TEMPLATES`, `CMS_FOOTER_BLOCKS`; `insertElement` takes
  `options`). Sidebar sets the header orientation Vertical when it is added to the header; its menu has orientation auto.
- `WebsiteStarter::website()`: Basic header and a footer with copyright, Powered by Heurist and Hosted at.

**Phase C, HMenu and HLangSwitch**
- HMenu (rewritten, one class for `menu` and `actionmenu`): orientation, Home entry (`site.homeItem` in the designer),
  selectable parent (a `span.h-site-menu-label` otherwise), all levels, page icon and format (codes `thumbnail`,
  `menuFormat`, `menuIconOnly`, `menuNameAndIcon` in `WebsiteRepository`; `PageContent::fileUrl`), expanders of a vertical
  menu. Server: `PageRenderer::menuHtml` / `menuList` / `menuClass`. Form `openMenuForm`.
- HLangSwitch `shared/src/widgets/site/HLangSwitch.js` (type `language`, `PageRenderer::languageHtml`, form `openLanguageForm`);
  the language links are no longer in the menu.

**Phase D, action menu and social media**
- Type `actionmenu` (`PageRenderer::actionMenuHtml`; `actionMenuItems` in HMenu.js for the draft). Item: `label`, `labels`
  (by language), `icon` (Font Awesome classes), `iconOnly`, `action` page / url / addRecord, `target`, `newTab`.
- Add record: `data-h-action="addRecord"`; `onAction` in siteRuntime sends it to the Explorer of the page (new public API
  method `HeuristExplorerPublicApi.addRecord`); the form offers it only when a loaded record of the website has Explorer.
- Social media: catalog entry *Social media links* = action menu with `preset: 'social'`, `openSocialForm`
  (`SOCIAL_NETWORKS`, 14 networks); `brands.min.css` imported by the site and the designer form.
- Forms in `apps/website/src/designer/actionForms.js`.

**Phase E, badges**
- Type `badges`: `badgesForm.js` (`openBadgesForm`, `buildBadgesHtml`), registered files chosen in the record manager
  (`select_multi`), title and URL per logo, height, gap, alignment, grey until hover; HTML per language in the settings,
  written by `PageContent::widget`.
- **Hosted at** = badges with `source: 'host'`: `srv/Website/HostInfo.php` reads `organisation_logo.jpg|png` and
  `organisation_url.txt` above the installation (only an http(s) URL); logo address `?logo=host`. **Change from §9.6:** the
  built site loads its assets from the Heurist server (WebsiteBuilder), so the logo is not copied.

**Open**
- Browser check of all phases; translations of action menu labels in the designer (the format has `labels`); login /
  logout and admin actions; there is no user manual of websites yet (no note written).
- The preview shows a new header orientation only after Save (the body classes come from the server).

