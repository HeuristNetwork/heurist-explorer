/**
 * @file queryModel.js
 * @brief Pure (DOM-free) compose/parse between the Heurist `q`-array query shape
 *        and the Filter Builder's editable model.
 *
 * `HFilterBuilder` owns the DOM; this module owns the query <-> model mapping so
 * it can be unit-tested without a browser. The target JSON is the same shape the
 * legacy `searchBuilder._doCompose()` produces, e.g.
 *   [{"t":"10"},{"f:12":"=Smith"},{"lf:134":[{"t":"12"},{"f:26":"Paris"}]},{"sortby":"-modified"}]
 * See docs/query-language-filter-builder-plan.md sections 4 / 11 / D12.
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

/**
 * @typedef {Object} FieldRow
 * @property {'field'} type
 * @property {number|string} dty  Field id, header keyword (`title`/`added`/…), or `anyfield`.
 * @property {string} kind        Operator group: text|number|date|enum|term|record|file|geo|bool|tag.
 * @property {?string} enumField  Enum sub-part: term|code|conceptid|desc (null = internal id).
 * @property {?string} op         Operator i18nKey from queryVocabulary (null = default / from token).
 * @property {?string} opToken    Raw operator token when `op` is not yet resolved (parse path).
 * @property {boolean} negate
 * @property {string[]} values
 * @property {'any'|'all'} valueConj
 */

/**
 * @typedef {Object} LinkRow
 * @property {'link'} type
 * @property {'lt'|'lf'|'rt'|'rf'|'related'} link
 * @property {number|string} dty        Pointer field id (`''` = any pointer → bare `lt`/`lf`/…).
 * @property {number|string} targetRty  Linked rectype (`''` = any).
 * @property {'any'|'all'} conjunction   Between sub-rows.
 * @property {FieldRow[]} rows           One level only.
 */

/**
 * @typedef {Object} BuilderModel
 * @property {number|string} rtyId       Main rectype id, `''` = any, `null` = none chosen.
 * @property {'any'|'all'} conjunction   Between top-level rows.
 * @property {string} lang
 * @property {(FieldRow|LinkRow)[]} rows
 * @property {{field:(number|string), dir:'asc'|'desc'}[]} sort
 * @property {?Array} unsupported        Predicates parseQuery could not model (kept for raw round-trip).
 */

const OP_TOKENS = ['<=', '>=', '<>', '><', '==', '@+', '@-', '-', '=', '<', '>', '@'];

/** @returns {BuilderModel} A blank model. */
export function emptyModel(lang = 'eng') {
  return { rtyId: '', conjunction: 'all', lang, rows: [], sort: [], unsupported: null };
}

/** @returns {FieldRow} */
export function emptyFieldRow(overrides = {}) {
  return {
    type: 'field',
    dty: 'anyfield',
    kind: 'text',
    enumField: null,
    op: null,
    opToken: null,
    negate: false,
    values: [''],
    valueConj: 'any',
    parameterId: null,
    ...overrides
  };
}

// -------------------------------------------------------------------- compose ---

/**
 * Model → Heurist `q`-array.
 *
 * @param {BuilderModel} model
 * @param {object} vocabulary Parsed queryVocabulary.json (needs `operators` + `common`).
 * @returns {Array<object>} Possibly empty.
 */
export function composeQuery(model, vocabulary) {
  const vocab = vocabulary || {};
  const out = [];

  const rtyId = model?.rtyId;
  if (rtyId !== '' && rtyId != null && Number(rtyId) > 0) {
    out.push({ t: String(rtyId) });
  }

  const predicates = [];
  for (const row of model?.rows || []) {
    const compiled = row?.type === 'link'
      ? compileLinkRow(row, vocab)
      : compileFieldRow(row, vocab);
    if (compiled) predicates.push(compiled);
  }

  if (predicates.length > 1 && model?.conjunction === 'any') {
    out.push({ any: predicates });
  } else {
    out.push(...predicates);
  }

  for (const entry of model?.sort || []) {
    if (!entry || entry.field === '' || entry.field == null) continue;
    out.push({ sortby: (entry.dir === 'desc' ? '-' : '') + String(entry.field) });
  }

  // a lone {t:} with nothing else is still a valid, runnable query
  if (out.length && model?.unsupported && Array.isArray(model.unsupported)) {
    out.push(...model.unsupported);
  }
  return out;
}

/**
 * Resolve the operator definition for a row.
 * @returns {{token:string, pattern?:string, whole?:boolean, input?:string}}
 */
function resolveOperator(row, vocab) {
  const groups = vocab.operators || {};
  const list = [...(groups[row.kind] || []), ...(vocab.common || [])];
  if (!list.length) return { token: '' };

  if (row.op) {
    const byKey = list.find((o) => o.i18nKey === row.op);
    if (byKey) return byKey;
  }
  if (row.opToken != null) {
    const token = row.opToken;
    // exact token, preferring an entry without a pattern (plain match over starts/ends)
    const exact = list.filter((o) => (o.token || '') === token);
    if (exact.length) return exact.find((o) => !o.pattern) || exact[0];
  }
  return list[0];
}

/** @returns {object|null} predicate */
function compileFieldRow(row, vocab) {
  if (!row) return null;
  const key = fieldKey(row);
  if (!key) return null;

  const op = resolveOperator(row, vocab);

  if (row.parameterId) return null;

  if (op.whole) {
    return wrap(key, op.token);
  }

  const values = (row.values || []).map((v) => String(v ?? '').trim()).filter((v) => v !== '');
  if (!values.length) return null;

  // range operators consume two values into one predicate
  if (op.pattern && /\{a\}/.test(op.pattern)) {
    const rendered = op.pattern.replace('{a}', values[0]).replace('{b}', values[1] ?? values[0]);
    return wrap(key, (row.negate ? '-' : '') + rendered);
  }

  const rendered = values.map((v) => renderScalar(v, op, row.negate));

  if (rendered.length === 1) {
    return wrap(key, rendered[0]);
  }

  const conj = row.valueConj === 'all' ? 'all' : 'any';

  // enum / term / record / tag: OR of ids collapses to one comma-joined value
  if (conj === 'any' && ['enum', 'term', 'record'].includes(row.kind) && key !== 'tag') {
    const joined = rendered.map(stripLeadingDash).join(',');
    return wrap(key, (row.negate ? '-' : '') + joined);
  }

  if (key === 'tag') {
    return { tag: { [conj]: rendered.map(stripLeadingDash) } };
  }

  return { [conj]: rendered.map((v) => wrap(key, v)) };
}

/**
 * Compose a parameterized Builder model with runtime form values.
 * Undefined parameter values omit their predicate; explicit NULL operators
 * remain ordinary Builder criteria.
 *
 * @param {BuilderModel} model Builder model with parameter IDs on field rows.
 * @param {object} values Runtime values by parameter ID.
 * @param {object} vocabulary Query vocabulary.
 * @returns {Array<object>} Executable Heurist query.
 */
export function composeWithParameters(model, values, vocabulary) {
  const copy = structuredClone(model);
  const resolve = (row) => {
    if (!row.parameterId) return;
    const value = values?.[row.parameterId];
    row.parameterId = null;
    if (row.kind === 'geo') {
      row.values = [];
      return;
    }
    if (value && typeof value === 'object' && ('from' in value || 'to' in value)) {
      if (value.from != null && value.from !== '' && (value.to == null || value.to === '')) {
        row.op = row.kind === 'date' ? 'op.on_or_after' : 'op.gte';
        row.values = [String(value.from)];
        return;
      }

      if (value.to != null && value.to !== '' && (value.from == null || value.from === '')) {
        row.op = row.kind === 'date' ? 'op.on_or_before' : 'op.lte';
        row.values = [String(value.to)];
        return;
      }
    }

    row.values = Array.isArray(value)
      ? value.map(String)
      : value && typeof value === 'object' && ('from' in value || 'to' in value)
        ? [value.from ?? '', value.to ?? ''].map(String)
        : value == null || value === '' ? [] : [String(value)];
  };

  for (const row of copy.rows || []) {
    if (row.type === 'link') {
      for (const child of row.rows || []) resolve(child);
    } else {
      resolve(row);
    }
  }

  return composeQuery(copy, vocabulary);
}

/**
 * Resolve query parameters and return optional Map-compatible extent separately.
 *
 * @param {BuilderModel} model Parameterized Builder model.
 * @param {object} values Runtime parameter values.
 * @param {object} vocabulary Query vocabulary.
 * @returns {{q:Array<object>,extent:object|null}} Executable query and extent.
 */
export function composeFilterRequest(model, values, vocabulary) {
  let extent = null;
  const inspect = (row) => {
    if (row?.kind === 'geo' && row.parameterId && values?.[row.parameterId]) {
      extent = values[row.parameterId];
    }
  };

  for (const row of model?.rows || []) {
    if (row.type === 'link') {
      for (const child of row.rows || []) inspect(child);
    } else {
      inspect(row);
    }
  }

  return { q: composeWithParameters(model, values, vocabulary), extent };
}

/** @returns {object|null} predicate */
function compileLinkRow(row, vocab) {
  if (!row || !row.link) return null;
  let key = row.link;
  if (row.dty !== '' && row.dty != null && Number(row.dty) > 0) {
    key += ':' + Number(row.dty);
  }

  const sub = [];
  if (row.targetRty !== '' && row.targetRty != null && Number(row.targetRty) > 0) {
    sub.push({ t: String(row.targetRty) });
  }
  const preds = (row.rows || []).map((r) => compileFieldRow(r, vocab)).filter(Boolean);
  if (preds.length > 1 && row.conjunction === 'any') {
    sub.push({ any: preds });
  } else {
    sub.push(...preds);
  }
  if (!sub.length) return null;
  return { [key]: sub };
}

/** Build a predicate key (`f`, `f:<id>[:<enumField>]`, or a header keyword) from a field row. */
function fieldKey(row) {
  const d = row.dty;
  if (d === 'anyfield' || d === '' || d == null || d === 'f') return 'f';

  if (typeof d === 'string' && !/^\d+$/.test(d)) {
    return canonicalPredicate(d) || d; // title, added, ids, tag, owner, addedby, access, user, url, notes
  }

  let key = 'f:' + Number(d);
  if (row.enumField && row.enumField !== 'internalid') {
    key += ':' + row.enumField;
  }
  return key;
}

/** Render one scalar value with its operator token/pattern and negation prefix applied. */
function renderScalar(value, op, negate) {
  let out = value;
  if (op.pattern && /\{v\}/.test(op.pattern)) {
    out = op.pattern.replace('{v}', value);
  }
  out = (op.token || '') + out;
  if (negate && out.charAt(0) !== '-') out = '-' + out;
  return out;
}

/** Wrap a value under a predicate key: `{ [key]: value }`. */
function wrap(key, value) {
  return { [key]: value };
}

/** Remove a leading `-` (negation) from a string value, if present. */
function stripLeadingDash(value) {
  return typeof value === 'string' && value.charAt(0) === '-' ? value.slice(1) : value;
}

// ---------------------------------------------------------------------- parse ---

/**
 * Heurist `q`-array (array | JSON string | `{q: […]}`) → editable model.
 * Best-effort for the flat + single-level-linked subset; anything it cannot
 * model is preserved verbatim in `model.unsupported`.
 *
 * @param {Array|string|object} input
 * @param {object} [vocabulary] Reserved; the operator is currently kept as a raw
 *        token (`opToken`) and reconciled by the builder once the field kind is known.
 * @returns {BuilderModel}
 */
export function parseQuery(input, vocabulary) { // eslint-disable-line no-unused-vars
  const model = emptyModel();
  const list = toArray(input);
  const leftover = [];

  for (const predicate of list) {
    const entry = firstEntry(predicate);
    if (!entry) continue;
    const [rawKey, value] = entry;
    const { base, suffix } = splitKey(rawKey);

    if (base === 't') { model.rtyId = firstScalar(value); continue; }

    if (base === 'sortby') {
      const raw = String(firstScalar(value) ?? '');
      const desc = raw.startsWith('-');
      const field = desc ? raw.slice(1) : raw;
      if (field) model.sort.push({ field: /^\d+$/.test(field) ? Number(field) : field, dir: desc ? 'desc' : 'asc' });
      continue;
    }

    if ((base === 'any' || base === 'all') && Array.isArray(value)) {
      model.conjunction = base;
      for (const inner of value) {
        const row = fieldRowFromPredicate(inner);
        if (row) model.rows.push(row);
        else leftover.push(inner);
      }
      continue;
    }

    if (isLinkPredicate(base)) {
      const row = linkRowFromPredicate(base, suffix, value);
      if (row) { model.rows.push(row); continue; }
      leftover.push(predicate);
      continue;
    }

    const row = fieldRowFromPredicate(predicate);
    if (row) model.rows.push(row);
    else leftover.push(predicate);
  }

  if (leftover.length) model.unsupported = leftover;
  return model;
}

/** @returns {FieldRow|null} */
function fieldRowFromPredicate(predicate) {
  const entry = firstEntry(predicate);
  if (!entry) return null;
  const [rawKey, value] = entry;
  const { base, suffix } = splitKey(rawKey);

  // nested conjunction of same-field predicates -> multi-value row
  if ((base === 'any' || base === 'all') && Array.isArray(value)) {
    const inner = value.map(firstEntry).filter(Boolean);
    if (!inner.length) return null;
    const keys = new Set(inner.map(([k]) => k));
    if (keys.size !== 1) return null; // heterogeneous group is not a single row
    const seed = fieldRowFromPredicate(value[0]);
    if (!seed) return null;
    seed.values = inner.map(([, v]) => stripToken(String(v)).value);
    seed.valueConj = base;
    return seed;
  }

  const dty = fieldDtyFromKey(base, suffix);
  if (dty == null) return null;

  const row = emptyFieldRow({ dty });
  // for an `f:<id>[:<enumField>]` key the enum sub-part is the SECOND suffix segment
  if (typeof dty === 'number' && suffix.parts.length > 1) {
    row.enumField = suffix.parts[1] || null;
  }

  if (Array.isArray(value)) return null; // link/group value, not a scalar field row

  const raw = String(value ?? '');
  if (raw === 'NULL' || raw === '-NULL') {
    row.op = raw === 'NULL' ? 'op.is_empty' : 'op.is_set';
    row.opToken = raw;
    row.values = [''];
    return row;
  }

  const { negate, token, value: bare } = stripToken(raw);
  row.negate = negate;
  if (token === '><' && bare.includes('/')) {
    row.opToken = token;
    row.values = bare.split('/', 2);
    return row;
  }

  if (bare.includes('<>')) {
    row.opToken = '<>';
    row.values = bare.split('<>', 2);
    return row;
  }

  row.opToken = token;
  row.values = bare.includes(',') ? bare.split(',').map((s) => s.trim()) : [bare];
  if (row.values.length > 1) row.valueConj = 'any';
  return row;
}

/** @returns {LinkRow|null} */
function linkRowFromPredicate(base, suffix, value) {
  if (!Array.isArray(value)) return null;
  const row = {
    type: 'link',
    link: base === 'related' ? 'related' : base,
    dty: suffix.parts.length && /^\d+$/.test(suffix.parts[0]) ? Number(suffix.parts[0]) : '',
    targetRty: '',
    conjunction: 'all',
    rows: []
  };
  for (const inner of value) {
    const entry = firstEntry(inner);
    if (!entry) continue;
    const [k, v] = entry;
    const { base: b } = splitKey(k);
    if (b === 't') { row.targetRty = firstScalar(v); continue; }
    if ((b === 'any' || b === 'all') && Array.isArray(v)) {
      row.conjunction = b;
      for (const p of v) { const fr = fieldRowFromPredicate(p); if (fr) row.rows.push(fr); }
      continue;
    }
    const fr = fieldRowFromPredicate(inner);
    if (fr) row.rows.push(fr);
  }
  return row;
}

// --------------------------------------------------------------------- helpers ---

/**
 * Normalize a `q`-array input (array, JSON string, or `{q: […]}`) to a plain array.
 *
 * @param {Array|string|object} input Raw query input.
 * @returns {Array<object>} Normalized predicate array; `[]` when unparseable.
 */
function toArray(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object' && Array.isArray(input.q)) return input.q;
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.q) ? parsed.q : []);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Return a single-key predicate object's `[key, value]` entry.
 *
 * @param {*} predicate Predicate object (`{key: value}`).
 * @returns {[string, *]|null} The entry, or `null` when not a plain object with a key.
 */
function firstEntry(predicate) {
  if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) return null;
  const keys = Object.keys(predicate);
  return keys.length ? [keys[0], predicate[keys[0]]] : null;
}

/**
 * Split a raw predicate key (e.g. `f:12:term`) into its canonical base and remaining suffix parts.
 *
 * @param {string} rawKey Raw predicate key.
 * @returns {{base: string, suffix: {raw: string, parts: string[]}}}
 */
function splitKey(rawKey) {
  const parts = String(rawKey).split(':');
  const base = canonicalPredicate(parts[0]) || parts[0];
  return { base, suffix: { raw: parts.slice(1).join(':'), parts: parts.slice(1) } };
}

/**
 * Resolve a field row's `dty` value (numeric field id, header keyword, or `'anyfield'`) from a split predicate key.
 *
 * @param {string} base Canonical predicate base keyword.
 * @param {{raw: string, parts: string[]}} suffix Remaining predicate key parts after the base.
 * @returns {number|string|null} Field id, header keyword, `'anyfield'`, or `null` when not a field predicate.
 */
function fieldDtyFromKey(base, suffix) {
  if (base === 'f' || base === 'fc') {
    if (!suffix.parts.length) return 'anyfield';
    return /^\d+$/.test(suffix.parts[0]) ? Number(suffix.parts[0]) : null;
  }
  if (['title', 'url', 'notes', 'added', 'modified', 'ids', 'owner', 'addedby', 'access', 'tag', 'user'].includes(base)) {
    return base;
  }
  return null;
}

/**
 * Return a predicate value as a scalar: the value itself, or the first sub-entry's value when it's a group array.
 *
 * @param {*} value Predicate value.
 * @returns {*}
 */
function firstScalar(value) {
  if (Array.isArray(value)) {
    const hit = value.map(firstEntry).find(Boolean);
    return hit ? hit[1] : '';
  }
  return value;
}

/**
 * Split a raw predicate value into `{ negate, token, value }`.
 * `-` is a negation prefix only when followed by another operator or text.
 */
function stripToken(raw) {
  let s = String(raw ?? '');
  let negate = false;

  if (s.startsWith('-') && s.length > 1) {
    negate = true;
    s = s.slice(1);
  }

  let token = '';
  for (const candidate of OP_TOKENS) {
    if (candidate === '-') continue;
    if (s.startsWith(candidate)) { token = candidate; s = s.slice(candidate.length); break; }
  }

  // wildcard %val / val% map back to starts/ends operators (token stays '')
  return { negate, token, value: s };
}

/* Helpers reused by queryDescribe.js - re-exported under stable names. */
export {
  toArray as queryToArray,
  firstEntry as firstPredicateEntry,
  splitKey as splitPredicateKey,
  stripToken as stripValueToken
};
