import { GraphDocument } from './GraphDocument.js';

/** Cached branch membership. A physical node/edge is stored once, regardless of
 * how many rules, depths or seed scopes contributed it. The base is immutable. */
export class GraphExpansions {
  constructor(base, rules = [], limits = {}) {
    this.base = base;
    this.limits = limits;
    this.records = new Map(base.records.map(r => [r.id, r]));
    this.edges = new Map(base.edges.map(e => [edgeIdentity(e), e]));
    this.entries = new Map();
    this.scopes = new Map();
    this.sequence = 0;
    this.setRules(rules);
  }

  setRules(rules) {
    const previous = this.rules || [];
    const used = new Set();
    this.rules = rules.map(rule => {
      const signature = executionKey(rule);
      const old = previous.find(r => r.signature === signature && !used.has(r.id));
      if (old) used.add(old.id);
      if (old) { old.definition = structuredClone(rule); return old; }
      return { definition: structuredClone(rule), signature,
        id: old?.id || `rule-${++this.sequence}`,
        enabled: old?.enabled || false, maxDepth: Math.min(treeDepth(rule), this.limits.maxDepth || 10) };
    });
    const ids = new Set(this.rules.map(r => r.id));
    for (const [key, entry] of this.entries) if (!ids.has(entry.ruleId)) this.entries.delete(key);
  }

  scope(seedIds = null) {
    const seeds = seedIds == null ? this.base.recordIds : [...new Set(seedIds.map(Number))].sort((a,b) => a-b);
    const key = seedIds == null ? 'base' : seeds.join(',');
    if (!this.scopes.has(key)) this.scopes.set(key, { key, seeds, depth: 0 });
    return this.scopes.get(key);
  }

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
        graph.records.forEach(r => { if (!this.records.has(r.id)) this.records.set(r.id, r); });
        graph.edges.forEach(e => { if (!this.edges.has(edgeIdentity(e))) this.edges.set(edgeIdentity(e), e); });
        entry = { ruleId: rule.id, scope: scope.key, level, parentKey,
          nodes: new Set(graph.recordIds), edges: new Set(graph.edges.map(edgeIdentity)),
          targets: result.expansion.targetIds, truncated: graph.limits?.truncated === true };
        this.entries.set(key, entry);
      }
      for (const [i, child] of (definition.levels || []).entries()) {
        if (!valid()) return;
        await visit(child, entry.targets, `${path}.${i}`, level + 1, key);
      }
    };
    await visit(rule.definition, scope.seeds, '0', 1);
  }

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
        if (!this.rules.find(r => r.id === entry.ruleId)?.enabled || entry.level > scope.depth) continue;
        if (entry.parentKey ? !active.has(entry.parentKey) : !scope.seeds.every(id => nodes.has(id))) continue;
        active.add(key); changed = true;
        entry.nodes.forEach(id => nodes.add(id)); entry.edges.forEach(id => edges.add(id));
        truncated ||= entry.truncated;
      }
    }
    const maxNodes = this.limits.maxNodes || 10000, maxEdges = this.limits.maxEdges || 10000;
    truncated ||= nodes.size > maxNodes || edges.size > maxEdges;
    const visible = new Set([...nodes].slice(0, maxNodes));
    const records = [...visible].map(id => this.records.get(id));
    const visibleEdges = [...edges].map(id => this.edges.get(id))
      .filter(e => visible.has(e.from) && visible.has(e.to)).slice(0, maxEdges);
    return new GraphDocument({ records, edges: visibleEdges, links: this.base.links, paths: this.base.paths,
      limits: { ...this.base.limits, truncated, nodesReturned: records.length, edgesReturned: visibleEdges.length } });
  }
}

export function edgeIdentity(e) { return `${e.from}:${e.to}:${e.fieldId || 0}:${e.relationshipId || 0}`; }
export function treeDepth(rule) { return 1 + Math.max(0, ...(rule.levels || []).map(treeDepth)); }
function executionKey(rule) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical({ query: rule.query, ignore: !!rule.ignore, levels: (rule.levels || []).map(executionKey) }));
}
