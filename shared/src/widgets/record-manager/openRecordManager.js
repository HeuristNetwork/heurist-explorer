/**
 * @file openRecordManager.js
 * @brief HRecordManager in a dialog (plan 21 §3): the Browse popup of pointer
 *        fields. Select takes the last selected record (`select`) or all
 *        selected (`select_multi`); Cancel, Escape and the close button give null.
 *        The relations mode (plan 24) has Close only and gives `{changed}`; its
 *        "Find or Add" opens another manager of the other types in `select_multi`.
 *        A session (createRecordManagerSession, 2026-11-03) keeps one manager for the
 *        Browse of one field: opened again it keeps its filter and page, until destroyed.
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
import { HRecordManager } from './HRecordManager.js';

/** Id prefix of the manager dialogs: each has its own (it opens over a record editor). */
const DIALOG_ID = 'h-record-manager-dialog';

/** Dialogs opened (unique ids). */
let dialogCount = 0;

/**
 * Open the record manager in a dialog.
 *
 * @param {object} options HRecordManager options (`apiClient`, `dbdefs`, `selectMode`,
 *        `recordTypes`, `addRecord`...) plus `title` (dialog title; default from the types).
 * @returns {Promise<number[]|null|{changed: boolean}>} Selected record ids (select modes), `[]` after
 *          `manager` mode, `{changed}` after `relations` mode, null when cancelled.
 */
export function openRecordManager(options = {}) {
  const host = managerHost();
  const relations = options.selectMode === 'relations';
  // "Find or Add" of the relations mode: the same services, another mode and types
  const browseRecords = relations && typeof options.browseRecords !== 'function'
    ? (browse) => openRecordManager({ ...options, relations: null, browseRecords: undefined, title: undefined, ...browse })
    : options.browseRecords;
  const manager = new HRecordManager().attach(host, { ...options, browseRecords });
  return showManager(host, manager, options, { dialogId: `${DIALOG_ID}-${++dialogCount}`, render: true, keep: false });
}

/**
 * One record manager for the Browse of one field (select modes): made and loaded on the first open; each open shows
 * it again as it was (filter, search, page; no new search), the selection cleared; after an Add the list is loaded again.
 * Closing the dialog keeps it; destroy() removes it (the field or input is destroyed: the edit form closes).
 *
 * @param {object} options openRecordManager options (not the relations mode).
 * @returns {{open: () => Promise<number[]|null>, destroy: () => Promise<void>}}
 */
export function createRecordManagerSession(options = {}) {
  const dialogId = `${DIALOG_ID}-${++dialogCount}`;
  let host = null;
  let manager = null;
  let destroyed = false;
  return {
    async open() {
      if (destroyed) return null;
      const first = !manager;
      if (first) {
        host = managerHost();
        manager = new HRecordManager().attach(host, options);
      } else {
        // the list as it was (page, filter, search): no new search, unless a record was added in it (Add finishes
        // the select modes before the list is loaded again)
        await manager.clearSelection();
        if (manager.stale) {
          manager.stale = false;
          void manager.reload().catch((error) => HMsg.showMsgErr?.(error?.message || String(error)));
        }
      }
      return showManager(host, manager, options, { dialogId, render: first, keep: true });
    },
    async destroy() {
      destroyed = true;
      HMsg.closeMsgDlg(dialogId);
      await manager?.destroy();
      manager = null;
      host = null;
    }
  };
}

function managerHost() {
  const host = document.createElement('div');
  host.className = 'h-record-manager-host';
  return host;
}

/**
 * The manager in its dialog until Select / Cancel / Close.
 *
 * @param {HTMLElement} host
 * @param {HRecordManager} manager
 * @param {object} options
 * @param {{dialogId: string, render: boolean, keep: boolean}} how `render`: load it first; `keep`: not destroyed at the end.
 */
function showManager(host, manager, options, { dialogId, render, keep }) {
  const relations = options.selectMode === 'relations';
  const selecting = manager.isSelectMode();
  const closed = () => (relations ? { changed: manager.changed } : selecting ? null : []);

  return new Promise((resolve) => {
    let settled = false;
    let dialog = null;
    const listeners = [];
    const on = (type, handler) => {
      host.addEventListener(type, handler);
      listeners.push([type, handler]);
    };
    const finish = async (ids) => {
      if (settled) return;
      settled = true;
      dialog?.removeEventListener('close', onDialogClose);
      for (const [type, handler] of listeners) host.removeEventListener(type, handler);
      HMsg.closeMsgDlg(dialogId);
      if (!keep) await manager.destroy();
      resolve(ids);
    };
    // a close event of this dialog shown before (a session) is not this one's
    const onDialogClose = () => {
      if (!dialog?.open) void finish(closed());
    };
    const buttons = selecting
      ? [
        { label: $HR('Select'), class: 'h-btn h-btn-primary', onClick: () => manager.select() },
        { label: $HR('Cancel'), class: 'h-btn', onClick: () => void finish(null) }
      ]
      : [{ label: $HR('Close'), class: 'h-btn', onClick: () => void finish(closed()) }];
    on('h-record-manager-finish', (event) => void finish(event.detail.ids));
    on('h-record-manager-selection', (event) => syncSelect(dialog, event.detail.ids));
    on('h-record-manager-error', (event) => {
      HMsg.showMsgErr?.(event.detail.error?.message || String(event.detail.error));
    });
    dialog = HMsg.showMsgDlg(host, { dialogId, title: options.title || managerTitle(options), buttons });
    dialog?.classList.add('h-dialog-record-manager');
    dialog?.addEventListener('close', onDialogClose);
    syncSelect(dialog, manager.getSelection());
    if (render) {
      manager.render().catch((error) => {
        HMsg.showMsgErr?.(error?.message || String(error));
        void finish(closed());
      });
    }
  });
}

/** Select is enabled with a selection. */
function syncSelect(dialog, ids) {
  const button = dialog?.querySelector('.h-dialog-footer .h-btn-primary');
  if (button) button.disabled = !(ids || []).length;
}

/** Dialog title: "Select <type>" for one type, else "Select record" / "Records". */
function managerTitle({ selectMode = 'select', recordTypes = [], dbdefs = null } = {}) {
  const types = (recordTypes || []).map(Number).filter((id) => id > 0);
  const manager = selectMode === 'manager' || selectMode === 'relations';
  if (types.length === 1) {
    const name = dbdefs?.rectypeName?.(types[0], { plural: manager }) || '';
    if (name) return manager ? name : `${$HR('Select')} ${name}`;
  }
  return manager ? $HR('Records') : $HR('Select record');
}
