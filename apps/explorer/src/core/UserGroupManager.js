/**
 * @file UserGroupManager.js
 * @brief Loads the groups visible to the current user and publishes them on
 *        HDbDefs (plan V6/V7); users and tags only when first needed.
 *
 * At start one public `/sys` request: groups (with the current user's role). The
 * server applies the visibility rule; its `meta.currentUser` says who is logged
 * in (with their name) and whether they administer the database. Users and the
 * current user's tags are loaded by HDbDefs through this manager's loader the
 * first time something lists them (2026-10-27, start-up time). Guests get nothing
 * and the overlay is cleared, so user/group inputs fall back to direct input.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Keeps the users/groups overlay of HDbDefs up to date. */
export class UserGroupManager {
  /**
   * @param {object} options Manager configuration.
   * @param {import('#shared/api').HeuristApiClient} options.apiClient Heurist API client.
   * @param {function(): Promise<object>} options.dbDefsProvider Resolves the current database's definitions.
   */
  constructor({ apiClient, dbDefsProvider } = {}) {
    if (!apiClient) throw new TypeError('UserGroupManager requires apiClient');
    if (typeof dbDefsProvider !== 'function') throw new TypeError('UserGroupManager requires dbDefsProvider');
    this.apiClient = apiClient;
    this.dbDefsProvider = dbDefsProvider;
    this.data = null;
    this._loadController = null;
  }

  /**
   * (Re)load the groups and publish them on HDbDefs; users and tags follow on
   * demand. Call again after login or logout.
   *
   * @returns {Promise<object|null>} The published data, or `null` for a guest.
   */
  async load() {
    this._loadController?.abort();
    const controller = new AbortController();
    this._loadController = controller;
    const [dbDefs, groups] = await Promise.all([
      this.dbDefsProvider(),
      this._request('group', 'role').catch((error) => guestOrThrow(error))
    ]);
    if (controller.signal.aborted) return this.data;
    const currentUser = groups?.meta?.currentUser || null;
    const currentUserId = Number(currentUser?.id) || 0;
    this.data = currentUserId > 0 ? {
      currentUserId,
      isDbAdmin: Boolean(currentUser?.isAdmin),
      groups: records(groups).map((record) => ({
        id: Number(record.rec_ID),
        name: String(record.rec_Title ?? ''),
        role: record.details?.role?.[0]?.value || 'none'
      })),
      // until the user list is needed: the current user (their own name)
      users: currentUser?.name ? [{ id: currentUserId, name: String(currentUser.name) }] : [],
      tags: [],
      pending: ['users', 'tags']
    } : null;
    dbDefs?.setUserGroupLoader?.(this.data ? (part) => this._loadPart(part, controller) : null);
    dbDefs?.setUserGroups?.(this.data);
    return this.data;
  }

  /**
   * Load users and/or tags now, when they are not loaded yet.
   *
   * @param {Array<'users'|'tags'>} [parts] Parts needed; default both.
   * @returns {Promise<object|null>} The data, as `load`.
   */
  async ensure(parts) {
    await (await this.dbDefsProvider())?.ensureUserGroups?.(parts);
    return this.data;
  }

  /** Clear the overlay (logout). */
  async clear() {
    this._loadController?.abort();
    this.data = null;
    const dbDefs = await this.dbDefsProvider();
    dbDefs?.setUserGroupLoader?.(null);
    dbDefs?.setUserGroups?.(null);
  }

  /** One `/sys` list request of this load. */
  _request(type, fields, scope = {}, limit = 1000, signal = this._loadController?.signal) {
    return this.apiClient.get('/sys', {
      query: { q: { t: type, ...scope }, limit, ...(fields ? { fields } : {}) },
      signal
    });
  }

  /**
   * The rows of one part of the overlay, for HDbDefs; also kept in `data`.
   *
   * @param {'users'|'tags'} part Part to load.
   * @param {AbortController} controller The load this part belongs to.
   * @returns {Promise<Array<object>>} Rows.
   */
  async _loadPart(part, controller) {
    let rows;
    if (part === 'tags') {
      // tags (keywords) of the current user only - personal and of their groups - even for
      // an administrator, who could otherwise read every user's tags
      // (the record format since plan 20 Phase 4a: the owner is the header rec_OwnerUGrpID)
      const tags = await this._request('tag', 'rec_OwnerUGrpID', { user: 'current' }, 5000, controller.signal)
        .catch((error) => guestOrThrow(error));
      rows = records(tags).map((record) => ({
        id: Number(record.rec_ID), name: String(record.rec_Title ?? ''), owner: Number(record.rec_OwnerUGrpID)
      }));
    } else {
      const users = await this._request('user', null, {}, 1000, controller.signal).catch((error) => guestOrThrow(error));
      rows = records(users).map((record) => ({ id: Number(record.rec_ID), name: String(record.rec_Title ?? '') }));
    }
    if (this.data && this._loadController === controller) {
      this.data = { ...this.data, [part]: rows, pending: this.data.pending.filter((name) => name !== part) };
    }
    return rows;
  }
}

/** Workgroup "Everyone" (legacy public scope of saved filters). */
export const EVERYONE_GROUP = 0;
/** Workgroup "Website filters": readable by everyone, guests included. */
export const WEB_FILTERS_GROUP = 4;

/**
 * Owners whose Saved Filters and Query Sources the current user lists:
 * Everyone, Website filters, the groups they are a member or admin of, and
 * themselves. A guest (`data` null) gets Everyone and Website filters.
 *
 * @param {object|null} data UserGroupManager data (`currentUserId`, `groups[{id, role}]`).
 * @returns {number[]} Owner (user/group) IDs.
 */
export function ownerScope(data) {
  const ids = [EVERYONE_GROUP, WEB_FILTERS_GROUP];
  if (data?.currentUserId > 0) {
    ids.push(Number(data.currentUserId));
    for (const group of data.groups || []) {
      if (group.role === 'member' || group.role === 'admin') ids.push(Number(group.id));
    }
  }
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id >= 0))];
}

/** @returns {Array<object>} Records of a `/sys` payload. */
function records(payload) {
  return Array.isArray(payload?.records) ? payload.records : [];
}

/** A guest may be refused (401/403): treat it as "nothing visible". */
function guestOrThrow(error) {
  if (error?.name === 'AbortError') throw error;
  if ([401, 403].includes(Number(error?.status))) return null;
  throw error;
}
