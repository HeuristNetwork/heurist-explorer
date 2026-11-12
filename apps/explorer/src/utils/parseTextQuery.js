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

/** Keywords that may take their value as the next word: `t 10`, `f1 Johnson`. */
const SPACED_KEYWORDS = new Set([
  't', 'ids', 'title', 'url', 'notes', 'added', 'modified', 'before', 'after', 'addedby', 'owner',
  'access', 'user', 'tag', 'f', 'fc', 'geo', 'sortby'
]);
/** Keywords whose field id may be glued on: f1, fc240, count240, lt134, geo28. */
const COMPACT_BASES = new Set(['f', 'fc', 'geo', 'lt', 'lf', 'rt', 'rf']);

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
 * `lt134(`…`)` / `linked_to:134(`…`)` / `f:134:(`…`)` style tokens open a linked
 * sub-query; any other `(` group is flattened into the current level.
 *
 * Conjunctions as on the server (old simple format, 2026-11-12): uppercase `AND` / `&&`
 * splits at the top, uppercase `OR` splits a part into alternatives, the words of an
 * alternative are ANDed - `a b OR c d` = (a AND b) OR (c AND d). Sorting applies to the
 * whole query.
 *
 * @param {string[]} tokens
 * @param {{pos:number}} cursor Shared read position.
 * @param {object|null} dbdefs
 * @returns {Array<object>}
 */
function parseSequence(tokens, cursor, dbdefs) {
  const parts = [[[]]];   // parts (AND) of alternatives (OR) of predicates
  const sort = [];
  const ctx = { rty: '', started: false };

  while (cursor.pos < tokens.length) {
    const token = tokens[cursor.pos];
    if (token === ')') { cursor.pos++; break; }
    if (token === 'AND' || token === '&&') { cursor.pos++; parts.push([[]]); continue; }
    if (token === 'OR') { cursor.pos++; parts[parts.length - 1].push([]); continue; }

    const alternatives = parts[parts.length - 1];
    for (const predicate of parseToken(tokens, cursor, dbdefs, ctx)) {
      if (Object.keys(predicate)[0] === 'sortby') sort.push(predicate);
      else alternatives[alternatives.length - 1].push(predicate);
    }
    ctx.started = true;
  }

  const out = [];
  for (const part of parts) {
    const alternatives = part.filter((predicates) => predicates.length);
    if (alternatives.length === 1) {
      out.push(...alternatives[0]);
    } else if (alternatives.length > 1) {
      out.push({ any: alternatives.map((predicates) => (predicates.length === 1 ? predicates[0] : { all: predicates })) });
    }
  }
  return [...out, ...sort];
}

/**
 * Parse the token at `cursor.pos` (and the tokens it takes as its value) into predicates.
 * `-keyword:value` is `{not:[…]}` (no value matches), a word `-Johnson` a negated title.
 *
 * @param {string[]} tokens
 * @param {{pos:number}} cursor
 * @param {object|null} dbdefs
 * @param {{rty:string, started:boolean}} ctx Record type of the current level (for field
 *   names); `started` once the level has a predicate.
 * @returns {Array<object>}
 */
function parseToken(tokens, cursor, dbdefs, ctx) {
  let token = tokens[cursor.pos++];

  if (token.length > 1 && token[0] === '-' && isKeywordToken(token.slice(1), tokens[cursor.pos])) {
    const subCursor = { pos: 0 };
    const inner = parseToken([token.slice(1), ...tokens.slice(cursor.pos)], subCursor, dbdefs, ctx);
    cursor.pos += subCursor.pos - 1; // the value tokens the inner parse took
    return inner.map((predicate) => (Object.keys(predicate)[0] === 'sortby' ? predicate : { not: [predicate] }));
  }

  if (token.endsWith('(')) {
    const inner = parseSequence(tokens, cursor, dbdefs);
    const head = token.slice(0, -1);
    // f:<field>:( - the old form: a pointer field = lt, a relationship marker = related
    const field = /^(?:f|field):(\d+):$/i.exec(head);
    if (field) {
      const type = dbdefs?.fieldType?.(ctx.rty || null, field[1]);
      return [{ [`${type === 'relmarker' ? 'related' : 'lt'}:${field[1]}`]: inner }];
    }
    const m = /^([a-z_]+?):?(\d*)$/i.exec(head);
    const base = m ? (canonicalPredicate(m[1].toLowerCase()) || '') : '';
    if (base && isLinkPredicate(base)) return [{ [m[2] ? `${base}:${m[2]}` : base]: inner }];
    if (base === 'any' || base === 'all' || base === 'not') return [{ [base]: inner }];
    return inner;
  }

  let raw = token;
  const negateWord = raw.length > 1 && raw[0] === '-' && raw.slice(1).toUpperCase() !== 'NULL';
  if (negateWord) raw = raw.slice(1);

  // "keyword value" (no colon), as the server accepts: t 10 f1 Johnson
  if (!/[:=<>]/.test(raw)) {
    const kw = /^([a-z_]+?)(\d*)$/i.exec(raw);
    const kwBase = kw ? canonicalPredicate(kw[1].toLowerCase()) : null;
    const next = tokens[cursor.pos];
    if (kwBase && SPACED_KEYWORDS.has(kwBase) && next != null && next !== ')' && !next.endsWith('(')) {
      cursor.pos++;
      raw = `${kw[1]}${kw[2] ? `:${kw[2]}` : ''}:${next}`;
    }
  }

  raw = colonForm(raw, ctx, dbdefs);

  // compact field keys: fc240:>2, count240:>2, lt134:51 -> base:<id>:value
  const compactKey = /^([a-z_]+?)(\d+):/i.exec(raw);
  if (compactKey && COMPACT_BASES.has(canonicalPredicate(compactKey[1].toLowerCase()))) {
    raw = `${compactKey[1]}:${compactKey[2]}:${raw.slice(compactKey[0].length)}`;
  }

  const colon = raw.indexOf(':');
  if (colon < 0) {
    // bare word: a leading record-type name, otherwise a title match
    // (`f:Athens` is the explicit any-field form)
    if (!negateWord && !ctx.rty && !ctx.started && dbdefs) {
      const id = resolveRectype(raw, dbdefs);
      if (id) { ctx.rty = String(id); return [{ t: String(id) }]; }
    }
    return [{ title: applyNegate(unquote(raw), negateWord) }];
  }

  const key = raw.slice(0, colon).toLowerCase();
  const rawRest = raw.slice(colon + 1);
  const rest = unquoteValue(rawRest);
  let base = canonicalPredicate(key) || key;
  const negate = negateWord;

  // all:x / any:x with a value = any field, as in the old format
  if ((base === 'all' || base === 'any') && rest) base = 'f';

  if (base === 't') {
    // t:48,10 -> several record types; t:-10 excludes them
    const exclude = rest.startsWith('-');
    const ids = (exclude ? rest.slice(1) : rest).split(',').map((part) => resolveRectype(part, dbdefs)).filter(Boolean);
    if (!ids.length) return [];
    if (!exclude) ctx.rty = String(ids[0]);
    return [{ t: `${exclude ? '-' : ''}${ids.join(',')}` }];
  }
  if (isLinkPredicate(base) && base !== 'r' && base !== 'relf') {
    // lt:134:51 -> linked record id(s) without a sub-query
    const m = /^(\d+):(.+)$/.exec(rest);
    return [m ? { [`${base}:${m[1]}`]: m[2] } : { [base]: rest }];
  }
  if (base === 'fc') {
    // fc:<id>:<value>, fc:<id>=<value>, fc:<name>:<value>   field value count, e.g. fc:12:>2
    const field = fieldPart(rawRest, ctx, dbdefs);
    return field ? [{ [`fc:${field.id}`]: applyNegate(field.value, negate) }] : [];
  }
  if (base === 'geo') {
    // geo[:<id>][:within|intersects]:<value>
    const m = /^(?:(\d+):)?(?:(within|intersects):)?([\s\S]*)$/i.exec(rest);
    const geoKey = ['geo', m[1], m[2]?.toLowerCase()].filter(Boolean).join(':');
    return [{ [geoKey]: unquote(m[3]) }];
  }
  if (base === 'r' || base === 'relf') {
    // relationship conditions: r:<type ids>, r:<id>:<value> / relf:<id>:<value> (field)
    const m = /^(\d+):([\s\S]*)$/.exec(rest);
    if (m) return [{ [`relf:${m[1]}`]: applyNegate(unquote(m[2]), negate) }];
    return base === 'r' && rest ? [{ r: rest }] : [];
  }
  if (base === 'sortby') {
    return rest ? [{ sortby: rest }] : [];
  }
  if (base === 'tag') {
    // a tag is matched exactly anyway: tag=x is tag:x
    return [{ tag: applyNegate(rest.startsWith('=') ? rest.slice(1) : rest, negate) }];
  }
  if (base === 'f') {
    // f:<id>[:<enumField>]:<value>, f:<id>=<value>, f:<Name>:<value>, f:"Name with spaces"<value>
    const field = fieldPart(rawRest, ctx, dbdefs);
    if (!field) {
      // f:<value> -> any field
      return rest ? [{ f: applyNegate(rest, negate) }] : [];
    }
    return [{ [`f:${field.id}${field.qualifier ? `:${field.qualifier}` : ''}`]: applyNegate(field.value, negate) }];
  }
  if (HEADER_BASES.has(base)) {
    return [{ [base]: applyNegate(rest, negate) }];
  }

  // f<id>:<value>  (f1:Athens)
  const compact = /^f(\d+)$/.exec(key);
  if (compact) {
    return [{ [`f:${compact[1]}`]: applyNegate(rest, negate) }];
  }

  // otherwise treat `key` as a field NAME, scoped to the current record type;
  // `f<Name>:` (fGender:male) is the explicit field-name form
  const fieldId = fieldIdFor(key, ctx.rty, dbdefs)
    ?? (key.length > 1 && key[0] === 'f' ? fieldIdFor(key.slice(1), ctx.rty, dbdefs) : null);
  if (fieldId) {
    return [{ [`f:${fieldId}`]: applyNegate(rest, negate) }];
  }
  // keep it rather than drop it - queryDescribe renders unknown keys verbatim
  return [{ [key]: applyNegate(rest, negate) }];
}

/**
 * Whether a token (without its leading `-`) is a keyword predicate: it has a key
 * (`key:`, `key=`, `key<`, `key>`), opens a sub-query, or is a spaced keyword (`t 10`).
 *
 * @param {string} token
 * @param {string|undefined} next
 * @returns {boolean}
 */
function isKeywordToken(token, next) {
  if (token.endsWith('(')) return true;
  const sep = firstUnquoted(token, ':=<>');
  if (sep > 0) return true;
  const kw = /^([a-z_]+?)(\d*)$/i.exec(token);
  const kwBase = kw ? canonicalPredicate(kw[1].toLowerCase()) : null;
  return Boolean(kwBase && SPACED_KEYWORDS.has(kwBase) && next != null && next !== ')');
}

/**
 * `key=v`, `key<v`, `key>v` (operator instead of the colon, old format) -> `key:=v` …;
 * the operator stays in the value. Only when the part before it is a keyword (as on the
 * server) or a field name of the current record type; `a<b` stays a title word.
 *
 * @param {string} raw
 * @param {{rty:string}} ctx
 * @param {object|null} dbdefs
 * @returns {string}
 */
function colonForm(raw, ctx, dbdefs) {
  const pos = firstUnquoted(raw, ':=<>');
  if (pos <= 0 || raw[pos] === ':') return raw;
  const key = raw.slice(0, pos);
  const kw = /^([a-z_]+?)(\d*)$/i.exec(key);
  const known = (kw && canonicalPredicate(kw[1].toLowerCase())) || (/^f\d+$/i.test(key))
    || fieldIdFor(key, ctx.rty, dbdefs);
  return known ? `${key}:${raw.slice(pos)}` : raw;
}

/**
 * Field of an `f:` / `fc:` value: `<id>[:<qualifier>]<sep><value>` or
 * `<Name><sep><value>` / `"<Name with spaces>"<sep><value>`, sep = `:` `=` `<` `>`
 * (the operator stays in the value). `null` = no field (any-field value).
 *
 * @param {string} rawRest Text after `f:`, quotes not yet removed.
 * @param {{rty:string}} ctx
 * @param {object|null} dbdefs
 * @returns {{id:string, qualifier:string, value:string}|null}
 */
function fieldPart(rawRest, ctx, dbdefs) {
  const byId = /^(\d+)(?::(term|label|code|concept|conceptid|desc)(?=[:=<>]))?([:=<>])([\s\S]*)$/i.exec(rawRest);
  if (byId) {
    return { id: byId[1], qualifier: byId[2] ? byId[2].toLowerCase() : '', value: unquoteValue((byId[3] === ':' ? '' : byId[3]) + byId[4]) };
  }
  const byName = /^(?:"([^"]+)"|([^\s:"=<>@\-][^\s:"=<>]*))([:=<>])([\s\S]*)$/.exec(rawRest);
  if (byName) {
    const name = byName[1] ?? byName[2];
    const id = fieldIdFor(name, ctx.rty, dbdefs);
    return { id: id ? String(id) : name, qualifier: '', value: unquoteValue((byName[3] === ':' ? '' : byName[3]) + byName[4]) };
  }
  return null;
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

/** Position of the first of `chars` outside double quotes, or -1. */
function firstUnquoted(text, chars) {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') { quoted = !quoted; continue; }
    if (!quoted && chars.includes(text[i])) return i;
  }
  return -1;
}

/** unquote(), also after an operator: `="Johnson, John"` -> `=Johnson, John`. */
function unquoteValue(s) {
  const t = unquote(s);
  const m = /^(==|>=|<=|<>|=|<|>|-|@\+|@-|@)"([\s\S]*)"$/.exec(t);
  return m ? m[1] + m[2] : t;
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
