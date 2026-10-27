# Legacy dependencies of the new client and srv/

*Status: survey of 2026-10-27. Update it when a dependency is removed or added.*

This note lists where the new code still depends on legacy Heurist code:

- the new client (this repo: `apps/*`, `shared/`) on `heurist/hserv`, `heurist/hclient`,
  `heurist/viewers` and the legacy FrontController;
- the new server code (`heurist/srv/`) on `heurist/hserv`.

"Legacy" means code outside `srv/` and outside this repo. For each dependency the note gives
where it is, what it does, and what replacing it would need. Section 4 suggests an order.

## 1. Summary

| # | Dependency | Used by | Cost now | Replacement |
|---|---|---|---|---|
| C1 | Module preferences: `UserController get_prefs/save_prefs` (FrontController) | Data, Graph, Map, Record View | One legacy request per module at start; rewrites the PHP session | srv endpoint for user preferences |
| C2 | Record view HTML: `viewers/record/renderRecordData.php` | Record View, Map popups | Full legacy page per record | srv record view, or client renderer only |
| C3 | Files and icons: `?db=&icon=`, `?db=&thumb=`, `?db=&file=`, `download=1` | many | Legacy start-up per image | srv `/files` content routes (partly done) |
| C4 | Image viewers: `openSeadragonViewer.php`, `miradorViewer.php` | `fileMediaItem.js` | Opened on demand | Keep for now (legacy pages) |
| C5 | Translation: `hserv/controller/usr_info.php?a=translate_string` | `TranslationClient.js` | On demand | srv translator service |
| C6 | Record links `?db=&recID=` | Graph GEXF export, rich text HTML | Link only | Keep, or a v4 record page |
| C7 | Iframe module pages: `hclient/modules/*/…Viewer.html` | Explorer iframe mode, editor mode | Page per iframe module | Move to a neutral folder later |
| C8 | Login and session: legacy login UI, `heurist-sessionid` cookie | every API call | Session lock in each request | srv auth (later) |
| S1 | Request start-up: `hserv/controller/api.php` + `hserv\System::init()` | every srv request | DB connect, session, login check: see §3 | srv front controller |
| S2 | `ServiceFactory::fromLegacySystem()`: constants, settings, folders | every srv request | ~5-25 ms | `DatabaseSettings`, srv configuration |
| S3 | Legacy closures in `ServiceFactory` (mailer, password hash, user delete, e-mails) | reminders, users/groups | On demand | Port the functions |
| S4 | Report renderer `hserv\report\SmartyReportRenderer` + `ReportRecordWriter` | `/reports`, `/jobs` | On demand | Template conversion and the writer to srv |
| S5 | Website definitions `hserv\web\WebsiteDefinitions` (DbsImport) | `/website/setup` | On demand | srv definition import |
| S6 | Legacy tables written in legacy row format (`Legacy*Table`) | `/files`, `/sys` tag, bookmark, reminder, user, group | None (by design) | Plan 28 (new tables), or keep |
| S7 | Legacy cron scripts start srv jobs (`admin/setup/dboperations/runReportSchedules.php`) | report schedules | None | Keep |

## 2. New client → legacy

### C1. Module preferences (user preferences of the legacy UI)

**Where.** `shared/src/host/HostAdapter.js` `loadPreferences()` / `savePreferences()`, and
`apps/map/src/host/HeuristHostAdapter.js`. Request:
`{baseUrl}?db=…&controller=UserController&action=get_prefs&key=heurist-<module>` (and `save_prefs`).
Server: `hserv/controller/UserController.php` → `user_getPreferences()` /
`user_setPreferences()` in `hserv/structure/dbsUsersGroups.php`. Storage: the JSON column
`sysUGrps.ugr_Preferences` of the user, keys `heurist-data`, `heurist-graph`, `heurist-map`,
`heurist-recordview`.

**So yes:** the settings of the presentation modules (Data columns, Graph, Map,
Record View) are still kept in the legacy user preferences, through the legacy FrontController.

**Not in legacy:** Explorer's own settings are in the browser only (`localStorage`):
`ExplorerUiConfig` (layout, toolbar, module placement, limits), `DataSourceHistory`,
`DataSourceFavorites`, `ExplorerWorkspace`, the authoring dock and the welcome flag. The same
for Record View `RecentRecords`, `HRecordEditor` / `HRecordManager` remembered values and
the report editor. These do not follow the user to another browser or computer.

**Cost.** In Explorer, Data and Record View each send `get_prefs` at start (0.3 s each in the
measurement of 2026-10-27). `getPreferences()` reads all preferences of the user and writes
them into the PHP session (`replacePreferences`). That is a session write with the session
lock held, and it keeps a large session file (51 kB for osmak_mapping). Other requests of the
same user wait for the lock while this happens.

**Replacement.** One srv endpoint for preferences, for example `GET/PUT /api/{db}/sys/prefs/{key}`
(same JSON column, no session write), and one request for all module keys at start.
Decide at the same time whether Explorer's configuration should be stored for the user on the
server as well (now per browser).

### C2. Record view HTML: `renderRecordData.php`

**Where.** `apps/recordview/src/data/RecordContentProvider.js`,
`shared/src/recordview/RecordContentProvider.js`, `apps/map/src/data/PopupProvider.js`.
Used for the legacy (server-rendered) record view and for custom record view templates.

**Replacement.** The client renderer (`RecordViewRenderer`) already covers the standard view.
What remains is the custom record view templates (Smarty): render them with the srv Smarty
engine (`srv/Reports/Smarty`) through a srv route.

### C3. Files, thumbnails and icons through the legacy root URL

**Where.** URLs built as `{baseUrl}?db=…&icon=…`, `&thumb=…`, `&file=…`, `&download=1&file=…`:
`RecordTypeManager.js`, `RecordViewRenderer.js`, `RecordPopupContent.js`, `recordAdminInfo.js`,
`fileMediaItem.js`, `mediaTag.js`, Map `createSymbologyService.js`, Timeline
`VisTimelineEngine.js`, Graph `gexfWriter.js`. Served by the legacy `index.php` →
`hserv/controller/fileGet.php` / `fileDownload.php`.

**Cost.** Every icon and thumbnail is a legacy request with the full legacy start-up. Browser
caching helps after the first visit.

**Replacement.** srv `/files` already serves file content and thumbnails
(`FileController`, plan 20). Move the URL building to one shared helper first (now in about ten
places), then point it to the srv routes; record type icons need a srv route too.

### C4. Image viewers (OpenSeadragon, Mirador)

`shared/src/recordview/fileMediaItem.js` opens `hclient/widgets/viewers/openSeadragonViewer.php`
and `miradorViewer.php`. These are complete legacy pages. Keep them until there is a reason
to port them.

### C5. Machine translation

`shared/src/data/TranslationClient.js` posts to `hserv/controller/usr_info.php` with
`a=translate_string` (DeepL key in the installation configuration). srv only reports whether
it is available (`ServiceFactory::$translatorAvailable` reads `$accessToken_DeepLAPI`).
Replacement: a small srv translator service with the same key.

### C6. Record links

`?db=…&recID=…` in `gexfWriter.js` and `richTextHtml.js` points to the legacy record page.
These are links only; they can stay until there is a v4 record page.

### C7. Iframe module pages

`apps/explorer/src/explorerConfig.js` builds the iframe URLs
`hclient/modules/{data,map,timeline,graph,recordview}/…Viewer.html` and the editor mode page
in `hclient/modules/explorer/`. The bundles themselves are in `hclient/bundles/heurist-*`.
These are thin HTML pages and not real legacy code, but they live in the legacy folder.
The root page `exp.html` (2026-10-27) starts the bundled Explorer outside the legacy UI.

### C8. Login and session

The new client has no login of its own. Explorer works with the legacy session cookie
`heurist-sessionid` that the legacy login sets; without it the user is a guest
("Log in to …" messages). JWT bearer tokens are also accepted by `api.php`.
Replacement: an srv authentication service (login, logout, session or token) — a large
task; see S1.

## 3. srv/ → legacy

### S1. Request start-up: `api.php` and `hserv\System::init()`

All `/api/{db}/…` requests go through `hserv/controller/api.php` (routing, method checks,
authentication). Before any srv code runs, `hserv\System::init()`:

1. connects to MySQL (`mysql__init`);
2. starts the PHP session (`AuthSessionService::startMySession`, session folder check, keep-alive cookie);
3. defines path constants, runs the once-a-day script check;
4. reads the user from the session (`loginVerify`): the session is opened and closed several
   times; when a marker file exists the user is reloaded from the database and the preferences
   are written back into the session.

Then `ServiceFactory::fromLegacySystem()` closes the session (srv never writes it).

**Server-Timing header (2026-10-27).** srv responses now carry
`Server-Timing: db;dur=…, session;dur=…, paths;dur=…, login;dur=…, boot;dur=…, app;dur=…, total;dur=…`
(`srv/Runtime/ServerTiming.php`; marks in `System::init()` through `timingMark()`, which works
only when the Composer autoloader is loaded). The browser shows it in the Timing tab of a request.
`db` includes the PHP start and the legacy includes. First measurement as a guest: `db` 70-100 ms,
`session` 2 ms, `paths` 4-9 ms, `login` 1 ms, `app` 50-320 ms. Measurements as a logged-in user
are still to do: that is where the start-up requests took about 2 s.

Note: the database host `localhost` costs about 20 ms per connection on Windows (IPv6 tried
first); `127.0.0.1` costs about 1 ms.

**Replacement.** A srv front controller (routing + authentication + read-only session access
with `session_start(['read_and_close' => true])`) so that srv requests never hold the session lock.

### S2. Values taken from the legacy System

`ServiceFactory::fromLegacySystem()` takes from `$system`:

- `RuntimeContext`: database name, user ID, user groups, admin/owner flags, base URL;
- record type / field constants (`defineConstant` of the `RT_*`, `DT_*` names listed there);
- folders: `getSysDir('entity' | 'smarty-templates' | 'generated-reports' | 'scratch')`, file store root;
- database settings: `Reports`, `Export`, `Languages`, `TinyMCE formats`, web fonts,
  `isJavaScriptAllowed`, disk quota;
- `$accessToken_DeepLAPI`;
- for the srv Smarty engine (`legacyEngineEnvironment`): current user, `layout_language`
  preference, `recordLink()`, `getConstant()`, registered database ID.

`srv/Runtime/DatabaseSettings.php` and `DefinitionLookup` already replace part of this.
Replacement: read the configuration (`configIni.php` values) and the folders in srv, then
`RuntimeContext` can be built from the srv session/auth (S1).

### S3. Legacy functions called through closures

In `ServiceFactory::fromLegacySystem()`:

- `reminderSender`: "Send now" of a reminder uses `hserv\entity\DbUsrReminders::batch_action()` (legacy mailer);
- `userGroupLegacy['hash']`: password hash `hash_it()` (`dbsUsersGroups.php`);
- `userGroupLegacy['delete']`: user / group delete with its checks and clean-up (`DbSysUsers`, `DbSysGroups`);
- `userGroupLegacy['notify']`: approval e-mails `user_EmailApproval()`, `user_SyncCommonCredentials()`.

Replacement: port these functions to `srv/Users` and a srv mailer.

### S4. Reports

`api.php` gives the report and job controllers `hserv\report\SmartyReportRenderer` and
`hserv\report\ReportRecordWriter`. The srv Smarty engine (`SrvSmartyRenderer`) renders; the legacy
renderer is only used to convert templates on import/export, and the writer stores report records.

### S5. Website definitions

`/website/setup` uses `hserv\web\WebsiteDefinitions` (implements `Heurist\Website\WebsiteDefinitionsInterface`)
to import the CMS record types from the reference database with the legacy `DbsImport`.

### S6. Legacy tables (data, not code)

srv writes some data in the legacy tables, in the row format the legacy code expects, so that
both UIs keep working: `recUploadedFiles` (`LegacyFileTable`, `LegacyFileStore`), `usrTags`,
`usrBookmarks`, `usrReminders` (`Records/UserData/Legacy*Table`), `sysUGrps` (`LegacyUserGroupTable`),
and reads `usrSavedSearches` (saved filters, old query formats classified in `SystemQueryService`).
This is agreed (plan 20: tags stay in `usrTags`); plan 28 decides about new tables for
system records.

### S7. Cron

`admin/setup/dboperations/runReportSchedules.php` (legacy folder) runs scheduled reports
through `Heurist\Jobs`. It is a legacy entry point for srv code, which is fine.

## 4. Legacy → new code (the other direction)

For completeness: legacy code also uses srv classes, so these dependencies must be kept when
srv changes: `PrivateInfoCipher` (in `recordSearch.php` and `DbUsrBookmarks.php`, encrypted
private notes), `FrontController.php` (v4 website pages → `WebsiteController`),
`recordQuery.php`, `graph.php`, `MapDataController.php` (srv controllers behind legacy URLs),
and the legacy wrapper of the module bridge in `hclient`.

## 5. Suggested order

1. **C1 preferences** — small, and it removes legacy requests and session writes from the start-up.
2. **S1 session lock** — srv requests open the session read-only (`read_and_close`), then
   measure again with Server-Timing as a logged-in user.
3. **C3 file and icon URLs** — one shared URL helper, then srv routes.
4. **C5 translation**, **S3 legacy closures** — small ports.
5. **C2 custom record view templates** on the srv Smarty engine.
6. **S1/S2/C8 own front controller and authentication** — large; needs its own plan.
