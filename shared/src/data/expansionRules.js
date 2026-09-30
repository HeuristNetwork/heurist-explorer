/**
 * @file expansionRules.js
 * @brief Shared helpers for DataSource expansion rules (`request.rules`).
 *
 * A rule is `{ query, levels: [rule…] }`: its query is level 1, each nested
 * `levels` entry one level deeper. Level 0 is the current result. See
 * docs/development/09 Expansion-Levels-Graph-and-Data-Plan.md.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Most levels one rule may have: its query plus three steps (graph levels 0–4). */
export const MAX_RULE_DEPTH = 4;

/** Traversal keys of a rule query (a link or relationship predicate, optionally with a field). */
const TRAVERSAL = /^(?:lt|lf|rt|rf|links|related|connected)(?::|$)/;

/**
 * @param {object} rule Rule definition.
 * @returns {number} Depth of the rule tree, the rule's own query counting as 1.
 */
export function ruleDepth(rule) {
  return 1 + Math.max(0, ...(rule?.levels || []).map(ruleDepth));
}

/**
 * Record-type IDs of a `t` value: a number, an ID list string or an array.
 *
 * @param {*} value `t` predicate value.
 * @returns {number[]} Positive IDs; empty for none (any record type).
 */
export function typeIds(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(list.map((id) => Number(String(id).trim())).filter((id) => Number.isInteger(id) && id > 0))];
}

/** @returns {number[]} Target record types of one rule step (`t` of its query); empty = any. */
export function ruleTargetTypes(rule) {
  const query = rule?.query;
  if (!query || typeof query !== 'object') return [];
  if (Array.isArray(query)) return typeIds(query.find((item) => item && item.t != null)?.t);
  return typeIds(query.t);
}

/**
 * Quick expansion: add one "any record type → any pointer or relationship → any
 * record type" step (`connected`) to every branch shorter than `maxDepth`. With no
 * rules, one such rule starting from the whole result. Changed rules lose their
 * `name`/`description` so the host can describe them again.
 *
 * @param {Array<object>} rules Current rules (not modified).
 * @param {number} [maxDepth=MAX_RULE_DEPTH] Deepest allowed level.
 * @returns {Array<object>|null} New rules, or `null` when no branch can grow.
 */
export function appendQuickStep(rules, maxDepth = MAX_RULE_DEPTH) {
  const list = Array.isArray(rules) ? rules : [];
  if (!list.length) return [{ query: { connected: [] }, levels: [] }];
  let grown = false;
  const grow = (rule, level) => {
    const copy = { ...rule, levels: (rule.levels || []).map((child) => grow(child, level + 1)) };
    if (!copy.levels.length && level < maxDepth) {
      const parent = ruleTargetTypes(rule);
      copy.levels = [{ query: { connected: parent.length ? [{ t: parent.length === 1 ? parent[0] : parent }] : [] }, levels: [] }];
      grown = true;
    }
    if (JSON.stringify(copy.levels) !== JSON.stringify(rule.levels || [])) {
      delete copy.name;
      delete copy.description;
    }
    return copy;
  };
  const result = list.map((rule) => grow(rule, 1));
  return grown ? result : null;
}

/** @returns {boolean} Whether a rule-query key is a traversal (lt, lf, rt, rf, links, related, connected). */
export function isTraversalKey(key) {
  return TRAVERSAL.test(String(key));
}

/**
 * Deepest level the given rules reach (0 without rules). Rules marked `ignore`
 * are not traversed, as in the Graph.
 *
 * @param {Array<object>} rules Rule definitions.
 * @returns {number}
 */
export function rulesDepth(rules) {
  const depth = (rule) => (rule?.ignore ? 0 : 1 + Math.max(0, ...(rule.levels || []).map(depth)));
  return Math.min(MAX_RULE_DEPTH, Math.max(0, ...(Array.isArray(rules) ? rules : []).map(depth)));
}

/**
 * Turn an expansion level into one ordinary record query (plan 09 §7): the
 * records that step `level` of every rule reaches from the base result. A
 * step's traversal gets its parent level as an extra condition,
 * `{t:10, lf:[{t:5}]}` from `Q` → `{t:10, lf:[{t:5}, {all: Q}]}`; branches are
 * joined with `any`. The base is the current query, or `{ids: parentIds}` when
 * the selection filters the level (D7). A text query is embedded as is (the
 * server parses text inside `all`).
 *
 * @param {object|Array|string} query Current (level 0) query.
 * @param {Array<object>} rules Enabled rule definitions.
 * @param {number} level Level 1–4.
 * @param {object} [options]
 * @param {Array<number>} [options.parentIds] Base record IDs instead of the query.
 * @param {boolean} [options.cumulative=false] All levels 1..level instead of exactly `level`.
 * @returns {object|null} The level query, or `null` when no rule reaches the level.
 */
export function expansionLevelQuery(query, rules, level, { parentIds = null, cumulative = false } = {}) {
  const ids = Array.isArray(parentIds) ? parentIds.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
  const base = ids.length ? { ids } : query;
  const target = Math.min(MAX_RULE_DEPTH, Number(level) || 0);
  if (target < 1 || base == null || base === '' || !Array.isArray(rules)) return null;
  const branches = [];
  const walk = (rule, depth, parent) => {
    if (!rule || rule.ignore || depth > target) return;
    const step = attachParent(rule.query, parent);
    if (!step) return;
    if (depth === target || cumulative) branches.push(step);
    for (const child of rule.levels || []) walk(child, depth + 1, step);
  };
  for (const rule of rules) walk(rule, 1, base);
  if (!branches.length) return null;
  return branches.length === 1 ? branches[0] : { any: branches.map((branch) => ({ all: branch })) };
}

/**
 * A rule step's query with the parent level added to its (single) traversal.
 *
 * @param {object|Array} stepQuery Rule step query.
 * @param {object|Array|string} parent Parent level query.
 * @returns {object|Array|null} New query, or `null` when the step has no traversal.
 */
function attachParent(stepQuery, parent) {
  let attached = false;
  const attach = (key, value) => {
    if (attached || !isTraversalKey(key)) return value;
    attached = true;
    return [...linkedConditions(value), { all: parent }];
  };
  let result = null;
  if (Array.isArray(stepQuery)) {
    result = stepQuery.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, attach(key, value)]));
    });
  } else if (stepQuery && typeof stepQuery === 'object') {
    result = Object.fromEntries(Object.entries(stepQuery).map(([key, value]) => [key, attach(key, value)]));
  }
  return attached ? result : null;
}

/** Conditions of a traversal value as a predicate list: empty (any record), a record-ID list, or a query. */
function linkedConditions(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    if (!value.length) return [];
    return value.every((item) => item == null || typeof item !== 'object') ? [{ ids: value }] : structuredClone(value);
  }
  if (typeof value === 'object') return Object.keys(value).length ? [structuredClone(value)] : [];
  return [{ ids: value }];
}
