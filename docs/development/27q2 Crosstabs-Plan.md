# 27q2 Crosstabs

**Status.** Agreed with Artem 2026-11-20 (answers in §13: Chart.js, DataTables, `op=crosstab`, default level
`display`, first value, no `.cfg` conversion, no drill-down in Explorer, 50 000, reuse of the thematic map code, fields
of linked records included). **Phases A-F implemented 2026-11-20** (§15 server, §16 client, Explorer tool, website
element, manual). **Review 1 (Artem, 2026-11-22), §17:** viewer pane + full screen designer, sources `current` / `own`
(topic note `presentation-sources.md`), record type filter, form by field type, Save as, Stop, publication from
Explorer. Not committed, **no browser check**. Depends on 27q1 (Presentation set, tool pane, CMS element rules) and 17
(ranges, thematic maps).

## 1. Goal

A crosstab (pivot table) counts the records of a result by the values of one, two or three fields (rows, columns,
pages), or sums / averages a numeric field. It is shown as a table and as a chart. It must work:

- in Explorer, as the tool pane `crosstabs` (now a stub), on the current result or selection;
- on a website, as the element `crosstabs`, together with the Filter widget (facets) and the other modules of the page;
- with stored settings (a *Presentation set* record, kind `crosstabs`, as the story map).

## 2. Legacy crosstabs (analysis)

Files: `heurist/viewers/crosstab/` — `crosstabs.php` (page, 376 lines), `crosstabs.js` (3410 lines),
`crosstabsController.php` (364 lines), `crosstabs.css`. Settings: `hclient/widgets/entity/configEntity.js`.

### 2.1 What it does

| Part | Legacy behaviour |
|---|---|
| Records | The current result of the old UI, passed into an iframe as an id list (`assignRecordset`, `recordListExt.js`); or `q`/`w` in the URL |
| Field list | The user chooses a record type only to get the field list ("does not filter the results"). Field types: enum, relationtype, integer, float, date, resource. No freetext, no header fields, no fields of linked records |
| Variables | Var 1 = rows (required), Var 2 = columns, Var 3 = pages (one table per page) |
| Intervals | Per variable, edited in a modal: numbers and dates — *N* equal intervals between min and max (default 10, decimals); enum — one interval per term; resource — one per target record. Intervals can be renamed, merged (several values in one), removed |
| Aggregation | Count (default), Sum or Average of a numeric field |
| Display | Values, Totals, Row %, Column %, "blank for zero", "show blank rows/columns", editable table title |
| Output | jQuery DataTables 1.10 (no paging, search box, CSV and PDF buttons with an extra header: DB, date, N, query); Chart.js 4 pie chart, only for rows without columns and pages |
| Saving | `configEntity`: named `.cfg` files per record type in the database file folder (`entity/defRecTypes/crosstabs/`, `DbEntityBase`) |
| Retrieve | Automatic when the result has fewer than 6000 records, else the *Update results* button |

### 2.2 Server

`crosstabsController.php`, actions:

- `minmax` — min / max of a field over the query (`recordSearchMinMax`, `CAST(dtl_Value AS DECIMAL)`).
- `pointers` — distinct targets of a pointer field with titles.
- `crosstab` — one SQL: `SELECT row value, column value, COUNT(*) | SUM | AVG, page value ... GROUP BY row, column, page`
  over the compiled query (`get_sql_query_clauses`) with LEFT JOINs to `recDetails`. The server groups by **raw
  values**; the **client** puts the values into the intervals (`fitToInterval`) and adds the totals.
- `getRecTypes` — record types of an id list.

### 2.3 Weaknesses (what the new version must fix)

1. **Totals and percentages are wrong for repeatable fields.** A record with two values is counted in two cells, and
   the client adds cells into totals, so the record is counted twice in the total too. Sum / Average are
   multiplied the same way (the join to the measure field is multiplied by the joins to the dimension fields).
2. **Dates are numbers.** Min / max casts the date text to a decimal (the year only); intervals are years with
   decimals; fuzzy and range dates (`recDetailsDateIndex`) are not used.
3. **Binning on the client.** The raw value groups are sent to the browser. A field with many numeric values sends many
   rows. The cell counts can differ from what a search for that interval finds.
4. **Only fields of one record type**, no linked records (e.g. Persons by the *Country* of their *Place of birth*).
5. **Chart**: only a pie, only for one variable.
6. **No drill-down**: a cell can not show its records.
7. **Settings are files**, per record type, not records: not public, not usable on websites, no owner / visibility.
8. Old stack: Bootstrap 5 beta, jQuery, DataTables 1.10 and pdfmake from CDNs; an iframe; *Save* and *Print* are
   "not implemented yet".

There is **no legacy website widget** for crosstabs, so no website conversion is needed (27s).

## 3. What the new code already has

| Need | Existing code |
|---|---|
| Stored settings | Presentation set record (2-1112), entity `presentation`, kind term `Crosstab` 2-10642, `PresentationEntityHandler` (27q1) |
| Counts per value over a query | `/records/aggregate?op=values` — `srv/Records/Query/FieldValueCounter.php` (distinct records per value; header fields; `via` = fields of linked records, `countThroughLinks`) |
| Counts per range | `op=ranges` — `FieldValueBuckets.php` (dates by month / year / decade / century with the search's own date semantics; numbers in N round ranges); `op=minmax` |
| Range definitions | `shared/src/data/ranges/rangeDefinitions.js` (`"40<>50"`, `"1,2,3"`, generate, match) — made for crosstabs (plan 17 §2) |
| Range editing UI | `HRangeGenerator` (Generate ranges dialog) and the range rows of `HThematicMapEditor` (plan 17) |
| Field picker with linked fields | the field tree of the thematic map editor (`shared/src/symbology/thematicFields.js`) |
| Facets | `HFilterForm` + value sources (`FieldValueSource`, `RangeBucketSource`), website Filter widget (`siteFilter.js`, 27l) |
| Records on a page | `PageSync` origins `links` / `filter:<id>` / `module:<id>`, *Records and selection* (`cmsRecords.js`, 27l) |
| Tool pane | `ExplorerToolModule`, `toolScope.js` (result / selection / one record type), the Story map tool as a model (toolbar, HEditForm, Save / Save as) |
| Table and export | `datatables.net-dt` 2, `datatables.net-buttons` 3, `jszip`, `pdfmake` (lazy, `apps/data/.../DataTablesAdapter.js`) |

## 4. Proposal: server

One new **operation of the existing common action** `aggregate` (plan 28 §6: `aggregate` is a common action; this
adds an `op` value, no new endpoint, controller or service — agreed, §13):

```
GET|POST /api/{db}/records/aggregate?op=crosstab&q=...&crosstab={...}
```

```json
{
  "rows":    { "code": "10:1234", "buckets": "values" },
  "columns": { "code": "10:lt240:12:1150", "buckets": { "ranges": ["1900<>1909", "1910<>1919"] } },
  "pages":   null,
  "measure": { "op": "count" }
}
```

- `code`: a field path code of the thematic maps (§13.1): a field of the records, or of linked records; the server
  turns the path into the `via` of `op=values`.
- `buckets`: `"values"` (each distinct value; enum, relationtype, resource, freetext, boolean, year), `{groupby:
  "decade"}` / `{ranges: N}` (as `op=ranges`), or `{ranges: [...]}` — the intervals of the settings in the
  rangeDefinitions syntax. **Binning is done on the server**, with the same comparison as the search, so a cell count
  is exactly what a search for that cell finds (needed for drill-down and for facets).
- `measure`: `count` (distinct records), or `sum` / `avg` / `min` / `max` of a numeric field — the **first value**
  of each record (§13).
- Response (as implemented, §15): the buckets of each dimension, the cells, and the **totals as distinct record
  counts** (per row, per column, per page, grand total) — not sums of cells (fixes §2.3.1). A bucket `blank` for
  records without a value (legacy *show blank rows/columns*) and `other` for values outside the buckets.
- New class `srv/Records/Query/CrossTabulator.php`, counting by record key sets (§13.2), with a small PHP reader of
  the range syntax. Limits: at most N buckets per dimension (e.g. 500) and a time limit, QueryTrace, Stop.
- PHP test `tests/CrossTabTest.php` on `osmak_mapping`: counts = searches of the cells; repeatable fields; dates.

## 5. Proposal: settings (Presentation set, kind `crosstabs`)

```json
{
  "fields":  { "rectype": 10 },
  "rows":    { "code": "10:1234", "label": null, "buckets": "values" },
  "columns": { "code": "10:lt240:12:1150", "buckets": { "ranges": [ { "value": "1900<>1909", "label": "1900s" } ] } },
  "pages":   null,
  "measure": { "op": "count" },
  "display": { "values": true, "totals": true, "percentRow": false, "percentColumn": false,
               "blankZero": true, "showBlanks": false, "decimals": 0, "title": { "def": "..." } },
  "chart":   { "show": "table|chart|both", "type": "bar|stackedBar|horizontalBar|line|pie|doughnut|heatmap" },
  "visitor": { "level": "display", "fields": ["10:1234", "10:lt240:12:1150"], "measures": ["count"],
               "export": ["csv", "xlsx", "pdf", "png"], "drill": true }
}
```

- A dimension has the form of the `crosstab` parameter (§4) plus a caption `label`, so the client sends it as it is:
  `buckets: "values"` = every value; `{ranges: [...]}` = the author's intervals (renamed, merged); `{groupby}` /
  `{ranges: N}` = generated on the server (changed 2026-11-20 from `ranges` / `limit` at the dimension, §15).
- The Query field (2-12) of the record is the test / default query, as for story maps.
- `normalizeCrosstabSettings()` in `shared/src/widgets/crosstabs/crosstabModel.js`; `CrosstabSettings::problems()`
  in `PresentationEntityHandler` (as `StoryMapSettings`).

## 6. Proposal: table (DataTables)

Yes, DataTables, as you assumed: it is already a dependency, the Data module looks the same, and it gives sorting,
the search box and the CSV / Excel / PDF / print buttons (jszip and pdfmake are already there, lazy).

- One shared widget `shared/src/widgets/crosstabs/HCrosstab.js` (+ CSS): builds the HTML table from the server
  response (row header column; column groups with Value / Row % / Column % sub-columns; totals row in `tfoot`) and
  then makes it a DataTable (no paging, sort, search).
- Pages (Var 3): a page selector above **one** table (tabs or drop-down) instead of a long list of tables; *All pages*
  for print / export.
- Export header (legacy): database, date, N, query, measure — an option.
- To check in a short spike (first day of the work): DataTables 2 with **two header rows** (column value + Value / %)
  in display and in the Excel / PDF export of Buttons 3. If the export of two header rows is not good enough, the
  Value / % sub-columns become one column per measure in the export only.

## 7. Proposal: chart library

The legacy uses Chart.js 4 (pie only). The candidates:

| Library | Licence | Size (min+gzip, only used parts) | Fit |
|---|---|---|---|
| **Chart.js 4** | MIT | ~70 KB | bar, stacked, horizontal, line, pie, doughnut, radar; canvas; PNG export built in; heatmap only by plugin (`chartjs-chart-matrix`); simple API; known from legacy |
| **Apache ECharts 5/6** | Apache-2.0 | ~150–300 KB with tree shaking | everything Chart.js has + heatmap, treemap, sunburst, sankey natively; SVG or canvas; toolbox (save image, data view); more options |
| Plotly.js | MIT | ~1 MB+ | too big for website pages |
| Highcharts | commercial | — | licence not usable for Heurist |
| D3 / Vega-Lite | BSD | large / low level | much more own code (D3) or a heavy runtime (Vega) |

**Decided (§13): Chart.js 4**, lazy-loaded only when a chart is shown. It is small (important for website pages),
covers the charts a crosstab needs (1 variable: bar / pie / doughnut / line; 2 variables: grouped / stacked bar,
heatmap by plugin), exports PNG, and the code stays simple. ECharts was the alternative for native heatmaps,
treemaps and sankey diagrams.

Colours: the palette and gradients of the symbology code (plan 17, `colourGradient`) and the base style variables
(`--h-color-*`), so charts follow the website / Explorer theme.

Chart rules: 1 dimension → bar (default), pie / doughnut, line for numbers and dates; 2 dimensions → grouped or stacked
bar, heatmap; with pages → the chart of the selected page. A click on a bar / slice = a click on the cell (§9).

## 8. Explorer: tool pane `crosstabs`

As the Story map tool (27q1 §7):

- Toolbar: preset list (Presentation sets of kind `crosstabs`), New, Save, Save as, Delete, Refresh.
- Settings form (HEditForm, no new inputs): *Fields of* (record type, as legacy: the field list only), Rows /
  Columns / Pages (the field tree of the thematic editor), intervals (`HRangeList` + `HRangeGenerator`, §13.1),
  measure, display options, chart, visitor options (§10).
- Output: Table | Chart | Both, under the form.
- Records: `toolScope.js` — current result, selection, or one record type; follows the DataSource through the
  SyncEngine like the other tools. Automatic refresh below a record limit (legacy 6000; with server binning it can be
  higher, e.g. 50 000), else *Update*.
- No drill-down in Explorer in the first version (§13, decision 8).
- Opened by URL `?tool=crosstabs&preset=<id>` (Edit in new window from the CMS).

## 9. Faceted search

Two directions:

1. **Facets → crosstab.** The crosstab takes its records like any module: in Explorer the current DataSource; on a
   website the PageSync origins of *Records and selection* (27l): `filter:<id>` (Filter widget with its Filter Form /
   facets), `links`, `module:<id>`. Every facet change sends a new `op=crosstab` request with the new query
   (debounced; Stop through the page RequestMonitor).
2. **Crosstab → other modules (the crosstab as a facet).** A click on a cell, a row or column header, a bar or a slice
   makes a query: the crosstab's query AND the conditions of that row / column / page. The condition of a bucket is
   the one the server used (§4), so the target shows exactly the counted records. Explorer: not in the first version
   (§13). Website: sent on as `module:<id>`, so a Result, Map or Timeline that takes its records from the crosstab shows
   them. Option `visitor.drill`, off by default.

The same value sources and range syntax serve the Filter Form facets and the crosstab dimensions, so a decade in a
facet and a decade in a crosstab are the same condition.

## 10. Website: element `crosstabs` and what the visitor can change

The element panel (as Story map, 27q1 §8): the preset (picker), *Records and selection*, caption, size, the
visitor level, *Edit in new window* + *Refresh*. No crosstab designer in the CMS.

Proposed **visitor levels** (`visitor.level`, chosen by the author per preset; the element can only lower it):

| Level | The visitor can |
|---|---|
| `view` | see the table and / or chart as stored; switch Table / Chart; export (if allowed); drill-down (if allowed) |
| `display` (default) | + Values / Totals / Row % / Column %, blank rows, chart type, swap rows and columns, choose the page |
| `pivot` | + choose Rows / Columns / Pages and the measure **from the author's list** (`visitor.fields`, `visitor.measures`); the author's intervals of each field are used |
| (none) | Free choice of any field, or editing intervals, is **not** offered on websites: private fields, slow queries. Intervals are edited only in Explorer |

Filtering is not a level: it is the page's Filter widget (facets) through PageSync, or a parameterized saved filter as
the element's records. So the author combines "which records" (Filter widget / saved filter) and "how they are
counted" (visitor level).

A public website needs a public preset (owner / visibility of the record); a guest sees only public records, so the
counts on a website are the counts of the public records.

## 11. Phases (preliminary, about 7–9 days)

| Phase | Content |
|---|---|
| A | Server `op=crosstab` (§4, §13.2), `CrosstabSettings::problems`, PHP test; spike DataTables two-row headers + export |
| B | `crosstabModel.js` (settings, request, bucket → query for drill-down, percentages) + tests; `HCrosstab` table |
| C | Charts (lazy chunk), chart rules, click → cell |
| D | Explorer tool pane: settings form, `HRangeList` extracted from the thematic editor (§13.1), presets, scope, URL open |
| E | Website element, visitor levels, PageSync member (records in, `module:<id>` out), Edit in new window / Refresh, delete check (`CmsRecordReferences`) |
| F | Export header, print, user manual |

## 12. Decisions needed (Artem) — answered 2026-11-20, see §13

1. **Chart library**: Chart.js 4 (recommended) or ECharts?
2. **Table**: DataTables (recommended, as you assumed), with the header spike in phase A.
3. **API**: a new `op=crosstab` of `/records/aggregate` — fits plan 28 (common action `aggregate`)?
4. **Visitor levels** `view` / `display` / `pivot` — default `display`? Is `pivot` wanted in the first version?
5. **Repeatable fields and measures**: a record counts once in each of its values (as legacy), totals are distinct
   records (so they can be less than the sum of the cells — a note under the table). Sum / Average: per record the
   sum of its values, or its first value?
6. **Fields of linked records** (`via`, e.g. Country of Place of birth) in the first version, or later?
7. **Legacy settings**: no conversion (as story maps), or a one-time import of the `.cfg` files into Presentation sets?
8. **Drill-down in Explorer**: a new DataSource in Result (recommended) or the selection?
9. **Automatic refresh limit**: legacy 6000 records; proposal 50 000 with server binning.

## 13. Decisions (Artem, 2026-11-20) and what they change

| # | Decision | Effect on this plan |
|---|---|---|
| 1 | **Chart.js** | §7: Chart.js 4, lazy chunk; heatmap with `chartjs-chart-matrix` only if wanted later |
| 2 | **DataTables** | §6 as written; the two-row header spike stays in phase A |
| 3 | **`op=crosstab`** of `/records/aggregate` is fine | §4 |
| 4 | Default visitor level **`display`** | §10; `view` and `pivot` stay as choices of the author |
| 5 | Sum / Average / Min / Max: **the first value** of a record | §4: one value per record (the first `dtl_ID` order, as the record view shows it) |
| 6 | Fields of linked records: **depends on the cost** | assessed in §13.2 — to confirm |
| 7 | **No conversion** of the legacy `.cfg` files | phase F loses the import; the legacy viewer stays until it is removed |
| 8 | Drill-down in Explorer: **not sure, apparently not** | §8: no drill-down in Explorer in the first version. On a website a click can still send the records on (`module:<id>`, `visitor.drill`, off by default) — to confirm at review |
| 9 | Automatic refresh up to **50 000** records | §8; above: the *Update* button |
| + | **Use the thematic map code for ranges** | §13.1 |

### 13.1 Reuse of the thematic map code (plan 17)

| Thematic maps | Crosstabs |
|---|---|
| Field path codes `rty:dty`, `rty:lt240:48:dty` (`shared/src/symbology/thematicFields.js`: `parseFieldCode`, `fieldCodeDty`, `fieldCodeType`, `fieldValuesQuery`, `fieldValues`, `fieldBounds`) | The dimension fields are stored as the same codes (`rows.code` instead of `field` + `via` in §5). `fieldBounds` / `fieldValues` feed the range generator over the crosstab's query |
| Field tree in `HThematicMapEditor._renderFieldSelection` (`HFieldTree`, `THEMATIC_FIELD_TYPES`, `maxDepth: 2`, record type choice of the layer) | The same tree and record type choice for Rows / Columns / Pages; types + `resource`, `boolean`, `freetext` (values); the measure field: `integer`, `float` |
| Range rows of a field (`_renderRanges`, `_renderRangeRows`, `_addRange`, `_generateRanges`, `_removeAllRanges`, `_finalRanges`): enum = term picker (multiple = merged categories), others = from `<>` to | Moved into a shared widget **`shared/src/widgets/symbology/HRangeList.js`** (no new input: the same enum input and text boxes). The thematic editor keeps its symbol column through an option (symbol preview, reset, gradient); the crosstab shows a **Label** column instead (the interval name, legacy rename) |
| `HRangeGenerator` (Generate ranges dialog: count, rounding, min / max, preview) | Used as it is (it takes `code`, `api`, `query`) |
| `rangeDefinitions.js` (`parseRange`, `formatRange`, `rangeMatches`, `generateRanges`, `categoryRanges`, roundings) | The stored intervals (`ranges[].value`) use this syntax; the client uses it for labels and drill-down queries |
| Range matching in the Map (client side, per feature) | Crosstabs count on the **server**: a small PHP reader of the same syntax (`"40"`, `"40<>50"`, `"1,2,3"`) in `CrossTabulator`, with the date comparison of the search (`FieldValueBuckets` semantics), tested against `rangeMatches` cases |

So the range part of the crosstab tool is mostly the thematic editor without symbols; the work is extracting
`HRangeList` without changing the thematic editor's behaviour (its tests must still pass).

### 13.2 Fields of linked records: cost

Proposed server approach that makes linked fields cheap: **count by record key sets** instead of one SQL
`GROUP BY`.

1. Evaluate the query once → main record ids (as `countValues` does).
2. For each dimension, read in chunks of 5000 the bucket keys of each main record: a direct field from `recDetails`
   (and the date index for dates); a linked field through the existing `linkedPathTargets(roots, via)` (the path code
   converted to `via` as `linkedFacetRequest` builds it) and then the values of the linked records.
3. Combine in PHP: per main record the combinations of its keys → cell counts; totals are distinct main records.
   The measure (first value) is read the same way.

This one path handles direct and linked fields, gives correct distinct totals (no extra queries) and the "first
value" rule easily. Cost at 50 000 records with 3 dimensions: about 150 000 value rows read in 30 chunks — within a
few seconds; the SQL `GROUP BY` would be faster for direct fields only, and still needs separate total queries.

- Without linked fields: phase A ≈ 2 days.
- **With linked fields (paths up to the thematic tree depth, 2 hops): + about 1 day** (reuse of `linkedPathTargets`
  and the code → `via` conversion; tests with Persons → Place of birth → Country).

Recommendation: include them, limited to 2 hops. If the cost turns out higher in phase A, they move to a later phase
without changing the settings format (the codes already carry the path).

## 14. Verification (when implemented)

- `php tests/CrossTabTest.php`: every cell count equals a search for the cell; totals are distinct records; dates by
  decade match `op=ranges`; repeatable fields.
- `npm test`: settings, request, bucket → query, percentages, chart rules.
- Browser, `osmak_mapping`: Explorer Persons → Gender × Birth decade, Count, Row %; chart bar / pie; Persons ×
  Country of Place of birth (linked field); Save / Save as; the thematic map editor works as before (`HRangeList`). Website: Filter widget + crosstab + Result; a facet changes
  the crosstab; with `visitor.drill` a crosstab click changes the Result; `view` / `display` / `pivot` levels.

## 15. Phase A — implemented 2026-11-20 (heurist, not committed)

**Server** (`srv/Records/Query/`):

- `CrossTabulator.php` — `describe()` validates the `crosstab` parameter; `tabulate()` counts by record key sets
  (§13.2): per dimension the values of the records (or of the linked records) are read in chunks of 5000, matched to
  the buckets, and every record adds itself once to each combination of its keys. Limits: 200 000 records, 500 value
  buckets (the most frequent; `truncated`), 1000 ranges, 2 links.
- `RangeValue.php` — PHP version of `parseRange` / `rangeMatches` (numbers numerically, otherwise as text).
- `FieldValueCounter::recordValues()` — the per-record value read, taken out of `countThroughLinks` (which uses it now);
  `FieldValueBuckets::specsForBounds()` — the ranges of `op=ranges` between two bounds (also the empty ones).
- `RecordSearchService::crossTab()`; `SearchRequest::AGGREGATE_OPS` + `crosstab`, `$crosstab`;
  `RecordQueryController::buildRequest` / `aggregate`. `/files/aggregate` refuses `op=crosstab` (as values / ranges).
- `Presentations/CrosstabSettings.php` + `PresentationEntityHandler` (kind `crosstabs` is checked; refusal 422 on the
  Configuration field).
- Explorer: `shared/src/data/aggregate.js` knows the op (`AGGREGATE_OPS`).

**Response** of `GET|POST /records/aggregate?op=crosstab&q=...&crosstab={...}`:

```json
{ "query": [...], "total": 110,
  "rows":    { "code": "12:133", "field": "133", "type": "category|number|date", "fieldType": "enum",
               "buckets": [ {"value": 5321, "label"?, "rty"?}, {"from": "1900", "to": "1909", "label": "1900–1909"},
                            {"value": "1900<>1909", "label": "1900s"}, {"other": true}, {"blank": true} ],
               "truncated": false },
  "columns": { ... } | null, "pages": { ... } | null,
  "measure": { "op": "count" } | { "op": "sum", "field": 1160 },
  "cells":   [ [row, column, page, records] | [row, column, page, records, value, recordsWithValue] ],
  "totals":  { "rows": [[page, row, records(, value, n)]], "columns": [[page, column, ...]], "pages": [[page, ...]],
               "grand": [records(, value, n)] } }
```

Indexes are bucket indexes; an absent dimension is index 0. Enum values are term ids (labels on the client, as
`op=values`); resource values carry the target title as `label`.

**Deviations and notes**

1. **Terms are counted exactly** (the stored term, as `op=values` and the thematic maps), while a search for a term id
   also finds its child terms. The query of a cell (drill-down on a website, phase E) must therefore use the exact
   form `"f:133": "=5040"`. Found by the test: "Administrative" (5040) is the parent of City, Locality, Capital.
2. The dimension settings use the request form (`code` + `buckets`), §5.
3. `other` (values outside the user ranges / beyond the 500 value buckets) and `blank` are always returned; the client
   hides them by the display settings.
4. The measure is a field of the records themselves (no linked field); hidden values are not checked, as in the
   search (decision 2026-10-13).
5. **DataTables spike** (`datatables.net` 2.3.8, `-buttons` 3.2.6): Buttons exports every header row
   (`headerStructure`): CSV one line per header row, Excel with merged cells, PDF and print with col- / rowspans. The
   two-row header (column value + Value / %) needs no fallback; a browser check follows with the table in phase B.

**Tests** (heurist): `php tests/CrossTabTest.php` — 59 checks on `osmak_mapping`: every cell of Place type × Country
equals the search for the cell (blank = `NULL`); repeatable Person role (grand total = distinct records); decades =
`op=ranges`; numeric and date user ranges = search (dates by overlap); linked fields `10:lt134:12:26` and
`10:lt240:48:237` = `op=values` with `via`; linked × direct cells = searches with `lt:240`; header fields and pages;
first-value sum and average = SQL; 9 refusals; controller response shape. `php tests/PresentationEntityTest.php` —
51 checks (crosstab settings added). `FieldValueCounterTest` 66 pass (after the `recordValues` refactor).
`npm test` (explorer) for `aggregate.js`.

## 16. Phases B-F — implemented 2026-11-20 (both repos, not committed, no browser check)

### 16.1 Shared (`shared/src/widgets/crosstabs/`)

- `crosstabModel.js` — `normalizeCrosstabSettings`, `crosstabCodePath` (as `CrossTabulator::parseCode`),
  `crosstabRequest` (with the visitor's pivot), `bucketLabel` (terms, record types, users, yes / no, blank, other),
  `crosstabTables` (one table per page; blank / other and empty rows and columns only with `showBlanks`; percentages
  for count and sum; the totals of the server), `formatCellValue`, `formatPercent`, `crosstabChartData`,
  `crosstabCellQuery` (the query of a cell: exact terms `=id`, `NULL` for blank, `lt:<dty>` for pointers, `any` for a
  group of terms, the links of the field path around the condition; null for other values and text queries).
- `crosstabService.js` — `CrosstabService`: `loadPreset` (Presentation set reader of the story map), `count`,
  `tabulate`; GET, POST with a JSON body for long queries.
- `crosstabTable.js` — the HTML table (row header, per column value / Row % / Column %, two header rows with
  percentages, totals column and row, clickable counts and headers) and `enhanceCrosstabTable` (DataTables: no paging,
  sort, search; Buttons CSV / Excel / PDF / print with the export header; all loaded lazily).
- `crosstabChart.js` — Chart.js 4.5.1 (new dependency), registered parts only, lazy: bar, stacked bar, horizontal
  bar, line (a dataset per column), pie / doughnut (row totals); colours of the page; click → cell.
- `HCrosstab.js` + `.css` — the widget: controls by level (`view`: Show; `display`: also chart type, Values, Totals,
  Row %, Column %, Blank rows, swap rows / columns; `pivot`: also Rows / Columns / Pages and Measure from the lists of
  the settings), page selector, status (records, measure), Update above 50 000 records, PNG of the chart, drill-down
  through `onCellQuery`.
- `shared/src/widgets/symbology/HRangeList.js` + `.css` — the range rows taken out of `HThematicMapEditor` (term picker
  or from <> to, remove, extra columns); the thematic editor passes its symbol column, the crosstabs a label column.

### 16.2 Explorer (`apps/explorer/src/tools/crosstabs/`)

- `CrosstabsTool.js` + `.css` — toolbar (New, selector, editor, record editor, Save, Delete, *Current result* /
  *Selected records*, Help → manual `#crosstabs`), the form beside HCrosstab (level `display`, no drill-down), changes
  applied after 0.4 s. Special editors: the query editor of the record editor; *Field* (the field tree of the thematic
  maps, 2 links); *Fields to choose* (adds a field; cleared with the clear button); *Ranges* (dialog: HRangeList with a
  label, Add range, Generate ranges… = HRangeGenerator over the counted records, Remove all ranges).
- `crosstabsForm.js` — sections Source / Rows / Columns / Pages / Measure / Display / Visitors on a website; values ↔
  settings.
- `ExplorerApplication`: `_createCrosstabsTool`, `openCrosstabs(id)` (also a new one), `?tool=crosstabs[&preset=<id>]`;
  a crosstab with a query shows it as the result.

### 16.3 Website

- Element `crosstabs` (widget): `CMS_TYPES`, `cmsEdit` (height 560px), catalog available, `CmsValidator::TYPES`,
  `CmsRecordReferences` kind `crosstabs`, `PresentationEntityHandler::configurationUses` (no delete while a page uses
  it).
- **Deviation:** a widget can not have `records` (client and server allow it for modules only), so the sources are
  `settings.from` (same tokens; default own + links + Filter widgets); `cmsInstanceRecords` reads them for this widget.
- Designer: `openCrosstabsForm` (crosstab, *Records from*, *Visitors can* = a lower level, Edit in new window, Refresh);
  `_presentationPresets(kind)` replaces the story-map-only list; `_openPresentationEditor(kind, id)`; crosstabs are a
  source `module:<id>` for the other modules.
- Page: `siteCrosstabs.js` (lazy; definitions snapshot for the labels, as the Filter widget), `PageSync`
  `CrosstabsMember` (records from its sources, no selection, sends nothing by itself); a click on a count (with
  `visitor.drill`) is sent as `module:<id>`.

### 16.4 Not done / to check

- Browser check: Explorer tool (form, ranges dialog, field tree, Save / Delete, Update above 50 000), the DataTables
  two-row header and its exports, Chart.js charts and PNG, the website element with a Filter widget and a Result that
  takes its records from the crosstab.
- Heatmap (plugin) later; removed from the allowed chart types on both sides.
- Localization: Explorer and website files (eng / fre); the help texts of the form are long and may need Artem's
  wording.
- `WebsiteContentTest.php` has 10 failing checks also without these changes (website title, file / term fields,
  reports): not caused by this plan.

### 16.5 Tests

`shared/test/crosstabs.test.js` (13: settings, codes, request, labels, tables, measure / pages, chart data and config,
cell queries, HTML table, service, widget levels / Update / pivot, HRangeList), `apps/explorer/test/crosstabsForm.test.js`
(3), `apps/website/test/crosstabsElement.test.js` (2). `npm test`: 1906 pass. heurist: `CrossTabTest` 59,
`PresentationEntityTest` 52, `CmsFormatTest` 21, `WebsiteEditTest` 112. Builds: Chart.js and the crosstab code are
separate lazy chunks (Explorer and website).

## 17. Review 1 (Artem, 2026-11-22)

General model for all presentation types: **`docs/development/presentation-sources.md`** (configuration and instance,
sources `current` / `own`, the selection as the parameter `$SELECTED$`, chooser by record type, viewer pane and full
screen designer, publication from Explorer). Crosstabs are the first type done this way.

### 17.1 Items and decisions

| # | Item | Decision |
|---|---|---|
| 1 | Full screen or a maximized pane | The **designer** is full screen (as the Website manager); the **viewer** stays a pane like the other modules |
| 1a | Save changes of a loaded crosstab as a new one | A **Save as** button: a new Presentation set with the values of the form and a new name (`POST /presentation/0`; `duplicate` would copy the stored record without the changes). Clearer than guessing from a changed name, query or record type |
| 2 | Not linked with the main search | The designer works on its own test records (*Test on: Current result / Own query*). The viewer pane follows the current result when its source is *Current result* |
| 3a | Accordions mutually exclusive | Not done (Artem) |
| 3b | Source | "Records on a website" → **Query** (default query, may have parameters); "Fields of" → **Record type**: the record types of the test records with counts; it **also filters** the counted records (query AND `t:type`, in HCrosstab, so Explorer and website count the same). ▾ of Query: **Current result** first |
| 3c | Choose the field | Tree as wide as the dialog; Alphabetic; type filter; metadata (unchecked); no Any field. Types: freetext, enum, relationtype, date, year, integer, float, resource, relmarker (pointers kept: a row per linked record); boolean dropped |
| 3d | Values by type | Own ranges for numeric, date and enum; Dates by period for dates; Equal ranges for numbers (also `year`: the server counts years as numbers); text and pointers: Each value only |
| 3e | Indent of the accordions | `.h-edit-form-accordion > .h-edit-form-fields { padding-left: 12px }` (all forms) |
| 3f | Display | Renamed **Display and default values** |
| 3g | Show totals | After Column % in the form and in the toolbar of the crosstab |
| 3h | Visitors → Fields to choose | Multiple selection of HFieldTree |
| 3i, 3j | Values on a field change | Reset to the default of the type: dates → Dates by period, numbers → Equal ranges, else Each value |
| 2 (pages) | Pages selector | **All values** first: one table with the pages merged (a request without pages; counts stay distinct records) |
| 3 | Scope selector | Removed; replaced by the source of the viewer (*Current result* / *Own query*) |
| 4 | Delete | Next to Help (right) |
| 5 | Stop | Shown while calculating; in Explorer the server query is cancelled too (`/records/cancel`) |
| 6 | Output stored as JSON | **Rejected** (presentation-sources.md §8) |
| + | Publication | The viewer pane is published like a module, with the query of the current result stored in the element |

### 17.2 Implemented 2026-11-22 (both repos, not committed, no browser check)

**Shared**
- `shared/src/data/presentationSource.js` (new, for all presentation types): `recordTypeQuery(query, rectype)` (JSON,
  JSON text or legacy text AND `t:`), `ownQuery(query, {values, selection, filterForm})` (`$SELECTED$` = the selected
  ids; `missing` = parameters without a value: the query is not run), `PRESENTATION_SOURCES`, `SELECTED_PARAMETER`.
- `HCrosstab`: counts `countedQuery()` (the query AND `settings.fields.rectype`, also for the cell queries and the
  export header); Pages *All values* (index -1, a request without `pages`, cached until the next load); *Calculating…*
  with **Stop** (`stop()`: aborted, *Stopped* + Update); `clear(text)`; display flags Values, Row %, Column %, Totals.
- `CrosstabService({apiClient})`: requests through the HeuristApiClient (traced; an abort cancels the server query with
  `/records/cancel`); the website keeps fetch.
- `normalizeCrosstabSettings`: `filterForm` (the Filter Form of the parameters of the query; server
  `CrosstabSettings::problems` checks it is an object).
- `HFieldTree` scope option `typeFilter`: the type filter also for fixed types, offering only their filters
  (`fieldTypeOptions`).
- `querySourceAction({first})` / `chooseQuerySource(anchor, items, first)`: fixed items above the list (Current result).
- `HEditForm.css`: fields of an accordion indented 12px.

**Explorer** (`apps/explorer/src/tools/crosstabs/`)
- `CrosstabsTool.js` = the **viewer pane** (still a pane module, follows DataSource and selection): chooser grouped by the
  record types of the result (`loadScopeRecordTypes`; *For the current result* with counts, *Other configurations*
  disabled; one fitting crosstab or the last one of the record type opens at once); Source *Current result* / *Own
  query* (parameters in an HFilterForm above the crosstab, `$SELECTED$` from the selection); Edit / New (designer),
  Publish, Help. The chosen crosstab, the source and the last crosstab per record type are kept in localStorage
  (`heurist.crosstabs.<db>`, a convenience).
- `CrosstabsDesigner.js` (new) = the **full screen designer** (`ExplorerApplication.openCrosstabsDesigner`, a fixed host
  as the Website manager): toolbar New | selector | Record editor | Save | **Save as** | Delete | Help | Close; *Test on*
  Current result (a snapshot when it opens or is chosen again) / Own query; the form; the preview. *Record type* terms =
  the record types of the test records "Name (count)" (the chosen one kept as "not in the test records"); without test
  records every record type. A field change resets Values to the default of its type (`bucketTermsFor`,
  `defaultBucketMode`); *Choose the field*: HFieldTree with Alphabetic, `typeFilter`, metadata, `valuesOnly` (no Any
  field), the header codes converted (`crosstabCode`: `rec_Added` → `added`; ID and URL refused); *Fields to choose*:
  multiple selection (Add selected fields).
- `crosstabsPresets.js` (new): `crosstabIds`, `loadCrosstabPresets` (with the record type of each), `groupCrosstabPresets`,
  labels, toolbar helpers.
- `crosstabsForm.js`: Query, Record type, hidden `filterForm` field (DT_FILTER_FORM: the query editor allows parameters
  and stores their form), *Display and default values*, Show totals after Column %, Values by type.
- `RecordEditorHost.specialEditors(dbdefs, {currentQuery})`: ▾ of the query offers *Current result* first.
- `ExplorerApplication`: `openCrosstabsDesigner`, `openCrosstabs` (`?tool=crosstabs&preset=` → the designer; on Close
  the pane shows the crosstab), `publishCrosstab` (`publishModulePage` type `crosstabs`, settings `{preset, from: ['own'],
  query}`, the PublishedDialog with Website manager).

**Website and server**
- `siteCrosstabs.js`: own query = `settings.query` (published from Explorer) else the query of the crosstab; parameters
  from the page URL (`urlValues`: `v.<NAME>=`); a missing value shows "This crosstab needs a value of …".
- `openCrosstabsForm` keeps `settings.query` (*Query published from Explorer*).
- `WebsiteEditService::importModule`: `PUBLISHED_WIDGETS = ['crosstabs']` published as a widget instance (existing
  `import` action, no new endpoint).

**Deviations**
1. **Save as** asks no name (no new input): the new crosstab gets the Name of the form, with "(copy)" when the Name was
   not changed; `duplicate` is not used (it copies the stored record without the changes).
2. `year` fields: Equal ranges, not Dates by period (the server counts them as numbers).
3. Header fields of the tree: Title, Added, Modified, Creator, Owner, Visibility can be counted; ID and URL are refused.
4. `WebsiteEditTest` used `crosstabs` as an unknown module type: now `nosuchmodule`, plus a check that crosstabs is
   published as a widget. The first runs of the old test made two pages "Crosstabs 2026-11-22" (209957, 209966) in
   `osmak_mapping`: to delete.

**Tests**: `shared/test/presentationSources.test.js` (7), `apps/explorer/test/crosstabsForm.test.js` (+5),
`apps/website/test/crosstabsElement.test.js` (+1); `npm test` 1919 pass. heurist:
`WebsiteEditTest` 114, `PresentationEntityTest` 52, `CrossTabTest` 59. Builds explorer and website.

**Browser check (to do)**: the pane with a mixed result (Persons + Places), the chooser, Own query with a parameter
and with `$SELECTED$`; Edit → designer, Test on, Save as, Close; field tree; Values by type; All values; Stop on a large
count; Publish and the page; a website page with `?v.NAME=`; accordion indent in the record editor.

