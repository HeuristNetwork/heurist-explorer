# Plan 27c — CMS designer, first version (plan 27, phase 3)

**Status 2026-10-30: implemented (phases A0-E, both repos), not committed, not checked in a browser.** Decisions of
four review rounds in §2, §14, §15; implementation and deviations in §16. General
directions are in `27 CMS-and-Web-Publishing-Plan.md`, the v4 format in `27a Website-Format-v4-Plan.md`, the Website
manager in `27b Website-Manager-Plan.md`; this plan uses them and does not repeat them.

**2026-10-30:** the server side of this plan (menu move §4, save §8, ownership §10) is `27d Website-API-Plan.md`
(agreed and implemented 2026-10-30), which follows the API rules of plan 28.

## 1. Request (Artem, 2026-10-29)

A full-screen designer for v4 websites and pages that roughly repeats the legacy v3 editor (so existing users are not
shocked), more robust and convenient, with new features: templates, colour schemes, translation of elements,
convenient configuration of modules and new helper widgets.

- Website structure: a tree with drag and drop of pages; Header, Home and Footer fixed. Toolbar: template, add page,
  colour scheme. Item tools: edit record, remove.
- Page structure: a tree with drag and drop of `data-h-node` elements; only `data-h-control` elements are containers.
  Kinds: control (group, tabs, accordion), instance (Explorer, module or widget such as HMenu, HFilter, HBadges), text
  (TinyMCE, translatable).
- Tools per node: text — style, translate, edit, add; control — properties, style; instance — configuration in website
  mode; all — copy / paste.
- Page toolbar: page template, page width of the preview.
- Veil: hover over a tree node shows its element in the preview, and the other way round.
- Pages loaded once and cached, a one-page layout with lazy loading: phase 4 (§2).

## 2. Decisions (Artem, 2026-10-29)

| # | Question | Decision |
|---|---|---|
| 1 | Screen | Full screen. West: website tree. Center: preview iframe. East: structure of the selected page / header / footer / home. |
| 2 | How editing works | Tree and forms beside a live preview. Inline TinyMCE in the preview comes later. |
| 3 | Saving | Draft per part; **Save** PATCHes only the changed fields. Leaving a dirty part asks Save / Discard / Cancel (§8). |
| 4 | Revision check | Now: `rec_Modified` sent with every save (§8). |
| 5 | Undo / redo | Per part, local, for the session; cleared when another part is opened. |
| 6 | Who may edit | The owner of the website (or of a standalone page). A CMS rule in the website service, not generic parent-child (§10). |
| 7 | Storage | Current tables (plan 28 deferred). Translations in 2-1202, JSON per language. |
| 8 | Page loading | Client page switching, cache and the one-page layout: **phase 4**. Phase 3 previews one server-rendered page. |
| 9 | Translation | **Phase 3**, simple (§9). |
| 10 | Controls | `group`, `tabs`, `accordion`. **No cardinal layout** (HCardinalLayout stays inside Explorer). |
| 11 | Styles | Not set on every element: kind defaults and presets per website / page (§6a). |
| 12 | Copy / paste | *Copy structure* and *Copy all*; no paste into itself or its descendants; instances are pasted with default settings, not copied (§5.3). |
| 13 | Where it opens | From the Website manager only, inside Explorer (§15 #6). |

## 3. Screen

- `apps/website/src/designer/` (lazy chunk), mounted by `apps/website/src/direct.js` (`mountCmsDesigner`), opened
  over the whole screen from the Website manager (*Open editor* on a website or a standalone page). The record editor,
  module configuration and definitions come from the host bridge, as for the manager (§5.4). The manager and the
  designer run **only inside Explorer** (Explorer is the only host that mounts them; without its bridge records can not
  be edited); without a bridge the designer does not open.
- `HCardinalLayout` (`shared/src/widgets/layout/`): west, center, east; west and east collapsible and resizable.
- Top bar: website / page name, preview language, Undo / Redo, Save / Discard (with the dirty mark), Close.
- A v3 website (2-49 < 4) does not open in the designer: the manager offers the legacy editor; conversion is phase 8.

## 4. West: website tree

```
Header            fixed
Home              fixed
  Page 1          drag and drop
  Page 2
    Page 2.1
  Page 3
Footer            fixed
```

- A shared tree widget `shared/src/widgets/tree/HTree.js` (§7): keyboard, drag and drop with a drop rule, tools per
  item. Used by both trees.
- Toolbar: add page, website properties (record editor), *Styles* (colours, fonts, kind defaults, presets; §6a).
  Website template: phase 4.
- *Styles* saves at once (a PATCH of the website's 2-1187), not as part of a draft. It opens only when no part is
  dirty; otherwise Save / Discard / Cancel is asked first. After the save the open part's preview is re-styled.
- Item tools: edit record, add sub page, remove from menu, delete page.
- *Add page* / *Add sub page*: a small popup with **Title** and **Preset** = the starting content of the page:
  **text and column combinations only** (e.g. one text block, two columns, three columns, text above two columns;
  exact list in phase B). A module selector may be added later. `POST /page/0`, then `assign` (27d).
- *Delete page* with sub pages asks: **delete the sub pages too**, or **move them one level up** (into the deleted
  page's place in the parent menu). Then `DELETE /page/{id}`.
- Drag and drop saves at once (as in v3), not part of a page draft: `POST /api/{db}/website/{id}/assign
  {page, parent, index}` (27d §5, replaces the earlier `menu/move` proposal; PATCH of 99-742 / 99-761 in the new
  order).
- Selecting Header, Home, Footer or a page opens it as the *part* in the east pane and in the preview.
- Standalone pages are not in the tree; the manager opens them in the designer alone (no west tree).

## 5. East: structure of the selected part

### 5.1 Tree

- The `data-h-node` elements of the part, with drag and drop. **Only the root and `data-h-control` containers take
  children.**
- Node kinds and their tools:

| Kind | Marker | Tools |
|---|---|---|
| control | `data-h-control="group"` (new), `"tabs"`, `"accordion"` | properties (tab / accordion options, grid columns), style, add child, copy, delete |
| text | `data-h-text=""` | edit (TinyMCE popup), style, translate (website with several languages), add after, copy, delete |
| instance | `data-h-instance` | configuration (§5.4), style, delete (no copy, §5.3) |

- "Columns 2 / 3" are groups with a grid preset (§6a).
- Missing translations are marked on text nodes (`checkCmsDocument` reports them).
- Toolbar: page width of the preview: **Full, 1280, 1024, 640, 375 px**. 1024 and 640 are the limits of the `medium`
  and `narrow` screens of format v4, so the author sees the screen styles act. Page template: phase 4.

### 5.2 Add element

A picker below the tree: text, group, two / three columns, tabs, accordion, Explorer, the modules (data, map, timeline,
graph, recordview), menu. A new element goes into the selected control as last child, or after the selected node.

### 5.3 Copy / paste

- *Copy structure*: containers and text blocks with their styles and presets; text blocks empty (placeholder text);
  instances left out.
- *Copy all*: deep copy with texts and their translations and styles.
- **Instances are never copied with their settings** (Artem, 2026-10-29): in both copies an instance becomes a new
  instance of the same type with default settings, marked "not configured" in the tree; it has no reference to the
  original. An instance node alone can not be copied.
- Paste: into the selected control (last child) or after the selected node. **Never into the copied node itself or one
  of its descendants.** New ids on paste.
- Clipboard: the designer session plus `sessionStorage` (paste into another page of the same database).

### 5.4 Configuration of instances

- Modules: the plan 29 configuration form in mode `website` (`ModuleConfigurationDialog`), through the host bridge
  `openConfiguration` (the website app may not import other apps; Explorer's `openModuleConfiguration` does it).
- Explorer: its configuration and the filter form of *Publish this view* (`explorerPublication.js`), also through
  the bridge.
- Menu (HMenu): a small HEditForm in the designer.

## 6. Preview (center)

- An iframe of `/{db}/site/{id}/{page}?design=1`. Design mode on the server: no cache, a marker class, the runtime's
  design hooks on.
- `design=1` is for the CMS editor only. The site runtime checks that it runs in the designer's iframe (same origin,
  `parent.hCmsDesigner`); otherwise it opens Explorer with a start option that opens the Website manager and the
  designer on this website / page (`location.replace`). A visitor who can not edit the record gets the normal page.
  Cost: the runtime check (small) and one Explorer start option (`cms={id}&page={page}`, small). If the start option
  turns out complex, the fallback is the normal page.
- Same origin: the designer works on the iframe's DOM directly.
- **No reload after an edit.** The server renders the part once, when it is opened. Each change is applied to the
  iframe DOM by the same `cmsEdit.js` operation that changed the draft:
  - text: the node's inner HTML is replaced;
  - style, preset, kind default: re-compiled with `compileCmsStyles` into the page's node-styles `<style>`;
  - structure (insert, move, remove, paste): the same DOM operation, then the runtime enhances only that subtree
    (tabs, accordion);
  - instance: the runtime mounts or destroys only that instance.
  - Design hooks of the runtime: `window.hSiteDesign = {enhance(element), mountInstance(element, config),
    destroyInstance(id)}`, reusing `startSite`'s `createTabSet`, `exclusiveAccordion` and `mountInstance`
    (`apps/website/src/siteRuntime.js`).
- A reload happens only when another part is opened, after Discard, or when the preview language changes (the server
  applies the translations).
- **Veil**: an overlay at the element's rectangle while the mouse is over a tree node; hovering the preview finds the
  closest `[data-h-node]` and highlights it in the tree; a click in the preview selects the node.

## 6a. Common styles

Styles are set once, not on every element. Three levels, each overriding the one before:

1. **Kind defaults**: `styles.kinds.{group|tabs|accordion|text|instance}` in the website's 2-1187, a page's 2-1187 may
   override them. Compiled to `[data-h-control="group"]`, `[data-h-text]`, `[data-h-instance]` selectors.
2. **Presets**: `styles.presets.{name: {label, ...properties, narrow, medium}}` on the website, plus page presets. A
   node uses one with `data-h-style="name"`.
3. **Own styles of a node**: the existing `styles.nodes`, for exceptions only.

The properties area of a node shows: kind default (read-only line) → preset (select) → *Own style…* (closed; opens the
full style form, HEditForm from the allowed style properties, with Normal / Medium / Narrow tabs). A control's own
properties stay short (tab / accordion options, grid columns).

Proposed starters (written into a new website by `WebsiteStarter`, changeable here):

| Kind default | Values |
|---|---|
| group | `display: block`, `gap: 12px` |
| tabs, accordion | border 1px, padding 8px |
| text | line-height 1.5 |
| instance | `min-height: 300px` |

| Preset | Meaning |
|---|---|
| Card | padding, border, radius, shadow |
| Two columns / Three columns | grid with 2 / 3 columns, one column on `narrow` |
| Highlighted | primary background colour, light text |
| Banner | full width, large padding, centered text |
| Narrow column | max-width 800px, centered |

Format additions to 27a (phase A0): `styles.kinds`, `styles.presets`, attribute `data-h-style` (StoredText
allowlist), control value `group`. Changed: `shared/src/site/cmsDocument.js` (`checkCmsDocument`,
`compileCmsStyles`), PHP `srv/Website/CmsValidator`, `StyleCompiler`, `srv/Utilities/StoredText`, fixtures
`shared/test/fixtures/cms-v4` (also run by `tests/CmsFormatTest.php`).

## 7. Document model and tree

- `shared/src/site/cmsEdit.js` (new): a part = HTML + config + translations. Parse with `DOMParser`; operations insert,
  move, remove, wrap, copy structure / copy all, paste (with the no-recursion rule); new ids `n` / `i` + 6 characters
  (as `WebsiteStarter::id`); serialize; config and translations kept in step (no orphan instances, styles or
  translations); `checkCmsDocument` before every save. The same operation is applied to the preview DOM (§6).
- `shared/src/widgets/tree/HTree.js` (new, `HBaseWidget`): items with icon, label, tools; keyboard; HTML5 drag and drop
  with `canDrop(item, target, position)`; hover and selection events (for the veil).

## 8. Saving, revision, undo

- **Draft per part**: edits change the part's draft and the preview; the part becomes dirty. Undo / redo works on the
  draft: one local stack per part, no server call.
- **Save** (top bar, Ctrl+S): one `PATCH /website/{id}` or `PATCH /page/{id}` (27d §4; `/records/{id}` stays valid)
  with **only the changed fields** — 2-4 (page or home), 2-929 / 2-940 (header, footer), 2-1187, 2-1202 — plus
  `rec_Modified`. The reply (`fields=_all`) contains the new `rec_Modified`, kept for the next save.
- `rec_Modified` is updated by every save; the check (`RecordSaveService`, 409 `conflict`) works only when the client
  sends the value it read, so the designer always sends it. No server rule now; phase 7 decides it for the agent API.
- **`rec_Modified` is kept per record, not per part.** Header, Home and Footer are one record (the website: 2-929, 2-4,
  2-940, sharing 2-1187 and 2-1202); every save of the designer (part, Styles, menu) updates the one value of its
  record, so saving the Header does not make the next Home save a false conflict.
- A 409 asks: *Reload* (lose the draft) or *Overwrite* (`force`).
- **Discard**: back to the last saved state, preview reloaded.
- Opening another part or Close with a dirty part asks **Save / Discard / Cancel**; the browser's unload warning is on
  while a part is dirty. Opening another part clears the undo stack.
- Menu changes (west tree) are saved at once and are not part of a draft.

## 9. Text editing and translation

- Edit: TinyMCE (`createTinyMceEditor`, `shared/src/widgets/rich-text/`) in a popup, with record link and media.
- Translate (website with several languages, 2-967): a popup with the language selector, the original read-only
  beside the editor; the result goes into the draft's translations (2-1202 `lang:{nodeId: html}`).
- Preview language in the top bar (`?lang=`, reload).

## 10. Ownership (closes 27b §10)

- A page created for a website (`POST /website/0`) or added to its menu (`assign`) gets the website's owner and
  visibility; the group 1 rule is gone (27d, done).
- Owner and visibility of the website and all its menu pages: a standard `PATCH /website/{id}` of
  `rec_OwnerUGrpID` / `rec_NonOwnerVisibility`; the website save hook passes them on to the pages (27d, done).
- Deleting a website deletes its pages: `DELETE /website/{id}?pages=1` (27d, done).
- The designer is editable only when the user can edit the website record (or the standalone page); otherwise
  read-only.
- Standalone pages keep their own owner.

## 11. Implementation phases

| Phase | Content |
|---|---|
| A0 | Format additions (§6a): JS, PHP, fixtures |
| A | `cmsEdit.js`, `HTree.js`, tests |
| B | Designer shell, website tree (drag and drop = `assign`, add page popup, delete with sub pages, Styles), *Open editor* in the manager; Explorer start option and the `design=1` check (§6) |
| C | Page tree, preview with design hooks, veil, page width |
| D | Editing: text, add element, copy / paste, properties and styles (§6a), instance configuration through the bridge, draft + Save / Discard + undo + conflict |
| E | Translation |

## 12. Phase 4 (proposal to agree)

- Website and page templates, colour schemes, client page switching and cache, one-page layout (lazy on scroll),
  sticky or scrolling header and footer, inline TinyMCE in the preview.
- Widgets, mapped from v3 (search input, saved filter tree, result list, custom report, data table, map, story map,
  graph, menu, record list, add record, email form, media viewer):
  - saved filters: HFilter (no generic search input, Artem 2026-10-30)
  - custom report (Smarty)
  - media viewer / gallery
  - badges (HBadges)
  - add record button
  - email form
  - story map: later
- Result list, data table, map, timeline, graph and record view are modules already.

## 13. Tests and checks

- `shared/test/cmsEdit.test.js` (operations, copy / paste, no recursion, ids, orphans), `HTree` drag rules, format
  fixtures with `styles.kinds` / `presets` / `group` (JS and `tests/CmsFormatTest.php`).
- `tests/WebsiteEditTest.php`: `assign` with index / move, owner and visibility to menu pages, owner of new pages —
  done in 27d; add: delete a page with its sub pages / sub pages moved up.
- Browser: the test site 207627 in `osmak_mapping`.

## 14. Answers of 2026-10-29 (second round)

- Kind defaults and starter presets: proposed by Claude (§6a); Artem may change them.
- No paste into the copied node itself or its descendants (§5.3).
- Instances are not copied: a pasted instance is a new one of the same type with default settings, "not configured"
  (§5.3).
- Page width presets: buttons that set the preview width (§5.1).
- `rec_Modified`: no problem; the designer always sends it (§8).
- The designer opens from the Website manager only.
- Undo per part; leaving a dirty part asks Save / Discard / Cancel (§8).

## 15. Answers of 2026-10-30 (fourth round)

| # | Question | Decision |
|---|---|---|
| 1 | Header, Home, Footer are one record: `rec_Modified` per part gives false conflicts | `rec_Modified` **per record** (§8). |
| 2 | *Styles* of the website (2-1187) | Saved at once; only when no part is dirty (§4). |
| 3 | Delete a page with sub pages | Ask: delete the sub pages too, or move them one level up (§4). |
| 4 | New page | Small popup: Title, Preset = starting content, text and column combinations only; a module selector maybe later (§4). |
| 5 | `?design=1` | CMS editor only; called outside it, the page opens Explorer with the designer, unless that is too complex (§6). |
| 6 | Website manager / designer without Explorer | Not supported: Explorer is the only host, and without it records can not be edited (§3). |
| 7 | Starter kind defaults and presets (§6a); phase 4 widgets (§12) | Confirmed; no generic search input in phase 4. |

Cleanup after 27d: §10 (endpoints), §11 phase B, §13 tests.

## 16. Implementation (2026-10-30)

| Phase | Done |
|---|---|
| A0 | `styles.kinds` / `styles.presets` / `data-h-style` / control `group`: `shared/src/site/cmsDocument.js` (`compileCmsStyles(base, nodes, baseUrl, {kinds, presets})`, `CMS_KINDS`, `CMS_STYLE_PROPERTIES`), heurist `srv/Website/StyleCompiler.php` (`compile(base, nodes, kinds, presets)`, `KINDS`), `CmsValidator::check`, `PageRenderer` (website then page), `srv/Utilities/StoredText.php` (`data-h-style` allowed), fixture `shared/test/fixtures/cms-v4/common-styles.json` (JS and `tests/CmsFormatTest.php`). `WebsiteStarter::KINDS` / `PRESETS` written into new websites; the starter header is a `group`. |
| A | `shared/src/site/cmsEdit.js` (`CmsRecordDocument`: parts of a record, tree, insert / move / remove / copy / paste / text / translation / preset / node style / common styles / instance, snapshot for undo, check; `cmsPageStarter`), `shared/src/widgets/tree/HTree.js` + css; tests `shared/test/cmsEdit.test.js`, `hTree.test.js`. |
| B | `apps/website/src/designer/CmsDesigner.js` (top bar, website tree with drag and drop = `assign`, add page popup, delete with sub pages, Styles, website properties), *Open editor* in the Website manager (`WebsiteManager.openDesigner`, `direct.js` `openDesigner`), Explorer start option `explorerViewer.html?db=&mode=cms&site=&page=` (`explorerConfig.urlBootstrap`, `config.cms`, `openWebsiteManager({design})`). |
| C | `CmsPreview.js`: iframe of `?design=1`, design hooks (`siteRuntime.designHooks`, `enhanceControls`, `designerHost`, `designerUrl`; `main.js` opens Explorer when the page is not in the designer), draft applied into header / main / footer with the mounted instances kept, styles compiled again, veil, hover and click to the tree, page widths. Server: `WebsiteController::showPage` sets `design` for logged-in users, `PageRenderer` marker class `h-site-design` and `runtime.design/site/page`. |
| D | Part tree with drag and drop (`CmsRecordDocument.canDrop`), element picker, properties (kind default, preset, own style), text editor (TinyMCE popup), copy structure / copy all / paste (session clipboard), instance configuration through the bridge (`openConfiguration` mode `website`; Explorer: new bridge `configureExplorerInstance`), draft + Save (PATCH of the changed fields, `rec_Modified` per record) / Discard / undo / redo / 409 Reload or Overwrite, Ctrl+S / Z / Y, unload warning. `designerData.js`, `designerDialogs.js`, `designer.css`. |
| E | Translate popup (original beside the editor, translations of 2-1202), preview language in the top bar. |

Tests: JS 1,544 pass (new `apps/website/test/cmsDesigner.test.js`, `shared/test/cmsEdit.test.js`, `hTree.test.js`, the
`cms` start option in `apps/explorer/test/recordEditorShell.test.js`); heurist `tests/CmsFormatTest.php` 10,
`WebsiteRenderTest.php` 32, `WebsiteEditTest.php` 60 (design mode, `data-h-style` kept, sub pages moved up),
`StoredTextTest.php` 90. Website and Explorer bundles built and deployed locally.

**Deviations and notes:**
- Tabs and accordions created by the designer: a panel is a `group` (`section` / `details`) whose first child is a
  text block holding the label (`h3` / `summary` with `data-h-text`), so labels are edited and translated like any text.
- The "instance" kind default (`min-height: 300px`) is meant for modules; widget hosts (the menu) get an own style
  `min-height: 0` (WebsiteStarter and the designer's *Add menu*).
- The parser of `cmsEdit.js` is a small parser for the well-formed HTML the server stores (no DOM, testable in node);
  text blocks and hosts keep their inner HTML as it is.
- The preview does not reload on edits: the draft HTML replaces the three page containers and the instance hosts get
  their mounted instances back (mounted again only when type, settings or state changed).
- Explorer instance configuration: the form of *Publish this view* in `website` mode; the settings are the current
  view of the Explorer behind the designer (as Publish).
- The menu widget has no settings (HMenu shows the website pages); its *Configuration* says so.
- Page presets `text`, `columns2`, `columns3`, `textColumns2`, `textColumns3` (`CMS_PAGE_PRESETS`).
- Deleting a page: out of the menu, then `DELETE /page/{id}?force=1` (WebsiteClient `remove({force})`); "move up" =
  `assign` of each sub page after the page in its parent first.
- Browser check 1 (2026-10-30): the designer opened behind the Website manager (z-index 1100 < 10000; now 10010).
  The preview needs the same origin as the editor: from the Vite dev server (`:5173`) the design page can not reach
  the designer, so it shows the saved page only (a note says so) and no longer redirects inside the iframe
  (`siteRuntime.isFramed`; the redirect to Explorer only for a top-level page).
