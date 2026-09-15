/**
 * @file timelineMessages.js
 * @brief Shows timeline warnings and errors using the shared message dialog.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
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
 * Show a timeline warning or error message dialog. Silently ignores aborted requests.
 *
 * @param {Error|string} message Error object or message text to display.
 * @param {object} [options] Display options.
 * @param {boolean} [options.error=false] Show as an error (danger palette, no dismiss button) instead of a warning.
 * @param {string} [options.title] Dialog title; defaults to a generic timeline error/warning title.
 * @returns {HTMLDialogElement|undefined} The shown dialog element, or `undefined` for an ignored AbortError.
 */
export function showTimelineMessage(message, { error = false, title = error ? 'Timeline error' : 'Timeline warning' } = {}) {
  if (message?.name === 'AbortError') return;

  const content = document.createElement('span');
  content.textContent = $HR(message?.message || String(message || 'Unable to complete the timeline operation.'));

  if (error) return HMsg.showMsgErr(content, { title });
  return HMsg.showMsgDlg(content, { title, buttons: { OK: () => HMsg.closeMsgDlg() } });
}
