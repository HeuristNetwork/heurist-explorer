# HInput and shared edit/filter form format — development plan

## Status and scope

This is the working plan for stage 8. Keep subsequent decisions here. Legacy `editing_input.js` and `editing2.js`, the `hst` widgets, and `hst/src/types/layout.ts` are references, not code to copy. The first shared `HInputText` and dropdown `HInputEnum` and an Explorer popup testbed already exist; the behaviors below govern their further development.

## 1. Shared form and query contract

The query is a bare Heurist JSON array. Runtime parameters are named placeholders **inside criterion values**, for example:

```json
[{"t":"10"},{"f:1":"$X1$"}]
```

The same detail type may occur in several paths, each with its own placeholder. The query carries all comparison operators, literal values, NULL/-NULL tests, and linked structure. It must never be wrapped in a `q/parameters/builderModel` envelope.

A Filter Form layout is stored in a **separate QuerySource record field**, `DT_FILTER_FORM` (concept `2-1165`). The layout specifies only presentation differences from defaults. The basic generated layout is:

```json
{
  "version": 1,
  "groups": [
    {
      "id": "main",
      "type": "section",
      "children": [
        {"input":"X1","label":"Person name"},
        {"input":"X2"}
      ]
    }
  ]
}
```

`label` is present only if it differs from the database field label. The same rule applies to widget mode, range control, bounds, orientation and other optional keys. There is no separate `inputs` override map. A future record edit layout uses the same groups and inline children, with edit-only properties derived from record structure. The Filter Form designer must not expose cardinality, required status, dynamic record field addition or deep edit hierarchy.

For a range, the query holds its two endpoints, such as `{"f:20":"$X2$<>$X3$"}` or `{"f:20":"10<>$X3$"}`. The form may show direct endpoints or a slider; it never repeats the comparison operator. Blank runtime values omit the corresponding predicate; for a two-placeholder range, one supplied endpoint becomes a one-sided comparison. Literal `NULL` and `-NULL` remain query values and are never form inputs.

The form layout is optional. When absent, `HFilterForm` derives a simple layout from placeholders and database definitions. QuerySourceEditor shows the bare query read-only while it contains placeholders. Run and QuerySource selection show the Filter Form; Close restores QuerySourceEditor.

### Filter binding

`HFilterBuilder` defines query criteria and inserts placeholders for blank values. `HFilterFormDesigner` can only arrange these existing placeholders and choose presentation overrides. Runtime binding derives input type and default label from the query path and database definition; this derived information is never saved as a second model.

### Record binding and legacy conversion

The database record structure owns detail type, requirement, cardinality, defaults, term vocabulary, target record types, and permissions. A saved layout, where available, supplies presentation overrides. An adapter converts the legacy `editing2.js` `recstructure` tree and separator fields to the shared layout at runtime. It preserves order, grouping, labels, help and visibility. The simplified `HDbDefs.fields()` list excludes separators and does not contain all input settings, so it alone cannot reproduce the edit form. The adapter must use richer structure metadata.

### Layout editor separation

Use **one versioned layout schema, one renderer, and shared input widgets**, with **two editor workflows**. The filter form editor (`HFormDesigner` in filter mode, or a dedicated thin editor) only arranges Builder-defined parameters, chooses labels, simple grouping, orientation and control presentation. It does not expose cardinality, requirement, dynamic field addition, record permissions or deep hierarchy. The later record edit form designer works from record structure metadata and may expose those advanced features. Separate editor screens are acceptable and likely clearer; they share layout operations and preview/rendering code, rather than growing one large mode-dependent UI.

Filter form validation rejects references to parameters not defined by Builder. Record form validation checks detail-type bindings, permissions and cardinality separately. Form layout never changes the semantic meaning of a criterion or record field.

## 2. Shared HInput behavior

Each HInput implements value read/write, validation, read-only/disabled state, change events, rendering, and cleanup, and derives from `HBaseWidget`. The form supplies a definition and data services such as term lookup, map opening, and temporal editing. The input does not know whether a query is being executed or a record saved. Filter-specific presentation and range behavior are selected by explicit configuration. Unsupported field types or widgets produce a visible configuration error rather than silently becoming text.

## 3. Input decisions to settle before coding

| Input | Edit-form behavior | Filter-form behavior | Decisions to confirm |
|---|---|---|---|
| Text (`freetext`, `blocktext`, URL) | `HInputText` single line for every string-based field in the first version. | Same single-line control; Builder defines the text operator. | Keep HTML/multiline editing for a later record-edit phase. |
| Numeric (`integer`, `float`, `year`) | Typed value; record cardinality handled by the edit form. | Builder comparison operator defines one value or a range of two values. The filter designer chooses direct endpoints or slider. | Define slider bounds, step and precision before offering slider mode. |
| Enum (`enum`, `relationtype`) | Dropdown, list or checkbox presentation as appropriate. | Filter designer determines single versus multiple selection and presentation. | Specify exact list modes and term hierarchy behavior before expanding `HInputEnum`. |
| Resource (`resource`) | Record-selection popup or dropdown for a small bounded target set, later. | Defer record-ID selection. Filter linked records through nested field criteria such as `lt:240` containing `t` and `f:237`. | Record edit selector design belongs to a later phase. |
| Date | Simple date picker or complex temporal popup, according to field value. | Simple date only. Builder operator defines one value or a range; filter designer chooses direct inputs or slider. | Select calendar adapter and decide slider bounds/precision. |
| Geo | Map in draw mode for record editing. | Map in set-extent mode. | Reuse the existing dynamic viewport extent format and request path. |
| Boolean | Represented by enum terms `TRM_YES` and `TRM_NO`. | May use the enum input later. | Defer from first filter implementation. |
| Relation marker | Record editor composes a relation-type enum and a related-record input. | Defer. | No unified `HInputRelation`. |
| File and other special fields | Dedicated controls later. | Defer or omit. | Out of initial filter scope. |

The `hst` enum implementation already distinguishes select, radio set and checkbox set; its resource control accepts search and label-resolution functions. These are design references. The existing Heurist map and temporal editors should be integrated through narrow adapters, rather than recreated inside HInput.

Use [flatpickr](https://github.com/flatpickr/flatpickr) as the initial non-jQuery picker for **simple dates**. It documents no runtime dependencies, range selection and localization. Localization of labels and date formatting is distinct from support for different national calendar systems. Complex temporals that users define or render in national calendars are a later design task; do not make their storage or rendering depend on flatpickr. Check the current backend's accepted simple-date values before finalizing serialization. The native HTML date input remains a possible fallback, though its UI varies by browser. References: [flatpickr](https://github.com/flatpickr/flatpickr), [HTML date input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/date).

The existing map provider normalizes viewport extent as `{ west, south, east, north }` and passes it as the `extent` request option. HInputGeo should return that shape for a filter and reuse the same normalization/request path. Confirm whether the filter execution endpoint accepts that request option; do not invent a new stored `geo` predicate merely for the form.

## 4. Development sequence

1. Finalize the versioned layout and parameter-binding contracts, including undefined values, `-NULL`/`NULL`, scalar and range values, and geo extent. Settle the initial enum presentation modes. This is the prerequisite for using widgets in a query.
2. Complete `HInputText`, `HInputNumeric`, `HInputEnum`, `HInputDate` and `HInputGeo` for filter use, expanding the Explorer popup testbed as each control becomes usable. The current text and enum dropdown are first implementations, not the complete set.
3. Integrate these controls into `HFilterBuilder` for literal value editing and parameter definitions. Preserve query round trips and unsupported fragments.
4. Implement `HFilterForm` from parameter definitions and a dynamic layout renderer. Start with a generated layout, then accept stored layout JSON. Compile only defined runtime values into the final query.
5. Implement `HFilterFormDesigner` as the narrow filter layout editor. It may share layout operations and preview components with a future record edit designer, but exposes only Builder-defined parameters and filter-specific presentations.
6. Later, add the legacy record-structure adapter and fuller record edit layout editor using the same layout schema and renderer. Add record selector and complex temporal adapters when record editing needs them.

Resource-ID filtering, boolean, relation markers and file inputs can wait. Complex temporals using national calendars require a separate design discussion.

## 5. JavaScript code rules

New code will follow consistent indentation and spacing, including empty lines around functions and loop blocks as requested. Every class and public method will have JSDoc. Use the standard Heurist file header supplied by the project owner. Give each widget its own CSS file, reuse `heurist-module.css` and `heurist-ui.css` classes, mark localizable elements with `h-i18n`, and derive widget roots from `HBaseWidget`. Existing project lint and formatting rules will be checked and followed where compatible.

## 6. Verification

Validate layout references and widget settings; test repeated use of one detail type across distinct query paths; test omitted empty parameters versus explicit `-NULL`/`NULL`; test scalar and range value serialization; test enum single/multiple selection; test date and map extent boundaries; and verify Builder reopen/Apply preserves supported queries and untouched fragments. Record selector and complex temporal tests follow when those controls enter scope.

## 7. Implementation status

- The five shared filter inputs and Builder integration are present.
- Builder output is `{ query, filterForm }` only as an in-memory result. QuerySourceEditor writes `query` to `request.q` and `filterForm` to `presentation.filterForm`. The query textarea displays only `request.q`.
- `HFilterForm` derives input descriptions from placeholders and database definitions. The designer stores inline child overrides. QuerySource selection and Run open the form for parameterized queries; Close restores the editor.
- QuerySource API and host save bridge recognize `DT_FILTER_FORM` independently of `DT_QUERY_STRING`. The field must be created and added to the QuerySource record structure in each database before a custom layout can be saved. If it is missing, save rejects with a clear error.
- Verify browser interaction and database persistence after the field is provisioned. The form layout and future record edit layout share the group/child shape; advanced edit behavior remains future work.

### Database structure prerequisite

Register a new system detail type `DT_FILTER_FORM` with concept code `2-1165`, type `blocktext`, and add it to `RT_QUERY_SOURCE` with optional single-value cardinality. Existing databases, including the checked-in `osmak_mapping` snapshot, do not yet contain this detail type. The host save bridge rejects a custom form layout while the field is absent. QuerySource API reads the field when it is available; no layout is mixed into `DT_QUERY_STRING`.


## 8. September 2026 interaction refinements

- Geographic detail predicates retain their field identity as `geo:<fieldId>`; Builder parsing restores the same geographic field instead of collapsing it to a generic `geo` row.
- Blank Builder values create runtime placeholders automatically. The manual **Use parameter/Use literal** control and the earlier Builder-model parameter binding code have been removed.
- The initial field tree exposes linked paths through three hops. Once a linked branch is represented at a given table level, that immediate branch is disabled in that level's tree; additional conditions for it are added inside its linked subtable. Other branches and the remaining path depth stay available.
- Shared input clear buttons sit beside the complete control rather than over native select, date, or number affordances.
- Numeric and date ranges render their two direct inputs inline. Slider presentation uses a single track with two handles and prevents the handles from crossing.
- Filter Form Designer has a larger default dialog, keeps bound calendars within its viewport, shows record-type-qualified field paths, explains the visibility checkbox, and uses drag handles for ordering.
- Parameterized Query Sources open the Filter Form from **Filter** or source selection. The separate Open/Close controls above QuerySourceEditor were removed. While the form is active, both QuerySourceEditor and DataSourceActions are hidden; the prominent Close action inside the form restores them.



## Runtime refinements (September 2026)

- The Filter Builder owns one persistent HFieldTree instance. **Add condition** creates a row and opens that tree immediately.
- Linked field selections retain every pointer hop, up to three linked levels. Each selected branch is represented by one nested subtable and further conditions for that record type are added inside it.
- The map iframe used for geographic drawing is persistent for the Explorer application lifetime. Draw mode starts with its control panel collapsed.
- Geographic runtime parameters remain field predicates: a value for `geo:<field-id>` is converted from map bounds to WKT and substituted into that same predicate.
- A numeric or date range has one Filter Form Designer row. Its second placeholder is an implementation detail of the query template. Literal endpoints are read only in the runtime form and lock the corresponding slider handle.
- Direct range controls do not define slider bounds. Minimum and maximum settings are shown and required only for the slider presentation.
- Query Source controls are hidden while the runtime Filter Form is active. The form has 6 px internal padding.

- HFieldTree expansion state uses the complete linked path, so identical target record types in different branches do not expand each other. Lazy expansion keeps the clicked row at the same viewport position.


- The Filter Form Designer includes an embedded live HFilterForm preview. Layout, labels, visibility, enum presentation, range presentation, bounds and ordering refresh the preview immediately.
- Applying HFilterBuilder updates the Query Source and immediately runs it; parameterized queries open their runtime Filter Form through the normal execute path.
- The persistent draw-mode Map loads the map-document list without activating a document on startup.

- Filter Form Designer shows a checked-by-default **Show Form Preview** option beside Orientation. A vertical form places preview to the right; a horizontal form places it below, with a prominent separator.
- QuerySourcePanel enforces Filter Form exclusivity with both semantic hidden state and inline display suppression for QuerySourceEditor and DataSourceActions.
