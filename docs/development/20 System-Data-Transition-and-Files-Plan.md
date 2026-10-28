# System data transition, files and API domains — development plan

Status: **strategy agreed 2026-10-18; Phases 1–3 implemented and committed (§8.2.1, §8.3.1, §9.5).
Phases 4–5 redesigned 2026-10-22 (§10): `/sys` itself gets the record format and CRUD (no `/system`); order 4a tags →
4b bookmarks, reminders → 4c saved filters → 4d users, groups, entity images. Phases 4a (§10.8) and 4b (§10.10) done
2026-10-22 on the imported definitions of §10.3, not committed, not checked in a browser. File editor and MIME
vocabulary review (§10.11) done 2026-10-23, not committed. 4d users and groups with entity images (§10.13) done
2026-10-23, not committed; the new fields wait for their concept codes (UserGroupCodes). Next: 4c saved filters.** Each phase (§7) gets its own planning session before any code; its detailed design is then added to
this file.

## 1. Context

Heurist data is kept in several kinds of storage:

| | Data | Storage |
|---|---|---|
| a | Definitions | `def*` tables |
| b | System and user data: users and groups, bookmarks, reminders, tags, saved filters | `sysUGrps`, `usrBookmarks`, `usrReminders`, `usrTags` + `usrRecTagLinks`, `usrSavedSearches` |
| c | User data | `Records`/`recDetails`, plus uploaded files in `recUploadedFiles` |
| d | System data already kept as records: map documents and layers, reports and schedules, websites and web pages | `Records`/`recDetails` |

**Goal:** every kind except definitions ends up in pairs of tables with the same structure as
`Records`/`recDetails`. This gives a self-describing database, one JSON format on the API, one edit
form on the client and one store on the server.

The main obstacle is the many existing databases, so the move happens in steps (§2).

## 2. Transition strategy (agreed 2026-10-18)

1. **The contract comes first.** The new client behaves as if the server were already new.
   - Every API domain takes and returns the **same JSON as `/records`**: `rec_*` headers, plus
     `details` keyed by field id. This is the format that `GET /records/{id}` outputs and the plan
     14 write API accepts.
   - The client never knows what storage is behind an endpoint.
2. **Intermediate backend.** Behind `/system` and `/files`, a converter turns record JSON into the
   legacy entity format (column → value) and back.
   - It calls the existing classes in `hserv/entity` (`DbRecUploadedFiles`, `DbUsrTags`,
     `DbUsrBookmarks`, `DbUsrReminders`) **in-process**, not through `entityScrud.php` over HTTP.
   - These classes keep doing the validation and the side effects: files on disk, thumbnails,
     links.
   - Legacy exception: saved filters and users use `usr_info.php`, `dbsSavedSearches.php` and
     `dbsUsersGroups.php` instead. They stay read-only here, so this does not matter yet.
3. **Final backend**, once the transition is approved:
   `/system` → `RecordEditController` → `Records/Edit` → `RecordStore` on `sysRecords`/`sysRecDetails`
   (and `fileRecords`/`fileRecDetails` for files). The client does not change.
4. **System record types** (group d) stay in `Records`/`recDetails` and use the plan 14 write API.
   After approval they move to `sysRecords`/`sysRecDetails`.
5. **Out of scope now:**
   - Definitions: loaded whole as the snapshot and read through HDbDefs.
   - Saved filters, users and groups: stay read-only on `/sys`, which keeps its current output.
6. **Order of work:**
   1. uploaded files;
   2. tags (this also unblocks the Tags panel, plan 18 Phase 2);
   3. bookmarks (the Private panel);
   4. reminders.

**srv stays independent of hserv.** srv defines an interface, for example `SystemEntityStore`
(search / get / save / delete / validate, all on record JSON).
- The legacy adapter that calls the `Db*` classes lives in **hserv**.
- It is wired in `ServiceFactory::fromLegacySystem`, the same pattern as the report renderer in
  plan 12.
- The final implementation based on `RecordStore` plugs into the same interface.

### 2.1 Two backends from the start, switch at the very end (Artem, 2026-10-18)

The new store is built **together with** the legacy adapter, not after it, so the switch is
possible at any time. **It is planned for the very end** of the move to the new Heurist, after the
legacy UI is gone. For files:

- **`LegacyFileStore`** (srv): converter + a small row class `LegacyFileTable` on `recUploadedFiles`.
  It does not use `DbRecUploadedFiles` (decided 2026-10-18, §8.6).
- **`RecordFileStore`** (srv): `RecordStore` + `RecordValidator` on `fileRecords`/`fileRecDetails`,
  given through `RecordSchema`. It validates against the structure of RT 2-1106.
- **Shared on-disk work, used by both stores:**
  - copy from scratch to `file_uploads/`;
  - the obfuscated key;
  - the thumbnail;
  - tiled stacks and `.mbtiles`;
  - removing the file, its thumbnail and its cached copies on delete.

  These parts of `DbRecUploadedFiles::save()` / `delete()` are ported to srv (a `FileStorage`
  class), and only these parts; the batch actions stay legacy.
- **The switch** is per database: a `DatabaseSettings` flag, or whether `fileRecords` exists — to
  decide in Phase 1. A migration copies `recUploadedFiles` → `fileRecords`/`fileRecDetails`:
  - the same ids, so `dtl_UploadedFileID` stays valid;
  - the obfuscated key goes to `rec_Hash`, so existing download links still work.
- **Legacy code:** about 20 places in hserv read or write `recUploadedFiles` directly:
  - `fileDownload.php`, `recordFile.php`;
  - import, sync, DbVerify;
  - reports, IIIF, annotations;
  - `composeSql`, elasticSearch.

  Because the switch comes at the very end, after the legacy code is gone, these places need no
  compatibility layer. In srv the only reader is `FileRepository`, which works on both stores.
- **Until the switch**, the new store runs only in tests and on test databases. The converter round
  trip and the migration are checked against the legacy store, which shows that both give the same
  record JSON.
- Tags, bookmarks and reminders follow the same pattern (`sysRecords`) in their phases.

## 3. Record types and fields (decisions 2026-10-18)

- **Real record types, not virtual ids.** Artem adds empty **real** record types (File, Tag,
  Bookmark, Reminder) to the core definitions, to get their concept codes.
  - `rec_RecTypeID` is the local id, resolved from the concept code (`DefinitionLookup`).
  - Only the *storage* is virtual: the legacy tables, reached through the converter.
- **Fields:**
  - Where a field already exists (DT_*), use it, resolved from its concept code.
  - Where none exists, use **new concept codes** (2-xxxx) in the core definitions. Enums get
    vocabularies too: preferred source, reminder frequency, rating, and so on.
- **One mapping per type**, legacy column ↔ `rec_*` header or field concept code. The same mapping
  is used for reading and for writing.
- **`/sys` output stays unchanged** (Artem, 2026-10-18). Filter, user, group and tag keep their
  current shape, so its callers do not change. The record-format domain for bookmarks, reminders
  and the like is a new **`/system`** (§5).
- **Edit form structure:** from `/rst/{rty}` once the types have fields. If a database lacks them,
  the server fills the structure from the mapping. To be confirmed in Phase 1.
- **`rec_Modified` is the concurrency token.** It maps to `ulf_Modified`, `tag_Modified`,
  `bkm_Modified` and `rem_Modified`.

### 3.1 Uploaded files mapping (Artem, 2026-10-18)

**Record type:** RT 2-1106, "Registered file", `RT_REGISTERED_FILE` (Artem, 2026-10-18; it was
"File Resource" in `osmak_mapping`).

| Column | Maps to | Note |
|---|---|---|
| ulf_ID | rec_ID | the same id in both stores, so `dtl_UploadedFileID` stays valid |
| ulf_Modified | rec_Modified | concurrency |
| ulf_Added | rec_Added | |
| ulf_UploaderUGrpID | rec_OwnerUGrpID | |
| ulf_AddedByImport | rec_AddedByImport | |
| ulf_OriginatingDBID | rec_OriginatingDBID | |
| ulf_IDInOriginatingDB | rec_IDInOriginatingDB | unique together with the previous one, as in Records |
| ulf_WhoCanView | rec_NonOwnerVisibility | viewable → `public`, loginrequired → `viewable`; other values refused |
| ulf_ExternalFileReference | rec_URL | |
| ulf_ObfuscatedFileID | rec_Hash | read-only; sha1 = 40 chars, fits the `rec_Hash(40)` index |
| ulf_OrigFileName | DT_ORIGINAL_NAME 2-1185 (new, freetext) | the title when there is no caption |
| ulf_FileName | DT_FILE_NAME 2-62 | internal: admins only |
| ulf_FilePath | DT_FILE_FOLDER 2-63 | internal: admins only (server path) |
| ulf_Caption | DT_NAME 2-1 | multilang; the title |
| ulf_Description | DT_EXTENDED_DESCRIPTION 2-4 | multilang |
| ulf_Copyright | DT_COPYRIGHT 2-35 | |
| ulf_Copyowner | DT_COPYOWNER 2-1188 (new, freetext) | |
| ulf_MimeExt | DT_MIME_TYPE 2-29 | enum; vocabulary to be extended — §3.2 |
| ulf_FileSizeKB | DT_FILE_SIZE 2-67 | read-only; bytes in the new store, KB × 1024 from the legacy store |
| ulf_MD5Checksum | DT_FILE_MD5 2-68 | read-only |
| ulf_PreferredSource | DT_REGISTERED_FILE_TYPE 2-1186 (new, enum: local / external / iiif_image / iiif / tiled) | |
| ulf_Parameters | DT_CONFIGURATION 2-1187 (new, blocktext JSON) | |
| ulf_SyncState | not mapped | to check in Phase 1 whether it is used |
| ulf_Thumbnail | not used | |

### 3.2 Mismatches found and how they were settled (2026-10-18)

The snapshot of `osmak_mapping` showed five mismatches; Artem decided each one.

1. **The constant name `DT_FILE_TYPE` was taken** (2-41 "File Type", unused). The new 2-1186 is
   `DT_REGISTERED_FILE_TYPE`.
2. **`DT_MIME_TYPE` 2-29 is an enum** of only 9 image MIME terms, while `ulf_MimeExt` holds any
   extension from `defFileExtToMimetype`. **The vocabulary will be extended.**
   - For Phase 1: the converter maps extension → MIME type (`defFileExtToMimetype`) → term.
   - Several extensions share one MIME type (jpg/jpeg), so the way back to `ulf_MimeExt` takes the
     extension of the file name.
3. **`ulf_Copyowner` was text but 3-1038 is a record pointer.** It now maps to the new
   `DT_COPYOWNER` 2-1188 (freetext).
4. **`ulf_FileSizeKB` (KB) vs 2-67 (bytes).** The new store keeps bytes.
5. **Record type name:** "Registered file", `RT_REGISTERED_FILE`.

Tags, bookmarks and reminders are mapped in their phases. They need pointers to records
(`bkm_RecID`, `rem_RecID`) and to users (`rem_ToUserID`).

Tag ↔ record links (`usrRecTagLinks`) are not fields of a tag. Options to decide in Phase 4:
- an action, `POST /system/tag/{id}/records` with `{add, remove}`;
- a tags value on the record side.

## 4. Files in Heurist (agreed 2026-10-18)

- **Files are kept out of `Records`**, for four reasons:
  - there can be more of them than data records;
  - they would slow search of user data;
  - most uses do not need detailed file information;
  - a file is an asset, not a description.
- **Final storage:** `fileRecords`/`fileRecDetails`, with **exactly the same structure** as
  `Records`/`recDetails`.
  - The obfuscated key is `rec_Hash` (indexed), so a download looks it up there.
  - The external location is `rec_URL`.
  - The other technical values are details: size, extension, MD5, preferred source, parameters.
  - The duplicate check by MD5 uses the existing `dtl_Value(63)` index (2026-10-18).
- **File registration vs media record.**
  - A registration (local or external) is referenced by file fields (`dtl_UploadedFileID`).
  - Fuller description belongs in an ordinary user record of a multimedia type with
    DT_FILE_RESOURCE. Legacy already has "create media records".
- **External resources stay in the registry.** It is a file *reference* registry. It gives:
  - one stable id per URL;
  - the MIME type, so the right player or viewer is used;
  - a thumbnail;
  - IIIF and tiled-image handling;
  - one `file` field type for local and remote files.
- **Not in the registry:**
  - entity images (record type icons and thumbnails, user and group images, database logo);
  - report output, job results and scratch files.

  They keep their own folders.
- **Shared file code for all entities.**
  - **Client:** one `file` field input (`HInputFile`). It gets upload, register a URL, pick an
    existing file and preview, and is used by every edit form.
  - **Server:** all file handling goes to one place (`FileRepository` and a new file store).
  - **Intermediate backend:** an adapter over `DbRecUploadedFiles`. Porting it to srv comes later,
    piece by piece.

## 5. API domains (agreed 2026-10-18)

> **Changed 2026-10-22 (§10.1):** there is no `/system`. `/sys` itself gets the record format and CRUD; its
> callers are updated. The text below is the decision of 2026-10-18.

**Domains:** `/{db}/{domain}` and `/{db}/{domain}/{id}`, with `domain` = `records`, `system`,
`files` or `def`.
- **`system`** (new, 2026-10-18) is the record-format domain for bookmarks, reminders, tags and so
  on. It keeps the type in the path (`/system/{type}/{id}`) while the tables differ, because ids
  overlap.
- **`sys`** stays as it is: read-only filter, user, group and tag, in today's output, with
  unchanged callers.
- `def` stays read-only (`/def/snapshot`).

**Editing** works the same on every domain:
- POST / PUT / PATCH / DELETE `/{id}`;
- POST `/{id}/duplicate` (405 where it makes no sense);
- POST `/{id}/validate`.

**Files, extra:**
- **Upload, then register.** Upload first into scratch (chunked), which returns a token. Then
  register with `POST /files/0`, whose record JSON carries the token; with only `rec_URL` it
  registers an external resource instead.
- **Content and thumbnail** are fetched by the obfuscated key. The legacy `?file=` / `?thumb=`
  links stay as aliases.

**Aggregation is separate from search:**
`GET|POST /{db}/{domain}/aggregate?op=count|rectypes|values|minmax|ranges`.
- It takes the same parameters as today: `q`, `field`, `via`, `groupby`, `ranges`, `match`,
  `text`, `sort`.
- Search returns records and `total`. `detail=ids` stays a search option.
- `detail=count|rectypes|values|minmax|ranges` was to stay as a deprecated alias; on 2026-10-19 it
  was decided to remove it in Phase 3 (§9.4).

**Special endpoints** stay retrieve-only: `iiif`, `annotations`, `map`, `time`, `graph`.

**OpenAPI file** (`heurist/documentation/api/heurist-openapi.yaml`): also document the routes that
are missing today: `/def/snapshot`, `/records/cancel` and `/records/{querysource|document|layer}/{id}`.

## 6. What exists now (2026-10-18)

- **`/sys`** (`srv/System/Query`): read-only filter, user and group. Its `details` are keyed by
  names (`query`, `email`, `role`). Tags are served through the legacy route.
- **Write API:** `RecordEditController`, `srv/Records/Edit` and `srv/Records/Store`, for whitelisted
  system record types. `RecordSchema` lets the table names be injected.
- **Search compiler:** works on table keys resolved by `SqlTables` (plan 15), so the query language
  can run on another table pair.
- **Files:** `FileRepository` reads only. There is no `/files` route and no upload in srv.
  - `RecordValidator` accepts only an existing `ulf_ID`.
  - `HInputFile` takes only an id.
- **Client:** `HEditForm` takes any form JSON. `HRecordEditor` gets its structure from `/rst/{rty}`;
  its structure provider and save client can be injected.

## 7. Phases

Each phase is planned in its own session before coding.

| Phase | Content | Status |
|---|---|---|
| 1 | File record type and fields (§3.2 settled); mapping registry; `/files` read (search + get) on both backends; switch flag and migration design | done 2026-10-18 (§8.2.1), committed |
| 2 | File upload/register/replace/delete on both backends (`LegacyFileStore`, `RecordFileStore` + srv `FileStorage`); migration script; `HInputFile` upload, URL, pick, preview | done 2026-10-18 (§8.3.1) except the migration script; committed |
| 3 | `/{domain}/aggregate`; move client callers off `detail=` | done 2026-10-19 (§9.5), committed |
| 4a | `/sys` in record format + CRUD; shared entity base classes (Files on them); tags read/write, tag ↔ record links, merge; HTagManager, Summary → Tags (§10) | done 2026-10-22 (§10.8), not committed; the definitions are imported (Tag 137, Usage 1189) |
| 4b | Bookmarks (encrypted private note) and reminders (Send now) on `/sys`; Summary → Private (§10.9) | done 2026-10-22 (§10.10), not committed; the HRecordList bookmark icon stays as it is (Artem) |
| 4f | File editor: hard-coded structure by file type, content replace, MIME type rule; MIME vocabulary 2-533 SQL (§10.11) | done 2026-10-23, not committed; SQL to be reviewed and applied by Artem |
| 4c | Saved filters writes, HEditForm editor (§10) | draft |
| 4d | Users and groups (membership, password write-only), managers; entity-image mode of HInputFile (§10.13) | done 2026-10-23, not committed; concept codes of the new fields from Artem |
| end | `sysRecords` tables; switching databases over (after the legacy UI is gone); port of the rest of `DbRecUploadedFiles` (batch actions) to srv | after approval |

## 8. Phases 1–2 in detail (draft for discussion, 2026-10-18)

Artem's request (2026-10-18): files uploaded from the client are handled by **new code**, with
chunked upload. The open questions are in §8.6.

### 8.1 What legacy does today (facts from the code)

- **Upload.**
  - `fileUpload.php` + `UploadHandler` (jQuery File Upload) write to `scratch/`.
  - Chunks are 10 MB, `Content-Range`, and only when a disk quota is defined.
  - For gif/jpg/png it makes a 200×200 PNG thumbnail at upload time, with EXIF auto-orient.
  - Allowed extensions are the ones in `defFileExtToMimetype`, plus a denylist of scripts.
  - Any logged-in user may upload; the 10 GB disk quota is checked.
- **Registration** (`DbRecUploadedFiles::save`):
  - The obfuscated id is `sha1(id.rand)`.
  - The stored name is `file_uploads/ulf_<id>_<OrigName>`; the thumbnail is
    `filethumbs/ulf_<key>.png`.
  - Tiled images: zip is extracted into `uploaded_tilestacks/<id>/`; `.mbtiles` is copied there.
  - A local JSON file is checked as an IIIF manifest or image info.
- **External URL** (`registerURL`):
  - Duplicates are checked by exact URL.
  - The canonical IIIF `info.json` is found.
  - The MIME type comes from youtube/vimeo/soundcloud/wikimedia patterns, otherwise from a HEAD
    request.
- **Edit/delete** are allowed for the uploader or the DB owner. Delete is blocked while any record
  references the file. It removes the file, the thumbnail and the cached copies, but not tile
  folders.
- **Thumbnails** for everything other than local images are made lazily by `fileDownload.php?thumb=`.
  - PDF, IIIF, remote images, YouTube/Vimeo/SoundCloud are handled there.
- **Legacy faults not to copy:**
  - Chunked upload with `usetempname` is unreliable: each chunk gets a new `'~'.time()` name.
  - No MD5 is stored at registration.
  - A failed copy from scratch still leaves the DB row.
  - `loginrequired` is enforced only for images.
  - Range requests answer without status 206.

### 8.2 Phase 1 — read

**Server**
- **Route** `files` in `api.php`, handled by a new `srv/Controller/FileController`:
  - `GET|POST /files` → search;
  - `GET /files/{id}` → one record.

  Output is the `/records` JSON:
  - `rec_RecTypeID` = RT_REGISTERED_FILE;
  - `rec_Title` = caption or original name;
  - `rec_Hash`, `rec_URL`, `rec_ThumbnailURL`;
  - details by the mapping of §3.1;
  - path and stored name only for admins.
- **`srv/Files/FileRecordMapping`**: the one mapping of §3.1 (column ↔ header or field code), with
  its conversions:
  - visibility;
  - KB ↔ bytes;
  - extension ↔ MIME term (the way back takes the extension of the file name).

  It is used for reading and for writing.
- **Search request and output use the standard classes** (Artem, 2026-10-18): the same request
  parsing, paging and record JSON as `/records`, so `HRecordList` can show files without changes.
  - Predicates for now, in the standard query language:
    - MIME type: `f:<DT_MIME_TYPE>`;
    - registered file type: `f:<DT_REGISTERED_FILE_TYPE>`;
    - owner: `owner:`/`addedby:`;
    - name or URL: `title:`, `url:`.

    Plus `ids`, sort, limit and offset.
  - **Legacy store:** a small compiler for these predicates, writing SQL on `recUploadedFiles`
    columns through `FileRepository` (still the only reader).
  - **New store:** the full compiler on `fileRecords`.
  - `HRecordList` / its data provider gets a base path option (`/records` or `/files`), if it does
    not have one.
- **Reading, new store:** the full compiler with `RecordSchema(['records'=>'fileRecords','details'=>'fileRecDetails'])`.
  The plumbing this needs:
  - `QueryExecutor` takes a repository;
  - `RecordQueryController` takes builder, executor and an entity name for `meta`;
  - `RecordDataService` is given a non-shared repository.
- **Interface** `srv/Files/FileStoreInterface`: `search`, `get`, `save`, `delete`, `validate`.
  - `LegacyFileStore`: `FileRepository` + `LegacyFileTable` on `recUploadedFiles`.
  - `RecordFileStore`: `fileRecords`/`fileRecDetails`.

  Both are srv code.

  `ServiceFactory::filesController()` picks the store. The switch is whether the `fileRecords` table
  exists; tests construct either store directly.
- **New tables:**
  - Created on test databases only, `CREATE TABLE fileRecords LIKE Records` (and `fileRecDetails`).
  - Added to `tests/DataAccessBoundaryTest.php` (owner: Records/Store).
- **Codes:** `RT_REGISTERED_FILE`, `DT_ORIGINAL_NAME`, `DT_REGISTERED_FILE_TYPE`,
  `DT_CONFIGURATION` and `DT_COPYOWNER` are added to `consts.php` and to the `ServiceFactory` code
  list.

**Client**
- A new `FileSource` value source over `GET /files` (title search) for picking a file, shaped like
  `RecordTitleSource` (`shared/src/data/valueSources/FieldValueSource.js`).
- The `file` value inside user records (`/records … resolveDetails`) **stays as today**
  (`{value, file:{ulf_*}}`); see §8.6 Q7.

**Tests:**
- `tests/FileApiTest.php` (pattern `RecordEditApiTest.php`): the same record JSON from both stores
  after a test migration of a few rows.
- Mapping round trip.

#### 8.2.1 Phase 1 as implemented (2026-10-18)

**heurist (srv):**
- **Files domain:** `srv/Files/` (README):
  - `FileRecordMapping`, the §3.1 mapping by concept code;
  - `FileStoreInterface`;
  - `LegacyFileStore` + `LegacyFileQueryBuilder` (SQL on `{files}`, the same pattern as
    `SystemQueryBuilder`);
  - `RecordFileStore`: `RecordQueryController` on `RecordSchema::FILE_TABLES`.
- **Controller:** `srv/Controller/FileController`, routed in `api.php`:
  - `GET|POST /files`, `GET /files/{id}`;
  - logged-in only; other methods 405.
- **Switch:** `ServiceFactory::fileController()` uses the new store when both file tables exist
  (`RecordRepository::tablesExist`).
- **Plumbing for another table pair:**
  - `RecordQueryController` takes a `RecordSchema` and an entity name (`meta.entity`);
  - `QueryExecutor` takes a repository.
- **`FileRepository`:** gains `rows()` (all columns) and `mimeTypes()`. It stays the only reader of
  `recUploadedFiles`.
- **Boundary test:** owns `fileRecords`/`fileRecDetails` under `Records/Store/`.
- **OpenAPI:** has `/files` and `/files/{id}`.
- **`tests/FileApiTest.php`:** 41 read-only checks; with `--write`, 46. The write run creates the
  file tables, copies 20 files, and checks that both stores give identical records, field metadata
  and single records; the tables are dropped on exit.

**explorer:**
- `shared/src/data/valueSources/FileSource.js`: `RecordTitleSource` on `/files`, keeping thumbnail,
  URL and key.
- `RecordTitleSource` gains `path`, `query` and `fields` options.
- Test in `shared/test/data/valueSources.test.js`.

**Differences from the design:**
- **Default sort:** by id, as the records search. Sort names are those of `SortCompiler` (`id`,
  `title`, `added`, `modified`, `url`, `f:<field>`).
- **Visibility:** logged-in users see every file. Legacy `viewable` and `loginrequired` are both
  visible to them, as `public` and `viewable` records are. Guests see only viewable files, but
  `/files` is not open to guests.
- **Extra edit headers:** with `fields=_all`, editors (the uploader or the DB owner) also get
  `rec_EditGroups: []`, `rec_NonOwnerVisibilityGroups: []` and `rec_FlagTemporary`, as `/records`
  gives them, so both stores answer the same.
- **`detail`:** values/ranges/minmax are refused (aggregation is Phase 3); `count` and `rectypes`
  work.
- **Translations:** of caption and description are not given yet.
- **Thumbnail on the new store:** `rec_ThumbnailURL` is made from `rec_Hash` for every file. The
  legacy store gives it only for images, media services and IIIF.
- **`hserv/consts.php` (Artem's change):** `DT_COPYOWNER` is `array(1, 1188)`, but the field agreed is
  2-1188. The mapping uses 2-1188, and the field is not yet in `osmak_mapping`.
- **Stale tests:** `tests/RecordQueryControllerTest.php`, `RecordDataPipelineTest.php` and
  `RecordSearchServiceTest.php` require old `hserv/records/search` paths and do not run (before
  this work too).

### 8.3 Phase 2 — upload and write

**Chunked upload: new srv code** (`srv/Files/Upload/`)

| Request | Meaning |
|---|---|
| `POST /files/upload` | start: `{name, size, type}` → `{token, chunkSize}` |
| `PUT /files/upload/{token}` | one chunk, raw body (`application/octet-stream`) + `Content-Range: bytes a-b/total` |
| `GET /files/upload/{token}` | bytes received (resume after a broken connection) |
| `DELETE /files/upload/{token}` | cancel |

- **Token:** 32 random hex characters, bound to the user. Data goes to `scratch/uploads/<token>`,
  and its metadata to `<token>.json`.
- **Chunks:**
  - A chunk is appended only if `a` = the bytes already received; otherwise 409 with the current
    size, so the client resumes.
  - `chunkSize` is chosen by the server: 5 MB, never above `post_max_size`.
- **Last chunk → finalise:**
  - size = total;
  - the extension is in `defFileExtToMimetype` and not on the denylist;
  - MD5;
  - MIME from content (`finfo`);
  - EXIF auto-orient and a 200×200 thumbnail for images (GD/Imagick, as legacy).

  Response: `{token, name, size, md5, mime, ext, thumbnail, duplicates:[ids with the same MD5]}`.
- **Checks:**
  - logged-in user;
  - disk quota (the value is passed in from `SystemSettings::getDiskQuota`);
  - name ≤ 255 bytes;
  - same-site `Origin`, plus the required header `X-Heurist-Client`. A custom header forces a CORS
    preflight, so cross-site forms cannot post chunks.
- **Cleanup:** unfinished or unregistered uploads older than 24 h are removed when a new upload
  starts.

**Register / edit / delete** (both stores behind `FileStoreInterface`)

| Request | Meaning |
|---|---|
| `POST /files/0` | record JSON + `"upload": token` → local file; or only `rec_URL` → external resource |
| `PATCH`/`PUT /files/{id}` | metadata; with `"upload": token` the content is replaced |
| `DELETE /files/{id}` | 409 with the referencing records while any exist (as legacy) |
| `POST /files/{id}/validate` | checks only; `duplicate` → 405 |

- **Permissions:** insert by any logged-in user; edit and delete by the uploader or the DB owner (as
  legacy).
- **No `DbRecUploadedFiles` in new code** (Artem, 2026-10-18). Both stores are srv code and share
  all file work. They differ only in where the row is kept.
- **Shared: `srv/Files/FileStorage`** is the port of the disk part of legacy `save()`/`delete()`:
  - move from scratch;
  - obfuscated key `sha1(id.rand)`;
  - stored name `ulf_<id>_<OrigName>` and thumbnail `filethumbs/ulf_<key>.png`, exactly as legacy,
    so legacy readers keep working;
  - tiled zip and `.mbtiles`;
  - the IIIF check of local JSON;
  - remove the file, thumbnail and caches.
- **Shared: `srv/Files/FileUrlInspector`** is the port of `registerURL` detection:
  - IIIF canonical `info.json`;
  - youtube/vimeo/soundcloud patterns;
  - MIME by HEAD request.

  Wikimedia and Nakala details come later; until then they fall back to HEAD.
- **Legacy store: `LegacyFileTable`** (srv, beside `FileRepository`; boundary test owner) — a small
  insert/update/delete of rows in `recUploadedFiles`, using the mapping. It also stores
  `ulf_MD5Checksum`.
  - The old UI still writes the same table through `DbRecUploadedFiles` until the end. So the rows
    written by the new code must look the same: tests compare them with a row made by legacy for
    the same file.
- **New store: `RecordFileStore`** — `RecordSaveService` with the files schema.
- **Rule for both:** the DB row is written **after** the file is in place, and is rolled back if the
  move fails. The legacy fault of keeping the row after a failed copy is fixed.
- **No hserv adapter is needed for files.** The hserv adapter of §2 remains only for tags,
  bookmarks and reminders, if they need it.
- **Migration script** (test databases only): `recUploadedFiles` → `fileRecords`/`fileRecDetails`,
  with the same ids and the key in `rec_Hash`.

**Client**
- **`HeuristApiClient.upload(path, blob, {headers, onProgress, signal})`:** XHR, because fetch has no
  upload progress.
- **`shared/src/data/FileUploader.js`:** start, chunks, resume, cancel, progress events.
- **`HInputFile` rework** (one input for every edit form):
  - It shows the thumbnail, name and size.
  - Its buttons are:
    - **Upload**: file chooser, drag & drop and paste;
    - **URL**: a small form through `openEditFormDialog`;
    - **Pick**: `HValueCombo` with `FileSource`;
    - **Edit** file metadata: `HRecordEditor` for RT_REGISTERED_FILE, with its client pointed at
      `/files`;
    - **Clear**.
  - **During upload:** a progress bar and Cancel.
  - **After upload:** if `duplicates` is not empty, ask "Use the existing file / Upload anyway".
    Then `POST /files/0` with the original name, and the returned id becomes the field value.
- **`RecordEditClient`** gets a base path option (`/records` or `/files`).
- **URL builders:** the thumbnail and file URL builders of `RecordViewRenderer` move to a shared
  helper (`shared/src/data/fileUrls.js`), used by `HInputFile` and the hosts.
- **Strings:** in Explorer `localization_eng.txt`/`_fre.txt`.
- **Content:** still served by the legacy `?file=` / `?thumb=` (§8.6 Q5).

**Tests:**
- `tests/FileUploadTest.php`:
  - chunks in order and out of order;
  - resume, cancel;
  - denied extension, quota.
- `FileApiTest`, extended: register an upload, register a URL, replace, delete with a reference — on
  both stores.
- Client unit tests for `FileUploader` (fake transport).

**New content endpoints** (§8.6 Q5): `GET /files/{key}/content` and `GET /files/{key}/thumbnail`,
looked up by the obfuscated key.
- Content answers with proper 206, `Content-Range` and `Accept-Ranges` for video.
- `loginrequired` is checked for every file type.
- The thumbnail is made lazily, as `?thumb=` does: srv code for images; for PDF and remote files it
  redirects to the legacy `?thumb=` until those are ported.
- The legacy `?file=` and `?thumb=` stay.

#### 8.3.1 Phase 2 as implemented (2026-10-18)

**heurist (srv), see `srv/Files/_README.md`:**
- **Upload:**
  - `Upload/ChunkedUpload`: start, chunk, status, cancel, take/release.
  - `ImageThumbnail`: GD thumbnail and EXIF orientation.
  - Chunk size: 5 MB, never above `post_max_size`.
- **Disk:** `FileStorage`, with the legacy names `ulf_<id>_<name>` and `ulf_<key>.png`; tile stacks;
  remove.
- **External URLs:** `FileUrlInspector`; the network call is passed in for tests.
- **Rows:** `FileRowsInterface` with `LegacyFileRows` (`Records/Files/LegacyFileTable`) and
  `RecordFileRows`.
- **Writes:** `FileWriteService` for register / change / replace / delete / validate.
- **Content:** `FileContent`, for content and thumbnails.
- **Controller:** `FileController` has every route of §8.3. `api.php` passes the real verb, the
  JSON body, the raw chunk and the headers; content and thumbnails are open to guests.
- **Other srv changes:**
  - `RecordStore::setHeaders`;
  - `RecordRepository::idsByHeader`, `idsByValue`, `fileReferences`;
  - `FileRepository::idsByUrl`, `idsByChecksum`;
  - in the boundary test, `Records/Files/` (the folder) owns `recUploadedFiles`.
- **Tests:** `tests/FileWriteTest.php` has 23 checks without table writes and 59 with `--write`.
  `FileApiTest` still passes (46).
- **OpenAPI:** has all routes.

**explorer:**
- **`HeuristApiClient.upload()`:** XHR with upload progress.
- **`shared/src/data/FileUploader.js`:**
  - chunks with `X-Heurist-Client`;
  - resume after a network error;
  - a 409 continues at the size the server has;
  - an abort cancels on the server;
  - `register()` and `registerUrl()`.
- **`HInputFile` rework:**
  - Layout: a thumbnail, a picker over `/files` (`FileSource`), and an open-link icon.
  - Buttons: Upload (also drag & drop and paste) with a progress bar and Cancel; Register URL (a
    small form dialog, loaded lazily because the edit form imports the inputs); and Edit file
    details (host `editFile`).
  - Duplicates question: "Use the registered file" / "Upload anyway" / Cancel.
  - Read-only hides the buttons.
- **`RecordEditClient`:** option `domain: 'files'`.
- **Explorer `RecordEditorHost`:**
  - `editFile(id)` opens the record editor on `/files` (dialog title "File details");
  - `editFile` is passed through `HRecordEditor`, `HEditForm` and `HEditField`;
  - `formServices()` gives it.
- **Strings:** in Explorer eng/fre (the old "File ID" strings are removed).
- **Tests:** `shared/test/data/fileUploader.test.js`, plus file input tests in
  `recordEditor.test.js`. All 1225 client tests pass, and all apps build.

**Differences from the design:**
- **Third file table, `filePermissions`.** It has the structure of `usrRecPermissions`. Without it,
  the access check and deletes on `fileRecords` would use `usrRecPermissions` rows of ordinary
  records with the same id. `RecordSchema` therefore cleans no user tables (reminders, tags,
  bookmarks) for a record pair other than `Records`. `RecordSchema::FILE_TABLES` names all three
  tables.
- **Ids after the switch.** File records keep the ids of `recUploadedFiles`, and new ids continue
  after the highest one, because user records refer to files by id. The migration must set the
  `AUTO_INCREMENT` of `fileRecords`.
- **New content takes the new name.** Replacing content takes the name of the new file (as legacy
  `replaceLocalFiles`), unless the request gives `DT_ORIGINAL_NAME`; the key stays.
- **Visibility:** `hidden`/`pending` are refused for files (400). Files know only public and
  viewable.
- **Translations:** caption and description translations (`fre:...`) are not kept in the legacy
  table (as on reading).
- **Vocabulary gaps:** the new store keeps the MIME type and the registered file type as terms. A
  value that has no term in the vocabulary is lost there; so the MIME vocabulary must be extended
  (§3.2) before the switch.
- **Not done in Phase 2:**
  - the migration script — not needed until the switch; the tests create the tables themselves;
  - PDF thumbnails at upload — they come lazily through the legacy `?thumb=`;
  - Wikimedia and Nakala details of URL registration.
- **Not checked yet:** a browser check of `HInputFile` in the Explorer record editor.

### 8.4 What Phase 1–2 does not include
- Batch actions (merge duplicates, bulk registration, media records).
- A file manager UI.
- The switch itself.

### 8.5 Files touched (main ones)

- **heurist:**
  - `hserv/controller/api.php`, `hserv/consts.php`;
  - `srv/Controller/FileController.php`;
  - `srv/Files/*` (mapping, interface, `LegacyFileStore`, `LegacyFileTable`, `RecordFileStore`,
    `FileStorage`, `FileUrlInspector`, `Upload/*`);
  - `srv/Records/Query/*` and `srv/Controller/RecordQueryController.php` (schema plumbing);
  - `srv/Runtime/ServiceFactory.php`;
  - `tests/File*Test.php`, `tests/DataAccessBoundaryTest.php`.
- **explorer:**
  - `shared/src/api/HeuristApiClient.js`;
  - `shared/src/data/FileUploader.js`, `fileUrls.js`, `valueSources/FileSource`, `RecordEditClient.js`;
  - `shared/src/widgets/form/inputs/HInputFile.js` + `.css`;
  - `apps/explorer/src/core/RecordEditorHost.js`;
  - localization files.

### 8.6 Decisions (Artem, 2026-10-18)

1. **No `DbRecUploadedFiles` in new code.** A small srv class (`LegacyFileTable`) writes the rows of
   `recUploadedFiles`. Disk work and URL detection are ported once (`FileStorage`,
   `FileUrlInspector`) and shared by both stores (§8.3).
2. **Chunks:** raw body + `Content-Range`.
3. **Duplicate files (same MD5):** warn after the upload and let the user choose.
4. **Search:** standard request, paging and record JSON (usable in `HRecordList`). For now only
   MIME type, file type, owner, and name/URL (§8.2).
5. **Content:** keep the legacy `?file=`/`?thumb=` **and** add the new content and thumbnail
   endpoints (§8.3).
6. **Thumbnails at upload:** images only; others lazily.
7. **The `file` value inside user records** keeps its current format.
8. **Listing files:** logged-in users see their own and public files; admins see all; anonymous
   users see none.

## 9. Phase 3 — `/{domain}/aggregate` (agreed 2026-10-19)

Goal (§5): search returns records and `total`; counting, values and bounds go to their own route.
The client moves to it, and `detail=count|rectypes|values|minmax|ranges` is removed (§9.4 Q2).

### 9.1 What exists now (facts from the code)

- **Server.** `RecordQueryController::buildRequest()`/`execute()` branch on `detail`:
  - `count`, `rectypes` → `RecordSearchService::search()` summary: `{query, total[, rectypes]}`;
  - `values` → `countValues()`: `{query, total, values}` (`field`, `text`, `sort` = value order,
    `via`, `limit` ≤ `FieldValueCounter::MAX_LIMIT`);
  - `ranges` → `valueBuckets()` (`field`, `groupby`, `ranges`, `match`);
  - `minmax` → `valueRange()`: `{query, min, max, count}` (`field`);
  - `ids` and `records` are search outputs and stay there.
- **`/files`:** `LegacyFileStore` gives `count` and `rectypes`; `values`/`ranges`/`minmax` → 400.
  `RecordFileStore` goes through `RecordQueryController`, so it would accept them.
- **`api.php`:** `/records` search reads the JSON contract keys (`detail`, `debug`, …); trace
  (`debug=1|2`) and Stop (`rid`, `POST /records/cancel`) work for every srv search, so also for
  facets.
- **Client callers** (9 files; no legacy `hclient` callers):

  | Caller | Op | Method |
  |---|---|---|
  | `apps/explorer/src/core/ExplorerApplication.js` `_withResultCount` | count | GET |
  | `apps/explorer/src/core/RecordTypeManager.js` `load` | rectypes | GET |
  | `apps/explorer/src/tools/export/ExportTool.js` | rectypes | POST |
  | `apps/reports/src/data/ReportApi.js` | count | POST |
  | `apps/graph/src/data/GraphProvider.js` (Smart expansion) | rectypes | POST |
  | `apps/graph/src/data/RecordDataProvider.js` `#summary` | count, rectypes | POST |
  | `apps/data/src/data/RecordDataProvider.js` `#summary` | count, rectypes | POST |
  | `shared/src/data/valueSources/FieldValueSource.js` (facets, pickers) | values, ranges, minmax | GET |
  | `shared/src/symbology/thematicFields.js` (thematic maps, ranges) | values ×2, minmax | GET |

- **Server tests** that use `detail=`: `FieldValueCounterTest`, `FieldValueBucketsTest`,
  `FieldValueRangeTest`, `FileApiTest`.

### 9.2 Proposal

**Route**
- `GET|POST /{db}/records/aggregate` and `GET|POST /{db}/files/aggregate`. `/system/aggregate`
  comes with the `/system` domain (Phase 4).
- `op` = `count | rectypes | values | minmax | ranges`; missing or other → 400.
- The other parameters are the same as today: `q`/`query`/`ids`, `filter`, `field`, `via`,
  `text`, `sort`, `limit`, `offset`, `groupby`, `ranges`, `match`, plus `debug` and `rid`, so the
  trace panel and Stop work as for search.
- `aggregate` is not a number, so it does not clash with `/records/{id}` or `/files/{id}`; the
  file content route needs a key *and* `content|thumbnail`.

**Response** — the same shapes as the `detail=` responses today (Q1), so client parsers do not
change:
- `count` → `{query, total}`; `rectypes` → `{query, total, rectypes}`;
- `values` → `{query, total, values}`; `ranges` → as `detail=ranges`; `minmax` → `{query, min, max, count}`.

**Server**
- `RecordQueryController::aggregate(array $params)`: checks `op`, then runs the code that the
  `detail` branches run today (moved into private methods). `execute()` with
  `detail=count|rectypes|values|minmax|ranges` → 400 naming `/aggregate?op=` (no alias, Q2).
  Search keeps `detail=records|ids`.
- `SearchRequest` keeps its internal `detail` property; nothing is renamed below the controller.
- **Files:** `FileStoreInterface::aggregate(array $params)`; `FileController` routes
  `/files/aggregate`. Both stores give `count` and `rectypes`; `values`/`minmax`/`ranges` → 400 on
  **both** stores, so both answer the same (Q3).
- `api.php`: `aggregate` routes next to the search routes, with the same JSON contract keys plus
  `op`.

**No alias** (Q2): `detail=count|rectypes|values|minmax|ranges` on `/records` and `/files` is
removed in this phase, after the client callers have moved. §5 said it would stay for a while;
Artem decided otherwise (2026-10-19).

**Client**
- One shared helper `shared/src/data/aggregate.js`:
  `aggregate(apiClient, op, params, {domain = 'records', method = 'GET', signal})` →
  `/{domain}/aggregate`. It adds `op` and returns the response as it is.
- All callers of §9.1 move to it; Data/Graph `RecordDataProvider.count()/rectypes()` keep their
  public methods. `detail: 'ids'` (Reports) stays a search option.
- **Guard:** a test in `test/architecture` fails when client code (outside tests) sends
  `detail` with `count|rectypes|values|minmax|ranges`.

**OpenAPI:** `/records/aggregate`, `/files/aggregate`; `detail` lists only `records` and `ids`. Also
the missing routes of §5 (`/def/snapshot`, `/records/cancel`, `/records/{querysource|document|layer}/{id}`) (Q4).

**Tests**
- `tests/AggregateApiTest.php`: each op on `/records/aggregate` gives the same answer as the
  service call; 400 for a missing or unknown `op` and for the removed `detail=` values; `/files/aggregate` count/rectypes the same on
  both stores (with `--write`, as `FileApiTest`).
- The `FieldValue*Test` and `FileApiTest` controller calls move from `detail=` to `aggregate()`.
- Client: helper test; caller tests (`valueSources.test.js`, Data/Graph `providers.test.js`,
  `recordTypeManager.test.js`) check the new path.

### 9.3 Not in Phase 3
- New operations (sum/avg, group by several fields).
- Aggregation on `/system` (Phase 4).

### 9.4 Decisions (Artem, 2026-10-19)
1. **Response shape:** today's shapes, per op.
2. **`detail=` alias:** removed once the client has moved (not kept as deprecated).
3. **`/files/aggregate`:** only `count` and `rectypes`, on both stores.
4. **OpenAPI:** the routes missing since §5 are added in this phase too.

### 9.5 Phase 3 as implemented (2026-10-19)

**heurist (srv):**
- **`SearchRequest::AGGREGATE_OPS`** (count, rectypes, values, minmax, ranges). Below the controller
  they are still `detail` values of `SearchRequest`.
- **`RecordQueryController`:** `aggregate()` / `outputAggregate()`; `execute()` refuses those
  `detail` values with 400 `use /{domain}/aggregate?op=…`. `op` is case-insensitive.
- **Files:** `FileStoreInterface::aggregate()` on both stores; `FileController` routes
  `/files/aggregate` and checks `op` (missing/unknown → 400; values/minmax/ranges → 422, the code
  the controller uses for unsupported queries); `LegacyFileStore::search()` and the record store
  refuse the old `detail` values as `/records` does.
- **`api.php`:** `GET|POST /records/aggregate` (anonymous allowed, as search) with the JSON keys of
  §9.2; `/files/aggregate` reads the same JSON contract as the files search (`op` added).
- **OpenAPI:** `/records/aggregate`, `/files/aggregate`, `/records/cancel`,
  `/records/{querysource|document|layer}/{id}`, `/def/snapshot`; schemas `RecordAggregateRequest`,
  `RecordAggregateResponse`; `detail` lists only `records` and `ids`; the value parameters moved
  from `/records` to `/records/aggregate`.
- **READMEs:** `srv/Controller/_README.md`, `srv/Files/_README.md`.
- **Tests:** new `tests/AggregateApiTest.php` (23 checks: each op = the service answer, filter, refused
  ops and `detail` values, `detail=ids` kept). `FieldValueCounterTest` (45), `FieldValueBucketsTest`
  (254), `FieldValueRangeTest` (18) call `aggregate()`; `FileApiTest` 45 checks, 51 with `--write`
  (op=rectypes the same from both stores). `FileWriteTest`, `RecordEditApiTest`, `GraphControllerTest`,
  `DataAccessBoundaryTest` pass.

**explorer:**
- **`shared/src/data/aggregate.js`:** `aggregate(api, op, params, {domain, method, signal})`.
- **Callers moved** (§9.1, same GET/POST as before): Explorer `_withResultCount` (no longer sends
  `sort`), `RecordTypeManager`, Export tool, Reports `queryCount`, Graph `countRecordTypes`, Data and
  Graph `RecordDataProvider`, `FieldValueSource` (values, ranges, `fetchFieldRange`),
  `thematicFields`. Comments say `aggregate op=…`.
- **Guard:** `test/architecture/moduleBoundaries.test.js` fails on `detail: 'count'` etc. in `shared/src`
  and `apps/*/src`.
- **Tests:** `shared/test/data/aggregate.test.js`; caller tests updated. All 1279 client tests pass;
  all apps built and deployed (the deployed bundles must be current, as the server no longer accepts
  the old `detail` values).

**Differences from the design:**
- `/files/aggregate` answers 422 (not 400) for values/minmax/ranges: "supported elsewhere, not here",
  as the controller does for other unsupported queries.
- **Not checked yet:** facets, sliders, thematic maps and the Export/Graph counts in a browser.

## 10. Phases 4–5 redesign (Artem, 2026-10-22)

### 10.1 Decisions (2026-10-22)

1. **`/sys` itself** gets the record format and CRUD; there is no `/system` (this changes §3 "`/sys` output stays
   unchanged" and §5). The callers are updated: `UserGroupManager`, `SavedFilterManager`, `RecordDataProvider.loadTags`,
   `TagSource`.
   - In queries the type stays a name: `{"t":"user"}`, `/sys/user/123`. In the output, `rec_RecTypeID` is the
     numeric local id of a real record type.
   - `details` are keyed by field id (resolved from concept codes); `fields=_all` works.
2. **QName (later):** a type has `rec_RecTypeQName` "sys:user".
   - **Proposal:** a record's QName uses its **id**, `sys:user:123`. Names can be renamed (login, group, tag text),
     and a tag text is unique only per owner.
   - A readable alias (`sys:user:johnson`) may be accepted for lookup, resolved to the id, never stored.
   - To agree when QNames are introduced.
3. **Definitions:** Claude proposes the mapping (§10.3); Artem adds the record types and new fields to the core
   definitions; then code.
4. **Order:** 4a tags with the shared server framework → 4b bookmarks and reminders → 4c saved filters → 4d users
   and groups with entity images.
5. **Editors:** HEditForm (no Summary, no Structure) on a **hard-coded edit structure in the `/rst` JSON format**,
   for these entities and for files.
   - The record types get no `defRecStructure` rows for now. Later the structure comes from `/rst`, without code
     changes.
6. **Storage:** the legacy tables stay until the switch (§2.1).
   - **Tags stay in `usrTags` + `usrRecTagLinks` for good**: there can be many more tags than records (this changes
     §2.1 "Tags follow the same pattern").
7. **Password** (4d): never in any output. It is accepted only as a **write-only** value, hashed on the server, never
   a stored detail.
   - **Decided (Artem, 2026-10-22):** changing a password is a **separate form** that requires the old password.
8. **Private note of a bookmark** (4b; was "password reminder", `bkm_PwdReminder`; Artem, 2026-10-22): **encrypted
   from now on**, reversible, with a server key; visible to its owner only. The legacy read path decrypts it too.
9. **Staged output** (4a, 2026-10-22): a type gets the record format in its own phase, when its definitions exist:
   - tag in 4a, bookmark and reminder in 4b, saved filter in 4c, user and group in 4d;
   - until then a type keeps today's keyword output, so the callers of filter, user and group do not change yet.
   - A tag uses fields every database has (2-1, 2-3). `rec_RecTypeID` is the Tag type's local id once Artem adds it,
     0 until then. *Usage count* is left out while the database lacks it, as for file fields.

### 10.2 What exists (facts, 2026-10-22)

- **`/sys` today** (`srv/System/Query`, routing `hserv/controller/api.php:484-517`):
  - read-only (PUT / PATCH / DELETE 405, POST = search), guests 401;
  - types `filter|user|group|tag` (`SystemEntitySchemaRegistry.php`);
  - keyword details (`query`, `filterType`, `email`, `description`, `ownerName`, `role`);
  - `fields=_all` gives 400 (`SystemQueryService.php:138`);
  - an item also outputs the query-only `details.record` (bug);
  - no bookmark or reminder.
- **No concept codes yet** for these types; only files (2-1106) have them. The client has provisional
  `RT_USER_BOOKMARKS` / `RT_USER_REMINDERS` → `/system/*` (`shared/src/data/recordDomains.js:36`).
- **Files stack to generalize:**
  - `FileRecordMapping` (HEADERS, FIELDS by concept, `toRecord` / `toColumns`, writable);
  - `LegacyFileTable` (rows);
  - `FileWriteService` (`RecordInput`, path id, 409 on `rec_Modified`, PUT clears writable columns, permissions);
  - `FileController`, `FileTransaction`.
- **Legacy UI to follow:** `hclient/widgets/entity/manageUsrTags.js` (accordions per owner, inline rename with merge,
  `+` per group, delete, usage count as a search link; compact mode in the record editor), `manageUsrBookmarks.js`,
  `manageUsrReminders.js`.

### 10.3 Proposed definitions (for Artem to add; "new" = a new 2-xxxx code)

**Agreed codes (Artem, 2026-10-22).** The record types have no structure in the database: their structure is
hard-coded (in the `/rst` JSON format).

| Record type | Code | | Field | Code | Type |
|---|---|---|---|---|---|
| User | 2-1107 | | Usage (tag: the number of tagged records, read-only) | 2-1189 | numeric |
| Group | 2-1108 | | Rating (bookmark, 0 = not rated) | 2-1190 | numeric 0–5 |
| Tag | 2-1109 | | Frequency (reminder): once, daily, weekly, monthly, annually | 2-1191 | enum, vocabulary 2-10454 |
| Bookmark | 2-1110 | | PrivateInfo (bookmark, was "password reminder"; encrypted) | 2-1192 | freetext |
| Reminder | 2-1111 | | Recipient (reminder): a system user or group | 2-1193 | resource → 2-1107, 2-1108 |

- **Imported into `osmak_mapping` (2026-10-22):** record types 133 System user, 134 System User Group, 135 User
  Bookmark, 136 User Reminder, 137 User Tag; fields 1185 Rating, 1186 User Private Info, 1187 User or Group (→ 133, 134),
  1188 Frequency (vocabulary 10450 = 2-10454: Daily, Weekly, Monthly, Annually, Once), 1189 Usage count. Rating and
  Usage count are *float* fields (numeric). With them, tags give `rec_RecTypeID` 137 and the usage as field 1189 (no
  `rec_Usage`); `SystemTagTest --write` (35) and `SystemQueryTest` (55) pass.
- Rating is a numeric field 0–5, not `rec_Popularity`, and not an enum (decided 2026-10-22).
- A reminder has one recipient pointer (a user **or** a group, as legacy, which allowed only one of
  `rem_ToWorkgroupID` / `rem_ToUserID`); the e-mail recipient stays DT_EMAIL 2-23.
- **`bkm_ZoteroID` is not mapped** (Artem: no Zotero field). 2-581 is "GeoNames ID" (float) in the databases, not an
  external id.
- **PrivateInfo is at most 140 characters** while it is kept in `bkm_PwdReminder varchar(250)`: the encrypted value
  is longer than the text. The limit goes with the move to `sysRecords`.
- Later (4c / 4d): the Saved filter record type and its filter-type enum; the user's login name and Enabled; the
  group's Admins and Members (two pointer fields to users: the role).

The proposal as it was:

Headers: `rec_ID`, `rec_Added`, `rec_Modified` (concurrency), `rec_OwnerUGrpID`, `rec_Title`.

**Tag** (record type new):

| Column | Maps to |
|---|---|
| tag_ID / tag_Modified / tag_UGrpID / tag_AddedByImport | rec_ID / rec_Modified / rec_OwnerUGrpID / rec_AddedByImport |
| tag_Text | DT_NAME 2-1 (title; required; at least 3 characters; unique per owner) |
| tag_Description | DT_SHORT_SUMMARY 2-3 |
| usage (count of `usrRecTagLinks`) | new *Usage count*, integer, read-only |

**Bookmark** (record type new; private to its user):

| Column | Maps to |
|---|---|
| bkm_ID / bkm_Added / bkm_Modified / bkm_UGrpID / bkm_AddedByImport | headers (owner = the user) |
| bkm_RecID | DT_RESOURCE 2-13 (one bookmark per record and user) |
| bkm_Rating | new *Rating*, enum 0–5 (proposed; see the note below) |
| bkm_Notes | DT_EXTENDED_DESCRIPTION 2-4 |
| bkm_PwdReminder | new *Private note* (encrypted, shown to the owner only; see below) |
| bkm_ZoteroID | DT_EXTERNAL_ID 2-581 |
| rec_Title | title of the bookmarked record (read-only) |

- **Rating vs `rec_Popularity`** (Artem's question):
  - possible: an integer header, which on a bookmark record would mean "this user's rating";
  - proposed: a field, because HEditForm edits fields (an enum with labels), not headers, and `rec_Popularity` already
    has another meaning on ordinary records (a cron popularity, probably deprecated). **To decide.**
- **Password reminder** (Artem: "hashed privacy info, shown unhashed to its user only"):
  - a hash is one-way, so it needs **reversible encryption**: a server key per installation (libsodium, the key in
    the configuration), decrypted only for the owner;
  - while the legacy UI is used, its bookmark editor would show the encrypted text, unless the legacy read path
    decrypts too (hserv may call the srv class). **To decide: now with a legacy decrypt, or at the switch.**

**Reminder** (record type new):

| Column | Maps to |
|---|---|
| rem_ID / rem_Modified / rem_OwnerUGrpID | headers |
| rem_RecID | DT_RESOURCE 2-13 |
| rem_ToWorkgroupID / rem_ToUserID | new *Recipient group* / *Recipient user* (pointers to the Group / User types) |
| rem_ToEmail | DT_EMAIL 2-23 |
| rem_Message | DT_EXTENDED_DESCRIPTION 2-4 |
| rem_StartDate | DT_START_DATE 2-10 |
| rem_Freq | new *Frequency*, enum once / daily / weekly / monthly / annually |
| rem_Nonce | not mapped; "Send now" is an action |

**Saved filter** (4c, draft): svs_Name → 2-1; svs_Query → DT_QUERY_STRING 2-12; filter type → new enum, read-only
(derived from the query); svs_UGrpID → owner.

**User / Group** (4d, draft):
- **User:**
  - ugr_Name → new *Login name*; ugr_LastName → 2-1, ugr_FirstName → DT_GIVEN_NAMES 2-18 (as the core Person type);
  - ugr_eMail → 2-23; ugr_Enabled → new enum;
  - organisation / department → new freetext or not mapped;
  - the password: write-only (§10.1.7);
  - the image: entity image (§10.6).
- **Group:**
  - ugr_Name → 2-1; ugr_LongName → DT_SHORT_NAME 2-2; ugr_Description → 2-4; ugr_URLs → DT_URL 3-1058;
  - membership (`sysUsrGrpLinks`) → new *Admins* / *Members*, repeatable pointers to users;
  - the current user's role (read-only).

### 10.4 Server design (4a, heurist repo)

1. **Base classes** extracted from Files, in `srv/System/Entity/`. Files extend them; `FileWriteTest` and `FileApiTest`
   guard the refactor.
   - `EntityRecordMapping`: rectype concept, HEADERS, FIELDS (concept → column, converters), writable,
     `toRecord` / `toColumns`.
   - `LegacyEntityTable`: table, id column, known columns; row / insert / update / delete.
   - `EntityWriteService`: parses the body, path id, 409 on `rec_Modified`, PUT vs PATCH, required fields, a
     `canEdit` hook, a transaction.
   - A store interface `SystemEntityStore` for the switch (tags: the legacy store only).
2. **`/sys` output** (`SystemQueryService`):
   - the record format of §10.1.1; `fields=` accepts field ids and the old keywords;
   - the predicates (`owner`, `user`, `record`, `ids`, `t`) unchanged;
   - the `details.record` leak fixed; schemas `bookmark` and `reminder` (4b); the OpenAPI file.
3. **Writes:**
   - POST `/sys/{type}/0`, PUT / PATCH / DELETE `/sys/{type}/{id}`, POST `/sys/{type}/{id}/validate`;
   - `TagWriteService`: the legacy checks; DELETE removes the tag's links.
4. **Tag ↔ record links:** `POST /sys/tag/assign {records, add, remove}` (the legacy batch);
   `POST /sys/tag/{id}/merge {into}` (renaming onto an existing tag merges, as legacy `_replaceTag`).
5. **Permissions as legacy:** a tag can be changed by its owner (the user, or a group they belong to) or an admin.
6. **Tests:** `tests/SystemApiTest.php`, `tests/SystemWriteTest.php --write`; `DataAccessBoundaryTest`
   (`System/Entity` owns the legacy tables).

### 10.5 Client design (4a / 4b, this repo)

1. **`shared/src/data/systemEntities.js`:** per type the concept codes and the hard-coded edit structure (`/rst` JSON
   format) for HEditForm; the same for files later.
2. **Domains:** `recordDomains.js` → `{domain: 'sys', type}`; `RecordEditClient` accepts `sys`; `RecordListLoader`
   already works on any path speaking `/records` JSON.
3. **4a UI:**
   - **`HTagManager`** (`shared/src/widgets/tags/`):
     - accordions per owner (Personal first, then the user's groups);
     - a click on a tag opens an inline HInputText: Enter or blur saves; Esc cancels; an existing name asks to merge;
     - a delete × with a confirmation; the usage count as a search link;
     - one input with `+` per group.
     - Opened from the Explorer menu and from Summary → Tags ("Manage").
   - **`HTagSelector`** (Summary → Tags):
     - the record's tags grouped by owner, with × to unassign;
     - an HValuePicker of the user's tags (owner: Personal or a group) with "Add new tag '…'";
     - changes are sent at once (`/sys/tag/assign`), as relationships; then RecordView tags and the HDbDefs tag cache
       are refreshed.
4. **4b UI:**
   - Summary → **Private**: the bookmark (rating, notes; Bookmark / Remove) and the reminders (list, Add / Edit /
     Delete, Send now);
   - light HEditForm dialogs (`openEditFormDialog`) on the hard-coded structures;
   - the bookmark icon of HRecordList (`h-recordlist-bookmark`) clickable (host callback), opening the same dialog.

### 10.6 Later (4c / 4d)

- Saved filter writes and their HEditForm editor.
- User and group managers: HRecordManager on `/sys/user` and `/sys/group`; HEditForm editors (password write-only,
  members fields).
- **HInputFile entity-image mode** `{entity, version}`:
  - images live in `HEURIST_FILESTORE/<db>/entity/<sysUsers|sysGroups|...>/`, not in `recUploadedFiles`;
  - a new srv `EntityImageStorage` + `GET|PUT|DELETE /sys/{type}/{id}/image` (upload by the existing chunked token),
    as legacy `fileUpload.php` + `DbEntityBase::renameEntityImage`;
  - later the database logo, record type icons and term images.

### 10.7 Open points

- Rating: a field or `rec_Popularity` (§10.3).
- ~~Private note encryption~~: decided, now (§10.1.8).
- QName of records (§10.1.2): when QNames come.
- Where Explorer opens the tag manager (menu item; Summary → Tags "Manage").

### 10.8 Phase 4a as implemented (2026-10-22)

**heurist (srv):**
- **Shared bases** `srv/System/Entity/` (README there):
  - `EntityRecordMapping`: concept-code fields, writable columns, term lookup, `fieldValue` / `columnValue` hooks;
  - `LegacyEntityTable`: row writes;
  - `EntityWriteService`: body, path id, POST / PUT / PATCH, account, 409 conflict, warnings;
  - `EntityTransaction`.
  - Files are on them: `FileRecordMapping`, `LegacyFileTable`, and `FileWriteService` for the shared steps.
    `FileTransaction` delegates. `FileApiTest` (45) and `FileWriteTest --write` (59) unchanged.
  - **Deviation:** `FileWriteService` keeps its own upload flow. It uses the base for the shared steps only.
- **Same-site check:** `Controller/SameSiteGuard`, used by `FileController` and the new controller.
- **Tag storage** `srv/Records/UserData/`: `TagRepository` (rows with usage, by owner and text, records of tags,
  owners), `LegacyTagTable`, `TagLinkTable` (assign, remove, move, the bookmark of a personal tag). Tables through the
  `RecordSchema` keys, so `DataAccessBoundaryTest` passes without a change.
- **Tags** `srv/System/Tags/`: `TagRecordMapping`, `TagRecordOutput` (`/sys` output) and `TagWriteService` (rules of
  `DbUsrTags`).
- **Writes:** `Controller/SystemEditController` and `ServiceFactory::systemEditController()`. `api.php` sends
  POST / PUT / PATCH / DELETE `/sys/{type}/...` there; only tags can be written now (others 405).
- **Output:** `SystemQueryService` gives `t=tag` in the record format; the other types are unchanged (§10.1.9).
- **Codes (2026-10-22, §10.3):** Tag 2-1109, Usage 2-1189. In a database without these definitions (still
  `osmak_mapping`) the output falls back: `rec_RecTypeID` is 0 and the usage is the header `rec_Usage` (asked as
  `usage`, `rec_Usage` or with `_all`). With them, the usage is the field 2-1189 and there is no `rec_Usage`;
  `TagClient` reads either.
- **Legacy rules kept:**
  - a tag in use is not deleted without `force` (the manager asks, then forces);
  - assigning a personal tag bookmarks the record;
  - merge (rename onto an existing name) is within one owner.
- **New, beyond legacy:** tags are put only on records the user can see; `replace` removes only tags the user may
  change.
- **Tests:**
  - `tests/SystemTagTest.php`: 13 checks without tables, 35 with `--write`; it cleans up its tags, links and new
    bookmarks;
  - `tests/SystemQueryTest.php` (55) updated: the tag owner name is `rec_OwnerName`.
- **OpenAPI:** the four tag paths, and the tag item.

**explorer:**
- **Data:**
  - `shared/src/data/TagClient.js`: list, create, update, remove, assign, merge, `tagTextProblem` (the legacy minimum
    of 3 characters is a client check only);
  - `RecordEditClient` takes `domain: 'sys'` with `type`; `RecordEditError.details` keeps the whole error body.
- **Callers:** `RecordDataProvider.loadTags` reads `rec_OwnerName`; `UserGroupManager` asks for `rec_OwnerUGrpID`.
- **Widgets** `shared/src/widgets/tags/`:
  - `HTagManager`: accordions per owner, + per group, inline HInputText rename, a merge question, delete with the
    number of records, usage as a search link;
  - `HTagSelector`: the record's tags with ×, a picker of the user's other tags, "Add new tag" with the typed text, the
    owner of new tags;
  - `tagGroups.js`: `tagOwnerGroups`, `confirmTagAction`.
- **Small shared changes:** `HValuePicker` actions get the typed text (`run(text)`); fake DOM `innerHTML` has a
  textContent.
- **Record editor:** Summary → **Tags** is `HTagSelector` (open), with the event `h-record-tags-change` and the
  option `onManageTags`.
- **Explorer:**
  - `ui/ExplorerTagManager.js` (dialog);
  - `ExplorerApplication.manageTags()` (search by tag through `showDatasource`) and `_tagsChanged()` (reload the tag
    cache, refresh the Record View that shows the record);
  - "Manage tags" in the gear menu and in the configuration dialog footer;
  - the editor host and the editor shell pass it on.
- **Strings:** Explorer eng / fre.
- **Tests:** `shared/test/tags.test.js` (6); updated `recordDataProvider`, `userGroups` and pane toolbar tests. All 1342
  pass; all apps build; deployed.

Not checked in a browser yet.

### 10.9 Phase 4b design (Artem, 2026-10-22)

Decisions:
1. **Encryption key** of the private note (PrivateInfo 2-1192): **one per installation** (sysIdentification has no
   field for it). It is a global in `heurist/../heuristConfigIni.php`, `$privateInfo_Secret`, like `$jwt_Secret`;
   `configIni.php` gives the empty default.
   - Without a key the note is kept as text (as legacy) and the API answers with a warning.
   - The cipher is AES-256-GCM through openssl (sodium is not installed): `enc1:` + base64(iv, tag, text); a value
     without the prefix is legacy text.
   - The note is at most 140 characters (`bkm_PwdReminder varchar(250)`, §10.3).
   - It is decrypted only for the owner of the bookmark. The legacy bookmark editor decrypts and encrypts the same way
     (hserv calls the srv class).
2. **Send now** of a reminder: the **legacy mailer** (`DbUsrReminders::batch_action` with the reminder's fields,
   as the legacy "Send immediately", which does not save). srv calls it through a closure given by
   `ServiceFactory::fromLegacySystem`.
3. **Editors:** in the record editor's Summary → **Private**: the values read-only, and a **pen** that opens a small
   popup with an HEditForm (as HRecordAccess in Admin), on the hard-coded structures. No action in HRecordList for
   now.

Server (heurist):
- **Storage** `Records/UserData/` (tables through RecordSchema keys `bookmarks`, `reminders`): `BookmarkRepository`,
  `LegacyBookmarkTable`, `ReminderRepository`, `LegacyReminderTable`.
- **Bookmarks** `System/Bookmarks/`: `BookmarkRecordMapping` (RT 2-1110; record 2-13 = bkm_RecID, Rating 2-1190 =
  bkm_Rating, notes 2-4 = bkm_Notes, PrivateInfo 2-1192 = bkm_PwdReminder), `PrivateInfoCipher`,
  `BookmarkRecordOutput`, `BookmarkWriteService`.
  - The owner is the user; one bookmark per record and user (409 duplicate with the existing bookmark).
  - Only the owner sees or changes a bookmark (also not an administrator).
  - The title is the title of the bookmarked record.
- **Reminders** `System/Reminders/`: `ReminderRecordMapping` (RT 2-1111; record 2-13 = rem_RecID, Recipient 2-1193
  = rem_ToWorkgroupID or rem_ToUserID by the type of the pointed user / group, e-mail 2-23 = rem_ToEmail, message
  2-4, start date 2-10, Frequency 2-1191 = rem_Freq as a term of 2-10454), `ReminderRecordOutput`,
  `ReminderWriteService`.
  - Exactly one recipient (a user or group, or an e-mail); the frequency defaults to once.
  - The owner (or the database owner) changes it.
  - `POST /sys/reminder/send` sends a reminder record without saving it.
- `/sys` schemas `bookmark` and `reminder` (query `record`); `SystemEditController` routes for both;
  `tests/SystemBookmarkReminderTest.php`.

Client (explorer):
- `BookmarkClient` / `ReminderClient` (or one `UserDataClient`);
- the hard-coded structures (`shared/src/data/systemEntities.js`);
- Summary → Private: a bookmark block (rating, notes, private note; Bookmark / Edit / Remove) and a reminders block
  (a list; Add / Edit / Delete / Send now), each editing in an `openEditFormDialog`.

### 10.10 Phase 4b as implemented (2026-10-22)

Server (heurist):
- `srv/Records/UserData/`: `BookmarkRepository` (rows with the record title, `idOf(user, record)`,
  `hasPersonalTags`), `LegacyBookmarkTable`, `ReminderRepository`, `LegacyReminderTable`;
  `Users/UserGroupRepository::types()` (user or workgroup of an id: where a recipient is stored).
- `srv/System/Entity/EntityRecordOutput` — **new base**: the `fields` selection and field metadata of
  `TagRecordOutput` moved here; `TagRecordOutput`, `BookmarkRecordOutput`, `ReminderRecordOutput` extend it
  (each adds its rows, headers and former keywords; tags keep the Usage / `rec_Usage` special case).
- `srv/System/Bookmarks/`: `PrivateInfoCipher` (as §10.9; `fromConfiguration()` reads `$privateInfo_Secret`,
  default `''` added to `configIni.php`), `BookmarkRecordMapping` (rating 0 = no value; the note is decrypted for
  the owner only, unreadable notes are left out), `BookmarkRecordOutput` (`meta.privateInfo {encrypted,
  unreadable}`), `BookmarkWriteService`.
- `srv/System/Reminders/`: `ReminderRecordMapping` (`frequencyOf`: term id or label → `rem_Freq`; start date
  1970-01-01 = no value), `ReminderRecordOutput`, `ReminderWriteService` (`send` through a sender closure).
- `/sys` schemas `bookmark`, `reminder` (query field `record`; `rating`; `startdate`, `frequency`); access in
  `SystemQueryBuilder::appendAccess` (bookmarks: the owner only, also for administrators; reminders: the owner,
  the database owner all). `SystemQueryService::recordResponse` serves the three mapped types.
- `SystemEditController` takes a map of write services by type (`ServiceFactory::systemEditController`); the
  sender closure `ServiceFactory::$reminderSender` runs `DbUsrReminders::batch_action` with the columns.
- Legacy: `hserv/entity/DbUsrBookmarks` decrypts on search (owner only) and encrypts on save (a value with the
  prefix is kept); `hserv/records/search/recordSearch.php` decrypts `bkm_PwdReminder` for the current user (the
  key icon of the result list).
- OpenAPI: `/sys/bookmark/{id}` (+ validate), `/sys/reminder/{id}` (+ validate), `/sys/reminder/send`; the type
  enums list bookmark and reminder.
- Tests: `tests/SystemBookmarkReminderTest.php` (21 checks, 46 with `--write`; send with a fake mailer, the
  legacy entity decrypt); `SystemTagTest` (35), `SystemQueryTest` (55), `FileApiTest` (45), `FileWriteTest
  --write` (59) and `DataAccessBoundaryTest` pass — the boundary test lists `usrBookmarks`, `usrReminders` for the
  schema registry, as the other `/sys` tables (agreed 2026-10-13).

Client (explorer):
- `shared/src/data/systemEntities.js`: the Bookmark and Reminder structures in the `/rst` row format with concept
  codes and a `key` per field; `systemEditRows` / `systemEditStructure` (through `buildEditStructure`) /
  `systemEditForm` (`omit`, `fields` overrides) / `systemValues` / `systemDetails` / `systemFieldIds`.
- `shared/src/data/UserDataClient.js`: `BookmarkClient`, `ReminderClient` (one base class), plain items by key.
- `shared/src/widgets/user-data/HRecordPrivate.js` + css: Summary → Private in HRecordEditor (`_renderPrivate`,
  event `h-record-private-change`).
- Localization: Explorer eng/fre. Tests: `shared/test/userData.test.js` (6); all 1349 client tests pass;
  `build:all` builds; Explorer deployed.

Deviations and details:
- The changes are **sent at once** (like tags), not with the record's Save: a bookmark or reminder is not a field of
  the record.
- The popup is `openEditFormDialog` (a dialog), not inline as HRecordAccess.
- In the forms the **rating** is radio buttons (Not rated, ★ … ★★★★★) and the **recipient** a list of the users and
  groups of HDbDefs (a "Send to" radio: User or group / E-mail addresses, with `showWhen`), not the pointer
  input: users and groups are not records before 4d. The stored structures stay pointer / float.
- **Send now** is a button of the reminder popup (Save / Send now / Cancel); it sends the form's values and keeps
  the popup open. Legacy limits stay: the legacy mailer checks the recipient with `FILTER_VALIDATE_EMAIL`, so
  "Name <address>" (user and group recipients) and several addresses may not be sent — to be checked by Artem.
- A bookmark of a record with personal tags of the user is not removed (409 `has_personal_tags`), as legacy.
- No key is set in the local `heuristConfigIni.php`: until `$privateInfo_Secret` is set there, notes are stored as
  text with the warning `not_encrypted` (the test sets its own key).
- No action in HRecordList (Artem, §10.9).

### 10.11 File editor and MIME vocabulary (Artem, 2026-10-23)

**Decisions:**
- The editor of a registered file uses a **hard-coded structure** (`systemEntities.js` `file`, as bookmark /
  reminder), not `/rst`. Required: file type, MIME type, content or URL.
- **File type** (2-1186) is never edited: the form is made for the type of the record.
- Per type (`FILE_FIELDS_BY_TYPE`):

  | field | local | tiled | external | iiif / iiif_image |
  |---|---|---|---|---|
  | content (HInputFile, replace mode) | shown | shown | – | – |
  | URL (`rec_URL`) | – | – | required | required |
  | download URL | read only | – | – | – |
  | file name, size | read only | – | – | – |
  | MIME type 2-29 | read only | editable | editable | application/json, read only |

  Then caption, description, copyright, copyright owner. Not in the form: stored name and folder (2-62, 2-63),
  MD5 (2-68), configuration (2-1187).
- **New content takes effect on Save** (the upload token goes in the save body); Close / Drop changes cancel the
  upload. The server sets name, size, MD5 and MIME type from the content; the editor shows them after the save
  (the form is made again from the saved record).
- **Summary:** Admin and Linked records only (no Private, Tags, Scratchpad). Linked records = the records that
  refer to the file (`/records` with `file:@<rec_Hash>`). No Structure pane.

**As implemented (both repos, not committed):**
- `systemEntities.js`: `SYSTEM_RECORD_TYPES.file` (2-1106), `FILE_TYPES` (terms 2-10449..2-10453),
  `SYSTEM_STRUCTURES.file`, `registeredFileType()`, `fileEditStructure(record, dbdefs, {fileUrls, multilangIds})`,
  `formatFileSize()`. Named fields that are not details: `upload` (`replace: true`, `file` = current content),
  `url` (`header: 'rec_URL'`), `downloadUrl`, `size`, `mimeJson` (`transient`: shown, not sent).
- `HRecordEditor` options: `structure` (a function; made again after each save), `structurePane: false`,
  `summarySections`, `linkedRecords` (a list of links, "and N more"). Header fields are read from and written
  to the record; `upload` is sent as `body.upload`. `recordEditValues.js` skips fields without `dty`.
- `HInputFile` `replace: true`: the current file is shown; an upload is not registered, its token is the value
  ("New file: name (size) - replaces the current file on Save"); *Keep the current file* cancels it; no picker,
  URL or Edit; a pending token is cancelled when the input is destroyed.
- Explorer `RecordEditorHost._fileEditorOptions()` (`editFile`); a linked record opens in Record View.
- **heurist** `FileWriteService::update`: MIME type (2-29) only for tiled and external (400 for local and
  IIIF when it differs from the stored one; a term without a file extension, e.g. a group, is refused; image/jpeg
  is stored as `jpeg`). **Fixed:** new content of a tile stack was placed as a plain file and became `local`
  (and was refused as "external" before that): it is now placed with `placeTiles` and stays tiled; a MIME type
  sent with it wins over the type of its first tile. OpenAPI and `srv/Files/_README.md` updated.
- Tests: `shared/test/fileEditor.test.js` (5); `tests/FileWriteTest.php --write` 69 checks (9 new); all 1355
  client tests pass. Not checked in a browser.

**MIME vocabulary 2-533 (findings and proposal):**
- 2-533 "Mime Type (images)" has 9 image terms; it is used by DT 2-29 (RT 2-11 Map image file (tiled), RT 2-1105
  Custom Report Schedule), DT 2-41 (RT 2-5 Digital media) and 3-1094.
- RT 2-11: srv `MapPresentationService` does not use DT_MIME_TYPE (uses the file's `ulf_MimeExt`); only legacy
  `viewers/map/mapLayer.js` maps 2-540 → .png, 2-537 → .jpg, else .gif. Not critical: these terms keep their
  concept codes.
- RT 2-1105: legacy `ReportRecordWriter::mimeTermId` finds the term by label or code (html, js, txt, csv, xml,
  json, css) — none of them is in 2-533 today. With codes = main extension they will be found.
- **One nested vocabulary for all**, renamed "MIME type": groups Images, Audio, Video, Documents, Text and data,
  Geo, Archives, 3D, Web services, Other; a MIME type term has its main extension as code.
- **Groups are not chosen** as a file's MIME type: neither `trm_Status` (it is the review state: reserved /
  approved / pending / open; `pending` would mark the groups unapproved, and nothing reads it for selection) nor
  `dty_TermIDTreeNonSelectableIDs` (dead in the legacy UI: `editingBrowse.js` has `headerTermIDsList` commented
  out, `manageDefDetailTypes.js` says "not used anymore"; it is a list of local ids per field). Instead: the
  server refuses a term without a file extension (done); the client will show terms with children as
  non-selectable headers in the file editor (`leafTermsOnly`, with the import). Limited sets for RT 2-11 (Images)
  and RT 2-1105 (Text and data) via `rst_FilteredJsonTermIDTree` pointing to a group (client support to add).
- **SQL instead of CSV** (Artem): `docs/development/20-mime-vocabulary.sql` (for DB 2: groups, 96 MIME types,
  the 9 existing terms moved and given codes, `image/jpeg2000` relabelled `image/jp2`, concept codes 2-<id>;
  outdated types listed at the end with reasons) and `20-file-extensions.sql` (each database's
  `defFileExtToMimetype`: 85 outdated / script / executable extensions removed, only when no registered file uses them (foreign key `fk_ulf_MimeExt`; `bin` kept: the URL inspector's fallback; `js` kept: text/javascript), descriptions fixed, xlsx / pptx /
  js / ogg MIME types fixed, 25 new extensions). Generated from the database export by a one-off script; both
  were run on `hdb_osmak_mapping` in a transaction and rolled back without errors (105 terms in 10 groups).
- **MIME type vs extension (checked 2026-10-23, Artem's question):** one MIME type has many extensions
  (application/octet-stream: shp, shx, dat...), so no code may derive the extension from the MIME type when the
  file has its own. Findings:
  - legacy store: the extension is stored (`ulf_MimeExt`) and the MIME type is only looked up from it
    (`defFileExtToMimetype`); upload and URL registration take the extension of the file / URL first
    (`ChunkedUpload`, `FileUrlInspector`). Code that needs the extension reads `ulf_MimeExt` (map tiles
    `{z}/{x}/{y}.<ext>`, the 3D viewer of reports).
  - client: only the MIME type is used, to choose image / audio / video (`fileMediaItem.js`), else the extension
    of the name; nothing derives an extension.
  - MIME type chosen in the file editor (new): the extension of the URL or name is kept when it has the chosen
    type (`scan.tif` + image/tiff → `tif`), only else the one named in the type or the first (test added).
  - **Open, record store only** (`RecordFileRows`, after the switch): the record keeps only the MIME term, and
    `FileRecordMapping::columnValue` gets the extension back from the file name (2-62 / 2-1185); an external
    resource has no name, so it would get the first extension of its MIME type. Before the switch: also use the
    extension of `rec_URL`, or keep the extension in a field.
- Open: Artem reviews the lists (outdated ermapper / mrsid / zoomify terms kept because values exist), applies
  the scripts; then client support of `rst_FilteredJsonTermIDTree` and `leafTermsOnly`, structure filters for
  RT 2-11 / 2-1105, and the install SQL of new databases.

#### 10.11a File type = extension (Artem, 2026-10-27; implemented, not committed)

Replaces the MIME type vocabulary above: users understand extensions, the extension is what is stored
(`ulf_MimeExt`), and a MIME term made every save guess the extension.

- **Vocabulary 2-533 "File type"**: groups (Images, Audio… - no code, not a value, usable as a filter) > extension
  terms, label = code = extension, description = file type name. `docs/development/20-file-type-vocabulary.sql`
  (DB 2; after the two scripts above): one term per further extension of a MIME type (jpeg beside jpg; stop-list
  extensions left out), MIME terms relabelled to their code; ids and concept codes stay, so stored values stay
  valid and legacy `mapLayer.js` keeps 2-540 png / 2-537 jpg. Dry run on osmak_mapping: 104 relabelled, 43 new.
- **Field 2-29 = "File type", constant DT_FILE_EXT**; DT_MIME_TYPE and DT_FILE_TYPE (2-41, unused) removed; the old
  DT_FILE_EXT (2-64, free text of media records) is merged into 2-29 by Artem.
  `docs/development/20-file-type-migration.sql` (each database) moves 2-64 values to 2-29 term ids; values without
  a term are listed and stay (osmak_mapping: 22 of 42 move, 20 test values stay). Legacy writers of 2-64 now write
  the term id: `DbRecUploadedFiles::extensionTermId()` (media records from files, FieldHelper import).
- **Subsets** for RT_TILED_IMAGE_SOURCE (png jpg jpeg gif webp) and RT_REPORT_SCHEDULE (html csv txt xml json js
  css): two vocabularies by reference that Artem creates in DB 2; their concept codes go into
  `SystemConstants` `TRM_TILE_FORMATS` = 2-10639, `TRM_REPORT_FORMATS` = 2-10638 (created by Artem 2026-10-28). The client picks them hard-coded
  by record type (`recordEditStructure.js` `vocabularyOf`, beside `geoKindOf`); a database without them keeps the
  whole vocabulary. Tile formats: ZIP stacks extract png jpg jpeg gif webp; MBTiles may hold pbf vector tiles,
  which the map cannot show (left out).
- **MIME type stays derived** from the extension through `defFileExtToMimetype`, on the server only: download
  `Content-Type` (FileContent), URL registration (Content-Type → extension), file values of `/records`
  (`fxm_MimeType`), `/files` records of `fields=_all` (new header `fxm_MimeType`), thumbnails, Smarty players and
  3D viewer, exports (HML `mimeType`). No ext → MIME table in the snapshot: the client gets `fxm_MimeType` with
  file data (the editor's preview and inserted media used to read the term label).
- **Writes**: `FileWriteService::requestedExt` stores the chosen term's code (no guess); groups refused. Uploads and
  registrations: `FileRepository::allowedTypes()` = extensions of `defFileExtToMimetype` that are also terms of
  2-533 (all of them while a database has the older vocabulary), plus the stop list. A URL without a known type is
  registered as `bin` with the warning `file_type` ("choose it in File type").
- **Tile stack zips** (security, fixed): only tile images are extracted (`FileStorage::TILE_IMAGE_EXTENSIONS`, not of
  the stop list); scripts, `.htaccess` and the html / xml pages of gdal2tiles never reach the file store; a zip
  without tile images is refused. Deviation from the plan (refuse the whole zip): gdal2tiles always adds html /
  xml files, so they are skipped instead. Test `tests/TileZipTest.php`. **Legacy fixed too (2026-10-28)**:
  `UArchive::unzip` has an optional extension list (other entries skipped, `..\` and `C:` entries refused);
  `DbRecUploadedFiles::save()` passes the tile image types, refuses a zip without tile images and removes the
  folder on error. Other `unzip` callers (database restore in `DbUtils`) are unchanged. Same test, 11 checks.
- Client labels: 2-29 "File type"; the registered file type 2-1186 (local / external / tiled / IIIF) was also
  "File type" and is now **"Source"**; record manager filters `SOURCE` (2-1186) and `FILETYPE` (2-29).

### 10.12 Registered files manager and file preview (Artem, 2026-10-23; not committed)

- **Manage registered files** in Explorer's gear menu and the configuration dialog (next to Manage tags):
  `RecordEditorHost.manageFiles()` = the record manager of RT_REGISTERED_FILE in `manager` mode (Edit = the file
  editor of §10.11).
- **Add buttons of the files' record manager** (manager and Browse of a file field): HRecordManager option
  `addActions` (host buttons instead of "Add new <type>"); shared `widgets/form/inputs/fileRegistration.js`
  `registerNewFile(kind)`: *Upload and register a new file*, *Register an external resource (URL)*, *Upload a
  tile stack* (a progress dialog with Cancel; the duplicates question; HInputFile's dialogs moved there).
  - No separate "Register IIIF resource": the server recognises IIIF manifests and image services from the URL
    (`FileUrlInspector`), the URL dialog says so. A separate *Upload a tile stack* button: a zip is ambiguous
    (an archive or tiles), so the user says it (the registration sends DT_REGISTERED_FILE_TYPE `tiled`).
- **URL inputs** (`HInputText` `inputType: 'url'`) have an icon after the input that opens an http(s) address.
- **Record manager with a filter form:** the list's own search box is hidden.
- **Preview of a file below the editor form** (HRecordEditor option `preview`): the media item of Record View
  (`buildFileMediaItem`: thumbnail or player, OSD / Mirador / Download / new tab), the same for local and
  external files; the replace-mode HInputFile shows no thumbnail of its own.
- **YouTube / Vimeo / SoundCloud players (2026-10-28, plan 21 §11 leftover):** native audio / video elements can not
  play these pages. `buildFileMediaItem` shows the thumbnail with a play mark; a click puts the service's player
  (iframe, autoplay) in the expanded item, *Hide player* removes it (stops playing). The HInputFile preview opens
  the player at once (`play: true`). No Mirador link for them. Player URLs: `shared/src/utils/mediaEmbed.js`
  (`embedService` / `embedUrl`, port of legacy `getPlayerURL`; moved from `mediaTag.js`, which re-exports it):
  YouTube watch / youtu.be / shorts / live / embed / nocookie, Vimeo with channel paths and the unlisted hash
  (`?h=`) without the legacy oEmbed call, SoundCloud by URL or MIME type.
- Tests: `shared/test/recordManager.test.js` (2), `shared/test/fileEditor.test.js` (3); all 1366 client tests pass.
- **Review (Artem, 2026-10-24):** the file editor hides the empty west pane (`structurePane: false` now hides the
  HCardinalLayout west region, which is shown by default); in `manager` mode a file added by an Add button (Upload,
  URL, Tile stack) is opened in the file editor at once (select modes: the new file is the selection and the
  manager closes, as before); Record summary → Private: the Add buttons are `fa-circle-plus` icon buttons on the
  right, beside "Not bookmarked" / "No reminders", or in the Reminders heading when there are reminders.

### 10.13 Phase 4d: users and groups, entity images (Artem, 2026-10-23; not committed)

**Mapping of `sysUGrps`** (decisions 2026-10-23):

| Column | User (RT 2-1107) | Group (RT 2-1108) |
|---|---|---|
| ugr_Name | DT_LOGIN_NAME (new, required, unique) | DT_NAME (required, unique among users and groups); the title |
| ugr_FirstName / ugr_LastName | DT_GIVEN_NAMES / DT_NAME | – |
| ugr_LongName | – | DT_SHORT_SUMMARY |
| ugr_Description | – | DT_EXTENDED_DESCRIPTION |
| ugr_eMail | DT_EMAIL (required, unique, checked) | placeholder (legacy) |
| ugr_Password | DT_PASSWORD (new; written only, legacy `hash_it`; empty = unchanged) | placeholder |
| ugr_Enabled | DT_ACCOUNT_STATUS (new, vocabulary TRM_ACCOUNT_STATUS: term code = y, n, y_no_add...; administrators only) | – |
| ugr_Organisation | DT_ORGANISATION_NAME (new, text; 2-21 is a pointer) | – |
| ugr_Department | DT_DEPARTMENT (3-1016) | – |
| ugr_City / State / Postcode | DT_ADDRESS (new, one line each) | – |
| ugr_Interests | DT_RESEARCH_INTERESTS (new) | – |
| ugr_URLs | DT_URL (3-1058) | DT_URL |
| ugr_ORCID | DT_ORCID (new, checked) | – |
| ugr_LastLoginTime / LoginCount | DT_LAST_LOGIN / DT_LOGIN_COUNT (new, read only) | – |
| sysUsrGrpLinks | DT_GROUP_MEMBERSHIP reverse (the user's groups) | DT_GROUP_MEMBERSHIP 2-1200 (relmarker, role = relation type, vocabulary 2-10572; plan 24, 2026-10-24) |

Not mapped: ugr_IsModelUser, MinHyperlinkWords, FlagJT, Incoming/TargetEmailAddresses, NavigationTree, Preferences,
usr_ExternalAuthentication (kept as they are). User title: "Ian Johnson (ijohnson)".

- **Constants, not concept codes** (Artem): every field by its DT_* name; the codes of the new ones are filled in
  one place, `srv/System/Users/UserGroupCodes.php` (empty until Artem gives them: the field is left out). The same
  table gives the client its `dbconst` (snapshot format 7); `systemEntities.js` rows name their field by `constant`.
- **Server** (heurist): `srv/System/Users/` and `srv/System/Groups/` (mapping, output, write service, READMEs);
  `srv/Users/LegacyUserGroupTable`, `GroupMembershipTable`, `UserGroupRepository::rows/members/taken` (the
  boundary test now lets the folder `Users/` name sysUGrps / sysUsrGrpLinks); `EntityRecordMapping::fieldLocalId`
  hook. Legacy rules ported: only administrators add users; a user changes only their own account; only user 2
  changes user 2; any user adds a group and is its admin; the admins of a group and the database owner change it;
  a group keeps an admin. **Legacy code as closures** (ServiceFactory, as the reminder mailer): the password hash,
  the approval / new-user e-mails, and **delete** (DbSysUsers / DbSysGroups `delete()`, with their checks and
  clean-up of temporary records, links, filters, tags).
- **Members** also as `POST /sys/group/{id}/members` `{add, role} | {remove}` and the output keyword `members`
  (`details.members` [{id, role}]), so groups can be managed before the Admins / Members fields have codes. The
  keyword `role` (the current user's role) stays (UserGroupManager).
- **Entity images** (agreed: legacy folders behind one class): `srv/Files/EntityImageStorage` (entity/sysUsers,
  entity/sysGroups; `<id>.<ext>` + `thumbnail/<id>.png`), `System/Entity/EntityImageService`,
  `GET | PUT | DELETE /sys/{user|group}/{id}/image` (PUT: a chunked-upload token; GET: the legacy fileGet URLs).
  Later, with the switch, an image becomes a registered file.
- Not in 4d: self-registration, import of users from another database, transfer of ownership (stay legacy).
- **Client:** `UserGroupClient` (get / save / remove, `setMembers` (admins first, then members, then removals),
  image); `recordDomains` RT_SYS_USER / RT_SYS_GROUP to `/sys/user`, `/sys/group`; HInputText / HEditField
  `inputType: 'password'`; **HInputFile entity-image mode** `entityImage: {client, id}` (changed at once).
  Explorer `ui/ExplorerUserGroupManager.js`: "Manage users" / "Manage groups" in the gear menu and the
  Configuration dialog (record manager in manager mode, Add new user (administrators) / group; editor dialog with
  the password repeat, the status read only on the own account, Admins / Members as lists of the users, the
  image); after a change `UserGroupManager.load()` runs again.
- **Answers:** (e) every user / group picker reads the one HDbDefs overlay of `UserGroupManager`; the labels are now
  the record titles ("Name (login)"). (f) the overlay loads at start-up, after tags change, and now after a change
  in the user / group managers; the server checks rights on every request, so a stale list only affects choices.
- **Tests:** heurist `tests/SystemUserGroupTest.php` (21 read-only, 44 with `--write`, 5 skipped until the codes
  exist), `SystemQueryTest` (user section in the record format), `SystemTagTest` (the read-only check moved to
  filters); client `shared/test/userGroups.test.js` (5), `apps/explorer/test/explorerUserGroupManager.test.js` (2);
  all 1373 client tests pass. Not checked in a browser.
- **Membership (2026-10-24, plan 24):** the members are the relmarker 2-1200 "User Group Membership" (hidden in
  the structure); DT_GROUP_ADMINS / DT_GROUP_MEMBERS are dropped. The group form and the user form (its groups) edit
  it in the relations mode of the record manager, written at once by the members action.
- **User field codes (Artem, 2026-10-24)**, in `UserGroupCodes.php`:

  | Column | Constant | Code |
  |---|---|---|
  | ugr_Name | DT_LOGIN_NAME | 2-1194 (new) |
  | ugr_Password | DT_PASSWORD | 2-1195 (new) |
  | ugr_Interests | DT_RESEARCH_INTERESTS | 2-1196 (new) |
  | ugr_City / State / Postcode | DT_ADDRESS | 2-1197 (new) |
  | ugr_Organisation | DT_ORGANISATION_NAME | 2-1198 (new) |
  | ugr_Enabled | DT_ACCOUNT_STATUS, vocabulary TRM_ACCOUNT_STATUS | 2-1199 (new), 2-10566 |
  | ugr_LastLoginTime | DT_LAST_LOGIN | 2-9 (core "Date") |
  | ugr_LoginCount | DT_LOGIN_COUNT | 2-1189 (core "Usage count") |
  | ugr_ORCID | DT_ORCID | 2-37 (core "Unique public identifier") |

  The new fields and the vocabulary are not yet in `osmak_mapping` (checked 2026-10-24): until they are imported
  they are left out, and the write part of `SystemUserGroupTest.php` (a new user needs the login name) is skipped.
  The status terms are matched by term code (`y`, `n`, `y_no_add`, `y_no_delete`, `y_no_add_delete`), else label.

