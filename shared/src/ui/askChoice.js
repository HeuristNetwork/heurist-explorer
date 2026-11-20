/**
 * @file askChoice.js
 * @brief A question with answer buttons and Cancel (the first answer is primary), and its common case Save / Discard /
 *        Cancel for unsaved changes. Moved from the CMS designer (apps/website designerDialogs.js) for the Explorer story
 *        map tool (plan 27q1 §15).
 *
 *   const answer = await askSaveDiscard('Story has been changed. Save changes?');   // 'save' | 'discard' | null
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HMsg } from './HMsg.js';
import { $HR } from './i18n/HResource.js';

/**
 * A question with answer buttons and Cancel.
 *
 * @param {string} message Question (translated here).
 * @param {string} title Title of the dialog.
 * @param {Array<[string, string]>} answers `[value, label]`; the first is the primary button.
 * @param {object} [options]
 * @param {string} [options.className] Class of the dialog while it is open.
 * @param {string} [options.dialogId] Id of the dialog element.
 * @returns {Promise<string|null>} The value of the answer, null for Cancel or a closed dialog.
 */
export function askChoice(message, title, answers, { className = '', dialogId = 'h-choice-dialog' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      done = true;
      HMsg.closeMsgDlg(dialogId);
      resolve(value);
    };
    const text = document.createElement('p');
    text.className = 'h-cms-dialog-text';
    text.textContent = $HR(message);
    const dialog = HMsg.showMsgDlg(text, {
      message: true,
      dialogId,
      title,
      buttons: [
        ...answers.map(([value, label], index) => ({ label, class: `h-btn${index ? '' : ' h-btn-primary'}`, onClick: () => finish(value) })),
        { label: 'Cancel', class: 'h-btn', onClick: () => finish(null) }
      ]
    });
    if (className) dialog?.classList.add(className);
    // a close event of the dialog shown before in the same element is not this one's
    const onClose = () => {
      if (dialog.open) return;
      dialog.removeEventListener('close', onClose);
      if (className) dialog.classList.remove(className);
      if (!done) resolve(null);
    };
    dialog?.addEventListener('close', onClose);
  });
}

/**
 * Save / Discard / Cancel for unsaved changes.
 *
 * @param {string} message Question (translated here).
 * @param {object} [options] askChoice options and `title` (default "Unsaved changes").
 * @returns {Promise<'save'|'discard'|null>}
 */
export function askSaveDiscard(message, { title = 'Unsaved changes', ...options } = {}) {
  return askChoice(message, title, [['save', 'Save'], ['discard', 'Discard']], options);
}
