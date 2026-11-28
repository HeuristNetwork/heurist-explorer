/**
 * @file openRecordAddDialog.js
 * @brief Add record dialog (plan 21 §6, port of legacy `recordAdd.js`): the record
 *        type of a new record (value picker over the allowed types, grouped by
 *        record type group) and its owner and visibility (HRecordAccess). Used for
 *        pointer fields without a type constraint. The choices are remembered for the
 *        next new record (`recordAccess.js`). *Add these tags* comes with user tags.
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
import { HValueCombo } from '../picker/HValueCombo.js';
import { RectypeSource } from '../../data/valueSources/localSources.js';
import { userDataRecordTypeIds } from '../../data/recordDomains.js';
import { loadRecordAddDefaults, saveRecordAddDefaults } from '../../data/recordAccess.js';
import { HRecordAccess } from './HRecordAccess.js';
import './HRecordAccess.css';

/** Id prefix of the dialogs (it opens over a record editor or the record manager). */
const DIALOG_ID = 'h-record-add-dialog';

let dialogCount = 0;

/**
 * The record types of the picker: the shared record type picker (27q3 §17.4) of the allowed types, grouped by their
 * record type group; the types without records are shown at first (the first record of a type is added here too).
 *
 * @param {object} dbdefs HDbDefs.
 * @param {number[]} types Allowed record type ids.
 * @returns {RectypeSource}
 */
export function recordTypeSource(dbdefs, types) {
  return new RectypeSource(dbdefs, { ids: types });
}

/**
 * Ask for the record type and the access of a new record.
 *
 * @param {object} options
 * @param {object} options.dbdefs HDbDefs (record types, users and groups).
 * @param {string} [options.database] Database name (remembered choices).
 * @param {number[]} [options.recordTypes] Allowed types; default: every user-data type.
 * @param {number} [options.rectypeId] Type selected first; default: the last added type.
 * @returns {Promise<{rectypeId: number, access: {owner: number, visibility: string, viewGroups: number[]}}|null>}
 *          The choice, or null when cancelled.
 */
export function openRecordAddDialog({ dbdefs, database = '', recordTypes = null, rectypeId = 0 } = {}) {
  const who = { database, userId: Number(dbdefs?.currentUserId?.()) || 0 };
  const defaults = loadRecordAddDefaults(who);
  const types = (recordTypes?.length ? recordTypes : userDataRecordTypeIds(dbdefs)).map(Number);
  const dialogId = `${DIALOG_ID}-${++dialogCount}`;

  const host = document.createElement('div');
  host.className = 'h-record-add';
  const typeSection = document.createElement('div');
  typeSection.className = 'h-record-access-section';
  const caption = document.createElement('div');
  caption.className = 'h-record-access-caption h-i18n';
  caption.textContent = $HR('Type of record to add:');
  const typeHost = document.createElement('div');
  typeHost.className = 'h-record-access-picker';
  typeSection.append(caption, typeHost);
  const accessHost = document.createElement('div');
  host.append(typeSection, accessHost);

  const initialType = [Number(rectypeId), defaults.rectypeId].find((id) => id > 0 && types.includes(id)) ?? null;
  let addButton = null;
  const typeCombo = new HValueCombo().attach(typeHost, {
    source: recordTypeSource(dbdefs, types),
    multiple: false,
    value: initialType,
    emptyLabel: $HR('Select record type…'),
    onChange: () => syncAdd()
  }).render();
  const access = new HRecordAccess().attach(accessHost, { dbdefs, value: defaults }).render();
  const syncAdd = () => {
    if (addButton) addButton.disabled = !(Number(typeCombo.getValue()) > 0);
  };

  return new Promise((resolve) => {
    let settled = false;
    let dialog = null;
    const finish = async (result) => {
      if (settled) return;
      settled = true;
      dialog?.removeEventListener('close', onDialogClose);
      HMsg.closeMsgDlg(dialogId);
      await typeCombo.destroy();
      await access.destroy();
      resolve(result);
    };
    const onDialogClose = () => void finish(null);
    const add = () => {
      const rectypeId = Number(typeCombo.getValue()) || 0;
      if (!(rectypeId > 0)) return;
      const header = access.getValue();
      const value = { owner: header.owner, visibility: header.visibility, viewGroups: header.viewGroups };
      saveRecordAddDefaults(who, { ...value, rectypeId });
      void finish({ rectypeId, access: value });
    };
    dialog = HMsg.showMsgDlg(host, {
      dialogId,
      title: $HR('Add record'),
      buttons: [
        { label: $HR('Add record'), class: 'h-btn h-btn-primary', onClick: add },
        { label: $HR('Cancel'), class: 'h-btn', onClick: () => void finish(null) }
      ]
    });
    dialog?.classList.add('h-dialog-record-add');
    dialog?.addEventListener('close', onDialogClose);
    addButton = dialog?.querySelector('.h-dialog-footer .h-btn-primary') || null;
    syncAdd();
  });
}
