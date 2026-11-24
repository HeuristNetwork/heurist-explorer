# 27q3 Presentation workflow: List, Viewer, Editor

**Status.** Proposal of Artem 2026-11-24, review round 1 answered the same day (§2-§5). **Phases 1-7 implemented
2026-11-24 (§7), not committed, no browser check** (explorer, reports, website deployed). Back link = field 2-1204;
reports are Presentation sets of kind Card Report 2-10645 / List Report 2-10646, only `/presentation/{id}` (§5). Open
items: §7.2. Extends the topic note `presentation-sources.md`.

## 1. Goal

One interface and one workflow for Crosstabs, Story map, Report, Export, Website and (later) Map document: the same
buttons in the same places, so that a user understands them without much explanation.

Record types and outputs:

| Type | Configuration | Output | In a website |
|---|---|---|---|
| Crosstabs | RT_PRESENTATION_SET | standalone page (RT_CMS_PAGE) | element `crosstabs` |
| Story map | RT_PRESENTATION_SET | standalone page (RT_CMS_PAGE) | element `storymap` |
| Map document | RT_MAP_DOCUMENT + RT_MAP_LAYER | standalone page (RT_CMS_PAGE) | modules Map and Timeline |
| Report | RT_REPORT_TEMPLATE | generated report (with or without RT_REPORT_OUTPUT) | element *Generated report* |
| Export | RT_PRESENTATION_SET | export output (with or without RT_REPORT_OUTPUT) | none |
| Website | RT_CMS_HOME + RT_CMS_PAGE | generated website (generated-sites folder / zip) | — |

## 2. Levels: Viewer, List, Editor

There are three levels:

- **Viewer** shows a presentation on the current result (`presentation-sources.md` §5). It exists only for Crosstabs,
  Story map and Map document.
- **List** shows the configurations on the left and the outputs of the selected one on the right.
- **Editor / Configuration / Preview** shows one configuration with its preview.

| Type | Viewer | List | Editor | Output |
|---|---|---|---|---|
| Crosstabs | pane: last or current presentation; pane header button → List | in the pane | full screen | Publish → page |
| Story map | as Crosstabs | in the pane | full screen | Publish → page |
| Map document | the map legend shows all map documents; Editor from the legend; List from a button next to *Add new Map document* | in the pane | separate plan | Publish → page |
| Report | none: the pane opens the List at once | in the pane | full screen | Generate → RT_REPORT_OUTPUT |
| Export | none: the pane opens the Editor at once | none (selector only) | the pane | Generate (ephemeral, optional *Keep*) |
| Website | none (no pane of its own) | full screen (`WebsiteManager`) | `CmsDesigner` | Generate → folder / zip |

### 2.1 List

**Left side.**

- An HRecordList (in HRecordManager) of all configurations of the type, with search, sort and *Show owners*, as in the
  Website manager.
- View mode `big` (extended, vertical) with the built-in renderer; no card template.
- Each row shows: visibility + ownership (`adminInfoHtml`), kind, icon, title, short summary (DT_SHORT_SUMMARY 2-3).
- **New** sits next to the title.
- A click selects the row and shows its outputs on the right. The leftmost icon **Edit** (or a double click) opens
  the Editor.
- **Delete** and **Properties** (the record editor: name, owner, visibility) are row tools. Delete warns about the
  pages that use the item.

**Right panel.**

- **Crosstabs, Story map, Map document:** the RT_CMS_PAGE records of the selected item, found through the back-link
  pointer (§4).
  - Columns: Visibility, Lang, Name, URL, Generated (date).
  - Actions: Edit, Delete, Copy URL, Open (new tab).
- **Report, Export:** the RT_REPORT_OUTPUT records. This replaces the `OutputsDialog` popup.
  - Columns: Visibility, Lang, Name, Query, Generated (date), Size.
  - Actions: Generate (bolt), Edit, Delete, Open (new tab), Download.
- **Card view report:** no outputs. The right panel is a quick preview for the selected (or first) record.
- **Website:** the website card and the generated websites (zips), as now.
  - Actions: Check, Generate (bolt), Edit (record), Delete, Copy URL, Open (new tab).

### 2.2 Opening

- No configuration of the type yet → the Editor opens at once (Website: the *New website* dialog).
- Only one configuration → the List as usual, with that item selected. There is no special case.
- The Editor opens directly only from a context: Edit in the Viewer or the List, CMS *Edit in new window*, or
  `?preset=`.
- Export: the Editor opens at once (Export has no List).

### 2.3 Editor

- Full screen for Crosstabs, Story map, Report, Map document and Website (the CMS editor). Export stays in its pane.
- The full screen has the `heurist-source-header` with the title and **Close**, which goes back to the List or Viewer.
  Close is not repeated in the toolbar.
- Below the toolbar is an HCardinalLayout:

| Type | Layout |
|---|---|
| Crosstabs | configuration form + preview |
| Story map | configuration form + preview (topic selector, HRecordList of story elements, Map + Timeline); to be described separately |
| Map document | layers + layer editor (as CMS pages + page editor) + preview Map + Timeline; separate plan |
| Report | patterns / variables + template editor + test area |
| Export | export configuration; no preview, only the link to the result, as now |
| Website | CMS editor + website view (as now) |

## 3. Toolbar (agreed 2026-11-24)

```
[New] [Selector ▾] [Properties] [Save] [Save as] | [Scope ▾ + parameters] [Refresh] | [Publish | Generate] | [⋯ Import, Export] [Help]
```

- The groups are fixed and always in this order.
- A slot that does not apply to a type is **hidden**. A slot that does not apply in the current state is **disabled**.
- **Selector**: the saved configurations of the type.
- **Scope**: *Current result / Own query* for Crosstabs, Story map and Report.
  - Export adds *Selection* (the query `ids:<selected ids>`, just another query) and the record types.
  - In the Editor, the scope is only the test data. Publish stores the query of the chosen scope
    (`presentation-sources.md` §6).
- **Refresh / Test**: Crosstabs, Story map, Report, Website.
- **Save / Save as**: saves the RT_PRESENTATION_SET, RT_CMS_HOME, RT_MAP_DOCUMENT or RT_REPORT_TEMPLATE record.
- **Publish** (fa-share-nodes) makes a **page**: Crosstabs, Story map, Map document.
- **Generate** (fa-bolt) makes a **file**: Report, Export, Website.
- **Import / Export** (report templates) are behind ⋯.
- Delete is in the List only.

### 3.1 Output

- Test + Download gives the ephemeral output.
- For Report, Generate creates an RT_REPORT_OUTPUT.
- For Export, Generate is ephemeral by default (a job result, as now). The option *Keep as generated output* creates
  an RT_REPORT_OUTPUT.
- Card view reports never create an RT_REPORT_OUTPUT.

### 3.2 Unsaved changes

- Close, a selector change and New ask *Save / Discard / Cancel*.
- Publish and Generate save first.

## 4. Structure changes

**Back link from pages.**

- Field **2-1204 "Presentations on this page"** (Artem 2026-11-24; already in `osmak_mapping`: dty 1202, resource →
  Presentation Set, repeatable on CMS Menu-Page). Map documents: its constraint is extended to RT_MAP_DOCUMENT with the
  map document plan.
- It is set by Publish and by the CMS when an element chooses a preset. It is cleared when the element is removed.
- The right panel of the List reads the pages with an ordinary `/records` query on this pointer, so no new endpoint is
  needed (plan 28).
- For the list, it replaces the scan of element settings (`CmsRecordReferences`,
  `PresentationEntityHandler::configurationUses`). The delete check can use it too.

**RT_REPORT_OUTPUT.** Its pointer 2-1183 "Custom Report" points to the Presentation Set instead of the report
template (§5).

**Short summary.** The List shows DT_SHORT_SUMMARY 2-3 (already on Presentation Set).

## 5. One record type for reports and presentations (decided 2026-11-24)

Artem: RT_REPORT_TEMPLATE and RT_PRESENTATION_SET are nearly the same; the template file is merely an external
configuration. **They are merged now. No conversion of legacy data:** everything is still in the sandbox.

Structure now (`osmak_mapping`, checked 2026-11-24):

| Custom Report Template 2-1104 (rty 124, 16 records) | Presentation Set 2-1112 (rty 138, 7 records) |
|---|---|
| 2-1 title, 2-4 extended description | 2-1 title, 2-3 short summary |
| 2-62 file name, 2-29 mime type | 2-1187 configuration (JSON), 2-12 query |
| 2-1182 card view (yes / no) | 2-1203 Presentation Type: Crosstab 2-10642, Export 2-10643, StoryMap 2-10644 |

Generated Report 2-1105 (rty 125, 22 records): 2-1 title, 2-12 query, **2-1183 → 2-1104**, 2-967 languages, 2-1184
interval.

### 5.1 Structure changes (done by Artem 2026-11-24, checked in `osmak_mapping`)

- Presentation Type 2-1203: new terms **Card Report 2-10645** (one record, card view) and **List Report 2-10646**
  (a report over a list of records = the former normal report). The card view flag 2-1182 is no longer used: a card
  report is a kind.
- Presentation Set: added 2-62 file name (the template file of a report) and 2-29 mime type (display name "File
  Extension"), both optional. The fields are shown by kind.
- **Still to do (Artem):** Generated Report: the constraint of 2-1183 is still 2-1104 (rty 124); it becomes 2-1112.
- RT_REPORT_TEMPLATE 2-1104 is retired; no code uses it any more. The 16 templates and 22 outputs in `osmak_mapping`
  are test data: deleted, or recreated by Import (.gpl).

### 5.2 Code changes

- `srv/Definitions/SystemConstants.php` + `hserv/consts.php`: TRM_PRESENTATION_CARD_REPORT 2-10645,
  TRM_PRESENTATION_LIST_REPORT 2-10646;
  RT_REPORT_TEMPLATE removed from the srv code.
- `srv/Reports/ReportRepository.php`, `ReportService.php`, `ReportEntityHandler.php`: read / write Presentation Set
  records of kind report / card report; the card flag comes from the kind.
- `srv/Records/Entity/RecordEntityRegistry.php` and `PresentationEntityHandler`: the report kinds (template file, mime
  type); the entity URL see §5.3.
- Legacy, kept working: `hserv/report/ReportTemplateMgr.php` (template file ↔ record by DT_FILE_NAME),
  `hserv/report/ReportRecordWriter.php`, `hclient/widgets/entity/manageRecords.js` (file name field),
  `hclient/widgets/cms/websiteStarterRecords.xml`.
- Client: `apps/reports` (ReportList, OutputsDialog, ReportManager), the CMS element *Generated report*, report pickers
  (`recordDomains.js`), the OpenAPI file.
- PHP tests in `heurist/tests/` that use report templates (e.g. `LegacyReportTemplatePermissionTest.php`) follow.

### 5.3 Endpoints (Artem 2026-11-24: only `/presentation/{id}`)

The entity `report` is removed; its endpoints move to `/presentation`. Every one is a plan 28 action (CRUD or a common
or per-entity action), so nothing new is invented. The kind of the record decides which actions apply: report actions
on a crosstab answer 400 *not a report*.

| Now | New | Plan 28 action | Kinds |
|---|---|---|---|
| `GET/POST/PUT/PATCH/DELETE /report/{id}` | `/presentation/{id}` (exists) | CRUD | all |
| `POST /report/{id}/duplicate` | `/presentation/{id}/duplicate` | common | all (duplicates the template file too for reports) |
| `GET/PUT/DELETE /report/{id}/asset` | `/presentation/{id}/asset` | common | Card Report, List Report |
| `GET/POST /report/{id}/execute` | `/presentation/{id}/execute` | per-entity | Card Report, List Report |
| `GET /report/{id}/export` (.gpl) | `/presentation/{id}/export` | common | reports now; later the JSON configuration of the other kinds |
| `POST /report/import` (`isCardView`) | `/presentation/import` (`kind` = card / list) | common | reports now; later the other kinds |
| `GET/POST/DELETE /report/setup` | `/presentation/setup` | common | state of the definitions, template files without a record |
| `GET/DELETE /output/{id}/asset` | unchanged | — | `output` stays an entity (RT_REPORT_OUTPUT); its 2-1183 points to the Presentation Set |
| jobs `report-preview`, `report-generate` | unchanged names | special (jobs) | take the presentation id |

- No `/report` alias: everything is in the sandbox. Old URLs stored in website elements are not converted; they are built
  at runtime from the id (`siteWidgets.js`, `reportRenderUrl.js`, `storyMapService.js`), so they follow the code.
- Template names (not ids) in older configurations keep using the legacy renderer (`reportRenderUrl.js`), as now.
- `isCardView` of import becomes `kind`; the `setup` answer lists the report kinds instead of the two record types.
- Client callers to change: `apps/reports` (reportApi), `shared/src/data/reportRenderUrl.js`, `recordDomains.js`,
  `ReportTemplateProvider.js`, `storyMapService.js`, `siteWidgets.js`, `CmsDesigner.js` (`/report/0`,
  `/report/{id}/asset`), the record view content provider; their tests. Server: `ReportEntityHandler` becomes the report
  part of `PresentationEntityHandler` (kinds card / list), `RecordEntityRegistry` drops `report`, the OpenAPI file.
2. ~~The concept codes of the two new terms~~: 2-10645, 2-10646 (2026-11-24).

## 6. Phases

1. **Shared shell** in `shared/src/widgets/presentation/` (layout only, no new inputs):
   - `openFullScreen(host, title)`, which replaces the copies in `CrosstabsDesigner`, `WebsiteManager` and
     `ReportEditorPanel`;
   - `HPresentationList`: HRecordManager in `big` mode + right output panel, from `WebsiteManager` /
     `WebsiteDetails`; works in a pane or full screen;
   - a toolbar builder with the slots of §3, reusing `toolButton` / `toolSeparator` of `crosstabsPresets.js`;
   - the unsaved-changes prompt.
2. **Server structure** (§4, §5): 2-1204 set on Publish and on the CMS preset choice; reports merged into
   Presentation Set (§5.1, §5.2).
3. **Crosstabs**: the pane = Viewer + List (header button); the Editor = `CrosstabsDesigner` on the shell; Delete moves
   to the List.
4. **Story map**: the editor moves out of the pane into a full-screen Editor, as in Crosstabs.
5. **Reports**: `ReportManager` → List (templates + outputs, card view preview) + Editor (`ReportEditorPanel`).
6. **Export**: saved configurations as Presentation set kind `export` (the server is ready), slots in the pane, *Keep*
   → RT_REPORT_OUTPUT.
7. **Website**: align the `WebsiteManager` / `CmsDesigner` toolbars with the slots.
8. **Map document**: separate plan.

**Checks for each phase:**

- `npm test`, build, deploy.
- Browser check on `osmak_mapping`:
  - List → Edit → Save as → Close;
  - Publish → the page appears in the right panel;
  - the Delete warning;
  - the unsaved-changes prompt.
- A PHP test for the back-link pointer.

## 7. Implementation (2026-11-24)

### 7.1 Done

- **Phase 2, server** (heurist repo): constants (`DT_PAGE_PRESENTATIONS`, `TRM_PRESENTATION_CARD_REPORT`,
  `TRM_PRESENTATION_LIST_REPORT`, also in `hserv/consts.php`); `ReportRepository` reads Presentation sets of the report
  kinds (`kind` card | list, `isCardView` kept for the clients); `ReportService::importTemplate` creates one (`kind`
  parameter of `/presentation/import`, `isCardView` still accepted); `PresentationEntityHandler` hands the hooks and
  actions of a report to `ReportEntityHandler` ("report"), another kind answers 400; the entity `report` is gone
  (`RecordEntityRegistry`, `ServiceFactory`, OpenAPI, READMEs). Legacy: `ReportTemplateMgr` (template rights),
  `ReportRecordWriter` (setup installs 2-1112 + 2-1105, converted schedules are List Reports), `manageRecords.js` (file
  name read only on 2-1112). Page back link: `WebsiteEditService::withPresentations` sets 2-1204 from the configuration
  (story map / crosstabs presets that exist as Presentation sets, `CmsRecordReferences::presentationIds`) on every
  save of a page through the page entity and on Publish (`importModule`). Tests: `ReportsApiTest --write` 95 passed
  (with a crosstab: no template, no report actions), `PresentationEntityTest` 56, `WebsiteEditTest` 114,
  `WebsiteRenderTest` 115, `DataAccessBoundaryTest`. `WebsiteContentTest` has 10 failures that were there before
  (its test website record is missing in `osmak_mapping`).
- **Client merge**: `/report` → `/presentation` in `ReportApi`, `reportRenderUrl.js`, `ReportTemplateProvider.js`,
  `storyMapService.js`, `siteWidgets.js`, `CmsDesigner.js` (team card report = Card Report), `StoryMapTool`;
  `recordDomains.js` without `report`; `recordEditStructure.js` and `writableRecordTypes.js` on RT_PRESENTATION_SET;
  `ReportsApplication.newReport(kind)` / `registerReport` add a Presentation set with its kind.
- **Phase 1, shared shell** `shared/src/widgets/presentation/`: `presentationShell.js` (`openFullScreenHost`,
  `createSourceHeader`, `renderPresentationToolbar` with the fixed groups of §3, `presentationButton`,
  `presentationSelector`, `togglePresentationList`, `createScopeSelect`, `confirmLeave`), `HPresentationList.js` (+ css),
  `presentationPages.js` (pages by 2-1204: visibility, languages, name/URL, changed; Edit, Copy URL, Open, Delete of a
  standalone page; `describePresentationUse`), `presentationKinds.js`.
- **Phase 3, Crosstabs**: designer on the shell (header, New | selector | Properties | Save | Save as ‖ Test on |
  Refresh ‖ Publish (saves first) ‖ Help), Delete moved to the List; the pane has a List button on its header
  (HPresentationList + published pages; Edit of a page opens the Website manager with the page).
- **Phase 4, Story map**: `StoryMapTool` has two modes: the pane is the viewer (selector | Edit | New, List and Help on
  the header), `ExplorerApplication.openStoryMapDesigner` opens the editor over the whole screen (the form always open,
  New | selector | Properties | Save | Save as ‖ Run ‖ Help). The CMS *Edit in new window* opens the editor.
- **Phase 5, Reports**: `ReportManager` is the List (Card / List Reports, New asks the kind, Import, Delete refused with
  generated reports); right side: Test | Generate | ⋯ (Edit the template, Export), the generated reports of a List Report
  inline (`createOutputsPanel`, was a popup), the preview of a Card Report, the output; templates without a record when
  nothing is selected. `ReportEditorPanel`: header with Close and the common toolbar (Generate saves first).
- **Phase 6, Export**: the common toolbar in the pane; saved exports are Presentation sets of kind Export (selector,
  Save, Save as and a new one through the record editor, Properties, ⋯ Delete); Export = Generate; Export results kept.
- **Phase 7, Website**: the Website manager uses the shell header, host and buttons.
- Localization (eng / fre) of explorer and reports; user manuals (English) of Explorer and Reports. Tests: `npm test`
  1931 passed (report manager tests rewritten for the List).

### 7.2 Deviations and open items

- **List view mode**: `list` with the summary under the title, not `big`: the Extended view of the record manager shows
  the whole record, with its Configuration JSON.
- **Export**: the scope stays in the form; *Keep as generated output* (RT_REPORT_OUTPUT) is **not done**: the job
  `report-generate` runs Smarty only; an export output needs that job to run the export writer (server work, to agree).
- **Story map**: no Publish yet (the server publishes only crosstabs widgets, `PUBLISHED_WIDGETS`); the map of the
  editor's preview is Explorer's Map module behind the editor (to be described, §2.3).
- **CMS editor** (`CmsDesigner`): its toolbar in the west pane (Properties, Styles, Check, Open, Help, Close) is not
  changed: it has no header, and Styles has no slot. To review with Artem.
- **2-1204** is set by the new API only: pages saved before, or by the legacy editor, have no back link until they are
  saved again (the delete check of the server still scans the configurations, so it is right).
- **Old test data**: the 16 Custom Report records (2-1104) and 22 Generated Reports of `osmak_mapping` are not
  converted (agreed); they are not listed any more.
- French user manuals not updated yet.
