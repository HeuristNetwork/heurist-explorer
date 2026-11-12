# Query language: old plain-text format vs new format

**Status 2026-11-12: analysis done; engine fixes (§3) and plain-text parser (§4) done in both repos, not
committed, not checked in a browser. Remaining work: §2.** Compares the old simple filter format
(help `heurist/documentation/context_help/advanced_search.htm`, parser `hserv/records/search/composeSqlOld.php`,
used by `recordSearch()` when `q` is not JSON) with the new format (help `searchQueryLanguage.htm`, parser
`srv/Records/Query/Parser/RecordQueryParser.php`, compiler `srv/Records/Query/Compiler/`).

The old JSON format (`composeSql.php`) is not covered here: `tests/compatibility/QueryCompatibilityRunner.php`
already compares it with the new engine.

**How it was checked.** Every example of the old help (and the forms the old parser accepts but the help does
not mention) was run through both engines on `osmak_mapping` (205,045 records, user 2 = database owner):
legacy `recordSearch()` with the plain string, new `QueryBuilder::normalize()` + `RecordSearchService`.
Numbers in brackets are record counts. The probe scripts were temporary (removed).

## Categories

| Code | Meaning |
|---|---|
| **NEW** | Has a predicate in the new format (same or better result) |
| **FIXED** | Was missing or wrong in the new format; ported or fixed 2026-11-12 (§3, §4) |
| **BROKEN** | Never implemented or not working in the old version (old help describes something the code does not do) |
| **OUTDATED** | Old feature not needed any more (replaced by JSON, expansion rules, UI, or no data); plain text gives an error that names the keyword to use |
| **OPEN** | Still to do or to check (§2) |

A row can have two codes, e.g. BROKEN → NEW: did not work in the old version, works in the new one.

## 1. Main table

Column *New (now)* = the new engine after the changes of 2026-11-12, plain text unless JSON is shown.

### 1.1 General syntax

| Old feature | Old | New (now) | Code | Notes |
|---|---|---|---|---|
| `word word` = AND, title contains | works (15) | same | NEW | |
| `"exact phrase"` in title | works | same | NEW | |
| `a OR b` (uppercase OR) | works: `Johnson OR Berlin` 39 | same (39) → `{"any":[…]}` | FIXED | Old precedence: `a b OR c d` = (a AND b) OR (c AND d). Lowercase `or` is a word. |
| `a AND b`, `&&` | works (top-level AND) | same: splits before OR, `t:12 AND Berlin OR Paris` | FIXED | Lowercase `and` is a word. |
| `-term` (title does not contain) | works (12) | same (12) | NEW | |
| `-keyword:value` (`-t:10`, `-tag:x`, `-owner:2`, `-addedby:2`, `-notes:a`, `-fc:240:>2`, `-f:1:`) | works (e.g. `-addedby:2` 5, `-f:1:` 34) | same counts → `{"not":[…]}` | FIXED | `-notes:a` 184 (old 185): NULL scratchpads, §2 item 1. The value form `tag:-x`, `f:1:-x` also works. |
| `key=value`, `key<value`, `key>value` (`title=x`, `f:1=x`, `f:1160>5000000`, `modified>2001-09-11`, `added>yesterday`, `tag=x`) | works | same → `title:=x`, `f:1:>B`, … | FIXED | Only after a keyword: `a<b` stays a title word. `ids>N` gives an error (§2 item 4). |
| `key:` empty value = has any value (`f:1:`) | works for text (205,011) | same | NEW | New also has `NULL` / `-NULL`; the old had no NULL (`f:1:NULL` = text "NULL"). |
| `%` wildcard (`title:Joh%`) | works (55) | same (55) | NEW | |
| Nested field query `f:134:(t:12 title:Berlin)` | **error** | `lt:134` subquery (1); relationship marker → `related:N`; other field types an error | BROKEN → FIXED | Also in JSON (`QueryValueResolver`). Usual form: `lt134(t:12 title:Berlin)`. |
| `+` as space inside a token | works | no | OUTDATED | URL-encoding artefact. |

### 1.2 Record header predicates

| Old feature | Old | New (now) | Code | Notes |
|---|---|---|---|---|
| `title:x`, `title=x` | works | `title:x`, `title=x` / `title:=x` | NEW / FIXED (`=`) | |
| `title<B`, `title>Y`, range (text compare) | works (12,315 / 4,726) | same (12,315 / 4,726); `title:B<>C` 16,725 | FIXED | Also `url`, `notes` (`headerTextCondition`). |
| `type:` / `t:` id, name, csv | works | same (`t:10,12` 121) | NEW | New also plural names and concept codes. |
| `-t:10` / `t:-10` / `t:-Person` | `-t:10` works | all work (205,033) | FIXED | `t:-10` was an error. |
| `url:x` | works (1) | same (1) | NEW | `-url:x` / `url:-x` lose records with an empty URL (old too): §2 item 1. |
| `u:x` | works | error "use url:" | OUTDATED | |
| `notes:x` (scratchpad) | works (25) | same (25) | NEW | |
| `n:x` | works | error "use notes:" | OUTDATED | |
| `notes:` = private bookmark notes in "My Resources" | **never**: in bookmark mode the old code returns an empty condition | none | BROKEN, OUTDATED | Private notes are encrypted now (`PrivateInfoCipher`, plan 20), no SQL search possible. |
| `user:` / `usr:` id, login | works (9) | same (9); `usr:current` | NEW | |
| `user:"First Last"` | **works** (9): first + last name | error "Unknown user" | OUTDATED | Names are not unique; login or id is enough. |
| `usr:2,5` (list) | works (11) | error | OPEN (low) | §2 item 4. `owner` / `addedby` accept lists. |
| `addedby:` id, login, csv | works | same | NEW | `addedby:"First Last"`: 0 in old, error in new. |
| `owner:` / `wg:` / `workgroup:` id, name, csv, `currentuser` | works | same (206, 212, 38) | NEW | `owner:"First Last"`: 0 in old, error in new. |
| `vt:public` / `viewable` / `hidden` / `pending` | works (198 / 204,838 / 9) | `access:public` (198), `access:-public`, `access:viewable,public` | NEW | `vt:` gives an error "use access:". Old `vt:viewable` also added an owner/group check; `access:` is only the visibility value. |
| `vt:-public` (negation) | **ignored** (198 = `vt:public`) | `access:-public` (204,847) | BROKEN → NEW | |
| `visibility:` | **not a keyword** in old code (0) | error "use access:" | BROKEN, OUTDATED | Only a heading in the old help. |
| `after:` / `since:` / `before:` | works | same | NEW | `after:today`: old 1 (from midnight), new 0 (after the whole day). |
| `date:` (alias of modified) | works (`date:"last Tuesday"` 24) | error "use modified:"; `modified:"last Tuesday"` 24 | OUTDATED | |
| `modified:` / `added:` with a date | partly: `added:2026-08` **6 (wrong)** | `added:2026-08` 204,773 (= range) | BROKEN → NEW | Old uses `LIKE 'date%'` on a converted date. |
| `modified:>X`, `added:>yesterday` (operator after the colon) | **ignored**, all 205,045 | works (`modified:>yesterday` 1) | BROKEN → NEW | `modified>X` works as well. |
| Relative / human dates (`"60 days ago"`, `"3 June 2026"`, `"last Tuesday"`, `today`, `yesterday`) | works (PHP `DateTime`) | works for header dates | NEW | New also `month`, `year`, `last month`, `N units ago`. |
| Time of day, free forms (`"12.30pm November 22"`, `"1945-07-16 05:29:45"`) | works | error "Invalid date value" / 0 | OPEN (low) | §2 item 4. |
| `ids:` / `id:` list, `sortby:set` | works | same; forwarded ids followed | NEW | |
| `ids:100<>120`, `ids>N`, `ids<N` | works (15 / 122 / 99) | error "Invalid record ID" | OPEN (low) | §2 item 4. |
| `hhash:` (record hash) | code exists | error "not supported any more" | OUTDATED | `rec_Hash` is empty in the test db. |
| `_BROKEN_` (URL check error) | code exists (0) | title word | OUTDATED | URL verification is not done any more. |
| `_NOTLINKED_` (no links at all) | works (204,752) | `{"connected":[{"exists":"NULL"}]}` (205,029) | NEW, OPEN | Counts differ by 277, §2 item 3. |
| `ws:` working set | not in old plain text (`use_user_wss` request flag only) | `ws:current` | NEW | |

### 1.3 Detail fields

| Old feature | Old | New (now) | Code | Notes |
|---|---|---|---|---|
| `all:x` / `any:x` = any field | works (25) | same (25) → `f:x` | FIXED | JSON `all` / `any` are logical groups; only plain text with a value means `f:x`. |
| `f:x` / `field:x` any field | works (25) | same (25) | NEW | |
| `-field:x` / `f:-x` (no field contains x) | **0 (broken)** | 205,020 = `{"not":[{"f":"x"}]}` | BROKEN → FIXED | `f:-x` returned every record before the fix. |
| `f:196:x`, `field:196:x`, `f196:x` | works | same | NEW | |
| `f:1:-x` | works | same (records with field 1 not containing x) | NEW | |
| `-f:1:` (no value) | works (34) | same (34); also `f:1:NULL` | FIXED | |
| `f:10:` on a **date** field | **error** | works (22) | BROKEN → NEW | |
| Field by name `f:Name:x` | works (15; base name, prefix match) | same (15); unknown name = error | FIXED | Name = `dty_Name` or the record-type display name (`rst_DisplayName`) within the type. `fName:x` also works. |
| Quoted name `f:"Name":x`, `f:"date added"<yesterday` | **broken** (name ignored) | works: `f:"Start date"<2000` | BROKEN → FIXED | |
| Enum by id (children included), label, code | works (29) | same (29); `=` exact | NEW | New also `:label` `:code` `:concept`, language prefix. |
| Numbers `f:1160:>N`, `a<>b` | works (133 / 45) | same | NEW | |
| Text compare `f:1>B f:1<C` | works (16,730) | same (16,726) | NEW | |
| Date compare `f:9>2000`, `f:9<2000` | **reversed**: `>2000` returns spans ending before 2000 (8) | correct: `>2000` 32, `<2000` 8 | BROKEN → NEW | Old `greaterthan` = `rdi_estMaxDate < min`. |
| Date overlap / range `f:9:1999<>2001` | works (2) | same (2) + `><` within, `=` | NEW | |
| File field `f:39:jpg` (name / extension) | works (6) | same (6) = `file:39:jpg` | FIXED | |
| Pointer field by linked title `f:134:Berlin` | works (1) | error "Numeric field requires a numeric value" | NEW | Use `lt134(title:Berlin)`; the error is clear. |
| Fulltext `f:@x`, `f:1:@x` | works (15 / 15) | works, different engine (30 / 9) | NEW | New adds `@+`, `@-`. Not equal by design. |
| `fc:240:2`, `fc:240:>2`, `fc:240:<2`, `fc:240=2` | works | same | NEW / FIXED (`=`) | |
| `fc:240:1<>3` (range) | works (3) | same (3) | FIXED | |
| `count:` / `cnt:` | not in old (title search) | aliases of `fc` | NEW | |

### 1.4 Tags

| Old feature | Old | New (now) | Code | Notes |
|---|---|---|---|---|
| `tag:x` = **prefix** (`time` finds `timemap`, not `maritime`) | works: `tag:key` 5 | exact text or id: `tag:key` 0 | NEW, OPEN (low) | Prefix only with an explicit `%` if wanted (`tag:key%`, now 0): §2 item 4. |
| `tag=x` exact | works (2) | same (2) | FIXED | |
| `tag:a,b` (any), id, `group\tag` | works | same | NEW | New also `{"tag":{"all":[…]}}`, `NULL`, `-NULL`. |
| `-tag:x` | works (205,043) | same (205,043); also `tag:-x` | FIXED | |

### 1.5 Links and relationships

The old help describes `linkedfrom:ID`, `linked_to:ID`, `related_to:ID`, `relatedfrom:ID` with a **record id**.
In the old code most of them take `recordtype[-field]` (or `recordtype-relationtype`) and work against
`parentquery`, i.e. they were the building blocks of the old rule sets. Only some work with an id.

The long names `linked_to`, `linkedto`, `linked_from`, `linkedfrom`, `related_to`, `relatedto`, `related_from`,
`relatedfrom` are kept in JSON and plain text for saved filters (§3) and become `lt` / `lf` / `rt` / `rf`.

| Old feature | Old | New (now) | Code | Notes |
|---|---|---|---|---|
| `linkedfrom:ID` | works by id (9) = records ID points to | `lf:ID` (9) | NEW | **Old help is wrong**: says "records which have pointers TO this record" and "includes relationship records"; the code does neither. |
| `linked_to:ID` / `linkedto:ID` | works (7) = records pointing to ID | `lt:ID` (7) | NEW | |
| `linkto:ID`, `linkfrom:ID` | `linkto` = **linkedfrom** (9) | error "use lt or lf" | OUTDATED | Removed: they were `lt` / `lf` in the new plain text, the opposite of the old meaning. |
| `links:ID` | resource links **and relationships** (12) | `connected:ID` (12); `links:ID` = resource links only (9) | NEW | `connected` is the old `links`. |
| `relatedto:ID` | **either direction** (3) | `rt` = stored direction (1); `related:ID` (3) | NEW | Old plain-text `relatedto` = new `related`; old JSON `relatedto` = `rt` (kept). |
| `related_to:ID`, `relatedfrom:ID` | value = `rectype-reltype` + parentquery: by id **0** | `rt:ID` (1), `rf:ID` (2) | BROKEN → NEW | The help's "plus the Relationship records" is not in the code. |
| `related:rectype[-reltype]` | works (`related:10` 11) | `related` takes ids / subquery: `{"related":{"t":10,"r":3115}}` | OUTDATED | Meaning of the value changed. |
| `linkedfrom:rectype-field` etc. without parentquery | error | error "Invalid linked record ID" | OUTDATED | Rule sets are JSON now (`rules`, plan 09); old rules are converted in the Explorer (`legacyRules.js`). |
| `relationsfor:ID` (related records + Relationship records) | works (6) | error "use related:<record id>" | OUTDATED | |
| Nested link subquery in plain text | only `f:N:(…)` (broken) | `lt134(t:12 title:Berlin)`, `linkedto:134(…)`, `f:134:(…)`, any depth in JSON | NEW / FIXED | |

### 1.6 Geography

| Old feature | Old | New (now) | Code | Notes |
|---|---|---|---|---|
| `geo:"WKT"` | **0 (broken in plain text)**: the parser splits the parentheses | `geo:"POLYGON(…)"` containment (83,121) | BROKEN → NEW | |
| `geo:W,S,E,N` (box) | works (83,132) | same (83,132) | FIXED | Was an SQL error. |
| `geo:` / `geo:NULL` | SQL error | works (204,833 / 212) | BROKEN → NEW | |
| `latitude:Y`, `longitude:X` (geometry spans the line) | works (15 / 0) | `geo:intersects` with a LINESTRING | OUTDATED | Plain text gives an error "use geo:within or geo:intersects". |
| `latitude>Y`, `<Y`, `longitude>X`, `<X` (entirely N/S/E/W) | works (4 / 22 / 15 / 26) | `geo:within` with a band polygon | OUTDATED | |
| `lat:40<>60` (centroid in range) | works (91,500) | `geo:within` band | OUTDATED | |
| `latitude=Y` / `lng=X` (point with exact coordinate) | works (1 / 4) | none | OUTDATED | Exact float match is of no practical use. |

The Filter Builder and the map viewport produce `geo`; plain-text shortcuts for latitude / longitude are not needed.

### 1.7 Sorting

| Old feature | Old | New (now) | Code | Notes |
|---|---|---|---|---|
| `sortby:t` / `title`, `id`, `rt`, `m` / `modified`, `a` / `added`, `u` / `url`, `-` / `+` | works | same | NEW | New: several keys, JSON array. |
| default sort = title | yes (help) | none / as requested | OUTDATED | Clients send the sort. |
| `sortby:p` / `popularity` | **descending** by default | ascending by default | OUTDATED | Popularity is not maintained any more. |
| `sortby:r` / `rating` | own rating only in bookmark mode, else popularity | current user's bookmark rating | NEW | |
| `sortby:f:N` | integer/float cast, **pointer field = linked title**, date = estimated date | typed sort; enum by term order / label; **pointer field = linked record id** | NEW, OPEN | Pointer field by linked title: §2 item 2. Old casts for named fields were swapped. |
| `sortby:f:Name` | base name | name resolved by the parser | NEW | |
| `sortby:f:N:m` (one row per value) | works | error | OUTDATED | A result is a set of records; a record can not appear twice (paging, counts, selection). |
| `sortby:interest` / `content` / `quality` | = title | error "Unknown sort expression" | OUTDATED | |
| `sortby:set` / `fixed` | works | same | NEW | |

### 1.8 Request (URL) parameters

| Old parameter | Old | New | Code | Notes |
|---|---|---|---|---|
| `w=bookmark` / `all` / `e` | search domain: bookmarks only / all / incl. temporary | `usr:current` predicate | OUTDATED | |
| `s=a` / `m` / `t` / `u` | sort if no `sortby:` | `sortby` predicate | OUTDATED | Duplicates `sortby` (the Data module sends `sortby` itself). |
| `ver=1` | nothing | – | OUTDATED | |
| `cf=1` | old UI: clear the search box | – | OUTDATED | |
| `stype=key` / `all` | default predicate tag / any (removed 2024) | – | OUTDATED | |
| `publiconly=1` | only public records | `access:public` | NEW | |
| `l` / `limit`, `o` / `offset` | works | `limit`, `offset` | NEW | |
| `parentquery` | context of the old rule predicates | `rules` | OUTDATED | |
| legacy `search_title`, `k`, `u`, `n`, `r`, `uid`, `bi`, `a` (`construct_legacy_search`) | commented out | – | OUTDATED | |

## 2. Remaining work

1. **Empty (NULL) header values with negation.** `url:-x`, `notes:-x` and `not` groups over `url` / `notes`
   leave out records whose URL or scratchpad is empty (`NOT LIKE` / `NOT (…)` on NULL): `-notes:a` 184, expected
   185 (the old engine has the same fault for `url:-x`). Engine (`headerTextCondition`), JSON too.
2. **Sort by a pointer field** (`sortby:f:134`): by the linked record's title, as the old engine did; now by the
   linked record id. Engine (`SortCompiler`).
3. **`_NOTLINKED_` count**: old 204,752, new `{"connected":[{"exists":"NULL"}]}` 205,029. Find out which records
   differ and which result is right.
4. **Optional, low**: `ids:a<>b`, `ids:>N`, `usr:a,b`, `tag:x%` (prefix), time of day in header dates
   (`before:"2026-11-12 10:30"`). Only if users ask for them.
5. **Compatibility DIFFs** of the full `QueryCompatibilityRunner` (not caused by these changes):
   `header-modified-after`, `link-exists-not-null` (expectations depend on current data), `field-fulltext-any`
   (legacy difference), `sort-title` (order of equal titles).
6. **Server tests that do not run**: `QueryBuilderTest`, `RecordQueryControllerTest`, `RecordSearchPhase3Test`,
   `RecordSearchServiceTest`, `RecordSearchSqlLinkedTest` require the removed `hserv/records/search/query/`;
   `CaseSensitiveQueryTest` fails in its legacy part (MySQL trailing-space collation). Update or remove.
7. **Query description**: `queryDescribe` shows `title:"=Johnson, John"` as two values (comma split), also for JSON.
8. **French help page** `user-manual/searchQueryLanguageFre.htm`: the changes of §4 are only in the English page.

## 3. Engine fixes done 2026-11-12 (JSON and plain text)

Agreed with Artem: fix the engine-level bugs first (JSON has them too), then the plain-text parser (§4).
All in `heurist/srv/Records/Query/`, not committed. Counts on `osmak_mapping`, user 2.

| # | Query | Before | After | Change |
|---|---|---|---|---|
| 1 | `{"f":"-Berlin"}` | 205,045 (every record) | 205,020 = `{"not":[{"f":"Berlin"}]}` | `-x` on an any-field value is record level, like `@-x`: `FieldPredicateCompiler::isAnyFieldExclusion()` used by `anyFieldCondition()` and the precomputed-candidate path in `RecordSearchService`; `anyFieldCandidateSource()` takes the positive value. `f:N:-x` (one field) unchanged. |
| 2 | `{"title":"<B"}`, `">Y"`, `"B<>C"` | "contains <B" (60) | 12,315 / 4,726 / 16,725 (= SQL) | `FieldPredicateCompiler::headerTextCondition()` for title, URL and notes: `>`, `>=`, `<`, `<=`, `a<>b` compare text, everything else as before (`textCondition`). |
| 3 | `{"f:39":"jpg"}` (file field) | 0 | 6 = `file:39` | `fieldCondition()` hands a file field to `fileCondition()`; `""`, `NULL`, `-NULL` work as for `file:`. |
| 4 | `{"fc:240":"1<>3"}` | error | 3 | `fieldCountCondition()` accepts `a<>b`, `<>a/b`, `><a/b` (whole numbers, ends included). |
| 5 | `{"geo":"-16,32,40,72"}` | SQL error | 83,132 = extent object | `geoCondition()` reads four numbers `west,south,east,north` as the extent object (same checks and `intersects` default). |

**Legacy link aliases (Artem).** JSON keeps the old aliases `linked_to`, `linkedto`, `linked_from`,
`linkedfrom`, `related_to`, `relatedto`, `related_from`, `relatedfrom` for existing saved filters (same meaning
as in the old JSON parser `composeSql.php`: `relatedto` = `rt`, stored direction). `RecordQueryParser::normalize()`
replaces them by `lt` / `lf` / `rt` / `rf` at every level (`LEGACY_LINK_ALIASES`, commented as outdated), so
the engine sees only the short keys. Checked: each alias gives the same normalized query and count as its
short key (direct, with a field suffix, nested, inside `any`, with `exists`, `NULL`).

Tests: new cases in `heurist/tests/compatibility/queries.json` (`field-any-excluded`, `header-title-less`,
`header-title-range`, `field-file-as-field`, `field-count-range`, `geo-viewport-text`) pass. Query tests
`ConnectedPredicateTest`, `GeoPredicateTest`, `QueryTextParserTest`, `RelationshipPredicateTest`,
`SystemQueryTest`, `TemporalSearchTest`, `FieldPatchTest`, `RecordActionTest` pass. Full
`QueryCompatibilityRunner`: PASS=56 DIFF=4 (the four DIFFs do not use the changed code, §2 item 5).

## 4. Plain-text parser done 2026-11-12

Decisions agreed with Artem 2026-11-12. Server `heurist/srv/Records/Query/Parser/RecordQueryParser.php`
(+ `Compiler/QueryValueResolver.php`), client copy `apps/explorer/src/utils/parseTextQuery.js`
(+ `queryPredicates.js`), same rules. Plain text is converted to JSON, so the JSON format and the Filter
Builder are not affected.

| Rule | Example | JSON |
|---|---|---|
| Uppercase `AND` / `&&` splits at the top, uppercase `OR` splits a part into alternatives, words are ANDed (old precedence); lowercase `and` / `or` are words; sort applies to the whole query | `t:10 Johnson OR t:12 Berlin`, `t:12 AND Berlin OR Paris` | `{"any":[{"all":[…]},{"all":[…]}]}`, `[{"t":12},{"any":[…]}]` |
| `-keyword…` = `not` (no value matches); `-word` stays a negated title value | `-tag:x`, `-f:1:`, `-t 10`, `-lt134(…)` | `{"not":[{"tag":"x"}]}` |
| `t:-<type>` excludes types (names resolved, negation kept) | `t:-Person` | `{"t":"-10"}` |
| Operator instead of the colon, only after a keyword (`a<b` stays a title word); operator before a quoted value | `title="Johnson, John"`, `f:1>B`, `modified>2026-08-01`, `fc:240=2`, `tag=x` | `{"title":"=Johnson, John"}`, `{"f:1":">B"}`, `{"tag":"x"}` |
| Field by name, quoted when it has spaces; unknown name = error (not a silent any-field search); an any-field value with a colon is quoted | `f:Name:x`, `f:"Date of birth"<1900`, `fc:Author:>2`, `f:"10:30"` | `{"f:1":"x"}` after resolution |
| `all:x` / `any:x` with a value = any field | `all:Berlin` | `{"f":"Berlin"}` |
| `f:<field>:(…)` = `lt:<field>` (pointer) / `related:<field>` (relationship marker), other types an error (resolver, also for JSON) | `f:134:(t:12 title:Berlin)` | `{"lt:134":[…]}` |
| `linkedto:134(…)`: the number is the field | | `{"lt:134":[…]}` |
| Outdated keywords give an error with the keyword to use: `linkto`, `link_to`, `linkfrom`, `link_from` (removed, opposite meaning in old plain text), `relationsfor`, `latitude`, `longitude`, `lat`, `long`, `lng`, `vt`, `visibility`, `u`, `n`, `date`, `hhash`; a word without a value is still a title word | `linkto:153` | error |
| Only `f` / `fc` / `field` take a glued field name, and only with a value (`fGender:male`); `fred`, `Re:` are title words | | |

Results on `osmak_mapping` equal the old plain-text engine: `Johnson OR Berlin` 39, `-t:10` 205,033,
`-tag:key1aaa` 205,043, `-owner:2` 204,839, `-addedby:2` 5, `-f:1:` 34, `-fc:240:>2` 205,044, `all:Berlin` 25,
`f:Name:Johnson` 15, `fc:240=2` 2; `f:134:(t:12 title:Berlin)` 1 (error in old); `f:9>2000` 32 (old reversed: 8).

Help: `user-manual/searchQueryLanguageEng.htm` = `heurist/documentation/context_help/searchQueryLanguage.htm`
(plain-text section, operator table, field / fc / file / geo / link rows, limitations).

Tests: `heurist/tests/QueryTextParserTest.php` (+73 cases, 83 pass), compatibility group `plaintext` (7 cases, pass,
5 against the old engine), `apps/explorer/test/parseTextQuery.test.js` (26 pass, two old cases changed: `-key:x` is
now `not`, lowercase `or` is a word), `npm test` 1,722 pass.
