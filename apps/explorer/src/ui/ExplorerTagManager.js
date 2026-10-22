/**
 * @file ExplorerTagManager.js
 * @brief The tag manager of Explorer (plan 20, Phase 4a): HTagManager in a dialog,
 *        opened from the gear menu, the configuration dialog and the Tags panel of
 *        the record editor. A click on a usage count searches the records of the tag
 *        (the dialog closes).
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

import { $HR, HMsg } from '#shared/ui';
import { TagClient } from '#shared/data/TagClient.js';
import { HTagManager } from '#shared/widgets/tags/HTagManager.js';

let dialogCount = 0;

/**
 * Open the tag manager of the current user.
 *
 * @param {object} options
 * @param {object} options.apiClient HeuristApiClient.
 * @param {object} options.dbdefs HDbDefs (the user, the user's groups, the field ids).
 * @param {(tag: {id: number, name: string}) => void} [options.onSearchTag] Search of the records of a tag.
 * @param {() => void} [options.onChange] After a tag was added, changed, merged or deleted.
 * @returns {Promise<void>} Resolved when the dialog closes.
 */
export function openTagManager({ apiClient, dbdefs, onSearchTag = null, onChange = null }) {
  const currentUserId = Number(dbdefs?.currentUserId?.()) || 0;
  if (currentUserId < 1) {
    HMsg.showMsgErr($HR('Log in to manage your tags'));
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const dialogId = `h-explorer-tag-manager-${++dialogCount}`;
    const host = document.createElement('div');
    host.className = 'h-explorer-tag-manager';
    const manager = new HTagManager().attach(host, {
      tagClient: new TagClient({ apiClient, dbdefs }),
      currentUserId,
      groups: (dbdefs?.groups?.() || []).map((group) => ({ id: Number(group.id), name: String(group.name ?? '') })),
      onChange,
      onSearchTag: onSearchTag ? (tag) => {
        HMsg.closeMsgDlg(dialogId);
        onSearchTag(tag);
      } : null
    }).render();
    const dialog = HMsg.showMsgDlg(host, {
      dialogId,
      title: $HR('Manage tags'),
      buttons: [{ label: $HR('Close'), class: 'h-btn', onClick: () => HMsg.closeMsgDlg(dialogId) }]
    });
    if (dialog) dialog.style.width = 'min(760px, calc(100vw - 24px))';
    const closed = () => {
      void manager.destroy();
      resolve();
    };
    if (dialog) dialog.addEventListener('close', closed, { once: true });
    else closed();
  });
}
