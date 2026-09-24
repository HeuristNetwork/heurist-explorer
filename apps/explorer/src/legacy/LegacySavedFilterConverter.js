/**
 * @file LegacySavedFilterConverter.js
 * @brief Converts legacy `usrSavedSearches.svs_Query` values into Explorer saved-filter definitions.
 *
 * Removable legacy module: Explorer reaches it only through the optional `legacyConverter`
 * option of `SavedFilterManager`. Delete `src/legacy/` and that wiring once Saved Filters
 * are retired. See docs/development/Saved-Filter-Legacy-Conversion-Plan.md.
 *
 * Handled kinds (plan §0):
 * - `url`        `?q=…&w=…&rules=…&rulesonly=…`
 * - `json`       `{q, w, rules, rulesonly, ui_name, ui_notes}`
 * - `faceted`    faceted search version 2 → parameterized query + filterForm
 * - `faceted-v1` obsolete faceted search → reported “legacy, cannot open”
 * - `text`       plain query text
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

import { convertFacetedSearch, domainOf } from './legacyFacetedSearch.js';
import { normalizeJsonQuery, parseJson, parseUrlParams } from './legacyQuery.js';
import { convertLegacyRules } from './legacyRules.js';

/** Converts legacy saved-filter storage into `{q, w, rules, rulesonly, filterForm?, title?, notes?}`. */
export class LegacySavedFilterConverter {
  /**
   * @param {object} [options] Converter options.
   * @param {Function|null} [options.getDbDefs] Async provider of `HDbDefs`; needed for faceted searches
   *   (relmarker vocabularies and default labels) and legacy relation keys.
   */
  constructor({ getDbDefs = null } = {}) {
    this.getDbDefs = typeof getDbDefs === 'function' ? getDbDefs : null;
  }

  /**
   * Classify a stored value without converting it.
   *
   * @param {*} stored Raw `svs_Query` value (string or parsed object).
   * @returns {'url'|'json'|'faceted'|'faceted-v1'|'text'|'empty'} Legacy kind.
   */
  detect(stored) {
    if (stored == null || (typeof stored === 'string' && !stored.trim())) return 'empty';
    if (typeof stored === 'string' && stored.trim().startsWith('?')) return 'url';

    const value = typeof stored === 'string' ? parseJson(stored) : stored;
    if (!value || typeof value !== 'object') return 'text';
    if (Array.isArray(value)) return 'json';
    if (Array.isArray(value.rectypes)) {
      return Array.isArray(value.facets) && value.facets.some(Array.isArray) ? 'faceted-v1' : 'faceted';
    }
    return 'json';
  }

  /**
   * Whether a stored value opens as a parameterized Filter Form.
   *
   * @param {*} stored Raw `svs_Query` value.
   * @returns {boolean} True for faceted searches (version 2).
   */
  isParameterized(stored) {
    return this.detect(stored) === 'faceted';
  }

  /**
   * Convert a stored value.
   *
   * @param {*} stored Raw `svs_Query` value.
   * @returns {Promise<{status: 'ok'|'warning'|'unsupported', kind: string, definition: object|null,
   *   warnings: string[], legacyQuery: string}>} Conversion result. `definition` is `null` when unsupported.
   */
  async convert(stored) {
    const kind = this.detect(stored);
    const legacyQuery = typeof stored === 'string' ? stored : JSON.stringify(stored ?? '');
    const warnings = [];
    let definition = null;

    if (kind === 'faceted-v1') {
      warnings.push('Legacy faceted search (version 1), cannot open.');
    } else if (kind === 'faceted') {
      const value = typeof stored === 'string' ? parseJson(stored) : stored;
      const converted = convertFacetedSearch(value, { dbdefs: await this._dbdefs() });
      definition = converted.definition;
      warnings.push(...converted.warnings);
      copyNameAndNotes(value, definition);
    } else if (kind === 'url') {
      const params = parseUrlParams(stored);
      definition = await this._request(params, warnings);
      if (params.notes) definition.notes = params.notes;
    } else if (kind === 'json') {
      const value = typeof stored === 'string' ? parseJson(stored) : stored;
      definition = Array.isArray(value)
        ? await this._request({ q: value }, warnings)
        : await this._request(value, warnings);
      if (!Array.isArray(value)) copyNameAndNotes(value, definition);
    } else if (kind === 'text') {
      definition = { q: String(stored).trim(), w: 'all', rules: [], rulesonly: 0 };
    }

    const status = !definition ? 'unsupported' : warnings.length ? 'warning' : 'ok';
    return { status, kind, definition, warnings, legacyQuery };
  }

  /** Build `{q, w, rules, rulesonly}` from URL or JSON request parameters. */
  async _request(params, warnings) {
    return {
      q: await this._query(params.q, warnings),
      w: domainOf(params.w),
      rules: convertLegacyRules(params.rules, warnings),
      rulesonly: Number(params.rulesonly) || 0
    };
  }

  /** JSON queries are normalized (key rewrites); text is left to the server parser. */
  async _query(value, warnings) {
    if (value == null) return '';
    const json = typeof value === 'string' ? parseJson(value) : value;
    if (json === undefined) return String(value).trim();
    const needsDefs = /"(?:related|rt|rf)[a-z_]*:[^"]+"/i.test(JSON.stringify(json));
    return normalizeJsonQuery(json, { dbdefs: needsDefs ? await this._dbdefs() : null, warnings });
  }

  /** Database definitions, or `null` when unavailable. */
  async _dbdefs() {
    if (!this.getDbDefs) return null;
    try { return await this.getDbDefs(); } catch { return null; }
  }
}

/** Copy legacy `ui_name*` / `ui_notes*` keys (localized variants included). */
function copyNameAndNotes(source, definition) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value == null || value === '') continue;
    if (key === 'ui_notes') definition.notes ??= value;
    else if (key.startsWith('ui_name') || key.startsWith('ui_notes')) definition[key] = value;
  }
}
