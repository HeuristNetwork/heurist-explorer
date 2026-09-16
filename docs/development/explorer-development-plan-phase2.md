# HEURIST-EXPLORER Development Plan — Phase 2

## Purpose

`explorer-development-plan.md`, `datasource-workflow.md` and
`saved-filters-query-sources-and-datasources.md` established the DataSource
identity model (`reference`/`request`/`presentation`), the single
`activateDataSource()` gateway, and History/Favorites/Workspace as reference
stores. That groundwork is largely built: `DataSource.js`, `SyncEngine`,
`DataSourceHistory`, `DataSourceFavorites`, `ExplorerWorkspace`,
`QuerySourceManager` and `SavedFilterManager` all exist and match the shapes
those docs specified. `FilterProvider` (the planned `/sys/filter` OpenAPI
write client) does **not** exist yet — Saved Filter creation still goes
through the legacy `hostBridge.editSavedFilter()` popup (see §0.2).

This document plans the five features Artem specified next (numbered 1–5
below, matching his brief) on top of that foundation, and records why each
recommendation was chosen. Items 6–9 (Report editor, Action dashboard, Export
dashboard, Crosstabs/Chart analysis) are parked in §7 only — no design here,
per instruction.

Two concrete defects surfaced during research; both block or undermine Tasks
1 and 2 and should be fixed first, independent of everything else.

---

## 0. Prerequisites — fix before or alongside Task 1/2

### 0.1 `editFieldset` / `selectFieldset` bridge name mismatch (bug)

`apps/data/src/host/HeuristDataHostAdapter.js:264-268` calls
`this.bridge.editFieldset(context)` and throws if it's missing. But the two
places that actually construct Data's bridge when it runs under Explorer —
`ExplorerApplication.js:819` and `IframeModuleAdapter.js:118` — expose the
method as **`selectFieldset`**, not `editFieldset`. So today,
`DataApplication.requestPickFields()` (the "Pick fields" / column-selection
action) **throws "Fieldset editor is unavailable from this host"** any time
Data runs inside Explorer, iframe or direct. It presumably only works when
Data is hosted directly by the legacy PHP page, which supplies its bridge
object under the `editFieldset` name matching `HeuristDataHostAdapter`'s own
expectation.

Fix: rename one side to match the other. Recommend keeping **`editFieldset`**
(it reads better next to `editRules`, `editExtent`) and renaming the
Explorer-side occurrences (`ExplorerApplication.js:819`,
`IframeModuleAdapter.js:118`, plus their tests) from `selectFieldset` to
`editFieldset`. This is a one-file-pair rename, not a redesign — but it must
land before Task 2 adds *more* bridge calls of this shape (`editGeoFields`,
`editTimeFields`), or the same mismatch will simply be copied three more
times.

### 0.2 `h-recordlist-source-actions` is duplicated, not shared

The "Add to workspace / Save as Filter / Save as Source" button row is
implemented **twice** inside `apps/data`, independently:

- `apps/data/src/widgets/HRecordList.js:207-256` — class
  `h-recordlist-source-actions`, list/card view.
- `apps/data/src/engine/datatables/DataTablesAdapter.js:209-` — class
  `heurist-data-source-actions`, DataTables (table) view.

Same three buttons, same icons, same `data-source-action` dispatch
convention, different class name, written twice. This is exactly the
"ditto for Datatable" duplication Artem flagged in 1b, and it is the reason
Task 1 cannot be answered as a small tweak to one file — see §1.

---

## 1. HFilter bound within heurist-data (Minified HFilter)

### 1a — a compact query panel between `.heurist-source-header` and the record list

**Current state.** `.heurist-source-header` is a shared *CSS class*
(`shared/src/ui/heurist-module.css:83-96`) but **not** a shared *component*:
Data (`DataControlPanel.js` / `HRecordList.js`), Graph (`GraphControlPanel.js`)
and the shared `DocumentControlPanel.js` (used by Map/Timeline) each build
their own `div.heurist-source-header` independently, all doing the same
thing — a title strip showing the active dataset/filtered-result caption.
Explorer's own chrome has **no** `.heurist-source-header` at all; it is
exclusively a presentation-module concept. That matters for 2d and 5 below:
it is currently the *only* place in the whole client where "what source is
active" is shown to the user at all.

Below that caption strip, Data's record-list toolbar carries the source
*actions* (§0.2), but there is nowhere for the user to **type or edit a
query** unless Explorer's own `HFilter` (in the left rail) is present. Per
`docs/integration.md`, the same Data bundle runs standalone, legacy-hosted,
Explorer-hosted, website and published — and in every mode except
Explorer-hosted, there is today no query input surface at all. That is the
actual reason this task exists, more than convenience inside Explorer: a
Data instance embedded in a website/publication has no Explorer shell to
supply a query box.

**Constraint.** `HFilter.js` lives under `apps/explorer/src/widgets/filter/`
and imports `apps/explorer/src/core/DataSource.js` and
`SavedFilterManager.js` directly. Per `CLAUDE.md`, *"No directory under
`apps/` may import a sibling application,"* so Data cannot import Explorer's
`HFilter` — not even the minified case. Per `architecture.md`'s migration
policy, premature `shared/` extraction is explicitly discouraged until a
common contract is proven for two real consumers. So the correct move is a
**new, small, app-local widget in `apps/data`**, not a reuse of Explorer's
`HFilter` and not a rushed `shared/` extraction.

**Recommendation.**

1. New `apps/data/src/widgets/HMiniFilter.js`: a single-line query input +
   Filter button + result count, modeled on the ~80 lines of `HFilter`'s
   `executeDirectQuery()`/`_count()` (same `/records?detail=count` contract)
   — not the Filter Builder, not saved-filter management, not the
   inline-helper/sentence readout. Keep it deliberately smaller than
   `HFilter`; the two are allowed to diverge (this is exactly the "app-local
   duplication is fine until a contract is proven" case the migration policy
   describes — do **not** try to unify them yet).
2. Render mode is run-mode-dependent, not a single on/off flag:
   - **Standalone / direct / website / published** (no richer host): visible
     and authoritative. `HMiniFilter` resolves and executes locally exactly
     like `HFilter.executeDirectQuery()` does today, and calls
     `DataApplication`'s existing DataSource-adoption path (the same one
     `setDataSource()` already uses) directly — there is no Explorer to
     defer to.
   - **Explorer-hosted** (iframe or direct-mount): collapsed by default.
     Explorer's `HFilter` remains the single query-editing surface and single
     `activateDataSource()` gateway per `datasource-workflow.md`; an
     always-visible second, independently-editable query box inside Data
     would recreate exactly the two-sources-of-truth problem `SyncEngine`
     exists to prevent. Give it a one-click "quick edit" affordance (expand
     the collapsed strip) for convenience, but on submit it must **not**
     resolve+publish its own DataSource — it must call a new host-bridge
     method (§1c) so Explorer stays the gateway and the result still flows
     through `DataSourceHistory`.
   - This mode switch is a `getCapabilities()`-style check, matching how
     `editRules`/`saveDatasourceAsSource` availability is already detected —
     no new pattern needed, reuse the existing one.
3. New host bridge method: `requestDataSourceFromQuery(request)` (name
   negotiable) on `HeuristDataHostAdapter`, wired through
   `IframeModuleAdapter`/`ExplorerApplication._hostActions()` exactly like
   `saveDatasourceAsFilter`/`saveDatasourceAsSource` already are. Explorer's
   implementation: validate/count, `normalizeDataSource()`,
   `activateDataSource()`. This is the one genuinely new piece of wiring
   this task needs; everything else reuses existing contracts.

### 1b — move `h-recordlist-source-actions` into the new panel? (and Datatable)

**Yes, but not literally "into HMiniFilter."** The right target is a single
band that both engines share, owned by `DataApplication`/`DataControlPanel`
once, not per-engine. Concretely:

- Delete the two independent `_createDataSourceActions()` implementations in
  `HRecordList.js` and `DataTablesAdapter.js` (§0.2).
- `DataControlPanel` renders **one** source band per Data instance,
  containing, top to bottom: the existing `.heurist-source-header` caption →
  the new `HMiniFilter` query strip → the (now single, shared) source-actions
  row (workspace / save-filter / save-source). This literally answers 1a's
  "between `heurist-source-header` and `h-recordlist`" placement, and 1b's
  question, with one refactor: the actions row moves out of each rendering
  engine and becomes chrome owned by `DataControlPanel`, which already sits
  above both engines regardless of which one is active.
- This does not violate the "presentation-engine dependencies stay app-local"
  boundary — the source-actions row has no DataTables/engine-specific code in
  it today (compare the two implementations: identical besides the class
  name), it was just copy-pasted into each engine instead of hoisted to the
  control panel that already wraps both.

### 1c — recommended sequencing

1. Fix §0.1 (bridge rename) and §0.2 (de-duplicate source-actions into
   `DataControlPanel`) first — both are safe, mechanical, and unblock the
   rest.
2. Build `HMiniFilter` + the `requestDataSourceFromQuery` bridge.
3. Wire run-mode detection (standalone-authoritative vs.
   Explorer-hosted-collapsed).

---

## 2. Edit Query Source (Extended HFilter)

### Grounding: this was already scoped, just not built

`saved-filters-query-sources-and-datasources.md` §1 already defines exactly the
fields Artem lists in 2b, as the "presentation profile" of an
`RT_QUERY_SOURCE` record:

| Profile | Fields |
|---|---|
| Data | field paths, column/export fieldset |
| Map | geo field paths, viewport querying, min/max zoom |
| Timeline | date/time field paths |
| Graph | initial links, expansion rules |
| Parameterized filter | structure for `HFilterForm` |

`DataSource.presentation` already reserves `{data, map, graph, timeline,
filterForm}` slots for exactly this (`DataSource.js:25`), and
`QuerySourceManager.resolveDataSource()` already *reads* `fields`, `map`
(`geoFields`/`dynamicRequests`/`minZoom`/`maxZoom`), `timefields` and `rules`
from `/records/querysource/{id}`. Task 2 is therefore "build the editor for a
data shape the architecture already committed to," not a new design — which
also means the field-path notation (`10:lt234:12:38`) and the four editors
Artem names map onto existing bridge patterns almost directly:

| Field group | Bridge to (re)use | Status |
|---|---|---|
| ExpansionRules | `editRules` (Graph host adapter, `describeRules` companion) | **exists** |
| ColumnFields / FieldSet | `editFieldset` | **exists, but broken — see §0.1** |
| GeoFields (viewport, zoom) | `editGeoFields` — new | **does not exist** |
| TimeFields | `editTimeFields` — new | **does not exist** |

### 2a — Saved Filter vs. Query Source: nudge, don't gate

Artem's framing ("we allow... however we encourage...") should not become a
hard block — Saved Filter remains the right choice for a pure search with no
presentation state, and forcing every save through the heavier Query Source
form would be friction for the common case. Recommendation:

- Keep "Save for re-use" (→ Saved Filter) and "Save as Source" (→ Query
  Source) as two visible actions, as today.
- Add one **soft nudge**: when "Save for re-use" is invoked and the active
  DataSource already carries non-empty `presentation.map`/`timeline`/`graph`
  state (e.g. the user has been looking at this result on the map, or
  expansion rules are set), show a one-line inline note — *"This search also
  has map/expansion settings. Save as a Query Source to keep them?"* — with a
  button that redirects into the Query Source form instead. Don't block the
  plain save; a Saved Filter that silently drops presentation state the user
  never asked to keep is fine.
- This requires no new persistence logic, only reading state that already
  exists on the active DataSource before deciding which save path to
  suggest.

### 2b — inline compact edit form vs. opening the record editor: build the inline form

Recommend the **compact inline form**, not "open the legacy record editor
prefilled." Reasons:

- The legacy generic record editor knows nothing about field-path notation,
  query-source semantics, or the four specialized pickers — building it
  there means teaching the legacy editor about explorer-specific detail
  types, which cuts against the whole point of this repository being
  independent from legacy edit surfaces.
- The bridge pattern already used for `editRules`/`editFieldset` is
  purpose-built for exactly this: "delegate one focused picker to the host,
  get a resolved value back, keep composing it client-side." Two more
  bridges of the same shape (`editGeoFields`, `editTimeFields`) complete the
  set without inventing a new integration mechanism.
- A single `QuerySourceEditor` panel (new, `apps/explorer/src/widgets/filter/QuerySourceEditor.js`
  or similar) composes: title/note fields (plain inputs) + the query box
  (reuse `HFilter`'s query textarea rendering, not a new query editor) + four
  "Edit…" buttons, one per profile, each delegating to its bridge and storing
  the returned value locally until Save.
- **Create vs. update.** Today `saveDatasourceAsSource(source, options)`
  only supports "create," matching Artem's "at the moment only add new
  record w/o transfer data" observation — confirmed: Explorer's Query
  Sources panel (`ExplorerControlPanel._buildQuerySourcesPanel()`) has only
  a favorite-star and a select action, no edit entry point at all.
  Recommend extending the bridge contract to `saveDatasourceAsSource(source,
  { id, ...options })`: when `id` is present, the host updates the existing
  `RT_QUERY_SOURCE` record instead of creating a new one. `QuerySourceEditor`
  seeds itself via `QuerySourceManager.resolveDataSource(id)` (already
  returns the full presentation profile) when editing, or an empty
  DataSource-shaped object when creating.

### 2c — cosmetics: time/map/extension markers per DataSource

Cheap to compute **once a source is resolved** — `presentation.map.geoFields`,
`presentation.timeline.fields`, and any populated extra `presentation` keys
already tell you which icons apply (`dataSourcePresentation()` helper already
exists for this). The open problem is the **list view**, before resolution:
`QuerySourceManager.list()` only has `{id, title}` from the lightweight
`/records/` listing query, not the presentation profile, so today there is no
cheap way to badge a row without resolving every source up front (one
`/records/querysource/{id}` call each — too expensive for a list).

Recommendation: extend the *server* list response (or add fields to the
existing list query) with a small enrichment — booleans/flags for
`hasGeoFields`/`hasTimeFields`/`hasExpansionRules`/`hasFilterForm` — computed
once server-side from the record's detail fields, rather than resolving N
full profiles client-side. This is a server change; flag it as a dependency
rather than deferring the whole feature, since client-side pre-resolution of
every listed source does not scale and will feel slow the moment there are
more than a handful of Query Sources.

Show the same markers in the Workspace list (`ExplorerWorkspace` entries
already carry `presentation` alongside the referenced DataSource, so no
server change is needed there — only in the pre-resolution list case).

### 2d — prominently show "current DataSource is based on a Query Source"

Since Explorer itself has no source-identity chrome of its own (§1a), the
only real estate that already exists everywhere is `.heurist-source-header`.
Recommend: when `dataSource.reference.type === 'source'`, prefix the caption
text built by each control panel's `updateSourceHeader()`-equivalent with a
small database icon + "Query Source" label (already have
`fa-solid fa-database`, used elsewhere for the same reference type). Once
§2c's marker computation exists, reuse the same icon set here so "this is a
Query Source" and "this Query Source has map/time/rules" read as one
consistent icon language across list rows, workspace entries and the active
caption.

This is also the strongest argument for finally consolidating
`.heurist-source-header` into one shared component (§0.2 already forces the
same conclusion for source-actions) — four independent copies of "prefix the
caption with a badge" is a worse outcome than fixing it once.

---

## 3. Parameterized filter — HFilterForm (faceted search)

### This is already designed, just not built — and it already has a name: M9

`docs/development/query-language-filter-builder-plan.md` §11 (M9) already
specifies exactly this: `$NAME$` wildcard tokens in the Filter Builder,
`HFilterFormEditor` to mark them up, `HFilterForm` as the runtime entry form,
`paramForm` stored beside `query` in the saved filter/Query Source. Today
`HFilterForm.js` is a deliberate stub waiting for that schema, and
`SavedFilterManager` already classifies filters as `'simple'` vs.
`'parametrized'` (`inferFilterKind()`), so the data-model fork already
exists in code, just unused. **Do not redesign the authoring side here** —
adopt M9 as written. This section covers what M9's plan doc does not:
avoiding UI clutter, and facet-count calculation.

### How to avoid two parallel UIs (Artem's stated challenge)

Recommendation: **one widget, mode-switched by the active DataSource, not
two separate surfaces.**

- `HFilter` (Explorer) / `HMiniFilter` (Data, §1) check
  `dataSource.presentation.filterForm`. When it's non-null, render
  `HFilterForm` instead of the raw query textarea and collapse the textarea
  behind a small "Show query" toggle. When it's null, behave exactly as
  today.
- **Explorer** keeps the toggle — it's the authoring/power-user surface, so
  both paths (i: type/build a query directly, ii: fill a parametrized form)
  must stay reachable from the same place, per Artem's requirement. The
  toggle is the entire answer to "without cluttering the UI": the two modes
  are mutually exclusive per DataSource, so nothing is ever shown twice.
- **Publication/website mode** never renders the toggle at all — bootstrap
  config forces form-only when `filterForm` is present, and there is no
  query box in that run mode in the first place (§1a already established
  Data has no query surface unless one is explicitly enabled). This matches
  Artem's own framing directly: *"rather impossible that end-user will be
  allowed to enter queries... in publication mode."*
- Net UI cost: one toggle button, reusing a mode that already exists
  structurally (`presentation.filterForm` null vs. non-null) rather than a
  new picker or a second panel.

### Facet-count calculation

Do **not** port `search_faceted.js` (≈4600 lines, tightly coupled to the
legacy `HRecordSet`/jQuery-UI stack, per-facet nested-linked-query
construction). Its one genuinely reusable idea is worth keeping: compute one
count per remaining facet, using the *other* currently-chosen parameter
values as constraints, and cache per (facet, other-params) to avoid redundant
requests when the user is stepping through a form.

Recommendation: a small new `FacetCounter` utility (`apps/explorer/src/utils/`
or a shared `HFilterForm` helper) that:

1. Takes the parametrized query template + the `$NAME$` token list (already
   produced by M9's builder) + current partial form values.
2. For each unfilled `$NAME$` slot, issues one `/records?detail=count`
   request (the same modern endpoint `HFilter._count()` already uses) with
   every *other* currently-set parameter substituted in and the target slot
   left as a broad "any value" constraint (or, for enum-valued fields,
   grouped-by-term counts if/when the API supports it — flag as a possible
   API gap, not assumed to exist today).
3. Debounces on value change and caches by a hash of "other params + facet
   field", matching legacy's own optimization but against the modern count
   endpoint instead of legacy's nested-query trick.

This is simpler than the legacy widget precisely because `$NAME$` slots are
flat and named, unlike legacy's free-form facet definitions — no separate
facet-definition language needs to be invented.

### Translating the old format

Legacy facet configs encode widget type (slider/histogram/dropdown) per
facet, which maps onto `HFilterForm` field renderers once M9's `paramForm`
schema is final. Recommend treating this as a **follow-on, one-time
migration task**, not part of the M9/HFilterForm build itself — the target
schema has to exist first. Keep it in the backlog rather than blocking Task
3 on it.

---

## 4. RecordView

**Status: implemented.** `apps/recordview` exists as the sixth application,
wired into Explorer's East pane via the right-rail toggle. Two details below
were decided differently than this section originally sketched:

- The render-engine option is named `'legacy'`, not `'legacy-php'` as
  proposed below.
- Both `legacy` and `smarty` render in an `<iframe src="...">` pointed at
  the confirmed URL contracts, not fetched and injected — RecordView never
  fetches record HTML itself for these two engines, only builds the URL.

### Agree: a separate module, not a panel bolted onto Explorer

The requirement — usable standalone, combined with any presentation module,
or embedded in Explorer as a side panel — is exactly the shape every other
presentation module here already has (own bootstrap, direct + iframe hosting,
public API, host adapter). Recommend a **sixth application**,
`apps/recordview/`, following the established pattern (own
`src/core/RecordViewApplication.js`, `src/host/HeuristRecordViewHostAdapter.js`
+ `HeuristRecordViewPublicApi.js`, own `style.css`/localization/tests, own
`npm run dev:recordview` / `build:recordview`). This is a repository-structure
change (new build target, new entry in `README.md`/`architecture.md`'s
application list) and should be confirmed explicitly before starting, since
it changes `npm run build:all`'s scope and the "five independently built
applications" line in `CLAUDE.md`/`README.md`.

### Integration: reuse selection sync, not a new mechanism

RecordView consumes a **selected record id**, not a DataSource/request — it
should register as a module with `SyncEngine` exactly like Map/Graph/Timeline
already do, implementing `setSelection(ids)` (already the existing selection
propagation contract — see `datasource-workflow.md` §"Selection workflow")
and rendering the primary/first selected id, with an explicit empty state for
zero or an explicit "N selected — showing first" for multiple. No new sync
mechanism is needed.

### Render engine selection

Confirmed legacy contracts (`c:\xampp\htdocs\heurist\viewers\record\renderRecordData.php`):

- **Default PHP viewer**: `renderRecordData.php?db=<db>&recID=<id>&lang=<lang>&noheader=1[&mapPopup=1]` — accepts `ids` (plural), `ll` (layout name), `hideImages`, `fontsize`, etc.
- **Smarty report template**: a distinct contract, `?snippet=1&q=ids:<id>&db=<db>&template=<name>` (seen in `resultList.js`'s "expand details" branch) — lets a site admin substitute a custom report for the generic viewer.

Recommend a `renderMode` option on RecordView (not on `DataSource` — this is
about *which record*, not *which query*): `'builtin' | 'legacy-php' |
'smarty:<template>'`.

- `builtin` — a new, simple, in-repo renderer using the definitions already
  loaded via `HDbDefs` (no PHP round-trip, embeds cleanly inline in
  Explorer's own panel, no iframe-in-iframe). Start here; it covers the
  common "show me this record's fields" case without carrying the legacy
  viewer's caching/media/print concerns.
- `legacy-php` / `smarty:<template>` — both are iframe-hosted against the
  confirmed URL contracts above, for full-fidelity/custom-report parity with
  the legacy system. These are a thin `IframeModuleAdapter`-style wrapper,
  not new server work.

---

## 5. Subsets

### No prior art — this is a genuinely new concept

Confirmed: Explorer's "Subsets" left-rail entry is a placeholder
(`ExplorerControlPanel.js:503-505`); legacy `HRecordSet.getSubSet*()` methods
subset an *already-fetched, in-memory* record set (client-side filtering of
loaded results) and have nothing to do with scoping future server searches;
`data.showing_subset` in legacy `search.js` flags a capped/truncated result,
an unrelated concept. There is no "make the current result the scope for all
following searches" feature anywhere to build on.

### Model it as session state that modifies future requests, not as a new DataSource kind

A Subset is not itself something you search *for* — it's a constraint
applied to every future search, closer in spirit to `ExplorerWorkspace` than
to a Saved Filter. Recommend a new `ActiveSubset` store
(`apps/explorer/src/core/ActiveSubset.js`), following the same constructor
shape as `DataSourceHistory`/`ExplorerWorkspace`, holding **at most one**
active subset:

```js
{
  key,
  title,
  scope: { ids: [...] },   // resolved id list — always present once active
  origin: { query, title }, // optional: the query/name that produced it, for display/refresh
  activatedAt
}
```

### ids list vs. query+name: use both, for different jobs — resolve to ids at activation time

Artem's instinct ("keep either list of ids... or current query with
human-readable name") is really two separate requirements, not a choice:

- **Execution** needs something cheap and mechanical to AND onto every
  subsequent request. `DataSource.js`'s own `legacyRequest()` already
  forwards a `request.ids` field end to end — there is nothing new to invent
  here. So: resolve the subset to a concrete id list **once, at activation
  time** (one `/records` fetch, capped at a sane limit — matches Artem's "it
  is small" framing) and store `scope.ids`.
- **Display/provenance** needs the human-readable query + name so the UI
  chip and the Subsets management panel mean something to the user, and so a
  "Refresh subset" action can re-run the original query later if the
  underlying data changed. Store this as `origin`, informational only — it
  is never used for execution, only for label + optional refresh.
- This avoids two failure modes: re-running the subset's own query as part
  of *every* subsequent search (slow, and semantically wrong once the
  underlying data has moved on from when the subset was captured), and
  losing the ability to show/refresh a meaningful label if only raw ids were
  kept.

### Activation mechanic

`ExplorerApplication.activateDataSource()` is already the single gateway
(`datasource-workflow.md`). Extend it: when `ActiveSubset` is non-null, AND
`scope.ids` into the outgoing `request` (`request.ids` intersected with, or
appended alongside, whatever the new DataSource's own `request.ids`/`filter`
already specifies) before it reaches `SyncEngine.setDataSource()`. This is a
single, centralized change in the one place all requests already flow
through — no per-module changes needed, and it composes with any DataSource
type (query, filter, source) uniformly.

### Prominent marking

Two places, both already established by earlier sections:

- A persistent chip in the `.heurist-source-header` band (§1a/§2d) whenever
  `ActiveSubset` is non-null — e.g. a red "Subset: `<title>` ✕" pill with a
  one-click clear — visible in every presentation module simultaneously
  because that header already renders everywhere, once consolidated (§0.2).
- The Subsets left-rail panel (already has a button, currently a
  placeholder) becomes the management UI: shows the current active subset
  (if any), recent subset history, "create from current result" and "clear
  subset" actions — mirroring the existing Workspace panel's own list
  pattern rather than inventing new list UI conventions.

---

## 6. Cross-cutting: `.heurist-source-header` deserves to become one component

Independently, Tasks 1, 2 and 5 each land on the same header band:

- Task 1 needs to insert `HMiniFilter` + de-duplicate source-actions there.
- Task 2 needs to badge it with the Query Source marker.
- Task 5 needs to badge it with the active-subset chip.

Doing this three times across Data/Graph/(shared)Map-Timeline, as the current
code already does for the plain caption, compounds the existing duplication
rather than fixing it. Recommend treating "extract a shared
`SourceHeaderPanel`/`SourceBand` component" as an explicit Phase-0-adjacent
task, satisfying `architecture.md`'s bar for shared extraction ("explicit
common contracts plus passing tests for both consumers") since by the time
Task 2 lands there will be three real, near-identical consumers (Data, Graph,
and the existing shared `DocumentControlPanel` user for Map/Timeline) instead
of the "not yet proven" state the migration policy was written to guard
against.

## 7. Sequencing

1. §0.1 bridge rename, §0.2 source-actions de-duplication — mechanical,
   unblocks everything else.
2. §6 `SourceBand` extraction — do this once, before badging it three
   separate times in Tasks 1/2/5.
3. Task 1 (`HMiniFilter` + `requestDataSourceFromQuery` bridge).
4. Task 2 (`editGeoFields`/`editTimeFields` bridges + `QuerySourceEditor` +
   create/update `saveDatasourceAsSource` + marker cosmetics — §2c's server
   enrichment can trail slightly behind the client work).
5. Task 3 (`HFilterForm` per M9, mode-switch toggle, `FacetCounter`) — can
   proceed in parallel with Task 2; only shares the `filterForm` presentation
   slot conceptually, no code dependency.
6. Task 5 (`ActiveSubset` + activation-time AND-in) — depends on §6 for the
   chip surface but not on Tasks 1–3 otherwise.
7. Task 4 (RecordView) — independent of 1/2/3/5; the only dependency is the
   go-ahead to add a sixth application to the repo (see §4).

## 8. Open decisions (need Artem's call, not assumed above)

- ~~Confirm adding `apps/recordview` as a sixth build target (§4)~~ — done;
  `apps/recordview` is implemented, and `README.md`/`architecture.md`/
  `npm run build:all` are updated.
- Confirm the `SourceBand` shared-extraction proposal (§6) rather than a
  fourth app-local duplication.
- §2c server enrichment (list-level marker flags) needs sign-off as a server
  task, not just client work.
- Bridge method names used above (`requestDataSourceFromQuery`,
  `editGeoFields`, `editTimeFields`) are placeholders — confirm or rename
  before implementation, consistent with `docs/integration.md`'s change-rule
  that bridge contracts are updated deliberately (`shared/src/contracts` or
  `shared/src/host` → host adapter → public API → legacy wrapper).

---

## 9. Parking lot (no design — for later)

6. Report editor
7. Action dashboard
8. Export dashboard
9. Crosstabs/Chart analysis

Both client and server work are expected for these; out of scope until 1–5
land.
