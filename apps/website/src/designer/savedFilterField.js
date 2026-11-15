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
import { resolveQueryParameters } from '#shared/data/queryParameters.js';
import {
  CMS_FILTER_LIMITS, CMS_FILTER_MODULES, cmsFilterFormValues, cmsFilterLinkValue, cmsFilterParameters, cmsFilterQuery,
  cmsFilterSettings, normalizeCmsFilterValues
} from '#shared/site/cmsSavedFilter.js';
import { formDialog } from './designerDialogs.js';

/** Dialog id of the popup (above the form that opens it). */
const DIALOG_ID = 'h-cms-saved-filter';

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
  if (!(Number(value.source) > 0)) return $HR('Choose a query source');
  if (!(Number(value.page) > 0)) return $HR('Choose the target page');
  const { values, dropped } = normalizeCmsFilterValues(value.values);
  if (dropped) {
    return `${$HR('Too many or too long values')}: ${CMS_FILTER_LIMITS.values} / ${CMS_FILTER_LIMITS.length} / ${CMS_FILTER_LIMITS.items}`;
  }
  if (!cmsFilterQuery(value.source, values)) return $HR('The values are too long for a link');
  const given = parameters.filter((name) => Object.hasOwn(values, name));
  if (parameters.length && !given.length && explorer !== true) {
    return $HR('Give at least one value: the modules of this page show the records without a form');
  }
  return null;
}

/**
 * A short text of a Saved filter: the query source, the page and the number of values.
 *
 * @param {{source?: number, page?: number, values?: object}|null} value
 * @param {{sources?: Array<{id: number, title: string}>, pages?: Array<{id: number, label: string}>}} [names]
 * @returns {string}
 */
export function savedFilterSummary(value, { sources = [], pages = [] } = {}) {
  if (!value || !(Number(value.source) > 0)) return '';
  const source = sources.find((item) => Number(item.id) === Number(value.source))?.title || `#${value.source}`;
  const page = pages.find((item) => Number(item.id) === Number(value.page))?.label?.trim() || `#${value.page}`;
  const count = Object.keys(value.values || {}).length;
  return `${source} → ${page}${count ? ` · ${count} ${$HR(count === 1 ? 'value' : 'values')}` : ''}`;
}

/**
 * The popup Saved filter.
 *
 * @param {object} services `querySources()` → [{id, title}] (public ones), `querySourceDefinition(id)` → the normalized
 *        query source, `filterPages()` → filterPageTerms, `apiClient`, `dbdefs`, `selectExtent` (the Filter Form).
 * @param {{source?: number, page?: number, values?: object}|null} [value]
 * @returns {Promise<{source: number, page: number, values: object}|null>}
 */
export async function openSavedFilterForm(services, value = null) {
  const sources = await services.querySources?.().catch(() => []) ?? [];
  const pages = services.filterPages?.() || [];
  const form = element('form', 'h-cms-form h-cms-saved-filter-form');
  const help = element('div', 'h-cms-style-note');
  help.textContent = $HR('The link opens the target page with the records of the query source. Values left empty: '
    + 'Explorer asks for them, other modules leave them out.');
  const source = select([['', $HR('Choose a query source')], ...sources.map((item) => [String(item.id), item.title || `#${item.id}`])],
    value?.source ? String(value.source) : '');
  const page = select([['', $HR('Choose the target page')], ...pages.map((item) => [String(item.id), item.label])],
    value?.page ? String(value.page) : '');
  const valuesHost = element('div', 'h-cms-saved-filter-values');
  const problems = element('div', 'h-cms-style-problems');
  form.append(help, line('Query source', source), line('Target page', page), valuesHost, problems);
  if (!sources.length) problems.textContent = $HR('There is no public query source in this database.');
  // the Filter Form of the chosen source, made again for another source
  const state = { definition: null, form: null, parameters: [], turn: 0 };
  const showValues = async (values) => {
    const turn = ++state.turn;
    await state.form?.destroy?.();
    state.form = null;
    state.definition = null;
    state.parameters = [];
    valuesHost.replaceChildren();
    const id = Number(source.value) || 0;
    if (!id) return;
    let definition;
    try {
      definition = await services.querySourceDefinition(id);
    } catch (error) {
      if (turn === state.turn) valuesHost.textContent = error?.message || String(error);
      return;
    }
    if (turn !== state.turn) return;
    state.definition = definition;
    state.parameters = cmsFilterParameters(definition);
    if (!state.parameters.length) {
      const note = element('div', 'h-cms-style-note');
      note.textContent = $HR('This query source has no parameters.');
      valuesHost.append(note);
      return;
    }
    const caption = element('div', 'h-cms-saved-filter-caption');
    caption.textContent = $HR('Values');
    const host = element('div');
    valuesHost.append(caption, host);
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
  };
  source.addEventListener('change', () => void showValues({}));
  await showValues(value?.values || {});
  const read = () => {
    problems.textContent = '';
    const values = state.form ? formFilterValues(state.form.getValues()) : {};
    if (values === null) {
      problems.textContent = $HR('A value of this form can not be kept in a link (for example an extent).');
      return null;
    }
    const result = { source: Number(source.value) || 0, page: Number(page.value) || 0, values };
    const target = pages.find((item) => item.id === result.page);
    const issue = savedFilterIssue(result, { parameters: state.parameters, explorer: target ? target.explorer : null });
    if (issue) {
      problems.textContent = issue;
      return null;
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
export function savedFilterPicker(services, value = null) {
  let current = value && Number(value.source) > 0 ? value : null;
  const host = element('span', 'h-cms-saved-filter');
  const text = element('span', 'h-cms-saved-filter-text');
  const edit = element('button', 'h-btn h-compact');
  edit.type = 'button';
  edit.title = $HR('Define the saved filter');
  edit.innerHTML = '<i class="fa-solid fa-filter" aria-hidden="true"></i>';
  edit.setAttribute('aria-label', edit.title);
  const show = async () => {
    text.textContent = current ? savedFilterSummary(current, await names(services)) : $HR('Not defined');
  };
  edit.addEventListener('click', async () => {
    const answer = await openSavedFilterForm(services, current);
    if (!answer) return;
    current = answer;
    await show();
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
export function attachSavedFilter(edit, services, holder, name = 'savedFilter') {
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
    const answer = await openSavedFilterForm(services, holder.value);
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

/** A Saved filter of stored settings (`{source, page|target, values}`), or null. */
export function storedSavedFilter(settings = {}) {
  return settings?.action === 'savedFilter' ? cmsFilterSettings(settings) : null;
}

/** Names of the summary: the sources (cached by the services) and the pages. */
async function names(services) {
  const sources = await services.querySources?.().catch(() => []) ?? [];
  return { sources, pages: services.filterPages?.() || [] };
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

function line(label, control) {
  const node = element('label', 'h-cms-styles-field');
  const caption = element('span');
  caption.textContent = $HR(label);
  node.append(caption, control);
  return node;
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
