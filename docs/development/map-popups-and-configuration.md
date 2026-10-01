# Map, Graph and Data: popups, zoom ranges and configuration dialogs

*Status: implemented 2026-10-01, not committed.*

Topic note for the Map changes requested on 2026-10-01 (items 4–8 of that list).

## Zoom ranges of a Query Source (item 4)

`MapPresentationService::getLayer()` (server, `srv/Records/Presentation`) sends the
effective native zoom range of a Map Layer:

- source is a **Query Source** (`RT_QUERY_SOURCE`): the **intersection** of the
  layer range and the source range (`DT_MINIMUM_ZOOM_LEVEL` /
  `DT_MAXIMUM_ZOOM_LEVEL`); a missing bound means "no limit". When the ranges do
  not overlap, the source range is used (changed 2026-10-01 from "source wins").
  Examples: layer 5–15 + source 8–18 → 8–15; layer 2–6 + source 10–18 → 10–18;
  layer min 10 + source max 12 → 10–12.
- any other source (tiled image etc.): unchanged, the layer's values take
  precedence, because there the source range is the native tile range.

Explorer workspace layers already used the Query Source zoom range
(`presentation.map.minZoom/maxZoom`).

## Configuration dialog (item 5)

- **Options** is always checked and disabled in every `preferences` dialog (the
  dialog is opened from the Options icon), whatever the runtime mode; the same
  rule as heurist-data and heurist-graph (confirmed 2026-10-01).
- **Extent → Define**: Explorer's `editExtent` host action now opens the same
  draw-mode Map dialog as the Filter Builder extent picker (`selectFilterExtent`).
  The outer host's legacy editor is used only when Explorer has no Map module URL.
- **Popup template**: None · Built-in (basic) · Built-in · Standard (Legacy), then
  the group "Smarty templates". An empty value means Built-in (decided
  2026-10-01). The former `minimal` value is read as Built-in (basic).

## Popup modes (item 6)

| Value | Content |
|---|---|
| `none` | no popup |
| `basic` | title, then "Record NNN · Type: YYY" (as the Graph built-in popup) |
| `builtin` (default) | shared record renderer, compact: header and the first file's thumbnail (no OSD/Mirador links, no audio/video players), then "More..." which shows the full record view in the popup |
| `standard` | legacy `renderRecordData.php?mapPopup=1` |
| `<name>.tpl` | Smarty template |

The record renderer moved from `apps/recordview` to `shared/src/recordview/`
(see `docs/architecture.md`, Record View). In the full view a link to another
record opens that record in the popup; "‹ Back" returns. The edit pencil is shown
when the host can edit records - the same condition as everywhere in Map
(`!readonly && host.supportsEditing()`); after a save the record is shown again.

Features of files and external services (no Heurist record) still show their
property table, unless the mode is `none`.

## Linked features and several features at one spot (items 7, 8)

With "Individual Linked Map Features" (`geoOutputMode: 'features'`) the `/map`
response already has everything needed. Each linked feature has
`_path.recordIDs` (the whole path: the mapped record, the intermediate records
and the record with the geometry) and `_geoRecordID`. `meta.records` has the
title and record type of every record on the path. Example
`10:lt240:48:lt134:12:28` gives `["153", "204874", "96"]` = Person, Life event,
Place. The loader keeps `meta.records` on the runtime layer state (private
`linkedRecords`).

On a click the popup shows:

- one record → that record in the configured mode;
- several features at the same spot, or a linked path → a selector list: record
  type icon and title, a linked path indented one level per record. Paths that
  start with the same records share those lines. About 10 lines are visible,
  then the list scrolls. Choosing a line shows that record in the configured
  mode, with "‹ Back".

"Same spot" (`LeafletMapAdapter.getCoincidentFeatures`): point features within
3 px of the clicked point (cluster markers by their position before
spiderfying), or lines/polygons with exactly the same geometry, in all visible
layers.

## Popup mode applied only after a datasource change (second item 7)

Two causes, both fixed:

1. Leaflet popups were bound to the feature on the first click and reopened with
   the same HTML afterwards. Now there is one map popup whose content is built on
   every click.
2. A persisted Map Layer always sends `popupTemplate` (often `null`). It was
   therefore never treated as inheriting the global template. An empty value now
   inherits.

The mode is also read from the current settings at click time
(`MapApplication.currentPopupTemplate`).

## Not done

- The Standard/Smarty HTML is fetched again on each click (no cache).

## Graph popups (2026-10-01)

The record part of the popup is shared: `shared/src/recordview/RecordPopupContent.js`
(modes, Back, Built-in compact → full, edit pencil, `normalizePopupMode`). Map keeps
only its selector list (`MapPopupController`); Graph builds its node popup with it
(`GraphApplication.createPopupContent`).

Graph Popup template: None · Built-in (vis basic) · Built-in, then the group "Smarty
templates". Empty (and the legacy `standard`) is Built-in. "vis basic" shows the
record type **name** (was its ID). The Graph popup is clickable when it shows a
record (so "More...", Back and edit work), scrolls when long, and opens below the
node when there is no room above. The edit pencil follows the same rule as elsewhere:
the view is not read-only and the host can edit records.

## Changes 2026-10-01 (later)

- **Default popup mode is Built-in (basic)** in Map and Graph: an empty/unset Popup
  template means `basic` (`normalizePopupMode` in `RecordPopupContent.js`). This replaces
  the earlier "empty means Built-in" decisions above. Built-in must now be chosen
  explicitly (`builtin`).
- **Map, several records at one spot / linked path, basic mode**: the list lines are plain
  rows (icon, title; record ID in the tooltip) - a basic card would show nothing more, so
  no second view is opened. Other modes keep choosable lines with "‹ Back".
- **Map popup closing on "More..." or a list line** (fixed): the content is re-rendered
  inside its own click handler, which detaches the clicked element; Leaflet then could
  not tell the click came from its popup, took it for a map click and closed the popup.
  Clicks inside `RecordPopupContent` no longer propagate.

## Data module (2026-10-01)

- **Extended view template**: Built-in · Standard (Legacy), then "Smarty templates".
  Empty is Built-in: each visible record is rendered with the shared record renderer
  (full view without tags/incoming links; one `/records` request per batch -
  `RecordViewLoader.loadMany`). The selector is always shown (the view mode can be
  switched in the list).
- **Popup template** (new option, `config.defaults.popupTemplate`): None · Built-in ·
  Standard (Legacy), then "Smarty templates". Empty is Built-in. The record's "i"
  action opens `DataRecordPopup` (shared `RecordPopupContent`) beside the action; it
  replaces the host record viewer. With None, or "Enable popups" off, there is no "i".
  A legacy configuration that only had `popupTemplate` (before the card/view
  templates) still fills the card/view templates once; afterwards `popupTemplate`
  is the popup's own setting.
- **Export**: the "Export warning" button is gone; the warning is shown as text
  while the Export option is on.
- **Lazy loading**: DataTables (with Buttons and its CSS, now
  `engine/datatables/DataTablesAdapter.css`) is a separate chunk loaded only for the
  Table view (`createDataEngine`). JSZip and pdfmake load only when the Table engine
  starts with the Export control on.
- The Data **Built-in popup opens with the full record** at once (no compact card,
  no "More..."); Map and Graph keep compact + "More...".
- Fixed: labels over values in the Built-in Extended view. The renderer sized the
  label column from labels measured before the record was on the page (0 px); now it
  keeps the natural label width and aligns on the next frame.

