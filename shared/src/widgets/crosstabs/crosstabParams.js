/**
 * @file crosstabParams.js
 * @brief The Filter Form of the parameters of a crosstab's own query (review 2026-11-23): shown above the crosstab in
 *        the Explorer pane and on the website while the query has parameters (other than `$SELECTED$`); Filter counts
 *        again and the form stays. The form is rendered into an inner element, so the host keeps its classes, and
 *        follows the orientation of the stored Filter Form (`filterForm.settings.orientation`).
 *
 *   const params = new CrosstabParams(host, { dbdefs, apiClient, onSubmit: (values) => recount(values) });
 *   params.show(preset, values);   // the form of the crosstab (built again only for another crosstab)
 *   params.hide();                 // Current result, no parameters
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HFilterForm } from '../filter/HFilterForm.js';
import { describeQueryParameters, resolveQueryParameters } from '../../data/queryParameters.js';
import { $HR } from '../../ui/i18n/HResource.js';
import { ownQuery, readQuery, SELECTED_PARAMETER } from '../../data/presentationSource.js';
import './crosstabParams.css';

/**
 * The parameters of an own query the visitor gives in the form (not `$SELECTED$`).
 *
 * @param {*} query Query template.
 * @returns {string[]}
 */
export function askedParameters(query) {
  return ownQuery(query ?? null).names.filter((name) => name !== SELECTED_PARAMETER);
}

/**
 * Captions of parameters (review 5): the label of the field in the Filter Form, else the field of the query, else the name.
 *
 * @param {string[]} names Parameter names.
 * @param {*} query Query template.
 * @param {object|null} [filterForm] Filter Form layout (`groups[].children[] {input, label}`).
 * @param {object|null} [dbdefs] HDbDefs.
 * @returns {string[]}
 */
export function parameterCaptions(names, query, filterForm = null, dbdefs = null) {
  const labels = new Map();
  for (const group of filterForm?.groups || []) {
    for (const child of group.children || []) if (child?.input && child.label) labels.set(child.input, child.label);
  }
  let described = null;
  try {
    described = describeQueryParameters(readQuery(query ?? null), dbdefs);
  } catch {
    described = {};
  }
  return (names || []).map((name) => labels.get(name) || described?.[name]?.label || name);
}

/**
 * The message of a crosstab whose own query needs values: "This crosstab needs a value of 'Year', 'Country'".
 *
 * @param {string[]} names Parameter names without a value.
 * @param {*} query Query template.
 * @param {object|null} [filterForm]
 * @param {object|null} [dbdefs]
 * @returns {string}
 */
export function missingValuesText(names, query, filterForm = null, dbdefs = null) {
  const captions = parameterCaptions(names, query, filterForm, dbdefs).map((caption) => `'${caption}'`);
  return `${$HR('This crosstab needs a value of')} ${captions.join(', ')}`;
}

/**
 * The records of an own query with the values given (review 6): the query counts when at least one asked parameter has a
 * value (the empty ones are left out, as in the Filter Form of Explorer); `$SELECTED$` needs the selection.
 *
 * @param {*} query Query template.
 * @param {{values?: object, selection?: number[], filterForm?: object|null, dbdefs?: object|null}} [options]
 * @returns {{q: *, message: string|null}} `q` null: nothing to count, `message` why (null: no query at all).
 */
export function ownCount(query, { values = {}, selection = [], filterForm = null, dbdefs = null } = {}) {
  const own = ownQuery(query ?? null, { values, selection, filterForm });
  if (own.q == null) return { q: null, message: null };
  if (own.missing.includes(SELECTED_PARAMETER)) {
    return { q: null, message: $HR('Select records: the query of the crosstab uses the selection') };
  }
  const asked = own.names.filter((name) => name !== SELECTED_PARAMETER);
  if (asked.length && asked.every((name) => own.missing.includes(name))) {
    return { q: null, message: missingValuesText(asked, query, filterForm, dbdefs) };
  }
  return { q: own.q, message: null };
}

/** The parameter form of a crosstab above it. */
export class CrosstabParams {
  /**
   * @param {HTMLElement} host Element above the crosstab (hidden without a form).
   * @param {object} options
   * @param {object} [options.dbdefs] HDbDefs.
   * @param {object} [options.apiClient] HeuristApiClient (value lists, counts).
   * @param {string} [options.runtimeMode] HFilterForm runtime mode.
   * @param {HTMLElement} [options.layout] The parent of the form and the crosstab: a vertical form is placed at the left
   *        of the crosstab (class `h-crosstab-params-left`), a horizontal one above it (review 6).
   * @param {Function} [options.selectExtent] Map extent picker of geo parameters (Explorer); without it the input is
   *        disabled (a website page).
   * @param {function(object): void} options.onSubmit The values of the form (Filter, a committed value).
   */
  constructor(host, options = {}) {
    this.host = host;
    this.options = options;
    this.form = null;
    this.key = null;
    this.host.classList.add('h-crosstab-params');
    this.host.hidden = true;
  }

  /**
   * Show the form of a crosstab with values; the same crosstab keeps its form (and what the visitor typed).
   *
   * @param {{id?: number, query: *, settings?: {filterForm?: object}}} preset
   * @param {object} [values]
   * @returns {boolean} False when the query has no parameters to give (the form is hidden).
   */
  show(preset, values = {}) {
    if (!askedParameters(preset?.query).length) {
      this.hide();
      return false;
    }
    const filterForm = preset.settings?.filterForm || null;
    const key = JSON.stringify([preset.id || 0, preset.query, filterForm]);
    this.host.hidden = false;
    // vertical (the default of a Filter Form): at the left of the crosstab
    this.options.layout?.classList.toggle('h-crosstab-params-left', filterForm?.settings?.orientation !== 'horizontal');
    if (this.form && key === this.key) return true;
    this._destroyForm();
    this.key = key;
    const inner = document.createElement('div');
    this.host.replaceChildren(inner);
    this.form = new HFilterForm();
    this.form.attach(inner, {
      definition: { query: readQuery(preset.query), filterForm },
      values,
      dbdefs: this.options.dbdefs || null,
      apiClient: this.options.apiClient || null,
      selectExtent: this.options.selectExtent || null,
      composeQuery: (item, given) => resolveQueryParameters(item.query, given, item.filterForm),
      runtimeMode: this.options.runtimeMode || 'main',
      onSubmit: ({ values: given }) => this.options.onSubmit?.({ ...(given || {}) })
    }).render();
    return true;
  }

  /** Remove the form. */
  hide() {
    this._destroyForm();
    this.key = null;
    this.host.replaceChildren();
    this.host.hidden = true;
    this.options.layout?.classList.remove('h-crosstab-params-left');
  }

  /** @private */
  _destroyForm() {
    if (this.form) void this.form.destroy?.();
    this.form = null;
  }
}
