# Heurist client architecture

## Repository purpose

This repository unifies maintenance and builds without merging the runtime
applications. Explorer, Data, Graph, Map and Timeline remain autonomous programs.
Each owns its bootstrap, application object, engine adapter, host adapter, public
API, styles, localization and tests.

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
```

Imports between sibling application directories are forbidden. In particular,
Explorer does not import MapApplication, DataApplication, GraphApplication or
TimelineApplication. It creates module iframes through `IframeModuleAdapter` and
uses their public APIs through the host bridge.

## Host boundaries

There are two explicit communication boundaries:

1. Legacy Heurist or a standalone page provides bootstrap state and a host bridge
   to an application.
2. Explorer communicates with presentation-module iframes through the same public
   host-bridge vocabulary.

Presentation modules never call Explorer internals. They may emit public events or
request host actions. Explorer owns DataSource activation, workspace state, layout
and cross-module selection synchronization.

## Application ownership

### Explorer

Owns DataSource identity and activation, history, favorites, workspace, layout,
search/filter UI and synchronization. `SyncEngine` distributes state while
preventing event echoes. `IframeModuleAdapter` is the only inner-frame integration
layer.

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

