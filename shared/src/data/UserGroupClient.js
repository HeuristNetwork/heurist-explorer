/**
 * @file UserGroupClient.js
 * @brief Users and groups on /sys (plan 20, Phase 4d): the record of a user or group as
 *        plain values (the hard-coded structures of systemEntities.js), writes, the members
 *        of a group and the image of a user or group.
 *
 *   const groups = new UserGroupClient({ apiClient, dbdefs }, 'group');
 *   const { values, members } = await groups.get(5);
 *   await groups.save(5, { description: 'New text' }, { modified });
 *   await groups.setMembers(5, { 2: 'admin', 7: 'member' }, members);
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

import { RecordEditClient } from './RecordEditClient.js';
import { systemDetails, systemValues } from './systemEntities.js';

/** Reads and writes of one of the types user and group. */
export class UserGroupClient {
  /**
   * @param {{apiClient: object, dbdefs: object}} options HeuristApiClient (`get`, `request`) and HDbDefs.
   * @param {'user'|'group'} type The type.
   */
  constructor({ apiClient, dbdefs }, type) {
    if (typeof apiClient?.request !== 'function') throw new TypeError('A user / group client requires an API client');
    if (!['user', 'group'].includes(type)) throw new TypeError(`Not a user or group type: ${type}`);
    this.apiClient = apiClient;
    this.dbdefs = dbdefs;
    this.type = type;
    this.records = new RecordEditClient({ apiClient, domain: 'sys', type });
  }

  /**
   * A user or group as plain values; a group with its members.
   *
   * @param {number} id Id.
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<{id: number, title: string, modified: string|null, values: object, members: Object<number, string>}>}
   */
  async get(id, { signal } = {}) {
    const response = await this.apiClient.get(`/sys/${this.type}/${Number(id)}`, { signal, query: { fields: '_all' } });
    const record = response?.records?.[0] || null;
    if (!record) throw new Error(`The ${this.type} ${id} does not exist or you cannot see it`);
    return this.toItem(record);
  }

  /**
   * Add (id 0) or change a user or group: the given values only ('' clears; an empty
   * password keeps it).
   *
   * @param {number} id Id, 0 for a new one.
   * @param {object} values Plain values (keys of the structure).
   * @param {{modified?: string|null}} [options] The rec_Modified the change is based on.
   * @returns {Promise<{item: object, issues: Array<object>}>}
   */
  async save(id, values, { modified = null } = {}) {
    const { password, ...rest } = values || {};
    const plain = String(password ?? '').trim() ? { ...rest, password } : rest;
    const details = systemDetails(this.type, plain, this.dbdefs);
    const saved = Number(id) > 0
      ? await this.records.patch(Number(id), { details, ...(modified ? { rec_Modified: modified } : {}) })
      : await this.records.insert({ rec_ID: '0', details });
    return { item: this.toItem(saved.record), issues: saved.issues || [] };
  }

  /** Delete a user or group. */
  async remove(id) {
    return this.records.remove(Number(id));
  }

  /**
   * Make the members of a group the given ones (the changes as members requests: the users
   * that go, then the admins, then the members; a group always keeps an admin).
   *
   * @param {number} groupId Group.
   * @param {Object<number, string>} next User id => admin|member.
   * @param {Object<number, string>} current The members now.
   * @returns {Promise<Object<number, string>>} The members after the change.
   */
  async setMembers(groupId, next, current = {}) {
    const path = `/sys/group/${Number(groupId)}/members`;
    const post = (body) => this.apiClient.request(path, { method: 'POST', body });
    const ids = (role) => Object.keys(next).filter((id) => next[id] === role && current[id] !== role).map(Number);
    let members = { ...current };
    // admins first: the group keeps an admin while members leave
    for (const role of ['admin', 'member']) {
      const add = ids(role);
      if (add.length) members = membersOf(await post({ add, role }));
    }
    const remove = Object.keys(current).filter((id) => !next[id]).map(Number);
    if (remove.length) members = membersOf(await post({ remove }));
    return members;
  }

  /**
   * The image of a user or group.
   *
   * @returns {Promise<{url: string, thumbnail: string}|null>}
   */
  async image(id) {
    const response = await this.apiClient.get(`/sys/${this.type}/${Number(id)}/image`);
    return response?.image || null;
  }

  /**
   * Put the image of a finished upload (FileUploader.upload) as the image.
   *
   * @returns {Promise<{url: string, thumbnail: string}|null>}
   */
  async putImage(id, token) {
    const response = await this.apiClient.request(`/sys/${this.type}/${Number(id)}/image`, { method: 'PUT', body: { upload: token } });
    return response?.image || null;
  }

  /** Remove the image. */
  async removeImage(id) {
    await this.apiClient.request(`/sys/${this.type}/${Number(id)}/image`, { method: 'DELETE' });
    return null;
  }

  /** @returns {object} Plain item of a record. */
  toItem(record) {
    const members = {};
    for (const member of Array.isArray(record?.details?.members) ? record.details.members : []) {
      members[Number(member.id)] = member.role === 'admin' ? 'admin' : 'member';
    }
    return {
      id: Number(record?.rec_ID) || 0,
      title: String(record?.rec_Title ?? ''),
      modified: record?.rec_Modified ?? null,
      values: systemValues(this.type, record, this.dbdefs),
      members
    };
  }
}

/** Members of a members response (the group record and meta.members). */
function membersOf(response) {
  const members = {};
  for (const member of response?.meta?.members || []) members[Number(member.id)] = member.role === 'admin' ? 'admin' : 'member';
  return members;
}
