/**
 * @file recordAccess.js
 * @brief Owner and visibility of a record (plan 21 §6): the rules of the legacy
 *        access form (`hclient/widgets/record/recordAccess.js`) and the remembered
 *        owner / visibility of new records.
 *
 * Form ↔ record header:
 * - the form has the radio `hidden` ("User or group specified above") with the
 *   groups that can also view; a stored `hidden`, or any view groups, check it;
 * - saving: owner 0 (any logged-in user) and not public → `viewable` without
 *   groups; `hidden` with groups → `viewable` + those groups (only they and the
 *   owner see the record); `viewable` and `public` have no groups;
 * - `pending` (public, changes pending approval) is set by the server
 *   (sys_SetPublicToPendingOnEdit) and is not offered: it shows as Public and is
 *   saved unchanged while Public stays checked.
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

/** Visibility radios of the form. */
export const ACCESS_CHOICES = Object.freeze(['hidden', 'viewable', 'public']);

/** Prefix of the browser storage key of the remembered access of new records. */
const DEFAULTS_KEY = 'heurist-record-add-defaults';

/**
 * Form state of a record header.
 *
 * @param {{owner?: number, visibility?: string, viewGroups?: number[], editGroups?: number[]}} header
 * @returns {{owner: number, choice: string, viewGroups: number[], editGroups: number[], pending: boolean}}
 */
export function accessFormState(header = {}) {
  const visibility = String(header.visibility || 'viewable').toLowerCase();
  const viewGroups = ids(header.viewGroups);
  const pending = visibility === 'pending';
  let choice = pending ? 'public' : visibility;
  if (choice === 'hidden' || (viewGroups.length && choice !== 'public')) choice = 'hidden';
  if (!ACCESS_CHOICES.includes(choice)) choice = 'viewable';
  return { owner: Number(header.owner) || 0, choice, viewGroups, editGroups: ids(header.editGroups), pending };
}

/**
 * Record header of a form state (the save rule of the legacy form).
 *
 * @param {{owner: number, choice: string, viewGroups?: number[], editGroups?: number[], pending?: boolean}} state
 * @returns {{owner: number, visibility: string, viewGroups: number[], editGroups: number[]}}
 */
export function accessHeader(state = {}) {
  const owner = Number(state.owner) || 0;
  const choice = ACCESS_CHOICES.includes(state.choice) ? state.choice : 'viewable';
  const editGroups = ids(state.editGroups);
  if (choice === 'public') return { owner, visibility: state.pending ? 'pending' : 'public', viewGroups: [], editGroups };
  if (owner === 0) return { owner, visibility: 'viewable', viewGroups: [], editGroups };
  if (choice === 'hidden') {
    const viewGroups = ids(state.viewGroups);
    return viewGroups.length
      ? { owner, visibility: 'viewable', viewGroups, editGroups }
      : { owner, visibility: 'hidden', viewGroups: [], editGroups };
  }
  return { owner, visibility: 'viewable', viewGroups: [], editGroups };
}

/**
 * Remembered access (and record type) of the last new record of a user in a database;
 * first time: owner = the user, visibility `viewable` (Artem 2026-10-19).
 *
 * @param {{database?: string, userId?: number}} who Database and user.
 * @returns {{owner: number, visibility: string, viewGroups: number[], rectypeId: number}}
 */
export function loadRecordAddDefaults({ database = '', userId = 0 } = {}) {
  const fallback = { owner: Number(userId) || 0, visibility: 'viewable', viewGroups: [], rectypeId: 0 };
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(defaultsKey(database, userId)) || 'null');
    if (!stored || typeof stored !== 'object') return fallback;
    return {
      owner: Number.isFinite(Number(stored.owner)) ? Number(stored.owner) : fallback.owner,
      visibility: ['hidden', 'viewable', 'public'].includes(stored.visibility) ? stored.visibility : 'viewable',
      viewGroups: ids(stored.viewGroups),
      rectypeId: Number(stored.rectypeId) || 0
    };
  } catch {
    return fallback;
  }
}

/**
 * Remember the access (and record type) of a new record.
 *
 * @param {{database?: string, userId?: number}} who Database and user.
 * @param {{owner?: number, visibility?: string, viewGroups?: number[], rectypeId?: number}} value
 * @returns {void}
 */
export function saveRecordAddDefaults({ database = '', userId = 0 } = {}, value = {}) {
  if (!(Number(userId) > 0)) return;
  try {
    const previous = loadRecordAddDefaults({ database, userId });
    const visibility = value.visibility === 'pending' ? 'public' : value.visibility;
    globalThis.localStorage?.setItem(defaultsKey(database, userId), JSON.stringify({
      owner: Number(value.owner ?? previous.owner) || 0,
      visibility: visibility || previous.visibility,
      viewGroups: ids(value.viewGroups ?? previous.viewGroups),
      rectypeId: Number(value.rectypeId ?? previous.rectypeId) || 0
    }));
  } catch {
    // no browser storage (private window): nothing is remembered
  }
}

/** Storage key of a database and user. */
function defaultsKey(database, userId) {
  return `${DEFAULTS_KEY}:${database || ''}:${Number(userId) || 0}`;
}

/** @returns {number[]} Positive ids, once each. */
function ids(value) {
  const list = Array.isArray(value) ? value : value == null || value === '' ? [] : String(value).split(',');
  return [...new Set(list.map(Number).filter((id) => id > 0))];
}
