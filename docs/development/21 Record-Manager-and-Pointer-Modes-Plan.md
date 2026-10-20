# 21 Record Manager and Pointer Modes Plan

**Status 2026-10-19:** agreed (three rounds with Artem, §9). Phases 1-4 committed (explorer `baf99f6`, heurist `4544b38d9`); Phase 5 done 2026-10-19, not committed; nothing checked in a browser. Phase 6 (§2.4, agreed) done 2026-10-19, not committed. Phase 7 (built-in filter forms, §7.1) done 2026-10-19, not committed; configuration in §7.2 (future plans).

Source: Artem's notes of 2026-10-19 (HRecordManager, HInputResource and `rst_PointerMode`,
value picker buttons; second round: record editing across modules). Continues plan 14
Phase 4 (Records manager, deferred) and plan 14a (edit form).

## 1. Goal

1. **HRecordManager** = filter form + record list + "Add New *record type*" buttons, in one
   view. Two uses:
   - **a) browse / select / add** a record for a pointer field (`HInputResource`, later
     `HInputRelmaker`);
   - **b) manage** the user's system records (query sources, reports, map documents, files,
     bookmarks...) directly. System record types are going to be excluded from the general
     search, so the end user does not see them in Explorer results; the manager is the place
     where they are listed.
2. **HInputResource** follows `rst_PointerMode`.
3. **Value picker** of a pointer field gets *Browse* and *Add record* buttons.
4. **Add record** dialog for unconstrained fields with a ported **access form**
   (legacy `recordAccess.js`), shared with the Admin panel of the record editor.

## 2. Record editing and module boundaries

### 2.1 Today

```mermaid
flowchart LR
  subgraph shared["shared/ (neutral code)"]
    HRE[HRecordEditor] --> HEF[HEditForm / HEditField] --> HIR[HInputResource] --> HVP[HValuePicker]
    HFF[HFilterForm]
    HA[HostAdapter<br/>editRecord / canEditRecords]
  end
  subgraph explorer["apps/explorer (host)"]
    REH[RecordEditorHost<br/>special editors: query, rules, symbology]
    DMA[DirectModuleAdapter]
    IMA[IframeModuleAdapter]
  end
  subgraph data["apps/data"]
    DA[DataApplication] --> HRL[HRecordList]
  end
  map[apps/map] & graph[apps/graph] & tl[apps/timeline] & rv[apps/recordview] --> HA
  data --> HA
  HA -- bridge.editRecord --> IMA & DMA --> REH
  REH --> HRE
  REH -- other record types --> LEG[legacy host editor<br/>hclient]
  DMA -- imports apps/data/src/direct.js --> data
```

- Only Explorer opens HRecordEditor (through `RecordEditorHost`), and only for the
  whitelisted system types. Other types go to the legacy host editor.
- Modules ask for editing through the bridge (`HostAdapter.editRecord`). Without a host
  bridge `canEditRecords()` is false and their Edit buttons are hidden.
- `HRecordList` is in `apps/data`; it only renders pages, loading comes from
  `DataApplication` through `onDataRequest({offset, limit, filter})`.

### 2.2 Proposal

```mermaid
flowchart LR
  subgraph shared["shared/"]
    HRE[HRecordEditor] --> HEF[HEditForm / HEditField] --> HIR[HInputResource]
    HIR -- Browse --> HRM[HRecordManager<br/>select / select_multi]
    HIR -- Add --> ADD[HRecordAddDialog<br/>type picker + HRecordAccess]
    HRE -- Admin panel --> ACC[HRecordAccess]
    ADD --> ACC
    HRM --> HFF[HFilterForm]
    HRM --> HRL[HRecordList<br/>moved from apps/data]
    HRM --> RLL[RecordListLoader<br/>GET /records page]
    HA[HostAdapter<br/>editRecord / addRecord]
  end
  subgraph editor["apps/editor (new module, heurist-editor)"]
    EDA[EditorApplication<br/>open recordId or new rectype]
  end
  subgraph explorer["apps/explorer (host)"]
    REH[RecordEditorHost<br/>+ special editors]
    MGR[Records manager tool<br/>manager mode]
  end
  subgraph data["apps/data"]
    DA[DataApplication]
  end
  EDA --> HRE
  REH -- direct mount --> EDA
  MGR --> HRM
  DA --> HRL
  map[map / graph / timeline / recordview / data] --> HA -- bridge.editRecord --> REH
  LEGP[legacy pages, hclient] -- iframe / popup with record id --> EDA
```

1. **A1 — no host, no editing.** Agreed: a module without a host bridge does not edit
   (as now). Nothing to change.
2. **A2 — a standalone record editor.** Opened with a record id (or a record type for a new
   record) by Explorer, by legacy pages, by any host. **How it is built is discussed first —
   §2.3.** Modules keep asking through the bridge; they never embed the editor themselves.
3. **A3 — the manager in select mode is part of every editor form.** So HRecordManager (at
   least `select` / `select_multi`) must be in **shared**: HRecordEditor in Explorer and in
   the editor module both open it without any app.
4. **A4 — move HRecordList to shared** (`shared/src/widgets/record-list/`), not a light copy.
   It is already a render-only widget with callbacks; with it move its small helpers
   (`pageEntries.js`, `ListToolControls.js`, `recordAdminInfo.js`, `recordTemplates.js`,
   HTML + CSS, about 1300 lines together). Data imports it from shared (no behaviour
   change). The manager adds a small `RecordListLoader` in `shared/src/data/` (query, sort,
   title filter, page over `GET /records/`) — the part `DataApplication` does for Data.
   Two copies of the list would need to be kept equal; one moved widget does not.
5. **Consequence:** HRecordManager does **not** embed the Data module. The "datamodule
   appearance" an admin customises (§7, later) is the HRecordList options (view mode, card
   template, page size, fields), which HRecordList already has. The Data `topBar` option of
   the first draft is replaced by a top bar in HRecordList (§4).
6. **A5 — module graph:** the hand-made diagrams above are enough for now (Artem
   2026-10-19). In the Proposal diagram `apps/editor` is option 1 of §2.3; with option 2 it
   is the editor mode of `apps/explorer`.

### 2.3 Standalone editor: separate app or Explorer in editor mode (to discuss first)

What the edit form needs from outside `shared/` today (all given by `RecordEditorHost` /
`ExplorerApplication`):

| Need | Where it is now | Without Explorer |
|---|---|---|
| Temporal editor (`HInputTemporal`, `HTemporalEditor`) | shared (plan 19) | works as is (Artem: stays integrated with the editor and HInputDate) |
| Geo: draw geometry / pick extent (`HInputGeo` `selectGeometry`, `selectExtent`) | `ExplorerApplication._drawOnMap`: Map module in an iframe dialog through `IframeModuleAdapter` (Explorer code) and `moduleUrls.map` | WKT text only, no drawing |
| Special fields of system types: query + filter form, expansion rules, field sets, geo/time field selectors, symbology | `HFilterBuilder`, `HRuleBuilder`, `HFieldSetEditor`... in `apps/explorer/src/widgets/query-source/` | readable value + Show raw only |
| Users/groups (owner pickers, login), record types (icons), definitions | `UserGroupManager`, `RecordTypeManager`, `HDbDefs` in Explorer | must be loaded again |
| File upload / pick, record view | shared + `RecordEditorHost` | works |

**Option 1 — new app `apps/editor`** (own build target, bootstrap, host adapter).
It needs its own copy of everything in the right column, or those pieces move to shared:
the Map drawing dialog (with `IframeModuleAdapter`), the query-source helper widgets
(HFilterBuilder alone is large and pulls the filter-form designer), UserGroupManager. Or it
stays a reduced editor for some record types. Two hosts for one editor.

**Option 2 — Explorer in editor mode** (agreed 2026-10-19). Same build and deploy; the bootstrap
(or URL, e.g. `?mode=editor&recID=151` / `&rty=12`) selects a small **editor shell** instead
of the full `ExplorerApplication`:
- the shell creates only `HeuristApiClient`, `UserGroupManager`, `RecordTypeManager`,
  `HDbDefs` and `RecordEditorHost`, and opens the record full-page (no dialog);
- **not** initialised: authoring dock / QSE, saved filters, query sources, layout and
  modules, control panel, history and start-up query, query trace;
- the services `RecordEditorHost` takes from `ExplorerApplication` today (`_drawOnMap` /
  `selectGeometry` / `selectFilterExtent`, `_editQueryWithBuilder`, `_describeQuery`) move
  into a small `core/EditorServices.js` used by both — this is the only refactoring;
- the shell is a separate lazy entry, so the editor page does not download the Explorer
  workspace code (Vite splits it);
- after Save / Close the shell tells its opener (`postMessage` to the iframe parent / opener
  window, or the host bridge), so legacy pages can use it instead of the legacy editor.

Why option 2 makes the design simpler:
- one host for the editor: every record type gets the same editor in Explorer and outside
  it, with geo drawing and all special editors; nothing moves to shared only for the editor;
- `RecordEditorHost` is already this host; the change is to cut it loose from
  `ExplorerApplication` (EditorServices), which is cleaner anyway;
- the manager (§3) is shared and works in both.

Cost of option 2: the editor URL is an Explorer URL; the shell must be kept free of
workspace imports (an architecture test can check this: `editor/` may not import `core/
ExplorerApplication.js`, `widgets/query-source/QuerySourcePanel.js`, layout code).

### 2.4 Explorer editor mode — design (Phase 6, agreed 2026-10-19)

Checked 2026-10-19: Explorer has one bundle (`heurist-explorer.js`); the legacy page
`hclient/modules/explorer/explorerViewer.html` only loads it; the legacy wrapper
`HeuristModuleExplorer.js` creates the iframe and sets the bridge `heuristExplorerHost` on it
(`getConfiguration()` gives the bootstrap, plus `editRecord`, `addRecord`, ...); a standalone
page sets `window.heuristModuleBootstrap`. `ExplorerApplication.initialize()` loads users and
groups, saved filters, record types, query sources, the UI configuration, the authoring dock,
the layout and its modules, the control panel and the start-up query.

1. **Same bundle, same page.** The mode comes from the bootstrap:
   `runtime.runtimeMode: 'editor'` and `state: {recordId}` (edit) or `{rectypeId, access?}`
   (new record). A page without a bootstrap and bridge (opened by a link) may give it in the
   URL: `explorerViewer.html?db=NAME&mode=editor&recID=151` or `&rty=12`.
   `main.js` loads either `initHeuristExplorer` or `editor/initRecordEditorShell.js` with a
   dynamic `import()`, so the editor page does not load the workspace code (Vite chunks).
2. **Editor shell** (`apps/explorer/src/editor/RecordEditorShell.js`): creates only
   `HeuristApiClient`, `UserGroupManager`, `RecordTypeManager` (HDbDefs) and
   `RecordEditorHost`, and shows the record **in the page** (no dialog): new
   `RecordEditorHost.mount(container, {recordId | rectypeId, access})`; the existing
   `open()` (dialog) stays for Explorer and for records opened from the editor (pointer
   Edit, Add, Browse open dialogs over the page). Not logged in: a message "Log in to edit
   records" instead of the form.
3. **EditorServices** (`apps/explorer/src/core/EditorServices.js`): `selectGeometry`,
   `selectFilterExtent` (+ `_drawOnMap`, the Map module in an iframe dialog),
   `editQuery` (HFilterBuilder) and `describeQuery` move out of `ExplorerApplication`; both
   ExplorerApplication and the shell give them to RecordEditorHost. The only refactoring.
4. **Public API in editor mode** (`window.heuristExplorer`, as now exposed at once):
   `ready()`, `open({recordId | rectypeId, access})` (another record in the same page),
   `isDirty()`, `getRecord()`, `close()`; events on the container `h-record-editor-saved`,
   `h-record-editor-close` (as HRecordEditor).
5. **Messages to the page that opened the editor**, both ways, so any host can use one:
   - bridge callbacks when the bridge has them: `onRecordSaved({record, created})`,
     `onEditorClosed({saved, recordId, record})`;
   - `postMessage` to `window.parent` (iframe) or `window.opener` (new window):
     `{source: 'heurist-record-editor', type: 'saved' | 'closed', recordId, rectypeId,
     created, saved}`, target origin = the page's own origin (one Heurist installation).
   - A standalone window (opened with `window.open`) closes itself after Close / Save and
     close.
6. **Legacy entry** (heurist repo, Phase 6): a small helper
   `hclient/modules/explorer/recordEditorDialog.js` —
   `HeuristRecordEditor.open({recordId | rectypeId}) → Promise<{saved, recordId}>`: a
   jQuery dialog with the iframe `explorerViewer.html`, the bridge (bootstrap with
   `runtimeMode: 'editor'`), resolved by `onEditorClosed`. Switching legacy callers of the old
   editor (result list, `editRecord` of the bridges) to it is **not** part of Phase 6.
7. **Architecture test**: `apps/explorer/src/editor/` may not import `ExplorerApplication`,
   `LayoutManager`, the authoring dock or `widgets/query-source/QuerySourcePanel.js`.

Agreed (Artem 2026-10-19): 1. bootstrap `runtimeMode: 'editor'` + `state`, URL parameters as
the fallback; 2. bridge callbacks and postMessage; 3. only the legacy helper now, legacy callers
later; 4. a standalone window closes itself after Close / Save and close.

## 3. HRecordManager (shared)

`shared/src/widgets/record-manager/HRecordManager.js`, opened in a dialog by
`openRecordManager(options) → Promise<number[]|null>` (null = Cancel).

### 3.1 Options

```js
{
  selectMode: 'select' | 'select_multi' | 'manager',
  allowAddition: true | false,
  recordTypes: [rtyId, ...],   // types to list and to add; [] = unconstrained
  query: null,                 // browse filter (rst_PointerBrowseFilter), §3.3
  querySource: null,           // parameterized QS (filter form); later phase
  exclude: [recordId, ...],    // values the field already has (select_multi, §9.5)
  title: ''                    // dialog title; default from the record types
}
```

- `recordTypes: []` only for `select` / `select_multi` and only over user-data record
  types (system types are never offered there).
- `manager` mode: no Select/Cancel; records are added, edited, deleted in place (§8 Phase 5).

### 3.2 Layout

- Two panes in `HCardinalLayout`: filter form **north** or **west** (from the form
  orientation), HRecordList in the centre. Without a filter form only the list is shown.
- **Add bar** in the HRecordList top bar (§4):
  - one record type: `Add New <type name>`;
  - several types: one button per type, wrapped;
  - unconstrained: one `Add record` button → Add record dialog (§6).
  Hidden when `allowAddition` is false or the user can not create the type.
- **Footer** (select modes): `Select` and `Cancel`. `Select` takes the last selected record
  (`select`) or all selected (`select_multi`) and closes (§9.4).
- **Double-click**: in `manager` mode it opens the editor (as everywhere); in the select
  modes it selects that record and closes the manager (Artem 2026-10-19).
- **Header option buttons** (configure the list, choose QS / filter forms; owner/admin
  only) and the dialog size — deferred to the configuration phase (§9.8).

### 3.3 Query and list

- Base query = `[{t: "<recordTypes>"}]` (all user-data types when unconstrained).
- `rst_PointerBrowseFilter` (when set) **replaces the default QS** (§9.7): it is added to the
  base query; when it has no parameters there is no filter form, only the list's own title
  search. Legacy filter strings are converted with the saved-filter conversion (plan 08).
- HRecordList shows its own search and sort (existing options); no expansion, no publish.
- After Add (select modes): the new record counts as selected and the manager closes with
  it (Artem 2026-10-19). In `manager` mode the list reloads and selects it.

## 4. HRecordList changes (after the move)

1. **Top bar**: option `topBar` and method `setTopBarContent(element)` — a row above
   `header.h-recordlist-toolbar`. The manager puts the Add bar there; the list does not
   know what it is.
2. **Selection mode**: option `selectionMode: 'multi' | 'single'` (default `multi`, as now).
3. Data keeps the same behaviour; Data's tests must pass unchanged.

## 5. HInputResource and `rst_PointerMode`

`rst_PointerMode` and `rst_PointerBrowseFilter` are added to `EDIT_STRUCTURE_DETAILS` and to
the field of `buildEditStructure()` as `pointerMode` / `browseFilter`. Allowed types =
`targetTypes` (as now).

**Pointer and vocabulary constraints come from the base field only** (Artem 2026-10-19):
`rst_PtrFilteredIDs` and `rst_FilteredJsonTermIDTree` are ignored; `targetTypes` =
`dty_PtrTargetRectypeIDs`, vocabulary = `dty_JsonTermIDTree`, everywhere. Phase 3 removes
the two columns from `EDIT_STRUCTURE_DETAILS` / `buildEditStructure()` and from srv
`DefinitionLookup::structureRows()` (`termFilter` dropped). The definitions snapshot and
`HDbDefs.field()` already use the base field, so they stay as they are.

| `rst_PointerMode` | Control | Browse | Add |
|---|---|---|---|
| `dropdown_add` | value picker | picker button | picker button |
| `dropdown` | value picker | picker button | — |
| `addorbrowse` | button with the title; click opens the manager | manager | manager Add bar |
| `addonly` | button `Add <record type>` (`Add record` when unconstrained); it, or *add new value*, opens the editor of a new record; several types: type menu first; unconstrained: Add record dialog | — | editor |
| `browseonly` | button; click opens the manager | manager | — |

- **Default when empty** (§9.2): `dropdown_add` for system record types, `addorbrowse`
  for user-data types (RT_REGISTERED_FILE counts as user-data here).
- Edit / View of the chosen record stay as now.
- Without the host callbacks the input is the plain value picker without buttons.
- **Repeatable fields** (§9.5): the manager opens in `select_multi`; the first id fills this
  value, the others become new values (`HEditField`); ids the field already has are skipped.
- After Add: the new record is the value, its title remembered (`rememberLabel`).
- **HFilterForm** pointer inputs: `showBrowse: false` (§9.6).

## 6. Value picker buttons and Add record dialog

- `HValuePicker` / `HValueCombo` option `actions: [{id, icon, title, run}]`; the filter row
  becomes `filter icon | input | clear | [actions]`. The picker knows nothing about records.
- `HInputResource` options `showBrowse` (default **false**; true from edit forms) and
  `showAdd` (from `rst_PointerMode`), giving
  - `fa-table` *Browse* → `openRecordManager`;
  - `fa-plus-circle` *Add record* → `addRecord` (type menu when several types).
- **HRecordAddDialog** (unconstrained Add, port of `recordAdd.js`): record type picker (value
  picker over user-data types, grouped) + **HRecordAccess**; *Add these tags* deferred until
  user tags exist. OK opens the editor of a new record with this type, owner and visibility.
- **HRecordAccess** (`shared/src/widgets/record-access/`), port of `recordAccess.js`, used
  by the Add dialog and by the Admin panel of HRecordEditor (replaces `_renderOwnership`).
  Exact legacy behaviour (§9.1):
  - **Owner** (editable by): select of *Any logged-in user* (0), *Current user*, the user's
    groups.
  - **Viewable by** (radios):
    - *User or group specified above* (`hidden`) — with an optional list of groups that
      **can also view**; this radio is hidden when the owner is *Any logged-in user*;
    - *Any logged-in user can view* (`viewable`);
    - *Public* (`public`, viewable in published live view and exports without login).
  - Save rule: owner 0 and not public → `viewable`; `hidden` with view groups →
    `viewable` + `rec_NonOwnerVisibilityGroups`; loading `hidden` or any view groups checks
    the first radio and shows the groups.
  - The new editor today shows view groups under *Logged-in users* — wrong against legacy;
    fixed by this port.
  - **`pending` is not offered** (Artem 2026-10-19). Checked in legacy: it is not a user
    choice. `recordSave` turns `public` into `pending` when a public record is edited and
    the database setting `sys_SetPublicToPendingOnEdit` is 1 ("viewable by anyone, changes
    pending"); search and output treat it as public. srv `RecordSaveService` already does
    the same. HRecordAccess shows a `pending` record as *Public* with a note *changes
    pending approval*; saving sends `public` and the server decides.
- **Defaults of a new record**: last used owner and visibility (remembered per user, as in
  legacy `recordAdd`); first time: owner = current user, visibility = `viewable`
  (Artem 2026-10-19).

## 6a. All record types in the new editor

Artem 2026-10-19: drop the whitelist — every record type is edited in HRecordEditor (tags
and bookmarks later); a full test range over all record types is needed.

1. **Client**: `RecordEditorHost` stops checking `isWritableRecordType`; the legacy host
   editor is used only when the user is not logged in to the new API (or by a setting, as a
   way back). `writableRecordTypes.js` stays for the special editors list only.
2. **Server**: `WritableRecordTypes` checks in `RecordSaveService`, `RecordDeleteService`,
   `RecordDuplicateService` are removed (or the list becomes "all").
3. **What srv save does not do yet** for ordinary records (RecordSaveService header,
   checked 2026-10-19 against `recordModify.php`) — **none is ported in this plan**
   (Artem 2026-10-19); they stay listed for a later plan:
   - **parent/child records** (`rst_CreateChildIfRecPtr`): reverse pointer
     DT_PARENT_ENTITY on save, child records deleted with the parent;
   - **re-titling** of relationship records and of records that point to the saved one
     (their title masks use its title);
   - **entry masks** (`recordUpdateMaskFields`);
   - **workflow e-mails** (the stage rules themselves are done);
   - ElasticSearch index (save and delete), HTML cache.
4. **Edit form**: field types not yet in HEditForm for user data — `relmarker`
   (HInputRelmaker, later), and checks of `blocktext` HTML editor, `file` with remote URLs,
   `relationtype`, `separator` tabs/accordions on big types.
5. **Test range**:
   - server: `tests/RecordEditAllTypesTest.php` — for every record type of the test
     databases: build a record with a value in every field of its structure (by field type),
     POST, GET back, compare (input = output), PATCH one field, delete; plus a legacy compare
     of title and child pointers;
   - client: `shared/test` — `buildEditStructure` + HEditForm render and `values()` round trip
     for every field type and pointer mode; a fixture made from the `/rst` output of all
     record types of `osmak_mapping`;
   - browser check list in the plan (one record type per field type group).

## 7. Default filter forms and configuration

### 7.1 Built-in filter forms (Phase 7, Artem 2026-10-19)

The record manager shows a filter form (north or west pane, HCardinalLayout) made from a
built-in parameterized query. Two built-in filters for now; others are defined when the
manager is used for a particular type. All text parameters are direct inputs (no value lists).

1. **Files** (RT_REGISTERED_FILE, `/files`): file name (`f:<DT_ORIGINAL_NAME 2-1185>`), URL
   (`url`), name / caption (`f:<DT_NAME 2-1>`), type (`f:<DT_REGISTERED_FILE_TYPE 2-1186>`: local,
   external, IIIF... - terms), MIME type (`f:<DT_MIME_TYPE 2-29>` - terms), size
   (`f:<DT_FILE_SIZE 2-67>`, a number range). The `/files` query takes numeric field ids, so
   the query is built at run time from the concept codes (`HDbDefs.localId('dty', code)`);
   a field the database lacks is left out.
2. **Generic** (any user-data type; for now also the system types): title (`title`) and tag
   (`tag` - the user's tags, as in filter forms).

- The built-in definitions live in code (`shared/src/data/recordManagerFilters.js`):
  `{query, filterForm}` as a Query Source has them, so the configuration (§7.2) can later
  replace them with a Query Source or the admin's own definition.
- The filter's conditions are added to the record type query (`t:<types>`); a browse filter
  of the field (`rst_PointerBrowseFilter`) replaces the built-in filter (§9.7: without
  parameters only the list's title search).
- The list's own search box stays (title search in the results).

### 7.2 Configuration - future plans (discussed 2026-10-19, deferred)

An admin task, per record type:

1. **Filter**:
   a) system record types and files: the built-in filter, or the admin's own;
   b) user-data types: an existing Query Source, a new one, or the generic filter.
2. **Filter form**: changed with Filter Builder + Filter Form Designer.
3. **Record list appearance**: the native controls - a second row with *Search in results*,
   *Sort*, *Show admin info*; default settings (view mode without *Table*, page size...).
4. **Storage** (Artem: `HEURIST_FILESTORE/<db>/entity/defRecTypes/filters/NNN.json`, NNN =
   record type id; later a field of the record type in the database). Comments (2026-10-19):
   - the folder fits: `entity/defRecTypes/` already holds the record type icons
     (`icon/NNN.png`, `thumbnail/NNN.png`). But those files are copied by database clone
     (`DbUtils`) and by the import of a record type from another database (`dbsImport::
     copyRectypeIcon`, where the id changes); the filter files need the same copying, or they
     are lost with a cloned / imported type;
   - one JSON format for the file and for the later database field (`heurist-record-manager/1`:
     `{filter: {querySource: id} | {query, filterForm} | 'builtin', list: {...}}`), read and
     written only through one srv class (`Definitions/RecordTypeSettings`), so the move to a
     database field changes no caller;
   - a Query Source chosen by the admin is referenced by its **record id**; a filter of the
     admin's own is stored inline in the file (no extra record);
   - the client gets it through its own endpoint (e.g. `GET /def/rectypes/{id}/manager`), not
     the definitions snapshot: the snapshot is cached by the definitions version, which a
     changed file does not change; write: database admin only;
   - field ids inside a stored filter are local; on an import into another database they need
     the same id mapping as the record type (or concept codes, as plan 08 stores them).
5. Dialog size (§9.8) and the header option buttons (§3.2) belong to the same configuration.

## 8. Phases

1. **Move HRecordList to shared** (§2.2.4) + `topBar`, `selectionMode` (§4);
   `RecordListLoader`. Data unchanged, all tests pass; architecture test updated.
2. **HRecordManager** select / select_multi (§3) + `openRecordManager`; callbacks
   `browseRecords` / `addRecord` from `RecordEditorHost` through HRecordEditor → HEditForm →
   HEditField → HInputResource.
3. **Pointer modes and picker buttons** (§5, §6 first part); `pointerMode`, `browseFilter`;
   rst pointer / term filter columns no longer read (§5).
4. **HRecordAccess + HRecordAddDialog** (§6), Admin panel switched to HRecordAccess.
5. **All record types** (§6a): whitelist removed on both sides, test range. Can run beside
   Phases 1-4.
6. **Standalone editor = Explorer editor mode** (§2.3, option 2): bootstrap / URL, shell,
   EditorServices, opener messages, legacy page entry.
7. **Built-in filter forms** (§7.1): files and generic; filter form pane in HRecordManager.
8. **Later**: configuration (§7.2), manager mode for system records (I.1b, plan 14 Phase 4),
   exclusion of system types from the general search.

## 9. Agreed (Artem, 2026-10-19)

1. Unconstrained *Add record* opens an Add record dialog (legacy `recordAdd.js` →
   `recordAccess.js`): owner and visibility, the same form as Record summary → Admin.
   Legacy *Record is viewable by* is better than the new one: port its exact behaviour.
   Record type selector = value picker. *Add these tags* deferred (user tags).
2. Default pointer mode: `dropdown_add` for system record types, `addorbrowse` for
   user-data types (including RT_REGISTERED_FILE).
3. Value picker option `showBrowse` (default false; true when opened from an edit form);
   `showAdd` from `rst_PointerMode`. `addonly`: click on the empty input or *add new value*
   opens the editor of a new record.
4. The user presses *Select* in the footer: last selected (single) or all selected (multi),
   then the manager closes.
5. `select_multi` for repeatable fields: yes; on close skip values the form already has.
6. HFilterForm: `showBrowse: false` (depends on §2).
7. `rst_PointerBrowseFilter`: yes; it overrides the default query source; not
   parameterized → only the title search.
8. Popups have no resize; size goes into the configuration with QS and list appearance.

Second round (Artem, 2026-10-19):

9. Temporal stays integrated with the editor and HInputDate (shared). Standalone editor:
   discuss first whether Explorer in a special editor-only mode is better (§2.3).
10. Double-click selects in the select modes; opens the editor in `manager` mode.
11. After Add in the select modes the new record is the selection and the manager closes.
12. `addonly` shows a button `Add <record type>` / `Add record`.
13. ~~Empty rst filters fall back to the base field~~ — replaced by 18.
14. No whitelist: all record types in the new editor; full test range (§6a).
15. New records: last owner/visibility kept; default owner = current user, visibility =
    `viewable`.
16. `pending` not shown in HRecordAccess (§6).
17. Hand-made module diagrams are enough.

Third round (Artem, 2026-10-19):

18. `rst_PtrFilteredIDs` and `rst_FilteredJsonTermIDTree` are ignored; the base field values
    are used directly (§5).
19. Standalone editor = **Explorer editor mode** (§2.3, option 2).
20. Shared HRecordManager on HRecordList moved to shared, no Data module inside (§2.2).
21. None of the srv save gaps (§6a.3) is ported in this plan.
22. Add for constrained types opens the editor at once, with the remembered owner/visibility;
    the Add record dialog is only for unconstrained fields.

## 10. Open points

None at the moment (2026-10-19).

## 11. Implementation notes

### Phase 1 — HRecordList in shared (2026-10-19)

- Moved with `git mv` to `shared/src/widgets/record-list/`: `HRecordList.js/.html/.css`,
  `pageEntries.js`, `ListToolControls.js/.css`, `recordAdminInfo.js`, `recordTemplates.js`
  (also used by Data's DataTables adapter and record popup). Imports inside are relative;
  Data imports them as `#shared/widgets/record-list/...`. The template stays `?raw` (Vite).
- HRecordList options: `topBar` (row `div.h-recordlist-topbar` above the toolbar, hidden until
  `setTopBarContent(element)` gives content), `selectionMode: 'multi'|'single'` (single: a
  click replaces the selection, no shift/ctrl ranges, *Select all on page* hidden,
  `setSelection` keeps the last id). New callback `onRecordActivate(id)`: when given,
  double-click calls it instead of editing (§3.2 select modes); Data does not give it, so
  Data is unchanged.
- `shared/src/data/RecordListLoader.js`: `load({offset, limit, filter, signal})` in the
  `onDataRequest` shape, `setQuery`, `setSort`; a newer request aborts the running one; a
  counted query + filter is not counted again (`total: false`), as DataApplication does.
  Default fields `RECORD_LIST_FIELDS` (title, type, owner name, thumbnail, bookmark,
  visibility).
- Tests: `shared/test/data/recordListLoader.test.js` (loader + HRecordList source checks — the
  fake DOM cannot parse the template, as in the Data tests); Data test paths updated; all
  1230 tests pass; `build:data` and `build:explorer` pass.
- **API domain per record type** (Artem 2026-10-19): `shared/src/data/recordDomains.js` —
  `recordTypeDomain(dbdefs, rty)` → `{domain, type, path}`: `records` by default,
  RT_REGISTERED_FILE → `files` (`/files`), RT_USER_BOOKMARKS / RT_USER_REMINDERS → `system`
  with the type in the path (`/system/bookmark`, `/system/reminder`, plan 20 §5; inactive
  until the codes exist; the path names are provisional, agreed when we work on the `system`
  domain — Artem 2026-10-19); `recordTypesDomain(dbdefs, types)` refuses types of different
  domains in one list (no mixed domains — Artem 2026-10-19; a pointer field allowing types of
  two domains gets no Browse). `RecordListLoader` option `path` (default `/records`). The manager
  (Phase 2) and the editor (`RecordEditClient` `domain`) take the domain from here.
  Server (heurist): snapshot format 5 adds `dbconst.RT_REGISTERED_FILE`; on `/files`, `f`
  without a field id (the list's search box, `filter: {f: text}`) searches the title, as
  `/records` searches any field — before it failed with "Field is not available for files";
  `tests/FileApiTest.php` checks it (42 passed).
- For Phase 2: the HRecordList strings are in Data's localization files only — Explorer
  needs them (eng/fre) when it shows the manager; `recordTypeIconUrl` falls back to
  `heuristModuleBootstrap.runtime` for the base URL, so the manager passes `baseUrl` /
  `database` or sets `rec_RecTypeIconURL`.

### Phase 2 — HRecordManager, select modes (2026-10-19)

- `shared/src/widgets/record-manager/HRecordManager.js` (+ `.css`): HRecordList with
  `topBar`, `RecordListLoader` on the domain path of the types (`recordTypesDomain`; mixed
  domains → a message instead of the list), query `[{t: types}]` + `query` (extra
  conditions, for `rst_PointerBrowseFilter` in Phase 3). Select modes: `selectionMode`
  single / multi, double-click = `onRecordActivate` → finish; `manager` mode keeps
  double-click = edit and needs record types. Events `h-record-manager-selection`,
  `h-record-manager-finish`, `h-record-manager-error`.
- Add bar: `Add new <type>` per type that `canAddRecordType` allows, through the host
  `addRecord`; select modes: a saved new record finishes the manager with it; `manager` mode:
  reload + select it. **Unconstrained: no Add button yet** (the Add record dialog is
  Phase 4); unconstrained lists every user-data type on `/records`
  (`userDataRecordTypeIds`: not the writable system types, not other domains).
- `openRecordManager(options) → Promise<number[]|null>`: dialog
  `h-dialog-record-manager` (fixed size, §9.8), own dialog id (it opens over the record
  editor), Select (disabled without a selection) / Cancel; Escape and close = null;
  `manager` mode: Close → `[]`.
- No filter form pane yet: it comes with a parameterized browse filter / QS (Phase 3 and
  §7); no `exclude` option — repeated values are skipped by `HEditField` (Phase 3, §9.5).
- Plumbing: `browseRecords` and `addRecord` options through HRecordEditor → HEditForm →
  HEditField → HInputResource. `RecordEditorHost.browseRecords(options)` opens the manager
  (lazy chunk `heurist-explorer-openRecordManager.js`) with its `addRecord`,
  `canEditRecordType`, `editRecord`, `viewRecord`; also in `formServices()` (Test edit form).
  Bridge: Explorer `_hostActions().browseRecords`, IframeModuleAdapter pass-through,
  `HostAdapter.supportsBrowse()` / `browseRecords()`; `docs/integration.md` updated.
- **Interim (Phase 2 only):** HInputResource shows a `fa-table` *Browse* button beside
  Edit / View when `browseRecords` is given (`showBrowse: false` hides it); Phase 3 moves
  Browse / Add into the value picker and follows `rst_PointerMode`.
- Explorer localization: the HRecordList and manager strings (eng + fre, French from Data).
- Tests: `shared/test/recordManager.test.js` (manager logic with a stand-in list, Browse of
  HInputResource), `hostEditing.test.js` (browseRecords); the test loader
  `scripts/cssLoader.mjs` now loads Vite `?raw` imports as text, so HRecordList can be
  imported in tests. 1243 tests pass; Explorer and Data build.
- To check in the browser: a pointer field in the record editor (e.g. a Map layer's data
  source, a Map document's layers) or in the Test edit form → Browse.

### Phase 3 — pointer modes and picker buttons (2026-10-19)

Artem's review of Phase 2 (2026-10-19): Add buttons of the manager `h-btn-primary`; no value
picker unless `rst_PointerMode` is `dropdown_add` / `dropdown`, a click on the input opens the
manager (not `addonly`); no separate Browse button; Edit / View on mouse over.

- **Edit structure** (`recordEditStructure.js`): `/rst` columns `rst_PointerMode`,
  `rst_PointerBrowseFilter` instead of `rst_PtrFilteredIDs` / `rst_FilteredJsonTermIDTree`;
  `targetTypes` / `vocabulary` from the base field only; resource fields get `pointerMode`
  and `browseFilter` (non-standard fields too). Server (heurist): `DefinitionLookup::structureRows()`
  no longer reads the two rst columns (`termFilter` removed), `QueryValueResolver` term
  roots = the base field's vocabulary.
- **Default mode** — `resolvePointerMode(value, targetTypes, dbdefs)`: in `osmak_mapping`
  every pointer field has `addorbrowse` (the column default), so "not set" can not be told
  from `addorbrowse`. Rule: a pointer whose targets are all system record types
  (`writableRecordTypes`) gets `dropdown_add` for a stored `addorbrowse` or nothing; other
  stored values are kept; user-data targets (RT_REGISTERED_FILE too) keep the stored value,
  default `addorbrowse`. **To confirm with Artem.**
- **HInputResource** (rewritten): `dropdown_add` / `dropdown` = HValueCombo with picker
  `actions` *Browse* (`fa-table`, only with `showBrowse: true` — edit forms; default false,
  so filter forms have none) and *Add record* (`fa-plus-circle`, `dropdown_add`);
  `addorbrowse` / `browseonly` = a select-like button with the title and a `fa-table` icon,
  a click opens the manager (`allowAddition` for `addorbrowse` and `dropdown_add`);
  `addonly` = button `Add <type>` / `Add record` (several types: a type menu,
  `showPopover`), a click on the empty input adds a record; with a value the click does
  nothing (Edit on mouse over). Without `browseRecords` / `addRecord` the mode falls back
  to the value picker. The Phase 2 Browse button is removed. Edit / View: hidden until mouse
  over / focus (`@media (hover: hover)`; always shown on touch screens).
  Unconstrained fields: no Add yet (Phase 4).
- **HValuePicker** option `actions: [{id, icon, title, run}]` (buttons after the filter
  input; the filter row is always shown with actions); event `h-value-picker-action` closes
  HValueCombo.
- **HEditField**: resource inputs get `pointerMode`, `browseFilter`, `showBrowse: true`,
  `dbdefs`; `_browsePointer` — a repeatable field with room asks `select_multi`, the first
  new record is this value, the others become new values (up to max values), records the
  field already has are skipped (§9.5).
- **HRecordManager**: Add buttons `h-btn-primary`; browse filter `browseFilterQuery()`:
  JSON text → its conditions (a saved-filter object → its `q`), keyword text →
  `t:<types> <filter>`. Parameterized filters: as given (filter form later).
- Explorer localization: `Add record`.
- Tests: `shared/test/recordManager.test.js` (pointer mode rule, structure, browse filter,
  the five modes, picker actions, HEditField multi select). 1251 tests pass; all apps build.
  Server: DefinitionLookupTest, DefinitionSnapshotTest, RecordEditApiTest, FileApiTest,
  DataAccessBoundaryTest, SystemQueryTest, ConnectedPredicateTest, TemporalSearchTest,
  FieldValueCounterTest, QueryTraceTest pass (some older scripts in `tests/` fail on missing
  require paths, not related).

### Phase 4 — HRecordAccess and the Add record dialog (2026-10-19)

- `shared/src/data/recordAccess.js`: the legacy rules as functions — `accessFormState(header)`
  (stored `hidden` or any view groups check *User or group specified above*; `pending` shows
  as Public), `accessHeader(state)` (owner 0 and not public → `viewable`; `hidden` + groups →
  `viewable` + groups; `pending` saved unchanged while Public stays checked, so a save does not
  approve it); `loadRecordAddDefaults` / `saveRecordAddDefaults`.
- **Remembered access of new records: browser storage** (`localStorage`
  `heurist-record-add-defaults:<db>:<user>`: owner, visibility, view groups, record type), not
  the legacy user preference `record-add-defaults` (that needs the FrontController; can be
  switched later). First time: owner = current user, `viewable` (§9.15; legacy default was
  owner 0). Saved when a new record is created (RecordEditorHost, any type) and by the Add
  record dialog (with its record type).
- `shared/src/widgets/record-access/HRecordAccess.js` (+ `.css`): *Record is owned (editable)
  by* — `ownerChoices()`: Any logged-in user, Current user (name), the groups the user is a
  member / admin of; a database administrator: all groups and all users; the current owner
  always kept. *Record is viewable by* — the three legacy radios; the view groups (groups
  only, as legacy `sysGroups`) under the first radio; the first radio hidden for owner 0 (then
  *Any logged-in user* is checked unless Public). Option `editGroups` = *Also editable by*
  (`rec_EditGroups`, users and groups) — **kept for the record editor, not in the legacy form**.
- HRecordEditor: the Admin panel / ownership pane is HRecordAccess (`editGroups: true`); the
  old select *Visible to* (with `pending` as a choice) and *Only these groups* under
  *Logged-in users* are removed. New option `access` = owner / visibility of a new record.
- `openRecordAddDialog({dbdefs, database, recordTypes})` (`record-access/`): record type
  picker (value picker, user-data types grouped by record type group, last type preselected)
  + HRecordAccess; *Add record* / Cancel → `{rectypeId, access}` or null. No *Add these tags*
  (user tags later).
- **One entry point for "any type"**: shared code calls the host's `addRecord(null)`;
  `RecordEditorHost.addRecord(null)` shows the dialog (lazy chunk) and opens the editor of the
  chosen type with the chosen access. `addRecord(type)` for a constrained field opens the
  editor at once with the remembered access (§9.22). The manager shows *Add record* for an
  unconstrained list (`canAddRecordType(null)` = logged in); HInputResource without a type
  constraint gets *Add record* in `dropdown_add` / `addorbrowse` (manager) and the `addonly`
  button `Add record`.
- Until Phase 5 the record editor still opens only the whitelisted types; other types go to
  the legacy host editor, which ignores the chosen access.
- Explorer localization: the form and dialog texts (eng + fre).
- Tests: `shared/test/recordAccess.test.js` (rules, remembered defaults, owner list, the form,
  pending, dialog type list, unconstrained Add of HInputResource); the manager and host tests
  updated. 1259 tests pass; Explorer, Data and Map build.

Artem 2026-10-19 on Phase 4: localStorage for the remembered owner / visibility is fine;
*Also editable by* is hidden for now (an intentional simplification, remarks in
HRecordEditor and HRecordAccess; the stored edit groups are kept on save).

### Phase 5 — all record types in the new editor (2026-10-19)

- **Client**: `RecordEditorHost._usesNewEditor()` (was `_isWritable`): every record type
  (id or code name) for a logged-in user; the legacy host editor only without a login.
  `RecordEditorHost.canEditRecords()` = logged in or the legacy editor; Explorer's
  `canEditRecords()` (bridge of the modules) uses it, so the modules show their edit
  actions for a logged-in user also without the legacy host. No setting "back to the legacy
  editor" (not needed so far). `writableRecordTypes.js` stays as the list of the **system**
  record types (special fields, default pointer mode, excluded from unconstrained lists).
- **Server** (heurist): the checks of `WritableRecordTypes` in `RecordSaveService`,
  `RecordDeleteService`, `RecordDuplicateService` and the class itself removed (`git rm`);
  `ServiceFactory` updated; `srv/Records/Edit/_README.md` lists what is not ported (§6a.3:
  none ported in this plan). `RecordEditApiTest`: a type outside the former list is no longer
  refused (31 checks read-only, 68 with `--write`).
- **Test range**:
  - server `tests/RecordEditAllTypesTest.php --db=osmak_mapping --user=2 [--write] [--type=ID]`:
    one value in every field of every record type (pointers to existing records of a target
    type, terms of the field vocabulary - any relation term for a relation type field - an
    existing file, a point); validate, and with `--write` insert, read back field by field,
    PATCH one text field (the others stay), delete; the test records are removed (checked).
    Calculated fields are left out (computed on save). Result on osmak_mapping: 75 record
    types pass, 9 not testable (a required pointer to types without records: Book, Journal
    volume...), RT_REGISTERED_FILE skipped (`/files`).
  - client `shared/test/editStructuresAllTypes.test.js` on the fixture
    `shared/test/fixtures/editStructures.json` (210 KB; made by
    `node scripts/editStructureFixture.mjs [--db=]` from the local API: `/rst` rows of all 85
    record types as arrays, a small snapshot): known field types, base-field pointer types,
    a pointer mode for every pointer; every form renders and > 300 field values come back
    unchanged. Date fields are rendered as text there (flatpickr does not run in the fake DOM).
  - 1262 client tests pass; all apps build.
- **Browser check list** (not done yet): one record of each group, in Explorer (logged in,
  also without the legacy host):
  1. a Person / Organisation: text, date (temporal editor), terms, pointers in each pointer mode
     (Browse, Add, multi select), Admin panel (owner / visibility), save, title mask;
  2. a Place: geo field (map drawing), file field (upload, pick);
  3. a record with a calculated field (Admin Boundaries) and one with a workflow stage;
  4. a relationship record (RT_RELATION) opened from a related record;
  5. a CMS page and a Map document (system types: special fields still work);
  6. Data / Map / Graph module edit pens open the new editor; a guest gets no edit actions.

### Phase 6 — Explorer editor mode (2026-10-19)

- **Start**: `explorerConfig.js` gives `mode` (`runtime.runtimeMode === 'editor'`) and `editor`
  (`editorTarget(state)`: `{recordId}` or `{rectypeId, access}`); without a bridge or a
  bootstrap, `urlBootstrap(location)` reads `?db=&mode=editor&recID=` / `&rty=` (Heurist root
  three levels above `hclient/modules/explorer/`). `main.js` loads `initHeuristExplorer` or
  `editor/initRecordEditorShell.js` with a dynamic `import()`. Build: the editor page loads the
  20 KB entry, the 4 KB shell and the editor chunks, not the 226 KB workspace chunk
  (`heurist-explorer-initHeuristExplorer.js`).
- **EditorServices** (`core/EditorServices.js`): `describeQuery`, `editQuery` (HFilterBuilder),
  `selectFilterExtent`, `selectGeometry`, `drawOnMap`, `destroy` - moved from
  ExplorerApplication unchanged; ExplorerApplication keeps thin delegates (`get editorServices`,
  lazy) so its other callers did not change; the api client is given as a getter.
- **RecordEditorHost**: `mount(container, target)` → `{editor, closed}` (the editor in the page);
  `open()` (dialog) and `mount()` share `_createEditor()`; saved records kept in a WeakMap.
- **Shell** (`editor/RecordEditorShell.js` + `.css`, `initRecordEditorShell.js`): API client,
  UserGroupManager, RecordTypeManager (icons), EditorServices, RecordEditorHost; guest: "Log in to
  edit records"; no record: "No record to edit"; after the close a short message. Messages:
  bridge `onRecordSaved` / `onEditorClosed` and `postMessage` (`EDITOR_MESSAGE_SOURCE`
  `heurist-record-editor`) to the parent frame or the opener; a top-level window with an opener
  closes itself. Public API `RecordEditorShellApi`.
- **Legacy helper** (heurist): `hclient/modules/explorer/recordEditorDialog.js`
  (`window.HeuristRecordEditor.open`). Not loaded by any legacy page yet (callers later, §2.4.6).
- **Test loader**: `scripts/cssLoader.mjs` also loads Vite JSON imports (no `with {type: 'json'}`).
- Tests: `apps/explorer/test/recordEditorShell.test.js` (URL fallback, editor target, messages
  to a frame and to an opener window, self-closing window, public API);
  `test/architecture/moduleBoundaries.test.js`: nothing reachable from `apps/explorer/src/editor/`
  is the workspace (ExplorerApplication, LayoutManager, ExplorerAuthoringDock, QuerySourcePanel,
  initHeuristExplorer). 1268 tests pass; Explorer, Data, Map build.
- **Not checked in a browser.** To check: deploy Explorer, open
  `/heurist/hclient/modules/explorer/explorerViewer.html?db=osmak_mapping&mode=editor&recID=151`
  (logged in); and from a legacy page's console after loading `recordEditorDialog.js`:
  `HeuristRecordEditor.open({recordId: 151}).then(console.log)`.

### Phase 7 — built-in filter forms (2026-10-19)

- `shared/src/data/recordManagerFilters.js`: `builtinRecordFilter(dbdefs, types)` - files when
  every type is RT_REGISTERED_FILE, else generic; `fileFilter(dbdefs)` builds
  `[{f:<2-1185>: $FILENAME$}, {url: $URL$}, {f:<2-1>: $CAPTION$}, {f:<2-1186>: $FILETYPE$},
  {f:<2-29>: $MIMETYPE$}, {f:<2-67>: "$SIZE$<>$SIZE_TO$"}]` with local field ids from
  `HDbDefs.localId('dty', code)` (missing fields left out); `genericFilter()` =
  `[{title: $TITLE$}, {tag: $TAG$}]`. Layout: one vertical section; text = direct input, file
  type / MIME type = term lists, tag = the user's tags (`mode: 'select'`); size = one range
  input (from / to; one bound gives `>=` / `<=`). The system types get the generic filter for
  now (assumption, to confirm).
- HRecordManager: `filterDefinition()` (none with a browse filter or `filter: false`; option
  `filter` = another `{query, filterForm}`), `_renderFilter()` - HCardinalLayout with the form
  in the west pane (north for a horizontal form) and the list in the centre; HFilterForm
  without apiClient (no server value lists or counts); Filter → `applyFilter(conditions)` =
  type query + the resolved conditions, reload; Reset (`h-filter-form-reset`) → type query
  only. The list's own search box stays.
- Found while testing: HFilterForm replaces the class of its container - the pane is a wrapper
  around the form's own element.
- Explorer localization: the filter labels.
- Tests (`shared/test/recordManager.test.js`): the two filters (query, layout, missing fields,
  range resolution), the filter choice, Filter / Reset on the list query, the pane. 1272 tests
  pass; Explorer and Data build. Not checked in a browser.

### Review of 2026-10-19 — file input and pointer layout

- **HInputFile**: with the host's `browseRecords` and `fileRecordType` (local id of
  RT_REGISTERED_FILE, from HEditField) the file is chosen like a pointer in `addorbrowse`
  mode - a select-like button with the file name and a `fa-table` icon; a click opens the
  record manager of files (`/files`, the files filter of §7.1), Select sets the file (its name
  fetched by FileSource). Without them: the value picker, as before. Upload and URL are hidden
  while a file is chosen (clear the value to add another way). RecordEditorHost.browseRecords
  for files: no Add buttons (`allowAddition: false`; new files come from Upload / URL), the
  pen = `editFile`, no View.
- **HInputResource / HInputFile**: Edit / View (and Upload / URL / Edit of files) are placed
  right after the control box (`.h-form-input-control-wrap`), before the value tools - no longer
  inside it. With a display width the button / picker now has the whole width; before, the
  buttons took part of it (the button changed width with a value) and could run into the value
  tools. Shown on mouse over of the whole input.
- Checked with screenshots of the real widgets (a scratch Vite page, headless Edge): pointer
  modes with and without a value, a file chosen and empty, display width 30.
- Tests (`shared/test/recordEditor.test.js`): Upload / URL by value, file chosen in the record
  manager, Edit / View after the control box. 1275 tests pass.

### Review 2 of 2026-10-19 — file preview, layout, list tools, Admin panel

1. **File preview** - `shared/src/recordview/fileMediaItem.js` (+ `.css`): the media item of the
   built-in record view moved out of RecordViewRenderer (`buildFileMediaItem(file, {urls,
   download, onClose})`, `fileMediaUrls(baseUrl, database)`, `isImageFile(file)`: MIME type, else
   the name's extension). RecordViewRenderer uses it (same output); HInputFile: a click on the
   small thumbnail (zoom-in cursor, only with `fileViewer {baseUrl, database}` from
   RecordEditorHost through HRecordEditor / HEditForm / HEditField) shows the file below the
   input - click on the image = large / small (zoom-in / zoom-out), Show in OSD, Show in Mirador,
   Download (`?db=&download=1&file=`), Close. Another file or none hides it.
2. HInputFile: the open link (`a.h-input-file-name`) removed; without a picker the name is a
   plain text (`.h-input-file-text`). `fileUrl` of HInputFile no longer used.
3. / 4. **Display width = width of the picker / button** (`.h-input-resource-picker`,
   `.h-input-file-picker`, `.h-input-file-browse`: `width: calc(var(--h-field-width) + 2em)`);
   the control box of these compact inputs is as wide as its content (HEditField.css), so the
   thumbnail and the buttons after it do not take from the width. Checked with screenshots
   (scratch page, headless Edge).
5. **Record manager list**: HRecordList option `listTools` - Sort (`createSortSelect`, with
   `sortExclude`; `type` is left out for `/files`) and a *Show owners* checkbox
   (`createOwnersCheckbox`, switches Admin info of the list) after the search box; the sort goes
   to `RecordListLoader.setSort`. Select mode: no selection menu (`controls.selectionActions:
   false`).
7. **Add record of the picker**: works in a browser test (scratch page: the popover closes,
   `addRecord` is called, the new record is the value). Errors of the host's `addRecord` /
   `browseRecords` were lost (`void run()`); HInputResource now shows them (HMsg.showMsgErr).
   The cause in Artem's case is not known yet - to check which field / record type.
8. **Added / Updated**: `localTime()` as legacy `getTimeForLocalTimeZone` - the stored time is
   UTC, shown as `2026-10-19 12:05:09 (14:05:09 local)`.
9. **Admin panel**: owner and access as read-only lines (`describeAccess()` in HRecordAccess.js)
   with a pen; the pen opens HRecordAccess inline with Apply / Cancel; Apply closes it, updates
   the lines and marks the record changed; nothing is saved there (the header goes with Save).
- Dictionaries: new strings in Explorer, Data, Graph, Map, RecordView (eng + fre); the Data
  dictionary test also scans `fileMediaItem.js`.
- Tests: `recordViewRenderer.test.js` (the media item in the fake DOM instead of source checks),
  `recordEditor.test.js` (preview), `recordAccess.test.js` (describeAccess, Admin panel, local
  time), `recordManager.test.js` (list tools). 1285 tests pass; Explorer, Data, RecordView, Map,
  Graph build.


### Review of 2026-10-20

1. **HInputFile Edit over the browse button**: Upload / URL / Edit / Cancel are now in the same
   flex row as the thumbnail and the picker / button (`.h-input-file`), not after the control box,
   so they can never lie over it. The picker / browse button (and `.h-input-resource-picker`) have
   `width: 22em` instead of `flex-basis: 22em`: with a flex basis the control box took its width
   from the (short) file name and the 10em minimum ran over the next element.
2. **Download in the record view**: `buildFileMediaItem` has `download = true` by default; the
   record view and HInputFile use the same code (fileMediaItem.js).
3. **Record manager remembers view mode and sort**: localStorage
   `heurist.recordManager.list.<database>./records|/files` (`{viewMode, sort}`), read at render,
   written on change.
4. HRecordList row actions: Edit, View, then the collect +/- button.
5. **Add record of the picker**: still works in a test (several target types: the type menu
   opens, `addRecord` gets the chosen type, the new record is the value). Cause in Artem's case
   still unknown - need the field, its target types and the browser console.
6. Admin section: `.h-record-editor-access-form` has `padding: 6px; border: 2px solid
   var(--h-color-primary)`.

Second round (Artem, 2026-10-20):
1. HInputFile: the buttons went outside the form and clear / visibility lay over the browse button,
   so the buttons are after the control box again (as HInputResource), and with a display width the
   picker / browse button is narrower by the thumbnail: `calc(var(--h-field-width) + 2em - 32px -
   var(--h-gap))`, so the thumbnail and the button together are as wide as a pointer field's picker.
2. fileMediaItem.css: the links in a row (wrapped), not a column.
3. **Add with several target types**: the type popover had no height - `.h-menu` is
   `position: absolute`, so inside `.h-popover` it took no space. `.h-input-resource-type-popover > .h-menu`
   is now `position: static` (no own border / shadow).

