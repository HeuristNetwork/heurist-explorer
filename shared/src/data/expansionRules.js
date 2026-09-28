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
