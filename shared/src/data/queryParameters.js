/**
 * @file queryParameters.js
 * @brief Find and resolve named values in a Heurist query template.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { extentToWkt } from '../utils/geoExtent.js';

const TOKEN = /\$([A-Za-z][A-Za-z0-9_]*)\$/g;
/** A value that is one token behind an optional operator, e.g. `=$X1$` or `-$X1$`. */
const WHOLE_TOKEN = /^([-=~@!<>]*)\$([A-Za-z][A-Za-z0-9_]*)\$$/;
/** Link keys whose value is a sub-query of other records. */
const NESTED_KEY = /^(?:lt|lf|rt|rf|related|links)(?::|$)/;

/** Return parameter names in query order, without duplicates. */
export function queryParameterNames(query) {
  const names = new Set();
  visit(query, (value) => {
    if (typeof value !== 'string') return;
    for (const match of value.matchAll(TOKEN)) names.add(match[1]);
  });
  return [...names];
}

/** Return true when a query contains at least one named runtime value. */
export function hasQueryParameters(query) {
  return queryParameterNames(query).length > 0;
}

/** Infer transient input descriptions from the query and database definitions. */
export function describeQueryParameters(query, dbdefs) {
  const parameters = {};
  visit(query, (value, key, recordTypeId, nested, scopes) => {
    if (typeof value !== 'string') return;
    const names = [...value.matchAll(TOKEN)].map((match) => match[1]);
    if (!names.length) return;
    const fieldId = /^(?:f|fc|geo):([0-9]+)/.exec(key)?.[1] || null;
    const field = fieldId ? dbdefs?.fieldGlobal?.(Number(fieldId)) : null;
    const fieldType = field?.type || 'text';
    const type = key === 'geo' || key.startsWith('geo:') ? 'geo'
      : ['added', 'modified'].includes(key) ? 'date'
        : key === 'ids' || ['integer', 'float', 'year', 'numeric'].includes(fieldType) ? 'number'
          : ['enum', 'relationtype'].includes(fieldType) ? 'enum'
            : fieldType === 'date' ? 'date' : 'text';
    const recordType = recordTypeId ? dbdefs?.rectypeName?.(recordTypeId) : '';
    const fieldLabel = field?.name || key;
    const pathLabel = recordType ? `${recordType}.${fieldLabel}` : fieldLabel;
    for (const name of names) {
      parameters[name] ||= {
        type,
        integer: type === 'number' && (key === 'ids' || ['integer', 'year'].includes(fieldType)),
        fieldId: fieldId ? Number(fieldId) : null,
        // predicate name (f, owner, addedby, ...) and scope, for value lists / facets
        predicate: String(key).split(':')[0],
        recordTypeId: recordTypeId ?? null,
        nested: Boolean(nested),
        // operator before a whole-value token (`''` = contains / falls in); null inside ranges
        operator: WHOLE_TOKEN.exec(value)?.[1] ?? null,
        label: fieldLabel,
        pathLabel,
        // record types from the top level down to the field's own, e.g. ['Event', 'Person']
        hierarchy: scopes.map((scope) => rectypeNames(scope, dbdefs))
      };
    }
    if (/<>|></.test(value)) {
      const prefixRange = value.startsWith('<>') || value.startsWith('><');
      const parts = prefixRange ? value.slice(2).split('/', 2) : value.split('<>', 2);
      const first = /^\$([A-Za-z][A-Za-z0-9_]*)\$$/.exec(parts[0] || '');
      const second = /^\$([A-Za-z][A-Za-z0-9_]*)\$$/.exec(parts[1] || '');
      if (first && second) {
        parameters[first[1]].endInput = second[1];
        parameters[first[1]].range = true;
      } else if (first || second) {
        const parameter = parameters[(first || second)[1]];
        parameter.range = true;
        parameter.endpoint = first ? 'from' : 'to';
        parameter.fixedValue = first ? { from: null, to: parts[1] }
          : { from: parts[0], to: null };
      }
    }
  });
  return parameters;
}

/**
 * Names of text parameters picked from a value list (layout children with
 * `exact: true`): their values match exactly (V12).
 *
 * @param {object|null} filterForm Filter form layout.
 * @returns {Set<string>} Parameter names.
 */
export function exactParameterNames(filterForm) {
  const names = new Set();
  for (const group of filterForm?.groups || []) {
    for (const child of group.children || []) if (child?.exact === true && child.input) names.add(child.input);
  }
  return names;
}

/**
 * Replace runtime values and omit predicates whose values remain blank.
 *
 * @param {Array|object} query Query template with `$NAME$` tokens.
 * @param {object} [values] Values by parameter name.
 * @param {object|null} [filterForm] Layout; text parameters marked `exact`
 *        (picked from a list) become exact matches, several values an OR group.
 * @returns {{q: Array, extent: null}} Resolved query.
 */
export function resolveQueryParameters(query, values = {}, filterForm = null) {
  const exact = exactParameterNames(filterForm);
  const resolve = (node) => {
    if (Array.isArray(node)) return node.map(resolve).filter((item) => item !== null);
    if (!node || typeof node !== 'object') return node;
    const result = {};
    for (const [key, value] of Object.entries(node)) {
      const whole = typeof value === 'string' ? WHOLE_TOKEN.exec(value) : null;
      if (whole && exact.has(whole[2])) {
        // "<operator>$X$" picked from a list: exact value(s), OR between several
        const list = (Array.isArray(values[whole[2]]) ? values[whole[2]] : [values[whole[2]]])
          .filter((item) => item != null && item !== '');
        if (!list.length) continue;
        // a negated template ("-$X$", "!=$X$") excludes each value: != and AND
        const negate = whole[1].startsWith('-') || whole[1].startsWith('!');
        const terms = list.map((item) => `${negate ? '!=' : '='}${item}`);
        if (terms.length === 1) result[key] = terms[0];
        else result[negate ? 'all' : 'any'] = terms.map((term) => ({ [key]: term }));
        continue;
      }
      if (Array.isArray(value) || (value && typeof value === 'object')) {
        const nested = resolve(value);
        if (nested === null || (Array.isArray(nested) && !nested.length)) continue;
        if (/^(?:lt|lf|rt|rf|related)(?::|$)/.test(key)
          && Array.isArray(nested)
          && nested.every((item) => Object.keys(item).every((name) => name === 't' || name === 'r'))) continue;
        result[key] = nested;
        continue;
      }
      if (typeof value !== 'string' || !TOKEN.test(value)) {
        TOKEN.lastIndex = 0;
        result[key] = value;
        continue;
      }
      TOKEN.lastIndex = 0;
      const names = [...value.matchAll(TOKEN)].map((match) => match[1]);
      const present = (name) => values[name] != null && values[name] !== '';
      if ((key === 'geo' || key.startsWith('geo:'))
        && present(names[0]) && typeof values[names[0]] === 'object') {
        result[key] = extentToWkt(values[names[0]]);
        continue;
      }
      if (names.length === 2 && /<>|></.test(value)) {
        const [from, to] = names;
        if (!present(from) && !present(to)) continue;
        if (!present(from)) { result[key] = '<=' + values[to]; continue; }
        if (!present(to)) { result[key] = '>=' + values[from]; continue; }
      } else if (names.some((name) => !present(name))) continue;
      result[key] = value.replace(TOKEN, (_, name) => String(values[name]));
      TOKEN.lastIndex = 0;
    }
    return Object.keys(result).length ? result : null;
  };
  return { q: resolve(query) || [], extent: null };
}

/** Visit scalar query values while retaining each predicate key. */
function visit(node, callback, key = '', recordTypeId = null, nested = false, scopes = []) {
  if (Array.isArray(node)) {
    const typePredicate = node.find((child) => child && typeof child === 'object'
      && !Array.isArray(child) && Object.hasOwn(child, 't'));
    const scope = typePredicate?.t ?? recordTypeId;
    const path = typePredicate ? [...scopes, typePredicate.t] : scopes;
    for (const child of node) visit(child, callback, key, scope, nested, path);
  } else if (node && typeof node === 'object') {
    for (const [name, value] of Object.entries(node)) {
      visit(value, callback, name, recordTypeId, nested || NESTED_KEY.test(name), scopes);
    }
  } else callback(node, key, recordTypeId, nested, scopes);
}

/** @returns {string} Names of a `t` value's record types (`"10,12"` → `"Person / Place"`). */
function rectypeNames(value, dbdefs) {
  return String(value).split(',').map((id) => id.trim()).filter(Boolean)
    .map((id) => dbdefs?.rectypeName?.(id) || id).join(' / ');
}
