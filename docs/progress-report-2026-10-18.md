# Heurist Explorer — Progress Report

*Status on 18 October 2026 (first issued 2 October, updated 8 October). Work started 14 September 2026.*

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
| 17 | **Record editing for system records** (saved searches / data sources, reports, map documents and layers, websites): new server API to create, change and delete records, with checks of the values; new record edit form in Explorer. Title masks and calculated fields are now computed by the new server code (same result as the old code). | 12–13 Oct |
| 18 | **Data access layer** in the new server code: one place reads database definitions, records, files and users; an automatic test checks that no other code reads these tables directly. | 13 Oct |
| 19 | **Simpler interface** (close to Heurist 7), on by default: fixed layout, toolbar buttons inside the panes, Report and Export tools as tabs in the panes; the old Filter builder and faceted search wizard are used there. The full interface stays available in the settings. | 13–15 Oct |
| 20 | **Symbology and thematic map editors** ported from the old code; used by the Map module and the record edit form. | 13–17 Oct |
| 21 | **Edit forms made from a description (JSON)**: one form engine for the record editor and for settings dialogs; forms can show or hide fields by other values; layout options (labels beside or above, fields side by side). Record summary pane (owner, linked records, notes). | 14–18 Oct |
| 22 | **Date editor** ported from the old code: uncertain dates, date ranges, fuzzy dates, carbon / radiometric dates. | 17 Oct |
| 23 | **New server API** (`srv/`) behind all of the above — a clean replacement for the old server code. | ongoing, with each item |
| 24 | User manual and developer documentation. | ongoing |

## In progress

| Task | Expected |
|------|----------|
| Edit forms: review and cosmetics (rounds 4–5 done today); agree the form description format, then use it for report, crosstab and module settings dialogs | next week |
| Browser checks of the latest work (simpler interface, record and edit forms, symbology editors, date editor, reports, export) and testing query speed on large databases | with the use cases |
| **Getting started** content: short recordings and help texts for the tour | after recordings are ready |
| Expansion rules for Map and Timeline | postponed |

## Next (estimates)

| # | Task | Estimated delivery |
|---|------|--------------------|
| 1 | **Publication and website** — publish an Explorer layout as a public web page / site (was planned for 11 Oct; not started, record editing came first) | to be set |
| 2 | **Use cases / demos** on the largest databases: digital_harlem, library_readers_18c, mpce_mapping, Chinese engineers | to be set |
| 3 | **Records manager** — a list of system records (websites, pages, reports...) with the new edit form | to be set |
| 4 | **Batch operations on records** (long-running operations; the background jobs from Reports and Export are reused) | to be set |
| 5 | **Private notes and tags** in the record edit form (needs new server API) | to be set |

## Leftovers of finished work

Small items left open in finished plans (details in `docs/development/`, marked `@todo`):

- **Query trace**: show "hub" records (with very many links) and exclude them from expansion; two more server tests; "does not contain" stays slow on large databases.
- **Reports**: website element "Generated report"; replace the old report viewer and editor in Heurist 7 with the new Report tool; remove the old schedule table after all databases are migrated.
- **Export**: IIIF and RDF exports are not part of the new export (the old ones stay); decide about the new JSON Lines format.
- **Interface**: Crosstabs and Actions tools are still empty placeholders.
- **Date editor**: other calendars (e.g. Japanese) are not supported yet.

## To discuss

1. **Expansion rules** — how far to develop them and where they belong in the new interface.
2. **One common storage structure** (records + record details) for all three kinds of data:
   database definitions, system/internal user data, and public user data. Started with system
   data, as proposed: system records are now edited through the new server API, and all new
   server code reads records through one data access layer, so the storage can change later
   in one place.
3. **Rework of the record details table**: move language and link ID to their own columns,
   remove old and duplicated fields, keep dates, links, spatial data and full-text index
   in separate tables (dates and links already done).

Decisions on items 2 and 3 affect the date for Batch operations.
