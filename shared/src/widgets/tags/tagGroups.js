/**
 * @file tagGroups.js
 * @brief Tags grouped by owner for the tag widgets (HTagManager, HTagSelector; plan 20,
 *        Phase 4a): "Personal tags" first, then each group of the user, then any other
 *        owner (an administrator sees them), tags sorted by name. Also the small
 *        confirmation dialog of the tag widgets.
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

import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';

/**
 * @typedef {object} TagOwnerGroup
 * @property {number} owner User or group id.
 * @property {string} label "Personal tags" or "<group> tags".
 * @property {string} name "Personal" or the name of the group.
 * @property {boolean} personal The current user's own tags.
 * @property {Array<import('../../data/TagClient.js').Tag>} tags Tags of the owner, by name.
 */

/**
 * Owner groups of tags: the current user, the user's groups (also without tags, so that a
 * tag can be added there) and the other owners of the given tags.
 *
 * @param {Array<object>} tags Tags (`owner`, `name`, optionally `ownerName`).
 * @param {{currentUserId: number, groups?: Array<{id: number, name: string}>}} context The user and their groups.
 * @returns {TagOwnerGroup[]}
 */
export function tagOwnerGroups(tags, { currentUserId, groups = [] }) {
  const me = Number(currentUserId) || 0;
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base', numeric: true });
  const list = [];
  const seen = new Set();
  const add = (owner, label, personal, name) => {
    if (seen.has(owner)) return;
    seen.add(owner);
    list.push({ owner, label, name, personal, tags: (tags || []).filter((tag) => tag.owner === owner).sort(byName) });
  };
  if (me > 0) add(me, $HR('Personal tags'), true, $HR('Personal'));
  for (const group of groups || []) add(Number(group.id), `${group.name} ${$HR('tags')}`, false, String(group.name));
  for (const tag of tags || []) {
    const name = tag.ownerName || `#${tag.owner}`;
    if (!seen.has(tag.owner)) add(tag.owner, `${name} ${$HR('tags')}`, false, name);
  }
  return list;
}

/**
 * A Yes / Cancel question.
 *
 * @param {string} message Question (translated).
 * @param {{title?: string, yes?: string}} [options] Title and the label of the yes button (translated).
 * @returns {Promise<boolean>} Whether the user said yes.
 */
export function confirmTagAction(message, { title = '', yes = '' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const dialogId = `h-tag-confirm-${Date.now()}`;
    const answer = (value) => {
      if (answered) return;
      answered = true;
      HMsg.closeMsgDlg(dialogId);
      resolve(value);
    };
    const dialog = HMsg.showMsgDlg(message, {
      dialogId,
      title: title || $HR('Tags'),
      buttons: [
        { label: yes || $HR('Yes'), class: 'h-btn h-btn-primary', onClick: () => answer(true) },
        { label: $HR('Cancel'), class: 'h-btn', onClick: () => answer(false) }
      ]
    });
    dialog?.addEventListener?.('close', () => answer(false), { once: true });
  });
}
