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

import { canonicalPredicate, isLinkPredicate, isGroupPredicate } from './queryPredicates.js';
import { extentToWkt, isExtent } from '#shared/utils';

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
 * @property {?{west:number,south:number,east:number,north:number}} [geoExtent]
 *           Map extent of a geo row; composed as the extent object itself.
 * @property {boolean} [rel]      Condition on the Relationship record inside a `related`
 *           (`rt`/`rf`) sub-query: `dty:'reltype'` composes as `r` (relation types),
 *           a numeric `dty` as `relf:<id>` (a Relationship-record field).
 */

/**
 * @typedef {Object} LinkRow
 * @property {'link'} type
 * @property {'lt'|'lf'|'rt'|'rf'|'related'} link
 * @property {number|string} dty        Pointer field id (`''` = any pointer → bare `lt`/`lf`/…).
 *           For `related` it is the relmarker field the branch came from - UI only (its
 *           vocabulary feeds the relation-type picker); the key stays bare `related`,
 *           whose suffix would mean relation types.
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
    selected: false,
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
  if (['owner', 'access', 'addedby'].includes(row.dty) && row.op === 'op.is') return { token: '' };
  if (['owner', 'access', 'addedby'].includes(row.dty) && row.op === 'op.is_not') return { token: '-' };
  if (row.op === 'op.count') return { token: '', input: 'count' };
  if (row.op === 'op.exists') return { token: '', whole: true };
  if (row.op === 'op.missing') return { token: 'NULL', whole: true };
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
  const op = resolveOperator(row, vocab);
  const key = fieldKey(row, op);
  if (!key) return null;

  // a map extent is sent as-is: {"geo":{"west":…,"south":…,"east":…,"north":…}}
  if (row.kind === 'geo' && row.op !== 'op.count' && isExtent(row.geoExtent)) {
    const { west, south, east, north } = row.geoExtent;
    return wrap(key, { west: Number(west), south: Number(south), east: Number(east), north: Number(north) });
  }

  if (op.whole) {
    return wrap(key, op.token);
  }

  if (op.pattern && /\{a\}/.test(op.pattern)
    && [row.values?.[0], row.values?.[1]].some((value) => String(value ?? '').trim() === '')) {
    return null;
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

/** @returns {object|null} predicate */
function compileLinkRow(row, vocab) {
  if (!row || !row.link) return null;
  let key = row.link;
  // `related:<n>` would mean relation type n, so the relmarker id is not written
  if (row.link !== 'related' && row.dty !== '' && row.dty != null && Number(row.dty) > 0) {
    key += ':' + Number(row.dty);
  }

  const sub = [];
  if (row.targetRty !== '' && row.targetRty != null && Number(row.targetRty) > 0) {
    sub.push({ t: String(row.targetRty) });
  }
  const preds = (row.rows || []).map((r) => r?.type === 'link'
    ? compileLinkRow(r, vocab) : compileFieldRow(r, vocab)).filter(Boolean);
  if (preds.length > 1 && row.conjunction === 'any') {
    sub.push({ any: preds });
  } else {
    sub.push(...preds);
  }
  if (!sub.length) return null;
  return { [key]: sub };
}

/**
 * Build a predicate key (`f`, `f:<id>[:<enumField>]`, `geo[:<id>]:<mode>`, or a header
 * keyword) from a field row. A geo key always carries its match mode
 * (`within` | `intersects`), so a saved query never depends on the server default.
 */
function fieldKey(row, op = {}) {
  const d = row.dty;
  // Relationship-record conditions inside a related sub-query
  if (d === 'reltype') return 'r';
  if (row.rel && /^\d+$/.test(String(d))) return `relf:${Number(d)}`;
  // count of values applies to any field type, geo included
  if (row.op === 'op.count' && /^\d+$/.test(String(d))) return `fc:${Number(d)}`;
  if (row.kind === 'geo' || d === 'geo') {
    const key = /^\d+$/.test(String(d)) ? `geo:${Number(d)}` : 'geo';
    return op.geoMode ? `${key}:${op.geoMode}` : key;
  }
  if (d === 'exists') return 'exists';
  if (d === 'anyfield' || d === '' || d == null || d === 'f') return 'f';

  if (typeof d === 'string' && !/^\d+$/.test(d)) {
    return canonicalPredicate(d) || d; // title, added, ids, tag, owner, addedby, access, user, url, notes
  }

  let key = (row.op === 'op.count' ? 'fc:' : 'f:') + Number(d);
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
 * Replace record-type and field NAMES with ids so the query can be modelled:
 *   [{"t":"Life event"},{"f:Date of event":"=2026-09-23"}]
 *   -> [{"t":"48"},{"f:9":"=2026-09-23"}]
 * Field names (in `f:`/`fc:`/`geo:` keys and link pointer keys `lt:<name>`) resolve
 * within the record type of their own level; linked sub-queries use their own `t`.
 * Names that do not resolve are left as written.
 *
 * @param {Array|string|object} input Query in any shape `parseQuery` accepts.
 * @param {object|null} dbdefs `HDbDefs` (needs `rectypeIdByName`, `fieldIdByName`).
 * @returns {Array<object>} Normalized predicate list.
 */
export function resolveQueryNames(input, dbdefs) {
  const list = toArray(input);
  return dbdefs ? resolveLevel(list, dbdefs, null) : list;
}

/** Resolve names in one predicate level; `scope` is the enclosing rectype for groups. */
function resolveLevel(list, dbdefs, scope) {
  const firstId = (hit) => Number(Array.isArray(hit) ? hit[0] : hit) || null;
  const rtyOf = (value) => String(value ?? '').split(',').map((part) => {
    const raw = part.trim();
    return /^\d+$/.test(raw) ? raw : String(firstId(dbdefs.rectypeIdByName?.(raw)) || raw);
  }).join(',');

  const tEntry = list.find((p) => splitKey(Object.keys(p)[0]).base === 't');
  const rtyText = tEntry ? rtyOf(firstScalar(Object.values(tEntry)[0])) : '';
  const rty = /^\d+/.test(rtyText) ? Number(rtyText.split(',')[0]) : scope;

  return list.map((predicate) => {
    const [key, value] = Object.entries(predicate)[0];
    const { base, suffix } = splitKey(key);
    if (base === 't') return { [key]: rtyOf(firstScalar(value)) };
    if (isGroupPredicate(base) && Array.isArray(value)) return { [key]: resolveLevel(value, dbdefs, rty) };

    // field name in the key -> id, within this level's record type
    let outKey = key;
    const name = suffix.parts[0];
    const isGeoMode = base === 'geo' && GEO_MODES.includes(String(name).toLowerCase());
    // relf:<name> / r:<name> name a Relationship-record field; `related:` lists relation types
    const isRelField = base === 'relf' || base === 'r';
    const fieldScope = isRelField ? (dbdefs.dbconst?.('RT_RELATION') ?? 1) : rty;
    if (name && !/^\d+$/.test(name) && !isGeoMode && base !== 'related' && fieldScope != null
        && (base === 'f' || base === 'fc' || base === 'geo' || isLinkPredicate(base))) {
      const id = firstId(dbdefs.fieldIdByName?.(fieldScope, name));
      if (id) outKey = [key.split(':')[0], id, ...suffix.parts.slice(1)].join(':');
    }
    if (isLinkPredicate(base) && Array.isArray(value)) return { [outKey]: resolveLevel(value, dbdefs, null) };
    return { [outKey]: value };
  });
}

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
        const row = linkedChildFromPredicate(inner);
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

  const row = emptyFieldRow({ dty, selected: true, kind: base === 'geo' ? 'geo' : 'text' });
  if (base === 'fc') {
    row.op = 'op.count';
    row.values = [String(value ?? '')];
    return row;
  }
  if (base === 'exists') {
    row.kind = 'exists';
    row.op = String(value ?? '') === 'NULL' ? 'op.missing' : 'op.exists';
    row.values = [''];
    return row;
  }
  if (base === 'geo') {
    // match mode from the key; without one the server treats WKT as `within`
    // and an extent as `intersects`
    const mode = geoModeFromSuffix(suffix) || (isExtent(value) ? 'intersects' : 'within');
    row.op = `op.${mode}`;
    if (isExtent(value)) {
      row.geoExtent = { ...value };
      row.values = [extentToWkt(value)];   // non-blank, so it is not taken for a parameter
    } else {
      row.values = [String(value ?? '')];
    }
    return row;
  }
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
  // date-style range tokens ('<>'/'><') are a leading prefix on `<token>a/b`;
  // stripToken already consumed the prefix, so what's left splits on '/'.
  if ((token === '><' || token === '<>') && bare.includes('/')) {
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
  // `{"lt:134":{"ids":51}}` is shorthand for `{"lt:134":[{"ids":51}]}`
  if (value && typeof value === 'object' && !Array.isArray(value)) value = [value];
  if (!Array.isArray(value)) return null;
  const numericSuffix = suffix.parts.length && /^\d+$/.test(suffix.parts[0]) ? Number(suffix.parts[0]) : '';
  const row = {
    type: 'link',
    link: base === 'related' ? 'related' : base,
    // for `related` the suffix lists relation types (kept as a relation-type row below)
    dty: base === 'related' ? '' : numericSuffix,
    targetRty: '',
    conjunction: 'all',
    rows: []
  };
  if (base === 'related' && suffix.raw) {
    row.rows.push(relationTypeRow(suffix.raw));
  }
  for (const inner of value) {
    const entry = firstEntry(inner);
    if (!entry) continue;
    const [k, v] = entry;
    const { base: b } = splitKey(k);
    if (b === 't') { row.targetRty = firstScalar(v); continue; }
    if ((b === 'any' || b === 'all') && Array.isArray(v)) {
      row.conjunction = b;
      for (const p of v) {
        const fr = linkedChildFromPredicate(p);
        if (fr) row.rows.push(fr);
      }
      continue;
    }
    const fr = linkedChildFromPredicate(inner);
    if (fr) row.rows.push(fr);
  }
  return row;
}

/** Parse a field or another linked predicate within a linked subquery. */
function linkedChildFromPredicate(predicate) {
  const entry = firstEntry(predicate);
  if (!entry) return null;
  const { base, suffix } = splitKey(entry[0]);
  // Relationship-record conditions: `r` (relation types), `relf:<id>` / `r:<id>` (fields)
  if (base === 'r' && !suffix.raw) return relationTypeRow(entry[1]);
  if (base === 'relf' || base === 'r') {
    if (!suffix.raw) return null;
    const row = fieldRowFromPredicate({ [`f:${suffix.raw}`]: entry[1] });
    if (row) row.rel = true;
    return row;
  }
  return isLinkPredicate(base)
    ? linkRowFromPredicate(base, suffix, entry[1])
    : fieldRowFromPredicate(predicate);
}

/**
 * Relation-type condition row (`r`) from a comma list or array of term ids.
 *
 * @param {*} value Relation type id(s).
 * @returns {FieldRow}
 */
function relationTypeRow(value) {
  const ids = (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map((id) => String(id).trim()).filter(Boolean);
  return emptyFieldRow({
    dty: 'reltype', kind: 'term', rel: true, selected: true, op: 'op.is', values: ids.length ? ids : ['']
  });
}

// --------------------------------------------------------------------- helpers ---

/**
 * Normalize a `q`-array input (array, JSON string, or `{q: […]}`) to a plain array.
 *
 * @param {Array|string|object} input Raw query input.
 * @returns {Array<object>} Normalized predicate array; `[]` when unparseable.
 */
function toArray(input) {
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return [];
    try { input = JSON.parse(text); } catch { return []; }
  }
  if (input && typeof input === 'object' && !Array.isArray(input) && 'q' in input) input = input.q;
  return normalizePredicates(input);
}

/**
 * Canonical predicate list: one key per predicate object. Heurist also accepts
 * several keys in one object (implicit AND) and a single object where a
 * sub-query array is expected, so
 *   `{"t":10,"lt:134":{"t":12,"title":"Baghdad"}}`
 * becomes `[{"t":10},{"lt:134":[{"t":12},{"title":"Baghdad"}]}]`.
 * Link (`lt`/`lf`/…) and group (`any`/`all`/`not`) values are normalized
 * recursively; other values (e.g. a field's `{any:[…]}` value list) are kept.
 *
 * @param {*} input Predicate array or object.
 * @returns {Array<object>}
 */
function normalizePredicates(input) {
  const list = Array.isArray(input) ? input : (input && typeof input === 'object' ? [input] : []);
  const out = [];
  for (const predicate of list) {
    if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) continue;
    for (const [key, value] of Object.entries(predicate)) {
      const { base } = splitKey(key);
      const nested = (isLinkPredicate(base) || isGroupPredicate(base))
        && value && typeof value === 'object';
      out.push({ [key]: nested ? normalizePredicates(value) : value });
    }
  }
  return out;
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
  if (base === 'geo') {
    // geo[:<id>][:within|intersects]
    return suffix.parts.length && /^\d+$/.test(suffix.parts[0])
      ? Number(suffix.parts[0]) : 'geo';
  }
  if (base === 'f' || base === 'fc') {
    if (!suffix.parts.length) return 'anyfield';
    return /^\d+$/.test(suffix.parts[0]) ? Number(suffix.parts[0]) : null;
  }
  if (['title', 'url', 'notes', 'added', 'modified', 'ids', 'owner', 'addedby', 'access', 'tag', 'user', 'exists'].includes(base)) {
    return base;
  }
  return null;
}

/** Spatial match modes a geo key may carry: `geo[:<id>]:within|intersects`. */
export const GEO_MODES = Object.freeze(['within', 'intersects']);

/**
 * @param {{parts: string[]}} suffix Split geo key suffix.
 * @returns {'within'|'intersects'|null} The key's match mode, if any.
 */
function geoModeFromSuffix(suffix) {
  const mode = String(suffix.parts.at(-1) ?? '').toLowerCase();
  return GEO_MODES.includes(mode) ? mode : null;
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
