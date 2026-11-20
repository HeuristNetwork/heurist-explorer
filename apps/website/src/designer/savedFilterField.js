/**
 * @file savedFilterField.js
 * @brief The action Saved filter in the CMS designer (plan 27j): a public query source, the target page and the values
 *        of its parameters.
 *
 * One popup (`openSavedFilterForm`) for the action menu, Record cards, media, a media gallery and a Record field:
 * - Query source: the public query sources of the database (visitors must be able to read them);
 * - Target page: the pages of the website with a module that shows records (CMS_FILTER_MODULES);
 * - Values: the Filter Form of the source (HFilterForm). Values may be left out: Explorer asks for them in its filter
 *   form, other modules leave their predicates out; a parametrized source needs at least one value when the target
 *   page has no Explorer. Limits: CMS_FILTER_LIMITS.
 * The answer is stored as a reference `{source, page, values}`, not as a query.
 *
 * `savedFilterPicker` (the action menu rows) and `attachSavedFilter` (HEditForm forms: a read-only field with a summary
 * and the button that opens the popup) keep the value.
 *
 * Values from the record (phase B): in a record context (Record cards, a media / gallery of records, a Record field of a
 * record, the action menu of a record page) the popup has *Values from the record*: for each parameter the record id or
 * a field of the record (`{record: 'id'}`, `{field: '<concept code>'}`), filled in by the server for each record.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from '#shared/ui';
import { HFilterForm } from '#shared/widgets/filter/HFilterForm.js';
import { describeQueryParameters, resolveQueryParameters } from '#shared/data/queryParameters.js';
import {
  CMS_FILTER_LIMITS, CMS_FILTER_MODULES, cmsFilterFormValues, cmsFilterKeys, cmsFilterLinkValue, cmsFilterParameters, cmsFilterQuery,
  cmsFilterReference, cmsFilterSettings, cmsFilterTarget, normalizeCmsFilterValues
} from '#shared/site/cmsSavedFilter.js';
import { formDialog } from './designerDialogs.js';

/** Dialog id of the popup (above the form that opens it). */
const DIALOG_ID = 'h-cms-saved-filter';

/** Field types that can not be a value of a link (phase B). */
const NO_VALUE_TYPES = new Set(['file', 'blocktext', 'separator', 'relmarker']);

/**
 * Fields of record types as values from the record (phase B): their concept codes (stored), names, sorted; every
 * record type without a list.
 *
 * @param {object} dbdefs HDbDefs.
 * @param {number[]} [rectypeIds]
 * @returns {Array<{id: string, label: string}>}
 */
export function recordFilterFieldTerms(dbdefs, rectypeIds = []) {
  const types = rectypeIds.length ? rectypeIds : (dbdefs?.rectypes?.() || []).map((type) => Number(type.id));
  const terms = new Map();
  for (const type of types) {
    for (const field of dbdefs?.fields?.(type) || []) {
      if (NO_VALUE_TYPES.has(field.type)) continue;
      const code = dbdefs.fieldGlobal?.(field.id)?.concept || String(field.id);
      if (!terms.has(code)) terms.set(code, { id: code, label: field.name });
    }
  }
  return [...terms.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The record types of a query of Record cards: its `t` predicates (top level), e.g. `{"t": "10,12"}`.
 *
 * @param {*} query
 * @returns {number[]}
 */
export function queryRecordTypes(query) {
  const types = new Set();
  for (const item of [query].flat()) {
    if (!item || typeof item !== 'object') continue;
    for (const id of String(item.t ?? '').split(',')) if (Number(id) > 0) types.add(Number(id));
  }
  return [...types];
}

/**
 * The record types of records (`GET /records?ids=`), for the fields of values from the record.
 *
 * @param {object} apiClient
 * @param {number[]} ids
 * @returns {Promise<number[]>}
 */
export async function recordTypesOf(apiClient, ids = []) {
  const list = [...new Set(ids.map(Number).filter((id) => id > 0))];
  if (!list.length || !apiClient) return [];
  const answer = await apiClient.get('/records', { query: { ids: list.join(','), fields: 'rec_ID,rec_RecTypeID', limit: list.length } });
  const records = answer?.records || answer?.data?.records || [];
  return [...new Set(records.map((record) => Number(record.rec_RecTypeID)).filter((id) => id > 0))];
}

/**
 * Pages of the website that can show records (a target of a Saved filter): Home and the menu pages, not record pages;
 * with the module types of each page (site summary `modules`). A summary without `modules` (an older server): every
 * page, not known whether it has an Explorer.
 *
 * @param {{id: number, title?: string, modules?: string[], pages?: Array}|null} site Summary of the website.
 * @param {string} [homeLabel]
 * @returns {Array<{id: number, label: string, explorer: boolean|null}>}
 */
export function filterPageTerms(site, homeLabel = 'Home') {
  if (!site) return [];
  const terms = [];
  const add = (page, label) => {
    const modules = Array.isArray(page.modules) ? page.modules : null;
    if (modules && !modules.some((type) => CMS_FILTER_MODULES.includes(type))) return;
    terms.push({ id: Number(page.id), label, explorer: modules ? modules.includes('explorer') : null });
  };
  add(site, $HR(homeLabel));
  const walk = (pages, depth) => {
    for (const page of pages || []) {
      if (!page.record) add(page, `${'  '.repeat(depth)}${page.title || `#${page.id}`}`);
      walk(page.children, depth + 1);
    }
  };
  walk(site.pages, 1);
  return terms;
}

/**
 * The values of a Filter Form as stored values: empty ones left out, numbers as strings, lists of strings, a map extent
 * as a WKT rectangle (review 2026-11-15); null when a value can not be kept in a link.
 *
 * @param {object} values HFilterForm.getValues().
 * @returns {object|null}
 */
export function formFilterValues(values = {}) {
  const result = {};
  for (const [name, given] of Object.entries(values || {})) {
    const value = cmsFilterLinkValue(given);
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
    if (Array.isArray(value)) {
      if (value.some((item) => typeof item === 'object' && item !== null)) return null;
      result[name] = value.filter((item) => item != null && item !== '').map(String);
    } else if (typeof value === 'string' || typeof value === 'number') {
      result[name] = String(value);
    } else {
      return null;
    }
  }
  return result;
}

/**
 * Why a Saved filter can not be saved, or null: the source, the page, the limits; a parametrized source needs at least
 * one value when the target page has no Explorer.
 *
 * @param {{source?: number, page?: number, values?: object}} value
 * @param {{parameters?: string[], explorer?: boolean|null}} [options] The parameters of the source; whether the target
 *        page has an Explorer (null: not known).
 * @returns {string|null} A message for the designer.
 */
export function savedFilterIssue(value = {}, { parameters = [], explorer = null } = {}) {
  if (!cmsFilterTarget({ source: value.source, filter: value.filter })) return $HR('Choose a query source or a saved filter');
  if (!(Number(value.page) > 0)) return $HR('Choose the target page');
  const { values, dropped } = normalizeCmsFilterValues(value.values);
  if (dropped) {
    return `${$HR('Too many or too long values')}: ${CMS_FILTER_LIMITS.values} / ${CMS_FILTER_LIMITS.length} / ${CMS_FILTER_LIMITS.items}`;
  }
  if (!cmsFilterQuery({ source: value.source, filter: value.filter }, values)) return $HR('The values are too long for a link');
  const given = parameters.filter((name) => Object.hasOwn(values, name));
  if (parameters.length && !given.length && explorer !== true) {
    return $HR('Give at least one value: the modules of this page show the records without a form');
  }
  return null;
}

/**
 * A short text of a Saved filter: the query source (or saved filter), the page and the number of values.
 *
 * @param {{source?: number, filter?: number, page?: number, values?: object}|null} value
 * @param {{sources?: Array<{id: number, title: string}>, filters?: Array<{id: number, title: string}>,
 *          pages?: Array<{id: number, label: string}>}} [names]
 * @returns {string}
 */
export function savedFilterSummary(value, { sources = [], filters = [], pages = [] } = {}) {
  const target = value ? cmsFilterTarget({ source: value.source, filter: value.filter }) : null;
  if (!target) return '';
  const list = target.kind === 'filter' ? filters : sources;
  const source = list.find((item) => Number(item.id) === target.id)?.title || `#${target.id}`;
  const page = pages.find((item) => Number(item.id) === Number(value.page))?.label?.trim() || `#${value.page}`;
  const count = Object.keys(value.values || {}).length;
  return `${source} → ${page}${count ? ` · ${count} ${$HR(count === 1 ? 'value' : 'values')}` : ''}`;
}

/**
 * The popup Saved filter.
 *
 * @param {object} services `querySources()` → [{id, title}] (public ones), `querySourceDefinition(id)` → the normalized
 *        query source, `savedFilters()` / `savedFilterDefinition(id)` the same for the saved filters of "Website filters"
 *        (plan 27l §7.2), `filterPages()` → filterPageTerms, `apiClient`, `dbdefs`, `selectExtent` (the Filter Form).
 * @param {{source?: number, filter?: number, page?: number, values?: object}|null} [value]
 * @param {{recordFields?: (() => Promise<Array<{id: string, label: string}>>)|null, search?: boolean}} [options] A record
 *        context (phase B): the fields offered as values from the record; `search` a search box (plan 27k §6): the
 *        parameter that takes the typed text (`param` of the answer), no value needed.
 * @returns {Promise<{source?: number, filter?: number, page: number, values: object, param?: string}|null>}
 */
export async function openSavedFilterForm(services, value = null, { recordFields = null, search = false } = {}) {
  const { sources, filters } = await names(services);
  const pages = services.filterPages?.() || [];
  const form = element('form', 'h-cms-form h-cms-saved-filter-form');
  const help = element('div', 'h-cms-style-note');
  help.textContent = $HR('The link opens the target page with the records of the query source or saved filter.');
  // one list: query sources, then saved filters of "Website filters" (plan 27l §7.2); the value is `source:<id>` / `filter:<id>`
  const current = cmsFilterTarget({ source: value?.source, filter: value?.filter });
  const source = select([['', $HR('Choose a query source or a saved filter')],
    ...sources.map((item) => [`source:${item.id}`, `${item.title || `#${item.id}`} [${$HR('source')}]`]),
    ...filters.map((item) => [`filter:${item.id}`, `${item.title || `#${item.id}`} [${$HR('filter')}]`])],
  current ? `${current.kind}:${current.id}` : '');
  const chosenTarget = () => {
    const [kind, id] = String(source.value || '').split(':');
    return cmsFilterTarget({ kind, id });
  };
  const page = select([['', $HR('Choose the target page')], ...pages.map((item) => [String(item.id), item.label])],
    value?.page ? String(value.page) : '');
  // the values below a line (plan 27n1 §3a); values from the record (phase B): a select beside each input (§3b-c)
  const valuesHost = element('div', 'h-cms-saved-filter-values');
  const fieldTerms = recordFields ? await recordFields().catch(() => []) : null;
  const problems = element('div', 'h-cms-style-problems');
  form.append(help, line('Query source', source), line('Target page', page), valuesHost, problems);
  const stored = value?.values || {};
  const constants = Object.fromEntries(Object.entries(stored).filter(([, item]) => !cmsFilterReference(item)));
  if (!sources.length && !filters.length) problems.textContent = $HR('There is no public query source or website filter in this database.');
  // the Filter Form of the chosen source, made again for another source
  const state = { definition: null, form: null, parameters: [], turn: 0, references: new Map() };
  // values from the record: a select per parameter beside its input of the Filter Form, else a row below it
  const showReferences = (references, rest) => {
    state.references = new Map();
    if (!fieldTerms || !state.parameters.length) return;
    const described = describeQueryParameters(state.definition.source.query, services.dbdefs) || {};
    for (const name of state.parameters) {
      const choice = select([['', '—'], ['id', $HR('Record ID')], ...fieldTerms.map((term) => [`field:${term.id}`, term.label])], '');
      choice.classList.add('h-cms-saved-filter-from');
      choice.title = $HR('Or from the record');
      const current = cmsFilterReference(references[name]);
      if (current) choice.value = current === 'id' ? 'id' : `field:${current}`;
      const host = [...valuesHost.querySelectorAll('[data-h-param]')].find((item) => item.dataset.hParam === name);
      if (host) {
        host.classList.add('h-cms-saved-filter-row');
        host.append(choice);
      } else {
        const label = described[name]?.label ? `${described[name].label} (${name})` : name;
        rest.append(line(label, choice, false));
      }
      state.references.set(name, choice);
    }
  };
  const showValues = async (values, references = {}) => {
    const turn = ++state.turn;
    await state.form?.destroy?.();
    state.form = null;
    state.definition = null;
    state.parameters = [];
    state.param = null;
    valuesHost.replaceChildren();
    state.references = new Map();
    const target = chosenTarget();
    if (!target) return;
    let definition;
    try {
      definition = target.kind === 'filter' ? await services.savedFilterDefinition(target.id) : await services.querySourceDefinition(target.id);
    } catch (error) {
      if (turn === state.turn) valuesHost.textContent = error?.message || String(error);
      return;
    }
    if (turn !== state.turn) return;
    state.definition = definition;
    state.parameters = cmsFilterParameters(definition);
    if (!state.parameters.length) {
      const note = element('div', 'h-cms-style-note');
      note.textContent = $HR(search ? 'This query source has no parameters: a search box needs one.' : 'This query source has no parameters.');
      valuesHost.append(note);
      return;
    }
    if (search) {
      // a search box (plan 27k §6): the parameter that takes the typed text; only text, number and date parameters
      // (review 2026-11-16: not terms, places, records or ranges)
      const described = describeQueryParameters(definition.source.query, services.dbdefs) || {};
      const typed = searchParameters(described, services.dbdefs).filter((name) => state.parameters.includes(name));
      if (!typed.length) {
        const note = element('div', 'h-cms-style-note');
        note.textContent = $HR('A search box needs a parameter of a text, number or date field: this query source has none.');
        valuesHost.append(note);
      } else {
        state.param = select(typed.map((name) => [name, described[name]?.label ? `${described[name].label} (${name})` : name]),
          typed.includes(value?.param) ? value.param : typed[0]);
        valuesHost.append(line('The typed text is the value of', state.param));
      }
    }
    // the instruction below the line (plan 27n1 §3)
    const note = element('div', 'h-cms-style-note');
    note.textContent = $HR(fieldTerms
      ? 'Set some or all values of the chosen filter in advance. Type a fixed value, or pick a field of the record: each record '
        + 'then fills in its own value. Values left empty: Explorer asks for them, other modules leave them out.'
      : 'Set some or all values of the chosen filter in advance. Values left empty: Explorer asks for them, other modules leave '
        + 'them out.');
    valuesHost.append(note);
    if (fieldTerms) {
      const head = element('div', 'h-cms-saved-filter-head');
      const value = element('span');
      value.textContent = $HR('Value');
      const from = element('span');
      from.textContent = $HR('Or from the record');
      head.append(value, from);
      valuesHost.append(head);
    }
    const host = element('div', fieldTerms ? 'h-cms-saved-filter-inputs has-record' : 'h-cms-saved-filter-inputs');
    const rest = element('div', 'h-cms-saved-filter-rest');
    valuesHost.append(host, rest);
    state.form = new HFilterForm().attach(host, {
      definition: { query: definition.source.query, filterForm: definition.filterForm || null },
      values: cmsFilterFormValues(values || {}),
      dbdefs: services.dbdefs,
      // the map extent of Explorer (bridge selectExtent, review 2026-11-15); without it the input is disabled
      selectExtent: services.selectExtent || null,
      apiClient: services.apiClient || null,
      composeQuery: (item, given) => resolveQueryParameters(item.query, given, item.filterForm),
      runtimeMode: 'published',
      // the values are kept, nothing runs here
      onSubmit: () => {}
    }).render();
    showReferences(references, rest);
  };
  source.addEventListener('change', () => void showValues({}));
  await showValues(constants, stored);
  const read = () => {
    problems.textContent = '';
    const values = state.form ? formFilterValues(state.form.getValues()) : {};
    if (values === null) {
      problems.textContent = $HR('A value of this form can not be kept in a link (for example an extent).');
      return null;
    }
    for (const [name, choice] of state.references) {
      if (choice.value === 'id') values[name] = { record: 'id' };
      else if (choice.value.startsWith('field:')) values[name] = { field: choice.value.slice(6) };
    }
    const result = { ...cmsFilterKeys(chosenTarget()), page: Number(page.value) || 0, values };
    const target = pages.find((item) => item.id === result.page);
    // a search box: the typed text is a value, none is needed here
    const issue = search && chosenTarget() && !state.param?.value ? $HR('A search box needs a query source or saved filter with a parameter')
      : savedFilterIssue(result, { parameters: state.parameters, explorer: search ? true : target ? target.explorer : null });
    if (issue) {
      problems.textContent = issue;
      return null;
    }
    if (search) {
      // a stored value of the typed parameter is left out (the typed text replaces it)
      const settings = cmsFilterSettings(result);
      delete settings.values?.[state.param.value];
      return { ...settings, param: state.param.value };
    }
    return cmsFilterSettings(result);
  };
  return formDialog(form, 'Saved filter', 'OK', read, source, 'h-dialog-cms-saved-filter', DIALOG_ID)
    .finally(() => void state.form?.destroy?.());
}

/**
 * The Saved filter of an action menu row: its summary and the button that opens the popup.
 *
 * @param {object} services See openSavedFilterForm.
 * @param {object|null} [value] `{source, page, values}`.
 * @returns {{element: HTMLElement, value: () => object|null}}
 */
export function savedFilterPicker(services, value = null, { recordFields = null, search = false } = {}) {
  let current = value && cmsFilterTarget({ source: value.source, filter: value.filter }) ? value : null;
  const host = element('span', 'h-cms-saved-filter');
  const text = element('span', 'h-cms-saved-filter-text');
  const edit = element('button', 'h-btn h-compact');
  edit.type = 'button';
  edit.title = $HR('Define the saved filter');
  edit.innerHTML = '<i class="fa-solid fa-filter" aria-hidden="true"></i>';
  edit.setAttribute('aria-label', edit.title);
  // not defined yet: the button says so (review 27n §19.23d); defined: its summary and the filter icon to change it
  const show = async () => {
    text.textContent = current ? savedFilterSummary(current, await names(services)) : '';
    text.hidden = !current;
    edit.innerHTML = current ? '<i class="fa-solid fa-filter" aria-hidden="true"></i>'
      : `<i class="fa-solid fa-filter" aria-hidden="true"></i> ${$HR('Define saved filter')}`;
  };
  edit.addEventListener('click', async () => {
    const answer = await openSavedFilterForm(services, current, { recordFields, search });
    if (!answer) return;
    current = answer;
    await show();
    // a form in the element panel applies it (panelForms.showDomForm)
    host.dispatchEvent(new Event('change', { bubbles: true }));
  });
  host.append(text, edit);
  void show();
  return { element: host, value: () => current };
}

/**
 * The Saved filter of an HEditForm form (`onReady`): the read-only field `name` shows the summary, a button after it
 * opens the popup; the value is kept in `holder.value`.
 *
 * @param {object} edit HEditForm.
 * @param {object} services See openSavedFilterForm.
 * @param {{value: object|null}} holder
 * @param {string} [name='savedFilter'] The read-only field.
 */
export function attachSavedFilter(edit, services, holder, name = 'savedFilter', { recordFields = null } = {}) {
  const hostOf = () => {
    const widget = edit.getFieldWidget?.(name);
    return widget?.container?.querySelector?.('.h-edit-field-value') || widget?.container || null;
  };
  if (!hostOf()) return;
  const button = element('button', 'h-btn h-compact h-cms-saved-filter-edit');
  button.type = 'button';
  button.title = $HR('Define the saved filter');
  button.setAttribute('aria-label', button.title);
  button.innerHTML = '<i class="fa-solid fa-filter" aria-hidden="true"></i>';
  // the summary is written first: writing a value draws the field again, the button is put after it each time (review
  // 2026-11-15: it was removed at once)
  const show = async () => {
    await edit.setValue?.(name, holder.value ? savedFilterSummary(holder.value, await names(services)) : $HR('Not defined'));
    const host = hostOf();
    if (host && button.parentElement !== host) host.append(button);
  };
  button.addEventListener('click', async () => {
    // a record context (phase B): the fields of the records chosen in the form now
    const fields = recordFields ? () => recordFields(edit.getValues()) : null;
    const answer = await openSavedFilterForm(services, holder.value, { recordFields: fields });
    if (!answer) return;
    holder.value = answer;
    await show();
  });
  hostOf().append(button);
  void show();
}

/** The read-only field of attachSavedFilter, shown with the action Saved filter. */
export function savedFilterField(showWhen) {
  return { name: 'savedFilter', type: 'freetext', label: 'Saved filter', max: 1, readOnly: true, showWhen };
}

/** Field types whose value can be typed into a search box (review 2026-11-16). */
const SEARCH_FIELD_TYPES = Object.freeze(['freetext', 'blocktext', 'integer', 'float', 'year', 'numeric', 'date']);

/** Predicates without a field whose value can be typed into a search box: title, ids, URL, notes, dates of the record. */
const SEARCH_PREDICATES = Object.freeze(['title', 'id', 'ids', 'url', 'notes', 'added', 'modified']);

/**
 * The parameters of a query source that a search box can take (review 2026-11-16): a text, number or date, of a field of
 * such a type (not a term, a place, a record pointer or a file) or of the title, ids, URL, notes, added and modified
 * dates; not a part of a range (two inputs).
 *
 * @param {Object<string, object>} described describeQueryParameters().
 * @param {object} [dbdefs] HDbDefs (the type of a field).
 * @returns {string[]} Parameter names.
 */
export function searchParameters(described = {}, dbdefs = null) {
  const ends = new Set(Object.values(described).map((item) => item?.endInput).filter(Boolean));
  return Object.entries(described).filter(([name, item]) => {
    if (!item || ends.has(name) || item.range || !['text', 'number', 'date'].includes(item.type)) return false;
    // a text of a term (f:N:label ...) or the count of values: a typed value is fine
    if (item.enumPart || item.count) return true;
    if (item.fieldId) {
      const type = dbdefs?.fieldGlobal?.(Number(item.fieldId))?.type;
      return !type || SEARCH_FIELD_TYPES.includes(type);
    }
    return SEARCH_PREDICATES.includes(item.predicate);
  }).map(([name]) => name);
}

/**
 * A Saved filter of stored settings (`{source, page|target, values}`), or null; a search box (action `search`, plan 27k
 * §6) with its `param`, the value of the typed text.
 */
export function storedSavedFilter(settings = {}) {
  if (settings?.action === 'search') return { ...cmsFilterSettings(settings), param: String(settings.param || '') };
  return settings?.action === 'savedFilter' ? cmsFilterSettings(settings) : null;
}

/** Names of the summary: the query sources and saved filters (cached by the services) and the pages. */
async function names(services) {
  const [sources, filters] = await Promise.all([services.querySources?.().catch(() => []) ?? [],
    services.savedFilters?.().catch(() => []) ?? []]);
  return { sources: sources || [], filters: filters || [], pages: services.filterPages?.() || [] };
}

function select(options, value) {
  const node = element('select', 'h-select h-compact');
  for (const [key, label] of options) {
    const option = element('option');
    option.value = key;
    option.textContent = label;
    node.append(option);
  }
  node.value = value;
  return node;
}

function line(label, control, translate = true) {
  const node = element('label', 'h-cms-styles-field');
  const caption = element('span');
  caption.textContent = translate ? $HR(label) : label;
  node.append(caption, control);
  return node;
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
