# Data access layer (srv) — development plan

Status: **agreed 2026-10-13 (open points answered, §Agreed decisions). Phases 1 (definitions and
settings), 2 (records), 3 (files and users), 4 (search compiler), 5 (boundary test) and 6 (plan 14 title
mask and calculated fields) implemented 2026-10-13 in the heurist repo, not committed (§Implementation
notes). Plan 15 is complete.**
The title mask fill and the calculated fields of plan 14 wait for Phases 1–2. Plans 12–14 are committed
(heurist `81526abd7`, heurist-explorer `3423c49`).

## Context

The tables of records, definitions, files and users are queried directly in about 50 files of
`heurist/srv/`. The worst cases:
- **Records:** 17 files; recLinks 9; recDetails 9.
- **Definitions:** defTerms 12; defDetailTypes 9; defRecStructure 7; defRecTypes 6.
- **Files and users:** recUploadedFiles 6; sysUGrps 7.
- **Plan 14 code** made it worse: `RecordValidator`, `RecordPermissionService` and
  `RecordDeleteService` query the tables directly.

These are planned changes of the storage:
- system records move to `sysRecords` / `sysRecDetails`;
- definitions move to `defRecords` / `defRecDetails`;
- uploaded files become records of a Heurist record type.

With queries in dozens of classes, each of these changes would mean editing all of them. The same
code also exists several times, and the copies do not agree:

| What | Copies |
|---|---|
| Record headers by id | ExpansionEngine::loadRecordHeaders, GraphService::loadHeaders, RecordDataService::loadRecords, PresentationRecordRepository::getPublicRecord, RecordStore::header, RecordValidator::targetType |
| Linked / related records (recLinks) | TemplateApi::getLinkedRecords, getRelatedRecords; RecordDeleteService::references; RecordSearchService::loadResourceEdges, loadRelationshipEdges, expandGraphStep; ExpansionEngine::readEdgePass; GraphEdgeDiscovery::collect; ExportPlanner::linksAmong |
| Visibility condition | PresentationRecordRepository::accessCondition, RecordPredicateCompiler::appendAccessConditions, RecordPermissionService::editableIds, FieldPredicateCompiler::detailVisibilityCondition. **The first two differ:** only the compiler adds group 0 and the user's own id to the group list. |
| Term descendants | QueryValueResolver::termDescendants, FieldPredicateCompiler::termChildrenAll, RelationTermResolver::expand. DefinitionSnapshotService::termlinks also reads `trm_ParentTermID`; the other three do not. |
| Field type / pointer targets / term tree | FieldPredicateCompiler::fieldType, FieldValueCounter::describeField, FieldValueRange::describeField, QueryValueResolver::fieldMetadata, RelationTermResolver::marker, DefinitionLookup::fieldConstraints |
| Rectype / field names, structure | DefinitionLookup, ReportDefinitions, DefinitionSnapshotService |
| Term labels / codes / translations | PresentationRecordRepository::getTermCode/getTermLabel, ReportRepository::loadTerms, SmartyEngineFactory::translateTerms, ReportDefinitions::translation, DefinitionLookup::allTerms |
| Database settings (sysIdentification) | DefinitionLookup::registeredId, DefinitionSnapshotService::build, RecordSaveService::publicToPending, RecordValidator::newTemporalFormat, plus ServiceFactory (from legacy settings) |
| Tags | ReportRecordAssembler::personalTags, RecordPredicateCompiler::tagCondition, FieldValueCounter::sourceParts, SystemQueryBuilder::recordTagsCondition |

**Concept codes.** There are several rules, and they do not agree:
- **`DefinitionLookup::conceptCodeFor` (to a code):** origin `db-id`, else `registeredId-localId` (`0-localId` for an unregistered database).
- **`Runtime/ConceptCode` (terms only):** only the raw origin columns, else null. Converting back needs an exact origin match.
- **`DefinitionSnapshotService::localByConcept`:** exact origin match only.
- **The query compilers (code → local id):**
  - `RecordPredicateCompiler::recordTypeCondition` only matches the origin columns.
  - `FieldPredicateCompiler::termCondition` compares `CONCAT(origin)` only.
- **`ReportDefinitions::localId`:** the only one that accepts every form.
- **Legacy title masks:** a bare local id on an unregistered database.

So a code that `DefinitionLookup` writes for a locally created definition, `<registered id>-<local id>`,
is not found by most of the code → local id converters.

## Agreed decisions (2026-10-13)

1. **Concept codes:**
   - A local definition of an unregistered database is written as `0-<id>`.
   - A value without the `dbid-` prefix is read as a local id.
   - Codes `origin-id`, `registeredId-localId` and `0-localId` are all read.
2. **Visibility:** the compiler's version is the one implementation. It adds group 0 and the
   user's own id to the user's groups.
3. **Names and namespaces** as proposed below.
4. **Workflow rules** are in `DefinitionLookup`.
5. **Table names:** `RecordSchema` (new) is the set of table names given on init.
   - The defaults are the current tables.
   - `RecordRepository`, `RecordStore` and the search compiler take the same object.
   - `RecordStore::DEFAULT_TABLES` moves into it.

## Decision

Four access classes. No other class of `srv/` names these tables. They are the only place to
change when the storage moves.

1. **`DefinitionLookup`** (`Heurist\Definitions`): record types, fields, structure, terms, term
   links, translations, calculated-field formulas and workflow rules. It holds the one
   concept-code rule. Loading is lazy and per item (one term, not all terms). Bulk methods exist
   only for the snapshot.
2. **`RecordRepository`** (reads) and **`RecordStore`** (writes) (`Heurist\Records\Store`):
   - **Tables:** Records, recDetails, recLinks, recDetailsDateIndex, usrRecPermissions,
     recForwarding, usrBookmarks, usrRecTagLinks/usrTags, usrReminders, recThreadedComments.
   - **What they cover:** headers, values, links, relationships, owners and access, tags and
     bookmarks, counts.
   - **`RecordSchema`** (new class) holds the table and column names, validated as identifiers,
     with no queries.
     - Defaults: `new RecordSchema()` = Records, recDetails, recLinks, recDetailsDateIndex,
       usrRecPermissions and the user record tables.
     - Another pair: `new RecordSchema(['records' => 'sysRecords', 'details' => 'sysRecDetails', ...])`.
     - The repository, the store and the search compiler get the same object in their
       constructors, so readers, writers and search always use the same tables.
3. **`FileRepository`** (`Heurist\Records\Files`): recUploadedFiles and defFileExtToMimetype.
4. **`UserGroupRepository`** (`Heurist\Users`): sysUGrps, sysUsrGrpLinks.

Plus a small **`DatabaseSettings`** (`Heurist\Runtime`) for sysIdentification: registered id,
database version, `sys_SetPublicToPendingOnEdit` and the other database settings. Settings are
not definitions, so it is a separate class.

`usrSavedSearches` and the other `/sys` entities are already behind
`System/Query/SystemEntitySchemaRegistry`. That stays; the users and groups part uses
`UserGroupRepository`.

### Search compiler (SQL text)

`QueryBuilder`, `FieldPredicateCompiler`, `RecordPredicateCompiler`, `SortCompiler` and
`FieldValueCounter`/`Range`/`Buckets` do not read data; they build SQL text for one big
statement. Splitting that into method calls would make search slow, so they keep building SQL.
However:
- **Table and column names** come from `RecordSchema` (and the definition schema of
  `DefinitionLookup`), never written as text.
- **The data they read** while compiling (field type, term descendants, user ids by name,
  forwarded record ids, rectype by name) comes from `DefinitionLookup`, `UserGroupRepository`
  and `RecordRepository`.
- **Visibility** has one implementation in `RecordRepository`, as SQL text for the compiler
  and as a filter for the other services.

### A test keeps it so

`tests/DataAccessBoundaryTest.php` scans `srv/` and fails when any file outside the access classes
and the schema classes names one of the tables. It runs with the other server tests.

## Methods

The method list is a proposal. Each method replaces existing code (in brackets). Signatures are
settled in Phase 1/2.

**`DefinitionLookup`**
- **Concept codes:** `conceptCode(kind, localId)`, `localId(kind, code)`.
  - `kind` is rty, dty or trm.
  - `localId` accepts `origin-id`, `registeredId-localId`, `0-localId`, a bare local id, and for
    rty/dty a name.
  - Replaces `Runtime/ConceptCode` (removed), `ReportDefinitions::localId`,
    `DefinitionSnapshotService::localByConcept`, the compiler subqueries and `conceptCodeFor`
    copies.
- **Record types:** `rectype(id)` (name, plural, concept, title mask, group, ...),
  `rectypeName(id)`, `rectypeId(search)`, `rectypes()` (all, for the snapshot), `rectypeGroups()`.
- **Fields:** `field(id)` (name, type, concept, vocabulary, non-selectable terms, pointer
  targets), `fieldType(id)`, `fieldId(search, rty?)`, `fields()`, `fieldGroups()`.
- **Structure:**
  - `structureRows(rty)` (requirement, max, default, pointer filter, term filter, order, help,
    width, visibility, calculated function).
  - `structureField(rty, dty)` and `fieldName(rty, dty)`.
  - `structure()` (all, for the snapshot).
- **Terms:** loaded per id and cached.
  - `term(id)`, `terms(ids)`, `termLabel(id, {hierarchy})`, `termByLabel(vocabulary, label)`.
  - `termDescendants(ids)` (one implementation, defTermsLinks with the `trm_ParentTermID`
    fallback), `termInverse(ids)`, `termLinks()` (snapshot).
- **Translations:** `translation(kind, id, language)`, `languages()`.
- **Calculated fields:** `calculatedFields(rty)` → dty ⇒ formula.
- **Workflow:** `workflowRule(rty, stage)`.

**`RecordRepository`** (all methods take id lists and work in batches)
- **Headers:**
  - `headers(ids, columns)` replaces loadRecordHeaders, loadHeaders, RecordStore::header,
    getPublicRecord and targetType.
  - Also `rectypeOf(ids)`, `existing(ids)` and `countByRectype(ids|all)`.
- **Values:**
  - `values(ids, fieldIds|null, {resolve, visibility})`: raw rows, or rows with pointer titles,
    terms and files. This is the query of `RecordDataService::loadFieldValues`;
    `RecordDataService` keeps the formatting.
  - `fieldIdsOfType(ids, type)` and `aggregate(ids, field, function)` (TemplateApi).
- **Links:**
  - `pointersFrom(ids, {fields, targetTypes})` and `pointersTo(ids, {fields, sourceTypes})`.
  - `relationships(ids, {direction, relationTypes, otherTypes})` →
    `{relationship, source, target, type}`.
  - `related(ids, ...)` (the other ends).
  - `edges(ids, kind, direction, filters)` for expansion, graph, search traversal and export.
- **Access:**
  - `owners(ids)` (owner, edit groups, view groups).
  - `visibleIds(ids, runtime)`, `editableIds(ids, runtime)`.
  - `accessSql(alias, runtime, level)` for the compiler.
- **Other:** `tags(ids, userId)`, `bookmarked(ids)`, `forwardedIds(ids)`.

**`RecordStore`** (writes): it already exists; it gets `RecordSchema`. The cascade on delete and
the duplicate copy stay here.

**`FileRepository`:** `files(ids)` (info with mime type), `fileByObfuscatedId(id)`,
`existing(ids)`, `fileName(id)`, `thumbnails(recordIds)` (from attachVirtualHeaders), and
schema names for the compiler's file condition.

**`UserGroupRepository`:** `names(ids)`, `userIdsByName(names)`, `existing(ids)`,
`enabled(userId)` (ugr_Enabled), `roles(userId)` (memberships), and schema names for the
compiler's user and membership conditions.

## Phases

Each phase keeps the behaviour, except the fixes listed under Open points once agreed. After
every phase the server tests run:
- RecordEditApiTest, ReportsApiTest, JobRunnerTest, ExportWriterTest;
- ReportEngineCompareTest, ConnectedPredicateTest;
- the compatibility runner;
- the new DataAccessBoundaryTest.

1. **Definitions and settings.**
   - `DatabaseSettings`, and the `DefinitionLookup` methods above, with the one concept-code rule.
   - Move to it: ReportDefinitions, DefinitionSnapshotService, `Runtime/ConceptCode` (removed),
     RelationTermResolver, QueryValueResolver, PresentationRecordRepository terms,
     SmartyEngineFactory translations, ReportRepository terms, and the compiler's data reads.
   - Plan 14 code: RecordValidator and RecordSaveService.
2. **Records.**
   - `RecordSchema`, `RecordRepository`, and `RecordStore` on the schema.
   - Move to them: RecordDataService, ExpansionEngine, GraphService/GraphEdgeDiscovery,
     RecordSearchService edges, ExportPlanner, PresentationRecordRepository, ReportRepository,
     ReportJobPlanner, TemplateApi, ReportRecordAssembler, ServiceFactory::visibleIdsFilter, and
     the plan 14 Edit services.
3. **Files and users:** `FileRepository` and `UserGroupRepository`, and the services that read
   these tables.
4. **Search compiler:** table and column names from `RecordSchema`, one visibility
   implementation, and data reads through the access classes.
5. **Boundary test**, which is the definition of done: `DataAccessBoundaryTest` passes with an
   empty exception list.
6. **Back to plan 14:** title mask fill and calculated fields on save, using `DefinitionLookup`
   (mask, structure, terms, formulas), `RecordRepository` (headers, values, related records) and
   `FileRepository` (file names).

## Implementation notes

### Phase 1 — definitions and settings (2026-10-13)

- **New and rewritten classes:**
  - `Runtime/DatabaseSettings` (new): the one reader of sysIdentification.
  - `Definitions/DefinitionLookup` (rewritten): the only class with definition queries. It now
    also has the methods listed in its `_README.md` section.
  - `DefinitionLookup::shared()` and `DatabaseSettings::shared()` keep one instance per
    connection (a `WeakMap`), so all services of a request share one cache.
- **Moved onto them:**
  - `DefinitionSnapshotService` (its output is byte-identical to before);
  - `ReportDefinitions` (it no longer takes the registered id);
  - `RelationTermResolver`, `QueryValueResolver`;
  - `FieldPredicateCompiler` (field type, term children, term concept code);
  - `RecordPredicateCompiler` (record type by concept code or name);
  - `FieldValueCounter`, `FieldValueRange` (through the new `QueryExecutor::definitions()`);
  - the term reads of `PresentationRecordRepository`, `ReportRepository` and `SmartyEngineFactory`;
  - `RecordValidator` and `RecordSaveService` (workflow rule, settings).
- **Removed:** `Runtime/ConceptCode.php`. `MapPresentationService` uses `DefinitionLookup`.
- **Terms** are loaded per id (`term()`, `terms(ids)`). Only the snapshot loads all terms.
- **Behaviour changes, all from the agreed concept-code rule:**
  - A record type in a search by concept code, `t:3-1009`, `t:0-12` or `t:777-12`, now works.
    Before, `QueryValueResolver` treated every `X-Y` value as a name and failed with
    "Unknown record type".
  - The compilers resolve a concept code to the local id when compiling, instead of a subquery
    that only matched the origin columns. So codes of local definitions
    (`<registered id>-<id>`, `0-<id>`) are found as well.
  - `termDescendants` uses the term parent column when a database has no term links at all.
    Before, only the snapshot did this.
- **Still outside the lookup, as planned:**
  - definition tables joined inside record reads (`RecordDataService`, Phase 2);
  - definition tables in SQL text built by the search compiler (`FieldPredicateCompiler`
    any-field and visibility sources, term label subqueries; `SortCompiler`;
    `FieldValueCounter` sources), Phase 4;
  - `DefinitionLookup::groupName`, which reads sysUGrps until Phase 3 (users).
- **Tests:**
  - New: `tests/DefinitionLookupTest.php` (23 checks).
  - All other server tests give the same results as before the change. The exceptions are
    the older scripts that already failed before (they target pre-srv constructors), and
    `FieldValueBucketsTest`, which runs longer than 5 minutes.
  - The compatibility runner gives exactly the same results as before: 55 PASS, 5 DIFF.
    `field-fulltext-all`, a modern-only check against current data, changed between runs, so
    it depends on timing, not on this change.
  - `ReportEngineCompareTest`: the same 10 templates.

### Phase 2 — records (2026-10-13)

- **New classes** (`Records/Store`, namespace `Heurist\Records\Store`):
  - `RecordSchema`: the table names, given on init with the current tables as defaults; also
    the user tables cleaned on delete. `RecordStore::DEFAULT_TABLES` moved here.
  - `RecordRepository`: all record reads (list in `srv/Records/_README.md`).
    `RecordRepository::shared($db)` gives one instance per connection on the default tables;
    `QueryExecutor::records()` gives the same for the search services.
  - `RecordAccess`: the user of access checks (from the runtime or a search context).
  - `RecordStore` moved from `Records/Edit` to `Records/Store` and uses `RecordSchema`. Its
    reads (`header`, `viewGroups`, `details`) moved to the repository (`header`, `owners`,
    `editValues`); `records()` gives the repository on the same tables.
- **Brought forward from Phase 3**, because record reads joined these tables:
  `Records/Files/FileRepository` (`files(ids)`, `hasThumbnail`) and `Users/UserGroupRepository`
  (`names(ids)`).
- **Moved onto the repository:** `RecordDataService`, `ExpansionEngine`, `GraphService`,
  `GraphEdgeDiscovery`, `RecordSearchService` (edges and candidate pre-filters), `ExportPlanner`,
  `PresentationRecordRepository`, `ReportRepository`, `ReportJobPlanner`, `TemplateApi`,
  `ReportRecordAssembler` (tags), `ServiceFactory::visibleIdsFilter`, `QueryExecutor` (record type
  counts) and the Edit services (`RecordPermissionService` owners, `RecordDeleteService`
  references, `RecordValidator` pointer target type, save and duplicate).
- **`RecordDataService`** reads the values in one statement, then resolves pointer titles
  (repository headers), terms (`DefinitionLookup`) and files (`FileRepository`). The field-level
  visibility rule (forbidden, non-owner visibility, hidden values) is checked on the rows with
  `DefinitionLookup::structureRows`; it is the same rule as before. Its third constructor
  argument is now an optional `RecordRepository` (it was an unused `QueryExecutor`).
- **Visibility (agreed decision 2):** `PresentationRecordRepository::accessCondition` is removed.
  Presentation records, report lists, the Smarty and export visibility filter use
  `RecordRepository::accessSql` — the compiler's rule, so logged-in users now also see records
  owned by everyone (0). The compiler keeps its own copy of the same rule until Phase 4.
- **Still outside the access classes:**
  - the search compiler (`QueryBuilder`, `FieldPredicateCompiler`, `RecordPredicateCompiler`,
    `SortCompiler`, `FieldValueCounter`/`Range`/`Buckets`, and `SystemQueryBuilder` for
    usrRecTagLinks), Phase 4;
  - sysUGrps in `RecordPermissionService` (account state, existence), `QueryValueResolver`
    (users by name), `DefinitionLookup::groupName`, `SystemQueryService`; recUploadedFiles in
    `RecordValidator`, `PresentationRecordRepository::getUploadedFile`, `ReportDefinitions`
    (captions), `TemplateApi::getFileField` — Phase 3.
- **Tests:**
  - New: `tests/RecordRepositoryTest.php` (23 checks: schema, headers, values, links, link ends,
    owners, counts against SQL; `visibleIds` against the record search). Run as user 2 and as
    users 3–6 (not the owner); it found a missing bracket in the new `accessSql` for those users
    before anything was released.
  - `RecordDataService` output for 180 records (all fields, resolved values, virtual headers,
    extent filter; user and guest) is byte-identical to before. The value visibility was also
    compared with the old SQL rule after setting hidden, viewable, public, forbidden fields and
    hidden values in a transaction that was rolled back: the same counts for the owner, two
    users and a guest.
  - `GraphControllerTest` fixture moved from the executor to the database level;
    `ConnectedPredicateTest` counts recLinks reads at the database level.
  - All other server tests give the same results as after Phase 1 (`RecordEditApiTest --write`
    68 checks); compatibility runner 56 PASS, 4 DIFF (same; `field-fulltext-all` flips by timing).

### Phase 3 — files and users (2026-10-13)

- **`Records/Files/FileRepository`** (started in Phase 2) now has `files(ids)`,
  `filesByObfuscatedId(ids)` (case-insensitive, as the database), `existing(ids)` and
  `hasThumbnail(file)`.
- **`Users/UserGroupRepository`** (started in Phase 2) now has `names(ids)`, `name(id)`,
  `findByName(text)`, `idsByName(names)`, `existing(ids)`, `enabled(userId)` and `roles(userId)`.
- **Moved onto them:**
  - files: `RecordValidator` (file exists), `PresentationRecordRepository::getUploadedFile`,
    `ReportDefinitions` (file caption and description of `getTranslation`),
    `TemplateApi::getFileField` (`|file_data`, one read for all files of a value);
  - users: `RecordPermissionService` (account state, owners exist), `QueryValueResolver` (user
    by name), `RecordPredicateCompiler` (user ids by name), `SystemQueryService` (tag owner
    names, group roles), export owner names (`ExportColumns`, `HmlExportWriter`).
- **Removed:** `DefinitionLookup::groupName` — names of users and groups are not definitions.
  `ExportColumns` and `HmlExportWriter` get the `UserGroupRepository` in their constructors.
- **Still outside, as planned:** SQL text built by the compilers — the file condition in
  `FieldPredicateCompiler`, tag owners in `RecordPredicateCompiler`, owner names in
  `FieldValueCounter`, membership in `SystemQueryBuilder` (Phase 4).
  `System/Query/SystemEntitySchemaRegistry` keeps the `/sys` entity schemas (sysUGrps), as agreed.
- **Tests:**
  - New: `tests/FileUserRepositoryTest.php` (18 checks against SQL).
  - File captions and descriptions of `getTranslation` checked by id and by obfuscated id with a
    caption set in a transaction that was rolled back (the test data has no captions).
  - `/records` snapshot byte-identical; all other server tests as after Phase 2
    (`RecordEditApiTest --write` 68, `RecordRepositoryTest` 23 as users 2 and 3).
    Compatibility runner 55 PASS, 5 DIFF (the timing-dependent `field-fulltext-all` again).

### Phase 4 — search compiler (2026-10-13)

- **Table keys instead of names.** The compilers (`FieldPredicateCompiler`, `RecordPredicateCompiler`,
  `SortCompiler`, `QueryBuilder`, `FieldValueCounter`/`Range`/`Buckets`, `SystemQueryBuilder`) write
  `{records}`, `{details}`, `{terms}`, `{files}`, `{groups}`, ... in their SQL text. The new
  `Compiler/SqlTables` resolves them when the final SQL is made (`QueryBuilder::sql()`), so
  `CompiledQuery::$sql`, the debug trace and the tests always show real names.
  - Record tables come from `RecordSchema`. `QueryBuilder` takes an optional `RecordSchema`
    (default: the current tables) and gives the same schema to its repository.
  - Definition, file and user tables come from new `TABLES` constants of `DefinitionLookup`,
    `FileRepository` and `UserGroupRepository`.
  - `usrWorkingSubsets` (the `ws:` predicate) was missing: it is now `worksets` in `RecordSchema`
    (not cleaned on delete, as in legacy).
- **One visibility rule:** `RecordPredicateCompiler::appendAccessConditions` uses
  `RecordRepository::accessSql` and binds its values; its own copy is removed.
- **Data reads moved:** recForwarding (`RecordRepository::forwarding`), user ids by name (Phase 3).
  The FULLTEXT index check asks `information_schema` with the table name from `SqlTables`.
- **Bugs fixed** (backslashes lost in three regular expressions; found while moving the code):
  - `QueryBuilder::detailVisibilityCondition` did not remove the leading `AND`, so value counts
    and ranges (facets) failed with an SQL error for **every user who is not the database owner,
    and for guests**. Checked: with the old expression user 3 and guests get "Database query
    failed", with the fix they get counts and ranges.
    (The condition was later removed altogether, see value visibility below.)
  - `access:` with a list (`viewable,public`, `-viewable,public`) was compiled as one value.
    Now `IN` / `NOT IN`; counts equal direct SQL.
- **Value visibility — agreed 2026-10-13 (Artem), implemented for output only.** Two levels:
  the field (`rst_NonOwnerVisibility` of the record type; when the field is not in the structure,
  `defDetailTypes.dty_NonOwnerVisibility`) and the value (`dtl_HideFromPublic`). The rule is
  `RecordRepository::valueVisible(row, access)`, used for `/records` values (and so for reports
  and export):
  1. a forbidden field (`rst_RequirementType`) is shown to nobody;
  2. the database owner and the record owners (the user, the user's groups and 0 = everyone,
     for a logged-in user) see every other value;
  3. others by the field: hidden - nobody; viewable - logged-in users (values hidden from the
     public included, as legacy display); public/pending - everybody except values with
     `dtl_HideFromPublic=1`.
  Change against before: fields outside the structure follow `dty_NonOwnerVisibility` (before:
  visible to all). The `/records` snapshot changed only for guests: 6 such fields (viewable) are
  no longer shown.
- **Case-sensitive equality (`==`, agreed 2026-10-13):** `BINARY col = BINARY ?` hid the column
  from the value index; now `(col = ? AND BINARY col = BINARY ?)` (`caseSensitiveEquals`, for text
  values and case-sensitive term labels): the plain comparison finds the candidates by the index,
  BINARY keeps the exact match. `f:1:"==Johnson"` 15 s -> 1 ms, same 3 records; the
  compatibility runner is unchanged; `CaseSensitiveQueryTest` modern `==`, `===`, `==@` cases pass
  (its `=Johnson` case expects a trailing-space match that the NO PAD collation does not give, in
  legacy too).
- **Search does not check value visibility (decided 2026-10-13, Artem).** An SQL form of the
  rule was tried; any condition on the outer record inside the detail `EXISTS` costs MySQL the
  index-driven plan (for example `f:10=NULL` 0.2 s -> 15 s), so it was dropped: "it is enough to
  avoid output of forbidden fields and values". The old per-field condition of the compiler
  (`detailVisibilityCondition`) is removed with it, so search, facet counts, ranges and sorting
  use all values. `DefinitionLookup::field()` has `nonOwnerVisibility` for the output rule.
- **Tests:** all server tests as after Phase 3; compatibility runner 55 PASS, 5 DIFF (identical to Phase 3); FieldValueCounterTest 45, RecordEditApiTest --write 68.
  As user 3: `ConnectedPredicateTest`, `TemporalSearchTest`, `RecordRepositoryTest` pass.
  `FieldValueRangeTest` and `SystemQueryTest` assume user 2: the first says so; the second expects
  `/sys` filter owners without group 4 (website filters, `WEB_FILTERS_GROUP`), a test assumption,
  not a change of this phase.

### Phase 5 — boundary test (2026-10-13)

- `tests/DataAccessBoundaryTest.php` reads the string literals of every srv PHP file (PHP
  tokenizer, comments do not count). A table name after FROM/JOIN/INTO/UPDATE/TABLE, or a string
  that is exactly a table name, is allowed only in its access class: `Records/Store/` (record
  tables), `DefinitionLookup` (definitions, workflow rules), `DatabaseSettings`
  (sysIdentification), `FileRepository`, `UserGroupRepository`, and
  `SystemEntitySchemaRegistry` for the `/sys` entity schemas. The exception list is empty and
  the test passes (135 files).
- Its first run found one name: `Database/QueryTrace::shape()` counted `recLinks` in the traced
  SQL (debug panel; not used by the client). It now counts subqueries (`(SELECT`) instead.

### Phase 6 — back to plan 14 (2026-10-13)

- Title mask fill and calculated fields on save: see plan 14, §9 "Title mask and calculated fields on
  save". The port (`Records/Edit/TitleMask`, `CalculatedFields`) reads only through
  `DefinitionLookup`, `RecordRepository`, `FileRepository` and writes through `RecordStore`
  (`setFieldValue`); `DataAccessBoundaryTest` still passes with an empty exception list.
