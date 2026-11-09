# 27f Website layout and helper widgets (plan 27, Phase 4b)

**Status:** draft 1, 2026-11-07, decisions in §9. **Phases A-E implemented 2026-11-07 in both repos (§10), not committed,
not checked in a browser.** Bundles website and explorer deployed locally. **Review 2026-11-08 (§11): saving
indicator, website check of all pages and of non-public records, admin rules for websites; implemented, not committed,
not checked in a browser.** **Review 2026-11-09 (§12): record type filter of unconstrained pickers, Width / Height of a
file Record field, header position Fixed by default and new position Shrink, Delete in the Website manager; implemented,
not committed, not checked in a browser.**
**Review 2026-11-09 round 2 (§13): header default set, positions fixed / scroll / slide (manual) / none, header and footer
themes, website fields in the New website popup and the Header section; implemented in both repos, not committed, not
checked in a browser.**

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

## 11. Review 2026-11-08 (CMS designer)

Artem's points and what was agreed and done (both repos, not committed, not checked in a browser).

**1. Save.** The designer Save button shows a rotating icon and *Saving...* while the PATCH runs (`CmsDesigner._setSaving`,
`.h-spinner`), and is disabled during it; Save / Ctrl+S during a save do nothing (no second PATCH). All saves of the
designer go through `_saveRecord` (Save, page layout, styles, leaving a changed part). Time measured locally: PATCH of the
website content 0.2-0.5 s in the controller, about 0.2 s more per HTTP request; no single step takes most of it, so
nothing was optimised.

**2-3. Check.** `GET /website/{id}/validate` (the common action, no new route) now checks **all pages**: the home content,
header and footer and every menu page (`WebsiteService::check`); issues get `page` and `pageTitle`, problems of the header,
footer and website configuration are listed once. With `?page=` only that page is checked, as before. The answer also
has `records`: the records a visitor can not see (`hidden`, `viewable` = logged-in only, `missing`; `pending` counts as
public):
- `role: website` / `page`: the website record and its menu pages;
- `role: reference`: records picked on the pages (`srv/Website/CmsRecordReferences.php`): record field
  `data-h-field="<id>.<field>"`, single media `settings.record`, Generated report `settings.files` (outputs), Record cards
  in manual mode `settings.query[0].ids`, Media gallery `settings.ids`. Queries are not checked. The card template is not
  listed: it is read without the visitor's rights.
- each with `usedIn: [{page, pageTitle, node, kind}]`. Titles only of records the user may see
  (`WebsiteRepository::visibility`). `RecordEditController` passes extra parts of a `validate()` answer (`{issues, ...}`).

Client: widget `apps/website/src/manager/WebsiteCheck.js` (+ css): format issues by page, then the non-public records in
standard `HRecordList`s (groups Website / Pages / Records used on the pages; owner and visibility = admin info, edit and
info icons; visibility and where used through `recordTools`); records not found as one line. Used in the Website manager
details (Check) and in the designer: new toolbar button **Check** (asks to save first) opens it in a popup; the record
editor or viewer closes the popup first (modal), after an edit the check runs again.

**4-5. Access (agreed: "admin creates, owner edits").** Rules 4 and 5 as written (only database admins open the designer,
owner only group 1 / admins) were too strict: a project group could never run its own website. Agreed instead:
- only database administrators (`isAdmin`, includes the owner) **create a website** (RT_CMS_HOME) and **change the owner**
  of a website or a page (`WebsiteEditService::assertOwnerRule`, called by `WebsiteEntityHandler::beforeSave`, so also for
  `/records/{id}` saves); 403 otherwise;
- editing in the designer still follows the record owner (27c decision 6); pages get the website's owner as before
  (`shareAccess` / `assign` write through the service, not through the rule);
- new pages inside a website: anyone who can edit the website; **standalone pages** (*Publish this view*) can still be
  created by any logged-in user, only their owner change needs an administrator (to be confirmed by Artem);
- `GET /website/setup` returns `canCreate`; the manager hides *New website* without it; `HRecordAccess` option
  `ownerLocked` (owner read-only with a note), set by `HRecordEditor` for RT_CMS_HOME / RT_CMS_PAGE when the user is not
  a database administrator.
- Not covered: *Duplicate* of a website record by a non-administrator (`/records/{id}/duplicate` has no before hook).

Tests: `heurist/tests/WebsiteEditTest.php` 74 pass (check of all pages: hidden page used by a record field and record cards
on a sub page, missing card record; non-admin: website insert 403, `canCreate` false, own standalone page, owner change 403,
visibility change 200; admin owner change 200). JS 1,679 pass; builds website and explorer deployed.

### 11.1 Check, round 2 (Artem, 2026-11-08)

- Popup wider (`min(1100px, 100vw - 24px)`); three sections divided by a line, each with a count, a tip and an OK message:
  *Format* (tip: what errors and warnings mean, the element in brackets), *Non public pages* (website and menu pages;
  OK "All is correct. All pages are public."), *Non public records on pages* (OK "All is correct. All records used on the
  pages are public.").
- Field and value visibility (only for *Record field* elements, also `website.` / `page.`): a public record whose field is
  hidden / logged-in only in the record structure, or whose values are hidden from the public (`dtl_HideFromPublic`), is
  listed with `fields: [{id, name, state: hidden|partly}]` (`WebsiteRepository::hiddenFieldValues`, the output rule
  `RecordRepository::valueVisible` with a guest). A page that is also used on a page is listed in both sections.
- HRecordList: no visibility texts (owner / visibility icons of the admin info are enough); records used on the pages get a
  page name column (150px, recordTools) with the elements (and hidden fields) as its tooltip, an eye-slash icon for a hidden
  field.
- Info icon: the website bridge `viewRecord` opens the record popup of `RecordEditorHost` (Explorer's `viewRecord` shows
  the Record View pane, which is under the full-screen manager / designer).
- The popup is no longer closed for the record editor or viewer: both are modal dialogs shown over it (the first round
  closed it by mistake).
- Designer button **Highlight issues in tree** (when something was found): closes the popup and marks pages (site tree) and
  elements (page tree) with a problem in `--h-color-danger` (`checkProblemPlaces`, HTree item flag `danger`); problems of the
  website record mark Header / Home / Footer by the part that holds the element, else Home. The marks stay until the next
  Check.
- Tests: WebsiteEditTest 76 pass (value hidden from the public listed).

## 12. Review 2026-11-09 (Artem)

1. **Record type filter of an unconstrained record picker** (e.g. *Source record* of a Record field): only the types that
   have records. `HRecordManager` gives `RectypeSource` the filter `dbdefs.isRectypeUsed`; when the host has not put the
   counts on the definitions yet (Explorer's `RecordTypeManager` does), the manager loads them once with
   `aggregate(apiClient, 'rectypes')`. The normalisation of the answer moved to `shared/src/data/aggregate.js`
   (`rectypeCounts`), used by `RecordTypeManager` too. Without counts all types are offered.
2. **File field in a Record field.** Question: forbid `file` and use a Media element for the header logo, or Width / Height?
   **Decision: Width / Height** (a Media element stores one chosen file; the header templates follow the logo of the
   website record, `website.2-38`). The popup *Content of element: Record field* shows Width and Height only for a file
   field (same values as the media form: a number = px, px or %, empty = auto); they are the own style of the element
   (`width`, `height`). CSS: the image of a Record field fits the box of its element (`max-width` / `max-height` 100%,
   `object-fit: contain`), also the header logo, so Width / Height in Properties work too. Empty = as before (the logo keeps
   the responsive *Logo height*). The server still writes a bare `<img>`.
3. **Slide out.** Question: is "narrow panel, full size on mouse over" standard? Answer: the current Slide out (hides when
   scrolling down, back when scrolling up) is the standard *headroom* pattern; a header that opens on mouse over does not
   work on touch screens. **Decision: keep Slide out and add a position Shrink** (`shrink`):
   - horizontal: sticky; after scrolling down past half of the header (at least 40px) the body gets `h-site-header-small`
     (subtitle hidden, logo at 50%, title 1.1em), back near the top (under 8px);
   - vertical (wider than 640px): a narrow column with the logo only (title, subtitle, texts, widgets hidden); it opens
     over the content (260px) on mouse over (`@media (hover: hover)`) and with a button (bars icon) that the runtime puts at
     the top of the header (`h-site-header-open`, closed by a click outside or Esc); narrow screens: as horizontal.
   - `siteRuntime.attachHeaderShrink`, not in the designer preview.
   - **Replaced the same day by §13** (Slide out = manual expand / collapse; no Shrink, no automatic slide).
4. **Header position Fixed is the default**, label *Fixed*. Values `fixed | scroll | slide | shrink | none` (first = default;
   `default` was renamed `scroll`, label *Scrolls away*; a stored `default` can not exist, defaults are not written).
   JS `CMS_LAYOUT`, PHP `CmsValidator::LAYOUT`, `PageRenderer::bodyClasses` (no position = fixed). Websites without a
   stored position are now Fixed. Footer unchanged.
5. **Delete in the Website manager** is shown again (v4 website or standalone page the user can edit, the rule of
   2026-10-26).

Tests: JS 1,681 pass (`attachHeaderShrink`, counts of the record manager, layout defaults, Delete button);
WebsiteRenderTest 53 (body classes), WebsiteEditTest 76, CmsFormatTest 14 pass.

## 13. Review 2026-11-09, round 2 (Artem): header and website fields

Answers to the questions of the review and decisions:

0. **New website popup.** It was hand-written DOM, not HEditForm. Now HEditForm made from the record structure of the website
   type (labels, file inputs and translations from the database): Title (2-1, required), Main language, Other languages,
   Subtitle (DT_ALTERNATE_NAME 3-1009), Short summary (DT_SHORT_SUMMARY 2-3), Logo image (DT_FILE_RESOURCE 2-38), Banner image
   (DT_CMS_BANNER 99-951, new srv constant). The same fields (without Short summary) are in the Header section of
   *Navigation and layout* (item 5c: useful, not redundant); changed fields are PATCHed to the website record on OK.
1. **Header positions** `fixed` (default) | `scroll` (Scrolls away: horizontal header and narrow screens) | `slide` | `none`.
   Slide out = an expand / collapse button; it starts expanded, the choice of the visitor is kept in the browser.
   Collapsed: horizontal = small logo, title, the button on the right; vertical = the button above a small logo.
   Expanded: the normal layout plus the button (right / above). The automatic slide and Shrink of §12 are removed.
2. **Orientation** horizontal | vertical: vertical = a left column on wider screens (always on screen), on top and scrolling
   away on narrow screens.
3. **Header: default set** (one element, Widgets section): logo (2-38, placeholder when empty), title (2-1), subtitle (3-1009),
   main menu, language switch; banner (99-951) = background image of the whole header. Arranged by CSS, no node styles:
   one row on normal screens, two rows on medium screens (option *Use 2 rows on normal screens*: `layout.header.rows = two`),
   stacked on narrow screens (menu behind its button, language switch narrows itself), a column for the vertical orientation.
   Logo height 80px by default (smaller on medium / narrow), title = H1 of the theme. The five header templates (Basic,
   Compact, Centered, Banner, Sidebar) are removed from Add element; existing headers keep their HTML. New websites get the set.
4. **Header and footer colours**: (b) a *Header theme* and a *Footer theme*: Default, Surface, Primary, Selected (colour pairs
   every theme has) or **Own colours** (background and text chosen in the popup, `layout.header.colors = {bg, text}`).
   More (border, padding, position of the banner): Own style of the element.
5. a) Add element: section *Header and footer* removed; Widgets: Records (cards and slider), Media (gallery and slider), Action
   menu, Badges, Social media links, Header: default set, Footer composer, Email form, Main menu, Language switcher.
   b) Button *Layout* in the tools below the page tree (header or footer shown): opens the Styles popup on *Navigation and layout*.
   c) *Navigation and layout* in three blocks with gaps: Navigation; Header (Position, Orientation, Use 2 rows, Theme, website
   fields); Footer (Position, Theme).

### 13.1 Implementation (2026-11-09) and differences from the list above

- srv: `SystemConstants` DT_CMS_BANNER 99-951; `WebsiteRepository::CONSTANTS` `subtitle` (DT_ALTERNATE_NAME), `banner`;
  `CmsValidator::LAYOUT` header `position` fixed|scroll|slide|none, `rows` auto|two, `theme`, footer `theme`, `colors`
  checked by `isLayoutColors` (LAYOUT_COLOR = JS CMS_LAYOUT_COLOR: hex, a name, rgb()/hsl()); `PageRenderer::bodyClasses`
  (`h-site-header-slide`, `-rows2`, `h-site-{header|footer}-theme-{name}`) and `PageRenderer::layoutCss`: the banner as
  `--h-site-banner` and the own colours as theme variables of `.h-site-header` / `.h-site-footer` (written into the style
  block of the page; the designer reloads the preview after a layout change, so no JS compiler change was needed);
  `WebsiteStarter` writes the default set (no node styles except the two widget hosts).
- Client: `cmsEdit.js` element `headerSet` (`CMS_HEADER_FIELDS`), the five templates and `CMS_HEADER_TEMPLATES` removed;
  `apps/website/src/style.css` header section rewritten (grid areas of `.h-site-hset`, themes, banner, toggle, logo
  `--h-site-logo-now` per screen and a placeholder for an empty logo); `siteRuntime.attachHeaderToggle` (key
  `heurist.site.header.{db}.{site}`) replaces the slide and shrink functions; **HMenu `_fitWidth`**: a horizontal website menu
  that needs more than one row goes behind its Menu button (class `is-narrow`, ResizeObserver), as asked in item 3.
- `apps/website/src/manager/websiteFields.js` `createWebsiteFieldsForm` (HEditForm from the record structure);
  `openNewWebsiteForm` on `openEditFormDialog`; `WebsiteClient.create({languages, details})`.
- Styles popup: `createStylesForm({websiteFields, tab})`, three blocks (`.h-cms-styles-block`), Use 2 rows, Header / Footer
  theme with Own colours (two colour inputs); the changed website fields are saved in the same PATCH as the styles
  (`extra` of `_saveRecord`, not a second request: one `rec_Modified`). Layout button (fa-sliders) below the page tree
  when Header or Footer is shown.
- Tests: JS 1,682 pass; WebsiteRenderTest 57, WebsiteEditTest 78, CmsFormatTest 14 pass.
