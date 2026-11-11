/**
 * @file setupNotice.js
 * @brief Notice of missing definitions with an Install button, and a modal "Importing..."
 *        popup with the rotating icon while the definitions are installed. Used by the
 *        Reports module and the Website manager (plan 30 §15).
 *
 *   container.append(setupNotice({ text, missing, canSetup, onInstall }));
 *   const result = await runWithBusyDialog(() => api.setup(), { title: 'Report setup' });
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
import { loadingIndicator } from './loadingIndicator.js';

/**
 * The notice: explanation, the missing definitions, and Install for a database manager
 * (others are told to ask the database owner). Class `h-setup-notice` (heurist-ui.css).
 *
 * @param {object} options
 * @param {string} options.text Explanation (already translated).
 * @param {string[]} [options.missing] Missing definitions (codes or short texts).
 * @param {boolean} [options.canSetup] The user may install them.
 * @param {Function} [options.onInstall] Called by the Install button.
 * @returns {HTMLDivElement}
 */
export function setupNotice({ text, missing = [], canSetup = false, onInstall = null }) {
  const box = document.createElement('div');
  box.className = 'h-setup-notice';
  const line = (className, value) => {
    const element = document.createElement('p');
    element.className = className;
    element.textContent = value;
    box.append(element);
    return element;
  };
  line('h-setup-notice-text', text);
  if (missing.length) line('h-setup-notice-missing', `${$HR('Missing')}: ${missing.join(', ')}`);
  if (canSetup) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'h-btn h-btn-primary h-setup-notice-install';
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-download';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = $HR('Install');
    button.append(icon, label);
    button.addEventListener('click', () => onInstall?.());
    box.append(button);
  } else {
    line('h-setup-notice-owner', $HR('Ask the database owner to install them.'));
  }
  return box;
}

/**
 * Run a task under a modal popup with the rotating icon (it can not be closed meanwhile). The
 * popup is closed at the end; the caller may open the next dialog (a report) at once.
 *
 * @template T
 * @param {() => Promise<T>} task The work, e.g. the setup request.
 * @param {{title?: string, text?: string}} [options] Title and text (default "Importing...").
 * @returns {Promise<T>}
 */
export async function runWithBusyDialog(task, { title = '', text = 'Importing...' } = {}) {
  HMsg.showMsgDlg(loadingIndicator($HR(text)), { title, message: true, preventClose: true, hideFooter: true });
  try {
    return await task();
  } finally {
    HMsg.closeMsgDlg();
  }
}
