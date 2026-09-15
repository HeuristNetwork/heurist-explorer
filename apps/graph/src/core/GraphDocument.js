/**
 * @file GraphDocument.js
 * @brief Renderer-neutral normalized graph document.
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

/** Renderer-neutral normalized graph document: records, edges, links, and paths. */
export class GraphDocument {
  /** @param {{graph?: object, records?: Array, nodes?: Array, edges?: Array, links?: object, paths?: object, limits?: object}} [value] Raw graph payload, or an object wrapping it in a `graph` property. */
  constructor(value = {}) {
    const graph = value.graph || value;
    this.records = normalizeRecords(graph.records || graph.nodes);
    this.edges = normalizeEdges(graph.edges);
    this.links = normalizeMap(graph.links);
    this.paths = normalizeMap(graph.paths);
    this.limits =
      graph.limits && typeof graph.limits === "object"
        ? { ...graph.limits }
        : null;
  }

  /**
   * Merge another graph payload into this document, records/edges taking precedence by ID.
   *
   * @param {object} value Graph payload to merge in; normalized the same way as the constructor.
   * @returns {GraphDocument} A new, merged document.
   */
  merge(value) {
    const next = new GraphDocument(value);
    const records = new Map(this.records.map((record) => [record.id, record]));
    next.records.forEach((record) =>
      records.set(record.id, { ...records.get(record.id), ...record }),
    );
    const edges = new Map(this.edges.map((edge) => [edge.id, edge]));
    next.edges.forEach((edge) => edges.set(edge.id, edge));
    return new GraphDocument({
      records: [...records.values()],
      edges: [...edges.values()],
      links: { ...this.links, ...next.links },
      paths: { ...this.paths, ...next.paths },
      limits: next.limits || this.limits,
    });
  }

  /** Record IDs in this document, in their configured order. */
  get recordIds() {
    return this.records.map((record) => record.id);
  }
}

/** Return a shallow copy of a plain object value, or `{}` when it isn't one. */
function normalizeMap(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : {};
}

/** Normalize raw record entries into `{id, recordTypeId, title, isTop, raw}`, dropping invalid IDs. */
function normalizeRecords(records) {
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => ({
      id: Number(record?.id ?? record?.rec_ID),
      recordTypeId:
        Number(record?.recordTypeId ?? record?.rec_RecTypeID) || null,
      title: String(record?.title ?? record?.rec_Title ?? ""),
      isTop: record?.isTop === true,
      raw: record,
    }))
    .filter((record) => Number.isInteger(record.id) && record.id > 0);
}

/** Normalize raw edge entries into `{id, from, to, fieldId, relationshipId, link, path, raw}`, dropping invalid endpoints. */
function normalizeEdges(edges) {
  if (!Array.isArray(edges)) return [];
  return edges
    .map((edge) => {
      const source = Number(edge?.from ?? edge?.source);
      const target = Number(edge?.to ?? edge?.target);
      const fieldId = Number(edge?.fieldId ?? edge?.field) || null;
      const relationshipId =
        Number(edge?.relationshipId ?? edge?.relationship) || null;
      const link = textOrNull(edge?.link);
      const path = textOrNull(edge?.path ?? edge?.pathId);
      return {
        id: String(
          edge?.id ??
            `${source}:${target}:${fieldId || 0}:${relationshipId || 0}${
              link ? `:${link}` : ""
            }`,
        ),
        from: source,
        to: target,
        fieldId,
        relationshipId,
        link,
        path,
        raw: edge,
      };
    })
    .filter((edge) => edge.from > 0 && edge.to > 0);
}

/** Normalize an empty or nullish value to `null`, otherwise stringify it. */
function textOrNull(value) {
  return value == null || value === "" ? null : String(value);
}
