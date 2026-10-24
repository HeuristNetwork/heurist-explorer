/**
 * @file relationStores.js
 * @brief The relations of one relmarker field of one record, for the relations mode of
 *        HRecordManager (plan 24): the records related through the field, and writes
 *        that are sent at once (add targets, change the relation type, remove).
 *
 * Two stores with one interface:
 * - RecordRelationStore: relationship records (RT_RELATION, plan 22);
 * - MembershipRelationStore: the members of a group (sysUsrGrpLinks) as the relmarker
 *   DT_GROUP_MEMBERSHIP, the role (term code admin / member) as the relation type; from
 *   a group (its users) or from a user (reverse: their groups).
 *
 *   relation: {relId, term, termLabel, reverse, other: {id, title, rty}}
 *   const store = new RecordRelationStore({ apiClient, dbdefs, client, field, record, header });
 *   const relations = await store.list();
 *   await store.add([12, 14], term);
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

import { loadRelmarkerStates, relationshipBody } from './relmarkerRelations.js';
import { relationshipIds } from '../recordview/RecordRelationsProvider.js';
import { TermSource } from './valueSources/localSources.js';

/** Base of the stores: the field, the record and the relation types. */
class RelationStore {
  /**
   * @param {object} options
   * @param {object} options.apiClient HeuristApiClient.
   * @param {object} options.dbdefs HDbDefs.
   * @param {object} options.field Relmarker field (`dty`, `vocabulary`, `targetTypes`; reverse: `sourceTypes`).
   * @param {{id: number, rty?: number, title?: string}} options.record The record whose relations they are.
   */
  constructor({ apiClient, dbdefs, field, record }) {
    this.apiClient = apiClient;
    this.dbdefs = dbdefs;
    this.field = field || {};
    this.record = { ...record, id: Number(record?.id) || 0 };
  }

  /** @returns {boolean} Whether the record is the target of the relations (a reverse field). */
  get reverse() {
    return this.field.reverse === true;
  }

  /** @returns {number[]} Record types of the other end. */
  get otherTypes() {
    return ((this.reverse ? this.field.sourceTypes : this.field.targetTypes) || []).map(Number).filter((id) => id > 0);
  }

  /**
   * Relation types of the field (a reverse field: the inverse labels, the stored terms).
   *
   * @returns {Array<{id: number, label: string, depth: number}>}
   */
  terms() {
    const items = new TermSource(this.dbdefs, this.field.vocabulary).items();
    return items.map((item) => {
      const inverse = this.reverse ? this.dbdefs?.termInverse?.(item.value) : 0;
      return { id: Number(item.value), label: (inverse && this.dbdefs?.termLabel?.(inverse)) || item.label, depth: item.depth };
    });
  }

  /** @returns {string} Label of a relation type (as `terms()`). */
  termLabel(term) {
    return this.terms().find((item) => item.id === Number(term))?.label || this.dbdefs?.termLabel?.(term) || '';
  }
}

/** Relationship records of a relmarker field (plan 22 records). */
export class RecordRelationStore extends RelationStore {
  /**
   * @param {object} options RelationStore options plus
   * @param {object} options.client RecordEditClient of /records (`insert`, `patch`, `remove`).
   * @param {() => object} [options.header] Owner / visibility of new relationships (`{owner, visibility, viewGroups}`).
   */
  constructor(options) {
    super(options);
    this.client = options.client;
    this.header = options.header || (() => ({}));
    this.kind = 'records';
    this.canEditRelationship = true;
  }

  /** @returns {Promise<Array<object>>} The relations of the field (at most RELMARKER_LOAD_LIMIT per direction). */
  async list({ signal } = {}) {
    const name = String(this.field.name ?? this.field.dty);
    const states = await loadRelmarkerStates({
      apiClient: this.apiClient, dbdefs: this.dbdefs, recordId: this.record.id, fields: [{ ...this.field, name }], signal
    });
    return (states.get(name)?.values || []).map((entry) => entry.relation).filter(Boolean);
  }

  /**
   * Conditions of the manager's list: the records related through the field (`rf:<field>`
   * the stored targets, `rt:<field>` the stored sources for a reverse field).
   *
   * @returns {Array<object>}
   */
  targetQuery() {
    const key = `${this.reverse ? 'rt' : 'rf'}:${Number(this.field.dty)}`;
    return [{ [key]: [{ ids: String(this.record.id) }] }];
  }

  /**
   * New relationships to the given records (one that already has this type is skipped).
   *
   * @param {number[]} otherIds Records of the other end.
   * @param {number} term Relation type (stored term).
   * @param {Array<object>} [current] The relations now.
   * @param {{signal?: AbortSignal, onProgress?: (done: number, total: number) => void}} [options]
   *        `signal`: stop after the current one (Cancel of the progress dialog).
   * @returns {Promise<number>} Number of relationships made.
   */
  async add(otherIds, term, current = [], { signal = null, onProgress = null } = {}) {
    const made = new Set(current.filter((relation) => relation.term === Number(term)).map((relation) => relation.other.id));
    const ids = (otherIds || []).map(Number).filter((value) => value > 0 && !made.has(value));
    let count = 0;
    for (const id of ids) {
      if (signal?.aborted) break;
      if (made.has(id)) continue;
      const [source, target] = this.reverse ? [id, this.record.id] : [this.record.id, id];
      await this.client.insert(relationshipBody(this.dbdefs, { source, target, term: Number(term), header: this.header() || {} }));
      made.add(id);
      count += 1;
      onProgress?.(count, ids.length);
    }
    return count;
  }

  /** Change the relation type of a relationship record. */
  async setType(relation, term) {
    const rel = relationshipIds(this.dbdefs);
    if (!rel) throw new Error('The database has no relationship record type');
    await this.client.patch(relation.relId, { details: { [String(rel.type)]: [String(Number(term))] } });
  }

  /** Delete a relationship record. */
  async remove(relation) {
    await this.client.remove(relation.relId);
  }
}

/**
 * The members of a group as relations (sysUsrGrpLinks): from a group its users, from a user
 * (a reverse field) their groups. Written by `POST /sys/group/{id}/members`.
 */
export class MembershipRelationStore extends RelationStore {
  /**
   * @param {object} options RelationStore options (`record.id`: the group, or the user of a reverse field).
   */
  constructor(options) {
    super(options);
    this.kind = 'members';
    this.canEditRelationship = false;
  }

  /** @returns {number} Local id of a system record type (RT_SYS_USER / RT_SYS_GROUP). */
  _rty(name) {
    return Number(this.dbdefs?.dbconst?.(name)) || 0;
  }

  /** @returns {string} The role of a relation type (its term code: admin / member). */
  roleOf(term) {
    const code = String(this.dbdefs?.term?.(term)?.code || '').toLowerCase();
    return code === 'admin' ? 'admin' : 'member';
  }

  /** @returns {number} The relation type of a role (0: the vocabulary lacks it). */
  termOf(role) {
    return this.terms().find((item) => String(this.dbdefs?.term?.(item.id)?.code || '').toLowerCase() === role)?.id || 0;
  }

  /** A relation of a group and a user (`groupId`, `userId` for the writes). */
  _relation(groupId, userId, role, other) {
    const term = this.termOf(role);
    return {
      // the other end is unique in the field: its id (inputs need a positive number)
      relId: Number(other.id),
      term,
      termLabel: this.termLabel(term) || role,
      reverse: this.reverse,
      other,
      groupId,
      userId
    };
  }

  /** @returns {Promise<Array<object>>} The members of the group, or the groups of the user. */
  async list({ signal } = {}) {
    const id = this.record.id;
    if (!(id > 0)) return [];
    if (!this.reverse) {
      const response = await this.apiClient.get(`/sys/group/${id}`, { signal, query: { fields: 'members' } });
      const members = response?.records?.[0]?.details?.members || [];
      const rty = this._rty('RT_SYS_USER');
      return members.map((member) => {
        const userId = Number(member.id);
        const title = this.dbdefs?.userGroupName?.(userId) || `#${userId}`;
        return this._relation(id, userId, member.role === 'admin' ? 'admin' : 'member', { id: userId, title, rty });
      });
    }
    const response = await this.apiClient.get('/sys/group', { signal, query: { q: [{ user: String(id) }], fields: 'rec_Title,members', limit: 1000 } });
    const rty = this._rty('RT_SYS_GROUP');
    return (response?.records || []).map((group) => {
      const groupId = Number(group.rec_ID);
      const member = (group.details?.members || []).find((entry) => Number(entry.id) === id);
      return this._relation(groupId, id, member?.role === 'admin' ? 'admin' : 'member',
        { id: groupId, title: String(group.rec_Title || `#${groupId}`), rty });
    });
  }

  /**
   * Conditions of the manager's list: the members (their ids) or the user's groups.
   *
   * @param {Array<object>} relations The relations now.
   * @returns {Array<object>}
   */
  targetQuery(relations = []) {
    if (this.reverse) return [{ user: String(this.record.id) }];
    const ids = relations.map((relation) => relation.other.id).filter((id) => id > 0);
    return [{ ids: ids.length ? ids.join(',') : '0' }];
  }

  /** `POST /sys/group/{id}/members`. */
  _members(groupId, body) {
    return this.apiClient.request(`/sys/group/${Number(groupId)}/members`, { method: 'POST', body });
  }

  /**
   * Add users to the group (or the user to groups) with the role of the relation type;
   * one that already has it is skipped.
   *
   * @returns {Promise<number>} Number of memberships made or changed.
   */
  async add(otherIds, term, current = [], { signal = null, onProgress = null } = {}) {
    const role = this.roleOf(term);
    const have = new Set(current.filter((relation) => this.roleOf(relation.term) === role).map((relation) => relation.other.id));
    const ids = (otherIds || []).map(Number).filter((id) => id > 0 && !have.has(id));
    if (!ids.length) return 0;
    if (!this.reverse) {
      // one request for all the users
      await this._members(this.record.id, { add: ids, role });
      onProgress?.(ids.length, ids.length);
      return ids.length;
    }
    let count = 0;
    for (const groupId of ids) {
      if (signal?.aborted) break;
      await this._members(groupId, { add: [this.record.id], role });
      count += 1;
      onProgress?.(count, ids.length);
    }
    return count;
  }

  /** Change the role (add with a role changes it). */
  async setType(relation, term) {
    await this._members(relation.groupId, { add: [relation.userId], role: this.roleOf(term) });
  }

  /** The user leaves the group. */
  async remove(relation) {
    await this._members(relation.groupId, { remove: [relation.userId] });
  }
}
