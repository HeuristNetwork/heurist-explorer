# Explorer publication and website composition

Status: proposed architecture for discussion, 2026-09-22. This document implements the planning deliverable; application changes have not started.

## Required behavior

- Publish Explorer with any selected module instances, including just one, or publish a module independently.
- When `runtimeMode !== 'main'`, Explorer creates neither rail, QuerySourceEditor, nor authoring lists/managers for saved filters, query sources, workspace, favorites and history. Published source definitions and map/timeline workspace snapshots remain usable without these managers.
- Explorer publication configuration selects module instances, available QuerySources/Saved Filters, their presentation, and the initial entry. Capture current effective appearance for each selected instance.
- Individual module publication captures its current DataSource, or current workspace/active MapDoc for map and timeline. It does not inherit Explorer's source menu.
- A website can contain multiple instances of the same module in arbitrary parent elements, with or without Explorer.

## Findings in current code

- `apps/explorer/src/explorerConfig.js` does not expose runtimeMode.
- `ExplorerApplication.initialize()` creates and loads SavedFilterManager and QuerySourceManager, mounts HFilter and ExplorerControlPanel unconditionally. Constructor and action paths also need auditing for authoring state.
- `IframeModuleAdapter` and Explorer host context hard-code main runtime; DirectModuleAdapter inherits the bridge/bootstrap behavior.
- The old Explorer HFilter is a direct-query editor, not the proposed source selector. HFilterForm already lives in shared widgets.
- ExplorerConfigurationDialog currently edits toolbar and layout; HeuristExplorerPublicApi has no publication API.
- SyncEngine already coordinates DataSource, selection and active MapDoc. Extract its reusable behavior rather than introduce a second synchronization implementation.
- Module publication APIs already exist. They need a consistency audit: for example, timeline currently includes an allowed-document query alongside current state.

## Proposed architecture

### Shared HFilter widget

Implement HFilter under shared widgets, with no dependency on Explorer managers. It receives a curated entry list and emits DataSource activation requests. An entry contains a stable key, label, optional group, executable source definition and optional HFilterForm definition/default values.

Support buttons, list and groups; preserve configured ordering; validate that initiallyActive names an included entry. An empty list hides the selector. A single entry may still display its form. Switching entries replaces the form and applies that entry's defaults; later value persistence can be a separate option. Form submissions use the existing parameterized query execution contract.

Explorer owns the authoring picker that builds this list. Runtime HFilter never enumerates the user's saved filters or query sources. Replace the old HFilter and update its imports, sync registration and callers. Preserve any still-required main-mode direct-query entry through its existing authoring workflow; do not silently remove that capability as a side effect.

In Explorer, mount HFilter to the left or above HCardinalLayout. It is not a layout module. For a standalone module, its embedding wrapper can mount the same widget above/beside the module and route activation to that instance. In a website, HFilter may also occupy its own parent element and target a synchronization group. This does not require an HFilter application or a hidden Explorer.

### Page synchronization

Introduce a small shared PageController based on extracted SyncEngine behavior. It owns instance registration and synchronization groups, not layout, preferences, authoring lists or page editing.

- Every mounted instance has a page-unique instanceId, explicit container and independent settings/state.
- Unbound instances stay independent. Explicit group membership enables synchronization.
- Configure DataSource and selection bindings independently; MapDoc propagation is capability-specific. A fixed-source module can receive selection without receiving source changes.
- Use one configured initial source per group, then initialize members from group state as they become ready. Module mount order must not decide the source.
- Include origin instance and revision/request identity to suppress echoes and stale async results. Unregister listeners on destroy.
- Explorer owns a local group by default. Expose an explicit bridge to an external group when needed; avoid registering both Explorer and its children as duplicate recipients.
- Map legacy `search_realm` to group identity through an adapter. Do not use unscoped window events as the state owner. Retain current host bridges; add validated postMessage transport only where cross-origin frames require it.

### Configuration and serialization

Keep runtime context, saved settings and current state distinct. Proposed logical fields (final envelope placement follows the existing publication backend contract):

```js
{
  schemaVersion: 1,
  modules: [{ instanceId, type, settings, state, binding }],
  layout: {}, // Explorer only
  filter: {
    placement: 'left', // or top
    presentation: 'list', // or buttons, groups
    entries: [{ key, label, group, source, form }],
    initiallyActive: null
  },
  groups: [] // website composition, when needed
}
```

Snapshot executable query/form definitions at publication time, retaining original IDs as provenance. Records remain live query results; this is not a frozen record export. Changes to a saved filter do not silently rewrite an existing publication. Snapshot settings from mounted instances, not only stored preferences. Exclude credentials, transient caches and unrelated authoring state. Map/timeline serialization includes only the active document or required workspace sources/layers and their appearance.

The curated list is UI configuration, not a replacement for database access permissions. Validate publication under the intended visitor identity. Missing/inaccessible data produces an explicit unavailable state without falling back to an unrestricted query.

### Website editor

First provide a composition manifest and consistent per-instance configuration API. The website structure tree selects an instance and opens its existing configuration dialog in website mode. HFilter configuration belongs to its wrapper or page widget node, with a visible target instance/group choice. Use draft/apply/cancel so editing one node cannot persist another instance's preferences.

Integrating the Website editor as a Heurist module is a later UI integration, not a prerequisite for publication or embedding. Confirm its existing server persistence and tree APIs before selecting implementation files.

## Delivery sequence and acceptance gates

### 1. Runtime separation

Normalize runtimeMode, propagate it through both adapters and host contexts, separate authoring initialization from viewer initialization, and remove authoring side effects from runtime activation. Viewer activation must not create an unselected data module or write history/favorites/preferences.

Acceptance: main behavior remains intact; each non-main mode renders without either rail or QuerySourceEditor, makes no authoring-list requests, and mounts only configured modules. Explicit main context is required; audit legacy bootstrap callers before changing defaults.

### 2. Shared HFilter and Explorer source configuration

Implement curated entry normalization, the three presentations, initial activation and HFilterForm lifecycle. Add source selection/order/grouping and placement to ExplorerConfigurationDialog. Remove old HFilter after migrating its callers.

Acceptance: only selected entries appear; parameters execute correctly; initial activation happens once; invalid initial keys, empty lists and unavailable sources behave deterministically; no viewer catalog fetch occurs.

### 3. Explorer publication and individual publication audit

Add publication mode and public API, select module instances, capture their effective settings/state and filter configuration, and connect the existing publication backend after checking its Explorer payload support. Preview the resulting viewer configuration before saving. Audit each individual module's serializer, including map/timeline workspace and active MapDoc restoration.

Acceptance: single-module and multi-module round trips preserve appearance and initial content; excluded modules never mount; individual publication contains only its current source context; visitor reload works without author preferences or tokens.

### 4. Independent website instances and bindings

Extract shared synchronization, add PageController and explicit bindings, audit global bootstrap/container/event assumptions, and mount shared HFilter in standalone wrappers. Supply example manifests/pages with two data and two map instances, both independent and grouped.

Acceptance: duplicate module types retain separate settings and containers; groups do not leak events; fixed sources remain fixed; late mounting, remounting and out-of-order query completion work; direct and iframe adapters behave consistently.

### 5. Website editor integration

Connect structure-tree nodes to instance configuration, filter targets and binding controls. Persist and restore the manifest using the existing website save/publish flow.

Acceptance: edit, cancel, save and reload target the correct instance; arbitrary page layout survives; published pages require no authoring editor initialization.

For each stage run focused contract/integration tests and the affected module build. Add browser checks for filter layouts, configuration dialogs and multiple instances. Run complete build/verification at the integration milestone, not for this documentation change.

## Decisions to discuss before dependent implementation

1. Recommended: standalone website modules can host HFilter; individual Publication remains current-source-only. Publishing a source menu uses Explorer publication, even with one module.
2. Recommended: snapshot source/form definitions at publish time, with live records. Live references to subsequently edited saved filters would need an explicit alternative policy.
3. Recommended: shared PageController with explicit groups and optional legacy search_realm adapter; no hidden Explorer.
4. Clarify whether a workspace-derived map/timeline publication includes every workspace source or only layers currently included in that module. Recommended: capture the module's current effective layers, preserving visibility flags.

Start application implementation with stage 1; stages 2–3 complete Explorer publication before website editor integration. Proposed decisions above remain proposals until discussed.
