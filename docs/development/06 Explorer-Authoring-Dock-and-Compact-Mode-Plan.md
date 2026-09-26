# Explorer authoring dock and compact mode

Status: decisions agreed with Artem, 2026-09-25. Part A and Part B implemented
(not yet verified in a browser). Part B will be tuned with the publication work
([Explorer-Publication-and-Website-Development-Plan.md](Explorer-Publication-and-Website-Development-Plan.md)).

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
