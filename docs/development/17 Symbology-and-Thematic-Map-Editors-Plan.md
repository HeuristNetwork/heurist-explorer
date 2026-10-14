# Symbology and thematic map editors — development plan

Status: **agreed and implemented 2026-10-13 (all phases), not committed, not yet checked in a browser.**
Tests: `shared/test/symbology.test.js`, `shared/test/symbologyEditors.test.js`, `apps/map/test/host/editIntegration.test.js`.

## Context

Plan 14 left the symbology field (DT_SYMBOLOGY) of the record editor on the legacy host's
`editSymbology` bridge ("a native editor is the next plan"). Without the legacy host the field is
raw JSON only. This plan ports the three legacy editors to the new client and removes the bridge:

| Legacy (heurist/hclient) | Lines | New |
|---|---|---|
| `widgets/editing/mapSymbolEditor.js` (`editSymbology`, modes 1–7) | 1036 | `HSymbolEditor` |
| `widgets/editing/mapSymbolPreview.js` (`renderMapSymbolPreview`) | 262 | `symbolPreview` |
| `widgets/editing/mapThemesEditor.js` + `.html` | 1881 | `HThematicMapEditor` |
| `widgets/editing/imgFilter.js` + `.html` | 250 | `HImageFilterEditor` |
| `core/utils_map.js` (`splitSymbology`, `buildSymbology`, `normalizeOpacity`, `DEFAULT_MAP_SYMBOL`, gradients) | part | `shared/src/symbology/symbology.js` |

## Agreed decisions (2026-10-13)

1. **Image layers:** the image filter editor (imgFilter.js) is ported too. A Map Layer whose
   data source is RT_IMAGE_SOURCE / RT_TILED_IMAGE_SOURCE opens it instead of the symbol editor.
2. **Field buttons as legacy:** the DT_SYMBOLOGY field shows the readable summary with
   **Style** (symbol editor, or image filter for image layers), **Thematic maps** (Map Layer only;
   checked on click: the data source must be a Query Source with a query, otherwise
   "Not supported for current data source") and **Show raw**.
3. **Thematic map editor layout as legacy:** one large dialog — renderers list and renderer settings
   at the top; fields list and field tree on the left; ranges/categories of the selected field on the
   right (Add range, Generate ranges…, Remove all ranges, Symbol gradient…).
4. **Range definitions are a common class** (`shared/src/data/ranges/`), not part of the editor:
   crosstabs will use it later.
5. **Native editors always; the bridge is removed** — from Explorer and from the Map module (see
   §6: the Map module was a caller too), and from the legacy wrapper.
6. (2026-10-13) The Map module uses the new symbol and thematic map editors and saves a layer's
   symbology with the new API.
7. (2026-10-13) RT_CMS_HOME: DT_SYMBOLOGY stays raw JSON; the website colour theme will be a
   different field.

## 1. Shared symbology core — `shared/src/symbology/`

- `symbology.js`: the persisted format, one place:
  - `splitSymbology(value) → {symbol, thematic}` — reads the canonical `{symbol, thematic}`, the
    legacy array (`[symbol, {fields:...}, ...]`) and a plain symbol;
  - `buildSymbology(symbol, thematic)` — a plain symbol without renderers, `{symbol, thematic}` with;
  - `canonicalizeSymbol`, `normalizeOpacity` (0–100 → 0–1), `DEFAULT_MAP_SYMBOL`,
    `normalizeMapSymbol(symbol, parent)` (inheritance: built-in → default → layer → renderer → range).
  - The Map module's `apps/map/src/utils/normalizeMapSymbol.js` moves here (the Map module imports
    it from shared; shared never imports apps). Its tests move with it.
- `colourGradient(from, to, count)` (legacy `getColourGradient`).
- `symbolPreview.js`: SVG samples of a symbol for point / line / polygon (legacy
  `renderMapSymbolPreview`), used by all three editors and later by the Map legend if wanted.

## 2. Range definitions — `shared/src/data/ranges/`

Independent of maps (crosstabs later):

- `RangeDefinition`: one range or category — `{value, title, symbol?}` with the legacy value syntax
  `"40"` (exact), `"40<>50"` (interval), `"69,71,75"` (list); `parse`, `format`, `matches(value)`.
- `generateRanges({type, min, max, count, rounding, mode: 'equal'|'log'})` for numbers and dates
  (legacy "Generate ranges…": count, min/max, rounding).
- `categoriesFromValues(values)` for enum / text fields.
- Value input from the server through the existing sources: **min/max and range counts with
  `detail=ranges`** (`FieldRangeSource`), **categories with counts with `detail=values`**
  (`FieldValueSource`), over the layer query — including fields of linked records (the field paths
  of plan 09 §11), which replaces the legacy `$IDS` substitution and `get_facets` call.
- The Map module's `thematicSymbolResolver` uses `RangeDefinition.matches`, so the map shows exactly
  what the editor defines.

## 3. `HSymbolEditor` — `shared/src/widgets/symbology/`

A dialog with a form built from local field definitions with the shared HInputs (no record
structure), in the legacy groups:

- **Symbols:** icon source (image / icon font / circle / record type icon), icon URL, icon, icon size;
- **Outline:** stroke yes/no, colour, width, dash array, opacity;
- **Area fill:** fill yes/no, colour, opacity;
- live previews (point, line, polygon) before the groups, inheriting from the parent symbol.

Modes (legacy numbers in brackets):

| Mode | Use |
|---|---|
| `symbol` (1/3) | layer symbol, Map configuration default/selection symbology |
| `range` (4) | the symbol of one range: blank = inherit (stroke/fill get an empty choice), plus **Legend caption** |
| `gradient` (5) | from/to of stroke colour, stroke opacity, fill colour, fill opacity, icon size |
| `draw` (2) | Map drawing style: stroke colour/width/opacity, fill colour/opacity |

Graph node/edge modes (6/7) are not ported (they have their own editor in the Graph module).
Saved values are sparse: only properties that differ from the parent symbol are kept (as legacy).
New input: `HInputColor` (type `color`) in `createHInput` — a colour field with a swatch and the
native picker, empty allowed.

## 4. `HImageFilterEditor`

Port of imgFilter: CSS filter sliders (blur, brightness, contrast, grayscale, hue-rotate, invert,
opacity, saturate, sepia) with a live preview image and Reset; value `{filter: value+unit}` as now.

## 5. `HThematicMapEditor`

Layout of decision 3, built with `HCardinalLayout`, `HFieldTree` (fields of the layer's record types
and of linked records), the shared inputs and `HSymbolEditor` for every symbol.

- Renderers: add, rename, delete, select; **Active by default** (one at most); base symbol.
- Record types of the layer: from the layer query (`detail=values&field=rectype`, as the legacy
  `count_by_rty`);
  one type → shown, several → a selector (legacy `sel_record_scope`).
- Fields of a renderer: add from the tree, remove, label; type from `HDbDefs`.
- Ranges of a field: list of `RangeDefinition` rows — enum: a term picker; others: from/to —
  each with its symbol preview (click = `HSymbolEditor` in `range` mode, inheriting layer → base
  symbol), delete; **Generate ranges…** (§2), **Symbol gradient…** (`HSymbolEditor` `gradient` mode,
  spread over the ranges with `colourGradient`), **Remove all ranges**.
- Result: the renderers array, written with `buildSymbology(symbol, thematic)` into DT_SYMBOLOGY.

The editors are one lazy chunk (loaded when first opened), in Explorer and in the Map module.

## 6. Integration and bridge removal

**Record editor (Explorer `RecordEditorHost`).**
- `HRecordField` special definitions get several actions (`actions: [{id, label, run}]`) instead of
  the one `edit`, so DT_SYMBOLOGY can show Style / Thematic maps / Show raw.
- The Map Layer's data source is read on every click from the form's DT_DATA_SOURCE value (it may
  change while the form is open): the source record's type and its DT_QUERY_STRING (one
  `GET /records/{id}`). Image source → `HImageFilterEditor`; Query Source with a query → the symbol
  editor with the layer query (record types for previews) and Thematic maps enabled; no source →
  the symbol editor alone.
- Other record types with DT_SYMBOLOGY: symbol editor, no Thematic maps. **RT_CMS_HOME** uses
  DT_SYMBOLOGY for the website colour scheme (legacy `editTheme.js`), not a map symbol: it stays raw
  JSON here (the website theme editor belongs to the CMS work).

**Map module.** It called `host.editSymbology` for: the layer panel's style and thematic edits
(saving the Map Layer record when `persist`), the Filtered Result style (saved as Map configuration
default), Map configuration default/selection symbology (`onEditSymbology`), and the drawing style
(`editorMode: 2`). These open the shared editors directly; `persist` saves DT_SYMBOLOGY of the layer
record with the srv write API (`PATCH /records/{id}`, plan 14) through `RecordEditClient`, instead
of the legacy `batch_details`. `supportsSymbologyEditing()` becomes "the editor is available"
(always) and "can save" (a logged-in user who may edit the record).

**Bridge removed:** `editSymbology` from `shared/src/contracts`/`shared/src/host`, Explorer
(`ExplorerApplication`, `IframeModuleAdapter`), the Map module (`HeuristHostAdapter`,
`HeuristMapPublicApi`, `HeuristMapConfigurationApi`, `initHeuristMap`), and the legacy wrapper
(`heurist/hclient/modules`: `HeuristModuleViewer._editSymbology`, `_saveLayerSymbology`, the
`editSymbology` entries of `HeuristModuleExplorer` and `HeuristModuleMap`). The legacy dialogs in
`hclient/core/utils_map.js` stay: the legacy record editor (`editing_input.js`) still uses them.

## Phases

1. Shared core (§1) and range definitions (§2), with tests; Map module moved onto them.
2. `HInputColor`, `symbolPreview`, `HSymbolEditor` (§3).
3. `HImageFilterEditor` (§4).
4. `HThematicMapEditor` (§5).
5. Record editor integration (§6), Explorer.
6. Map module on the shared editors; bridge removal in both repos.

## Verification

- Unit tests: `symbology.js` (split/build/normalize, legacy array input, opacity), `RangeDefinition`
  (parse/format/match, equal/log generation, dates), `colourGradient`, editor value round trips
  (a value opened and saved unchanged stays the same JSON).
- Browser: Map Layer record (Query Source, image source, none), thematic map with an enum field, a
  numeric field (generated ranges + gradient) and a linked-record field; the Map module shows it the
  same; Map configuration default symbology; drawing style; layer style edit saved from the map.

## Implementation notes (2026-10-13)

Files (heurist-explorer):
- `shared/src/symbology/`: `normalizeMapSymbol.js` and `hexToCssFilter.js` (moved from heurist-map;
  the Map files re-export them), `symbology.js` (format, `effectiveSymbol`, `sparseSymbol`,
  `vectorSymbol`, `colourGradient`, `numberGradient`), `symbolPreview.js`, `thematicFields.js`
  (field codes, the query of the records holding a field's values, record types / values / bounds
  of a layer), `SymbologyService.js` (opens the editors, lazy; `saveLayerSymbology` = PATCH).
- `shared/src/data/ranges/rangeDefinitions.js`: `parseRange`, `formatRange`, `rangeMatches`,
  `findRange`, `generateRanges`, `categoryRanges`, roundings. The Map's `thematicRangeMatches`
  calls `rangeMatches`.
- `shared/src/data/fieldPathCodes.js`: moved from Explorer `query-source/helpers/fieldPathUtils.js`
  (re-exported there).
- `shared/src/widgets/form/inputs/HInputColor.js` (`color` in `createHInput`).
- `shared/src/widgets/symbology/`: `HSymbolEditor`, `HImageFilterEditor`, `HThematicMapEditor`,
  `HRangeGenerator` (Generate ranges dialog), `symbologyEditors.js` (the lazy chunk).
- `HRecordField`: special fields may have several actions (`actions`, or `actionsFor(context)`).
- Explorer `RecordEditorHost`: DT_SYMBOLOGY with Style / Thematic maps (Map Layer), Style
  (other types), raw only (RT_CMS_HOME); `rectypeIconUrl` option for previews.
- Map: `host/createSymbologyService.js` (definitions loaded on first use for the field tree and the
  DT_SYMBOLOGY id), `providers.symbology`; `MapApplication.canEditSymbology()` / `editSymbology()`;
  a persisted layer is saved with `saveLayerSymbology` when the value changed;
  `HeuristMapPublicApi.editSymbology` / `editDrawingStyle` and `HeuristMapConfigurationApi` use it.
- Bridge removed: Explorer `ExplorerApplication`, `IframeModuleAdapter`; Map `HeuristHostAdapter`
  (`supportsSymbologyEditing`, `editSymbology`); heurist `hclient/modules` (`HeuristModuleViewer`
  `_editSymbology`, `_saveLayerSymbology`, `_normalizeSymbologyValue`, `_getSymbologyFieldId`; the
  entries of `HeuristModuleExplorer` and `HeuristModuleMap`).

Deviations from the plan / legacy:
- Layout of the thematic editor: a CSS grid (top / fields / ranges) instead of `HCardinalLayout`
  (no resizable panes needed in a dialog); it stacks on narrow screens.
- A renderer's title is edited in its settings (no prompt dialog); titles must differ on Save.
- Field tree: `HFieldTree` with two link levels; codes as before (`10:lt240:48:237`). Values of a
  field of linked records come from a query of the linked records (`lf:240` around the layer
  query), so the layer query must be JSON for such fields (legacy message kept).
- Generated date ranges are whole years; a range ends on 31 December of the year before the next
  starts (dates are compared as text), the last on 31 December of its year.
- Symbol gradient values are spread evenly from the first to the last range.
- The parent of a Map Layer symbol in the record editor is the built-in symbol (legacy: the
  user's `map_default_style` preference); the Map module passes its configured default.
- Map configuration: the symbol editor opens above the configuration dialog (no `withHostEditor`).
- The Map module opens the editors in its own document (in Explorer: inside the module's iframe),
  no longer in the top window.
- In the Map module the image filter editor is not offered: its layer panel edits vector layers
  only (as before); image layers are edited in the record editor.

## Open points

- Check in a browser, especially the thematic editor inside a small Map pane of Explorer.

## Change 2026-10-14: editors in Explorer's window again

Request (Artem): like `editRecord` and the expansion rules, the symbol and thematic map editors of
the Map module open as Explorer popups, not inside the module's iframe. This brings back a bridge
method `editSymbology(value, options)` — but not the legacy one: the options are those of
`SymbologyService#edit` (`kind`, `mode`, `parentSymbol`, `query`, `complete`, `rectypeId`), Explorer
opens the shared editors with the record editor's `SymbologyService`, and returns the value (or
null). Saving (the Map Layer's DT_SYMBOLOGY, Map configuration) stays in the Map module.
- Explorer: host action `editSymbology`; `IframeModuleAdapter` offers it to the child only when
  Explorer has it.
- Map: `createSymbologyService({ hostBridge })` replaces `edit` with `hostBridge.editSymbology` when
  present (main map and configuration-only mode); otherwise the editors open in the module.
- The legacy wrapper (`heurist/hclient`) does not offer it, so there the editors stay in the module.
Not checked in a browser. Same day: module help manuals open in Explorer's window too
(`useHostHelp` in `shared/src/ui/InlineHelp.js`, bridge `openHelp`); Configuration and Publish
dialogs of the modules stay in their iframes for now (decided with Artem).
