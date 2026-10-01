/**
 * @file RecordRelationsProvider.js
 * @brief Relationships and incoming links of one record, for the `builtin` engine.
 *
 * Three kinds of connection, each one `/records` search:
 *
 * - **Related** (per relmarker field): relationship records whose source is this
 *   record, restricted to the field's vocabulary -
 *   `[{"t":<rel>},{"f:<source>":<id>},{"f:<type>":<vocabulary>}]`, fields
 *   `<target>,<type>` - keeping only targets allowed by the field's constraints.
 * - **Linked from, relationships**: relationship records whose target is this
 *   record - `[{"t":<rel>},{"f:<target>":<id>}]`, fields `<type>,<source>`; shown with
 *   the inverse relation type when there is one.
 * - **Linked from, records**: records pointing at this one - `[{"lt":<id>}]` (`lt`: records
 *   linked *to* the given one; `lf` would be the records it points to) - except child
 *   records pointing back through the automatic "Parent entity" field (2-247):
 *   `{"not":[{"lt:<247>":<id>}]}`. The parent's own child field already lists them.
 *
 * The relationship record type and its target/type/source fields are found by
 * concept code (2-1, 2-5, 2-6, 2-7) in the database definitions (`HDbDefs`); without
 * definitions only the "linked from" records are loaded.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

const LIMIT = 500;

/**
 * @typedef {object} RelatedItem
 * @property {number} id Related record ID.
 * @property {string} title Related record title.
 * @property {number} rty Related record type ID.
 * @property {string} relation Relation type label ('' for a plain link).
 */

/** Loads the relationships and incoming links of one record. */
export class RecordRelationsProvider {
  /**
   * @param {object} options Provider dependencies.
   * @param {object} options.apiClient Heurist API client (needs `get`).
   * @param {() => Promise<object>} [options.dbDefsProvider] Resolves the database definitions (`HDbDefs`).
   */
  constructor({ apiClient, dbDefsProvider = null }) {
    this.apiClient = apiClient;
    this.dbDefsProvider = dbDefsProvider;
  }

  /**
   * @param {object} options Load options.
   * @param {number} options.id Record ID.
   * @param {number} options.rty Record type ID (for the relmarker fields' constraints).
   * @param {Array<object>} [options.sections] Field sections; their `relmarker` fields are loaded.
   * @param {AbortSignal} [options.signal] Abort signal.
   * @returns {Promise<{related: Object<string, RelatedItem[]>, relationsFrom: RelatedItem[], linkedFrom: RelatedItem[], dbdefs: object|null}>}
   */
  async load({ id, rty, sections = [], signal } = {}) {
    const recordId = Number(id);
    const empty = { related: {}, relationsFrom: [], linkedFrom: [], dbdefs: null };
    if (!Number.isInteger(recordId) || recordId < 1 || typeof this.apiClient?.get !== "function") return empty;

    const dbdefs = await this.#dbdefs();
    const rel = relationshipIds(dbdefs);
    const relmarkers = sections.flatMap((section) => section.fields || []).filter((field) => field.type === "relmarker");

    const [related, relationsFrom, linkedFrom] = await Promise.all([
      rel ? Promise.all(relmarkers.map((field) => this.#related(recordId, rty, field, rel, dbdefs, signal)))
        .then((lists) => Object.fromEntries(relmarkers.map((field, index) => [String(field.id), lists[index]])))
        : {},
      rel ? this.#relationsFrom(recordId, rel, dbdefs, signal) : [],
      this.#linkedFrom(recordId, rel, dbdefs, signal),
    ]);
    return { related, relationsFrom, linkedFrom, dbdefs };
  }

  /** Relationships of one relmarker field: this record is the source. */
  async #related(recordId, rty, field, rel, dbdefs, signal) {
    const q = [{ t: String(rel.rty) }, { [`f:${rel.source}`]: String(recordId) }];
    const vocabulary = dbdefs.vocabRoot(field.id);
    if (vocabulary) q.push({ [`f:${rel.type}`]: String(vocabulary) });
    const rows = await this.#search(q, `${rel.target},${rel.type}`, signal);
    // only targets the field allows (no constraint: any record type)
    const allowed = new Set((dbdefs.field(rty, field.id)?.targetTypes || dbdefs.fieldGlobal(field.id)?.targetTypes || []).map(Number));
    return rows
      .map((row) => item(row, rel.target, relationLabel(row, rel.type)))
      .filter((entry) => entry && (!allowed.size || allowed.has(entry.rty)));
  }

  /** Relationships in which this record is the target, with the inverse relation type. */
  async #relationsFrom(recordId, rel, dbdefs, signal) {
    const q = [{ t: String(rel.rty) }, { [`f:${rel.target}`]: String(recordId) }];
    const rows = await this.#search(q, `${rel.type},${rel.source}`, signal);
    return rows.map((row) => {
      const type = firstValue(row, rel.type);
      const inverse = dbdefs.termInverse?.(type?.trm_ID ?? type?.value);
      return item(row, rel.source, (inverse && dbdefs.termLabel(inverse)) || relationLabel(row, rel.type));
    }).filter(Boolean);
  }

  /**
   * Records pointing at this record (never relationship records), leaving out links
   * through the automatic "Parent entity" field (child to parent).
   */
  async #linkedFrom(recordId, rel, dbdefs, signal) {
    const q = [{ lt: String(recordId) }];
    const parentField = dbdefs?.localId?.("dty", "2-247") || 0;
    if (parentField) q.push({ not: [{ [`lt:${parentField}`]: String(recordId) }] });
    const rows = await this.#search(q, "rec_Title,rec_RecTypeID", signal);
    return rows
      .map((row) => ({ id: Number(row.rec_ID), title: String(row.rec_Title ?? ""), rty: Number(row.rec_RecTypeID) || 0, relation: "" }))
      .filter((entry) => entry.id > 0 && (!rel || entry.rty !== rel.rty));
  }

  /** One `/records` search; a failure (other than an abort) gives no rows. */
  async #search(q, fields, signal) {
    try {
      const response = await this.apiClient.get("/records", {
        signal,
        query: { q, fields, resolveDetails: 1, limit: LIMIT },
      });
      return Array.isArray(response?.records) ? response.records : [];
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return [];
    }
  }

  /** Database definitions, or `null` when unavailable. */
  async #dbdefs() {
    if (typeof this.dbDefsProvider !== "function") return null;
    try { return (await this.dbDefsProvider()) || null; } catch { return null; }
  }
}

/**
 * Local IDs of the relationship record type and its fields, by concept code.
 *
 * @param {object|null} dbdefs HDbDefs.
 * @returns {{rty:number, target:number, type:number, source:number}|null} `null` when not all resolve.
 */
export function relationshipIds(dbdefs) {
  if (typeof dbdefs?.localId !== "function") return null;
  const ids = {
    rty: dbdefs.localId("rty", "2-1"),
    target: dbdefs.localId("dty", "2-5"),
    type: dbdefs.localId("dty", "2-6"),
    source: dbdefs.localId("dty", "2-7"),
  };
  return Object.values(ids).every((value) => value > 0) ? ids : null;
}

/** First resolved value of a field in a record row. */
function firstValue(row, fieldId) {
  const values = row?.details?.[String(fieldId)];
  return Array.isArray(values) ? values[0] || null : null;
}

/** Relation type label of a relationship row (the resolved term). */
function relationLabel(row, typeField) {
  return String(firstValue(row, typeField)?.trm_Label ?? "");
}

/** The record at the other end of a relationship row, as a list item. */
function item(row, pointerField, relation) {
  const other = firstValue(row, pointerField);
  const id = Number(other?.rec_ID ?? other?.value);
  if (!(id > 0)) return null;
  return { id, title: String(other?.rec_Title ?? ""), rty: Number(other?.rec_RecTypeID) || 0, relation };
}
