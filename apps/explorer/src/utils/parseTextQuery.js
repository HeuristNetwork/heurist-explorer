/**
 * @file parseTextQuery.js
 * @brief Task B-min (client): flat Heurist keyword-syntax text -> `q`-array.
 *
 * Pure (DOM-free). Understands only the *flat keyword* subset of the query
 * language - `t:<rty>`, `<field>:<value>`, `f:<id>:<value>`, header keywords
 * (`title:`, `added:` …), `sortby:` - joined implicitly with AND. Prose and
 * `OR` grouping are out of scope; `lt134(t:12 …)` style linked/related
 * sub-queries are parsed recursively
 * (server `RecordQueryParser::textToJson` / Task B M8 are canonical).
 *
 * Used by `HFilterInlineHelper` to feed `queryDescribe()` and to seed the
 * Filter Builder from whatever the user typed.
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

import { canonicalPredicate, isLinkPredicate } from './queryPredicates.js';

const HEADER_BASES = new Set([
  'title', 'url', 'notes', 'added', 'modified', 'ids', 'owner', 'addedby',
  'access', 'tag', 'user', 'before', 'after'
]);

/**
 * @param {string} text
 * @param {{dbdefs?:object}} [opts]
 * @returns {Array<object>} `q`-array; empty when nothing parseable.
 */
export function parseTextQuery(text, { dbdefs = null } = {}) {
  const tokens = tokenize(String(text ?? ''));
  if (!tokens.length) return [];
  return parseSequence(tokens, { pos: 0 }, dbdefs);
}

/**
 * Parse tokens from `cursor.pos` up to a closing `)` (consumed) or the end.
 * `lt134(`…`)` / `linked_to:134(`…`)` style tokens open a linked sub-query;
 * any other `(` group is flattened into the current level.
 *
 * @param {string[]} tokens
 * @param {{pos:number}} cursor Shared read position.
 * @param {object|null} dbdefs
 * @returns {Array<object>}
 */
function parseSequence(tokens, cursor, dbdefs) {
  const out = [];
  let rtyCtx = '';

  while (cursor.pos < tokens.length) {
    const token = tokens[cursor.pos++];
    if (token === ')') break;
    if (/^(and|or)$/i.test(token)) continue; // flat parser: ignore explicit conjunctions

    if (token.endsWith('(')) {
      const inner = parseSequence(tokens, cursor, dbdefs);
      const m = /^([a-z_]+?):?(\d*)$/i.exec(token.slice(0, -1));
      const base = m ? (canonicalPredicate(m[1].toLowerCase()) || '') : '';
      if (base && isLinkPredicate(base)) {
        out.push({ [m[2] ? `${base}:${m[2]}` : base]: inner });
      } else {
        out.push(...inner);
      }
      continue;
    }

    let raw = token;
    let negate = false;
    if (raw.length > 1 && raw[0] === '-' && raw.slice(1).toUpperCase() !== 'NULL') {
      negate = true;
      raw = raw.slice(1);
    }

    const colon = raw.indexOf(':');
    if (colon < 0) {
      // bare word: a leading record-type name, otherwise a title match
      // (`f:Athens` is the explicit any-field form)
      if (!out.length && !rtyCtx && dbdefs) {
        const id = resolveRectype(raw, dbdefs);
        if (id) { out.push({ t: String(id) }); rtyCtx = String(id); continue; }
      }
      out.push({ title: applyNegate(unquote(raw), negate) });
      continue;
    }

    const key = raw.slice(0, colon).toLowerCase();
    const rest = unquote(raw.slice(colon + 1));
    const base = canonicalPredicate(key) || key;

    if (base === 't') {
      // t:48,10 -> several record types
      const ids = rest.split(',').map((part) => resolveRectype(part, dbdefs)).filter(Boolean);
      if (ids.length) { out.push({ t: ids.join(',') }); rtyCtx = String(ids[0]); }
      continue;
    }
    if (base === 'fc') {
      // fc:<id>:<value>   field value count, e.g. fc:12:>2
      const parts = rest.split(':');
      if (/^\d+$/.test(parts[0])) {
        out.push({ [`fc:${parts[0]}`]: applyNegate(unquote(parts.slice(1).join(':')), negate) });
      }
      continue;
    }
    if (base === 'geo') {
      // geo:<value>  or  geo:<id>:<value>
      const m = /^(\d+):(.*)$/.exec(rest);
      out.push(m ? { [`geo:${m[1]}`]: unquote(m[2]) } : { geo: rest });
      continue;
    }
    if (base === 'sortby') {
      if (rest) out.push({ sortby: rest });
      continue;
    }
    if (base === 'f') {
      // f:<id>[:<enumField>]:<value>   (value may carry a leading operator token)
      const parts = rest.split(':');
      const id = /^\d+$/.test(parts[0]) ? parts[0] : null;
      if (!id) {
        // f:<value> -> any field
        if (rest) out.push({ f: applyNegate(rest, negate) });
        continue;
      }
      let fieldKey = `f:${id}`;
      let value = parts.slice(1).join(':');
      if (['term', 'code', 'conceptid', 'desc'].includes(parts[1])) {
        fieldKey += `:${parts[1]}`;
        value = parts.slice(2).join(':');
      }
      out.push({ [fieldKey]: applyNegate(unquote(value), negate) });
      continue;
    }
    if (HEADER_BASES.has(base)) {
      out.push({ [base]: applyNegate(rest, negate) });
      continue;
    }

    // f<id>:<value>  (f1:Athens)
    const compact = /^f(\d+)$/.exec(key);
    if (compact) {
      out.push({ [`f:${compact[1]}`]: applyNegate(rest, negate) });
      continue;
    }

    // otherwise treat `key` as a field NAME, scoped to the current record type;
    // `f<Name>:` (fGender:male) is the explicit field-name form
    const fieldId = fieldIdFor(key, rtyCtx, dbdefs)
      ?? (key.length > 1 && key[0] === 'f' ? fieldIdFor(key.slice(1), rtyCtx, dbdefs) : null);
    if (fieldId) {
      out.push({ [`f:${fieldId}`]: applyNegate(rest, negate) });
    } else {
      // keep it rather than drop it - queryDescribe renders unknown keys verbatim
      out.push({ [key]: applyNegate(rest, negate) });
    }
  }

  return out;
}

// --------------------------------------------------------------------- helpers ---

/**
 * Split on whitespace, but treat a `"…"` / `'…'` span as part of the token it
 * touches, so `name:"John Smith"` stays one token.
 */
function tokenize(text) {
  const out = [];
  let cur = '';
  let quote = null;
  for (const ch of String(text ?? '')) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (/\s/.test(ch)) {
      if (cur) { out.push(cur); cur = ''; }
    } else if (ch === '(') {
      out.push(cur + ch);   // `lt134(` - the opener keeps its key
      cur = '';
    } else if (ch === ')') {
      if (cur) { out.push(cur); cur = ''; }
      out.push(ch);
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Strip one layer of matching single/double quotes from a token's value. */
function unquote(s) {
  const t = String(s ?? '').trim();
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Prefix a value with `-` (negation) unless it already carries a leading `-`. */
function applyNegate(value, negate) {
  const v = String(value ?? '');
  if (!negate) return v;
  return v.charAt(0) === '-' ? v : `-${v}`;
}

/** Resolve a field name within a record type to one field id, or `null`. */
function fieldIdFor(name, rtyCtx, dbdefs) {
  const hit = dbdefs?.fieldIdByName?.(rtyCtx || '', name);
  return (Array.isArray(hit) ? hit[0] : hit) || null;
}

/**
 * Resolve a `t:` token's text to a rectype id: numeric id, or a name lookup via `dbdefs`.
 *
 * @param {string} text Rectype id or name.
 * @param {object|null} dbdefs Database-definition snapshot; see `HDbDefs`.
 * @returns {number|null}
 */
function resolveRectype(text, dbdefs) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const hit = dbdefs?.rectypeIdByName?.(raw);
  if (Array.isArray(hit)) return hit[0] ?? null;
  return hit || null;
}
