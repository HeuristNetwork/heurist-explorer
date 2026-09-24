/**
 * @file queryDescribe.js
 * @brief Task A-min: render a Heurist `q`-array query as a plain human sentence.
 *
 * Pure (DOM-free) client describer for the inline helper's post-parse display
 * (plan D6 / M4). Covers flat predicates + nested linked sub-queries (placed
 * after the conditions of the record type they hang off) + sort;
 * anything it cannot phrase is rendered verbatim rather than dropped or thrown.
 * The canonical, fully-nested describer is the server `QueryDescriber` (M7).
 *
 * e.g. [{t:"10"},{"f:12":"=Smith"},{"sortby":"-modified"}]
 *      -> 'Find Persons where Family name is "Smith", sorted by date modified (descending)'
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

import {
  queryToArray,
  firstPredicateEntry,
  splitPredicateKey,
  stripValueToken,
  GEO_MODES
} from './queryModel.js';
import {
  canonicalPredicate,
  isLinkPredicate,
  isGroupPredicate,
  HEADER_KEYWORDS
} from './queryPredicates.js';
import { str, kindFor, operatorsFor } from './vocabHelpers.js';
import { isExtent } from '#shared/utils';

const HEADER_LABELS = {
  title: 'title', url: 'URL', notes: 'notes', added: 'date added',
  modified: 'date modified', ids: 'record ID', owner: 'owner',
  addedby: 'creator', access: 'visibility', tag: 'tag', user: 'bookmarked by'
};

/** Kinds whose values are literals shown in quotes. */
const QUOTED_KINDS = new Set(['text', 'enum', 'term', 'tag']);
/** Whole-value parameter token `$NAME$` (D9). */
const PARAM_RE = /^\$[A-Za-z_]\w*\$$/;
/** Parameter tokens embedded in a larger value. */
const PARAM_ANY_RE = /\$[A-Za-z_]\w*\$/g;

const LINK_PHRASE = {
  lt: 'linked_to', lf: 'linked_from', rt: 'related_to', rf: 'related_from',
  related: 'related', links: 'related', relf: 'related', r: 'related'
};

/**
 * @param {Array|string|object} query  q-array, JSON string, or `{q:[…]}`.
 * @param {{dbdefs?:object, vocabulary:object, lang?:string, capitalize?:boolean}} opts
 * @returns {string} Empty string for an empty / unparseable query.
 */
export function queryDescribe(query, { dbdefs = null, vocabulary, lang = 'eng', capitalize = true } = {}) {
  if (!vocabulary) throw new TypeError('queryDescribe requires vocabulary (queryVocabulary.json)');
  const arr = queryToArray(query);
  if (!arr.length) return '';

  const ctx = { dbdefs, vocab: vocabulary, lang };
  const sentence = describeGroup(arr, ctx, { top: true, scopeRty: null });
  return capitalize ? capitalizeFirst(sentence) : sentence;
}

// ------------------------------------------------------------------ internals ---

/**
 * Describe one query array (top level or a nested subquery).
 * @param {Array} arr
 * @param {{dbdefs:object,vocab:object,lang:string}} ctx
 * @param {{top:boolean, scopeRty:?number}} opt
 * @returns {string}
 */
function describeGroup(arr, ctx, { top, scopeRty }) {
  let rectypeIds = scopeRty != null ? [scopeRty] : [];
  let rectypeId = scopeRty ?? null;   // scope for field names: the first rectype
  const linkClauses = [];   // "linked to …" / "related to …" - placed after the conditions
  const conditions = [];    // field / header / group conditions - go inside "where"
  const sorts = [];

  for (const predicate of arr) {
    const entry = firstPredicateEntry(predicate);
    if (!entry) continue;
    const [rawKey, rawValue] = entry;
    const { base, suffix } = splitPredicateKey(rawKey);
    const value = linkValue(base, rawValue);

    if (base === 't') {
      const ids = resolveRectypeIds(firstOf(value), ctx);
      if (ids.length) { rectypeIds = ids; rectypeId = ids[0]; }
      continue;
    }
    if (base === 'sortby') {
      const s = describeSort(String(firstOf(value) ?? ''), rectypeId, ctx);
      if (s) sorts.push(s);
      continue;
    }
    if (isLinkPredicate(base) && Array.isArray(value)) {
      linkClauses.push({ base, suffix, value });   // described after the loop
      continue;
    }
    // a whole group that is just one {any|all|not:[…]} wrapper
    if (isGroupPredicate(base) && Array.isArray(value)) {
      conditions.push(describeGroupWrapper(base, value, ctx, rectypeId));
      continue;
    }
    const clause = describePredicate(base, suffix, value, ctx, rectypeId);
    if (clause) conditions.push(clause);
  }

  const rectypeText = rectypeIds.length
    ? rectypeIds.map((id) => rectypeName(id, ctx, { plural: true })).join(phrase(ctx, 'or'))
    : phrase(ctx, 'any_type');

  // own conditions first, linked sub-queries last, so each field reads next to
  // the record type it belongs to
  let out = top ? fill(phrase(ctx, 'find'), { rectype: rectypeText }) : rectypeText;
  if (conditions.length) {
    out += ' ' + fill(phrase(ctx, 'where'), { conditions: joinConditions(conditions, ctx) });
  }
  if (linkClauses.length) {
    // a sub-query with links of its own is bracketed when a sibling link follows
    // it, so that sibling reads as belonging to this record type, not the nested one
    const last = linkClauses.length - 1;
    const texts = linkClauses.map(({ base, suffix, value }, i) =>
      describePredicate(base, suffix, value, ctx, rectypeId, { wrap: i < last && hasLinks(value) }));
    out += (conditions.length ? phrase(ctx, 'and') : ' ') + texts.join(phrase(ctx, 'and'));
  }
  if (top && sorts.length) {
    out += ', ' + fill(phrase(ctx, 'sort_by'), { fields: sorts.join(', ') });
  }
  return out.trim();
}

/**
 * Describe one predicate: a linked sub-query, header keyword, field condition,
 * grouping wrapper, or (as a fallback) its literal key/value text.
 *
 * @param {string} base Canonical predicate base keyword.
 * @param {{raw:string, parts:string[]}} suffix Remaining predicate key parts after the base.
 * @param {*} value Predicate value.
 * @param {object} ctx Describe context (`dbdefs`, `vocab`, `lang`).
 * @param {number|null} scopeRty Record type id the predicate is evaluated within.
 * @param {{wrap?:boolean}} [opts] `wrap` brackets a linked sub-query's description.
 * @returns {string}
 */
function describePredicate(base, suffix, rawValue, ctx, scopeRty, { wrap = false } = {}) {
  const value = linkValue(base, rawValue);
  // linked / related sub-query
  if (isLinkPredicate(base) && Array.isArray(value)) {
    const phraseKey = LINK_PHRASE[base] || 'related';
    const subRty = subqueryRectype(value, ctx);
    const subquery = describeGroup(value, ctx, { top: false, scopeRty: subRty });
    return fill(phrase(ctx, phraseKey), { subquery: wrap ? `(${subquery})` : subquery });
  }

  // header keyword (title, added, owner, …)
  if (HEADER_KEYWORDS[base]) {
    const fieldText = HEADER_LABELS[base] || base;
    const kind = kindFor(ctx.vocab, null, base);
    const { op, val } = describeOpValue(kind, value, null, ctx, { literalText: true });
    return fill(phrase(ctx, 'header_cond'), { field: fieldText, op, value: val }).trim();
  }

  // spatial  geo[:<id|name>][:within|intersects]  -> that geo field; no field -> any location
  if (base === 'geo') {
    const parts = suffix.parts;
    const last = String(parts.at(-1) ?? '').toLowerCase();
    const mode = GEO_MODES.includes(last) ? last : null;
    const { dtyId, label } = fieldRef(mode && parts.length === 1 ? '' : parts[0], scopeRty, ctx, 'Location');
    const raw = String(isExtent(value) ? '' : (value ?? ''));
    if (raw === 'NULL' || raw === '-NULL') {
      const { op } = describeOpValue('geo', raw, dtyId, ctx);
      return fill(phrase(ctx, 'field_cond'), { field: label, op, value: '' }).trim();
    }
    // without a mode the server treats WKT as `within` and an extent as `intersects`
    const opKey = `op.${mode || (isExtent(value) ? 'intersects' : 'within')}`;
    const val = isExtent(value)
      ? `W ${value.west}, S ${value.south}, E ${value.east}, N ${value.north}`
      : describeOpValue('geo', value, dtyId, ctx).val;
    return fill(phrase(ctx, 'field_cond'), { field: label, op: str(ctx.vocab, ctx.lang, opKey), value: val }).trim();
  }

  // field value count  fc:<id|name>  -> "number of <field> values <op> <n>"
  if (base === 'fc') {
    const { label } = fieldRef(suffix.parts[0], scopeRty, ctx, 'any field');
    const { op, val } = describeOpValue('number', value, null, ctx);
    return fill(phrase(ctx, 'field_cond'), {
      field: fill(phrase(ctx, 'field_count'), { field: label }), op, value: val
    }).trim();
  }

  // field predicate  f:<id|name>[:<enumField>]   e.g. {"f:Date of event":"=2026-09-23"}
  if (base === 'f') {
    const parts = suffix.parts;
    const ref = fieldRef(parts[0], scopeRty, ctx, 'any field');
    const dtyId = ref.dtyId;
    const enumField = parts[0] && parts.length > 1 ? parts[1] : null;
    let fieldText = ref.label;
    if (enumField) fieldText += ` (${enumField})`;
    // a name that did not resolve has an unknown type - keep its operator tokens
    const { kind, known } = dtyId == null && parts[0]
      ? { kind: 'text', known: false }
      : fieldKind(dtyId, scopeRty, ctx, enumField);
    const { op, val } = describeOpValue(kind, value, dtyId, ctx, { literalText: known });
    return fill(phrase(ctx, 'field_cond'), { field: fieldText, op, value: val }).trim();
  }

  // grouping wrapper reached as a predicate value
  if (isGroupPredicate(base) && Array.isArray(value)) {
    return describeGroupWrapper(base, value, ctx, scopeRty);
  }

  // anything else: show it literally so nothing is silently lost
  return literalPredicate(base, suffix, value);
}

/**
 * Describe an `{any|all|not:[…]}` grouping wrapper as a joined conditions phrase.
 *
 * @param {'any'|'all'|'not'} base Grouping keyword.
 * @param {Array} value Inner predicate array.
 * @param {object} ctx Describe context (`dbdefs`, `vocab`, `lang`).
 * @param {number|null} scopeRty Record type id the group is evaluated within.
 * @returns {string}
 */
function describeGroupWrapper(base, value, ctx, scopeRty) {
  const inner = value
    .map((p) => {
      const e = firstPredicateEntry(p);
      if (!e) return null;
      const { base: b, suffix: s } = splitPredicateKey(e[0]);
      return describePredicate(b, s, e[1], ctx, scopeRty);
    })
    .filter(Boolean);

  if (base === 'not') {
    return fill(phrase(ctx, 'not'), { conditions: inner.join(phrase(ctx, 'and')) });
  }
  const key = base === 'any' ? 'any_of' : 'all_of';
  return fill(phrase(ctx, key), { conditions: inner.join(', ') });
}

/**
 * @returns {{op:string, val:string}} operator text + value text for a raw
 *          predicate value (string, or an `{any|all:[…]}` multi-value wrapper).
 */
function describeOpValue(kind, rawValue, dtyId, ctx, opts = {}) {
  if (Array.isArray(rawValue)) {
    return { op: str(ctx.vocab, ctx.lang, 'op.is'), val: '' };
  }
  if (rawValue && typeof rawValue === 'object') {
    const entry = firstPredicateEntry(rawValue);
    if (entry && Array.isArray(entry[1])) {
      const joinWord = entry[0] === 'all' ? phrase(ctx, 'and') : phrase(ctx, 'or');
      const parts = entry[1].map((p) => {
        const e = firstPredicateEntry(p);
        return e ? describeOpValue(kind, e[1], dtyId, ctx, opts).val : '';
      }).filter(Boolean);
      return { op: str(ctx.vocab, ctx.lang, 'op.is'), val: parts.join(joinWord) };
    }
    return { op: str(ctx.vocab, ctx.lang, 'op.is'), val: '' };
  }

  const raw = String(rawValue ?? '');

  if (raw === 'NULL' || raw === '-NULL') {
    return { op: str(ctx.vocab, ctx.lang, raw === 'NULL' ? 'op.is_empty' : 'op.is_set'), val: '' };
  }

  let { negate, token, value } = stripValueToken(raw);
  // a known text field has no comparison operators: `>2` is the literal ">2"
  if (token && opts.literalText && kind === 'text'
      && !operatorsFor(ctx.vocab, kind).some((o) => (o.token || '') === token)) {
    value = token + value;
    token = '';
  }
  let bare = value;
  let opKey = null;

  // a<>b on a number/date -> "is between a and b"
  const range = token === '' && !negate && (kind === 'number' || kind === 'date')
    ? /^(.+?)<>(.+)$/.exec(bare) : null;
  if (range) {
    const [a, b] = [range[1], range[2]].map((p) => humanizeValue(kind, p, dtyId, ctx));
    return { op: str(ctx.vocab, ctx.lang, 'op.between'), val: `${a}${phrase(ctx, 'and')}${b}` };
  }

  // %val / val% -> starts/ends with (token stays '')
  if (token === '' && !negate) {
    if (/^%.+/.test(bare) && !/%$/.test(bare)) { opKey = 'op.ends_with'; bare = bare.slice(1); }
    else if (/.+%$/.test(bare) && !/^%/.test(bare)) { opKey = 'op.starts_with'; bare = bare.slice(0, -1); }
  }

  if (!opKey) opKey = operatorKeyForToken(kind, token, negate, ctx);

  // a comma list means "or" - except in WKT, where commas separate coordinates
  const parts = kind !== 'geo' && bare.includes(',') ? bare.split(',').map((s) => s.trim()) : [bare];
  const humanized = parts.map((p) => humanizeValue(kind, p, dtyId, ctx, opts.literalText)).filter((p) => p !== '');
  const val = humanized.join(' ' + phrase(ctx, 'or').trim() + ' ');

  return { op: str(ctx.vocab, ctx.lang, opKey), val };
}

/** Map a raw operator token back to the best i18n key for the field kind. */
function operatorKeyForToken(kind, token, negate, ctx) {
  const list = operatorsFor(ctx.vocab, kind);
  if (negate) {
    const neg = list.find((o) => (o.token || '') === '-' && !o.pattern)
      || list.find((o) => (o.token || '').startsWith('-'));
    if (neg) return neg.i18nKey;
  }
  const exact = list.filter((o) => (o.token || '') === token && !o.pattern);
  if (exact.length) return exact[0].i18nKey;
  const any = list.find((o) => (o.token || '') === token);
  if (any) return any.i18nKey;

  // token not valid for this kind (e.g. a stored query whose field kind we
  // cannot resolve without dbdefs) - fall back to any group that defines it
  if (token) {
    for (const group of Object.values(ctx.vocab.operators || {})) {
      const hit = (group || []).find((o) => (o.token || '') === token && !o.pattern);
      if (hit) return hit.i18nKey;
    }
  }
  return list[0]?.i18nKey || 'op.is';
}

/**
 * Render one raw predicate value as human text, resolving enum/term/record ids when possible.
 *
 * @param {string} kind Field kind; see `kindFor`.
 * @param {string} value Raw value segment.
 * @param {number|null} dtyId Field id, when known.
 * @param {object} ctx Describe context (`dbdefs`, `vocab`, `lang`).
 * @param {boolean} [known] Field kind is known: quote text/term literals.
 * @returns {string}
 */
function humanizeValue(kind, value, dtyId, ctx, known = false) {
  const v = String(value ?? '').trim();
  if (v === '') return '';
  if (PARAM_RE.test(v)) return '?';   // parameter placeholder, filled in at run time
  const withParams = v.replace(PARAM_ANY_RE, '?');   // e.g. a date range `$A$/$B$`
  if (withParams !== v) return withParams;
  if ((kind === 'enum' || kind === 'term') && ctx.dbdefs && /^\d+$/.test(v)) {
    return quote(ctx.dbdefs.termLabel?.(Number(v)) || v);
  }
  if (kind === 'record' && ctx.dbdefs && /^\d+$/.test(v)) {
    return `record ${v}`;
  }
  return known && QUOTED_KINDS.has(kind) ? quote(v) : v;
}

/** Wrap a literal in double quotes (once). */
function quote(v) {
  return /^".*"$/.test(v) ? v : `"${v}"`;
}

// ---------------------------------------------------------------- name lookups ---

/**
 * Resolve a `t:` predicate's value to a rectype id: numeric id, or a name lookup via `dbdefs`.
 *
 * @param {*} value Raw `t:` predicate value.
 * @param {object} ctx Describe context (`dbdefs`, `vocab`, `lang`).
 * @returns {number|null}
 */
function resolveRectypeId(value, ctx) {
  return resolveRectypeIds(value, ctx)[0] ?? null;
}

/**
 * Resolve a `t:` predicate's comma-separated value (`48,10`) to rectype ids.
 *
 * @param {*} value Raw `t:` predicate value.
 * @param {object} ctx Describe context (`dbdefs`, `vocab`, `lang`).
 * @returns {number[]}
 */
function resolveRectypeIds(value, ctx) {
  return String(value ?? '').split(',')
    .map((part) => resolveOneRectype(part, ctx))
    .filter((id) => id != null);
}

/** Resolve one rectype id or name to an id, or `null`. */
function resolveOneRectype(part, ctx) {
  const raw = String(part ?? '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (ctx.dbdefs?.rectypeIdByName) {
    const hit = ctx.dbdefs.rectypeIdByName(raw);
    if (Array.isArray(hit)) return hit[0] ?? null;
    if (hit) return hit;
  }
  return null;
}

/**
 * Find a linked sub-query's own `t:` predicate and resolve its rectype id.
 *
 * @param {Array} arr Sub-query predicate array.
 * @param {object} ctx Describe context (`dbdefs`, `vocab`, `lang`).
 * @returns {number|null}
 */
function subqueryRectype(arr, ctx) {
  for (const p of arr) {
    const e = firstPredicateEntry(p);
    if (e && (canonicalPredicate(e[0].split(':')[0]) === 't')) {
      return resolveRectypeId(firstOf(e[1]), ctx);
    }
  }
  return null;
}

/**
 * Resolve a rectype's display name via `dbdefs`, falling back to a generic label.
 *
 * @param {number} id Rectype id.
 * @param {object} ctx Describe context (`dbdefs`, `vocab`, `lang`).
 * @param {{plural?: boolean}} [options] Pass `plural: true` for the plural form.
 * @returns {string}
 */
function rectypeName(id, ctx, { plural = false } = {}) {
  if (ctx.dbdefs?.rectypeName) {
    const n = ctx.dbdefs.rectypeName(id, { plural });
    if (n) return n;
  }
  return `record type ${id}`;
}

/**
 * Resolve a field's display name via `dbdefs`, falling back to a generic label.
 *
 * @param {number} dtyId Field id.
 * @param {number|null} scopeRty Record type the field is scoped to, when known.
 * @param {object} ctx Describe context (`dbdefs`, `vocab`, `lang`).
 * @returns {string}
 */
function fieldName(dtyId, scopeRty, ctx) {
  if (ctx.dbdefs) {
    const n = ctx.dbdefs.fieldName?.(scopeRty ?? '', dtyId)
      || ctx.dbdefs.fieldGlobal?.(dtyId)?.name;
    if (n) return n;
  }
  return `field ${dtyId}`;
}

/**
 * Resolve the field part of a predicate key - a numeric id or a field name
 * (`f:Date of event`), the name looked up within the scope record type.
 *
 * @param {string|undefined} ref Key part after the base (`12`, `Date of event`, or empty).
 * @param {number|null} scopeRty Record type the field is scoped to, when known.
 * @param {object} ctx Describe context (`dbdefs`, `vocab`, `lang`).
 * @param {string} fallback Label when there is no field part (`any field`, `Location`).
 * @returns {{dtyId:number|null, label:string}} `dtyId` is null for an unknown name,
 *          whose label is then the name as written.
 */
function fieldRef(ref, scopeRty, ctx, fallback) {
  const raw = String(ref ?? '').trim();
  if (!raw) return { dtyId: null, label: fallback };
  if (/^\d+$/.test(raw)) return { dtyId: Number(raw), label: fieldName(Number(raw), scopeRty, ctx) };
  const hit = scopeRty != null ? ctx.dbdefs?.fieldIdByName?.(scopeRty, raw) : null;
  const dtyId = Number(Array.isArray(hit) ? hit[0] : hit) || null;
  return dtyId ? { dtyId, label: fieldName(dtyId, scopeRty, ctx) } : { dtyId: null, label: raw };
}

/**
 * Resolve a field's operator/value "kind" (text/number/date/enum/…) for describing its condition.
 *
 * @param {number|null} dtyId Field id, or `null` for an any-field match.
 * @param {number|null} scopeRty Record type the field is scoped to, when known.
 * @param {object} ctx Describe context (`dbdefs`, `vocab`, `lang`).
 * @param {string|null} enumField Enum sub-part (`term`/`code`/`conceptid`/`desc`), when present.
 * @returns {{kind:string, known:boolean}} `known` is false when the kind is only a guess
 *          (no dbdefs / unknown field), so value tokens must not be reinterpreted.
 */
function fieldKind(dtyId, scopeRty, ctx, enumField) {
  if (dtyId == null) return { kind: 'text', known: true };
  if (enumField && enumField !== 'internalid') return { kind: 'text', known: true }; // label/code sub-part is a string
  const type = ctx.dbdefs?.fieldType?.(scopeRty ?? '', dtyId)
    || ctx.dbdefs?.fieldGlobal?.(dtyId)?.type;
  return { kind: kindFor(ctx.vocab, type || 'freetext'), known: Boolean(type) };
}

/**
 * Describe one `sortby` field token as human text, appending "(descending)" for a `-` prefix.
 *
 * @param {string} raw Raw sort token (e.g. `-modified`).
 * @param {number|null} scopeRty Record type the sort field is scoped to, when known.
 * @param {object} ctx Describe context (`dbdefs`, `vocab`, `lang`).
 * @returns {string}
 */
function describeSort(raw, scopeRty, ctx) {
  if (!raw) return '';
  const desc = raw.startsWith('-');
  const field = desc ? raw.slice(1) : raw;
  let text;
  if (/^\d+$/.test(field)) text = fieldName(Number(field), scopeRty, ctx);
  else if (field === 'title') text = 'record title';
  else if (HEADER_LABELS[canonicalPredicate(field) || field]) text = HEADER_LABELS[canonicalPredicate(field) || field];
  else text = field;
  return desc ? `${text} (descending)` : text;
}

// --------------------------------------------------------------------- helpers ---

/** Look up a named phrase string from the vocabulary, falling back to its `phrase.<name>` key. */
function phrase(ctx, name) {
  const key = ctx.vocab?.phrases?.[name] || `phrase.${name}`;
  return str(ctx.vocab, ctx.lang, key);
}

/** Substitute `{name}` placeholders in a template string from a values object. */
function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (k in values ? values[k] : `{${k}}`));
}

/** Join described conditions with the localized "and" phrase. */
function joinConditions(conditions, ctx) {
  if (conditions.length <= 1) return conditions.join('');
  // "A and B and C" — the vocab and/or strings already carry surrounding spaces
  return conditions.join(phrase(ctx, 'and'));
}

/** Return a predicate array's first entry's value, or the value itself when not an array. */
function firstOf(value) {
  if (Array.isArray(value)) {
    for (const p of value) {
      const e = firstPredicateEntry(p);
      if (e) return e[1];
    }
    return '';
  }
  return value;
}

/** True when a sub-query array has a linked/related sub-query of its own. */
function hasLinks(arr) {
  return arr.some((p) => {
    const e = firstPredicateEntry(p);
    if (!e) return false;
    const { base } = splitPredicateKey(e[0]);
    return isLinkPredicate(base) && Array.isArray(linkValue(base, e[1]));
  });
}

/**
 * A linked sub-query may be written as one predicate object instead of an
 * array: `{"lt:134":{"ids":51}}` == `{"lt:134":[{"ids":51}]}`.
 */
function linkValue(base, value) {
  return isLinkPredicate(base) && value && typeof value === 'object' && !Array.isArray(value)
    ? [value] : value;
}

/** Render a predicate's raw key/value verbatim, for predicates the describer cannot phrase. */
function literalPredicate(base, suffix, value) {
  const key = suffix.raw ? `${base}:${suffix.raw}` : base;
  if (Array.isArray(value) || (value && typeof value === 'object')) return `${key} (…)`;
  return `${key} ${String(value ?? '')}`.trim();
}

/** Capitalize the first character of a sentence. */
function capitalizeFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
