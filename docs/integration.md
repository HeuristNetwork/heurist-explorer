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
| Reports | `HeuristReportsPublicApi` | `heuristReports` |

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
`runtime.moduleAssetUrls.reports` does the same for the reports manager
(default `hclient/bundles/heurist-reports`), which Explorer mounts directly in
its Report tool.

## Website pages (format v4, plan 27a)

A v4 website page is written by the server (`/{db}/site/{id}[/{page id}]`, heurist
`srv/Website/PageRenderer.php`) and loads `hclient/bundles/heurist-website/heurist-website.js`.
The runtime (`apps/website/src/siteRuntime.js`) reads the JSON block `#h-site-config`
(`runtime`, `site` with the menu tree and languages, `instances`) and mounts every host
(`data-h-instance`):

| Instance | Mounted by |
| --- | --- |
| `kind: widget`, `type: menu` | `shared/src/widgets/site/HMenu.js` |
| `kind: module` (`explorer`, `data`, `map`, `timeline`, `graph`, `recordview`) | the module's `src/direct.js`: `mount…({container, bootstrap, assetBaseUrl})` with `bootstrap = {runtime, settings, state}`, `runtime.runtimeMode = 'published'` |
| `"mount": "iframe"` | an iframe on `/{db}/site/{id}[/{page id}]/frame/{instance}`: the module's own page with `window.heuristModuleBootstrap` |

Instances on one page are independent until PageController (plan 27 phase 5). `data-h-control="tabs"`
and `"accordion"` containers become tabs and one-open accordions (`shared/src/widgets/layout/`).

## Publish and the Website manager (plan 27b)

*Publish* in a module writes a standalone v4 page, not a JSON file (the former
`PublicationController` / `?pub_id=` publications are removed). Each module's `publish()`
still builds `{format: 'heurist-publication', options, config, state}`; the shared
`HostAdapter.publish(payload)` asks for the page title and whether to update the page this
module published last (`shared/src/ui/PublishPageDialog.js`, remembered per database in
localStorage), then calls `POST /api/{db}/website/publish` (`shared/src/site/modulePublisher.js`,
`shared/src/api/WebsiteClient.js`). It resolves with `{id, url, title, embed, actions}`, or
`null` when the user cancelled; `PublishedDialog` shows the URL, the embed code and the
`actions`. A bridge with `openWebsiteManager({recordId})` (Explorer) adds a *Website manager*
button.

The Website manager is `apps/website/src/direct.js` → `mountWebsiteManager({container,
bootstrap, bridge, assetBaseUrl})`. Explorer mounts it in its Websites tool; the bridge gives
`editRecord`, `viewRecord`, `canEditRecords`, `getDbDefs` and `captureView()` (*Publish this
view*: Explorer as an `explorer` instance with `settings = {layout, ui, modules}` and
`state = {dataSource, selection}`). A published Explorer reads its configuration from
`settings.ui` and never writes it to the visitor's browser. Endpoints: `/api/{db}/website`
(heurist `srv/Controller/WebsiteController.php`); builds are background jobs of type
`website-build` (a ZIP downloaded with `GET /jobs/{id}/result`).
`runtime.moduleAssetUrls.website` overrides the bundle base of the manager's localization
(default `hclient/bundles/heurist-website`).

## Record editing

Modules ask their host to edit records through the bridge:

- `editRecord(id, {recordType, pageIds})` opens the record; `pageIds` (ordered ids of the list page)
  lets Explorer's editor step through the page.
- `addRecord(recordTypeId)` creates a new record.
- `canEditRecords()` says whether any record can be edited (the legacy host editor).
- `canEditRecordType(recordType)` says whether records of one type can be edited. `recordType`
  is an id or a code name such as `RT_MAP_LAYER`.
- `browseRecords({recordTypes, selectMode})` opens the record manager (plan 21) and resolves
  with the selected record ids, or null when cancelled (`HostAdapter.supportsBrowse()`).

`HostAdapter.supportsEditing(recordType)` uses `canEditRecordType` when the bridge has it, and
`canEditRecords` otherwise.

Explorer edits records of every type in its own record editor for a logged-in user, also
without the legacy host (plan 14; all types since plan 21 Phase 5, 2026-10-19 - until then only the
system types: query sources, map documents, layers and sources, reports and schedules, website home
and pages). Without a login the legacy host editor is used. Explorer's `canEditRecords()` is true
for a logged-in user. Older bridges without `canEditRecordType` keep the old behaviour, so the
legacy wrappers need no change.

## Record editor mode

Explorer can run as the record editor alone (plan 21 §2.4): same bundle and page
(`hclient/modules/explorer/explorerViewer.html`), without the workspace (no Query Source
editor, saved filters, layout or modules).

- **Start**: bootstrap `runtime.runtimeMode: 'editor'` with `state: {recordId}` (edit) or
  `{rectypeId, access}` (new record). A page opened by a link without a bootstrap or bridge
  may use the URL: `explorerViewer.html?db=NAME&mode=editor&recID=151` (or `&rty=12`).
- **Public API** (`window.heuristExplorer`): `ready()`, `open({recordId | rectypeId})`,
  `isDirty()`, `getRecord()`, `close({confirm})`; `mode` is `'editor'`.
- **Messages to the opener**: bridge callbacks `onRecordSaved({record, created})` and
  `onEditorClosed({saved, recordId, record})`, and `postMessage` to the parent frame or the
  opener window: `{source: 'heurist-record-editor', type: 'saved'|'closed', recordId,
  rectypeId, created, saved}` (target origin: the page's own). A window opened with
  `window.open` closes itself after the editor closes.
- **Legacy pages**: `hclient/modules/explorer/recordEditorDialog.js` -
  `HeuristRecordEditor.open({recordId | rectypeId}) → Promise<{saved, recordId, record}>` (a
  jQuery dialog with the iframe and the bridge). Legacy callers of the old editor are not
  switched to it yet.

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
hclient/bundles/heurist-reports/
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
