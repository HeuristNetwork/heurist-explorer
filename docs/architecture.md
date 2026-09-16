# Heurist client architecture

## Repository purpose

This repository unifies maintenance and builds without merging the runtime
applications. Explorer, Data, Graph, Map, Timeline and Record View remain
autonomous programs. Each owns its bootstrap, application object, engine
adapter, host adapter, public API, styles, localization and tests.

`shared/` contains only presentation-neutral facilities: API transport, bootstrap
normalization, host contracts, the host bridge, common UI primitives, i18n and
utilities. It must not import anything from `apps/`.

## Dependency direction

```text
apps/explorer ───────► shared
apps/data ───────────► shared
apps/graph ──────────► shared
apps/map ────────────► shared
apps/timeline ───────► shared
apps/recordview ─────► shared
```

Explorer may import only a presentation application's explicit direct-bootstrap
entry point. It must not import MapApplication, DataApplication, GraphApplication,
TimelineApplication, widgets, engines, or other module internals. Data currently
provides `apps/data/src/direct.js`; the other applications remain iframe-hosted.

## Host boundaries

There are two explicit communication boundaries:

1. Legacy Heurist or a standalone page provides bootstrap state and a host bridge
   to an application.
2. Explorer communicates with directly hosted or iframe-hosted presentation
   modules through the same public API and host-bridge vocabulary.

Presentation modules never call Explorer internals. They may emit public events or
request host actions. Explorer owns DataSource activation, workspace state, layout
and cross-module selection synchronization.

## Application ownership

### Explorer

Owns DataSource identity and activation, history, favorites, workspace, layout,
search/filter UI and synchronization. `SyncEngine` distributes state while
preventing event echoes. `IframeModuleAdapter` and `DirectModuleAdapter` expose
the same adapter surface to Explorer.

### Data

Owns tabular/card/record-list presentation, DataTables integration, dataset and
filter loading, collection operations, field formatting and data configuration.

### Graph

Owns graph documents, expansion rules, graph loading, vis-network rendering,
legend editing and graph configuration.

### Map

Owns map documents and layers, geographic loading, Leaflet rendering, symbology,
thematic maps, drawing, legends, viewport loading and map configuration. Native
Leaflet objects remain behind the map engine adapter.

### Timeline

Owns temporal contexts, `/time` response adaptation, vis.timeline rendering,
uncertain-date presentation and timeline configuration.

### Record View

Owns single-record rendering and its render-engine choice (`builtin`, an
in-repo field/value renderer; `legacy`, the PHP record viewer; `smarty`, a
configured report template — the latter two embedded as an iframe). Record
View owns no DataSource: it only ever fetches the one record it is asked to
display, and it only ever consumes the shared selection (`setSelection`),
never a DataSource push. Selection sync is one-way by default — displaying a
followed selection never re-emits it — with an explicit exception for
following a linked record from within the rendered content.

## CSS and localization

Every application has exactly one application-level `src/style.css`. Component
or widget CSS remains beside its JavaScript implementation. Applications may
import shared design tokens and shared module primitives, but never another
application's stylesheet.

Every application owns `public/assets/localization/localization_eng.txt` and
`localization_fre.txt`. `shared` supplies the loader only and contains no
application-specific dictionary.

## Testing boundary

Each application has an independent `test/` tree. Shared code has `shared/test/`.
Repository-level architecture tests enforce valid imports and independent build
targets. A module test may import its own source and `#shared`, but no sibling app.

## Migration policy

The first consolidation preserves app-local implementations even where Data and
Graph currently contain identical files. Shared extraction is a later refactor and
requires explicit common contracts plus passing tests for both consumers.
