# Record editing — development plan

Status: **agreed 2026-10-12 (review rounds 1–2, §Agreed decisions, §8). Implemented 2026-10-12, nothing
committed, nothing checked in a browser:
Phase 1 (server, heurist repo: `srv/Records/Edit/`, `RecordEditController`, `api.php` routes, GET additions,
OpenAPI; `tests/RecordEditApiTest.php` 65 checks with `--write`), Phase 2 (client base: `RecordEditClient`,
edit structure, `HRecordEditor` + `HRecordField`, new inputs) and Phase 3 (special fields, Explorer
`RecordEditorHost`, edit pens of system record types without the legacy host; `npm test` 1087).
Next: Phase 4 (Records manager).** §9 lists where the implementation differs from the plan.

## Context

The Web CMS editor and the publication work need a new record editor and manager first.

**Scope now:** system records only, meaning Query Sources, Map Documents, Map Layers and their
sources, Custom Reports, Report Schedules, and websites and web pages.

**Later:** the same API and editor will also serve ordinary user records.

**Current state:**
- srv/ has no write path. `DatabaseInterface` only reads.
- Every save goes through legacy `hserv/records/edit/recordModify.php` (`recordSave`, `recordAdd`,
  `recordDelete`, `recordDuplicate`). It is reached in one of two ways:
  - from the host record editor (`HostAdapter.editRecord/addRecord`);
  - from `hserv/report/ReportRecordWriter.php`, which `srv/Reports` uses.
- Reading already uses srv: `/records`, `/records/querysource/{id}`, `/map/{kind}/{id}` and
  `/reports`. These presentation services stay as they are, because the modules depend on them.
  This plan only replaces writing and editing.

## Agreed decisions (2026-10-12)

- **Storage:** system records stay in `Records`/`recDetails`. All write SQL goes through one store
  class that is given the table names. This is the same idea as
  `srv/System/Query/SystemEntitySchemaRegistry`. A later move to `sysRecords`/`sysDetails` then
  changes only the store and the registry.
- **Writable record types:** only these, as a hardcoded list:
  - RT_CUSTOM_REPORT, RT_REPORT_SCHEDULE
  - RT_MAP_DOCUMENT, RT_MAP_LAYER
  - RT_KML_SOURCE, RT_FILE_SOURCE, RT_SHP_SOURCE, RT_IMAGE_SOURCE, RT_TILED_IMAGE_SOURCE
  - RT_QUERY_SOURCE
  - RT_CMS_HOME, RT_CMS_PAGE

  Writes to any other type return 403. The list exists twice: on the server (`SystemCode`) and
  in shared JS.
- **Editor routing:** HRecordEditor is used only for the listed types. Ordinary records, for
  example from HRecordList in Data, still open the host's `editRecord`. The new save does not
  yet handle title masks, calculated fields and similar features.
- **Title:** `rec_Title` is the first value of DT_NAME. Without one, it is `Record #NNN`.
- **Not in this phase:** TitleMask, calculated fields, the ElasticSearch index, the HTML output
  cache and workflow emails.
- **Defaults:** a new record is owned by the current user and has visibility `viewable`. User
  preferences and `sys_NewRec*` are not used.
- **Max values:** going over `rst_MaxValues` is a warning, not an error.
- **Per-value visibility** (`dtl_HideFromPublic`) is part of the format (§1).
- **Multilingual values** are supported for a hardcoded list of fields (§1, §6).
- **Insert or update** is decided by the HTTP method and `rec_ID`. There is no `/records/new`.
- **No `/records/{id}/references` endpoint.** `DELETE` without force returns the incoming references, and
  the client can use the existing `linkedfrom:`/`related:` queries.
- **Validator:** `RecordValidator` is generic. It will also be used by batch actions and database
  validation.
- **File upload API:** later. The editor picks existing files only.
- **Symbol editor and thematic map editor:** no native editor now; that is the next plan. Until
  then, symbology fields call the `editSymbology` bridge.
- **Special fields:** they show a readable value with two actions, *Show raw* and *Edit* (§6).
- **Constant rename (done 2026-10-12, heurist repo, not committed).** `RT_CMS_MENU` is now
  `RT_CMS_PAGE` in all PHP and JS code: hserv, hclient CMS/HMenu widgets, srv `ServiceFactory`
  and the Smarty assembler, and viewers.
  - `RT_CMS_MENU` stays as a deprecated alias, so custom website scripts keep working:
    - in `consts.php`, with the same value, so `dbconst` has both names;
    - as the website JS globals `window.hWin.RT_CMS_MENU` and `RT_CMS_MENU` in
      `websiteScriptAndStyles.php`.
  - The DeepWiki HTML docs are not changed.

## 1. Format contract — input = output

The request body is the same record object that `GET /records/{id}?fields=_all` returns
(`srv/Records/Data/_README.md`). A bare record or `{records:[record]}` is accepted.

```json
{
  "rec_ID": "0",
  "rec_RecTypeID": "55",
  "rec_OwnerUGrpID": "2",
  "rec_NonOwnerVisibility": "viewable",
  "rec_NonOwnerVisibilityGroups": [],
  "rec_EditGroups": [],
  "rec_URL": "",
  "rec_ScratchPad": "",
  "rec_Modified": "2026-10-12 10:00:00",
  "details": {
    "1":   ["Main map", "fre:Carte principale"],
    "4":   [{"value": "Internal note", "hidden": true}],
    "999": ["123"]
  }
}
```

**Headers**
- `rec_Title`, `rec_Added`, `rec_AddedByUGrpID` and `rec_Hash` are read-only. They are ignored on
  input.
- `rec_Modified` is the concurrency token. If it differs from the database, the update returns
  409, unless `force=1`.

**Detail values**
- Detail keys are plain dty ids, and every value list is an array. Values come in two forms:
  - **Compact:** the term id, record id, `ulf_ID`, a date string or temporal JSON, or text.
  - **Resolved object:** the form returned with `resolveDetails`. The value is taken from
    `value`, `trm_ID`, `rec_ID` or `ulf_ID`.
- Geo values are `{geo:{type, wkt}}`.
- **Per-value visibility:** `{value, hidden:true}` stores `dtl_HideFromPublic=1`.
  - GET returns this object form only for hidden values, and only to users who can edit the
    record.
  - All other values stay compact.
- **Multilingual values:** stored as repeated values with a language prefix, `xx:text`, as in
  legacy, e.g. `"fre:Carte"`. They are allowed only for DT_NAME, DT_SHORT_SUMMARY and
  DT_EXTENDED_DESCRIPTION. The validator checks the language code.

**GET additions:** when the user can edit the record, `GET /records` also returns
`rec_EditGroups`, `rec_NonOwnerVisibilityGroups` and `rec_FlagTemporary`, so that a record
survives a load-save round trip unchanged.

**Differences from the legacy `recordSave` input:**

| Legacy | New |
|---|---|
| `ID`, `RecTypeID`, `OwnerUGrpID` ... (no prefix) | `rec_ID`, `rec_RecTypeID`, `rec_OwnerUGrpID` ... |
| `details: {"t:1": ...}` | `details: {"1": [...]}` |
| `OwnerUGrpID: "2,5,7"` (owner plus edit groups) | `rec_OwnerUGrpID` + `rec_EditGroups` |
| `NonOwnerVisibilityGroups` | `rec_NonOwnerVisibilityGroups` (array) |
| `details_visibility[dty][i]` | `{value, hidden:true}` in the value |
| `details_encoded` 1/2/3 | none (JSON body) |
| `no_validation` | none; batch and import will set validation options in code |

**PUT vs PATCH**
- **PUT** replaces the whole record. A detail that is missing from the body is removed.
- **PATCH** changes only the details listed. `"dty": []` clears that field. Headers that are
  missing are kept.

## 2. API

Routes are added in `hserv/controller/api.php`. Requests are handled by a new
`Heurist\Controller\RecordEditController::handleRequest($method, $segments, $params, $json)`,
following the pattern of `ReportController` and `JobController`. Today, any verb other than GET on
`/records/{id}` returns 405; that branch is where the new verbs go.

| Method | Path | Action |
|---|---|---|
| POST | `/records/{id}` | Insert. `id` = 0: new id from the counter. `id` < 0: that id (import). `id` > 0: 400. |
| PUT | `/records/{id}` | Update, full replace |
| PATCH | `/records/{id}` | Update, listed fields only |
| DELETE | `/records/{id}[?force=1]` | Delete (§5) |
| POST | `/records/{id}/duplicate` | Duplicate |
| POST | `/records/{id}/validate` | Dry run of an insert (`id` ≤ 0) or an update. The body is the record. Returns the issues without saving. |

`POST /records` without an id stays the search contract. A search body cannot be told apart from a
record body safely.

**Responses**
- **Success:** the same envelope as `GET /records/{id}`, containing the saved record, plus
  `meta.issues` (warnings).
- **Validation failure:** 422.

```json
{"status": "error", "error": "validation", "message": "...",
 "errors": [{"field": "rec_OwnerUGrpID" | "<dty>", "index": 0,
             "code": "required|type|vocabulary|pointer|max|language|permission",
             "severity": "error|warning", "message": "..."}]}
```

**Status codes:** 401 not logged in, 403 permission denied or type not writable, 404 no record,
409 `rec_Modified` conflict or incoming references on delete.

**Authentication:** session or JWT, the same as other srv endpoints.

**CSRF protection (agreed 2026-10-12).** With a cookie session, a page on another site could try
to send a write request that carries the user's `heurist-sessionid` cookie. JWT requests are not
affected. Three rules protect against this; no CSRF token is needed:
- The session cookie is already `SameSite=Strict` (`USystem::sessionUpdateCookies`). Browsers do
  not send it with requests from other sites.
- POST, PUT and PATCH must have `Content-Type: application/json`, otherwise 415. An HTML form cannot
  send JSON, and a script on another site cannot send it without a CORS preflight, which the
  server does not allow.
- DELETE must be a real DELETE request, or a POST with the `X-HTTP-Method: DELETE` header. Both
  need a preflight from another site.
- The `?method=` request parameter is ignored on the record write routes. Today `api.php` accepts
  `$_REQUEST['method']`, so a plain link such as `GET ...?method=DELETE` would otherwise count as
  a delete.
- If an `Origin` header is present, it must match the server's host, otherwise 403.

**PATCH in `api.php` (agreed 2026-10-12).** At present `api.php` turns PATCH (and
`X-HTTP-Method: PATCH`) into PUT before routing. The change:
- Keep the real verb in a new variable `$http_verb`, either PATCH or PUT.
- Pass `$http_verb` to `RecordEditController`.
- The existing `$http_method` stays normalised (PATCH → PUT) for the other resources, so
  `/reports` and the rest behave as before.

PATCH is not a separate workflow. `RecordSaveService::update($record, $mode)` takes `replace`
(PUT) or `patch` (PATCH), and the only difference is the first step:
- **patch:** load the stored details and replace only the fields given in the body;
- **replace:** take the body as the complete record.

After that both use the same steps: the validator runs on the complete merged record (so
required fields are still checked), then the workflow stage, the store (delete and insert the
details) and the title.

## 3. Server design — `srv/Records/Edit/`

| Class | Role |
|---|---|
| `Database\WritableDatabaseInterface` | `execute`, `lastInsertId`, `begin`/`commit`/`rollback`; implemented by `MysqlDatabase`. Sets `@logged_in_user_id`, which the `sysArchive` triggers need. |
| `RecordStore` | All INSERT/UPDATE/DELETE on Records, recDetails and usrRecPermissions. Takes table names, ready for sysRecords. |
| `RecordPermissionService` | Ports `userCheckPermissions` (`ugr_Enabled`), the `recordAdd` rules and `recordCanChangeOwnerwhipAndAccess`. public → pending if `sys_SetPublicToPendingOnEdit`. RT_CMS_PAGE is forced to owner 1 and public. |
| `RecordValidator` | Generic; see below |
| `RecordSaveService` | Insert and update: whitelist, permissions, validator, workflow stage, store, title |
| `RecordDeleteService` | Delete with references check and force |
| `RecordDuplicateService` | Duplicate |
| `WritableRecordTypes` | The hardcoded whitelist (resolved through `SystemCode`) |

**Changes elsewhere in srv**
- `RuntimeContext` gets `adminGroupIds` (the groups this user administers) and the user's
  `ugr_Enabled`.
- `DefinitionLookup` gets `structureRows(rty)`, loaded lazily. Each row holds the field type,
  requirement (required/recommended/optional/forbidden), max values, default value, pointer
  constraint and vocabulary.

**`RecordValidator`.** It knows nothing about HTTP, the whitelist or the current user.
- **Input:**
  - a record in the new format;
  - a mode: `insert`, `update` or `patch`;
  - options, for future batch and import use: skip pointer checks, skip vocabulary checks.
- **Output:** the normalised details (ready for the store) and a list of issues
  `{field, index, code, severity, message}`.
- **Checks:**
  1. The rectype exists.
  2. Every dty is in the structure and is not forbidden.
  3. Required fields have a value. If a required field is missing and has a default, the default
     is used.
  4. Max values: a warning when exceeded.
  5. Per-type checks, ported from legacy `_prepareDetails`:
     - **freetext / blocktext:** trim; strip scripts; freetext keeps only a few tag attributes.
     - **date:** converted with `srv/Utilities/Temporal`.
     - **integer / float / year / boolean:** format checks; boolean values become `true`/`false`.
     - **enum / relationtype:** the term is in the field's vocabulary.
     - **resource:** the target record exists and its type matches the pointer constraint.
     - **file:** the `ulf_ID` exists.
     - **geo:** the WKT parses with `ST_GeomFromText`.
     - **separator / relmarker:** ignored.
  6. A language prefix appears only on the multilingual fields, and the code is valid.

**`RecordSaveService`**
- **Insert:**
  - Owner is the current user and visibility `viewable` unless the body sets them.
  - `rec_Added`, `rec_Modified` and `rec_AddedByUGrpID` are set by the service.
- **Update:**
  - Concurrency check on `rec_Modified`.
  - The header is updated.
  - Details are deleted and inserted again, as in legacy, so that the `recLinks`,
    `recDetailsDateIndex` and archive triggers stay correct.
- **Edit and visibility groups** are written to `usrRecPermissions`.
- **Workflow stage:** `recordWorkFlowStage` is ported (`sysWorkflowRules`: allowed stages,
  ownership, visibility) without emails.
- **Title:** taken from DT_NAME, with the `Record #NNN` fallback.
- **Transactions:** the whole save is one transaction.
- **Parent/child reverse pointers:** not ported, because none of the listed types uses child
  records (Artem, 2026-10-12).

**OpenAPI** (`documentation/api/heurist-openapi.yaml`)
- Add POST/PUT/PATCH/DELETE on `/{database}/records/{recordId}`, plus `/duplicate` and
  `/validate`.
- New schemas: `RecordInput` and `RecordValidationError`.
- Also add the `/reports` paths, which are missing from the spec.

**Test:** `tests/RecordEditApiTest.php --db=osmak_mapping --user=2 --write`. It covers insert,
negative id, PUT, PATCH, validation errors, the 409 conflict, delete with and without force, and
duplicate. It cleans up after itself.

**Later:** move `hserv/report/ReportRecordWriter` and the Reports setup to `RecordSaveService`.

## 4. Delete and duplicate

**Delete without force**
- Incoming references are read from `recLinks`.
- If there are any, the response is 409 with `{references:[{rec_ID, rec_RecTypeID, rec_Title, dty}]}`,
  and nothing is deleted.

**Delete with force**
- Pointer details in the source records are removed.
- Relationship records in which this record is source or target are deleted.
- Child records are not handled, because none of the listed types uses them.
- Rows are removed from `usrRecPermissions`, `usrBookmarks`, `usrRecTagLinks`, `usrReminders`,
  `recForwarding` and `recThreadedComments`.
- All of this happens in one transaction.

**Duplicate**
- The header, details and edit/visibility groups are copied.
- The copy is owned by the current user.
- The title becomes `Copy of <title>`, and DT_NAME is changed to match.
- Relationship records are not copied.

## 5. Things to keep in mind

The answer to "did I miss something" is this list:

- **Concurrency:** `rec_Modified` and 409.
- **Relationships:** relmarker relationships are separate records. A new record must be saved
  before relationships can be added. The editor creates the record on first save instead of using
  the legacy temporary record.
- **Archive triggers:** `@logged_in_user_id` must be set on the connection, or `sysArchive` gets
  no user.
- **Client caches after a save:** `QuerySourceProvider`, `MapDocumentListProvider` and
  `ReportTemplateProvider` must refresh. Explorer needs a "records changed" event through
  `SyncEngine`, so that open modules reload.
- **Legacy editor:** it still saves through `record_edit.php` for other types. Both paths write
  the same tables, so this is safe.
- **Batch save and import:** not covered. The validator is ready for them.
- **Files:** there is no upload yet; the editor picks existing files only.

## 6. Client design

**`shared/src/data/RecordEditClient.js`**
- Methods: `load(id)`, `insert(record)`, `update(record)`, `patch(id, details)`, `remove(id,
  {force})`, `duplicate(id)` and `validate(record)`.
- Errors are returned as the 422 issue list.

**Edit structure**
- `shared/src/recordview/RecordStructureProvider.js` is extended. The `/rst/{rty}` request
  additionally asks for `rst_MaxValues`, `rst_PtrFilteredIDs`, `rst_FilteredJsonTermIDTree`
  (vocabulary) and `rst_DisplayWidth`. It is loaded lazily per record type.
- The provider builds the editor JSON on the same groups/children idea as the HFilterForm layout
  (doc 05):

```json
{"rty": 55, "groups": [
  {"type": "tabs|accordion|group", "label": "...", "help": "...", "children": [
    {"dty": 1, "type": "freetext", "label": "...", "help": "...", "req": "required",
     "max": 1, "default": "", "vocabulary": null, "targetTypes": [], "multilang": true,
     "special": null}]}]}
```

  A separator's `rst_DefaultValue` gives the group type. Fields before the first separator go in
  a default group.

**`shared/src/widgets/record-editor/HRecordEditor.js`** (extends `HBaseWidget`, with its own CSS)
- `attach(container, {record, structure, dbdefs, apiClient, specialEditors, onSaved, onClose})`
- Methods: `getRecord()`, `validate()`, `isDirty()` and `save()`.
- **Header pane:** owner, visibility, visibility groups and edit groups, using
  `UserGroupSource`.
- **Groups** are rendered as tabs, accordion or fieldset, according to the separator.
- **Errors and warnings** from the server are shown beside the field (`field`, `index`).

**Inputs.** The existing `createHInput` covers text, numeric, enum and date. New inputs:
- `HInputRepeat`: a wrapper for repeatable fields, with add, remove and reorder.
- `HInputResource`: `RecordTitleSource` plus `HValuePicker`, limited to the target types.
- `HInputBoolean`.
- `HInputFile`: picks an existing file.
- `HInputGeo` edit mode: a host callback opens Map in draw mode, as `selectFilterExtent` does
  now.

**Multilingual fields** (DT_NAME, DT_SHORT_SUMMARY, DT_EXTENDED_DESCRIPTION)
- `HInputText` shows a **Translate** button in place of the "add value" button.
- The button opens a small popup with a language selector and a value input.
- Translations are listed as language chips under the main value. A click edits a translation,
  and × removes it.
- **Next phase:** a DeepL translate button in the popup.

**Special fields**
- **Readable value:**

  | Field | Shown as |
  |---|---|
  | query | the query in words, from the existing describer |
  | expansion rules | `describeExpansionRule` |
  | filter form | a summary |
  | report template | template name and size |
  | symbology | a short summary |
  | extent | the coordinates |

- **Actions:**
  - **Show raw** toggles a textarea with the JSON or raw value. The text is editable, and on
    blur it is checked: JSON parse plus validation.
  - **Edit** opens the special editor.
- **Special editors** are given by the host app in `specialEditors`, keyed by concept code.
  Shared code cannot import apps.

  | Field | Editor |
  |---|---|
  | DT_QUERY_STRING | `HFilterBuilder` |
  | filter form | `HFilterFormDesigner` |
  | DT_EXPANSION_RULES | `HRuleBuilder` |
  | report template | `HSmartyEditor` |
  | symbology | `editSymbology` bridge (native editor in the next plan) |
  | extent | `editExtent` |

**Routing**
- `HostAdapter.editRecord/addRecord` checks the record type against the whitelist:
  - **listed type:** Explorer opens `HRecordEditor` in a dialog;
  - **other type:** the host editor, as now.
- Iframe modules send these calls through `IframeModuleAdapter`.
- **Switch-over:**
  - `ExplorerApplication.editQuerySource`
  - map document and layer editing in `MapApplication`
  - the report metadata forms in `apps/reports` (`ReportApi`)

## 7. Phases

1. **Server:** format, `RecordValidator`, save (POST/PUT/PATCH), delete, duplicate, validate,
   the GET additions (edit groups, hidden values), OpenAPI, `RecordEditApiTest`.
2. **Client base:**
   - `RecordEditClient` and the edit structure;
   - `HRecordEditor` with header pane, groups, the basic inputs and `HInputRepeat`;
   - `HInputResource`, `HInputBoolean`, `HInputFile`;
   - multilingual Translate popup.
3. **Special fields and switch-over:**
   - special fields (readable value, Show raw, Edit) and `specialEditors`;
   - QS, Map document/layer/sources and Reports switched to the new editor;
   - "records changed" event.
4. **Records manager:** an Explorer tool (lazy chunk) built from HRecordList (through
   `apps/data/src/direct.js`), a filter form using the built-in QS (owner/group, type) and
   HRecordEditor. It is used first for websites and pages. Whether the current QS and Reports
   lists move into it is decided then.
5. **Next plans and later work:**
   - symbol editor and thematic map editor (next plan);
   - **DeepL translation** in the Translate popup;
   - file upload API;
   - TitleMask, calculated fields, ES index, HTML cache and workflow emails;
   - ordinary user records;
   - `sysRecords`/`sysDetails` tables.

## 8. Open points

None at the moment. Resolved on 2026-10-12:
- **CSRF:** handled by SameSite=Strict, the JSON content type and the Origin check (§2).
- **Child records:** none of the listed types uses them.
- **Websites:** RT_CMS_HOME (website) and RT_CMS_PAGE (menu item or page) are the only two CMS
  types.

## 9. Implementation notes

### Phase 1 — server (2026-10-12)

Where the server implementation differs from or adds to the plan:

- **Files:** `srv/Records/Edit/` (`RecordInput`, `RecordValidator` + `ValidationResult`,
  `RecordPermissionService`, `RecordSaveService`, `RecordDeleteService`, `RecordDuplicateService`,
  `RecordStore`, `RecordTitle`, `WritableRecordTypes`, `RecordEditException`, `_README.md`),
  `srv/Controller/RecordEditController.php`, `srv/Database/WritableDatabaseInterface.php`
  (implemented by `AbstractDatabase`), `ServiceFactory::recordEditController()`.
- **`LanguageCodes`** moved from `srv/Reports/Smarty/` to `srv/Utilities/`, because the validator
  and the title use it too. The Smarty engine still gives the same output (`ReportEngineCompareTest`).
- **`RuntimeContext`** has `adminGroupIds`, the groups the user administers (legacy
  `getUserGroupIds('admin')`). `ugr_Enabled` is read by `RecordPermissionService`, not stored in
  the context.
- **`api.php`:**
  - `$http_verb` is the real verb. It honours `X-HTTP-Method` on POST and ignores `?method=`.
  - A non-GET request to `/records/{id}` (numeric, may be 0 or negative) goes to the new
    controller; `$method` is set to `save`, so the request must be authenticated.
  - An OPTIONS preflight gets 405, so scripts on other sites cannot send the JSON writes.
- **`POST /records/{id}/duplicate` also needs `Content-Type: application/json`** (the body may be
  empty). Otherwise a form on another site could send it.
- **`POST /records/{id}/validate`:**
  - id ≤ 0 is checked as an insert, id > 0 as a PUT.
  - Errors give 422, as a save does.
  - Success gives `{valid: true, issues: [warnings]}`.
- **The record type of a stored record cannot be changed** (400). Legacy allowed it.
- **Guest users have no special rights** in the new API. Legacy let guests add records and edit
  any record.
- **Fields not in the record structure** get a warning, and their values are kept (GET returns
  them, so the round trip must not fail). **Forbidden fields:**
  - a value in the body is an error;
  - stored values stay on PUT and PATCH (`RecordStore::replaceDetails(..., $keepFieldIds)`).
- **Dates** that `Temporal` cannot read are stored as given, with a `date` warning (legacy
  behaviour, now reported).
- **Enum values** may be a term id or a term label of the field vocabulary (label → id), as in
  legacy.
- **Text** cleaning is the legacy rule: scripts are removed, and freetext keeps only the
  src/class/style/href attributes. The legacy expression leaves a space (`<b onclick="..">` →
  `<b >`).
- **Website page content** (RT_CMS_PAGE / DT_EXTENDED_DESCRIPTION):
  - It is split into parts over 64 KB on save, as legacy does.
  - `RecordDataService` joins the parts into one value on read, for every caller of `/records`
    (legacy recordSearch did the same).
  - On a page this field is not multilingual; it is the page content.
- **GET additions** apply only to `fields=_all` and only to records the user may change:
  - `rec_EditGroups`, `rec_NonOwnerVisibilityGroups` and `rec_FlagTemporary`;
  - hidden values as `{value, hidden:true}` (also `{geo, hidden}`). The record view formatter
    already reads `value` from objects.
- **Edit and view groups:**
  - The owner is removed from `rec_EditGroups`.
  - PUT without the groups clears them; PATCH keeps them.
  - A visibility other than `viewable` clears the view groups. Legacy could not clear view groups.
- **Workflow stage:**
  - The rule's owner and visibility apply when the stage changes and the user is allowed to set it.
  - A refused stage keeps the stored stage and gives a `workflow` warning.
  - The legacy `TRM_SWF_ADDED` default for saving a temporary record is not ported, because the
    new editor does not use temporary records.
- **Delete without force** is refused when other records point to the record, or when it is the
  source or target of a relationship. With force, the relationship records are deleted too.
- **Duplicate:**
  - The user must be able to see the source record.
  - The copy is not temporary (legacy marked it temporary).
  - Only name values without a language prefix get "Copy of ".
- **Title:** the first DT_NAME value without a language prefix, with HTML removed, cut to 1023
  characters. For example, a Query Source that legacy titled `Events (params) [ q = ...]` is now
  titled `Events (params)`.
- **OpenAPI** (`documentation/api/heurist-openapi.yaml`):
  - The title is now "Heurist API".
  - New tags: Record editing and Reports.
  - New paths: POST/PUT/PATCH/DELETE on `/records/{recordId}`, `/duplicate`, `/validate`, and
    the 13 `/reports` paths that were missing.
  - New schemas: `RecordInput`, `RecordIssue`, `RecordEditError`, `RecordReferences`,
    `RecordDeleteResponse`, `ReportResponse` and `ApiError`; `meta.issues` was added to
    `RecordItemMeta`.
- **Test database:** two early test runs inserted records with the id max+1000, so the
  `Records` AUTO_INCREMENT of `osmak_mapping` jumped by about 2000. This is harmless; the test now
  uses a free id below the maximum.

### Phase 2 — client base (2026-10-12)

New files in `shared/src`:

| File | Content |
|---|---|
| `data/RecordEditClient.js` | `load`, `insert`, `update` (PUT), `patch`, `remove`, `duplicate`, `validate`; failures are `RecordEditError` (`isValidation`, `isConflict`, `hasReferences`, `issues`, `references`, `recModified`) |
| `data/recordEditStructure.js` | `buildEditStructure(rows)` → `{rty, groups:[{type, label, help, children:[field]}]}`; `RecordStructureProvider.editStructure(rty)` loads the `/rst` edit columns once per record type |
| `data/recordEditValues.js` | loaded record → editor values (translations split off by language prefix) → request body |
| `data/writableRecordTypes.js` | the writable list and the multilingual fields, from `dbconst` |
| `widgets/record-editor/HRecordEditor.js` | the editor (ownership pane, groups, Save / Save and close / Close, issues, conflict question) |
| `widgets/record-editor/HRecordField.js` | one field: value inputs, add/remove, hidden switch, translations |
| `widgets/form/inputs/HInputBoolean.js`, `HInputResource.js`, `HInputFile.js` | new inputs, registered in `createHInput` |

Where the implementation differs from §6:

- **No `HInputRepeat`.** One per-field widget, `HRecordField`, holds the repeated values, the hidden
  switch per value and the translations. `HInputText` is unchanged; the Translate button belongs
  to `HRecordField`.
- **Repeatable fields** (max values 0 or more than 1) have an add button, which disappears at
  `rst_MaxValues`. A multilingual field has one main value and a Translate button instead.
- **Translations:** the popup offers the database languages (`HDbDefs.languages()`, or a host
  list), else a default list (ENG, FRE, GER, ...). On the client, a language prefix is 3 letters,
  `*`, or a common 2-letter code, so values like "Re: ..." stay plain text.
- **Hidden from the public:** a switch beside each value (● visible, ◌ hidden).
- **HInputFile** shows the file name, links to it when the host gives `fileUrl`, and takes the id
  of an uploaded file. Upload and file browsing come with the file API.
- **HInputResource** picks one record by title from the target types
  (`RecordTitleSource`, which now accepts several types and pre-set titles). The titles of
  stored values come from the resolved record (`load()` asks for `resolveDetails=1`).
- **Geo fields** use the existing `HInputGeo`: map extent only, through the host's
  `selectExtent`. Drawing a geometry is Phase 3, as a special editor.
- **Date fields** are text plus calendar (`allowLegacyText`). Complex temporal values are shown
  as stored; a temporal editor comes later.
- **Relmarker fields** show a note; relationships are not edited yet.
- **The ownership pane** has the owner (users, groups, or "Everyone"), visibility, "only these
  groups" (for viewable) and "also editable by". A new record is owned by the current user.
- **Body sent on save:**
  - It contains every field of the structure; an empty field is sent as `[]`, so PUT clears it.
  - Values of fields outside the structure are sent back unchanged.
  - `rec_URL`, `rec_ScratchPad` and `rec_Modified` are sent as loaded.
- **The definitions snapshot** (`meta.dbconst`, heurist repo `DefinitionSnapshotService`) now
  also has the writable record types and `DT_NAME`, `DT_SHORT_SUMMARY` and
  `DT_EXTENDED_DESCRIPTION`. Cached snapshots without `RT_CMS_PAGE` are rebuilt.
- **Request tracing:** `HeuristApiClient` no longer traces record writes (`/records/{id}` with a
  method other than GET), so the Stop button cannot abort a save half-way.
- **Localization:** the editor strings are in the Explorer localization files (eng and fre),
  because Explorer will host the editor.
- **Tests:** `shared/test/data/recordEdit.test.js` (12) and `shared/test/recordEditor.test.js` (8).

### Phase 3 — special fields and switch-over (2026-10-12)

- **Explorer as editor host** (`apps/explorer/src/core/RecordEditorHost.js`, used by
  `ExplorerApplication.editRecord/addRecord/canEditRecordType`):
  - A system record of a logged-in user opens in `HRecordEditor`, in the dialog
    `h-record-editor-dialog`.
  - Other records go to the legacy host editor, as before.
  - When the caller does not give the record type, it is read with
    `GET /records/{id}?fields=rec_RecTypeID`.
  - The result is `{saved, recordId, record}`, the same shape as the legacy editor, so the callers
    reload as before.
- **Edit pens without the legacy host.** The bridge has a new `canEditRecordType(recordType)`
  (an id or a code name such as `RT_MAP_LAYER`). `HostAdapter.supportsEditing(recordType)` uses
  it, and `editRecord(id, {recordType})` passes the type on. Pens and actions now shown for a
  logged-in user:
  - Query Source pens in the Explorer source lists (`canEditRecordType('RT_QUERY_SOURCE')`);
  - Map: edit document, create document and edit layer (the `editing` capability is now
    `supportsEditing('RT_MAP_DOCUMENT')`);
  - Timeline: edit document and layer;
  - Reports: the Properties actions (`canEditRecordType('RT_CUSTOM_REPORT')`).

  Generic record pens (Data list, record popups, Graph, Record view) still need the legacy
  editor. A system record opened from them goes to the new editor when the legacy host is there.
- **Special fields.** `HRecordField` gets a `special` definition `{json, describe, edit}`. The
  field shows a readable value, "Show raw" (the stored text, JSON checked on blur and on save)
  and "Edit". `RecordEditorHost.specialEditors(dbdefs)` defines them:

  | Field | Readable value | Edit |
  |---|---|---|
  | DT_QUERY_STRING | the query in words (`queryDescribe`) | HFilterBuilder |
  | DT_FILTER_FORM | number and labels of the inputs | the same HFilterBuilder; one Apply sets both the query and the form |
  | DT_EXPANSION_RULES | the rule names | HRuleBuilder |
  | DT_TABLE_FIELDS | number of columns | raw only |
  | DT_SYMBOLOGY | colours, icon, thematic maps | legacy host `editSymbology` when there (`persist: false`), else raw only; the native editor is the next plan |

  - The extent (DT_GEO_OBJECT) is a normal geo field with Explorer's map extent picker.
  - Website CSS and scripts are plain text areas.
- **Report templates are not a special field.** The template body is a file (DT_FILE_NAME), and
  the Reports tool keeps its template editor and its own create and update forms
  (`/reports` API). Only the Properties action of the Reports tool opens the record editor.
  Moving those forms to the editor is left for later.
- **Snapshot `dbconst`** (heurist repo) also has DT_QUERY_STRING, DT_EXPANSION_RULES,
  DT_TABLE_FIELDS, DT_FILTER_FORM and DT_SYMBOLOGY.
- **No "records changed" SyncEngine event yet.** A saved Query Source reloads the source lists
  (`ExplorerApplication._recordSaved`), and Map and Timeline reload a saved document or layer
  from the editor result.
- **Legacy wrappers:** no change is needed. A bridge without `canEditRecordType` keeps the old
  answers. This is documented in `docs/integration.md` (Record editing).
- **Tests:**
  - `apps/explorer/test/recordEditorHost.test.js` (5);
  - `shared/test/hostEditing.test.js` (+1);
  - `shared/test/recordEditor.test.js` (+1, special field).

### Query Source editor save with the record API (2026-10-12, after Phase 3)

**Before:** Save as Source and Update Source in the Query Source editor went through the legacy
host bridge (`saveDatasourceAsSource` in `heurist/hclient/modules/explorer/HeuristModuleExplorer.js`,
then `RecordMgr.saveRecord`, then legacy `recordSave`). Two problems:
- Without the legacy host the buttons were hidden.
- An update probably removed every field the editor does not send (summary, creators, licence...),
  because legacy `recordSave` deletes all detail values and inserts only the ones sent. This was
  not tried; it follows from the code.

**Now:** `ExplorerApplication.saveDatasourceAsSource` uses `RecordEditClient`.
- A new source is a POST; an update is a PATCH of the fields the editor owns. The field mapping is
  `apps/explorer/src/core/querySourceRecord.js`, a port of the legacy wrapper function:
  - **Always sent:** name, query and filter form.
  - **Sent when the source has them:** expansion rules and column fields.
  - **Map and timeline settings, always sent:** geo fields, "loaded by extent" and "geo output
    mode" (as the Yes/No terms), minimum and maximum zoom, and timeline fields.
  - A setting the editor has cleared is sent as `[]`, so it is cleared in the record.
  - All other fields of the record stay.
- `canSaveSources()` is now `canEditRecordType('RT_QUERY_SOURCE')`: any logged-in user, without
  the legacy host. The server checks ownership.
- A refused save shows the messages of the invalid fields.
- **Snapshot `dbconst`** also has DT_GEO_FIELDS, DT_TIMELINE_FIELDS, DT_MINIMUM_ZOOM_LEVEL and
  DT_MAXIMUM_ZOOM_LEVEL.
- **Still on the legacy bridge:** the Data module running directly in the legacy host
  (`HeuristDataHostAdapter.saveDatasourceAsSource`). Explorer no longer uses the bridge function.
- **Tests:** `apps/explorer/test/querySourceRecord.test.js` (3); `tests/RecordEditApiTest.php`
  checks that an editor PATCH keeps the summary (68 checks).

