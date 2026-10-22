# Large records: many fields, many values, many links — development plan

**Current state 2026-10-22:** agreed (Artem, 2026-10-22). **Phases 1 and 2 implemented** (§8, §9; loading indicators §10), not
committed, not checked in a browser; `npm test` passes, `build:all` builds. Phase 3 (edit workflow, §4) implemented (§11), not committed,
not checked in a browser. Phase 4 (PATCH of changed fields) needs careful server testing first.

Plans 14 (record editing), 14a (HEditForm), 18 (Record summary), 20 §9 (`/aggregate`) and 22 (relmarker
input) are the base.

## 1. Problem (Artem, 2026-10-21)

Users define very large record types: one database has ~200 fields per record type. Also, a field can have
many values and a record can have thousands of incoming links. RecordView (`builtin` engine), HRecordEditor /
HEditForm and the Record summary all expect small records. Today:

| Where | What happens now |
|---|---|
| `RecordViewRenderer.#buildSections` | renders every filled field and every value |
| `RecordViewRenderer.#buildMedia` | one thumbnail for every file value |
| `RecordRelationsProvider` | three searches with `limit: 500`, no total, no "more"; past 500 the list is cut and nobody is told |
| `relmarkerRelations.js` | the same, LIMIT 500 |
| `HEditForm._renderGroups` | creates an `HEditField` (with its HInputs) for **every** field of every tab and accordion, also hidden ones |
| `HRecordEditor.save` | sends the whole record (`client.update` = PUT) |

## 2. Field limit per record type (future)

A warning in the record structure editor when a record type passes 100 fields, and a stronger one past 200. No
hard block, because imports and old databases already have more. This belongs to the future structure editor
(`HEditFormDesigner`), not to this plan.

## 3. RecordView and "Linked from": limits

### 3.1 Configurable limits (Artem, 2026-10-22)

New section **Record View and Edit limits** (named *Record view* until 2026-10-22) in the Explorer configuration dialog (`ui/config/ExplorerConfigurationDialog.js`,
saved in `ExplorerUiConfig`). Four dropdowns, options **10, 20, 50, 100, 500**:

| Setting | Default | Used by |
|---|---|---|
| Limit fields | 50 | filled fields shown before "Show N more fields" |
| Limit values | 10 | values per field shown before "Show all N" |
| Limit thumbnails | 10 | media strip |
| Limit reverse links | 20 | records per group in "Linked from" and in a relmarker field |

The renderer gets them as options (`limits: {fields, values, thumbs, links}`), defaults in one place in
`shared/` so the RecordView app, the Data module (extended view), the record popups and the Record summary use
the same numbers.

**Decision (2026-10-22, Phase 1):** the limits reach the modules in the bootstrap, `runtime.recordLimits` (like
`language` and `simplifiedUI`). A change in the configuration **reloads Explorer**, as a language change does,
and the last query opens again at start (plan 11). No new bridge method: an update call would need the
contracts, both module adapters, the Data and Record View public APIs and the legacy wrapper, for a setting
that is rarely changed.

### 3.2 Fields and values (client only)

The record JSON is already loaded. The cost is the page (DOM), not the data, so only the **rendering** is limited:

- Fields: the first *Limit fields* filled fields, counted across the sections in order, then a row
  "Show N more fields". A click renders the rest in place, in their sections.
- Values: the first *Limit values* values of a field, then "Show all N" in the same `dd`. Pointer fields too
  (their titles are already resolved).
- Media strip: the first *Limit thumbnails* thumbnails, then "+N more".
- Not proposed: a per-field value limit on the server. No such case seen so far, and it would make editing
  harder. Reconsider only if a record with 10 000+ values appears.

### 3.3 "Linked from" and relationships: counts first

Instead of loading up to 500 rows:

1. One `/records/aggregate?op=rectypes` with `q=[{"lt":id}, …]` gives the count per record type
   (`shared/src/data/aggregate.js`). The relationships to this record are counted per relation type
   (`op=values` on the relation type field 2-6).
2. Titles only for the first *Limit reverse links* records of each group (`limit` = that value).
3. Row label with the count, e.g. "Charter (1 234)". After the titles: **"Show all 1 234 in search"**, which calls
   a new host callback `onSearch(query)` (the same pattern as `onSearchTag`) with `[{"t":rty},{"lt":id}]`.
   Without a host search: "Show N more" (next page loaded in place, `offset`).
4. All of this stays in `RecordRelationsProvider` and `buildLinkedFromSection`, so RecordView and the
   Record summary of the editor (Linked records) get the same behaviour.
5. `relmarkerRelations.js` (relmarker field in the editor): the total comes from `pagination.total`. A cut list is
   always marked ("Showing 20 of 312", "Show all").

**As built (2026-10-22, Phase 2, §9):** a normal record still costs one search of each kind: the first page
(500 rows) holds all its links. Only when a kind has more than the first page are the groups counted
(`/aggregate`) and the missing first N of each group loaded. A relation-type group is "exactly this type"
(`f:6 = "=<term>"`, without child terms, as `op=values` counts). The editor's relmarker fields keep loading 500
per direction and show a warning when there are more (their inputs are Phase 3).

## 4. Edit workflow for very large records (needs its own planning session)

Outline agreed 2026-10-22; **decisions of the planning session (Artem, 2026-10-22)** below.

### 4.1 Lazy groups

`HEditForm` does not create the widgets of a group while it is hidden, inactive (another tab) or collapsed
(closed accordion). They are created when the group is first shown. A field without a widget keeps its
state in `states`. `getStates()`, `getValues()`, `validate()` and the "changed" check read that state. A required
field that is missing in a group that was never opened opens its group (`revealField`).

### 4.2 Automatic groups

When a record type has no groups (no separators), or a group has more fields than **Limit fields** (Explorer
configuration, §3.1; default 50), the fields after the first N are put into automatic accordions of N fields,
collapsed, titled "Fields 51-100", "Fields 101-150", and so on (Artem, 2026-10-22: the configured limit, not a fixed
25). This is only a view rule. The record structure does not change.

### 4.3 Fields navigator (West pane)

A new West pane, **"Structure"**, in the record editor:

1. Collapse and expand work the same way as for the Record summary.
2. **Decision:** a new widget **`HStructureTree`** (`shared/src/widgets/structure-tree/`), not `HFieldTree`.
   `HFieldTree` picks a path across linked record types (pointer hops, linked-from branches, enum outputs, header
   fields, popover) and has no groups. The new tree shows the **normalized HEditForm form** (groups → inner groups →
   fields), so it works for every HEditForm, and the future `HEditFormDesigner` can reuse it (drag and drop, edit
   actions). The field-type list of the type filter and the type labels are moved to one small common module used
   by both trees.
3. Fields are grouped as in the form, with nested groups (inner separators). Automatic groups (§4.2) show as groups
   too. A field shows whether it is filled and required; the tree follows the form (`h-input-change`).
4. A toolbar above the tree (**changed after review, Artem 2026-10-22**, §12):
   - [ ] Required only (disables the other two), [x] Show optional (on at start; off hides the optional fields, as in
     the legacy editor; Artem 2026-10-22, was "Optional only") and [ ] Empty only: filter the tree **and the form**
   - not remembered: every editor starts with all fields
   - a dropdown to filter fields by type (as in HFieldTree), tree only
   - Find [ … ]: finds a field and selects it in the tree. Shown only when the form has more than 25 fields.
   - **No alphanumeric order** (decision): Find and the type filter cover it, and a second order would make the
     tree disagree with the form.
5. Selecting a field in the tree takes the edit form to that field: activates its tab, expands its accordion and
   scrolls to it (`HEditForm.revealField`, which also creates the lazy group, §4.1).

### 4.4 Many values per field

1. A field with more values than **Limit values per field** (§3.1; default 10) creates the inputs of the first N
   only, then "Show all N" (Artem, 2026-10-22: the configured limit, not a fixed 20). The other values stay in the
   field state.
2. **Decision: no shared picker; the inputs stay as they are.** `HValueCombo` creates its `HValuePicker` on first
   open instead of at render (one file, no API change; every combo gains, also in filter forms and dialogs). With
   §4.1 and §4.4.1 only the shown values have inputs, so a picker shared by the values of a field would save little
   more and would complicate `HInputEnum`, `HInputResource` and `HEditField` (moving the popover, per-value state,
   focus, Browse / Add per value).

### 4.5 Save only changed fields

`PATCH /records/{id}` (plan 14) with only the changed fields, from the `HEditForm` snapshot (`_initial`): less
data and fewer overwrite conflicts. This needs careful testing on the server first, for example whether PATCH
replaces the whole value list of a field (GET format), and how translations, hidden values and calculated
fields behave.

### 4.6 Future (not in this plan)

Edit profiles per record type (sets of fields for one task), and batch editing of one field across many records
instead of opening very large records one by one.

## 5. Phases

| Phase | What | State |
|---|---|---|
| 1 | Configuration *Record view* (§3.1), field / value / thumbnail limits in RecordView (§3.2) | done 2026-10-22 (§8) |
| 2 | Linked from and relationships: counts, first N, "Show all in search", host `onSearch` (§3.3) | done 2026-10-22 (§9) |
| 3 | Edit workflow (§4.1-4.4) | done 2026-10-22 (§11) |
| 4 | PATCH changed fields (§4.5) | server tests first (heurist repo) |
| 5 | Field-count warnings in the structure editor (§2) | future |

## 6. Files (main)

- `shared/src/recordview/RecordViewRenderer.js` (+ `.css`), `RecordRelationsProvider.js`, `RecordViewLoader.js`
- `shared/src/data/aggregate.js` (reused), `shared/src/data/relmarkerRelations.js`
- `apps/explorer/src/ui/config/ExplorerConfigurationDialog.js`, `apps/explorer/src/core/ExplorerUiConfig.js`
- Later (Phase 3): `shared/src/widgets/edit-form/HEditForm.js`, `HEditField.js`,
  `shared/src/widgets/record-editor/HRecordEditor.js`, `shared/src/data/recordEditStructure.js`
- Localization `_eng` / `_fre` of the affected apps

## 7. Verification

- `npm run test:shared`: truncation counts, linked-from groups with totals, and the configuration defaults and
  options.
- Test data in `osmak_mapping`: a record type with 200 fields, a record with one field of 300 values, a record
  with more than 1000 incoming links. Open them in RecordView (Explorer) and the record editor, and compare the
  open time before and after (browser Performance panel).

## 8. Phase 1 implementation (2026-10-22)

| File | What |
|---|---|
| `shared/src/recordview/recordLimits.js` | `RECORD_LIMIT_OPTIONS` (10/20/50/100/500), `DEFAULT_RECORD_LIMITS` (50/10/10/20), `normalizeRecordLimits` (an unknown value gives the default), `recordLimitsDiffer`. |
| `shared/src/recordview/RecordViewRenderer.js` (+ `.css`) | Options `limits` and `onGrow`. `#buildSections` collects row builders and builds only the first `fields`. The others are built by "Show all fields (N)" into their own sections; a section with nothing shown is `hidden` until then. Values (`#buildFieldRow`, every field type), the media strip and link rows use `appendLimited`: first N, then "Show all values / files / (N)" which builds the rest in place. `buildLinksRow(…, withRelation, {limit, onGrow})` and `buildLinkedFromSection(…, {limit, onGrow})` are shared with the editor. |
| `shared/src/recordview/RecordPopupContent.js` | Option `limits`; passes `onGrow` → its layout (the popup is placed again after "Show all"). |
| `shared/src/widgets/record-editor/HRecordEditor.js` | Option `limits`: the Linked records of the Record summary use `links`. |
| `apps/{data,graph,map,recordview}/src/*Config.js` | `recordLimits: normalizeRecordLimits(runtime.recordLimits)`. |
| Data (`DataApplication` extended view and `DataRecordPopup`), Graph popup, Map (`MapPopupController`), `initHeuristRecordView` | pass `config.recordLimits`. |
| `apps/explorer/src/core/ExplorerUiConfig.js`, `explorerConfig.js` | saved `recordLimits` (normalized), `config.recordLimits`. |
| `apps/explorer/src/core/ExplorerApplication.js` | `runtime.recordLimits` for every module; `RecordEditorHost` option `recordLimits` (record view dialog, editor summary; also in `editor/RecordEditorShell.js`); saving other limits reloads Explorer. |
| `apps/explorer/src/ui/config/ExplorerConfigurationDialog.js` | Section *Record view* (closed at start, after Interface): four dropdowns *Limit fields / values per field / thumbnails / reverse links*. It is shown in the simplified interface too. |
| Localization | `Show all`, `Show all fields`, `Show all values`, `Show all files` in data, explorer, graph, map, recordview; the dialog texts in explorer (eng, fre). |
| `docs/configuration.md` | `runtime.recordLimits`. |
| Tests | `shared/test/recordview/recordLimits.test.js` (limits, fields/sections, values, pointer values, thumbnails, links); fake DOM got `replaceWith` and `childElementCount`; `explorerUiConfig.test.js` round trip with `recordLimits`. |

Notes:
- "Show all (N)": N is the total count, not the remaining count, for fields too.
- The links limit already applies to the 500 rows loaded today. Phase 2 changes only how they are loaded
  (counts first, then the first N).
- The compact popup card (header and first thumbnail) is not changed.

## 9. Phase 2 implementation (2026-10-22)

### 9.1 Loading (`shared/src/recordview/RecordRelationsProvider.js`)

`load()` now returns **groups** (`LinkGroup`: `label`, `rty`, `total`, `items`, `query`, `more`):
`related` by relmarker field, `relationsFrom` one group per relation type, `linkedFrom` one per record type.
The provider has a `limit` (records per group; constructor option and `load({limit})`, default 20).

For each kind:
1. One search of the first page, `FIRST_PAGE` = 500 rows (as before). When `pagination.total` is not more,
   everything is loaded and grouped on the client: one request per kind, as before.
2. Otherwise the groups are counted:
   - linked from: `GET /records/aggregate?op=rectypes&q=[{"lt":id},{"not":[{"lt:247":id}]}]`;
   - relationships to the record: `op=values&field=<2-6>&q=[{"t":<rel>},{"f:<2-5>":id}]`.
3. A group with fewer than `limit` records in the first page gets the rest of its first `limit` from its own
   search (`offset` = rows it already has).
4. `more()` loads the next `limit` records of a group (`offset`, `limit`).

All searches use the server's default order (record ID). So the rows of a group in the first page are the start
of the group's own search, and `offset` continues it without gaps or doubles.

Group searches (also the "Show all in search" query), checked on `osmak_mapping` as user 2:

| Group | Load query (relationship records or records) | Search query of its records |
|---|---|---|
| Linked from, record type R | `[{"t":R},{"lt":id},{"not":[{"lt:247":id}]}]` | the same |
| Relationships to the record, type T | `[{"t":<rel>},{"f:<2-5>":id},{"f:<2-6>":"=T"}]` | `[{"rt":[{"ids":id},{"r":T}]}]` |
| Relmarker field F (record is the source) | `[{"t":<rel>},{"f:<2-7>":id},{"f:<2-6>":<vocabulary>}]` | `[{"rf:F":[{"ids":id}]}]` |

`"=T"`: an enum value with `=` is matched exactly; without it, child terms are included and the group would
not match the `op=values` count. A cut relmarker group counts the relationship rows, so it can include some
targets of a type the field does not allow (they are filtered out when shown).

### 9.2 Rows (`RecordViewRenderer.js`)

`buildLinksRow(label, source, onNavigate, withRelation, {limit, onGrow, onSearch})` takes a plain list (as
before) or a group. A cut row has the count in its label ("Persons (1234)") and ends with one link:

- every record loaded: "Show all (N)", shown in place (Phase 1);
- more records than loaded and a host search: **"Show all (N) in search"** → `onSearch(query, label)`;
- otherwise: **"Show more (shown / N)"**, the next `limit` records each time (loaded by `more()` when needed).

`showBuiltin` has a new option `onSearchLinks(query, title)` (title = row label + record title). The Record View
app passes it when the host has `showDatasource` (`RecordViewApplication.searchLinks`, the same call as
`searchTag`): the records open as a new query in Explorer. Popups (Data, Graph, Map, Explorer's record view
dialog) and the editor's Linked records have no host search: they offer "Show more".

`hasLinks` and `buildLinkedFromSection` read the groups. `groupBy` was removed.

### 9.3 Other files

| File | What |
|---|---|
| `shared/src/recordview/RecordViewLoader.js` | `create({…, limits})` → the provider's `limit` (`limits.links`). |
| Data, Graph, Map `init*.js`; Explorer `RecordEditorHost` | pass `config.recordLimits` / `options.recordLimits` to `RecordViewLoader.create`. |
| `apps/recordview/src/initHeuristRecordView.js` | the provider gets `limit: config.recordLimits.links`. |
| `apps/recordview/src/core/RecordViewApplication.js` | `searchLinks(query, title)`, `onSearchLinks`. |
| `shared/src/widgets/record-editor/HRecordEditor.js` | Linked records: provider `limit`, relmarker rows from the groups. Relmarker fields: a warning "The relationship fields show X of Y relationships of this record" when there are more than loaded. |
| `shared/src/data/relmarkerRelations.js` | `RELMARKER_LOAD_LIMIT` (500 per direction), `loadRelmarkerStates({…, onPartial})`, the searches return `{rows, total}`. |
| Localization | `Show more`, `in search` (data, explorer, graph, map, recordview); the editor warning (explorer). |
| Tests | `recordRelationsProvider.test.js` (groups, queries; a very large record: counts, first N per group, `more()`, exact relation type); `recordLimits.test.js` (row label count, "in search", "Show more" paging, relmarker group row); `recordViewRenderer.test.js` (`hasLinks` with groups); `relmarker.test.js` (`onPartial`). Fake DOM: `before()`. |

Live check (guest, `osmak_mapping`): records 6, 23, 28, 41 load with two requests, one group per record type
with the right query. No record in the test database has more than 500 links, so the cut path is covered by the
unit tests and the server queries above.

## 10. Loading and saving indicators (Artem, 2026-10-22)

A very large record takes a while to load and to save, so both now show a rotating icon:

- `shared/src/ui/loadingIndicator.js`: `loadingIndicator(text, className)` / `fillLoading(element, text)` → the shared
  `.h-spinner` (heurist-ui.css) and a text, class `h-loading`.
- Record View: `RecordViewRenderer.showLoading()` ("Loading..."). `RecordViewApplication` shows it when a record is not
  shown after 250 ms (`LOADING_DELAY_MS`); a quick load keeps the old record until the new one is there. After a failure it
  is replaced by the empty state.
- Record popups: their "Loading..." line has the icon.
- Record editor: "Loading…" while it opens and in Linked records; "Saving…" in the message area during a save (replaced by
  "Saved" or the errors; removed when the issues are shown at their fields). The Save buttons are disabled as before.

Not changed: the time itself. The delay is the server (the record with all its values and the linked records)
and the building of the form. Lazy groups and lazy values (Phase 3) will reduce the editor part.

## 11. Phase 3 implementation (2026-10-22)

| Item | File | What |
|---|---|---|
| §4.1 lazy groups | `shared/src/widgets/edit-form/HEditForm.js` | Option **`lazyGroups`** (off by default; the record editor turns it on). Each group's host (help, slot) is made at render, its field widgets only when the host is on screen: no `hidden` element (inactive tab, group hidden by `showWhen` / code) and no closed `<details>` between it and the form. Made on tab switch, accordion `toggle`, visibility change, `revealField`; `validate()` makes the group of a shown, required, empty field; `setIssues()` the groups of fields with issues. Without a widget a field keeps its state (`_states`): `getStates`, `getValue`, `setValue`, `updateField`, the special editors' `getValue` / `setValue` / `hasField` work on it; `getFieldWidget` gives null. Event `h-edit-form-group-rendered`. A widget made later gives the **stored** state while it still reports what it reported when made, so opening a tab is never a change (both `HEditForm.isDirty` and the record editor's record JSON). |
| §4.2 automatic groups | `shared/src/data/recordEditStructure.js` `splitLargeGroups(structure, limit, labelOf)`; `HRecordEditor.open` | A group with more than **Limit fields** fields keeps the first N; the others follow as collapsed **inner** accordions of N ("Fields 51-100", numbers within the group), so they stay in the tab or section of their group. Also the fields before the first separator, the reverse relationships and the non-standard fields groups. |
| §4.3 Structure pane | `shared/src/widgets/structure-tree/HStructureTree.js` (+ `.css`), `shared/src/data/fieldTypeFilters.js`; `HRecordEditor` | West pane "Structure" of the record editor, same head, toggle and collapsed look as the Record summary (`h-record-editor-summary` classes). The tree shows `editForm.form`: outer groups, inner groups inside them, fields with a type mark, requirement colours as in the form, "(N)" values, filled / empty. Toolbar: Required only, Optional (off), type filter (only the types of the form), Find (more than 25 fields; Enter selects the first match); remembered in the browser. A click: `revealField` + focus. Counts are refreshed on `h-input-change`. Collapsed at start for a form with 25 fields or fewer unless the user chose before (the user's choice is remembered, not the start state). `HFieldTree` takes its type filter from `fieldTypeFilters.js` (without pointer and file). |
| §4.4 values | `shared/src/widgets/edit-form/HEditField.js` option **`valueLimit`** (HEditForm passes it; the record editor: **Limit values per field**) | A repeatable field makes the inputs of the first N values; "Show all values (N)" makes the others in place. The values without inputs are in `getState()` in their stored order (shown, not shown, then added); Add puts a row before the link; remove, max values and the record manager's "already chosen" count every value. |
| §4.4 picker | `shared/src/widgets/picker/HValueCombo.js` | The `HValuePicker` is made on first open (or first read of `combo.picker`); setValue / labels / markStale / refresh / destroy work without it. |

Localization (explorer): Structure, Show / Hide the structure, Required only, Optional, Find field, Field type, Show
fields of this type, the type filter options (all, text, enum, date, numeric, geo, pointer, file).

Tests: `shared/test/largeRecordForm.test.js` (lazy groups: tabs, accordions, states, setValue, revealField, special
context, validate and issues; values limit; lazy picker; automatic groups; structure tree: groups, filters, counts,
selection, Find); `recordEditor.test.js` (a field of the second tab has no widget until shown; the Structure pane).
Not checked in a browser yet.

## 12. Review 1 of Phase 3 (Artem, 2026-10-22)

| # | Request | Done |
|---|---|---|
| 0 | Record titles in HInputResource and HInputRelmarker may have HTML tags: as `h-recordlist-title`, only the limited set of tags | `sanitizeTextHtml` (u, i, b, strong, em) for the title of HInputRelmarker and the Browse/Add button of HInputResource; option **`htmlLabels`** of HValueCombo / HValuePicker (button text and list labels as limited HTML, tooltips as text), used by HInputResource; the picker's text filter ignores tags. |
| 1 | Structure pane: made when it is opened only | `HRecordEditor._ensureStructureTree()` on the first expand of the West pane; the counts are refreshed only while it is open (and on opening). |
| 2 | Type filter did not work | CSS: `.h-structure-tree-field { display: flex }` beat the `hidden` attribute, so field rows never hid (groups did). `.h-structure-tree [hidden] { display: none !important }`. |
| 3 | Required only and Optional filter the tree and the form | New **view filter** of HEditForm: `setViewFilter(names \| null)`. It hides fields and the groups / tabs without a shown field; unlike `showField`, the hidden fields stay in getValues and are checked. A problem or server issue of a hidden field clears it (`h-edit-form-view-filter-cleared`; the tree clears its toolbar). The tree gives the names through `onFilterChange`. |
| 4 | Required only hid the whole tree | Same CSS cause (and the test record type has no required field: its groups were empty). Semantics now: Required only / **Optional only** (they exclude each other), all off = all fields. |
| 5 | Counts not shown for 1 value | "(1)" too. |
| 6 | New filter "Empty only" (tree and form) | Fields without values. The filters apply when they change, not while typing (a field does not vanish under the cursor); the type filter and Find are for the tree only. |
| 7 | Do not remember the filters | Removed (each editor starts with no filter). The collapsed / open state of the pane is still remembered. |

Tests: `largeRecordForm.test.js` (filters, exclusive checkboxes, Empty only, type filter, clearFilters, counts from 1,
view filter of the form and its clearing by a problem, HTML titles of the combo); `recordEditor.test.js` (the tree is
made when the pane is opened). Fake DOM: `innerHTML` gives a `textContent` without tags.

## 13. Review 2 of Phase 3 (Artem, 2026-10-22)

| # | Request | Done |
|---|---|---|
| 1a | Required only ignores Empty only and Optional only: disable them while it is on | Required only switches both off and disables them (muted labels); off again, they are enabled. |
| 1b | [ ] Show help: show / hide the help texts of the fields; remembered | `HEditForm.setFieldHelpVisible(shown)` (class `is-field-help-hidden`; only `.h-edit-field > .h-edit-field-help`, the help of a group stays). The record editor keeps the choice (`heurist.recordEditor.showFieldHelp`, default shown) and applies it at render, also before the Structure pane is opened; the tree shows the checkbox (`showHelp`, `onShowHelpChange`). Not a filter: Clear filters does not change it. |
| 1c | Lower type select | `.h-structure-tree-type.h-select`: no min-height, 1px vertical padding, 12px. |
| 2a | Record type icon before the record type name in the editor title | `recordTypeIconUrl` with the icon base of the file fields (`fileViewer`), `.h-record-editor-type-icon` 16px. |
| 2b | The whole head of a side pane is a button | Click on `.h-record-editor-summary-head` toggles its pane (Record summary and Structure); the « » button's click reaches the head (one toggle); `cursor: pointer`. |

## 14. "Show optional" (Artem, 2026-10-22)

"Optional only" renamed **"Show optional"**, with the legacy meaning: on (the start state) shows the optional fields,
off hides them (tree and form). Required only disables it and Empty only; Show optional keeps its state for when
Required only is off again. Clear filters: Show optional on.
