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
 * Cached branch membership. A physical node/edge is stored once, regardless of
 * how many rules, depths or seed scopes contributed it. The base is immutable.
 */
export class GraphExpansions {
  /**
   * @param {GraphDocument} base Immutable base graph (e.g. the current Filtered Result/Dataset).
   * @param {Array<object>} [rules] Initial expansion rule definitions; see `setRules`.
   * @param {{maxDepth?: number, maxNodes?: number, maxEdges?: number}} [limits] Expansion and composition limits.
   */
  constructor(base, rules = [], limits = {}) {
    this.base = base;
    this.limits = limits;
    this.records = new Map(base.records.map((r) => [r.id, r]));
    this.edges = new Map(base.edges.map((e) => [edgeIdentity(e), e]));
    this.entries = new Map();
    this.scopes = new Map();
    this.sequence = 0;
    this.setRules(rules);
  }

  /**
   * Replace the rule set, preserving each surviving rule's id, enabled state, and cached entries
   * when its execution-relevant shape (query/ignore/levels) is unchanged.
   *
   * @param {Array<object>} rules New rule definitions.
   * @returns {void}
   */
  setRules(rules) {
    const previous = this.rules || [];
    const used = new Set();
    this.rules = rules.map((rule) => {
      const signature = executionKey(rule);
      const old = previous.find((r) => r.signature === signature && !used.has(r.id));
      if (old) used.add(old.id);
      if (old) {
        old.definition = structuredClone(rule);
        return old;
      }
      return {
        definition: structuredClone(rule),
        signature,
        id: old?.id || `rule-${++this.sequence}`,
        enabled: old?.enabled || false,
        maxDepth: Math.min(treeDepth(rule), this.limits.maxDepth || 10),
      };
    });
    const ids = new Set(this.rules.map((r) => r.id));
    for (const [key, entry] of this.entries) if (!ids.has(entry.ruleId)) this.entries.delete(key);
  }

  /**
   * Get or create the cache scope for a seed-node set (or the base graph's own records).
   *
   * @param {Array<number>|null} [seedIds] Seed record IDs; `null` for the base graph's own records.
   * @returns {{key: string, seeds: Array<number>, depth: number}} The scope, tracked by a stable key.
   */
  scope(seedIds = null) {
    const seeds = seedIds == null
      ? this.base.recordIds
      : [...new Set(seedIds.map(Number))].sort((a, b) => a - b);
    const key = seedIds == null ? 'base' : seeds.join(',');
    if (!this.scopes.has(key)) this.scopes.set(key, { key, seeds, depth: 0 });
    return this.scopes.get(key);
  }

  /**
   * Ensure a rule's expansion is loaded and cached down to a given depth within a scope,
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
    const visit = async (definition, seeds, path, level, parentKey = null) => {
      if (level > depth || level > rule.maxDepth || !seeds.length || definition.ignore) return;
      const key = `${rule.id}/${scope.key}/${path}`;
      let entry = this.entries.get(key);
      if (!entry) {
        const result = await load(seeds, { query: definition.query });
        if (!valid()) return;
        const graph = result.graph;
        if (!Array.isArray(result.expansion?.targetIds)) throw new Error('Graph endpoint did not return expansion membership.');
        graph.records.forEach((r) => { if (!this.records.has(r.id)) this.records.set(r.id, r); });
        graph.edges.forEach((e) => { if (!this.edges.has(edgeIdentity(e))) this.edges.set(edgeIdentity(e), e); });
        entry = {
          ruleId: rule.id,
          scope: scope.key,
          level,
          parentKey,
          nodes: new Set(graph.recordIds),
          edges: new Set(graph.edges.map(edgeIdentity)),
          targets: result.expansion.targetIds,
          truncated: graph.limits?.truncated === true,
        };
        this.entries.set(key, entry);
      }
      for (const [i, child] of (definition.levels || []).entries()) {
        if (!valid()) return;
        await visit(child, entry.targets, `${path}.${i}`, level + 1, key);
      }
    };
    await visit(rule.definition, scope.seeds, '0', 1);
  }

  /**
   * Compose the base graph with every enabled, in-depth, connected expansion entry into one
   * renderable document, applying node/edge caps and reporting truncation.
   *
   * @returns {GraphDocument} The composed, capped graph document.
   */
  compose() {
    const nodes = new Set(this.base.recordIds);
    const edges = new Set(this.base.edges.map(edgeIdentity));
    const active = new Set();
    let truncated = this.base.limits?.truncated === true;
    // Fixed point begins with the base, so selected-node explorations cannot
    // keep their own disconnected seeds alive through a cycle.
    let changed = true;
    while (changed) {
      changed = false;
      for (const [key, entry] of this.entries) {
        if (active.has(key)) continue;
        const scope = this.scopes.get(entry.scope);
        if (!this.rules.find((r) => r.id === entry.ruleId)?.enabled || entry.level > scope.depth) continue;
        if (entry.parentKey ? !active.has(entry.parentKey) : !scope.seeds.every((id) => nodes.has(id))) continue;
        active.add(key);
        changed = true;
        entry.nodes.forEach((id) => nodes.add(id));
        entry.edges.forEach((id) => edges.add(id));
        truncated ||= entry.truncated;
      }
    }
    const maxNodes = this.limits.maxNodes || 10000;
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

/** Stable identity string for an edge, independent of its (possibly synthetic) id. */
export function edgeIdentity(e) {
  return `${e.from}:${e.to}:${e.fieldId || 0}:${e.relationshipId || 0}`;
}

/** Depth of a rule's nested `levels` tree, counting the rule's own level as 1. */
export function treeDepth(rule) {
  return 1 + Math.max(0, ...(rule.levels || []).map(treeDepth));
}

/** Canonical JSON key for a rule's execution-relevant shape (query/ignore/levels), used to match rules across `setRules` calls. */
function executionKey(rule) {
  const canonical = (value) => Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
      : value;
  return JSON.stringify(canonical({ query: rule.query, ignore: !!rule.ignore, levels: (rule.levels || []).map(executionKey) }));
}
