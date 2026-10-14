# Record edit form — cosmetics, layout options, Record summary pane

Status: **agreed 2026-10-14; Phase 1 implemented 2026-10-14, not committed, not checked in a browser.** Phase 2 (Private, Tags)
needs server work and is not started.

Follows plan 14 (`HRecordEditor`, `HRecordField`) and plan 17 (symbology editors).

## Requests (Artem, 2026-10-14)

1. "Remove value" and "Value visibility" icons visible on mouse over, next to the input.
2. One "Remove value" icon: delete the value when the field is repeatable and has more than one
   value, otherwise clear it.
3. "Add a value" and "Translate" right after the label.
4. Translate as an icon button, `fa-language`.
5. Value visibility: `fa-eye` / `fa-eye-slash`.
6. Labels: required bold `--h-color-warning`; recommended bold `--h-color-header`; optional normal
   `--h-color-header`.
7. Radio group for a unique choice (Image | Icon font | Circle | Record type icon, Yes | No).
8. Form layout options: `labelPos` inline | above | auto (auto: inline when the form is wide
   enough), `inputPos` flow | stack (stack default). Symbology editors: labelPos inline, inputPos stack.
9. Values of fields that are not in the record structure: last group "Non-standard fields".
10. Collapsible/resizable right pane (HCardinalLayout), large `«|»` toggle, caption "Record summary"
    when collapsed; accordion panels Admin, Private, Tags, Linked records, Scratchpad.
11. Admin panel: owner, access, added by, added, updated.

## Agreed decisions (2026-10-14)

- **Radios (7)**: symbology editors use inline radios for their fixed choices; in the record editor a
  single-value enum field is an inline radio group when its vocabulary has at most 5 terms and no
  hierarchy (larger: dropdown). HInputEnum already has `mode: 'radio'`, `orientation: 'inline'`.
- **Layout options (8)**: shared, not a rewrite of the symbology editors onto HRecordField. One set of
  form layout classes (`shared/src/widgets/form/formLayout.js` + `.css`): `labelPos`
  inline | above | auto (auto by container query), `inputPos` **flow | stack** (names agreed). Used by
  HRecordEditor (default labelPos auto, inputPos stack) and the symbology editors (inline, stack).
- **Record summary (10, 11)**: phased. Phase 1: Admin (owner and access editable — moved from the
  ownership pane at the top —, added by, added, updated, read-only), Linked records (read-only,
  **the same code as Record View's built-in renderer**: `RecordRelationsProvider` and the renderer's
  linked sections, made public), Scratchpad (editable, `rec_ScratchPad`, saved with the record).
  Private and Tags: panels shown read-only/"coming soon". Phase 2: srv endpoints for bookmarks
  (rating, reminders) and tags, then editing.
- Non-standard values (9) are already kept on save (`buildRecordBody` copies details of fields
  outside the structure); they get their own last group, editable with an input of their field type.

## Notes

- The symbology editors use the shared inputs: HSymbolEditor builds every field with
  `createHInput` (HInputEnum, HInputColor, HInputNumeric, HInputText); HImageFilterEditor uses
  HInputColor plus plain range sliders; HThematicMapEditor and HRangeGenerator still have some plain
  inputs (renderer title, active checkbox, generator fields).

## Phase 1 — implementation (2026-10-14)

- `HRecordField`: one remove icon per value (`fa-xmark`, every non-special field): "Remove this value"
  with several values, "Clear the value" for the last one; value visibility `fa-eye` / `fa-eye-slash`;
  both `h-record-field-value-tool`, shown on mouse over or focus (an `fa-eye-slash` value keeps its
  icon shown). Add (`fa-plus`) and Translate (`fa-language`, icon button) right after the label.
  Labels: `is-required` bold warning colour, `is-recommended` bold header colour, optional normal header
  colour (the `*` after required labels is gone). Single-value enum with ≤5 flat terms → inline radios
  (`isSmallFlatVocabulary`).
- `shared/src/widgets/form/formLayout.js/.css`: `applyFormLayout(root, {labelPos, inputPos})`,
  `markInputField` (HInput rows), classes `h-form-layout-field` / `-label` / `-group`.
  `HRecordEditor` options `labelPos` (default auto) and `inputPos` (default stack); `HSymbolEditor`
  inline + stack (its own label grid removed; right-aligned labels and gradient pairs kept).
- `nonStandardGroup()` in `recordEditStructure.js`; the editor appends it to a copy of the structure,
  so loading, editing and saving treat those fields like the others.
- `HRecordEditor`: `HCardinalLayout` with the form in the center and the Record summary east (300px,
  min 220, collapsed strip 30px with the large `«/»` and the caption (italic, read top-down); collapsed state
  remembered in the browser). Panels: Admin (the ownership controls, moved from above the form; added
  by, added, updated with local time), Private and Tags ("coming soon", Phase 2), Linked records
  (`RecordRelationsProvider` and `buildLinksRow` / `buildLinkedFromSection`, now exported from
  `RecordViewRenderer.js` and used by it too), Scratchpad (`rec_ScratchPad`, sent with the record).
  Option `summary: false` gives the old layout. Owner/access issues of a save expand the pane and Admin.
  `onOpenRecord` makes linked titles clickable; Explorer does not pass it yet (the editor is a modal
  dialog; showing the record behind it is not useful) — titles are plain text for now.
- Tests: `shared/test/recordEditFormPlan18.test.js`; the fake DOM style got `removeProperty`.

## Review round 1 (Artem, 2026-10-14)

Decision: **the value tools belong to HInput, not to the record editor.** Remove/clear and value
visibility act on one value (HInput is the editor of one value); Add a value and Translate act on the
field, so HRecordField keeps their logic but HInput renders them in an actions slot after the input.
- HInput options `valueTools`, `removable` (`setRemovable`), `visibilityToggle`, `valueHidden`
  (`setValueHidden`, `isValueHidden`), `setActions(elements)`; events `h-input-remove`,
  `h-input-visibility-change`; option `clearButton: false` (no own clear). In value-tools mode the
  tools are 10px icon buttons beside the control, shown on hover/focus, centred on a one-line input and
  top-aligned beside a text area. HRecordField only answers the events; Add / Translate sit after the
  input of the last value (fixes their unstable position; the duplicate `h-form-input-clear` is gone).
- `.h-form-input[hidden]`: the input's own `display:flex` beat `[hidden]`, so the raw value of special
  fields (DT_SYMBOLOGY "Show raw") never hid.
- HInputEnum `radioStyle: 'standard'`: ordinary radio buttons in edit forms (record editor, symbol
  editor); Filter Form facets keep the circle-less style.
- Symbol editor labels inline: the row is the HInput root (`.h-form-input`), so it is marked as the
  layout field itself (`markInputField(input.container)`); its CSS selectors fixed the same way.
- Translation languages: the server sends `meta.translationLanguages` with the database setting
  "Languages" (legacy `db_languages.json`; default the legacy common list), not the languages of
  definition translations (`meta.languages`, which gave only IND). Added to every snapshot response, not
  cached (`DefinitionSnapshotService`, `ServiceFactory`); `HDbDefs.translationLanguages()`.
- `DT_DATA_SOURCE` was missing from the snapshot's dbconst: the Map Layer's data source was never read,
  so Thematic maps said "Not supported for current data source" and image layers got the symbol editor
  instead of the image filters. Added; snapshot FORMAT 4.
- Editor: no (empty) west pane; rst_DisplayWidth sizes text-like inputs (characters, at most the
  form width); "Drop changes" after Close (confirmed when something changed; the form again with the
  loaded / last saved values); the summary caption italic, read top-down.
