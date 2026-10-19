/**
 * @file HInputFile.js
 * @brief File field input (plan 20, Phase 2): the chosen registered file with
 *        its thumbnail, a picker of registered files (`GET /files`), upload of a
 *        new file in chunks (button, drag and drop, paste) with progress and
 *        Cancel, registration of an external URL, and the host's file editor.
 *        One input for every edit form; the value is the file id.
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

import { HInput } from './HInput.js';
import { HValueCombo } from '../../picker/HValueCombo.js';
import { FileSource } from '../../../data/valueSources/FileSource.js';
import { FileUploader } from '../../../data/FileUploader.js';
import { HMsg } from '../../../ui/HMsg.js';
import { $HR } from '../../../ui/i18n/HResource.js';
import './HInputFile.css';

/** Edits a registered file id (ulf_ID). */
export class HInputFile extends HInput {
  /**
   * @param {HTMLElement} container Input host.
   * @param {object} options HInput options plus:
   * @param {object} [options.file] Resolved file of the value (`{ulf_ID, ulf_OrigFileName, ulf_ObfuscatedFileID,
   *        ulf_ExternalFileReference, fxm_MimeType}`, as `/records?resolveDetails=1`).
   * @param {Function} [options.fileUrl] `(file) → url` to view a file (none: the `/files/{key}/content` link).
   * @param {object} [options.apiClient] HeuristApiClient: picker, upload, registration (none: no picker, no upload).
   * @param {Function} [options.editFile] Host editor of the file metadata: `(id) → Promise<{saved, record}>`.
   * @param {Array<object>} [options.fileQuery] Predicates of the picker (e.g. `[{'f:29': 'image/*'}]`).
   * @param {object} [options.source] Value source of the picker (default FileSource).
   * @param {object} [options.uploader] FileUploader (tests).
   * @param {Function} [options.confirmDuplicate] `(ids) → Promise<'existing'|'upload'|null>` when the uploaded
   *        content is registered already (default: a dialog).
   * @param {Function} [options.askUrl] `() → Promise<string|null>` the URL to register (default: a dialog).
   * @returns {HInputFile} This input.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.file = options.file || null;
    const api = options.apiClient || null;
    this.source = options.source || (api ? new FileSource(api, { query: options.fileQuery || [] }) : null);
    this.uploader = options.uploader || (api?.upload ? new FileUploader(api) : null);
    if (this.file && this.value) {
      this.source?.rememberLabel?.(this.value, fileName(this.file));
    }
    this._busy = null;
    return this;
  }

  /**
   * Create the thumbnail, the picker (or the file name), the progress bar and the buttons.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLElement} Picker button (or the file link).
   */
  renderControl(host) {
    this.container.classList.add('h-form-input-compact');
    const group = document.createElement('div');
    group.className = 'h-input-file';
    this.thumb = document.createElement('img');
    this.thumb.className = 'h-input-file-thumb';
    this.thumb.alt = '';
    this.thumb.hidden = true;
    this.summary = document.createElement('a');
    this.summary.className = 'h-input-file-name';
    this.summary.target = '_blank';
    this.summary.rel = 'noopener';
    group.append(this.thumb);
    let control = this.summary;
    if (this.source) {
      const comboHost = document.createElement('div');
      comboHost.className = 'h-input-file-picker';
      group.append(comboHost);
      this.combo = new HValueCombo().attach(comboHost, {
        source: this.source,
        multiple: false,
        value: this.value,
        emptyLabel: $HR('Select file…'),
        onChange: (value) => {
          this.value = value ?? null;
          this.file = this.value ? this._pickedFile(this.value) : null;
          this._renderSummary();
          this.notifyChange();
        }
      }).render();
      control = this.combo.button;
    }
    group.append(this.summary);
    this.progress = document.createElement('progress');
    this.progress.className = 'h-input-file-progress';
    this.progress.max = 1;
    this.progress.hidden = true;
    group.append(this.progress);
    this._renderActions(group);
    host.append(group);
    this._bindDrop(group);
    this._renderSummary();
    if (this.value != null && this.source && !this.source.labelFor?.(this.value)) {
      void this.source.fetchLabels?.([this.value]).then(() => this.combo?.setValue(this.value));
    }
    return control;
  }

  /** @returns {number|null} File id. */
  getValue() {
    const value = this.combo ? this.combo.getValue() : this.value;
    return Number(value) > 0 ? Number(value) : null;
  }

  /**
   * Set a file id.
   *
   * @param {number|string|null} value File id.
   * @param {object} [file] Its resolved file (legacy form, see attach).
   * @returns {HInputFile} This input.
   */
  setValue(value, file) {
    super.setValue(Number(value) > 0 ? Number(value) : null);
    if (file !== undefined) this.file = file;
    if (this.value === null) this.file = null;
    if (this.value && this.file) this.source?.rememberLabel?.(this.value, fileName(this.file));
    this.combo?.setValue(this.value);
    this._renderSummary();
    return this;
  }

  /** Disable or enable the picker and the buttons. */
  setReadOnly(readOnly) {
    this._readOnly = Boolean(readOnly);
    this.combo?.setReadOnly(readOnly);
    this._syncActions();
    return this;
  }

  /** @returns {string[]} Validation errors (none while an upload runs: it is reported by its own message). */
  validate() {
    if (this._busy) return [$HR('The file is still being uploaded')];
    return super.validate();
  }

  /** @returns {Promise<void>} Completion after the picker is removed and a running upload cancelled. */
  async destroy() {
    this._busy?.abort();
    await this.combo?.destroy();
    await super.destroy();
  }

  /**
   * Upload a file (also used by drop and paste): chunks with progress, then the duplicates
   * question, then the registration; the new file becomes the value.
   *
   * @param {File} file File to upload.
   * @returns {Promise<number|null>} The file id, or null when cancelled or failed.
   */
  async uploadFile(file) {
    if (!this.uploader || this._readOnly || this._busy || !file) return null;
    const controller = new AbortController();
    this._busy = controller;
    this._syncActions();
    this._showProgress(0);
    try {
      const upload = await this.uploader.upload(file, {
        signal: controller.signal,
        onProgress: (sent, total) => this._showProgress(total > 0 ? sent / total : 0)
      });
      if (upload.duplicates?.length) {
        const choice = await (this.options.confirmDuplicate || confirmDuplicateDialog)(upload.duplicates, file.name);
        if (choice !== 'upload') {
          await this.uploader.cancel(upload.token).catch(() => {});
          if (choice === 'existing') this._choose(upload.duplicates[0]);
          return choice === 'existing' ? upload.duplicates[0] : null;
        }
      }
      const record = await this.uploader.register(upload.token);
      this._chooseRecord(record);
      return Number(record.rec_ID);
    } catch (error) {
      if (error?.name !== 'AbortError') this._error(error);
      return null;
    } finally {
      this._busy = null;
      this._showProgress(null);
      this._syncActions();
    }
  }

  /**
   * Register an external URL and choose it (an already registered URL gives its file).
   *
   * @param {string} url http(s) address.
   * @returns {Promise<number|null>} The file id.
   */
  async registerUrl(url) {
    const address = String(url || '').trim();
    if (!this.uploader || !address) return null;
    try {
      const record = await this.uploader.registerUrl(address);
      this._chooseRecord(record);
      return Number(record.rec_ID);
    } catch (error) {
      this._error(error);
      return null;
    }
  }

  /** Upload, URL, Edit and Cancel buttons (Upload and URL only with an API client). */
  _renderActions(group) {
    const actions = document.createElement('span');
    actions.className = 'h-input-file-actions';
    const make = (icon, title, run) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'h-input-file-action';
      button.title = $HR(title);
      button.setAttribute('aria-label', button.title);
      const glyph = document.createElement('i');
      glyph.className = `fa-solid ${icon}`;
      glyph.setAttribute('aria-hidden', 'true');
      button.append(glyph);
      this.listen(button, 'click', () => void run());
      actions.append(button);
      return button;
    };
    if (this.uploader) {
      this.chooser = document.createElement('input');
      this.chooser.type = 'file';
      this.chooser.hidden = true;
      this.listen(this.chooser, 'change', () => {
        const file = this.chooser.files?.[0];
        this.chooser.value = '';
        if (file) void this.uploadFile(file);
      });
      actions.append(this.chooser);
      this.uploadButton = make('fa-upload', 'Upload a file', () => this.chooser.click());
      this.urlButton = make('fa-link', 'Register a URL', () => this._askUrl());
    }
    this.editButton = typeof this.options.editFile === 'function'
      ? make('fa-pen', 'Edit file details', () => this._edit()) : null;
    this.cancelButton = make('fa-xmark', 'Cancel the upload', () => this._busy?.abort());
    group.append(actions);
    this._syncActions();
  }

  /** Drag and drop a file on the input, or paste one, to upload it. */
  _bindDrop(group) {
    if (!this.uploader) return;
    this.listen(group, 'dragover', (event) => {
      if (this._readOnly || !hasFiles(event)) return;
      event.preventDefault();
      group.classList.add('h-input-file-drop');
    });
    this.listen(group, 'dragleave', () => group.classList.remove('h-input-file-drop'));
    this.listen(group, 'drop', (event) => {
      group.classList.remove('h-input-file-drop');
      const file = event.dataTransfer?.files?.[0];
      if (!file || this._readOnly) return;
      event.preventDefault();
      void this.uploadFile(file);
    });
    this.listen(group, 'paste', (event) => {
      const file = [...(event.clipboardData?.files || [])][0];
      if (!file || this._readOnly) return;
      event.preventDefault();
      void this.uploadFile(file);
    });
  }

  async _askUrl() {
    const ask = this.options.askUrl || askUrlDialog;
    const url = await ask();
    if (url) await this.registerUrl(url);
  }

  /** Open the file in the host editor; show its new title after a save. */
  async _edit() {
    const id = this.getValue();
    if (!id) return;
    const result = await this.options.editFile(id);
    if (result?.saved && result.record) this._chooseRecord(result.record);
  }

  /** Choose a registered file given as a file record (`/files` output). */
  _chooseRecord(record) {
    const id = Number(record?.rec_ID);
    if (!(id > 0)) return;
    const file = {
      ulf_ID: id,
      ulf_OrigFileName: String(record.rec_Title || ''),
      ulf_ObfuscatedFileID: record.rec_Hash || null,
      ulf_ExternalFileReference: record.rec_URL || null,
      thumbnail: record.rec_ThumbnailURL || null
    };
    this.source?.rememberLabel?.(id, file.ulf_OrigFileName || `#${id}`);
    this.value = id;
    this.file = file;
    this.combo?.setValue(id);
    this._renderSummary();
    this.notifyChange();
  }

  /** Choose a file by id only (its title is fetched). */
  _choose(id) {
    this.value = Number(id);
    this.file = this._pickedFile(id);
    void this.source?.fetchLabels?.([id]).then(() => {
      this.file = this._pickedFile(id);
      this.combo?.setValue(this.value);
      this._renderSummary();
    });
    this.combo?.setValue(this.value);
    this._renderSummary();
    this.notifyChange();
  }

  /** File (legacy form) of a picked id, from what the picker knows. */
  _pickedFile(id) {
    const picked = this.source?.fileFor?.(id);
    if (!picked) return null;
    return {
      ulf_ID: Number(id),
      ulf_OrigFileName: picked.title,
      ulf_ObfuscatedFileID: picked.key,
      ulf_ExternalFileReference: picked.url,
      thumbnail: picked.thumbnail
    };
  }

  /** Thumbnail and the link to view the file. */
  _renderSummary() {
    if (!this.summary) return;
    const file = this.value ? this.file : null;
    const url = file ? this._fileUrl(file) : '';
    // with a picker the name is shown there; the link is a small "open" icon
    this.summary.replaceChildren();
    this.summary.hidden = !url && !(file && !this.combo);
    if (url) this.summary.href = url;
    else this.summary.removeAttribute('href');
    if (!url && file && !this.combo) {
      this.summary.textContent = fileName(file);
    } else if (url) {
      if (this.combo) {
        const glyph = document.createElement('i');
        glyph.className = 'fa-solid fa-arrow-up-right-from-square';
        glyph.setAttribute('aria-hidden', 'true');
        this.summary.title = $HR('Open the file');
        this.summary.append(glyph);
      } else {
        this.summary.textContent = fileName(file);
      }
    }
    const thumb = file ? this._thumbUrl(file) : '';
    this.thumb.hidden = !thumb;
    if (thumb) this.thumb.src = thumb;
    else this.thumb.removeAttribute('src');
    this._syncActions();
  }

  /** Link to view a file: the host's, else `/files/{key}/content`, else the external URL. */
  _fileUrl(file) {
    if (typeof this.options.fileUrl === 'function') {
      const url = this.options.fileUrl(file);
      if (url) return url;
    }
    const key = String(file.ulf_ObfuscatedFileID || '').replace(/[^a-z0-9]/gi, '');
    if (key && this.options.apiClient?.buildUrl) return this.options.apiClient.buildUrl(`/files/${key}/content`);
    return file.ulf_ExternalFileReference || '';
  }

  /** Thumbnail of a file: the one given, else `/files/{key}/thumbnail` of images and media. */
  _thumbUrl(file) {
    if (file.thumbnail) return file.thumbnail;
    const key = String(file.ulf_ObfuscatedFileID || '').replace(/[^a-z0-9]/gi, '');
    const mime = String(file.fxm_MimeType || '').toLowerCase();
    const media = mime.startsWith('image/') || ['video/youtube', 'video/vimeo', 'audio/soundcloud'].includes(mime);
    if (!key || !media || !this.options.apiClient?.buildUrl) return '';
    return this.options.apiClient.buildUrl(`/files/${key}/thumbnail`);
  }

  _showProgress(fraction) {
    if (!this.progress) return;
    this.progress.hidden = fraction === null;
    if (fraction !== null) this.progress.value = Math.max(0, Math.min(1, fraction));
  }

  _error(error) {
    const message = error?.details?.message || error?.message || String(error);
    if (typeof this.options.onError === 'function') this.options.onError(message);
    else HMsg.showMsgErr?.(message);
    this.setNote?.(message);
  }

  /** Buttons by state: Cancel only while uploading; no changes in read-only mode. */
  _syncActions() {
    const busy = Boolean(this._busy);
    const locked = this._readOnly === true;
    if (this.uploadButton) this.uploadButton.hidden = busy || locked;
    if (this.urlButton) this.urlButton.hidden = busy || locked;
    if (this.editButton) this.editButton.hidden = busy || locked || !(this.getValue() > 0);
    if (this.cancelButton) this.cancelButton.hidden = !busy;
    this.combo?.setReadOnly(locked || busy);
  }
}

/** Name of a file (legacy form): the original name, else the URL. */
function fileName(file) {
  const name = String(file?.ulf_OrigFileName || '');
  return name && !name.startsWith('_') ? name : String(file?.ulf_ExternalFileReference || name);
}

function hasFiles(event) {
  return [...(event.dataTransfer?.types || [])].includes('Files');
}

/** Default question when the uploaded content is registered already. */
function confirmDuplicateDialog(ids, name) {
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
async function askUrlDialog() {
  const { openEditFormDialog } = await import('../../edit-form/editFormDialog.js');
  const values = await openEditFormDialog({
    title: 'Register a URL',
    okLabel: 'Register',
    form: { groups: [{ id: 'url', type: 'group', children: [
      { name: 'url', type: 'freetext', label: 'URL of the file or resource', req: 'required', width: 50 }
    ] }] }
  });
  return values?.url ? String(values.url).trim() : null;
}
