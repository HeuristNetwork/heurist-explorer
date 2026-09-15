/**
 * @file graphMessages.js
 * @brief Shared error/warning message dialog helper for the Graph application.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
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
 * Show a graph error or warning dialog, ignoring aborted-request errors.
 *
 * @param {Error|string} message Error object or message text.
 * @param {{error?: boolean, title?: string}} [options] `error: true` shows the danger-styled error dialog.
 * @returns {HTMLDialogElement|void} The shown dialog, or `undefined` for an ignored `AbortError`.
 */
// Keep server and user-supplied message text out of HMsg's HTML string path.
export function showGraphMessage(message, { error = false, title = error ? 'Graph error' : 'Graph warning' } = {}) {
  if (message?.name === 'AbortError') return;
  const content = document.createElement('span');
  content.textContent = $HR(message?.message || String(message || 'Unable to complete the graph operation.'));
  if (error) return HMsg.showMsgErr(content, { title });
  return HMsg.showMsgDlg(content, { title, buttons: { OK: () => HMsg.closeMsgDlg() } });
}
