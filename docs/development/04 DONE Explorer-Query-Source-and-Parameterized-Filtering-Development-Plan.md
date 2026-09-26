# HEURIST-EXPLORER — Query Source and Parameterized Filtering Development Plan

## Purpose

This document defines the next development sequence for Query Source authoring, DataSource actions, parameterized filtering, filter-form design, and facet counts in HEURIST-EXPLORER.

The plan is based on the current `heurist-explorer` codebase and the following architectural decisions:

- **Explorer owns DataSource editing and persistence actions.**
- Presentation modules no longer add/remove Workspace items, save filters/sources, or edit DataSources.
- **`QuerySourceEditor` is the only UI for editing the current DataSource / Query Source definition.**
- **`DataSourceActions` is the only UI for Save as Filter, Save/Update Query Source, and Add/Remove Workspace.**
- Initially both widgets are hosted with the Data presentation, but they must not depend on `heurist-data` and must be attachable to any presentation module later.
- A query may remain a plain Heurist query string indefinitely.
- Opening `HFilterBuilder` converts a plain query to the existing JSON query format; the JSON representation then becomes authoritative.
- **Parameterized queries are supported only in JSON query format.**
- `HFilterBuilder` owns structured query semantics and parameter definitions.
- `HFormDesigner` is a generic form designer, intended for both parameter filter forms and future record-edit forms.
- For parameterized queries, `HFormDesigner` is launched only from `HFilterBuilder`.
- `HFilterForm` is a runtime/end-user widget and belongs in shared widgets.
- Dynamic facet counts are a later server-side phase and are not a prerequisite for basic parameterized filtering.

---

# 1. Terminology and responsibility boundaries

## User

A **user** is a Heurist user preparing, configuring and publishing data. A user may:

- enter Heurist query language;
- use `HFilterInlineHelper`;
- use `HFilterBuilder`;
- define expansion rules;
- select data, geo and time fields;
- configure a Query Source;
- design a parameterized filter form;
- save filters and Query Sources;
- add/remove DataSources from Workspace.

## End-user

An **end-user** consumes published data through a publication or website.

An end-user should not normally compose Heurist query language and should not see `HFilterBuilder` or `HFilterInlineHelper`.

For configurable searches, the end-user interacts with `HFilterForm` only.

---

# 2. Core architecture

The authoring and runtime stack is deliberately separated into four layers.

```text
AUTHORING

QuerySourceEditor
    │
    ├── plain query / query summary
    ├── HFilterInlineHelper
    ├── HFilterBuilder (modal)
    │       └── HFormDesigner (modal, only for parameterized query form)
    │
    ├── HRuleBuilder
    ├── HFieldSetEditor
    ├── HGeoFieldSelector
    └── HTimeFieldSelector

DataSourceActions
    ├── Save as Filter
    ├── Save as Source / Update Source
    ├── Add to Workspace / Remove from Workspace
    └── provenance + persistence state

RUNTIME FILTERING

HFilterForm
    └── parameter entry + query execution

PRESENTATION

heurist-data / heurist-map / heurist-graph / heurist-timeline / RecordView / ...
```

The critical ownership rule is:

> Presentation modules consume DataSources. They do not own DataSource editing, persistence or Workspace manipulation.

---

# 3. Widget hierarchy and source locations

## 3.1 Explorer-owned authoring widgets

Recommended structure:

```text
apps/explorer/src/widgets/
│
├── query-source/
│   ├── QuerySourcePanel.js
│   ├── QuerySourcePanel.css
│   ├── QuerySourceEditor.js
│   ├── QuerySourceEditor.css
│   ├── DataSourceActions.js
│   ├── DataSourceActions.css
│   │
│   └── helpers/
│       ├── HRuleBuilder.js
│       ├── HRuleBuilder.css
│       ├── HFieldSetEditor.js
│       ├── HFieldSetEditor.css
│       ├── HGeoFieldSelector.js
│       ├── HGeoFieldSelector.css
│       ├── HTimeFieldSelector.js
│       └── HTimeFieldSelector.css
│
├── filter-builder/
│   ├── HFilterBuilder.js              existing
│   ├── HFilterBuilder.css             existing
│   ├── HFilterBuilderItem.js          existing
│   ├── HFilterBuilderSort.js          existing
│   ├── HFilterInlineHelper.js         existing
│   ├── HFilterInlineHelper.css        existing
│   ├── HFieldTree.js                  existing
│   └── HFieldTree.css                 existing
│
└── filter/
    └── HFilter.js                     transitional; functionality absorbed/refactored
```

### Why introduce `QuerySourcePanel`

`QuerySourceEditor` and `DataSourceActions` are separate widgets, but Explorer needs one small host/controller to place them next to a presentation module.

`QuerySourcePanel` should:

- create and arrange `QuerySourceEditor` and `DataSourceActions`;
- bind both to the same active DataSource;
- switch the editor area between `QuerySourceEditor` and `HFilterForm`;
- handle dirty-editor navigation guards;
- provide a stable attachment point independent of the presentation module;
- initially mount above the Data presentation;
- later mount above/alongside any Explorer presentation without changing the child module.

It must **not** become a second DataSource manager. ExplorerApplication/SyncEngine remain owners of active application state.

A possible public API:

```js
new QuerySourcePanel({
  apiClient,
  dbdefs,
  querySourceManager,
  onExecute,
  onSaveFilter,
  onSaveSource,
  onUpdateSource,
  onWorkspaceAdd,
  onWorkspaceRemove
});

panel.attach(container);
panel.setDataSource(dataSource);
panel.showEditor();
panel.showFilterForm();
panel.hideFilterForm();
panel.isDirty();
panel.confirmNavigation();
```

The precise callbacks may instead be routed through `ExplorerApplication`; the important rule is that the panel is host UI, not persistence/state ownership.

---

## 3.2 Shared runtime/form widgets

Recommended structure:

```text
apps/shared/src/widgets/
│
├── form/
│   ├── HFormDesigner.js
│   ├── HFormDesigner.css
│   └── inputs/
│       ├── HInput.js
│       ├── HInputText.js
│       ├── HInputNumber.js
│       ├── HInputDate.js
│       ├── HInputEnum.js
│       ├── HInputRecord.js
│       ├── HInputBoolean.js
│       └── ...
│
└── filter/
    ├── HFilterForm.js
    └── HFilterForm.css
```

`HFormDesigner` and the `HInput` classes are shared because the same infrastructure should later support record-edit form design.

`HFilterForm` is shared because it may be hosted by Data, Map, Timeline, Graph, RecordView, a standalone publication or a website.

### Possible later refactoring

`HFilterBuilder` currently lives in Explorer and should remain there during Phases 1–2 to avoid unnecessary movement while it is being stabilized.

If system/definition modules later require the same query authoring UI, `HFilterBuilder` and its supporting classes can be promoted to shared at that time without changing their conceptual role.

---

# 4. QuerySourcePanel — generic host for editor/actions

## Responsibility

`QuerySourcePanel` provides the Explorer-owned authoring strip associated with the currently focused presentation.

It should not know about DataTables, HRecordList, Leaflet, Timeline or Graph internals.

Initial Explorer layout:

```text
┌───────────────────────────────────────────────────────────────┐
│ source header                                                 │
├───────────────────────────────────────────────────────────────┤
│ QuerySourcePanel                                              │
│   QuerySourceEditor                                           │
│   DataSourceActions                                           │
├───────────────────────────────────────────────────────────────┤
│ heurist-data                                                  │
│   HRecordList / DataTable / ...                               │
└───────────────────────────────────────────────────────────────┘
```

Later:

```text
Explorer presentation shell
    ├── QuerySourcePanel
    └── active presentation
         ├── Data
         ├── Map
         ├── Timeline
         ├── Graph
         └── RecordView
```

This lets authoring UI be reused with another presentation without injecting DataSource controls into that module.

## Runtime mode switch

When a parameterized filter is executed/previewed in Explorer:

```text
QuerySourceEditor visible
        │
        │ Filter
        ▼
HFilterForm visible
QuerySourceEditor hidden
        │
        │ Close / Back
        ▼
QuerySourceEditor visible
```

`DataSourceActions` may remain visible while `HFilterForm` is active if useful, but the recommended first implementation is to keep the source-status/actions row visible and replace only the editor body.

---

# 5. QuerySourceEditor

## Purpose

`QuerySourceEditor` is the **single Explorer widget used to edit the current DataSource/Query Source definition**.

It replaces the current conceptual split between a simple HFilter and scattered presentation-source configuration.

It does not save anything itself.

## Query representations

### Plain query

A DataSource may hold a normal query string:

```js
request: {
  q: 't:12 title:Paris'
}
```

The user may edit it directly and may use `HFilterInlineHelper`.

### Structured JSON query

When `HFilterBuilder` is opened, the current plain query is parsed/imported into the existing JSON query representation.

After that point:

- JSON is authoritative;
- the QuerySourceEditor displays a human-readable summary rather than encouraging raw JSON editing;
- Builder is used for structural changes;
- parameterization is allowed.

Opening Builder must not silently produce a separate parallel query. The editor draft contains one authoritative query representation at a time.

## Compact mode

Compact mode is the normal state and must remain visually small.

Approximate layout for plain query:

```text
┌─ Query Source ─────────────────────────────────────────────────┐
│ [ t:12 title:Paris                                      ]      │
│   query description / result count                            │
│                                      [Helper] [Builder] [More] │
└────────────────────────────────────────────────────────────────┘
```

Possible alternative if inline helper is integrated into the query row:

```text
Query  [ t:12 title:Paris                                  ] [▶]
       Places where title contains Paris
                                      [Builder] [More ▾]
```

For a JSON query:

```text
┌─ Query Source ─────────────────────────────────────────────────┐
│ Places where Type = Person and Birth place = France            │
│ Structured query · 3 criteria · 2 parameters                   │
│                                      [Builder] [More ▾]         │
└────────────────────────────────────────────────────────────────┘
```

Do not show editable raw JSON as the normal UI.

## Expanded mode

Expanded mode adds Query Source presentation/configuration metadata but should still summarize each definition rather than expanding large editors inline.

```text
┌─ Query Source ────────────────────────────────────────────────────┐
│ Query                                                              │
│ Places where Type = Place and Country = France      [Builder…]      │
│                                                                    │
│ Expansion rules   Linked places, organisations          [Edit…]    │
│ Data fields       Name, Type, Date, Owner               [Edit…]    │
│ Geo fields        Location, Administrative area         [Edit…]    │
│                   Load by extent · zoom 4–18                        │
│ Time fields       Start date, End date                  [Edit…]    │
│                                                                    │
│ Parameterized     Yes · 3 parameters · filter form      [Filter]   │
│                                                      [Less ▲]       │
└────────────────────────────────────────────────────────────────────┘
```

For a non-parameterized source:

```text
Parameterized     No
```

No Filter button is shown until the JSON query actually contains valid parameter definitions and a usable form definition/default form can be generated.

## Functionality

The widget should provide approximately:

```js
setDataSource(source)
getDraftDataSource()
getQuery()
setQuery(query)
execute()
openInlineHelper()
openFilterBuilder()
openRuleBuilder()
openFieldSetEditor()
openGeoFieldSelector()
openTimeFieldSelector()
setExpanded(boolean)
isExpanded()
isDirty()
resetDraft()
markCommitted()
```

The returned draft should preserve DataSource provenance/reference separately from the edited request/presentation values.

## Dirty state

Any local edit makes the editor dirty.

If another DataSource is activated while dirty, Explorer must not silently discard the draft.

Recommended navigation guard:

For an existing Query Source:

```text
This Query Source has unsaved changes.
[Update Source] [Discard] [Cancel]
```

For an ad-hoc source:

```text
This source has unsaved configuration.
[Save as Source] [Discard] [Cancel]
```

The navigation guard belongs to the Explorer/QuerySourcePanel activation path so History, Saved Filters, Query Sources, Show Data and other activation routes behave identically.

---

# 6. Helper editors

Helper editors should be deliberately small, focused modals/popups. They should reuse common field-path selection and existing legacy concepts where practical.

The goal is to implement these quickly without embedding four complex editors into `QuerySourceEditor`.

## 6.1 Shared lower-level field-path selector

Although not necessarily exposed as a public widget, `HFieldSetEditor`, `HGeoFieldSelector` and `HTimeFieldSelector` should reuse a common field/path picker.

Possible internal class:

```text
HFieldPathSelector
```

Responsibilities:

- show fields for the selected/root record type;
- traverse linked record paths;
- emit Heurist path codes;
- optionally filter selectable terminal data types;
- optionally allow ordering/multiple selection.

This can reuse ideas/code from existing `HFieldTree` instead of creating another independent ontology tree.

---

## 6.2 HRuleBuilder

### Purpose

Edit expansion rules using a visual UI rather than serialized JSON.

### Initial scope

Prefer compatibility with the rules currently accepted by Query Sources and record searches. Do not redesign expansion-rule semantics in this phase.

Approximate modal:

```text
┌─ Expansion Rules ───────────────────────────────────────┐
│ Rule 1   Person → Organisation          [Edit] [×]      │
│ Rule 2   Place ← Event                  [Edit] [×]      │
│                                                        │
│ [+ Add rule]                                           │
│                                                        │
│                              [Cancel] [Apply]           │
└────────────────────────────────────────────────────────┘
```

If the existing legacy `editRules` bridge remains useful during migration, the initial `HRuleBuilder` may wrap/delegate to it behind the new widget contract. The new QuerySourceEditor should not depend directly on a legacy bridge function.

Suggested API:

```js
setRules(rules)
getRules()
open()
close()
```

---

## 6.3 HFieldSetEditor

### Purpose

Select and order fields used by the Data presentation.

It replaces direct/raw editing of Query Source `fields` and may initially adapt the existing `editFieldset` workflow.

Approximate modal:

```text
┌─ Data Fields ───────────────────────────────────────────────┐
│ Available fields                  Selected fields           │
│ ┌───────────────────┐            ┌───────────────────────┐ │
│ │ Name              │            │ 1. Name           ↕ × │ │
│ │ Type              │    →       │ 2. Type           ↕ × │ │
│ │ Date              │            │ 3. Place > Name   ↕ × │ │
│ │ Place > ...       │            │                       │ │
│ └───────────────────┘            └───────────────────────┘ │
│                                                            │
│                                  [Cancel] [Apply]           │
└────────────────────────────────────────────────────────────┘
```

Initial scope:

- direct and linked field paths;
- add/remove;
- ordering;
- current Query Source fieldset serialization.

Aliases, widths and advanced formatting should be deferred unless already required by the persisted fieldset format.

---

## 6.4 HGeoFieldSelector

### Purpose

Select geo field paths and configure Query Source map-loading behavior.

Approximate modal:

```text
┌─ Geographic Fields ─────────────────────────────────────────┐
│ Selected geo fields                                         │
│ ☑ Location                                                  │
│ ☑ Birth place > Coordinates                                 │
│                                                            │
│ Loading                                                     │
│ ☑ Load dynamically by map extent                           │
│ Minimum zoom   [ 4  ]                                       │
│ Maximum zoom   [ 18 ]                                       │
│                                                            │
│                         [Select fields…] [Cancel] [Apply]   │
└────────────────────────────────────────────────────────────┘
```

Use the existing persisted Query Source model exactly for:

- selected geo path(s);
- dynamic/viewport loading;
- minimum zoom;
- maximum zoom.

Do not introduce a second map-source configuration schema.

---

## 6.5 HTimeFieldSelector

### Purpose

Select direct or linked date/year field paths used by Timeline.

Approximate modal:

```text
┌─ Time Fields ────────────────────────────────────────────────┐
│ Available date/year fields       Selected                  │
│ Start date                       1. Start date              │
│ End date                         2. End date                │
│ Event > Date                     3. Event > Date            │
│ Person > Birth date                                        │
│                                                           │
│                                  [Cancel] [Apply]          │
└─────────────────────────────────────────────────────────────┘
```

The selector must support Heurist linked path notation already accepted by `/time`, not only direct detail type IDs.

---

# 7. DataSourceActions

## Purpose

`DataSourceActions` is the **single Explorer widget responsible for persistence and Workspace actions for the active DataSource**.

No presentation module should duplicate these actions.

## Actions

Depending on state:

```text
Save as Filter
Save as Source
Update Source
Add to Workspace
Remove from Workspace
```

### Save as Filter

Creates/updates the legacy Saved Filter/search definition through the appropriate Explorer/server API.

It saves the **search definition**, not Query Source presentation configuration.

It should be available for normal executable queries, including JSON structured queries if Saved Filter persistence supports that query format.

Presentation-only settings such as fields, geo/time configuration and form layout are not Saved Filter content.

### Save as Source

For an unsaved/ad-hoc DataSource, persist the Query Source definition including:

- query;
- expansion rules;
- data fields;
- geo fields and map loading settings;
- time fields;
- parameter/filter-form definition where applicable.

### Update Source

Shown when the active DataSource is based on an existing Query Source.

This updates that record rather than creating another source by default.

### Workspace

Only this widget provides:

- Add to Workspace;
- Remove from Workspace.

Presentation modules no longer expose these actions.

## Provenance/state display

This widget should communicate state prominently in text plus icons rather than relying on color alone.

Examples:

```text
Ad-hoc query
[Save as Filter] [Save as Source] [Add to Workspace]
```

```text
Source: French Places  ·  Query Source #123  ·  In Workspace
[Save as Filter] [Update Source] [Remove from Workspace]
```

```text
Saved Filter: Events after 1900
[Save as Source] [Add to Workspace]
```

Approximate compact layout:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Query Source #123 · French Places · ● Workspace                    │
│ [Save as Filter] [Update Source] [Remove from Workspace]           │
└────────────────────────────────────────────────────────────────────┘
```

On narrow layouts actions may wrap to a second row.

## State source

The widget derives state from normalized DataSource metadata/reference plus Explorer Workspace state. It must not ask a presentation module whether the source is saved or in Workspace.

Suggested API:

```js
setDataSource(source)
setWorkspaceState(boolean)
setDirty(boolean)
refresh()
```

Events/callbacks:

```js
savefilter
savesource
updatesource
workspaceadd
workspaceremove
```

Explorer handles the action and then refreshes the active DataSource/editor state.

---

# 8. HFilterBuilder

`HFilterBuilder` already exists and remains under:

```text
apps/explorer/src/widgets/filter-builder/
```

Phase 2 starts by stabilizing it before adding parameters.

## Required invariants

1. It accepts the current plain or JSON query.
2. Opening Builder with a plain query converts/imports it to the existing JSON query model.
3. It round-trips supported JSON without changing meaning.
4. Unsupported-but-preserved query fragments must not be silently lost.
5. Apply returns one valid JSON query definition to `QuerySourceEditor`.
6. Cancel leaves the editor draft unchanged.

## Existing glitches

Before parameterization, identify and fix current issues in:

- parsing plain queries;
- linked criteria;
- operator/value mapping;
- conjunction (`all`/`any`);
- sorting;
- edit/reopen round-trip;
- unsupported fragments;
- human-readable query description;
- modal Apply/Cancel lifecycle.

This stabilization is a prerequisite for parameterized queries because Builder becomes their authoritative editor.

---

# 9. Parameterized query model

## Rule

The authoritative contract is [HInput-and-Form-Format-Development-Plan.md](HInput-and-Form-Format-Development-Plan.md), section 1.

A parameterized query remains a bare Heurist JSON array. A placeholder in a criterion value is the only parameter binding:

```json
[{"t":"10"},{"f:1":"$X1$"}]
```

The optional Filter Form layout is stored separately in QuerySource `DT_FILTER_FORM` (concept `2-1165`). It uses `version`, `groups`, and inline `children`, with only non-default presentation properties. No `parameters`, `builderModel`, or `form` is stored in the query. The runtime derives input type and default label from the query path and database definitions. The QuerySource textarea is read-only for queries containing placeholders; Run and selecting that source open the Filter Form. Close returns to QuerySourceEditor.

## Builder UI

Within `HFilterBuilder`, a criterion value can be converted from a literal value to a parameter.

Example:

```text
Field             Operator       Value
Birth place       is             [ Parameter: PLACE ▼ ]
Birth date        after          [ Parameter: FROM_DATE ▼ ]
```

Parameter management may appear in a compact section:

```text
Parameters
PLACE       Record   Birth place       [Edit]
FROM_DATE   Date     From date         [Edit]

[Design Filter Form…]
```

`Design Filter Form…` is visible only when at least one parameter exists.

## HFormDesigner launch rule

For Query Source parameter forms:

> `HFormDesigner` can be launched only from `HFilterBuilder`.

`QuerySourceEditor` may show status such as:

```text
Parameterized: 3 parameters · Filter form defined
```

but does not directly edit the form layout.

---

# 10. HFormDesigner

## Purpose

A generic visual form designer used initially for parameter filter forms and later for record edit forms.

It must therefore not contain filter-specific assumptions in its base layout model.

## Modes

Initial:

```js
mode: 'filter'
```

Future:

```js
mode: 'record'
```

The designer receives a list/schema of available inputs from its caller.

For `mode:'filter'`, those inputs are query parameters supplied by `HFilterBuilder`.

For `mode:'record'`, they will eventually be record detail fields supplied by record-edit configuration.

## Approximate UI

```text
┌─ Filter Form Designer ───────────────────────────────────────────┐
│ Available                  Form                                 │
│ ┌──────────────────┐      ┌──────────────────────────────────┐ │
│ │ Place            │  →   │ Search places                   │ │
│ │ From date        │      │   Place      [____________]      │ │
│ │ To date          │      │   From date  [____________]      │ │
│ │ Type             │      │   To date    [____________]      │ │
│ └──────────────────┘      │                                  │ │
│                           └──────────────────────────────────┘ │
│                                                                  │
│ Orientation  (•) Vertical  ( ) Horizontal                        │
│                                                                  │
│ Selected item                                                     │
│ Label [Place____________]  Required [ ]  Default [...]            │
│ Widget [Record selector ▼]                                       │
│                                                                  │
│                                        [Cancel] [Apply]          │
└──────────────────────────────────────────────────────────────────┘
```

## Initial design features

Keep the first implementation narrow:

- add/remove fields/parameters;
- ordering;
- grouping/sections only if easy with the base model;
- label;
- required flag;
- default value;
- input/widget type;
- vertical/horizontal orientation.

Advanced responsive layout, arbitrary grids and conditional visibility can follow later.

---

# 11. HInput classes

## Purpose

`HInput` classes render/edit a value according to its field/parameter type and configuration.

They are shared between `HFormDesigner` preview and `HFilterForm` runtime, and later should be reusable for record-edit forms.

Recommended base:

```js
class HInput {
  setDefinition(definition)
  setValue(value)
  getValue()
  validate()
  render()
  destroy()
}
```

Initial concrete inputs should be driven by actual parameter types required by current filters. Likely first set:

- `HInputText`
- `HInputNumber`
- `HInputDate`
- `HInputBoolean`
- `HInputEnum`
- `HInputRecord` / record selector

Do not create a large theoretical class hierarchy before real parameter types require it.

---

# 12. HFilterForm

## Purpose

`HFilterForm` is the runtime/end-user view of a parameterized query.

It receives:

- structured query;
- parameter definitions;
- form definition;
- current/default parameter values.

It renders only the form configured by the author. It does not expose Heurist query language.

## Location

Move from Explorer to shared:

```text
apps/shared/src/widgets/filter/HFilterForm.js
apps/shared/src/widgets/filter/HFilterForm.css
```

## Layout

Vertical:

```text
Place
[ Select place...                ]

From date
[ 1900-01-01                    ]

To date
[                               ]

[Filter] [Reset]
```

Horizontal:

```text
Place [___________]  From [________]  To [________]  [Filter] [Reset]
```

The widget should support responsive wrapping even when configured as horizontal.

## Explorer behavior

In Explorer, activating `HFilterForm` hides `QuerySourceEditor` in the same panel area.

Explorer always shows a close/back action:

```text
Parameterized Filter                                      [Close ×]
...form...
```

Closing the form restores `QuerySourceEditor` without changing the underlying Query Source definition.

## Publication/website behavior

In publication or website use:

- the form may be permanently visible;
- Close is optional/usually hidden;
- no authoring widgets are required;
- submission changes the effective request/results only.

## DataSource provenance

Executing a parameterized form must preserve Query Source identity.

Do **not** convert the result into an anonymous direct DataSource.

Conceptually:

```js
{
  reference: {
    type: 'source',
    id: 123
  },
  request: {
    q: resolvedJsonQuery
  },
  presentation: { ... }
}
```

The persistent Query Source remains unchanged until the user explicitly edits/saves it.

## DataSource changes while the form is active

Runtime filter values are not authoring changes.

If Explorer activates another DataSource from History, Saved Filters, Query Sources, etc. while `HFilterForm` is active:

- close `HFilterForm` automatically;
- activate the new source;
- do not prompt merely because runtime parameter values changed.

Dirty-state protection applies to `QuerySourceEditor` and `HFormDesigner`, not ordinary `HFilterForm` use.

---

# 13. Phase 3 — facet counts

Facet counts are deliberately deferred until parameterized query execution works reliably.

## Goal

When the end-user changes one parameter, other filter controls can display available values/counts under the currently selected constraints.

Example:

```text
Country
France (1245)
Germany (853)
Italy (642)
```

## Server-side responsibility

Do not implement facet counts by repeatedly downloading record IDs to the client.

Add/extend a server API that accepts:

- base structured query;
- current parameter values;
- requested facet field/parameter;
- exclusions needed to calculate the selected facet against all other active constraints.

The endpoint/service should return compact aggregation data such as:

```js
{
  field: '10',
  values: [
    { value: 'France', count: 1245 },
    { value: 'Germany', count: 853 }
  ]
}
```

Exact API design is a server-side task for Phase 3 and should be aligned with the current record-query engine rather than copied directly from legacy `faceted_search.js`.

## Client responsibility

`HFilterForm` should expose an optional facet-data provider contract rather than know the endpoint directly.

Example:

```js
getFacetValues(parameterName, currentValues)
```

This keeps the shared runtime widget usable in different hosts and allows facet counts to be absent without changing basic form operation.

---

# 14. Development order

## Phase 1 — Query Source authoring foundation

### 1. QuerySourceEditor

Implement first.

Tasks:

1. Create `query-source/QuerySourcePanel` host.
2. Create `QuerySourceEditor`.
3. Bind editor to normalized active DataSource.
4. Support plain query editing.
5. Reuse/integrate `HFilterInlineHelper`.
6. Launch existing `HFilterBuilder` as modal.
7. On Builder Apply, store JSON query as authoritative query representation.
8. Implement compact/expanded modes.
9. Show summaries for:
   - expansion rules;
   - data fieldset;
   - geo fields/settings;
   - time fields;
   - parameterization/filter-form status.
10. Implement dirty tracking and reset/commit semantics.
11. Add Explorer-level dirty navigation guard.
12. Execute edited query through the normal Explorer DataSource activation path.

Do not implement parameterized query authoring yet.

### 2. Helper editors

Implement in this order where practical:

1. common field/path selector foundation;
2. `HFieldSetEditor`;
3. `HTimeFieldSelector`;
4. `HGeoFieldSelector`;
5. `HRuleBuilder`.

The order may be adjusted to reuse existing `editFieldset` / `editRules` code quickly, but all helpers should expose new widget contracts even when initially backed by legacy dialogs.

Integrate them into expanded `QuerySourceEditor`.

### 3. DataSourceActions

Implement after editor draft/configuration is stable.

Tasks:

1. Add provenance/status display.
2. Implement `Save as Filter`.
3. Implement `Save as Source`.
4. Implement `Update Source` for existing Query Sources.
5. Implement Add to Workspace.
6. Implement Remove from Workspace.
7. Remove/keep removed all equivalent actions from presentation modules.
8. Refresh editor/DataSource reference after create/update.
9. Ensure save/update clears dirty state only on success.

### Phase 1 acceptance criteria

- A user can type and execute a plain query.
- A user can open Builder and return a JSON query to the editor.
- A user can configure rules, data fields, geo fields and time fields through helper dialogs.
- A direct query can be saved as a Saved Filter.
- A configured source can be saved as a Query Source.
- Existing Query Source can be loaded, edited and updated.
- Workspace membership is changed only through `DataSourceActions`.
- Presentation modules contain no DataSource save/workspace controls.
- The complete `QuerySourcePanel` can theoretically be mounted with another presentation without depending on heurist-data internals.
- Unsaved authoring changes cannot be silently discarded by DataSource navigation.

---

## Phase 2 — Structured parameterized filtering

### 1. Stabilize HFilterBuilder

Before adding parameters:

- reproduce and list current glitches;
- fix parser/model/UI round-trip;
- verify plain → JSON conversion;
- verify linked criteria;
- verify conjunctions/operators/sort;
- verify unsupported fragment preservation;
- verify modal Apply/Cancel lifecycle;
- add focused tests around query round-trip.

### 2. Add placeholders to HFilterBuilder

Tasks:

1. Insert named placeholders directly in JSON criterion values.
2. Allow supported criterion values to become placeholders.
3. Validate placeholder names and uniqueness.
4. Preserve placeholders through Builder reopen/Apply.
5. Show parameter count/status in `QuerySourceEditor`.
6. Add `Design Filter Form…` button in Builder.

Parameterized queries remain JSON-only.

### 3. Implement HFormDesigner + HInput classes

Tasks:

1. Move generic form infrastructure to shared.
2. Define generic form schema independent of filtering.
3. Implement initial `HInput` base/classes needed by filter parameters.
4. Implement `HFormDesigner(mode:'filter')`.
5. Supply parameter list from `HFilterBuilder`.
6. Configure order, non-default labels, widgets and orientation.
7. Return an optional, separate form layout to QuerySource presentation.
8. Leave extension point for future `mode:'record'`.

### 4. Implement shared HFilterForm

Tasks:

1. Move/rewrite current `HFilterForm` into shared.
2. Derive inputs from query placeholders and render the optional form layout.
3. Support vertical/horizontal layout.
4. Resolve parameter values into executable JSON query/request.
5. Emit filter execution without exposing raw query language.
6. Preserve originating Query Source identity.
7. Integrate with `QuerySourcePanel` switch behavior.
8. In Explorer, show Close/Back and hide `QuerySourceEditor` while active.
9. Auto-close runtime form when a different DataSource activates.
10. Support standalone publication/website use without Explorer.

### Phase 2 acceptance criteria

- Plain queries remain usable without Builder.
- Opening Builder converts/imports to JSON reliably.
- Parameters can only be created in JSON queries.
- `HFormDesigner` can be opened only from `HFilterBuilder` for filter-form design.
- A user can design a vertical or horizontal filter form.
- An end-user can execute the form without seeing query language.
- The same `HFilterForm` works in Explorer and standalone/publication context.
- Parameter execution preserves Query Source provenance.
- Builder/form-design edits participate in dirty-state protection.

---

## Phase 3 — Facet counts

### Server

1. Study legacy `faceted_search.js` behavior and identify required aggregation semantics.
2. Define a modern facet-count request/response contract.
3. Implement aggregation in the server query layer.
4. Support current parameter constraints while calculating another facet.
5. Add paging/limits/search for high-cardinality facets where required.
6. Add tests for count correctness and linked fields.

### Client

1. Add an optional facet provider to `HFilterForm`.
2. Add count-capable inputs where relevant (enum, record selector, etc.).
3. Refresh dependent facets after parameter changes with debounce/cancellation.
4. Avoid unnecessary recalculation when a parameter does not affect a facet.
5. Keep the form fully functional when facet counts are unavailable.

### Phase 3 acceptance criteria

- Dynamic counts are calculated server-side.
- End-user form controls can display available values/counts.
- Counts respect all other active parameter constraints.
- Linked-field facets are supported where the query engine permits them.
- Basic parameterized filtering remains independent of facet availability.

---

# 15. Explorer integration and lifecycle

## Active DataSource change

All activation routes must continue to converge on the normal Explorer activation path.

Before changing source:

```text
Explorer wants to activate DataSource B
        │
        ▼
QuerySourcePanel / QuerySourceEditor dirty?
        │
   no ──┴── yes
   │         │
   │     Save/Discard/Cancel
   │         │
   ▼         ▼
close runtime HFilterForm if open
        │
        ▼
activate DataSource B
        │
        ▼
QuerySourcePanel.setDataSource(B)
```

Do not put this guard independently into History, QuerySourceManager, Saved Filters, Map, etc.

## After Save as Source

Recommended behavior:

1. persist new Query Source;
2. resolve/normalize its returned record;
3. replace active anonymous reference with `reference:{type:'source', id:...}`;
4. keep the current request/presentation state;
5. refresh Query Source lists;
6. mark editor committed;
7. refresh `DataSourceActions` to show `Update Source`.

## After Update Source

1. persist current editor draft;
2. resolve canonical source again if necessary;
3. update active DataSource;
4. keep selection/presentation where possible;
5. clear dirty state;
6. refresh Query Source list/title/status.

---

# 16. Saved Filter versus Query Source — UI guidance

The UI needs to explain the distinction without forcing users to understand storage architecture.

Recommended wording near actions/tooltips:

**Save as Filter**  
Save this search for re-use.

**Save as Source**  
Save this search together with its presentation/filter settings for re-use and publication.

A Query Source becomes especially appropriate when the user configures any of:

- data fieldset;
- geographic fields / viewport loading / zoom range;
- time fields;
- expansion rules that are part of source configuration;
- parameterized filter form.

The expanded editor should never open automatically on every DataSource change. Compact mode is the default; advanced configuration remains one click away.

---

# 17. Implementation principles

1. **One editor.** `QuerySourceEditor` is the only DataSource/Query Source authoring surface in Explorer.
2. **One action surface.** `DataSourceActions` is the only place for save/update/workspace actions.
3. **No presentation ownership.** Data/Map/Timeline/Graph never manipulate Workspace or persistent source definitions.
4. **Plain queries stay simple.** Do not force every search into JSON.
5. **Builder creates structure.** Opening `HFilterBuilder` establishes JSON as the authoritative representation.
6. **Parameters require structure.** Parameterized filtering is JSON-only.
7. **Form design is generic.** `HFormDesigner` must be suitable for future record-edit form design.
8. **Filter form is runtime UI.** `HFilterForm` is shared and contains no authoring functionality.
9. **Helpers remain focused.** Geo/time/fieldset/rule editing happens in dedicated small dialogs, not giant inline panels.
10. **Protect author work.** Never silently discard dirty Query Source or form-design changes.
11. **Do not overbuild facet support early.** Basic form execution precedes facet counts.
12. **Preserve provenance.** Executing a parameterized Query Source must not turn it into an anonymous query DataSource.

---

# 18. Deferred tasks

The following are outside this plan and should be addressed after Phases 1–3:

6. Report editor
7. Action dashboard
8. Export dashboard
9. Crosstabs / chart analysis

The widget architecture above should avoid assumptions that would prevent these later tools from consuming the same DataSource/Query Source definitions.

---

# 19. Recommended immediate coding sequence

For the next implementation cycle:

```text
1. QuerySourcePanel skeleton
2. QuerySourceEditor compact plain-query mode
3. Integrate HFilterInlineHelper
4. Launch existing HFilterBuilder and accept JSON result
5. QuerySourceEditor expanded summaries
6. HFieldPathSelector foundation
7. HFieldSetEditor
8. HTimeFieldSelector
9. HGeoFieldSelector
10. HRuleBuilder
11. Bind helper results into QuerySourceEditor draft
12. Dirty-state/navigation guard
13. DataSourceActions state/provenance UI
14. Save as Filter
15. Save as Source / Update Source
16. Workspace add/remove
17. Remove any remaining equivalent controls from presentation modules
18. Tests for QuerySourceEditor + DataSourceActions lifecycle
```

Only after this Phase 1 path is stable should work continue with `HFilterBuilder` glitch fixes and parameterized filters.
