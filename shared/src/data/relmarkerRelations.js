/**
 * @file relmarkerRelations.js
 * @brief Relationships of the relationship marker fields of a record (plan 22): load,
 *        give them to the fields, create one and load one again.
 *
 * A relmarker field shows the relationship records (RT 2-1) in which the record is the
 * source (2-7); a reverse field of the editor's group "Relationships from other records"
 * (recordEditStructure.js `reverseRelmarkerGroup`) those in which it is the target (2-5).
 * Two `/records` searches load all of them; each relationship goes to the first field
 * of the form that fits it (relation type in the field's vocabulary, the other record
 * of an allowed type).
 *
 *   relation: {relId, term, termLabel, reverse, other: {id, title, rty}}
 *
 * A reverse relation shows the inverse relation type (or the type when there is none).
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

import { relationshipIds } from '../recordview/RecordRelationsProvider.js';

const LIMIT = 500;

/**
 * States of the relmarker fields of a record, by field name.
 *
 * @param {object} options
 * @param {object} options.apiClient HeuristApiClient (needs `get`).
 * @param {object} options.dbdefs HDbDefs (relationship ids, vocabularies, inverse terms).
 * @param {number} options.recordId Record id.
 * @param {Array<object>} options.fields Relmarker fields of the form, in form order
 *        (`reverse: true` for the reverse fields).
 * @param {AbortSignal} [options.signal] Abort signal.
 * @returns {Promise<Map<string, {values: Array<object>, translations: Array}>>} Empty without relationship definitions.
 */
export async function loadRelmarkerStates({ apiClient, dbdefs, recordId, fields, signal } = {}) {
  const states = new Map();
  for (const field of fields || []) states.set(fieldName(field), { values: [], translations: [] });
  const rel = relationshipIds(dbdefs);
  const id = Number(recordId);
  if (!rel || !(id > 0) || !states.size) return states;
  const [outgoing, incoming] = await Promise.all([
    searchRelationships(apiClient, rel, [{ [`f:${rel.source}`]: String(id) }], signal),
    searchRelationships(apiClient, rel, [{ [`f:${rel.target}`]: String(id) }], signal)
  ]);
  const seen = new Set();
  for (const row of [...outgoing, ...incoming]) {
    const relation = relationOf(row, rel, dbdefs, id);
    if (!relation || seen.has(relation.relId)) continue;
    seen.add(relation.relId);
    const field = (fields || []).find((candidate) => relationFits(candidate, relation, dbdefs));
    if (field) states.get(fieldName(field)).values.push(relationEntry(relation));
  }
  return states;
}

/**
 * One relationship record as a relation of a record.
 *
 * @param {object} apiClient HeuristApiClient.
 * @param {object} dbdefs HDbDefs.
 * @param {number} relId Relationship record id.
 * @param {number} recordId The record whose relation it is.
 * @returns {Promise<object|null>} The relation, or null when it does not exist (any more).
 */
export async function loadRelationship(apiClient, dbdefs, relId, recordId) {
  const rel = relationshipIds(dbdefs);
  if (!rel || !(Number(relId) > 0)) return null;
  const rows = await searchRelationships(apiClient, rel, [{ ids: String(Number(relId)) }]);
  return rows.length ? relationOf(rows[0], rel, dbdefs, Number(recordId)) : null;
}

/**
 * Whether a relation belongs to a relmarker field: the direction, the relation type in
 * the field's vocabulary and the other record of an allowed type (no constraint: any).
 *
 * @param {object} field Relmarker field (`vocabulary`, `targetTypes`; reverse: `sourceTypes`).
 * @param {object} relation Relation.
 * @param {object} dbdefs HDbDefs (vocabulary terms).
 * @returns {boolean}
 */
export function relationFits(field, relation, dbdefs) {
  if (!field || !relation || Boolean(field.reverse) !== Boolean(relation.reverse)) return false;
  const vocabulary = Number(field.vocabulary) || 0;
  if (vocabulary && typeof dbdefs?.termDescendants === 'function'
    && !dbdefs.termDescendants([vocabulary]).includes(Number(relation.term))) {
    return false;
  }
  const types = ((field.reverse ? field.sourceTypes : field.targetTypes) || []).map(Number).filter((type) => type > 0);
  return !types.length || types.includes(Number(relation.other?.rty));
}

/**
 * Body of a new relationship record: owner, visibility and view groups of the edited
 * record (plan 22, Artem 2026-10-21).
 *
 * @param {object} dbdefs HDbDefs.
 * @param {{source: number, target: number, term: number, header?: object}} relationship
 *        Source and target record, relation type, ownership `{owner, visibility, viewGroups}`.
 * @returns {object} Record body for RecordEditClient.insert.
 * @throws {Error} Without the relationship record type in the database.
 */
export function relationshipBody(dbdefs, { source, target, term, header = {} }) {
  const rel = relationshipIds(dbdefs);
  if (!rel) throw new Error('The database has no relationship record type');
  const visibility = header.visibility || 'viewable';
  const body = {
    rec_ID: '0',
    rec_RecTypeID: String(rel.rty),
    rec_NonOwnerVisibility: visibility,
    rec_NonOwnerVisibilityGroups: (visibility === 'viewable' ? header.viewGroups || [] : []).map(String),
    details: {
      [String(rel.source)]: [String(Number(source))],
      [String(rel.type)]: [String(Number(term))],
      [String(rel.target)]: [String(Number(target))]
    }
  };
  // without an owner the server takes the current user
  if (header.owner != null && Number.isFinite(Number(header.owner))) body.rec_OwnerUGrpID = String(Number(header.owner));
  return body;
}

/** @returns {{value: number, hidden: boolean, relation: object}} The field state entry of a relation. */
export function relationEntry(relation) {
  return { value: relation.relId, hidden: false, relation };
}

/** @returns {string} Name of a field in the form (structure fields: the dty). */
function fieldName(field) {
  return String(field.name ?? field.dty);
}

/** Relationship records by the given predicates, with their three fields resolved. */
async function searchRelationships(apiClient, rel, predicates, signal) {
  const response = await apiClient.get('/records', {
    signal,
    query: {
      q: [{ t: String(rel.rty) }, ...predicates],
      fields: `rec_RecTypeID,${rel.source},${rel.target},${rel.type}`,
      resolveDetails: 1,
      limit: LIMIT
    }
  });
  return Array.isArray(response?.records) ? response.records : [];
}

/** The relation of a relationship row for one record (null when the row has no other record). */
function relationOf(row, rel, dbdefs, recordId) {
  const relId = Number(row?.rec_ID);
  const source = firstValue(row, rel.source);
  const target = firstValue(row, rel.target);
  const type = firstValue(row, rel.type);
  const sourceId = Number(source?.rec_ID ?? source?.value) || 0;
  const targetId = Number(target?.rec_ID ?? target?.value) || 0;
  if (!(relId > 0)) return null;
  // the record is the target only (a record related to itself is a source)
  const reverse = targetId === recordId && sourceId !== recordId;
  const other = reverse ? source : target;
  const otherId = reverse ? sourceId : targetId;
  if (!(otherId > 0)) return null;
  const term = Number(type?.trm_ID ?? type?.value) || 0;
  const label = String(type?.trm_Label ?? '') || dbdefs?.termLabel?.(term) || '';
  const inverse = reverse ? dbdefs?.termInverse?.(term) : 0;
  return {
    relId,
    term,
    termLabel: (inverse && dbdefs?.termLabel?.(inverse)) || label,
    reverse,
    other: {
      id: otherId,
      title: String(other?.rec_Title ?? '').replace(/<[^>]*>/g, ''),
      rty: Number(other?.rec_RecTypeID) || 0
    }
  };
}

/** First resolved value of a field in a record row. */
function firstValue(row, fieldId) {
  const values = row?.details?.[String(fieldId)];
  return Array.isArray(values) ? values[0] || null : null;
}
