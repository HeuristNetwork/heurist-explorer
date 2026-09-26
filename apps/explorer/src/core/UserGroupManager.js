/**
 * @file UserGroupManager.js
 * @brief Loads, once, the users and groups visible to the current user and
 *        publishes them on HDbDefs (plan V6/V7).
 *
 * Two public `/sys` requests run in parallel: groups (with the current user's
 * role) and users. The server applies the visibility rule; its
 * `meta.currentUser` says who is logged in and whether they administer the
 * database. Guests get nothing and the overlay is cleared, so user/group inputs
 * fall back to direct input.
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
   * (Re)load users and groups and publish them on HDbDefs. Call again after
   * login or logout.
   *
   * @returns {Promise<object|null>} The published data, or `null` for a guest.
   */
  async load() {
    this._loadController?.abort();
    const controller = new AbortController();
    this._loadController = controller;
    const request = (type, fields) => this.apiClient.get('/sys', {
      query: { q: { t: type }, limit: 1000, ...(fields ? { fields } : {}) },
      signal: controller.signal
    });
    const [dbDefs, groups, users] = await Promise.all([
      this.dbDefsProvider(),
      request('group', 'role').catch((error) => guestOrThrow(error)),
      request('user').catch((error) => guestOrThrow(error))
    ]);
    if (controller.signal.aborted) return this.data;
    const currentUser = groups?.meta?.currentUser || users?.meta?.currentUser || null;
    const currentUserId = Number(currentUser?.id) || 0;
    this.data = currentUserId > 0 ? {
      currentUserId,
      isDbAdmin: Boolean(currentUser?.isAdmin),
      groups: records(groups).map((record) => ({
        id: Number(record.rec_ID),
        name: String(record.rec_Title ?? ''),
        role: record.details?.role?.[0]?.value || 'none'
      })),
      users: records(users).map((record) => ({ id: Number(record.rec_ID), name: String(record.rec_Title ?? '') }))
    } : null;
    dbDefs?.setUserGroups?.(this.data);
    return this.data;
  }

  /** Clear the overlay (logout). */
  async clear() {
    this._loadController?.abort();
    this.data = null;
    (await this.dbDefsProvider())?.setUserGroups?.(null);
  }
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
