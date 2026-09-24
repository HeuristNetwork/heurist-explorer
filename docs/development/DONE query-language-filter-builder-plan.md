# Query language → human text, Filter Builder & inline helper — working plan

> Living design/context document. Keep it updated as decisions are made so a
> fresh session can resume without re-deriving everything.
> Created 2026-09-10. Owner: Artem (osmakov). Branch: `h7dev`.

---

## 0. Status / next action

**M1 — `/api/{db}/def/snapshot` endpoint: DONE (2026-09-10).** Verified end to end
against `osmak_mapping` (37/37 integration checks; HTTP 200 / 304 / 404 / 405).

Delivered:
- `srv/Definitions/DefinitionSnapshotService.php` — builds the payload
  from the `def*` tables, caches `def-snapshot.json` in the DB `entity/` dir.
- `srv/Controller/DefinitionController.php` — HTTP adapter, conditional GET (ETag
  = cache-file mtime).
- `srv/Definitions/_README.md`.
- `srv/Runtime/ServiceFactory.php` — `definitionController()` + `entityDirectory`
  passed from `getSysDir('entity')`.
- `hserv/controller/api.php` — `$is_def_query` branch, `'def'` in
  `$publicSearchResources`.
- `hserv/System.php::cleanDefCache()` — deletes `def-snapshot*.json`.
- `tests/DefinitionSnapshotTest.php` — `php tests/DefinitionSnapshotTest.php --db=NAME`.

Field notes from the live run (osmak_mapping: 82 rectypes / 339 fields / 5169
terms / 1181 structure rows): snapshot ≈ 624 KiB uncompressed, `build()` ≈ 30 ms.
`dbId` is `0` for an unregistered DB (concept codes then use `0-<localId>`;
reserved defs still resolve as `2-N`). `meta.languages` reflects whatever stray
`defTranslations` rows exist — cosmetic until the i18n phase.

**`srv/Records/Query/queryVocabulary.json` — DONE (2026-09-10).** `version:"1"`;
operators + phrase templates + `strings.eng` (complete). Section 6 for the shape.
Predicate keyword list is *not* in it — the client hard-copies `KEYWORD_ALIASES` +
`LINK_PREDICATES` from `RecordQueryParser.php`.

**M1 complete. M2 complete** (`4ed72dc`). **M3 complete** (`70b2576 HFilterBuilder,
HDbDef, HFieldTree`) — browser QA still advisable.

**M4 complete** (`queryDescribe()`, committed `103a6d9 Query describer`).
**M5 — `HFilterInlineHelper`: IN PROGRESS (2026-09-10).** Working tree, 86 tests +
build green. Not yet committed.

**HFilter UI redesign — IN PROGRESS (2026-09-11).** Not a new milestone number;
a UX pass over `HFilter` itself (textarea query box, icon-button row, relocated
saved-filters list, scoped header restyle, help button). See changelog entry
below for what shipped and what's still open. **Known pre-existing issue found
while doing this work:** `test/hFilterBuilder.smoke.test.js` and
`test/hFilterInlineHelper.smoke.test.js` import from the old `src/widgets/filter/`
path for `HFilterBuilder.js`/`HFilterInlineHelper.js` — both files actually live
in `src/widgets/filter-builder/` (per M3/M5 above). Those two tests (plus
`hDbDefs.test.js`, missing its `docs/snapshot.json` fixture) fail on `npm test`
regardless of this redesign; not fixed here, flagging for next session.

M5 delivered:
- `src/utils/parseTextQuery.js` — Task B-min (client): flat **keyword-syntax**
  text → `q`-array (`t:<rty>`, `<field>:<value>`, `f:<id>:…`, header keywords,
  `sortby:`; quotes; `-` negate; implicit AND). Prose / `OR` grouping / linked
  sub-queries are out of scope (server `textToJson` / M8 stay canonical).
  Unknown keys kept verbatim. `test/parseTextQuery.test.js` (12).
- `src/widgets/filter/HFilterInlineHelper.js` — binds to any `<input>`/`<textarea>`:
  - **while typing** → a token-hint dropdown only (record type → field →
    operator → value), prefix-filtered, ↑/↓/Enter/Tab/click, no prose (D6);
  - **on idle (700 ms) / blur** → parse the text and show the `queryDescribe()`
    sentence in a `.h-fih-sentence` panel (+ optional "Edit in builder");
  - `parseText` / `describe` are injectable (host can swap in server versions);
    definitions load lazily via an `onNeedDbDefs` provider.
  `test/hFilterInlineHelper.smoke.test.js` (8, DOM-free `_computeHints`).
- `ExplorerApplication` — attaches the helper to HFilter's `.h-filter-query`
  input (`onNeedDbDefs: _ensureDbDefs`, `onOpenBuilder: _openFilterBuilder`,
  `showBuilderButton:false` — HFilter already has "Search tools"). Builder Apply
  calls `inlineHelper.refreshSentence()`.

<details><summary>M4 — queryDescribe() (done)</summary>

- `src/utils/queryDescribe.js` — `queryDescribe(query, {dbdefs, vocabulary, lang,
  capitalize})` → plain sentence. Pure/DOM-free. Covers flat predicates, header
  keywords, `%`→starts/ends-with, `NULL`/`-NULL`, comma lists, enum→term-label,
  `any|all|not` groups, **one linked sub-query level**, `sortby`. Unknown
  predicates render verbatim (never dropped/thrown). Reuses `queryModel` helpers
  (now re-exported: `queryToArray`, `firstPredicateEntry`, `splitPredicateKey`,
  `stripValueToken`). Matches the plan's canonical example:
  `[{t:12},{"lf:134":[{t:48},{"f:237":"10443"}]}]` →
  *"Find Places linked from Events where Event type is Death"*.
- `test/queryDescribe.test.js` — 13 subtests (with + without dbdefs).
- `vocabHelpers.js` moved `src/widgets/filter/` → `src/utils/` (it is a pure
  vocab-read util, now shared by the widgets and `queryDescribe`).
- `HFilterBuilder._recompose()` now passes the sentence as `onChange`'s 2nd arg
  and shows it in a `.h-fb-sentence` panel above the JSON preview.

</details>

<details><summary>M3 — HFilterBuilder (done, committed 70b2576)</summary>

Delivered:
- `src/utils/queryModel.js` — pure, DOM-free `composeQuery(model, vocab)` /
  `parseQuery(input, vocab)` between the builder model and the legacy `q`-array
  shape (`[{t},{f:…},{lf:…:[…]},{sortby}]`). `test/queryModel.test.js` (25
  subtests incl. compose→parse→compose stability). Unmodellable predicates are
  preserved in `model.unsupported` and re-appended on compose.
- `src/utils/queryPredicates.js` — hard copy of `KEYWORD_ALIASES` +
  `LINK_PREDICATES` from `RecordQueryParser.php` (D1) + `HEADER_KEYWORDS`.
- `src/utils/queryVocabulary.json` — canonical explorer copy (from `docs/`).
- `src/widgets/filter/` — `HFilterBuilder.js` (dialog body: rectype + language +
  any|all conjunction + rows + one-level linked sub-panels + collapsible
  Sorted-by + live JSON preview; **no Ruleset**, D3), `HFilterBuilderItem.js`
  (one field row: field button → tree, operator `<select>` from vocab, per-kind
  value inputs, `not`, multi-value + or/and), `HFilterBuilderSort.js`,
  `HFieldTree.js` (custom framework-free field tree — D12.1: expand/collapse,
  one-level linked-rectype expansion, alpha/form order, show-linked-from toggle),
  `vocabHelpers.js`. Record inputs = plain id text + disabled "Pick…" (D12.2).
- `src/ui/HFilter.js` + `HFilterForm.js` moved to `src/widgets/filter/`
  (D8); one import updated in `ExplorerApplication.js`.
- `ExplorerApplication` — `onSearchTools` now opens `HFilterBuilder` in an `HMsg`
  modal (`_openFilterBuilder`); `_ensureDbDefs()` fetches `/def/snapshot` once via
  the api client. Replaces the legacy `hostBridge.openSearchBuilder()` call (D12.3).
- `@heurist/client-core` `package.json` — added `"./widgets/*"` subpath export so
  `HBaseWidget` is importable without the `/widgets` barrel (which pulls a
  `.html` asset that node `--test` cannot load).

Third browser-QA pass (2026-09-10):
- Field-tree branches now expand: a container-level `click` `stopPropagation`
  keeps the folder-toggle click (which rebuilds the body) from reaching the
  document outside-click handler that was closing the popover.
- Remove-token icon is hover-revealed (`opacity`, no layout shift) and larger.
- The value AND/OR cell is a fixed 48px slot; the "add value" `+` lives in that
  slot on the first value row (no separate trailing row).
- "add field" `+` is indented to line up with `.h-fbitem`.

Second browser-QA pass (2026-09-10) — layout brought closer to legacy
`searchBuilderItem`:
- Field-tree popover now opens: it is appended **inside** the modal `<dialog>`
  (a modal makes `document.body` inert) and positioned `fixed`.
- Row layout is now `[field selector] [× remove] [operator] [ value column ]`;
  remove tooltip is "Remove this search token". Operator `<select>` is borderless.
  The `not` checkbox is not rendered (hidden until needed).
- Values stack in a column. With ≥2 values the AND/OR **selector** sits in front
  of the 2nd value and a static AND/OR **label** in front of the 3rd+.
- Same pattern between criteria: selector on the 2nd row, label on the 3rd+
  (`_refreshRowConjunctions`). "add field" / "add sort" are now a single bigger
  `+`; the explicit "add linked search" button is gone (linked sub-queries come
  from expanding a pointer field in the tree, as in legacy).

First browser-QA pass fixes (2026-09-10):
- The builder uses the shared native `<dialog>` (`HMsg.showMsgDlg`, same as every
  modal). Opened with `preventClose:true` so a stray backdrop click / Escape can
  no longer discard unsaved work - only Apply / Cancel dismiss it.
- `ExplorerControlPanel._handleOutsidePointer` now ignores pointerdowns inside any
  open `<dialog>`, so clicking in the builder no longer collapses the (persistent)
  search flyout underneath it.
- Dialog widened for `.h-fb` (`min(1080px, 100vw-48px)`, `min-height:60vh`).
- The left-rail "Filter Builder" button now opens the real builder
  (`ExplorerApplication.openFilterBuilder()`) instead of the dead legacy
  `hostBridge.openSearchBuilder()` call.

</details>

Known M3–M5 simplifications / TODO:
- **@todo Inline helper — hint dropdown clipping.** `.h-fih-hints` is positioned
  inside `.h-filter-query-row` (so the flyout's outside-pointer close logic does
  not treat it as "outside"); a long list can be clipped by `.h-explorer-filter
  { overflow:auto }`. If it bites, move the popover to `document.body`/`fixed`
  and extend `ExplorerControlPanel._handleOutsidePointer` to ignore it (as it
  already ignores open `<dialog>`s).
- **@todo Inline helper — richer hints.** No hints for: record-pointer values
  (needs a record search), the `t:` multi-rectype list, `OR`/grouping,
  linked-predicate keys. Value hints only for `enum`. Header-keyword field list
  is a hardcoded set.
- **@todo `parseTextQuery` — keyword subset only.** Flat, implicit-AND. No
  `OR`/parens, no linked/related sub-queries, no prose. Feeds the inline sentence
  and seeds the builder; the server `RecordQueryParser::textToJson` stays
  canonical (Task B / M8).
- **@todo Field selector: metadata / header fields.** The tree only lists real
  `rst` fields. Add the legacy "Generic fields" group (Title, Date added, Date
  modified, Creator, URL, Notes, Owner, Visibility, Tags) — `searchBuilderItem.js`
  `topOptions2` (~L282). `queryModel`/`HFilterBuilderItem` already compile header
  keywords; only the picker entry is missing.
- **@todo Field selector: "ANY field" entry.** Offer an explicit "Any field" leaf
  (compiles to bare `f:`); `HFilterBuilderItem` already handles `dty:'anyfield'`.
- **@todo Links deeper than one level.** `HFieldTree` stops after one pointer hop
  and `LinkPanel` is single-level (D3). Nested `lt:…:[{lt:…:[…]}]` needs a
  recursive panel + tree. `rt`/`rf`/`related` link types also deferred.
- **@todo Value language.** `HFilterBuilder` has a Language selector but it is
  inert. Thread the chosen language into term-label lookups (`HDbDefs.termIdByLabel`
  / `termTree`) and into composed values (`lang:label` prefix, per legacy
  `searchBuilderItem.getValues`).
- A plain-text query in the HFilter input does not load into the builder (only
  JSON / q-array). Rule-based text→query is Task B (M8).
- `queryDescribe` is A-min: one linked level, best-effort operator recovery when
  `dbdefs` cannot resolve a field's kind, no per-language term labels yet
  (see Value-language @todo). Nested / multi-rectype = server `QueryDescriber` (M7).
- Two conditions on the same linked record via separate tree picks make two
  `lf:` rows (AND of EXISTS) rather than one — use the link sub-panel's
  "add condition" for a single EXISTS.
- No jsdom in the test env — widget DOM paths are covered only by a smoke test
  (`test/hFilterBuilder.smoke.test.js`) + `vite build`; needs a manual pass in
  `npm run dev`.
- `$NAME$` wildcard affordance (§11.5) is noted in the header comment but **not
  built** — that is M9.
- CSS uses `heurist-ui.css` primitives (`.h-input` / `.h-select` / `.h-btn` /
  `.h-menu-item` / `.h-checkbox` / `.heurist-module-icon-button`); the
  `.h-fb*` / `.h-fbitem*` classes are **layout only** (widths, gaps, the
  borderless-conjunction and hover-reveal-remove deviations).

<details><summary>M2 — HDbDefs (done)</summary>

Core class + tests landed in the `heurist-explorer` repo.

Delivered:
- `src/utils/HDbDefs.js` — framework-free ES class. `static load(url,{lang,fetchFn})`
  + `constructor(snapshot)` (accepts a bare payload or a `{data:{…}}` envelope).
  Full §5 method surface: meta accessors, `rectypes`/`rectype`/`rectypeIdByName`/
  `rectypeName`, group accessors, `fields`/`field`/`fieldGlobal`/`fieldIdByName`/
  `fieldName`/`fieldType`, `vocabRoot`/`term`/`termLabel`/`termChildren`/`termTree`/
  `termDescendants`/`termIdByLabel`, `linkedRectypes`/`pointerFieldsBetween`,
  `localId`/`conceptId`.
- Link graph computed on construction from `structure` + `fields[].targetTypes`
  (`_direct`/`_reverse` for resource fields, `_relDirect`/`_relReverse` for
  relmarker; `forbidden` rows excluded; unconstrained pointers tracked per
  rectype and folded in at query time so the maps stay small).
- `test/hDbDefs.test.js` — 19 subtests against `docs/snapshot.json`; `npm test`
  green (24 total).

Fixtures live in `docs/`: `docs/snapshot.json` (dev fixture, exact snapshot
shape), `docs/queryVocabulary.json` (canonical copy for M4). The test reads
`docs/snapshot.json` directly.

Location decisions (D8): `src/utils/` holds the reusable, DOM-free layer —
`HDbDefs.js`, `queryModel.js`, `queryPredicates.js`, `queryDescribe.js`,
`vocabHelpers.js`, `queryVocabulary.json` (and the future `parse.js` for Task B).
Filter/search **widgets** → `src/widgets/filter/` (`HFilterBuilder`,
`HFilterBuilderItem`, `HFilterBuilderSort`, `HFieldTree`, `HFilterInlineHelper`,
plus `HFilter` + `HFilterForm`, moved there from `src/ui/`). `src/ui/` keeps
Explorer-shell chrome only.

HDbDefs wiring into `ExplorerApplication` is now done (`_ensureDbDefs`).
</details>

Next: browser QA of M3–M5 in `npm run dev` (open HFilter → type in the query
box → hints; pause → sentence; Search tools → builder), commit M3-QA + M4 + M5,
then start server-side **M7 (`QueryDescriber`)** / **M8 (Task B prose)** in the
heurist repo, and eventually **M9** (parametrized filters, §11).

---

## 1. Goal

Three capabilities around the Heurist record query language
(`documentation/context_help/searchQueryLanguage.htm`, parser at
`srv/Records/Query/`):

- **Task A** — convert a JSON or plain-text query into a human-readable sentence.
  e.g. `[{"query":{"t":12,"lf:134":[{"t":48}],"f:237":"10443"}}]` →
  *"Find Places linked from Events where type of event is Death"*.
  Output = **plain sentence** (the aligned "raw code under each phrase" layout in
  early notes was only illustrative).
- **Task B** — convert human-entered text into a plain/JSON query. Flat
  sentences first; simple `linked to/from` / `related to` next. **No LLM** for now
  (cannot afford it) — rule-based, deliberately narrow. If Task C is good enough,
  B is lower priority.
- **Task C** — inline helper on the client: as the user types a query in any
  input/textarea, show context-aware hints (rectype dropdown → field dropdown →
  operator dropdown → value), plus a button to open the full Filter Builder
  dialog. `searchBuilder.js` is the existing "regular way".

### Agreed strategy

- **A** — server-side canonical service (`QueryDescriber` in `srv/Records/Query/`),
  exposed via the records/system controller (`detail=describe` or a small
  endpoint). A minimal client-side describer (flat queries only) is acceptable
  for the inline helper's live display; server version is canonical.
- **B** — server-side. `RecordQueryParser::textToJson()` + `QueryValueResolver`
  already do ~80% (keyword syntax → resolved JSON). Missing piece is a small
  prose→keyword preprocessor. Expose parse-without-execute first.
- **C** — client-only, in `heurist-explorer` (framework-free ES classes). Needs a
  clean data layer (`HDbDefs`) and a clean Filter Builder
  (`HFilterBuilder` / `HFilterBuilderItem`) first, then `HFilterInlineHelper`.

### Order of work

`C` (with its prerequisites) → `A` → `B`.
Client work (M2–M5) is done **directly in the `heurist-explorer` repo** — no
standalone test project. Explorer already provides its own ES-class `HBaseWidget`,
`$HR()` i18n and a demo/host page; add a builder demo view there for manual QA.

```
M1  [heurist repo]   /api/{db}/def/snapshot endpoint + snapshot JSON shape
                     + queryVocabulary.json (operators/phrases only)
M2  [explorer repo]  HDbDefs — fetch/parse/store the snapshot; link graph on load   ✅
M3  [explorer repo]  HFilterBuilder / HFilterBuilderItem (visual; flat + one         ✅
                     linked-subquery level; sort optional)
M4  [explorer repo]  queryDescribe() — A-min (flat JSON query → sentence, +vocab)     ✅
M5  [explorer repo]  HFilterInlineHelper (typing → token hints; idle → sentence;   ✅
                     + parseTextQuery — client flat keyword-text → q-array)
M7  [heurist repo]   server QueryDescriber — canonical A (nested, API-exposed)
                     [can start parallel from M1]
M8  [heurist repo]   Task B — prose preprocessor → parser; link phrases as step 2
M9  [explorer repo]  Parametrized filters — $NAME$ wildcards in HFilterBuilder,
                     HFilterFormEditor (overlay in the builder dialog),
                     HFilterForm runtime entry form. LAST PHASE. See §11.
```
(There is no M6 — classes are authored in explorer, not copied in.)

---

## 2. Why a new data layer (HDbDefs)

`heurist-explorer` does **not** fetch DB structure yet. The legacy client layer
`hclient/core/utils_dbs.js` (`window.hWin.HEURIST4.dbs`, alias `$Db`, ~4000 lines)
is unusable in explorer: it depends on `HRecordSet`, `HAPI4.EntityMgr`,
`HAPI4.sysinfo.dbconst`, jQuery and other legacy code. It is a **read/query layer
over data that `EntityMgr` fetches** — it does not fetch or persist anything
itself.

So `HDbDefs` is new. It **requests, parses and stores** database definitions from
a new server endpoint, then answers the questions the Filter Builder and describer
need. In the Vite test project it is backed by a static JSON fixture that has the
exact snapshot shape.

---

## 3. Server endpoint: `/api/{db}/def/...`

### 3.1 Rationale

New OpenAPI resource family, database-engine-agnostic, implemented in `/srv`
(PDO via `Heurist\Database\DatabaseInterface`, no mysqli / no legacy `System`
inside services). Mirrors what was already done for `/records` (user data) and
`/sys` (`filter`, `user` — internal user data). `/def` = **database
definitions**.

`/def` will **eventually replace** the legacy `/api/{db}/rty|dty|trm|rst|trl`
routes (which run through `hserv` / `entityScrud.php`). Longer term, `sys` and
`def` both read from record-shaped storage (`sysRecords/sysRecDetails`,
`defRecords/defRecDetails`) with the same structure as user `Records/recDetails`.
**Not now** — for now `/def` reads the existing `defRecTypes` etc. tables, and the
individual `rty`/`dty`/`trm` item reads keep using the old OpenAPI requests.

**`snapshot` is the first and only `/def` service for this milestone.**

### 3.2 Route

```
GET /api/{db}/def/snapshot
    ?lang=eng                (optional; default DB language)
    ?since=<version|etag>    (optional; 304 if unchanged)
```

- Read-only. `allow_anonymous = true` (definitions are already public via
  `rty`/`dty`/`trm`).
- Response: standard modern envelope via `Heurist\Runtime\ApiResponse`
  (`{ ... }` on success; `{status,error,message}` on error).
- **Caching (decided):** persist the generated JSON as
  `def-snapshot[-<lang>].json` in `System::getSysDir('entity')` — the same folder
  as `dbdef_cache.json` (`<filestore>/<db>/entity/`). Serve the file if present,
  otherwise generate + write it. Invalidation is by **deletion**: add
  `fileDelete($entityDir.'def-snapshot*.json')` to `hserv/System.php ::cleanDefCache()`
  (~L1992), which is already called on every structure edit
  (`DbEntityBase`, `dbsImport`, `DbUtils`). Next request regenerates.
- Also send `ETag` (file mtime or structure version) and honour `If-None-Match`
  → `304` for HTTP-level caching; not required for correctness given the
  delete-on-change cache.

### 3.3 Code layout (new)

```
srv/Controller/DefinitionController.php          # HTTP adapter, mirrors SystemQueryController
srv/Definitions/DefinitionSnapshotService.php   # builds the payload from def* tables
srv/Definitions/_README.md
```

- `ServiceFactory::definitionController()` — add alongside `systemQueryController()`
  (`srv/Runtime/ServiceFactory.php`).
- `hserv/controller/api.php` — add a branch like the existing `$is_system_query`
  block (search `'sys'` in that file, ~line 424 and ~line 525):
  ```php
  $is_def_query = ($resource === 'def');
  ...
  if($is_def_query){
      $defType = $requestUri[4] ?? null;      // 'snapshot'
      $controller = ServiceFactory::fromLegacySystem($system)->definitionController();
      $controller->output($req_params, $defType);
      $system->dbclose();
      exit;
  }
  ```
  Also add `'def'` to `$publicSearchResources` for `$allow_anonymous`.
- Reference implementations to copy structure/conventions from:
  - `srv/Controller/SystemQueryController.php`
  - `srv/System/Query/SystemQueryService.php`
  - `srv/System/Query/SystemEntitySchemaRegistry.php`
  - `srv/System/Query/_README.md`
  - envelope/error contract: `srv/Runtime/ApiResponse.php`

### 3.4 Cache invalidation (decided)

No structure-version query needed. The cache file is **deleted** whenever the
structure changes, via `System::cleanDefCache()` (`hserv/System.php` ~L1992),
which already runs on every definition edit / structure import. Extend it:

```php
public function cleanDefCache(){
    $entityDir = $this->getSysDir('entity');
    if ($entityDir) {
        fileDelete($entityDir . 'db.json');
        fileDelete($entityDir . 'dbdef_cache.json');
        foreach (glob($entityDir . 'def-snapshot*.json') ?: [] as $f) { fileDelete($f); }
    }
    ...
}
```

`meta.version` in the payload can just be the file mtime (also used as `ETag`).

---

## 4. Snapshot payload — proposed shape

Goal: **minimum** needed for (a) the Filter Builder dropdowns, (b) client-side
describer (id → name), (c) client-side value resolution (name/label → id) for
Task B-min. Everything else stays on the server.

```jsonc
{
  "meta": {
    "db": "osmak_9a",
    "dbId": 3,                     // rty_OriginatingDBID / registered id, for concept codes
    "version": "1739123456",      // cache-file mtime == ETag (see 3.4)
    "generated": "2026-09-10T12:00:00Z",
    "language": "eng",            // language this snapshot was rendered in
    "languages": ["eng","fre"],   // available; translations deferred (see §8)
    "dbconst": {                  // needed to identify relationship structures / special fields
      "RT_RELATION": 1,
      "DT_PRIMARY_RESOURCE": 247,
      "DT_TARGET_RESOURCE": 248,
      "DT_RELATION_TYPE": 246
    }
  },

  "rectypeGroups": {              // for grouping the rectype dropdown
    "<rtg_ID>": { "name": "...", "order": 1 }
  },
  "fieldGroups": {               // dtg — for grouping the field dropdown
    "<dtg_ID>": { "name": "...", "order": 1 }
  },

  "rectypes": {
    "<rty_ID>": {
      "name":   "Person",         // rty_Name (singular)
      "plural": "Persons",        // rty_Plural (defaults to name when empty)
      "group":  <rty_RecTypeGroupID>,
      "concept":"3-1001",         // "<OriginatingDBID>-<IDInOriginatingDB>", local -> "<dbId>-<localId>"
      "showInLists": true,        // rty_ShowInLists == 1
      "description": "..."        // rty_Description, omitted when the placeholder default
    }
  },

  "fields": {                     // dty — global field definition. "separator" fields omitted.
    "<dty_ID>": {
      "name":    "Given name",    // dty_Name
      "type":    "freetext",      // dty_Type  (see §4.1)
      "group":   <dty_DetailTypeGroupID>,
      "concept": "3-1",
      "vocabulary": 1023,         // first ID in dty_JsonTermIDTree - vocabulary root; omitted if none
      "targetTypes":[12,48]       // dty_PtrTargetRectypeIDs (resource / relmarker); omitted if none
    }
  },

  "structure": [                  // rst — per-rectype field placement. Separator fields excluded.
    {
      "rty":  <rst_RecTypeID>,
      "dty":  <rst_DetailTypeID>,
      "name": "Birth name",       // rst_DisplayName (overrides dty_Name in this rectype)
      "order":  12,               // rst_DisplayOrder
      "req":  "optional"          // rst_RequirementType; consumer drops "forbidden"
    }
  ],

  "terms": {                      // trm — flat map
    "<trm_ID>": {
      "label":   "Capital",       // trm_Label
      "code":    "capital",       // trm_Code
      "concept": "2-10443"        // trm_ConceptCode
      // parent/children come from termlinks, not here
    }
  },
  "termlinks": [                  // trl — hierarchy (also is-a vs part-of if needed later)
    { "parent": <trl_ParentID>, "term": <trl_TermID> }
  ]
}
```

### 4.1 `dty_Type` values (operator-set selector for the builder)

`dty_Type` enum: `freetext`, `blocktext`, `integer`, `date`, `year`, `relmarker`,
`boolean`, `enum`, `relationtype`, `resource`, `float`, `file`, `geo`,
`separator`, `calculated`, `fieldsetmarker`, `urlinclude`. **`separator` is
excluded from the snapshot** (layout-only). Operator phrasing per type: see
`hclient/widgets/search/searchBuilderItem.js` (~L520–620).

### 4.2 Trimmed from the initial draft (per Artem, 2026-09-10)

- No `rectypes[].isRelation` — the client identifies the relationship rectype via
  `meta.dbconst.RT_RELATION`.
- `fields` with `type == "separator"` are dropped entirely (from `fields` **and**
  `structure`).
- `fields[].termTree` (array) → `fields[].vocabulary` (single int = vocabulary
  root term ID, from the first ID in `dty_JsonTermIDTree`; omitted when null).
- `structure[]` rows carry **only** `{rty, dty, name, order, req}` — no
  `rst_FilteredJsonTermIDTree`, `rst_PtrFilteredIDs` or per-rectype group. No
  per-rectype term/pointer narrowing; the builder uses the global field's
  `vocabulary` / `targetTypes`.

### 4.3 Link graph

Do **not** precompute the linked/reverse-pointer graph in the snapshot. `HDbDefs`
computes it from `fields.targetTypes` + `structure` on load — this is exactly what
`$Db.rst_links()` does (`utils_dbs.js` ~L1575–1660): builds `direct`, `reverse`,
`rel_direct`, `rel_reverse` maps keyed by rectype.

---

## 5. HDbDefs — client class (method surface)

Derived from how `searchBuilder.js` / `searchBuilderItem.js` use `$Db` today
(`$Db.rty`, `$Db.dty`, `$Db.rst`, `$Db.trm`, `$Db.trm_getLabel`,
`$Db.trm_TreeData`, `$Db.getBaseFieldInstances`,
`$Db.createRectypeStructureTree_new`, `getLocalID`/`getConceptID`).

Framework-free ES class. No `window.hWin`, no jQuery. Constructed with the parsed
snapshot (or a fetch URL + fetch fn injected).

```
class HDbDefs {
  static async load(url, { lang, fetchFn }): HDbDefs        // GET /api/{db}/def/snapshot
  constructor(snapshotJson)

  // meta
  dbId(): number
  version(): string
  dbconst(name): number

  // record types
  rectypes(): Array<{id,name,plural,group}>                 // for dropdown, group-sorted
  rectype(id): {id,name,plural,group,concept} | null
  rectypeIdByName(text): number|number[]|null               // singular/plural, exact then unique-partial
  rectypeName(id, {plural}): string

  // fields  (structure gives per-rectype name/order/req; type/vocabulary/targetTypes come from the global field)
  fields(rtyId): Array<{id,name,type,group,order,req}>       // structure-merged, "forbidden" excluded, order-sorted
  field(rtyId, dtyId): {id,name,type,group,order,req,vocabulary?,targetTypes?} | null
  fieldGlobal(dtyId): {...}                                  // no rectype context
  fieldIdByName(rtyIds, text): number|number[]|null          // dty_Name or rst_DisplayName, scoped to rtyIds
  fieldName(rtyId, dtyId): string
  fieldType(rtyId, dtyId): string

  // enum / relation terms
  vocabRoot(dtyId): number|0                                 // fields[dty].vocabulary
  termTree(rootId): tree|flat                                // via termlinks
  term(id): {id,label,code,concept} | null
  termIdByLabel(rootId, label): number|null                  // label or code, within vocab, dotted-path aware
  termLabel(id): string
  termDescendants(rootIds): number[]

  // link graph (computed on load, mirrors $Db.rst_links)
  linkedRectypes(rtyId, {direction:'to'|'from', relation:false}): number[]
  pointerFieldsBetween(fromRty, toRty): number[]             // candidate lt/lf field ids

  // concept codes
  localId(kind, conceptCode): number                         // kind: 'rty'|'dty'|'trm'
  conceptId(kind, localId): string
}
```

Both directions of resolution live here: **id → name** (Task A) and
**name/label → id** (Task B-min, builder value entry).

---

## 6. `queryVocabulary.json` — shared resource  ✅ written

Canonical file: **`srv/Records/Query/queryVocabulary.json`** (done, `version:"1"`).
`heurist-explorer` keeps an identical copy; a CI/lint check keeps them in sync.

Holds **operators + phrase templates + their translations**. The predicate keyword
vocabulary is *not* here — the client **hard-copies** `KEYWORD_ALIASES` and
`LINK_PREDICATES` from `srv/Records/Query/Parser/RecordQueryParser.php` (~L26–40)
into a small JS constant (`queryPredicates.js`). The PHP parser stays hardcoded —
no server-side dependency on this file.

Top-level keys as written:

- `fieldKinds` — `dty_Type` → operator group
  (`text|number|date|enum|term|record|file|geo|bool`).
- `headerKinds` — `title|url|notes|added|modified|id|type|tag` → operator group.
- `operators` — per group, `[{ token, input, i18nKey, pattern?, whole? }]` where
  `token` is the value **prefix the parser understands** (`""`, `=`, `==`, `>`,
  `>=`, `<`, `<=`, `<>`, `><`, `-`, `@`, `@+`, `@-`), `input` is the widget the
  builder should show (`text|number|date|term|record|range|wkt|bool|tag|tags|
  none`), and `pattern` is a value template for builder-only shorthands
  (`starts_with` → `{v}%`, `between` → `{a}<>{b}`).
- `common` + `commonAppliesTo` — the `NULL` / `-NULL` (has value / has no value)
  operators appended to most kinds; `whole:true` means the token *is* the value,
  no user input.
- `phrases` — describer (Task A) sentence templates as i18n keys with `{…}`
  placeholders (`phrase.find` = `"Find {rectype}"`, `phrase.linked_from`,
  `phrase.field_cond` = `"{field} {op} {value}"`, …).
- `strings` — `{ "<lang>": { "<i18nKey>": "text" } }`. **`eng` is fully
  populated.** Per Answer 5, translations live **in this JSON**, not a separate
  i18n system; explorer's `describe()` / builder look strings up here, falling
  back to `eng`. Add `fre`, etc. as sibling blocks.

Operator phrasing was seeded from `hclient/widgets/search/searchBuilderItem.js`
(~L518–625) and the query-language doc's "Values and comparison operators" table.

---

## 7. Client implementation (in `heurist-explorer`)

**Decided: no standalone test project.** The classes are authored directly in the
`heurist-explorer` repo, extending its ES-class `HBaseWidget`, using its `$HR()`
i18n and `localization_*.txt`. Add a builder demo view to explorer's host page for
manual QA (input bound to `HFilterInlineHelper`, "open builder" button →
`HFilterBuilder` dialog, live panels for raw JSON query + human sentence). Unit
tests use explorer's existing test setup.

Files (in explorer's source tree):
```
src/utils/HDbDefs.js
src/utils/queryPredicates.js   (hard copy of KEYWORD_ALIASES + LINK_PREDICATES)
src/utils/queryModel.js        (compose/parse: builder model <-> q-array)
src/utils/vocabHelpers.js      (vocab read helpers)
src/utils/queryDescribe.js     (A-min: flat q-array -> sentence)
src/utils/parseTextQuery.js    (B-min client: flat keyword text -> q-array)
src/utils/parse.js             (B: prose -> keyword text) [M8, server-canonical]
src/utils/queryVocabulary.json (copy of srv/Records/Query/queryVocabulary.json)
src/widgets/filter/HFilterBuilder.js  HFilterBuilderItem.js  HFilterBuilderSort.js
src/widgets/filter/HFieldTree.js  HFilterInlineHelper.js
```

Dependency-injection contract for the three widgets (freeze before coding):
`dbdefs` (HDbDefs), `vocabulary` (parsed `queryVocabulary.json` — includes its own
`strings` translations, so no separate i18n dep), `lang`,
`onChange(jsonQuery, textQuery)`, optional `describe(json)` / `parse(text)` hooks
(host swaps in the server versions later; explorer supplies client-side minimal
ones for now).

---

## 8. Inline helper behaviour (Task C UX — agreed)

- Bindable to **any** `<input>` / `<textarea>` (`HFilterInlineHelper` +
  `HFilterBuilder` pair).
- **While typing** → live token hints only (state machine:
  `rectype → field | header-keyword → operator → value → space → repeat`).
  **No human-readable rendering during typing** (D6). This is the primary dev
  path — simplest to build and exercises everything.
- **After a JSON query exists** — produced by parsing the typed text, or by the
  builder — render the generated human-readable sentence (`describe()`) next to
  the raw query so the user can compare/confirm. Post-parse step, not
  keystroke-live.
- A button next to the input always opens the full `HFilterBuilder` dialog for the
  "regular way".

---

## 9. i18n

- **`localization_*.txt` (explorer `$HR`) is for UI chrome only** — buttons,
  labels, tooltips, messages. Query-language operator/phrase wording is a
  near-static, versioned dataset and stays **with the data it describes**:
  inside `queryVocabulary.json` under `strings.<lang>` (Answer 5 / D1). `eng` is
  complete; consumers fall back to `eng` for a missing key/lang. So the builder
  and `describe()` read operator/phrase text straight from the parsed vocabulary
  object — no `$HR` call for these.
- Rectype / field / term labels: from `defTranslations` — **not currently in the
  snapshot**. Add a `translations` block (or per-entity `label_<lang>`) to the
  snapshot builder when the i18n phase starts. English-only for v1;
  `meta.languages` already advertises availability.

---

## 10. Decisions log

- **D1 (resolved 2026-09-10)** — `queryVocabulary.json` = operators + phrase
  templates + their `strings.<lang>` translations (Answer 5). Client
  **hard-copies** `KEYWORD_ALIASES` + `LINK_PREDICATES` from
  `RecordQueryParser.php`. PHP parser stays hardcoded, no JSON dependency.
  Written 2026-09-10 (`version:"1"`, `eng` complete).
- **D2 (resolved 2026-09-10)** — snapshot cached as
  `def-snapshot[-<lang>].json` in `getSysDir('entity')` (beside
  `dbdef_cache.json`); invalidated by deletion in `System::cleanDefCache()`;
  regenerated on next request. `ETag` = file mtime.
- **D3 (resolved 2026-09-10; amended 2026-09-10)** — HFilterBuilder v1 scope:
  flat predicates + single-level linked subquery, sort optional.
  **Expansion Rules / Ruleset are OUT of the Filter Builder entirely** — not
  deferred, excluded. Do **not** port the legacy `#ruleset_accordion` /
  `svs_Rules` / `_editRules()` / `rulesonly` UI. Also deferred: relationship-marker
  constraints, multi-rectype.
- **D4 (resolved 2026-09-10)** — no standalone test project; client classes are
  written directly in `heurist-explorer`.
- **D8 (resolved 2026-09-10)** — explorer source layout: the non-widget,
  DOM-free query-language layer (`HDbDefs.js`, `queryModel.js`,
  `queryPredicates.js`, `queryDescribe.js`, `vocabHelpers.js`, `parse.js`,
  `queryVocabulary.json`) lives under `src/utils/`; the filter/search **widgets**
  (`HFilterBuilder`, `HFilterBuilderItem`, `HFilterBuilderSort`, `HFieldTree`,
  `HFilterInlineHelper`, plus `HFilter`/`HFilterForm` and future
  `HFilterHistory`/`HFilterPinned`/`HFilterSubsets`) live under
  `src/widgets/filter/`. `src/ui/` is reserved for Explorer-shell chrome.
  (`HFilter`/`HFilterForm` moved out of `src/ui/` at M3; `vocabHelpers.js` moved
  `widgets/filter/` → `utils/` at M4.)

- **D5 (resolved 2026-09-10)** — `meta.version` / `ETag` = cache-file **mtime**.
- **D6 (resolved 2026-09-10)** — the inline helper shows **no** human-readable
  text while the user is typing (token hints only). The describer runs **after**
  a JSON query is produced (from parse, or from the builder), to show the
  generated sentence for the user to compare/confirm. So `describe()` is a
  post-parse step, not keystroke-live — client A-min is fine for it; server
  `QueryDescriber` is canonical and used for nested queries.
- **D7 (resolved 2026-09-10)** — the `heurist-explorer` source repo is available
  to work in directly for M2+.
- **D9 (resolved 2026-09-10)** — wildcard token for parametrized
  filters is `$NAME$` (paired `$`, `NAME` = `[A-Za-z_][A-Za-z0-9_]*`), **whole
  value only**, `$$` = literal `$`. Detect with `/^\$[A-Za-z_]\w*\$$/`. Rejected:
  bare `?`/`???` (no name to bind a form field to); `@NAME` (`@` is the full-text
  operator prefix); `#NAME` (used by `localization_*.txt`). Server
  parser/compiler must treat an unresolved `$NAME$` as an error, never a literal.
- **D10 (resolved 2026-09-10)** — the Search Form Editor is a **separate widget**
  (`HFilterFormEditor`), not part of `HFilterBuilder`, but rendered as an
  **overlay in the same builder dialog**. An "Edit Search Form" button appears
  next to `Apply`/`Save` only when the composed query holds ≥1 `$NAME$`; it opens
  the editor over the builder and relabels to "Back to filter builder".
  `paramForm` is stored as a sibling of `query` in the saved-filter definition;
  `kind:'parametrized'` = `paramForm.params.length > 0`. Full spec in §11.
- **D11 (resolved 2026-09-10)** — M9 **is** the replacement for legacy **faceted
  search** (`hclient/widgets/search/search_faceted*.js`,
  `search_faceted_wiz.*`), done the right way up: **query first**, then mark
  values as `$NAME$`, then customise the entry form. The legacy model —
  `search_faceted_wiz` defines the facet **inputs** first and derives a query
  from them — is explicitly rejected. No separate faceted-search wizard in the
  explorer; there is one builder (`HFilterBuilder`) plus the form editor
  (`HFilterFormEditor`).
- **D12 (resolved 2026-09-10)** — M3 build choices:
  1. **Field selector** = a **custom framework-free tree** (`HFieldTree`) that
     reproduces the legacy Fancytree behaviour (expand/collapse, lazy one-level
     linked-rectype expansion, reverse-pointer toggle, form/alphabetic order) —
     not a cascading menu.
  2. **Record-type value input** = plain "record id(s)" text field for M3, with a
     disabled "Pick…" button. A real record-search picker is a later follow-up
     (needs `/records` search + result list).
  3. **Reachability** = wire `ExplorerApplication` so `HFilter`'s *Search tools*
     opens `HFilterBuilder` in an `HMsg` dialog, replacing the legacy
     `hostBridge.openSearchBuilder()` call. No separate demo route.
  4. **Sort-by** = include a minimal collapsible "Sorted by" section
     (`HFilterBuilderSort` rows: field + asc/desc → `{sortby:…}`).
  Query compose/parse (`q`-array ↔ builder model) lives in a **pure, DOM-free**
  `src/utils/queryModel.js` so it is unit-testable (node `--test`, no jsdom).
  `onChange(jsonQuery, textQuery)` — since M4 `textQuery` carries the
  `queryDescribe()` sentence (also shown in a `.h-fb-sentence` panel).

### Still open

- none.

---

## 11. Parametrized filters & Search Form Editor (M9 — last phase)

### 11.1 Concept

A saved filter may leave one or more **values unbound** (wildcards). When such a
filter is activated, Explorer first shows an **interactive entry form**
(`HFilterForm`) so the user supplies the missing values; the resolved query then
runs through the normal `HFilter.executeDirectQuery()` → `/records` count →
`datasourcechange` path.

**Relation to legacy (D11).** This is the explorer's take on legacy **faceted
search** (`search_faceted.js` runtime, `search_faceted_wiz.js/.html` editor), but
inverted. Legacy `search_faceted_wiz` is *inputs-first*: pick facet fields →
define ranges → preview → a query is derived from the facet widgets. M9 is
*query-first*: compose the query in `HFilterBuilder`, mark any value as `$NAME$`,
then shape that value's runtime input in `HFilterFormEditor`. The query is always
the source of truth; the form is a thin presentation layer over its `$NAME$`
slots. There is no separate faceted wizard.

### 11.2 Wildcard token — D9 (resolved: `$NAME$`)

A predicate value that is **exactly** `$NAME$` is a parameter placeholder
(`/^\$[A-Za-z_]\w*\$$/`; `$$` escapes a literal `$`). Whole value only — no
`foo$X$bar`. The builder writes placeholders; the server parser/compiler must
reject an unresolved `$NAME$` ("filter requires parameters"), never treat it as a
literal string.

### 11.3 Storage — form schema beside the query

Saved-filter definition gains a `paramForm` sibling to `query`:

```jsonc
{
  "query": [ /* … with "$year$" placeholders … */ ],
  "paramForm": {
    "version": 1,
    "params": [
      {
        "name": "year",           // matches $year$
        "label": "Year of birth", // custom/localised; default = field name at the site
        "labels": { "fre": "Année de naissance" },
        "input": "number",        // widget kind — see 11.6
        "order": 1,
        "required": true,
        "default": "",
        "help": "",
        "config": {}              // per-kind: static list | vocab root | min/max/step | target rectypes
      }
    ]
  }
}
```

`kind:'parametrized'` is inferred from `paramForm.params.length > 0` — replaces
the loose `parameterized`/`parametrized` sniffing in client-core
`HFilter.js::inferFilterKind`.

### 11.4 `HFilterFormEditor` — separate widget, shared dialog — D10

- `src/widgets/filter/HFilterFormEditor.js`. Edits `paramForm` only; the builder
  edits `query` only.
- The builder dialog shows an **"Edit Search Form"** button next to
  `Apply`/`Save` **iff** the composed query contains ≥1 `$NAME$`.
- Clicking slides `HFilterFormEditor` **over** the builder in the same dialog
  frame; the button becomes **"Back to filter builder"**. `Apply`/`Save` remain
  and act on the combined `{query, paramForm}`.
- One editor row per unique `$NAME$`, auto-added/removed as the builder changes:
  drag-handle (order) · name (read-only, from the token) · label · input-kind
  dropdown · `required` · default · per-kind config · help text.
- Removing the last placeholder hides the button and drops `paramForm`.

### 11.5 Builder hooks needed at M3 (so M9 is not a retrofit)

- `HFilterBuilderItem` gets a per-value **"use as parameter"** affordance that
  writes `$NAME$` into that value slot (name defaults from the field code,
  editable, must be unique).
- `HFilterBuilder` exposes the set of `$NAME$` tokens in the current composed
  query (event or getter) so the dialog can toggle the "Edit Search Form" button
  and `HFilterFormEditor` can sync its rows.

### 11.6 Input kinds

Seeded from the field type at the placeholder site (`HDbDefs.fieldType`):
`text`, `number`, `date`, `daterange`, `select` (static list **or**
`config.vocab` = vocabulary root, rendered via `HDbDefs.termTree`), `multiselect`,
`record` (record picker, `config.targetTypes`), `range`/`slider`
(`config.min/max/step`), `checkbox`. The editor offers the compatible subset with
a sensible default.

### 11.7 Runtime — `HFilterForm`

`HFilter.activateFilter()` → kind `parametrized` → Explorer builds `HFilterForm`
from `paramForm` (order-sorted; label = `labels[lang]` ?? `label` ?? field name)
→ user fills → `substituteParams(query, values)` replaces each `$NAME$` →
`executeDirectQuery()` (count validation + `datasourcechange`) as normal. A
missing `required` value blocks submit. The already-scaffolded
`resolveParameterizedFilter` hook + `parameterizedfilter` event in client-core
`HFilter.js` are the seam.

### 11.8 M9 v1 scope

Flat placeholders only (predicate value position). One row per unique `$NAME$`;
repeated tokens share a value. **Defer**: placeholders in rectype / link
position, computed defaults, cross-field validation, grouped form layout.

---

## 12. Key file references

### Server — query language (exists)
- `srv/Records/Query/Parser/RecordQueryParser.php` — text↔JSON, normalize,
  validate; `KEYWORD_ALIASES`, `LINK_PREDICATES`, `isKnownPredicate()`.
- `srv/Records/Query/Compiler/QueryValueResolver.php` — name/label → local id
  (rty, dty, trm, user); the **forward** direction. Reverse (id → name) for
  Task A does not exist yet.
- `srv/Records/Query/Compiler/RecordPredicateCompiler.php`,
  `FieldPredicateCompiler.php` — predicate → SQL.
- `srv/Controller/RecordQueryController.php` — `/api/{db}/records` adapter;
  `buildRequest()` → `QueryBuilder::normalize()`.
- `documentation/context_help/searchQueryLanguage.htm` — full language reference.

### Server — patterns to copy for `/def`
- `srv/Controller/SystemQueryController.php`
- `srv/System/Query/{SystemQueryService,SystemEntitySchemaRegistry,SystemQueryBuilder}.php`
- `srv/System/Query/_README.md`
- `srv/Runtime/ServiceFactory.php` — controller factory (`systemQueryController()`).
- `srv/Runtime/ApiResponse.php` — success/error envelope.
- `hserv/controller/api.php` — router; `$is_system_query` branch (~L424, ~L525),
  `$entities` map (~L107), `$publicSearchResources` (~L492).
- `documentation/modern-records-workflow.md` — `/srv` scope & legacy-boundary
  rules (services must not `require`/`include`, no mysqli/System inside services).

### Client — existing (legacy, to be replaced, use as behaviour reference only)
> **Accessible from the explorer session** at `c:\xampp\htdocs\heurist\hclient\…`.
> M3 must mirror the legacy `searchBuilder` **workflow and UI** (rectype selector
> + optional multi-rectype + language; Fancytree field selector with lazy
> resource/relmarker expansion, reverse-pointer toggle, enum sub-part menu;
> `field_array` of operator/value rows with `not` + `and/or` conjunction;
> `any/all` between rows; sort-by accordion; live JSON preview;
> Filter/Save/preview/copy buttons). The `$NAME$` wildcard affordance (§11.5) is
> the only functional addition.
> **Do NOT port** the legacy `#ruleset_accordion` / `svs_Rules` / `_editRules()` /
> `rulesonly` UI — Expansion Rules are out of scope for the Filter Builder (D3).
- `hclient/widgets/search/searchBuilder.js` (~1900 ln) — the current visual
  builder. `_doCompose()` (~L1563) builds the nested `[{t},{f:…},{linked_to:[…]}]`
  JSON; `_initTreeView()` (~L1065) the field tree; `addFieldItem()` (~L544).
- `hclient/widgets/search/searchBuilderItem.js` (~1050 ln) — field/operator/value
  row; operator sets per field type `_defineInputElement()` ~L519–631;
  `getValues()` (~L829) → predicate object.
- `hclient/widgets/search/searchBuilder.html` — dialog DOM/layout.
- `hclient/widgets/search/searchBuilderSort.js` — one sort-by row.
- `hclient/core/utils_dbs.js` (~4000 ln) — `$Db`; accessors `rty`/`dty`/`rst`/
  `trm` (~L1450–1750), `rst_idx2()` (~L1547), `rst_links()` (~L1575),
  `trm_TreeData()` (~L2134), `trm_getLabel()` (~L2510),
  `getBaseFieldInstances()` (~L3344), `createRectypeStructureTree_new()` (~L423).
- `hclient/core/utils_query.js` — `parseHeuristQuery`, `composeHeuristQuery2`,
  `createFacetQuery` (legacy client query utils).
- `hclient/widgets/HBase/HBaseWidget.js` — the **jQuery** base (NOT the explorer
  one); `hclient/widgets/HFilter/HFilter.js` — unrelated existing widget (saved-
  search runner); mind the `HFilter` vs `HFilterBuilder` naming.
- `hclient/widgets/search/search_faceted.js` (~4600 ln, runtime) +
  `search_faceted_wiz.js/.html` (~2650 ln, editor) — legacy **faceted search**,
  the feature **M9 replaces**. Reference for facet input kinds / range handling
  only; its *inputs-first* wizard model is rejected (D11) — M9 is query-first.

### Client — target
- `hclient/bundles/heurist-explorer/` — built bundle only; source is a separate
  repo. Framework-free ES modules, own i18n (`$HR` / `localization_*.txt`
  `#key#value`), own `InlineHelp` class, mounts on `<main id="heurist-explorer">`.
- `hclient/modules/README.md` — describes the independent Vite module pattern and
  the reserved future `@heurist/client-core` shared package.

---

## 13. Changelog

- 2026-09-10 — initial draft (design discussion with Artem). Order fixed as
  C→A→B; `/api/{db}/def/snapshot` chosen as first `/def` service; snapshot shape
  drafted with gaps in the initial field list flagged.
- 2026-09-10 — decisions D1–D4 recorded: vocab JSON = operators/phrases only +
  hard-copied predicate constants on client; snapshot cached in `entity/` dir and
  invalidated via `cleanDefCache()`; HFilterBuilder v1 scope confirmed; no test
  project (client work goes straight into `heurist-explorer`). Milestones
  renumbered (M6 removed).
- 2026-09-10 — D5–D7: `meta.version`/`ETag` = file mtime; inline helper shows no
  human-readable text while typing (describe() is a post-parse compare step);
  explorer repo available for M2+. All open questions closed — M1 ready to build.
- 2026-09-10 — **M1 endpoint implemented and verified** (`DefinitionController` +
  `DefinitionSnapshotService`, wired into `ServiceFactory` / `api.php` /
  `cleanDefCache`, `tests/DefinitionSnapshotTest.php`). `queryVocabulary.json`
  still outstanding within M1.
- 2026-09-10 — service moved `Heurist\System\Definitions` → `Heurist\Definitions`
  (`srv/Definitions/`, a peer of `Records`/`System`). Payload trimmed (§4.2):
  no `rectypes.isRelation`; `separator` fields excluded; `fields.termTree[]` →
  `fields.vocabulary` (int); `structure[]` = `{rty,dty,name,order,req}` only.
  41/41 checks pass; snapshot ≈ 603 KiB for osmak_mapping.
- 2026-09-10 — **`srv/Records/Query/queryVocabulary.json` written** (`version:"1"`):
  `fieldKinds`/`headerKinds`, `operators` per kind, `common` NULL ops, `phrases`,
  `strings.eng` (46 keys, all referenced keys covered). **M1 complete** — next is
  M2 (HDbDefs) in the heurist-explorer repo.
- 2026-09-10 — **M2 in progress**: `src/utils/HDbDefs.js` + `test/hDbDefs.test.js`
  (19 subtests, `npm test` green). Full §5 method surface + on-load link graph.
  D8 recorded (explorer source layout: `src/utils/` for the data/query layer,
  `src/widgets/filter/` for filter widgets, `src/ui/` for shell chrome).
- 2026-09-10 — **M9 added as the last phase**: parametrized filters + Search Form
  Editor (new §11). D9 (`$NAME$` wildcard token — resolved 2026-09-10) and
  D10 (`HFilterFormEditor` is a separate widget overlaid in the builder dialog;
  `paramForm` stored beside `query`) recorded. §11.5 lists the `HFilterBuilder` /
  `HFilterBuilderItem` hooks M3 must include so M9 is not a retrofit. Legacy
  `searchBuilder` confirmed reachable; §12 note added that M3 mirrors its
  workflow + UI. Sections renumbered (Key file refs 11→12, Changelog 12→13).
- 2026-09-10 — **D3 amended**: Expansion Rules / Ruleset are **excluded** from the
  Filter Builder (not deferred) — legacy `#ruleset_accordion` / `_editRules` not
  ported. **D11 added**: M9 replaces legacy **faceted search**
  (`search_faceted*.js`) query-first; the legacy inputs-first
  `search_faceted_wiz` model is rejected; no separate faceted wizard in explorer.
- 2026-09-10 — **M2 committed** (`4ed72dc`). **D12 recorded** (M3 build choices:
  custom field tree, id-text record input, wire into HFilter Search tools, minimal
  sort row, pure `queryModel.js`). **M3 implemented in the working tree**:
  `queryModel.js` + `queryPredicates.js` + `queryVocabulary.json` (`src/utils/`);
  `HFilterBuilder` / `HFilterBuilderItem` / `HFilterBuilderSort` / `HFieldTree` /
  `vocabHelpers` (`src/widgets/filter/`); `HFilter`/`HFilterForm` moved there;
  `ExplorerApplication._openFilterBuilder` + `_ensureDbDefs`; client-core gains a
  `./widgets/*` subpath export. 53 tests green, `vite build` green. Browser QA +
  commit outstanding.
- 2026-09-10 — **M3 committed** (`70b2576`), plus browser-QA passes (native
  `<dialog>`, field-tree popover fixes, legacy-style row layout, `heurist-ui.css`
  primitives). **M4 done in the working tree**: `src/utils/queryDescribe.js`
  (`queryDescribe()` — A-min flat q-array → sentence, one linked level, matches
  the canonical plan example) + `test/queryDescribe.test.js` (13 subtests).
  `vocabHelpers.js` moved to `src/utils/`; `queryModel.js` re-exports 4 helpers
  for reuse. `HFilterBuilder` now emits the sentence as `onChange`'s 2nd arg and
  shows it in a `.h-fb-sentence` panel. 66 tests + `vite build` green.
- 2026-09-10 — **M5 done in the working tree**: `src/utils/parseTextQuery.js`
  (client flat keyword-text → q-array; `test/parseTextQuery.test.js` ×12) and
  `src/widgets/filter/HFilterInlineHelper.js` (token-hint dropdown while typing;
  `queryDescribe()` sentence on idle/blur, D6; injectable `parseText`/`describe`;
  lazy `onNeedDbDefs`; `test/hFilterInlineHelper.smoke.test.js` ×8). Wired onto
  HFilter's query input in `ExplorerApplication`. **86 tests + `vite build`
  green.** (M3 = `70b2576`, M4 = `103a6d9`; M5 uncommitted.) Browser QA pending.
- 2026-09-11 — **HFilter UI redesign, working tree.** Per Artem's numbered brief
  (discussed first, decisions recorded below), `src/widgets/filter/HFilter.js`
  rewritten: `.h-filter-query` is now a `<textarea>` sized to match the stacked
  Filter/Filter Builder/"Save for re-use" buttons via flex stretch; the old
  always-visible Saved Filters section is gone, replaced by a
  favorites/history/saved-filters/subsets `heurist-icon-button` row (same
  id/icon/label as the left rail) that toggles an in-widget subview panel —
  **saved filters is functional** (the former list/search/group/type-filter
  logic relocated there), favorites/history/subsets are "Not implemented yet"
  placeholders (unchanged from the rail's own state). Picking a saved filter no
  longer auto-executes it (dropped `activateFilter`/`resolveParameterizedFilter`
  — unused, and M9's `$NAME$` editing was always slated for the Filter Builder
  dialog, not here) — it now loads the raw query text into the box via
  `setQueryValue()` and returns to the main view for the user to review/edit
  before clicking Filter. "Save for re-use" is a stub (`HMsg.showMsgFlash`) —
  real persistence waits for the separate saved-filters management panel this
  replaces the browsing half of. The full `HFilterInlineHelper` (hint dropdown)
  is **disabled for now** per Artem — `ExplorerApplication` no longer
  instantiates it; the `h-fih-sentence` readout is now driven directly by a new
  `describeQuery` option on `HFilter` (`ExplorerApplication._describeQueryText`,
  reusing `parseTextQuery`/`queryToArray`/`queryDescribe`), debounced 700ms on
  idle + immediate on blur, hidden whenever the box is empty or undescribable.
  `HFilterInlineHelper.js` itself is untouched, just unwired — reviving the
  hint dropdown is future work. Renamed the widget's public surface to match:
  `showSearchTools`→`showFilterBuilder`, `onSearchTools`→`onFilterBuilder`,
  `openSearchTools()`→`openFilterBuilder()`; added `refreshSentence()`.
  `ExplorerControlPanel`: the shared tool-panel header gets a `.h-filter-header`
  modifier (scoped to the Filter panel only, per discussion — other flyouts
  keep default chrome) styled after client-core's `.heurist-source-header`;
  title changed "Search"→"Filter"; a header Help button (hidden except for the
  Filter panel) opens `public/searchQueryLanguage{Eng,Fre}.htm` via
  `InlineHelp`, which gained an optional `fileBase` constructor override (in
  `@heurist/client-core`) since these files don't follow the
  `{moduleName}UserManual{Lang}.htm` convention. Also fixed the tool-panel's
  autofocus to scope to `flyoutBody` instead of the whole flyout (it was
  matching header chrome buttons first). **Point 2 (Pin button / docking HFilter
  to the data-module panel) deferred entirely** — HFilter stays the existing
  absolutely-positioned floating flyout; no Pin button added yet, needs its own
  LayoutManager design discussion. `npm test`: 55/58 (3 pre-existing failures,
  see above — none newly broken). `vite build` green. Browser QA pending;
  nothing committed yet.
