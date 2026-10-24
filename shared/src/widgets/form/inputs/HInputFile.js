/**
 * @file HInputFile.js
 * @brief File field input (plan 20, Phase 2): the chosen registered file with
 *        its thumbnail, a picker of registered files (`GET /files`), upload of a
 *        new file in chunks (button, drag and drop, paste) with progress and
 *        Cancel, registration of an external URL, and the host's file editor.
 *        One input for every edit form; the value is the file id.
 *
 * Replace mode (`replace: true`, the content of a registered file in its own editor, plan 20
 * §10.11): the current file is shown; an upload is not registered, the value is its token,
 * which the editor sends with the save (`upload`) to replace the content.
 *
 * Entity-image mode (`entityImage: {client, id}`, a user or group, plan 20 Phase 4d): the one
 * image of the entity (UserGroupClient); an upload or Remove changes it at once; no value.
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
import { buildFileMediaItem, fileMediaUrls, isImageFile } from '../../../recordview/fileMediaItem.js';
import { formatFileSize } from '../../../data/systemEntities.js';
import { askUrlDialog, confirmDuplicateDialog } from './fileRegistration.js';
import { $HR } from '../../../ui/i18n/HResource.js';
import './HInputFile.css';

/** Edits a registered file id (ulf_ID). */
export class HInputFile extends HInput {
  /**
   * @param {HTMLElement} container Input host.
   * @param {object} options HInput options plus:
   * @param {object} [options.file] Resolved file of the value (`{ulf_ID, ulf_OrigFileName, ulf_ObfuscatedFileID,
   *        ulf_ExternalFileReference, fxm_MimeType}`, as `/records?resolveDetails=1`).
   * @param {object} [options.apiClient] HeuristApiClient: picker, upload, registration (none: no picker, no upload).
   * @param {Function} [options.editFile] Host editor of the file metadata: `(id) → Promise<{saved, record}>`.
   * @param {Array<object>} [options.fileQuery] Predicates of the picker (e.g. `[{'f:29': 'image/*'}]`).
   * @param {object} [options.source] Value source of the picker (default FileSource).
   * @param {object} [options.uploader] FileUploader (tests).
   * @param {Function} [options.confirmDuplicate] `(ids) → Promise<'existing'|'upload'|null>` when the uploaded
   *        content is registered already (default: a dialog).
   * @param {Function} [options.askUrl] `() → Promise<string|null>` the URL to register (default: a dialog).
   * @param {Function} [options.browseRecords] Host record manager (plan 21): with it and `fileRecordType`
   *        the file is chosen there (as a pointer field in `addorbrowse` mode), not in a value picker.
   * @param {number} [options.fileRecordType] Local id of RT_REGISTERED_FILE (the record manager's type).
   * @param {{baseUrl: string, database: string}} [options.fileViewer] Heurist base URL and database: a click
   *        on the thumbnail shows the file below the input (zoom, OSD, Mirador, Download, Close; the same
   *        media item as the built-in record view, fileMediaItem.js).
   * @param {boolean} [options.replace] Replace mode: `file` is the current content, the value is the
   *        token of a new upload (none: the content stays).
   * @param {{client: object, id: number}} [options.entityImage] Entity-image mode: the client of the
   *        entity (`image`, `putImage`, `removeImage`) and its id.
   * @returns {HInputFile} This input.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.replace = options.replace === true;
    this.entity = options.entityImage?.client && Number(options.entityImage.id) > 0 ? options.entityImage : null;
    this.file = options.file || null;
    this._pending = null;
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
    // the image of a user or group: a larger thumbnail (plan 24 review)
    if (this.entity) group.classList.add('is-entity-image');
    this.thumb = document.createElement('img');
    this.thumb.className = 'h-input-file-thumb';
    this.thumb.alt = '';
    this.thumb.hidden = true;
    if (this.options.fileViewer?.baseUrl) {
      // the thumbnail shows / hides the file below the input
      this.thumb.classList.add('is-zoomable');
      this.thumb.title = $HR('Show the file');
      this.listen(this.thumb, 'click', () => this.togglePreview());
    }
    group.append(this.thumb);
    // without a picker (no API client): the file name as text
    this.nameText = document.createElement('span');
    this.nameText.className = 'h-input-file-text';
    let control = this.nameText;
    if (this.replace || this.entity) {
      // the current file and, after an upload, the new one; or the entity image (no picker)
    } else if (this._canBrowse()) {
      // the record manager of registered files, as a pointer field in addorbrowse mode (plan 21)
      control = this._renderBrowseButton(group);
    } else if (this.source) {
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
    if (control === this.nameText) group.append(this.nameText);
    this.progress = document.createElement('progress');
    this.progress.className = 'h-input-file-progress';
    this.progress.max = 1;
    this.progress.hidden = true;
    group.append(this.progress);
    host.append(group);
    // after the control box (rst_DisplayWidth is the width of the thumbnail and the picker / button), as HInputResource
    this._renderActions((actions) => host.after(actions));
    // the file below the input (thumbnail click), hidden at start
    this.preview = document.createElement('div');
    this.preview.className = 'h-input-file-preview';
    this.preview.hidden = true;
    this.container.append(this.preview);
    this._bindDrop(group);
    this._renderSummary();
    if (this.value != null && this.source && !this.source.labelFor?.(this.value)) {
      void this.source.fetchLabels?.([this.value]).then(() => {
        this.combo?.setValue(this.value);
        this._syncBrowseText();
      });
    }
    return control;
  }

  /** @returns {boolean} Whether files are chosen in the host's record manager. */
  _canBrowse() {
    return typeof this.options.browseRecords === 'function' && Number(this.options.fileRecordType) > 0;
  }

  /** Select-like button with the file name; a click opens the record manager of files. */
  _renderBrowseButton(group) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'h-select h-input-file-browse';
    this.browseText = document.createElement('span');
    this.browseText.className = 'h-input-file-browse-text';
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-table h-input-file-browse-icon';
    icon.setAttribute('aria-hidden', 'true');
    button.append(this.browseText, icon);
    this.listen(button, 'click', () => void this._browse());
    this.browseButton = button;
    group.append(button);
    return button;
  }

  /** Choose a registered file in the record manager (Select). */
  async _browse() {
    if (this._readOnly || this._busy) return;
    const ids = await this.options.browseRecords({
      recordTypes: [Number(this.options.fileRecordType)],
      selectMode: 'select',
      // new files come from Upload / URL of this input
      allowAddition: false
    });
    const id = Number(ids?.[0]) || 0;
    if (id > 0 && id !== this.getValue()) this._choose(id);
  }

  /** The file name on the browse button. */
  _syncBrowseText() {
    if (!this.browseText) return;
    const id = this.getValue();
    const name = id ? (this.file ? fileName(this.file) : this.source?.labelFor?.(id) || `#${id}`) : '';
    this.browseText.textContent = name || $HR('Select file…');
    this.browseButton.title = name;
    this.browseButton.classList.toggle('is-empty', !name);
  }

  /** @returns {number|string|null} File id (replace mode: the token of the new content). */
  getValue() {
    if (this.entity) return null;
    if (this.replace) return this.value ? String(this.value) : null;
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
    if (this.replace) {
      super.setValue(value ? String(value) : null);
      if (!this.value) this._pending = null;
      this._renderSummary();
      return this;
    }
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
    this._markReadOnly(readOnly);
    this.combo?.setReadOnly(readOnly);
    if (this.browseButton) this.browseButton.disabled = this._readOnly;
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
    // a new content that was not saved: its upload goes (after a save the token is used: ignored)
    if (this.replace && this.value) this.uploader?.cancel(String(this.value)).catch(() => {});
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
      if (this.entity) {
        // the image of the entity changes at once
        this._setEntityImage(await this.entity.client.putImage(this.entity.id, upload.token));
        return upload.token;
      }
      if (this.replace) {
        // the save sends the token; a previous new content goes
        if (this.value) this.uploader.cancel(String(this.value)).catch(() => {});
        this.value = upload.token;
        this._pending = { name: file.name, size: Number(file.size) || 0 };
        this._renderSummary();
        this.notifyChange();
        return upload.token;
      }
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

  /** Upload, URL, Edit and Cancel buttons (Upload and URL only with an API client), placed by `place(element)`. */
  _renderActions(place) {
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
    this.editButton = typeof this.options.editFile === 'function' && !this.replace
      ? make('fa-pen', 'Edit file details', () => this._edit()) : null;
    // replace mode: keep the current content (the new upload goes)
    this.keepButton = this.replace ? make('fa-rotate-left', 'Keep the current file', () => this._keepCurrent()) : null;
    this.removeImageButton = this.entity ? make('fa-trash-can', 'Remove the image', () => this._removeEntityImage()) : null;
    if (this.entity) void this._loadEntityImage();
    this.cancelButton = make('fa-xmark', 'Cancel the upload', () => this._busy?.abort());
    place(actions);
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

  /** Replace mode: drop the new content (its upload is cancelled on the server). */
  _keepCurrent() {
    if (!this.value) return;
    this.uploader?.cancel(String(this.value)).catch(() => {});
    this.value = null;
    this._pending = null;
    this._renderSummary();
    this.notifyChange();
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

  /** Thumbnail, the file name (without a picker) and the open preview of the current file. */
  /** Entity-image mode: the image of the entity. */
  async _loadEntityImage() {
    try {
      this._setEntityImage(await this.entity.client.image(this.entity.id));
    } catch (error) {
      this._error(error);
    }
  }

  /** Entity-image mode: remove the image (at once). */
  async _removeEntityImage() {
    try {
      this._setEntityImage(await this.entity.client.removeImage(this.entity.id));
    } catch (error) {
      this._error(error);
    }
  }

  /** Entity-image mode: show an image (`{url, thumbnail}`) or none. */
  _setEntityImage(image) {
    this.entityImage = image || null;
    if (!this.thumb) return;
    this.thumb.hidden = !this.entityImage;
    // a new image under the same URL: no cached thumbnail
    if (this.entityImage) this.thumb.src = `${this.entityImage.thumbnail}&t=${Date.now()}`;
    else this.thumb.removeAttribute('src');
    if (this.nameText) this.nameText.textContent = this.entityImage ? '' : $HR('No image');
    this._syncActions();
  }

  _renderSummary() {
    if (this.entity) {
      this._syncActions();
      return;
    }
    if (!this.thumb) return;
    // replace mode: the current file is shown, the value is the new content
    const file = this.replace || this.value ? this.file : null;
    if (this.nameText) this.nameText.textContent = file ? fileName(file) : '';
    if (this.replace && this.nameText) {
      this.nameText.classList.toggle('is-pending', Boolean(this._pending));
      if (this._pending) {
        this.nameText.textContent = `${$HR('New file')}: ${this._pending.name} (${formatFileSize(this._pending.size)}) - `
          + $HR('replaces the current file on Save');
      }
    }
    // replace mode: no thumbnail (the file editor shows the file below the form)
    const thumb = file && !this.replace ? this._thumbUrl(file) : '';
    this.thumb.hidden = !thumb;
    if (thumb) this.thumb.src = thumb;
    else this.thumb.removeAttribute('src');
    // another file (or none): the preview shows it again on the next click
    if (this.preview && this._previewKey !== (file?.ulf_ObfuscatedFileID || null)) this.hidePreview();
    this._syncActions();
  }

  /** Show or hide the file below the input. */
  togglePreview() {
    if (this.preview?.hidden === false) this.hidePreview();
    else this.showPreview();
  }

  /**
   * Show the file below the input: the media item of the built-in record view with
   * Download and Close (fileMediaItem.js).
   *
   * @returns {boolean} Whether it is shown.
   */
  showPreview() {
    const file = this.replace || this.value ? this.file : null;
    const viewer = this.options.fileViewer;
    if (!this.preview || !file?.ulf_ObfuscatedFileID || !viewer?.baseUrl) return false;
    this.preview.replaceChildren(buildFileMediaItem(file, {
      urls: fileMediaUrls(viewer.baseUrl, viewer.database),
      onClose: () => this.hidePreview()
    }));
    this.preview.hidden = false;
    this._previewKey = file.ulf_ObfuscatedFileID;
    return true;
  }

  /** Hide the file below the input. */
  hidePreview() {
    if (!this.preview) return;
    this.preview.hidden = true;
    this.preview.replaceChildren();
    this._previewKey = null;
  }

  /** Thumbnail of a file: the one given, else `/files/{key}/thumbnail` of images and media. */
  _thumbUrl(file) {
    if (file.thumbnail) return file.thumbnail;
    const key = String(file.ulf_ObfuscatedFileID || '').replace(/[^a-z0-9]/gi, '');
    const mime = String(file.fxm_MimeType || '').toLowerCase();
    // an image by its MIME type, else by its name (a file picked in this session has no MIME type)
    const media = isImageFile(file) || ['video/youtube', 'video/vimeo', 'audio/soundcloud'].includes(mime);
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

  /**
   * Buttons by state: Cancel only while uploading; no changes in read-only mode; Upload and
   * URL only without a file (plan 21: clear the value to choose another way).
   */
  _syncActions() {
    const busy = Boolean(this._busy);
    const locked = this._readOnly === true;
    const chosen = this.getValue() > 0;
    // replace mode: Upload always (another new file), never URL
    if (this.uploadButton) this.uploadButton.hidden = busy || locked || (chosen && !this.replace);
    if (this.urlButton) this.urlButton.hidden = busy || locked || chosen || this.replace;
    if (this.keepButton) this.keepButton.hidden = busy || locked || !this.value;
    if (this.entity) {
      if (this.uploadButton) this.uploadButton.hidden = busy || locked;
      if (this.urlButton) this.urlButton.hidden = true;
      if (this.removeImageButton) this.removeImageButton.hidden = busy || locked || !this.entityImage;
    }
    if (this.editButton) this.editButton.hidden = busy || locked || !(this.getValue() > 0);
    if (this.cancelButton) this.cancelButton.hidden = !busy;
    this.combo?.setReadOnly(locked || busy);
    if (this.browseButton) this.browseButton.disabled = locked || busy;
    this._syncBrowseText();
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
