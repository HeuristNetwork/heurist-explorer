# Plan 27c — CMS designer, first version (plan 27, phase 3)

**Status: DONE 2026-11-02 — committed, checked by Artem.** Implemented 2026-10-30 (phases A0-E, both repos);
decisions of four review rounds in §2, §14, §15; implementation and deviations in §16; review rounds §17-§26 (screen,
toolbars and trees, catalog popups, Styles popup, style editor, Size in group, element tools, text and translation
popups). Leftovers that are new features are moved to phase 4 (§27). General
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

## 17. Screen review (Artem, 2026-10-31)

Editor and preview are separated clearly: **the editor is the west pane, the preview alone is the center** (no east
pane, no top bar `h-cms-bar`). Replaces the screen of §3, §4 (toolbar) and §5.1 (toolbar).

West pane, from top to bottom:

1. Toolbar: *Properties* (record editor: the website on the Site tab, the open record on the Page tab: the website
   for Header / Home / Footer, else the page), *Styles* (of the whole website, §6a), preview language (several
   languages only), *Help* (shows / hides the help panel, remembered in `localStorage` `heurist.cms.help`), *Close*.
2. Second row: page width of the preview (Full, 1280, 1024, 640, 375).
3. Tabs **Site | Page** (`createTabSet`, prefix `h-cms`). A standalone page has the Page tab only. The dirty mark ●
   is on the Page tab.
   - *Site*: no toolbar; the website tree. *Add page* is always shown on Home (HTree tool option `always`); the page
     tools as before (edit record, add sub page, remove from menu, delete). A click on Header, Home, Footer or a page
     opens it on the Page tab.
   - *Page*: toolbar Undo, Redo, **Save** (primary), Discard; the part tree; *Add element* with *Paste*; the
     properties of the selected element (hidden when nothing is selected).
4. Help panel below the tabs, as high as its text (at most 40 % of the pane):
   - Site tab: "Drag pages to change their order in the main menu of the website; drop a page onto another one to
     make it a sub page. Add a page with the button on Home, a sub page with the tools of a page. Click Header, Home,
     Footer or a page to edit it on the Page tab. Properties edits the website record; Styles sets the colours, fonts
     and common styles of the whole website."
   - Page tab: "Drag elements to change their order on the page; groups, tabs and accordions take other elements
     inside. Add new elements below the tree: they go into the selected group or after the selected element. Select
     an element here or in the preview to edit its content, properties and style. Changes are kept until you Save or
     Discard them."
   - Selected element: "Apply a preset (a style defined once in Styles) or define an own style for this element."
     plus by kind: text "Edit the text with the pen; translate it into the other languages of the website." (the
     translation part only with several languages); module "Set what the module shows and how in its configuration
     (gear)."; menu "The menu shows the pages of the website: change them on the Site tab."; tabs / accordion "Each
     panel is a group whose first text is its label. Add elements into a panel: select it and use Add element.";
     group "Add elements into it: select it and use Add element, or drag elements onto it."; not for modules "Copy
     structure or Copy all, then Paste it into another place or page."

Files: `apps/website/src/designer/CmsDesigner.js`, `designer.css`, `shared/src/widgets/tree/HTree.js` + css (tool
`always`), test in `apps/website/test/cmsDesigner.test.js`. JS 1,547 pass; website bundle built and deployed locally.

## 18. Review (Artem, 2026-11-01)

1. The preview language moves to the second row; the page widths become a select (*Full width*, 1280 ... 375 px); the
   second row is right aligned (`_renderViewBar`, `.h-cms-view-bar`).
2. Site tree, Home: *+ Add page* (icon `fa-plus` with a caption; HTree tools take `label`).
3. Site tree, page: *Remove from menu* and *Delete* become one tool `fa-xmark` *Remove from website*. Popup "Remove
   {page} from website" with Artem's text and the box *delete the actual web pages* (`askRemovePage`). Without the
   box: out of the menu with its sub menus; with it: the page and its sub pages are deleted too. The page is **not
   made standalone**: `DELETE /website/{id}/assign` takes `standalone=0` (page type kept; default 1 for the Website
   manager), `WebsiteClient.removeFromMenu(site, page, {standalone})`. Moving sub pages up on delete is dropped
   (the text tells to move them out first); `chooseSubPages` removed.
4. Page tab: Save on the right; Discard asks 'Discard the changes of page "{title}"?' or 'Discard the changes of
   Header / Home / Footer?'; Unsaved changes says '"{name}" has changes that are not saved.'; both dialogs narrower
   (`h-dialog-cms-narrow`, 420 px).
5. Part tree:
   - a) the root has *+ Add element* (always shown): a popup with the element select, the element goes to the end
     of the part.
   - b) four tools: **+** on containers (a group: the element popup, into the group; tabs / accordion: the next
     panel at once, `CmsRecordDocument.addPanel`), **pen** on texts (text editor) and groups (caption), **gear** on
     modules and widgets (configuration), **remove** with a small confirmation next to the icon (`confirmNear`;
     HTree `onTool` gets the button). Own style, Translate stay in the properties below the tree.
   - c) no new type: the **caption** of a group is its first child when it is a heading (`h1`-`h6`) or `summary`
     text block. It is not a tree item, has no own style and is edited with the pen of its group
     (`caption` / `setCaption` with the translations in the same popup, plain text); a click on it in the preview
     selects the group (`captionGroup`). A plain group gets an `h3` caption from the pen and loses it with an
     empty text; a panel of tabs / accordions must keep its caption (`isPanel`).
   - d) a group, tabs or accordion is removed when a group was removed or moved out of it and nothing but its
     caption is left (`_removeEmpty`, upwards). Removing texts never removes their group (a new empty group stays).
   - e) *Copy structure* and *Copy all* are buttons of `h-cms-picker` for the selected element (disabled without a
     selection and for modules / widgets).

Files: `apps/website/src/designer/CmsDesigner.js`, `designerDialogs.js`, `designer.css`, `shared/src/site/cmsEdit.js`,
`shared/src/widgets/tree/HTree.js` + css, `shared/src/api/WebsiteClient.js`; heurist `srv/Website/WebsiteEditService.php`,
`WebsiteEntityHandler.php`. Tests: JS 1,551 pass (`cmsEdit.test.js` captions, panels, removal of empty controls;
`hTree.test.js` tool caption; `cmsDesigner.test.js` tools, messages, second row); heurist `tests/WebsiteEditTest.php`
62 pass (`standalone=0`). Website and Explorer bundles built and deployed locally. Not checked in a browser.

## 19. Add page and Add element popups (Artem, 2026-11-01)

One catalog popup for both, like the legacy `editCMS_SelectElement` (`catalogDialog` in `designerDialogs.js`, data
in `designerCatalog.js`): *Title* on top, entries on the left (in groups), name, description and a wireframe preview
(inline SVG drawn from a small shape list; the legacy code has no preview images) of the selected entry on the right.
Entries not implemented yet are grey (italic), show "To be implemented soon..." above the description and the Add
button is disabled. Double click adds.

- **Add page**: templates Blank, Landing, About, Team, Discover, Blog, Contact (descriptions extended). Choosing a
  template fills an empty title (or the default title of the previous template) with its default name (Welcome,
  About, Team, Discover, News, Contact); Blank has none. The title is required. **For now every template creates a
  blank page**: one text element with the title as `h1` and a paragraph (`cmsPageStarter('blank')`); templates
  follow in a later phase. The page presets of §4 are no longer offered.
- **Add element** (+ of the root and of groups, and *Add element* below the tree, which replaces the select there):
  groups *Content and layout* (Text, Group, Text in two / three columns, Accordion, Tabs), *Modules* (Explorer, Data,
  Map, Timeline, Graph, Record view; grey: Crosstabs, Story map), *Widgets* (Menu; grey: Custom report, Action menu,
  Media viewer / gallery, Badges, Email form). The title is the heading (`h2`) of a new text or the caption of a new
  group / columns; disabled for the other elements.
- Open: unify menu and action menu (presentation modes, responsive) — later, with the widget. More templates and
  widgets suggested to Artem (to agree).

Tests: JS 1,552 pass (catalog = CMS_ELEMENTS, previews, blank starter). Website and Explorer bundles built and
deployed locally. Not checked in a browser.

## 20. Answers of 2026-11-01 (catalogs, section)

- **Templates**: added Cover, Features, Record page, Publications (Artem: yes); not Database (= About), Gallery and
  Story (covered by widgets). Every template can be added (`pending`: a note says a blank page with the title is
  created for now); only Blank is final. (Fix: in §19 the templates were grey and could not be added.)
- **Widgets**: Badges = a row of logos with links (participant and sponsor bodies, or social media / project
  resources); Language switcher added (grey). Not as own widgets: HFilter (in Explorer or the action menu, to discuss
  in the next phase), HRecordList (part of the Data module), Text on banner (a custom style of a text), Cardinal
  layout (inside Explorer only; too rigid for pages, replaced on narrow screens).
- **Section and caption** (agreed): `section` has no caption element of its own, its heading is its caption, and it
  is meant for a thematic block with a heading; `div` stays for layout groups. So: a group **with a caption** is a
  `<section aria-labelledby="h-{caption node}">` whose caption `h3` has `id="h-{caption node}"`; without a caption a
  `<div>` (`setCaption` switches the tag, `labelSection`; paste labels the copies by their new ids). Panels of tabs
  (`section` + `h3`) and accordions (`details` + `summary`) keep their tags. Text blocks are `div`: the server starter
  (`WebsiteStarter`, home content and first page) no longer writes `<section data-h-text>`. heurist
  `StoredText` keeps `section[aria-labelledby]` (`tests/StoredTextTest.php` 96).

Tests: JS 1,552 pass; heurist `WebsiteEditTest` 62, `WebsiteRenderTest` 32, `CmsFormatTest` 10, `StoredTextTest` 96.
Website and Explorer bundles built and deployed locally. Not checked in a browser.

## 21. Styles popup (Artem, 2026-11-01)

The Styles popup of a website (or standalone page) has four tabs, each with a help line (?) on top, its settings and
a preview at the bottom (`apps/website/src/designer/designerStyles.js`, `createStylesForm`; `openStylesDialog` in
`designerDialogs.js` shows it):

1. **Base settings**: rows with a gap, readable labels and hints (`BASE_LABELS`); colours (`color-*`,
   `site-heading-color`) with `HInputColor`; a **theme** select fills the colours (`CMS_THEMES`: Default light,
   Default dark, Sepia, Greenish, Blueish, Monitor (green on black, monospace), Red and black; values in the manner
   of the jQuery UI ThemeRoller / Bootstrap themes). A theme is not stored: it only sets base settings. Preview:
   a header with menu links and a bordered group with H1-H4, large / regular / small / tiny text, a link, primary,
   standard and icon buttons.
2. **Layout styles** (kind defaults): kind select (Groups, Tabs, Accordions, Texts, Modules and widgets), the style
   editor inline (`styleRows`, moved here, with `onChange`), a preview of a sample of the kind.
3. **Presets**: list of presets with *Add preset*; the selected one inline (label, name, style, *Delete preset*);
   preview of an element with the preset.
4. **Custom CSS**: CodeMirror (`createCodeTextEditor`, CSS, lazy; a text area without it) for DT_CMS_CSS of the
   record; the warning "JavaScript and CSS are not allowed in this field and will be removed when saving." when the
   server does not allow JavaScript (it cleans the field with `StoredCss` on save). Saved with the styles (one PATCH,
   `_saveRecord({extra})`); the preview page is loaded again when it changed.

Previews are sandboxed iframes (`srcdoc`): the Heurist defaults of the variables (read from the page), a small copy
of the site stylesheet, the styles the website gets (`compileCmsStyles` of the current values) and the custom CSS
(`</style` escaped), around samples with the real `data-h-*` attributes; nothing reaches the designer page.

"JavaScript allowed" comes from the definitions snapshot (`meta.javaScriptAllowed`, Artem 2026-11-01): the Website
manager gives its `dbdefs` to the designer (`options.dbdefs`). No server change.

Tests: JS 1,553 pass (`cmsDesigner.test.js` Styles popup); heurist `WebsiteEditTest` 62, `WebsiteRenderTest` 32.
Website and Explorer bundles built and deployed locally. Not checked in a browser.

## 22. Styles popup cosmetics (Artem, 2026-11-01)

1. Preview of the base settings: muted text (`--h-color-text-muted`), an input and a selector added.
2. Theme *Red and black* became **Red and white**: background `#ffffff`, text `#000000`, surface `#b0b0b0` (primary and
   links `#c62828`, headings `#b71c1c`, borders `#8a8a8a`).
3. Layout styles: the group sample has a caption (`section` + `h3`); the accordion summary keeps the rounded corners
   (`details { overflow: hidden }`, also in the site stylesheet `apps/website/src/style.css`); `.h-cms-style-tabs`
   padding `0 10px`; the caption column of the fields is 80 px on this tab only (`.h-cms-styles-kinds`).
4. Presets: a plain list (selected row highlighted) with *Add preset* always above it, a vertical line between the list
   and the form, separate scroll bars; the field *Label* is called **Name** and the internal name is not shown; new
   presets are named "New preset (n)".
5. The popup is wider (`min(1320px, 96vw)`); the preview is one column beside the tabs, half as wide (grid 2fr / 1fr),
   showing the selected tab.

Tests: JS 1,553 pass. Website and Explorer bundles built and deployed locally. Not checked in a browser.

## 23. Style editor: simple and advanced (Artem, 2026-11-01)

The style editor (`styleRows` in `designerStyles.js`: own style popup, Layout styles and Presets tabs) has one row of
buttons, each 130 px wide: **Advanced** (toggle, kept for the session), **Add property**, **Reset all**, **Remove
all**.

- **Advanced off** (default): *Add property* and *Remove all* hidden; a fixed list with plain labels in sections
  (`SIMPLE_STYLE_FIELDS`): *Group layout* (groups and presets only, on top): Direction (row / column), Wrap, Alignment
  (`justify-content`), Cross axis alignment (`align-items`), Align content (`align-content`), Gap; *Size and spacing*:
  height, width, margin, padding; *Colours and text*: background colour, text colour, text alignment, font size, font
  weight; *Border*: border (none / solid / dotted / dashed), border width, border colour, border radius. Selectors
  start with "(default)"; an empty value removes the property. Properties set only in Advanced are named below the
  list ("Also set (see Advanced): ...").
- **Advanced on**: the property rows as before, with *Add property* and *Remove all*.
- Colours (`color`, `*-color`) use `HInputColor` in both lists.
- A flex value of a group (or preset) sets `display: flex`; when all flex values are cleared, `display: flex` is
  removed again.
- Numeric values are checked when the input is left (`checkStyleValue`): number + unit (px, em, rem, %, vh, vw, pt,
  ch), `0` without one, `auto` for width / height / margin, negative only for margin, at most 4 values (margin,
  padding, border radius) or 2 (gap). A plain number gets `px`. A wrong value is marked red, named under the list and
  left out of the style until corrected.
- **Reset all** clears the values of the current screen (Normal / Medium / Narrow); **Remove all** removes all its
  properties.
- Additions to the list asked for: *Gap* (flex groups need it) and *Border width* (without it a solid border is 3 px
  wide, the CSS default `medium`).
- `align-content` added to the allowed node style properties (`cmsDocument.js` and `StyleCompiler.php`).

Proportions of the elements in a group: on the children (agreed 2026-11-01, see §24).

Tests: JS 1,554 pass; heurist WebsiteRenderTest 32, CmsFormatTest 10, WebsiteEditTest 62 pass. Website and Explorer
bundles built and deployed locally. Not checked in a browser.

## 24. Size in group (agreed 2026-11-01)

The proportion of an element in a group is set on the element (in CSS it is a property of the item; the group gives
direction and gap): section **In the group**, field *Size in group (proportion)* = `flex`, e.g. 1 and 2.

- Shown in the simple list of the own style only when the parent group is a flex box: `display: flex` in its own
  style, else in its preset, else in the group kind default (`CmsDesigner._inFlexGroup`, `CmsRecordDocument.parentGroup`).
  Presets always show it (they may be used on any element). Panels of tabs / accordions are not in a group.
- `flex` added to the allowed node style properties (`cmsDocument.js`, `StyleCompiler.php`).
- Check when the input is left: `auto`, `none`, or grow [shrink] [basis] — numbers, the basis a length with a unit
  (`1`, `2 1`, `1 200px`, `1 0 200px`).
- Two / three columns keep `grid-template-columns` of their presets (a grid, not a flex box), so their children do
  not get the field.
  **Changed 2026-11-02 (Artem):** a website without the `columns2` / `columns3` presets showed the texts one above
  the other. *Add element* Text in two / three columns now writes own styles (`CmsRecordDocument._create`): the group
  `display: flex; flex-direction: row`, `narrow: {flex-direction: column}`, each text `flex: 1`. The preset name
  stays on the group (tree icon); the children get the *Size in group* field.

Tests: JS 1,554 pass (`parentGroup`, flex values, field only in flex groups); heurist WebsiteRenderTest 32,
CmsFormatTest 10, WebsiteEditTest 62 pass. Bundles built and deployed locally. Not checked in a browser.

## 25. Element tools and style editor (Artem, 2026-11-01)

1. Base settings: `color-selected` and `color-selected-border` (`--h-color-selected`, `--h-color-selected-border`;
   `BASE_SETTINGS` in `cmsDocument.js` and `StyleCompiler::BASE`), values in every theme, a list with a selected
   item in the preview.
2. Below the part tree (`h-cms-picker`, background `--h-color-selected`): the tools of the selected element (*Own
   style*, *Caption* of a group, *Edit text*, *Configuration* of a module / widget), then on the right Copy (with
   texts) and Paste as icons. *Add element* (the + of the tree does it) and *Copy structure* are not shown (the
   structure copy stays in `CmsRecordDocument.copy`). The properties box (kind, kind default, own style, preset) is
   removed; the preset is chosen in the own style popup.
   - *Translate* is removed as a button: *Edit text* edits the translation when the language selector of the view
     bar shows another language (the original beside it); its label then has the language, e.g. "Edit text (FRE)".
3. Style editor (`styleRows`), Advanced off:
   - the buttons row centered below the list; *Advanced* when on has the `--h-color-selected` colours, *Add
     property* is a primary button. The row is below the list in Advanced too (the toggle does not jump).
   - `HInputColor` as high as the other compact inputs (`.h-cms-styles-value .h-input-color-text`).
   - *Group layout*, *Background* and *Border* have a checkbox. Checked: the properties are shown (Group layout writes
     `display: flex`, Border `border-style: solid; border-width: 1px`). Unchecked: the properties are removed and
     Group layout writes `display: block`, Border `border: none` (so a kind default or preset is overridden);
     Background only removes its properties. A section without values is shown unchecked.
   - *Background*: colour (moved from *Colours and text*, now *Text*), image (`HInputFile` of registered files,
     limited to `image/*`; the value `url(<base>?db=..&file=<obfuscated id>)`; the current image as a thumbnail with
     Remove), position, repeat, size (selectors). `background-position`, `background-repeat`, `background-size`
     added to the allowed node style properties (JS and PHP). Without an API client (tests) the image is a text value.
   - *Reset all* and *Remove all* ask "Confirm? Reset / Remove · No" next to the button (`confirmNear`, moved to
     `designerStyles.js`; inside a modal dialog it is put into the dialog).
   - The preset selector of the element is above the screen tabs in the own style popup; `openStyleForm` returns
     `{style, preset}`.

### 25.1 Inline configuration and style in the element pane (2d, to discuss)

Suggestion (not implemented): the area below the tree shows the style editor of the selected element inline
(Normal screen, Simple list; preview updated as values change, like the Styles popup), with Advanced and the screens
behind small tabs; the module configuration stays a popup (`openConfiguration` is the module's own form in
Explorer's window, large and modal) with a short summary inline. Pros: no popup for the most frequent edits, the
preview reacts at once. Cons: the west pane is narrow (about 300 px) for label + input rows: labels above the inputs
there; undo must group a series of small changes (one undo step per field change after it is left, not per key).

## 26. Text and translations: one popup (Artem, 2026-11-02)

Review item 4. One popup edits a text and all its translations, shared with the record editor (multilingual
blocktext fields): `shared/src/widgets/translation/HTextTranslationDialog.js` (+ `.css`), language controls in
`translation/translationControls.js` (for the next dialog `HTranslationDialog` of single-line fields).

- Bigger popup (`min(1280px, 96vw)`, editor area `75vh`); TinyMCE fills it (`createTinyMceEditor` option `fill`: no
  autoresize, resize and status bar) with small toolbar buttons (option `compact`, class `h-tinymce-compact`, the
  rules of the record editor). No popup scroll bar.
- Toolbar: `[ ] Fix original` + language buttons as a radio group (a selector with more than 10 languages), right
  *Show HTML* / *Show rich editor* (CodeMirror; both editors got `setValue`). One language or none: only Show HTML.
- Fix original: the left language read only (40%), the editor on the right; two selectors, the second above the
  editor; choosing in one the language of the other swaps them. *Translate ⇒* (only with DeepL, `TranslationClient`,
  `dbdefs.translator()`) puts the translation of the left text into the editor.
- Decisions (recommended, approved with the plan): the left side is the fixed source, the right side is always
  editable (manual translation works without DeepL); a language without a translation opens empty; with Show HTML
  the fixed side shows raw HTML too. Fix original and Show HTML are remembered while the designer is open.
- The popup returns the changed languages only; the designer applies them in one undo step (`setText` /
  `setTranslation`). It opens in the preview language; the picker button is *Edit text* without a language.
- Double click in the part tree (`HTree` option `onActivate`): a text opens the popup, a group its caption, a module
  its configuration. `openTextEditor` of `designerDialogs.js` removed.
- (f) Inline TinyMCE in the preview iframe: not now (TinyMCE must be loaded in the iframe's window, the site runtime
  in design mode would need it, plus syncing into the draft and undo). Later item.

Tests: `shared/test/textTranslationDialog.test.js`, HTree double click, designer double click + one undo step;
JS 1,565 pass. Not checked in a browser.

Browser check by Artem 2026-11-02: translation and popup work. Fix: turning *Fix original* on always fixes the
original (first) language on the left; when the editor showed the original it moves to the next language (it
fixed the second language before, an empty French text for an English-only text).

2026-11-02 (Artem): *Fix original* renamed **Side by side** (tooltip *Show the original read only beside the
editor*). The source language is sent to the translation service (option `originalCode` for the record editor's
value). Group captions use the shared `HTranslationDialog` (the caption in the first website language, the others
added with the selector; one language or none: the caption only); `openCaptionForm` removed.

## 27. Closed (Artem, 2026-11-02): moved to phase 4

Phase 3 is done. These items are new features or were marked "later"; they go to the phase 4 plan (§12):

- Page templates: Cover, Landing, About, Features, Team, Discover, Blog, Contact, Record page, Publications still
  create a blank page (`pending`, §19).
- Widgets still grey in *Add element*: custom report, action menu, media viewer / gallery, badges, language
  switcher, email form, story map, crosstabs (§19, §20).
- Unify menu and action menu (presentation modes, responsive), with the widget (§19).
- Inline TinyMCE in the preview iframe (§2, §26 f).
- Inline style editor below the part tree (§25.1, to discuss).
- Optional module selector in *Add page* (§4).
- Colour schemes, client page switching and cache, one-page layout, sticky header / footer (§12).

Not phase 4: conversion of v3 websites is phase 8 (plan 27). The translation popups (§26) are shared and also used by
the record editor (plan 25).

## 28. Cosmetics after DONE, set 1: own style popup (Artem, 2026-11-03)

Done 2026-11-03, not committed, not checked in a browser:

a) Help line on top of the *Own style* popup (same `h-cms-styles-help` line as the Styles tabs; shared `helpLine()`
   in `designerStyles.js`): own styles only with caution, website styles and presets preferred, own rules in
   *Custom CSS* with a class name.
b) *Custom CSS class* beside *Preset* (one line, a border below). Allowed characters `A-Za-z0-9 _-`
   (`checkCssClass`); a wrong value is marked, listed with the problems, and OK does nothing. Stored as the `class`
   attribute of the node (`CmsEditDocument.cssClass` / `setCssClass`; HTMLPurifier of `StoredText` allows `class` on
   all elements already). The preview keeps mounted module hosts and updates their classes (runtime `h-site-*`
   classes stay).
c) Screen buttons Normal / Medium / Narrow right aligned.
d) Colour inputs of the style editor: a dropdown button (shared `HInputColor` option `palette`) with the base
   colours (`var(--h-color-text)` ... and `--h-color-primary-text`, `--h-color-text-muted`); the swatch shows the
   colour of a `var(...)` value (the base setting of the website / page, else the Heurist default; the heading colour
   falls back to the text colour). In the Styles popup the palette follows the Base settings tab as edited.
e) Background image: `HInputFile` in addorbrowse mode (record manager of registered files with Upload / URL) through
   a new `browseRecords` on Explorer's website bridge; without it the old dropdown picker.

## 29. Cosmetics set 2: Styles popup (Artem, 2026-11-03)

Done 2026-11-03, not committed, not checked in a browser:

a) Popup title *General Website Styles*.
b) Base settings `color-primary-text` and `color-text-muted` (JS `BASE_SETTINGS`, PHP `StyleCompiler::BASE`, every
   theme has values); they are also in the named colours of the colour inputs (§28 d).
c) The style editors of *Layout styles* and *Presets* start in Advanced (styleRows option `advanced`, the editor's
   own choice; the own style popup keeps the session choice).
d) Preview of a preset: one text block per column (`sampleColumns`: tracks of `grid-template-columns`, also
   `repeat(n, ...)`; two for a flex box; at most six).
f) Custom CSS: without `isJavaScriptAllowed` the text "CSS and Javascript are disabled by default. Request
   authorisation from server admin if required." and the CSS is read-only (no code editor). With it the CSS is
   edited and saved in DT_CMS_CSS as before.

e) **Open, to discuss:** grid or flex in the Simple mode. Proposal: grid for columns is easier — *Columns* (number
   1-6 → `grid-template-columns: repeat(n, 1fr)`, or own widths such as `1fr 2fr`), *Gap*, and on narrow screens one
   column; no settings on the child elements. Flex stays in Advanced for rows that wrap or elements of their own
   width (*Size in group*, §24).

## 30. Columns, grid, image input, preview images (Artem, 2026-11-03)

Answers: `display: grid` / `flex` place the **direct child elements** of a group side by side (each child is one grid
cell; they go on in new rows by themselves). Long text flowing in columns would be `column-count` (not allowed now;
optional later). *Text in two columns* stacked because: the narrow rule follows the width of the preview iframe
(≤ 640 px); the screen rules of kinds and presets were written after the node styles and so beat them; a caption `h3` is
a child too.

Done 2026-11-03, not committed, not checked in a browser:
- **Style order** (JS `compileCmsStyles`, PHP `StyleCompiler::compile`): the screen rules after their level — kinds,
  presets, node styles — so an own style wins at every screen size. Fixture `common-styles.json` changed.
- **Caption over all columns** of a grid group: `section[data-h-control="group"][aria-labelledby] > h3:first-child
  { grid-column: 1 / -1 }` (site stylesheet and preview copy).
- **Grid (columns)** section of the Simple style form for groups and presets, before *Group layout (flex)* (kept for
  now): checkbox on = `display: grid`, 2 equal columns, gap 12px; *Columns* 1-6 equal (`repeat(n, minmax(0, 1fr))`) or
  *Own widths* (checked: lengths, `fr`, auto, `minmax()`, `repeat()`), gap, row alignment. Grid and flex exclude each
  other (section `key`); on the Medium / Narrow tabs a layout of the Normal tab is shown as on (checkbox disabled) so
  *Columns 1* can be set there.
- **Background image** = HInputFile only (its thumbnail with zoom, clear); the own thumbnail + Remove went. The file of
  the value is read by the new `GET /files/{key}` (plan 20 §10.14); `fileOfRecord()` exported from HInputFile.
- **Styles preview**: background images from the Heurist base URL are kept (`previewDocument(state, body, baseUrl)`);
  iframe `sandbox="allow-same-origin"` (no scripts) so images that need the login load too.
- Not done (optional, to agree): `column-count` / `column-gap` for text in columns.

## 31. Image input click, preview width, columns as grid (Artem, 2026-11-03)

Done 2026-11-03, not committed, not checked in a browser:
- The image row of the style form is a `div`, not a `label`: a click inside a label activated its first button (the
  file browse button), so a click on the thumbnail opened the file manager too.
- Styles popup preview: a page of 660 px (wider than the narrow screen), scaled down to the preview column
  (`PREVIEW_WIDTH`, ResizeObserver), so two and three columns are shown side by side.
- *Text in two / three columns* (and the page presets with them): own style `display: grid`,
  `grid-template-columns: repeat(n, minmax(0, 1fr))`, gap 12px, narrow `1fr`; no styles on the texts (was flex).
  Elements added before keep their flex styles.
- Record manager of files: created for each Browse and destroyed on close (as for all pointer fields); not changed.

## 32. Preview overflow, trees (Artem, 2026-11-03)

Done 2026-11-03, not committed, not checked in a browser:
- Styles popup preview not scaled (replaces §31): the iframe is at least 660 px wide, its box scrolls horizontally in a
  narrower column. `.h-cms-styles-layout` height `min(680px, 75vh)` (no overflow of the dialog body).
- Site tree: all labels bold (HTree item option `bold`, class `h-tree-bold`); Footer icon `fa-f`.
- Part tree: the root in bold with the icon of the Site tree (`PART_ICONS`: header, home, footer, page; standalone
  pages and website pages `fa-file-lines`).

## 33. Media element `data-h-media` (Artem, 2026-11-03)

Agreed 2026-11-03 (settings in a configuration map, like instances). Implemented 2026-11-03 in both repos, not
committed, not checked in a browser.

**Format.** `<figure data-h-node="n5" data-h-media="m1" data-h-text="">…</figure>`; configuration
`media.m1 = {file: KEY, width: 'auto'|px|%, height, player: bool}` (the map is left out when empty). The figure is a
text block: its whole inner HTML is made in the designer, for each language of the website (`translations[lang][n5]`:
the caption and the link labels of that language), so the translation code of server and client did not change.
Checks (JS `checkCmsDocument` / `cmsMediaProblem`, PHP `CmsValidator::check` / `mediaProblem`, fixture
`media.json`): `duplicate_media`, `media_without_config`, `media_without_element`, `media_settings`. Kind default
`media` = `[data-h-media]`; the text kind is `[data-h-text]:not([data-h-media])` (JS and PHP). HTML purifier
(`StoredText`): `data-h-media`; `loading` on img / iframe, `allow` on iframe (`autoplay; fullscreen` or
`fullscreen` only).

**HTML** (`shared/src/site/cmsMedia.js`): types image, video, audio, service (YouTube, Vimeo, SoundCloud), iiif, 3d /
3dhop (legacy `detect3D_byExt`), pdf; other files are refused. Thumbnail mode: both sizes under 200 px, or one under
200 px and the other auto — the thumbnail for every type. Else: image in its size, video / audio players, the service
player; iiif, 3D, PDF their thumbnail. *Show full view or player on click*: image → OSD, iiif → Mirador, 3D → 3D viewer,
PDF → the file in a new tab (the browser's viewer); a link around the image and the link after the caption. Audio,
video, services: only in thumbnail mode — `details` / `summary` (no script): a click on the thumbnail shows the player
(`preload="none"`, service iframe `loading="lazy"` + `autoplay=1`: it is loaded only when shown; a native player needs
a second click on Play). Link labels in English and French (the language of the website), else English. The HTML is
written as HTMLPurifier stores it (`rel="noreferrer noopener"`, `controls=""`), so a saved page equals the made one.

**Designer.** *Add element* → Media (opens Edit media at once); tree icon `fa-photo-film`; Edit media (tree pen,
bar button, double click). Popup `openMediaForm`: Source = HInputFile (record manager of files), the file read by
`GET /files/{key}` (`_mediaFile`: name, file type, source, URL, guests may see it), a warning for files that need a
login; Caption + Translations popup (more than one language); width × height (empty = auto, a number = px, or %); the
checkbox. Copy / paste keep the file and settings (also *Copy structure*: static content).

**Site stylesheet.** `figure[data-h-media]` without margin, media `max-width: 100%`, the play mark over the thumbnail,
`details.h-site-media-play` not styled as an accordion.

## 34. Custom CSS only with the JavaScript permission (Artem, 2026-11-03)

Stricter rule (27a decision 12 changed): without `isJavaScriptAllowed` DT_CMS_CSS and DT_CMS_SCRIPT are cleared on
save (`StoredText::clean`, also the CSS field of other record types) and `PageRenderer` writes no custom CSS. With it:
CSS and script are kept as they are, only in website / page records. Designer without the permission: the Custom CSS
tab shows the warning only (no editor), the CSS is not sent on save (stored values stay, unused) and not in the
previews; the own style popup has no *Custom CSS class* (a class needs custom CSS). The v4 style settings (base,
kinds, presets, own styles: configuration 2-1187) are not affected. Legacy code not changed (`recordModify.php` still
stores CSS, the legacy viewer and reports still use it). Tests: `tests/StoredTextTest.php`, designer tests.
