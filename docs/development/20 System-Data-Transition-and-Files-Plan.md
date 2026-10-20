# System data transition, files and API domains — development plan

Status: **strategy agreed 2026-10-18; Phases 1–2 designed and agreed 2026-10-18 (§8). Phases 1–2
implemented 2026-10-18 (§8.2.1, §8.3.1), not committed, not yet checked in a browser. Phase 3 designed, agreed and implemented 2026-10-19 (§9, §9.5), not committed.** Each phase (§7) gets its own planning
session before any code; its detailed design is then added to this file.

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
| 1 | File record type and fields (§3.2 settled); mapping registry; `/files` read (search + get) on both backends; switch flag and migration design | done 2026-10-18 (§8.2.1), not committed |
| 2 | File upload/register/replace/delete on both backends (`LegacyFileStore`, `RecordFileStore` + srv `FileStorage`); migration script; `HInputFile` upload, URL, pick, preview | done 2026-10-18 (§8.3.1) except the migration script; not committed |
| 3 | `/{domain}/aggregate`; move client callers off `detail=` | done 2026-10-19 (§9.5), not committed |
| 4 | `/system` domain; tags read/write there, tag ↔ record links; plan 18 Tags panel | not started |
| 5 | Bookmarks and reminders on `/system`; plan 18 Private panel | not started |
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

