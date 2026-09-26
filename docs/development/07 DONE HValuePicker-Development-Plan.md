# HValuePicker, value sources and facet values — development plan

Status: **Phases 1–7 implemented 2026-09-26 (not committed).** Phase 8 (edit forms, date/number
grouping) is not started. §9 lists where the implementation differs from this plan.

This plan replaces the "Phase 3 — facet counts" sections of
`DONE Explorer-Query-Source-and-Parameterized-Filtering-Development-Plan.md` §13
and the `FacetCounter` sketch in `DONE explorer-development-plan-phase2.md`.

---

## 1. Goal

A filterable replacement for `<select>` for long or uncertain option lists, used by
HFilterBuilder, the inline helper, HFilterForm and (later) edit forms, and the
server support it needs: unique field values with counts (the basis of facets)
and a visibility-scoped list of users and groups.

## 2. Decisions

| # | Decision |
|---|---|
| V1 | The widget is called **`HValuePicker`**. |
| V2 | Widget and data are separate. `HValuePicker` only renders the list. **Value sources** supply the items through one `load()` contract (§4). |
| V3 | The server feature is **`detail=values` + `field=<spec>`** on the records query (not `detail=unique` / `fields=`). |
| V4 | **Public `/api` everywhere.** `detail=values` and users/groups are served by the existing public routes (`/api/{db}/records`, `/api/{db}/sys`). No internal endpoint and no new client transport. `api.php` already resolves the current user from the session or a Bearer token, so visibility (V7) and tag scoping work there. Abuse is limited by the capped `limit` and the required `field`. |
| V5 | **Filter Builder and the inline helper never ask the server for values.** Enum fields show the full vocabulary (HDbDefs). User/group fields show the full visible list (HDbDefs). Text fields stay plain inputs. |
| V6 | Users and groups are **loaded once on init and kept in HDbDefs** as a runtime overlay, like the rectype counts. Each group carries the current user's role: `none` / `member` / `admin`. |
| V7 | Visibility: a **database admin** (admin of group 1, *Database Managers*) sees all groups and users. **Other users** see only their own groups (member/admin) and themselves. **Guests** get nothing; user/group inputs become direct input (an ID). |
| V8 | Sort: **alphabetical** in pickers; **by count** (then alphabetical) for facets; **terms always in vocabulary order**, facets included. |
| V9 | Client/server filtering: load up to 1000 values once. If `total` ≤ the limit, the source is `complete` and all filtering is local. Otherwise typing re-queries with `text=` (debounced, the previous request aborted). |
| V10 | Render at most ~200 rows; the last row reads "*x* of *y* shown". The filter row is shown when the list is incomplete or has more than 30 items. |
| V11 | Values are loaded when the picker first opens, not when the widget is created. |
| V12 | Picking a value from a list for a **text** field produces an **exact-match** predicate. Several values are combined with OR. |
| V13 | Enum facets: ancestor terms of values that occur are shown **without a count** and stay selectable. |
| V14 | The radio/checkbox truncation threshold is set in the designer **once per form** (`listThreshold`, default 20 — a 5/10/20/50 selector since 2026-09-26). |
| V15 | Dynamic facets **hide values whose count drops to zero**, except a currently selected value, which stays visible. |

## 3. Filter Form Designer options (agreed)

Per parameter, stored in the `filterForm` layout child next to the existing
`mode` / `orientation`:

```js
{ input: 'country', mode: 'direct'|'select'|'radio'|'checkbox',
  orientation: 'column'|'inline', facets: true|false }
```

### A. Enum fields

- **Calculate facets:** yes / no.
  - *no*: the full vocabulary from HDbDefs. No request.
  - *yes*: `detail=values` over the form's query. Only terms that occur are listed, with counts.
- **Presentation:** `select` / `radio` / `checkbox` (column or inline).
  - `select` is `HValuePicker` (a combobox). It replaces today's `<select>`; existing layouts with `mode: 'select'` get the picker without migration.
  - `radio` / `checkbox`: an explicit list when there are fewer than *N* values. Otherwise the list is **truncated to *N*** with a picker below it for the rest. A value chosen from the picker is added to the explicit list, checked.
  - *N* is the **form-wide** truncation threshold (default 20), set once in the designer for the entire form: `layout.settings.listThreshold`.

### B. Text fields (freetext, and other scalar types later)

- **Presentation:** `direct` (default) / `select` / `radio` / `checkbox`.
  - `direct`: a plain input. No facets, no request.
  - The other modes always load values with `detail=values`, so facets are implied. Otherwise they behave exactly as for enum: picker, or an explicit list truncated to 30 with a picker below.
- The `facets` flag is ignored for text (a list mode implies it).

### Scope of facet values

- Phase 5 (static facets): values over the form's **base query**, computed once per form open.
- Phase 6 (dynamic facets): values over the base query **with every other filled parameter applied and this parameter removed**, recomputed when another parameter changes.

## 4. Client architecture

### 4.1 Value source contract

```js
source.load({ text = '', limit = 1000, signal }) → Promise<{
  items: [{ value, label, depth?, count?, group?, rty?, disabled? }],
  total,       // distinct values available (may exceed items.length)
  complete     // true → items are everything; the widget filters locally
}>
```

Sources live in `shared/src/data/valueSources/` and must not import DOM or
presentation engines.

| Source | Data | Server |
|---|---|---|
| `StaticSource(items)` | fixed lists (access, bool…) | no |
| `TermSource(dbdefs, vocabId)` | vocabulary tree with `depth`; a text filter keeps the ancestors of matches (context rows) | no |
| `UserGroupSource(dbdefs, { groups, users })` | groups, a separator, then users, from the HDbDefs overlay | no |
| `FieldValueSource(api, { query, field })` | `detail=values`; `query` may be a function (for dynamic facets) | yes |
| `FacetTermSource(dbdefs, vocabId, fieldValueSource)` | vocabulary order, only terms that occur plus their ancestors; ancestors have no count and stay selectable | yes |

### 4.2 HValuePicker

`shared/src/widgets/picker/HValuePicker.js` + `.css` beside it.

- **Panel** (inline list): a sticky filter row (`fa-filter` | input | clear), then the list, "Nothing matches the filter", and "*x* of *y* shown".
- **Combobox** wrapper: a button/field showing the selection, and a popover containing the panel. Single or multiple selection.
- **Controlled mode** with no input of its own, for the inline helper: `setFilterText(text)`, `moveActive(±1)`, `commitActive()`, `onPick(item)`.
- Keyboard (↑/↓/Home/End/Enter/Esc) and ARIA `combobox` / `listbox` / `option`.
- Reports its state (`loading`, `error`) and degrades when the source fails: a request error falls back to the full vocabulary (enum) or direct input (text, user/group).

### 4.3 HInput integration

- `HInputEnum`: new `mode: 'picker'`. Used for `select` whenever the source is incomplete or has more than 30 items. `radio` / `checkbox` gain truncation with a picker below.
- `HInputText`: new `mode` / `source` options for the list modes. `direct` stays the current behaviour.
- `createHInput` gains a `user` / `group` type backed by `UserGroupSource` (a picker; direct input for guests).
- `HFilterForm` builds the sources and passes them to the inputs. A host may inject a `valueSourceFactory(parameter, context)` so the shared widget does not know the endpoint.

### 4.4 HDbDefs overlay (users and groups)

```js
setUserGroups({ currentUserId, isDbAdmin, groups: [{ id, name, role }], users: [{ id, name }] } | null)
hasUserGroups()  groups()  users()  userGroupName(id)  groupRole(id)  isDbAdmin()
```

Loaded by a new Explorer `UserGroupManager` (like `RecordTypeManager`) at init.
Reloaded on login/logout, and cleared for guests. `queryDescribe` can then show
names instead of IDs for owner/addedby/user.

### 4.5 Transport

No change: everything uses the existing `HeuristApiClient.get()` against the
public `/api` (`/records/` with `detail=values`, `/sys` for users/groups). The
current user comes from the session or the client's `accessToken`.

## 5. Server contract (heurist repo)

### 5.1 `detail=values`

```
GET /api/{db}/records/?q=<any query>&detail=values&field=<spec>
                      [&text=<substring>][&limit=1000][&offset=0][&sort=count|value]
```

- `q` is any query, so rectype is optional, and it covers "current result only" and facets.
- `field`: a detail-type ID, or `owner`, `addedby`, `tag`, `rectype`, `access`. Linked paths come later.
- `limit` defaults to 1000 and is capped at 1000. `field` is required (400 otherwise).
- Served by the shared `RecordQueryController`, so `api.php` and `recordQuery.php` behave the same. The OpenAPI description gets the new `detail` value and the `field` / `text` parameters.

Response:

```js
{ query, field, total,              // total = number of distinct values
  values: [
    { value: 'France', count: 1245 },                         // text / numeric
    { value: 5123, count: 88 },                               // enum: trm_ID (label client-side)
    { value: 4521, count: 12, label: 'Paris', rty: 12 },      // resource / relmarker
    { value: 2, count: 30, label: 'Database managers', kind: 'group' }, // owner / addedby
    { value: 17, count: 5, label: 'medieval' }                // tag
  ] }
```

- `count` = number of distinct records. SQL shape:
  `SELECT dtl_Value, COUNT(DISTINCT dtl_RecID) FROM recDetails WHERE dtl_DetailTypeID=? AND dtl_RecID IN (<compiled query>) GROUP BY … ORDER BY … LIMIT`,
  plus a distinct count for `total`. Follow the `executeRectypeCounts` precedent in `QueryExecutor`.
- Text values are compared and returned truncated to 100 characters. Blocktext is rejected for now.
- Visibility follows from the compiled query. Tags are limited to tags of the current user and their groups (guests: empty).
- Enum labels are not resolved server-side, so they follow the UI language through HDbDefs.

### 5.2 Users and groups

- `SystemEntitySchemaRegistry` gains a `group` type (`sysUGrps`, `ugr_Type="workgroup"`) with a virtual `role` field for the current user (`sysUsrGrpLinks.ugl_Role` → `admin` / `member`, otherwise `none`).
- The visibility rule V7 is enforced in `SystemQueryService` for `user` and `group`, using `RuntimeContext` (`userId`, admin of group 1). This tightens the current public `sys/user`, which lists all users to anyone. The explorer only calls `/sys` for saved filters, so nothing depends on the open list.
- The explorer's init load uses the public `/api/{db}/sys`: `t:group` with `fields=role`, and `t:user`, in parallel.

## 6. Phases

| # | Phase | Scope | Server |
|---|---|---|---|
| 0 | Contract | This document | – |
| 1 | Picker panel | `HValuePicker` panel, `StaticSource`, `TermSource`, keyboard/ARIA, local filtering, "x of y", tests | no |
| 2 | Combobox + enum | Combobox wrapper; `HInputEnum mode:'picker'` + threshold; builder term values; HFilterForm `select` → picker; radio/checkbox truncation + picker below; inline-helper enum values via controlled mode | no |
| 3 | Users & groups | Server: `group` type, `role`, V7 rule on `/sys`; client: `UserGroupManager`, HDbDefs overlay, `UserGroupSource`; builder + inline helper owner/addedby/user; guest → direct input; describer shows names | yes |
| 4 | `detail=values` (scalar) | Server: text/enum/numeric + header fields, counts, `total`, `text`, limit cap, OpenAPI description, tests in `heurist/tests`; client: `FieldValueSource` with complete/incremental logic (V9) | yes |
| 5 | Designer + static facets | Designer options §3 (enum facets yes/no + presentation; text direct/select/radio/checkbox; form-wide list threshold); `FacetTermSource`; values over the base query; exact-match composition for text (V12) | reuses 4 |
| 6 | Dynamic facets | Per-parameter query without that parameter; recompute on change (debounced, cache keyed by field + other values); counts, sort by count; hide zero-count values except the selected one (V15) | reuses 4 |
| 7 | Resources & tags | `detail=values` for resource/relmarker (`rec_ID`, `rty`, title) and tags; form presentation for resource fields | yes |
| 8 | Later | Edit-form resource/term lookup (`HInputResource`); dates grouped by year (**done 2026-09-26**: `detail=ranges`); numeric min/max for sliders (**done 2026-09-26**: `detail=minmax`, see §9) | – |

Every phase: `npm test`, the affected independent build, and the heurist tests for server phases.

## 7. Open points

None. The former points are now decisions V13–V15.

## 8. Changelog

- 2026-09-25 — Plan created. Decisions V1–V12 and designer options §3 agreed with Artem.
- 2026-09-25 — V4 reversed: public `/api` everywhere (no `recordQuery.php` / `systemQuery.php`, no `getInternal`). Open points closed as V13–V15.
- 2026-09-26 — Phases 1–7 implemented; deviations recorded in §9.

## 9. Implementation notes (2026-09-26)

Where the code is and where it differs from the plan above.

**Client (heurist-explorer)**

- `shared/src/data/valueSources/` — `valueList.js` (pure filtering, sorting, row limits,
  truncation, facet merging), `localSources.js` (`StaticSource`, `TermSource`,
  `UserGroupSource`), `FieldValueSource.js` (`FieldValueSource`, `FacetTermSource`).
- `shared/src/widgets/picker/` — `HValuePicker` (panel, incl. controlled mode) and
  `HValueCombo` (combobox + popover).
- `HInputEnum` rewritten: `select` is always the combobox (the filter row hides itself for
  ≤ 30 items, so short lists look like a select); `radio`/`checkbox` truncate at
  `listThreshold` with a picker below; accepts `source` or the legacy `terms`; `numeric:false`
  for text values; `fallbackSource` when a source fails; `refresh()` for facets.
- HDbDefs overlay: `setUserGroups`, `hasUserGroups`, `groups`, `users`, `userGroupName`,
  `groupRole`, `isDbAdmin`, `currentUserId`. Loaded by `apps/explorer/src/core/UserGroupManager.js`
  at start-up (non-blocking).
- **Deviation — current user:** the explorer had no notion of the logged-in user, so the
  server's `/sys` user/group responses add `meta.currentUser {id, isAdmin}`.
- **Deviation — inline helper:** it keeps its own hint dropdown (it mixes operators and values
  and already drives the list from the textarea). It gets owner/addedby/user values from
  `UserGroupSource`; enum values already came from HDbDefs. The picker's controlled mode exists
  but is not used there.
- **Deviation — Filter Builder text fields:** no value suggestions, because V5 (no server
  requests in the builder) wins over the Phase 4 line that mentioned them.
- **Deviation — facets are always dynamic:** Phases 5 and 6 were merged. A facet counts over the
  form's query with every other filled parameter applied and itself left out; with nothing
  filled that is the base query (static facets). Other facets recount 300 ms after a change.
- **Nested parameters** (inside `lt`/`lf`/`related` sub-queries) count over their record type
  only (`[{t: <type>}]`), not over the linked set.
- **Layout keys:** `layout.settings.listThreshold` (not the layout root, next to the other
  settings); child `facets: true`; child `exact: true` for field-based text in a list mode.
  `resolveQueryParameters(query, values, filterForm)` takes the layout to apply `exact`
  (`=value`, several values → `{any:[…]}`, negated template → `!=` and `{all:[…]}`).
  Tag/visibility lists are not marked exact: tag IDs and visibility keywords already match exactly.
- Owner/creator/bookmarked-by parameters in HFilterForm use the users/groups picker
  automatically (direct input for guests); the designer shows no presentation options for them.
- Resource-field parameters can use list modes (values are record IDs with titles;
  `=<id>` is a numeric comparison on the server). Relmarkers are not form parameters.

**Server (heurist)**

- `srv/Records/Query/FieldValueCounter.php` — new; `RecordSearchService::countValues()`;
  `QueryBuilder::compileConditions()` / `accessConditions()`; `SearchRequest` value fields;
  `RecordQueryController` handles `detail=values` (`field`, `text`, and `sort` = value order).
  Fallback queries are counted over their ID list in chunks.
- `/sys`: `group` type with virtual `role`; V7 visibility in `SystemQueryBuilder`;
  `meta.currentUser`. Guests are refused by `api.php` (401) before reaching it.
- Tests: `tests/FieldValueCounterTest.php` (new, 24 checks against plain-SQL ground truth);
  `tests/SystemQueryTest.php` extended (group, role, visibility, currentUser).
- `documentation/api/heurist-openapi.yaml` updated (not machine-validated: no YAML parser was
  available).
- Timing on osmak_mapping (~205k records): a whole-database facet ≈ 1.9 s; a record-type
  scoped one ≈ 0.3 s.

### 2026-09-26 — `detail=minmax` (auto slider bounds)

- Server (heurist `srv/`): `Records/Query/FieldValueRange.php`; `RecordSearchService::valueRange`;
  `RecordQueryController` routes `detail=minmax&field=<dty|added|modified>` → `{query, field, type
  (number|date), min, max, count}`. Numeric fields: integer/float/year (non-numeric values ignored). Date
  fields: `recDetailsDateIndex` estimated bounds, converted to ISO (`FieldValueRange::decimalToDate`, a
  missing month/day widens to the period). Null bounds without values. Live test
  `tests/FieldValueRangeTest.php`; OpenAPI `RecordValueRangeResponse`.
- Client: `fetchFieldRange(api, {query, field})`; `HInputNumeric/HInputDate.setBounds(min, max)` adds the
  sliders after render. `HFilterForm` requests bounds once per render for a slider without both bounds,
  over `_facetQuery(id)` (other filled parameters applied, this one left out). Without the records API the
  direct From/To inputs remain. Date bounds before year 1 cannot drive the slider (direct inputs only).
- Designer: slider `[] auto` (checked = no bounds stored). Legacy slider facets (`isfacet:1`) now convert to
  auto sliders (conversion plan §12 #10 amended).

### 2026-09-26 — `detail=ranges` (date/number lists of ranges)

- Decision (Artem): counts **follow the field's operator**: overlap (`<>`, "falls in") counts a date in
  every range its span touches; within (`><`) only in the range holding its whole span. So selecting a
  range finds exactly its count (the sum of counts may exceed the total).
- Server: `Records/Query/FieldValueBuckets.php`; `detail=ranges&field=<dty|added|modified>` with
  `groupby=month|year|decade|century` (dates) or `ranges=1..20` (numbers), `match=overlap|within` →
  `{field, type, groupby|ranges, match, total, truncated, buckets:[{from, to, label, count}]}`. Ranges are a
  derived table joined on the search's own comparison; detail date bounds come from `Temporal` exactly as
  the search parses `from/to`. Decades/centuries start at multiples of 10/100 (legacy). Numbers: round
  steps (1, 2, 2.5, 5 × 10^n), integer fields whole non-overlapping ranges. More than 1000 ranges
  (months across millennia, prehistoric years): sparse — only ranges holding a start/end, at most 1000
  (`truncated`). Live test `tests/FieldValueBucketsTest.php` checks **every** bucket against the search.
- Client: `RangeBucketSource` (item value `"from/to"`); `HFilterForm` presents a date/number with a range
  operator + list mode + `groupBy`/`ranges` as an enum over it (facet-refreshed);
  `resolveQueryParameters` fills `<>$A$/$B$`, `$A$<>$B$` or a single `$A$` (→ `from/to`), several picked
  ranges → `any`. Designer offers all presentations for date/number (Artem, 2026-09-26): with a
  non-range operator (`$A$`, `>$A$`, `=$A$`) the picked range replaces the operator — dates `from/to`,
  numbers `from<>to`; a negation is dropped. Single-choice lists show no radio circles (click selects,
  click on the selected item clears).
- Also fixed: `detail=values` and `detail=minmax` did not apply `detailVisibilityCondition` — hidden
  detail values could be listed/bounded for guests and non-owners. Now all three detail modes apply it
  (`QueryBuilder::detailVisibilityCondition`). Numbers compare as `CAST(... AS DECIMAL(65,20))` like the
  search. Not tested as a guest (the live tests run as the database owner).
- "No values": an auto slider without values keeps the From/To inputs with a note "No values"; an empty
  radio/checkbox list shows "No values"; the picker already did.
- Bounds note: auto sliders show the field's range under the control (`HInput.setNote`,
  `boundsNote`: a bound on a year boundary shows the year alone).

> **TODO — Implement slider for prehistoric dates.** Since 2026-09-26 the date slider reads signed years
> (`-0500-01-01`, `-12000-06-01`; `sliderDay`/`sliderDate` in `HInputDate`) within JavaScript's date range,
> about ±271 000 years; the calendar still holds 0000–9999 only, other slider values are written as text.
> Deeper time (e.g. -1 000 000 000 in osmak_mapping, field 9) shows the direct From/To inputs with the
> bounds as a note below. A deep-time slider needs a year-based scale (possibly logarithmic) instead of
> day numbers.
>
> Also 2026-09-26: Filter Form date inputs accept any text the server reads (`1850`, `1850-07`, `-500`;
> `allowLegacyText`) instead of rejecting everything but YYYY-MM-DD, and the From ≤ To check compares days
> (it compared strings: `-0500` > `-0100`, `900` > `1850`) and is skipped for partial dates.

**Fixed 2026-09-26:** `detailDateCondition` accepts the infix forms `from<>to` / `from><to` as the prefix
forms `<>from/to` / `><from/to` (they were rejected as invalid temporal values).

**Fixed 2026-09-26 in `srv/Utilities/Temporal.php` only** (legacy `hserv/utilities/Temporal.php` unchanged):
search values cover whole periods (`2026` → [2026, 2026.1231], `2026-07` → a month, `-100` →
[-100.1231, -100]; bounds on Jan 1 / Dec 31 or the first/last day of a month include values stored with
year/month precision); `decimalToYMD($date, $upper = null)` fixed (keeps precision, or full lower/upper
dates) and, with `decimalParts` / `daysInMonth`, shared by `FieldValueRange` / `FieldValueBuckets`.
Stored (non-search) bounds are unchanged; no reindex. Live test `tests/TemporalSearchTest.php`.
The findings below marked *(fixed)* are resolved by this.

**Findings (server, pre-existing; documented in `Temporal::getMinMax`, `decimalToYMD`,
`FieldPredicateCompiler::detailDateCondition`/`fieldCondition`):**
- *(fixed)* **A plain year finds almost nothing:** `f:9:"2026"` finds 0 of the 25 records dated in 2026 (only
  values stored as the plain year match); `2026/2026` finds all 25.
- *(fixed for whole years; month ranges inside negative years still wrong)* **Negative years with month/day** are indexed as `-100.0401` (numerically *before* year -100), and
  `Temporal("-100")` gives `[-100, -100]`, so a search for the year -100 does not find "April -100"; the
  ranges agree with the search and leave it out too.
- *(fixed)* **Plain month values** (`f:9:"2026-07"`, "falls in") find nothing: `Temporal("2026-07", true)` gives
  `[2026, 7.1231]`. Ranges use explicit `YYYY-MM-01/YYYY-MM-DD`, which works.
- **`year` fields** compare as strings in the search (`scalarCondition`), while ranges/minmax compare numbers.
