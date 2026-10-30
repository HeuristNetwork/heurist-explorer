# Plan 28 — OpenAPI rules and database structure

**Status 2026-10-30: draft 1; §9.7 decided. Not for immediate implementation; first applied in plan 27d (implemented).** Every new development MUST follow these rules;
existing endpoints and srv classes are aligned step by step (§8). Items marked *proposal* in §9 are not agreed yet.
Replaces the deferred plan 28 "New Records/details structure" of plan 27 §3 (its content is in §7 here). The first
user of these rules is the Website API, plan `27d Website-API-Plan.md`.

## 1. Request (Artem, 2026-10-30)

This discussion relates to plan 27c (server side endpoints) and to this more general plan.

1. We use (or will use) a **unified database structure for all entities** in the project: the pair Records/recDetails
   or their identical copies for the "definition" and "system" domains: `defRecords/defRecDetails`,
   `sysRecords/sysRecDetails`.
2. So we MUST use the **same server side endpoints, controllers and services**. We MUST NOT invent new server side
   endpoints and, as a consequence, new sets of controllers, services and presentation classes. The server side MUST
   remain compact and clear. The exception is support of tables that are not converted yet to sysRecords / defRecords,
   such as `usrBookmarks` and `sysUGrps`.
3. We may allow a special endpoint and a new set of server classes for some specific actions, for example Smarty
   template actions or output for IIIF presentation. These special cases are limited, and each one is a matter of
   separate discussion and planning.
4. The ideal API endpoint rule:

   ```
   /{database}/{domain}/{entity}/{recordId}/{action}
   ```

   - **domain** — `def`, `sys`, `records`, `files` and later `terms`. It specifies the pair of Records/recDetails
     tables to use: `Records`, `sysRecords`, `fileRecords`, `defRecords`, `trmRecords`.
   - **entity** — short record type nickname:
     a) sys: filter, user, group, tag, bookmark, reminder, website, map (mapdoc), querysource, export (output),
        report, schedule ...
     b) def: rty (record types), dty (fields), rst (record structure), trm (terms), rtg, dtg ...
     c) records: person, org, place — in plans now; eventually QName.

     Historically the entity is required to find the separate table (usrSysGrps for user, defRecTypes for record
     types). Until the database is converted to the Records/recDetails format, the entity distinguishes the id and the
     underlying legacy table. Eventually the entity becomes optional, used for convenience: retrieve (or another
     action) for the set of records of the given record type.
   - **recordId** — record id, later QName.
   - **action** — special action, mainly for POST. If it is numeric or a concept code it is a field id (GET = value of
     that field).

   HTTP methods give the basic actions:

   | Method | Without `{recordId}` | With `{recordId}` |
   |---|---|---|
   | GET | retrieve | retrieve |
   | POST | retrieve | insert |
   | PUT | — | replace |
   | PATCH | — | change some fields |
   | DELETE | — | delete |

   GET or POST with a special action: `duplicate`, `validate`, `aggregate`, `import`, `export`, `execute`
   (generate / send: generate a report, an export or a website, send a reminder), `cancel` (stop a running query),
   `image` (the entity's main image), `assign` (link with POST, remove with DELETE predefined entity relations:
   tag–record, user–group, page–website, mapdoc–layer).
5. Special endpoints — special presentation services or actions: `graph`, `time`, `map`, `iiif`, `annotation`,
   `jobs`.
6. As a result we do not need monstrous endpoints like `/{database}/reports/{reportRef}/schedules/{scheduleId}` —
   it is `/{database}/schedule/{recordId}`.

This plan is not for immediate implementation. We must follow it for any new development and gradually align the
existing endpoints and server code with it.

## 2. Rules

### 2.1 URL

```
/api/{db}/{entity}/{id}/{action}             one record of an entity, or its action (decided §9.7)
/api/{db}/{entity}/{action}                  action of the whole entity (e.g. setup)
/api/{db}/{domain}?q=...                     search over a whole domain; a record type with t:
```

- **Domains:** `records`, `sys`, `def`, `files`, `terms` (§9.5). A domain = one table pair (§7).
- **Entity:** a reserved full name in the **singular** (`website`, `rectype`, `field`, `user`) or later a QName
  (`hst:Person`). Short names (`rty`, `dty` ...) and plurals are legacy aliases (§3.2). Required today (it selects a
  legacy table); optional later.
- **id:** record id; `0` on POST = insert with the next id. Later a QName.
- **action:** a word from §2.3, or a field id / concept code (GET only: the value of that field, §9.4).
- No nested resources (`/report/{id}/schedule/{sid}`), no controller per entity, no output format per entity.
- The path is resolved in a fixed order: domain name → special endpoint → reserved entity name → QName (contains
  `:`). Reserved names are unique across all three lists (§3.3).

### 2.2 Methods and the common contract

- Methods as in §1 point 4.
- **One record format** in and out: what GET returns can be sent back with PUT / PATCH (plan 14). Header fields
  `rec_*`, values in `details` by field id.
- PATCH replaces only the fields in the body; `[]` clears a field. `rec_Modified` in the body enables the conflict
  check (409 `conflict` with the stored value); `?force=1` overwrites.
- 422 `validation` with the list of issues; 403 no right; 404 unknown entity, id or action; 405 action not allowed on
  this entity.
- The reply of a write is the saved record as GET returns it (`fields=_all`), with `meta.issues`.
- Writes need a login and the same-site check (JSON body, Origin).

### 2.3 Actions

| Kind | Actions | Who handles it |
|---|---|---|
| **Common** — every entity, generic code | `validate`, `duplicate`, `aggregate`, `import`, `export`, `image`, `setup` | The generic controllers and services (§6). An entity may refuse one (405). |
| **Specific** — meaning depends on the entity | `execute`, `assign`, `merge`, `cancel` | One action handler (service class) registered for the entity in the entity registry. No new controller. |

- `setup` is an entity-level action (no id): `GET /{entity}/setup` checks that the record types and fields the entity
  needs exist; `POST` installs them. Later it compares with the core definitions database and imports what is missing.
- `execute` starts the entity's job (report generate, export, website build, reminder send). Long work runs as a
  background job; the reply gives the job id, status and result stay on `/jobs`.
- `assign`: POST links, DELETE removes a predefined relation (tag–record, user–group, page–website, mapdoc–layer).
  Internally it is a PATCH of the pointer or relationship fields through the generic save.
- An unknown action is 404.

## 3. Domains and entities

### 3.1 Table

"Legacy table" = where the data is today, if it is not in a Records/recDetails pair yet. "Legacy classes" = the srv
classes that exist only because of that table; they go away when the table is converted.

| Domain | Entity | Record type | Specific actions | Legacy table | Legacy classes (srv) | Status 2026-10-30 |
|---|---|---|---|---|---|---|
| sys | filter | — (saved filter) | — | `usrSavedSearches` | `SystemQueryBuilder` (read) | `/sys/filter` read only, no record output; writes: plan 20 4c |
| sys | tag | 2-1109 | `merge`, `assign` (tag–record) | `usrTags`, `usrRecTagLinks` | `Tags/TagWriteService`, `TagRecordMapping`, `TagRecordOutput`, `Records/UserData/LegacyTagTable`, `TagLinkTable`, `TagRepository` | Record format, CRUD; tags stay in `usrTags` (plan 20) |
| sys | bookmark | 2-1110 | — | `usrBookmarks` | `Bookmarks/BookmarkWriteService`, `BookmarkRecordOutput`, `PrivateInfoCipher` | Record format, CRUD |
| sys | reminder | 2-1111 | `execute` (send) | `usrReminders` | `Reminders/ReminderWriteService`, `ReminderRecordOutput`; legacy mailer closure | Record format, CRUD; `POST /sys/reminder/send` |
| sys | user | `RT_SYS_USER` | `image` | `sysUGrps` (`ugr_Type=user`) | `Users/UserWriteService`, `UserRecordMapping`, `UserRecordOutput`, `UserGroupRepository` | Record format, CRUD |
| sys | group | `RT_SYS_GROUP` | `assign` (user–group), `image` | `sysUGrps`, `sysUsrGrpLinks` | `Groups/GroupWriteService`, `GroupRecordOutput`, `Users/GroupMembershipTable` | Record format, CRUD; `POST /sys/group/{id}/members` |
| sys | website | 99-51 | `execute` (build), `assign` (page–website) | — (Records) | — | Done (27d): `/website/{id}`, `Records/Entity` |
| sys | page | 99-52 | `import` (module configuration) | — (Records) | — | Done (27d): `/page/{id}` |
| sys | mapdoc | Map Document | `assign` (mapdoc–layer) | — (Records) | — | Edited through `/records/{id}` |
| sys | layer | Map Layer | — | — (Records) | — | `/records/{id}` PATCH (Map symbology) |
| sys | querysource | Data source / Query Source | — | — (Records) | — | `/records/{id}` |
| sys | report | 2-1104 | `execute` (generate), `export` (`.gpl`), `import` | — (Records) + `smarty-templates/*.tpl` | `ReportTemplateStore` (template file) | Own routes `/reports/...` (§5) |
| sys | schedule | 2-1105 | — | — (Records) | — | `/reports/{id}/schedules/{sid}` (§5) |
| sys | exportconfig, crosstab, menuaction | system record types (plan 27 §3) | — | — (Records) | — | `/records/{id}` |
| def | rectype, field, recstructure, term, termlink, rectypegroup, fieldgroup, vocabularygroup, workflowrule | — (definitions) | `setup` (later: import from core db) | `defRecTypes`, `defDetailTypes`, `defRecStructure`, `defTerms`, `defTermsLinks`, `defRecTypeGroups`, `defDetailTypeGroups`, `defVocabularyGroups`, `sysWorkflowRules` | none in srv; legacy `Def*` / `SysWorkflowRules` classes through `entityScrud.php`; srv has `DefinitionLookup` (read) and `/def/snapshot` | Writes legacy only |
| files | file | 2-1106 | — (`content`, `thumbnail`, `upload` are special, §4) | `recUploadedFiles` (unless `fileRecords` exists) | `Records/Files/LegacyFileTable`, `Files/LegacyFileStore` (vs `RecordFileStore`), `FileRecordMapping` | Record format, CRUD (plan 20) |
| terms | term, vocabulary | — | — | `defTerms`, `defTermsLinks` | — | Future domain (§9.5) |
| records | any record type; later QName | user types | `duplicate`, `validate` today | — | — | `/records`, `/records/{id}` CRUD |
| — | database | — | — | `sysIdentification` (legacy `/dbs`) | legacy `SysDatabases` | Legacy only |

Shared base classes for the legacy tables: `srv/System/Entity/` (`EntityRecordMapping`, `LegacyEntityTable`,
`EntityWriteService`, `EntityTransaction`, `EntityRecordOutput`, `EntityImageService`). New legacy-table support uses
them; it never adds its own controller.

### 3.2 Legacy aliases

The legacy entity endpoints (`entityScrud.php`) and `/sys` accept these names. They stay accepted, are not used in new
code and are listed in OpenAPI only in this alias table.

| Full name | Aliases |
|---|---|
| rectype | `rty`, `rectypes` |
| field | `dty`, `fields` |
| recstructure | `rst` |
| term | `trm`, `terms` |
| termlink | `trl`, `termlinks` |
| rectypegroup | `rtg`, `rectypegroups` |
| fieldgroup | `dtg`, `fieldgroups` |
| vocabularygroup | `vcg` |
| workflowrule | `swf` |
| reminder | `rem`, `reminders` |
| tag | `tags`, `keyword`, `keywords` |
| user | `users` |
| group | `groups`, `workgroup` |
| filter | `filters` |
| bookmark | `bookmarks` |
| database | `dbs`, `databases` |

### 3.3 Reserved names

Domains: `records`, `sys`, `def`, `files`, `terms`. Special endpoints: §4. Entities: §3.1. A new name must not collide
with any of them (for example the `map` endpoint and the `mapdoc` entity). The list lives in one place in srv (the
entity registry, §6) and in OpenAPI.

## 4. Special endpoints

Each one has its own controller because its output is not the record format. A new special endpoint needs its own
discussion and plan.

| Endpoint | Routes today | Why special |
|---|---|---|
| `graph` | `GET\|POST /graph` (`GraphController`) | Nodes and edges, expansion rules |
| `time` | `GET\|POST /time` (`TimeDataController`) | Timeline items |
| `map` | `GET\|POST /map[/{id}]` (GeoJSON), `/map/document/{id}`, `/map/layer/{id}`, `/map/data/{id}` (legacy) | GeoJSON, map document presentation |
| `iiif` | `GET /iiif/{manifest\|canvas\|...}/{id}` (legacy `iiif_presentation.php`) | IIIF Presentation v3 |
| `annotations` | `/annotations/...` (legacy `DbAnnotations`) | IIIF annotation server |
| `jobs` | `POST /jobs`, `GET /jobs[/{id}]`, `POST /jobs/{id}/cancel`, `DELETE /jobs/{id}`, `GET /jobs/{id}/result` | Background jobs (JSON files, not a table) |
| `site` | `/{db}/site/{id}[/{page}][/frame/{instance}]` (not under `/api`) | Public website HTML (plan 27a) |
| report render | `GET /reports/{ref}/render?rec=N` | Smarty HTML of one record |
| file content | `GET /files/{key}/content\|thumbnail`, `/files/upload[/{token}]` | Binary content, chunked upload |
| `login`, `logout` | legacy, in `api.php` | Session |

Record presentation `/records/querysource|document|layer/{id}` (`RecordPresentationController`): a presentation
format of a record → keep as a special presentation under `map` / `records` until a decision (§9).

## 5. Current endpoints → target

Status: **ok** = fits already; **touch** = align when this code is next changed; **conv** = after the table
conversion.

| Current | Target | Status |
|---|---|---|
| `GET\|POST /records` | same (domain search) | ok |
| `/records/aggregate`, `/records/{id}/duplicate`, `/records/{id}/validate` | same (common actions) | ok |
| `POST /records/cancel` | `cancel` (query action) | ok |
| `GET\|POST\|PUT\|PATCH\|DELETE /records/{id}` | same; for system types also `/{entity}/{id}` | ok |
| `/records/querysource\|document\|layer/{id}` | special presentation (§4) | open |
| `GET\|POST /sys`, `/sys/{type}/{id}` CRUD, `/validate`, `/image` | same; entity names singular | ok |
| `POST /sys/tag/assign` | `POST\|DELETE /tag/{id}/assign` (or `/tag/assign` for many tags) | touch |
| `POST /sys/tag/{id}/merge` | same (specific action) | ok |
| `POST /sys/group/{id}/members` | `POST\|DELETE /group/{id}/assign` | touch |
| `POST /sys/reminder/send` | `POST /reminder/{id}/execute` | touch |
| `/files`, `/files/{id}` CRUD, `/validate`, `/aggregate` | same | ok |
| `/files/{key}/content\|thumbnail`, `/files/upload` | special (§4) | ok |
| `GET /def/snapshot` | same (definitions read for clients) | ok |
| legacy `/rty`, `/dty`, `/trm`, `/trl`, `/rst` ... | `/def/rectype/{id}` ... through the generic controllers | conv |
| `GET\|POST /reports` | `GET\|POST /report` (search) | touch |
| `POST /reports/setup` | `GET\|POST /report/setup` | touch |
| `GET\|PUT\|DELETE /reports/{ref}` | `/report/{id}` CRUD | touch |
| `GET\|PUT /reports/{ref}/template` | template = a field: `GET /report/{id}/{field}`; write by PATCH (§9.4); the `.tpl` file stays behind the record | touch |
| `POST /reports/{ref}/register`, `POST /reports/import` | `POST /report/0/import` | touch |
| `GET /reports/{ref}/export` | `GET /report/{id}/export` | touch |
| `GET /reports/schedules`, `POST /reports/{id}/schedules`, `PUT\|DELETE /reports/{id}/schedules/{sid}` | `/schedule`, `/schedule/{sid}` CRUD (the report is a pointer field) | touch |
| `GET /reports/generated`, `DELETE /reports/generated/{file}` | open: job results or a `files` action (§9) | open |
| `/reports/{ref}/render` | special (§4) | ok |
| `/website/...` (all) | `/website/{id}`, `/page/{id}` + `assign`, `import`, `execute`, `setup` (plan 27d) | done |
| `/graph`, `/time`, `/map`, `/iiif`, `/annotations`, `/jobs` | special (§4) | ok |

## 6. How srv dispatches

The target, built from parts that exist:

1. **One front router** parses `{domain}/{entity}/{id}/{action}` with the order of §2.1. Today this is done route by
   route in `hserv/controller/api.php`; srv gets one parser.
2. **Entity registry** — `srv/Records/Entity/RecordEntityRegistry.php` (since 27d; legacy-table entities stay in `SystemEntitySchemaRegistry`): for each entity its
   domain, record type, table pair (`Records/Store/RecordSchema`) **or** its legacy table handler (`System/Entity/*`),
   aliases, allowed common actions and specific action handlers, and entity hooks. Hard-coded now; later the domain
   comes from a field of the record type definition (§9.7).
3. **The same controllers** for every entity: query (`RecordQueryController` / `SystemQueryController` merge into one)
   and edit (`RecordEditController` / `SystemEditController` merge into one). They take the `RecordSchema` from the
   registry. `Compiler/SqlTables` resolves `{records}`, `{details}` ... to the pair (plan 15).
4. **Entity hooks**, registered per record type, run inside the generic save / delete: defaults on insert (a website
   gets its starter page), cascade on delete (pages of a website), ownership rules (CMS rule). The CMS owner rule in
   `RecordSaveService` is already such a hook in all but name.
5. **Specific action handlers**: one class per action and entity, called by the generic controller.

## 7. Database structure

Moved from plan 27 §3 and extended. Nothing here is decided except where noted.

### 7.1 Table pairs

| Domain | Records table | Details table | Holds |
|---|---|---|---|
| records | `Records` | `recDetails` | user data (and, per record type, other pairs later: §9.7) |
| sys | `sysRecords` | `sysRecDetails` | system record types: Map Document, Map Layer, Data source / Query Source, User, Group, Bookmark, Reminder, Report, Report Schedule, Export configuration, Crosstab configuration, Website, Webpage, MenuAction (2-107), Tag, Saved filter |
| def | `defRecords` | `defRecDetails` | record types, fields, record structure, groups, workflow rules, ontologies |
| files | `fileRecords` | `fileRecDetails` | registered files (2-1106); `RecordFileStore` already uses them if they exist |
| terms | `trmRecords` | `trmRecDetails` | terms and vocabularies (§9.5) |

Each pair has the same columns and the same companions (`recLinks`, `recDetailsDateIndex`, `usrRecPermissions`) or
shares them (§7.3). srv reads them only through `RecordRepository` / `RecordStore` and `RecordSchema` (plan 15), so a
pair is one `RecordSchema` value.

### 7.2 Detail values

Today `recDetails.dtl_Value` is `TEXT` (64 KB; with utf8mb4 only ~16 000 characters): long page content is cut into
chunks, and a translation is an `xx:` prefix in the value (`RecordValidator::isMultilang` excludes page content).

| Option | Cost | Note |
|---|---|---|
| `dtl_Value MEDIUMTEXT` (16 MB) | +1 byte per row | Simplest. InnoDB (DYNAMIC) already stores long values off the row page with a 20-byte pointer, so short values cost the same as now. The prefix index `dtl_Value(63)` and FULLTEXT work on `MEDIUMTEXT`. |
| Extra column `dtl_Text MEDIUMTEXT NULL` | ~nothing when NULL | Every reader checks two columns; gives nothing over the option above. |
| Separate table for large values | a join or a second query per read | Not needed. |
| `dtl_Lang CHAR(3) NULL` (NULL = default) | 3 bytes per row with a value | Replaces the `xx:` prefix. A translated value of any length is a normal row; can be indexed with record and field. |

**Recommendation:** `dtl_Value MEDIUMTEXT` plus `dtl_Lang CHAR(3) NULL` in every pair; no chunks.

### 7.3 Ids and pointers

- **One global record id sequence across all pairs** (*proposal*, §9.7): an id alone is then unambiguous
  (`/record/123` can be resolved without a domain), and pointers between pairs need no domain column.
- Pointers between pairs: a page points to a user record, a layer to a data source, a user record to a term. Open:
  one `recLinks` for all pairs (needs global ids) or one per pair.
- Queries and facets that join across pairs cost more; `Compiler/SqlTables` is where cross-pair joins are written.

### 7.4 Moving data

- Existing system records move from `Records` to `sysRecords` (same ids if the sequence is global).
- Legacy tables are converted one by one: tags (plan 20 says they stay in `usrTags`; revisit), bookmarks, reminders,
  users and groups, saved filters, files, definitions, terms. Each conversion removes its legacy classes (§3.1).
- After a conversion the entity's URLs do not change (§9.7).

### 7.5 Indexed details (later)

Placeholder for the discussion of extra indexes on details (by field, by language, numeric and date values, value
prefixes). To be written.

### 7.6 Open questions

1. Global id sequence or id ranges per pair.
2. One `recLinks` / `recDetailsDateIndex` / `usrRecPermissions` for all pairs or one per pair.
3. Order of the conversions.
4. Tags: stay in `usrTags` (plan 20) or move to `sysRecords`.

## 8. Order of alignment

1. New work follows the rules at once. First: plan 27d (website and page = pilot record-based `sys` entities on the
   Records pair, entity registry, entity hooks, action handlers).
2. Reports and schedules (`/reports/...` → `/report`, `/schedule`), when that code is next changed.
3. `/sys` specific actions (`assign`, `execute`) when touched.
4. Table conversions (§7.4), each with its own plan.
5. `heurist/documentation/api/heurist-openapi.yaml` is updated in the same step as each change (today the website
   routes are missing from it).

## 9. Discussion

### Round 1 (2026-10-30)

| # | Topic | Artem | Proposal (Claude) | State |
|---|---|---|---|---|
| 9.1 | Names | Keep OpenAPI short and consistent; full names preferred everywhere; short names (rty = rectypes ...) as a separate list; not all entities have short names | Full names in **singular** (`website`, `rectype`, `field`, `term`): an entity names a class (`hst:Website`), and `/website/12` reads "website 12". Plurals and short names = alias table §3.2. Domain names stay `def`, `sys`, `records`, `files`, `terms`. | proposal |
| 9.2 | `setup` | Useful for any entity: make sure the required record types and fields exist (`/reports/setup` checks report and schedule types; the same for websites); later compare with the core definitions database and import what is missing | Common entity-level action without id: `GET /{entity}/setup` = check, `POST` = install (§2.3). | agreed |
| 9.3 | Common and specific actions | Specify both: common = validate, duplicate, aggregate; specific = a dedicated service class, as now | Common: validate, duplicate, aggregate, import, export, image, setup (generic code). Specific: execute, assign, merge, cancel (one handler class per entity and action, registered in the entity registry, no new controller). Today tag merge / assign, group members and reminder send already sit as specific handlers inside `SystemEditController`. | proposal |
| 9.4 | Field action | Logically update / replace of one field value, but it may be limited to retrieval | GET only: `GET /{entity}/{id}/{field}`. A change of one field = PATCH with that field in the body. | proposal |
| 9.5 | Terms | 10K+ terms already; SKOS import will increase this dramatically: a separate pair (domain) for terms? | Yes: domain `terms` (`trmRecords/trmRecDetails`). The definitions snapshot can no longer hold all terms, so vocabularies load lazily; `dtl_Lang` gives labels per language; term links become pointer fields. | proposal |
| 9.6 | QName | By OWL every entity has a QName. a) def: explicit (`hst:Person`, `hst:SysUser`, or imported `foaf:Person`): every def record has an Ontology (pointer to the Ontology record type) and a Name (class name) field. b) Mandatory for record types (classes) and fields (properties). c) Optional for sys and records: `hss:DbOwner`, `hsd:1089-10799`. Open for proposals. | Ontology record = prefix + namespace URI; QName = `prefix:Name`. The concept code stays the stable id; URLs accept both. sys / records: optional name field, otherwise the derived `hsd:{dbId}-{recId}`. `:` is allowed in a URL path segment (RFC 3986). | proposal |

### 9.7 Optional domain (round 1-2, 2026-10-30)

**Artem's suggestion (to discuss):**

1. The set of domains is limited: def, sys, records, files, terms.
2. The set of named entities is limited: def — rectypes, fields, recstructure ...; sys — user, group, website, page
   ...; files and records — none at the moment.
3. So the domain can be omitted (optional) when the entity is given:

   ```
   /sys/website     = /website   = /hst:Website
   /def/rectypes    = /rectype
   /records/Person  =              /hst:Person
   ```

4. Now hard-coded; later the record type (class) gets a field that says in which domain its data is stored.
   Use case: a database with 1M records of one type (Artefacts) and 10K records that describe them (places, excavation
   sites, authors, materials). To make search faster, the designer stores `hst:Artefact` records in a separate domain
   (Records/recDetails pair).

**Pros**

- Shorter URLs.
- **Storage is hidden from clients:** a record type can move to another pair (files now, terms soon, Artefacts later)
  without any URL or client change. The strongest argument.
- Entity names do not mix with record type names: a bare name = reserved entity, a name with `:` = class (QName).
- Fits Linked Data: `/hst:Person` is the class itself.
- `/website`, `/files`, `/records` already look like this.

**Cons**

- URL consistency: two forms for one resource (docs, tests, caching).
- Reserved names must be unique across domains, entities and special endpoints; a later name can collide
  (`map` endpoint vs a new entity `map`).
- A search over a whole domain (`/records?q=`) still needs the domain form, so both styles exist anyway.
- An id alone needs one id sequence across all pairs, or a lookup.
- OpenAPI: one `{entity}` path parameter loses the typed schema per entity, unless a path is listed per entity.
- A query on a type stored in another pair must be routed by the server, and joins across pairs cost more (a cost of
  several pairs, not of the URL form).

**Recommendation (Claude)**

- Make the domain optional, with **one canonical form = the entity form** in OpenAPI and in all new client code.
- The domain form is documented only for a search over a whole domain; elsewhere it is accepted as an alias.
- Reserved-name list in one place (§3.3); path resolution order of §2.1.
- One global record id sequence (§7.3).
- The entity registry becomes "record type → table pair"; hard-coded now, later read from the record type's domain
  field.
- Requiring the domain everywhere would change URLs whenever storage moves — the opposite of the Artefact use case.

**Decision (Artem, 2026-10-30):** the domain is written in the URL **only to search the data of a whole domain**
(`/records?q=...`, `/files?q=...`, `/def/snapshot`, `/sys?q=...`). An entity URL never has it:
`/{entity}/{id}/{action}`. A record type (entity, class) is searched with the predicate `t:` in a domain search, not
with `GET /{entity}`. No `/{domain}/{entity}/...` aliases are added. First used by plan 27d (`/website/...`, `/page/...`).

## 10. History

- 2026-10-30 — draft 1: Artem's request (§1), rules, domain/entity table from the endpoint inventory of both repos,
  special endpoints, current → target mapping, dispatch, database structure (from plan 27 §3), discussion rounds 1-2.
- 2026-10-30 — §9.7 decided: domain only for whole-domain searches; entity search with `t:`. Plan 27d implemented
  as the first record-based entities (`srv/Records/Entity/`, see 27d §11).
