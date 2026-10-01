# Expansion levels in Graph and Data — development plan

Status: **Phases 1–2 implemented 2026-09-28, committed (`ec2aef1`); §11 committed (`8aa2890` /
server `9bca7dafe`).** Phase 3 (Data) implemented 2026-09-30, not committed, not yet checked in
a browser — decisions and notes in §7; Phase 4 (Map, Timeline) is postponed. §10 lists where the implementation differs from this plan.

---

## 1. Goal

A clear, predictable way to expand the current result through linked records, the same in
Graph and Data. The expansion is defined by the **rules of the shared DataSource**. End users
use prepared rules; authors edit them.

## 2. Decisions

| # | Decision |
|---|---|
| E1 | **Level 0** is the current result. **Level *n*** is what step *n* of every enabled rule reaches (a rule's own query is step 1, its `levels` step 2, and so on). Sibling branches under one parent are at the same level. |
| E2 | Rules always start from the **whole current result**. There is no per-node or per-selection expansion: no expand on click or double-click, and the level selector ignores the selection. |
| E3 | A rule has **up to 4 levels** (its query + 3 steps), so the graph has levels 0–4. One shared constant, `MAX_RULE_DEPTH = 4`. |
| E4 | Rules belong to the **shared DataSource**. There is no Query Source editor or rule editing for end users in the modules. |
| E5 | Graph gets an **Edit rules** button next to the level selector, **for authors only** (shown only when the host can edit rules). It opens the Expansion rules dialog in Explorer, saves the result into the current DataSource and applies it at once. |
| E6 | Graph gets a separate **Quick expansion** button. It appends one step — *any record type → any pointer or relationship → any record type* (`connected:[]`) — to every branch that is shorter than `MAX_RULE_DEPTH`, and **writes the result into the DataSource**, so what is shown and what the rules say never disagree. Same visibility as E5. |
| E7 | A changed DataSource whose query and links are unchanged (only the rules changed) **does not reload the graph**. Unchanged rules keep their cached results; the level is kept. |
| E8 | Data shows **exactly the records reached at level *n*** in a second list. Selection in the main list **filters** it (cheaper than highlighting). |
| E9 | Map and Timeline: level *n* as a **separate layer / group**. Postponed. |

## 3. Current state (2026-09-28)

### Graph

- Rules come from `dataSource.request.rules` (a published view's saved rules override them).
  Rules start disabled.
- Checking a rule fetches **only that rule** and merges it in (`GraphExpansions`). Each rule
  step is one `/graph` request (`ids` = the previous step's records, `rule` = that step's
  query). Results are cached per rule, starting set and path. Unchecking a rule or changing
  the level recomposes from the cache; only a new query clears it.
- Checking a rule loads it **to its full depth** and the selector jumps there.
- Expansion state lives in *scopes*: the whole result, plus one scope per distinct selection.
  The expand/prune buttons and the selector act on the selection when there is one; a
  double-click expands one node. This dual model is what E2 removes.
- The base result is the loaded seed page (default 1,000, at most 10,000 nodes).
- There is no rule editing in Graph. The iframe bridge passes `editRules` through, unused.

### Rule builder (Explorer, `HRuleBuilder`)

- Rule + 2 steps. A step can only follow a step with a single target type.
- Source and target are single-choice `<select>`s.

### Data, Map, Timeline

- No rules. Data shows the current result only (server-paged).

## 4. Rule format

Unchanged, plus several record types per step:

```js
{ query: { t: [10, 12], 'lf:15': [{ t: [5, 7] }] }, levels: [ … ] }
```

- `t` may be a list, source and target. An empty parent (`lf: []`) means *any record type*:
  the parent level itself. `connected` is a pointer or relationship in either direction.
- A step's parent types are the previous step's target types (or any).

## 5. Rule builder changes (Phase 1)

1. `MAX_RULE_DEPTH = 4` (in `shared/`, used by the builder and Graph).
2. **Record-type pickers.** Source and target become multi-select `HValuePicker`s
   (grouped by record-type group, "Current data source" first). A new shared
   record-type value source supplies the items. "Any record type" is an explicit choice.
3. **Several source types or any source**: the pointer/relationship list shows only the
   *Any…* section. Targets are the union of the matching fields' targets.
4. **Next step's source**, from the previous step's target:
   - any record type → a multi-select picker with all record types (default: any);
   - several types → a multi-select picker limited to those types (default: all of them);
   - one type → locked to that type (as now).
5. A next step is allowed after a target of *any record type* or several types.
6. **Preview**: a `[ ] Preview` checkbox at the bottom of the dialog shows a read-only area
   with the rules' JSON, updated as the rules change.

## 6. Graph and Explorer changes (Phase 2)

### Graph

- Remove selection scopes and node double-click expansion. `GraphExpansions` keeps one scope
  (the base result); `getExpansionState`, `setExpansionDepth`, `advanceExpansion`,
  `pruneExpansion` lose their `seedIds` argument. The public `expandNode` is removed.
- Checking a rule loads it **only to the current level** (the selector no longer jumps). The
  first expand from level 0 still enables all rules (as now).
- `setDataSource` with the same query and links → `expansions.setRules(newRules)` and
  recompose (E7).
- Buttons next to the level selector: **Edit rules** (`fa-pen`) and **Quick expansion**
  (`fa-plus`), visible when the host capability `rulesEditing` is true.
- Quick expansion (a Graph-local helper): append
  `{ query: { connected: parentTypes ? [{ t: parentTypes }] : [] }, levels: [] }` to every
  leaf shorter than `MAX_RULE_DEPTH` (no rules at all → one rule `{ connected: [] }`), clear the
  changed rules' `name`/`description`, send the rules to the host, then enable all rules and
  go to the new deepest level. Disabled when every branch is at `MAX_RULE_DEPTH`.

### Explorer

- Host bridge: `editRules(rules)` opens the native `HRuleBuilder` dialog (not the legacy
  outer host). `updateRules(rules)` applies rules without a dialog. `canEditRules()` is true
  when the Query Source editor is available.
- Both write the rules into the active DataSource and the Query Source editor's draft (marked
  dirty, so the author can save), describe unnamed rules, and push the DataSource to the
  presentations. Only the rules change, so modules apply them without reloading (E7).

## 7. Data module (Phase 3)

- A shared helper `expansionLevelQuery(q, rules, level, { parentIds })` turns a level into an
  ordinary query: a step's parent query is the previous level
  (`{t:10, lf:[{t:5}]}` from `Q` → `{t:10, lf:[{t:5}, {all: Q}]}`), branches are
  `{any: […]}`. A text `Q` is embedded as is (`{all: "t:5"}`, see implementation notes). With `parentIds` the base is
  `{ids: parentIds}` instead of `Q` — the selection filter (E8).
- These queries compile to SQL (`links`, `related`, `connected`, relation markers are
  `EXISTS … OR EXISTS …` since 2026-09-28), so they page, sort and count like any result.
- UI: a level selector in `h-recordlist-toolbar` (None / 1–4, only levels the rules have);
  a second `HRecordList` beside the main one (wrapped under it when narrow), with its own
  paging. Selecting records in the main list filters the second one.

### Decisions (agreed 2026-09-30)

Background: legacy search merged rule results on the server (`rulesonly` 0–3: original +
all rules, all rules only, last rule only, original + last rule) and downloaded the whole
set. The new Data module loads by page, so it cannot do that.

| # | Decision |
|---|---|
| D1 | **Data loads its own level data**; it does not mirror the Graph. It does **not** use `/graph` (ID lists between steps, capped by `maxNodes`, cannot be paged). A level is a plain `/records` query built by `expansionLevelQuery`. |
| D2 | The query is built **on the client** by the shared helper in `shared/src/data/expansionRules.js` (to be written; Map/Timeline reuse it in Phase 4). The base is the **current query `Q`**, not record IDs — Data only knows the current page's IDs. IDs are used only for the selection filter (`parentIds`). |
| D3 | **Paging works**: each level is its own query, so the server pages, counts and sorts it like any result. No per-level download, no client-side splitting. |
| D4 | **Level modes** in the second list: *Level n only* (= legacy `rulesonly=2`) and *All levels 1..n* (`{any: [level 1 … level n]}`, = `rulesonly=1`). "Main + levels" (`rulesonly=0/3`) is not a list mode — see D8. |
| D5 | **No exclusion of lower levels.** A level shows every record its step reaches, including records already in level 0 or a lower level: a record can refer to itself directly or through several steps, and that is real data. |
| D6 | Data has its **own level selector and rule list** (all rules enabled by default). Syncing level and enabled rules with the Graph through the host (`SyncEngine`, like selection) is a **later step** — Graph levels are cumulative (0..n) and its enabled rules are Graph-local state, so the meaning must be agreed first. |
| D7 | **Selection filters** the level list (E8): `parentIds` = the main list's selection. No selection, or *select all*, → no filter. Highlighting instead of filtering is optional later: one extra request `{ids: <visible page ids>, all: levelQuery(parentIds = selection)}` returns the rows to mark. |
| D8 | **No cached level DataSources.** A level is a deterministic query from (`Q`, rules, level, mode, selection); `HRecordList`'s normal page cache is enough. It is reset when the query, rules or selection change. The level query can be **saved as a filter / opened as a new DataSource** (this also covers "main + levels" as `{any: [Q, …]}`), and is the Map layer / Timeline band of Phase 4. |
| D9 | **Graph and Data may differ.** Graph levels start from the loaded seed page (default 1,000) and each step from the previous step's returned IDs (capped); the Graph composes at most 5,000 nodes on the client. Data queries the full result. This is accepted for all presentation modules: each shows "X of total Y" when its data is partial (Graph legend, Map layer panel). |

### UI (agreed 2026-09-30)

| # | Decision |
|---|---|
| U1 | Data configuration: **Search in results** and **Export (CSV, Excel, PDF)** are OFF by default. New option **Expansion rules**, ON by default. |
| U2 | `HRecordList` never shows the Export dropdown — export is the Table (DataTables) view's feature. |
| U3 | With *Expansion rules* ON, the module header toolbar (`DataControlPanel`, right side) gets an **Expansion** button (`fa-hexagon-nodes`), caption hidden in a narrow panel (as in the Query Source editor). It toggles the level pane and a level bar in the header: the Graph's level navigator (`heurist-graph-expansion-navigator`) plus the list of rules (the DataSource's own and added ones). |
| U4 | The level pane is **not a nested data module** but `ExpansionLevelView` (`apps/data/src/core/`): a second `HRecordList` with its own load state (level query, generation, abort) sharing the main list's loaders and providers. No search, export, source actions or header. View mode follows the main list (List when the main list is Table). Its selection is **local** (view/edit only) — it is not sent to the host, so it never replaces the main selection that filters it. The pane sits right of the main list, below it when narrow. |
| U5 | `ExpansionLevelView` holds a list of *level panes* (one `HRecordList` + load state each). Now there is one; showing several levels (1–4) at once later only adds panes. |
| U6 | Toggle **Filter by selection** (`fa-link`) before the level navigator, **ON** by default (D7). |
| U7 | A new query for the same DataSource (e.g. parameterized search) reloads the level pane. `setDataSource` with a different DataSource hides the pane and resets the level to None; no rules → the Expansion button is disabled. Rules-only updates (`SyncEngine#setRules`) must reach Data (new `setRules` in its host adapter / public API). |
| U8 | `.h-recordlist-footer` `min-height: 25px`. |

### Implementation notes (Phase 3, 2026-09-30, not committed)

- **Text query inside a level.** `{plain: Q}` did not exist on the server (`plain` was a known but
  not executable predicate). Instead `all` / `any` / `not` now accept a plain-text query and parse
  it (`RecordQueryParser::expandTextGroups`, its sort is dropped); the helper embeds `Q` as is:
  `{connected: [{all: "t:10"}]}`. Branches are always `{any: [{all: …}, …]}` (`any` needs
  predicate objects, not strings). Test: `tests/QueryTextParserTest.php`.
- `expansionLevelQuery(q, rules, level, {parentIds, cumulative})` and `rulesDepth(rules)` in
  `shared/src/data/expansionRules.js`. A step without a traversal, and rules with `ignore`,
  reach nothing (as in the Graph).
- Checked on `osmak_mapping` (`t:10`, `connected` twice): level 1 equals the Graph step exactly.
  Level 2 has one record more (204877): the Graph's server step skips a node reached through
  an edge it already recorded from the other direction; the record is at level 1 in the Graph
  anyway. The level query is the correct one.
- **Frame.** The module element is now `.heurist-data-frame` (flex, container for queries); the
  main list keeps its `.heurist-data-root` element inside it, so its CSS is unchanged. The level
  pane is `.heurist-data-level-pane` beside it, with its own source-header caption ("Expansion
  level n[, linked to selection]"), which also leaves room for the header panel overlay. Below
  700px of module width the pane goes under the main list (`ResizeObserver`).
- The level list is created by the application's engine factory (`recordlist`), so
  `DataApplication` stays loadable in Node tests.
- Header: `DataExpansionBar` (Expansion button + level bar) sits outside
  `.heurist-module-panel-actions` (those show on hover only). Bar: Filter by selection, previous /
  level / next, *all levels up to n* (`fa-layer-group`, D4), rules menu (`fa-list-check`, checkboxes),
  Edit rules / Quick expansion for authors. The panel overflow is visible so the rules menu can
  drop out. Caption hidden below 620px (container query).
- "Same DataSource" (U7) = same `reference.type` and `id` of a saved source or filter. An ad-hoc
  query DataSource is never the same.
- `HRecordList`: public `reload()`; the Export dropdown and its dead code are removed.
- Not checked in a browser yet.

To do with D9: Timeline's band shows only a fixed "Partial load: only part of the result
set was loaded." (`TimelineLayerPanel.js`, not localized) — show "first X of Y records"
like the Map layer panel and localize it.

## 8. Map and Timeline (Phase 4, postponed)

The level query of §7 as a separate map layer / timeline group with its own style.

## 9. Tests

- Rule builder: multi-type encode/decode, next step after any/several targets, field list
  for several sources, depth limit, preview text.
- Graph: whole-graph levels only; rule check loads to the current level; rules-only
  DataSource change keeps cache and level; quick expansion appends to every short leaf and
  stops at `MAX_RULE_DEPTH`.
- Explorer: `editRules`/`updateRules` update the DataSource and the draft.
- Server: `t` lists in rule steps (graph step and `ExpansionEngine`).
- Data: level queries equal the Graph's level membership on a fixture.

## 10. Implementation notes (Phases 1–2)

- **"Any record type" is an empty picker**, not a separate entry: a record-type picker with
  nothing selected reads *Any record type* (for a step after several types, *Any of the
  previous types*) and saves no `t` / an empty parent.
- A generic traversal (*Any pointer…*) never fixes the target to a single type, even when
  only one is known; only a specific field with one target type does.
- **Graph cache is keyed by query path**, not by rule: a level is cached under the queries
  of its step and the steps above it. A rule extended by quick expansion or re-created in
  the dialog reuses its loaded levels. A changed rule keeps the checked state of the rule it
  replaces at the same position.
- Rules-only updates travel as `SyncEngine#setRules` → module `setRules` → Graph
  `setDataSourceRules`; Data, Map and Timeline are not re-sent the DataSource.
- Explorer's `canEditRules()` is true while the Query Source editor is available and a
  DataSource is active. Graph shows **Edit rules** (`fa-pen`) and **Quick expansion**
  (`fa-circle-plus`) only with the host capability `rulesEditing`.
- Server: `t` lists in rule steps needed no change (covered by
  `tests/ConnectedPredicateTest.php`).

## 11. Relationship predicates and paths (agreed 2026-09-29)

One meaning in search, graph steps, `ExpansionEngine` (linked output fields, map, timeline)
and path notation. *Outer* = the record the predicate is on; *linked* = the records in its value.

| Form | Direction | Relationship types | Record types (field N: owners O, targets T; empty = any) |
|---|---|---|---|
| `rt[:N]` | strict: outer is the stored **source** | stored type ∈ `r` / vocabulary of N (+ child terms) | outer ∈ O, linked ∈ T |
| `rf[:N]` | strict: outer is the stored **target** | stored type ∈ `r` / vocabulary of N (+ child terms) | outer ∈ T, linked ∈ O |
| `related[:N]` | **either** stored direction | stored type or its inverse ∈ `r` / vocabulary of N | (outer ∈ O and linked ∈ T) or (outer ∈ T and linked ∈ O) |

- **N is always a relationship (relmarker) field**, never a relationship type. It supplies
  the vocabulary and the owner/target record-type pair. (`related:N` used to mean relation
  types; legacy ignores that suffix, so only modern queries change.)
- **`r` inside the value is the stored relation type** (= `relf:<DT_RELATION_TYPE>`), with
  child terms. No perspective conversion for `rt`/`rf`; for `related` the term or its inverse
  matches. With both N and `r`, both must hold.
- Relationship-record fields go **inside** the value: `r`, `relf:K`, `r:K`.
- The record-type pair applies always; a `t` in the value narrows it further.
- **Path notation** (map/time/column fields, compact rules): `lt`, `lf`, `rt`, `rf`, **`r`**
  (= `related`), each followed by a field ID: `10:r155:14:10`.
- **Client:** field-path editors write `r<field>` for relationship fields (saved
  `lt/lf/rt/rf` relmarker hops are converted when opened); the rule builder and the Filter
  Builder write relationship fields as `related:<field>` (+ `r`).

## 12. Smart expansion (Graph, implemented 2026-10-01, not committed)

A third author button next to **Quick expansion** (`fa-wand-magic-sparkles`, same
visibility and enabled state):

1. A temporary copy of the rules gets the quick-expansion step at every branch end
   (any pointer or relationship, any record type). Nothing is saved yet.
2. One `/records` request with `detail=rectypes` counts what these new steps reach
   from the current result (`quickStepReachQuery()` in `shared/src/data/expansionRules.js`;
   branches joined with `any`, rules marked `ignore` skipped).
3. An `HValuePicker` dialog lists the reached record types with their counts (most
   first), several can be chosen. No records reached: a message, no dialog.
4. **Expand**: the same step, restricted to the chosen types
   (`appendQuickStep(rules, MAX_RULE_DEPTH, { types })` → `{t:[…], connected:[…]}`),
   is written into the DataSource through the host and every rule is shown to the
   new deepest level, exactly as Quick expansion.

The Graph control panel now has a fixed top (pin, title, show data) and a fixed
bottom (expansion rules and the level/expand buttons); only the nodes and edges
legend between them scrolls.

**Data module (2026-10-01)**: when expansion rules are offered and the DataSource has
rules, the Data control panel has a drop-down body (angle toggle, as Graph/Timeline)
with the Expansion Rules section: the rule list, then Filter by selection, previous /
level / next, all levels up to n and, for authors, Edit rules / Quick expansion /
**Smart expansion**. The Expansion button (show the level pane) stays in the header; the
level controls are disabled while the pane is hidden. The record-type dialog is shared
(`shared/src/ui/SmartExpansionDialog.js`, used by Graph too).

**Changed 2026-10-01 (replaces U7 for Data)**: the Expansion button is always enabled
while the "Expansion rules" option is on (without rules the section offers Quick /
Smart expansion to create them). It opens and closes the panel's drop-down body
together with the level pane; the angle toggle (now first in the header) shows or
hides the body only. Expansion is closed and reset (pane hidden, level 1, section
closed - `heurist-data-expansion-reset`) only by: loading another Query Source or Saved
Filter, a changed record type of the query (QSE), or removed rules (QSE Clear)
(`sameExpansionContext` in DataApplication.js). A Filter Form submit, or another query
of the same record type, keeps the pane (corrected the same day). Navigator order in Graph and Data:
Link (Data only), Quick expansion, Smart expansion, previous / level / next, all levels
(Data only), Edit rules at the right. Graph: Quick/Smart expansion show "Maximum allowed
nodes limit is NNN" and do nothing when the graph already has the maximum nodes; the
main result shows a rotating loading indicator instead of "No records" while it loads.
