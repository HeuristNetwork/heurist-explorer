# Text editing: translations, DeepL, rich editors, viewer HTML — development plan

**Current state 2026-10-24:** implemented (both repos), not committed. 1396 client tests pass; heurist
`StoredTextTest` (62), `DefinitionSnapshotTest`, `RecordEditApiTest`, `DataAccessBoundaryTest` pass. The editors
and the viewer sanitizer were checked in a headless Edge harness; not yet checked in Explorer by Artem.

Plans 14a (HEditForm), 18 (edit form cosmetics) and the stored text policy
(`Stored-text-security-policy.md`) are the base.

## 1. Request (Artem, 2026-10-24)

1. HInputText: a translated value is another editable value; the language code is shown before the input /
   textarea.
2. Translation with DeepL, ported from legacy (client only; the legacy server translator is used): on a new
   translation a popup *Insert translated value* with a language selector and help text; buttons *Translate*
   (when DeepL is configured), *Insert blank*, *Cancel*.
3. Under a textarea three small links `text wysiwyg codeeditor`, the active one underlined. To discuss: (a) HTML
   detected → TinyMCE at once; (b) the latest TinyMCE; (c) legacy init options with Add Media (record manager of
   registered files) and Add Record (record manager); (d) many inline editors are heavy and crowd the form;
   (e) legacy stores an inserted media URL as `./?db=X&amp;file=KEY&amp;fancybox=1`.
4. Editor options in the Explorer configuration: Show help, Show optional (initial settings); *Relationships from
   other records* (on by default); *Show wysiwyg editor inline*; *Non-standard fields*; what else?
5. Record Viewer: more tags for blocktext HTML (as TinyMCE produces); freetext as rec_Title.
6. HRecordEditor: the reverse relationships group as a closed accordion.
7. Check the stored text policy implementation; the test it names does not exist.

## 2. Decisions (Artem, 2026-10-24)

| Question | Decision |
|---|---|
| Rich editors (3a, 3d) | **On demand, one at a time**: the links under every blocktext; an editor is made only when chosen; opening another returns the previous one to text (its HTML kept). HTML values open in wysiwyg at once only with the option *Show wysiwyg editor inline*. |
| URLs (3e) | **Legacy relative form** (`./?db=X&file=KEY`, record links `href="123"`): TinyMCE `document_base_url` = Heurist base URL; the viewer resolves `./` and record ids. |
| DeepL flag and call (2) | `meta.translator` in the definitions snapshot (`!empty($accessToken_DeepLAPI)`); the client posts to legacy `hserv/controller/usr_info.php` `a=translate_string` (`string`, `target`, `source`). |
| Policy (7) | The test (`heurist/tests/StoredTextTest.php`) and a corrected doc now; legacy hserv saves later. |
| TinyMCE toolbar | No font, size, colour or alignment buttons: the server purifier removes inline CSS, they would be lost on save. |
| Configuration (4) | Section *Record editor*: Show help, Show optional, Relationships from other records, Show wysiwyg editor inline, Non-standard fields. |

**Proposed, to agree (4 "what else"):** default text mode of blocktext (text / wysiwyg / code); Record summary pane
open at start; Structure pane open at start.

## 3. Design

See the agreed plan (sections 1–6): translations as value rows with a language badge and the *Insert translated
value* dialog (`TranslationClient`); `shared/src/widgets/rich-text/` (one-active registry, TinyMCE lazy chunk,
CodeMirror 6 code editor); DOM-based viewer sanitizer with the server blocktext allowlist; editor options passed
Explorer → RecordEditorHost → HRecordEditor; reverse group `accordion`, closed; `StoredTextTest.php`.

## 4. As implemented (2026-10-24)

- **Translations** (`HEditField`): `_renderTranslations` / `_addTranslationRow` — each translation is a value row
  (HInputText with `langCode`: the code badge `.h-input-text-lang` before the input), remove action and eye; the
  state shape is unchanged (`translations: [{lang, value, hidden}]`, saved as `LANG:text`). The chips and the
  popover are gone. `_openTranslateDialog`: *Insert translated value* (language select without the used ones, help
  text, Translate / Insert blank / Cancel).
- **DeepL**: `shared/src/data/TranslationClient.js` (POST `hserv/controller/usr_info.php`, `a=translate_string`,
  `db`, `string`, `target`, `source`; answer `{status:'ok', data}`); heurist `ServiceFactory` reads
  `$GLOBALS['accessToken_DeepLAPI']`, `DefinitionSnapshotService` adds `meta.translator` to every response (not
  cached); `HDbDefs.translator()`. Options `translator` RecordEditorHost → HRecordEditor → HEditForm → HEditField.
- **Rich editors** (`shared/src/widgets/rich-text/`): `richTextEditors.js` (one live editor, `hasHtml`,
  `editorValue` - one plain `<p>` is unwrapped), `HTinyMceEditor.js` (TinyMCE **8.10**, `license_key: 'gpl'`,
  skins as bundled modules `skin_url: 'default'`, lazy chunk ≈175 kB gzip; relative URLs with
  `document_base_url` = Heurist base URL and the legacy URL converter; buttons Media / Caption / Record; pasted
  images refused with the legacy message), `HCodeTextEditor.js` (CodeMirror 6 + `@codemirror/lang-html` /
  `lang-javascript` / `lang-css`), `mediaTag.js` (port of `fileGetPlayerTag`: img with
  `./?db=X&file=KEY&fancybox=1`, video / audio `<source>`, YouTube / Vimeo / SoundCloud iframe, link; figure with
  figcaption). HInputText option `richText` (`setTextMode`, links `text · wysiwyg · codeeditor`, underlined
  active one; `codeOnly` + `codeLanguage` for DT_CMS_SCRIPT / DT_CMS_CSS). RecordEditorHost gives `baseUrl`,
  `insertMedia` (record manager of registered files + caption dialog) and `insertRecordLink` (record manager,
  `<a href="ID" target="_blank">`). Checked in Edge: the relative image URL loads in the editor (3e) and is stored
  relative again; opening the code editor of another field closes the HTML editor and keeps its HTML.
- **Viewer** (`shared/src/recordview/richTextHtml.js`, `sanitizeRichHtml`): DOM-based (`<template>`), the server
  blocktext allowlist, safe URLs, `./` resolved, record links `href="123"` → `data-record-id` (the renderer calls
  `onNavigate`), iframes only YouTube / Vimeo / SoundCloud; without a DOM (Node) the inline-tag fallback.
  RecordViewRenderer: blocktext through it (`.heurist-recordview-richtext` styles), freetext through
  `sanitizeTextHtml` (title tags).
- **Configuration** (`shared/src/data/recordEditorSettings.js`): section *Record editor* (Show help, Show optional
  fields, Relationships from other records, Non-standard fields, Show wysiwyg editor inline), saved in the UI config
  (`recordEditor`), read by RecordEditorHost when an editor opens (`editorSettings()`), HRecordEditor option
  `settings`: groups left out (non-standard values still saved), Show help / Show optional as start values (the
  Structure tree is made at start when *Show optional* is off), `richText.autoWysiwyg`.
- **Reverse relationships group**: `type: 'accordion', open: false`.
- **Stored text policy**: `heurist/tests/StoredTextTest.php` (62 checks, no database). It found a bug: `a < b` was
  taken for HTML (`<\s*[a-z…]`) and entity-encoded — the tag test is now `<[a-z!/?]`. `RecordEditApiTest` expected
  the legacy `<b >Bold</b>`; now `<b>Bold</b>`. The policy doc names the real test and lists the legacy hserv
  saves as not covered yet.
- Not done (follow-ups): the database's TinyMCE formats (`get_tinymce_formats`); the legacy hserv saves through
  StoredText; the "what else" options of the configuration (§2).
