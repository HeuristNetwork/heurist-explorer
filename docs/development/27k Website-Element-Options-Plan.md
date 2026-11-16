# 27k Website element options (menu styles, vertical tabs, header shrink, full-screen menu, extras)

**Status (2026-11-15):** discussed and agreed with Artem (questions answered 2026-11-15). **Phase A (§1-2)
committed** (§7; CSS chunk fix after the review not committed). **Phases B-E (§3-6) implemented** in both repos
(§8-11, 2026-11-15/16): not committed, no browser check. All phases done. **Review 2026-11-16 (§12)** implemented in
both repos, not committed, no browser check.

## Context

The CMS designer (plans 27c-27j) has all the main elements, but some common options of modern websites are missing:
style choices for menus, vertical tabs, a header that gets smaller on scroll, and a full-screen entry or navigation.
This plan gathers them with a few easy extras.

Current state (read 2026-11-15):
- `HMenu` (`shared/src/widgets/site/HMenu.js` + `.css`), one class for `menu` and `actionmenu`. `presentation` =
  `menu | links | buttons | icons | dropdown` (`MENU_PRESENTATIONS`), `orientation` = `horizontal | vertical | auto`
  (website menu only). Server mirror `PageRenderer::menuClass` / `menuPresentation` (heurist `srv/Website/PageRenderer.php`).
  Action menu form: `apps/website/src/designer/actionForms.js`; website menu form: `widgetForms.js` (~line 1031).
- Tabs: `data-h-control="tabs"`, `enhanceTabs` in `apps/website/src/siteRuntime.js` with shared `createTabSet`
  (`shared/src/widgets/layout/tabs.js`), CSS `.h-site-tab-strip` in `apps/website/src/style.css`; no orientation.
- Header positions `fixed | scroll | slide | none` (27f §13). A Shrink position existed for one day (27f §12.3) and was
  replaced by Slide out (§13).
- Cover = page template in `shared/src/site/cmsPageTemplates.js` (full window group, Enter button = action menu).

## Answers

**Is Pills the same as Buttons?** No.
- *Buttons*: every item is a filled button (primary colour) — calls to action ("Explore", "Contact us").
- *Pills*: items are plain text; the **current** item (and hover) gets a rounded filled background (primary colour).
  It shows where the visitor is, so it fits a website menu and tabs, not a list of actions.
- *Underline* (Bottom border): plain text, a bottom border under the current item and on hover.
- *Links*: underlined text, no marking of the current item.
Our present website menu style (light background on hover / current) is a soft pill already; it stays as *Plain*.

## Proposal (agreed 2026-11-15)

### 1. One item style for menus and tabs
Split the present `presentation` into two settings:
- `style` (how an item looks): `plain` (default, as now) | `links` | `underline` | `pills` | `buttons` | `outline`
  (outline = bordered button, cheap to add with buttons).
- `presentation` (how items are placed): `row` | `column` | `dropdown` | `icons` (+ `expand`, §2).
Stored values stay valid: old `presentation: links|buttons` = `style` with `row`; `icons` / `dropdown` unchanged.
The same `style` classes are used by tabs (§3), so one CSS block: `.h-site-items-<style>`.
Files: `HMenu.js/.css` (`menuClass`), `PageRenderer::menuClass`, `CmsValidator` (allowed values), `actionForms.js`,
`widgetForms.js` (website menu gets Style), fixture `shared/test/fixtures/cms-v4`, localization.

### 2. Action menu: orientation and expand on hover
- `orientation`: `horizontal` | `vertical` for the action menu too (now website menu only).
- `presentation: expand` (only with icons): one trigger icon (share / bars / plus, chosen) and the icons fly out on
  hover and focus (`@media (hover: hover)`), on click on touch screens; direction follows the orientation
  (right / down). CSS transition, `prefers-reduced-motion` = no animation. Typical use: social links, floating
  "speed dial".

### 3. Tabs: vertical
- Control setting `orientation: vertical` (attribute on the control node, e.g. `data-h-orientation="vertical"`,
  validated by `CmsValidator`, JS + PHP + fixture): the tab strip a column on the left, the panel right.
  Below 641 px vertical tabs become horizontal (same rule as the vertical menu).
- Tabs take the item `style` of §1 (`tabs` default = present look, `pills`, `underline`).
- Edit: the gear of the tabs node in the part tree (popup already exists for captions — add Orientation and Style).

### 4. Header: shrink on scroll
- A checkbox *Shrink on scroll* under position Fixed, horizontal orientation only (hidden otherwise; the server ignores
  it for other positions). Not a new position.
- After scrolling down more than the header height the body gets `h-site-header-shrunk`: everything in the header
  is hidden except a small logo (24 px, as the collapsed Slide out header), the menu and the language switch (agreed
  2026-11-15). Back when the page is near the
  top (< 8 px) — the two thresholds stop jumping when the header height changes. Small CSS transition.
- `siteRuntime.attachHeaderShrink` (passive scroll listener, rAF), not in the designer preview; `layout.header.shrink`
  in `CMS_LAYOUT` / `CmsValidator::LAYOUT`, `PageRenderer::bodyClasses` adds `h-site-header-shrink`.

### 5. Full-screen menu (agreed 2026-11-15: full-screen menu, not a Cover intro)
- Website menu setting `collapse`: `panel` (default, as now: block below the header row) | `fullscreen`.
- `fullscreen`: the menu button opens an overlay over the whole window (page background or the header theme), large
  items centred, sub pages as a tree, close button (×) and Esc; animation `slideDown` | `slideRight` | `fade`
  (setting `animation`), `prefers-reduced-motion` = none. Body scroll locked while open; focus kept inside; a click
  on an item closes it (also in swap / scroll navigation).
- Option *Always collapsed* (menu button also on wide screens) — usual with a full-screen menu.
- `HMenu._showPanel` gets the second mode; CSS `.h-site-menu-fullscreen`; server writes the classes
  (`PageRenderer::menuClass`); website menu form in `widgetForms.js`.

### 6. Easy extras (each small, no server API change)
1. **Back to top** button: layout option (Navigation and layout), shown after one screen of scrolling. ~40 lines.
2. **Accordion: one open at a time** + *first open*: native `<details name="...">`, a checkbox on the control. ~20 lines.
3. **Reveal on scroll**: an option in the Own style of a group / element (fade in, slide up) via IntersectionObserver;
   off with `prefers-reduced-motion`; never in the designer preview. Popular, cheap.
4. **Section menu**: website menu setting `scope`: `site` (default, the whole tree as now) | `section` (only the
   pages of the current section: the children of the current page, else its siblings with their parent as the
   first entry). Server menu writer filters the tree; HMenu unchanged. Useful in a side column beside the main menu.
5. **Breadcrumbs** widget (agreed 2026-11-15: both modes), setting `mode`:
   - `path`: Home › Section › Page from the website tree, written by the server (works without JS); on a record
     page the record title is the last entry.
   - `history`: client only. The site runtime keeps the record pages visited on this website (max 8, in
     `sessionStorage`, key per db + site; the same record again cuts the trail there); the widget shows them
     (*People › Smith › Paris*), a click goes back to that record page. Without JS / empty trail: the page path.
6. **Search box** (agreed 2026-11-15): an action menu item of type *Search* = text input + button whose action is
   *Saved filter* (plan 27j): the typed text is the value `v.<NAME>` (`?source=<id>&v.<NAME>=<text>`, limit 200
   chars), target page as in 27j. Settings: saved filter, value name (from the parameters of the source), placeholder,
   button label. No server change (the 27j runtime reads `v.` values); server writes the `<form method="get">` so it
   works without JS.
Left out for now: announcement bar, tab deep link.

## 7. Phase A: implementation (2026-11-15)

- **Settings.** `style` = `plain | links | underline | pills | buttons | outline` (default plain, not written);
  `presentation` of an action menu = `row | icons | expand | dropdown`; `orientation` `horizontal | vertical` for the
  action menu too; `icon` and `label` of the expand button. One rule in `menuLook()` (`shared/src/widgets/site/HMenu.js`)
  = `PageRenderer::menuLook` (heurist): a stored `presentation: links | buttons` is a row with that style, so the page
  templates and older pages need no change.
- **Deviation:** no presentation `column`. The orientation of §2 already says it.
- **Classes:** `h-site-menu-style-<style>` (none for plain or a drop-down), `h-site-menu-icons | -dropdown | -expanding`
  (not `-expand`: that class is the tree button), orientation as before. CSS still knows `h-site-menu-links` /
  `h-site-menu-buttons` for pages written before. The styles act on the items of the first level only: the sub
  pages of drop-downs keep the plain look. Pills fill the current page with the primary colour; underline draws a
  2px line in the text colour (current and hover); links mark the current page in bold.
- **Expand:** the button (`MENU_EXPAND_ICON` = `fa-solid fa-share-nodes` without an own icon, the label as the rollover
  and the name) is written by the server. The list opens beside the button (below when vertical) on hover (`hover:
  hover` devices), on focus and by a click; on the other side when there is no room (`is-end`, `_placeDropdown`);
  no animation with `prefers-reduced-motion`. A drop-down and an expand menu now close by a click outside and by Esc.
- **Forms:** action menu form: Presentation, Name / Label of the button, Icon of the button, Style of the items,
  Orientation (style and orientation hidden for a drop-down). Social media form gets Presentation (Icons | Icons
  behind a button), the button icon, Style and Orientation (`socialSettings(urls, look)`). Website menu form: Style
  of the items (`ITEM_STYLES` of `actionForms.js`).
- **No validator change:** the server does not check the keys of widget settings (`CmsValidator` checks the layout).
- Tests: JS 1,772 pass (`helperWidgets.test.js`: menuLook / menuClass, expand button, social settings);
  heurist `WebsiteRenderTest` 92 and `CmsFormatTest` 18 pass. Website and Explorer bundles built and deployed.

### 7.1 Review 2026-11-15 (Artem): menus shown as plain lists

Cause: the designer forms imported `HMenu.js` for `menuLook`. The bundler then put HMenu and **its CSS** into a
shared chunk (`heurist-website-HMenu.css`), and a page links only `heurist-website-main.css`, so menus had no CSS.
Fix: the settings rules moved to `shared/src/site/cmsMenu.js` (no CSS); HMenu re-exports them, the forms import
cmsMenu. The menu CSS is in `main.css` again. **Rule:** designer code must not import a site widget that imports CSS.

## 8. Phase B: vertical tabs and tab styles (2026-11-15)

- **Format:** two attributes on the tabs container: `data-h-orientation="vertical"` and `data-h-item-style` =
  `links | underline | pills | buttons | outline` (no attribute = the tabs of before). `StoredText` allows them with
  these values only (heurist; `StoredTextTest` 115 pass). JS `CmsRecordDocument.tabsLook / setTabsLook`,
  `CMS_TAB_STYLES` (`shared/src/site/cmsEdit.js`); defaults remove the attributes.
- **Deviation:** an attribute name of its own (`data-h-item-style`) instead of the menu classes: the stored HTML keeps
  no classes of ours, and the tab set classes are written by the runtime.
- **Designer:** the tool of a tabs node in the part tree is now a gear: *Tabs: orientation, style and captions* (the
  captions popup of 2026-11-15 with Orientation and Style of the tabs on top). One undo step.
- **CSS** (`apps/website/src/style.css`): vertical = grid, the tab strip a column on the left from 641 px (above on
  narrower screens); the default style draws a line on the right with the active tab open towards its panel;
  underline: 2px line under (vertical: right of) the active tab in the primary colour; pills / outline: the active tab
  filled with the primary colour; buttons: all filled, the others lighter; links: underlined, the active one bold.
- Tests: JS 1,773 pass (`cmsEdit.test.js` tabs). Website and Explorer bundles built and deployed.

## 9. Phase C: shrink on scroll (2026-11-15)

- **Setting:** `layout.header.onScroll` = `keep | shrink` (default keep, not written) in `CMS_LAYOUT` (JS) and
  `CmsValidator::LAYOUT` (PHP). **Deviation:** a value list instead of a checkbox `shrink`, as every other layout
  setting (the generic check knows only value lists); another value (e.g. `hide`) can come later.
- **Designer:** *Navigation and layout* → Header: *When the page scrolls* = Keep the header as it is | Shrink (small
  logo, menu and languages). Shown only for position Fixed and orientation Horizontal; for others the value is removed.
  The layout drawing says what happens.
- **Server:** `PageRenderer::bodyClasses` adds `h-site-header-shrink` only for a fixed horizontal header. The header
  height of the layout (`header.height`) is not used while shrunk (`body:not(.h-site-header-collapsed,
  .h-site-header-shrunk)`).
- **Runtime:** `siteRuntime.attachHeaderShrink` (not in the designer preview): class `h-site-header-shrunk` when the
  page is scrolled down further than the height of the header (at least 40px), removed above 8px
  (`HEADER_SHRINK_BACK`); the two limits stop the jumping. A page with less than twice the header height to scroll keeps
  its header (else the page gets shorter and scrolls back, a loop). Scroll events through requestAnimationFrame.
- **CSS:** shrunk = every text, media and widget of the header hidden except the logo (32px), the website menu and the
  language switch; the header set in one row, the menu takes the free room. The website menu now has the class
  `h-site-menu-main` (server `menuHtml`, HMenu for presentation `menu`) so that CSS tells it from an action menu
  (both hosts are `<nav>`).
- Tests: JS 1,775 pass (`siteRuntime.test.js` shrink limits, `helperWidgets.test.js` layout value); heurist
  `WebsiteRenderTest` 93 (body classes, validator, menu class, height rule), `CmsFormatTest` 18, `WebsiteEditTest` 82 pass.

## 10. Phase D: full-screen menu (2026-11-15)

- **Settings of the website menu:** `collapse` = `panel` (default) | `fullscreen`, `animation` = `down` (default) |
  `right` | `fade` (only with fullscreen), `alwaysCollapsed` true. Defaults are not written. Classes (`menuClass` of
  `shared/src/site/cmsMenu.js` = `PageRenderer::menuClass`): `h-site-menu-fullscreen`, `h-site-menu-anim-right | -fade`,
  `h-site-menu-always-collapsed`; only for the website menu (presentation `menu`), not for action menus.
  **Deviation:** animation values `down | right | fade` (not `slideDown | slideRight`).
- **Designer:** Menu form: *Open collapsed menu* Below the header | Full screen, *Animation* (shown for Full screen),
  *Always collapsed*.
- **HMenu:** `_showOverlay` moves the list into an overlay appended to `<body>` (a dialog: close button, Esc, a link
  closes it, Tab stays inside, focus back on the menu button); `html.h-site-menu-locked` stops the page from scrolling
  behind it; the list goes back into the menu after the animation (300 ms, at once with reduced motion) and the size is
  measured again. While the overlay is open the size is not measured (`_fit`). Always collapsed = `is-narrow` at every
  width (the measure is not needed). Without JS the classes do nothing: the list shows as before.
- **CSS** (`HMenu.css`): fixed over the window, colours of the page, items 1.4em in a centred column (max 32em), the
  sub pages a tree as in the panel; slide down / in from the right / fade; pages hidden in the main menu stay hidden
  (`h-site-menu-overlay-header`: the overlay is not inside the header).
- Tests: JS 1,776 pass (`helperWidgets.test.js`: classes, overlay open / close; the fake DOM got `documentElement`);
  heurist `WebsiteRenderTest` 94, `CmsFormatTest` 18, `WebsiteEditTest` 82 pass.

## 11. Phase E: extras (2026-11-15/16)

1. **Back to top:** layout key `backToTop: true` (site layout; JS `cmsLayoutProblems` and `CmsValidator::layoutProblems`
   as `hideHeader`, kept by `PageRenderer::layout`), body class `h-site-back-to-top`, `siteRuntime.attachBackToTop`
   (round button at the bottom right, shown after one screen of scrolling; smooth scroll unless reduced motion; not in
   the designer). Designer: *Navigation and layout* → *Back to top button* No | Shown after one screen of scrolling.
2. **Accordion:** **Deviation:** the site accordion was always one-open (`exclusiveAccordion`), so the option is the
   other way round: `data-h-multiple="true"` (several open at a time) and `data-h-first-open="true"`
   (`siteRuntime.enhanceAccordion`). Not the native `<details name>` (not allowed by StoredText, not needed). Designer:
   the gear of an accordion = *Accordion: options and captions* (two checkboxes above the captions).
   `CmsRecordDocument.accordionLook / setAccordionLook`.
3. **Reveal on scroll:** attribute `data-h-reveal` = `fade | up` on any element of the content (not a style property:
   the own style holds CSS only). Designer: the inline form of an element gets a section *Reveal on scroll* (None |
   Fade in | Slide up), applied at once. `siteRuntime.enhanceReveal` (IntersectionObserver, class
   `h-site-reveal-pending` until seen, then `h-site-reveal-done`); nothing in the designer preview, without the
   observer or with reduced motion; also for pages added by the navigator (`enhanceControls`).
4. **Section menu:** website menu setting `scope: 'section'` (form: *Pages* All pages | The section of the page).
   `PageRenderer::menuPath / sectionTree` = `menuPath / sectionTree` of `shared/src/site/cmsMenu.js`: the current page
   and its sub pages, else its parent (first, without sub entries) and the sub pages of the parent; record pages left
   out; empty for a page of the first level without sub pages (the empty menu is hidden by CSS).
5. **Breadcrumbs:** widget `breadcrumbs` (CmsValidator / cmsDocument widget lists, element in the catalog, host `<nav>`
   as the menu). Server `breadcrumbsHtml`: `<ol class="h-site-breadcrumbs">` Home › parents › page; on a record page
   the record title instead of the record page. `mode: 'history'` (`data-h-mode`): client only,
   `apps/website/src/siteBreadcrumbs.js` (no CSS, rule §7.1): `mountHosts` adds a record page shown now to the trail
   (sessionStorage per db + site, at most 8, the same record again cuts the trail; also pages of swap / scroll and
   breadcrumbs of a kept header); on a record page the widget shows Home + the trail; elsewhere and without JS the path.
   The config gets `site.recordTitle`. Designer: form *Show* path | history; the draft shows the path of the menu tree.
6. **Search box:** action menu item `action: 'search'` (*Search box (Saved filter)*) = a Saved filter + `param` (the
   parameter of the query source that takes the typed text, chosen in the Saved filter popup with `search: true`;
   the "at least one value" rule is not checked, a stored value of `param` is dropped). The label is the placeholder,
   the icon the button. Server: the Saved filter link of 27j turned into a GET form (`PageRenderer::searchForm`: the
   path as `action`, the query as hidden inputs, `<input type="search" name="v.<param>">`, max 200 characters) — the same
   URL as a link, so the target page reads it the same way; works without JS; a submit loads the page (also in swap
   mode). `CmsRecordReferences` counts its query source in the website check. Draft: `HMenu._searchForm` (no submit).
- CSS in `apps/website/src/style.css` (back to top, reveal, breadcrumbs, search box) and `HMenu.css` (empty menu).
- Tests: JS 1,784 pass (new `apps/website/test/siteExtras.test.js`: section menu, accordion, document attributes,
  reveal, back to top, trail, history, search; designer tests updated); heurist `WebsiteRenderTest` 97 (path, section,
  search form, Back to top), `StoredTextTest` 117, `CmsFormatTest` 18, `WebsiteEditTest` 82 pass.

## 12. Review 2026-11-16 (Artem)

Implemented 2026-11-16 in both repos, not committed, no browser check.

1. **HMenu**
   - a) The expander of a tree (vertical, collapsed, full screen) is larger (32px button, glyph 1.4em) and in the middle
     of the row of its page: the item is a grid, the page and the button share the first cell (was absolute at 4px from
     the top, so it was too high for taller items such as pills).
   - b) A drop-down of a horizontal menu that would leave the window on the right opens to the left of its page
     (`HMenu._placeSub` on mouseover / focusin, class `is-end` on the item; deeper levels the same way).
   - c) Underline: settings `lineWidth` (1, 2 (default), 3, 4, 6px) and `lineColor` (empty = text colour) in the website
     menu form and the action menu form, shown with the style underline. Written as CSS variables on the menu
     (`--h-site-menu-line-width` / `-color`): `menuStyle()` in `cmsMenu.js` = `PageRenderer::menuStyleAttr`.
   - d) Current page as in the tabs: in links, buttons and outline the other items have opacity .75 (1 on hover), the
     current one bold; links: current not underlined; underline: current bold; outline: current filled with the
     primary colour (as outlined tabs).
   - e) The Home entry has the caption *Home* (server writes `Home`, `homeItem` gets `home: true` → class `is-home`, HMenu
     writes `$HR('Home')` in the language of the page); the name of the website is its rollover. Breadcrumbs start with
     Home too.
   - f) Full-screen menu colours: `overlayBg`, `overlayText` (website menu form, with Full screen), variables
     `--h-site-menu-overlay-bg` / `-text` copied from the menu to the overlay (it is outside the menu).
2. **Own style of the header and footer.** The palette on the root of the header / footer opens *Own style of the
   header / footer* (kind group). Stored in `styles.header` / `styles.footer` of the website record
   (`CmsRecordDocument.partStyle` / `setPartStyle`), written for `html.h-site .h-site-header|footer` (stronger than the
   header themes) by `compileCmsStyles(..., {parts})` = `StyleCompiler::compile(..., $partStyles)` / `StyleCompiler::PARTS`;
   the height is a minimum (as the page) and is not used when the header is shrunk or collapsed (style.css). Removed from
   *Navigation and layout*: header height, footer height, theme *Own colours* with its colour inputs. **Kept**: the
   header / footer theme (Default, Surface, Primary, Selected: colours of the website theme, also for links and
   headings) and the width of a vertical header (a column of the page grid). Old values: the server still writes
   `layout.header.height` / `colors`; opening the Own style of the part moves them into it (`_movePartLayout`:
   min-height, background-color, color; theme `own` removed).
3. **Shrink in the designer.** The preview is a page in its own frame and scrolls as one: `attachHeaderShrink` and
   Back to top run in the preview too (reveal stays off there: elements would be hidden while editing).
4. **Background images** chosen in the designer get `&fullres=1` (`url(...&file=KEY&fullres=1)`); older values stay.
5. **Reveal on scroll** is a select beside the Preset of the Own style (`styleRows` option `headExtra`), without the
   text "When it comes into the window"; content only.
6. **Action menu form**
   - a) The settings above the items are in one block (`.h-cms-action-settings`): labels 180px, controls up to 20em, a
     gap before the list; the social media form the same.
   - b) Items of a row and of drop-downs are not wrapped (`white-space: nowrap`); a tree (vertical, collapsed) still wraps.
   - c) *Drop-down menu* and *Icons behind a button* are one presentation **Behind a button** (`expand`): Name of the
     button (rollover), Icon of the button, *Show the name on the button* (`buttonText`), *Open the list* on hover (and
     a click, default) or on a click (`open: click`, class `h-site-menu-open-click`); style and orientation for all
     (vertical = a column below the button). A stored `dropdown` is read as expand + `open: click` + `buttonText` +
     vertical (`menuLook`, JS and PHP); the class `h-site-menu-dropdown` is not written any more (its CSS kept for built
     pages). Without an icon and without the name on the button: the default icon.
   - d) New presentation **Icons that show their name on hover** (`grow`, class `h-site-menu-grow`): an item with an
     icon shows the icon, its name slides out on hover / focus; an item without an icon shows its name; also in the
     social media form.
7. **Section menu.** On the home page (not in the menu tree), on a page of the first level without sub pages and on a
   page not in the menu it showed nothing (only Home with Show Home): now the pages of the first level without their
   sub pages (`sectionTree`, JS and PHP). *Pages* is the last option of the Menu form.

Tests: JS 1,785 pass (`siteExtras.test.js` review test: menu variables, Home, name on the button, grow, own style of the
header; section menu; designer and helper tests updated); heurist `WebsiteRenderTest` 101 (Home caption, former
drop-down, menu variables, section on the home page, own style of the header), `StoredTextTest` 117, `CmsFormatTest` 18
pass. 17 texts added (eng, fre).

### 12.1 Round 2 (2026-11-16)

1. **Line colour of the underline style lost.** The open collapsed menu (`HMenu._showPanel`) moves the list into a panel
   outside the menu, so the panel did not inherit the variables of the menu and the line took the text colour. The
   panel now copies the style attribute of the menu (as the full-screen overlay). The colours of the website
   (`var(--h-color-...)`) are allowed as menu colours too (`MENU_COLOR`, PHP the same).
2. **Breadcrumbs "not configured".** Mode path is stored as empty settings; the widget is in `READY_WIDGETS` of
   `cmsEdit.js` now. Path and History differ only on a record page after the visitor opened other record pages
   (History: Home › the record pages opened before › this record; Path: Home › section › this record); elsewhere,
   in the designer and without JavaScript both show the path.
3. **Search box parameters.** Only parameters a typed value fits (`searchParameters` in `savedFilterField.js`): a field
   of type freetext, blocktext, integer, float, year, numeric or date (the text of a term `f:N:label` and a count too),
   or the title, id(s), URL, notes, added and modified; not terms, places, record pointers, files, users or ranges.
   A source without such a parameter: a note in the popup.
4. **Icons without a style** get `fa-solid` (`faIcon()` in `cmsMenu.js` = `PageRenderer::faClass`): items, the button of
   Behind a button, the previews in the form (placeholder `fa-star`).

Tests: JS 1,786 pass, heurist `WebsiteRenderTest` 102, `WebsiteEditTest` 82 pass.

## 13. Navigation in the designer preview (2026-11-16)

Agreed 2026-11-16 (Artem: the menu of the preview did nothing): a link of a **navigation widget** opens its page in the
designer as a click on the page in the website tree (with the Save / Discard question of changes); links in texts,
Record cards and media keep selecting their element. Implemented 2026-11-16, not committed, no browser check.

- `CmsPreview`: the capturing click listener of the preview (links never leave it) asks `_navigationTarget(link)`: a link
  inside `.h-site-menu, .h-site-menu-overlay, .h-site-breadcrumbs, .h-site-logo, .h-site-title` (`NAVIGATION_LINKS`),
  not `data-h-action` (Add record, Back) and not a new tab; its page by `previewPageOf(href, {database, siteId})` (pretty
  URL `/{db}/site/{site}[/{page}[/{record}]]` or `?db=&site=&pageid=&rec=`, same database and website; Saved filter
  query and language ignored). Then option `onNavigate({pageId, record})` instead of the node selection; the event is
  not stopped (HMenu closes its full-screen menu).
- `CmsDesigner._navigate`: no page = the Startup page (`layout.startPage`) when it is a page of the website, else Home;
  the id of the website = Home itself (the server writes it in links when there is a Startup page: *Enter site* of a
  Cover page, fixed 2026-11-16); a page of the website tree = `_selectSiteItem('page:ID')` (from the header / footer too: the
  content of the page opens); the open page: nothing; a page not in the tree: a flash message. The record of a record
  page link is not used (the designer edits the record page itself).
- `siteRuntime.draftPageUrl`: a draft action menu (re-mounted in the designer) gets the URL of Go to a page from the
  menu tree of the configuration (it had `#`); Saved filter / Search box items of a draft stay `#` (the server-written
  menu of a loaded preview has their links).
- Help line of the Page tab; 2 texts (eng, fre). No server change.

Tests: JS 1,788 pass (`cmsDesigner.test.js`: previewPageOf, navigation links, draftPageUrl, `_navigate`).

### 13.1 Language switch of the page in the preview (2026-11-16)

Bug: the drop-down of the website's language switch (`HLangSwitch`) did `location.assign(url)` — the page in that
language without `design=1`, so the preview lost the designer. Now `CmsPreview` stops the `change` of a
`.h-site-lang select` in the capture phase (before the switch's own listener) and gives the code
(`data-h-lang-code`) to the designer, the links of the switch (`a[hreflang]`) the same; option `onLanguage` →
`CmsDesigner._previewLanguage(code)` = the Language of the preview toolbar (`this.languageSelect` follows,
`_loadPreview()` with `design=1&lang=`). Unknown or shown language: nothing.

Swap / scroll navigation in the designer (question 2026-11-16): not needed. The preview never starts the navigator; a
menu link opens its page in the designer (§13), so the trees, the draft and Save always belong to the page shown. A swap
inside the preview would show another page than the one edited. Swap / scroll are seen on the site or with View page.

## Verification
- JS: `npm run test:shared`, `npm run test:website` (new tests for `menuClass`, tab orientation, shrink thresholds,
  validator values); architecture test.
- PHP: `php tests/WebsiteRenderTest.php`, `php tests/CmsFormatTest.php` (fixture with new attributes),
  `php tests/WebsiteEditTest.php`.
- Build and deploy `website`; browser check on test site 207627 in osmak_mapping: each menu style, expand menu on
  mouse and touch emulation, vertical tabs at 1200 / 600 px, shrink header scroll up and down, designer preview unchanged.
- Record decisions and deviations in the 27k plan; update CLAUDE.md *Current work*.
