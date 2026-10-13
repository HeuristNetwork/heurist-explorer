# Compact toolbar position — development plan

Status: **agreed and implemented 2026-10-13, not committed, not yet checked in a browser.**
Unit tests: `shared/test/hCardinalLayout.test.js`, `apps/explorer/test/explorerCompactToolbar.test.js`.

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
