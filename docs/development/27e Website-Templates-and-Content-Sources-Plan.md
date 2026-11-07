# 27e Website templates and content sources (plan 27, Phase 4a)

**Status:** draft 2, agreed 2026-11-04 (Artem), not implemented. Draft 1 was too complex; §3-14 replace it, §1-2 stay as
history (the four ways of Edit text in §2 are replaced by §3). Next: an implementation plan with phases, then code. Phase 4b
(other helper widgets) is a separate document.

Scope of Phase 4a: templates of one page, header or footer (first: Team), field values in text elements, and three
widgets: Custom report, Record cards, Media gallery. Phase 4 leftovers of 27c (§27) stay in the general phase 4 list.

## 1. Background

- **URLs** (prenote, Artem): `/{database}/site/{siteId}/{pageId}` (an integer page id, e.g. `/site/92/569`) is the
  **dynamic** page, rendered by the server on each request (`PageRenderer`); `/{database}/site/{siteId}/{pagename}`
  (e.g. `/site/92/page-name.html`) is the **generated** (static) page from the build folder (`WebsiteBuilder`, job
  `website-build`). Generated pages are static HTML, except the Heurist modules on them (they load in the browser).
- **History.** Earlier the idea was to store everything in the website record: RT_CMS_HOME has many fields (logo,
  alt logo, title, alt title, alt url, menu behaviour, banner image, menu location). This is the wrong approach: it is
  not possible to define and predict everything in the record. Templates and content sources replace it.
- **What exists** (27a–27d, 27c §33): text blocks `data-h-text` (Edit text, TinyMCE, translations by node id), media
  `figure[data-h-media]` with settings in configuration `media` and HTML made by the designer (`cmsMedia.js`), the
  srv Smarty engine (`srv/Reports/Smarty`), report records (Custom Report 2-1104, Report Schedule 2-1105, plan 12),
  background jobs (`srv/Jobs`), the record manager (browse records), `GET /files/{key}`.

## 2. Artem's proposal: three levels of content

**Static**
1. The user writes `data-h-text` by hand (Edit text).

**Semi-static**
2. A generated Smarty report is loaded into `data-h-text`: the dynamic page loads the generated report each time;
   the generated page includes it when the page is generated.
3. A recordCard report (a report of one record) and a record id: the result fills `data-h-text`.
4. A record and a field: the value goes into `data-h-text` or `data-h-media`. Written as `10002.2-1` = the value of
   record 10002, field 2-1 (name).

Edit text offers four ways: 1) text entry (TinyMCE), 2) generated report (browse for the report), 3) browse for a
record and select the field, 4) browse for a record and a recordCard template.

**Dynamic** — a note for the user: "The content in this mode will not be indexed by crawlers and searchable."
5. The Data module in the extended view with a Smarty renderer gives any content for the page.
6. A helper widget that runs any Smarty report for a predefined or dynamic filter, limited by number of records and
   execution time (estimated in the designer; above a threshold it can not be used). The most lossy way; probably not
   allowed at all.

**Use cases**
- *Team page* (a) a template where a team member card is four `data-h-text` elements (image, title, role,
  description), filled by hand (1) or by record + field (4); (b) a template where each card is a pre-designed
  recordCard template, the user selects the record of each card (3); (c) the user already has a report "Our team
  members" and selects the generated report (2).
- *Website header*: a template that refers to the current website record: `website.2-1` (title), `website.2-4`
  (description).

## 3. Model

The content of a page comes from three sources only.

1. **Static text:** `data-h-text` as today.
2. **One field of one record:** into `data-h-text`.
3. **Semi-static widgets:** Custom report, Record cards, Media gallery (the three widgets in *Add element*).

Removed from draft 1: *From the database* in Edit text, card + one record as a text source, template packages, `sources`
map, automatic check of template fields, "changed since last build".

## 4. Field value in `data-h-text`

Format: one attribute, the field is a concept code; the element's content is the snapshot (last resolved value).

```html
<div data-h-node="n7" data-h-text="" data-h-field="207439.2-1">last resolved value</div>
<div data-h-node="n8" data-h-text="" data-h-field="website.2-1">Site title</div>
```

Form (HEditForm, from the text element):
- **Source:** this website / this page / a record. A record: HInputResource, unconstrained HRecordManager, single.
- **Field:** plain list (not HFieldTree) from `dbdefs.fields(type)`: date, numeric, freetext, blocktext, term. No linked
  records.

Values (draft 1 §5b stays): the language of the page if the value has one, else all values joined; a term gives its
label; a date is formatted; blocktext is the stored HTML; freetext is escaped. Resolved by the server: per request on a
dynamic page, at build on a generated page. The designer uses `GET /records/{id}/{field}`.

## 5. Widgets: format

Hosts are `data-h-instance` with `kind: 'widget'`; settings are in the configuration (JSON).

```json
{"type": "report", "files": {"eng": "Team.html", "fre": "Team_fre.html"}}
{"type": "report", "files": {"def": "Team.html"}}

{"type": "cards", "mode": "manual", "query": [{"ids": "3,1,2"}, {"sortby": "set"}], "template": 207884,
 "presentation": "list", "action": "none"}

{"type": "gallery", "mode": "media", "ids": [12, 14], "caption": true, "width": 300, "height": "auto",
 "presentation": "slider", "action": "viewer", "slider": {"duration": 4000, "fade": 500, "navigation": true},
 "html": {"eng": "...", "fre": "..."}}
```

Widgets have no snapshot: they are resolved each time.

## 6. Custom report

- The designer of a report makes `Team_eng.tpl`, `Team_fre.tpl` and one schedule per language. Report Schedule 2-1105 gets
  DT_LANGUAGE 2-967 (one value); the job renders with it.
- Form like the multilingual Caption: language badge, selector of generated html (no personal `_u` outputs), Clear; Add
  language (selector).
- The page takes the value of its language, else `def`. The file name must be a name inside `generated-reports`.
- If the file is a complete document, only the content of `<body>` is used.

## 7. Record cards

Form:
- Type: (x) manual () query. Manual: Source records, unconstrained HRecordManager, multiple. Query: input with
  FilterBuilder; a query with parameters is refused. Hint: *The limit is 50 records.*
- Smarty template: HInputResource constrained to Custom Report 2-1104, with `browseFilter` = card flag 2-1182.
- Presentation: (x) List () Slider. Action: None / Open rec_URL in new window / Custom (later, with PageController).
- Slider: Duration, Fade out, Navigation (start/stop and `<< < > >>`).

Static text in a card template: handled inside the template with `$heurist->getSysInfo('lang')` (no template per language).

## 8. Media gallery

Form: Type (x) media records () files. Media: HRecordManager of 2-5 RT_MEDIA_RECORD, multiple (first file; caption =
record title). Files: HRecordManager of files, multiple. Show caption; image / thumbnail dimensions; presentation; action
None / Player, Viewer / Custom (later); slider parameters as §7.

The HTML is built in the designer with `buildCmsMedia`, stored per language. A changed caption appears after the
designer saves again.

## 9. Workflow of the generator

Server side, classes and methods, no HTTP. Dynamic page and build use the same code.

1. Run the query with guest rights; hard limit 50.
2. For each record render the card through the report classes, with the language of the page (option of the renderer).
3. Put the cards into the host.
4. Slider, action, menu: options go into the `h-site-config` JSON. No executable code in the page.
5. `siteRuntime.js` starts HSlider and HMenu over the elements that exist on the page.
6. No slider and no action: nothing to start; the cards follow the CSS of the parent.

## 10. Site widgets

- HSlider (`shared/src/widgets/site/`): works on a set of HTML elements: slider, navigation, actions. It knows nothing
  about the Heurist API, definitions or Explorer.
- Cards in List mode: the host gets `display: contents`, so each card is a direct item of the parent grid or flex group.
  Otherwise the whole host is one cell and the parent's `grid-template` does not reach the cards. To check in a browser.

## 11. Designer

- One record manager per kind for the life of the designer: bridge `createRecordBrowser`, kept in a map in CmsDesigner,
  destroyed with it, given to HEditForm through its existing option.
- Bridge `editQuery` for FilterBuilder.
- Preview of cards: `/records` + `/reports/{id}/render` for the first 6 cards, slider not started (may be relaxed later).
- Add element: Custom report and Media gallery are no longer grey; Record cards is new.

## 12. Templates

A template is one page, one header or one footer. Whole-site templates are not in 4a. The first template is *Team*: a
page with a cards widget using the Smarty report *Team member*.

## 13. Server work

| Item | Change |
|---|---|
| `GET /records/{id}/{field}` | Records only. Field id or concept code; same envelope as `?fields=N`; unknown field = 404. Plan 28 §9.4 set to agreed. |
| Report language | Option of `ReportRendererInterface`, passed to `TemplateApi` (HTTP `lang` keeps working). |
| Schedule language | DT_LANGUAGE on 2-1105 (Artem adds it in reference db 2); planner, cron. |
| PageRenderer | `data-h-field`, three widgets, time limit by the hard limit of 50. |
| CmsValidator / CMS check | Attribute, widget settings, file name; JS + PHP + fixture. Missing record reported. |

## 14. Decisions (Artem, 2026-11-04)

Answers of Artem to the review questions: same envelope, records only; card templates handle language themselves; `website.` / `page.` kept;
snapshot for fields only; gallery built on the client; configuration in JSON, start from `siteRuntime`; generator
uses classes, no HTTP; 50 is a hard limit; preview first 6 cards; media record = first file, title as caption; no
personal outputs in the selector; terms allowed; one template per page / header / footer.

Later the same day:

1. **Non-public report.** The generator uses the template file directly and does not check the report record (the
   website's author chose it). Records still follow guest rights. The website check warns only for a missing template.
2. **HMenu.** The server writes `<nav><ul><li><a href>`, for crawlers and visitors without JS. HMenu activates the list as
   HSlider does; JSON holds only the options.
3. **Bundle.** The same `heurist-website` bundle, no separate one. The entry keeps HMenu; HSlider, HPageControl and other
   helpers go into lazy chunks, loaded only when the page has them, as modules are today.
4. **Report of a page template.** The template names the `.tpl` file (`template: "Team_member.tpl"`; render already
   accepts a file name), because record ids differ per database. On insert the designer finds the report by file name, or
   creates it with the existing report API from a template file shipped with Heurist; the user then picks the records.
   `template` in the configuration is therefore a report id or a file name.
5. **First template: Team.** Others later.

The plan has no open questions. Next step: an implementation plan with phases, then code.

## 15. Facts checked in the code (2026-11-04)

| Topic | Result |
|---|---|
| `GET /records/{id}/{field}` | **Not implemented.** Plan 28 §3, §9.4 (status: proposal). `/records/151/1` gives 200 with the whole record: `hserv/controller/api.php:1094` ignores the extra segment. |
| Concept codes in `fields=` | `?fields=1` works, `?fields=2-1` gives 400 (`RecordFieldSelector`). |
| `lang` in report render | **Works over HTTP** (Artem's test; correction of the first version). `TemplateApi::language()` reads `$_REQUEST['lang']`. A PHP call from the generator or a schedule job has no such request value, so the language must be passed as an option to the renderer. |
| Report visibility | `render` with a report id goes through `ReportService::resolve`, which applies the visitor's access. A guest got 404 for 207884, and `GET /reports?scope=card` gave an empty list. A non-public report would fail in a guest build. |
| Language of a schedule | Does not exist. Use DT_LANGUAGE 2-967 (Artem), the field of RT_CMS_HOME. |
| Designer list of outputs | `GET /reports/generated[?prefix=]`; personal outputs end in `_u<user id>`. |
| Card flag | 2-1182 `DT_IS_CARD_VIEW`, filter in the Reports module. |
| Pointer browse filter | HInputResource `browseFilter` adds conditions to the manager's query; the built-in filter form is then replaced by the list's search. |
| Manual order of `ids` | `[{"ids":"152,151"},{"sortby":"set"}]` keeps the picked order (tested); without `sortby` it does not. |
| Kept record managers | `RecordEditorHost.createRecordBrowser` exists; the designer bridge has only `browseRecords` (`CmsDesigner.js:1068`). |
| FilterBuilder | Explorer has `editQuery`; the designer bridge does not. |
| Parameter check | `hasQueryParameters()` in `shared/src/data/queryParameters.js`. |
| Field list | `HDbDefs.fields(rtyId)`; `fieldGlobal(id).concept`. |
| Media HTML | `buildCmsMedia` runs in the designer (`shared/src/site/cmsMedia.js`). |
| Slider | None exists. New code. |
| Page start | `h-site-config` JSON + `heurist-website.js` (21 KB entry; modules are lazy chunks), `siteRuntime.js`. |
| Generated report file | May be a complete document (`OutputSanitizer`). |

## 16. Phases (Artem, 2026-11-04)

DT_LANGUAGE 2-967 was added to Report Schedule 2-1105 (Artem, 2026-11-04).

1. **Server basics:** `GET /records/{id}/{field}`, language option of the report renderer, schedule language.
2. **Field values:** `data-h-field` on the server and in the designer (form, snapshot, kept record managers).
3. **Widgets:** Custom report, then Record cards, then Media gallery.
4. **HSlider and HMenu:** both work over elements written by the server.
5. **Templates:** page *Team* and a basic website header: `website.2-38` (logo), `website.2-1` (title), HMenu.

The logo is a file field, so a file field is also allowed for `website.` / `page.` and a record in a media element: see the
implementation notes below.

## 17. Implementation notes

Phases 1-5 implemented 2026-11-04 (both repos), not committed, **not checked in a browser**.

- Server: `RecordQueryController::outputField`, renderer option `language` (`TemplateApi::setLanguage`), `srv/Website/PageContent`
  (fields, widgets), `CmsHtml::fill`, the menu HTML in `PageRenderer`, `smartyRunner($rights)` (guest rights in a build).
  `settings` of the three widgets go into `h-site-config` without the query and HTML: only presentation, action, slider.
  The JSON has the menu tree only in the designer (`design=1`), whose draft replaces the page.
- Schedule: the form has *Language* (terms of DT_LANGUAGE), `languageTerm` + `language` (code) in the schedule output.
- Client: `apps/website/src/designer/widgetForms.js`, `apps/website/src/siteWidgets.js` (lazy HSlider; preview of the first
  6 cards), `shared/src/widgets/site/HSlider`, `doc.field` / `doc.setField`, elements `report`, `cards`, `gallery`,
  `siteHeader`; bridge `createRecordBrowser`, `editQuery`.
- **Differences from the plan:**
  - A file field is allowed in `data-h-field` and gives `<img>` (needed for the logo `website.2-38`).
  - Field form has *Typed text* as a source: it removes the link to the field. The field element keeps its last value as text.
  - Basic header: new websites get it from `WebsiteStarter`; for an existing website *Add element* → *Website header*.
  - In the designer a list host stays a box (`display: block`), so it can be selected: the parent's grid shows only on the page.
  - Language in a card template is `$heurist->getSysInfo('lang')`.
  - The report selector and Team report are created with the user's rights: *Team member* is made on Add page if the file is missing.
- Tests: heurist `tests/WebsiteContentTest.php` (27), `WebsiteRenderTest`, `CmsFormatTest`; JS `shared/test/cmsContent.test.js`,
  `apps/website/test/widgetForms.test.js`. `tests/RecordQueryControllerTest.php` is an old script with broken paths, not related.
- To do: new texts in `localization_eng.txt` / `_fre.txt`; browser check of all forms.

## 18. HSlider review (Artem, 2026-11-05)

Implemented, not committed, **not checked in a browser**. A gallery must be opened in its configuration and saved once: its
HTML is stored, so the old HTML has no view data and no `figure`.

1. Font Awesome (fontawesome, solid, regular) is imported in `apps/website/src/main.js`, as in the other apps.
2. *Position of image* in the gallery form (slider only), the six options of the legacy `slideshowStretch`: `slider.fit`, attribute
   `data-h-fit` on the host, `object-fit` in `HSlider.css`. Only the gallery; a card is free HTML. `contain`, `cover`, `fill`
   and `none` need a height of the host, otherwise the cell has the height of the highest slide.
3. Action Player / Viewer: `buildCmsGalleryItem` writes `<figure class="h-site-card" data-h-media data-h-view data-h-full>` (the
   gallery items were `div` before, so the media CSS did not apply) and the view mode of `buildCmsMedia`: thumbnail or image, no
   player, no link around the media. `HSlider.openView`: image, video, audio, service over the page, centered, background
   0.7 opaque; closed by the button, a click outside or Esc. IIIF, 3D and PDF open in a new window (decided: PDF is not shown
   inline, phones can not show it in an object). Marks: play mark, IIIF logo (`iiif_logo.png`, copy of the legacy
   asset), text marks 3D and PDF. It also works in List presentation: `needsSlider` is true for the action `viewer`.
4. While the slider rotates (class `h-slider-running`): no link in the caption, no play mark, a click does nothing.
   Stop or any navigation button makes it work. Without navigation a slider with more than one slide can not be stopped, so
   its viewer can not be opened.
5. Designer: `mountSiteWidget` starts HSlider with `design: true`: no rotation, no start / stop button, no actions, `<< < > >>` work.
   `CmsPreview` keeps the `h-slider` classes of a kept host.
6. `PageContent` adds `h-slider-pending` to a slider host: in `style.css` (not the lazy `HSlider.css`) all elements except the first
   are `display: none` until HSlider starts. The first one stays so that the page does not jump from empty.

## 19. Gallery form and HSlider, review round 2 (Artem, 2026-11-05)

Implemented, not committed, not checked in a browser. Saved galleries must be opened and saved once again.

Form (HEditForm through `openEditFormDialog`):
- Titles of Sources: `HInputResource` takes the API path from the domain of its target types (`recordTypesDomain`), so file ids go to
  `/files`, not `/records`. This is a general fix for pointers to system record types.
- Presentation comes after Action (both forms, cards and gallery).
- *Limit values per field*: `valueLimit` (`runtime.recordLimits`, now also given to the Website manager and designer). Values picked
  in the record manager past the limit wait behind "Show all values" too (`HEditField._addValues`).
- Audio: an `.mp3` can be registered with the file type `mp2`. `cmsMediaType` checks the file type, then the extension of the name.

HSlider:
- The viewer did not open because the server removed `data-h-view` and `data-h-full`: `StoredText` purifies every string of the
  configuration. Both are now allowed on `figure`: a closed list for the view, a checked URL for `data-h-full`. HSlider opens only the
  player URLs the server allows in an iframe (`SAFE_PLAYER`).
- Sizes, replaces the sizing of §18 point 2. A size of the media (attributes `width`, `height`) is used as it is, the position
  works inside this box, the host fits it. Without a size the media fills the host, and the files never give the size: the height of
  the host is its own CSS, or a default of 400 px (`:where`, any CSS of the page wins).
- A gallery item is centered with its caption.

## 20. One media form, one viewer, review round 3 (Artem, 2026-11-05)

Implemented, not committed, not checked in a browser. Answer to the question of Artem: yes, it is worth uniting the two forms.

Decided: *Player size* is removed. Single mode keeps a typed caption with translations. 190 px is the first size of a new gallery only (a
saved `auto` stays). A slider with Navigation off stays as it is: its viewer can not be opened.

- **One form.** `openMediaForm({ single })` in `widgetForms.js` (HEditForm), `openGalleryForm` and the old `openMediaForm` of `designerDialogs.js`
  are gone. Single: one source, Caption with Translate, no presentation. Sources use `addorbrowse`; the bridge has `addRecord`, so the
  record manager offers Upload / Tile stack / URL and Add inside the designer (not for Record cards, not asked).
- **File check.** The form stays open and names a file that can not be media (a gallery dropped it silently before), both modes;
  `CmsDesigner._mediaItems` replaces `_galleryFiles` and `_galleryMedia`.
- **Settings of a single element:** `{file, width, height, action, mode, record}`. `player: true` of an old element reads as `action: viewer`
  (`cmsMediaAction`); `playerWidth` and `playerHeight` are not written, the validators still accept them.
- **One generator.** `buildCmsMedia`: without the action, inline players or the thumbnail; `view`: thumbnail or image, viewer link in the caption.
  No `details`, no link around the media. `setMedia({view})` writes `data-h-view` and `data-h-full` on the node of a single element, a gallery item
  has them on its figure. Old pages keep their `details` HTML until edited, so its CSS stays in `style.css`.
- **One script.** `shared/src/widgets/site/HMediaViewer.js`: `attachMediaViews(root)` is one delegated click and Enter listener, loaded lazily by
  `startSite` when the page has `[data-h-view]` (not in the designer). It serves any number of elements, also inside tabs; other kinds of action come
  here later. HSlider only keeps `h-slider-running`, which blocks the viewer. A list gallery no longer loads HSlider. Marks are in `style.css`, so they
  show at once and in the designer.

## 21. Review round 4 (Artem, 2026-11-05)

Implemented, not committed, not checked in a browser.

- **Caption of a single media element** is the multilingual freetext field of HEditForm (`multilang`, the language button and the translation
  popup of HEditField), only with two or more website languages. The custom Translate button of §20 is removed. `captionValue` and
  `readCaption` convert to and from the value of the field.
- **Lost translations.** `CmsRecordDocument.serialize` gave its translation blocks by reference, so the saved state of the designer
  changed together with the document: a changed translation of a language that already had one was not seen as a change and was not
  in the PATCH. It was found on page 207922 (FRE kept 600 × 400 through five saves). This existed since 27c, for all translated texts, not only
  media. `serialize` now gives a copy. Stored stale translations are corrected only when they are edited and saved again.
- **Navigation in the viewer** (agreed 2026-11-05): `HMediaViewer`, gallery only (`.h-site-gallery`), when two or more of its elements open
  over the page. `<`, `>` and the arrow keys; IIIF, 3D and PDF are skipped; it wraps around; no counter. Going to another view stops the player of the
  last one. A slider is not moved by the viewer: after closing it stays on the slide that was opened.

## 22. Record field element (Artem, 2026-11-05)

Implemented, not committed, not checked in a browser.

Decided: the name is *Record field*. A visitor who may not see the record gets an empty element. Cancel of the popup of a new element leaves no element.

- **Why the source was forgotten:** `StoredText` removed `data-h-field` on save, so the element became plain text with the snapshot. This also made the value
  visible to guests. Now it is allowed, a checked reference. Elements saved before stay Text: they must be added again.
- **Element.** *Add element* has *Record field* next to Text, the same format as before (`data-h-text` + `data-h-field`), so the sources are not mixed: Text has no Field button,
  *Typed text* is no more a source. `fa-database` in the tree, the pen in front of remove, *Edit field* in the toolbar.
- **Popup** (`openFieldForm`): Source (A record, This website, This page), record, field, then a second HEditForm with this field only: structure of `RecordStructureProvider`,
  translation rows shown at once. Save makes a PATCH of this field if it changed, then the snapshot. The bridge gives `recordFieldServices`.
- **Not offered:** the fields of website and page records that hold the page (content, header, footer, configuration, translations, CSS, script), which could overwrite the page.
- A record open in the designer keeps its `rec_Modified` after this PATCH.
- **Private values:** `PageContent::field` gives '' for a record the visitor may not see; a bad reference still keeps the snapshot. No warning for `pending`: guests see it.
- **Paste** on the copied element or inside it: after it, as a sibling.

## 23. Record field in the preview language (Artem, 2026-11-05)

Implemented, not committed, not checked in a browser.

The page was right, the designer preview showed one language. A change of language reloads the preview and the server writes the value in that language, then the draft replaced
it with the snapshot. `CmsPreview` now keeps the values of the server (`readFieldValues`) and puts them over the draft (`restoreFieldValues`), so the rule of the language is only in
`PageContent`, also for term labels. No format change, no request. A field the server does not know yet shows its snapshot: a save loads the preview again
(`unknownField`); Edit field loads it at once, because the value may have changed.

## 24. Generated Report (Artem, 2026-11-05)

Implemented, not committed, not checked in a browser.

- The widget Custom report is now **Generated Report**, in *Content and layout* after Record field, `fa-file` in the tree. The value `report` stays, stored pages do not change.
- **Why the selectors were empty:** the form filtered out `_u<id>` files, and the database had only these, the output of the Generate button. They are offered now, labelled *not scheduled*: a schedule does not update them.
- **Form:** help text, Report selector with the number of files, rows as in the translation form (`HInputEnum` with `langCode`, the badge moved to `HInput`), *Add a language* below. A report without files: "You have to generate report output first". Settings `{report, files}`.
- **Decided:** the designer does not open the Report editor or generate reports. A note with a link to Heurist in a new window and a Refresh button covers it.
- **Files of a report:** `ReportService::assignGenerated`: the schedule with this output, else the report with the longest name followed by a space, `_` or `.`; a plain prefix gave `Single` also the files of
  `Single22` and `Single _copy`. `GET /reports` has `generatedCount`, `GET /reports/generated?report=` the files; no new endpoint. The report list shows a second badge, the Generate dropdown uses the same rule.
  Test `tests/ReportGeneratedFilesTest.php`.

## 25. File fields in Record field (Artem, 2026-11-05)

Discussed: a Media type *Any record* (a record and its file field) and no file fields in Record field, because a file there is a raw image without size, viewer or caption. Decided against it as too complex: the
logo of the website header depends on it (`website.2-38`). File fields stay in Record field. Only the tree label changed: `image: website.2-38`, `empty: website.2-38`, `(image)` for a text with only an image, not "(empty text)".

## 26. Media from any record (Artem, 2026-11-05)

Implemented, not committed, not checked in a browser. This changes the decision of §25 in part: the Media form gets the Type *Any record*. File fields stay in Record field and the logo of the website header is not changed.

- Type: Media records, Files, Any record. For Any record: the record selector (any record type) and *Field* with the file fields of the record types of the chosen records (`fileFieldTerms`); one such field is chosen at once.
- No one-field editor. A new file is added with the Type Files, in the record manager.
- Edit media: the first file of the field. Media gallery: all values of the field in a row, for each chosen record in the chosen order (`CmsDesigner._mediaItems`). The caption is the title of the record.
- Settings: `mode: 'record'`, `record` or `ids`, `field` (concept code), `file` as before. The HTML is made once, as for media records: a file changed in the record later appears after the element is opened and saved again.

## 27. Tree label of a media element (Artem, 2026-11-05)

The label is the caption without the link to the viewer: `media: My Image`, not "My Image Open in OSD viewer". Without a caption: `media`.

## 28. Generated Report, review (Artem, 2026-11-07)

Implemented, not committed, **not checked in a browser**, bundles not deployed. This replaces the decision of §24 "the designer does not open the Report editor or generate
reports". Decided: the real Generated Reports dialog with Bolt and Edit, no Delete; a warning (not a refusal) for a report that guests can not open.

- **Fallback language.** The output of a page: the page language, else `def`, else the default language of the website, else the first one, as for texts
  (`PageContent::reportOutput`, JS `reportOutput` in `siteWidgets.js`). A report for English only is shown on a French page.
- **Preview in the designer.** The file of the output (`/output/{id}/asset`), the content of `<body>`, always cut at 100 KB (`REPORT_CUT`) so a big report does not slow
  the designer; Show link only shows the link.
- **Form.** One tip. The panel of the Generated Reports dialog (`createOutputsPanel` in `apps/reports/src/ui/OutputsDialog.js`; `openOutputsDialog` wraps it) comes
  through Explorer's bridge `createReportOutputsPanel` (lazy import of `apps/reports/src/direct.js`, the bridge of the Report tool). Option `pick`: a checkbox on each row
  (only a generated HTML file), one output per language; with two or more website languages a chosen row has a language select (*All languages* = `def`, or a language
  of the website); card reports are left out. New Report and Bolt generate in the panel (job monitor) and a new output is chosen. Below: `( ) Full report ( ) Cut, with
  "Show more" ( ) Show link only`. The language rows, *Open Heurist in a new window* and Refresh are gone.
- **Settings** `{report, files, display}`; `display` = `full` (default, also for stored elements), `cut`, `link`.
- **Cut and link.** `cut`: a report over 100 KB is cut after the last closing tag before the limit, open elements closed (`CmsHtml::cut`), then
  `<a class="h-site-report-more">Show more</a>`; a click loads the whole file into the element, or opens it when it can not be loaded. `link`: only `<a class="h-site-report-link">`,
  the file is not read. The server writes English texts (the link works without JS), `siteWidgets.js` translates them. Scripts of the full report do not run after Show more.
- **Guests.** Both links go to `/output/{id}/asset`, which follows the visibility of the output record; outputs made by Generate are hidden. `queryOutputs` now returns
  `visibility`, and the form warns: *Visitors who are not logged in can not open this report: make it public.* Full report is not affected.
- Tests: heurist `tests/WebsiteContentTest.php` (fallback, link, cut, UTF-8), `apps/website/test/widgetForms.test.js`.

## 29. Record cards and Media gallery, review (Artem, 2026-11-07)

Implemented, not committed, **not checked in a browser**, bundles not deployed.

- **Cards in a stack.** On the page the HTML is right (page 207929: the host has `h-site-widget-list` = `display: contents`, the group is a grid). In the designer
  a draft host had no class and `.h-site-design .h-site-widget-list` was `display: block`. Now `fillPreview` gives a list host the classes of the server, and in
  the designer the host takes the layout of its parent (`display`, `grid-template-columns`, `gap`, flex values: `inherit`) and spans it (`grid-column: 1 / -1`,
  `flex: 1 1 100%`), so it is still one box to select.
- **Query** of Record cards: the special field of the record editor (as DT_QUERY_STRING of a Query Source): the query in words, the icon `fa-sliders` opens the
  Filter Builder without parameters (`editQuery(..., {allowParameters: false})`). The own button and the limit note are gone. The website bridge got `describeQuery`.
- **Smarty template:** an enum (HValuePicker) of the reports marked "Single record (card)" (`cardTemplates`, `GET /report`). A stored file name selects its report;
  without one it stays as a term. Saved: report id, or the file name as before.
- **Help** above the form, the same text in *Add element*: "A card for each record, made by a Smarty template: records picked by hand or a query, at most 50. Shown as
  a list, a carousel or a slideshow."
- **Presentation** List, Carousel, Slideshow (cards and gallery). `carousel` (new value): one visible, `< >` always, no rotation, no start / stop, no Duration /
  Fade out / Navigation fields; *Position of image* also for it. `slider` stays the slideshow. Server: carousel is a box with `h-slider-pending` as a slider.
- **`<<` and `>>`** only with 6 or more slides (`NAV_ENDS_MIN`), both presentations.
- Tests: heurist `tests/WebsiteContentTest.php` (carousel class), `shared/test/cmsContent.test.js` (carousel, buttons), `apps/website/test/widgetForms.test.js`.

## 30. Visibility of generated reports (Artem, 2026-11-07)

Implemented, not committed, not checked in a browser.

- **Eye icons** (`shared/src/widgets/record-list/recordAdminInfo.js`, new `visibilityIconHtml`): hidden = red `fa-eye-slash`, viewable (logged-in users) = grey,
  public and pending = green. Fixes HRecordList too: the map had the key `visible`, the stored value is `viewable`, so such records showed the public icon, and public
  was grey.
- **Generated reports table** (also the panel of the designer): first column with this icon, from `visibility` of the output (§28).
- **Warning** in the form of Generated Report for any display (also Full report): *Visitors who are not logged in will not see this report: make it public.*
- **Full report on the page:** decided to check it. The file is made with the rights of its owner and may hold data guests may not see, so `PageContent::report`
  shows only an output record the visitor may see (`WebsiteRepository::record`), the same rule as its link. A generated (static) page is built with guest rights, so
  it shows only public outputs. Test: `tests/WebsiteContentTest.php` (hidden output not shown).
