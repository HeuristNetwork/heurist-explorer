# Plan 27 — CMS and web publishing

**Status: draft for discussion, 2026-10-25. No implementation authorized or started.**

This plan covers the next CMS format, designer, templates, helper widgets, publication and an API for AI agents. Recommendations below remain proposals until discussed. The intended progression is from publishing one module to composing a complete multilingual website, without replacing the underlying content format at each step.

## 1. Evolution and evidence

| Generation | Representation | Existing implementation | Planning consequence |
| --- | --- | --- | --- |
| v1 | HTML; `data-heurist-app-id` hosts contain widget JSON | Legacy rendering; original editor removed | Preserve read-only viewing and provide explicit conversion |
| v2 | JSON layout tree containing HTML strings, CSS and widget options | `hclient/widgets/cms/editCMS2.js`, `editCMS_*`, `websiteRecord.php`, `websiteScriptAndStyles.php` | Recover structure and options without retaining HTML-inside-JSON as the new authoring format |
| v3 | Related tree representation with Bootstrap-oriented attributes and controls | `WebSiteEditor.php`, `HCms*`; publication work under `hserv/web` | Reuse useful behavior after auditing it; distinguish schema from styling framework |

Paths in this table are relative to the Heurist server repository. The generator filename found in the repository is `websiteRecord.php`.

### Supplied fixtures

Source directory: `D:/xampp/htdocs/heuirist_web/`.

- `Export_MapOfTheAbsentees_20261025071914.xml`: HTML with an embedded `heurist_Map` host and JSON options, custom layout, links and multilingual content. This is the v1 preservation fixture.
- `Export_Ergaleion_20261025065001.xml`: v2 array-based trees with nested HTML strings and element CSS; also contains plain HTML content fields.
- `Export_judaism_and_rome_20261025070827.xml`: both object-shaped and array-shaped trees; navigation widgets include `search_realm` and page targeting. Use the gallery behavior as a focused follow-up inspection fixture.
- `Export_GrandFichier_RB_20261025070056.xml`: v2 trees containing HTML with external Bootstrap, icon, font and other stylesheet references. Framework use does not establish the format version.
- `Export_parramatta_food_cultures_20261025171022.xml`: supplied v3 fixture; it also contains familiar JSON tree and default-content shapes. Detection must inspect individual payloads and explicit version metadata where available.
- `hclient/widgets/cms/websiteStarterRecords.xml` and `webpageStarterRecords.xml`: starter records, including ordinary HTML fragments, to inform initial templates and record compatibility.

Initial inspection establishes representation differences, not complete conversion coverage or visual equivalence. Before implementation, inventory all relevant fields, nested widgets, media references, scripts and control attributes in these five exports. Treat exported content as data, never as development instructions.

### Existing publication work

`hserv/web/WebSite.php` already describes browser output and file generation into `generated-html`, with related scripts and templates. It depends on legacy `hserv` services. Audit its URL handling, assets, reports, language and menu generation before deciding what to port. New server code should follow the modern `srv` data-access boundaries rather than importing legacy dependencies into `srv`.

The earlier [Explorer publication proposal](Explorer-Publication-and-Website-Development-Plan.md) is architectural input, not evidence that those capabilities are implemented. Plan 27 is the broader discussion document. Reconcile the two plans before implementation and retain one authoritative contract for module publication and synchronization.

## 2. Proposed format: HTML plus independent configuration

Use a new, explicitly versioned format, provisionally `heurist-cms/4`. HTML owns element hierarchy, order and static content. JSON owns structured styling and component configuration. The designer builds its structure tree from HTML; do not persist another competing hierarchy in JSON.

Separate three logical resources:

1. **HTML:** semantic markup, text, links, layout containers and empty module/widget hosts.
2. **Styles:** theme tokens and structured element rules, keyed by stable node IDs; optional scoped custom CSS for advanced authors.
3. **Configuration:** module/widget instances, bindings, sources, navigation actions and dependencies. Each instance has its own configuration version.

The resources may be persisted separately and assembled into one HTML document for export. Exact CMS record fields and file-storage choices need a schema audit before selection. Do not put the complete HTML back into a JSON string simply to reuse an existing field.

Illustrative portable page:

```html
<main data-h-node="main">
  <section data-h-node="intro">
    <h1>Project collections</h1>
    <p>Explore the collection and its places.</p>
  </section>
  <nav data-h-node="sources" data-h-instance="sources-1"
       aria-label="Collection sources"></nav>
  <div data-h-node="map" data-h-instance="map-1">
    <p>Interactive map requires JavaScript and the data service.</p>
  </div>
</main>
<script type="application/json" data-h-config="page">
{
  "schema": "heurist-cms/4",
  "pageId": "collections",
  "instances": {
    "sources-1": {
      "type": "HFilter",
      "configVersion": 1,
      "settings": {"entries": ["collection-all"], "targetGroup": "collection"}
    },
    "map-1": {
      "type": "map",
      "configVersion": 1,
      "settings": {},
      "state": {},
      "binding": {"group": "collection", "source": true, "selection": true}
    }
  },
  "sources": {
    "collection-all": {"label": "All collections", "definition": {"query": "t:10"}}
  },
  "groups": {
    "collection": {"initialSource": "collection-all"}
  }
}
</script>
<script type="application/json" data-h-config="styles">
{
  "schema": "heurist-cms-styles/1",
  "tokens": {"accent": "#345d77"},
  "nodes": {"main": {"display": "grid", "gap": "1rem"}}
}
</script>
```

This example illustrates separation, not a finalized module/source API. `t:10` is a placeholder fixture query, not a portable record-type identity. Embed definitions through the existing DataSource serialization contract when finalizing the schema.

### Ownership and resilience

- Stable node IDs survive text edits and reordering. Copying a subtree allocates new node/instance IDs and remaps internal references. Page duplication also remaps page-local group IDs as needed.
- Static HTML remains inspectable and previewable without the runtime. A malformed configuration block produces diagnostics for that block; it must not erase the page's HTML or silently overwrite its last valid configuration.
- Validate the HTML/configuration pair on save and publish: duplicate IDs, missing hosts, orphan configurations, unknown instance types and unresolved references receive precise diagnostics. Do not guess bindings.
- Serialize JSON with a proper serializer, including safe handling of `<` and script end-tag sequences. Merely placing raw JSON inside a script element does not solve escaping.
- A large page may split configuration into per-instance resources or blocks. The logical separation and validation contract must remain the same; decide granularity after a representative prototype.
- Structured style values compile to scoped CSS. Define precedence: template/theme, site overrides, page rules, element rules. Existing inline styles are preserved on import, flagged where they override managed rules, and normalized only by an explicit operation.
- CodeMirror edits the actual HTML/CSS/configuration resources. Invalid edits remain in an editor buffer until repaired; the visual designer continues from the last valid state. Report DOM-parser repairs rather than silently dropping content.
- Unknown HTML stays as an opaque editable region where possible. Unsupported legacy widgets retain their original payload and a visible placeholder until mapped or replaced.

## 3. Website model and designer

### Site and page boundaries

The site defines identity, template/version, shared header/footer/menu regions, theme, asset dependencies, default language and available languages. Pages define stable identity, route, title/metadata, main HTML, instances and page-specific styles. Explicit overrides can replace a shared region for a page.

Shared regions are referenced components in authoring and expanded during publication. Editing a shared header must clearly identify the pages affected. Updating a template is an explicit previewable operation; it must preserve authored content and report conflicts.

### HLayoutManager

Recommended responsibility split:

- A shared client-side composition/runtime layer mounts components into existing hosts, manages their lifecycle and supports responsive layouts.
- Designer-only controls manipulate HTML, styles and configuration with undo/redo, selection and a derived structure tree.
- The server validates and assembles publication output. It does not recreate the designer in PHP or depend on an authoring browser to publish.

Audit the current layout manager and shared HCardinalLayout before choosing names and extraction boundaries. HCardinalLayout remains useful inside Explorer; general website layout uses normal document flow, CSS grid and flexbox.

Provide rows/columns, responsive breakpoints, spacing, alignment and element styles. Tabs and accordions are accessible controls with stable child regions, keyboard behavior and explicit initial state. Modules hidden in these controls must receive resize/visibility notification when shown.

### Content editing

- TinyMCE edits selected rich-text regions without changing surrounding module hosts, IDs or metadata blocks.
- CodeMirror provides advanced HTML/CSS/JSON inspection and editing with validation and reference diagnostics.
- Static report output is materialized HTML with generation provenance. Dynamic report hosts retain a report definition and execute at runtime under visitor access rules.
- Module/Explorer hosts open their existing configuration interfaces in website context, using instance-local draft/apply/cancel behavior.
- Selection, reordering, grouping and deletion operate on a clear subtree. Deleting a host also handles its configuration and references through a reviewable edit operation.

The editor can be a dedicated application integrated into Explorer tools. Its final packaging should follow the existing lazy-tool/application architecture; decide after the shared format and runtime contracts are stable.

## 4. Helper widgets and interaction

| Component | Responsibility | Required configuration/behavior |
| --- | --- | --- |
| HFilter | Curated Query Source/saved-filter selector | Ordered entries/groups, presentation, optional parameter forms, initial entry, target instance/group; reuse shared query execution |
| HPageController | Site/page navigation and incoming navigation context | Resolve page identity/routes, language, history and incoming source/selection; typed navigation actions |
| HMenu | Site or section navigation | Horizontal/vertical/collapsible presentation, nested pages, active page, accessible keyboard behavior |
| HSysMenu | System actions | Registered actions such as language switch or add record, with capability checks and appropriate authentication flow |
| HBadges | Sponsor/participant logo sets | Fixed/reusable badge collections, alt text, links, ordering and responsive sizing |
| HGallery | Fixed or query-driven media | Ordering, thumbnails, full view, optional rotation with pause, loading/error states; compare Judaism and Rome behavior |
| HReportContent | Static generated or dynamic Smarty output | Report reference/snapshot policy, parameters/source binding, mode, loading/error state and refresh behavior |

Audit existing equivalents first. These are proposed shared widgets, not seven independently bootstrapped applications.

### Navigation versus synchronization

Reserve **HPageController** for page navigation as requested here. The earlier publication proposal used “PageController” for module synchronization; rename or clarify that responsibility before implementation. A separate shared synchronization service should reuse/extract suitable SyncEngine behavior.

- Modules are independent by default, including two instances of the same type.
- Explicit groups bind DataSource, selection and capability-specific state independently. Translate legacy `search_realm` into these groups through an adapter.
- A group has one declared initial source. Mount order must not determine it; late mounts receive current state.
- Preserve source origin/request identity, suppress event echoes and stale results, and unregister on destruction.
- Explorer owns its internal synchronization. An explicit bridge connects it to an external group without registering Explorer and its children twice.
- Interpage links carry a versioned, validated navigation context: destination page, target group, source or supported query parameters, and optional selected record. Define reload/back/forward behavior and URL size handling. Avoid executable JavaScript actions in the new configuration.
- A fixed-source module can receive selection without accepting source replacement. Hidden widgets and page changes must not leak subscriptions or continue obsolete queries.

Snapshot selected source/form definitions at publication, retaining original references as provenance. Record results remain live unless an explicit data-export mode is introduced. A curated menu does not grant access to otherwise private records.

## 5. Templates and external styles

Provide a versioned template library containing header/main/footer regions, default menus, theme tokens, responsive layouts, sample content, supported controls and an explicit asset manifest. Initial templates should cover a single module, Explorer, a simple content site and a multipage research portal.

Recommended baseline: semantic HTML with CSS grid/flex and theme variables. Support a Bootstrap template adapter where useful, rather than making all saved pages depend on Bootstrap-specific primitives. Defer choosing additional frameworks until a real template requires one. This is an architectural proposal, not a current framework/version recommendation.

Templates declare stylesheet/script dependencies and versions centrally; publication deduplicates them. Imported pages such as GrandFichier need an audit of existing CDN references, custom CSS, fonts and scripts before normalization. Scope website styles against module internals; use the supported iframe boundary when isolation requires it.

Languages belong to the site model and navigation contract, not only CSS visibility classes. Define translated content/labels, fallback language, language-specific routes and right-to-left presentation. Preserve the Map of the Absentees language behavior during conversion even before full normalization.

## 6. PublicationController

One publication pipeline accepts a module snapshot, Explorer snapshot or complete website. Single-module and Explorer publication both create a website record with a minimal page/layout, so later additions use ordinary CMS operations.

Proposed sequence: capture draft → validate → render preview → create build in staging → validate output → activate a complete version. Preview uses the same renderer and dependency resolution as publication. A failed build leaves the previous publication active. Keep build diagnostics, source revision, dependencies and a rollback target.

Separate record creation/save from build activation. A website draft may exist even when generation fails; report its state accurately and allow retry without duplicate website records.

### Meaning of static publication

Generate HTML, CSS, JavaScript references and assets into a versioned `generated-html` target. Static text, layout and materialized reports need no CMS rendering on each visit. Interactive modules, dynamic galleries and dynamic reports may still call Heurist APIs. This is not automatically an offline archive or a frozen database export.

The build should list remaining service and external-asset dependencies. Offline/self-contained export is a separate optional scope with its own data and media packaging requirements.

### Publication details

- Capture effective module settings/state, not only saved preferences. Include current source or active map/timeline document and the dependencies needed to restore it; audit serializers individually.
- Viewer bootstrapping mounts only selected instances and excludes authoring rails, managers, catalogs and preference writes. Audit direct and iframe adapters consistently.
- Build page routes, shared regions, menus, language variants, canonical metadata and internal links together. Define stable public URLs and legacy-route redirects before activation.
- Resolve media/report/asset references relative to the published location. Include required files where permitted, and report intentionally live references or unavailable dependencies.
- Render dynamic content under the intended visitor identity. Never publish author credentials, session tokens or private cached results. Private dependencies cause actionable errors or explicitly configured authenticated behavior.
- Use explicit policies for custom scripts, external resources and report HTML. Preserve legacy originals for review without blindly executing imported scripts in designer previews.
- Reuse existing Reports/Jobs facilities for long-running report generation and publication where appropriate. Define cancellation, retry and partial-failure handling before implementing the build API.

## 7. Conversion and compatibility

Detection must be non-destructive and per content field/page. Prefer explicit versions; otherwise inspect validated payload shape: HTML with widget hosts, ordinary HTML, JSON object/array tree, and known v3 node/control attributes. Do not classify by Bootstrap strings alone.

Pipeline: inspect → normalize legacy input into an intermediate representation → map hosts/options/styles/actions → generate new resources → validate → preview differences → save as a new draft/revision. Preserve the original payload and conversion report. Never rewrite a published legacy site merely by opening it.

Maintain a conversion registry per old widget type and option schema. Map legacy jQuery options to modern module settings/state/bindings, documenting defaults, renamed options and unsupported behavior. Map/menu/gallery/report/search widgets need separate adapters. Do not claim lossless conversion of old map libraries or custom JavaScript without checking equivalent capabilities.

Produce diagnostics at page/node/option level: converted, preserved opaque, requires manual work, or unsupported. Keep working content visible even if one widget cannot convert. Existing legacy viewing continues until conversion is accepted and a new publication is activated.

## 8. Progressive author workflow

1. **Publish one module:** capture its effective state, create a minimal website/page, edit publication options, preview and publish.
2. **Publish Explorer:** select included module instances and source choices; serialize the chosen composition into the same website model.
3. **Add HTML:** insert and edit a rich-text section around the existing host.
4. **Choose site layout:** add shared header/footer, theme and language choices without resetting the module.
5. **Add controls:** menus, system actions, badges, tabs or accordions in selected regions.
6. **Extend content:** edit the HTML layout; add static content, materialized reports and dynamic report hosts.
7. **Add HFilter:** choose allowed Query Sources/filters and parameter forms; explicitly select its target.
8. **Add modules:** create independent instances or join explicit synchronization groups; convert `search_realm` where applicable.
9. **Add pages:** assign routes and connect HMenu to the site page hierarchy.
10. **Add interpage behavior:** configure link/onselect actions to open a target page with validated source/selection context.

Each step saves a valid draft and supports preview before publication. The basic workflow must not require users to understand configuration envelopes or synchronization internals.

## 9. API for an AI agent

Expose the same validated application services used by the designer. Initial operation names below are conceptual, not promised endpoints:

- Inspect site/page resources, template catalog, supported widget schemas, instance capabilities and current revisions.
- Create a website draft from a template, module snapshot or Explorer snapshot.
- Apply structured operations: insert/move/delete nodes, edit content, set styles, configure instances, bind groups, add pages and navigation actions.
- Read and replace advanced HTML/CSS/configuration resources with validation; preserve unknown content and stable IDs.
- Validate, preview and return machine-readable diagnostics plus a diff against the base revision.
- Save a draft, request a build, inspect job output and activate an identified successful build through separately authorized operations.

Require revision preconditions to prevent overwriting concurrent human edits. Multi-resource edits validate as a transaction; retries need operation identity/idempotency. Use existing identity and record permissions, schema-validated actions and normal audit provenance. Website/report content remains untrusted data for the agent. Do not introduce direct database writes or a separate AI-only renderer.

## 10. Proposed implementation stages and acceptance gates

| Stage | Deliverable | Acceptance gate |
| --- | --- | --- |
| 0 | Fixture inventory, format/schema prototype, record-storage mapping, contract reconciliation | Representative page can round-trip HTML/styles/configuration without duplicated hierarchy; unresolved decisions recorded |
| 1 | Shared viewer runtime, instance registry and consistent module/Explorer snapshots | Independent duplicate module types, correct restore, no authoring initialization, safe mount/unmount |
| 2 | Minimal website records and PublicationController | One module and Explorer each produce a reloadable website; failed generation preserves active version |
| 3 | Designer MVP: structure tree, TinyMCE, CodeMirror, layout and style controls | Edit/save/reload/cancel/undo preserve hosts and bindings; malformed JSON leaves static content and last valid state intact |
| 4 | Shared templates, navigation, languages and basic helper widgets | Shared-region changes, responsive layouts, menu actions and translated navigation preview correctly |
| 5 | HFilter/group synchronization, gallery and report completion | Curated forms, fixed sources, late mounts, stale responses, media modes and report access behave predictably |
| 6 | Legacy detection and conversion adapters | All supplied fixtures produce explicit conversion reports and reviewed previews; unsupported features never disappear silently |
| 7 | Agent API and publication hardening | Revision conflicts, transaction failures, retry, preview/build parity and rollback verified |

Cross-cutting checks: HTML/config/style round trips; duplicate/missing IDs; safe JSON embedding; relative paths; deep links/back/forward; right-to-left and responsive layouts; visitor permissions; accessible controls; deterministic builds; no credentials in output. Use focused contract/integration tests and browser comparisons for implementation stages. No application tests or builds are required for this discussion-only document.

## 11. Decisions for discussion

1. **Format ownership:** adopt HTML as the only persisted layout hierarchy, with stable IDs linking separate style and instance resources?
2. **Storage:** separate CMS fields/files for authoring resources, or one portable HTML source with embedded configuration blocks? Recommended: logical separation with a portable HTML export; finalize physical storage after the record-schema audit.
3. **Layout engine:** shared client composition runtime plus server assembly, using normal grid/flex for websites and HCardinalLayout inside Explorer?
4. **Naming:** reserve HPageController for navigation and name synchronization separately, resolving the earlier proposal's collision?
5. **Source semantics:** snapshot source/form definitions with live records by default; define any live-reference alternative explicitly?
6. **Publication scope:** static shell plus live interactive APIs initially; treat offline data packaging as separate work?
7. **Templates:** framework-neutral baseline with optional Bootstrap adapter; what initial site templates and styling controls are essential?
8. **Migration priorities:** which supplied website should be the first reviewed end-to-end conversion, and which custom script behaviors must remain supported?
9. **Initial editor delivery:** prioritize single-module → minimal site → incremental designer, or require a multipage editor in the first release? Recommended: incremental path in §8.

Discussion and refinement of this draft are the next steps. Implementation requires a subsequent instruction.
