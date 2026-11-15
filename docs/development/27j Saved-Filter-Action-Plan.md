# 27j Saved filter action (CMS links that show records of a query source)

**Status (2026-11-15):** discussed and agreed with Artem (§3). **Phase A implemented** in both repos (§7), not committed, no
browser check. Phases B and C not started (§5).

Review 2026-11-15, item 19. The CMS actions (action menu, Record field link, media, Record cards) offer *Saved filter*.
Since plan 27g it has only been a disabled option. It is not stored, not allowed by `StoredText`, and not written by
`PageRenderer`.

## 1. What exists

- **Query source:** a record of `RT_QUERY_SOURCE` (3-1021).
  - Fields: DT_NAME (with translations), DT_QUERY_STRING (2-12), the filterForm, the rules.
  - The definition is read with `GET /records/querysource/{id}` (`QuerySourceProvider`).
- **Parameters:** written `$NAME$` in the query; values are an object by name (`{X1: 'Paris'}`).
  - Filled on the client only, by `resolveQueryParameters(query, values, filterForm)` in
    `shared/src/data/queryParameters.js`.
  - An empty value drops its predicate.
  - `exact` parameters take an array (combined with OR).
- **`HFilterForm`** takes initial `values`. `HFilter._showForm` (the published Explorer) passes none.
  `ExplorerApplication.activateDataSource` does nothing with a parametrized DataSource on a published page.
- **Website page URL:** reads only `site`, `pageid`, `rec`, `frame`, `lang`, `design` (`WebsiteController`).
  - Modules start from the stored instance `state`.
  - No module reads the page URL, except Map (`doc=`).
- **Links per record:** `PageContent::recordLinks` / `fieldLink` already write them on the server (`url`, `recordPage`,
  `goto:`).

## 2. Proposal of Artem and the critique (summary)

| Proposal | Decision |
|---|---|
| choose a filter | query sources only, public ones only (visitors can not read others); legacy `usrSavedSearches` left out |
| the module type depends on whether the source is parametrized | any record module; missing values drop their predicates, at least one value for a parametrized source; Explorer asks the missing ones in its form (§3.5) |
| page → module | **a page only**; every record module of it takes the result (a module name is fragile, a page may show map + table) |
| values via the Filter Form | yes, `HFilterForm` with `values` in the designer; partial values allowed for an Explorer target |
| values from the record | a value is a constant or a field of the record (`record.id`, `record.<field>`), filled in by the server for each card / field value |
| keep the values as a query JSON | **no**: the reference is stored (source, page, values); a resolved query goes stale when the source is edited |
| URL `?q=<query>&filter=<id>` | `?source=<id>&v.X1=...` (`v.` avoids clashes with `lang`, `rec`, `design`); a plain `q=` later if needed |
| the module parses the URL | **the site runtime** parses it, fills the values and gives the DataSource to the modules (architecture: modules do not read the page URL) |

## 3. Agreed (2026-11-15)

1. **Target:** a page. Every record module on it (Explorer, Data, Map, Timeline, Graph; not RecordView) takes the result.
2. **Stored:** the reference and the values, not the resolved query.
3. **URL:** `{page URL}?source=<id>&v.<NAME>=<value>`; an array value repeats the key (`v.X1=a&v.X1=b`).
4. **Limits** (short URLs):
   - at most 8 values per link;
   - a value at most 200 characters;
   - an array at most 10 items;
   - the query string at most about 2000 characters.
   The designer refuses more. The validators (JS + PHP) and the site runtime ignore anything over the limit.
5. **Missing values** (revised 2026-11-15):
   - **Explorer target:** values may be missing. Its filter form asks for them, filled in with the given values.
   - **Any other target:** values may be missing too, but a parametrized source needs **at least one value**. A
     missing value drops its predicate (`resolveQueryParameters`). With no value at all the query would show
     everything.
6. **Name:** "Saved filter" stays. The selector is labelled Query source. Stored action key: `savedFilter`.

## 4. Design

### 4.1 Stored format

- **Action menu item:** `{action: 'savedFilter', source: <id>, target: <page id>, values: {...}, label, icon, ...}`.
- **Record cards / media / gallery** (`recordAction`): `{action: 'savedFilter', source, page, values}`.
- **Record field link:**
  - `data-h-link="filter:<page>:<source>"`;
  - the values in `data-h-link-values` (JSON, at most the limits);
  - both allowed by `StoredText` (pattern + JSON check) and `cmsEdit.setFieldLink`.
- **A value is one of:**
  - a string (a number as a string);
  - an array of strings (`exact`);
  - `{field: '<concept code or id>'}` / `{record: 'id'}` (phase B: record context only).
- **Validators:** `cmsDocument.js` (`CMS_FILTER_LIMITS`, `cmsFilterActionProblem`) = `CmsValidator.php` (same rules, same
  limits), shared fixtures in `shared/test/fixtures/cms-v4`.

### 4.2 Designer

One helper `apps/website/src/designer/savedFilterField.js`, used by `actionForms.js`, `recordPageField.js` (cards, media,
gallery) and the Record field link form:

- **Query source:** a selector of public sources. The list comes from the same source as the publication form of Explorer
  (`_publicFilterLists` / bridge).
- **Target page:**
  - pages of the website with a record module;
  - any page with a record module (missing values: Explorer asks for them, other modules leave their predicates out).
- **Values:** `HFilterForm` of the source with `values`.
  - Phase B: in a record context each input can take "value of a field of this record" (the field picker of the Record
    field form).
- **Checks before saving:** the limits, a page, a source, at least one value for a parametrized source when the target
  page has no Explorer.

### 4.3 Server

- **`PageContent::recordLinks`, `fieldLink` and `PageRenderer::actionMenuHtml`** write the href with `SiteUrls`: the page
  URL + `source` + `v.*`.
- **Phase B:** the record values are read through `RecordRepository` for each card. The repository applies its own
  access rules (`valueVisible`).
- **No new endpoint:** the target page reads its parameters as it reads `rec` and `lang` today.
  - `WebsiteController` passes `source` and `v.*` (checked, within the limits) to `runtime.filter = {source, values}`.
  - A non-public source is dropped.

### 4.4 Site runtime

- **`siteRuntime.js`, with `runtime.filter`:**
  - loads the source with `QuerySourceProvider`;
  - fills the values with `resolveQueryParameters`;
  - builds a DataSource `{reference: {type: 'source', id}, request: {q, rules}, presentation}`.
- **Record modules of the page:**
  - not mounted yet: bootstrap `state.dataSource` (Explorer) or `state.query` (Data, Map, Graph, Timeline, as they read
    it today);
  - mounted: `setDataSource` / `setQuery`.
- **Explorer with values still missing:**
  - `HFilter.select(key, {values})` → `HFilterForm` `values`;
  - Explorer starts with the form of this source;
  - a published Explorer opens the form instead of doing nothing (`activateDataSource`).
- **`siteNavigator` (swap / scroll):** keeps `source` and `v.*` in the URL of the fetched page.
- **A link to the current page:** applies the result without a reload (phase C).

### 4.5 Website Check

`/website/{id}/validate` reports:

- a private source;
- a missing target page;
- a target page without a record module;
- a parametrized source without any value for a target page without an Explorer.

## 5. Phases

- **A:**
  - constant values;
  - action menu, Record cards, media, Record field;
  - the URL, `WebsiteController` → `runtime.filter`, the site runtime;
  - Explorer and plain modules as targets, Explorer with missing values;
  - validators, fixtures, Check.
- **B:** values from the record (cards, Record field, a record page's action menu).
- **C:** same-page links without a reload; swap / scroll navigation.

## 6. Tests

- **JS:**
  - the action values and the limits (designer helper, validators);
  - the URL builder;
  - parsing `runtime.filter` in the site runtime;
  - `HFilter` with values;
  - the fixtures.
- **PHP:**
  - `WebsiteRenderTest` (hrefs; phase B: one per card);
  - `StoredTextTest` (`filter:` link and its values);
  - `CmsFormatTest` (the fixtures);
  - `WebsiteEditTest` (Check).
- **Browser:**
  - a button with a constant value to a Map page;
  - a link to an Explorer page with a partly filled source (the form opens filled in);
  - a link to a Map page with a partly filled source (the missing predicates are left out);
  - phase B: cards with values from each card.

## 7. Phase A: implementation (2026-11-15)

### 7.1 What was done

- **Shared format:**
  - `shared/src/site/cmsSavedFilter.js`: limits, values, query string, URL, parsing the URL, checks, the request
    (DataSource with the given values filled in, raw DataSource, missing names).
  - It is the same as `srv/Website/SavedFilterLink.php`. Both run the shared cases of
    `shared/test/fixtures/saved-filter-links.json`: `shared/test/cmsSavedFilter.test.js` and
    `heurist/tests/SavedFilterLinkTest.php`.
- **Validators:** media action `savedFilter` in `CMS_MEDIA_ACTIONS` / `CmsValidator::MEDIA_ACTIONS` (problem from the
  shared check).
- **Record field link:**
  - `filter:<page>:<source>` + `data-h-link-values`: `cmsEdit.setFieldLink(id, link, values)` / `fieldLinkValues`.
  - `StoredText`: the link pattern and a JSON check of the values within the limits.
- **Server links:**
  - `PageContent::filterLink`, used by `recordLinks` (cards / gallery / media of Any record: the same link for every
    record), `fieldLink` (any reference), `PageRenderer::linkMedia` and `actionMenuHtml`.
  - A target that is not a page of the website, or a record page, gives no link.
  - `CmsHtml::fill` passes `data-h-link-values`; `CmsHtml::nodes` gives `link`.
- **Website summary:** `modules` (the module types) of each page and of the home (`WebsiteEditService::pageTree` /
  `summary`). The designer lists only pages with a record module as targets, and knows whether a page has an Explorer.
- **Designer** (`apps/website/src/designer/savedFilterField.js`):
  - The popup: public query sources (`/records` with `access: public`), the target page, the Filter Form of the source
    for the values (its buttons hidden). The checks are the limits and "at least one value without an Explorer".
  - `savedFilterPicker` for the action menu rows.
  - `attachSavedFilter` (a read-only summary field + button) for the forms of Record cards, media / gallery (Any record)
    and Record field (source A record).
  - Services in `CmsDesigner._formServices`.
  - The Link popup of the text editor offers Saved filter too: the href is written at once (`_linkUrl`).
- **Website Check:** the query source of every Saved filter is a referenced record of kind `filter`
  (`CmsRecordReferences`). A non-public source is listed like other non-public records.
- **Site runtime** (`siteRuntime.js`):
  - `pageFilterRequest` reads `source` + `v.*` of the page URL once per page, loads the source as the visitor
    (`/records/querysource/{id}`) and fills the values.
  - `filterInstanceState` gives each record module its start state:
    - Explorer: `pageRequest`;
    - Data: `dataSource` + `query`;
    - Map: `query` in the Filtered Result;
    - Graph: `query` (+ rules);
    - Timeline: `query` + `currentDataSource`.
- **Explorer:**
  - `state.pageRequest` wins over the filter of the page.
  - With missing values the Search pane opens the Filter Form filled in (`HFilter.showSource(source, values)`).
  - Otherwise the DataSource is activated.

### 7.2 Where the code differs from the plan

- **§4.3:** `WebsiteController` does not pass `runtime.filter`. The site runtime reads `location.search` itself. The
  page owns its URL, and swap / scroll navigation (phase C) changes the URL without a server request.
- **§4.5:**
  - The Check reports only a non-public source (with the existing list of non-public records).
  - A missing target page, or no value without an Explorer, are refused by the designer and the server writes no link.
    The Check does not list them.
- **Iframe-mounted instances** (`mount: 'iframe'`) do not get the filter yet: their page is written by the server.
- **URL encoding:** JS `encodeURIComponent` and PHP `rawurlencode` differ for `!'()*`. Both decode to the same value.

### 7.3 Review 2026-11-15 (not committed, no browser check)

1. **Popup layout:** narrow captions (110 px). The selectors stay inside the form (`min-width: 0`, `max-width: 100%`).
2. **Map extent:** the extent of a Filter Form was disabled in the designer popup and on a published page. Both now get
   Explorer's map picker:
   - the website bridge `selectExtent` (Explorer `selectFilterExtent`, only with a Map module URL);
   - the `HFilter` option `selectExtent`, set by the published Explorer.
   An extent is kept in a link as a WKT rectangle with at most 5 decimals (`cmsFilterLinkValue`, within the 200
   characters). It fills the `geo` parameter as it is, and the form shows it as an extent again (`cmsFilterFormValues`).
3. **Explorer with values still missing:** the query with the given values runs at once (missing predicates left out),
   and the Filter Form stays open, filled in, to refine it. With no value given only the form is shown.

4. **No button in Record cards, Media gallery, media and Record field:** writing the summary into the read-only field
   draws the field again (`HEditField.setState` → `render`), and that removed the button at once.
   `attachSavedFilter` now writes the summary first and puts the button after it each time. A test builds the form.
