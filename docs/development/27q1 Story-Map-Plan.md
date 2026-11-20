# 27q1 Story map

**Status.** Agreed with Artem 2026-11-18 (discussion of his notes, decisions in §11). Phases A-E done 2026-11-18 (§13,
§14), not committed, no browser check. Next: browser check; test data for `path` (§13); French texts.

## 1. Goal and the idea

The user selects a record. An expansion rule finds the records that tell its story. The story is shown as a list,
cards, a slider or tabs. The current story element is shown on a map. The places of one element are shown by a
*pattern*: one point (the common case), or several places joined by lines in a fixed order (begin → transition → end).

Differences from the legacy widget (`heurist/hclient/widgets/viewers/app_storymap.js`):

| Legacy | New |
|---|---|
| Listens to any selection | Has its own **source query** (e.g. Persons); can still listen to a selection |
| Story elements through a resource field or record types | **Expansion rule** (plan 09 format) from the source record to the elements (e.g. Life events) |
| Designed in the CMS editor | **Stored object** (a *Presentation set* record), designed in Explorer, chosen in the CMS like a generated report |
| Map: linked / filtered / all places, begin-transition-end fields fixed in code | `map.patterns`, chosen per story element (§4, §6.1) |

## 2. Answers to the four questions

1. **Separate presentation mode in Explorer?** Yes: a tool pane module `storymap`, like Report and Crosstabs (plan 16,
   tools as pane modules). It works on Explorer's result set and selection: *the life events of the selected Person*.
   It drives Explorer's own Map module through its adapter. Story map, crosstabs and export are all *stored settings +
   a query → output*.
2. **No designer in the CMS.** The CMS element *Story map* has only: the stored story map (picker), the target map
   module, *Records and selection* (27l) and the caption. The story map produces HTML (cards, slider, tabs) and drives
   the map (fly, zoom, layers).
3. **As crosstabs.** The stored settings are fixed. For the story map the visitor only views and navigates the story
   (§11). Crosstabs (27q2) let the visitor change pivots and facets.
4. **Design in separate windows.** One rule for report templates, crosstabs and story maps: the CMS element panel has
   **Edit in new window**. It opens Explorer with the tool and its test query (`?tool=storymap&preset=<id>`,
   `?tool=report&report=<id>`). The panel also has **Refresh**, which reloads the preview. These objects are never
   edited inside the designer UI.

## 3. Stored settings: record type *Presentation set*

- New system record type in reference database 2 (Artem creates it): **Presentation set**, constant
  **`RT_PRESENTATION_SET`** in `srv/Definitions/SystemConstants.php`. One type for story maps, crosstabs (27q2) and
  export settings (plan 13, later).
- **No new endpoint, controller or service.** The record type only gets a name in the existing generic route of plan 28
  (`/api/{db}/{entity}/{id}/{action}`): one line in `RecordEntityRegistry::ENTITIES`, as `website`, `page`, `report`,
  `output`. Name **`presentation`** (agreed 2026-11-18, `job: null`), so: `GET|POST|PUT|PATCH|DELETE /api/{db}/presentation/{id}`,
  `/presentation/{id}/duplicate` (Save as), search `/sys?q=[{"t":"presentation"}]`.
- Fields: Title 2-1, Description 2-3, **Kind** (enum: `storymap`, `crosstabs`, `export`), **Settings** (JSON, block
  text), **Query** DT_QUERY_STRING 2-12 (source query; Explorer uses it as the test query). Owner and visibility as on
  every record; a website needs a public one.
- Handler `PresentationEntityHandler`: `beforeSave` checks the JSON, the kind and the settings of the kind
  (`StoryMapSettings::problems`); `beforeDelete` refuses with 409 while website pages use the record
  (`CmsRecordReferences`).

In the text below *preset* = a Presentation set record.

## 4. Settings of kind `storymap`

```json
{
  "story":   { "rule": { "query": {...}, "levels": [...] },
               "order": { "by": "date" | <dtyId> | "rule", "dir": "asc" } },
  "element": { "template": <reportId> },
  "start":   { "mode": "inline|tab|header|none", "template": <reportId> | null, "text": { "def": "...", "fre": "..." } },
  "end":     { "mode": "inline|tab|footer|none", "template": <reportId> | null, "text": { ... } },
  "presentation": { "layout": "list|horizontal|tabs|carousel|slideshow",
                    "distinct": "highlight|veil|none", "interval": 5000 },
  "messages": { "intro": { "def": "..." }, "empty": { "def": "..." } },
  "map": {
    "overview": { "querySource": <id> } | { "query": [...] } | null,
    "patterns": [
      { "type": "path", "begin": ["2-134", "1414-1092"], "transition": ["1414-1090"], "end": ["2-864"] },
      { "type": "points", "filter": null }
    ],
    "elementSymbology": {...}, "lineSymbology": {...},
    "duration": 1500, "keep": false, "layers": [ <map layer ids> ]
  },
  "actions": null
}
```

- **Source records:** the preset's 2-12 query (Explorer: its own result set).
- **Story query:** `expansionLevelQuery(sourceQuery, [rule], 1, { parentIds: [selectedId] })` from
  `shared/src/data/expansionRules.js`. A rule of several levels: the last level gives the elements.
- **One source record** (Artem, 2026-11-18): the source query may return exactly one record on purpose (e.g. *Mongol
  Empire*). Then the story of that record is shown at once: no selection and no target data module are needed. The
  `intro` message is not shown.
- **Several records selected:** the story of the **last selected** record, as Record view.
- **Order:** `date` = the start of the first temporal field (legacy `def`), then the title; a field id; or `rule` (the
  order of the result).
- **Element:** a Smarty card report (2-1104) run on each element.
- **Start / end:** a Smarty template run on the source record, or a fixed multilingual text (`{title}` = title of the
  source record); `none` by default.
- **Messages:** `intro` before a record is selected; `empty` when the rule finds nothing ("elements may exist but not be
  public").
- **`map.overview`** = the initial set on the map: a query source or a query shown as a query layer (e.g. all places of
  all Persons). Not stored = an empty map until a record is selected.
- **`map.patterns`** decides everything shown on the map for **one story element** (replaces legacy places / filter).
  Each element gets its own pattern: the first pattern in the list that fits the element (its fields have values;
  optional `rectypes`) is used. So one element shows a point, the next a path. The last pattern is the fallback. Not
  stored = `[{ "type": "points" }]`, the common case (one point).
  - `points`: every place pointer and geo field of the element; `filter` (a query on the places) limits them.
  - `path`: fields as concept codes, resolved to local ids by the definitions. Lines as legacy `_createPointLinks`:
    one begin → transitions → one end; several begins / ends: star to the first / from the last transition; equal
    numbers of begins and ends without transition: pairs.
- **`actions`:** reserved for the animation JSON of phase F (legacy `storyActions` format as a start).
- **Run time:** the visitor only views and navigates the story. Nothing of the settings can be changed on the page.

## 5. Presentation (shared widget)

- `shared/src/widgets/storymap/HStoryMap.js` (+ `HStoryMap.css`), derived from `HBaseWidget`. Layouts reuse the code of
  Record cards: list and horizontal as `.h-site-card` rows, carousel / slideshow through
  `shared/src/widgets/site/HSlider.js`, **tabs** new (one tab per element, the title is the label).
- **Tabs also in Record cards** as a fourth presentation (`list | carousel | slider | tabs` in
  `apps/website/src/designer/widgetForms.js` and the site runtime). One shared tabs component serves both.
- Current element: on scroll (list, horizontal), on slide / tab change, by keyboard. `highlight` = a class on the
  current card; `veil` = the others dimmed.
- Smarty cards: `GET /report/{id}/execute?recordId=&lang=` (as `previewCards` in `apps/website/src/siteWidgets.js`),
  only for the visible card and its neighbours, cached per story.
- Pure functions in `shared/src/widgets/storymap/storyMapModel.js`: settings normalisation, story query, order, pattern
  choice per element, places → GeoJSON with lines. Tests in `test/shared`.

## 6. Map binding

- The widget talks to an interface `{ showOverview(query), showStory(features, opts), showElement(recordId, opts),
  clear() }`. Explorer and the website implement it over the Map public API
  (`apps/map/src/host/HeuristMapPublicApi.js`: `addLayer`, `addQueryLayer`, `removeLayer`, `setLayerStyle`,
  `selectRecords`).
- Additions to the Map public API (contract change first in `shared/src/contracts/moduleContracts.js`, then the
  adapter and the public API; no legacy wrapper): `flyTo(bounds | recordIds, { duration })` over
  `MapApplication.fitBounds` with animation; a GeoJSON layer from data if `addLayer` can not take it yet (check first).
- Places: `/records?q=ids:...&format=geojson` (GeoJSON writer of plan 13), one call per story.
- Symbology: plan 17 format and editors for the element and the line.
- Timeline: not in 27q1. Later: scroll the timeline to the current element, so the neighbouring event ranges are
  visible.

### 6.1 Place patterns (own plan later, Artem 2026-11-18)

The map symbols, and what is shown on the map and how, need their own careful plan. 27q1 supports **`points`** and
**`path`**. `map.patterns` has a `type` per entry, so later types come without a format change. Known cases:

| Type (working name) | Example | Map presentation (to agree) |
|---|---|---|
| `points` (27q1) | most stories: one place per element | markers, optional filter |
| `path` (27q1) | journey, route | lines begin → transitions → end |
| `star` | place of life + places of work | centre and spokes, no order |
| `pairs` | start and end of an offence; source and target of a military advance | one arrow per pair |
| `change` | territory acquired: initial polygon → final polygon | fade / morph from the first to the second |

For each type that plan agrees its fields, its symbology (marker, line, arrow, polygon) and its animation.

## 7. Explorer: tool pane `storymap`

- A pane module like Report (`_createToolModule`, plan 16). It shows the story of the last selected record of Explorer.
- The gear opens the settings form (HEditForm JSON, `storyMapForm.js`) and the picker of presets of kind `storymap`.
  Save, Save as (`duplicate`), New.
- Rule editing reuses `HRuleBuilder` (`apps/explorer/src/widgets/query-source/helpers/`).
- URL `?tool=storymap&preset=<id>` opens the pane, runs the preset's query and selects the first record (the CMS
  *Edit in new window*).

## 8. Website: element `storymap`

- `designerCatalog.js`: Story map becomes `available`. Instance settings:
  `{ "preset": <id>, "map": "<map instanceId>", "records": { "from": [...] }, "selection": true }`.
- In 27l terms the story map is a **page member with its own query** (the preset's 2-12). A Data module with
  `records.from: ["module:<storymap>"]` lists the source records (the *target data module*). Without an own query it
  follows the selection of the page (as legacy). When the own query returns one record, the story is shown at once
  and no data module is needed (§4).
- Element panel: preset picker, map module (map instances of the page), *Edit in new window*, *Refresh*. The same two
  buttons for the Smarty template of Record cards.
- Checks: `cmsInstanceProblem` (JS) and `CmsValidator::instanceProblem` (PHP): the preset exists and is public, the
  map instance is on the page. `CmsRecordReferences` lists the preset (website check, delete rule of §3).

## 9. Legacy

No conversion of legacy story maps (agreed 2026-11-18). The legacy widget was only read for its ideas.

## 10. Phases

| Phase | Content |
|---|---|
| A | Record type (Artem); entity `presentation`, handler, constant; `storyMapModel.js` + tests |
| B | `HStoryMap` presentation: 5 layouts, highlight / veil, start / end, messages; tabs in Record cards |
| C | Map binding: contract, `flyTo`, overview layer, story layer, patterns `points` and `path`, symbology |
| D | Explorer tool pane, settings form, Save / Save as, URL open |
| E | Website element, element panel, Edit in new window / Refresh (also Record cards), validators |
| F (later) | Other place patterns (§6.1, own plan), animation `actions`, timeline scroll |

## 11. Decisions (Artem, 2026-11-18)

1. One common system record type **Presentation set** (`RT_PRESENTATION_SET`) for story map, crosstabs and export.
2. Explorer: tool pane = viewer and editor; CMS: *Edit in new window* + *Refresh*, no designer in the CMS.
3. Start / end: Smarty template on the source record, or fixed text.
4. The visitor only views and navigates the story.
5. `map.overview` = the initial set on the map: a query source / query as a query layer.
6. Several records selected: the last selected one (as Record view). A source query with one result (e.g. Mongol
   Empire) shows its story at once, without a selection or a data module.
7. `map.patterns` per story element replaces places / filter; only `points` and `path` now; the others need their own
   plan (§6.1). Animation and timeline later.
8. Tabs also in Record cards.
9. No legacy conversion.

## 12. Verification

- `npm test`, `npm run test:shared`: rule → query, order, pattern choice, lines (path, stars, pairs).
- `php tests/PresentationEntityTest.php`: bad JSON, unknown kind, delete while a page uses it.
- Browser, `osmak_mapping`: Explorer, Persons → select one → the story pane shows the life events in each layout, the
  map flies, lines begin → end. A preset whose query returns one record shows its story without a selection. Save; a CMS page with Data module + Map + Story map; *Edit in new window* → change the
  template → *Refresh*.

## 13. Phase A — implemented 2026-11-18 (both repos, not committed)

Record type 2-1112 *Presentation Set* (local 138 in `osmak_mapping`) by Artem: Title 2-1, Short summary 2-3, Query 2-12,
Configuration 2-1187, Presentation Type 2-1203 (terms Crosstab 2-10642, Export 2-10643, StoryMap 2-10644).

- heurist: `SystemConstants` `RT_PRESENTATION_SET`, `DT_PRESENTATION_TYPE`, `TRM_PRESENTATION_CROSSTABS | _EXPORT |
  _STORYMAP`; entity `presentation` in `RecordEntityRegistry`; new folder `srv/Presentations/` (`_README.md`,
  `PresentationEntityHandler` (`beforeSave`: Configuration is a JSON object; a story map is checked; a PATCH of one of
  the two fields is checked with the stored other), `StoryMapSettings::problems`); wired in `ServiceFactory`.
  Test `php tests/PresentationEntityTest.php [--write]`: 32 checks (with `--write`: insert, refused PATCH, delete).
- explorer: `RECORD_ENTITIES.RT_PRESENTATION_SET = 'presentation'` (`shared/src/data/recordDomains.js`);
  `shared/src/widgets/storymap/storyMapModel.js`: `normalizeStoryMapSettings`, `storyQuery` (rule from the record,
  last level), `storySourceId` (last selected; a single source result without a selection), `sortStoryElements`,
  `choosePattern`, `pathGeometry` (legacy line rule), `elementFeatures` (`placeFields`: points read only pointer
  fields), `storyText`. Test `shared/test/storyMapModel.test.js` (9). `npm test`: 1867 pass.
- Deviation: the delete rule (409 while a page uses the record) moves to phase E with the website element.
- Test data: Life events (48) of Persons (10, field 240) have only *Place of birth* 2-134; for `path` some events need
  an end place 2-864 or transition places 1414-1090.

## 14. Phases B-E — implemented 2026-11-18 (both repos, not committed, no browser check)

**B. Presentation.**
- `shared/src/widgets/storymap/HStoryMap.js` + `.css`: message (intro / empty / error), header, body, footer. Layouts
  `list`, `horizontal` (own CSS, the most visible card is current: IntersectionObserver; a click on a card), `tabs`,
  `carousel`, `slideshow` (HSlider). Start / end: `inline` = first / last card, `tab` = a tab (in a list: header /
  footer), `header` / `footer`. Cards: the title until the Smarty card is loaded (current ± 1, and cards that come into
  view). `highlight` / `veil` classes. Start and end show the whole story on the map.
- `storyMapService.js`: the preset from `/records?q=ids:N&fields=_all` (fields by concept code from `meta`), the story
  (`/records` with the rule query, `fields=_all`, at most 500), the places and the elements' own geometry from
  `/map?q=ids:…`, the places of a `points` filter, the cards (`/report/{id}/execute`, cached).
- Model additions: `temporalSortValue` (temporal JSON → `estMinDate`, `YYYY-MM-DD` → YYYY.MMDD), `featureBounds`.
- **Tabs in HSlider** (`presentation: 'tabs'`, tab bar, arrow keys, `onChange`, `start`); **Record cards**: *Tabs (one
  visible, a tab per record)* in the form, `PageContent` writes `data-h-label` = record title, `ONE_VISIBLE` with tabs
  (siteWidgets.js, PageContent.php). Media gallery gets the choice too (shared presentation fields).

**C. Map binding.**
- `storyMapBinding.js`: overview = a `heurist-query` layer, the whole story (`map.keep`), the current element = two
  inline GeoJSON layers (lines below, places above; `lineSymbology` / `elementSymbology`, defaults red), then `flyTo`
  the bounds of the element. **Deviation:** the layers go into the **active** map document (the dynamic document is
  drawn only when it is active); each layer remembers its document for the removal.
- Map public API `flyTo(bounds, {duration, maxZoom})` → `MapApplication.flyTo` → `LeafletMapAdapter.fitBounds` with
  `fly` (`flyToBounds`). No change in `moduleContracts.js` (it lists only events); `docs/integration.md` updated.

**D. Explorer.**
- Tool `storymap` (TOOL_TYPES, layout editor, toolbar, compact mode, titles); **default pane East** (beside the Map;
  in the centre it would hide the Map).
- `apps/explorer/src/tools/storymap/StoryMapTool.js` + `.css`: toolbar (story map select, Settings, Save, Save as,
  Refresh, Source records), the settings form (plain DOM like the Export tool: name, source query + *Current filter*,
  rule via HRuleBuilder, order, element template, presentation, start / end, messages, map: initial set (query
  source), path fields, places filter, flight, keep, symbology JSON; Apply), HStoryMap below. Save = PATCH
  `/presentation/{id}`, Save as / new = POST `/presentation/0` with a name dialog (**deviation:** not `duplicate`, the
  values come from the form anyway).
- `ExplorerApplication._createStoryMapTool`, `openStoryMap(id)` (shows the tool, the source records as the result,
  selects the first one), start URL `?tool=storymap&preset=<id>` (`_startUp`). `IframeModuleAdapter.getPublicApi()`.
  `getMap` creates the Map module when it was deferred.

**E. Website.**
- Widget type `storymap` (CMS_TYPES, CmsValidator::TYPES, CMS_ELEMENTS, catalog available, new element with height
  480px). Form `openStoryMapForm` (story map select with *not public* marks, map instance select, *Edit in new window*,
  *Refresh* = the list and the preview again). Designer: `_storyMapPresets`, `_pageInstanceTerms('map')`,
  `_openStoryMapEditor` (`{baseUrl}?db=…&tool=storymap&preset=…`). *Records and selection* of a module lists
  *Story map: …* as a source (`module:<id>`).
- Site: `siteStoryMap.js` (lazy chunk) + `findPageModule(id)` (waits for a module still mounting; `MODULES` keep the
  instance id). PageSync `StoryMapMember`: selection only; its start = the preset query, sent on as `module:<id>`.
- Server: `CmsRecordReferences` kind `storymap` (website check: the preset must be readable by visitors);
  `PresentationEntityHandler::beforeDelete` refuses with 409 `{pages}` while pages use the set
  (`ServiceFactory::pagesUsingPresentation`: text search `"preset":<id>` in 2-1187 of 99-51 / 99-52, then the JSON;
  only pages the user can read).

**Tests:** `shared/test/hStoryMap.test.js` (6), tabs in `cmsContent.test.js`, Explorer UI config / layout tests for the
new tool, `php tests/PresentationEntityTest.php --write` (39). `npm test` 1874 pass; builds of explorer, website and
map pass.

**Open:** browser check (Explorer tool with the Map; website page with Result + Map + Story map); French texts of the
new captions; test data for `path`; HRuleBuilder's dialog starts from the source record type (from the source query).

