# Plan 28a — Unify system entities

**Status 2026-11-06: phases 1-6 implemented in both repos (§7), not committed, not checked in a browser, bundles not
deployed.** Subplan of `28 OpenAPI-Rules-and-Database-Structure-Plan.md`. Plan `30 Custom-Report-System-Plan.md` can start.

## 1. Goal

All system entities follow the plan 28 rule `/{entity}/{id}/{action}`.

- **Round 1:** `user`, `group`, `bookmark`, `reminder`, `tag`. Stored in legacy tables now; they move to `sysRecords`
  later, except tags (plan 20).
- **Round 2:** `website`, `page`, `report`, `output`. Stored in `Records` now; they move to `sysRecords` later. This plan
  gives them `/sys` search and moves the website and page client off `/records`. Reports are in plan 30.
- `filter` stays as it is until plan 20 phase 4c.
- No table is converted here; this is API work only.

Decisions: plan 28 §9.7 (revised) and §9.8. The endpoint table is plan 28 §2.4.

## 2. Findings (2026-11-06)

### 2.1 Why `/group/4` does not work

| URL | Result |
|---|---|
| `/group/4` | **400** "Wrong entity parameter". `group` is in neither `$entities` (`api.php:118-149`) nor `RecordEntityRegistry::ENTITIES`. A guest gets 401 earlier |
| `/groups/4` | Works. Legacy `DbSysGroups` through `entityScrud`, raw legacy format, **open to guests** (`api.php:660`) |
| `/sys/group/4` | Works, record format, follows visibility: administrators see all, others only their own groups, guests get 404 |

So the two working URLs differ in format and in access. For users, `/users` also gives first and last names to
guests (`DbSysUsers.php:182-190` removes only login and email; read from the code, not tested). Removing `/users` and
`/groups` closes this.

### 2.2 Who uses the legacy routes

Checked in both repositories, in `hclient`, `hserv`, `viewers`, `admin`, `redirects`, `tests` and `documentation`.

| Route | Used by |
|---|---|
| `/users`, `/groups` | No client, no legacy code. Postman collection (`:729`, `:758`) only |
| `/tag`, `/rem` | No client, no legacy code. Example comments `api.php:161-162` only |
| `/reminders` | Nothing. Already broken: the map value `DbUsrReminders` gives the class `DbDbUsrReminders`, so 500 |
| `/sys/reminder/send`, `/sys/tag/assign` | New client only (`UserDataClient.js:183`, `TagClient.js:140`). Legacy does not call them |

- Legacy tag, reminder, user and group code calls `entityScrud.php` directly (`hclient/core/hapi.js`), not `/api`, so it
  does not change.
- Legacy builds `/api` URLs only for `records`, `map/data`, `iiif` and `annotations`.
- Outside callers (other servers, user scripts) can not be seen from the code.

### 2.3 `t` predicate on `/sys`

| Request | Today |
|---|---|
| `t:tag`, `{"t":"tag"}` | Works |
| `/sys?q=t:133`, `{"t":133}` | 400. Works only together with a path: `/sys/tag?q=t:133` |
| `t:2-1109` | 400 always |
| `t:keyword`, `t:workgroup` | 400 (the schema finds them, the compiler refuses them). OpenAPI `:838` says `keyword` works |
| `t:website`, `t:report` | 400. `/sys` knows only the six legacy-table types |

### 2.4 Other findings

- `GET /sys/tag/5/123` silently returns the whole record: the third segment is ignored unless it is `image`.
- `GET .../image` is treated as a write (`api.php:504`), so a JWT needs `write:data` to read an image.
- `POST /{website|page}/{id}/execute` goes straight to the job (`api.php:843`) and skips the record type check and the
  same-site check.
- `/{entity}/...` needs a login today, even where the same record is public on `/records/{id}`.
- `recordDomains.js:36-37` maps bookmarks and reminders to `/system/...`, a route that does not exist; a test pins it
  (`recordListLoader.test.js:107`).

## 3. Target

| Entity | Actions | Change |
|---|---|---|
| user | `validate`, `asset` | `/image` → `/asset` |
| group | `validate`, `asset`, `assign` | `/image` → `/asset`; `/members` → `/assign` |
| bookmark | `validate` | — |
| reminder | `validate`, `execute` (no id) | `/send` → `/execute` |
| tag | `validate`, `merge`, `assign` (no id) | `DELETE /tag/assign` added |

All five: `duplicate` is 405 (legacy tables), `setup` and `import` are 404 for now, `/{id}/{field}` is added.
`/sys/{entity}/...` keeps working.

- **`assign` on group:** POST `{add: [ids], role}`; DELETE `{remove: [ids]}`, same way of sending as `/website/{id}/assign`.
- **`assign` on tag:** POST keeps `{add, remove, records}`, because `TagClient` sends adds and removes in one call.
  DELETE `{remove, records}` is added for the rule.
- **`execute` on reminder:** has no id, because it sends the unsaved form, as `send` does today.
- **Users of a group:** `GET /group/{id}?fields=members`, or the new `group` predicate (mirror of `{user:N}`):
  `/sys?q=[{"t":"user"},{"group":4}]`. Non-admins see only themselves in a user search, as today.

## 4. Phases

### Phase 1 — Routing (server)

- In `api.php`, before the guards at `:489-536`, turn `/{entity}/...` for the five names into the `/sys` path, so all
  existing rules apply in one place.
- Remove `users`, `groups`, `tag`, `rem`, `reminders` from `$entities`, and `users`, `groups` from the public list
  `:659-668`. **`/tag` changes meaning here:** legacy format → record format.
- Remove aliases `users`, `groups` (`SystemEntitySchemaRegistry:147`); fix `SystemQueryTest:184`.

### Phase 2 — Query (server)

- One `t` resolver in `SystemEntitySchemaRegistry`, used by both `typeFromQuery` and `compilePredicate`: entity name,
  alias, record type id, concept code.
- `group` predicate on users.
- `GET /{entity}/{id}/{field}` with the `/records/{id}` envelope, so `/sys/tag/5/123` is no longer the whole record.
- Concept code as id (`{this database id}-{id}`).

### Phase 3 — Actions (server)

- `send` → `execute`, `members` → `assign`, `image` → `asset` in `SystemEditController`; DELETE on `assign`.
- `asset` GET is a read: fixes the JWT problem of §2.4.
- `route()` texts in the write services (`'sys/{type}'`, used in error messages).

### Phase 4 — Record-based entities (server)

- `/sys?q=` with `t` = `website`, `page`, `report`, `output`: goes to the record search on `Records`, same output and
  envelope. Later only the table pair changes.
- `GET|POST /{entity}?q=` for all entities (replaces the 405). `/sys/{entity}/...` for the record-based ones.
- `schedule` → `output` in `RecordEntityRegistry`, here or in plan 30 phase 1, whichever comes first.
- Guest GET on entities, with the visibility rule of `/records`. Writes still need a login.
- `execute` goes through the handler, so the record type and same-site checks apply.

### Phase 5 — Client

- `RecordEditClient`: entity paths `/{entity}` (the whitelist at `:77-78` and the path at `:82`).
- `recordDomains.js`: `/user`, `/group`, and the record-based entities; fix `system/bookmark` and its test.
- `TagClient`, `UserDataClient`, `UserGroupClient`, `relationStores`, `UserGroupManager`, `SavedFilterManager` (stays on
  `/sys`).
- Website and page: `WebsiteClient:149`, `WebsiteApplication:228`, `WebsiteManager:152`, `widgetForms.js:247,581`,
  `CmsDesigner.js:1152,1220`.
- **Open:** `HRecordManager:175` has the path in its settings key, so a changed path loses the saved view mode and
  sort. Proposal: read the old key once. `:194`, `:690` and `RecordDataProvider.js:74` also branch on `/records`.
- Tests that pin paths: `shared/test` (tags, userData, userGroups, relationStores, modulePublisher, requestMonitor,
  recordDataProvider, recordListLoader), `apps/website/test` (websiteManager, cmsDesigner), `apps/explorer/test`
  (userGroups, legacySavedFilterConverter).

### Phase 6 — Documentation

`documentation/api/heurist-openapi.yaml` (also the `meta.currentUser.name` omission at `:852`), Postman collection,
`HEURIST_API_Requests_Overview.md`, `srv/_README.md` and the `_README.md` files of `srv/System/*` and `srv/Records/Entity`.

## 5. Verification

- PHP: `tests/SystemQueryTest`, `SystemTagTest`, `SystemBookmarkReminderTest`, `SystemUserGroupTest`, `WebsiteEditTest`.
- These tests call controllers directly, so routing needs its own check: curl through `api.php` on the local server, as
  administrator, as a normal user and as a guest, for `/group/4`, `/sys/group/4`, `/users/1` (must fail), `/tag`,
  `/sys?q=t:2-1109`, `/sys?q=t:website`.
- `npm test`, all builds.
- Browser: Manage users and groups (with images and members), tags, bookmarks, reminders with *Send now*, Website manager.
- Session start: `{t:'group'}` must still answer guests and give `meta.currentUser`, because Explorer uses it as the
  session check (`UserGroupManager.js:97`).

## 6. History

- 2026-11-06 — draft 1 from Artem's request and the review of both repositories.
- 2026-11-06 — phases 1-6 implemented, §7.

## 7. As implemented (2026-11-06)

**Server (heurist repo).**

- `api.php`, before the guards: `/{five entities}/...` → `/sys/...`; `/{record entity}` without an id → `/sys/{entity}`;
  `/sys/{record entity}/{id}...` → `/{entity}/{id}...`. Concept code ids are resolved after the login check.
- `SystemQueryService`: `resolveType` (name, alias, record type id, concept code), `executeField`, and the search of a
  record-based entity = the `/records` search with `t` set to the record type. `SystemEntitySchemaRegistry::ENTITIES`
  (read by `api.php`), `TEXT_TYPE`.
- `group` predicate: a query-only field of `user`, like `record` of `tag`, because the parser accepts logical fields only.
- `SystemEditController`: `assign` on group, POST and DELETE on `/tag/assign`, `execute` on reminder, `asset`,
  `duplicate` = 405. A DELETE has no JSON body in `api.php`, so ids are in the URL: `?remove=1,2[&records=3,4]`.
- `RecordEditController`: guest rule, `entityField`, `allowEntityExecute` (login, method, same site, record type before the job).
  `meta.website` is left out for guests.
- `schedule` → `output` in `RecordEntityRegistry` (done here, so plan 30 does not need it). Job parameter
  `schedule` of `report-generate` is unchanged: plan 30.

**Client.** `RecordEditClient` (`/{entity}`, `entityPath`, `pathOf`), `recordDomains` (`RECORD_ENTITIES`,
`recordEntityPath`), `TagClient`, `UserDataClient`, `UserGroupClient`, `relationStores`, `WebsiteClient.pages`,
`WebsiteApplication.editableWebsites`, `ReportApi`, `HRecordEditor`, `RecordEditorHost`, `HRecordManager` (reads the old settings
key once). `/sys?q=` stays where a client lists by `t` (`UserGroupManager`, `SavedFilterManager`, `TagClient`, `UserDataClient`).

**Deviations from §4.**

1. **Generic record editor:** not one client per entity. The editor also writes relationship records and steps through
   records of other types, so one `/website` client would fail. `RecordEditClient.pathOf` chooses per record, from
   `rec_RecTypeID`: website, page, report and output go to their URL; other records in the same editor stay on `/records`. A
   `load` or `remove` without a known type stays on `/records`.
2. **Mixed lists stay on `/records`:** Website manager (websites and pages together), `HRecordManager`, pointer fields,
   and the "any record" reads in `widgetForms` and `CmsDesigner`. `t` on `/sys` takes one entity only. Record-based
   entities are not in `RECORD_TYPE_DOMAINS` for this reason. When they move to `sysRecords` this needs a decision.
3. **OpenAPI (changed the same day, Artem):** sections *Record entities* and *System records* are one section *Entities*: one
   `/{entity}/{recordId}` path with one enum (the nine entities), with the rules by entity in its text, plus `/{fieldId}`,
   `/validate` (GET, POST), `/duplicate`, `/asset`, `setup`, `execute`, `assign`, `merge`. `GET|POST /sys` is the only search
   listed; `/sys/{entity}/...` is accepted but not listed; `/sys/filter/{id}` stays listed, because `/filter` has no route.
4. **Output of a record-based search:** it is the `/records` output (`meta.entity` = `records`), not `sys`.

**Checks.** JS 1,643 pass, 8 builds verified. PHP with writes: SystemTag 36, SystemBookmarkReminder 46, SystemUserGroup 49,
WebsiteEdit 62, ReportsApi 73, RecordEditApi 68, JobRunner 45; SystemQuery 89; DataAccessBoundary passes. curl **as a guest**
through `api.php`: `/group/4`, `/sys/group/4`, `/user/2` 404; `/groups/4`, `/users/2`, `/rem/1`, `/reminders` 401; `/tag`,
`/bookmark` 200 and empty; `/sys?q=t:2-1109`, `/sys?q=t:website`, `/website?...`, `/sys/website`, `/report`, `/output` 200;
`/website/{id}`, `/website/{id}/2-1`, `/website/777-{id}` 200; `/website/999-{id}`, `/page/{website id}` 404;
`/website/setup`, `/website/{id}/validate`, POST `/website/{id}/execute`, POST `/group/4/assign` 401.

**Not checked:** routes as a logged-in user through `api.php` (PHP tests call the controllers directly); the browser steps of §5.
