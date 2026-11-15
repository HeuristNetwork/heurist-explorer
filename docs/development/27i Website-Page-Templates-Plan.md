# 27i Website page templates (plan 27, phase 4 leftover of 27c §27 / 27e §12)

**Status:** agreed 2026-11-12 (Artem). Phases A and B implemented 2026-11-12 (§8). **Rework 2026-11-13 (Artem): phase D
(Add page form, templates, page as root group, grid, placeholders, background video, §9) and phase E (inline page
editor, §10) implemented in both repos, not committed, no browser check.** The per-template form of §2-§8 is replaced
by §9. **Review 2026-11-14 (§11, implemented, not committed, no browser check):** Add page in one popup, the inline form
keeps only Own style (+ caption of a group), popups for everything else; phase F (popup mode) dropped. Blog / news and the
starter pack: phase C, to discuss.

## 1. Background

*Add page* of the CMS designer lists 11 templates. Blank, Team (27e) and Record page (27g) build real content; Cover,
Landing, About, Features, Discover, Blog, Contact and Publications are `pending` (a blank page). Request (Artem,
2026-11-12): templates like the *Footer composer* (27f §3.2): a short form when the page is added, then ordinary
elements edited in the page tree. Samples: the MBH cover page (title, logo, Enter, video background), the Parramatta
acknowledgement page (no background, a flag instead of the logo).

## 2. Decisions (Artem, 2026-11-12)

1. **One form, once.** A template with options opens a form (HEditForm) after *Add page*; the page is built from it
   and then edited in the tree. The form is not opened again (reading a changed page back into a form is not reliable).
   Every value is optional: an empty value gives a placeholder, an empty media element is filled from the tree.
2. **Features are static blocks:** image, title, text and a link to a page, as cards in a grid (no records).
3. **About:** the user ticks topics; each ticked topic is a section.
4. **Cover background:** an image or a video, through the new media option *Background of the group* (§4).
5. **Blog / news:** to discuss later (activity low: report or cards; active: featured + history; high: Explorer with a
   filter form). Stays `pending`.

## 3. Flow

`CmsDesigner._addPage`: `openAddPageForm` (template, title) → `openTemplateForm(template, ...)` for templates with a
form (`apps/website/src/designer/templateForms.js`; Cancel cancels Add page) → `cmsPageStarter(template, title,
{values, media})` (builders in `shared/src/site/cmsPageTemplates.js`, on `CmsRecordDocument`) → `POST /page/0`, `assign`.
Cover and Discover may set the page flags `hideHeader` / `hideFooter` (`layout` of the page configuration, 27f).
Starter texts in English and French (by the first language of the website).

## 4. Media option *Background of the group*

Media setting `background: true` (media form, `CMS_MEDIA_DEFAULTS`, validators JS + PHP). `buildCmsMedia` writes
`<figure class="h-site-media-bg">` with an `img`, or a `video autoplay muted loop playsinline` with the thumbnail as
poster. CSS (`apps/website/src/style.css`): the parent group `position: relative; overflow: hidden; isolation: isolate`,
the figure `position: absolute; inset: 0; z-index: -1`, img / video `object-fit: cover` (the MBH effect).

## 5. Templates

| Template | Form | Page |
|---|---|---|
| Cover (A) | title, subtitle, logo, welcome text, Enter caption + page, background file (image or video), hide header and footer | full-height centred group: background media, logo, title, subtitle, text, action menu (buttons) with one item. Acknowledgement: no background, a flag as logo. |
| Discover (A) | intro text, hide footer | heading, text, Explorer element of large height |
| Contact (A) | address, contact details, social links yes / no, email form inline / button | heading; two columns: address + contact, email form; social widget below |
| Publications (A) | intro text | heading, text, Generated Report element (its form opens after Add page) |
| About (B) | topics: Origins / history, Description, Aims and methodology, Sources of data, Acknowledgements, Heurist; an image per topic | a section per topic: heading + starter text and image in two columns, sides and background (page / surface) alternate |
| Features (B) | number 2-4, a page per feature | heading, grid of N cards: media, title, text, link |
| Landing (B) | banner, big image, intro text, slider files, buttons to pages, features 0-4, featured news | banner; image + text beside a gallery slider; buttons; features block; Record cards "Featured news" (configured later) |
| Team, Record page | — | done (27e, 27g) |
| Blog | — | to discuss |

## 6. Phases

- **A.** Framework, media background, Cover, Discover, Contact, Publications.
- **B.** About, Features, Landing.
- **C.** Blog / news after the discussion; a starter pack for a whole website (e.g. *New website* offers Cover +
  Landing + About) later.

## 7. Verification

JS: `shared/test/cmsPageTemplates.test.js` (each builder, full and empty values), form tests, catalog test, cms-v4
fixture for `background`; `npm test`. PHP: `CmsFormatTest`, `WebsiteRenderTest` (background video keeps its
attributes). Build and deploy website + explorer. Browser: Artem.

## 8. Implementation notes (2026-11-12; superseded by §9 where they differ)

Phases A and B together (they share the helpers).

- **Builders.**
  - File `shared/src/site/cmsPageTemplates.js`: `buildTemplatePage`, `CMS_TEMPLATE_PAGES`, `CMS_ABOUT_TOPICS`, and the
    starter texts in eng / fre (`cmsTemplateTexts`).
  - `cmsPageStarter` delegates to it and returns `configure` (nodes whose form opens after Add page: the Generated
    Report of Publications).
- **Forms.**
  - File `apps/website/src/designer/templateForms.js`: `templateFormFields`, `templateValues`, `templateFiles`,
    `openTemplateForm`. The help is on top. The button is *Create page*.
  - Files are chosen as registered files (record manager, as in the media form). They are read when the form is closed
    (`_mediaItems`): images only; image or video for Background and Slideshow.
- **Designer.** `CmsDesigner._addPage`: Add page, then the form, then the starter, then `POST /page/0` and `assign`,
  then the configuration of `configure`. `_templateMediaHtml` and `_galleryHtml` make the media HTML.
- **Media background.**
  - `settings.background` and the class `h-site-media-bg` (`CMS_MEDIA_BACKGROUND_CLASS`, set by `setMedia`).
  - `buildCmsMedia`: a video with `autoplay muted loop playsinline preload` and the thumbnail as poster; an image
    without size and caption.
  - CSS in `apps/website/src/style.css`.
  - Checkbox *Background of the group* in the media form.
  - Validators JS + PHP (`background` true / false), fixture `shared/test/fixtures/cms-v4/media-background.json`.
  - Purifier: `StoredText` allows `autoplay|muted|loop|playsinline` on `video` (the output is the same as the JS).
- **Catalog.** Only Blog is `pending`. New descriptions for Cover, Landing, About, Discover (the preview is now one
  Explorer), Contact and Publications.
- **Differences from the plan.**
  - A media element is left out when its file is not given: an element without a file would be a validator warning.
  - The Features form asks only for the pages. The images and texts come from the tree.
  - The Landing features are cards without links.
  - Cover with a background gets light text with a shadow.
  - Discover: the Explorer element is 80vh high. Its configuration is done from the tree.
  - Labels made from a number or topic ("Feature 2 opens", "Image: ...") are not translated.
- **Tests.**
  - JS: `shared/test/cmsPageTemplates.test.js` (5), `apps/website/test/templateForms.test.js` (3), and the catalog and
    media form tests updated; `npm test` 1,734 pass.
  - PHP: `CmsFormatTest` 16, `StoredTextTest` 105 (background video kept), `WebsiteRenderTest` 84 pass.
    `WebsiteContentTest --site=204892` 41 pass; its 2 failures expect the titles of the deleted test website 207627
    (test data).
- **Builds.** The website and Explorer builds are deployed.

## 9. Rework 2026-11-13: Add page form and templates (phase D)

Review by Artem: the form asked once per template was the wrong idea; the effort goes into everyday editing (§10).

### 9.1 Decisions (Artem, 2026-11-13)

- **Add page form** (after Title + template): two parts. (i) The prominent fields of RT_CMS_PAGE: Name (translations),
  Description / menu rollover (DT_SHORT_SUMMARY), Icon (DT_THUMBNAIL), Menu item (DT_CMS_MENU_FORMAT), Hide header,
  Hide footer; the same form is the page form of the page editor (§10). (ii) The proposed elements of the template
  (checkboxes, all ticked) and a few options. (iii) A preview of the positions: later, when the elements are settled.
- **Every element gets a first value** (no empty places): the title, subtitle, logo and summary of the website, starter
  texts, placeholder images (`assets/cms/placeholder_logo.png`, `150x150.png`, `600x400.png`), random banners
  (`assets/cms/banners/`).
- **A. Groups are grids**, not flex boxes. One column centred = grid + `justify-items: center` + `align-content: center`.
  Horizontal alignment of the content of all columns = `justify-items` (new in the whitelist and in Own style > Grid:
  *Column alignment*); the rows together in a tall group = `align-content` (*Rows in the group*).
- **B. The page is the root group:** its own style `styles.page` (same shape as a node style, with `medium` / `narrow`),
  compiled for its section `.h-site-page[data-h-page="{id}"]` (no scope prefix; JS `compileCmsStyles` option `page`,
  PHP `StyleCompiler::compile` parameters `$pageStyle`, `$pageId`; validator; PageRenderer gives the style of the page
  record, the website record on the home page). Cover puts its content straight into the page.
- **C. The media option *Background of the group* is removed** with its code (class, CSS, validators, form field,
  fixture). A banner is the background image of a group (Own style > Background: position, repeat, size).
- **D. Background video** of a group: Own style > Background > *Video* (video files only), the group attribute
  `data-h-bg-video="{file key}"` (purifier: a file key only). The site runtime (`enhanceBackgroundVideos`, also in the
  preview and the navigator) adds `<video class="h-site-bg-video" autoplay muted loop playsinline>` as the first child; CSS
  puts it behind the content. The background image of the group stays as its poster.

### 9.2 Templates

| Template | Elements (checkboxes) / options | Page |
|---|---|---|
| Cover | Title, Subtitle, Logo, Welcome text, Enter button, Background; Hide header / footer ticked | page style: grid centred, 100vh, random banner, light text; logo (website logo or placeholder); h1 title + subtitle; summary; buttons *Enter site* to Home |
| Landing | Banner, Image, Introduction, Slideshow, Buttons, Features, News | group 300px with a banner and the website title; logo + summary beside a slideshow of 3 banner placeholders; buttons About / Explore (no target); Features = Record cards in 3 columns; News = Record cards |
| About | the topics (column of checkboxes) | a section per topic: text + placeholder 600x400, sides and surface colour alternate |
| Features | Number 2-6, Orientation List / Columns | cards (group on `--h-color-surface`): caption h3 (group caption), placeholder 150x150, text; 3 columns or a list |
| Team | Introduction (*Project Team* ...), Take data from database; yes: records + template (Team member chosen); no: number + orientation | database: Record cards of the records; else the Features layout with a role line |
| Discover | Introduction | text + Explorer 80vh (filter selector later) |
| Contact | Address, Contact, Email form, Follow us | address + contact left, email form inline right (two columns only with both sides); Follow us = social menu with Email |
| Publications | Introduction | unchanged |

Blank, the column presets and Blog get the page part of the form only.

### 9.3 Implementation (2026-11-13)

- `shared/src/site/cmsPageTemplates.js` rewritten: `CMS_TEMPLATE_ELEMENTS`, `CMS_PLACEHOLDERS`, `CMS_BANNERS` (a test
  compares it with the folder), `pickBanners`, `CMS_TEAM_TEMPLATE` (moved here, re-exported by `cmsEdit.js`); Team is a
  template, not a preset. `cmsPageStarter` takes `layout` (hide flags).
- Media setting `placeholder` (`CMS_ASSET_NAME`, JS + PHP): `buildCmsPlaceholder`, `cmsAssetUrl` (`cmsMedia.js`); the
  missing file is no warning while it is set; the media form clears it. The gallery of Landing has placeholder figures
  in its stored HTML (`ids` empty).
- Assets moved from `apps/explorer/public/assets/cms` to `apps/website/public/assets/cms` (URL
  `{baseUrl}hclient/bundles/heurist-website/assets/cms/...`, allowed by the url rule of background images).
- Form: `apps/website/src/designer/templateForms.js` rewritten (`templateFormFields`, `templateValues`,
  `teamTemplateTerms`, `openTemplateForm`); page fields by `createWebsiteFieldsForm` with `type: 'page'`,
  `PAGE_FIELD_KEYS`, `initial` (`apps/website/src/manager/websiteFields.js`). `CmsDesigner._addPage` sends the page fields
  with `POST /page/0`; `_templateSite` (website values, logo file), `_templateBuilders`.
- Own style: grid fields `justify-items`, `align-content`; Background *Video* (`styleRows` option `video`); an image that
  is not a registered file shows its URL. Own style of the page: in the page form (§10).
- Differences: the root of the header / footer has no page style; a background video on the page itself is not done
  (groups only). The Landing features / news cards have no records until they are chosen. Element labels are
  translated; the starter texts are eng / fre as before.
- Tests: `shared/test/cmsPageTemplates.test.js` (10), `apps/website/test/templateForms.test.js` (3), fixture
  `page-style-placeholder.json` (replaces `media-background.json`), runtime test of the video; PHP `CmsFormatTest` 16,
  `StoredTextTest` 107, `WebsiteRenderTest` 85, `WebsiteEditTest` 81 pass.

## 10. Inline page editor (phase E, 27c follow-up, 2026-11-13)

### 10.1 Decisions (Artem, 2026-11-13)

- Two modes: inline (now) and popup (phase F: draggable / resizable dialog, Dock / Close, Prev / Next; to discuss).
- Inline: the part tree and the form of the selected element, right of the tree when the west pane is wide (tree at most
  300px), below it when it is narrow. Undo / Redo / Discard / Save below the tree, first *Popup* (disabled until F), last
  *Close*. Close hides the form, it does not discard; Save saves the page as before.
- The form opens with the pen of the tree or a double click; selecting another element applies the last input and
  loads the form of the next one.
- Content: the page (root): its fields (§9.1 i) + Own style; a group: Caption + Own style; a text: its popup as before
  (the form shows *Edit text* and Own style when a text is selected); media, widgets, modules: Configuration + Own style.
  Labels above the inputs in a narrow form (HEditForm `labelPos: 'auto'`).
- Changes apply to the preview at once, without the server: a style only recompiles the styles of the preview
  (`CmsPreview.restyle`); a caption or a configuration replaces the parts in the preview (instances with unchanged
  settings stay mounted); Record cards and Generated report fetch their output as before.
- Add element keeps its popups; a new Text opens Edit text at once.

### 10.2 Implementation

- `apps/website/src/designer/designerInline.js`: `createFormPanel` (title, Close, tabs), `captionInputs`,
  `hideFlagInputs`, `popupLine`; `FORM_SIDE_WIDTH` 600 (ResizeObserver on the page panel, class `h-cms-form-side`).
- `CmsDesigner`: `_openForm`, `_closeForm`, `_flushForm`, `_formSections`, `_styleSection`, `_captionSection`,
  `_pageFieldsSection`; `_formEdit(key, change)` (one undo step for the changes of one field less than 2 s apart;
  `stylesOnly` when HTML and instances are the same); `_changed({fromForm, stylesOnly})` draws the open form again after
  undo / redo / popups. Page fields wait in `record.fieldChanges` (dirty, sent with the next PATCH, cleared by Discard).
  The hide flags are a change of the draft, shown at once by `CmsPreview.setPageFlags`.
- `openEditFormDialog(options, map)`: inline mode `inline: {container, onResult, register}` (the form in a container;
  after each change and a pause of 400 ms the values are checked, `onAction('ok')` runs, `map` makes the result).
  Inline Configuration: media, gallery, Record cards, menu, language, email form. Popups (a button in the form): Record
  field, Generated report, action menu, social media, badges, modules (Explorer, map ...).
- Tree tools: one pen `form` (text: `edit`); the separate media / caption / configuration pens are gone (the buttons
  below the tree stay).
- Test: `apps/website/test/cmsDesigner.test.js` (form sections, undo steps, styles-only preview, page fields dirty);
  `npm test` 1,741 pass. Website and Explorer built and deployed.

## 11. Review 2026-11-14 (Artem)

### 11.1 Decisions

Add page:
- The hide header / footer flags are checkboxes at the very end of the form, offered for Cover only (ticked).
- Cover: default name *Cover* (was Welcome) and menu item *Hidden in main menu* (DT_CMS_MENU_FORMAT = TRM_HIDDEN_ITEM).
- No Title input. The form of the chosen template is shown in the Add page popup itself, beside the list (no second
  popup, no flicker), also for Blank (page fields only). The popup keeps its title *Add page* / *Add sub page*.
- Features: each card ends with an action menu *More* (links, page chosen later), as in phase A.
- Team: Orientation for the cards from the database too; *Take data from database* is a checkbox.

Page editor:
- Almost no configuration form fits the space beside / below the tree, so the inline form keeps only the **Own style**
  (a group or a panel: its caption above it). **Phase F (popup mode) is dropped.**
- Tree beside the form: 250px; the form at least 370px, so the form is right of the tree from a page panel of 620px
  (`FORM_SIDE_WIDTH`), else below it (at most 2/3 of the height).
- The selected-element bar below the tree (`h-cms-picker`) is removed. The bar is now: palette (opens / closes the Own
  style form; was the disabled Popup button), Undo, Redo, Discard, Copy, Paste, Layout (header / footer only), and on the
  right *Save Page*. No Close button in the bar.
- The form has no tabs and no head; Close is in its top right corner.
- Pen (gear for widgets and modules) and a double click open the popup of the element: Edit text, the page popup (root),
  Record field, Edit media, Caption of a group or panel, Configuration. The palette of a tree row opens the Own style form.
- Configuration popups: the button is OK (Apply for Record field, which writes the value to the record), never Save.

Site tree: the tool *Header and footer on this page* is removed (the flags are in the page popup).

Main menu:
- The description of a page (DT_SHORT_SUMMARY, *Menu rollover*) is the rollover of its menu entry in every format; without
  it an icon-only entry keeps its title as rollover.
- The icon image of a menu entry is not higher than the entry (1.4em; the rule of text images made it full size).

### 11.2 Implementation

- `designerDialogs.openAddPageForm({ title, createForm })`: catalog without Title, `detail(item, host)` puts the form of the
  item in place of its preview, `read(item)`; `formDialog` accepts an async `read`. `templateForms.createTemplateForm(host,
  template, ...)` (session `read` / `destroy`; replaces `openTemplateForm`), `templateInitialFields` (Cover: name +
  hidden menu item). `CmsDesigner._addPage` uses both; Record page keeps its next step.
- Page popup `designerDialogs.openPageForm` (page fields of websiteFields.js + hide checkboxes), `CmsDesigner._editPage`
  (fields wait in `record.fieldChanges` for Save Page; flags = change of the draft). `openPageLayoutForm` and
  `CmsDesigner._pageLayout` removed.
- `designerInline.js`: `createFormPanel` without head and tabs (`show(sections)`), `FORM_SIDE_WIDTH` 620; `hideFlagInputs`,
  `popupLine` removed. `CmsDesigner`: `_toggleStyleForm`, `_popupTool`, tree actions `page` / `style`; `_ownStyle` (Own
  style popup) and the picker removed.
- The inline mode of `openEditFormDialog` and of the widget forms (§10.2) is removed again: the files are as before 27i.
- Menu: `PageRenderer::menu` gives `description`, `menuRollover`; `HMenu` the same; CSS `html.h-site .h-site-menu-icon`.
- Banner `95-536x354.jpg` added to `CMS_BANNERS` (new in the folder).
- Tests: `cmsDesigner.test.js` (bar, tools, Own style form, Add page popup), `templateForms.test.js`,
  `cmsPageTemplates.test.js` (More, Team orientation), `helperWidgets.test.js` (rollover), PHP `WebsiteRenderTest` 86;
  `npm test` 1,743 pass. Website and Explorer built and deployed.

### 11.3 Open: where to keep the sample images

Asked by Artem: the placeholders (3 PNG, 15 KB) and banners (20 JPG, about 620 KB) are in the website bundle now, so in
every distribution. Options (to decide):
1. Keep them in the website bundle (now): simple, works offline; about 0.6 MB in every build.
2. Placeholders stay in the bundle (they are needed always); banners on the Heurist reference server, copied into the
   database as registered files (2-1106) when a template uses them (server side, existing `website/{id}/setup` action,
   no new endpoint); the page then refers to ordinary files the user can replace. Needs network access of the server;
   without it the page gets no background image. Recommended.
3. Banners as URLs of an external image service: no copies, but the page depends on that service and the url rule of
   background images allows Heurist URLs only.

### 11.4 Review 2026-11-14, round 2 (implemented, not committed, no browser check)

- Add page: the list and the preview of the template as before; *Add* hides both and shows the form of the chosen
  template in the same popup, the button becomes *Create page* (`catalogDialog` options `next` / `nextLabel`). Record page
  has no form: Add answers at once.
- While the Own style form is open the west pane is at least 380px (form 370px, `FORM_MIN_WIDTH`;
  `CmsDesigner._formWestMinimum`), back to 280px when it closes.
- Layout of the bar was always visible (`.h-btn` sets `display`): `.h-cms-pane-bar > .h-btn[hidden]`.
- Close of the Own style form moved left of the scroll bar.
- No palette on the rows of the part tree: the Own style form opens from the palette of the bar only.
- The height of a page (Own style of the page) is written as `min-height` (JS `cmsDocument.js`, PHP `StyleCompiler`,
  also for the medium / narrow screens): a fixed height let the content (Record cards) run over the footer.
- Banners: the folder now has 5 files (Artem), `CMS_BANNERS` follows.

### 11.5 Review 2026-11-14, round 3 (implemented, not committed, no browser check)

- Page tab: a second bar above the part tree: Copy, Paste, Layout on the left, a second Save Page on the right. The bar
  below the tree keeps Own style, Undo, Redo, Discard and Save Page (`CmsDesigner._renderPageBar`, `buttons.saveTop`).
- Website manager: after New website the CMS editor opens at once.
- Website manager: Delete website + "Delete its menu pages too?" did not delete the pages. The two questions use one
  dialog element; the late `close` event of the first question answered the second one with "Keep the pages"
  (`confirmDialog` in `manager/websiteForms.js` now ignores a close event while the dialog is open again).
  Then the two questions were united: "Delete the website?" with the checkbox "Delete its menu pages too" on the
  second row (`confirmDialog` option `checkbox`).

### 11.6 Review 2026-11-14, round 4 (implemented, not committed, no browser check)

- Website manager: no website and no standalone page yet: the New website form opens at once
  (`WebsiteManager.offerNewWebsite`, `WebsiteApplication.hasSites` / `siteListQuery`).
- Sticky header `z-index: 1200` (also the vertical header), fixed footer 1199: controls of the modules on the page
  were above it.
- The 16px side padding of the content moved from `.h-site-main` to `.h-site-page`: the own style of the page
  (background of a Cover page) reaches the edges, its own padding replaces the 16px; a page of one module has none.
- **Startup page** (`layout.startPage`, a menu page id; not given = the home page): selector in Navigation and layout
  (menu pages, not record pages). The website URL without a page shows it (`WebsiteService::context`, a page no longer
  in the menu is ignored, context key `startPage`); the home page then has its own id in the URL
  (`PageRenderer::url`, e.g. Enter of the Cover page, the home entry of swap / scroll); a build writes the Startup page
  as `index.html` and the home page as `{website id}.html`. The designer preview always loads the home page by its id.
  A new Cover page becomes the Startup page when none (or Home) is chosen, saved at once
  (`CmsDesigner._coverAsStartPage`; not when the website record has unsaved changes). Validators JS + PHP.

### 11.7 Review 2026-11-14, round 5 (implemented, not committed, no browser check)

- Part tree: a group has the palette instead of the pen; it opens its Own style (with the caption above). A panel of
  tabs / an accordion keeps the pen (caption).
- Edit text, TinyMCE: the buttons Media and Link to a record now work in the designer (`insertMedia` /
  `insertRecordLink` of `openTextTranslationDialog`). Media = Select File Resource (record manager of registered
  files), inserted as the media element writes it (`buildCmsMedia`: img, video / audio player, iframe of a service);
  other files: flash "Not a media file ...". Link = the action menu popup with one item (`openActionMenuForm` option
  `single`: Go to a page, Record page, Open a URL); the link is an absolute URL of the live website
  (`/site/{site}/{page}[/{record}]`; the home page by its id), so a built (ZIP) website links to the server.
- Action menu: an item without a label gets a default (page name, Link, Add, Record link, Back, Filter) instead of
  being dropped; no record page yet: only the button with the caption "Define new record page"; the record of a Record
  page item = HInputResource (`browseonly`, title and record type icon).

### 11.8 Review 2026-11-14, round 6 (implemented, not committed, no browser check)

- **Go to a page** (a page of the website: Home or a menu page, not a record page; select `page`, `sitePageTerms`):
  - Record field: source *A record* all actions, *This website* None / Go to a page (the action terms follow the source),
    *This page* none; stored as `data-h-link="goto:<page id>"` (`cmsEdit` accepts it). Server `PageContent::fieldLink` /
    `pageLink`: a stretched link over the element for a record or the website, without the external icon.
  - Media element (one element, every Type): `action: 'page'`, `page: <id>`; one Page field for both action fields
    (shown by code). Server `PageRenderer::linkMedia`. `context.pageLink(pageId)` = [url, name] or null.
  - Media validators (JS `CMS_MEDIA_ACTIONS`, PHP `MEDIA_ACTIONS`): none, viewer, url, recordPage, page (url /
    recordPage of 27g gave a warning before).
- Action menu, Record page: the record page and the record on two lines; the button Define new record page with its
  caption is as wide as its text; the record = HInputResource `addorbrowse` (record manager popup with Add).

### 11.9 Review 2026-11-14, round 7 (implemented, not committed, no browser check)

- Media element: **Alignment** Left / Center / Right in the media form (`settings.align`, centre / right only;
  validators JS + PHP); the figure gets `data-h-align` (`cmsEdit.setMedia`), CSS centres / right-aligns the media and
  its caption (a figure with Player / Viewer moves itself).
- Own style of a group, Caption: the rows of the Caption popup (`createTranslationForm` with the new `onChange` /
  `values()`): language badge, clear, Translate per translation, Add a language; applied while typing. The button
  Translate... (it opened the popup) and `captionInputs` removed.
- TinyMCE: align left / center / right / justify in the toolbar (a selected image floats or is centred; inline style,
  kept by the server).
- Link popup of the text editor: a control per line (Label, Icon, Action, Link to, New tab) in a narrow popup.
- Fix (same day): the server sanitizer (`srv/Utilities/StoredText.php`, HTML Purifier) removed `data-h-align` of a
  figure and `data-h-link="goto:<id>"`, and every style of an image. Now allowed: `figure[data-h-align]` (left / center
  / right), `goto:<id>` in `data-h-link`, and on `img` only the styles of the TinyMCE align buttons (`float`,
  `display`, `margin-left` / `margin-right` auto or 0, `vertical-align`); `StoredTextTest` 112 pass. Site CSS for a
  captioned image aligned in TinyMCE (`figure.align-left|right|center`). Caption rows in Own style: padding-left 14px;
  link popup: no gap in the icon box.

### 11.10 Review 2026-11-14, round 8 (implemented, not committed, no browser check)

- Action menu, Record page: the record input is HInputResource `addorbrowse` with `showBrowse: true` (without it the
  input fell back to the value picker over all records); the empty choice of the record page select = "Select Record
  page".
- Edit text popup (`HTextTranslationDialog`, also the record editor): Cancel, Escape and the close button ask
  "Discard the changes?" when a language text was changed.
- Website manager list: Open editor (a v4 website the user may edit) and Open in a new tab beside the format badge
  (`WebsiteManager.listTools` / `openRecord`; the tab is opened in the click, its URL from the summary).

### 11.11 Review 2026-11-14, round 9 (implemented, not committed, no browser check)

- **Header default set** (`.h-site-hset`): a flex row in the order of the part tree (was grid areas: the tree order was
  not respected). Every rule of the set and of its parts (logo, title, subtitle, brand, menu, language) is in
  `:where()`: a preset or an own style wins. The group kind default leaves the set out
  (`[data-h-control="group"]:where(:not(.h-site-hset))`, JS `CMS_KINDS` + PHP `StyleCompiler::KINDS`, fixtures).
  Two rows (`layout.header.rows`, screens <= 1024px): row 1 logo, title / subtitle and language switch, the menu below.
  <= 640px: no subtitle, title 1.2em. <= 375px: no title, logo, the menu button, then the language switch. Vertical
  header: a column in the order of the tree.
- Every header has `position: relative; z-index: 1200` (also a header that scrolls away: its menus over the modules).
- The button of a collapsed menu: the "3 bars" icon (`HMenu`, `PageRenderer`; title and aria-label "Menu").
- **New website**: the website fields first, then Languages, then **Pages** (Cover off; Home (Landing) on, disabled;
  About, Discover, Contact on). The editor opens and `CmsDesigner.addStarterPages` makes them: the home content =
  template Landing, the "About" page of the server is replaced by the chosen template pages (all their sections),
  Cover = Startup page. Page creation of Add page moved to `_createTemplatePage`.

### 11.12 Review 2026-11-14, round 10: module configurations in the designer (implemented, not committed, no browser check)

- Module forms (Explorer, Map, Timeline, Graph, Data, Record View) are inline below the page tree (gear of the instance),
  with Reset and Apply (one undo step; Save Page saves). Widget forms stay popups. Bridge `createConfigurationPanel` /
  `createExplorerInstancePanel` (docs/integration.md); without them the popups as before.
- Explorer instance (website mode): no Language (the page's, `auto`), no "Current query" (a page that has it keeps it),
  Layout of the presentation modules (`explorerLayoutEditor.js`, shared with the Explorer configuration dialog, no tools).
  A new instance takes the current Explorer view; a configured one keeps its settings and state unless "Use the current
  Explorer view" is clicked. `settings.layout` is rebuilt from the layout (`websiteLayoutList`).
- The modules of an Explorer instance are child items of its node (`explorerModules.js`, id `<node>/module:<type>`):
  gear only, not dragged; Apply writes `settings.modules[type]` and its layout items.
- Website defaults of the module forms: plan 29 §19. HFilter on a published page: a query source has its DT_NAME in
  the page language (`valueInLanguage`, `QuerySourceManager` names); saved filters keep their name (no translations yet).

### 11.13 Review 2026-11-14, round 11 (implemented, not committed, no browser check)

- New website, starter pages: the server's About page is filled with the About template (PATCH, `_fillTemplatePage`)
  instead of deleted first; it was the only page of the top menu ("Top level menus is required" stopped everything).
  Cover goes first in the menu (`assign` index 0); an About that was not chosen is removed after the other pages exist;
  each step reports its own error.
- Empty Website manager: New website is offered after `initialize`, not after the list; a failed count is logged
  (`console.warn`). The cause was not reproduced without a browser.
- Landing: three static feature cards (as Features, with More) instead of an empty Record cards widget
  (`addCards(..., parent)`).
- Header logo: `data-h-link="goto:home"` (the home page; JS `setFieldLink`, StoredText, PageContent, the field form).
- **Header default set as own styles** (`CMS_HEADER_SET_STYLES` in cmsEdit.js = `WebsiteStarter::HEADER_STYLES`):
  the designer edits the header as any page. New own-style screen **Small (≤ 375 px)** (`SCREENS.small`, JS and PHP,
  fixture `screen-small.json`): no title, the menu button before the language switch. Medium: the menu below the logo,
  title and language switch; Narrow: no subtitle. The class CSS stays as zero-specificity fallback for older headers;
  the group kind default leaves out the brand too (`:not(.h-site-hset, .h-site-brand)`). "Use 2 rows" dropped (an old
  value is removed when the Styles popup is saved, the server ignores it). The vertical header and the collapsed bar
  are layout options stronger than the own styles while chosen.

### 11.14 Review 2026-11-15, round 12 (implemented, not committed, no browser check)

- New website: one popup "Creating the website..." (progress dialog without Cancel, `cancel: false`) while the website
  and its starter pages are made, then the editor; no flash messages on the way (quiet saves, `_patchRecord`
  `quiet`). The starter Cover page hides the header and the footer (as the Add page form gives it).
- A colour in an own style (or preset, kind, page style) is also the colour of the headings inside the element: the
  compilers write `--h-site-heading-color` with `color` (JS + PHP, fixture `screen-small.json`); e.g. light text on a
  Cover page with an h1 title.
- The title of the header set is hidden on small screens by its own style too (and by the fallback CSS wherever it is
  in the header).
- Own style editor: the screen (Normal, Medium, Narrow, Small) is a selector, not a button per screen.
- Screens: the media rules are `max-width: <width>.98px` (1024.98 / 640.98 / 375.98; compilers JS + PHP, style.css,
  HMenu.css, fixtures): with display scaling a viewport of "375 px" can be 375.2 px wide and missed `max-width: 375px`
  (the title of the header showed at 375).
- Header menu: no forced collapse on narrow screens any more (HMenu.css); a website menu collapses behind its button
  when it does not fit in one row (is-narrow) at any width. On small screens its own style gives it the free space
  between the logo and the language switch (`flex: 1 1 0`, button on the right), so it collapses there when needed.

### 11.15 Review 2026-11-15, round 13 (implemented, not committed, no browser check)

- Cosmetics: the starter Cover is hidden in the menu (DT_CMS_MENU_FORMAT = TRM_HIDDEN_ITEM); Cover logo 80px (its
  thumbnail); Contact centred with max-width 1024px (page style); the inline form has a header (title, Close) on
  `--h-color-selected`.
- Explorer instance: "Use the current Explorer view" removed. A module added to a page (Add element, template pages
  such as Discover) gets its website defaults at once (bridge `websiteDefaults`; an Explorer: every presentation module
  with its website defaults, the default layout without tools, no filters, `websiteExplorerSettings`), so its child
  modules show in the tree at once (an Explorer without settings: the five modules of the default layout).
- Data website defaults also: Show header, Expansion rules, Initially expanded, Sort, Admin info, Collection off.
- Selectors in the inline forms: the value picker popover was under the designer (z-index 10000 < 10010), now
  2147483000 as the other popovers. Module forms inline: no own scroll (70vh of the dialog).
- The preview gives new settings to a mounted module (`setConfiguration`) or to the modules of a mounted Explorer
  (`setModuleSettings`, when only module settings changed) instead of mounting it again; a layout / filter / state
  change still mounts it again.

### 11.16 Review 2026-11-15, round 14: the main menu (implemented, not committed, no browser check)

- Rules of the website menu (HMenu.js / HMenu.css / PageRenderer): (a) it collapses behind its button when its items do
  not fit its place in one row, at any width: measured with the items in one row (`is-measuring`, `scrollWidth` >
  `clientWidth`), not by the height of a wrapped list; (b) one `<nav>`: the host is the nav (its aria-label), the menu in
  it a `div` (`data-h-label`). A vertical menu (and auto in a vertical header) is a tree only from 641 px; on narrower
  screens it is a row and collapses as the horizontal one. The open collapsed menu is a tree below the button (sub
  pages below their page with their open / close button), not the hover drop-down; it closes when the menu fits again.
- Inline forms: one section has no caption (the title is in the header). Explorer layout: its Reset is "Default
  layout". The selectors of the inline forms are at most 360 px wide and cut long labels.

**Main menu, round 2 (2026-11-15).** 1) The items of the website menu are always in one row (`h-site-menu-fit`: no
wrapping); it collapses when they do not fit the width of the menu. The menu element of the header set grows from 0
(`flex: 1 1 0`, own style default in `CMS_HEADER_SET_STYLES` / `WebsiteStarter::HEADER_STYLES` and the fallback CSS):
with `1 1 auto` it went to a new row of the header instead of collapsing. Headers created before keep their stored own
style (`1 1 auto`): change it in Own style. 2) The open collapsed menu opens inside the header as before plan 27f, no
drop-down: `HMenu._showPanel` moves the list into a full-width block after the row of the menu (out of the flex rows
around the menu, not out of the header), so it moves the content down; back into the menu when closed or when the
menu fits again.

### 11.17 Review 2026-11-15, round 15: cosmetics (implemented, not committed, no browser check)

1. Data module: the control panel is hidden while its header has no button, also in main mode
   (`DataControlPanel.updateHidden`, called again when the Expansion button comes or goes).
2. Configuration form of a module: Apply also in the header of the form, beside Close (`createFormPanel().addHeadActions`).
3. The configuration form is placed as Own style: beside the tree when the pane is wide, below it when narrow (the
   forced `h-cms-form-below` is gone).
4. Apply of an Explorer instance no longer mounts it again: Explorer public API `applySettings(settings)` (filters:
   the Search pane is made again with the new filter ids, `SavedFilterManager.setFilterIds`; layout: `applyLayout` with
   the new `ui`; module settings: `setModuleSettings`). Another interface language: mounted again.
5. Filter Form: the caption of many chosen values is cut with an ellipsis (`.h-input-enum-combo .h-value-combo-text`
   has no width of its own; the control box used `min-width: min-content`, the full caption).
6. Map, Graph and Timeline of an Explorer got no results after any change of the page in the designer: the preview put
   the draft with `innerHTML` and moved the kept instance hosts back, and a moved iframe is loaded again (its module
   lost Explorer). `CmsPreview.apply` puts the new content beside the old one and moves the kept hosts with
   `moveBefore` (iframes keep running); without `moveBefore` an instance with iframes is mounted again. Fix (same day): a kept host that is a child of the part itself was
   removed with the old content after the move (Explorer disappeared on load and on every second Apply); moved hosts
   are not removed.
7. Tabs / accordion: the pen of the element and the pen of a panel open one popup with the captions of all panels
   (`_editCaptions`, a block per panel with the rows of the Caption popup); the cursor in the first caption, or in the
   caption of the panel whose pen was used. One undo step. `CmsRecordDocument.panels(id)`, `panelControl(id)`.
8. The language switch with its defaults (Auto, empty settings) was marked "not configured" in the part tree: it is
   configured without settings, as the menu (`READY_WIDGETS` in `cmsEdit.js`).
9. (17) Maximum width of page in Navigation and layout after Page navigation: Full width, 1920, 1366, 1280, 1024 px.
   It is the base setting `site-width` (`--h-site-width` of header, main and footer; no new format key, server
   unchanged); the free text field "Page width (max)" left the base settings. An older value not in the list stays as
   a choice.
10. (18) Flash messages are at least 250px wide (`#dialog-flash-messages`, heurist-ui.css).
