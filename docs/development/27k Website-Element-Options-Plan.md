# 27k Website element options (menu styles, vertical tabs, header shrink, full-screen menu, extras)

**Status (2026-11-15):** discussed and agreed with Artem (questions answered 2026-11-15). **Phase A (§1-2)
implemented** in both repos (§7): not committed, no browser check. Next: B (§3) → C (§4) → D (§5) → E (§6).

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

## Verification
- JS: `npm run test:shared`, `npm run test:website` (new tests for `menuClass`, tab orientation, shrink thresholds,
  validator values); architecture test.
- PHP: `php tests/WebsiteRenderTest.php`, `php tests/CmsFormatTest.php` (fixture with new attributes),
  `php tests/WebsiteEditTest.php`.
- Build and deploy `website`; browser check on test site 207627 in osmak_mapping: each menu style, expand menu on
  mouse and touch emulation, vertical tabs at 1200 / 600 px, shrink header scroll up and down, designer preview unchanged.
- Record decisions and deviations in the 27k plan; update CLAUDE.md *Current work*.
