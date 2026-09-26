/**
 * @file legacyFacetedSearch.js
 * @brief Convert a legacy faceted search (version 2) to a parameterized query and filterForm layout.
 *
 * Part of the removable legacy Saved Filter conversion module (plan §3, §7–§9). Pure and DOM-free.
 * Mirrors legacy `search_faceted.js` `_initFacetQueries` with the new query keys:
 * pointers `lt:<dty>`/`lf:<dty>`, relations `related` (or `rt`/`rf` when directed) constrained by
 * `{r:<relmarker vocabulary root>}`.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { normalizeJsonQuery, parseJson, relationTypePredicate, strictTextToJson } from './legacyQuery.js';
import { convertLegacyRules } from './legacyRules.js';

const FT_INPUT = 0;
const FT_SLIDER = 1;
const FT_LIST = 2;
const FT_COLUMN = 3;

const RANGE_TYPES = new Set(['date', 'year', 'integer', 'float']);
const HEADER_FIELDS = new Set(['title', 'added', 'modified', 'url', 'notes', 'addedby', 'owner']);
const UNSUPPORTED_FIELDS = new Set(['typename', 'typeid']);
const DATE_GROUPS = new Set(['month', 'year', 'decade', 'century']);
/** Legacy default `viewport`, and the list size standing for "show all" (`viewport: 0`). */
const LEGACY_VIEWPORT = 5;
const VIEWPORT_ALL = 1000;
/** HFilterForm's default list size (not imported: this module stays DOM-free). */
const DEFAULT_LIST_THRESHOLD = 20;

/**
 * Convert a parsed faceted-search definition.
 *
 * @param {object} definition Legacy faceted definition (`rectypes`, `facets`, `version:2`, …).
 * @param {{dbdefs?: object|null}} [options] Database definitions for relmarker roots and labels.
 * @returns {{definition: object, warnings: string[]}} Saved-filter definition and warnings.
 */
export function convertFacetedSearch(definition, { dbdefs = null } = {}) {
  const warnings = [];
  const context = { dbdefs, warnings };
  const rectypes = (definition.rectypes || []).map(String).filter(Boolean);
  const query = rectypes.length ? [{ t: rectypes.join(',') }] : [];
  const children = [];

  const facets = (definition.facets || [])
    .map((facet, index) => ({ facet, index }))
    .sort((a, b) => orderOf(a) - orderOf(b))
    .map(({ facet }) => facet);

  let counter = 0;
  for (const facet of facets) {
    if (!facet?.code || facet.var == null) continue;
    const path = facetPath(facet, context);
    if (!path) continue;

    const name = `X${++counter}`;
    const isRange = RANGE_TYPES.has(facet.type) && isFacetMode(facet) !== FT_INPUT;
    const operator = facet.srange === 'between' ? '><' : '<>';
    // detail dates only accept the prefix form `<>from/to` (`from<>to` is rejected); numbers use `from<>to`
    const value = !isRange ? `$${name}$`
      : facet.type === 'date' ? `${operator}$${name}$/$${name}_to$` : `$${name}$<>$${name}_to$`;

    insertPath(query, path, value);
    children.push(layoutChild(name, facet, path, isRange, dbdefs));
  }

  appendRuntimeFilters(definition, query, children, warnings);
  const preliminarySort = appendPreliminaryFilter(definition, query, context);
  query.push({ sortby: String(definition.sort_order ?? '').trim() || preliminarySort || 't' });

  const filterForm = { version: 1, groups: [{ id: 'main', type: 'section', children }] };
  const settings = formSettings(definition);
  if (Object.keys(settings).length) filterForm.settings = settings;

  const result = {
    q: query,
    w: domainOf(definition.domain),
    rules: convertLegacyRules(definition.rules, warnings),
    rulesonly: Number(definition.rulesonly) || 0,
    filterForm
  };
  const title = String(definition.ui_title || '').trim();
  if (title) result.title = title;
  return { definition: result, warnings };
}

/**
 * Translate a facet code into link steps and a leaf predicate key.
 *
 * @param {object} facet Legacy facet.
 * @param {{dbdefs?: object|null, warnings: string[]}} context Definitions and warning sink.
 * @returns {{steps: Array<object>, leaf: string, fieldId: number|null, rectypeId: string}|null}
 *   Path, or `null` when the facet cannot be converted (a warning is recorded).
 */
function facetPath(facet, context) {
  const code = String(facet.code).split(':');
  if (/^(lt|lf|rt|rf)\d*$/.test(code.at(-1))) code.push('0', 'title');

  const steps = [];
  for (let index = 1; index < code.length - 1; index += 2) {
    const token = code[index];
    const match = /^(lt|lf|rt|rf)(\d*)$/.exec(token);
    if (!match) {
      context.warnings.push(`Facet “${facet.title || facet.code}” has an unreadable path (${facet.code}) and was skipped.`);
      return null;
    }
    const target = code[index + 1];
    const [, kind, field] = match;
    const step = { target: target && target !== '0' ? target : null };
    if (kind === 'lt' || kind === 'lf') {
      step.key = field ? `${kind}:${field}` : kind;
    } else {
      step.key = facet.relation === 'directed' ? kind : 'related';
      step.relation = field ? relationTypePredicate(field, context) : null;
    }
    steps.push(step);
  }

  const field = code.at(-1);
  if (UNSUPPORTED_FIELDS.has(field)) {
    context.warnings.push(`Facet “${facet.title || facet.code}” (record type selector) is not supported and was skipped.`);
    return null;
  }

  let leaf;
  let fieldId = null;
  if (/^\d+$/.test(field)) { fieldId = Number(field); leaf = `f:${fieldId}`; }
  else if (field.startsWith('r.')) leaf = `relf:${field.slice(2)}`;
  else if (field === 'ids') leaf = 'ids';
  else if (HEADER_FIELDS.has(field)) leaf = field;
  else {
    context.warnings.push(`Facet “${facet.title || facet.code}” uses an unknown field (${field}) and was skipped.`);
    return null;
  }

  return { steps, leaf, fieldId, rectypeId: code.at(-2) };
}

/**
 * Add a leaf predicate at the end of a path, sharing existing branches (legacy `__checkEntry`).
 *
 * @param {Array<object>} query Top-level query array (mutated).
 * @param {{steps: Array<object>, leaf: string}} path Facet path.
 * @param {string} value Placeholder value.
 * @returns {void}
 */
function insertPath(query, path, value) {
  let level = query;
  for (const step of path.steps) {
    let branch = level.find((predicate) => Array.isArray(predicate[step.key])
      && sameBranch(predicate[step.key], step));
    if (!branch) {
      const list = [];
      if (step.target) list.push({ t: step.target });
      if (step.relation) list.push({ ...step.relation });
      branch = { [step.key]: list };
      level.push(branch);
    }
    level = branch[step.key];
  }
  level.push({ [path.leaf]: value });
}

/** Whether an existing branch list has the step's target type and relation constraint. */
function sameBranch(list, step) {
  const type = list.find((item) => Object.hasOwn(item, 't'))?.t ?? null;
  const relation = list.find((item) => Object.hasOwn(item, 'r'))?.r ?? null;
  return String(type ?? '') === String(step.target ?? '')
    && String(relation ?? '') === String(step.relation?.r ?? '');
}

/**
 * Build the layout child for one facet (only overrides are stored).
 *
 * @returns {object} Layout child.
 */
function layoutChild(name, facet, path, isRange, dbdefs) {
  const child = { input: name };
  const title = String(facet.title || '').trim();
  const fieldName = path.fieldId ? dbdefs?.fieldName?.(path.rectypeId, path.fieldId) : null;
  if (title && title !== fieldName) child.label = title;

  const help = String(facet.help || '').trim();
  if (help) child.help = help;

  // legacy slider mode (1): a slider whose bounds the form requests (detail=minmax, plan §12 #10)
  if (isRange) child.widget = { type: 'range', control: isFacetMode(facet) === FT_SLIDER ? 'slider' : 'direct' };
  // a date list grouped by month/year/…
  if (isRange && facet.type === 'date') {
    const mode = isFacetMode(facet);
    if (mode === FT_LIST || mode === FT_COLUMN) {
      child.mode = 'radio';
      if (mode === FT_LIST) child.orientation = 'inline';
      child.groupBy = DATE_GROUPS.has(facet.groupby) ? facet.groupby : 'year';
    }
  }

  if (facet.type === 'enum' || facet.type === 'relationtype') {
    const mode = isFacetMode(facet);
    if (mode === FT_LIST || mode === FT_COLUMN) {
      child.mode = facet.multisel ? 'checkbox' : 'radio';
      if (mode === FT_LIST) child.orientation = 'inline';
    }
    if (facet.multisel) child.multiple = true;
  }
  return child;
}

/**
 * Form-wide presentation settings (only values that differ from the new defaults
 * are written; the designer drops the rest anyway).
 *
 * @param {object} definition Legacy faceted definition.
 * @returns {object} `filterForm.settings`.
 */
function formSettings(definition) {
  const settings = {};
  if (!definition.search_on_reset) settings.skipEmptySearch = true;
  if (definition.title_hierarchy === true || definition.title_hierarchy === 'true') settings.showHierarchy = true;
  if (definition.accordion_view === true || definition.accordion_view === 'true') settings.accordion = true;

  // legacy `viewport`: items shown before "more"; 0 = all, missing/invalid = 5
  const viewport = Number(definition.viewport);
  const listThreshold = viewport === 0 ? VIEWPORT_ALL : viewport > 0 ? Math.round(viewport) : LEGACY_VIEWPORT;
  if (listThreshold !== DEFAULT_LIST_THRESHOLD) settings.listThreshold = listThreshold;

  // legacy defaults are the new ones: counts as badges at the right
  if (definition.ui_counts_align === 'left') settings.countsAlign = 'label';
  if (definition.ui_counts_mode === 'bracket') settings.countsMode = 'brackets';
  else if (definition.ui_counts_mode === 'none') settings.countsMode = 'none';
  return settings;
}

/** Add the “search everything” and map-extent form fields and the initial spatial/temporal filters. */
function appendRuntimeFilters(definition, query, children, warnings) {
  if (definition.ui_additional_filter) {
    query.push({ f: '$SEARCH$' });
    const label = String(definition.ui_additional_filter_label || '').trim();
    children.push(label ? { input: 'SEARCH', label } : { input: 'SEARCH', label: 'Search everything' });
  }

  // legacy applies the initial area only when `ui_spatial_filter_init` is set;
  // otherwise it merely seeds the map digitizer, which has no equivalent here
  const area = definition.ui_spatial_filter_init ? spatialValue(definition.ui_spatial_filter_initial) : null;
  if (definition.ui_spatial_filter) {
    // shown spatial filter -> a GEO form field; the initial area is its default value
    query.push({ geo: '$GEO$' });
    const child = { input: 'GEO' };
    const label = String(definition.ui_spatial_filter_label || '').trim();
    if (label) child.label = label;
    if (area) child.default = area;
    children.push(child);
  } else if (area) {
    // hidden spatial filter still applied at start -> literal predicate
    query.push({ geo: area });
  }

  const temporal = String(definition.ui_temporal_filter_initial || '').trim();
  if (temporal) {
    const json = parseJson(temporal) ?? strictTextToJson(temporal);
    if (json) query.push(...normalizeJsonQuery(json));
    else warnings.push(`Initial time filter could not be converted and was dropped: ${temporal}`);
  }
}

/**
 * Merge the preliminary filter when it was initially active; the on/off toggle is dropped.
 *
 * @returns {string|null} The preliminary filter's own `sortby`, if any.
 */
function appendPreliminaryFilter(definition, query, context) {
  const text = definition.sup_filter;
  if (text == null || String(text).trim() === '' || !preliminaryFilterActive(definition)) return null;

  const json = parseJson(text) ?? strictTextToJson(text);
  if (!json) {
    context.warnings.push(`The preliminary filter could not be converted and was not applied. Please convert it manually: ${text}`);
    return null;
  }
  const predicates = normalizeJsonQuery(json, context);
  query.push(...predicates.filter((item) => !Object.hasOwn(item, 'sortby')));
  return predicates.find((item) => Object.hasOwn(item, 'sortby'))?.sortby ?? null;
}

/** Legacy `_use_sup_filter` initial state. */
function preliminaryFilterActive(definition) {
  if (!definition.ui_prelim_filter_toggle) return true;
  const checked = !Object.hasOwn(definition, 'ui_prelim_filter_toggle_init')
    || Boolean(definition.ui_prelim_filter_toggle_init);
  const reverse = Number(definition.ui_prelim_filter_toggle_mode) === 1;
  return checked !== reverse;
}

/** Legacy `isfacet` → numeric mode (`true`/null → 1, `false` → 0). */
function isFacetMode(facet) {
  const value = facet.isfacet;
  if (value == null || value === true) return 1;
  if (value === false) return 0;
  const mode = Number(value);
  return Number.isInteger(mode) ? mode : 1;
}

/** Facet sort key: `order`, else original position. */
function orderOf({ facet, index }) {
  const order = Number(facet?.order);
  return Number.isFinite(order) ? order : index;
}

/** Legacy `domain` → request `w`. */
export function domainOf(value) {
  return value === 'b' || value === 'bookmark' ? 'bookmark' : 'all';
}

/** Initial spatial filter: WKT string or `{geo: WKT}`. */
function spatialValue(value) {
  if (!value) return null;
  if (typeof value === 'object') return value.geo || null;
  const text = String(value).trim();
  const json = parseJson(text);
  if (json && typeof json === 'object') return json.geo || null;
  return text || null;
}
