# Heurist Explorer — Progress Report

*Status on 2 October 2026. Work started 14 September 2026.*

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
| 11 | **New server API** (`srv/`) behind all of the above — a clean replacement for the old server code. | ongoing, with each item |
| 12 | User manual and developer documentation. | ongoing |

## In progress

| Task | Expected |
|------|----------|
| **Query trace and termination**: see what a slow query does, and stop it (also on the server). Testing query speed on large databases. | 3 Oct |
| Query builder improvements found during testing | 4 Oct |

## Next (estimates)

| # | Task | Estimated delivery |
|---|------|--------------------|
| 1 | **Smarty report integration** (existing report templates inside the new modules) | 6 Oct |
| 2 | **Publication and website** — publish an Explorer layout as a public web page / site | 11 Oct |
| 3 | **Use cases / demos** on the largest databases: digital_harlem, library_readers_18c, mpce_mapping, Chinese engineers | 15 Oct |
| 4 | **Export** (long-running operations, with progress and cancel) | +week |
| 5 | **Batch operations on records** (long-running operations) |  +week |

## To discuss

1. **Expansion rules** — how far to develop them and where they belong in the new interface.
2. **One common storage structure** (records + record details) for all three kinds of data:
   database definitions, system/internal user data, and public user data. Proposal: start
   with system data.
3. **Rework of the record details table**: move language and link ID to their own columns,
   remove old and duplicated fields, keep dates, links, spatial data and full-text index
   in separate tables (dates and links already done).

Decisions on items 2 and 3 affect the dates for Export and Batch operations.
