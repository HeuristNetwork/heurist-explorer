# One-to-many relationships: HRecordManager "relations" mode — development plan

**Current state 2026-10-24: DONE** (Artem). Implemented in both repos, three review rounds (§5–§7), checked by Artem.
All client tests pass; heurist `SystemUserGroupTest.php`, `SystemQueryTest`, `DataAccessBoundaryTest` pass.

Plan 22 (HInputRelmarker, one relationship per input) and plan 21 (HRecordManager) are the base.
Plan 20 §10.13 (users and groups) changes: group membership is now the relmarker field 2-1200.

## 1. Request (Artem, 2026-10-24)

1. All fields and record types are synced (2-1194..2-1200, vocabularies 2-10566, 2-10572).
2. Group membership is the relmarker field **2-1200 "User Group Membership"** on the group type (2-1108),
   target users (2-1107), vocabulary 2-10572 (terms `admin`, `member`). It is *forbidden* (hidden) in the
   structure; it will be used as a real field when users and groups move to the records tables.
3. New mode **one-to-many** for repeatable (multi-value) relmarker fields: HRecordManager mode `relations`:
   - a) opens HRecordManager for the target record type;
   - b) shows only the related target records;
   - c) each `article.h-recordlist-item` has a toolset: relationship icon | relation type picker | pen (edit
     relationship) | bin (remove relationship); always visible;
   - d) placement: first in the item (list view); after `h-recordlist-admin` in `h-recordlist-card-top`
     (extended view); a second row below `h-recordlist-card-top` (card and row views);
   - e) a button "Find or Add <target record type>" opens HRecordManager for the target type in `select_multi` mode.
4. Question: write at once, or in a batch on Apply?
5. Ordinary records: relationship records. Users and groups: `sysUsrGrpLinks`.

## 2. Decisions (Artem, 2026-10-24)

| Question | Decision |
|---|---|
| When are changes written (4) | **At once**: adding targets, changing a type and deleting are sent immediately (as plan 22 relmarkers, tags, bookmarks). The manager has only Close. |
| The field in the edit form | The relationships stay listed (read-only boxes, Edit / View on mouse over); the per-value Add is replaced by one button "Manage relationships to <types>". |
| Relation type of new relationships | A relation type picker beside "Find or Add <type>" (first term by default, remembered per field); all picked targets get it; it can be changed per row. |
| Users and groups | Both forms: the group form (its members with the role) and the user form (reverse: the user's groups with the role). |
| Which fields (assumed with the plan) | Every relmarker field with max ≠ 1. Single-value fields keep the plan 22 popup. |
| A target with several relationships of the field | One toolset line per relationship. |

## 3. Design

### 3.1 Relation stores (`shared/src/data/relationStores.js`)

One interface for the manager and the form field; records and memberships differ only here:

```
store = {
  field, kind,                 // relmarker field {vocabulary, targetTypes, reverse, sourceTypes, label}
  canEditRelationship,         // pen (records yes, memberships no)
  otherTypes,                  // record types of the other end
  terms(),                     // relation types [{id, label, depth}]
  list() → relation[]          // {relId, term, termLabel, reverse, other: {id, title, rty}}
  targetQuery(relations)       // the manager's list query: only the related records
  add(otherIds, term)          // skips another record that already has this term
  setType(relation, term), remove(relation)
}
```

- `RecordRelationStore`: relationship records (RT_RELATION). `list()` = the searches of relmarkerRelations.js
  filtered by `relationFits`; `targetQuery` = `rf:<field>` (`rt:<field>` for a reverse field) of the record;
  `add` = new relationship records with the owner / visibility of the edited record; `setType` = PATCH of the
  relation type field; `remove` = delete.
- `MembershipRelationStore`: `sysUsrGrpLinks` through `POST /sys/group/{id}/members` (`{add, role}` adds or
  changes the role, `{remove}`). Role = term code of the vocabulary of DT_GROUP_MEMBERSHIP. Group side: the
  group's `members`; user side (reverse): the groups `user:<id>` with their members. The server keeps its rules
  (a group keeps an admin; only its admins change a group); a refusal is shown.

### 3.2 HRecordList: `recordTools(record)` option

The owner builds the toolset; the list places it (3d). It stays when template content loads.

### 3.3 HRecordManager mode `relations`

Option `relations: {store}`; types = the other end's types; the list query = `store.targetQuery`; top bar =
relation type picker + "Find or Add <type>" (nested manager in `select_multi`, then `store.add`); the toolset of
each item from the relations of that record. `openRecordManager` in this mode: Close only; resolves `{changed}`.

### 3.4 The edit form field

HEditField, repeatable relmarker with a service `manage`: the inputs are view-only (no clear), one
"Manage relationships" button instead of `+`; after Close the field shows the relationships again.
HRecordEditor's relationship service `manage(field)` saves a new record first (plan 22) and uses
`RecordRelationStore`; the user / group dialogs give a service with `MembershipRelationStore`.

### 3.5 Server (heurist)

`UserGroupCodes`: `DT_GROUP_MEMBERSHIP` 2-1200, `TRM_GROUP_ROLE` 2-10572; DT_GROUP_ADMINS / DT_GROUP_MEMBERS
removed (and their pointer mappings in GroupRecordMapping). The `members` keyword and the members action stay.

### 3.6 Explorer users and groups

Group form: the membership field instead of the Admins / Members lists; user form: the reverse field "Groups".
Memberships are written at once (not with Save). A new user / group: "Save first".

## 4. As implemented (2026-10-24)

- **Stores** `shared/src/data/relationStores.js`: `RecordRelationStore` (list = `loadRelmarkerStates` for the one
  field; `targetQuery` = `{"rf:<dty>": [{ids: <record>}]}`, reverse `rt:`; add = `relationshipBody` with the editor's
  owner / visibility; setType = PATCH of DT_RELATION_TYPE; remove = DELETE) and `MembershipRelationStore` (group:
  `GET /sys/group/{id}?fields=members`, list query `{ids}` of the members; user: `/sys/group?q=[{user:id}]`, list query
  `{user: id}`; role = term code `admin` / `member`). `relId` of a membership = the id of the other end (the inputs
  need a positive number; it is unique in the field); `groupId` / `userId` are kept for the writes.
- **HRecordList** option `recordTools(record)`, placed by `_placeRecordTools` (class `h-recordlist-record-tools`).
  A click on a `select` no longer selects the record.
- **HRecordManager** mode `relations` (`relations: {store}`, `browseRecords`): `_listQuery` = types + `store.targetQuery`;
  top bar `_renderRelationsBar` (relation type, remembered in localStorage `heurist.recordManager.relationType.<db>.<kind>.<dty>.<f|r>`,
  first term by default; "Find or Add <types>"); toolset `_relationTools` / `_relationLine` (relationship record type icon,
  `fa-user-group` for memberships, `fa-diagram-project` without icons; type `select`; pen = host `editRecord(relId, {relation})`;
  bin after `confirmRelationshipDelete`, moved from HInputRelmarker to `relationshipDialog.js`); every write then
  `reloadRelations()`; `changed` flag. `isSelectMode()` is now only `select` / `select_multi`.
- **openRecordManager**: relations mode = Close only, resolves `{changed}`; its default `browseRecords` opens another
  manager with the same options in `select_multi` (no circular import).
- **Form field**: `HEditField.isManagedRelmarker` (relmarker, repeatable, service with `manage`): button
  "Manage relationships to / from <types>" instead of `+`; after Close `setState` with the relations and `changed()`.
  `HInputRelmarker` option `managed`: no Add, no clear, "No relationships" when empty.
- **HRecordEditor** `_relationshipService().manage(field)` (only with the host's `browseRecords`): `ensureRecord`, then the
  host's record manager in relations mode. `RecordEditorHost.browseRecords` passes the `{relation}` of a pen to `editRecord`.
- **Users and groups**: `systemEntities.js` rows `members` (group) and `groups` (user, `reverse`, `sourceTypes`) of type
  relmarker by `DT_GROUP_MEMBERSHIP` / `TRM_GROUP_ROLE`; relmarker rows are not plain values (`systemFieldIds`).
  `ExplorerUserGroupManager`: the dialog gets `states` (with the relations) and a membership service; a new user / group:
  the field is read only ("Save first"). The Admins / Members lists, `UserGroupClient.setMembers` and its test are removed.
- **Server**: `UserGroupCodes` `DT_GROUP_MEMBERSHIP` 2-1200, `TRM_GROUP_ROLE` 2-10572 (DT_GROUP_ADMINS / MEMBERS removed);
  GroupRecordMapping without member fields; GroupWriteService writes members only by the members action (a new group:
  its creator is admin). **Fix found on the way:** `/sys` refused `t:<record type id>` (the record manager lists users and
  groups with `[{t: '133'}]`): SystemQueryService gives the schema the type's `rectypeId`, SystemQueryBuilder accepts it.
- **Tests**: `shared/test/relationStores.test.js` (4), `recordManager.test.js` (+4: relations mode, toolset, Find or Add,
  list placements), `relmarker.test.js` (+1: managed field), `explorerUserGroupManager.test.js` (membership fields);
  heurist `SystemUserGroupTest.php` (membership codes, `t` by record type id).
- **Not done / open**: a target with more relationships than `RELMARKER_LOAD_LIMIT` (500 per direction) is listed (server
  query) but its toolset is missing; adding new users from "Find or Add" of a membership (no Add buttons there).

## 5. Review round 1 (Artem, 2026-10-24)

5. **Extended view in the record manager** used the fallback markup: HRecordManager now gives `onRecordContentRequest`
   (records of `/records` only) with the built-in Record View renderer (`RecordViewLoader.loadMany` +
   `RecordViewRenderer.showBuiltin`, loaded on first use, as the Data module); other templates keep the fallback.
6. **"Rows" → "Row"** (view mode label in HRecordList, Data configuration, DataTables view selector; localization `#Row#`):
   the mode is one row of cards; "Inline" is a CSS word users do not know. The timeline's "Rows" is another thing, unchanged.
7. **Users and groups in card / row views**: `/sys/user`, `/sys/group` give `rec_ThumbnailURL` (the legacy entity
   thumbnail URL when the entity has an image): `EntityRecordOutput` virtual header for types with `entityImageType()`,
   `SystemQueryService` gets an `EntityImageStorage` from ServiceFactory.
8. **Entity image**: `.h-input-file.is-entity-image .h-input-file-thumb` 96 × 96 px (contain).
9. **User structure in three tabs**: separator rows in `systemEntities.js` (`dty_Type: 'separator'`, `rst_DefaultValue: 'tabs'`,
   negative ids): *Account* (login, e-mail, password, status, last login, login count), *User info* (names, organisation,
   department, address, interests, URLs, ORCID, the picture), *Membership* (groups). A tab without fields is left out.
10. **Managed relmarker**: the remove action of each relationship is shown again (deletes it after the warning; the
    membership service has `remove`).
11. **Manage button** on its own line above the relationships (`.h-edit-field-manage-line`), not beside the first value.
12. **No filter form for users and groups** (`builtinRecordFilter` → null): the list's search box. `/sys` now takes
    `filter: {f: text}` (the search box) as a title search; before it was refused ("Unknown user field").

## 6. Review round 2 (Artem, 2026-10-24)

5. **Built-in Extended view for users and groups** (they have a record structure): the problem was the record load
   only — `RecordDataProvider.loadMany` read `/records`. It now takes the list's `path` (`/sys/user`, `/files`; a
   JSON `[{ids}]` query there), and `/sys` resolves enum values with `resolveDetails` (`EntityRecordOutput::resolveTerms`,
   `{value, trm_ID, trm_Label, trm_Code}` as /records), so the renderer shows the status label.
9. **Group form in two tabs**: *Info* (name, long name, description, URLs, logo) and *Membership*.
10. **Clear action over the relationship box** (users / groups: no field width): the wrap of the input keeps the
    box's minimum width (`.h-form-input-relmarker:not(.has-display-width)`).
14. **Many new relationships**: one record save each (≈ 0.1–0.3 s). Decision (proposed): a **progress dialog with
    Cancel** from 5 targets (`RELATION_PROGRESS_FROM`, shared `ui/progressDialog.js`, also used by the file upload
    now); no limit (a limit only moves the work to several rounds) and no background job (the user waits for the
    result anyway, and a job needs its own status UI). Cancel stops after the current one; the made ones stay.
    Later, if needed: a batch insert endpoint for relationship records.
15. **"Find or Add" for memberships**: Add new user (administrators) / Add new group (anyone) in the nested manager.
16. **Search box of HRecordList**: was `{f: text}` = any-field search (title and every value in recDetails,
    `LIKE %text%`), slow; now `{title: text}`. Option `searchAnyField: true` keeps the former search (not used now).
    The DataTables view keeps its own search (`f`).

## 7. Review round 3 (Artem, 2026-10-24)

9. **Image of a system record in the built-in view**: `RecordDataProvider.loadMany` asks `rec_ThumbnailURL` on the other
   domains; HRecordManager puts it (96 px, `.h-record-manager-entity-image`, right) beside the fields, apart from the
   images of file fields.
10. **Clear action over the relationship box**: the cause was `box-sizing: content-box` of `.h-input-relmarker-box`: its
    minimum width (22em) plus padding and border was 14 px wider than its wrap. Now `border-box` (checked in a headless
    Edge harness: box = wrap = 264 px, the × after it). Record fields did not show it: their box content is wider.
16. **Search**: `{title: …}` works on `/records` (also with `rf:`; 0.01 s against 4.3 s for `f`). On `/sys/user` the title
    search looked only at the login name (the shown title is "Given Family (login)"): the user schema has
    `search: [ugr_Name, ugr_FirstName, ugr_LastName]`, `SystemQueryBuilder::titleCondition` (also `f` without a field).
17. **Progress dialog**: the bar (`<progress>`, 160 px by default) takes the width of the dialog (heurist-ui.css `.h-progress-dialog`).
16. (continued, found by Artem) The search still did nothing in the record manager: `RecordListLoader` `filterKey` took
    any one-key filter without `f` for "no filter", so `{title: …}` was never sent. Now a filter is empty only when all
    its values are empty (test in `shared/test/data/recordListLoader.test.js`).
