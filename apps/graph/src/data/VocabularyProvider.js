/**
 * @file VocabularyProvider.js
 * @brief Resolves edge detail-type and relation-type labels from the Heurist API.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 *
 * The graph endpoint reports edges by numeric id only (`fieldId` = detail type
 * dty_ID, `relationshipId` = relation-type trm_ID). This provider turns those
 * ids into human labels for the graph and the legend:
 *
 *   - detail types: GET /fields?details=name&dty_ID=1,3,16
 *   - relation types: GET /termlinks?termId=<csv>&tree=1 for labeled ancestor trees
 *
 * Every lookup is cached by id (including misses) so repeated loads and node
 * expansions only fetch ids not seen before.
 */

/** Rows live under `items` in every current Heurist REST response. */
function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function uniqueIds(ids) {
  return [
    ...new Set(
      (Array.isArray(ids) ? ids : [])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

/** Non-null subset of `cache` for `ids`, preserving request order. */
function pick(cache, ids) {
  const out = new Map();
  for (const id of uniqueIds(ids)) {
    const value = cache.get(id);
    if (value != null) out.set(id, value);
  }
  return out;
}

export class VocabularyProvider {
  constructor({ apiClient } = {}) {
    this.apiClient = apiClient;
    this.recordTypeNames = new Map();
    this.fieldNames = new Map(); // dty_ID -> name (null = looked up, not found)
    this.termNames = new Map(); // trm_ID -> label (null = looked up, not found)
    this.termParents = new Map(); // trm_ID -> real parent in the returned ancestor path
    this.resolvedTerms = new Set(); // successful lookups, including missing IDs
  }

  /**
   * Resolve detail-type (field) names.
   * @param {number[]} ids dty_ID values.
   * @returns {Promise<Map<number,string>>} id -> name for the ids that resolved.
   */
  async getRecordTypeNames(ids, { signal } = {}) {
    const missing = uniqueIds(ids).filter(id => !this.recordTypeNames.has(id));
    if (missing.length) {
      let payload;
      try {
        payload = await this.apiClient.get('/rty', { query: { details: 'name', rty_ID: missing.join(',') }, signal });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        return pick(this.recordTypeNames, ids);
      }
      for (const row of rowsOf(payload)) {
        const id = Number(row.rty_ID ?? row.id);
        const name = row.rty_Plural || row.rty_Name || row.name;
        if (id > 0 && name) this.recordTypeNames.set(id, String(name));
      }
    }
    return pick(this.recordTypeNames, ids);
  }

  async getFieldNames(ids, { signal } = {}) {
    const missing = uniqueIds(ids).filter((id) => !this.fieldNames.has(id));
    if (missing.length) {
      let rows = [];
      try {
        const payload = await this.apiClient.get("/fields", {
          query: { details: "name", dty_ID: missing.join(",") },
          signal,
        });
        rows = rowsOf(payload);
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        // Leave the ids uncached so a later load can retry.
        return pick(this.fieldNames, ids);
      }
      for (const row of rows) {
        const id = Number(row?.dty_ID ?? row?.id);
        const name = row?.dty_Name ?? row?.dty_Label ?? row?.name;
        if (Number.isInteger(id) && id > 0 && name != null) {
          this.fieldNames.set(id, String(name));
        }
      }
      for (const id of missing) {
        if (!this.fieldNames.has(id)) this.fieldNames.set(id, null);
      }
    }
    return pick(this.fieldNames, ids);
  }

  /**
   * Resolve observed relation types and their ancestor paths in batches.
   * Trees are keyed by vocabulary (or the highest available ancestor).
   * Cached paths are combined for the current request, so loading a new branch
   * never replaces an earlier branch or leaks unrelated cached vocabularies.
   */
  async getRelationTypeTrees(ids, { signal } = {}) {
    const requested = uniqueIds(ids);
    const missing = requested.filter(id => !this.resolvedTerms.has(id) && !this.termParents.has(id));
    for (let offset = 0; offset < missing.length; offset += 1000) {
      const batch = missing.slice(offset, offset + 1000);
      try {
        const payload = await this.apiClient.get('/termlinks', {
          query: { termId: batch.join(','), tree: 1, limit: 1000 }, signal,
        });
        if (!Array.isArray(payload?.items) || payload.pagination?.next) {
          throw new TypeError('Incomplete term hierarchy response');
        }
        // Validate before caching; errors must remain retryable.
        const nodes = new Map();
        const visit = (node, parent = null, ancestors = new Set()) => {
          const id = Number(node?.id);
          if (!Number.isInteger(id) || id < 1 || typeof node.label !== 'string' ||
              !Array.isArray(node.children) || ancestors.has(id) || ancestors.size >= 128) {
            throw new TypeError('Invalid term hierarchy node');
          }
          if (nodes.has(id) && nodes.get(id).parent !== parent) {
            throw new TypeError('Conflicting term hierarchy parents');
          }
          nodes.set(id, { label: node.label, parent });
          const path = new Set([...ancestors, id]);
          node.children.forEach(child => visit(child, id, path));
        };
        payload.items.forEach(node => visit(node));
        for (const [id, node] of nodes) {
          this.termNames.set(id, node.label);
          this.termParents.set(id, node.parent);
        }
        batch.forEach(id => this.resolvedTerms.add(id));
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        // Use known labels and numeric fallbacks; retry failed lookups later.
      }
    }

    const included = new Set();
    for (const requestedId of requested) {
      let id = requestedId;
      const path = new Set();
      while (id != null && !path.has(id)) {
        included.add(id);
        path.add(id);
        id = this.termParents.get(id);
      }
    }
    const nodes = new Map([...included].map(id => [id, {
      id, label: this.termNames.get(id) ?? String(id), children: [],
    }]));
    const trees = {};
    for (const [id, node] of nodes) {
      const parent = nodes.get(this.termParents.get(id));
      if (parent) parent.children.push(node);
      else trees[id] = node;
    }
    for (const node of nodes.values()) {
      node.children.sort((a, b) => a.label.localeCompare(b.label) || a.id - b.id);
    }
    return { names: pick(this.termNames, [...included]), trees };
  }
}
