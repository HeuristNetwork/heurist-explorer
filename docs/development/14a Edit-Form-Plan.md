# Edit form (HEditForm) — development plan

Status: **proposal 2026-10-17, Phase 1 and Phase 2 implemented 2026-10-17, not committed, not checked
in a browser.** The JSON format (§3) is a proposal to agree with the *Test edit form* tool (§6).
Next: agree the format, then Phase 3 (bridge) and Phase 4 (consumers). Plan 14 (record editing) is
the base of this plan.

## 1. Context

Today every small form is written in code:
- the report forms (`apps/reports/src/ui/reportForms.js` with `formDialog.js`; its header already
  says "until the dynamic HEditForm exists");
- the symbol editor (`HSymbolEditor`: field tables and `show` functions);
- the Explorer configuration dialog (`selectRow`, `radioGroup` helpers).

`HRecordEditor` (plan 14) already had a generic core: groups as tabs, accordion or fieldsets, one
field widget per field (repeated values, hidden switch, translations, special fields), required
checks, issues beside the fields. It was mixed with the record work (load, `/rst` structure,
ownership, Record summary, save, conflict).

**Goal:** a generic `HEditForm` that is made from JSON, checks the values and gives JSON back. The
record editor uses it for its fields. Other forms are then configured by JSON, and a module in an
iframe can send the JSON of its configuration form to Explorer, which shows the form and returns
the values.

## 2. Request (Artem, 2026-10-17) and comments

| # | Request | Comment / decision |
|---|---|---|
| 1 | HRecordEdit is a descendant of HEditForm or uses it, with more tabs (Record summary, owner/visibility, tags, linked records) | **Uses it (composition).** `HRecordEditor` keeps load, save, ownership and the Record summary, and puts an `HEditForm` in its centre pane. A subclass would bring record ideas (dty, owner, rec_Modified) into the generic class. |
| 2 | HEditForm is generic: JSON in, edit form, basic client checks (required), JSON out | Done. The checks are: required, number range, text length and pattern, JSON text, and a `validate` callback for checks over several fields. |
| 3 | Used by Smarty report, schedule, crosstab report, configuration dialogs, symbology editor(?) | Agreed for the report and schedule forms, crosstab settings and module configuration. **Explorer configuration:** only its plain sections; the pane layout part (drag and drop) stays in code. **Symbology:** yes for the fields, but the previews and the "inherit from parent" logic stay in code; the JSON has a `slot` per group for the previews. It is the last consumer. |
| 4 | Event listener for onInitFinish to add custom behaviour (show/hide groups or inputs by mode) | `onReady` option and the `h-edit-form-ready` event (= onInitFinish), `onChange` / `h-edit-form-change`; methods `showField`, `showGroup`, `updateField`, `setValue`, `getSlot`. **But:** functions cannot be sent from an iframe to Explorer. So the simple cases are in the JSON: `showWhen` (§3). Code is for forms made in the same document. |
| 5 | Modules in iframes send the JSON of their config form to Explorer; Explorer shows the form and returns JSON to save as options | Phase 3: bridge method `openEditForm`. **Localization:** Explorer cannot translate a module's labels (the module has its own localization file), so the module sends translated labels with `"localized": true`. |
| 6 | Test JSON with all field types (all repeatable), temporary tool "Test edit form" in the left rail: form on the left, result JSON on the right | Done (§6). The right side also has the form JSON, editable with Apply, so the format can be tried. |
| — | Extend plan 14 or new 14a | New 14a: plan 14 is long and finished. Plan 14 points here. |

## 3. JSON format (`heurist-edit-form/1`) — proposal

The record edit structure of plan 14 (`recordEditStructure.js`) is the same JSON: a field without
`name` is named by its `dty`.

```json
{
  "format": "heurist-edit-form/1",
  "localized": false,
  "groups": [
    {
      "id": "symbol", "type": "tabs | accordion | group", "label": "Symbol", "help": "",
      "showWhen": null, "slot": null,
      "children": [
        {
          "name": "icon.size", "type": "integer", "label": "Icon size", "help": "",
          "req": "required | recommended | optional", "max": 1, "default": 16,
          "min": 4, "maxValue": 64, "step": null,
          "showWhen": { "mode": ["icon", "image"] }
        }
      ]
    }
  ]
}
```

**Group**
- `type`: runs of `tabs` groups are one tab set; `accordion` groups are collapsible (the first one
  open); `group` is a fieldset. Unknown: `group`.
- `id`: for `showGroup`; default `g1`, `g2`...
- `showWhen`: the group is shown only for these values (see below).
- `slot`: name of an empty element at the top of the group; the owner fills it in `onReady`
  (`getSlot(name)`), e.g. symbol previews.

**Field**

| Property | Meaning |
|---|---|
| `name` | Key in the values. A dotted name (`toolbar.position`) is a nested object. Required, unless `dty` is given. |
| `type` | `freetext`, `blocktext`, `url`, `integer`, `float`, `year`, `date`, `boolean`, `enum`, `relationtype`, `resource`, `file`, `geo`, `color`, `json`, `special` (and `relmarker`, record editor only). Unknown: `freetext` with a warning. |
| `label`, `help` | Texts. Translated with the Explorer/module dictionary unless the form is `localized`. |
| `req` | `required`, `recommended` (label colour only), `optional`. `required: true` is accepted too. |
| `max` | Number of values: 1 (default) one value; 0 any number; n at most n. |
| `default` | Value of a new form (`"today"` for a date). |
| `terms` | Static choices of an `enum`: `[{id, label, depth?}]` or `["a", "b"]`. Text ids stay text, numeric ids stay numbers. |
| `vocabulary` | Database vocabulary of an `enum` instead of `terms`. |
| `mode` | `select`, `radio` or `checkbox` for an `enum`. Default: radios for at most 5 flat terms of a single value field (plan 18), else a list. |
| `min`, `maxValue`, `step` | Numbers. (`max` is the number of values, so the largest value is `maxValue`.) |
| `maxLength`, `pattern`, `patternMessage` | Text checks. `pattern` is a regular expression for the whole value, as text (JSON cannot hold a RegExp). |
| `rows`, `width` | Rows of a text area; width in characters. |
| `targetTypes` | Record types of a `resource` field. |
| `multilang` | One value plus translations (`"fre:text"`). |
| `readOnly` | The value cannot be changed. |
| `showWhen` | `{field: value \| [values], ...}`: shown when every listed field has one of the values. Text comparison (`"1"` = `1`, `"true"` = `true`). |
| `special` | Id of a special editor given by the host (`specialEditors`), e.g. `"query"`; the record editor also finds them by dty. A `special` field without an editor shows the readable value and *Show raw* only. |

**Values** (`getValues()` and the `values` option)
- `{name: value}`; a field with `max` other than 1, or `multilang`, has a list.
- Native types: numbers, `true`/`false`, term ids as defined, text.
- A value hidden from the public (only when the form has `allowHidden`) is `{value, hidden: true}`;
  a translation is `"xxx:text"` — the same as a record value (plan 14 §1).
- Fields that are not shown (by `showWhen` or by code) are not checked and are left out.
- Missing values get the field's `default`.

The record editor does not use `getValues()`: it keeps the record format (strings, `{geo}`)
through `recordEditValues.js` and the field states.

## 4. Classes

New `shared/src/widgets/edit-form/`:

| File | Content |
|---|---|
| `HEditForm.js` + `.css` | The form. Options: `form`, `values` (or `states`), `labelPos`, `inputPos`, `allowHidden`, `readOnly`, `specialEditors`, `specialContext`, input services (`apiClient`, `dbdefs`, `languages`, `selectExtent`, `fileUrl`), `onReady`, `onChange`, `validate`. Methods: `getValues`, `setValues`, `getValue`, `setValue`, `validate`, `setIssues` (returns the issues of no field), `isDirty`, `markClean`, `showField`, `showGroup`, `updateField`, `revealField`, `getSlot`, `getField`, `getFieldWidget`. Events: `h-edit-form-ready`, `h-edit-form-change`. |
| `HEditField.js` + `.css` | One field; was `record-editor/HRecordField.js` (moved, CSS classes `h-record-field-*` → `h-edit-field-*`). New: static `terms`, `color`, `json`, `url`, number range, `maxLength`, `pattern`, `readOnly`, `setState`. |
| `editFormDialog.js` | `openEditFormDialog({title, form, values, okLabel, ...})` → values or null; OK checks the form first. |

`shared/src/data/editFormSchema.js`: `normalizeEditForm` (defaults and warnings), `isVisible`
(showWhen), `formStates` / `formValues`, `stateToValue` / `valueToState`, `getPath` / `setPath`.

`HRecordEditor` now builds an `HEditForm` of the record structure (`localized: true`, labels come
from the database; `allowHidden: true`). Its group CSS classes are `h-edit-form-*`.

## 5. Phases

1. **Format and widget** — `editFormSchema.js`, `HEditForm`, `HEditField`, `openEditFormDialog`,
   test tool, tests. *Done 2026-10-17.*
2. **Record editor on HEditForm** — no change of behaviour. *Done 2026-10-17* (done now because
   otherwise HRecordField and HEditField would be two copies of the same code).
3. **Bridge** — `openEditForm({title, form, values, okLabel})` → values or null in
   `shared/src/host` and the module host adapters; Explorer opens `openEditFormDialog` with its
   services (pointer titles, vocabularies, map extent); without the bridge method the module opens
   the dialog itself. `docs/integration.md`.
4. **Consumers** — report properties / generate / schedule (replaces `formDialog.js`), crosstab
   settings, module configuration dialogs through the bridge, plain sections of the Explorer
   configuration, then `HSymbolEditor` with group slots.
5. **Remove the test tool** when the format is agreed.

## 6. Test edit form tool (temporary)

- Left rail button *Test edit form* (flask icon, own group at the end):
  `apps/explorer/src/dev/EditFormTestTool.js` (lazy chunk), JSON `apps/explorer/src/dev/editFormTestSample.json`.
- Left: the form. Right: tabs *Result JSON* (updated on every change; *Validate* adds the
  problems) and *Form JSON* (editable; *Apply* makes the form again and shows the warnings).
- Toolbar: labels (auto / inline / above), inputs (stack / flow), hidden switch, read only,
  Validate, Reset values.
- The test JSON: tabs Text, Numbers, Dates and choices, Links, Special with every field type,
  all repeatable (`max: 0`); an accordion *Behaviour* with single values: a required radio
  "Marker type" and fields that depend on it (`showWhen`), required text with a pattern and a
  length, recommended, read only, defaults, dotted names; the group *Advanced* is shown by code
  (`onReady` / `onChange` with `showGroup`, and its `slot`); the group *Image options* has a
  `showWhen` of its own.
- The vocabulary field uses the vocabulary of the first enum field of the database.
- The special field uses a test editor: *Edit* puts a time stamp around the value.

## 7. Implementation notes (2026-10-17)

- `RecordEditorHost.formServices()` gives the input services to the test tool (and later to the
  bridge).
- The date input is not in the fake-DOM widget test (its calendar needs a real DOM); it is in the
  sample JSON.
- Tests: `shared/test/editFormSchema.test.js` (4), `shared/test/hEditForm.test.js` (6),
  `apps/explorer/test/editFormTestSample.test.js` (2); the record editor tests use the new class
  names. `npm test`: 1195 pass.

## 8. Open points

- Agree the JSON format (§3) with the tool, especially: native value types in `getValues`,
  `maxValue` vs `max`, `showWhen` as "all of" with text comparison, dotted names.
- Is `showWhen` enough for the module configuration dialogs, or do they need more (e.g. "not",
  "is empty")? More can be added to the JSON later without breaking it.
