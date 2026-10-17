/**
 * @file editFormDialog.js
 * @brief An HEditForm in a message dialog (plan 14a): OK checks the values and
 *        resolves with them, Cancel with null.
 *
 *   const values = await openEditFormDialog({ title: 'Schedule', form: json, values });
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

import { HEditForm } from './HEditForm.js';
import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';

/**
 * Show a form in a dialog.
 *
 * @param {object} options HEditForm options (`form`, `values`, `onReady`, `validate`...) and:
 * @param {string} [options.title] Dialog title.
 * @param {string} [options.okLabel='OK'] Label of the OK button.
 * @param {string} [options.cancelLabel='Cancel'] Label of the Cancel button.
 * @param {string} [options.className] Extra class of the dialog (its size).
 * @returns {Promise<object|null>} The values (HEditForm.getValues), or null when cancelled.
 */
export function openEditFormDialog(options = {}) {
  const { title = '', okLabel = 'OK', cancelLabel = 'Cancel', className = '', ...formOptions } = options;
  const host = document.createElement('div');
  host.className = 'h-edit-form-dialog-body';
  const form = new HEditForm().attach(host, formOptions);
  form.render();
  const localized = form.form.localized;
  const text = (value) => (localized ? value : $HR(value));

  return new Promise((resolve) => {
    const id = `h-edit-form-dialog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let finished = false;
    const finish = async (values) => {
      if (finished) return;
      finished = true;
      HMsg.closeMsgDlg(id);
      await form.destroy();
      resolve(values);
    };
    const dialog = HMsg.showMsgDlg(host, {
      dialogId: id,
      title: text(title),
      preventClose: true,
      buttons: [
        {
          label: text(okLabel),
          class: 'h-btn h-btn-primary',
          onClick: () => {
            if (form.validate().length) return;
            void finish(form.getValues());
          }
        },
        { label: text(cancelLabel), class: 'h-btn', onClick: () => void finish(null) }
      ]
    });
    dialog?.classList.add('h-edit-form-dialog');
    if (className) dialog?.classList.add(...String(className).split(/\s+/).filter(Boolean));
    dialog?.addEventListener('close', () => void finish(null), { once: true });
  });
}
