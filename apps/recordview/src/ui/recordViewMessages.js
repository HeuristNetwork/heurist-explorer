/**
 * @file recordViewMessages.js
 * @brief Shared error/warning message dialog helper for the Record View application.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { HMsg, $HR } from '#shared/ui';

/**
 * Show a Record View error or warning dialog, ignoring aborted-request errors.
 *
 * @param {Error|string} message Error object or message text.
 * @param {{error?: boolean, title?: string}} [options] `error: true` shows the danger-styled error dialog.
 * @returns {HTMLDialogElement|void} The shown dialog, or `undefined` for an ignored `AbortError`.
 */
export function showRecordViewMessage(message, { error = false, title = error ? 'Record View error' : 'Record View warning' } = {}) {
  if (message?.name === 'AbortError') return;
  const content = document.createElement('span');
  content.textContent = $HR(message?.message || String(message || 'Unable to complete the Record View operation.'));
  if (error) return HMsg.showMsgErr(content, { title });
  return HMsg.showMsgDlg(content, { title, buttons: { OK: () => HMsg.closeMsgDlg() } });
}
