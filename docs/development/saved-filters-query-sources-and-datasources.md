# HEURIST-EXPLORER: Saved Filters, Presentation Sources and DataSources

## Purpose

This note clarifies the roles and relationships of Saved Filters, Record Types, Query Source (MapSource) records and the Explorer `DataSource`. It supplements the HEURIST-EXPLORER Development Plan and DataSource Workflow and should be treated as the architectural context for their first phases.

## 1. Persistent and producing entities

### Saved Filter

A Saved Filter is a persistent reusable **search definition**. In the current system it is a legacy entity stored in `usrSavedSearches`; most of its logical fields are encoded as JSON in `svs_Query`.

It may contain:

- name and localized names;
- note;
- query string or a modern parameterized/faceted query;
- expansion rules and `rulesonly`;
- other legacy search UI state.

Saved Filters are widely used and must remain available during the transition. Their current physical storage is an implementation detail and must not leak into new Explorer code.

### Record Type

A Record Type is not a stored source definition. Selecting a Record Type is simply a convenient **producer of a query**, normally `t:<record-type-id>`.

Explorer therefore resolves a Record Type selection to a runtime DataSource. A Favorite may reference the Record Type so its current name and icon can be resolved, but presentation modules should receive the resolved query rather than a special record-type Query Source format.

### Query Source (MapSource)

`RT_QUERY_SOURCE` (`3-1021`) is one persistent **presentation-aware source definition** record type, stored today as ordinary user records, and shared by every presentation module — "MapSource" is simply Map's established name for its own use of this same record type; Data/Graph/Timeline call it Query Source.

They combine a query with configuration needed by one or more presentation modules:

| Profile | Examples |
| --- | --- |
| Data | field paths, column/export fieldset, expansion rules |
| Map | geo field paths, viewport querying, min/max zoom |
| Graph | initial links, expansion rules |
| Timeline | date/time field paths |
| Parameterized filter | structure used to build `HFilterForm` |

Field, geo and date/time selectors use the same query-path notation, for example `10:lt234:12:38`.

Map's use of this record type is established and referenced by existing MapLayer records, so it requires long-term compatibility. Data/Graph/Timeline's use of it is newer and can evolve or be replaced with much less migration risk, even though both are the same underlying record type. It should not be folded into the Saved Filter JSON: a Saved Filter captures search intent, while Query Source adds a presentation recipe.

In the target architecture these definitions belong to the `sys` domain, alongside Website, Page, MapDocument and MapLayer. The intended domains are:

- `def` — ontology/database definitions;
- `sys` — internal application and user configuration;
- `rec` — public/user research data.

All will eventually use a common records/details storage pattern and common CRUD, search, validation and presentation infrastructure.

## 2. What a client DataSource is

An Explorer `DataSource` is not another persistent entity. It is a small, normalized **runtime transfer object**: the resolved instruction describing what records the presentation modules should load, plus the identity of the persistent definition from which that instruction came.

It should contain three clearly separated parts:

```js
{
  reference: {
    type: 'query' | 'filter' | 'recordtype' | 'querysource',
    id: 17,                 // absent for an ad-hoc query
    key: 'filter:17'
  },
  title: 'All Places',
  request: {
    q: 't:12',
    w: 'all',
    rules: null,
    rulesonly: 0,
    sort: null,
    filter: null
  },
  presentation: {
    data: null,
    map: null,
    graph: null,
    timeline: null,
    filterForm: null
  }
}
```

The exact property names may remain compatible with the current `{type, id, query}` shape initially, but normalization should enforce this conceptual separation:

- `reference` supplies provenance and stable identity;
- `request` is the executable common records request;
- `presentation` contains only resolved module profiles when applicable.

The DataSource may repeat values read from a Saved Filter or Query Source, but this is deliberate runtime denormalization, not a second canonical store. It must never be saved as an independent record, edited as the authoritative definition, or acquire its own CRUD API. Reloading/resolving its reference refreshes the runtime snapshot.

Modules should primarily consume `request` and their own presentation profile. Explorer uses `reference` for identity, History, Favorites and Workspace. For compatibility, `normalizeDataSource()` can accept the current `{type:'query'|'filter'|'querysource'}` objects and produce the normalized shape.

## 3. Recommended transition

### Immediate route: controlled form of option B

Use both existing families during the Explorer demonstration period:

- Saved Filters remain in `usrSavedSearches`;
- Query Source (MapSource) records remain ordinary records;
- Explorer resolves all of them to the same runtime DataSource contract;
- presentation modules do not know which table/domain supplied the definition.

This is temporary parallel persistence, not parallel client architecture. The single runtime contract is what prevents duplication from spreading through the client.

### Stable Saved Filter API without a disposable client implementation

Keep the public contract as standard system-resource CRUD:

```text
GET    /api/{db}/sys/filter
GET    /api/{db}/sys/filter/{id}
POST   /api/{db}/sys/filter
PATCH  /api/{db}/sys/filter/{id}
DELETE /api/{db}/sys/filter/{id}
```

The server already has `SystemEntitySchemaRegistry`, whose stated purpose is to map stable system entities to legacy storage until they move to `sysRecords/sysDetails`. Extend this approach from query/read to mutation/write:

- add a generic system-entity mutation service/repository;
- register a writable `filter` mapping/codec;
- map logical fields to `svs_Name`, `svs_UGrpID`, `svs_Query` and modification metadata;
- apply the existing ownership/group permission and duplicate-name rules;
- merge and preserve unrecognized keys in `svs_Query` when updating through the new API.

Thus Explorer and `FilterProvider` use only the permanent `/sys/filter` contract. When storage moves, the registry/repository changes; the client and OpenAPI contract do not.

A small filter-specific codec is unavoidable while several logical fields occupy one JSON column. It belongs behind the generic system API, not in Explorer.

### Do not put Query Source fields into Saved Filter JSON (option A)

Option A should not be used for the new presentation fields:

- legacy editors may reconstruct `svs_Query` and discard unknown keys;
- it conflates a reusable search with module presentation configuration;
- ownership, validation and evolution of the JSON become unclear;
- MapSource compatibility would still remain a separate concern.

Only existing Saved Filter search fields should remain there. If new transitional search metadata is necessary, place it in a versioned/namespaced section and make the new API preserve unknown keys; do not store Query Source, Map or Timeline profiles there.

### Do not build a Query-Source-only `sysRecords` subsystem now

Query Source is an excellent first **pilot entity** for the future `sys` domain because it has little compatibility burden. It is not, however, a reason to implement a one-off Query Source CRUD stack in `sysRecords` before Explorer can be demonstrated.

The real prerequisite is a generic system-domain foundation:

- schema creation and upgrades for `sysRecords/sysDetails`;
- system record-type/property definitions;
- common read/search/write/delete services;
- validation, ownership, visibility and group permissions;
- cross-domain links and domain-qualified identity;
- migration and compatibility rules.

The HST project contains useful generic record-model, persistence and repository work, but importing it is a broader integration task rather than a small Query Source patch. Continue using the existing Query Source presentation service and legacy record editor until the generic foundation is ready.

### Later route: staged option C

Option C is the target migration, not the immediate Explorer dependency:

1. Implement and test generic `sys` CRUD/search with Query Source as the pilot.
2. Define a future system type such as `QueryDefinition` or `PresentationSource`; avoid using the client term `DataSource` for the stored entity.
3. Import Query Sources first, with stable old-to-new identity mapping.
4. Import Saved Filters into a system search-definition type while `/sys/filter` continues to expose the same contract.
5. Migrate MapSource only with a compatibility adapter because existing MapLayers and projects reference it.
6. Use dual-read or explicit fallback during a release window; choose one authoritative write store at each stage rather than uncontrolled dual-write.
7. Retire legacy tables only after references, permissions and legacy UI behavior are verified.

## Decision summary

| Question | Decision |
| --- | --- |
| Keep Saved Filters without legacy client calls? | Use stable `/sys/filter` CRUD backed temporarily by a legacy-table adapter. |
| Develop Query Source in `sysRecords` now? | No, not as an Explorer prerequisite or Query-Source-only implementation. Later use Query Source to pilot generic `sys` CRUD. |
| Does DataSource duplicate Saved Filter/Query Source? | It is a resolved runtime snapshot, not a persistent duplicate. Keep reference, request and presentation profile distinct. |
| Option A | Reject for presentation fields. |
| Option B | Use now as a controlled compatibility phase. |
| Option C | Adopt later as a staged migration after generic system-domain infrastructure exists. |

## Consequence for the Explorer plans

Before implementing Phase 1, refine `DataSource.js` so persistent identity/provenance is separated from the executable request. Continue accepting current objects through a compatibility normalizer. The remaining workflow remains valid: all producers resolve to a DataSource, `ExplorerApplication.activateDataSource()` activates it, and `SyncEngine` distributes it. Saved Filter CRUD should be implemented through the stable system-resource API, while Query Source (MapSource) migration must not block History, Favorites, Record Type filtering or Workspace.
