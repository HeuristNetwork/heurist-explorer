# 27n1 CMS editor simplification

**Status:** agreed 2026-11-20 (Artem's review after 27n / 27l / 27q1); §1-7 implemented 2026-11-20, tests and builds pass,
not committed, no browser check, bundles not deployed.

Fewer choices in the element forms of the CMS page editor, tabs of Record cards with the look of the Tabs element, a
clearer Saved filter dialog, one way to enter a query everywhere (query **by value**), a collapsible page tree.

Agreed in the review: too many tabs = a strip that scrolls with ‹ › (§2e); the top *Advanced* button of the element panel
is hidden when the form has no advanced field (§6); Media and Email form have no advanced fields (§6).

## 1. Media / Media gallery

- *Source* is shown again (not `req: 'optional'`).
- Choices: File(s), Any record. *Media record(s)* only for an element that has it already (`mediaFormFields({mediaRecords})`);
  the runtime is unchanged.

## 2. Record cards

- a) *Source* shown again. b) *Manual pickup / Query / Record of the page URL*: Query source and Query are one *Query*
  field (§4). A stored `{mode: 'source', querySource}` is read when the form opens and becomes `{mode: 'query', query}`;
  one that can not be read stays as *Query source #id* (the server still renders `source`).
- c) *Show as*: List, Carousel, Slideshow, Tabs.
- d) With Tabs: *Orientation* and *Style of the tabs* (`TAB_STYLE_LABELS`, now in `actionForms.js`), stored as
  `tabs: {orientation, style}` only when not the default (`cmsTabsLook` in `shared/src/site/cmsEdit.js`). Also in the
  Media gallery (same presentation fields).
  HSlider tabs use the shared `createTabSet` (prefix `h-site`, `data-h-orientation`, `data-h-item-style`): Record cards,
  gallery, story map and the Tabs element have one markup and one CSS. The `.h-site-tab*` rules moved from
  `apps/website/src/style.css` to `shared/src/widgets/site/siteTabs.css` (imported by the site `main.js` and `HSlider.js`).
  The old `.h-slider-tabbar` / `.h-slider-tab` are gone.
- e) Too many tabs: `createTabSet({scroll: true})`: one line that scrolls, ‹ › (`h-site-tab-scroll`) sticky at the
  edges, shown only while the tabs do not fit and the strip can move (ResizeObserver, scroll event); the chosen tab is
  scrolled into the strip (only the strip moves, never the page). Arrow keys moved from HSlider into `createTabSet`
  (all its users); each tab has its label as `title`.
- f) Vertical tabs: column `minmax(8em, fit-content(33%))`, captions cut with an ellipsis; no ‹ › in a column.

## 3. Saved filter dialog

- Top: *The link opens the target page with the records of the query source or saved filter.*
- The values below a line (`border-top`), the instruction first: *Set some or all values of the chosen filter in advance.
  Type a fixed value, or pick a field of the record: each record then fills in its own value. Values left empty: Explorer
  asks for them, other modules leave them out.* (without a record context the middle sentence is left out).
- With a record context: column captions *Value | Or from the record*; the select of each parameter is in the row of its
  input (`HFilterForm` sets `data-h-param` on each field host), CSS grid `minmax(0,1fr) 12em`. A parameter without an
  input gets a row below. The separate block *Values from the record* is gone.

## 4. One query input (by value)

- The special query field (`HEditField`) has Edit and **▾** (*Copy the query of a query source*): a list under the button
  with a search box from 10 items (`shared/src/widgets/edit-form/querySourceChooser.js`, `querySourceAction`,
  `querySourceChoices(items, 'any'|'with'|'without')`). The chosen one's query (and filter form, where parameters are
  allowed) is copied; no id is stored. `HEditField` actions may be `iconOnly` and get their button (`run(value, context,
  button)`).
- The list: `shared/src/data/querySourceList.js` `listQuerySources({apiClient, dbdefs, publicOnly})` (moved from
  CmsDesigner; returns query and filter form too). No new endpoints.

| Place | Now |
|---|---|
| Record cards | one Query with Edit + ▾ (public query sources without parameters) |
| Records and selection | the Query source select removed; Query with Edit + ▾ (public query sources and *Website filters* without parameters); a stored `dataSource {source|filter}` becomes its query when the form opens (`storedQuery`) |
| Record editor, `DT_QUERY_STRING` (Generated report, schedules ...) | ▾ after Edit (`actionsFor`); with a filter form field all query sources, else those without parameters; a **Query source record has Edit only** |
| Reports app, New output | the select of query sources is the ▾ list (already by value) |
| Website manager, Generate: record pages | ▾ after Edit |
| Story map tool | *Initial set*: a query (`map.overview = {query}`) with ▾; a stored `{querySource}` is read into the text when the form opens |

**Kept by id** (the reference is the point): the Filter widget / HFilter lists of saved filters (managed by the site
admin, titles and filter forms follow changes); Saved filter links and search boxes (`?source=<id>` / `?filter=<id>` in
public URLs); `DT_DATA_SOURCE` pointers of report schedules and map layers (record structure); the Data app option
`querySourceId` (external API).

**Not done:** hiding `DT_DATA_SOURCE` in the form of a query source (the special editors are per field, not per record
type; the client offers no picker for it anyway).

## 5. Page tree

`HTree` option `collapsible(item)` (+ `collapsed`, `toggle`, `collapsed()`, `expandTo`, `shownIds`): a chevron on such
items with children, Left / Right keys. The designer: groups (incl. 2 / 3 columns), tabs and accordions; the collapsed
set is kept when the tree is made again; an element chosen in the preview opens its parents.

## 6. Advanced fields per form (for Artem's revisit)

- Media and Email form: no advanced fields any more (Alignment, Display).
- Action menu: 2 (Show as, Colours; per item Icon line, New tab).
- 0: Media, Email form, Record field, Filter, Breadcrumbs, Language switcher, Story map, Generated report, Social media
  links, Badges, Tabs, Accordion, Group / 2 / 3 columns, Text, Records and selection.
- Record cards 3, Media gallery 4, Main menu 9; Explorer module forms not counted.

The top *Advanced* button is hidden when no form of the panel follows it (`panelForms` registers only a form with
`req: 'optional'` fields; DOM forms with `.h-cms-advanced-only`; module configuration panels always).

## 7. Own style

*Advanced styles* is always shown; pressed, it shows all (screens, property rows). The own style does not follow the
panel's Advanced button any more (simple until *Advanced styles*).

## Files

`apps/website/src/designer/{widgetForms,savedFilterField,CmsDesigner,designerPanel,panelForms,designerStyles,actionForms}.js`,
`designer.css`, `apps/website/src/{main.js,style.css}`, `apps/website/src/manager/{websiteForms,WebsiteManager}.js`,
`apps/explorer/src/core/RecordEditorHost.js`, `apps/explorer/src/tools/storymap/StoryMapTool.js`,
`apps/reports/src/ui/OutputsDialog.js`, `shared/src/widgets/{layout/tabs.js, site/HSlider.js|css, site/siteTabs.css,
tree/HTree.js|css, edit-form/HEditField.js, edit-form/querySourceChooser.js|css, filter/HFilterForm.js}`,
`shared/src/data/querySourceList.js`, `shared/src/site/cmsEdit.js`; localization eng / fre of website, reports, explorer.

**Tests:** `shared/test/cmsEditorSimplification.test.js` (tab set, HSlider look, HTree collapse, chooser filter),
`apps/website/test/moduleOwnSource.test.js` (storedQuery, Edit + ▾, tabs settings), updated media form / style editor
tests.
