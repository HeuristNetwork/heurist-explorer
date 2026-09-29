# Expansion levels in Graph and Data — development plan

Status: **Phases 1–2 implemented 2026-09-28 (not committed).** Phase 3 (Data) is next; Phase 4
(Map, Timeline) is postponed. §10 lists where the implementation differs from this plan.

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
  `{any: […]}`. A text `Q` is wrapped as `{plain: Q}`. With `parentIds` the base is
  `{ids: parentIds}` instead of `Q` — the selection filter (E8).
- These queries compile to SQL (`links`, `related`, `connected`, relation markers are
  `EXISTS … OR EXISTS …` since 2026-09-28), so they page, sort and count like any result.
- UI: a level selector in `h-recordlist-toolbar` (None / 1–4, only levels the rules have);
  a second `HRecordList` beside the main one (wrapped under it when narrow), with its own
  paging. Selecting records in the main list filters the second one.

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
