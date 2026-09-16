# Heurist client integration and distribution

## Integration principle

Repository consolidation does not create direct runtime coupling. Hosts interact
with each application through its public API, and applications communicate with
their host through `HostAdapter`/host-bridge methods and public events.

Legacy jQuery wrappers remain in the legacy `heurist-client` repository. They load
the distributions produced here and translate legacy events into the public bridge
contract. They must not access application or engine internals.

## Public surfaces

| Application | Public API | Browser global |
| --- | --- | --- |
| Explorer | `HeuristExplorerPublicApi` | `heuristExplorer` |
| Data | `HeuristDataPublicApi` | `heuristData` |
| Graph | `HeuristGraphPublicApi` | `heuristGraph` |
| Map | `HeuristMapPublicApi` | `heuristMap` |
| Timeline | `HeuristTimelinePublicApi` | `heuristTimeline` |
| Record View | `HeuristRecordViewPublicApi` | `heuristRecordview` |

Explorer's iframe and direct adapters talk only to these public surfaces.
DataSource, selection and collection synchronization must not bypass them.

## Run modes

The same application source supports standalone, legacy-hosted, Explorer-hosted,
website and published contexts. Differences belong in bootstrap values and host
adapters, not parallel application implementations.

Explorer hosts Data directly by default. Set `runtime.moduleModes.data` to
`"iframe"` to use the previous mode. A layout definition may override this with
its own `mode`. `runtime.moduleAssetUrls.data` may override the Data bundle base
used for localization and the Data manual; its default is
`hclient/bundles/heurist-data` below the configured Heurist base URL.

## Distribution workflow

Build a single module with `npm run build:<target>` or all modules with
`npm run build:all`. Each target produces a self-contained directory under
`dist/`. There are no cross-target chunks.

Deploy with `npm run deploy:<target>`. `HEURIST_CLIENT_DIST_ROOT` may specify the
legacy Heurist bundle root; otherwise the existing Windows development default is
used. Deployment stages the new directory before replacing the prior bundle.

Expected destinations are:

```text
hclient/bundles/heurist-explorer/
hclient/bundles/heurist-data/
hclient/bundles/heurist-graph/
hclient/bundles/heurist-map/
hclient/bundles/heurist-timeline/
hclient/bundles/heurist-recordview/
```

## Change rules

When a bridge contract changes:

1. Update `shared/src/contracts` or `shared/src/host`.
2. Update the affected application's host adapter and public API.
3. Update the corresponding legacy wrapper separately.
4. Run the affected module tests, architecture tests and independent build.

Do not solve integration problems by importing one application from another,
reaching through an iframe, exposing native engine objects, or adding environment
branches throughout application code.
