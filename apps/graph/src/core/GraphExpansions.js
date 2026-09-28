/**
 * @file GraphExpansions.js
 * @brief Cached, rule-driven graph expansion (ruleset) engine.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { GraphDocument } from './GraphDocument.js';

/**
 * Cached expansion levels of the whole current result. A physical node/edge is
 * stored once, regardless of how many rules or levels contributed it; the base
 * is immutable. A loaded level is cached by its query path from the result
 * (each step's query and those above it), not by rule, so a rule that was
 * extended or re-created with the same leading steps reuses them.
 */
export class GraphExpansions {
  /**
   * @param {GraphDocument} base Immutable base graph (e.g. the current Filtered Result/Query Source).
   * @param {Array<object>} [rules] Initial expansion rule definitions; see `setRules`.
   * @param {{maxDepth?: number, maxNodes?: number, maxEdges?: number}} [limits] Expansion and composition limits.
   */
  constructor(base, rules = [], limits = {}) {
    this.base = base;
    this.limits = limits;
    this.records = new Map(base.records.map((r) => [r.id, r]));
    this.edges = new Map(base.edges.map((e) => [edgeIdentity(e), e]));
    this.entries = new Map();
    this.baseScope = { key: 'base', seeds: base.recordIds, depth: 0 };
    this.sequence = 0;
    this.setRules(rules);
  }

  /**
   * Replace the rule set. A rule whose execution-relevant shape (query/ignore/levels)
   * is unchanged keeps its id and enabled state; a changed rule takes the enabled
   * state of the rule it replaces at the same position.
   *
   * @param {Array<object>} rules New rule definitions.
   * @returns {void}
   */
  setRules(rules) {
    const previous = this.rules || [];
    const used = new Set();
    const matched = rules.map((rule) => {
      const signature = executionKey(rule);
      const old = previous.find((r) => r.signature === signature && !used.has(r.id));
      if (old) used.add(old.id);
      return { rule, signature, old };
    });
    this.rules = matched.map(({ rule, signature, old }, index) => {
      if (old) {
        old.definition = structuredClone(rule);
        return old;
      }
      const replaced = previous[index] && !used.has(previous[index].id) ? previous[index] : null;
      return {
        definition: structuredClone(rule),
        signature,
        id: `rule-${++this.sequence}`,
        enabled: replaced?.enabled || false,
        maxDepth: Math.min(treeDepth(rule), this.limits.maxDepth || 10),
      };
    });
  }

  /**
   * The expansion scope: the whole current result and the level shown.
   *
   * @returns {{key: string, seeds: Array<number>, depth: number}} The scope.
   */
  scope() {
    return this.baseScope;
  }

  /**
   * Ensure a rule's expansion is loaded and cached down to a given depth,
   * recursively loading each nested level's definition against the previous level's targets.
   *
   * @param {object} rule Rule entry from `this.rules`.
   * @param {{key: string, seeds: Array<number>}} scope Scope returned by `scope()`.
   * @param {number} depth Maximum depth to load (inclusive).
   * @param {function(Array<number>, {query: *}): Promise<{graph: GraphDocument, expansion: {targetIds: Array<number>}}>} load Loader for one level's expansion.
   * @param {function(): boolean} valid Called before applying each loaded level; abandons the walk once it returns `false` (e.g. after a superseding request).
   * @returns {Promise<void>}
   * @throws {Error} When a loaded level's response has no expansion target membership.
   */
  async ensure(rule, scope, depth, load, valid) {
    const visit = async (definition, seeds, parentKey, level) => {
      if (level > depth || level > rule.maxDepth || !seeds.length || definition.ignore) return;
      const key = stepKey(parentKey, definition);
      let entry = this.entries.get(key);
      if (!entry) {
        const result = await load(seeds, { query: definition.query });
        if (!valid()) return;
        const graph = result.graph;
        if (!Array.isArray(result.expansion?.targetIds)) throw new Error('Graph endpoint did not return expansion membership.');
        graph.records.forEach((r) => { if (!this.records.has(r.id)) this.records.set(r.id, r); });
        graph.edges.forEach((e) => { if (!this.edges.has(edgeIdentity(e))) this.edges.set(edgeIdentity(e), e); });
        entry = {
          level,
          nodes: new Set(graph.recordIds),
          edges: new Set(graph.edges.map(edgeIdentity)),
          targets: result.expansion.targetIds,
          truncated: graph.limits?.truncated === true,
        };
        this.entries.set(key, entry);
      }
      for (const child of definition.levels || []) {
        if (!valid()) return;
        await visit(child, entry.targets, key, level + 1);
      }
    };
    await visit(rule.definition, scope.seeds, scope.key, 1);
  }

  /**
   * Compose the base graph with the loaded levels of every enabled rule, down to
   * the current level, into one renderable document, applying node/edge caps and
   * reporting truncation.
   *
   * @returns {GraphDocument} The composed, capped graph document.
   */
  compose() {
    const nodes = new Set(this.base.recordIds);
    const edges = new Set(this.base.edges.map(edgeIdentity));
    let truncated = this.base.limits?.truncated === true;
    const depth = this.baseScope.depth;
    const walk = (definition, parentKey, level, maxDepth) => {
      if (level > depth || level > maxDepth || definition.ignore) return;
      const key = stepKey(parentKey, definition);
      const entry = this.entries.get(key);
      if (!entry) return;
      entry.nodes.forEach((id) => nodes.add(id));
      entry.edges.forEach((id) => edges.add(id));
      truncated ||= entry.truncated;
      for (const child of definition.levels || []) walk(child, key, level + 1, maxDepth);
    };
    for (const rule of this.rules) {
      if (rule.enabled) walk(rule.definition, this.baseScope.key, 1, rule.maxDepth);
    }
    const maxNodes = this.limits.maxNodes || 5000;
    const maxEdges = this.limits.maxEdges || 10000;
    truncated ||= nodes.size > maxNodes || edges.size > maxEdges;
    const visible = new Set([...nodes].slice(0, maxNodes));
    const records = [...visible].map((id) => this.records.get(id));
    const visibleEdges = [...edges]
      .map((id) => this.edges.get(id))
      .filter((e) => visible.has(e.from) && visible.has(e.to))
      .slice(0, maxEdges);
    return new GraphDocument({
      records,
      edges: visibleEdges,
      links: this.base.links,
      paths: this.base.paths,
      limits: { ...this.base.limits, truncated, nodesReturned: records.length, edgesReturned: visibleEdges.length },
    });
  }
}

/** Cache key of one rule step: its parent's key plus the step's own query. */
function stepKey(parentKey, definition) {
  return `${parentKey}>${JSON.stringify(canonical({ query: definition.query, ignore: !!definition.ignore }))}`;
}

/** Stable identity string for an edge, independent of its (possibly synthetic) id. */
export function edgeIdentity(e) {
  return `${e.from}:${e.to}:${e.fieldId || 0}:${e.relationshipId || 0}`;
}

/** Depth of a rule's nested `levels` tree, counting the rule's own level as 1. */
export function treeDepth(rule) {
  return 1 + Math.max(0, ...(rule.levels || []).map(treeDepth));
}

/** A value with object keys sorted, for stable JSON keys. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

/** Canonical JSON key for a rule's execution-relevant shape (query/ignore/levels), used to match rules across `setRules` calls. */
function executionKey(rule) {
  return JSON.stringify(canonical({ query: rule.query, ignore: !!rule.ignore, levels: (rule.levels || []).map(executionKey) }));
}
