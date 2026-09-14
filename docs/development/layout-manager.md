# Explorer Layout Manager: groups, roles and relationships

## Purpose

Explorer may need to display several presentation modules at once: data, map,
graph and timeline, sometimes with several data views. Trying to assign every
module a permanent rectangle in the workspace will not scale to a normal laptop
screen. The LayoutManager therefore must manage **logical composition first**
and physical placement second.

The three concepts are deliberately separate:

1. **DataSource** — what records a module presents.
2. **Module context** — why the module exists and what it is related to.
3. **Layout state** — where/how the module or group is currently displayed.

DataSource must not contain layout information.

## Data-view roles

Explorer distinguishes these data-module roles:

- `current` — exactly one reusable Current-result `heurist-data` module. Every
  ad-hoc `type:'query'` search replaces its query. It is not persistent.
- `saved` — a data module whose source is a saved Filter or Dataset. Explorer
  reuses an existing view with the same `filter:id` or `dataset:id`.
- `pinned` — a temporary query result explicitly kept for the current Explorer
  session. A pinned result does not become a permanent Heurist object unless it
  is later saved as a Filter or Dataset.
- `expansion` — a data view related to a parent/current result by expansion.
- `map-layer` — a data view related to a particular map/module and layer.
- `comparison` — one member of a group of filtered results being compared.

A module context can therefore be represented independently of the source:

```js
{
  role: 'current' | 'saved' | 'pinned' | 'expansion' | 'map-layer' | 'comparison',
  ownerModuleId: null,
  groupId: null
}
```

`ownerModuleId` expresses a parent/child relationship, for example layer data
owned by a map. `groupId` associates peers, for example several comparison
results.

## Groups

A group is a logical set of modules that should be navigated or placed together.
Examples:

- Current result + expansion results.
- Map + data views for its layers.
- Several saved filters in a comparison.

Proposed LayoutManager responsibilities:

```js
findModules(predicate)
findDataModules()
findByDataSource(source)
findCurrentResultDataModule()

createGroup(options)
addToGroup(moduleId, groupId)
removeFromGroup(moduleId)
getRelatedModules(ownerModuleId)

activateModule(moduleId)
activateGroup(groupId)
```

The exact group-management methods can be added as the layout implementation
matures. Module discovery and DataSource identity should already belong to
LayoutManager rather than UI classes such as `HDataViews`.

## DataSource identity

Explorer should avoid accidental duplicate data views.

- Direct query: one logical identity, `query:current`; always reuse the Current
  result view.
- Saved filter: `filter:<id>`.
- Dataset: `dataset:<id>`.
- Pinned temporary query: a session-specific identity.

A saved Filter/Dataset id defines identity even if its resolved query has
changed. Selecting it again should refresh and activate the existing view.

## Search workflow

`HFilter` only selects/creates and validates a DataSource. It does not know the
layout.

```text
HFilter datasourcechange
        |
        v
ExplorerApplication.activateDataSource(source)
        |
        v
LayoutManager.findByDataSource(source)
        |
        +-- query ----------------> reuse Current-result data module
        |
        +-- filter/dataset --------> reuse matching module if found
                                     otherwise create data module
        |
        v
LayoutManager.activateModule(moduleId)
        |
        v
SyncEngine updates map/timeline/graph followers
```

Other open data views must retain their own DataSources. Source synchronisation
must therefore not broadcast a newly selected source to every `heurist-data`
instance.

## Placement strategy

The initial LayoutManager should **not try to squeeze all modules onto screen at
once**. The logical model must support more modules than are simultaneously
visible.

A practical first visual policy is:

- one or a small number of visible regions;
- related modules represented as tabs within a region;
- only the active member of a group consumes the region;
- activating an existing DataSource selects/reveals its module rather than
  creating another rectangle;
- later, groups may be split/docked/resized explicitly by the user.

This allows Explorer to hold map + graph + timeline + several data views without
requiring all of them to be visible simultaneously. The LayoutManager owns
visibility/activation; the SyncEngine owns data/selection propagation.

## Examples

### Main result and expansions

```text
Search-result group
  [Current] [Expansion A] [Expansion B]
```

Only one tab needs to be visible at a time unless the user explicitly splits the
group.

### Map document layers

```text
Map region                         Related-data region
[Map]                              [Layer A] [Layer B] [Layer C]
```

Layer data modules use `role:'map-layer'` and `ownerModuleId:<map id>`.

### Filter comparison

```text
Comparison group
  [Filter A] [Filter B] [Filter C]
```

The group can initially be tabbed and later offer an explicit split/compare
layout. Creating the logical group does not imply that all results must be
visible simultaneously.

## Boundary with HDataViews

`HDataViews` is only a compact UI list. It asks LayoutManager for the data-module
registry and calls `activateModule()`. It must not own module discovery,
DataSource identity or layout policy.
