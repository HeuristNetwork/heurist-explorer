# Plan 30 — Custom Report system

**Status 2026-11-11: install notice + constant rename §15 (not committed). 2026-11-07: phases 0-5, review round §12 and samples §13 implemented and committed in both repos; not checked
in a browser. One name rule (§14.1) and the 2-62 guard (§14 item 2) done 2026-11-07, not committed. Not DONE: `css` mode, §14.** Follows the rules of
`28 OpenAPI-Rules-and-Database-Structure-Plan.md`; depends on phase 4 of `28a DONE Unify-System-Entities-Plan.md`. Replaces
the API part of plan 12.

## 1. Goal

- The API refers to templates and generated reports by **record id only**; user-provided names leave the API.
- Generated report = a record with a file as its asset, like the image of a user.
- All routes follow plan 28; `/reports/...` goes away.

## 2. Names

| Record type | Entity (code, API) | UI | Note |
|---|---|---|---|
| Custom Report 2-1104 | `report` | Report template, Custom report template | Too many places use `report` to rename it |
| Custom Report Schedule 2-1105 | `output` | Generated report | Replaces `schedule`: a manual run has interval 0, so it is not a schedule. Generic, because the type may hold scheduled exports later: the pointer says what produces it |

## 3. Decisions (Artem, 2026-11-06)

| Topic | Decision |
|---|---|
| Template files | **Keep human-readable names** on disk in `smarty-templates`. No `{id}.tpl`. Only the new OpenAPI must use the record id. Legacy keeps working by name. 2-62 stays on the template |
| Generated files | `generated-reports/{outputId}.{ext}`. `{ext}`, not always `.html`, because formats differ |
| Existing generated files | No renaming, no migration: they exist on the test database only |
| Download name | From the record title. 2-62 is removed from the output |
| Language | Stays on the output: one template, one output per language. A template body can serve all languages (`$heurist->getSysInfo('lang')`, 27e). `execute` takes `lang` |
| Output type | Moves to the template: one template gives one format |
| Manual Generate | Creates an output with interval 0, owner = the user, query stored. Replaces the `_u<id>` files |
| Unregistered templates | Must be registered before any execution |
| Template with outputs | **Can not be deleted** while outputs point to it |
| Test run | **Stays a job**, also in the UI: a wrong template can run forever, even on 10 records |
| `POST /jobs` `report-generate` | Stays |

### Confirmed by Artem (2026-11-06)

| Question | Proposal |
|---|---|
| Publish a test of 50 records as `execute`? | **No.** `execute` is one record only (`recordId`, or `q` limited to 1). The test is `POST /jobs` type `report-preview`, already published, with `previewTimeLimit`. One way to do each thing |
| Time limit on `execute` | Yes, the same `previewTimeLimit`, because one record can hang too |
| Job parameters | `report-generate` takes `{output: id}` only; `report`, `querySource`, `query` are removed, because a manual Generate saves an output first. `POST /output/{id}/execute` starts the same job (plan 28 §2.3) |

## 4. Template names and "Save as"

Confirmed by Artem, 2026-11-06.

- **Title (2-1)** is the name people see: any language, can change at any time. A change of title never renames the
  file (true today as well).
- **File name (2-62)** is technical: set once when the record is created, then **read-only** in the new editor.
- **Rename:** none in the new API. This removes the non-atomic rename (`ReportEntityHandler::afterSave`), and stored
  names (map layers 2-922, module configurations) can not break. Legacy `renameTemplate` stays for the legacy UI.

**File name from the title** uses the existing `ReportService::fileNameFromTitle` and `ReportTemplateStore::uniqueName`:

| Title | File |
|---|---|
| `Team members` | `Team members.tpl` |
| `Café (2024)` | `Cafe (2024).tpl` (transliterated) |
| `A & B / C` | `A _ B _ C.tpl` (other characters become `_`) |
| `Отчёт`, `报告` | `report.tpl`, then `report_1.tpl` if nothing is left after transliteration. Depends on the server's `iconv`; a partial transliteration is possible |
| Second `Team members` | `Team members_1.tpl` |

A name like `report_1.tpl` is harmless, because the record is found by id and title. Length is cut to 100 characters.

**Save as:** `POST /report/{id}/duplicate` with optional `{title}`.

1. The server creates the new record and copies the file under a name made from the new title.
2. Unsaved text in the editor is then sent with `PUT /report/{newId}/asset`.

`RecordDuplicateService` runs no handler hook today (see §7), so this plan adds one. Without a title: the generic
duplicate title, and the file name from it.

## 5. Records

Artem changes these in reference database 2.

| Change | Fields |
|---|---|
| Output type moves to the template | DT_FILE_EXT 2-29 from 2-1105 to 2-1104 |
| File name removed from the output | DT_FILE_NAME 2-62 leaves 2-1105, stays on 2-1104 |
| One output = one file | DT_REPORT 2-1183 becomes single value (`ReportRepository:266-268` makes one row per value today) |
| Stays | DT_LANGUAGE 2-967, DT_QUERY_STRING 2-12, DT_INTERVAL_MINUTES 2-1184 on 2-1105 |
| Remove | 3-1083 from 2-1105 (already noted) |
| Rename | Title of 2-1105 to Generated report |

## 6. Endpoints

| Current | Target |
|---|---|
| `GET /reports?scope=` | `/report?q=` or `/sys?q=[{"t":"report"}]`; card reports by DT_IS_CARD_VIEW 2-1182 |
| `GET /reports/schedules` | `/output?q=[{"f:<DT_REPORT>":id}]` |
| `GET /reports/generated` | Removed. Output records carry file status (exists, size, date) |
| `DELETE /reports/generated/{file}` | `DELETE /output/{id}/asset` |
| — | `GET /output/{id}/asset`, `?download=1` gives the title as the file name. Guests by record visibility |
| `POST /reports/setup` | `GET\|POST /report/setup`: check and install 2-1104, 2-1105; GET lists unregistered files, POST registers them |
| `POST /reports/import` | `POST /report/import` |
| `GET /reports/{ref}` | `GET /report/{id}` |
| `DELETE /reports/{ref}` | `DELETE /report/{id}/asset` |
| `DELETE /report/{id}` | Same route, with 409 while outputs point to it |
| `GET\|PUT /reports/{ref}/template` | `GET\|PUT /report/{id}/asset` |
| `GET /reports/{ref}/export` | `GET /report/{id}/export` |
| `GET /reports/{ref}/render?rec=N` | `GET\|POST /report/{id}/execute?recordId=N&lang=`. Guests: card reports and visible records only |
| `/schedule/{id}` | `/output/{id}`: done by 28a, no alias |
| `POST /jobs` `report-preview` | Stays. `{report: id, body?, ids, language?}`; `report` = record id, never a file name. Unsaved text is members only |
| `POST /jobs` `report-generate` | Stays. `{output: id}`. `POST /output/{id}/execute` starts the same job and gives the job id |

**Delete rule.** `ReportEntityHandler::beforeDelete` counts all outputs of the report, also those the user can not see,
and refuses with 409 and their number. `DELETE /report/{id}/asset` has the same rule. The hook also runs on
`DELETE /records/{id}`. A legacy record delete skips it, so the job must give a clear error when the template is
missing.

## 7. Phases

### Phase 0 — Security (can go first)

Found by reading the code, not tested, except where noted.

| Item | Fix |
|---|---|
| `ReportTemplateMgr::renameTemplate` builds SQL from names (`:343`, `:353`); `sanitizeFileName` keeps `'` | Prepared statements |
| The same function uses `preg_replace` with `~...~g`, which returns NULL (run in PHP), and the NULL goes to `dtl_Value` after the file is renamed | Remove `g`, check the result |
| `isExecutionAllowed` (`hserv/controller/ReportController.php:225-229`) returns true before the login check, so a guest may run `template_body` | Check login first |
| Legacy controller: `get`, `list`, `export` have no guard; any login can save, delete, rename any template (`:106`, `canEditTemplates`) | Check the owner of the record |
| `/reports/{name}.tpl/render` skips the visibility of the report (`ReportService.php:222-225`) | Gone with phase 5; can be closed sooner |
| A duplicate shares 2-62, so the copy can overwrite the original (`RecordDuplicateService:80`, no hook) | Duplicate hook, §4 |
| A legacy `recordSave` that writes 2-62 can point to another report's file (handler bypassed) | Check in legacy save |
| Five name rules disagree: `asciiName`, `normalize`, `outputName`, `outputBase`, `sanitizeFileName`; `normalize` allows `'`, `&`, `#`, `%`, `;`, which reach unescaped places (`websiteScriptAndStyles.php:88`) | One rule in `ReportTemplateStore`. Still needed, because templates keep names. Output names go away |

### Phase 1 — Server

- `ReportEntityHandler::action`: `asset`, `execute`, `export`, `import`, `setup`. Today it has hooks only.
- `RecordEntityRegistry` (`schedule` → `output` done by 28a): `execute` of output = job `report-generate`, of report = handler.
- Guest GET for `execute` and `asset` (28a phase 4).
- `ReportService::resolve`: record id only on the new routes.
- `POST /output/{id}/execute` needs the **edit right** on the output, because today any member can put private records
  in a public file (`prepareGenerate`). The job runs with the rights of the user; cron stays anonymous.
- Duplicate hook, 409 rule. `/reports` stays alive.
- Registration of unregistered files in `/report/setup`; owner proposal: the database owners group.

### Phase 2 — Client

- `apps/reports`: `ReportApi`, `ReportsApplication` (`reference()` by id, `outputPrefix` removed), `ReportManager`,
  `SchedulesDialog`, generated files shown from output records, Save as, read-only file name.
- Render URLs: `reportRenderUrl`, `shared/src/recordview/RecordContentProvider`, `apps/recordview/.../RecordContentProvider`,
  `apps/map/.../PopupProvider`, `apps/website/src/siteWidgets`.
- `ReportTemplateProvider`: list through `/sys`; option value = record id.
- Website: `widgetForms`, `CmsDesigner`. `settings.files` `{lang: file}` becomes `{lang: outputId}`;
  `PageContent::report` reads through the output.
- **Team preset is broken now:** `CmsDesigner.js:1062` calls the removed `POST /reports`. Fix: search by 2-62, else
  `POST /report/0`. Can be fixed sooner, separately.
- Report and output edits through `/{entity}`, not `/records` (28a phase 5).

### Phase 3 — Names in stored configurations

| Place | Holds | Action |
|---|---|---|
| Module settings `popupTemplate`, `cardTemplate`, `viewTemplate`, `template` | File name | `ReportTemplateProvider` turns a name into an id when reading; a new save stores the id |
| Map layer 2-922, website home 2-922 | File name | Stay (legacy reads them). Client turns the name into an id, same way |
| Website cards `settings.template` | id or name | New saves: id. Server reader `WebsiteRepository` keeps both (internal, not API) |
| Team preset `Team_member.tpl`, plan 27e §4 | File name | Stays: record ids differ per database |
| Legacy widget JSON, `rps_Template`, `href="123/x.tpl"`, `?template=` | File name | No change, files keep their names |

### Phase 4 — Generated files

- New files are `{outputId}.{ext}`; `ReportGenerateJob`, `dueSchedules`, `generatedInfo`. No migration.
- If the output type of a template changes, delete the old file on the next generate.
- Manual Generate: `POST /output/0`, then `execute`. A query with parameters is stored with its values filled in, because
  an output can not have `$X$` (`checkQuery`).
- The manual Generate dialog asks for the language and saves it on the output (new: today a manual run has no language,
  `ReportJobPlanner.php:145`). The job reads the language from the output record and takes no language parameter, so the
  file always matches its record. `execute` and `report-preview` keep their language parameter, because they save no file.
- Legacy `usrReportSchedule` rows keep working by name, in the same folder.

### Phase 5 — Remove

`/reports` routes and `ReportController`; `assignGenerated`, `outputBase`, `scheduleOutput`, `deleteGenerated`, the rename in
`afterSave`, `keepFile`; job parameters by name. OpenAPI, `srv/Reports/_README.md`, a note at the end of plan 12.

## 8. Other bugs found

- `css` is in `ReportRepository::FORMATS` but not in `SmartyTemplateRunner::MODES`, so it runs in html mode.
- `generated-reports` URLs are refused on installs with the root `.htaccess` `Deny from all`
  (`install_heurist.sh:128`; not tested). `/output/{id}/asset` solves this.
- Converted legacy schedules change file name (`Foo` + `bar` was `bar.html`, is `Foo bar.html`), and rows with an empty
  `rps_FileName` run twice. Both stop mattering when output names go away, for new outputs.

## 9. Verification

- PHP: `tests/ReportsApiTest`, `ReportEngineCompareTest`, new cases: delete refused with outputs, duplicate with a non-Latin
  title, guest `execute` on a private report.
- A run of `runReportSchedules.php` on `osmak_mapping`.
- `npm test`, all builds.
- Browser: Report tool (new, Save as, test, Generate, schedule, delete), website report and cards widgets, Map popups, Data
  and Record View templates.
- Legacy: open a report in the legacy viewer, and a legacy page with a report widget.

## 10. History

- 2026-11-06 — draft 1 from Artem's request, two question rounds and the review of both repositories.
- 2026-11-06 — client questions answered, phases 0-5 implemented, §11.

## 11. As implemented (2026-11-06)

**Client decisions (Artem).** One dialog *Generated reports* replaces the list of files and the Schedules dialog
(`apps/reports/src/ui/OutputsDialog.js`); the Schedule button is gone, the caret beside Generate opens the dialog. Unregistered
templates stay in the list with Register and Delete only.

**Generate (Artem's flow).**

1. Choose the records: current result or Query Source.
2. Outputs of this template with the same query are looked for (`sameQuery`: JSON text and values compare equal).
3. If there are any, a popup lists them (Language badge, Name, Date generated, Size, Scheduled): a row regenerates it, *New
   output* opens the record editor.
4. If there are none, the record editor opens at once: the user's own and hidden, with the query filled in.

The language is chosen in the record editor, so it is not in the Generate form (changes §7 phase 4).

**Server.**

- `ReportController` and all `/reports` routes are removed. `ReportEntityHandler` has the actions, `ReportOutputStore` the
  files, `RawResponse` an answer that is not JSON (HTML, a file), `ReportInUseException` the 409.
- `GET /report/setup` has the state, settings and unregistered files. `DELETE /report/setup?file=` deletes an unregistered file:
  the only place a name is sent, because such a file has no record.
- A search of `report` or `output` adds `meta.items` by record id: what a client shows besides the record format.
- `RecordEntityHandler` got `describeMany`, `afterDuplicate`, `allowsGuest`, `acceptsUpload`.
- `report-preview` takes `report` = record id. `report-generate` takes `{output}` and needs the edit right on the output.

**Deviations from §7.**

1. **Stored names (phase 3):** not turned into ids at run time. `buildReportRenderUrl` uses the API for a numeric value; a stored
   name goes to the legacy `?template=` URL, as `def/` templates do, so module and map code stays synchronous. The module
   configuration form turns a stored name into the id when it opens (term `aliases`, `applyTermAliases`); a save stores the id.
2. **Legacy `recordSave` writing 2-62 (phase 0):** not done. It can still point a report at the file of another report.
3. **Name rules (phase 0):** not one rule. `asciiName` for new names and `normalize` for existing ones remain; the rules of
   output names are gone.
4. **Group members in the legacy rights:** `requireTemplateRights` lets members of the owner group through, as srv does.
   `hasAccess` alone allows only the admins of a group.

**For Artem in reference database 2 (§5).** The code works before and after these changes: the format is read from the
template, else from the output.

- Add DT_FILE_EXT 2-29 to 2-1104, remove it from 2-1105.
- Remove DT_FILE_NAME 2-62 from 2-1105. Make DT_REPORT 2-1183 single value. Remove 3-1083. Rename 2-1105 to Generated report.

**Checks.** JS 1,644 pass, 8 builds verified. PHP suites with writes pass (ReportsApi 75, JobRunner 43, WebsiteContent 30 and
those of 28a). A run on `osmak_mapping` through the job classes: record, template, output, job done, `208023.html` read back,
report delete refused with 409, output delete removed the file, report delete removed the template. curl as a guest: `/reports`
401; `/report`, `/output` 200; `/report/{id}/asset` 401.

**Not checked:** the browser (dialog, Generate flow, website report form, Team preset); routes as a logged-in user through
`api.php`; multipart `POST /report/import` over HTTP; a guest `execute` of a card report (the test database has no report records).

**Bug left (§8):** the `css` format has no Smarty mode.

## 12. Review round (Artem, 2026-11-07)

Implemented in both repos, not committed, not checked in a browser, bundles not deployed.

- **One dialog.** The Generate form and the choice of outputs are gone (`reportForms.js`, `openOutputChoice`). Generated reports has a New
  mode: Source (Current result with the count, or Query Source with its selector), the outputs of the template with this query under
  the hint *There are already generated reports...*, and *Generate New Report*. The table stays hidden when there are none.
  Toolbar Generate opens New mode; the caret opens it at once for a template without generated reports; *New Report* switches to
  it, so an output is always made with a query. The bolt in New mode and a new output close the dialog, and the job is followed in the viewer.
- **Table.** Wider dialog, `Lang`, max width with ellipsis for Name, Report, Query. Icons: Edit, Delete, gap, Open, Download. *Delete the
  generated file* is hidden; `ReportApi.deleteOutputFile` and the server action stay.
- **Captions.** "Template" in the toolbar: *Create a new report template*, *Delete report template*, *Select a template*, *Select template*.
  Unregistered template: *This template is not registered. Create a record to use it.*
- **Count of the current result.** Always from the server for the exact query (`queryCount`). The host no longer sends `total`: `meta.count` of a
  record type search comes from the counts read once when Explorer starts, so it can be out of date. The Export tool and Map still read `meta.count`.
- **`term` is translated** (`ReportDefinitions::termFullLabel($id, $lang)`, srv only): the full path `Parent.Child`, each level translated, the label when
  there is no translation. `label` is not changed; it stays for old templates. In the database default language nothing changes. Compare
  `.internalid` or `.code` in templates, not text: 8 of the templates on this server compare `.term` with text (`{if $r.f978.term == 'Terminé'}`); they
  stop matching for another report language when the term has a translation. Legacy `hserv/report/ReportRecord.php` keeps `term` untranslated.

## 13. Sample templates (2026-11-07)

Not committed, not checked in a browser. In `heurist/admin/setup/dbcreate/smarty-templates/` (copied into new databases by `DbUtils`):
`Record card.tpl`, `Record extended view.tpl`, `Team member.tpl`. Fields by `$heurist->constant()` / `dty_id()`, so one `.tpl` works in any database. Role = field
*Person role* 1252-619, no role in a database without it. `teamReportBody` (website template Team) has the same design.

Without JavaScript authorisation reports go through HTMLPurifier, which removes `<style>` and every property outside its fixed list. So templates use inline styles.
`OutputSanitizer` (for all reports) sets `CSS.Proprietary` for `border-radius`, and `allowLayoutStyles` adds flex and grid: `display` (no `none`), the flex and grid properties,
`object-fit`, `overflow-wrap`. Keywords by list, other values by `ReportCssValue` (no `url`, `expression`, `var`). They are set on the definition of the run, so the definition cache
is not touched. Samples use flex (card, team) and grid (extended view). Test: heurist `tests/SampleTemplatesTest.php`.

## 14. Leftovers (review 2026-11-07)

The plan is DONE when these are closed or dropped by Artem.

1. **`css` format has no Smarty mode** (§8): still true, `SmartyTemplateRunner::MODES` is `html, js, txt, csv, xml, json`,
   so a `css` report runs in html mode.
2. **Legacy `recordSave` writing 2-62** (§11 deviation 2, security of phase 0). The legacy record editor saves 2-62 of a
   Custom Report like any other field, without `ReportEntityHandler` (which sets the name once and keeps it unique). So a
   user who may edit report A can set A's file name to the file of report B, which they may not edit. Then through the
   new API, with the rights on A only:
   - `PUT /report/A/asset` overwrites B's template (`ReportService::saveTemplate` checks A, not who else uses the file);
   - `DELETE /report/A/asset` deletes B's template (`deleteTemplate`, same).
   A record delete of A is safe: `afterDelete` keeps a file used by another record. A report execute of A just runs B's
   template, which the user could read anyway.
   **Done 2026-11-07 (Artem: read-only field + guard; heurist repo, not committed):**
   - Legacy record editor (`hclient/widgets/entity/manageRecords.js`): 2-62 of `RT_REPORT_TEMPLATE` is `rst_Display =
     'readonly'`, hard-coded as in the new editor (`recordEditStructure.js`), so every database at once. This stops the
     normal way only: the legacy save (`recordModify.php`), batch update (`recordsBatch.php`) and imports do not check
     read-only fields.
   - Guard `ReportService::assertOwnFile` (srv): `saveTemplate` and `deleteTemplate` refuse (403) a file that more than one
     report record uses (`registeredFiles()`). It does not stop the change of 2-62 (that is hserv); it stops the damage:
     whatever way two records got one file, the right on one report never changes or deletes the other's template.
     The user gives the report its own file with Save as. Test: `ReportsApiTest` (2-62 of a copy set to the original's
     file in the database, PUT and DELETE asset 403, file unchanged), 91 pass with `--write`.
3. ~~**One name rule**~~: done 2026-11-07, §14.1.
4. ~~**Reference database 2**~~: done by Artem, 2026-11-07.
5. The *Test edit form* tool stays in Explorer's Options menu for a while (Artem, 2026-11-07; plan 14a §19).

### 14.1 One name rule (2026-11-07, heurist repo, not committed)

- `ReportTemplateStore` holds the only rule, for new and stored names: `NAME_PATTERN` = letters of any language, digits,
  spaces and `- _ ( ) . , @`; first character a letter, a digit or `(`; at most 100 characters without `.tpl`
  (`NAME_MAX`). Refused: path and file system characters and `' & # % ; +`. `normalize()` / static `checkName()` check it,
  `nameFromTitle()` (was `ReportService::fileNameFromTitle`) makes a name from a title: transliterated where `iconv`
  can (§4 table unchanged), other characters `_`, `report.tpl` when nothing is left. `ReportService::asciiName` removed;
  a given name in the record (2-62) follows the same rule (`ReportEntityHandler::fileName`, message `NAME_RULE_TEXT`).
- **Change:** a name with accents, `.`, `,` or `@` is now allowed when given (was A-Z only), and a stored name with
  `&` or `'` is no longer reachable through the new API: `exists()` is false for it, `listFiles()` (unregistered
  templates) leaves it out. Legacy keeps working by name. On this server 2 of 564 templates are such names
  (`UseItem =&gt; Use.tpl`, `Use-&gt;Mss.tpl`); a report record that points to one needs a new file name.
- Client: `FILE_NAME_CHARS` (`apps/reports/src/ui/formDialog.js`) is the same set.
- Legacy `hclient/widgets/cms/websiteScriptAndStyles.php`: the record view template name and target are written into
  the page with `json_encode`, not inside `'...'` (a legacy name may hold `'`).
- OpenAPI text of 2-62 updated. Tests: `ReportsApiTest` (88 with `--write`; rule, name from title, legacy names not
  listed), `JobRunnerTest`, `WebsiteContentTest`, `SampleTemplatesTest`, `DataAccessBoundaryTest` pass; `test:reports`
  33 pass.

## 15. Install notice and constant names (Artem, 2026-11-11; not committed, no browser check)

- **Install notice.** When `GET /report/setup` says `installed: false`, the Reports module shows, with nothing
  selected, "In order to work with the new report system you need to install the new record types (Report template,
  Report output)." and the missing codes. A database manager (`canSetup`) gets an **Install** button
  (`POST /report/setup`, then the setup report); other users are told to ask the database owner. Template files
  without a record are still listed. New / Register keep the confirm (`ReportManager.ensureInstalled`, same text).
  `ReportViewer.showSetup`, `ReportsApplication.data.installed` is `null` until the list is loaded.
- After the install the module and the host load the definitions again: bridge method `definitionsChanged()`
  (`ReportsHostAdapter`, Explorer `_reportsBridge` resets its `/def/snapshot` cache); the server cache is cleared by
  `DbsImport` (`cleanDefCache`).
- **Constant names:** `RT_CUSTOM_REPORT` → `RT_REPORT_TEMPLATE` (2-1104), `RT_REPORT_SCHEDULE` → `RT_REPORT_OUTPUT`
  (2-1105), same as the entities `report` / `output` and "Generated report". No aliases; renamed in both repos
  (`hserv/consts.php`, `srv/Definitions/SystemConstants.php`, srv Reports, entity registry, legacy
  `ReportTemplateMgr.php` and `manageRecords.js`, client shared data and tests). DONE plans keep the old names as
  history. The type names in reference database 2 ("Report template", "Report output") are changed there by Artem.
- **Fix 2026-11-11:** `/{entity}/setup` answered 404 ("Unknown entity ... record type is not in this database") when
  the record type was missing, so the install could never run. `RecordEditController::executeEntity` now lets
  `setup` of a known entity through without its record type (also `/website/setup`); other calls stay 404.
  `tests/ReportsApiTest.php` runs on a database without the types (`--db=old_saratov`: setup state, missing list,
  then stops unless `--write`).
- **Review 2026-11-11:** (1) Install shows a modal popup "Importing..." with the rotating icon (`HMsg.showMsgDlg`,
  `preventClose`, shared `loadingIndicator`) until the setup report replaces it. (2) Delete of a template without a
  record failed with "invalid JSON ... fileDownload.php?file=...": the root router (`htdocs/index.php`, from
  `movetoparent/index.php`) runs `RecordResolver` / `FileResolver` on every request, API calls too, and `FileResolver`
  redirects any `?file=` (also `thumb`, `icon`, `asset`, `disclaimer`) to a legacy script. The parameter of
  `DELETE /report/setup` is now `name` (client, handler, OpenAPI, `ReportsApiTest`). The root router now skips the
  resolvers for API calls (script `hserv/controller/api.php`; `movetoparent/index.php`, to be copied to the web root).
- **Websites the same way (2026-11-11):** shared `shared/src/ui/setupNotice.js` (`setupNotice()` = the notice with
  Install / "ask the owner", `runWithBusyDialog()` = modal "Importing..." popup), CSS `.h-setup-notice` in `heurist-ui.css`;
  used by the Reports module and the Website manager (`WebsiteManager.renderSetup` / `install`, shown also when 99-51 /
  99-52 are missing; the list is built again after the install). `WebsiteApplication.setup` calls the bridge
  `definitionsChanged()` and reads the state again (`initialize`). Server: `hserv/web/WebsiteDefinitions::install`
  imports missing record types 99-51 / 99-52 from database 2 (as the legacy `CmsManager.checkRequiredRecordTypes`),
  then the format 4 fields. Not tested on a database without 99-51.
- **2-1106 in the website setup (2026-11-11):** without the record type Registered file (`RT_REGISTERED_FILE`) the file
  fields (logo, banner) fall back to the value picker instead of the record manager of files (`HInputFile._canBrowse`).
  `WebsiteSetup::IMPORT_TYPES = ['2-1106']`: `WebsiteEditService::status` lists it as missing, `install()` imports it
  from database 2 (third parameter `$importTypes` of `WebsiteDefinitionsInterface::install`, no website fields added).
  Checked: `old_saratov` status `missing: ["record type 2-1106"]`; local `heurist_cd` has 1106. Install not run.
