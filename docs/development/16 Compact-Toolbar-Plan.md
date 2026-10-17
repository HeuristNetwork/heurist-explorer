# Compact toolbar position — development plan

Status: **Part 1 agreed and implemented 2026-10-13, committed (`bb44f67`). Part 2 (below) agreed
and implemented 2026-10-14, not committed, not yet checked in a browser.** Since Part 2 the position
is called **"In panes"** (config value `panes`; files `ExplorerPaneToolbar.*`); Part 1 below keeps
the old name *Compact*.
Unit tests: `shared/test/hCardinalLayout.test.js`, `apps/explorer/test/explorerPaneToolbar.test.js`,
`apps/explorer/test/explorerToolModule.test.js`, `apps/explorer/test/explorerUiConfig.test.js`.

## Context

A customer wants the toolbar buttons placed next to what they control, not in one toolbar
row. A third **Toolbar position: Compact** is added in the Explorer configuration dialog
(Options → Interface). In Compact:

1. The toolbar buttons size does not apply (small buttons).
2. The left rail is a row of small buttons at the top of the West (authoring) pane. Search is
   hidden; the Query Source editor is always shown, unless a Filter Form covers it.
3. Search is replaced by `«` / `»` that collapses / expands the West pane (like the side panes of
   the Reports editor, `h-reports-editor-pane-toggle`).
4. The right rail has no presentation buttons; it is a narrow vertical strip of small tool buttons.
5. A module pane with more than one module shows a tab strip (icon and name of the module).
6. The dividers of the module layout get narrow `<` `>` buttons that collapse / maximize the pane.
   A pane without modules stays hidden.

## Agreed decisions (2026-10-13)

- Right tools (item 4): **a narrow vertical strip of small icons** (Report, Crosstabs, Actions,
  Export | Help, Options, Publish). Other options considered: one menu button, tools in the left row.
- Tabs and divider buttons (items 5, 6): **only in Compact**.
- Maximize: **3 steps** per edge pane: collapsed → normal → maximized. The arrow towards the pane
  shrinks it one step, the arrow away grows it. Maximized: the pane takes the space of its axis, the
  other panes of that axis (center included) are squeezed to collapsed strips. The normal size is kept.
- QSE Horizontal (north) placement still works: **the editor goes to North, the button row stays
  in the West pane.**

## Naming

"Compact mode" already means the narrow-screen (phone) mode (`ExplorerCompactMode`, class
`h-compact`). The new one is the *Compact toolbar*: config value `toolbar.position = 'compact'`, root
class `h-toolbar-compact`, code in `ExplorerCompactToolbar.js`. The narrow screen wins: below 700px
`ExplorerCompactMode` sets the toolbar to horizontal, which switches the Compact toolbar off; it
comes back when the screen is wide again.

## Implementation

- `ExplorerUiConfig`: `TOOLBAR_POSITIONS` has `'compact'`. Configuration dialog: third radio
  *Compact (buttons next to the panes)*; the *Toolbar buttons size* row is disabled while it is chosen.
- `ExplorerControlPanel.applyToolbarConfig` is the one switch point: compact → both rails small,
  `application.compactToolbar.setActive(true)`; any other position → `setActive(false)`. An empty
  rail click no longer toggles the editor in Compact. Popup lists open below the clicked button.
- `ExplorerCompactToolbar` (new, `apps/explorer/src/ui/`): moves the left rail element into the
  dock's West region (`ExplorerAuthoringDock.setToolbar(element)`), adds the `«`/`»` button, switches on
  the divider buttons of the module layout, starts the pane tabs; a module pane with configured
  modules but none created (deferred at start, or hidden before) is shown as a **collapsed strip**;
  growing an empty pane creates its first module (`ExplorerApplication.showPresentation`). Leaving
  Compact undoes all of it (maximized panes restored, empty strips hidden again).
- `ExplorerAuthoringDock.setToolbar(element|null)` (plan said `setPinnedWest`; deviation: the dock
  must also keep the buttons first when the pane moves between West and North): the West region is
  always shown; its collapsed strip is 34px (the buttons in a column); with the editor north and no
  docked list, the West region is collapsed, a list expands it; `show()` expands a collapsed West.
- `ExplorerPaneTabs` (new): per module pane, the module types configured there in toolbar order
  (also deferred ones). Two or more → tab strip; one → the strip is shown only while the pane is
  collapsed (its icon). A collapsed or squeezed pane shows the module icons; a click gives the pane
  its space back and shows the module. In Tools mode the tool panel has its own tab in the center.
  Icons and titles come from the right rail's definitions (`rightButtons()`, now exported).
- `ExplorerApplication.showPresentation(type)` (new): show/create a module in its pane, never hide;
  `togglePresentation` now uses it for its show branch.
- `HCardinalLayout` (shared): option `splitterButtons` / `setSplitterButtons(on)`; new edge state
  `maximized` with `maximize`, `restore`, `grow`, `shrink`, `isMaximized`, event
  `regionmaximizechange` (forwarded by LayoutManager); one region maximized at a time; squeezed regions
  get `is-collapsed` (the state is not stored as collapse); no dragging while a region is maximized;
  hide/collapse end a maximize. Reports and the authoring dock do not switch the buttons on.
- `ExplorerRail`: buttons and separators carry `data-group` (CSS hides `author` in the left row and
  `presentations` on the right).
- Module engines re-measure (`module.resize()`) after a pane collapses, expands or is maximized.
- Tour: steps whose button is hidden in Compact (Search, module buttons) are skipped or point at the
  pane, as for any invisible target.

## Open / to check in a browser

- Look of the row and strip at different West widths; Stop button in the row.
- Map/timeline/graph redraw after collapse/maximize.
- Narrow window (<700px) still uses the phone layout; back to wide restores Compact.

# Part 2 — tools as pane modules, Unused, "In panes" (2026-10-14)

## Requests (Artem, 2026-10-14)

1. Report, Crosstabs (stub), Actions (stub), Export and Publish act as the other modules: they are
   placed in panes in the configuration dialog. 1a: by default in the center after Graph. 1b: no
   close (back to presentation) button. 1c: a narrow pane with many tabs hides the tab names and
   wraps or scrolls.
3. Layout section: an **Unused** bucket (no checkbox). Its modules are not shown in the UI. Not all
   modules can go there.
4. "Compact toolbar": no right rail at all; only Configuration remains — where? Better name?
5. HCardinalLayout divider buttons as thick as the splitter, font-size 7px, no border.
6. Data and Record View: the pinned button (Expansion, Recently viewed) 30px high while the other
   header buttons are 24.8px; it covers the source header's border.

## Agreed decisions (2026-10-14)

- **Help** is not a pane module: it stays the overlay. In "In panes" it is in the settings menu.
- **Configuration** in "In panes": a gear at the end of the button row on top of the West pane,
  before `«`/`»` (at the bottom of the collapsed strip). It opens a menu: Configuration, Help,
  Getting started, Query tracer.
- **Name**: toolbar position *In panes* (buttons and tabs in the panes). Config value `panes`; the
  old value `compact` is still read (normalized to `panes`). Root class `h-toolbar-panes`, code
  `ExplorerPaneToolbar.js/.css` (was `ExplorerCompactToolbar`), `application.paneToolbar`.
- **Result can not go to Unused** (decided while implementing): a DataSource is always shown in the
  current-result data module (`activateDataSource` creates it). This also guarantees that not every
  module is unused. The dialog refuses the drop; `normalize()` puts it back in its default pane.

## Implementation

- `ExplorerUiConfig`: `PRESENTATION_TYPES`, `TOOL_TYPES`, `MODULE_TYPES`, `UNUSED_REGION` exported;
  `regions` holds all ten types; region `unused` allowed except for `data`; defaults: tools `center`,
  order `data, recordview, map, graph, report, crosstabs, actions, export, publish, timeline`. A type
  missing from a saved order goes after its predecessor in the default order (older configurations
  get the tools after Graph). `isModuleUsed()`; `applyUiRegions`, `leadingPaneTypes`,
  `moduleTypesInOrder` leave unused modules out.
- **Tools mode is removed** (`LayoutManager.enterToolMode/exitToolMode/isToolMode`, the snapshot,
  `modechange`, `ExplorerApplication.openTool`, `ControlPanel.clearToolSelection`). A tool is an
  Explorer module: `apps/explorer/src/tools/ExplorerToolModule.js` (extends `ExplorerModule`) owns
  the panel (caption header, no close button) and creates the tool lazily in its body; DataSource,
  selection and rules reach it through the SyncEngine like any module (the Export tool's separate
  sync registration is gone). `ExplorerApplication._createModule` creates it for tool types
  (`_createToolModule`; Report: heurist-reports direct mount, Export: `ExportTool`; Crosstabs,
  Actions, Publish: placeholder). Hidden tools stay alive (a report template is kept while
  another module is shown).
- `togglePresentation` / `showPresentation` take any module type; the duplicate `showPresentation`
  (the second definition silently replaced the first) is merged into one.
- `applyUiConfig`: modules moved to Unused are destroyed (`_removeModule`); a report template with
  unsaved changes is confirmed first, and declining keeps the dialog open.
- Right rail: tool buttons are toggles like the presentations; Publish moved to the tools group;
  `applyModuleOrder` orders each group (presentations, tools) by the layout and hides the buttons
  of unused modules (and an empty group's separator).
- Configuration dialog: the tool chips, the Unused pane below the grid (no checkbox).
- `ExplorerPaneTabs`: tabs for tools too; when the names do not fit the strip (`scrollWidth >
  clientWidth`), class `is-icons`: icons only, wrapped; the names come back when the pane is as
  wide as the strip was with names (ResizeObserver on the pane).
- `ExplorerPaneToolbar`: no right rail (CSS); the gear menu (`<details class="h-dropdown">`, menu in
  fixed position so the collapsed strip does not clip it); a pane left without configured modules
  is hidden.
- `ExplorerCompactMode` (narrow screens): tool titles in `MODULE_TITLES`; no `modechange`.
- `HCardinalLayout.css`: divider buttons fill the splitter's thickness (7px in Explorer, the
  default `splitterSize`), 24px long, font-size 7px, no border.
- `heurist-module.css`: `.heurist-panel-pinned` has no min-height (Data's Expansion button is an
  `h-btn`, 30px), and the shrunk header (not hovered) has no min-height either.

## Open / to check in a browser

- Tab strip fitting (icons only, wrap) at different pane widths.
- Gear menu position in the row and in the collapsed strip.
- Report tool: switching to another tab and back keeps the editor state.
- Pinned buttons in Data and Record View against the source header border.

# Part 3 — simplified interface and search pane (2026-10-14)

Requests (Artem, 2026-10-14), implemented the same day, not committed, not checked in a browser.

- **"Interface for dummies (v7 like)"**: first check of the configuration's Interface section, config
  `isSimplifiedUI`, **on by default**. While checked, the dialog hides Toolbar position, Toolbar
  buttons size, Lists, the whole Layout section and the Query tracer button, and Explorer applies
  fixed values (`effectiveUiConfig()` in `ExplorerUiConfig`): toolbar In panes, small icons, lists
  docked; West: Result; Center: Record View, Map, Graph, Report, Export; Unused: Publish, Crosstabs,
  Actions. **Timeline was not in the list: it keeps its default pane, South** (to confirm). The
  saved configuration keeps the user's own choices; they apply again when the box is unchecked.
  Explorer keeps both: `uiConfigSaved` (edited in the dialog) and `uiConfigValue` (applied).
- Simplified, toolbar: no Sources, History, Workspace, Subsets buttons (root class
  `h-explorer-simplified`, CSS in `ExplorerApplication.css`); no Query tracer in the gear menu; a
  shown query trace is closed.
- Simplified, Query Source editor (`setSimplified`, class `is-simplified`): no Builder, Save
  (source), Add/Remove (workspace), p0, p5 or presentation settings; p3 (sentence) always hidden; a
  new **p6** in p3's place with small captioned icons: Filter builder, Save filter for re-use, Filter
  help. **Save filter for re-use** always opens the legacy "Add new filter" dialog
  (`editSavedFilter(null, query)`, the same popup as editing a saved filter) with the query as text
  (JSON queries as JSON text); hidden when the host has no saved filter editor.
- Search pane: tooltips say "search pane" (was "left pane"); a toolbar button clicked while the pane
  is collapsed opens it again, and a docked list opens at the first click even if it was the list
  shown before (`ExplorerControlPanel#_reopenSearchPane`).
- The Query Source editor is **Horizontal (north) by default** (`ExplorerAuthoringDock`, stored
  placement still wins).

# Part 4 — simplified interface, round 2: QSE in Result, Data module (2026-10-14)

Requests (Artem, 2026-10-14) and agreed answers; implemented the same day, not committed, not checked
in a browser.

- Configuration dialog: caption first, then the checkbox (`Interface for dummies (v7 like) [ ]`).
- 2026-10-17: the checkbox is renamed **"Advanced UI"** and shows the reverse value
  (checked = `isSimplifiedUI: false`); the config key is unchanged.
- Toggling `isSimplifiedUI` **reloads Explorer** (like a language change): the modules read it at
  start (`runtime.simplifiedUI`).
- QSE Save / Add were still visible: `DataSourceActions` inline mode gives the slot
  `display:contents`, which overrode `[hidden]`; fixed with `.h-dsa-inline[hidden]`.
- QSE always horizontal: `ExplorerAuthoringDock.setForcedPlacement('north')` (the stored placement
  stays).
- **QSE inside Result** (direct mode): heurist-data `setHeaderContent(element)` (public API; the
  control panel puts the element under the source header, pinned like it, and puts it back when an
  engine re-renders) and `ExplorerAuthoringDock.setExternalHost(element)` (region `'external'`). The
  **Filter Form still opens in the Search (West) pane** (Artem): a temporary placement wins over the
  outside host, and the editor goes back into Result when the form closes; with the editor outside,
  every form (also horizontal ones) moves to the West (`isOutsideSearchPane`). Iframe mode: the
  editor stays in its north pane (agreed).
- heurist-data simplified (`config.simplified`, `simplifiedDataSettings.js`, applied at bootstrap,
  initial preference load and every `applyConfiguration`): Show header, Options, Expansion rules on;
  Page size, Search in results off; Counter, Export, View mode, Selection actions on; Extended view
  and Popup templates Built-in; all interactions on; Admin info on by default and switched by See/hide
  owners (saved to the preferences). The dialog has no Interface or Interaction section and no
  Extended view / Popup template rows.
- Toolbar (only simplified): record list Counter, Pagination (moved from the footer), View, Selected,
  Sort, See/hide owners; Table view keeps its native controls, its `heurist-data-toolbar` gets Sort and
  See/hide owners (`ui/ListToolControls.js`). Sort (v7 set: Default, Title A-Z/Z-A, Modified/Added
  newest, Record type, ID) is this module's only (`DataApplication.listSort`, `/records` `sort`); a
  Table column order wins over it, and choosing a Sort clears the column order.

# Part 5 — simplified interface, round 3: Map, Timeline, QSE, pagination (2026-10-14)

Requests (Artem, 2026-10-14), implemented the same day, not committed, not checked in a browser.

Simplified interface only:
- **Map** (`config.simplified`, `ui/config/simplifiedMapSettings.js`, applied in `applyPersistedSettings`
  — bootstrap and initial preference load — and in `MapApplication.applyConfiguration`): no header,
  control panel collapsed at start, dynamic document titled "Current results", not loaded by map
  extent. Configuration dialog: no Advanced settings toggle (advanced off), Map Controls shows only
  Native Map Controls, no Workspace/Filtered Result Map section.
- **Map and Timeline show the current result only**: Explorer sends them no Workspace sources
  (`_syncWorkspaceMap`).
- **Timeline**: control panel collapsed at start (`config.simplified`), the "Expand control panel
  initially" checkbox is not offered.
- **QSE**: query textarea one row; when the user closes a Filter Form (its close button, or a list
  clicked while it covers the Search pane) the editor is cleared (`closeFilterForm({clearEditor})`),
  not left with the parameterized query.
- **Data**: while the Filter Form is open in the Search pane the editor slot in Result is empty and is
  not shown (no gap; `:empty` CSS).

All modes, record list pagination: hidden with one page; up to 12 pages all are listed, above that
first … 3 before, current, 3 after … last (`widgets/pageEntries.js`); in a pane narrower than 520px
(container query) a select with the same entries replaces the page buttons.

# Part 6 (2026-10-14)

- Simplified interface: the Query Source editor in Result is 68px high
  (`--heurist-header-content-height` in heurist-data `style.css`, only Explorer uses that slot).
- All modes: two built-in filters at the top of Saved Filters, above the search and apart from the owner list (moved there the same day; first placed under "Mine") (`BUILTIN_FILTERS` in
  `ExplorerControlPanel.js`): **Recent** `sortby:-m after:"1 week ago"` and **All by date** `sortby:-m`.
  Not records: no star, no edit; they run as a plain query.
- "In panes": opening the search pane with `»` shows the Saved Filters list (docked lists), unless
  another list is shown (`ExplorerControlPanel#showDefaultList`).
- Parameterized queries are **not saved as Saved Filters** from the new UI (Artem, 2026-10-14): the
  legacy faceted format can not hold our template + Filter Form without a lossy reverse converter, and
  parameterized queries belong in Query Sources (transition to the new UI). `editSavedFilter(null, …)`
  — "Save filter for re-use" and the Data module's "Save as Filter" — shows a message instead. Saving
  them in legacy faceted v2 and opening the legacy faceted wizard was assessed (save silently with
  `ssearch_save`, then `showSearchFacetedWizard({svsID})`; reverse converter ~350 lines) and not done.

# Part 7 (2026-10-15)

Requests (Artem, 2026-10-15), implemented the same day, not committed, not checked in a browser.

Explorer:
- **Toolbar buttons size** is always shown and enabled in the configuration (also "In panes" and in
  the simplified interface; `effectiveUiConfig()` keeps the user's `buttonSize`, default *Large icons
  with captions*). "In panes" it applies to the left rail (row and collapsed strip) and to the tabs
  of **collapsed** panes (root class `h-pane-buttons-<size>`, `ExplorerPaneTabs.css`); expanded panes
  keep the normal tabs. The strips are sized to match (`STRIP_SIZES` in `ExplorerPaneToolbar.js`):
  search pane 34 / 160 / 68 / 68 px, module panes (width × north/south height) 26×26, 120×32, 66×66,
  70×78 px for small / small-caption / large / large-caption. New `HCardinalLayout` option
  `collapsedHeight` (north/south strips and the squeezed middle row; null = `collapsedSize`) and
  `ExplorerAuthoringDock#setToolbarStripSize`.
- A click anywhere on a collapsed pane (not on a button or tab) expands it: a module pane with the
  module it shows (`ExplorerPaneTabs#_onCollapsedClick`), the search pane like `»` (default list).
- Lists: an empty star (not a favorite) is shown on mouse over only; a favorite's star always.
- Built-in filters Recent / All by date: `margin-left: 24px` on their title (`.h-explorer-source-title`), not the row.
- "In panes": a click on the shown list's button no longer hides the list (and so no longer
  collapses the search pane).
- The gear (Options) menu shows no ▴ while open.

Data module (`HRecordList`):
- Internal option `collectionMode`: `permanent` (the collection checkbox, as before) or `mouseover`
  (**default**: a +/- button with the row actions, shown on mouse over). Not in the settings dialog.
- Collected records: class `h-recordlist-collected`, background `#e6fdeb`; selected and collected
  `#80e8da`. (The class is new; collection state is now also applied on every render.)
- The same in the Table view (`DataTablesAdapter`, same internal `collectionMode`): the checkbox column
  only with `permanent`, else a +/- button first in the row actions (column 4.5em); rows
  `heurist-data-collected` `#e6fdeb`, selected and collected `#80e8da`.
- Table view fix: collected rows were not marked after switching to the Table view (the first draw
  runs inside the DataTables constructor, before `this.instance` is set); every drawn row now gets
  its selected / collected state in `rowCallback`.
- Admin info (owner, visibility, bookmark) and the record-type icon URL: one shared renderer
  `apps/data/src/ui/recordAdminInfo.js` for HRecordList and the Table view; both use
  `fa-regular fa-eye` / `fa-regular fa-bookmark`.

Simplified interface, QSE p6 (2026-10-15):
- **Filter builder** (`fa-solid fa-filter`) opens the **legacy search builder** (`searchBuilder.js`
  `showSearchBuilder`) via the existing host bridge `openSearchBuilder({query})` (Explorer
  `openSearchBuilder(query)`): it starts with the query text, its result replaces the query (a Filter
  Form is dropped) and runs. Without that bridge method our Filter Builder opens, as before.
- New **Facet builder** (`fa-solid fa-sliders`) after it: the legacy faceted search wizard for a new
  faceted Saved Filter, `HSvsEdit.showSavedFilterEditDialog('faceted', …)`. New bridge method
  `editFacetedFilter()` (heurist `HeuristModuleExplorer.js`; `HEURIST4.ui.editSavedFilter(svsID, squery,
  mode)` got the `mode` argument). It resolves when the filter is saved (the wizard calls back
  `(event, request)`); closing the wizard without saving leaves it pending (the wizard has no close
  callback). Explorer reloads the Saved Filters on save. Shown only with the bridge method and
  `canEditSavedFilters`.
- The Filter Form has no **Builder** button in the simplified interface.
