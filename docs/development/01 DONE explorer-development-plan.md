# HEURIST-EXPLORER Development Plan

## Purpose

This plan establishes the next HEURIST-EXPLORER development sequence around a single, explicit `DataSource` lifecycle. The immediate goal is to make direct searches, saved filters, history, favorites, workspace items, and module actions use the same datasource model and the same synchronization path.

The guiding rule is:

> **Explorer owns DataSources and synchronization. Presentation modules consume DataSources and may request Explorer actions through the host bridge.**

Map layers and timeline bands may reference a DataSource, but they must not become alternative DataSource implementations.

---

## Phase 1 — DataSource as a proper object; consolidate SyncEngine

### Goal

Turn `DataSource` from a loose convention into the stable identity passed throughout Explorer.

Current code already has:

- `src/core/DataSource.js`
  - `dataSourceKey(source)`
  - `isSameDataSource(a, b)`
  - `dataSourceRole(source)`
- `src/core/SyncEngine.js`
  - `register(module)` / `unregister(id)`
  - `setDataSource(source, options)`
  - `setSelection(ids, options)`
- `ExplorerApplication.activateDataSource(source)` as the central activation path.

These should be retained and strengthened rather than replaced.

### Target DataSource shape

```js
{
  type: 'query' | 'filter' | 'dataset',
  id: null,                 // persistent id for filter/dataset
  title: 'All Places',

  // Executable search request. Keep the complete request, not only q.
  query: {
    q: 't:12',
    w: 'all',
    rules: null,
    rulesonly: 0,
    sort: null,
    filter: null
  },

  // Optional metadata; not part of persistent identity unless explicitly stated.
  count: null,
  origin: 'search'          // search | filter | rectype | history | favorite | module
}
```

### Identity rules

`DataSource.js` becomes the single place for normalization and identity.

Required functions:

```js
normalizeDataSource(source)
dataSourceKey(source)
isSameDataSource(a, b)
dataSourceTitle(source)
cloneDataSource(source)
```

Identity:

- Saved filter: `filter:<id>`
- Dataset: `dataset:<id>`
- Direct query: canonicalized query key, not the current hard-coded `query:current` identity.

The current `query:current` concept is useful as a **presentation role**, but it is not sufficient as datasource identity once history/workspace contain several queries.

For query identity, canonicalize the executable request: stable property ordering and omission of null/default fields. `count`, `origin`, display title and timestamps must not affect identity.

### SyncEngine responsibility

`SyncEngine` remains responsible only for synchronized state:

- active DataSource;
- shared selection;
- avoiding selection echoes;
- propagating state to registered modules.

It must **not** own history, favorites, workspace persistence, saved-filter CRUD, or UI lists.

`ExplorerApplication.activateDataSource(source)` remains the single normal entry point. It should:

1. normalize DataSource;
2. add/update History;
3. pass it to `SyncEngine.setDataSource()`;
4. activate the reusable current-result Data module;
5. refresh interested Explorer UI.

This keeps datasource activation and datasource persistence separate.

### Deliverables

- Extend `DataSource.js` with normalization/canonical query identity.
- Update tests in `test/dataSource.test.js`.
- Keep `SyncEngine` narrowly focused; update tests only where identity/echo handling requires it.
- Make all Explorer datasource producers call `normalizeDataSource()` before activation.

---

## Phase 2 — History and Favorites

Both History and Favorites are **references to DataSources**, not independent copies of data or result sets.

### 2.1 History

History records the most recent activated DataSources.

Create:

```text
src/core/DataSourceHistory.js
```

Suggested API:

```js
history.add(dataSource)
history.list()
history.remove(key)
history.clear()
history.setPinned(key, true|false)   // optional only if pinning history itself remains useful
```

Storage: `localStorage`, database-scoped key, e.g.

```text
heurist.explorer.<database>.history
```

Entry:

```js
{
  key,
  title,
  dataSource,
  usedAt
}
```

Rules:

- 10–12 latest unique datasource references; use 12 initially.
- Reactivating an existing datasource moves it to the top.
- Empty/invalid searches are never stored.
- The title is captured from the DataSource when added.
- History selection calls `ExplorerApplication.activateDataSource(entry.dataSource)`.

History UI belongs in `ExplorerControlPanel`, replacing the current History placeholder.

### 2.2 Favorites

Favorites are stable references, not duplicated saved-filter definitions.

Create:

```text
src/core/DataSourceFavorites.js
```

Suggested reference forms:

```js
{ type: 'filter', id: 17 }
{ type: 'rectype', id: 12 }
{ type: 'builtin', id: 'recent' }
{ type: 'builtin', id: 'all-by-date' }
```

Storage: `localStorage`, database-scoped.

Suggested API:

```js
favorites.add(reference)
favorites.remove(reference)
favorites.has(reference)
favorites.list()
favorites.resolve(reference)
```

Initially Favorites can be added from Saved Filters. Record-type favorites are added in Phase 4.

Built-ins are virtual favorites and are not persisted as saved filters:

- **Recent** — query corresponding to `sortby:-m after:"1 week ago"`.
- **All by date** — centralized built-in query definition; do not duplicate query text in several widgets.

### ExplorerControlPanel

Use `ExplorerControlPanel` for all navigation lists:

- History;
- Favorites;
- Saved Filters;
- later Record Types.

`HFilter` should remain primarily the direct-query/filter-builder widget. Do not grow it into the owner of all Explorer navigation lists.

Suggested panel methods:

```js
openHistory()
openFavorites()
openSavedFilters()
openRecordTypes()       // Phase 4
```

Each list emits/resolves a DataSource and then calls the same `activateDataSource()` path.

---

## Phase 3 — Save Filter via OpenAPI

### Server requirement

Current `/api/{db}/sys` is explicitly a **read contract**. `POST /sys` currently means a JSON-body system-record search, not creation.

Add a real write contract for saved filters. Recommended REST shape:

```text
POST   /api/{db}/sys/filter
PUT    /api/{db}/sys/filter/{id}      or PATCH for partial update
DELETE /api/{db}/sys/filter/{id}
```

The first Explorer requirement is create; update/delete can follow immediately if cheap, but the route design should reserve them.

### Saved Filter input

Minimal form:

- Name — required.
- Note — optional.
- Group — owner/group selection.

The query itself comes from the active `DataSource`; it is not manually edited in this dialog.

Suggested logical payload:

```js
{
  title: 'My filter',
  note: 'Optional description',
  owner: 3,
  query: {
    q: 't:12',
    w: 'all',
    rules: null,
    rulesonly: 0,
    sort: null,
    filter: null
  }
}
```

The server adapter maps this stable OpenAPI representation to the current `usrSavedSearches` fields (`svs_Name`, `svs_Query`, `svs_UGrpID`, etc.). The public contract must not expose that storage detail.

If Note is not currently representable in the legacy table/schema, add the logical field only when there is an agreed storage mapping; do not silently drop it.

### Client classes

Add a small provider rather than putting CRUD in `HFilter`:

```text
src/data/FilterProvider.js
```

Suggested API:

```js
list(options)
get(id)
create({ name, note, groupId, dataSource })
update(id, values)
remove(id)
toDataSource(record)
```

Current `HFilter.loadFilters()` and `_pickSavedFilter()` already know the read shape; this normalization should migrate into `FilterProvider` so ExplorerControlPanel and HFilter do not duplicate it.

### Save action

For a `type:'query'` datasource:

```text
Save as filter
```

Flow:

1. module or Explorer UI requests `saveDataSource(dataSource)`;
2. Explorer opens minimal form;
3. `FilterProvider.create()` calls OpenAPI;
4. provider converts returned record to `{type:'filter', id, title, query}`;
5. refresh Saved Filters/Favorites UI as necessary;
6. optionally replace/re-activate the current source as the new saved-filter DataSource so it immediately has stable persistent identity.

---

## Phase 4 — Filter by Record Type

### Principle

Record Type is a **DataSource producer**, not a new persistent DataSource type.

Selecting record type `12` should resolve to something like:

```js
{
  type: 'query',
  title: 'Places',
  query: { q: 't:12' },
  origin: 'rectype'
}
```

Do not add `type:'rectype'` to the core DataSource contract unless a later requirement truly needs it.

Favorites may retain `{type:'rectype', id:12}` because the reference should follow the current ontology title/icon. On activation it resolves to a query DataSource.

### UI

Add Record Types as an ExplorerControlPanel list, not inside the direct-query widget.

Use `HDbDefs` / definition snapshot already loaded by `ExplorerApplication._ensureDbDefs()`.

Suggested Explorer methods:

```js
getRecordTypes()
dataSourceFromRecordType(id)
activateRecordType(id)
```

Record Type list actions:

- Select → create query DataSource → `activateDataSource()`.
- Add to Favorites.
- Remove from Favorites when already favorited.

---

## Phase 5 — Workspace (formerly pinned)

### Concept

Introduce **Workspace** as the user's temporary collection of DataSources they deliberately keep while exploring.

Use the term **Workspace**, not `pinned DataSource` and not `Current Result MapDocument`.

The active search remains **Current Results**. Workspace contains retained sources.

```text
Current Results     transient active datasource
Workspace           retained datasource references for this work session
Saved Filter        persistent server-side datasource definition
Dataset             persistent server-side datasource definition
```

Create:

```text
src/core/ExplorerWorkspace.js
```

Suggested API:

```js
workspace.add(dataSource, metadata = {})
workspace.remove(key)
workspace.has(dataSourceOrKey)
workspace.list()
workspace.clear()
workspace.get(key)
```

Initially use session/browser persistence appropriate to the desired UX. Keep this policy separate from the DataSource object itself.

Workspace entries are datasource references with optional module-specific metadata:

```js
{
  key,
  title,
  dataSource,
  addedAt,
  presentation: {
    map: null,
    timeline: null
  }
}
```

### Module → Explorer bridge actions

Presentation modules must not mutate Explorer Workspace themselves. They request host actions.

Extend `ExplorerApplication._hostActions()` and `IframeModuleAdapter._createChildHostBridge()` with, for example:

```js
addDataSourceToWorkspace(source, options)
removeDataSourceFromWorkspace(sourceOrKey)
isDataSourceInWorkspace(sourceOrKey)
showDataSource(source)
saveDataSourceAsFilter(source)
```

Exact naming can be shortened, but keep the direction explicit: child module requests; Explorer owns the state.

### Data module actions

For current query/filter:

- **Keep in workspace**
- **Save as filter** — only where saving is meaningful, primarily a query.

For a Workspace source:

- **Remove from workspace**

History and Workspace are different:

- History records what the user used.
- Workspace records what the user deliberately retained.

Adding to Workspace may naturally also refresh History, but Workspace must not be implemented as a special History flag.

---

## Phase 6 — heurist-map and Workspace

### Rename the dynamic document concept in the UI

`heurist-map` currently has a dynamic/current-result MapDocument (`MapApplication.initializeDynamicDocument()`, `getDynamicDocument()`, `activateDynamicMapDocument()`). Keep the implementation mechanism if useful, but present it to the user as:

> **Workspace**

or, where a map-specific label is required:

> **Workspace map**

Do not make the MapDocument the conceptual owner of Explorer Workspace.

### Responsibility split

Explorer Workspace owns retained DataSources.

Map owns the layer representation required to visualize those sources:

```text
ExplorerWorkspace datasource
        ↓
Map workspace layer (query-based)
```

A workspace source does not need map configuration until it is visualized on the map.

### Map actions

For the transient Filtered/Current Results layer:

- **Keep in workspace**
- **Save as filter** where applicable.

For a Workspace layer:

- **Show data**
- **Remove from workspace**

For a query-based layer in a persistent MapDocument:

- **Show data**
- later optionally **Copy to workspace**

`Show data` must not manipulate `heurist-data` directly. The map calls the host bridge with the layer's DataSource. Explorer then activates/shows the Data presentation through its normal workflow.

### Required map contract additions

Map query layers need a reliable method to expose/reconstruct their DataSource.

Suggested public/internal methods:

```js
getLayerDataSource(layerId)
addWorkspaceDataSource(dataSource, options)
removeWorkspaceDataSource(key)
getWorkspaceLayers()
```

Where possible, build these on existing `MapApplication` dynamic-document/layer machinery rather than a second layer system.

### Sync rule

Map layer visibility/style/opacity are map state. Workspace membership is Explorer state. Do not infer one automatically from the other.

---

## Phase 7 — Timeline deferred

Timeline work is deliberately deferred until Datasource identity, Workspace, and map-layer datasource exposure are stable.

Later phases will:

- expose Workspace and active MapDocument query layers as timeline bands;
- load each layer DataSource independently through `/time`;
- group bands by Workspace and active MapDocument;
- add per-band visibility state local to Timeline;
- support **Show data**, **Keep/Copy to workspace**, and **Remove from workspace** through the same Explorer bridge actions.

Do not implement broader MapDocument browsing in Timeline initially. Start with Workspace + currently active MapDocument only.

---

# Recommended implementation order

1. `DataSource.js` normalization and canonical identity.
2. Confirm/adjust `SyncEngine` around normalized sources.
3. `DataSourceHistory` + History panel.
4. `DataSourceFavorites` + Favorites panel; Saved Filter favorite/unfavorite.
5. OpenAPI filter write contract.
6. `FilterProvider` + minimal Save Filter dialog.
7. Record Type list + record-type favorites.
8. `ExplorerWorkspace`.
9. Host bridge Workspace / Show Data / Save Filter actions.
10. heurist-data actions.
11. heurist-map Workspace integration and query-layer DataSource exposure.
12. Timeline phases after the above contracts are stable.

# Architectural constraints

- `ExplorerApplication.activateDataSource()` remains the normal activation gateway.
- `SyncEngine` synchronizes; it does not persist navigation/workspace state.
- History/Favorites/Workspace store references to DataSources, not result records.
- Saved Filters are persisted through OpenAPI, never via legacy client endpoints from Explorer.
- Record Type selection creates an ordinary query DataSource.
- `ExplorerControlPanel` owns History, Favorites, Saved Filters and Record Type navigation lists.
- Presentation modules never call each other directly. Cross-module actions return through Explorer/host bridge.
- Map layers and timeline bands reference DataSources; they do not define a competing datasource model.
