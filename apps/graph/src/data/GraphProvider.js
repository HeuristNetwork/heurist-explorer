/**
 * @file GraphProvider.js
 * @brief Loads graph documents from the dedicated Heurist graph endpoint.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { GraphDocument } from "../core/GraphDocument.js";

export class GraphProvider {
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  /**
   * Build a graph document for a top-level query.
   *
   * @param {object} options
   * @param {*} options.query Heurist query, `{ids:[...]}` group, or expression.
   * @param {"all"|string[]} [options.links] Internal-edge discovery selection.
   *   `"all"` discovers every internal edge; an array selects explicit compact
   *   link specs. Omitted means no edge discovery.
   * @param {{maxNodes?:number,maxEdges?:number,maxDepth?:number}} [options.limits]
   *   Client budget. The server caps every value at its own hard maximum.
   * @param {number} [options.limit] Seed-page size.
   * @param {number} [options.offset] Seed-page offset.
   * @param {AbortSignal} [options.signal]
   */
  async load({
    query,
    rule,
    links,
    limits,
    limit,
    offset = 0,
    signal,
  } = {}) {
    if (query == null || query === "")
      throw new TypeError("A graph query is required");
    limit = limit ?? normalizeLimits(limits)?.maxNodes ?? 1000;
    const body = { query, limit, offset };
    if (rule != null) body.rule = rule;
    const normalizedLinks = normalizeLinks(links);
    if (normalizedLinks !== undefined) body.links = normalizedLinks;
    const normalizedLimits = normalizeLimits(limits);
    if (normalizedLimits !== undefined) body.limits = normalizedLimits;

    const payload = await this.apiClient.post("/graph", { signal, body });
    const graph = payload && typeof payload === "object" ? payload.graph : null;
    if (
      !graph ||
      typeof graph !== "object" ||
      !Array.isArray(graph.records) ||
      !Array.isArray(graph.edges) ||
      !graph.limits ||
      typeof graph.limits !== "object"
    ) {
      throw new TypeError(
        "Graph API response is missing a valid graph document",
      );
    }
    return {
      query: payload.query ?? query,
      total: Number(payload.total) || 0,
      offset: Number(payload.offset) || offset,
      limit: Number(payload.limit) || limit,
      graph: new GraphDocument(payload),
      expansion: payload.expansion || null,
    };
  }
}

/** Accept `"all"`, a comma string, or an array of compact link specs. */
function normalizeLinks(links) {
  if (links == null || links === "") return undefined;
  const values = Array.isArray(links) ? links : String(links).split(",");
  const specs = [
    ...new Set(values.map((spec) => String(spec).trim()).filter(Boolean)),
  ];
  if (specs.some((spec) => spec.toLowerCase() === "all")) return "all";
  return specs.length ? specs : undefined;
}

/** Keep only positive integer budget values the graph endpoint understands. */
function normalizeLimits(limits) {
  if (!limits || typeof limits !== "object") return undefined;
  const out = {};
  for (const key of ["maxNodes", "maxEdges", "maxDepth"]) {
    const value = Number(limits[key]);
    if (Number.isInteger(value) && value > 0) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}
