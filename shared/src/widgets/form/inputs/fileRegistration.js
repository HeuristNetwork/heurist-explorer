/**
 * @file fileRegistration.js
 * @brief Registration of new files (plan 20): the questions of the file input (duplicates,
 *        URL) and `registerNewFile`, the Add buttons of the registered files' record manager:
 *        upload and register a file, upload a tile stack, or register an external resource.
 *
 *   const result = await registerNewFile('upload', { apiClient, dbdefs }); // {saved, recordId}
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

import { FileUploader } from '../../../data/FileUploader.js';
import { HMsg } from '../../../ui/HMsg.js';
import { $HR } from '../../../ui/i18n/HResource.js';

/** Files of a tile stack: a zip of tiles or an MBTiles database. */
const TILE_STACK_ACCEPT = '.zip,.mbtiles';

let progressCount = 0;

/**
 * Register a new file: `upload` (a file of the computer), `tiled` (a tile stack, zip or
 * mbtiles) or `url` (an external resource; IIIF manifests and image services are recognised
 * by the server).
 *
 * @param {'upload'|'tiled'|'url'} kind What to register.
 * @param {{apiClient: object, dbdefs?: object, uploader?: object, chooseFile?: Function, askUrl?: Function,
 *          confirmDuplicate?: Function, progress?: Function}} services API client; the questions and the
 *        progress dialog (tests).
 * @returns {Promise<{saved: boolean, recordId: number}>} The registered file (or the registered one of the
 *          same content / URL); `saved: false` when cancelled.
 */
export async function registerNewFile(kind, { apiClient, dbdefs = null, uploader = null, chooseFile = chooseLocalFile,
  askUrl = askUrlDialog, confirmDuplicate = confirmDuplicateDialog, progress: openProgress = showProgress } = {}) {
  const files = uploader || new FileUploader(apiClient);
  if (kind === 'url') {
    const url = await askUrl();
    if (!url) return { saved: false, recordId: 0 };
    const record = await files.registerUrl(url);
    if (record.meta?.existing) HMsg.showMsgFlash?.(`${$HR('This URL is registered already')}: #${record.rec_ID}`);
    return { saved: true, recordId: Number(record.rec_ID) || 0 };
  }
  const file = await chooseFile(kind === 'tiled' ? TILE_STACK_ACCEPT : '');
  if (!file) return { saved: false, recordId: 0 };
  const progress = openProgress(file.name);
  let upload;
  try {
    upload = await files.upload(file, { signal: progress.signal, onProgress: progress.update });
  } catch (error) {
    if (error?.name === 'AbortError') return { saved: false, recordId: 0 };
    throw error;
  } finally {
    progress.close();
  }
  // a tile stack is placed as tiles: the same content as a registered file is not a reason to stop
  if (kind !== 'tiled' && upload.duplicates?.length) {
    const choice = await confirmDuplicate(upload.duplicates, file.name);
    if (choice !== 'upload') {
      await files.cancel(upload.token).catch(() => {});
      return choice === 'existing' ? { saved: true, recordId: Number(upload.duplicates[0]) } : { saved: false, recordId: 0 };
    }
  }
  const typeField = Number(dbdefs?.localId?.('dty', '2-1186')) || 0;
  const details = kind === 'tiled' && typeField ? { [typeField]: ['tiled'] } : {};
  const record = await files.register(upload.token, { details });
  return { saved: true, recordId: Number(record.rec_ID) || 0 };
}

/**
 * Let the user choose a file of the computer.
 *
 * @param {string} [accept] Accepted extensions (".zip,.mbtiles").
 * @returns {Promise<File|null>} The file, or null when none was chosen.
 */
export function chooseLocalFile(accept = '') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.hidden = true;
    input.addEventListener('change', () => {
      resolve(input.files?.[0] || null);
      input.remove();
    }, { once: true });
    // closed without a choice (browsers that support it)
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    }, { once: true });
    document.body.append(input);
    input.click();
  });
}

/** Default question when the uploaded content is registered already. */
export function confirmDuplicateDialog(ids, name) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value) => {
      if (answered) return;
      answered = true;
      resolve(value);
    };
    const dialog = HMsg.showMsgDlg(`${$HR('This file is registered already')} (${ids.map((id) => `#${id}`).join(', ')}): ${name}`, {
      title: 'Upload file',
      buttons: [
        { label: $HR('Use the registered file'), class: 'h-btn h-btn-primary', onClick: () => answer('existing') },
        { label: $HR('Upload anyway'), class: 'h-btn', onClick: () => answer('upload') },
        { label: $HR('Cancel'), class: 'h-btn', onClick: () => answer(null) }
      ]
    });
    dialog?.addEventListener('close', () => answer(null), { once: true });
  });
}

/** Default URL question: a small form (loaded when used: the edit form imports the inputs). */
export async function askUrlDialog() {
  const { openEditFormDialog } = await import('../../edit-form/editFormDialog.js');
  const values = await openEditFormDialog({
    title: 'Register a URL',
    okLabel: 'Register',
    form: { groups: [{ id: 'url', type: 'group', children: [
      {
        name: 'url', type: 'freetext', label: 'URL of the file or resource', req: 'required', width: 50,
        help: 'A file on the web, a YouTube / Vimeo / SoundCloud page, or a IIIF manifest or image service'
      }
    ] }] }
  });
  return values?.url ? String(values.url).trim() : null;
}

/** A dialog with the upload progress and Cancel. */
function showProgress(name) {
  const controller = new AbortController();
  const dialogId = `h-file-upload-progress-${++progressCount}`;
  const body = document.createElement('div');
  body.className = 'h-file-upload-progress';
  const text = document.createElement('div');
  text.textContent = `${$HR('Uploading')} ${name}`;
  const bar = document.createElement('progress');
  bar.max = 1;
  bar.value = 0;
  body.append(text, bar);
  let open = true;
  const dialog = HMsg.showMsgDlg(body, {
    dialogId,
    title: 'Upload file',
    buttons: [{ label: $HR('Cancel'), class: 'h-btn', onClick: () => controller.abort() }]
  });
  dialog?.addEventListener('close', () => {
    if (open) controller.abort();
  }, { once: true });
  return {
    signal: controller.signal,
    update: (sent, total) => { bar.value = total > 0 ? Math.min(1, sent / total) : 0; },
    close: () => {
      open = false;
      HMsg.closeMsgDlg(dialogId);
    }
  };
}
