# Edit form format (`heurist-edit-form/1`)

**Status 2026-11-07: agreed (Artem).** The JSON of `HEditForm`. Developed in plan `14a Edit-Form-Plan.md`; extended by
plans 18, 23, 25 and 29. Code: `shared/src/data/editFormSchema.js` (normalising, values, `showWhen`),
`shared/src/widgets/edit-form/HEditForm.js` (the form), `HEditField.js` (one field), `editFormDialog.js`
(`openEditFormDialog`). If this text and `normalizeEditForm` differ, the code is right and this file must be fixed.

## 1. Use

One JSON describes a form. `HEditForm` shows it, checks the values and gives JSON values back.

- Small forms in code: `openEditFormDialog({title, form, values, okLabel, ...})` resolves with the values, or `null`
  when cancelled.
- Module configuration forms: `apps/<module>/src/ui/config/<module>ConfigurationForm.json` (plan 29), shown by
  `ModuleConfigurationDialog`; a module in an iframe asks Explorer through the bridge `openConfiguration`.
- The record editor: the record structure (`recordEditStructure.js`) is the same JSON, with `dty` instead of `name`.
- Other users: symbol editor (`symbolEditorForms.js`), temporal editor, relationship dialog, Summary → Private,
  user and group managers, website widget forms.

There is no generic bridge call for a form; a module opens `openEditFormDialog` itself (plan 14a §19).

## 2. Example

```json
{
  "format": "heurist-edit-form/1",
  "localized": false,
  "groups": [
    {
      "id": "marker", "type": "tabs", "label": "Marker",
      "children": [
        { "name": "marker.type", "type": "enum", "label": "Marker type", "req": "required",
          "terms": [{ "id": "icon", "label": "Icon" }, { "id": "circle", "label": "Circle" }], "default": "icon" },
        { "name": "marker.size", "type": "integer", "label": "Icon size", "minValue": 4, "maxValue": 64,
          "default": 16, "showWhen": { "marker.type": "icon" } },
        { "name": "marker.radius", "type": "integer", "label": "Radius", "showWhen": { "marker.type": "circle" } }
      ]
    },
    {
      "id": "more", "type": "accordion", "label": "More", "req": "optional",
      "children": [
        { "name": "notes", "type": "blocktext", "label": "Notes", "rows": 4, "multilang": true },
        { "name": "tags", "type": "freetext", "label": "Tags", "max": 0 }
      ]
    }
  ]
}
```

Values of this form: `{"marker": {"type": "icon", "size": 16}, "notes": [], "tags": []}` (`radius` is left out: not
shown).

## 3. Form

| Property | Meaning |
|---|---|
| `format` | `"heurist-edit-form/1"`. Another value gives a warning. |
| `localized` | `true`: labels and help are already translated (a module sends its own texts; the record structure). `false` (default): they go through the dictionary of the page (`$HR`). |
| `groups` | List of groups, in order. Every field is inside a group. |

## 4. Group

Groups are a flat list; nesting is made with `inner`.

| Property | Meaning |
|---|---|
| `id` | For `showGroup(id)` and slots. Default `g1`, `g2`... |
| `type` | `tabs`, `accordion` or `group` (fieldset). Unknown: `group` with a warning. Consecutive `tabs` groups are one tab set. |
| `label`, `help` | Heading and help text. |
| `children` | The fields. |
| `showWhen` | Shown only for these values (§6). |
| `slot` | Name of an empty element at the top of the group; the owner fills it in `onReady` (`getSlot(name)`), e.g. previews. |
| `columns` | Fields in a grid of 2-6 columns, row by row (from / to pairs). One column in a narrow form. |
| `inner` | Part of the previous outer group: a heading with its fields (`group`) or a collapsible section (`accordion`). Not for `tabs`. Without an outer group before it: an outer group, with a warning. |
| `newTabs` | This `tabs` group starts a new tab set. |
| `open` | An accordion is open (`true`) or closed (`false`). Not given: the first outer accordion is open. |
| `explanation` | The heading and help are a text of their own; no fields needed. |
| `req`, `modes`, `simplified` | Configuration rules, §7 (`req` here only `optional`). |

A group without fields is not shown, except an explanation or an outer group with inner groups.

## 5. Field

### 5.1 All fields

| Property | Meaning |
|---|---|
| `name` | Key in the values. A dotted name (`toolbar.position`) is a nested object. Required unless `dty` is given. Unique in the form. |
| `type` | `freetext`, `blocktext`, `url`, `integer`, `float`, `year`, `date`, `boolean`, `enum`, `relationtype`, `resource`, `file`, `geo`, `color`, `json`, `special`; `relmarker` in the record editor only. Unknown: `freetext` with a warning. |
| `label`, `help` | Texts (§3 `localized`). |
| `req` | `required` (bold, warning colour; at least one value), `recommended` (bold), `optional` (plain; default), `forbidden` (§7). `required: true` is accepted too. |
| `max` | Number of values: `1` (default), `0` any number, `n` at most n. There is no minimum; `req: "required"` means at least one. |
| `default` | Value of a new form. `"today"` for a date field. |
| `width` | Width of the input, every type: a number = characters (as `rst_DisplayWidth`, at most 200), a text = CSS length (`"400px"`, `"20em"`, `"50%"`). |
| `readOnly` | The value can not be changed. |
| `clearable` | `false`: no clear button (a single value setting that must have a value). Default `true`. |
| `multilang` | One value plus translations (`"fre:text"`), edited with *Translate*. |
| `showWhen` | Shown only for these values (§6). |

### 5.2 By type

| Property | Types | Meaning |
|---|---|---|
| `terms` | `enum`, `relationtype` | Static choices: `[{id, label, depth?, aliases?, disabled?}]` or `["a", "b"]`. Text ids stay text, numeric ids stay numbers. `aliases`: older stored values of this term (a report template name → its id); the form shows and saves the id. `disabled: true`: shown but not selectable, in a `radio` / `checkbox` list only (plan 27g, 2026-11-11). |
| `vocabulary` | `enum` | Database vocabulary id, instead of `terms`. |
| `termsSource` | `enum` | Name of a term list the owner loads before the form is made (`resolveTermsSources`, e.g. `smartyTemplates`); added after `terms`. |
| `mode` | `enum`, `boolean` | `select`, `radio` or `checkbox`. Default: radios for at most 5 flat terms of a single value field, else a list. |
| `multiple` | `enum` with `max: 0` | The values in one picker (HValuePicker), not one input per value. `mode: "checkbox"` does the same with checkboxes. |
| `emptyLabel` | `enum` | Text of the empty choice. |
| `nullWhenEmpty` | repeatable | No value is `null`, not `[]` (a setting where null means "all"). |
| `minValue`, `maxValue`, `step` | `integer`, `float`, `year` | Number limits, also on the spinner. (`max` is the number of values.) |
| `maxLength`, `pattern`, `patternMessage` | text types | Length, and a regular expression for the whole value (as text) with its message. |
| `rows` | `blocktext`, `json` | Rows of the text area (`height` is accepted too). |
| `inputType` | `freetext` | `password`: hidden text. |
| `temporal` | `date` | `false`: the date input only. Default: date input with *Show raw* and *Edit* (temporal editor). |
| `targetTypes` | `resource` | Record types of the pointer. |
| `geoKind` | `geo` | `feature` (default; WKT; the Map drawing) or `extent` (bounding box `{west, south, east, north}`; the extent picker). |
| `special` | `special` | Id of a special editor given by the host (§5.3). |

### 5.3 Special fields

The JSON names the editor only: `"special": "query"`. The host gives the definitions in the form option
`specialEditors` (found by the `special` id, the `dty` or the `name`). A definition is code, so it is never in the JSON:

| Property | Meaning |
|---|---|
| `describe(value, context)` | Readable text of the value. |
| `edit(value, context)` | Opens the editor; resolves with the new value (`undefined` = cancelled). |
| `actions` / `actionsFor(context)` | Several editors `[{label, icon?, title?, primary?, run(value, context)}]` instead of `edit`. |
| `icon`, `title` | Font Awesome class and tooltip of the Edit button. |
| `json` | The raw value must be JSON. |
| `list` | A repeatable field edited as a whole: one box, raw text one value per line. |
| `hidden` | The field is not shown and not checked; its value is kept (another field's editor sets it). |

`context` = `{field, getValue(name), setValue(name, value), hasField(name)}`. A special field without a definition
shows the readable value and *Show raw* only.

### 5.4 Record structure only

Set by `recordEditStructure.js` from `/rst`, not written by hand: `dty`, `pointerMode`, `browseFilter`, `showAdd`,
`editReadOnly`, `sourceTypes`, `reverse`, `transient`, `entityImage`, `replace`, `file`; the form property `rty` and the
group property `nonStandard`.

## 6. `showWhen`

`{"field name": value | [values], ...}`: shown when **every** listed field has **one of** the values.

- Values compare as text: `"1"` = `1`, `"true"` = `true`, empty = `""`.
- A repeatable field matches when one of its values does.
- The names are full field names (dotted names as written).
- Fields not shown are not checked and are left out of the values (unless the form option `keepHidden`).

Only "all of / any of" exists. More operators (not, is empty) can be added later without breaking `/1`.

## 7. Configuration rules

Used by the module configuration forms (plan 29 §9), together with the form options `mode`, `showOptional` and
`simplified`. A field hidden by a rule is not checked.

| Property | On | Meaning |
|---|---|---|
| `req: "optional"` | field, group | Shown only with `showOptional` (the *Advanced* switch). |
| `req: "forbidden"` | field | Never shown; its value is kept. |
| `modes` | field, group | Modes it is shown in: `configuration`, `website`, `publication`. Not given: all. |
| `forced` | field | `{mode: value}`: in that mode not shown, and has this value. |
| `simplified` | field, group | `{hidden: true}` hidden in the simplified interface, or `{value: x}` hidden with this value. |

## 8. Values

Given with the option `values`, read with `getValues()`.

- `{name: value}`; dotted names are nested objects.
- One value: the value or `null`. Repeatable (`max` not 1) or `multilang`: a list (`[]` when empty).
- Native types: numbers, `true` / `false`, term ids as defined in `terms` (vocabulary ids are numbers), text.
  `resource` and `file`: record / file id. `geo`: WKT, or the extent object. `json`: the text.
- With the form option `allowHidden`, a value hidden from the public is `{value, hidden: true}`.
- A translation is `"xxx:text"` (3-letter language code), as in record values.
- Missing values get the field's `default`.
- Fields not shown are left out (§6, §7); `forced` and `simplified` values are put in.

The record editor does not use `getValues()`: it keeps the record format through `recordEditValues.js`.

## 9. Form options that matter for the JSON

`allowHidden`, `readOnly`, `mode`, `showOptional`, `simplified`, `keepHidden`, `specialEditors`, `labelPos`
(`inline | above | auto`), `inputPos` (`stack | flow`), `inlineCheckboxes`. Hooks: `onReady` / `h-edit-form-ready`,
`onChange` / `h-edit-form-change`, `validate(values, form)` for checks over several fields. Methods: `getValues`,
`setValues`, `getValue`, `setValue`, `validate`, `setIssues`, `isDirty`, `markClean`, `showField`, `showGroup`,
`updateField`, `revealField`, `getSlot`. The full list is in the JSDoc of `HEditForm`.

## 10. Checks

Done by the form: `req: "required"`, number range, `maxLength`, `pattern`, JSON text, `max` values, and the `validate`
callback. `normalizeEditForm` never throws: problems (unknown type, duplicate name, field without name, misplaced
inner group) are warnings; the *Test edit form* tool (Explorer Options) shows them.

## 11. Changes of the format

- A new optional property keeps `heurist-edit-form/1`. Record it here and in `normalizeEditForm`.
- A change that makes old JSON wrong needs `heurist-edit-form/2` and a conversion in `normalizeEditForm`.
