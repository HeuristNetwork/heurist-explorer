# Explorer authoring dock and compact mode

Status: decisions agreed with Artem, 2026-09-25. Part A and Part B implemented
(not yet verified in a browser). Part B will be tuned with the publication work
([Explorer-Publication-and-Website-Development-Plan.md](Explorer-Publication-and-Website-Development-Plan.md)).
Part C (compact QSE, Vertical/Horizontal placement) agreed and implemented 2026-10-03,
not yet checked in a browser.

## Problem

The Query Source Editor (QSE) and the runtime Filter Form (FF) were rendered
inside the current data module's layout pane (`h-explorer-module-shell`), either
above the module or beside it (`has-side-filter-form`, chosen by a size
heuristic). When that pane is narrow, neither arrangement works: QSE wants a
square or wide area, FF a tall column, and both compete with the module for the
same small rectangle.

Facts that shape the solution:

- QSE and FF are mutually exclusive: the panel shows one or the other.
- Explorer has only one module of each type, so there is exactly one data module.
  The panel never needs to say which module it targets.
- In published/website mode there is no QSE. A parametrized query still needs
  its FF there.
- In main mode QSE/FF should stay visible regardless of which modules or panes
  are shown. A toolbar button hides/shows it, and it appears automatically when
  the user picks a saved filter or query source from the lists.

## Options considered

| Option | Verdict |
|---|---|
| 1. Detach QSE/FF, place it outside `HCardinalLayout` | Same as the chosen design, but splitter, resize and collapse would be rebuilt by hand. |
| 2. Nested layout: an outer `HCardinalLayout` holding QSE/FF and, in its center, the module layout | **Chosen** (Part A). |
| 2a. Dock QSE/FF next to any module | Generalizes the old in-pane approach: every region needs an inner split, and a small region still gives a cramped panel. |
| 2b. QSE/FF as a region occupant like a module | Displaces a module from its region and forces one region for both QSE and FF, which prefer different shapes. |
| 3. Docked / floating modes | Floating covers the map/table and adds z-order, drag and resize work; poor on small screens. Could come later as an optional "pop out". |

## Part A — authoring dock (desktop)

### Decisions

1. **Outer layout.** `ExplorerApplication` creates an outer `HCardinalLayout` on
   the workspace element with two regions:
   - **west**: the single `QuerySourcePanel` (QSE or FF);
   - **center**: the existing module `HCardinalLayout` (`LayoutManager`), unchanged.

   The module layout's root is created once and never re-parented, so no module
   iframe reloads because of the dock.
2. **West pane size.** Minimum and default width are 300px.
3. **Per-mode width.** QSE and FF each remember their own width (dragged with the
   splitter), stored per database in the viewer's browser under the dock's own
   key (`heurist.explorer.<db>.authoringDock`), separate from `ExplorerUiConfig`
   so the configuration dialog's saves never reset it.
   Switching between QSE and FF resizes the pane to that mode's width.
4. **No docking switch for now.** The pane stays west. If QSE proves too cramped in
   practice, the only switch worth adding is a west/north toggle for QSE (FF stays
   west). A general "dock anywhere" switch is not planned.
5. **Visibility.** Visible by default in main mode. The toolbar Search button shows
   and hides the whole pane (it no longer switches FF back to QSE; FF has its own
   Close button for that). Selecting a saved filter, query source, record type,
   history or workspace entry shows the pane automatically. A hidden pane never
   silently receives new content.
6. **One panel.** The per-data-module panel map (`querySourcePanels`) and the
   module shell with its size heuristic (`_scheduleResponsiveLayout`,
   `has-side-filter-form`) are removed. The pane scrolls on its own.
7. **Published mode.** The same west pane can later host FF (or the published
   HFilter) without QSE, as the publication plan already proposes ("mount HFilter
   to the left or above HCardinalLayout").

### FF submit triggers

`HFilterForm` distinguishes how a search starts:

- **input commit**: leaving an input with a changed value, or pressing Enter;
- **Filter button**: an explicit click.

`onSubmit` receives `trigger: 'input' | 'button'`. An explicit Filter click also
dispatches a bubbling `h-filter-form-apply` event after a successful submit, even
when the click lands inside the de-duplication window right after an input commit
(which otherwise swallows the second submit). **Only the explicit Filter click may
hide FF** — used by compact mode (Part B). Input commits search but never hide it.

## Part B — compact mode (narrow screens)

`HCardinalLayout` does not suit phones. The main target for mobile is the
published website; main (editing) mode on a phone only needs to be usable.

### Decisions

1. **One separate module** — `ExplorerCompactMode` in `apps/explorer/src/ui/` with
   its own `ExplorerCompactMode.css`. All code that switches to compact mode and
   back lives there:
   - breakpoint detection (`matchMedia`; the breakpoint value is defined only here);
   - toggling one class (e.g. `h-compact`) on the Explorer root; all compact-only
     CSS hangs off that class in its own stylesheet;
   - the module switcher UI and the active-module state;
   - resize notification to a module when it is switched to (Leaflet and
     vis-timeline draw wrongly after being hidden);
   - drawer behavior for the QSE/FF pane.

   Existing parts expose only small hooks (`LayoutManager`: which modules occupy
   regions; the dock: `expand()`, `collapse()`, `h-filter-form-apply`). Leaving
   compact mode removes the class and tears down the switcher; desktop code never
   knows compact mode exists. Deleting the module leaves a working desktop Explorer.
2. **QSE/FF pane.** Expanded, it overlays the whole layout (full width on phones);
   collapsed, it is a thin rail plus the toolbar button. Implemented as positioning
   of the existing west pane, not a DOM move, so crossing the breakpoint is
   reversible. An explicit FF Filter click collapses it so results are visible;
   input commits do not. Picking a filter or source expands it.
3. ~~**Modules: single-module mode.**~~ *Superseded by 3a.* Modules are **not** moved to the center region —
   re-parenting an iframe slot reloads it (see `LayoutManager.assignModule`) and
   loses map position, table paging and timeline zoom on every rotation. Instead
   all occupied regions are stacked in the same place with CSS, splitters hidden,
   one module visible at a time, chosen with the switcher. Returning to a wide
   screen restores the normal region layout.
3a. **Modules: scrollable vertical stack** (Artem, 2026-09-25). All visible modules
   form one vertical, scrollable column; each module is one screen high (stack
   viewport), with a thin title strip above it that stays touchable, because maps
   and iframes capture touch gestures. The toolbar's existing presentation buttons
   show/hide modules; a module that appears is scrolled into view (scroll snapping
   is `proximity`). Done with CSS only: the module layout root becomes a flex
   column, its middle row `display: contents`, splitters hidden — slots are never
   re-parented. Limits inherited from the region model: one module per region, so
   modules sharing a region (Map and Graph by default) still replace each other;
   stack order follows regions (north, west, center, east, south).
3b. **Toolbar**: small icons without captions while compact; the configured size
   comes back on leaving (also re-applied after the Options dialog saves).
4. **Order.** Build and test against published mode first (modules plus FF only,
   no QSE); main mode then gets the same behavior with QSE in the drawer.

### Not yet adapted for narrow screens (to be addressed)

These dialogs open from the drawer but keep desktop sizing; on a phone they
overflow horizontally or are cramped. Each needs its own narrow-screen layout.

| Widget | Where it breaks |
|---|---|
| `HFilterBuilder` (`widgets/filter-builder/`) | Criteria rows are a 5-column grid with minimums of about 690px (`64px minmax(190px,…) 24px minmax(150px,…) minmax(260px,…)`); record-type select `min-width: 240px`; sort row 200px + 130px; WKT value 240px. Needs rows that stack field / operator / value vertically. |
| `HFilterFormDesigner` (`widgets/filter-builder/`) | Dialog `min-width: min(1320px, 100vw - 64px)`; editor + live preview side by side (`minmax(0,3fr) minmax(320px,2fr)`); row fields `min-width` 190px / 95px. Needs preview below (or as a tab) and one-column rows. |
| `HFieldSetEditor` (`widgets/query-source/helpers/`, Column fields) | 7–8 column grid rows (drag, code, name 180px, title 160px, width, aggregation, actions) inside `.h-qse-helper` with `min-width: 420px`; opened in a full-width dialog. Needs a two-line row or a per-field detail view. |

Likely the same fix applies to the other Query Source helper dialogs that share
`.h-qse-helper` (`min-width: 420px`): geographic and time field selectors, rule builder.

## Part C — compact QSE: Vertical / Horizontal placement (2026-10-03)

Users found the QSE too large (too many buttons and rows) and some wanted it above
the modules, as the old search box was. Agreed with Artem 2026-10-03.

**Five panes.** p1 `h-qse-query` · p2 Filter, Builder, Save (Query Source), Add (to
Workspace) — the last two are DataSourceActions in a new `inline` mode, rendered into
the editor's `actionsSlot` · p3 `h-fih-sentence` (HFilterInlineHelper `sentenceHost`
option) · p4 `h-qse-advanced` (config buttons, Title) · p5 small icon buttons: Clear
(`h-qse-clear`), Help (`searchQueryLanguageEng.htm`, refreshed from the legacy
`documentation/context_help/searchQueryLanguage.htm`), Layout (`fa-ellipsis`) with a menu
Vertical / Horizontal / More.

**Placement.** Vertical = west pane (as before), Horizontal = north pane. The dock moves
only the pane element (`ExplorerAuthoringDock.setPlacement`, appended, not set as region
content, so the compact rail stays); the module layout is never re-parented. The dock
dispatches `placementchange`; Explorer sets the panel orientation from the region.
Stored per database with the widths: `{ widths, northHeight, placement, advanced }`
(old widths-only values still load). Compact mode is always vertical (`setDrawerMode`
moves the pane west and restores the placement on leaving); the menu then hides
Vertical/Horizontal.

**Layout rules.** Supports width 300px (vertical) and height 66px (horizontal, `minNorth`, `.h-qse.is-horizontal` min-height; 50px at first, raised 2026-10-03).
- Horizontal: row 1 = p1 p2 p4 p5, row 2 = p3. p1 is 270–600px wide and shrinks when the
  others reach their minimum; its height is the pane height minus the sentence (30–300px).
  p2/p4 buttons 30×30 without captions up to 90×30, wrapping; `h-qse-config-value` hidden
  (the summary is in the button tooltip). p5 right aligned.
- Vertical: p1..p5 stacked; wider than 400px p1 and a column of p2 buttons share a row,
  p1 taking p2's height unless resized taller (max 300px). p4 as before (rows with values).
- Vertical caption breakpoints (container queries) are starting values, to tune in the
  browser: p2 < 330px, p4 < 520px. Horizontal is fitted by the editor (see the revision below).

**More.** Hidden by default, remembered per database. The editor no longer collapses it
on `setDataSource`/`markCommitted`. The record-type change confirmation is now asked
whenever the draft has Query Source settings (before, only when expanded — which was
always).

**Title and status.** Title stays in p4 (a narrow input in horizontal). The h-dsa status
line is removed; its text ("Query Source #12 · In Workspace") is in the Save/Add tooltips.

**Filter Form in Horizontal.** Decided by the form's own `layout.settings.orientation`:
a horizontal form stays in north (fields max 300px, wrapping); a vertical form (the
default) moves the pane west while open (`setTemporaryPlacement`) and back on close.

**Revision 2026-10-03 (after the first look).**
- p0 = Clear and Help, a column of two 20px icons left of the query, inside p1 (both
  orientations). p5 keeps only Layout.
- Horizontal: Filter, Builder, Save, Add and the p4 buttons have one width (90px with
  captions, 30px without). `QuerySourceEditor#_fitHorizontal` (ResizeObserver on row 1,
  MutationObserver on p2 for hidden Save/Add) chooses the arrangement, in this order, with
  the query at 600px: captions in one row → captions wrapped into as many rows as the
  height allows → no captions in one row → no captions wrapped; only if nothing fits the
  same order is tried with the query at 270px. It sets `--qse-btn-w`,
  `--qse-p2-columns`, `--qse-p4-columns`, `.is-collapsed`, `.is-wrapped`. Sizes are in its
  `FIT` constant.
- Title: in one row it follows the buttons, as wide as 4 buttons without captions (132px);
  when wrapped it takes its own row under the buttons, as wide as they are.
- Icons in buttons without captions are centred.
- Horizontal Filter Form in the north pane (QuerySourcePanel.css only, the shared form is
  unchanged): fields and `h-filter-form-actions` wrap in one flow, each max 300px, top
  aligned; groups give up their box (`display:contents`, a heading takes a full row);
  the actions are not sticky and have no top border.

**Revision 2026-10-06 (Artem).**
- p0 = Clear, Help and the sentence glasses (`h-qse-sentence-show`, was in the query's corner).
- p5 = two small buttons (16px, as in p0) instead of the Layout menu: `h-qse-layout` switches
  Vertical/Horizontal (icon `fa-ellipsis-vertical` in vertical, `fa-ellipsis` in horizontal;
  hidden in compact mode), `h-qse-toggle-advanced` shows/hides p4 (`fa-angles-down`/`-up` in
  vertical, `-right`/`-left` in horizontal). The menu is removed. Horizontal p5 is no longer
  pushed to the right edge (no `margin-left:auto`).
- Compact mode re-applies the editor orientation after `setDrawerMode`, so the Layout button
  is hidden/shown even when the region does not change.

**Query trace** hidden for now (`TRACE_PANEL_SHOWN = false` in ExplorerApplication; the
RequestMonitor runs with tracing off, so requests carry no `debug` flag). Stop stays.

Tests: `test/explorerAuthoringDock.test.js`, additions in `querySourcePanel.test.js` and
`querySourceEditorApply.test.js`.

## Part D — docked Filters / Entities / Sources lists (2026-10-04)

Agreed with Artem 2026-10-04. Explorer configuration → Toolbar: **Filters, Entities and Sources
lists**: *Docked in the left pane* (default) or *Popup* (the old flyout). Docked:

- The lists live in the outer West pane (`ExplorerAuthoringDock.listElement`), below the pane
  (QSE). One list at a time; the toolbar buttons toggle them like modules sharing a pane, the
  active one selected. Picking an item does not close the list.
- QSE vertical: QSE on top, the list fills the rest. QSE horizontal: the list alone in the West.
- A Filter Form in the West fills it: QSE and list hidden, Search and list buttons deselected.
  Search or a list button closes the form and brings back the editor and the list; so does the
  form's own close.
- The West pane is hidden when it holds no list, no Filter Form and no vertical QSE.
- Compact mode (drawer): the lists stay popups. No list at start; not remembered.

Implementation: the dock keeps the pane's and the list's visibility separately
(`_paneShown`, `_listShown`, `_formCover`, `_syncRegions()`); QuerySourcePanel reports
`onFormVisible`; `ExplorerControlPanel._toggleDockedList()` / `syncAuthoringButtons()`;
`ExplorerApplication.isListsDocked()` / `closeCoveringFilterForm()`; config `lists`.
Tests: `explorerDockedLists.test.js`, additions in `explorerAuthoringDock.test.js`.

2026-10-06 (Artem): **Favorites, History and Workspace** follow the same setting - docked in
the West pane or popup, one list at a time with Filters/Entities/Sources (`DOCKED_LISTS`).
The configuration label is now *Lists (Filters, Entities, Sources, Favorites, History,
Workspace)*.

## Changelog

- 2026-09-25 — Document created; Part A implemented (not yet verified in a browser):
  `ui/ExplorerAuthoringDock.js/.css` (outer layout, per-mode widths);
  `ExplorerApplication` creates one `QuerySourcePanel` in the dock at start-up
  (`_prepareModuleContainer` and `querySourcePanels` removed); `QuerySourcePanel`
  lost its own show/hide and size heuristic (`onShow`, `onModeChange` options);
  `HFilterForm` reports `trigger` and dispatches `h-filter-form-apply`. The panel
  no longer scrolls or draws its own border; the pane scrolls, so the Filter
  Form's sticky actions pin to the pane.
- 2026-09-25 — Fix: the panel gets its own host inside the pane (it replaced the
  pane's class, which removed the scroll container). QSE adapted to the vertical
  pane: always expanded (`collapsible` option, default `false`, keeps More/Less for
  later), Clear moved next to Builder and now also clears the query (a
  parameterized query becomes an empty, editable one), query box 6 rows / 200px on
  its own line.
- 2026-09-25 — Part B implemented: `ui/ExplorerCompactMode.js/.css` (breakpoint
  `(max-width: 700px)`), dock `setDrawerMode()`, application `compactMode`
  (created after the first layout; `refresh()` after Options save),
  `syncSearchButton()` made public. Tests: `test/explorerCompactMode.test.js`.
- 2026-09-25 — Compact: module area isolated (direct-mode control panels no longer
  show through the drawer); drawer rail gains Up/Down (previous/next module);
  toolbar presentation buttons in compact mode: hidden -> show and scroll to it,
  on screen (at least half the stack viewport) -> hide, off screen -> scroll to it
  (`ExplorerCompactMode.togglePresentation`, one delegation line in
  `ExplorerApplication.togglePresentation`).
- 2026-09-25 — Compact: an explicit QSE Filter click that runs a search
  (`h-query-source-run`; not Enter, not a parameterized query) collapses the
  drawer; the rail's Show search button fills the height above Up/Down. Listed
  HFilterBuilder, HFilterFormDesigner, HFieldSetEditor as not yet adapted.
- 2026-09-25 — Compact: activating a tool (report, crosstabs, actions, export;
  LayoutManager `modechange`) scrolls to its panel in the center region, whose
  title strip shows the tool name. Explorer `viewRecord` host action shows the
  Record view (scrolled to in compact mode) and selects the record.
- 2026-10-03 — Part C: compact QSE (five panes), Vertical/Horizontal placement through the
  Layout menu, More remembered, query trace hidden. Not yet checked in a browser.
- 2026-10-04 — Module layout (agreed with Artem): default panes West = Result, Center = Record
  View, Map, Graph (Timeline stays South); West and Center expanded at start. New `order` in
  `ExplorerUiConfig` (one list of module types; order within a pane = this list filtered by the
  pane). In the Configuration dialog chips can be dragged within a pane (drop before/after a
  chip). At start an expanded pane creates only its first module; the others are created when
  first opened (`leadingPaneTypes()`, `applyLayout`). The Result module created by a search now
  uses its configured pane. "Data" caption renamed "Result" (dialog, compact title, tour).
  The toolbar no longer hides the last visible module (flash message). The last history query
  at start shows the QSE loading veil and Stop, not the start-up spinner in the screen centre.
  Not yet checked in a browser.
- 2026-10-04 — Module West pane takes 50% of the module area by default (`HCardinalLayout`
  `westRatio`, set by `LayoutManager`). Toolbar module buttons follow the layout: pane by pane
  (north, west, center, east, south), then the order within the pane (`moduleTypesInOrder()`,
  `ExplorerControlPanel.applyModuleOrder()`, also after Apply in the Configuration dialog).
  QSE: p0 buttons 16px; the query sentence (p3) is hidden by default — a small glasses button
  at the query's bottom right shows it, a × button at the sentence's bottom right hides it
  (not remembered). Not yet checked in a browser.
- 2026-10-04 — Part D: Filters / Entities / Sources lists docked in the West pane (option, default
  docked). Not yet checked in a browser.
- 2026-10-04 — Configuration dialog: section "Toolbar" renamed "Interface" (Toolbar position,
  Toolbar buttons size, lists mode, Language). Language (`auto` = host language, or eng / fre /
  ger / por) is kept in `ExplorerUiConfig.language`; `explorerConfig.js` resolves it before the
  locale loads, so Explorer and every module (runtime.language) start in it. Changing it reloads
  Explorer. Record View hides its own Language selector in preferences mode (shown for
  publication / website, as Graph). Not yet checked in a browser.
