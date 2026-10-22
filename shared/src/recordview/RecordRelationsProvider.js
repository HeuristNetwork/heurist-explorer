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
 * Very large records (plan 23 §3.3): each kind is one search of the first `FIRST_PAGE`
 * rows, enough for a normal record. When there are more, the groups (record types of
 * the linking records, relation types of the relationships) are counted by
 * `/records/aggregate` and only the first `limit` rows of each group are loaded. Every
 * group carries its total, a search query of its records ("Show all in search") and
 * `more()` for the next rows. All searches use the default order (record ID), so the
 * rows of a group in the first page are the start of the group's own search.
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

import { aggregate } from "../data/aggregate.js";
import { DEFAULT_RECORD_LIMITS } from "./recordLimits.js";

/** Rows of the first search of each kind: all the links of a normal record. */
const FIRST_PAGE = 500;

/**
 * @typedef {object} RelatedItem
 * @property {number} id Related record ID.
 * @property {string} title Related record title.
 * @property {number} rty Related record type ID.
 * @property {string} relation Relation type label ('' for a plain link).
 */

/**
 * @typedef {object} LinkGroup
 * @property {string} label Row label: relation type, record type name ('' when unknown) or field name.
 * @property {number} rty Record type of the linking records (linked from records; 0 otherwise).
 * @property {number} total Number of records in the group.
 * @property {RelatedItem[]} items The loaded records (the first ones; all when `items.length >= total`).
 * @property {Array<object>|null} query Search of the group's records (`[{"t":…},{"lt":…}]`, `rt` / `rf:<field>`).
 * @property {(() => Promise<RelatedItem[]>)|null} more Loads the next `limit` records (also adds them to `items`).
 */

/** Loads the relationships and incoming links of one record. */
export class RecordRelationsProvider {
  /**
   * @param {object} options Provider dependencies.
   * @param {object} options.apiClient Heurist API client (needs `get`).
   * @param {() => Promise<object>} [options.dbDefsProvider] Resolves the database definitions (`HDbDefs`).
   * @param {number} [options.limit] Records loaded per group of a very large record (and per `more()`).
   */
  constructor({ apiClient, dbDefsProvider = null, limit = DEFAULT_RECORD_LIMITS.links }) {
    this.apiClient = apiClient;
    this.dbDefsProvider = dbDefsProvider;
    this.limit = positive(limit, DEFAULT_RECORD_LIMITS.links);
  }

  /**
   * @param {object} options Load options.
   * @param {number} options.id Record ID.
   * @param {number} options.rty Record type ID (for the relmarker fields' constraints).
   * @param {Array<object>} [options.sections] Field sections; their `relmarker` fields are loaded.
   * @param {number} [options.limit] Records per group (default: the provider's).
   * @param {AbortSignal} [options.signal] Abort signal.
   * @returns {Promise<{related: Object<string, LinkGroup>, relationsFrom: LinkGroup[], linkedFrom: LinkGroup[], dbdefs: object|null}>}
   *   `related` by relmarker field ID; `relationsFrom` one group per relation type; `linkedFrom` one per record type.
   */
  async load({ id, rty, sections = [], limit = this.limit, signal } = {}) {
    const recordId = Number(id);
    const empty = { related: {}, relationsFrom: [], linkedFrom: [], dbdefs: null };
    if (!Number.isInteger(recordId) || recordId < 1 || typeof this.apiClient?.get !== "function") return empty;

    const dbdefs = await this.#dbdefs();
    const rel = relationshipIds(dbdefs);
    const relmarkers = sections.flatMap((section) => section.fields || []).filter((field) => field.type === "relmarker");
    const context = { recordId, rty, rel, dbdefs, signal, limit: positive(limit, this.limit) };

    const [related, relationsFrom, linkedFrom] = await Promise.all([
      rel ? Promise.all(relmarkers.map((field) => this.#related(field, context)))
        .then((groups) => Object.fromEntries(relmarkers.map((field, index) => [String(field.id), groups[index]])))
        : {},
      rel ? this.#relationsFrom(context) : [],
      this.#linkedFrom(context),
    ]);
    return { related, relationsFrom, linkedFrom, dbdefs };
  }

  /** Relationships of one relmarker field: this record is the source. */
  async #related(field, { recordId, rty, rel, dbdefs, signal, limit }) {
    const q = [{ t: String(rel.rty) }, { [`f:${rel.source}`]: String(recordId) }];
    const vocabulary = dbdefs.vocabRoot(field.id);
    if (vocabulary) q.push({ [`f:${rel.type}`]: String(vocabulary) });
    const fields = `${rel.target},${rel.type}`;
    // only targets the field allows (no constraint: any record type)
    const allowed = new Set((dbdefs.field(rty, field.id)?.targetTypes || dbdefs.fieldGlobal(field.id)?.targetTypes || []).map(Number));
    const toItems = (rows) => rows
      .map((row) => item(row, rel.target, relationLabel(row, rel.type)))
      .filter((entry) => entry && (!allowed.size || allowed.has(entry.rty)));
    const { rows, total } = await this.#search(q, fields, { limit: FIRST_PAGE, signal });
    const group = {
      label: field.name || "",
      rty: 0,
      items: toItems(rows),
      // the field's own relationships seen from the target: rf:<field> (plan 09 §11)
      query: [{ [`rf:${field.id}`]: [{ ids: String(recordId) }] }],
    };
    // a cut list counts the relationship rows (some may have a target the field does not allow)
    group.total = rows.length < total ? total : group.items.length;
    group.more = this.#pager(group, q, fields, rows.length, toItems, limit);
    return group;
  }

  /**
   * Relationships in which this record is the target, one group per relation type, with
   * the inverse relation type.
   */
  async #relationsFrom({ recordId, rel, dbdefs, signal, limit }) {
    const q = [{ t: String(rel.rty) }, { [`f:${rel.target}`]: String(recordId) }];
    const fields = `${rel.type},${rel.source}`;
    const termOf = (row) => {
      const type = firstValue(row, rel.type);
      return Number(type?.trm_ID ?? type?.value) || 0;
    };
    const labelOf = (term, row = null) => {
      const inverse = dbdefs.termInverse?.(term);
      return (inverse && dbdefs.termLabel(inverse)) || (row ? relationLabel(row, rel.type) : dbdefs.termLabel(term)) || "";
    };
    const toItems = (rows) => rows.map((row) => item(row, rel.source, labelOf(termOf(row), row))).filter(Boolean);
    const { rows, total } = await this.#search(q, fields, { limit: FIRST_PAGE, signal });

    // groups of the first page, by relation type
    const groups = new Map();
    for (const row of rows) {
      const term = termOf(row);
      if (!groups.has(term)) groups.set(term, { term, label: labelOf(term, row), rows: [] });
      groups.get(term).rows.push(row);
    }
    if (rows.length < total) {
      // more than the first page: the count of every relation type
      const counts = await this.#aggregate("values", { q, field: String(rel.type), limit: 1000 }, signal);
      for (const entry of counts?.values || []) {
        const term = Number(entry.value) || 0;
        if (!groups.has(term)) groups.set(term, { term, label: labelOf(term), rows: [] });
        groups.get(term).total = Number(entry.count) || 0;
      }
    }

    return Promise.all([...groups.values()].map(async ({ term, label, rows: first, total: count }) => {
      const group = { label, rty: 0, items: toItems(first), total: count ?? first.length, query: null, more: null };
      if (!term) return group;
      // exactly this relation type (`=`: without its child terms, as counted by op=values)
      const groupQuery = [...q, { [`f:${rel.type}`]: `=${term}` }];
      // the records of this relation type, seen from the source: rt with this record and the type (plan 09 §11)
      group.query = [{ rt: [{ ids: String(recordId) }, { r: String(term) }] }];
      const loaded = await this.#complete(group, groupQuery, fields, first.length, toItems, limit, signal);
      group.more = this.#pager(group, groupQuery, fields, loaded, toItems, limit);
      return group;
    }));
  }

  /**
   * Records pointing at this record (never relationship records), leaving out links
   * through the automatic "Parent entity" field (child to parent); one group per record type.
   */
  async #linkedFrom({ recordId, rel, dbdefs, signal, limit }) {
    const q = [{ lt: String(recordId) }];
    const parentField = dbdefs?.localId?.("dty", "2-247") || 0;
    if (parentField) q.push({ not: [{ [`lt:${parentField}`]: String(recordId) }] });
    const fields = "rec_Title,rec_RecTypeID";
    const toItems = (rows) => rows
      .map((row) => ({ id: Number(row.rec_ID), title: String(row.rec_Title ?? ""), rty: Number(row.rec_RecTypeID) || 0, relation: "" }))
      .filter((entry) => entry.id > 0);
    const { rows, total } = await this.#search(q, fields, { limit: FIRST_PAGE, signal });

    const groups = new Map();
    for (const row of rows) {
      const rty = Number(row.rec_RecTypeID) || 0;
      if (!groups.has(rty)) groups.set(rty, { rty, rows: [] });
      groups.get(rty).rows.push(row);
    }
    if (rows.length < total) {
      // more than the first page: the count of every record type
      const counts = await this.#aggregate("rectypes", { q }, signal);
      for (const entry of counts?.rectypes || []) {
        const rty = Number(entry.rec_RecTypeID) || 0;
        if (!groups.has(rty)) groups.set(rty, { rty, rows: [] });
        groups.get(rty).total = Number(entry.count) || 0;
      }
    }
    if (rel) groups.delete(rel.rty);

    return Promise.all([...groups.values()].map(async ({ rty, rows: first, total: count }) => {
      const groupQuery = [{ t: String(rty) }, ...q];
      const group = {
        label: dbdefs?.rectypeName?.(rty) || "", rty, items: toItems(first), total: count ?? first.length, query: groupQuery,
      };
      const loaded = await this.#complete(group, groupQuery, fields, first.length, toItems, limit, signal);
      group.more = this.#pager(group, groupQuery, fields, loaded, toItems, limit);
      return group;
    }));
  }

  /**
   * A group cut by the first page with fewer than `limit` records loaded gets the
   * rest of its first `limit` from its own search.
   *
   * @returns {Promise<number>} Rows of the group loaded so far (the offset of `more()`).
   */
  async #complete(group, q, fields, loaded, toItems, limit, signal) {
    const wanted = Math.min(limit, group.total);
    if (loaded >= wanted) return loaded;
    const { rows } = await this.#search(q, fields, { offset: loaded, limit: wanted - loaded, signal });
    group.items.push(...toItems(rows));
    return loaded + rows.length;
  }

  /**
   * `more()` of a group: the next `limit` rows of its search, from `offset`; `null` when
   * every record is loaded.
   */
  #pager(group, q, fields, offset, toItems, limit) {
    if (offset >= group.total) return null;
    let next = offset;
    return async () => {
      if (next >= group.total) return [];
      const { rows } = await this.#search(q, fields, { offset: next, limit });
      next += rows.length;
      if (!rows.length) next = group.total; // nothing more (records removed meanwhile)
      const items = toItems(rows);
      group.items.push(...items);
      return items;
    };
  }

  /** One `/records` search; a failure (other than an abort) gives no rows. */
  async #search(q, fields, { offset = 0, limit, signal } = {}) {
    try {
      const query = { q, fields, resolveDetails: 1, limit };
      if (offset) query.offset = offset;
      const response = await this.apiClient.get("/records", { signal, query });
      const rows = Array.isArray(response?.records) ? response.records : [];
      const total = Number(response?.pagination?.total);
      return { rows, total: Number.isFinite(total) ? total : rows.length };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return { rows: [], total: 0 };
    }
  }

  /** One `/records/aggregate` operation; a failure (other than an abort) gives `null`. */
  async #aggregate(op, params, signal) {
    try {
      return await aggregate(this.apiClient, op, params, { signal });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return null;
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

/** A positive integer, or the fallback. */
function positive(value, fallback) {
  const number = Math.floor(Number(value));
  return number > 0 ? number : fallback;
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
