# Plan 27d — Website API on the common endpoints (plan 27, before phase 3)

**Status 2026-10-30: agreed and implemented (both repos), not committed, not checked in a browser.** Open points
answered by Artem (§8); implementation and deviations in §11. It follows `28 OpenAPI-Rules-and-Database-Structure-Plan.md`
and is the first new work on those rules (pilot of record-based entities). It replaces the server endpoints of 27b and
the new endpoints proposed in 27c §4 and §10.

## 1. Request (Artem, 2026-10-30)

Before 27c we settle the server side:

- a) It follows the rules of plan 28.
- b) A PATCH of an individual field goes through the standard endpoint and server classes, as the Map module does for
  the Symbology / Thematic map field.
- c) List all website endpoints and actions and align them with the general API contract.

## 2. Decisions (Artem, 2026-10-30)

| # | Question | Decision |
|---|---|---|
| 1 | URL while website and page records are still in `Records` (99-51 / 99-52) | Use the target URL now: entities `website` and `page` of the `sys` domain, mapped to the Records table pair through the plan 28 entity registry. When plan 28 moves the tables, only the mapping changes. |
| 2 | URL form | **Entity form only:** `/api/{db}/website/{id}/{action}`, `/api/{db}/page/{id}/{action}`. The domain is written only to search a whole domain (`/records?q=`, `/def/snapshot`); a record type is searched with the predicate `t:` (Artem, 2026-10-30; plan 28 §9.7). No `/sys/website` alias. |
| 3 | Plan name | 27d. |
| 4 | Open points of §8 | All as proposed (Artem, 2026-10-30). |

## 3. Entities

| Entity | Record type | Table pair now | Hooks (§6) | Specific actions |
|---|---|---|---|---|
| `website` | `RT_CMS_HOME` 99-51 | Records / recDetails | insert: starter page; delete: pages; save: owner and visibility to menu pages | `assign` (page–website), `execute` (build) |
| `page` | `RT_CMS_PAGE` 99-52 | Records / recDetails | insert: owner of the website it is added to | `import` (module configuration → standalone page) |

Common actions on both (plan 28 §2.3): `validate`, `setup`, `duplicate`, `aggregate`.

## 4. Field PATCH — as the Map module does it

**Client.** `apps/map/src/core/MapApplication.js` `requestEditLayerSymbology()` →
`shared/src/symbology/SymbologyService.js` `saveLayerSymbology()` → `shared/src/data/RecordEditClient.js` `patch()`:

```
PATCH /api/{db}/records/{id}
{"details": {"<DT_SYMBOLOGY id>": ["<json string>"]}}      // [] clears the field
```

**Server.** `hserv/controller/api.php` (records/{id}, non-GET) → `srv/Controller/RecordEditController.php`
(same-site check, JSON body) → `srv/Records/Edit/RecordSaveService.php` `save()` → `planUpdate()`: loads the stored
values, replaces only the field ids in the body, keeps missing headers; validation (`RecordValidator`, 422), workflow,
then one transaction in `RecordStore` (`updateRecord` sets `rec_Modified`, `replaceDetails`), calculated fields,
title. The reply is the record as GET returns it (`fields=_all`, includes `rec_Modified`) with `meta.issues`.

**Conflict check.** Only when the body has `rec_Modified` (`RecordSaveService` 303-307): 409 `conflict` with the
stored value; `?force=1` overwrites. Map sends no `rec_Modified`, so it never gets a conflict. The designer always
sends it (27c §8).

**For websites.** The designer uses exactly this path: `PATCH /website/{id}` or `PATCH /page/{id}` with the changed
fields only (2-4, 2-929 / 2-940, 2-1187, 2-1202) plus `rec_Modified`. No website-specific save code.

## 5. Endpoints — current → target

Base `/api/{db}`. Current routes: `srv/Controller/WebsiteController.php` `api()` → `srv/Website/WebsiteEditService.php`.

| # | Current | Target | Kind | Notes |
|---|---|---|---|---|
| 1 | `GET\|POST /website/setup` | `GET\|POST /website/setup` | common `setup` | Same URL. Checks / installs 2-49, 2-1187, 2-1202 on 99-51 / 99-52 (`WebsiteSetup`); POST for administrators. |
| 2 | `POST /website {title, languages}` | `POST /website/0` (record format: title 2-1, languages 2-967) | CRUD insert + hook | The insert hook creates the starter "About" page and links it (`WebsiteStarter`). Owner = the user's choice in the body, pages get the same (27c §10). |
| 3 | `GET /website/{id}` (summary) | `GET /website/{id}` | CRUD read | Standard record. Menu pages through the standard expansion (`rules` / `ids` of 99-742 / 99-761 pointers); the client builds the tree. `kind`, `version` (2-49), `url` computed on the client; `canEdit`: see §8.1. |
| 4 | `DELETE /website/{id}?pages=1` | `DELETE /website/{id}?pages=1` | CRUD delete + hook | Delete hook deletes the pages; keeps pages that records outside the site point to (as now). v4 only. |
| 5 | `GET /website/{id}/validate?page=&lang=` | same | common `validate` | Today it checks the v4 content (`CmsValidator`). The generic `validate` (record validation) + a website hook that adds the CMS issues; GET allowed because nothing is saved. |
| 6 | `POST /website/{id}/menu {pageId, parentId}` | `POST /website/{id}/assign {page, parent, index}` | specific `assign` | `index` optional (append). Internally a PATCH of the parent's 99-742 / 99-761 and the page type through `RecordSaveService`. |
| 7 | `DELETE /website/{id}/menu/{pageId}` | `DELETE /website/{id}/assign {page}` | specific `assign` | The page becomes standalone (page type changes). Not deleted. |
| 8 | 27c `POST /website/{id}/menu/move {page, parent, index}` | `POST /website/{id}/assign {page, parent, index}` | specific `assign` | Move = assign of a page that is already in the menu: removed from the old parent, inserted at `index`. One endpoint for add and move. |
| 9 | 27c `POST /website/{id}/access {owner, visibility}` | `PATCH /website/{id}` with `rec_OwnerUGrpID` / `rec_NonOwnerVisibility` | CRUD PATCH + hook | The save hook of `website` passes owner and visibility on to all menu pages. No new endpoint. |
| 10 | `POST /website/publish {type, settings, state, title, pageId}` | `POST /page/{0\|id}/import {type, settings, state, title}` | `import` | Module configuration imported into a standalone v4 page (the server builds the page HTML and configuration, as now). `0` = new page; an id = update, only for a standalone v4 page. |
| 11 | `GET /website/pages?module=` | `GET /page?q=...` | CRUD search | Standalone v4 pages with one module type: a standard query (page type standalone, 2-49 = 4, module type in 2-1187). If the module type cannot be expressed in the query language, the client filters the small list. |
| 12 | `POST /jobs {type: website-build, params: {id}}` | `POST /website/{id}/execute` | specific `execute` | Starts the `website-build` job (`WebsiteBuildJob`); the reply has the job id. Status, list and result stay on `/jobs`. |
| 13 | designer Save (27c §8) | `PATCH /website/{id}`, `PATCH /page/{id}` | CRUD PATCH | §4. |
| 14 | page CRUD from the record editor | `GET\|POST\|PUT\|PATCH\|DELETE /page/{id}` | CRUD | Today `/records/{id}`; both keep working. |
| 15 | `GET /{db}/site/{id}[/{page}][/frame/{instance}][?lang=]` | same, plus `design=1` (27c §6) | special `site` | Public HTML (plan 28 §4); not under `/api`. |

Errors as in plan 28 §2.2 (404 unknown action, 405 action not allowed on the entity, 409, 422).

## 6. Server classes

**Generic (plan 28 §6), first used here:**

- Entity registry: `website` and `page` → record type + `RecordSchema` default pair (`srv/System/Query/
  SystemEntitySchemaRegistry.php` extended, or its successor), aliases, allowed actions, hooks, action handlers.
- Routing in `api.php` of `/website[/...]` and `/page[/...]` (no `/sys/...` form, decision 2) to the generic query and edit
  controllers (`RecordQueryController`, `RecordEditController`) with an entity: search adds the record type filter;
  read / write refuse a record of another type (404).
- Hook interface on the generic save and delete (`RecordSaveService`, `RecordDeleteService`): `beforeInsert`,
  `afterInsert`, `afterSave`, `beforeDelete`, `validate`. The existing CMS owner rule in `RecordSaveService` (group 1
  for new CMS records) moves into the `page` / `website` hooks.
- Action handler interface for `assign`, `import`, `execute`.

**Website-specific (stay, in `srv/Website/`):**

| Class | Role after 27d |
|---|---|
| `WebsiteEditService` | split into `WebsiteHooks` (insert: starter page; delete: pages; save: owner to pages; validate: CMS issues), `WebsiteMenuAssign` (assign), `PageModuleImport` (import, today `publishModule`), and the `execute` handler (start of `website-build`). |
| `WebsiteSetup`, `WebsiteStarter`, `CmsValidator`, `StyleCompiler`, `PageRenderer`, `SiteUrls`, `WebsiteService`, `WebsiteRepository`, `Build/WebsiteBuildJob` | unchanged |

**Removed:** `WebsiteController::api()` / `handleApi()` routes and the `/website` block in `api.php`;
`WebsiteController` keeps only `showPage` (the `site` endpoint). No new controller.

## 7. Client changes

- `shared/src/api/WebsiteClient.js`: `status` / `setup` (same URL), `create` → POST `/website/0`, `summary` → GET
  `/website/{id}` + pages, `validate` (same URL), `addToMenu` / `removeFromMenu` / new `move` → `assign`, `remove`
  (same URL), `publish` → `POST /page/{id}/import`, `pages` → `GET /page?q=`, new `build` → `execute`.
  The method names stay, so callers change little: `apps/website/src/manager/WebsiteApplication.js`,
  `shared/src/site/modulePublisher.js`, `apps/explorer/src/modules/moduleConfigurations.js`,
  `ExplorerApplication.publishView()`.
- The designer (27c) saves with `RecordEditClient.patch()` pointed at `/page/{id}` / `/website/{id}` (an entity option
  on `RecordEditClient`, or `/records/{id}`, which stays valid).
- The old `/website` routes are removed in the same step: no users outside this repo.

## 8. Open points (answered 2026-10-30)

1. `canEdit` in the generic record reply. **Agreed:** `meta.canEdit` in `GET /{entity}/{id}` for every entity.
2. Summary on the server or the client. **Agreed:** a `website` hook adds it to the read (one request; the menu tree
   needs several levels of pointers) — `meta.website`.
3. `validate` with GET (nothing saved) and POST (validate a body). **Agreed:** both.
4. Owner of a new website: the body of POST `/website/0` (default: the user). **Agreed.**
5. The domain form: **only to search a whole domain**; entity URLs never carry it; a record type is searched with
   `t:` (decision 2).

## 9. Phases

| Phase | Content | Repo |
|---|---|---|
| A | Entity registry for record-based `sys` entities; routing of `/website`, `/page` to the generic controllers; hook and action handler interfaces | heurist |
| B | `website` / `page` CRUD with hooks (starter page, cascade delete, owner propagation, CMS validate); CMS owner rule moved into hooks | heurist |
| C | Actions: `setup`, `assign` (add, remove, move with index), `import`, `execute` | heurist |
| D | Client switch (`WebsiteClient`, callers), old `/website` API routes removed; `tests/WebsiteEditTest.php` updated (assign with index, owner propagation, import) | both |
| E | OpenAPI yaml: website and page paths, the entity form, the actions | heurist |

Then 27c phase B uses `assign` (move) and the PATCH of §4.

## 10. History

- 2026-10-30 — draft 1: endpoint inventory of `WebsiteController`, field PATCH path of the Map module, mapping to
  plan 28; replaces 27c `menu/move` and `access`.
- 2026-10-30 — open points answered (§8), domain only for whole-domain searches; Phases A-E implemented (§11).

## 11. Implementation (2026-10-30)

**Endpoints as built** (all logged-in users; writes same site + JSON body):

| Request | What it does |
|---|---|
| `GET /website/setup`, `GET /page/setup` | Definitions installed, missing list, `canSetup`, **`codes`** (local ids of the CMS record types, fields and terms) |
| `POST /website/setup` | Install them (database managers) |
| `POST /website/0` {details: {name, languages: ["eng", ...]}} | Starter website (version 4, header, footer, home, configuration, public) and its "About" page |
| `GET /website/{id}`, `GET /page/{id}` | The record (`fields=_all` unless given) with `meta.canEdit` and `meta.website` (summary of 27b) |
| `PUT\|PATCH\|DELETE /website/{id}`, `/page/{id}` | Generic save / delete; website PATCH of owner or visibility → menu pages; `DELETE /website/{id}?pages=1` deletes the menu pages no other record uses |
| `GET /website/{id}/validate[?page=&lang=]`, `GET /page/{id}/validate` | `{valid, issues}` of the format |
| `POST /{website\|page}/{id}/validate`, `/duplicate` | As `/records/{id}` |
| `POST /website/{id}/assign {page, parent?, index?}` | Add to the menu, or move (also inside the same parent); a new menu page gets the website's owner and visibility |
| `DELETE /website/{id}/assign?page=` | Out of the menu (page stays, standalone). The page id is a query parameter: api.php reads no body for DELETE |
| `POST /page/{0\|id}/import {type, settings, state, title}` | Module Publish |
| `POST /{website\|page}/{id}/execute` | Starts `website-build` (api.php → `JobController`); the answer is the queued job |
| `GET /website`, `GET /page` | 405: search with `GET /records?q=t:{record type}` |

**Server (heurist):**
- New `srv/Records/Entity/`: `RecordEntityRegistry` (names → record type constant, job type; `ENTITIES` read by
  api.php), `RecordEntityHandler` (no-op hooks `beforeSave` / `saveFailed` / `afterSave` / `beforeDelete` /
  `afterDelete`, `describe`, `validate`, `action`), `_README.md`.
- `RecordEditController`: `handleEntityRequest` / `executeEntity` (type check 404, entity-level actions, GET item with
  `meta.canEdit` + `describe`, GET validate, generic POST/PUT/PATCH/DELETE, specific actions); hooks of a record
  type run for **every** write of that type, also through `/records/{id}` (chosen by the record type, not by the URL).
- `srv/Website/WebsiteEntityHandler.php` (hooks and actions of both entities); `WebsiteEditService` reworked
  (`starterBody`, `addStarterPage`, `importModule`, `assign` with index / move / cycle check, `shareAccess`,
  `deletablePages` / `deletePages`, `codes`); `pages()`, `create()`, `publishModule()`, `addToMenu()`, `delete()` and
  `WebsiteRepository::standalonePages()` removed.
- `WebsiteController` keeps only `showPage`; its `/api/{db}/website` routes are removed. `api.php` routes the
  entity names to `recordEditController(new WebsiteDefinitions)` and `execute` to the jobs.
- The "website pages belong to group 1" rule is removed from `RecordSaveService` and `RecordDuplicateService`: a new
  page belongs to the user and is public (page hook); a page added to a menu gets the website's owner (27c §10).
- OpenAPI: tag *Record entities*, paths `/{database}/{entity}/{recordId}` (+ `/validate`, `/execute`),
  `/{entity}/setup`, `/website/{recordId}/assign`, `/page/{recordId}/import`, parameter `RecordEntity`.
- Tests: `tests/WebsiteEditTest.php` rewritten on `executeEntity` (54 checks pass); `tests/RecordEditApiTest.php
  --write` 68 pass (page owner = user); `DataAccessBoundaryTest`, `CmsFormatTest` pass.

**Client (this repo):** `shared/src/api/WebsiteClient.js` on the entities: `codes()` (from `/website/setup`),
`create` (record body), `summary(id, {entity})` (website first, page after a 404), `validate`, `publish` →
`/page/{id}/import`, `pages(module)` = record search `t:page f:version=4 f:pageType=standalone` with the module found
in the configuration, `assign` / `addToMenu` / `removeFromMenu`, `remove`, `build`. Callers: `WebsiteApplication`
(entity from the summary kind, build through `execute`), `modulePublisher` (page entity). Tests updated; all 1,521 JS
tests pass; website and explorer builds pass.

**Deviations from the plan:**
- Registry for record-based entities is its own class (`Records/Entity/RecordEntityRegistry`), not an extension of
  `SystemEntitySchemaRegistry` (that one stays for legacy-table entities of `/sys`).
- Hooks run in `RecordEditController` around the generic services (by record type), not inside `RecordSaveService`;
  internal saves of `WebsiteEditService` run no hooks (no recursion).
- The top menu of a website is required, so the "About" page is written in `beforeSave` (not on validate) and removed
  again by `saveFailed` when the website can not be saved.
- No `/sys/website` alias (decision 2). Updating a page by `pageId` in the body became the path id of `import`.
- `pages(module)` lists pages without the server's `canEdit` check; updating a page the user can not change gives 403.
- Known, not from this plan: `tests/RecordEditAllTypesTest.php` reports 2 failures for CMS home / menu page (field
  "Page translations" must start with a language code) — the random test value, in `RecordValidator`.
