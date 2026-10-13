/**
 * @file HInputFile.js
 * @brief File field input: shows the file of the value (name, link to view it)
 *        and lets the user remove it or give the id of an uploaded file.
 *        Upload and browsing of files come with the file API (plan 14, later).
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
import { $HR } from '../../../ui/i18n/HResource.js';
import './HInputFile.css';

/** Edits an uploaded file id (ulf_ID). */
export class HInputFile extends HInput {
  /**
   * @param {HTMLElement} container Input host.
   * @param {object} options HInput options plus: `file` (resolved file info of the
   *        value: ulf_OrigFileName, ulf_ObfuscatedFileID, ulf_ExternalFileReference),
   *        `fileUrl(file)` (link to view a file; none: no link).
   * @returns {HInputFile} This input.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.file = options.file || null;
    return this;
  }

  /**
   * Create the file summary and the id box.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLInputElement} File id box.
   */
  renderControl(host) {
    const group = document.createElement('div');
    group.className = 'h-input-file';
    this.summary = document.createElement('span');
    this.summary.className = 'h-input-file-name';
    const control = document.createElement('input');
    control.className = 'h-input h-input-file-id';
    control.type = 'text';
    control.inputMode = 'numeric';
    control.placeholder = $HR('File ID');
    control.title = $HR('ID of an uploaded file');
    this.listen(control, 'change', () => {
      this.file = null; // another file: its name is not known here
      this._renderSummary();
      this.notifyChange();
    });
    group.append(this.summary, control);
    host.append(group);
    return control;
  }

  /** @returns {number|null} ulf_ID. */
  getValue() {
    const value = this.control ? this.control.value : this.value;
    return Number(value) > 0 ? Number(value) : null;
  }

  /**
   * Set a file id.
   *
   * @param {number|string|null} value ulf_ID.
   * @returns {HInputFile} This input.
   */
  setValue(value) {
    super.setValue(Number(value) > 0 ? Number(value) : null);
    if (this.value === null) this.file = null;
    if (this.control) this.control.value = this.value === null ? '' : String(this.value);
    this._renderSummary();
    return this;
  }

  /** @returns {string[]} Validation errors. */
  validate() {
    const text = String(this.control?.value ?? '').trim();
    if (text && !(Number(text) > 0)) return ['Enter the ID of an uploaded file'];
    return super.validate();
  }

  /** Show the file name, linked when a viewer URL is known. */
  _renderSummary() {
    if (!this.summary) return;
    this.summary.replaceChildren();
    const name = this.file?.ulf_OrigFileName || this.file?.ulf_ExternalFileReference || '';
    if (!name) return;
    const url = this.file && typeof this.options.fileUrl === 'function' ? this.options.fileUrl(this.file) : '';
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = name;
      this.summary.append(link);
    } else {
      this.summary.textContent = name;
    }
  }
}
