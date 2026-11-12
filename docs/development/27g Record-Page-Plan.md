# 27g Record page (plan 27, follow-up of 27f)

**Status:** agreed 2026-11-11 (Artem). **Phases 1-3 implemented 2026-11-11** (server §5, record links §6-7, cosmetics and
runtime §8), not committed, no browser check. Phase 4 (later): HTTP caching, sitemap.xml, RecordView element, field popup
source *Record of the page URL*.

Scope: a page of a v4 website that shows the content of any record, independently of Explorer or other modules. It is
the target of the action menu action *Record page* (disabled since the 27f review 2026-11-11) and later of the cards /
gallery action *Open record page*.

## 1. Background (code, 2026-11-11)

- v4 pages are dynamic: `srv/Controller/WebsiteController.php` renders each request (`PageRenderer::render`,
  `Cache-Control: no-cache`); only the ZIP export (job `website-build`) is built.
- The Record cards widget renders a Smarty template per record on the server (`PageContent::cards` →
  `services['render'](file, recId, language)`, wrapper `.h-site-card`); settings: manual ids or a query, template,
  presentation, action.
- Swap / scroll navigation (`apps/website/src/siteNavigator.js`) knows only `site.pages` (`PageRenderer::pageList`).
- Page URLs: `SiteUrls::page()`. Hidden menu items: class `is-menu-hidden` (27f §13.6).

## 2. Decisions (Artem, 2026-11-11)

- a) **Dynamic**, as all v4 pages. In the ZIP build, record page links go to the live server.
- b) The main content is written by the server (indexed by crawlers). Header and footer as on any page (the page hide
  flags still apply). The page gets `<title>` = record title, `meta description`, `canonical`; 404 + `noindex` when
  the visitor may not see the record or no record id is given.
- c) An **ordinary CMS page** with predefined content: the **Record cards widget** in a new mode *the record of the
  URL* (`mode: 'url'`; the widget already has `mode: manual | query`), template = a one-record Smarty report. Several record pages per website, each with its own
  template. RecordView on a record page: later, optional.
- d) URL `/{db}/site/{site}/{page}/{record}` (parameter form `&rec=`).
- e) No server cache in phase 1; later `ETag` / `Last-Modified` from `rec_Modified`.
- f) Scroll (one page) mode: a hidden page or a record page is shown alone (as in swap); Back returns to the scroll
  position.
- g) Action menu action **Back** (history back; without history: Home). In the record page preset.

### 2.1 A record page must exist before an action points to it

The action stores `{page, record}`. When the website has no record page, the Record page action of the action menu
form shows **Create record page**: a page from the preset (hidden in the menu; heading = the `record.` title field,
Record cards in URL mode, Back action) is added and selected. Its template is chosen in the Record cards form of that
page (until then the page shows *Choose a template*). The record is chosen with the record picker (Browse).

### 2.2 How record pages are recognised

A page is a record page when it **contains a Record cards widget in URL mode**, computed on the server from the
instances of the page (no extra flag to keep in sync). The website summary (`meta.website` pages) gets `record: true`
and the template name. Then:
- action *Record page*: a select of record pages only (title + template), then the record picker;
- action *Go to a page*: record pages are left out (they need a record id);
- designer page tree: an icon for record pages;
- `pageList` for swap / scroll: record pages flagged, matched by the URL prefix `/{page}/`.
A link without a page (cards / gallery action *Open record page* without a choice) uses the first record page.

## 3. Phases

1. **Server:** record id in the URL (`WebsiteController`, router, `SiteUrls::page(..., $recordId)`), the record in
   the page context (visitor access), Record cards `mode: 'url'` (`PageContent::cards` takes the context record),
   `record.` field source of `data-h-field`, title / meta / canonical / 404, `record` flag of pages in the summary.
2. **Designer:** Record cards form mode *Record of the page URL*, record page preset, *Create record page* in the
   action form, Record page action enabled (page select + record picker), Back action, page tree icon.
3. **Runtime:** HMenu / `actionMenuItems` for `recordPage` and `back`; the navigator handles hidden and record pages in
   swap and scroll modes.
4. **Later:** HTTP caching, sitemap.xml, cards / gallery action *Open record page*, RecordView element.

## 4. Verification

`tests/WebsiteRenderTest.php` (record URL renders the card, title / canonical, 404 for a non-visible record and for a
missing id, `record` flag), `tests/WebsiteContentTest.php` (cards URL mode); JS tests for the action form, HMenu
`back` / `recordPage`, navigator swap / scroll with record pages; `npm test`; browser check in reload, swap and scroll.

## 5. Phase 1 implementation (2026-11-11)

- Router (`hserv/controller/RequestRouter.php`, action `site`): a third numeric segment = `rec`.
  `WebsiteController::showPage` passes it to `WebsiteService::context(id, page, lang, recordId)`; a record page
  without a record is 404 for visitors (the designer preview opens it: the widget shows a note).
- `WebsiteService::context` returns `recordPage` and `record` (`WebsiteRepository::record`, visitor rights); 404 for a
  record id on a page that is not a record page, and for a record that does not exist or is not visible.
- Record page = `CmsValidator::recordCards(config)` (first cards widget with `mode: 'url'`), used by PageRenderer
  (`isRecordPage`, cached per page), WebsiteEditService (`pages[].record`, `pages[].template` of the summary).
- `PageContent`: field source `record.` (also in `CmsValidator`, `cmsDocument.js`; `CmsRecordReferences` ignores
  it); cards in mode `url` render the record of the URL; notes `.h-site-note` *Choose a template of the record page* /
  (designer) *The record of the page URL is shown here*.
- `PageRenderer`: `<title>` = plain `rec_Title` – site title, `meta description` from DT_SHORT_SUMMARY (300 chars),
  `link rel=canonical`; language links keep the record (`selfUrl`); record pages are left out of website menus
  (`withoutRecordPages`, also the designer's menu), flagged in `site.pages` (`record`, also `hidden`);
  `h-site-config` `site.recordPage` / `site.record`. Action menu: `recordPage` (`target` = page, `record` = record id;
  left out when the page is not a record page or no record is given) and `back` (`data-h-action="back"`, href = home).
- `SiteUrls::page(id, page, lang, recordId)`: `/{db}/site/{id}/{page}/{record}` or `&rec=`; a built site links record
  pages to the live server. `WebsiteBuilder` skips record pages.
- Tests: `WebsiteRenderTest.php` (75 pass): context, title, canonical, action items, website menu, 404s, SiteUrls.

## 6. Phase 2: record links (agreed with Artem 2026-11-11)

| Element | Actions |
|---|---|
| Record cards | None, Open record URL, Open record page, Saved filter (disabled) |
| Record field (source *A record* only) | same |
| Media element, Media gallery (Type *Any record* only) | None, Player / Viewer, Open record URL, Open record page, Saved filter (disabled) |
| Action menu | Record page: record page select + Create page + record picker; Back |

Stored: `action: 'none' | 'url' | 'recordPage' | 'viewer' | 'savedFilter'` (`url` = rec_URL in a new window, the
existing cards value) and `recordPage: <page id>`.

- *Open record page* shows **Record page [select] [Define new record page]**: the select lists the record pages of the
  website (title · template); *Define new record page* is a **small popup** **Smarty report [select] [Create page]**
  that creates a page with one Record cards widget (`mode: 'url'`, the report) at the top level of the menu (record
  pages are not shown in website menus), titled by the report name, and selects it.
- Links are **real `<a href>` written by the server** at request (crawlers follow them; site, page, language, domain
  right; rec_URL read live): a stretched link `.h-site-rec-link` over cards, gallery figures (`data-h-rec` written by
  the designer) and media elements (`config.media` action); a Record field element with `data-h-link="url"` /
  `"page:<id>"` gets its value wrapped in a link. Old cards with `action: url` keep working.
- Record cards form: Type *Record of the page URL*. Page tree: icon for record pages.
- Fix of Phase 1: the purifier (`StoredText::fieldReference`) accepts `record.`.
- Later: field popup source *Record of the page URL* (needs a record type to offer fields).

## 7. Phase 2 implementation (2026-11-11)

- **Shared piece** `apps/website/src/designer/recordPageField.js`: `recordActionTerms` / `recordActionFields` (radio
  action + Record page select, `showWhen` per form), `recordActionValues` / `recordActionSettings` /
  `recordActionIssues`, `recordPageTerms(site.pages, templateTerms)`, `openNewRecordPageForm` (popup *Define new record
  page*: Smarty report + *Create page*), `attachNewRecordPage(edit, services)` (the button beside the Record page field
  of an HEditForm), `recordPagePicker` (select + button, action menu form).
- **Forms** (`widgetForms.js`): cards (Type *Record of the page URL* = `mode: 'url'`, actions), Record field (actions
  for source *A record*, stored as `data-h-link` by `CmsRecordDocument.setFieldLink`; `setField(null)` removes it),
  media element and gallery (two action fields: `action` None / Player for Media records and Files, `recordAction`
  for Any record; `mediaActionValues` / `mediaActionSettings`; old `player: true` kept). Saved filter is a `disabled`
  term: new HEditForm term flag (radio / checkbox lists, `HInputEnum`, `editFormSchema`, Edit-Form-Format.md).
- **Action menu** (`actionForms.js`): Record page (record page select + Define new record page + *Choose the record*
  with `browseRecords`, stored `{action: 'recordPage', target: page, record}`, both required), Back (label *Back* when
  empty), Saved filter disabled; *Go to a page* lists no record pages (`sitePageList(site, 'Home', {records: false})`).
- **Designer** (`CmsDesigner.js`): services `recordPageTerms`, `templateTerms`, `createRecordPage` (`POST /page/0` with
  `cmsPageStarter('record', title, {template})`, `assign` at the top level, summary reloaded), template names loaded
  once (`_loadTemplateTerms`); page tree icon `fa-id-card` for record pages; gallery figures of Any record get
  `data-h-rec` (`buildCmsGalleryItem` option `record`).
- **Server**: `PageContent::recordLinks` (stretched `<a class="h-site-rec-link">` with the record title in a hidden
  span; rec_URL only http(s) / mailto / `/`), `linkRecords` (gallery figures), `fieldLink` (Record field, reference to
  a record only); cards append the link (no `data-h-url` any more); `PageRenderer`: `context.recordPageUrl` (only to a
  record page of this website), `linkMedia` (media elements of Type Any record), `CmsHtml::fill` passes `data-h-link`;
  `WebsiteRepository::recordHeads` (title + rec_URL, visitor rights) replaces `recordUrls`; purifier: `record.`
  references (Phase 1 gap), `data-h-link` (`url|page:<id>`), figure `data-h-rec`. CSS `.h-site-rec-link` in
  `apps/website/src/style.css` (links and players of the element stay above).
- Tests: `WebsiteRenderTest.php` 83 pass (links, purifier); JS 1,711 pass (forms, preset, field link, gallery,
  disabled term). Bundles website and explorer deployed.

## 8. Cosmetics and Phase 3 (2026-11-11)

Cosmetics (Artem): more space between the help and the select of *Define new record page*; the button is an icon with a
tooltip right after the Record page select, always shown; a Record field with a link shows an external link icon
after its value (`.h-site-rec-link-icon`, written by `PageContent::fieldLink`).

Phase 3 (runtime):
- **Navigator** (`apps/website/src/siteNavigator.js`): views instead of page ids: a page (`key` = id) or a record on a
  record page (`key` = `{page}/{record}`, `viewOf(url)` matches `{page url}/{record}` and `&rec=`), entries, sections
  (`data-h-record`, written by PageRenderer) and history states (`hPage`, `hRecord`) by view. Swap: a record view is a
  page of its own (cache by view). Scroll: hidden and record pages are not sections of the long page; they are shown
  alone (`h-site-page-alone`, `this.alone = {from, scrollY}`), the scroll handler waits, going back to a page of the long
  page restores the scroll position; views shown alone above the cache are removed.
- **Back** (`siteRuntime.onAction`): `history.back()` when the visitor came from this website (referrer of the same
  origin, or a navigator state), else the link opens (the home page).
- **Designer draft**: `actionMenuItems` shows Record page and Back items.
- Tests: `siteNavigator.test.js` (record views, `&rec=`, scroll alone + scroll position), `helperWidgets.test.js`
  (Back, draft items), `WebsiteRenderTest.php` 84 pass (section `data-h-record`, field link icon). JS 1,716 pass.

## Cosmetics 2026-11-12 (Artem; done, not committed, no browser check)

1. Record field form: no line above the value of the field (`.h-cms-field-value`); help on top (`FIELD_HELP`).
   Define new record page: a square icon button in every form (as high as the select beside it; compact in the
   action menu form).
2. Media element: label *Source* (was Type), *Media record*, *File* (the gallery keeps the plural); help on top
   (`MEDIA_HELP`).
3. Define new record page popup: short *Smarty report* caption, wide select.
4. Record cards: label *Source*; for *Record of the page URL* no Action (saved as `none`) and no Presentation
   (saved as `list`); Manual pickup with one record: no Presentation; help on top extended (`CARDS_URL_HELP`).
   Help texts do not mention the saved filter action (still disabled).

Round 2 (2026-11-12, not committed, no browser check):
1. Menu tree depth 10 (was 3: pages of the fourth level were not read; `WebsiteRepository::MENU_DEPTH`).
2. Designer toolbar: *Open* (the website in a new tab at the selected page; a record page: the home page).
3. Footer of a new website: copyright, powered by, hosted at in one row of equal columns (grid, gap 12px, centred;
   one column on narrow screens), as the footer composer.
4. Media element: *Source record* / *Source file* (the gallery: plural).
5. New record page: an action menu with Back (links, arrow icon) above the Record cards; the Record cards have padding
   20px; DT_CMS_MENU_FORMAT = TRM_HIDDEN_ITEM.
