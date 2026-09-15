/**
 * @file mapMessages.js
 * @brief Displays map warning/error messages through the shared messaging widgets.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
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
 * Show a map warning or error dialog.
 *
 * @param {Error|{message?: string}|string} message Error object or message text.
 * @param {{error?: boolean, title?: string}} [options] `error` renders as an error dialog
 *        instead of a dismissible warning; `title` sets the dialog title.
 * @returns {*} Result of the underlying `HMsg` dialog call.
 */
export function showMapMessage(message, { error = false, title = 'Map warning' } = {}) {
  // Pass plain content as an element: server error text must not become HTML.
  const content = document.createElement('span');
  content.textContent = $HR(message?.message || String(message || 'Unable to complete the map operation.'));
  if (error) return HMsg.showMsgErr(content, { title });
  return HMsg.showMsgDlg(content, {
    title, buttons: { OK: () => HMsg.closeMsgDlg() }
  });
}
