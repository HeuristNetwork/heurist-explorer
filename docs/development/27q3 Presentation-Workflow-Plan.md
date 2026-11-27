# 27q3 Presentation workflow: List, Viewer, Editor

**Status.** Proposal of Artem 2026-11-24, review round 1 answered the same day (§2-§5). **Phases 1-7 implemented
2026-11-24 (§7), not committed, no browser check** (explorer, reports, website deployed). Back link = field 2-1204;
reports are Presentation sets of kind Card Report 2-10645 / List Report 2-10646, only `/presentation/{id}` (§5). Open
items: §7.2. **Review 1 (Crosstabs) implemented 2026-11-25 (§8)**; **review 3 (Story map and Reports in the same
layout, Reports View mode) implemented 2026-11-25 (§9)**; **review 4 (Reports details, right aligned toolbar, public
records) implemented 2026-11-25 (§10)**; **Export review implemented 2026-11-25 (§11)**; **Story map review (Show for, topic
record type, own map and timeline) implemented 2026-11-25 (§12)**; **review 5 (Story map form and publication, website
topic list, page Map / Timeline elements, Close and clear, Interface sections, editors from the CMS) implemented
2026-11-27 (§13)**; **review 6 (List kept between View and List, CMS editor alone, Crosstabs form switches, story band
in Explorer's timeline, timeline French and locale, Website manager editor, topic picker by type) implemented 2026-11-27
(§14)**; **review 7 (Publish and the CMS use separate Map / Timeline elements, editors above the CMS editor, Show for
All <type>) implemented 2026-11-27 (§15)**; **review 8 (page language, one topic picker, panel titles, story map
selection on pages) implemented 2026-11-27 (§16)**, not committed, no browser check. Extends the topic note
`presentation-sources.md`.

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

## 8. Review 1: Crosstabs (Artem 2026-11-25, implemented the same day)

### 8.1 One layout for View, List and Editor (Option 2 of Artem)

Left = the toolbar, right = the header (the pane header in View and List, the full screen header in the Editor). The
mode switch is always the last button on the right, Help just before it.

```
View:    New | Selector ▾ | Edit                       ‖ Show for ▾ | Refresh    <->  Publish | Help | List
Editor:  New | Selector ▾ | Properties | Save | Save as ‖ Show for ▾ | Refresh    <->  Publish | Help | Close
List:    (no toolbar, no title bar)                                               <->  New | Help | View
```

- Changes §3 for Crosstabs: Publish and Help are on the header, not in the toolbar. The toolbar has a slot `edit` (the
  viewer) after the selector. New (fa-circle-plus), Properties, Refresh, Publish, Help are icons only (for every type);
  Edit, Save, Save as keep their labels. The scope is *Show for* in View and Editor (was *Test on* in the Editor).
- `createSourceHeader({actions})` / `setActions()`: icon buttons before Close.
- HPresentationList: `showBar: false` (Crosstabs: New on the pane header), `selectHint` ("Select a crosstab in the
  list", also fixed: the hint was removed by the pages panel).

### 8.2 List, pages, new crosstabs

- List rows: no record type icon. On mouse over the **pen = Properties** (the record editor, as in every other list) and
  the **trash = Delete** beside it; a double click and the leftmost Edit icon open the Editor. Generic options:
  HRecordList `interaction.deleteEnabled` / `onDeleteRecord`, HRecordManager `deleteRecord`, `activateRecord` (double
  click in `manager` mode).
- Published pages: a panel on `--h-color-surface`. `/page/{id}` meta.website of a menu page has `site {id, title,
  languages}` (`WebsiteRepository::websiteOfPage`: the menu pointers followed up, MENU_DEPTH) and `url`
  `/site/{website}/{page}` (was empty). The note "in <website>". Review 2 (2026-11-25): no Language column (a
  standalone page has none); in a narrow pane (< 420 px) the icons wrap to a second line under the name and date. Edit opens the CMS editor at once (`ExplorerApplication.editWebsitePage`: the Website
  manager with `design {site, page}`; a standalone page is opened itself). Test: `WebsiteEditTest` 118 passed.
- A new crosstab (New, Save as) is saved public (`rec_NonOwnerVisibility`), changed in Properties.

- Review 2 fix: View → List did not change the header buttons (they were drawn before the List existed); the same in
  Story map.

### 8.3 Open

- ~~Story map and Reports: the same layout (header right group, no List bar)~~ — done in review 3 (§9).
- Editing a crosstab from the CMS editor opens Explorer in a new window (`?tool=crosstabs&preset=`). In place would need
  a host bridge call (`openPresentationEditor(kind, id)`) when the CMS runs inside Explorer: the CMS (apps/website) may
  not import the crosstab editor (apps/explorer). To agree. — done 2026-11-27 (§13 item 10).

## 9. Review 3: Story map and Reports in the Crosstabs layout (Artem 2026-11-25, implemented the same day)

### 9.1 Layouts

```
STORY MAP
View:   [⊕] [Selector ▾] [Edit] ‖ [⟳]                                 header: [?] [List]
Editor: [⊕] [Selector ▾] [⚙] [Save] [Save as] ‖ [▶ Run]              header: [?] [Close]
List:   (no toolbar, no list bar)                                    header: [⊕] [?] [View]

REPORTS (pane)                                                        right end                 header (pane)
List:   [⊕] [(selector, Edit: place kept)] ‖ Show for ▾ [Test] [Generate] ‖ Import | Export | Unregistered   [?] [View]
View:   [⊕] [Selector ▾ card|list] [Edit]  ‖ Show for ▾ [Test] [Generate] ‖ Import | Export | Unregistered   [?] [List]
Editor: [⊕] [Selector ▾ card|list] [⚙] [Save] [Save as] ‖ Show for ▾ [Test] ‖ Import | Export   header: ⚠ note [?] [Close]
```

- Shared shell: a slot `placeholder: true` keeps its place, not seen (`is-placeholder`); the selector `badge`; `tools`
  (icon buttons at the right end, group of ⋯ and Help); `createSourceHeader({note})` / `setNote`; `renderHeaderActions`
  (the header buttons of Crosstabs, Story map and Reports). HPresentationList: `setListVisible` (the View of the
  reports), `kindBadge` (card / list just after the Edit icon, the same width).
- Story map: viewer toolbar on the slots (New, selector, Edit, Refresh = read the story maps again); header Help |
  List, List New | Help | View; editor Help on the header; a new story map is public (as crosstabs).
- Reports: one toolbar of the manager for List and View (changed by review 4, §10). In the List the selector and Edit keep their places, so Show
  for and the buttons after it do not move; for a card report Show for and Generate keep their places too. *Show for*
  (list reports): Current result first, then the query sources and saved filters without parameters (the one picker
  `chooseQuerySource` + `queryChoiceItems`); the choice is kept for the session and used by Test (pane and editor) and
  Generate. *Unregistered* only when there are such files. *Export* needs a selected report.
- The header of the pane: Explorer gives the tool module's `actions` element to `mountHeuristReports({headerActions})`
  (option of the direct entry, Explorer its only caller); Help = new bridge call `openManual('reports')`. Standalone,
  Help and the mode switch are at the right end of the toolbar.

### 9.2 Right side of the reports

- No title, kind or description. One message row on top (`.h-reports-message`, text + Close / Open / Download icons).
  The old JS warning in the pane is gone: its `flex: 0 0 100%` in a column box made it as high as the pane (the 560px
  bug). The JS/CSS note is on the header of the editor only, when scripts are not allowed.
- Nothing selected: "Select a report"; no registered report at all: the template files without a record. Unregistered
  button: those files with Register | Delete, Close goes back.
- Card report: "Card report shows either the first selected or the first record in result list" and the output at once;
  it follows Explorer's selection and result (new `setSelection` / `setDataSource` of the public API of the reports
  app, debounced).
- List report: the progress of its generation (when running) above its generated reports: `createOutputsPanel(...,
  {template: true})` - no Report column, no report filter, no New Report; Search | Sort by date / by size (newest or
  largest first). A click on a file shows it instead of the list ("Generated report", Open, Close).
- Test: "Test output is limited with 50 records" (the server limit) with Open in new window | Download | Close; Close
  shows the generated reports again. **Decision 2026-11-25: Test is the only output that is not kept**; a full output
  is always a Generated report record (RT_REPORT_OUTPUT), deleted by the user when not needed.
- Generate: a popup with Name (the report title) and Language (terms of DT_LANGUAGE that are languages of the database;
  default none); the record is created in the background (`POST /output/0`, the user's own, hidden; no record editor)
  with the query of Show for, then the job runs and the list is read again. Generate is no longer in the editor.
  The New mode of the outputs panel (source radios) stays for the CMS designer.

### 9.3 Open

- Browser check.
- Manual: a Reports section in the Explorer manual, English and French (Help opens `#reports`; there is no such
  section yet, so the manual opens at the top). The Story map section still describes the old buttons.

## 10. Review 4: Reports details (Artem 2026-11-25, implemented the same day)

```
REPORTS (pane)                                       right aligned, wraps in a narrow pane         header (pane)
List:   [⊕]                                 Show for ▾ [Test] [Generate] ‖ Import | Export | Unregistered   [?] [View]
View:   [⊕] [Selector ▾ card|list] [Edit]   Show for ▾ [Test] [Generate] ‖ Import | Export | Unregistered   [?] [List]
Editor: [⊕] [Selector ▾] [⚙] [Save] [Save as]          Show for ▾ [Test] ‖ Import | Export    header: ⚠ note [?] [Close]
(a card report: no Show for, Test, Generate in List and View; Generate primary in the pane, Test primary in the editor)
```

1. The list of query sources and saved filters is kept for 60 s per api client (`listQueryChoices`, option `fresh`,
   `clearQueryChoiceCache`): a picker opened again does not read it again.
2. Parameterized query sources and saved filters are **left out** where they are not allowed (`queryChoiceItems`
   `parameters: 'without'`; before: shown disabled). This changes the rule of the one picker (query-choice-picker.md).
3. (no item 3 in the review)
4. Editor: Test is the primary button; List / View: Generate.
5. New Presentation sets and Generated reports are **public**: the record editor of Explorer (`RecordEditorHost`
   `_addDefaults`), New report and Generate of the pane, the server import of a template, the Team report of the CMS.
6. The presentation toolbar wraps (shared shell).
7. List / View: a card report has no Test (its output is shown at once).
8. Editor: Show for is the same control as in List / View (list reports).
9. The JS/CSS note on the editor header is in normal font.
10. **Deviation from review 3**: Show for and the buttons after it are not kept at a fixed place; all groups after the
    first are right aligned together (`.h-presentation-toolbar-end`) - Crosstabs, Story map, Reports, Export. The
    Reports List has no selector and Edit (no placeholders any more; `placeholder: true` stays in the shell).
11. The number of generated reports of a template: "Title (3)" in the selector (pane and editor) and its list, a number
    at the right of each row of the List (HPresentationList option `rowCount`).
12. Generated reports of a template: Lang, Query, Scheduled, Generated, Size are hidden below 560 px, then all but Name
    below 300 px (container queries, `.is-template`); small Search and Sort that wrap; Name is a link that opens the
    file in a new window.
13. New report: a small popup with Name, then the kind ("List (record set)" / "Card (single record)"); the record is
    created in the background (public, no record editor, `ReportsApplication.createReport`), then the template editor
    opens.
14. Generate report and New report popups: the form dialog of the Publish popups of the modules (HEditForm in a message
    dialog, `openEditFormDialog`, 560 px): labels, font and size as there; Language is an enum with "Default language"
    first. The reports' own `openFormDialog` is no longer used by the pane for these two.

## 11. Export review (Artem 2026-11-25, implemented the same day)

```
Export: [↺ Reset] [Saved exports ▾] [⚙] [Save] [Save as] [🗑]          [Export] [Export results]
```

1. `.h-export-tool` is as wide as the pane (was max 980 px).
2. New → **Reset** (fa-rotate-left, "Reset export settings"): the default settings, no saved export.
3. Save of a new export and Save as: a small popup with Name only (the form dialog of the Publish popups); the
   Presentation set is created in the background (`POST /presentation/0`, public), no record editor.
4. Delete (trash) next to Save as, enabled when a saved export is shown; the ⋯ menu of Export is gone.

### 11.1 Reports, review 4 continued (Artem 2026-11-25)

15. The reports pane opens in **View** mode (List with the header button).
16. The number of generated reports is a badge again, as in the old report list (file icon + number, muted): shared
    `presentationCount`, used by the selector (`count`), its list (`count` of an item) and the rows of the List
    (`rowCount`); `ReportsApplication.outputCountBadge`. Replaces "Title (3)" of item 11.
17. New report: one small popup with Name and Kind as a radio group ("List (record set)" / "Card (single record)",
    List first), button Create; no second question. Import still asks the kind with the same captions.

## 12. Story map review (Artem 2026-11-25, implemented the same day)

Decisions asked the same day: the topic record type is a **new required field** and the query stays (optional); the
Editor always has its own map and timeline, the View an **Own map** toggle; the website *Select* action is later (own
CMS plan).

```
View:   [⊕] [Selector ▾] [Edit] [Own map]      | Show for [Current result ▾] [<topic record> ▾ Browse] [⟳]
Editor: [⊕] [Selector ▾] [⚙] [Save] [Save as]  | Show for [Current result ▾] [<topic record> ▾ Browse] [⟳]
        form | story | own map above own timeline (see review 2 below for the place)
```

1. **Bug:** the Editor showed no form for an existing story map (only for New). `openPreset` opens the form in the
   Editor; the form is always open there.
2. **Story topic record type** (`story.topicType` of the configuration, required in the form, before *Story topics*).
   *Story topics* (the query, 2-12) is optional now. Older story maps take the first `t:` of their query
   (`storyTopicType`, storyMapModel.js); the server check (`StoryMapSettings.php`) knows the key.
3. / 4. **Show for** in the Editor and the View: a select *Current result* | *Story topics* (only with a query) | *Any
   <type>*, and the record picker: HInputResource (`dropdown`, Browse = the record manager of Explorer) over a
   `RecordTitleSource` of the topic type. **Refresh** reloads the story (fresh cards and places).
5. The range: Current result and Story topics are their query with `t:<topic type>` added (`withType`), at most 500
   records (`RANGE_LIMIT`, given to the picker and to Browse as `ids`); Any = all records of the type. A range of one
   record shows its story when no topic is chosen. Show for and the topic are kept per story map in the session.
6. **Explorer's selection is not followed**: `StoryMapTool.setSelection` does nothing, the result only changes the range
   of *Current result*. The topic is the selection of HStoryMap (so a change of the settings keeps it); the website
   still gives the page selection to HStoryMap (PageSync).
7. **Own map and timeline**: Explorer mounts the direct entries of Map and Timeline (`mountOwnMap`,
   `mountOwnTimeline` in `_storyMapOptions`; asset URLs `heurist-map`, `heurist-timeline`). StoryMapBinding draws
   on the own map when it is on, else on Explorer's Map module. The timeline gets the elements of the story
   (`setQuery([{ids}])`) and the current element as its selection. Editor: always, beside the story; View: the *Own
   map* toggle (session), map and timeline under the story.

Deviations: the Editor's **Run** is gone (Show for = Story topics does it without changing Explorer's result). Opened
from the CMS designer (`?tool=storymap&preset=`): Show for = Story topics and its first topic is shown; Explorer's
result still shows the story topics, but no record is selected any more.

**Review 2 (Artem 2026-11-25, implemented the same day):**
- **List** shows only the list of story maps and their published pages: the story, the own map and the timeline are
  hidden with it (before, the own map stayed visible below the List).
- The own map and timeline follow the **orientation of the stories** in both modes: beside vertical stories, under
  horizontal ones. When the pane is too narrow for the map beside (Editor < 900 px, View < 600 px) they go under the
  stories instead of being hidden.

**Review 3 (Artem 2026-11-25, implemented the same day):**
- **Editor = HCardinalLayout** (as the crosstab editor): the configuration form on the west whatever the orientation
  of the stories, the story (and its own map and timeline) in the center. The 600 px rule for the map beside now uses
  the width of the center.
- **Publish** in the Editor and the View: the story map as a standalone web page with the story topic chosen in Show
  for; without a chosen topic only a message. The Editor saves first. Explorer's publication form (moduleType
  `storymap`, `storyMapConfiguration.js`: the story map + *Publish to*) writes the website element Story map
  `{preset, topic, ownMap: true}` (srv `WebsiteEditService::PUBLISHED_WIDGETS` + `storymap`).
- Decision (asked the same day): the published page has the **own map in the element**: `settings.ownMap` mounts the
  Map and Timeline direct entries of the page inside the element (beside vertical stories, under horizontal ones);
  `settings.topic` is the story shown first. The timeline sync is shared (`storyMapTimeline.js`).
- Open: *Own map* and *topic* in the Story map element form of the CMS designer (only Publish writes them now).

### 12.1 Open

- Website: a *Select* action (any record of the topic type) and the story map element using `story.topicType` — own
  CMS plan (`leftovers 24, 27-34.md` §2).
- Browser check: the own map and timeline in the editor (direct entries in Explorer's page, their CSS), Browse of
  the picker, a story map without a topic type.

## 13. Review 5: Story map, Crosstabs and Timeline configuration (Artem 2026-11-27, implemented the same day)

Recommendations agreed with the plan (2026-11-27): the publication keeps the map and timeline in the element; the CMS
form has Map and Timeline in *Behaviour*; the editors open over the CMS designer for Crosstabs and Story map (Reports
later); the form switches start with optional properties hidden and help tips shown.

1. **Own map and timeline** (Explorer and website): no header, no Heurist controls, no map controls (zoom, scale ...):
   `OWN_MAP_SETTINGS` / `OWN_TIMELINE_SETTINGS` (storyMapTimeline.js) as the bootstrap settings of the direct entries.
   The own map no longer loads the user's saved map preference.
2. **Form switches**: a bar above the story map form (stays on top, only the form scrolls): *Optional properties* and
   *Help tips* (`setShowOptional`, `setFieldHelpVisible`), kept in the local storage. *Show as*, *Begin or main* and
   *Element symbology* are `recommended` (always shown).
3. **No flight to the same place**: `boundsNearlyEqual` (storyMapModel.js, each edge within 2 % of the width / height,
   at least 0.001°); StoryMapBinding keeps the bounds of the last flight (forgotten by `clear` / `clearStory`). The
   flight goes from where the map is to the element: Start and End info and elements at one place do not fly.
4. **Publish dialog** (storyMapConfiguration.js, publication mode): **Source** — Story map (read only), *Allow selecting
   the topic*, *Topics range* (Story topics, All <type>, Current result; preselected from Show for), *Selected topic*
   (read only, the topic of Show for); **Map and timeline** — *Show map*, *Show timeline*; **Interface** — *Show
   header*, *Language*. Current result keeps the query of Explorer's result in the element (`query`).
   - 4A: separate Map and Timeline elements are possible on a page (CMS, item 8d). Publish writes one element only
     (`WebsiteEditService::importModule`); separate elements from Publish: later if needed.
   - 4B: the website element shows a topic list above the story (HInputResource `dropdown` over RecordTitleSource of
     the topic type, at most 500 records, no Browse) when *Allow selecting the topic* is on.
5. **Close and clear** (last header button of the Story map pane): no story map chosen, the story and its layers gone,
   the own map and timeline closed; the pane is minimised when the story map is the only module configured for it
   (collapsed in *In panes*, else hidden; never the center) — `ExplorerApplication._minimizeAlonePane`.
6. **Interface** group in Crosstabs and Story map (publication): *Show header* (`ui.showSourceHeader`) and *Language*
   (`ui.language`); the language terms are shared (`PUBLICATION_LANGUAGE_TERMS`, presentationKinds.js). The website
   element shows the header (name of the story map) and uses the language as crosstabs do.
7. **Timeline: Show control panel** (`options.ui.enabled`, default on, all modes): off hides *Show header* and *Expand
   control panel initially* (the forms can hide, not disable) and at run time there is no control panel and no toggle
   (DocumentControlPanel already skips it).
8. **CMS Story map element form** = the website fields of storyMapConfiguration (`storyMapFormFields`, as crosstabs):
   Source — Story map, *Allow selecting the topic*, *Topics range* (Story topics, All records of the topic type, **Saved
   filter by Action**: the records of the page's Saved filter links / Filter widgets are the range, PageSync gives
   them to the element), *Selected topic* (a record picker, the story shown first); Behaviour — *Map* and *Timeline*:
   Own (in the element) | None | a Map / Timeline element of the page. `ownMap: true` of older pages = own map and own
   timeline. 8b2 *Selection by Action*: later.
9. **Labels**: "Own query of the crosstab"; the page source "Saved filter links" is "Saved filter by Action link" (all
   element forms).
10. **Editors from the CMS**: Explorer's bridge `openPresentationEditor(kind, id)` opens the full screen crosstab / story
    map editor over the designer; closed: the pane of the kind reloads, the designer reads the list and the preview
    again. Without the bridge: Explorer in a new window as before. Reports: the report editor has no full screen entry
    yet (later).

Settings of the website element Story map (`storyMapConfiguration.normalize`):
`{preset, topic, topicSelect, topicRange: story|any|current|links, query, map: own|none|<instance>,
timeline: own|none|<instance>, ui: {showSourceHeader, language}}`.

### 13.1 Open

- Browser check of all items (own map without controls, Publish dialog, website topic list, a page Timeline element,
  Close and clear in a pane, Edit from the CMS).
- *Selection by Action* as a topic range (8b2); separate Map / Timeline elements from Publish (4A); the Report editor
  from the CMS (10).

## 14. Review 6 (Artem 2026-11-27, implemented the same day)

1. **List and View** (Crosstabs, Story map): the List is kept (hidden) when the View is shown, with its selection and
   its Published pages; shown again it is read again only after a change: saved / deleted in the Editor or Properties
   (`list`: the list and the pages), published (`pages`: the pages only) — `HPresentationList.showAgain`. The item of
   the View is selected in the list (the row highlighted). 1a: a click on the selected row does not read the pages
   again (`select(id, {force})`).
2. **CMS editor alone**: Edit of a published page opens the CMS designer without the Website manager under it
   (`openWebsiteDesigner` of `apps/website/src/direct.js`, `ExplorerApplication.editWebsitePage`); within the manager
   when it is open.
3. **Crosstabs form switches**: the same bar as the Story map (*Optional properties*, *Help tips*), now shared
   (`createFormSwitches`, `formSwitchState` in presentationShell.js; one pair of browser settings for all editors).
   Recommended: Values of Rows; Field and Values of Columns and Pages; Measure; Title and Show totals; Visitors can and
   Export; also the fields that follow a choice (Period, Number of ranges, Ranges, Numeric field, Fields / Measures to
   choose), else they would be hidden when chosen. The Query of the crosstab and Caption stay optional.
4. **Explorer's timeline**: the View without own timeline shows the story as a band of Explorer's Timeline pane (when
   there is one): new Timeline API `addLayer({id, title, query})` / `removeLayer(id)` (bands of the host after the
   Workspace bands, no Show data / Workspace actions; `storyTimelineLayer` in storyMapTimeline.js). The layers on the
   map and the band are named **"StoryMap: <topic>"** (the story map name before a topic is shown); the map layers
   "(path)" and "(all places)" after it.
5. **Timeline French**: the form and toolbar were translated; the band panel was not (no `$HR`) — now it is, 17 strings
   added. The axis (months, days) follows the language (`locale` of vis-timeline, `visLocale`).
6. **Website manager**: a double click in the list opens the CMS editor (format 4, user may edit); *Open editor* also on
   standalone pages.
7. **Selected topic** (CMS form): the picker browses records of the topic type of the chosen story map (read from its
   configuration, else its query; changes with the story map).
8. **Console warning** of vis-timeline: the item template returns an element, so the XSS filter stays on and no
   "You disabled XSS protection" warning per timeline.
9. **Close and clear**: the pane is minimised first, then the story map is cleared (a failing or slow step no longer
   keeps the pane open). Not reproduced in tests: to check in the browser.
10. **Timeline Show control panel** no longer hides *Show header*; without the panel the header is still drawn
    (DocumentControlPanel, also the map).

## 15. Review 7 (Artem 2026-11-27, implemented the same day)

Decisions: the editors open above the CMS editor; Publish adds **separate Map and Timeline elements** (the designer
configures them in the CMS editor); on Update of a page the elements the story map uses are kept as configured, only
missing ones are added; a new page has Story | Map in two columns and the Timeline below; the own map / timeline of the
website element is **removed** (older `own` / `ownMap` = none). Explorer keeps its own map and timeline in View and
Editor. Report editor from the CMS: not now.

1. **Editors from the CMS**: they opened behind the CMS editor (z-index 10000 < 10010). `openCrosstabsDesigner` /
   `openStoryMapDesigner` take `{onTop}` (bridge `openPresentationEditor`): class `h-presentation-fullscreen-top`
   (z-index 10030). Dialogs (`<dialog>`) and popovers are above anyway.
2. **Show for** starts with *All <type>* (`'any'`): the current result often has no topic of the type. Kept session
   choices stay.
3. **Publish → separate elements** (3a): the Publish form has *Add a Map element* / *Add a Timeline element*
   (`showMap`, `showTimeline`, default on). `preparePublication` returns `companions` `[{role, type, settings, state}]`
   with the website defaults of the modules (`publication.companionDefaults`, Explorer `_websiteDefaults`); the
   publisher sends them with `POST /page/{id}/import` (no new endpoint). `WebsiteEditService::importModule` (storymap
   only): a new page = a group of two columns (story map, map; one column on narrow screens; 70vh) and the timeline
   below (30vh); an existing page: the instance the story map pointed to, else the first of the type with a host, else
   a new one appended; existing ones are not changed. The story map gets `settings.map` / `settings.timeline` = their
   instance ids. Test: `tests/WebsiteEditTest.php` (import storymap, import again keeps the CMS settings).
4. **CMS: a new Story map element** (3b): linked to the first Map / Timeline element of the page; missing ones are
   offered ("Show the story on a map and a timeline? A Map and a Timeline element will be added to the page." Add /
   Cancel) and inserted after it with their website defaults (`CmsDesigner._linkStoryGeo`). The element form offers
   None | the page's elements (no Own).
5. **Website runtime** (3c): `siteStoryMap.js` has no own map / timeline (ownGeo removed); the element fills the height
   of its node.

## 16. Review 8 (Artem 2026-11-27, implemented the same day)

Decisions: **the language of a published page is stored with the page** (2a, option a); panel titles **"Kind: Name"**.

1. **`<html lang="en">` of a published page** was a bug of all publications: a standalone page had no language (only
   its translations); the chosen language was only in the module settings. Now (2a) the language chosen in Publish is
   the **page language**: DT_LANGUAGE 2-967 on the standalone page (`importModule` input `language`); `WebsiteService`
   puts it first in the languages of a standalone page, so `<html lang>` and `runtime.language` of all modules follow it;
   the module setting is "auto" (follows the page). A menu page: the languages of its website (the page language is
   ignored). The field is added to Web page 99-52 by the website setup as an extra (`WebsiteSetup::PAGE_FIELDS`, not
   needed for "installed"; status `pageLanguage`); without it a page has no language. The CMS shows *Language* in the
   page fields of a standalone page. Test: `tests/WebsiteEditTest.php` (language of the page, `<html lang="fr">`).
2. **Timeline toolbar in French**: the label hints through `$HR`, 14 texts added (toolbar and control panel); the
   timeline language is `moduleLanguage(bootstrap)` (texts and the axis).
3. **One topic picker** (option C everywhere): `storyTopicInputOptions` (shared/src/widgets/storymap/storyTopicInput.js)
   — HInputResource `dropdown` (HValuePicker with its filter) of the topic type, the range as its query, Browse over the
   range. Why there were three: the website had no record browser (no Browse), the CMS field was `browseonly` (an
   oversight). The website now opens the shared record manager (`openRecordManager`, definitions read on the first
   Browse; visitors see public records).
4. **Panel title** of an element in the CMS editor: "Kind: Name" (`elementTitle`): Crosstabs: Sales by year, Record
   field: <name or field>, the kind alone without a name.
5. **No Publish** in the Crosstabs / Story map editor opened from the CMS.
6. **Height** of the published story map: `.h-site-storymap { height: 70vh }`.
7. **Selection on the page**: the website story map takes a selection only for records of the topic type (checked with
   a query); a click on the map or the timeline (an element of the story) leaves the story as it is.
8. **CMS: new Story map with Map and Timeline**: the publishing layout — a two column group (story map, map; 70vh) and
   the timeline below (30vh).
9. **No circle** Editor → Publish → Website manager → CMS editor → Editor (Artem 2026-11-27): opening the Website
   manager (the button of the Published dialog, or any other way) first closes an open Story map / Crosstabs editor;
   its unsaved changes are asked first, Cancel keeps the editor and the manager is not opened
   (`ExplorerApplication._closePresentationEditors`).
