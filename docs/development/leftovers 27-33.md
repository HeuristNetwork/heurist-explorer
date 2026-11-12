# Leftovers of plans 27a-27h, 30, 32, 33

Review 2026-11-12. The code of all these plans is committed in both repos. Many plans still have *not committed*
or *no browser check* in their *Status* lines; those lines are out of date. **Browser checks: all done by Artem
(2026-11-12).** Plans 27c and 28a are DONE.

**No blockers** for the next steps (page templates, module configuration, HFilter).

## Closed 2026-11-12

| Item | Result |
|---|---|
| Browser checks of 27a-27h, 30, 32, 33 | Done (Artem). |
| 27h real message (PHP mail() / SMTP relay) | Marked done; Artem checks it on the server. |
| 27a field 2-1202 *Page translations* | Created in reference database 2 (heuristref.net), in CMS home and CMS page. |
| 27f header orientation shown after Save | Accepted: the General Website Styles popup saves anyway. |
| 32 §9.4 duplicate of a page with content in parts | Fixed: parts joined, cleaned as a whole, split again (`RecordDuplicateService::cleanSplitField`). |
| Add page → Record page gave a blank page | Fixed: opens *Define new record page* (Smarty report selector); catalog entry no longer `pending` (27g round 3). |

## 1. Common to all plans

- **Localization.** Check the new texts of 27e-27h in `localization_eng.txt` / `_fre.txt`.
- **User manual.** There is no user manual for websites yet (27f §10).
- **OpenAPI.**
  - `/website`: not written in 27a; 27d added the entity paths.
  - `/external/email`: no OpenAPI entry yet.

## 2. CMS (27a-27h)

| Plan | Open item | Kind |
|---|---|---|
| 27a | Dialogs that a module appends to `body` take the font size of the site. | small bug |
| 27a | Test pages in `osmak_mapping` (207627 is already deleted). To clean up. | housekeeping |
| 27b §11.8 | Details pane: use the RecordView renderer for icon / logo / author? | to discuss |
| 27c §27 → 27e | **Page templates.** Cover, Landing, About, Features, Discover, Blog, Contact and Publications are `pending` (blank page). Blank, Team and Record page work. | **next step 1** |
| 27c §27 | Inline TinyMCE in the preview. Inline style editor below the part tree (§25.1). Module selector in *Add page*. | later |
| 27c §27 | Widgets still missing: story map, crosstabs. | later |
| 27d | `RecordEditAllTypesTest`: 2 failures for CMS pages. The random test value for *Page translations* has no language code. | test bug |
| 27e §12 | Whole-site templates: not in 4a. | **next step 1** (starter pack) |
| 27f §9.5 | Search box in the header. | later (with HFilter) |
| 27f §10 | Login / logout and admin actions in the action menu. Translations of action menu labels in the designer. | later |
| 27f §13.6, 27g | Action *Saved filter* (action menu, cards, gallery) is disabled. | **next step 3** |
| 27g Phase 4 | HTTP caching, sitemap.xml, RecordView element, field popup source *Record of the page URL*. | later |
| 27h | The *Contact* page preset. | step 1 |
| 27h | A built ZIP website hosted elsewhere can not send email (by design). | limit |
| 27 §9 | Phase 5: PageController, sync groups, the `filter` widget, routes. Phase 6: built publication completed. Phase 7: API for an AI agent. Phase 8: legacy conversion. | later phases |

## 3. Reports (30)

Plan 30 is not DONE because of these items:

- **`css` mode.** Not done: `SmartyTemplateRunner::MODES` has no `css`, so a css report runs in html mode
  (HTML cleaning, TinyMCE styles added). Fix: one line, `css` handled as plain text like `txt`.
- **2-62 file name, closed.** The read-only field and the guard are done. The legacy save, batch update and import
  still do not check read-only fields; the srv guard stops the damage.
- **Legacy templates.** Two legacy templates on this server have names with `&` / `'` and can not be reached
  through the new API. Their records need new file names.
- **Website install.** Install of 99-51 / 99-52 / 2-1106 has not been run on a database without them (`old_saratov`).
- **Test edit form.** The *Test edit form* tool stays in Options for a while (14a §19).

## 4. Field PATCH (32) and Actions tool (33)

- **33 actions.** Only Field values, Ownership, Rebuild titles / calculated fields and Delete work. The other
  actions in the list are disabled: Add link / relation, Tags, Rate, Unbookmark, Verify values, ...
- **33 §6.2, lost jobs.** A job killed by PHP ("lost") has no report, because the partial result is written only
  at the end.
- **Speed (32 §9.3).** A commit is slow on this XAMPP. This is server settings, not code.

## 5. Next steps (Artem, 2026-11-12) and their dependencies

1. **Page templates and a starter pack for websites.**
   - Nothing blocks this.
   - Needs one decision per template: content, and which shipped Smarty card templates it uses. Blog and
     Publications need card / list templates; Contact uses the email form.
   - Whole-site templates (starter pack) are new: plan 27e covered single pages only.
2. **Module configuration in the CMS editor.**
   - Today the designer calls the bridge `openConfiguration` (plan 29). It works only inside Explorer.
   - Nothing blocks this. Decide what "in the CMS editor" adds: inline summary, defaults per page, or the shared
     `ModuleConfigurationDialog` without Explorer.
3. **HFilter and the action "Start filter / search".**
   - HFilter exists: `shared/src/widgets/filter/`, used by published Explorer.
   - As a site widget that drives *other* modules on the page, it is plan 27 phase 5 (PageController, sync groups).
     This is the largest of the three steps and needs its own plan.
   - A simple first step: a filter that opens a page with a module and the query in the URL. This needs no
     PageController.
