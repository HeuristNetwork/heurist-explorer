# 27n Page editor: element panel, sections, names, Show / hide action

**Status.** Agreed 2026-11-17, from Artem's review of the page editor (11 items). Two corrections by Artem in the
same session are included (§6.2 action menu rows, §2.4 Help of the panel); open points decided (§12). Phases A-D done 2026-11-17 (§13); review rounds 1-4 done 2026-11-17 (§14-17); not committed, no browser check; phase E open (§13.5).

Today the forms of the elements are inconsistent. A group shows Caption and Own style mixed in one inline form, and
other elements open popups (pen, gear or palette). Font sizes can not use the Heurist variables. Add element is not
grouped by purpose. Elements have only random ids (`iw3och7`). A button can not show or hide a part of a page, although
that is the most requested custom feature of Heurist websites.

## 0. Current state (code)

- **West pane of `CmsDesigner`.** From top to bottom:
  - toolbar `.h-cms-toolbar`: Properties, Styles, Check, Open, Help, Close
  - tabs Site / Page
  - help panel `.h-cms-help`, shown and hidden by Help; texts `HELP` / `elementHelp`
- **Page tab:** top bar, part tree (`HTree`; `_partItems`, `_nodeTools`, `_popupTool`), bottom bar `.h-cms-pane-bar`
  (palette = Own style, Undo, Redo, Discard, Save).
- **Inline form** `designerInline.createFormPanel`: beside the tree when the pane is at least `FORM_SIDE_WIDTH` (620),
  below it otherwise. `_formSections` builds Caption + Own style, with the reveal select in the style head. Module
  configuration is inline with Reset / Apply (`_openConfig`). Every other form is an `HMsg` popup.
- **Changes:** `_formEdit` / `_edit` → `_changed` → `_applyPreview` (`CmsPreview.restyle` or `apply`). Nothing goes to
  the server until Save Page.
- **Ids:** `data-h-node` (`n…`), `data-h-instance` (`i…`), made by `newCmsId` (`shared/src/site/cmsEdit.js`). There is no
  name attribute.
- **Reveal:** `CMS_REVEALS = ['fade','up']` (`cmsEdit.js`), runtime `siteRuntime.enhanceReveal`, CSS 0.6 s
  (`apps/website/src/style.css`), server Enum in `srv/Utilities/StoredText.php`.
- **Font size:** a plain text input. `checkStyleValue` refuses `var()`, although the server (`StyleCompiler`) accepts it.
  The `--h-font-size-*` variables are in the website bundle.
- **Menu and tab colours** are hard-wired in `shared/src/widgets/site/HMenu.css` and `apps/website/src/style.css`. Only the
  header and footer have a `theme` (default | surface | primary | selected | own).
- **Actions:** `actionForms.ACTIONS` (page, url, addRecord, recordPage, back, savedFilter, search). Server
  `PageRenderer.php`, preview `HMenu.js`, runtime `siteRuntime.onAction`.

## 1. Font size from variables (item 1)

- The `font-size` input gets the same drop-down as a colour input:
  - `--h-font-size-tiny`, `-small`, `--h-font-size` (default), `-large`, `-icon`, `-icon-large`
  - the site base `--h-site-font-size`
- New helper `valueMenu` in `designerStyles.js`, with the look of the HInputColor menu.
- `checkStyleValue` accepts `var(--h-[a-z0-9-]+)` for length properties.
- Note: these are fixed px sizes of the Heurist UI (10-16 px), smaller than the site base size of 15 px.

## 2. Element panel: Configuration | Own style (items 2, 3, 5)

### 2.1 Panel

- New `apps/website/src/designer/designerPanel.js`. It replaces `createFormPanel`, and the `_openForm` / `_openConfig`
  code moves out of `CmsDesigner`.
- Two tabs, *Configuration* and *Own style*, made with `createTabSet` like Site / Page.
- Top right, on the row of the tabs: Help, Undock (Dock in the popup), Close.
- Group (item 2): Configuration = Caption + Presentation + Identification; Own style = the style rows only.

### 2.2 Positions

- a) **Below the tree** (more exactly below `h-cms-pane-bar`) when the editor pane is narrow.
- b) **Beside Site / Page** when the pane is wide. Same `FORM_SIDE_WIDTH` rule as now, through the ResizeObserver.
- c) **Popup.**
- The last position is remembered in localStorage.

### 2.3 Popup

- It is its own fixed floating box, not `HMsg`, with no veil.
- Until it can be dragged, it is stuck to the left side of the window, under the toolbar.
- It takes the size its content needs, so the inputs are not jammed. It scrolls only when the content is taller than
  the window.
- It closes on an outside click. That covers a `mousedown` in the document, and a `blur` of the window for clicks in the
  preview iframe. A click in the part tree switches to that element instead of closing.
- Footer: Dock on the left; Cancel and Apply on the right.
- It is built so that dragging and resizing can be added later.

### 2.4 Help

- **Help on `h-cms-toolbar`** opens the *Website editor manual* in a big popup (shared `InlineHelp`, as for the other
  modules). New files `user-manual/websiteEditorManualEng.htm` and `Fre`, started from the present `HELP` texts. The help
  panel `.h-cms-help` below the tabs is removed.
- **Help of the panel** shows and hides two things together:
  - the help in the panel header: on Configuration it explains the element, on Own style it says what to define
  - all help texts next to the inputs of the form (HEditForm field help, hints of the style rows)
- It is one class on the panel, remembered in localStorage.

## 3. Apply: what is live and what waits (item 3f)

All visual changes go to the preview at once.

- In the popup, **Cancel** restores the draft as it was when the panel opened (one undo step), and **Apply** keeps it.
- In a docked panel there is no Cancel; Undo works as now.

Answer to *which settings are applied only after Apply*:

| When | Settings |
|---|---|
| **At once, no server** | Own style, reveal, captions, name, tabs / accordion options, menu, action menu, social media, badges, language switcher, breadcrumbs, email form, media size / alignment / caption, presentation of the gallery and of the cards, hide flags of the page |
| **After a short pause, when the input is valid** (the preview fetches from the server; no Apply) | Record cards source / query / template / records, Generated report output / language / display, Media gallery records / files, Record field record / field |
| **Only after Apply** | Module configuration (Explorer, Data, Map, Timeline, Graph, Record view, Filter widget) and *Records and selection*, because every change remounts the module |

Edit text keeps its own dialog (Cancel / OK).

## 4. Part tree tools (item 4)

- **Every row:** a gear (opens the panel) and a trash icon.
- **Text:** a pen (Edit text) before the gear.
- **Group, columns, tabs, accordion and the root:** a `+`.
- **Double click:** Text opens Edit text; every other element opens the panel.
- **Gear of the root:** opens the panel with the page fields, the hide flags and the Own style of the page. It replaces
  the `openPageForm` popup.
- **The palette on `h-cms-pane-bar`** becomes a gear that shows or hides the panel of the selected element.
- The pens of Record field and Media go; their forms are in the panel now.

## 5. Add element groups (item 8)

`designerCatalog.ELEMENT_GROUPS`. Only labels are renamed; the values stay the same.

- **Content:** Text, Media, Media gallery, Record field, Record cards, Generated report
- **Layout:** Group, Group 2 columns, Group 3 columns, Accordion, Tabs
- **Action and navigation:** Action menu, Main menu
- **Modules:** as now
- **Helpers and sets:** Breadcrumbs, Language switcher, Badges, Social media links, Email form, Header: default set,
  Footer: default set

## 6. Configuration sections (item 6)

### 6.1 Sections per element

The sections are HEditForm groups. The designer adds Presentation › Reveal and Identification to every element.

| Element | Source | Presentation | Caption(s) | Behaviour / Action |
|---|---|---|---|---|
| Text | – | reveal | – | – |
| Record field | source, record, field, file field | width, height, reveal | – | link |
| Media | mode, records, files, any records, file field | width, height, align, gap, orientation, grey until mouse over, fit, reveal | media caption | action, record action |
| Media gallery | as Media | presentation type + slider options, width, height, align, gap, orientation, grey until mouse over, fit, reveal | – | action |
| Record cards | mode, records, query source, query | Smarty template, presentation type + slider, reveal | – | record action |
| Generated report | outputs per language | display, reveal | – | – |
| Group / columns | – | reveal | caption | – |
| Tabs | – | orientation, style of the tabs, colours (§7), reveal | captions | – |
| Accordion | – | several sections open, first section open at start, reveal | captions | – |
| Badges | files | width, height, align, gap, orientation, grey until mouse over, reveal | – | – |
| Social media | preset set of icons + URLs | look, align, gap, orientation, grey until mouse over, reveal (size = font size of Own style) | – | – |
| Action menu | – | as now + colours (§7) | – | **Actions** (§6.2) |
| Main menu | show Home, open pages with sub pages; section of pages hidden (kept in the code) | orientation, style of items, colours (§7), always collapsed, open collapsed menu, overlay, reveal | – | – |
| Email form, Breadcrumbs, Language switcher | – | the present form, reveal | – | – |
| Modules, Filter | Records and selection | module configuration (Apply), reveal | – | – |

**Identification** (all elements):

- *System id*: read only, e.g. `iw3och7`
- *Name*: see §9

### 6.2 Action menu items

The table / list of items becomes a list of mini forms:

```
-------------------------------------------------
 ⠿ Caption [...........]  (translations: the same rows as other captions)
 [Action type ▾]  [ ] New tab
     configuration fields of the action
 Icon [glyph] [class ......]  [ ] Icon only     [x]
-------------------------------------------------
```

## 7. Colour schemes for menu, action menu and tabs (item 7)

- **New item variables** `--h-item-text`, `-bg`, `-hover-text`, `-hover-bg`, `-current-text`, `-current-bg`. `HMenu.css`
  and the tabs CSS use them, falling back to today's colours, so there is no visual change by default.
- **Presentation select *Colours*:**
  - Site (default)
  - **Inverted**: text and background of the site swapped. Text = `--h-color-bg`, hover background = 18 % of it, current
    item = background on text. This is for menus and buttons over a banner.
  - Primary (dropped while implementing, §13.2)
  - Own (three variables, §13.2)
- **Storage:** `data-h-colors` on controls (tabs), setting `colors` on instances.
- **Own** = the six variables in Own style, in a new group *Item colours*:
  - colour values only, with the palette drop-down
  - whitelisted in `StyleCompiler` and its JS mirror

## 8. Reveal effects (item 9)

- **Values:** `fade | up | down | left | right | zoom | hidden`. *left* and *right* are the side slide.
- **Slower:** 1 s (was 0.6 s), distance 40 px.
- **hidden** (*Initially hidden*): the element is hidden until a Show / hide action (§10) shows it.
- **In the designer**, hidden elements stay visible and are hatched.
- **Files:** `CMS_REVEALS`, `StoredText.php` Enum, `style.css`, `enhanceReveal`, fixtures.

## 9. Element name (item 10)

- **Attribute** `data-h-name` on the element (beside `data-h-node`).
  - Mask `[A-Za-z0-9_-]{1,64}`; see §12.2 for the dot.
  - Unique per page, including the header and footer of the site.
  - Allowed in `StoredText.php`; read in `cmsDocument.js` / `CmsHtml.php`.
- **Defined in** Identification (§6.1). A duplicate is an error in the form and a `duplicate_name` warning in
  `CmsValidator`.
- **Used in:**
  - a) the Check report (`WebsiteCheck`): `name (system id)`
  - b) the labels of *Records and selection* (`_pageRecordSources`)
  - c) the target picker of the Show / hide action (§10)
  - d) the part tree: `name · type`

## 10. Action *Show / hide element* (item 11)

- **Designer:** new entry `toggle` in `ACTIONS`. Its configuration is a list of the named elements, groups and modules of
  the page, header and footer. The node id is stored.
- **Server:** a `PageRenderer` branch writes `data-h-action="toggle" data-h-target="<node>"`, `aria-controls` and
  `aria-expanded`. `HMenu.js` mirrors it for the preview.
- **Runtime** (`siteRuntime.onAction`):
  - shows or hides the element, with its reveal effect
  - marks the button `is-active`
  - fires a window `resize` after showing, for maps and timelines
- It does not run in the designer.

## 11. Phases

| Phase | Items | Scope |
|---|---|---|
| A | §1 font size, §5 catalog groups, §8 reveal effects | both repos |
| B | §9 `data-h-name`, §10 Show / hide action, §7 item colours | format: JS + PHP + fixtures `shared/test/fixtures/cms-v4` |
| C | §2 panel, §4 tree tools, popup mode, manual, Help of the panel | |
| D | §6 sections per element, action menu mini forms, menu form, Identification | |

**Tests:** `npm test` (cmsDesigner, templateForms, cms-v4 fixtures, architecture); `npm run build:website` and `explorer`;
heurist `php tests/CmsFormatTest.php` and `php tests/WebsiteEditTest.php`.

**Browser check** in osmak_mapping, site 207627:

- the panel in its three positions
- Cancel restores the draft
- a Show / hide button over a named group
- an inverted menu over a banner
- the reveal effects

## 12. Decisions on the open points (Artem, 2026-11-17)

1. An outside click on the popup keeps the changes (same as Apply); only Cancel or Escape restores the draft.
2. Name mask `[A-Za-z0-9_-]{1,64}`, no dot.
3. Media elements (Media, Media gallery, Badges, Social media) all get the same presentation settings: width, height,
   alignment, gap, orientation, grey until the mouse is over. Social media has no width / height: its size is the font
   size of its Own style.
4. No Show / hide action in text links: media and links inside a Text element are part of it, and the reveal option of
   the Text applies to the whole element.

## 13. Implementation

### 13.1 Phase A (2026-11-17, not committed, no browser check)

- **§1 Font size:** `designerStyles.js` `FONT_SIZES` + `fontSizeInput` (text input + caret drop-down, Simple and
  Advanced views; the items are shown in their own size); `checkStyleValue` accepts `var(--h-…)` for length properties.
  CSS `.h-cms-style-with-pick` / `.h-cms-style-pick*` in `designer.css`.
- **§5 Add element:** `designerCatalog.ELEMENT_GROUPS` in five groups; labels renamed: Generated report, Group 2 columns,
  Group 3 columns, Record cards, Media gallery, Footer: default set (values unchanged).
- **§8 Reveal:** `CMS_REVEALS` (shared `cmsEdit.js`), `REVEAL_LABELS` in `CmsDesigner` (the select beside the preset
  until phase C), `enhanceReveal` skips `hidden`, `style.css` 1 s / 40 px, new effects, `hidden` = `display: none`
  outside the designer until class `h-site-shown` (phase B action), hatched in the designer (`.h-site-design`);
  heurist `StoredText.php` Enum `fade,up,down,left,right,zoom,hidden`.
- Localization eng / fre for the new labels. Tests: `cmsDesigner.test.js`, `siteExtras.test.js`; JS 1,843 pass,
  `CmsFormatTest.php` 18 and `StoredTextTest.php` 117 pass; `build:website` ok, not deployed.

### 13.2 Phase B (2026-11-17, not committed, no browser check)

- **§9 Name:** `data-h-name`, mask `CMS_NAME` (`cmsDocument.js`) = `CmsValidator::NAME`; issues `element_name` /
  `duplicate_name` (JS + PHP, fixture `names.json`); every issue of a named element carries `name` (both validators),
  `CmsRecordReferences` / `WebsiteService` add `name` to `usedIn`; `WebsiteCheck` shows `name: node id`.
  `CmsRecordDocument.name / setName / names`, tree items `name`, label `name · type` (`typeNameOf`); Records and selection
  labels show it through the tree label. Designer: *Name* beside Preset and Reveal in Own style (until the Identification
  section, phase D), checked while typing (`_nameError`: mask, unique on the page with the header and footer of the
  website, `_namedElements`). StoredText allows `data-h-name` (Text).
- **§10 Show / hide:** action `toggle` in `actionForms.ACTIONS` (not in single links), target = select of the named
  elements, node id stored, default label *More*, check *needs a named element*; `PageRenderer` branch (node id pattern,
  else left out), `actionMenuItems` mirror, `siteRuntime.toggleElement` (`h-site-shown` for an initially hidden element,
  else `h-site-hidden`; links `is-active`, `aria-expanded`, their menu item `is-current`; fade-in `h-site-toggle-in`;
  window `resize`), `onAction` branch.
- **§7 Colours, changed while implementing:** *Primary* dropped (the header / footer theme `primary` already gives a menu
  on the primary colour), and *Own* uses three variables, not six: `--h-item-text`, `--h-item-accent` (current item,
  buttons), `--h-item-accent-text`. The item styles are built on the text colour and the primary colour, so a scheme
  gives the menu / tab strip its text colour and redefines `--h-color-primary(-text|-hover)` below it (no rule per item
  style; hover and borders follow the text colour). Values `ITEM_COLORS = inverted | own` (`cmsMenu.js` =
  `CmsValidator::ITEM_COLORS`): menus and action menus `settings.colors` → class `h-site-colors-*` (`menuClass`, JS + PHP),
  tabs `data-h-colors` (`tabsLook` / `setTabsLook`, StoredText Enum). CSS: `HMenu.css` (end), `style.css` (tabs).
  Own style section *Item colours* only for menus, action menus and tabs (`styleRows` option `itemColors`); the three
  properties are in the property whitelists (JS `PROPERTIES`, `StyleCompiler::PROPERTIES`, fixture `item-colors.json`).
  *Colours* select in the menu form, the action menu form and the Captions popup of tabs (`ITEM_COLOR_LABELS`).
- Tests: JS 1,847 pass (`cmsEdit.test.js`, `siteExtras.test.js`); heurist `CmsFormatTest` 21, `StoredTextTest` 119,
  `WebsiteEditTest` 112, `WebsiteRenderTest` 115 pass; `build:website` and `build:explorer` ok, not deployed.

### 13.3 Phase C (2026-11-17, not committed, no browser check)

- **Panel:** `apps/website/src/designer/designerPanel.js` (`createElementPanel`; `designerInline.js` removed): tabs
  Configuration | Own style on one row with Apply of a module, Help, Undock / Dock, Close; the title of the element
  below; the help of the tab (`help` lines) and the help texts of the inputs shown / hidden by Help (class
  `h-cms-panel-tips`, localStorage `heurist.cms.panel.tips`); position kept in `heurist.cms.panel`.
- **Positions** (`CmsDesigner._placePanel`): docked below the tree (in `.h-cms-page-panel`) or beside the tabs Site / Page
  (`.h-cms-west-row`, west pane at least `PANEL_SIDE_WIDTH` 620, ResizeObserver; hidden while the Site tab is shown);
  popup = the panel in the designer root, `position: fixed`, left side, top = below the toolbar and view bar
  (`--h-cms-panel-top`), `width: max-content` (370-760px), scrolls only when higher than the window.
- **Popup:** a `mousedown` outside closes it and keeps the changes (§12.1); outside does not include the part tree (a
  click there selects another element, the popup follows), dialogs, popovers, menus and TinyMCE. Changed while
  implementing: a click in the **preview** does not close the popup either (it selects an element as the tree does; the
  iframe gets the click, not the designer). Escape = Cancel (unless a dialog is open). Cancel = `_cancelPanel`: the
  snapshot of the draft and the page fields taken when the popup opened (`_panelStart`), restored as one undo step.
  Apply = `_applyPanel`: Apply of a module configuration (`_pendingApply`), then close.
- **Content** (`_panelTabs`, `_configSections`): Configuration = what the element shows + *Presentation* (Reveal; content
  only) + *Identification* (System id = instance id of a widget / module, else node id; Name), Own style = the style rows
  (Name and Reveal moved out of the head of the style form). Inline: caption of a group / panel, module configuration
  with Records and selection (Apply). **Until phase D** the other forms stay popups opened by a button in the
  Configuration tab: Edit text, Record field, Media, tabs / accordion options and captions, widget configuration, the page
  fields (root of a page; header / footer: the Layout tab of Styles). A module of an Explorer: Configuration only.
- **Tree** (`_nodeTools`, `_activateNode`): root `+` and gear; text pen, gear, bin; group / tabs / accordion / panel `+`,
  gear, bin; other elements gear, bin; module of an Explorer gear. Double click: text = Edit text, else the panel.
  `_popupTool` removed. The bar palette is a gear (show / hide the panel of the selected element).
- **Help:** the help panel below the trees is removed; Help of the toolbar opens `user-manual/websiteEditorManualEng|Fre.htm`
  in `InlineHelp` (anchors `site` / `page` / `panel`), copied into the Explorer and website builds (`vite.config.js`).
  `HELP.page` and `elementHelp` are the help of the Configuration tab.
- Tests: `cmsDesigner.test.js` (tools, panel: tabs, positions, Help, popup, Cancel, Apply); JS 1,847 pass;
  `build:website` and `build:explorer` ok, not deployed.

### 13.4 Phase D (2026-11-17, not committed, no browser check)

- **One form, two places:** `apps/website/src/designer/panelForms.js`: `showEditForm(options, map, {inline, sections})`
  (HEditForm: a popup as before, or in the panel: after each change and 400 ms a valid form gives `map(values)` to
  `inline.onResult`; own buttons: `onAction` of the first runs first, e.g. media checks its files), `showDomForm` (forms
  made of elements: after `input` / `change` / `h-input-change`, `formChanged()` when rows are added, removed or moved),
  `sectionGroups` (the fields of a form into the groups Source, Presentation, Caption, Behaviour, Identification;
  fields not named are Presentation), `sectionTitle`.
- **Designer fields in the form** (`CmsDesigner._commonFields`, panelForms `common`): `__reveal` at the end of
  Presentation (content only), Identification `__systemId` (read only: the instance id of a widget, else the node id) and
  `__name` (pattern, unique: `_nameError` as a form issue); applied at once (`_formEdit` keys `reveal:` / `name:`), not
  with the settings. Forms made of elements get Reveal at the end of their Presentation (`presentationExtra`) and the
  Identification section after them.
- **In the panel** (`_configSections`, `_widgetSection`, `_mediaSection`; `PANEL_WIDGET_FORMS`), applied with
  `_formEdit('config:<instance>' | 'media:<node>')` (one undo step for the changes of 2 s):
  - HEditForm: menu (Source: Show Home, Pages with sub pages, *Pages* hidden with its value kept; the rest
    Presentation), language switcher, breadcrumbs (Source), Filter widget (Source: filters, active), email form
    (Caption: button caption), Record cards (Source: mode, records, query source, query; Behaviour: action, record
    page, page, Saved filter), media gallery and media (Source: mode, records, files, any records, field; Caption;
    Behaviour).
  - Elements: badges (Source: the logos; Presentation), social media (Source: the networks; Presentation), Generated
    report (Source: the outputs; Presentation: display), action menu (Presentation; *Actions*).
  - Tabs / accordion: Presentation (orientation, style, colours / several open, first open; Reveal) and *Captions* (a
    block per panel, applied while typing) (`_panelsLookSection`, `_panelsCaptionsSection`).
  - Popups stay for: Edit text (agreed), **Record field** (it edits the value of the record and saves it to the server
    with its Apply: a button in Configuration), the badges of the host (set on the server), modules of an older host.
- **Action menu items (§6.2):** a mini form per item (`h-cms-action-item`): drag handle + caption (with translations
  `createTranslationForm` when the website has several languages: `labels`), action + New tab, the settings of the
  action, icon + Icon only + Remove; also in the popup (the text editor link keeps its one-column form).
- CSS: the groups of HEditForm and `h-cms-dom-section-title` look the same in the panel; the lists of a form do not
  scroll in the panel.
- Tests: `panelForms.test.js` (sections, inline apply after the pause, designer fields at once, forms of elements),
  `cmsDesigner.test.js` (sections of tabs and a widget, common fields); JS 1,850 pass; `build:website` and
  `build:explorer` ok, not deployed.

### 13.5 Open (phase E)

- §12.3 presentation settings of the media elements not there yet: gap, orientation, grey until the mouse is over for
  Media, Media gallery and Social media, and width for badges. Each needs the renderer (JS draft + `PageRenderer` /
  `cmsMedia`) and CSS, in both repos.
- (review §14.11) Media gallery: Orientation, Grey until the mouse is over and Gap only for *List*; not for Carousel and
  Slideshow.

## 14. Review round 1 (Artem, 2026-11-17; done, not committed, no browser check)

1. **Font size drop-down** had height 0: its menu in a popover as the colours (`.h-cms-style-pick-popover > .h-menu`
   static); the input as wide as the other inputs (`flex: 1 1 0`).
2. **Reveal of Record field and Media gallery not seen.** The preview of the designer never reveals (runtime `design`),
   and a list of cards / a gallery has no box (`display: contents`). Now: a change of Reveal plays the effect once in the
   preview (`CmsPreview.playReveal`, `CmsDesigner._playReveal`), and `enhanceReveal` reveals the items of a list
   (`h-site-widget-list`) with the effect of the list.
3. Undock icon `fa-window-restore`.
4. Add element closes the panel first (`_insertChosen`): the popups of the new element replaced the open form.
5. `.h-cms-form-section` padding-left 14px (the language badges of the translation rows).
6. **One help:** the forms of widgets, media and Record field keep their own help; the Configuration tab has its help
   only for the others (text, group, tabs, accordion, modules, page). Reveal has its help with its input (HEditForm
   `help`; the reveal field of the other forms has its note below it, `.h-cms-reveal-field`); the sentence about
   Reveal and Name left `elementHelp`.
7. **Help of the toolbar could not be closed:** `.h-dialog-fullscreen { display: flex }` showed a closed `<dialog>`
   (shared `heurist-ui.css`; `display` only with `[open]` now; Explorer's manual had the same rule).
8. The popup 20px from the left side of the window (all borders, `max-width: calc(100vw - 40px)`).
9. **Page fields in the panel** (`_pageSection`): the fields of the page / home page and Hide header / footer; the flags
   at once, the fields kept in the draft (`fieldChanges`, saved with Save Page) after each valid change and when the
   panel closes; the page popup stays for nothing else (`_editPage` is kept).
10. The field *Presentation* (cards, gallery, Filter widget, action menu, social media) renamed *Show as*.
11. (phase E, §13.5) Media gallery options for List only.
12. **Record field in the panel** (`_fieldSection`, `openFieldForm` `inline`): source, record, field, size and action
    applied after each valid change (the preview is loaded again when the reference changes); the value editor in the
    Source section with its own **Update value** (PATCH of the field of the record, then the snapshot of the element).
13. Own style: the screen selector beside Preset (`styleRows`; the row of its own only without presets).
14. **The popup keeps its size** while it shows one element: after it is drawn, as large as its largest tab with the help
    shown (`fitPopup`, min-width / min-height, at most the window); nothing changes when tabs or help are switched.
15. Spaces in a Name become underscores (`nameOf`; also the name input of the old form). Underscores rather than dashes:
    the name reads as one word, and dashes stay for names like `more-info` typed on purpose.
16. **Generated report:** docked, its list of outputs has five columns (visibility, choice, language, name, size) and the
    search only (`pick.compact`, apps/reports `OutputsDialog` `is-compact`, `h-reports-col-extra`); Dock / Undock draws
    it again. 16a: *New Report* was offered in this list before (it opened New mode); now hidden whenever outputs are
    chosen for a website (`pick`). 16b: in the popup every column and the width of the window (`max-width`).

## 15. Review round 2 (Artem, 2026-11-17; done, not committed, no browser check)

17. **Media caption** in the panel as the caption of a group: the translation rows (input, Add a language below) in a
    *Caption* group before Behaviour (`createTranslationForm` in `openMediaForm` with `inline`; the field `captionText`
    only in the popup); a change of the rows is applied after the pause (`edit.panelChanged` of `showEditForm`).
18. A panel of tabs / an accordion has no form of its own: selecting it (gear, double click, selection) shows the form of
    its tabs / accordion (`_openForm`: `panelControl`).
19. **Two module forms and two Apply** (not reproduced): two `show()` of the panel ran at the same time (e.g. a selection
    and a gear while a module form was loading) and both added their sections. Now one show at a time: a ticket; a show
    that is not the last one stops after `clear()` and after each section (the section built meanwhile is cleaned up and
    removed); `hide()` stops a show too. The buttons of the title row are given per show (`build(host, context)`,
    `context.addHeadActions`): a late section can not add its Apply to another form.
20. Apply of a module in the title row of the element (`.h-cms-panel-title`: title + buttons), not on the row of the tabs.
21. Reset and Apply of a module after Presentation and Identification: their own last section (`_actionsSection`; the
    module form puts its bar there, `actions.bar`).
22. In the popup, Reset / Apply of a module (bottom and title row) are hidden: Apply of the popup applies the module.

## 16. Review round 3 (Artem, 2026-11-17; done, not committed, no browser check)

1. Font size: the group of the input and its drop-down is `inline-flex`, the input keeps its own width (as the other
   text inputs), not the width of the form.
2. **Reveal:**
   - In the preview the effect was replaced at once: the preview put the new HTML of the part (with the new
     `data-h-reveal`) after the effect had started. Now 400 ms after the change, with the Web Animations API
     (`element.animate`, independent of the classes; 1.2 s; the items of a list one after another).
   - On the website the effect ended before the element was seen: it starts when a quarter of the element, or a third
     of the window, shows it (thresholds 0 / 0.1 / 0.25 / 0.5), 1.2 s (was 1 s).
   - A gallery as a list: its items one after another (`--h-site-reveal-delay`, 120 ms each, at most 8).
   - 2a: the Reveal selector is narrow (HEditForm `width: 22`; `.h-cms-reveal-field select`).
5. The groups of a form in the panel have all their borders (a frame with the legend in it).
9. **Save Page showed the page as changed again:** after a save the panel is drawn again, and the page form drawn before
   kept its values in the draft when it closed. Now the form keeps its values only while the record is not saved,
   discarded or reloaded since it was drawn; Save Page first keeps the values typed just before (`_flushPageFields`).
12. *Update value* of a Record field becomes primary when the value differs from the record (normal again after the save).
16. Generated report docked: the compact table as wide as the panel (`table-layout: fixed`, the name cut with an
    ellipsis, narrow columns for visibility, choice, language and size).
16a. *New Report* was disabled because it needs a report chosen in the report filter of the list (its tooltip: "Choose a
     report in the list above"); it is hidden in the website form now (§14.16a).

## 17. Review round 4 (Artem, 2026-11-17; done, not committed, no browser check)

16a. *New Report* is back in the full list of outputs (the popup, with the report filter); hidden only in the docked
     compact list (`pick.compact`).
17. **Media caption, a removed translation came back as the English text.** A language without its own caption gets the
    HTML of the original caption (the media keeps a figure per language for its link labels), so the page in that
    language shows the original caption: that is the expected display, the preview shows no change. Reading it back, the
    form took that original text as the translation. Now a translation equal to the original caption is shown empty
    (`_editMedia`).
