/**
 * @file queryDescribe.js
 * @brief Task A-min: render a Heurist `q`-array query as a plain human sentence.
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer.utils
 * @link        https://HeuristNetwork.org
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 *
 * Pure (DOM-free) client describer for the inline helper's post-parse display
 * (plan D6 / M4). Covers flat predicates + one linked sub-query level + sort;
 * anything it cannot phrase is rendered verbatim rather than dropped or thrown.
 * The canonical, fully-nested describer is the server `QueryDescriber` (M7).
 *
 * e.g. [{t:"10"},{"f:12":"=Smith"},{"sortby":"-modified"}]
 *      -> "Find Persons where Family name is Smith, sorted by Date modified"
 */

import {
  queryToArray,
  firstPredicateEntry,
  splitPredicateKey,
  stripValueToken
} from './queryModel.js';
import {
  canonicalPredicate,
  isLinkPredicate,
  isGroupPredicate,
  HEADER_KEYWORDS
} from './queryPredicates.js';
import { str, kindFor, operatorsFor } from './vocabHelpers.js';

const HEADER_LABELS = {
  title: 'title', url: 'URL', notes: 'notes', added: 'date added',
  modified: 'date modified', ids: 'record ID', owner: 'owner',
  addedby: 'creator', access: 'visibility', tag: 'tag', user: 'bookmarked by'
};

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
  let rectypeId = scopeRty ?? null;
  const linkClauses = [];   // "linked to …" / "related to …" - attach to the rectype
  const conditions = [];    // field / header / group conditions - go inside "where"
  const sorts = [];

  for (const predicate of arr) {
    const entry = firstPredicateEntry(predicate);
    if (!entry) continue;
    const [rawKey, value] = entry;
    const { base, suffix } = splitPredicateKey(rawKey);

    if (base === 't') {
      rectypeId = resolveRectypeId(firstOf(value), ctx) ?? rectypeId;
      continue;
    }
    if (base === 'sortby') {
      const s = describeSort(String(firstOf(value) ?? ''), rectypeId, ctx);
      if (s) sorts.push(s);
      continue;
    }
    if (isLinkPredicate(base) && Array.isArray(value)) {
      linkClauses.push(describePredicate(base, suffix, value, ctx, rectypeId));
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

  const rectypeText = rectypeId
    ? rectypeName(rectypeId, ctx, { plural: true })
    : phrase(ctx, 'any_type');

  let out = top ? fill(phrase(ctx, 'find'), { rectype: rectypeText }) : rectypeText;
  if (linkClauses.length) out += ' ' + linkClauses.join(phrase(ctx, 'and'));
  if (conditions.length) {
    out += ' ' + fill(phrase(ctx, 'where'), { conditions: joinConditions(conditions, ctx) });
  }
  if (top && sorts.length) {
    out += ', ' + fill(phrase(ctx, 'sort_by'), { fields: sorts.join(', ') });
  }
  return out.trim();
}

function describePredicate(base, suffix, value, ctx, scopeRty) {
  // linked / related sub-query
  if (isLinkPredicate(base) && Array.isArray(value)) {
    const phraseKey = LINK_PHRASE[base] || 'related';
    const subRty = subqueryRectype(value, ctx);
    const subquery = describeGroup(value, ctx, { top: false, scopeRty: subRty });
    return fill(phrase(ctx, phraseKey), { subquery });
  }

  // header keyword (title, added, owner, …)
  if (HEADER_KEYWORDS[base]) {
    const fieldText = HEADER_LABELS[base] || base;
    const kind = kindFor(ctx.vocab, null, base);
    const { op, val } = describeOpValue(kind, value, null, ctx);
    return fill(phrase(ctx, 'header_cond'), { field: fieldText, op, value: val }).trim();
  }

  // field predicate  f:<id>[:<enumField>]  /  fc:<id>
  if (base === 'f' || base === 'fc') {
    const parts = suffix.parts;
    const dtyId = parts.length && /^\d+$/.test(parts[0]) ? Number(parts[0]) : null;
    const enumField = dtyId != null && parts.length > 1 ? parts[1] : null;
    let fieldText = dtyId == null ? 'any field' : fieldName(dtyId, scopeRty, ctx);
    if (enumField) fieldText += ` (${enumField})`;
    const kind = fieldKind(dtyId, scopeRty, ctx, enumField);
    const { op, val } = describeOpValue(kind, value, dtyId, ctx);
    return fill(phrase(ctx, 'field_cond'), { field: fieldText, op, value: val }).trim();
  }

  // grouping wrapper reached as a predicate value
  if (isGroupPredicate(base) && Array.isArray(value)) {
    return describeGroupWrapper(base, value, ctx, scopeRty);
  }

  // anything else: show it literally so nothing is silently lost
  return literalPredicate(base, suffix, value);
}

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
function describeOpValue(kind, rawValue, dtyId, ctx) {
  if (Array.isArray(rawValue)) {
    return { op: str(ctx.vocab, ctx.lang, 'op.is'), val: '' };
  }
  if (rawValue && typeof rawValue === 'object') {
    const entry = firstPredicateEntry(rawValue);
    if (entry && Array.isArray(entry[1])) {
      const joinWord = entry[0] === 'all' ? phrase(ctx, 'and') : phrase(ctx, 'or');
      const parts = entry[1].map((p) => {
        const e = firstPredicateEntry(p);
        return e ? describeOpValue(kind, e[1], dtyId, ctx).val : '';
      }).filter(Boolean);
      return { op: str(ctx.vocab, ctx.lang, 'op.is'), val: parts.join(joinWord) };
    }
    return { op: str(ctx.vocab, ctx.lang, 'op.is'), val: '' };
  }

  const raw = String(rawValue ?? '');

  if (raw === 'NULL' || raw === '-NULL') {
    return { op: str(ctx.vocab, ctx.lang, raw === 'NULL' ? 'op.is_empty' : 'op.is_set'), val: '' };
  }

  const { negate, token, value } = stripValueToken(raw);
  let bare = value;
  let opKey = null;

  // %val / val% -> starts/ends with (token stays '')
  if (token === '' && !negate) {
    if (/^%.+/.test(bare) && !/%$/.test(bare)) { opKey = 'op.ends_with'; bare = bare.slice(1); }
    else if (/.+%$/.test(bare) && !/^%/.test(bare)) { opKey = 'op.starts_with'; bare = bare.slice(0, -1); }
  }

  if (!opKey) opKey = operatorKeyForToken(kind, token, negate, ctx);

  const parts = bare.includes(',') ? bare.split(',').map((s) => s.trim()) : [bare];
  const humanized = parts.map((p) => humanizeValue(kind, p, dtyId, ctx)).filter((p) => p !== '');
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

function humanizeValue(kind, value, dtyId, ctx) {
  const v = String(value ?? '').trim();
  if (v === '') return '';
  if ((kind === 'enum' || kind === 'term') && ctx.dbdefs && /^\d+$/.test(v)) {
    return ctx.dbdefs.termLabel?.(Number(v)) || v;
  }
  if (kind === 'record' && ctx.dbdefs && /^\d+$/.test(v)) {
    return `record ${v}`;
  }
  return v;
}

// ---------------------------------------------------------------- name lookups ---

function resolveRectypeId(value, ctx) {
  const raw = String(value ?? '').split(',')[0].trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (ctx.dbdefs?.rectypeIdByName) {
    const hit = ctx.dbdefs.rectypeIdByName(raw);
    if (Array.isArray(hit)) return hit[0] ?? null;
    if (hit) return hit;
  }
  return null;
}

function subqueryRectype(arr, ctx) {
  for (const p of arr) {
    const e = firstPredicateEntry(p);
    if (e && (canonicalPredicate(e[0].split(':')[0]) === 't')) {
      return resolveRectypeId(firstOf(e[1]), ctx);
    }
  }
  return null;
}

function rectypeName(id, ctx, { plural = false } = {}) {
  if (ctx.dbdefs?.rectypeName) {
    const n = ctx.dbdefs.rectypeName(id, { plural });
    if (n) return n;
  }
  return `record type ${id}`;
}

function fieldName(dtyId, scopeRty, ctx) {
  if (ctx.dbdefs) {
    const n = ctx.dbdefs.fieldName?.(scopeRty ?? '', dtyId)
      || ctx.dbdefs.fieldGlobal?.(dtyId)?.name;
    if (n) return n;
  }
  return `field ${dtyId}`;
}

function fieldKind(dtyId, scopeRty, ctx, enumField) {
  if (dtyId == null) return 'text';
  if (enumField && enumField !== 'internalid') return 'text'; // label/code sub-part is a string
  const type = ctx.dbdefs?.fieldType?.(scopeRty ?? '', dtyId)
    || ctx.dbdefs?.fieldGlobal?.(dtyId)?.type
    || 'freetext';
  return kindFor(ctx.vocab, type);
}

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

function phrase(ctx, name) {
  const key = ctx.vocab?.phrases?.[name] || `phrase.${name}`;
  return str(ctx.vocab, ctx.lang, key);
}

function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (k in values ? values[k] : `{${k}}`));
}

function joinConditions(conditions, ctx) {
  if (conditions.length <= 1) return conditions.join('');
  // "A and B and C" — the vocab and/or strings already carry surrounding spaces
  return conditions.join(phrase(ctx, 'and'));
}

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

function literalPredicate(base, suffix, value) {
  const key = suffix.raw ? `${base}:${suffix.raw}` : base;
  if (Array.isArray(value) || (value && typeof value === 'object')) return `${key} (…)`;
  return `${key} ${String(value ?? '')}`.trim();
}

function capitalizeFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
