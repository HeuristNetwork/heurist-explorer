**Status 2026-10-28: Phase 2 committed. Phase 3 in progress: Timeline done (§17), not committed, not checked in a
browser.** The tables (§4–§8) were agreed by Artem on 2026-10-28, together with the proposals of §3 (advanced =
`req: 'optional'`, no UI = `req: 'forbidden'`), §9 and §12. Phase 2 notes: §16. Next: Record view.# Plan 29 — Module configuration and Publish dialogs

**Status 2026-10-28: Phase 1 agreed; Phase 2 implemented, not committed, not yet checked in a browser.**
The tables (§4–§8) were agreed by Artem on 2026-10-28, together with the proposals of §3 (advanced = `req: 'optional'`,
no UI = `req: 'forbidden'`), §9 and §12. How Phase 2 was done, and where it differs from the plan: §16. Next: Phase 3,
the old dialogs replaced one by one, starting with Timeline.

## 1. Goal

The presentation modules (Map, Timeline, Graph, Data, Record view) each have a hand-written configuration
dialog. Line counts:

| Module | Dialog | Lines |
|---|---|---|
| Map | `MapConfigurationDialog.js` | 1786 |
| Data | `DataConfigurationDialog.js` | 787 |
| Graph | `GraphConfigurationDialog.js` | 747 |
| Record view | `RecordViewConfigurationDialog.js` | 493 |
| Timeline | `TimelineConfigurationDialog.js` | 219 |

The dialogs are built in plain DOM. Each module codes its own:

- modes;
- *advanced* rows;
- values forced per mode;
- hidden fields.

Nothing documents which options exist and where they are shown.

This plan:

1. Agrees **one list of options per module**, in tables (§4–§8).
2. Writes from these tables **one HEditForm JSON per module** (§9, §11). These forms **replace** the
   old dialogs, one module at a time (agreed 2026-10-28).
3. Gives every module the same **configuration API**, usable by Explorer, the website editor and an
   AI agent (§12).
4. Adds a **test popup** with a module selector and a mode selector (§13).
5. Puts a **Publication** section with *New page | Update the page* in the publication form (§10).

Not in scope: the Explorer configuration dialog (`ExplorerConfigurationDialog`). Explorer only
carries the module preferences in `captureView()` (plan 27b).

## 2. Modes

| Mode | Old name | Opened from | Button |
|---|---|---|---|
| `configuration` | `preferences` | gear icon in the module (Explorer) | Apply |
| `website` | `website` | website editor (module instance on a page) | Save |
| `publication` | `publish` | share icon in the module | Publish |

- **Advanced** is a switch, not a mode. It is offered in `configuration` and `website`.
  - Its state is remembered per mode, as Map does today (`advancedStateByMode`).
  - `publication` shows no advanced options.
- **Simplified UI** (Explorer `isSimplifiedUI`, `runtime.simplifiedUI`) is a filter on top of the
  mode. Its forced values are in the *notes* column.

## 3. Table columns

| Column | Meaning |
|---|---|
| system name | full key path in the settings envelope `{options, config}` |
| caption | English caption (the localization key is the caption) |
| type | HEditForm type: `group`, `boolean`, `enum`, `integer`, `float`, `freetext`, `blocktext`, `geo`, `json`, `special:<editor>` |
| enum values | `id` "label"; *termsSource* where the list is loaded at run time |
| adv | `x` = shown only when Advanced is on |
| configuration / default | the default value; the field is shown in `configuration`. `no UI` = never shown, the value is kept |
| website | `x` = shown; `=value` = forced (not shown, always this value); empty = not shown, value kept |
| publication / default | `x` = shown; `=value` = forced; empty = not shown, value kept |
| help | help tip in the form (HEditForm `help`); empty for obvious options |
| notes | dependencies (`showWhen`), simplified UI, other rules |

**Why `options` and `config` are separate.** The split comes from Map. The other modules copied it.

| Part | What it holds | Examples |
|---|---|---|
| `options` | how the module **viewer** looks and what the user may do | control panel, native controls, interaction, allowed documents / base maps, language |
| `config` | defaults for the **content**: how data is loaded and drawn | limits, layout, templates, symbology, the dynamic document |

- In Map, `config.defaults` are the fallback values. A map document or layer can override them with its
  own value (`HEURIST_MAP_CONFIG_DEFAULTS`: "defaults shared by MapDocuments/MapLayers when they omit a
  value").
- The envelope is stored as it is in preferences, website page instances and publications. Changing it
  would need a migration, so the split stays.
- One known exception: Record view keeps `showHeader`, `headerTitle` and `emptyMessage` in
  `config.defaults`, although they are interface options. They stay where they are, for the same
  reason.

**Advanced and no UI as requirement types** (proposed 2026-10-28 in answer to Artem). Instead of new
properties, the forms use the field requirement `req` that record forms already use:

| Requirement | In a configuration form | Like in a record form |
|---|---|---|
| `recommended` | normal option, always shown (bold label) | |
| `optional` | **advanced** option, shown only when Advanced is on | shown only with *Show optional* |
| `forbidden` | **no UI**: never shown, the value is kept unchanged | `rst_RequirementType = 'forbidden'` |

- Advanced = *Show optional*. It uses the same view filter in HEditForm (`setViewFilter`).
- `required` is not used: every option has a default.
- **Difference from record forms:** a `forbidden` field still carries its value in `getValues()`.
  `HDbDefs` drops forbidden fields. HEditForm must keep them.
- In the tables below: column *adv* `x` = `req: 'optional'`. `no UI` = `req: 'forbidden'`. Other
  fields are `req: 'recommended'`.

Rows of type `group` are the **sections**. A section is an HEditForm `group`, shown open, like the
standard separator in record edit forms. It is not an accordion or a tab (agreed 2026-10-28).

Agreed 2026-10-28:

- **Template pickers** (popup, card, extended view, Smarty) are `enum` with
  `termsSource: 'smartyTemplates'`.
  - The fixed entries (none, built-in, standard) come first.
  - The custom report templates follow.
- **`options.ui.language`** is added to **every** module.
  - Values: auto / eng / fre / ger / por; default `auto`.
  - It is **shown in publication only**. Elsewhere it is `auto`: the module takes the current language
    of Explorer or of the website (Artem, 2026-10-28).
  - In publication `auto` becomes the runtime language, as Graph, Data and Record view do now
    (`publicationSettings`).
- **Data** gets `options.nativeControls.sort` and `options.nativeControls.showOwner` (§7).

**Common interface keys** for every module (Artem, 2026-10-28). They are not repeated in §4–§8:

| system name | caption | type | configuration / default | website | publication / default | notes |
|---|---|---|---|---|---|---|
| options.ui.showOptions | Options | boolean | no UI: true | =false | =false | the gear icon; the configuration is opened from it |
| options.ui.showPublish | Publish | boolean | no UI: true | =false | =false | the share icon; **new** key in Graph, Data, Timeline (today the icon follows `runtimeMode`) |
| options.ui.showHelp | Help | boolean | no UI: true | =false | =false | the help icon of the module; **new** key in all modules |
| options.ui.language | Language | enum: auto, eng, fre, ger, por | no UI: auto | =auto | x (auto) | in publication `auto` → runtime language |

- The old rules are dropped: Options could be changed only in website mode (Graph, Data), and was
  forced true in preferences.
- `options.ui.initiallyExpanded` defaults to **false** in all modules (Artem, 2026-10-28).

## 4. Map

Files: `apps/map/src/ui/config/mapConfigurationDefaults.js`, `mapConfigurationSchema.js`,
`MapConfigurationDialog.js`, `simplifiedMapSettings.js`.

| system name | caption | type | enum values | adv | configuration / default | website | publication / default | help | notes |
|---|---|---|---|---|---|---|---|---|---|
| — | Interface | group | | | x | x | x | | |
| options.ui.enabled | Heurist Map Controls | boolean | | | true | x | x | Show the Heurist control panel over the map | master switch: the next rows have showWhen enabled |
| options.ui.showCurrentDocument | Workspace/Filtered Result | boolean | | | true | x | x | | showWhen *Show only active document* is off |
| options.ui.showMapDocuments | Map documents | boolean | | | true | x | x | | showWhen *Show only active document* is off |
| options.ui.showBaseMaps | Base maps | boolean | | | true | =false | x | | |
| options.ui.initiallyExpanded | Initially expanded | boolean | | | false | x | x | | |
| options.ui.showSourceHeader | Show header | boolean | | | false | x | x | Title of the current query above the map | simplified: false |
| options.ui.showHomeControl | Home | boolean | | | false | x | x | Button that returns to the initial extent | |
| options.ui.showLegend | Legend | boolean | | | no UI: true | | | | |
| options.ui.showLayers | Show layers | boolean | | | no UI: true | | | | |
| options.ui.placement | Control placement | enum | overlay, side | | no UI: overlay | | | | |
| options.ui.position | Control position | enum | top-left, top-right, bottom-left, bottom-right | | no UI: top-right | | | | |
| options.ui.controlCss | CSS for Map Control | blocktext | | | no UI: null | | | | |
| — | Native Map Controls | group | | | x | x | x | | sub-section of Interface |
| options.nativeControls.zoom | Zoom | boolean | | | true | x | =true | | |
| options.nativeControls.scale | Scale | boolean | | | true | x | =true | | |
| options.nativeControls.bookmark | Bookmark | boolean | | | false | =false | =false | | |
| options.nativeControls.print | Print | boolean | | | false | =false | =false | | |
| options.nativeControls.selector | Selector | boolean | | | no UI: false | | =false | | reserved, always disabled today |
| options.nativeControls.search | Search | boolean | | | false | x | =false | | |
| — | Workspace/Filtered Result Map | group | | | x | x | | | not in simplified UI |
| config.dynamicDocument.enabled | Enable current-results document | boolean | | | no UI: true | | | | |
| config.dynamicDocument.title | Title | freetext | | | Workspace | x | x (only when the active document is the dynamic one) | | simplified: "Current results" |
| config.dynamicDocument.dynamicRequests | Load by map extent | boolean | | | false | x | | Load only records inside the visible map extent | simplified: false |
| config.dynamicDocument.maxZoom | Zoom In (Level) | integer 1–18 | | x | null | x | | | radio Level / Km with the Km fields |
| config.dynamicDocument.minZoom | Zoom Out (Level) | integer 1–18 | | x | null | x | | | |
| config.dynamicDocument.minimumZoomKm | Zoom In (Km) | float | | x | null | x | | | |
| config.dynamicDocument.maximumZoomKm | Zoom Out (Km) | float | | x | null | x | | | |
| config.dynamicDocument.bounds | Extent | geo (`geoKind: 'extent'`) | | x | null | x | | Initial extent; empty = fit to the data | {west, south, east, north} |
| — | Default settings | group | | | x | x | | | |
| config.defaults.zoomToPointInKM | Point selection extent (km) | float ≥ 0 | | | null | x | | Map width shown when one point is selected | |
| config.defaults.symbology | Default symbology | special:symbology | | | null | x | | | HSymbolEditor (plan 17) |
| config.defaults.selectSymbology | Select symbology | special:symbology | | x | null | x | | | |
| config.defaults.preventContinuousWorldBasemap | Prevent continuous world basemap | boolean | | x | false | x | | | |
| config.defaults.markerClustering | Marker clustering | boolean | | | false | x | | | |
| config.defaults.markerClusterGridPixels | Grid pixels | integer 0–100 | | | 20 | x | | | showWhen markerClustering |
| config.defaults.markerClusterMaxLevel | Stop at | enum | 1 "Level 1 (worldwide)" … 18 | | 12 | x | | Zoom level where clustering stops | showWhen markerClustering |
| config.defaults.maxAllowedFeatures | Maximum allowed features | enum | 500, 1000, 2000, 5000 | | 1000 | x | | | |
| config.defaults.popupTemplate | Popup template | enum | none, basic, builtin, standard + *termsSource* smartyTemplates | x | null (= basic) | x | | | |
| — | Map documents | group | | x | x | x | | | |
| options.mapDocuments.allowed | Allowed map documents | special:recordPicker | Map document records; "Allow all" | x | null (= all) | x | | | rewritten by *Show only active document* |
| options.mapDocuments.initiallyActive | Default document | enum | Workspace/Filtered + allowed documents | x | null (= Workspace) | x | | | |
| — | Base maps | group | | x | x | x | | | |
| options.baseMaps.allowed | Allowed base maps | special:listPicker | curated base map list; "None" always kept | x | null (= all) | x | | | |
| options.baseMaps.initial | Initial base map | enum | allowed base maps | x | null | x | | | |
| — | Interaction | group | | x | x | x | | | |
| options.interaction.editEnabled | Enable edit | boolean | | x | true | x | =false | Edit of map documents, layers and records | was `readonly` (2026-10-28) |
| options.interaction.selectionEnabled | Enable selection | boolean | | x | true | x | | | |
| options.interaction.popupEnabled | Enable popups | boolean | | x | true | x | | | |
| options.interaction.zoomOnSelection | Zoom on selection | boolean | | x | false | x | | | |

## 5. Timeline

Files today: `apps/timeline/src/timelineConfig.js` (`normalizeSettings`), `TimelineConfigurationDialog.js`.

Today:

- The dialog is one flat list.
- Map and Timeline are the only modules with neither a `website` mode nor a language option.
- Timeline has no defaults and schema files.

Phase 2 adds `timelineConfigurationDefaults.js` and `timelineConfigurationSchema.js`, in the same pattern
as the other modules. The Reset action (§11) and `validateConfiguration()` (§12) need them.

The sections are new: Interface and Default settings, as in the other modules.

| system name | caption | type | enum values | adv | configuration / default | website | publication / default | help | notes |
|---|---|---|---|---|---|---|---|---|---|
| — | Interface | group | | | x | x | x | | |
| options.ui.showSourceHeader | Show header | boolean | | | false | x | x | | |
| options.ui.initiallyExpanded | Expand control panel initially | boolean | | | false | x | x | | not shown in simplified UI |
| — | Default settings | group | | | x | x | x | | |
| options.timeline.labelMode | Labels | enum | full, truncate, hidden | | full | x | x | | |
| options.timeline.labelPosition | Label position | enum | bar "Within bar", above | | bar | x | x | | |
| options.timeline.orientation | Time axis | enum | both, top, bottom | | both | x | x | | |
| options.timeline.stack | Stack overlapping items | boolean | | | true | x | x | | |
| options.timeline.showToolbar | Toolbar | boolean | | | no UI: true | | | | |
| options.timeline.zoomMax | Maximum zoom out | integer (ms) | | | no UI: 500 000 years | | | | |
| options.mapDocuments.allowed | – | json | | | no UI: null | | | | |
| options.mapDocuments.initiallyActive | – | freetext | | | no UI: dynamic | | | | publication: the active document |
| — | Interaction | group | | | x | x | x | | |
| options.interaction.editEnabled | Enable edit | boolean | | | true | x | =false | Edit of map documents and layers | **new** (2026-10-28) |

## 6. Graph

Files: `apps/graph/src/ui/config/graphConfigurationDefaults.js`, `graphConfigurationSchema.js`,
`GraphConfigurationDialog.js`.

| system name | caption | type | enum values | adv | configuration / default | website | publication / default | help | notes |
|---|---|---|---|---|---|---|---|---|---|
| — | Interface | group | | | x | x | x | | |
| options.ui.showSourceHeader | Show header | boolean | | | false | x | x | | |
| options.ui.initiallyExpanded | Initially expanded | boolean | | | false | x | x | | |
| options.ui.showExpand | Expand graph | boolean | | | true | x | x | Expand, prune and level controls | |
| — | Native controls | group | | | x | x | x | | sub-section of Interface |
| options.nativeControls.zoom | Zoom | boolean | | | true | x | x | | |
| options.nativeControls.pan | Pan | boolean | | | true | x | x | | |
| options.nativeControls.rearrange | Rearrange | boolean | | | true | x | x | | |
| — | Default settings | group | | | x | x | | | |
| config.defaults.maxNodes | Nodes limit | enum | 1000, 2000, 5000 | | 5000 | x | | | |
| config.defaults.maxEdges | Edges limit | enum | 1000, 5000, 10000 | | 10000 | x | | | |
| config.defaults.layoutMode | Layout | enum | forceAtlas2 "Automatic (ForceAtlas2)", automatic "Gravity (Barnes–Hut)", hierarchical-ud, hierarchical-lr, record-types, grid | | automatic | x | | | |
| config.defaults.movement | Movement | enum | continuous, once "Freeze" | | once | x | | | showWhen layoutMode is not grid, record-types |
| config.defaults.gravity | Gravity | enum | loose, normal, tight | | normal | x | | | showWhen layoutMode is forceAtlas2, automatic |
| config.defaults.scaling | Scale node size by connections | boolean | | | true | x | | | |
| config.defaults.showNodeLabels | Show node labels | boolean | | | true | x | | | |
| config.defaults.showEdgeLabels | Show edge labels | boolean | | | false | x | | | |
| config.defaults.labelLength | Label length | integer 20–100 | | | 40 | x | | | |
| config.defaults.popupDelay | Popup delay (seconds) | integer 1–5 | | | 1 | x | | | |
| config.defaults.popupTemplate | Popup template | enum | none, "" "Built-in (vis basic)", builtin + *termsSource* smartyTemplates | | null | x | | | |
| config.defaults.emptyResultMessage | Empty result message | blocktext | | | No records | x | | | |
| — | Interaction | group | | | x | x | x | | |
| options.interaction.editEnabled | Enable edit | boolean | | | true | x | =false | | was `readonly` (2026-10-28) |
| options.interaction.selectionEnabled | Enable selection | boolean | | | true | x | =false | | |
| options.interaction.popupEnabled | Enable popups | boolean | | | true | x | x (preset true) | | |

## 7. Data

Files: `apps/data/src/ui/config/dataConfigurationDefaults.js`, `dataConfigurationSchema.js`,
`DataConfigurationDialog.js`, `simplifiedDataSettings.js`.

In the simplified UI only *Default settings* is shown, without Extended view template and Popup template.
The other values are forced by `applySimplifiedDataSettings` (column *notes*).

| system name | caption | type | enum values | adv | configuration / default | website | publication / default | help | notes |
|---|---|---|---|---|---|---|---|---|---|
| — | Interface | group | | | x | x | x | | |
| options.ui.showSourceHeader | Show header | boolean | | | false | x | x | | simplified: true |
| options.ui.initiallyExpanded | Initially expanded | boolean | | | false | x | x | | not offered in Explorer main runtime |
| options.ui.showExpansion | Expansion rules | boolean | | | true | x | x | Level selector for expansion rules (plan 09) | simplified: true |
| — | Native controls | group | | | x | x | | | sub-section of Interface; **not shown in publication**, values kept (Artem, 2026-10-28) |
| options.nativeControls.pageSize | Page size | boolean | | | true | x | | | simplified: false |
| options.nativeControls.search | Search in results | boolean | | | false | x | | | simplified: false |
| options.nativeControls.counter | Counter | boolean | | | true | x | | | simplified: true |
| options.nativeControls.export | Export (CSV, Excel, PDF) | boolean | | | false | x | | Anyone who sees the list can download it | export warning when on; simplified: true |
| options.nativeControls.viewMode | View mode | boolean | | | true | x | | | simplified: true |
| options.nativeControls.sort | Sort | boolean | | | false | x | | | **new**; simplified: true |
| options.nativeControls.showOwner | See / hide owners | boolean | | | true | x | =false | Button that shows or hides owner and access info | **new**; the button only, the value it switches is `interaction.adminInfoEnabled`; simplified: true |
| options.nativeControls.selectionActions | Selection actions | boolean | | | true | x | =false | | simplified: true |
| — | Default settings | group | | | x | x | | | the only section in simplified UI |
| config.defaults.viewMode | View mode | enum | list, card "Cards", row, big "Extended", datatable "Table" | | card | x | | | |
| config.defaults.pageSize | Page size | enum | 50, 100, 500, 1000, 5000 | | 100 | x | | | |
| config.defaults.fontSize | Font size | integer 8–30 | | | 14 | x | | | |
| config.defaults.emptyResultMessage | Empty result message | blocktext | | | No records | x | | | |
| config.defaults.cardTemplate | Card and row template | enum | "" "Built-in renderer" + *termsSource* smartyTemplates | | null | x | | | showWhen viewMode = card, row |
| config.defaults.viewTemplate | Extended view template | enum | "" "Built-in", standard + *termsSource* smartyTemplates | | null | x | | | simplified: null, not shown |
| config.defaults.popupTemplate | Popup template | enum | none, "" "Built-in", standard + *termsSource* smartyTemplates | | null | x | | | simplified: null, not shown |
| config.defaults.engine | – | enum | recordlist, datatables | | no UI (derived from viewMode) | | | | |
| config.defaults.colorScheme | – | freetext | | | no UI: default | | | | |
| — | Interaction | group | | | x | x | x | | |
| options.interaction.editEnabled | Enable edit | boolean | | | true | x | =false | | only record editing: edit icon in the list; also off when the user has no edit rights; simplified: true |
| options.interaction.selectionEnabled | Enable selection | boolean | | | true | x | =false | | simplified: true |
| options.interaction.persistentSelectionEnabled | Collection / Persistent selection | boolean | | | false | x | =false | Selection is kept when the result changes | simplified: true |
| options.interaction.popupEnabled | Enable popups | boolean | | | true | x | x (preset true) | | simplified: true |
| options.interaction.adminInfoEnabled | Admin info | boolean | | | false | x | =false | Show owner and access info in the list | simplified: true unless saved |

## 8. Record view

Files: `apps/recordview/src/ui/config/recordViewConfigurationDefaults.js`, `recordViewConfigurationSchema.js`,
`RecordViewConfigurationDialog.js`.

The dialog today is one flat list. The sections are new.

| system name | caption | type | enum values | adv | configuration / default | website | publication / default | help | notes |
|---|---|---|---|---|---|---|---|---|---|
| — | Interface | group | | | x | x | x | | |
| config.defaults.showHeader | Show header | boolean | | | false | x | x | | |
| config.defaults.headerTitle | Header title | freetext | | | null | x | x | | showWhen showHeader |
| config.defaults.emptyMessage | Empty message | freetext | | | Select a record | x | x | Shown when no record is selected | |
| — | Default settings | group | | | x | x | | | |
| config.defaults.engine | Render engine | enum | builtin, legacy "Legacy viewer", smarty "Smarty template" | | builtin | x | | | |
| config.defaults.template | Smarty template | enum | "" "None" + *termsSource* smartyTemplates | | null | x | | | showWhen engine = smarty |
| config.defaults.selectionMode | Selection mode | enum | first, last, single-only | | last | x | | Which record is shown when several are selected | |
| — | Interaction | group | | | | | | | no visible fields |
| options.interaction.editEnabled | Enable edit | boolean | | | true | x | =false | | was `readonly` (2026-10-28) |

## 9. HEditForm extensions

Files: `shared/src/data/editFormSchema.js`, `shared/src/widgets/edit-form/HEditForm.js`.

Today HEditForm has no visibility per mode. `showWhen` only tests field values.

**Advanced and no UI use `req`** (§3):
- `optional` is an advanced option. It is shown with the form option `showOptional`, which is the
  Advanced switch.
- `forbidden` is never shown, but its value is kept in `getValues()`.
- `editFormSchema.js` adds `forbidden` to `REQUIREMENTS`.

New properties on fields and groups:

| Property | Meaning |
|---|---|
| `modes: ['configuration', 'website', 'publication']` | modes where the item is shown; missing = all |
| `forced: {website: false, publication: false}` | value per mode; the field is not shown in that mode, its value is written into `getValues()` |
| `simplified: {hidden: true, value: …}` | rule for the simplified UI |
| `termsSource: 'smartyTemplates'` | enum terms loaded through a terms provider (`options.termsProviders`) |

New HEditForm options: `mode`, `showOptional` and `simplified`. They are combined with `showWhen` and
the view filter in the existing `_shownChecker` / `_applyVisibility`.

**Dependent fields use `showWhen`** (Artem, 2026-10-28). There is no `disabledWhen`. A field that the
old dialogs disabled is hidden instead:
- Map: *Show only active document*.
- Graph: Gravity and Movement for some layouts.

Map-only editors become `special` editors (`options.specialEditors`):

- `symbology` — HSymbolEditor (plan 17);
- `recordPicker` — two-list picker of map documents;
- `listPicker` — two-list picker of base maps.

The extent uses the existing `geo` field with `geoKind: 'extent'`.

## 10. Publication section

The publication form (mode `publication`) ends with the section **Publication**:

| system name | caption | type | default | notes |
|---|---|---|---|---|
| publish.target | Target | enum, radio | update if a page exists, else new | `new` "New page", `update` "Update the page" |
| publish.pageId | Page | enum | last page this module published | showWhen target = update; standalone v4 pages of this module type the user can edit |
| publish.title | Page title | freetext | "&lt;Module&gt; – &lt;date&gt;", or the page title on update | |
| publish.preserveState | Preserve current state | boolean | true | Map, Graph, Data; Timeline and Record view always publish the state |
| publish.showOnlyActiveDocument | Show only active document | boolean | false | Map only |
| config.dynamicDocument.title | Title | freetext | | Map only, when the active document is the dynamic one |

- The `publish.*` values are not stored in the settings. The runner hands them to `publish()`.
- *Update the page* can choose **any standalone page of the same module type** (agreed 2026-10-28).
  The default is the last published page (`checkedLastPage`, `shared/src/site/modulePublisher.js`).
- `PublishPageDialog` (`shared/src/ui/PublishPageDialog.js`) is removed. `PublishedDialog` (URL, embed
  code, Website manager) stays.

**Server** (agreed 2026-10-28): a thin route
`GET /api/{db}/website/pages?standalone=1&module=<type>` → `[{id, title, modified}]`.

- It lists the editable standalone v4 pages that contain an instance of this module type.
- Internally it goes through the same record search and update paths as the rest of
  `WebsiteEditService` (`RecordRepository` / `RecordStore`). There is no separate SQL (plan 15 rule).
- Before it is written, check what the Website manager (27b) already uses to list pages.

## 11. Form files and the common dialog

- One JSON per module, in the module app, e.g. `apps/map/src/ui/config/mapConfigurationForm.json`,
  format `heurist-edit-form/1` with the §9 properties.
- A shared runner `shared/src/ui/config/ModuleConfigurationDialog.js`:
  - opens the form with `openEditFormDialog`, with options `mode`, `advanced` and `simplified`;
  - shows the Advanced switch;
  - reads and writes the envelope `{format, version, options, config}` through the module's existing
    `normalize` / `serialize` functions;
  - applies the forced values;
  - in `publication`, calls the module's `publish()` with the `publish.*` values.
- **Reset** button in the footer (agreed 2026-10-28):
  - It sets the form to the module defaults (`getConfigurationDefaults()`) with the current mode's
    forced values.
  - It asks for confirmation first.
  - Nothing is saved until Apply / Save / Publish.
- Unsaved changes on close: confirmation, as today.
- **Test per module:**
  - every key in the form exists in the defaults file;
  - every key in the defaults file is in the form, possibly as `req: 'forbidden'` (no UI).

## 12. Module configuration API

**Is `Heurist*PublicApi` an interface?** No, not today:
- Each module has its own class (`HeuristMapPublicApi`, `HeuristDataPublicApi`, …).
- There is no common base class and no written interface.
- Explorer calls them by method name (duck typing, `IframeModuleAdapter` / `DirectModuleAdapter`).
- `shared/src/contracts/moduleContracts.js` holds only the bootstrap format and the event names.

Proposal:
- A shared base class `shared/src/host/HeuristModulePublicApi.js` with the methods below. Its JSDoc is
  the written interface.
- It implements the configuration methods once, from what each module provides: form JSON,
  defaults, `normalize` / `serialize`, `applySettings`.
- Each module class extends it and keeps its own methods (`setDataSource`, `editSymbology`, …).

The same methods on every module public API (`apps/*/src/host/Heurist*PublicApi.js`). They are also on
a `*ConfigurationApi` class, which edits settings without a running module. Map and Data have one
today; Graph, Timeline and Record view get one.

| Method | Returns | Notes |
|---|---|---|
| `getConfiguration()` | `{format, version, options, config}` | current settings |
| `setConfiguration(settings, {save})` | normalized settings | normalize, apply live; `save: true` stores them as preferences |
| `patchConfiguration(partial)` | normalized settings | merge by key path, e.g. `{'config.defaults.pageSize': 500}` |
| `resetConfiguration({save})` | normalized settings | defaults |
| `getConfigurationDefaults()` | settings | |
| `validateConfiguration(settings)` | `[{key, message}]` | empty = valid |
| `describeConfiguration({mode, advanced})` | `{form, options: [{key, caption, type, terms, default, advanced, modes, forced, help}]}` | **for an AI agent**: the options without the UI |
| `openConfigurationDialog({mode})` | Promise of settings or null | replaces `openPreferencesDialog` / `openPublishDialog` (kept as aliases) |
| `getState()` / `setState(state)` | state | align the names (Map: `captureState` / `restoreState`) |
| `publish({target, pageId, title, preserveState, settings})` | `{id, url, title, embed}` | **no UI**, so an agent can publish |
| `listPublishedPages()` | `[{id, title, modified}]` | §10 route |
| event `configuration-changed` | `{settings, changedKeys}` | |

The contract goes in `shared/src/contracts` and `docs/integration.md`. The bridge order follows the
CLAUDE.md rule: contracts, then the host adapters, then the legacy wrapper in `heurist/hclient`.

## 13. Test popup

A dev tool, `apps/explorer/src/dev/ModuleConfigurationTestTool.js`, modelled on
`EditFormTestTool.js`. It is loaded lazily from the Options menu, next to *Test edit form*
(temporary).

- **Toolbar:**
  - Module (map / timeline / graph / data / recordview);
  - Mode (configuration / website / publication);
  - Advanced;
  - Simplified;
  - the existing Labels, Inputs, Read only, Validate and Reset.
- **West pane:** the form as the module dialog shows it.
- **Centre pane, three tabs:**
  - Result JSON — the settings envelope and, in publication, the `publish.*` values;
  - Form JSON — editable, with Apply;
  - Options table — the `describeConfiguration()` list, to compare with §4–§8.

## 14. Phases

1. **Option tables** — this document. Artem agrees §4–§8.
2. **Forms and test popup:**
   - HEditForm extensions (§9);
   - Timeline defaults and schema files;
   - form JSONs for all five modules;
   - `ModuleConfigurationDialog`;
   - test popup.

   The old dialogs stay in use.
3. **Replace the dialogs** one at a time, each with its own commit and browser check, then delete the
   old dialog. Order: Timeline, Record view, Graph, Data, Map. The Map special editors come last.
4. **Publication section:**
   - the §10 route;
   - the page picker;
   - `publish({target})`;
   - `PublishPageDialog` removed.
5. **Configuration API** (§12) on all modules, the bridge and the docs.

## 15. Open points

None at the moment.

Closed: **`readonly` removed** (Artem, 2026-10-28).
- `options.interaction.readonly` is no longer a setting in any module. Saved values are ignored and not
  converted.
- Editing is `options.interaction.editEnabled` (*Enable edit*, default true) in Map, Timeline, Graph,
  Data and Record view. Publication forces it to `false`.
- The host's `runtime.readonly` is still a runtime flag. In Data and Record view it also hides the
  Options / Publish icons.

## 16. Phase 2 as implemented (2026-10-28)

All 1471 JS tests pass and all builds succeed. Nothing is checked in a browser yet.

**HEditForm** (`shared/src/data/editFormSchema.js`, `shared/src/widgets/edit-form/HEditForm.js`):
- `req: 'forbidden'` is accepted.
- New field and group properties `modes`, `forced`, `simplified` and `termsSource`. Groups also take
  `req: 'optional'`.
- `ruleHides` and `forcedValue` hold the rules.
- New form options `mode`, `showOptional`, `simplified` and `keepHidden`, and a method `setShowOptional()`.
- A group whose fields are all hidden by the rules is hidden.
- Without these options a record form works as before. The one exception is that a `forbidden` field is
  never shown; `HDbDefs` already drops forbidden fields, so record forms do not change.
- **Deviation:** `getValues()` returns a `forbidden` field's given value as it is, without the round trip
  through an input. Some no-UI values are lists and objects (`mapDocuments.allowed`, `bounds`).
- **Deviation:** `termsSource` is not loaded by HEditForm. The owner calls
  `resolveTermsSources(json, providers)` before the form is made, so a stored template that is not yet in
  the list cannot be lost.
- New field property `emptyLabel` (HEditField → HInputEnum): the label of the empty choice of an enum.
  The template pickers store `null` for *Built-in*.

**Module settings:**
- Timeline has `apps/timeline/src/ui/config/` with `configurationUtils.js`,
  `timelineConfigurationDefaults.js` and `timelineConfigurationSchema.js`. `timelineConfig.js` now
  normalizes through it. Settings saved before the envelope, with the timeline options at the top level,
  are still read.
- The new keys are in the defaults and schemas:
  - `ui.showHelp` in all five modules;
  - `ui.showPublish` in Graph, Data and Timeline;
  - `ui.showOptions` in Timeline;
  - `ui.language` in Map and Timeline;
  - Data `nativeControls.sort` (false) and `showOwner` (true).
- `initiallyExpanded` defaults to false in Map, Timeline, Graph and Data.
- What the new keys do today:
  - Data `showHelp` hides the Help icon, the only module Help icon so far.
  - `showPublish` hides the share icon in Data and Graph.
  - Data `sort` and `showOwner` add the Sort control and the See / hide owners button to the normal
    toolbar too, in both the record list (`HRecordList._buildSortOwners`) and the table engine. Before,
    they were in the simplified interface only.
  - `language` in Map and Timeline is stored but not used yet (Phase 4, publication).

**Forms:**
- `apps/<module>/src/ui/config/<module>ConfigurationForm.json`, one per module.
- Each module has a test `apps/<module>/test/configurationForm.test.js`, using the helper
  `shared/test/helpers/configurationForm.js`. It checks that the form fields and the defaults have the
  same keys and the same defaults.
- The Map pickers are `special` fields with no editor yet (Phase 3): `symbology`, `mapDocuments`,
  `initialMapDocument`, `baseMaps`, `initialBaseMap`.

**Configuration entry** (new, not in the plan):
- `apps/<module>/src/configuration.js` exports `{type, form, defaults, normalize, serialize}`, for
  example `mapConfiguration`.
- It imports only the module's `ui/config/` files. `test/architecture/moduleBoundaries.test.js` allows
  Explorer and the website runtime to import it and checks what it imports.
- `docs/architecture.md` describes it.
- Reason: the test popup, and later the website editor, need the forms without loading the modules.

**Common dialog:**
- `shared/src/ui/config/ModuleConfigurationDialog.js` (+ css): Advanced switch kept per form and mode,
  Reset with confirmation, Apply / Save / Publish by mode, confirmation of unsaved changes.
- The form values are merged over the opening settings (`mergeSettings`), then normalized.
- The helpers are in `shared/src/data/moduleConfigurationForm.js`:
  - `configurationFormMode` (also accepts the old names);
  - `mergeSettings`;
  - `hasOptionalItems`;
  - `describeConfigurationForm`, the options list of §12;
  - `smartyTemplateTerms`, which wraps a `ReportTemplateProvider`.
- No module uses the dialog yet (Phase 3).

**Test popup:**
- `apps/explorer/src/dev/ModuleConfigurationTestTool.js`, opened from Options menu → *Test module
  configuration*.
- Toolbar: Module, Mode, Advanced, Simplified, Labels, Validate, Reset to defaults.
- Tabs: Result JSON (the serialized envelope), Form JSON (editable, Apply), Options table.
- Changing the mode keeps the user's changes, but not the forced values of the previous mode.

**Review 2026-10-28 (Artem):**
- **`HInputBoolean` has a `mode`:**
  - `select` (default): empty, Yes, No. Record fields keep this, so "no value" and No stay different.
  - `checkbox`: unchecked = `false`.
  - The form JSON sets it with the field property `mode`. Every visible boolean of the five
    configuration forms has `mode: 'checkbox'` (Artem, 2026-10-28, second note; the first version made
    every boolean a checkbox).
- **New HEditForm option `inlineCheckboxes`:**
  - Consecutive single-value checkbox fields (boolean with `mode: 'checkbox'`) go into one row (`h-edit-form-checkbox-row`). Any other
    field ends the row.
  - Each field is drawn as the checkbox, then its label; the label toggles it.
  - The field help becomes the tooltip.
  - With labels beside the inputs, the row starts at the input column.
  - `ModuleConfigurationDialog` turns the option on. The test popup has a switch for it, *Checkboxes in
    a row*.

**Review 2026-10-28, round 3 (Artem):**
- The checkbox row has no left padding: it starts at the left of the group.
- **The actions slot is in every input of an edit field.** The slot is the space before the control for
  Add / Translate and a translation's language code.
  - It is narrower: 16 px (was 26 px), room for one small icon.
  - Before, only inputs with value tools had it. Now HInput option `actionsSlot` also gives it to
    settings (`clearable: false`); the class is `has-actions-slot`.
  - Exception: a boolean with `mode: 'checkbox'` has no slot.
  - Special fields (Map symbology) are indented by the same width.
  - A translation's language code sits right-aligned in the slot and extends to the left when it is
    wider than the slot.
- `readonly` removed, `editEnabled` in every module that edits (§15).
- Paddings: value tools and action icons `2px 0`; field help and notes indented 20 px.

**For Phase 3:** the form captions must be added to each module's localization files. So far only the
Explorer strings of the test popup and the dialog are added.

## 17. Phase 3 as implemented

### Timeline (2026-10-28)

- `TimelineConfigurationDialog.js` is removed, together with its discard test.
- The Options icon, the toolbar gear and the Publish icon all open `ModuleConfigurationDialog` with
  `timelineConfigurationForm.json`, through `HeuristTimelinePublicApi.openConfigurationDialog({mode})`.
  `openPreferencesDialog` and `openPublishDialog` stay as short forms.
- New API methods, the first part of §12:
  - `getConfiguration()`: the `heurist-timeline-settings` envelope.
  - `setConfiguration(settings)`: normalizes, applies to the engine, rebuilds the control panel
    (icons, Enable edit) and sends `{options, config}` to the host bridge (`updateSettings`).
- `publish(settings)` was rewritten to take the envelope, and then removed the same day: Explorer
  publishes (see *Form in Explorer's window* below). `publicationSettings()` keeps the page rules
  (language, active document, no editing).
- `applyOptions()` (toolbar label button) also sends the full envelope.
- `DocumentControlPanel` (Map and Timeline) hides its Help icon when `ui.showHelp` is false.
- Publication goes through `PublishPageDialog` after the form (New page | Update the page in the form is
  Phase 4). If that dialog is cancelled, the form stays open.
- Timeline localization: the form captions and dialog texts are added (eng, fre).
- Bundle: the dialog is a lazy chunk of 221 kB (63 kB gzip), because HEditForm and the inputs come with
  it. It loads only when the dialog is opened.
- Tests: `apps/timeline/test/configurationUi.test.js` covers `getConfiguration`, `setConfiguration` and
  `publish`.

**Form in Explorer's window** (Artem, 2026-10-28):
- In Explorer the configuration and publication forms open in Explorer's window, not in the module's
  iframe.
  - New host action and bridge method `openConfiguration({mode, title, value, simplified})`.
  - `IframeModuleAdapter` adds `moduleType` (the adapter's own type).
  - `ExplorerApplication.openModuleConfiguration` loads `apps/explorer/src/modules/moduleConfigurations.js`,
    which holds the loaders of the modules' `configuration.js` entries (also used by the test popup) and
    the Smarty template list of Explorer's database.
  - It returns the normalized settings. The module applies them (`setConfiguration`) or publishes them.
- Without the bridge method, the module opens the form in its own window.
- The Timeline form texts are now in Explorer's localization files too. Each module that moves to the
  new form needs its texts there.
- **Publication is done by Explorer** (Artem, 2026-10-28).
  - With `mode: 'publication'` the module sends `value` and `state`. `value` is its settings prepared
    for a page (`publicationSettings()`: active document, `editEnabled: false`, the language of now).
  - Explorer's form writes the page itself (`publishModulePage`; the page title / update dialog, now in
    Explorer's window) and shows `PublishedDialog` with the *Website manager* button.
  - The module does not publish any more. Timeline's `publish()` is removed.
  - Without Explorer a module cannot be published: Timeline's Publish icon follows
    `bridge.openConfiguration` (`mapPublishing`).
  - **Publish to** (Artem, 2026-10-28; this is the part of Phase 4 that the page dialog did):
    - Explorer adds a group *Publish to* (`modes: ['publication']`) to the module's form:
      - `publish.target` (radio *New page* | *Update the page*);
      - `publish.pageId` (select of the module's pages, showWhen update; default the page published
        last, from localStorage);
      - `publish.title` (required; it follows the chosen page, or the default *<Module> – <date>* of a new
        page).
    - Without a page of this module only the title is shown.
    - The `publish.*` values are read from the form on *Publish*. They are not settings.
    - `publishModuleTo()` (`shared/src/site/modulePublisher.js`) publishes without the page dialog.
      `PublishPageDialog` stays only for the Website manager's *Publish this view*.
    - Server, heurist repo: `GET /api/{db}/website/pages?module=<type>` → `{pages: [{id, title, url,
      modified}]}`.
      - The editable v4 standalone pages with an instance of the module, newest first.
      - Code: `WebsiteEditService::pages`, `WebsiteRepository::standalonePages` (through
        `RecordRepository::idsByValue` and the visible records), `WebsiteController` route `pages`.
      - `tests/WebsiteEditTest.php` has 5 more checks (48 pass).
    - In publication mode *Cancel* always asks "Cancel publish?" Yes | No, never "Discard changes?".
    - Phase 4 still has the module-specific publication options (Preserve current state, Show only
      active document).
- Described in `docs/integration.md` → *Module configuration forms*.
