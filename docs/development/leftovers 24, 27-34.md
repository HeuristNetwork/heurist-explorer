# Leftovers of plans 14a, 24, 27a-27n, 29, 30, 32, 33, 34

Review 2026-11-18 (first issued 2026-11-12 as *leftovers 27-33*). The code of all these plans is committed (explorer
`e1d54de`, heurist `97008004b`). Plans 14a, 24, 27a-27n, 28a, 29, 30, 32, 33 and 34 are DONE (files renamed 2026-11-18);
plan 27 (general directions) and 28 (API rules) stay open. Many plans still say *not committed* or *no browser check*
in their old *Status* lines; the DONE line at the top of each plan replaces them.

**Browser checks.** 27a-27h, 30, 32, 33: done by Artem (2026-11-12). 27n: reviewed by Artem in the browser (nine
rounds). 27i-27m and 34: reviewed by Artem in rounds; a separate browser check is not recorded in the plans.

**No blockers** for the next steps.

## Closed

| Date | Item | Result |
|---|---|---|
| 11-12 | Browser checks of 27a-27h, 30, 32, 33 | Done (Artem). |
| 11-12 | 27h real message (PHP mail() / SMTP relay) | Done; Artem checks it on the server. |
| 11-12 | 27a field 2-1202 *Page translations* | Created in reference database 2 (heuristref.net), in CMS home and CMS page. |
| 11-12 | 27f header orientation shown after Save | Accepted: the General Website Styles popup saves anyway. |
| 11-12 | 32 §9.4 duplicate of a page with content in parts | Fixed (`RecordDuplicateService::cleanSplitField`). |
| 11-12 | 30 `css` Smarty mode | Done: plain text, like `txt`. Plan 30 DONE. |
| 11-12 | Add page → Record page gave a blank page | Fixed: opens *Define new record page*. |
| 11-14 | 27c §27 / 27e §12 page templates and starter pages | Done in 27i (templates Cover … Publications, starter pages of a new website, header set). |
| 11-14 | 27h *Contact* page preset | Done: template Contact (27i). |
| 11-14 | Next step 2: module configuration in the CMS editor | Done (inline module forms, Explorer configuration; 27l *Records and selection*). |
| 11-15 | 27f §13.6, 27g action *Saved filter* | Done (27j). |
| 11-15 | 27f §9.5 search box in the header | Done: action menu item *search* (27k). |
| 11-16 | Next step 3: HFilter / Start filter; 27 §9 phase 5 (sync groups, `filter` widget) | Done (27l: Records and selection, Filter widget, Stop). |
| 11-16 | 27 §9 phase 6 built publication; 27g phase 4 sitemap | Done (27m: generated site, sitemap, SEO). |
| 11-17 | 27c §27 inline style editor below the part tree | Done (27n element panel: Configuration / Own style, docked or popup). |
| 11-18 | 27a dialogs of a module take the font size of the site; test pages in `osmak_mapping` | Closed (Artem). |
| 11-18 | 27b §11.8 RecordView renderer in the Details pane | Closed (Artem). |
| 11-18 | 27c §27 inline TinyMCE in the preview | Closed (Artem). |
| 11-18 | 27n phase E (gap, orientation, grey for media; badges width) and the advanced module fields in Explorer | Closed (Artem). |
| 11-18 | User manual for websites (27f §10) | Started: *Website Editor Manual* (`user-manual/websiteEditorManualEng.htm` / `Fre`), opened by Help of the designer. To be completed. |

## 1. Common to all plans

- **Localization.** Check the new texts of 27e-27n in `localization_eng.txt` / `_fre.txt`.
- **User manual.** The Website Editor Manual has the first sections only (site, page, panel).
- **OpenAPI.** `/website`: not written in 27a; 27d added the entity paths. `/external/email` and the file endpoints:
  written (heurist `6d046e956`).
- **Deploy.** The website bundle is built, not deployed (27m, 34).

## 2. CMS (27a-27n)

| Plan | Open item | Kind |
|---|---|---|
| 27c §27 | Module selector in *Add page*. | later |
| 27c §27 | Widgets still missing: story map, crosstabs. Blog template (`pending`). | later |
| 27d | `RecordEditAllTypesTest`: 2 failures for CMS pages. The random test value for *Page translations* has no language code. | test bug |
| 27f §10 | Login / logout and admin actions in the action menu. | later |
| 27g Phase 4 | HTTP caching, RecordView element, field popup source *Record of the page URL*. | later |
| 27h | A built ZIP website hosted elsewhere can not send email (by design). | limit |
| 27i §11.3 | Where to keep the sample images: in the bundle now (about 0.6 MB); option 2 (banners on the reference server, copied as registered files) recommended. | to decide |
| 27l §2.7 | Phase D: bindings between modules (selection → search), Explorer selection on the page (§2.5), records from the selection of another module ("mixed", §12.1.4), a module that gives its own source to the page. | later |
| 27m §6 | Slugs with redirects, language in the path, browse pages with pagination, filter landing pages, crawler check, Open Graph, structured data, rebuild after save. | later |
| 27m §9 | The records of a record page are not rebuilt when a record changes (Generate again). Documentation of the `"site"` mapping for server admins. | later / docs |
| 27 §9 | Phase 7: API for an AI agent. Phase 8: legacy conversion of old websites (the last step). | later phases |

## 3. Reports (30)

- **2-62 file name.** The legacy save, batch update and import do not check read-only fields; the srv guard stops the
  damage.
- **Legacy templates.** Two legacy templates on this server have names with `&` / `'` and can not be reached through
  the new API. Their records need new file names.
- **Website install.** Install of 99-51 / 99-52 / 2-1106 has not been run on a database without them (`old_saratov`).
- **Test edit form.** The *Test edit form* tool stays in Options for a while (14a §19).

## 4. Module configuration (29)

- No open points (§15). The advanced fields of the five module forms were extended on 2026-11-18 (27n §21, §23).

## 5. Field PATCH (32) and Actions tool (33)

- **33 actions.** Only Field values, Ownership, Rebuild titles / calculated fields and Delete work. The other actions in
  the list are disabled: convert to record type, Add link / relation, Tags, Rate, Unbookmark, Verify values, ...
- **33 §6.2, lost jobs.** A job killed by PHP ("lost") has no report, because the partial result is written only at
  the end.
- **Speed (32 §9.3).** A commit is slow on this XAMPP. This is server settings, not code.

## 6. File endpoints (34)

- Browser check list of §7: designer (Add Media, Gallery, TinyMCE Media), an old page opened and saved, a published
  page as a guest, Record View, Map image layers, reports with players.
- Custom CSS of websites (`customCss`) is not rewritten (the author's own CSS). Exports and viewer pages stay legacy.

## 7. Edit form (14a)

- §19.3, consumers left: `apps/reports/src/ui/formDialog.js` (*Save as* in `ReportEditorPanel`), plain sections of the
  Explorer configuration dialog, crosstab settings (with the crosstabs port).
- The test tool *Test edit form* stays in the Options menu for a while.

## 8. Relationship manager (24)

- A target with more relationships than `RELMARKER_LOAD_LIMIT` (500 per direction) is listed (server query), but its
  toolset is missing.
- *Find or Add* of a membership: no Add buttons, so new users can not be added there.
- Many new relationships are saved one by one with a progress dialog (≈ 0.1-0.3 s each); a batch insert endpoint for
  relationship records only if needed.

## 9. Next steps (Artem, 2026-11-18; estimates in `docs/progress-report.md`)

1. Multilevel layout for CMS: Map or another module as the background of a page (19 Nov).
2. Conversion of the websites MapOfTheAbsentees, PFC and DigitalHarlem (20-22 Nov).
3. Later: other Actions (33), other CMS widgets (story map, crosstabs, Blog), use cases on the largest databases.
