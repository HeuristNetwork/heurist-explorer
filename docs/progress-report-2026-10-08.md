# Heurist Explorer — Progress Report

*Status on 8 October 2026 (first issued 2 October). Work started 14 September 2026.*

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
| 15 | **Export** as a background job (progress, cancel, download when ready): CSV/TSV, JSON, GeoJSON, KML, XML (HML), Gephi. New Export tool in Explorer. | 6–7 Oct |
| 16 | **New server API** (`srv/`) behind all of the above — a clean replacement for the old server code. | ongoing, with each item |
| 17 | User manual and developer documentation. | ongoing |

## In progress

| Task | Expected |
|------|----------|
| Browser checks of the latest work (compact query editor, trace panel, reports, export) and testing query speed on large databases | with the use cases |
| **Getting started** content: short recordings and help texts for the tour | after recordings are ready |
| Query trace leftovers: show "hub" records (with very many links) and exclude them from expansion; more server tests | — |
| Expansion rules for Map and Timeline | postponed |

## Next (estimates)

| # | Task | Estimated delivery |
|---|------|--------------------|
| 1 | **Publication and website** — publish an Explorer layout as a public web page / site | 11 Oct |
| 2 | **Use cases / demos** on the largest databases: digital_harlem, library_readers_18c, mpce_mapping, Chinese engineers | 15 Oct |
| 3 | **Batch operations on records** (long-running operations; the background jobs from Reports and Export are reused) | +week |

## To discuss

1. **Expansion rules** — how far to develop them and where they belong in the new interface.
2. **One common storage structure** (records + record details) for all three kinds of data:
   database definitions, system/internal user data, and public user data. Proposal: start
   with system data.
3. **Rework of the record details table**: move language and link ID to their own columns,
   remove old and duplicated fields, keep dates, links, spatial data and full-text index
   in separate tables (dates and links already done).

Decisions on items 2 and 3 affect the date for Batch operations.
