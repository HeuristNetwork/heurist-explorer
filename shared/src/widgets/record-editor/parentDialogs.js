/**
 * @file parentDialogs.js
 * @brief Parent selection messages for the virtual parent field (plan 26).
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

import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';

/** Legacy warning: independent creation needs acknowledgement; dismissal cancels. */
export function childCreationChoice(dbdefs, rectypeId) {
  const names = [...new Set(dbdefs.parentLinks(rectypeId).map((link) => dbdefs.rectypeName(link.parentRectypeId)))];
  const content = document.createElement('div');
  const text = document.createElement('p');
  text.textContent = `${dbdefs.rectypeName(rectypeId)} ${$HR('is defined as a child of')} ${names.join(', ')}.`;
  const help = document.createElement('p');
  help.textContent = `${$HR('To avoid creation of orphan records, you should only create')} ${dbdefs.rectypeName(rectypeId)} ${$HR('records from within a parent record')}`;
  const label = document.createElement('label');
  const check = document.createElement('input');
  check.type = 'checkbox';
  label.append(check, document.createTextNode($HR('If you understand the implications and still wish to create an independent, non-child record, check this box then click [Create independent record].')));
  content.append(text, help, label);
  return new Promise((resolve) => {
    let choice = null;
    const dialog = HMsg.showMsgDlg(content, {
      dialogId: 'h-child-creation', title: 'Parent record', buttons: [
        { label: 'Create independent record', class: 'h-btn h-child-independent',
          onClick: () => { if (check.checked) { choice = 'independent'; dialog.close(); } } },
        { label: 'Find or create parent record', onClick: () => { choice = 'parent'; dialog.close(); } },
        { label: 'Cancel', onClick: () => dialog.close() }
      ]
    });
    const independent = dialog.querySelector('.h-child-independent');
    independent.disabled = true;
    check.addEventListener('change', () => { independent.disabled = !check.checked; });
    dialog.addEventListener('close', () => resolve(choice), { once: true });
  });
}

/** Choose explicitly when a parent type has several eligible forward fields. */
export function chooseParentField(dbdefs, links) {
  if (links.length === 1) return Promise.resolve(links[0]);
  const select = document.createElement('select');
  select.className = 'h-select';

  for (const link of links) {
    const option = document.createElement('option');
    option.value = String(link.fieldId);
    option.textContent = dbdefs.fieldName(link.parentRectypeId, link.fieldId);
    select.append(option);
  }

  return new Promise((resolve) => {
    let result = null;
    const dialog = HMsg.showMsgDlg(select, {
      dialogId: 'h-parent-field', title: 'Select parent field', buttons: [
        { label: 'Select', onClick: () => { result = links.find((link) => link.fieldId === Number(select.value)); dialog.close(); } },
        { label: 'Cancel', onClick: () => dialog.close() }
      ]
    });
    dialog.addEventListener('close', () => resolve(result), { once: true });
  });
}
