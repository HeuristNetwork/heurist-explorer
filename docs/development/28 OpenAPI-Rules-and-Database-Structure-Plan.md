# Plan 28 — OpenAPI rules and database structure

**Status 2026-11-07: draft 2; §9.7 revised, §9.8 added; §11 holds the open tasks of plan 20. Not for immediate implementation; first applied in plan 27d
(implemented). Next steps: `28a DONE Unify-System-Entities-Plan.md`, then `30 Custom-Report-System-Plan.md`.** Every new development MUST follow these rules;
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
   `jobs`, `external`.
6. As a result we do not need monstrous endpoints like `/{database}/reports/{reportRef}/schedules/{scheduleId}` —
   it is `/{database}/schedule/{recordId}`.

*Later changes to this list (2026-11-06, §9.8): `schedule` is now `output`; `image` is now `asset`; `export (output)`
in point 4a stays an entity for export configurations, and `output` is the generated file record (report now, scheduled
export later).*

This plan is not for immediate implementation. We must follow it for any new development and gradually align the
existing endpoints and server code with it.

## 2. Rules

### 2.1 URL

```
/api/{db}/{entity}/{id}/{action}             one record of an entity, or its action (decided §9.7)
/api/{db}/{entity}/{action}                  action of the whole entity (e.g. setup)
/api/{db}/{entity}?q=...                     search of one entity, equal to /{domain}?q=[{"t":"entity"},...] (§9.7)
/api/{db}/{domain}?q=...                     search over a whole domain; a record type with t:
/api/{db}/{domain}/{action}                  action of a whole domain (cancel, aggregate)
```

- **Domains:** `records`, `sys`, `def`, `files`, `terms` (§9.5). A domain = one table pair (§7).
- **Entity:** a reserved full name in the **singular** (`website`, `rectype`, `field`, `user`) or later a QName
  (`hst:Person`). Short names (`rty`, `dty` ...) and plurals are legacy aliases (§3.2). Required today (it selects a
  legacy table); optional later.
- **`/sys/{entity}/...`** is an accepted alias of `/{entity}/...` for every `sys` entity. It is not the canonical form
  and new client code does not use it (§9.7).
- **id:** record id; `0` on POST = insert with the next id. A concept code is accepted only as `{this database id}-{id}`
  until records hold an origin id. Later a QName.
- **action:** a word from §2.3, or a field id / concept code (GET only: the value of that field, §9.4).
- **`t` predicate on `/sys`:** entity name, record type id or record type concept code.
- **API only takes record ids.** A user-provided name (a template file name) never appears in a URL (plan 30).
- These query parameters can not be used on API URLs, because the webroot resolvers redirect on them before `api.php`
  runs: `file`, `thumb`, `icon`, `asset`, `disclaimer` (`FileResolver`), `rty`, `dty`, `trm`, `rst` (`RecordResolver`).
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

| Level | URL | Actions |
|---|---|---|
| Domain | `/{domain}/{action}` | `cancel`, `aggregate` |
| Entity | `/{entity}/{action}` | `setup`, `import`; specific: `/tag/assign`, `/reminder/execute` |
| Record | `/{entity}/{id}/{action}` | `validate`, `duplicate`, `asset`, `export`; specific: `execute`, `assign`, `merge`, `import` |

| Kind | Actions | Who handles it |
|---|---|---|
| **Common** — every entity, generic code | `validate`, `duplicate`, `aggregate`, `import`, `export`, `asset`, `setup` | The generic controllers and services (§6). An entity may refuse one (405). |
| **Specific** — meaning depends on the entity | `execute`, `assign`, `merge`, `cancel` | One action handler (service class) registered for the entity in the entity registry. No new controller. |

- `asset`: the main file of a record, GET returns it, PUT replaces it, DELETE removes it: image of a user or group,
  template of a report, generated file of an output. It replaces `image` (no alias). Later: thumbnail of a record
  type, image of a term.

- `setup` is an entity-level action (no id): `GET /{entity}/setup` checks that the record types and fields the entity
  needs exist; `POST` installs them. Later it compares with the core definitions database and imports what is missing.
- `execute` starts the entity's job (report generate, export, website build, reminder send). Long work runs as a
  background job; the reply gives the job id, status and result stay on `/jobs`.
- `assign`: POST links, DELETE removes a predefined relation (tag–record, user–group, page–website, mapdoc–layer).
  Internally it is a PATCH of the pointer or relationship fields through the generic save.
- An unknown action is 404.

### 2.4 Allowed endpoints (refreshed 2026-11-06)

**Status:** ok = works now; 28a, 30 = the plan that does it.

Search and read:

| Method | URL | Meaning | Status |
|---|---|---|---|
| GET, POST | `/sys?q=` | Search with a Heurist query; entity by `t` (name, record type id, concept code) | ok (28a) |
| GET, POST | `/records?q=`, `/files?q=` | Domain search | ok |
| GET, POST | `/{entity}?q=` | Same as `/sys?q=[{"t":"entity"},...]` | done, 28a |
| GET | `/{entity}/{id}` | One record | ok (28a) |
| GET | `/{entity}/{id}/{field}` | Value of a field | ok (28a) |

Change data:

| Method | URL | Meaning | Status |
|---|---|---|---|
| POST | `/{entity}/0` | Insert | ok |
| PUT | `/{entity}/{id}` | Replace | ok |
| PATCH | `/{entity}/{id}` | Change the given fields | ok |
| DELETE | `/{entity}/{id}` | Delete | same |

Common actions:

| Level | URL | Meaning | Status |
|---|---|---|---|
| Domain | POST `/{domain}/cancel` | Stop the running query of the current user | **`/records` only** (not `/files`). The cancel code is not tied to a domain, so other domains are one route each, when needed |
| Domain | GET, POST `/{domain}/aggregate` | Count, value lists, aggregates over a query | `/records`; `/files` count and rectypes only |
| Entity | POST `/{entity}/import` | Import | ok |
| Entity | GET, POST `/{entity}/setup` | Check / install the definitions the entity needs | `/website`, `/page`, `/report`; not for the five sys entities yet (404) |
| Record | POST `/{entity}/{id}/validate` | Validate | ok |
| Record | POST `/{entity}/{id}/duplicate` | Duplicate | ok on record-based entities; **405** on tag, bookmark, reminder, user, group (legacy tables) |
| Record | GET, PUT, DELETE `/{entity}/{id}/asset` | Main file of the record | ok |

Specific actions:

| Entity | URL | Meaning | Status |
|---|---|---|---|
| tag | POST, DELETE `/tag/assign` | Put tags on records, take them off | ok (28a) |
| tag | POST `/tag/{id}/merge` | Merge into another tag of the same owner | ok (28a) |
| reminder | POST `/reminder/execute` | Send the unsaved form by email (**no id**) | ok (28a) |
| group | POST, DELETE `/group/{id}/assign` | Add, remove users | ok (28a) |
| website | POST `/website/{id}/execute` | Build the website (job) | ok |
| website | POST, DELETE `/website/{id}/assign` | Menu add or move, menu remove | ok |
| page | POST `/page/{id}/import` | Import a module configuration | ok |
| report | GET, PUT, DELETE `/report/{id}/asset` | Template | done, 30 |
| report | POST `/report/import` | Register an arbitrary template file, creates a record | done, 30 |
| report | GET `/report/{id}/export` | Template with concept codes (`.gpl`) | done, 30 |
| report | GET, POST `/report/{id}/execute` | Run for **one** record, HTML; test runs stay a job | ok |
| output | GET, DELETE `/output/{id}/asset` | Generated file | done, 30 |
| output | POST `/output/{id}/execute` | Generate (job) | done, 30 |

### 2.5 Who serves what

`/api/{db}/...` is dispatched by one if/elseif chain in `hserv/controller/api.php`; there is no route table.

| Served by | Routes |
|---|---|
| **hserv** | `/dbs`, `/databases`; `/rectypes`, `/fields`, `/terms`, `/termlinks`, `/recstructure` (short `/rty`, `/dty`, `/trm`, `/trl`, `/rst`); `/rectypegroups`, `/fieldgroups` (short `/rtg`, `/dtg`), `/vcg`, `/swf`; `/login`, `/logout`; `/iiif`; `/annotations`; `/map/data/{id}`; `GET /records/{non-numeric or 0}` (`record_output.php`) |
| **srv** | Everything else: `/records`, `/sys`, `/def`, `/files`, entities, `/graph`, `/time`, `/map`, `/jobs`, `/external` |

`/web` is not an API route: `/{db}/web/...` belongs to `RequestRouter`.

## 3. Domains and entities

### 3.1 Table

"Legacy table" = where the data is today, if it is not in a Records/recDetails pair yet. "Legacy classes" = the srv
classes that exist only because of that table; they go away when the table is converted.

| Domain | Entity | Record type | Specific actions | Legacy table | Legacy classes (srv) | Status 2026-10-30 |
|---|---|---|---|---|---|---|
| sys | filter | — (saved filter) | — | `usrSavedSearches` | `SystemQueryBuilder` (read) | `/sys/filter` read only, no record output; writes: §11.1 (was plan 20 4c) |
| sys | tag | 2-1109 | `merge`, `assign` (tag–record) | `usrTags`, `usrRecTagLinks` | `Tags/TagWriteService`, `TagRecordMapping`, `TagRecordOutput`, `Records/UserData/LegacyTagTable`, `TagLinkTable`, `TagRepository` | Record format, CRUD; tags stay in `usrTags` (plan 20) |
| sys | bookmark | 2-1110 | — | `usrBookmarks` | `Bookmarks/BookmarkWriteService`, `BookmarkRecordOutput`, `PrivateInfoCipher` | Record format, CRUD |
| sys | reminder | 2-1111 | `execute` (send, no id) | `usrReminders` | `Reminders/ReminderWriteService`, `ReminderRecordOutput`; legacy mailer closure | Record format, CRUD; `POST /reminder/execute` |
| sys | user | `RT_SYS_USER` | `asset` | `sysUGrps` (`ugr_Type=user`) | `Users/UserWriteService`, `UserRecordMapping`, `UserRecordOutput`, `UserGroupRepository` | Record format, CRUD |
| sys | group | `RT_SYS_GROUP` | `assign` (user–group), `asset` | `sysUGrps`, `sysUsrGrpLinks` | `Groups/GroupWriteService`, `GroupRecordOutput`, `Users/GroupMembershipTable` | Record format, CRUD; `POST\|DELETE /group/{id}/assign` |
| sys | website | 99-51 | `execute` (build), `assign` (page–website) | — (Records) | — | Done (27d): `/website/{id}`, `Records/Entity` |
| sys | page | 99-52 | `import` (module configuration) | — (Records) | — | Done (27d): `/page/{id}` |
| sys | mapdoc | Map Document | `assign` (mapdoc–layer) | — (Records) | — | Edited through `/records/{id}` |
| sys | layer | Map Layer | — | — (Records) | — | `/records/{id}` PATCH (Map symbology) |
| sys | querysource | Data source / Query Source | — | — (Records) | — | `/records/{id}` |
| sys | report (UI: Report template) | 2-1104 | `execute` (one record), `asset` (template), `export` (`.gpl`), `import` | — (Records) + `smarty-templates/*.tpl` | `ReportTemplateStore` (template file) | Record format, CRUD, actions (plan 30) |
| sys | output (UI: Generated report; was `schedule`) | 2-1105 | `execute` (generate), `asset` (generated file) | — (Records) + `generated-reports/{id}.{ext}` | — | Record format, CRUD, actions (plan 30) |
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
| reminder | — (`rem`, `reminders` removed by 28a) |
| tag | `tags`, `keyword`, `keywords` |
| user | — (`users` removed by 28a) |
| group | `workgroup` (`groups` removed by 28a) |
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
| file content | `GET /files/{key}/content\|thumbnail`, `/files/upload[/{token}]` | Binary content, chunked upload |
| `login`, `logout` | legacy, in `api.php` | Session |
| `external` | `POST /external/translate` (`ExternalServiceController`, agreed by Artem 2026-11-02) | Services of external providers called by the server (translation now; lookups later) |

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
| `GET\|POST /sys` | same; `t` accepts name, record type id, concept code; also finds record-based entities | done, 28a |
| `/sys/{type}/{id}` CRUD, `/validate` | `/{entity}/{id}`; `/sys/{entity}/...` stays as an alias | done, 28a |
| `/sys/{type}/{id}/image` | `/{entity}/{id}/asset` | done, 28a |
| legacy `/users`, `/groups`, `/tag`, `/rem`, `/reminders` | removed; `/user`, `/group`, `/tag`, `/reminder` | done, 28a |
| `POST /sys/tag/assign` | `POST\|DELETE /tag/assign` (many tags, many records) | done, 28a |
| `POST /sys/tag/{id}/merge` | `POST /tag/{id}/merge` | done, 28a |
| `POST /sys/group/{id}/members` | `POST\|DELETE /group/{id}/assign` | done, 28a |
| `POST /sys/reminder/send` | `POST /reminder/execute` (no id: the unsaved form) | done, 28a |
| `/files`, `/files/{id}` CRUD, `/validate`, `/aggregate` | same | ok |
| `/files/{key}/content\|thumbnail`, `/files/upload` | special (§4) | ok |
| `GET /def/snapshot` | same (definitions read for clients) | ok |
| legacy `/rty`, `/dty`, `/trm`, `/trl`, `/rst` ... | `/def/rectype/{id}` ... through the generic controllers | conv |
| `GET /reports` | `GET\|POST /report?q=` or `/sys?q=[{"t":"report"}]` | done, 30 |
| `POST /reports/setup` | `GET\|POST /report/setup` | done, 30 |
| `GET /reports/{ref}` | `GET /report/{id}` | done, 30 |
| `DELETE /reports/{ref}` | `DELETE /report/{id}/asset` | done, 30 |
| `GET\|PUT /reports/{ref}/template` | `GET\|PUT /report/{id}/asset` (replaces the idea of a template field, 2026-11-06) | done, 30 |
| `POST /reports/import` | `POST /report/import` | done, 30 |
| `GET /reports/{ref}/export` | `GET /report/{id}/export` | done, 30 |
| `/reports/{ref}/render?rec=N` | `GET\|POST /report/{id}/execute?recordId=N`, one record | done, 30 |
| `GET /reports/schedules` | `GET\|POST /output?q=[{"f:<DT_REPORT>":id}]` | done, 30 |
| `GET /reports/generated`, `DELETE /reports/generated/{file}` | `GET\|DELETE /output/{id}/asset`; the list is the output records | done, 30 |
| `POST /jobs` `report-preview`, `report-generate` | stay; record ids only | done, 30 |
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
2. **Plan 28a:** user, group, bookmark, reminder, tag on `/{entity}`, `/sys` search over all entities, website and
   page client off `/records`.
3. **Plan 30:** reports and generated reports (`/reports/...` → `/report`, `/output`). Depends on 28a phase 4.
4. Table conversions (§7.4), each with its own plan: bookmark, reminder, user, group move to `sysRecords` (tags stay,
   plan 20); then website, page, report, output.
5. `heurist/documentation/api/heurist-openapi.yaml` is updated in the same step as each change (today the website
   routes are missing from it).

## 9. Discussion

### Round 1 (2026-10-30)

| # | Topic | Artem | Proposal (Claude) | State |
|---|---|---|---|---|
| 9.1 | Names | Keep OpenAPI short and consistent; full names preferred everywhere; short names (rty = rectypes ...) as a separate list; not all entities have short names | Full names in **singular** (`website`, `rectype`, `field`, `term`): an entity names a class (`hst:Website`), and `/website/12` reads "website 12". Plurals and short names = alias table §3.2. Domain names stay `def`, `sys`, `records`, `files`, `terms`. | proposal |
| 9.2 | `setup` | Useful for any entity: make sure the required record types and fields exist (`/reports/setup` checks report and schedule types; the same for websites); later compare with the core definitions database and import what is missing | Common entity-level action without id: `GET /{entity}/setup` = check, `POST` = install (§2.3). | agreed |
| 9.3 | Common and specific actions | Specify both: common = validate, duplicate, aggregate; specific = a dedicated service class, as now | Common: validate, duplicate, aggregate, import, export, image, setup (generic code). Specific: execute, assign, merge, cancel (one handler class per entity and action, registered in the entity registry, no new controller). Today tag merge / assign, group members and reminder send already sit as specific handlers inside `SystemEditController`. | proposal |
| 9.4 | Field action | Logically update / replace of one field value, but it may be limited to retrieval | GET only: `GET /{entity}/{id}/{field}`. A change of one field = PATCH with that field in the body. | agreed 2026-11-04 (plan 27e: `/records` first, same envelope as `?fields=N`, not implemented) |
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

**Revised (Artem, 2026-11-06):** the entity form stays canonical, and specifying the domain for an entity is not
recommended, but two forms are now allowed:

- `/sys/{entity}/...` is an accepted alias of `/{entity}/...`.
- `GET|POST /{entity}?q=...` is a search, equal to `/sys?q=[{"t":"entity"},...]`. The server adds the `t` predicate;
  no new search code. (`/website` without an id, which gave 405, now searches.)

### 9.8 Round 3 (Artem, 2026-11-06)

| # | Topic | Decision |
|---|---|---|
| 1 | `image` or `asset` | `asset`, no alias |
| 2 | `members` or `assign` on group | `assign`, as on website and tag |
| 3 | Name of 2-1105 | Entity `output`, UI "Generated report". The record type may hold scheduled exports later, so the name stays generic |
| 4 | Plural forms | `users`, `groups` are removed everywhere (also from `/sys` aliases) |
| 5 | Report details | Plan 30 |
| 6 | Users of a group | `GET /group/{id}?fields=members`; search with a `group` predicate: `/sys?q=[{"t":"user"},{"group":4}]`. Non-admins see only themselves in a user search, as today |
| 7 | `/hserv` and `/srv` routes | §2.5. The list of the request is confirmed, with the additions there |

## 10. History

- 2026-10-30 — draft 1: Artem's request (§1), rules, domain/entity table from the endpoint inventory of both repos,
  special endpoints, current → target mapping, dispatch, database structure (from plan 27 §3), discussion rounds 1-2.
- 2026-10-30 — §9.7 decided: domain only for whole-domain searches; entity search with `t:`. Plan 27d implemented
  as the first record-based entities (`srv/Records/Entity/`, see 27d §11).
- 2026-11-06 — plan 30 implemented (not committed): `/reports` removed, statuses updated.
- 2026-11-06 — plan 28a implemented (not committed): §2.4 and §5 statuses updated, legacy `/users`, `/groups`, `/tag`, `/rem`, `/reminders` removed.
- 2026-11-06 — draft 2: endpoint table §2.4, who serves what §2.5, action levels §2.3, `image` → `asset`,
  `schedule` → `output`, §5 refreshed, §9.7 revised, §9.8 added. Work goes to plans 28a and 30.
- 2026-11-07 — §11: open tasks of plan 20 moved here (plan 20 marked DONE). Plans 28a and 31 marked DONE.

## 11. Tasks moved from plan 20 (2026-11-07)

Plan `20 DONE System-Data-Transition-and-Files-Plan.md` is closed; these tasks were not done there. Each one still gets its
own planning session. Section numbers in brackets are plan 20.

### 11.1 Saved filters (plan 20 phase 4c)

- `filter` in the record format with writes, on the entity rules of this plan (`/filter/{id}`; today only
  `/sys/filter/{id}` read, §3.1). Legacy table `usrSavedSearches`, mapping like tags / bookmarks (`srv/System/Entity`).
- Definitions first: the Saved filter record type and its filter-type vocabulary (§10.3 "Later").
- HEditForm editor on a hard-coded structure (as `systemEntities.js`); the legacy query formats → request + filter form
  (memory note *saved filter legacy conversion*).

### 11.2 The switch to the new tables (plan 20 §2.1, §7 "end")

- `sysRecords` / `sysRecDetails` and `fileRecords` / `fileRecDetails` (§7.1 here), switch per database, after the
  legacy UI is gone.
- **Migration script** for files (§8.3.1 "Not done"): same ids, `AUTO_INCREMENT` of `fileRecords` after the highest
  `ulf_ID`, obfuscated key to `rec_Hash`. The same for tags (if they move, §7.6 item 4), bookmarks, reminders, users,
  groups, filters.
- **Before the switch:** the file type vocabulary 2-533 must hold every stored extension (§8.3.1 "Vocabulary gaps");
  the record store must keep the extension of an external resource (`FileRecordMapping::columnValue`, §10.11 "Open,
  record store only": use the extension of `rec_URL`, or keep it in a field).
- Port of the rest of `DbRecUploadedFiles` to srv: batch actions (merge duplicates, bulk registration, media records
  from files) (§8.4).
- Entity images become registered files (§10.13); `EntityImageStorage` later also for the database logo, record type
  icons and term images (§10.6).
- Mixed lists of record-based entities (Website manager, `HRecordManager`, pointer fields) stay on `/records` today
  (plan 28a §7 deviation 2): decide when those types move to `sysRecords`.

### 11.3 Files

- PDF thumbnails at upload (now lazy through the legacy `?thumb=`) (§8.3.1).
- Wikimedia and Nakala details of URL registration (§8.3.1).
- Not ported, stay legacy for now: self-registration, import of users from another database, transfer of ownership
  (§10.13).
- `/sys` (entity) aggregation: not made (§9.3); add only when a client needs it.

### 11.4 Definitions

- ~~Review and apply the four `20-*.sql` scripts~~ (§10.11, §10.11a): **done by Artem, 2026-11-07.** Left: the install
  SQL of new databases.
- Client support of `rst_FilteredJsonTermIDTree` and `leafTermsOnly`, which would replace the hard-coded subsets of
  `recordEditStructure.js` `vocabularyOf` (RT 2-11, 2-1105) (§10.11).
- ~~Import the user fields 2-1194..2-1199 and vocabulary 2-10566 into `osmak_mapping`~~ (§10.13): **done by Artem,
  2026-11-07.** `tests/SystemUserGroupTest.php --write`: 49 pass, none skipped.

### 11.5 Open point

- QName of records (§10.1.2, §10.7): when QNames come (also open here in §9).
