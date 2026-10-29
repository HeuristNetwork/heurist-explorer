# Heurist Explorer — Progress Report

*Status on 29 October 2026 (first issued 2 October, updated 8, 18 and 26 October). Work started 14 September 2026.*

## Done

| # | Feature | Completed |
|---|---------|-----------|
| 1 | **Independent client modules** (Map, Timeline, Graph, Data table, Record view). Each one can run on its own, inside the old Heurist interface, or inside the new Heurist Explorer. | 16 Sep |
| 2 | **Record view** with a default built-in layout: media viewers, tags, history, linked and related records. | 27 Sep |
| 3 | **DataSource container**: one object that holds the query and how the results are shown on map, timeline and table columns, plus its filter form. Includes parameterised queries. | 21 Sep |
| 4 | **Filter Builder and Filter Form** — replace the old faceted searches. The new form can open old faceted searches and old saved filters. | 27 Sep |
| 5 | **Value picker for filters**: lists of terms, users, groups, date and number ranges with sliders, record counts loaded on demand. | 26 Sep |
| 6 | **Saved filters and data sources grouped by owner** (personal, group, public). | 27 Sep |
| 7 | **Inline query helper and translator**: type a query by hand with suggestions, and see it in plain language. | 24 Sep |
| 8 | **Compact mode** for phones and small screens. | 27 Sep |
| 9 | **Expansion rules** for Graph and Data: show records linked to the current results, level by level; automatic and "smart" expansion; search by relationship type. | 30 Sep |
| 10 | **Record pop-ups** shared by Map, Graph and Data; Explorer settings and layout. | 1 Oct |
| 11 | **Query trace and termination**: see what a slow query does (trace panel), stop it in the browser and on the server (time limit, cancel), faster link search, guards for Map and Graph on large results. | 1 Oct (trace panel 6 Oct) |
| 12 | **Query builder improvements** found during testing: compact query editor in five panes, placement west or north, layout menu, cosmetics. | 3–6 Oct |
| 13 | **Getting started**: the last query is reopened at start, welcome pop-up on the first visit, guided tour of Explorer. | 3 Oct |
| 14 | **Smarty reports**: report templates and schedules as records, new Report tool in Explorer with a full-screen template editor and field tree, background jobs with progress and cancel, scheduled reports; Smarty engine moved to the new server code (same output as the old one). | 5–7 Oct |
| 15 | **Export** as a background job (progress, cancel, download when ready): CSV/TSV, JSON, GeoJSON, KML, XML (HML), Gephi. New Export tool in Explorer. The JSON export uses the same format as the new records API. | 6–9 Oct |
| 16 | **Parameterised queries in Map and Timeline**, restored when the page is opened again; simpler (flat) field tree. | 8 Oct |
| 17 | **Record editing**: new server API to create, change and delete records, with checks of the values; new record edit form in Explorer, now used for **every record type** (first only system records). Title masks and calculated fields are computed by the new server code (same result as the old code). *Add record* and *New* in Explorer. | 12–25 Oct |
| 18 | **Data access layer** in the new server code: one place reads database definitions, records, files and users; an automatic test checks that no other code reads these tables directly. | 13 Oct |
| 19 | **Simpler interface** (close to Heurist 7), on by default: fixed layout, toolbar buttons inside the panes, Report and Export tools as tabs in the panes; the old Filter builder and faceted search wizard are used there. The full interface stays available in the settings. | 13–15 Oct |
| 20 | **Symbology and thematic map editors** ported from the old code; used by the Map module and the record edit form. | 13–17 Oct |
| 21 | **Edit forms made from a description (JSON)**: one form engine for the record editor and for settings dialogs; forms can show or hide fields by other values; layout options (labels beside or above, fields side by side); separator groups as in the old editor. Record summary pane (owner, linked records, notes). | 14–21 Oct |
| 22 | **Date editor** ported from the old code: uncertain dates, date ranges, fuzzy dates, carbon / radiometric dates. | 17 Oct |
| 23 | **Records manager**: list, search, add and edit records of any type in one window; pointer fields can browse or add the target record; record access (owner, visibility) form; Explorer can open as a stand-alone record editor. | 19–22 Oct |
| 24 | **Relationship fields** (relmarkers): choose relation type and target, edit or view the target and the relationship record; fields from other records in a group "Relationships from other records". | 21–22 Oct |
| 25 | **Relationship manager**: one-to-many relationships edited in a list, "Find or Add", changes saved at once; group membership edited the same way. | 24 Oct |
| 26 | **Large records**: configurable limits for Record view and edit form, groups loaded on demand, field values shown in parts, Structure pane for long forms. Tested on very large records. | 22 Oct |
| 27 | **Tags, private notes (bookmarks) and reminders** in the record summary, with a tag manager. Private notes are encrypted; reminders can be sent at once. | 22–23 Oct |
| 28 | **Files**: chunked upload, file editor with a fixed structure by file type, files manager, file replacement; MIME type vocabulary prepared for review. | 19–24 Oct |
| 29 | **Users and groups managers** in Explorer, with user and group images and group members. | 23–24 Oct |
| 30 | **Stored text security policy**: one rule for which HTML is kept in text fields and how it is shown. | 23 Oct |
| 31 | **Rich text and translations**: text fields with an HTML editor (TinyMCE) or a code editor (CodeMirror); translated values per language, with automatic translation (DeepL); HTML shown safely in Record view. | 24–25 Oct |
| 32 | **Parent – child records**: the parent of a child record is found from its links (no stored reverse field); Parent field and warning in the edit form; parent fields in the field tree, title masks and reports. | 24–25 Oct |
| 33 | **Record editor improvements**: page navigation, *Dupe* (duplicate record), read-only form without edit rights, footer and messages; map field for an extent or any map feature; Explorer starts faster (users and tags are loaded on first use). | 27 Oct |
| 34 | **File types and media players**: file type taken from the extension, MIME type set by the server; players for YouTube, Vimeo and SoundCloud; tiled image ZIPs keep only the tile images. | 28 Oct |
| 35 | **Website format v4** (CMS, plan 27a): new format for websites and pages (structure, styles and settings kept apart), live pages at `/{db}/site/{site}/{page}`, stand-alone Map, Timeline, Graph and Explorer pages. Old interface: v4 sites are hidden and new v3 websites can not be created. | 26–29 Oct |
| 36 | **Website manager** (plan 27b): create, check and publish websites in a full-screen window; download a built site as ZIP; *Publish this view* in Explorer — a public page with Explorer that uses public filters only, without editing tools. | 26–28 Oct |
| 37 | **Module settings** (plan 29): one settings form for Map, Timeline, Graph, Data table and Record view, with Reset; publish a module to a new page or update an existing page from Explorer; settings API for every module (also gives a description for AI agents). | 28 Oct |
| 38 | **Security fixes**: login tokens, access checks for all file types and scratch files, report templates protected from guests. | 26 Oct |
| 39 | **New server API** (`srv/`) behind all of the above — a clean replacement for the old server code. Record format and editing now also for system data (`/sys`: tags, bookmarks, reminders, users, groups, files). | ongoing, with each item |
| 40 | User manual and developer documentation. | ongoing |

All work above is committed (explorer `41e0134`, heurist `9a7cf8ea8`).

## In progress

| Task | Expected |
|------|----------|
| **Browser checks** of the latest work: website manager and published Explorer, module settings forms, media players, Add record / New, rich text editors (format menu, Align, menus inside dialogs), parent – child records, and earlier items (simpler interface, symbology, date editor, reports, export); testing query speed on large databases | with the use cases |
| **Edit forms**: module settings are done; next the report, schedule and crosstab dialogs; remove the test tool | next week |
| **Saved filters** in the new record format (last part of the system data move) | next week |
| **CMS designer** (plan 27, phase 3): full-screen page designer; plan to be written | plan next |
| **Getting started** content: short recordings and help texts for the tour | after recordings are ready |
| Expansion rules for Map and Timeline | postponed |

## Next (estimates)

| # | Task | Estimated delivery |
|---|------|--------------------|
| 1 | **CMS designer and templates** — edit v4 websites and pages; convert old websites; see plan 27 | to be set |
| 2 | **Use cases / demos** on the largest databases: digital_harlem, library_readers_18c, mpce_mapping, Chinese engineers | to be set |
| 3 | **Batch operations on records** (long-running operations; the background jobs from Reports and Export are reused) | to be set |
| 4 | **Save only changed fields** (PATCH) for large records | to be set |

## Leftovers of finished work

Small items left open in finished plans (details in `docs/development/`, marked `@todo`):

- **Query trace**: show "hub" records (with very many links) and exclude them from expansion; two more server tests; "does not contain" stays slow on large databases.
- **Reports**: website element "Generated report"; replace the old report viewer and editor in Heurist 7 with the new Report tool; remove the old schedule table after all databases are migrated.
- **Export**: IIIF and RDF exports are not part of the new export (the old ones stay); decide about the new JSON Lines format.
- **Interface**: Crosstabs and Actions tools are still empty placeholders.
- **Date editor**: other calendars (e.g. Japanese) are not supported yet.
- **Record editing**: some save steps of the old editor are not ported yet (list in plan 21 §6a).

## To discuss

1. **Expansion rules** — how far to develop them and where they belong in the new interface.
2. **One common storage structure** (records + record details) for all three kinds of data:
   database definitions, system/internal user data, and public user data. System data is now
   read and written in the record format through the new server API (tags stay in their own
   table); all new server code reads records through one data access layer, so the storage
   can change later in one place.
3. **Rework of the record details table**: move language and link ID to their own columns,
   remove old and duplicated fields, keep dates, links, spatial data and full-text index
   in separate tables (dates and links already done). Plan 28 (new tables for system
   record types, longer text values, language column) was written and deferred on 26 October.
4. **CMS and web publishing** (plan 27): format v4 and publication are done; designer, templates and conversion of old websites are open.

Decisions on items 2 and 3 affect the date for Batch operations.
