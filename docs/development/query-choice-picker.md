# One picker of query sources and saved filters

**Status.** Agreed with Artem 2026-11-23 (review 7 of plan 27q2). Implemented 2026-11-23, not committed, no browser check.

## Why

The query sources (QS, record type 3-1021) and saved filters were chosen in about ten places with three controls and five
list functions. Scopes, labels, marks and the number of entries differed:

- the ▾ of a query field (record editor, crosstab and story map editors, Website manager, CMS Record cards and Own query),
  the CMS Saved filter, the Reports query: the `chooseQuerySource` popover;
- Explorer "Available filters" / "Active on start" and the CMS Filter widget: an enum select (HValueCombo / HValuePicker);
- the lists of the Explorer search pane (they stay: lists with their own icons, not pickers).

## Rules (Artem)

1. HValuePicker is the only control.
2. It lists both query sources and saved filters.
3. The label is the name: DT_NAME of a query source (localized), the name of a saved filter.
4. Marks `[filter]` and `[parametrized]`.
5. A search box when there are more than 10 entries.
6. Where a query can have no parameters (no Filter Form field: Record cards, Story map, Generated report, Website
   manager record pages, CMS Own query), the parameterized ones are **left out** (changed 2026-11-25, plan 27q3 review 4;
   before: shown disabled with a tooltip). The list is kept for 60 s per api client (`listQueryChoices`, option `fresh`).
7. Scope of the saved filters = the scope of the query sources:
   - `user` (Explorer and its editors, Reports, Website manager): every query source the user can read; the saved filters
     of ownerScope (Everyone, Website filters, the user's groups, the user).
   - `website` (CMS, Explorer published or website pages): public query sources and the saved filters of "Website
     filters" (group 4).

## Code

| Part | File |
|---|---|
| The one list `listQueryChoices({apiClient, dbdefs, scope, ownerIds})`, picker items `queryChoiceItems`, enum terms `queryChoiceTerms`, `queryChoiceDefinition` (query + Filter Form; a saved filter read and converted), `findQueryChoice` | `shared/src/data/queryChoices.js` |
| The picker under a button `chooseQuerySource(anchor, items, {value})` and the ▾ action `querySourceAction` | `shared/src/widgets/edit-form/querySourceChooser.js` |
| Marks, disabled items, row tooltip | `shared/src/widgets/picker/HValuePicker.js` (`item.marks`, `item.disabled`, `item.title`) |
| Enum fields pass `marks`, `disabled`, `title` of terms and `filterThreshold` | `editFormSchema.js`, `HEditField.js`, `HInputEnum.js` |

A choice: `{value: 'source:<id>'|'filter:<id>', kind, id, label, parameterized, query?, filterForm?}`.

Callers: `RecordEditorHost` (▾, `queryOwnerIds` from Explorer), `websiteForms.js` (record pages), `CmsDesigner._queryChoices`
→ services `queryChoices()` (Saved filter, Record cards / Own query ▾, Filter widget), Explorer `_websiteQueryChoices`
(publication, CMS Explorer panel), Reports through the bridge `getQueryChoices` / `getQueryChoiceDefinition`.

Removed: `CmsDesigner._publicQuerySources` / `_websiteSavedFilters`, the merges in `savedFilterField.js` and
`widgetForms.js`, `ExplorerApplication._publicFilterLists`, the label text marks of `explorerPublication.js`,
`ReportsApplication.querySourcesForReports` and the bridge `getQuerySources`, `querySourceChoices`, the own menu of
`chooseQuerySource`. `listQuerySources` is used only inside `listQueryChoices`. `QuerySourceManager` /
`SavedFilterManager` stay (Explorer search pane, editing, caching).

Deviation from the plan: no `QueryChoiceSource` class — `queryChoiceItems` gives the items of a `StaticSource`.
