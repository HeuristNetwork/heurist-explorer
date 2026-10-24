/**
 * @file progressDialog.js
 * @brief A dialog with a text, a progress bar and Cancel: a file upload (fileRegistration.js)
 *        and many writes in a row, e.g. the relationships of "Find or Add" (plan 24).
 *
 *   const progress = openProgressDialog({ title: 'Relationships', text: 'Creating relationships' });
 *   progress.update(3, 50);            // 3 of 50
 *   if (progress.signal.aborted) ...   // Cancel or the close button
 *   progress.close();
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

import { HMsg } from './HMsg.js';
import { $HR } from './i18n/HResource.js';

/** Dialogs opened (unique ids: one may open over another dialog). */
let progressCount = 0;

/**
 * Open the progress dialog.
 *
 * @param {{title?: string, text?: string, counter?: boolean}} [options] `counter`: "3 of 50" below the bar.
 * @returns {{signal: AbortSignal, update: (done: number, total: number) => void, close: () => void}}
 */
export function openProgressDialog({ title = '', text = '', counter = false } = {}) {
  const controller = new AbortController();
  const dialogId = `h-progress-dialog-${++progressCount}`;
  const body = document.createElement('div');
  body.className = 'h-progress-dialog';
  const caption = document.createElement('div');
  caption.textContent = text;
  const bar = document.createElement('progress');
  bar.max = 1;
  bar.value = 0;
  // as wide as the dialog (a <progress> is 120-160 px by default), whatever CSS the host loaded
  bar.style.width = '100%';
  body.append(caption, bar);
  const count = counter ? document.createElement('div') : null;
  if (count) body.append(count);
  let open = true;
  const dialog = HMsg.showMsgDlg(body, {
    dialogId,
    title,
    buttons: [{ label: $HR('Cancel'), class: 'h-btn', onClick: () => controller.abort() }]
  });
  dialog?.addEventListener?.('close', () => {
    if (open) controller.abort();
  }, { once: true });
  return {
    signal: controller.signal,
    update: (done, total) => {
      bar.value = total > 0 ? Math.min(1, done / total) : 0;
      if (count) count.textContent = `${done} ${$HR('of')} ${total}`;
    },
    close: () => {
      open = false;
      HMsg.closeMsgDlg(dialogId);
    }
  };
}
