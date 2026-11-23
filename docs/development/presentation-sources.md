# Presentation sources: configuration, instance, viewer and designer

**Status.** Agreed with Artem 2026-11-22 (review 1 of plan 27q2). First applied to Crosstabs (27q2 §17). Story map,
Report and Export follow later, each as its own step.

## 1. The problem

Crosstabs, Story map, Report and Export have a **dual nature**. They take their records either from:

- **A.** a predefined query of the configuration, possibly with parameters (as a report that is generated), or
- **B.** the current query / result: the Explorer UI, or a website page with its Filter widget, links between pages and
  other modules.

Either way the records must suit the configuration: a crosstab counts by the fields of one record type.

Use cases (Artem):

1. A crosstab with a parameterized query. A source page selects a library, its id is passed to the target page, and the
   crosstab there counts all holdings of that library.
2. A visitor selects a person on one page; a story map shows that person's story.
3. Explorer: an arbitrary search. The crosstab pane then offers the configurations that suit the record types of the
   result.
4. The user publishes a crosstab (like any other module) with the current query / result.

## 2. Configuration and instance

| | Configuration | Instance |
|---|---|---|
| Is | a Presentation set record (Report: its report record) | an Explorer pane, a website element, a published page |
| Holds | the settings, the **record type** it applies to, a **default query** (optional, may have parameters `$NAME$`) | which records it gets now and which configuration it shows |
| Stored | the record | Explorer: the pane (state of the tool); website: the element settings |

## 3. Record source of an instance

Two sources, the same words for all presentation types:

| Source | Explorer pane | Website element | Use case |
|---|---|---|---|
| `current` | Explorer's current result (DataSource), **AND `t:<record type of the configuration>`** | the page origins of 27l: `links`, `filter:<id>`, `module:<id>` | 3, 4 |
| `own` | the query of the configuration (or the query stored in the instance, §6) with its parameters | the same; parameter values from the page URL (`v.<NAME>=`, the link from the source page) | 1, 2 |

- **The selection is a parameter value, not a source.** The parameter `$SELECTED$` is filled with the ids of the
  selected records (Explorer selection; on a website later, with the story map step). Story map "the story of the
  selected person" = `own` query `ids:$SELECTED$`.
- Parameters are resolved with `resolveQueryParameters` (`shared/src/data/queryParameters.js`). A query with a missing
  value is not run (as Saved filters on a page, 27l): Explorer shows the parameter form (HFilterForm); a website shows
  "This crosstab needs a value of NAME".
- With `current`, a result without records of the configuration's type shows "The current result has no <type>" and
  the chooser (§4).

## 4. Choosing a configuration for the current scope (pane)

- The pane toolbar has a configuration chooser (a button with a list in a popover).
- With source `current` the list is grouped by the record types of the result (`loadScopeRecordTypes`, op=rectypes):
  - **For the current result**: configurations whose record type is in the result, with the count of records;
  - **Other configurations**: below, disabled (greyed out), with their record type.
- With source `own` the list is not grouped.
- When exactly one configuration fits and none is chosen, it is opened at once. The last choice per record type is
  remembered (browser storage of the pane, a convenience only).

## 5. Viewer (pane) and designer (full screen)

- **Pane = viewer.** Toolbar: chooser | Source (Current result / Own query) | **Edit** (opens the designer) | Publish |
  the presentation's own controls (display, Stop). It follows the SyncEngine (DataSource, selection) like the other
  modules. It changes nothing in a configuration.
- **Designer = full screen** overlay, as the Website manager: the configuration form, a preview with *Test on: Current
  result / Own query*, and New, Save, **Save as**, Delete, Help, Close. Close returns to the pane, which reloads the
  configuration. The CMS *Edit in new window* opens Explorer with the designer at once (`?tool=crosstabs&preset=<id>`).
- The designer works on its own test records: the main search does not change it.

## 6. Publication from Explorer (use case 4)

The pane is published like a module (Publish of the pane, the *Publish to* form of plan 29). The page gets one element
with the configuration and **the query of the current result** stored in the element (`own`), so the page shows what
the user saw. The record type filter of the configuration applies on the page as in Explorer. The page can be changed
later in the CMS designer (its *Records and selection*).

Server: `POST /page/{id}/import` (plan 27d, the existing `import` action) accepts the widget types that can be
published (`crosstabs`; later `storymap`) as well as the modules.

## 7. Types

| Type | Now | With this model |
|---|---|---|
| Crosstabs | done 2026-11-22 (27q2 §17) | viewer pane + full screen designer + chooser by record type + publication |
| Story map | pane with the form, follows the selection | later: the same split; `own` query of the topics + `$SELECTED$`; publication with the same code |
| Report | Report tool (reports app) | later: check its editor against §5; source `current` / the report's query |
| Export | tool with a scope select | later: `current` with the record type scope / stored export settings |

## 8. Not done

- **A stored snapshot (JSON) of the output** was proposed for crosstabs and rejected (Artem, 2026-11-22): it loses the
  facets and page sync, the data gets old, no pivot, no parameters, and a snapshot made with the author's rights would
  show counts of private records.
