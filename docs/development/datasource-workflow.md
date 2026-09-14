# HEURIST-EXPLORER DataSource Workflow

## Core workflow

All search/navigation entry points converge on a single workflow:

```text
Direct Search
Saved Filter
Record Type
History
Favorite
Module action (Show data)
        │
        ▼
Create / resolve DataSource
        │
        ▼
normalizeDataSource()
        │
        ▼
ExplorerApplication.activateDataSource()
        │
        ├──► DataSourceHistory.add()
        │
        ▼
SyncEngine.setDataSource()
        │
        ├──► current heurist-data view
        ├──► heurist-map
        ├──► heurist-graph
        └──► heurist-timeline

Selection changes:
module → IframeModuleAdapter → SyncEngine.setSelection() → all other modules
```

There must be no separate activation path for Saved Filter, Record Type, History or Favorite. They differ only in how the DataSource is obtained.

---

## 1. Direct Search workflow

### Current code

`HFilter.executeDirectQuery()` already:

1. normalizes the entered search request;
2. validates/counts it using `/records?detail=count`;
3. creates:

```js
{ type: 'query', query: request, count }
```

4. emits `datasourcechange` through `_publish()`.

`ExplorerApplication.initialize()` listens for this event and calls:

```js
activateDataSource(event.detail)
```

### Target workflow

```text
User enters query
    ↓
HFilter.executeDirectQuery()
    ↓
/records detail=count
    ↓
normalizeDataSource({type:'query', query, count, title?})
    ↓
HFilter._publish(dataSource)
    ↓ datasourcechange
ExplorerApplication.activateDataSource(dataSource)
    ↓
DataSourceHistory.add(dataSource)
    ↓
SyncEngine.setDataSource(dataSource)
    ↓
IframeModuleAdapter.setDataSource() for followers/current data view
```

A direct search remains `type:'query'` until explicitly saved as a Filter.

---

## 2. Select Saved Filter workflow

### Current code

`HFilter.loadFilters()` reads filters through:

```text
GET /api/{db}/sys
q={t:'filter', filterType:'filter'}
fields=query,filterType
```

`HFilter._pickSavedFilter(id)` then reloads the item from:

```text
GET /api/{db}/sys/filter/{id}
```

At present `_pickSavedFilter()` places the saved query text in the query box but **does not execute or emit a Filter DataSource**.

### Target workflow

Saved Filter selection should move to the ExplorerControlPanel list and `FilterProvider`.

```text
User selects Saved Filter
    ↓
ExplorerControlPanel
    ↓
FilterProvider.get(id)
    ↓
FilterProvider.toDataSource(record)
    ↓
{
  type: 'filter',
  id,
  title,
  query: completeSavedRequest,
  origin: 'filter'
}
    ↓
ExplorerApplication.activateDataSource(dataSource)
```

The saved-filter DataSource contains the executable saved request. Presentation adapters may derive the base `q` where their public API currently expects only the base query.

Saved Filter selection should therefore **execute immediately**. Loading it into the direct query box for manual re-execution should not be the normal selection workflow.

HFilter may still support "load into editor" later as an explicit edit/copy action.

---

## 3. Filter by Record Type workflow

Record Type is a producer of a normal query DataSource.

```text
User selects Record Type
    ↓
ExplorerControlPanel.openRecordTypes()
    ↓
ExplorerApplication.dataSourceFromRecordType(id)
    ↓
{
  type: 'query',
  title: recordTypeName,
  query: {q:`t:${id}`},
  origin: 'rectype'
}
    ↓
ExplorerApplication.activateDataSource()
```

The Record Type list comes from `HDbDefs`, already available through `ExplorerApplication._ensureDbDefs()`.

Do not pass `type:'rectype'` into SyncEngine/modules.

---

## 4. History workflow

History is updated on **successful activation**, not independently by every producer.

```text
ExplorerApplication.activateDataSource(ds)
    ↓
normalizeDataSource(ds)
    ↓
DataSourceHistory.add(ds)
    ↓
SyncEngine.setDataSource(ds)
```

History selection:

```text
ExplorerControlPanel.openHistory()
    ↓
DataSourceHistory.list()
    ↓ click
ExplorerApplication.activateDataSource(historyEntry.dataSource)
```

`DataSourceHistory.add()` deduplicates through `dataSourceKey()` and moves an existing source to the newest position.

---

## 5. Favorites workflow

Favorites are references which must first be resolved.

### Saved Filter favorite

```text
{type:'filter', id:17}
    ↓
FilterProvider.get(17)
    ↓
FilterProvider.toDataSource()
    ↓
activateDataSource()
```

### Record Type favorite

```text
{type:'rectype', id:12}
    ↓
HDbDefs resolves current title/definition
    ↓
dataSourceFromRecordType(12)
    ↓
activateDataSource()
```

### Built-in favorite

```text
{type:'builtin', id:'recent'}
    ↓
BuiltInDataSources.resolve('recent')
    ↓
query DataSource
    ↓
activateDataSource()
```

Add/remove Favorite changes only `DataSourceFavorites`; it does not alter the Saved Filter, Record Type, or active DataSource.

---

## 6. Save active query as Filter

```text
Active DataSource type:'query'
    ↓
Save as filter
    ↓
Explorer host action / Explorer UI
    ↓
minimal dialog: Name, Note, Group
    ↓
FilterProvider.create({..., dataSource})
    ↓
POST /api/{db}/sys/filter
    ↓
server returns saved filter record
    ↓
FilterProvider.toDataSource(record)
    ↓
{type:'filter', id, title, query}
```

Recommended final step:

```text
activateDataSource(newSavedFilterDataSource)
```

This means the current search immediately acquires its persistent Filter identity.

Current server note: `/sys` is presently read-only; `POST /sys` is a search request. A distinct filter create/update/delete contract must be implemented first.

---

## 7. Workspace workflow

Workspace is a retained set of DataSource references owned by Explorer.

### Keep current source

```text
heurist-data / heurist-map action
    ↓
host bridge: addDataSourceToWorkspace(dataSource)
    ↓
IframeModuleAdapter child host bridge
    ↓
ExplorerApplication host action
    ↓
ExplorerWorkspace.add(dataSource)
    ↓
Explorer refreshes interested modules/UI
```

The child module never writes Workspace/localStorage itself.

### Remove

```text
module action: Remove from workspace
    ↓
host bridge removeDataSourceFromWorkspace(key/source)
    ↓
ExplorerWorkspace.remove(key)
    ↓
refresh Workspace UI / map workspace layers / later timeline bands
```

### Show data from a map layer

```text
User: Show data
    ↓
heurist-map getLayerDataSource(layerId)
    ↓
host bridge showDataSource(dataSource)
    ↓
ExplorerApplication.activateDataSource(dataSource)
    ↓
Explorer shows/activates heurist-data presentation
```

Map never calls heurist-data directly.

---

# Classes and methods participating in the workflow

## Existing — `src/core/DataSource.js`

Current:

```js
dataSourceKey(source)
isSameDataSource(a, b)
dataSourceRole(source)
```

Add:

```js
normalizeDataSource(source)
dataSourceTitle(source)
cloneDataSource(source)
canonicalizeQuery(query)
```

Responsibility: datasource normalization and identity only.

---

## Existing — `src/core/SyncEngine.js`

Methods:

```js
register(module)
unregister(id)
setDataSource(source, options)
setSelection(ids, options)
destroy()
```

Responsibility: propagate active datasource and shared selection between Explorer modules. No persistence/navigation responsibilities.

---

## Existing — `src/core/ExplorerApplication.js`

Current relevant methods:

```js
initialize()
_createModule(definition)
_createDataModule(source, context)
activateDataSource(source)
_hostActions()
_ensureDbDefs()
setDataSource(source)
setSelection(ids)
```

Target additions/refinements:

```js
activateDataSource(source, options = {})
activateSavedFilter(id)
activateRecordType(id)
dataSourceFromRecordType(id)
resolveDataSourceReference(ref)

addToHistory(source)               // or delegate directly to history
addFavorite(ref)
removeFavorite(ref)

saveDataSourceAsFilter(source)
addDataSourceToWorkspace(source, options)
removeDataSourceFromWorkspace(sourceOrKey)
showDataSource(source)
```

`activateDataSource()` remains the central gateway.

---

## Existing — `src/widgets/filter/HFilter.js`

Current relevant methods:

```js
loadFilters()
_pickSavedFilter(id)
executeDirectQuery(value)
_count(request)
_publish(dataSource)
_saveForReuse()
```

Target role:

- Keep `executeDirectQuery()`, `_count()` and query/filter-builder input responsibilities.
- `_publish()` continues to emit direct-search DataSources.
- Move Saved Filter discovery/normalization into `FilterProvider` + `ExplorerControlPanel`.
- Replace `_saveForReuse()` placeholder with a request to Explorer, or remove it if Save is exposed from the Explorer/module action surface.

`_pickSavedFilter()` should not remain the primary saved-filter activation route.

---

## New — `src/data/FilterProvider.js`

```js
list(options = {})
get(id)
create(values)
update(id, values)
remove(id)
normalizeRecord(record)
toDataSource(record)
```

Responsibility: all `/sys/filter` OpenAPI communication and normalization of saved-filter records.

---

## Existing — `src/ui/ExplorerControlPanel.js`

Current `_handleLeftTool()` has placeholders for Favorites, History and Manage Filters.

Add/replace with:

```js
openHistory(anchor)
openFavorites(anchor)
openSavedFilters(anchor)
openRecordTypes(anchor)
_renderDataSourceList(...)
```

Responsibility: navigation/picker UI. Selection delegates to `ExplorerApplication`; the control panel does not synchronize modules itself.

---

## New — `src/core/DataSourceHistory.js`

```js
constructor({ database, storage })
add(dataSource)
list()
remove(key)
clear()
```

Uses `dataSourceKey()` for deduplication.

---

## New — `src/core/DataSourceFavorites.js`

```js
constructor({ database, storage })
add(reference)
remove(reference)
has(reference)
list()
```

Resolution should be delegated to `ExplorerApplication.resolveDataSourceReference()` or dedicated resolvers/providers, not embedded in storage code.

---

## New — `src/core/BuiltInDataSources.js`

Optional small module:

```js
list()
resolve(id)
```

Owns definitions such as Recent and All by date so query strings are centralized.

---

## New — `src/core/ExplorerWorkspace.js`

```js
constructor(...)
add(dataSource, metadata = {})
remove(sourceOrKey)
has(sourceOrKey)
get(key)
list()
clear()
```

Responsibility: retained datasource references only. It does not synchronize modules itself.

---

## Existing — `src/modules/IframeModuleAdapter.js`

Current relevant methods:

```js
_installBridge()
_createChildHostBridge()
_bootstrap()
_sourceBootstrap()
_bindChildEvents()
setDataSource(source)
setSelection(ids)
```

Extend `_createChildHostBridge()` with Explorer-owned datasource actions:

```js
addDataSourceToWorkspace(source, options)
removeDataSourceFromWorkspace(sourceOrKey)
isDataSourceInWorkspace(sourceOrKey)
showDataSource(source)
saveDataSourceAsFilter(source)
```

`setDataSource()` remains the adapter from Explorer DataSource to each module's existing public API.

---

## Existing — `src/core/ExplorerModule.js`

Methods:

```js
setDataSource(source)
setSelection(ids)
getState()
```

No major workflow change required. It remains the engine-neutral module contract.

---

## Existing — heurist-map `MapApplication`

Useful current methods include:

```js
initializeDynamicDocument()
getDynamicDocumentEntry()
getDynamicDocument()
activateDynamicMapDocument()
getActiveMapDocument()
getDocumentLayer(layerId, documentId)
```

Add a datasource-facing layer contract around existing dynamic document machinery:

```js
getLayerDataSource(layerId)
addWorkspaceDataSource(dataSource, options)
removeWorkspaceDataSource(sourceOrKey)
getWorkspaceLayers()
```

The dynamic MapDocument may remain an implementation detail, but UI terminology should be Workspace / Workspace map rather than Current Result MapDocument.

---

# DataSource activation sequence in detail

Recommended implementation of the central path:

```js
async activateDataSource(source, { origin = null } = {}) {
  const dataSource = normalizeDataSource(source);
  if (!dataSource) return null;

  this.history.add(dataSource);

  let dataModule = this.layout.findCurrentResultDataModule();
  if (!dataModule) {
    dataModule = await this._createDataModule(dataSource, { role: 'current' });
  }

  await this.sync.setDataSource(dataSource, {
    origin,
    preserveDataViews: true,
    dataModuleId: dataModule.id
  });

  this.layout.activateModule(dataModule.id);
  this.controlPanel?.refreshActiveTool?.();
  this.controlPanel?.refreshNavigationState?.();
  return dataModule;
}
```

The exact code may differ, but the order is important: normalize once, record History once, synchronize once.

---

# Selection workflow

Keep the existing design.

```text
User selects records in module
    ↓
module public event
    ↓
IframeModuleAdapter._bindChildEvents()
    ↓
ExplorerModule emits selectionchange
    ↓
SyncEngine registered handler
    ↓
SyncEngine.setSelection(ids, {origin: module.id})
    ↓
all other module adapters setSelection()
```

Current same-selection guards in both `IframeModuleAdapter` and `SyncEngine` should remain to prevent echo/circular selection calls.

---

# Separation of state

Keep these concepts distinct:

| State | Owner | Persistence | Purpose |
|---|---|---|---|
| Active DataSource | `SyncEngine` / `ExplorerApplication` | Explorer state | What presentations currently follow |
| History | `DataSourceHistory` | `localStorage` | Recently used sources |
| Favorites | `DataSourceFavorites` | `localStorage` | User shortcuts to persistent/built-in sources |
| Workspace | `ExplorerWorkspace` | session/local policy | Sources deliberately retained for current work |
| Saved Filter | OpenAPI `/sys/filter` | server DB | Persistent reusable search |
| Map layer | heurist-map | map/session/document | Geographic presentation of a source |
| Selection | `SyncEngine` | transient | Shared selected record IDs |

This separation is the main constraint that prevents History, Workspace, MapDocument and active search from becoming competing stores of the same concept.
