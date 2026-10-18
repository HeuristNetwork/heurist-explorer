/**
 * @file showHelperDialog.js
 * @brief The dialog of the Query Source helpers (column fields, geographic fields,
 *        time fields): used by the Query Source editor and by the record editor's
 *        special fields (plan 14a).
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
import { HFieldSetEditor } from './HFieldSetEditor.js';

/**
 * Show a helper in a dialog with Apply and Cancel.
 *
 * @param {string} title Dialog title (translated here).
 * @param {object} editor Helper widget (attach/render/destroy).
 * @param {() => *} getResult Reads the result on Apply.
 * @returns {Promise<*>} The result, or null on Cancel.
 */
export function showHelperDialog(title, editor, getResult) {
  const wide = editor instanceof HFieldSetEditor;
  const host = document.createElement('div');
  host.className = wide ? 'h-qse-dialog-wide' : 'h-qse-dialog';
  editor.attach(host).render();
  return new Promise((resolve) => {
    let dlg = null;
    // own dialog: a message shown meanwhile (e.g. a flash) must not replace the editor
    const dialogId = 'h-qse-editor-dialog';
    const finish = async (value) => {
      dlg?.classList.remove('h-qse-dialog-wide-shell', 'h-qse-dialog-shell');
      HMsg.closeMsgDlg?.(dialogId);
      await editor.destroy();
      resolve(value);
    };
    dlg = HMsg.showMsgDlg(host, {
      dialogId,
      title: $HR(title),
      preventClose: true,
      buttons: [
        { label: $HR('Apply'), class: 'h-btn h-btn-primary', onClick: () => void finish(getResult()) },
        { label: $HR('Cancel'), class: 'h-btn', onClick: () => void finish(null) }
      ]
    });
    dlg?.classList.toggle('h-qse-dialog-wide-shell', wide);
    // geographic and time fields: wider and lower than a message dialog (2026-10-18)
    dlg?.classList.toggle('h-qse-dialog-shell', !wide);
  });
}
