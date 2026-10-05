/**
 * @file ownerSections.js
 * @brief Group list items (filters, Query Sources, reports) by owner user or group.
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

import { $HR } from '../ui/i18n/HResource.js';

/**
 * Group list items by owner (user/group id) into ordered sections: the current
 * user, their other groups by name, Website filters (4), Everyone (0), then
 * any other owner by id.
 *
 * @param {Array<{ownerGroupId: number|null, title: string}>} items List items.
 * @param {object|null} userData UserGroupManager data (`currentUserId`, `groups`, `users`).
 * @returns {Array<{key: string, label: string, items: Array<object>}>} Sections, items by title.
 */
export function ownerSections(items, userData) {
  const currentUserId = Number(userData?.currentUserId) || 0;
  const names = new Map([...(userData?.users || []), ...(userData?.groups || [])]
    .map((owner) => [Number(owner.id), String(owner.name || '')]));
  const byOwner = new Map();
  for (const item of items) {
    const owner = item.ownerGroupId ?? null;
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push(item);
  }
  const rank = (owner) => (owner === currentUserId && owner > 0 ? 0
    : owner === 4 ? 2 : owner === 0 ? 3 : owner === null ? 5 : names.has(owner) ? 1 : 4);
  const label = (owner) => {
    if (owner === null) return $HR('Other');
    if (owner === currentUserId && owner > 0) return `${$HR('Mine')}${names.get(owner) ? ` (${names.get(owner)})` : ''}`;
    if (owner === 0) return $HR('Everyone');
    if (owner === 4) return names.get(4) || $HR('Website filters');
    return names.get(owner) || `${$HR('Group')} ${owner}`;
  };
  return [...byOwner.entries()]
    .map(([owner, list]) => ({
      owner,
      key: String(owner),
      label: label(owner),
      items: list.slice().sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' }))
    }))
    .sort((a, b) => rank(a.owner) - rank(b.owner) || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
      || (a.owner ?? 0) - (b.owner ?? 0))
    .map(({ owner, ...section }) => section);
}
