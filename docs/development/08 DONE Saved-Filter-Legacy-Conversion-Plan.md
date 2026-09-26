# Saved Filters — legacy → Explorer conversion (parameter comparison)

Status: **decisions final (§12); implementation in `apps/explorer/src/legacy/`** (2026-09-24). Input: `usrSavedSearches` exports of
`digital_harlem`, `judaism_and_rome`, `libraries_readers`.

Legacy references (read-only):

| Concern | File |
|---|---|
| Parse stored `svs_Query` (URL / JSON / faceted) | `heurist/hclient/core/utils_query.js` → `parseHeuristQuery` |
| Faceted runtime (facet code → query, value substitution) | `heurist/hclient/widgets/search/search_faceted.js` → `_initFacetQueries`, `_fillQueryWithValues`, `doSearch` |
| Facet code → query path | `utils_query.js` → `createFacetQuery`; merge: `mergeHeuristQuery` |
| Faceted wizard (what the options mean) | `search_faceted_wiz.js` |
| Expansion rules (codes ↔ text ↔ JSON) | `heurist/hclient/widgets/search/ruleBuilder.js` → `_getQuery`, `getRulesJSON` |
| Legacy rule execution / `rulesonly` | `heurist/hserv/records/search/recordSearch.php` ~2625–2840 |
| Legacy key suffix parsing (`linkedfrom:10:240`) | `heurist/hserv/records/search/composeSql.php` ~1569 |

New-side references:

| Concern | File |
|---|---|
| Saved filter load/resolve | `apps/explorer/src/core/SavedFilterManager.js` |
| Runtime DataSource | `apps/explorer/src/core/DataSource.js` |
| Placeholders `$NAME$`, range, resolve | `shared/src/data/queryParameters.js` |
| Filter form layout + inputs | `shared/src/widgets/filter/HFilterForm.js`, `shared/src/widgets/form/inputs/*` |
| Canonical rule JSON | `apps/explorer/src/widgets/query-source/helpers/HRuleBuilder.js` (`encodeRuleQuery`, `decodeRule`) |
| Server rules | `heurist/srv/Records/Expansion/ExpansionRuleParser.php` |
| Server predicate keys | `heurist/srv/Records/Query/Parser/RecordQueryParser.php`, `Compiler/QueryBuilder.php` |

---

## 0. Stored formats found in `svs_Query`

| Kind | Recognised by | Example (db:id) | DH | J&R | LR |
|---|---|---|---|---|---|
| **A. URL params** | string starts with `?` | `?q=t:14 f:74:4339&rules=[…]` (DH:104) | 39 | 1 | 11 |
| **B. JSON request** | JSON object with `q` and/or `rules`, no `rectypes` | `{"ui_name":…,"q":"t:5","w":"all","rules":null,"rulesonly":0}` (LR:30) | 1 | 8 | 3 |
| **C. Faceted v2** | JSON object with `rectypes[]` and `version:2` | DH:66, J&R:3, LR:36 | 14 | 13 | 22 |
| **D. Faceted v1 (obsolete)** | `rectypes[]` + `facets` is array of arrays, `isadvanced`, `fieldtypes` | DH:20, DH:26 | 2 | 0 | 0 |
| **E. Plain text** | anything else | not present in samples | – | – | – |

**Current Explorer defect:** `parseSavedFilterDefinition()` handles only B/E. For A the whole string
`?q=…&w=…&rules=…` becomes `request.q` (broken query). For C/D there is no `q`, so
`isEmptySearchRequest()` returns true and the filter silently does nothing. `rules` from B are passed
as a JSON *string*, never normalized from the legacy text/codes form.

---

## 1. Target (new) shape

Every legacy row resolves to:

```js
{
  title,                         // svs_Name (ui_name only if it differs — see §2)
  notes,                         // ui_notes / &notes=
  request: {
    q,                           // JSON array (text kept as text only for kinds A/B, see §6)
    w,                           // 'all' | 'bookmark'
    rules,                       // canonical JSON rule tree (§4), [] when none
    rulesonly                    // integer 0..3
  },
  filterForm                     // only for kind C: layout {version:1, settings, groups[]}
}
```

For kind C the query is a template containing `$NAME$` placeholders (`/^\$[A-Za-z][A-Za-z0-9_]*\$$/`);
`filterForm` arranges those placeholders.

---

## 2. Kind A — URL parameters (and kind B JSON keys)

| Legacy param (A) | Legacy key (B) | Meaning | New | Conversion |
|---|---|---|---|---|
| `q` | `q` | query: text, or JSON object/array (B: often a JSON *string* inside JSON) | `request.q` | JSON → parse, object form `{"t":"10","f:1":"x"}` → array form `[{"t":"10"},{"f:1":"x"}]`; key rewrites §6. Text → keep as text (server parses) or convert (decision §12-3). |
| `w` | `w` | domain `all` / `bookmark` / `b` | `request.w` | normalize `b`→`bookmark`, empty/null → `all`. ⚠ `srv` `/records` ignores `w` today. |
| `rules` | `rules` | expansion rules (JSON string, text+codes or JSON queries) | `request.rules` | §4 |
| `rulesonly` | `rulesonly` | 0..3, may be string `"2"` | `request.rulesonly` | `Number()`; §5 |
| `notes` | `ui_notes` | description | `notes` | copy |
| – | `ui_name`, `ui_name_xx`, `ui_notes_xx` | name + localized name/notes | `title`, localized titles | `svs_Name` wins; keep localized variants |
| `viewmode` | `viewmode` | result list view mode | – | drop (no Explorer equivalent) |
| `db` | `db` | database | – | drop (filter lives in its db) |
| `layout` | – | legacy UI layout (DH:11 `layout=srch:l-i-l\|nav:\|app:,Map`) | – | drop |
| `rtfilters` | – | legacy rectype filter panel (DH:11) | – | drop, report |
| (inside `q` text) `sortby:x` | `{"sortby":x}` | sort | stays in `q` | keep (server supports `sortby`) |
| – | `primary_rt` | primary rectype of result | – | drop |

---

## 3. Kind C — faceted search: top-level parameters

| Legacy key | Legacy meaning | New | Conversion / note |
|---|---|---|---|
| `rectypes[]` | main record type(s) | first predicate `{"t":"<ids joined ,>"}` | Already emitted by the facet code walker (§8). |
| `facets[]` | facet definitions | query template + `filterForm.groups[0].children` | §7–§10 |
| `version` | 2 | – | v1 (kind D) → not convertible, report |
| `domain` | `all`/`bookmark`/`b`/null | `request.w` | as §2 |
| `rules` | expansion rules (JSON string) | `request.rules` | §4 |
| `rulesonly` | 0..3 (number or string) | `request.rulesonly` | §5 |
| `sup_filter` | "preliminary" filter set at design time, merged into every search (JSON string, JSON or **text**, e.g. `t:7 sortby:-m`) | literal predicates appended to `q` template | JSON → merged. Text → client `parseTextQuery`; if it fails, warn the user and show the old query (§12-3). Its own `sortby` → see `sort_order`. |
| `ui_prelim_filter_toggle` | user may switch `sup_filter` on/off | dropped (§12-5) | If `false` → always merge. If `true` → merge when initially active (`ui_prelim_filter_toggle_init`≠false XOR `_mode`==1). |
| `ui_prelim_filter_toggle_mode` | 0 direct / 1 reverse checkbox | ✗ | used only to compute initial state |
| `ui_prelim_filter_toggle_label`, `_init` | label / initial state | ✗ | report |
| `ui_additional_filter` | show “Search everything” input → `add_filter` merged as `{"f":value}` (any field) or, if it contains `:`, as a query string | extra placeholder `{"f":"$SEARCH$"}` + child `{input:"SEARCH", label}` | Any-field `f` is supported by `srv` (`anyFieldCondition`). Query-string mode is lost. |
| `ui_additional_filter_label` | label | child `label` | |
| `ui_spatial_filter` | show map-extent input | placeholder `{"geo":"$GEO$"}` + child `{input:"GEO"}` (HInputGeo) | |
| `ui_spatial_filter_label` | label | child `label` | |
| `ui_spatial_filter_initial` + `ui_spatial_filter_init` | initial WKT, applied at start (without `_init` it only seeds the map digitizer) | shown filter: child `default` of the `GEO` field; hidden filter: literal `{"geo":…}`; without `_init`: dropped | §12-6 (amended 2026-09-25) |
| `ui_temporal_filter_initial` | e.g. `after:"1 week ago"`, applied **only when the form is empty** | literal `{"after":…}` | §12-6 |
| `search_on_reset` | run search with empty form (init/reset) | `filterForm.settings.skipEmptySearch` | `search_on_reset:false` ⇒ `true` §12-7 |
| `sort_order` | `t`, `-a`, `f:9`, `id`, … ; absent → `sortby:t` | `{"sortby":…}` appended to `q` | always emit; legacy default `t`. If `sup_filter` also has `sortby`, prefer `sort_order`. |
| `ui_title` | header text of the facet panel | Query Source / DataSource `title` | when non-empty §12-8 |
| `ui_name`, `ui_notes` | name/notes | `title`/`notes` | as §2 |
| `ui_viewmode` | result view mode | – | drop |
| `title_hierarchy` | show facet path in header | `filterForm.settings.showHierarchy` | when true |
| `viewport` | show N values then “more” (default 5, 0 = all) | `filterForm.settings.listThreshold` | missing ⇒ 5, 0 ⇒ 1000; omitted when 20 (new default) |
| `accordion_view`, `show_accordion_icons` | collapsible facets | `filterForm.settings.accordion` | `accordion_view` only; icons always shown |
| `ui_counts_mode`, `ui_counts_align` | count badge style | `settings.countsMode` (`badge`/`brackets`/`none`), `settings.countsAlign` (`right`/`label`) | `bracket` ⇒ `brackets`, `left` ⇒ `label`; legacy defaults (badge, right) are the new defaults |
| `ui_separate_line` | label on own line | `filterForm.settings.orientation`? | drop; default vertical |
| `ui_exit_button`, `ui_exit_button_label` | close button | – | drop (Explorer always has Close) |
| `language` | UI language | – | drop |
| `hide_no_value_facets` (option) | hide empty facets | – | drop (Phase 3) |

---

## 4. Expansion rules

### 4.1 Legacy rule forms

| Form | Example | Seen in |
|---|---|---|
| R1 text + codes | `{"query":"t:12 relatedfrom:14 ","codes":["14","99","","12","",4],"levels":[]}` | DH (all), LR:2 |
| R2 JSON query (no codes) | `{"query":{"t":55,"lt:1106":[{"t":10}]},"levels":[]}` | LR:8,18,19,22,24,25,27,28,41; J&R:25 |
| R3 text without codes | only in broken DH:86 | – |

The whole ruleset is usually a JSON **string** (URL param or string inside the JSON).

### 4.2 `codes` = `[source_rt, dty_ID, rel_term_ID, target_rt, filter, linktype]`

| `linktype` | Legacy text query (`_getQuery`) | New canonical key | New rule `query` |
|---|---|---|---|
| 0 | `t:T links:S` | `links` | `{"t":T,"links":[{"t":S}]}` |
| 1 | `t:T linked_to:S-D` | `lt:D` | `{"t":T,"lt:D":[{"t":S}]}` |
| 2 | `t:T linkedfrom:S-D` | `lf:D` | `{"t":T,"lf:D":[{"t":S}]}` |
| 3 | `t:T related_to:S[-R]` | `rt:D` | `{"t":T,"rt:D":[{"t":S},{"r":R}]}` |
| 4 | `t:T relatedfrom:S[-R]` | `rf:D` | `{"t":T,"rf:D":[{"t":S},{"r":R}]}` |
| 5 | `t:T relatedS[-R]` | `related` | `{"t":T,"related":[{"t":S},{"r":R}]}` |

- `T` empty → omit `"t"`; `D` empty/0 → key without suffix; `R` empty → omit `{"r"}`.
- `filter` (codes[4]): JSON → merge its predicates into the rule query; text → legacy wrote
  `{"plain":text}` — must be converted to JSON (all sample filters are empty).
- **Always convert from `codes` when present.** The text form loses the relmarker field and the
  legacy server rewrites `related_to`/`relatedfrom` → undirected `related` (recordSearch.php ~2700),
  so text-only relation rules were really undirected.
- `levels` → recurse; `ignore` → keep; `codes` → drop.

Examples:

| Legacy | New |
|---|---|
| `"t:12 relatedfrom:10-4527 "`, codes `["10","142","4527","12","",4]` | `{"t":12,"rf:142":[{"t":10},{"r":4527}]}` |
| `"t:12 linkedfrom:16-90 "`, codes `["16","90","","12","",2]` | `{"t":12,"lf:90":[{"t":16}]}` |
| `"t:12 links:14 "`, codes `["14","",null,"12","",0]` | `{"t":12,"links":[{"t":14}]}` |
| R2 `{"t":55,"lt:1106":[{"t":10}]}` | unchanged |

Rules are accepted by `srv` `ExpansionRuleParser` (JSON or compact path `10:lt1106:55`), consumed by
Graph (`GraphExpansions`). `/records` does **not** execute rules.

---

## 5. `rulesonly`

| Value | Legacy meaning (recordSearch.php) | New |
|---|---|---|
| 0 / empty | main result + all rule results | Graph: base + expansions (default) |
| 1 | all rule results, without main set | ✗ not implemented in `srv` |
| 2 | only the last (leaf) rule level | ✗ |
| 3 | main set + last level | ✗ |

Keep the value in `request.rulesonly` (DataSource already carries it) so no information is lost;
honouring it needs a server decision (§12-4).

---

## 6. Query predicate rewrites (legacy key → new key)

`srv` accepts most legacy aliases (`linked_to`, `linkedfrom`, `related_to`, `relatedfrom`, `typename`,
`id`, …), but **not** the two-part suffixes produced by faceted search, and `related:<n>` now means
relation type.

| Legacy key | Legacy meaning | New key | Note |
|---|---|---|---|
| `t`, `type`, `typeid`, `typename` | record type | `t` | |
| `id`, `ids`, `iD` (DH:108) | record ids | `ids` | lowercase |
| `f:<dty>` | field | `f:<dty>` | |
| `f:<dty>:term` etc. | term sub-field | same | verify (LR:37) |
| `linked_to:<rt>:<dty>` / `linkedfrom:<rt>:<dty>` (faceted & DH:115) | pointer, legacy uses **last** part as dty | `lt:<dty>` / `lf:<dty>` | `<rt>` already inside the child `{"t":…}`; `srv` rejects `12:73` suffix |
| `linked_to:<dty>`, `linkedfrom:<dty>` | pointer | `lt:<dty>` / `lf:<dty>` | alias OK, normalise anyway |
| text `linkedfrom:<rt>-<dty>` | pointer (rule text) | `lf:<dty>` + `{"t":rt}` | |
| `related_to:<rt>:<relmarker>` / `relatedfrom:…` / `related:<rt>:<relmarker>` (faceted, DH:79) | relation via relmarker field | `related` (Builder decision: undirected), relation types `{"r":…}` from the relmarker's vocabulary | `srv` ignores `rt:`/`rf:` suffix; `related:<n>` = relation type ⇒ **must not** keep the suffix |
| `related_to:<relmarker>` (DH:44) | relation via relmarker 109 | as above | |
| `r.<dty>` in facet code → `r:<dty>` | relationship record field | `relf:<dty>` | |
| `title`, `added`, `modified`, `addedby`, `url`, `notes` | header fields | same | |
| `sortby` | sort | same | |
| `any`, `all`, `not` | groups | same | |
| text `OR` (DH:103, 116) | disjunction in text | keep text / server | client `parseTextQuery` has no OR |
| text `f:4:"riot" AND …` (DH:124) | | keep text / server | |

---

## 7. Faceted: facet item properties

| Legacy facet prop | Meaning | New | Conversion |
|---|---|---|---|
| `var` | variable id; query gets `"$X<var>"` (no closing `$`) | placeholder name | new token must be `$Name$`. Rename to `X1…Xn` in facet `order` (legacy vars are random, up to 15 digits). |
| `code` | path `rt:fld:rt:fld…:fld` (§8) | query template path | §8 |
| `title` | facet label | child `label` | only if different from field name (layout rule) — needs `HDbDefs` |
| `help` | help text | child `help` → HInput `help` | new shared HInput feature §12-8 |
| `type` | freetext, blocktext, enum, date, year, integer, float, resource, (missing for `typename`) | input type (derived from field, not stored) | used only for validation/warnings |
| `isfacet` | 0/`"0"`/false = direct input; 1 = dropdown (enum) / slider+histogram (date, numeric); 2 = inline list; 3 = wrapped list/column; true/null → 1 | child `mode` / `widget` | §9 |
| `multisel` | several values selectable | child `multiple:true` (enum) | OR semantics (§12-11) |
| `trm_tree` | show term hierarchy | ✗ | report |
| `groupby` | date: `year`/`month`/`decade`/`century`; freetext: `firstchar` | child `groupBy` (date list facets) | date list (isfacet 2/3) ⇒ `mode:radio` + `groupBy` (default year); runtime grouping is HValuePicker phase 8; freetext dropped |
| `srange` | date comparison: `between` (`><`) or overlap (`<>`, default) | operator in template | `$A$><$B$` vs `$A$<>$B$` |
| `orderby` | `count`/`desc`/null ordering of values | ✗ | Phase 3 |
| `hide_histogram` | | ✗ | drop |
| `accordion_hide` | collapsed facet | ✗ | drop |
| `order` | position | order of `children` | sort by `order`, fallback array index |
| `relation` = `directed` | respect relation direction | `rt`/`rf` instead of `related` | not in samples |
| v1: `fieldid`, `query`, `currentvalue`, `history`, `facets_new` | obsolete | – | kind D → report only |

---

## 8. Facet `code` → query template

Walk pairs `(rt, fld)`; `rt` may be a comma list or empty/0 (unconstrained); if the last token is a
link (`lt…`, `lf…`, `rt…`, `rf…`) append `0:title` (linked record title).

| Code segment | Legacy JSON (search_faceted) | New template |
|---|---|---|
| `10:1` | `{"t":"10"},{"f:1":"$X…"}` | `{"t":"10"},{"f:1":"$X1$"}` |
| `10:title` / `:added` / `:ids` / `:typeid` | `{"title":…}` etc. | `{"title":"$X1$"}` … (`typeid` → `t`) |
| `121,122,…:typename` | `{"t":"121,122,…"},{"typename":"$X…"}` | `{"t":"121,122,…"},{"t":"$X1$"}` — unsupported, facet skipped §12-9 |
| `14:lt73:11:1` | `{"linked_to:11:73":[{"t":"11"},{"f:1":…}]}` | `{"lt:73":[{"t":"11"},{"f:1":"$X1$"}]}` |
| `12:lf90:16:89` | `{"linkedfrom:16:90":[…]}` | `{"lf:90":[{"t":"16"},{"f:89":"$X1$"}]}` |
| `14:rt109:10:1` | `{"related:10:109":[…]}` (undirected unless `directed`) | `{"related":[{"t":"10"},{"r":<relmarker terms>},{"f:1":"$X1$"}]}` |
| `10:rf109:14:74` | `{"related:14:109":[…]}` | same pattern |
| `7:lt15:10,4:title` | `{"linked_to:10,4:15":[{"t":"10,4"},{"title":…}]}` | `{"lt:15":[{"t":"10,4"},{"title":"$X1$"}]}` |
| `86:lt1029:94:lt1028:55:lt1106` (type resource) | → `…:lt1106:0:title` | `{"lt:1029":[{"t":"94"},{"lt:1028":[{"t":"55"},{"lt:1106":[{"title":"$X1$"}]}]}]}` |
| `…:r.10` | `{"r:10":…}` | `{"relf:10":"$X1$"}` |

- Several facets on the same path share one branch (legacy `__checkEntry`); do the same.
- Legacy removes a branch whose variables are all empty; new `resolveQueryParameters()` does the same
  for `lt/lf/rt/rf/related` branches left with only `{t}` ✓.
- Numeric/date facets with slider → range template `"$X3$<>$X3to$"` (or `><` when
  `srange:"between"`); freetext/enum → single `"$Xn$"`.

---

## 9. `isfacet` × field type → HInput / layout child

| Legacy `type` | `isfacet` | Legacy UI | New input | Layout child |
|---|---|---|---|---|
| freetext / blocktext / title | 0 | text box, words AND-ed, `a OR b` supported | HInputText | `{input}` |
| freetext / title | 1,2,3 | list of distinct values with counts (click = exact value) | HInputText (value lists need Phase 3) | `{input}` – report degradation |
| enum / relationtype | 0 | text box (term label) | HInputEnum dropdown | `{input}` |
| enum | 1 | dropdown with counts | HInputEnum | `{input, mode:"select"}` |
| enum | 2 | inline list | HInputEnum | `{input, mode:"radio"}` or `"checkbox"` if `multisel` |
| enum | 3 | wrapped/column list | HInputEnum | as 2, `orientation:"column"` |
| date / year | 0 | direct input | HInputDate | `{input}` single value, or range with `widget:{type:"range",control:"direct"}` |
| date / year | 1 | histogram + slider (bounds from data) | HInputDate range | `widget:{type:"range",control:"direct"}` — slider needs `min/max` §12-10 |
| integer / float | 0 | direct | HInputNumeric | `{input}` |
| integer / float | 1 | slider (bounds from data) | HInputNumeric range | as date |
| resource | any | linked record titles | HInputText on `title` | `{input}` |
| (typename / typeid) | any | list of record types | ✗ unsupported | facet skipped, reported §12-9 |
| – `ui_additional_filter` | – | “search everything” | HInputText on `{"f":…}` | `{input:"SEARCH", label}` |
| – `ui_spatial_filter` | – | map rectangle | HInputGeo on `geo` | `{input:"GEO", label}` |

---

## 10. Value semantics that differ

| Situation | Legacy runtime | New runtime | Impact |
|---|---|---|---|
| Direct text `john smith` | split into words, each `{key:word}`, AND-ed (`OR` keyword → `any`) | one predicate `{key:"john smith"}` | narrower/different matches |
| Direct text `"john smith"` | quoted = phrase | as typed | same |
| Enum `multisel` with values a,b | one predicate **per value** (AND: record has a *and* b) | `values.join(',')` → `f:74:"a,b"` (OR) | **meaning changes** — accepted, OR (§12-11) |
| Date facet, grouped by year | `1935` → `1935<>1935-12-31` | user enters range | equivalent result, different UI |
| Empty form | no search unless `search_on_reset` (or add/spatial filter set) | all-blank placeholders removed → base query runs | `settings.skipEmptySearch` preserves legacy §12-7 |
| Empty form + `ui_temporal_filter_initial` | adds temporal predicate | – | literal predicate, always applied §12-6 |
| `sup_filter` | merged every search (optionally toggleable) | merged literally into template | toggle dropped (§12-5) |
| Facet counts, hide empty facets | yes | no (Phase 3) | presentation only |

---

## 11. Worked examples

**DH:104 (kind A)**
`?q=t:14 f:74:4339&rules=[{"query":"t:10 relatedfrom:14 ","codes":["14","109","","10","",4],"levels":[]}]`

```json
{ "q": "t:14 f:74:4339", "w": "all", "rulesonly": 0,
  "rules": [{ "query": {"t":10,"rf:109":[{"t":14}]}, "levels": [] }] }
```

**LR:8 (kind A, JSON q, bookmark)**
```json
{ "q": [{"t":"10"},{"f:10":">=1800"},{"sortby":"f:10"}], "w": "bookmark", "rulesonly": 1,
  "rules": [{ "query": {"t":55,"lt:1106":[{"t":10}]}, "levels": [] }] }
```

**DH:115 (kind A, legacy link keys)**
`{"linkedfrom:16:90":[{"t":"16"},{"f:89":"4035"}]}` → `{"lf:90":[{"t":"16"},{"f:89":"4035"}]}`

**DH:66 (kind C)** — facets 14:1 (0), 14:74 enum (1), 14:10 date (1), 14:75 enum (1),
14:rt100:15:77 enum (1); `sup_filter` date range; two rules.

```json
{
  "request": {
    "q": [
      {"t":"14"},
      {"f:1":"$X1$"},
      {"f:74":"$X2$"},
      {"f:10":"$X3$<>$X3to$"},
      {"f:75":"$X4$"},
      {"related":[{"t":"15"},{"f:77":"$X5$"}]},
      {"f:10":"1912-12-31T23:59:59.999Z<>1930-12-31T23:59:59.999Z"},
      {"sortby":"t"}
    ],
    "w": "all",
    "rules": [
      {"query":{"t":12,"rf:99":[{"t":14}]},"levels":[]},
      {"query":{"t":10,"rf:109":[{"t":14}]},"levels":[
        {"query":{"t":12,"rf:142":[{"t":10},{"r":4527}]},"levels":[]}]}
    ],
    "rulesonly": 0
  },
  "filterForm": {
    "version": 1,
    "groups": [{ "id":"main", "type":"section", "children": [
      {"input":"X1","label":"Title of event"},
      {"input":"X2","label":"Type of event","mode":"select"},
      {"input":"X3","label":"Start date","widget":{"type":"range","control":"direct"}},
      {"input":"X4","label":"Start (general time of day)","mode":"select"},
      {"input":"X5","label":"Source type","mode":"select"}
    ]}]
  }
}
```
(labels kept only when they differ from the field name; relmarker 100 → `{"r":…}` per §12-2.)

**J&R:14** — `sup_filter` `{"t":"102,120,…"}` plus `rectypes` → two `t` predicates (AND = intersection) — fine.

**LR:6** — `sup_filter` is text `t:7 sortby:-m` and `sort_order:"-a"` → needs text→JSON (§12-3);
`sort_order` wins.

---

## 12. Decisions (Artem, 2026-09-24)

| # | Topic | Decision | Consequence |
|---|---|---|---|
| 1 | Where to convert | **On load, in the client.** Legacy `usrSavedSearches` rows are never rewritten. | Pure converter util in `apps/explorer/src/utils/`; `SavedFilterManager` calls it. |
| 2 | Relmarker in facet codes / `related_to:<relmarker>` | **Option A** (§12.1), with the relmarker's **vocabulary root only**: `{"r":<root term id>}`. `srv` adds descendants when compiling SQL (`QueryBuilder::relationshipTypeCondition`, `defTermsLinks`). | No vocabulary → constraint dropped with a warning. |
| 3 | Preliminary filter `sup_filter` | If it converts to JSON → merged into the parameterized query. Otherwise → **warning to the user showing the old query**; the user converts it manually. | Text `sup_filter` is converted with the client `parseTextQuery`; failure (OR, parentheses, prose) ⇒ warning, the rest of the filter still opens without it. |
| 4 | `rulesonly` 1/2/3 | **Ignored for now** (value kept in `request.rulesonly`, not honoured). | – |
| 5 | `ui_prelim_filter_toggle*` | **Dropped.** | `sup_filter` is merged, when initially active — see §3. |
| 6 | `ui_spatial_filter_initial`, `ui_temporal_filter_initial` | Become **literal predicates** of the query — no form field. **Amended 2026-09-25 for spatial:** when `ui_spatial_filter` shows the field, the initial area (applied only if `ui_spatial_filter_init`) is the `GEO` field's layout `default` — prefilled, restored by Reset, clearable; the literal predicate remains only for a hidden spatial filter. | Spatial: `{"geo":<saved area>}`. Temporal: `after:"1 week ago"` → `{"after":"1 week ago"}` (text converted like `sup_filter`; failure ⇒ warning). Now always applied (legacy: only while the form was empty). `ui_spatial_filter` without an initial area still gets a `$GEO$` form field. |
| 7 | `search_on_reset` | New layout setting **“don't search when the form is empty”**: `filterForm.settings.skipEmptySearch` (default `false`). | `search_on_reset:false` ⇒ `skipEmptySearch:true`. |
| 8 | `ui_title`; `help` | `ui_title` → **Query Source / DataSource title** (when non-empty). Per-field help text → new **HInput `help` option** (shared with edit forms); layout `child.help`. | New shared HInput feature; filter form is a narrow case of the edit form. |
| 9 | `typename` / `typeid` facets | **Reported as unsupported**; the facet is skipped. | J&R:3, J&R:24, LR:41. |
| 10 | Numeric/date sliders | **Direct inputs** (`control:"direct"`) until facet counts exist. **Amended 2026-09-26:** slider facets (`isfacet:1`) become `control:"slider"` without bounds ("auto"): the Filter Form requests the field's bounds with `detail=minmax`. | |
| 11 | Enum `multisel` | **OR** (new behaviour: `f:74:"a,b"`). | Documented behaviour change vs legacy AND. |
| 12 | Faceted v1 and other unusable rows | Listed but marked **“legacy, cannot open”**. | DH:20, DH:26. |

### 12.1 Relmarker example (decision 2 — Option A, vocabulary root)

Digital Harlem has **two** relmarker fields connecting Person (10) and Event (14):

- `109` “Persons involved” on Event → Person (used by DH:107, rules in DH:27/66/89);
- `155` “Role” on Person → Event (used by DH:105, DH:123, rules in DH:111/112/124).

Each relmarker is constrained to its own relation-type vocabulary. DH:107 facet
`14:rt109:10:20` (“Gender” of persons involved) is built by legacy as

```json
[{"t":"14"},{"related:10:109":[{"t":"10"},{"f:20":"$X…"}]}]
```

and the legacy server (`composeSql.php` `_getRelationFieldConstraints`) turns `109` into
“relationship type ∈ vocabulary of field 109”. Meaning: *events with a female person **involved**.*

**Option A — relmarker → its vocabulary root (chosen)**

```json
[{"t":"14"},{"related":[{"t":"10"},{"r":<vocabRoot(109)>},{"f:20":"$X1$"}]}]
```

`HDbDefs.vocabRoot(109)` gives the root at load time; the server expands descendants. Same result as legacy. This is also the form the Filter Builder already
writes (`{"related":{…,"r":…}}`).

**Option B — drop the relmarker**

```json
[{"t":"14"},{"related":[{"t":"10"},{"f:20":"$X1$"}]}]
```

Meaning becomes *events with a female person connected by **any** relationship* — it now also
matches persons linked through `155` “Role” (and any other relation), so counts grow silently.


---

## 13. Anomalies in the sample data

| Row | Problem | Handling |
|---|---|---|
| DH:86 | rules appended to `q` without `&rules=` (`?q=t:14 f:74:4389 [{"query":…}]`) | detect trailing `[{"query"` in q → split to rules, or report |
| DH:20, DH:26 | faceted v1 | not convertible |
| DH:11 | `rtfilters`, `layout` | drop, keep `q=shearn` |
| DH:108 | `iD:53254` | case-insensitive key |
| DH:74 | space before `&rules` (`…} &rules=`) | trim q |
| DH:79, DH:115, DH:44 | legacy two-part / relmarker link keys in JSON q | §6 |
| DH:103, 116, 124 | text with `OR` / `AND` | keep as text |
| J&R:25, LR:18, LR:36 | `rulesonly` as string | `Number()` |
| J&R:3, J&R:24 | `typename` facet, no `type` | §12-9 |
| J&R:24 | same fields repeated per rectype, 16 facets | one placeholder per facet; many identical paths → report |
| LR:37, LR:39 | `sup_filter` with `sortby`, `f:1165:term`, `linked_to:1028:""` | verify keys against `srv` |
| LR:4, LR:32, DH:21 | very long `ids:` lists | fine |
| LR:41 | `94:lf1029:86:typeid` facet without `type` | `t` enum §12-9 |

---

## 14. Implementation (removable legacy module)

All conversion code lives in `apps/explorer/src/legacy/` and is only reachable through the optional
`legacyConverter` option of `SavedFilterManager` (wired in `ExplorerApplication`). Removing Saved
Filter legacy support = delete the folder and the two wiring lines.

| File | Role |
|---|---|
| `legacy/LegacySavedFilterConverter.js` | detects kind (§0), dispatches, returns `{status, kind, definition, warnings}` |
| `legacy/legacyQuery.js` | URL params, JSON query normalisation + key rewrites (§6), strict text → JSON |
| `legacy/legacyRules.js` | rules codes/text/JSON → canonical JSON (§4) |
| `legacy/legacyFacetedSearch.js` | faceted v2 → query template + `filterForm` (§3, §7–§9) |

Shared additions used by converted filters (not legacy-specific): `filterForm.settings.skipEmptySearch`,
layout `child.help` → HInput `help`. Warnings travel in DataSource `meta.warnings`.

**2026-09-26 fix:** date range facets were converted to `$X$<>$X_to$` / `$X$><$X_to$`, which the server
rejects for detail dates ("Invalid temporal value"). (The server accepts the infix form since the same day; the converter keeps the prefix form.) Dates now use the prefix form `<>$X$/$X_to$` /
`><$X$/$X_to$`; numeric facets keep `$X$<>$X_to$`. Date list facets (`isfacet` 2/3 with `groupby`) now run
as lists of ranges (`detail=ranges`).

**2026-09-26 presentation fixes:** enum facets convert with `facets: true` (legacy always listed the terms
that occur, with counts). Text facets keep their wizard mode: `1` dropdown → `mode:"select"`, `3` list →
`mode:"radio"` (column), `2` wrapped → `orientation:"inline"`, `multisel` → `checkbox` / `multiple`,
`0`/unset → input; a detail text field in a list mode gets `exact: true`; owner/creator lists use the
users/groups picker; header text (title, url, notes) stays an input. Server: several term IDs
(`f:237:"5374,5381"`, a multi-value enum selection) were rejected by `QueryValueResolver::resolveEnumValue`
("Unknown term for field") — they now pass through and search as OR.
