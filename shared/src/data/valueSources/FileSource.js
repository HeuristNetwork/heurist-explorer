/**
 * @file FileSource.js
 * @brief Registered files as picker values, from `GET /files` (plan 20, Phase 1).
 *
 * The same loading as `RecordTitleSource` on the files domain: the first page
 * by title, then each filter text is a title search on the server. Items keep
 * the thumbnail URL and the external URL of the file, for previews.
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

import { RecordTitleSource } from './FieldValueSource.js';

/** Output fields of a file in the picker. */
const FILE_FIELDS = 'rec_ID,rec_Title,rec_URL,rec_Hash,rec_ThumbnailURL';

/** Registered files, as `{value: file id, label: title, thumbnail, url, key}`. */
export class FileSource extends RecordTitleSource {
  /**
   * @param {object} api HeuristApiClient (needs `get`).
   * @param {{limit?: number, query?: Array<object>}} [options] Page size; predicates added
   *        to every load (e.g. `[{'f:29': 'image/*'}]` for images only).
   */
  constructor(api, { limit = 200, query = [] } = {}) {
    super(api, { limit, path: '/files', query, fields: FILE_FIELDS });
    this._files = new Map();
  }

  /**
   * The file seen before (in a load or fetchLabels), else null.
   *
   * @param {number|string} value File id.
   * @returns {{id: number, title: string, thumbnail: string|null, url: string|null, key: string|null}|null}
   */
  fileFor(value) {
    return this._files.get(String(value)) || null;
  }

  /** @returns {object|null} Picker item for one file record (remembers its title and links). */
  _item(row) {
    const item = super._item(row);
    if (!item) return null;
    const file = {
      id: item.value,
      title: item.label,
      thumbnail: row?.rec_ThumbnailURL || null,
      url: row?.rec_URL || null,
      key: row?.rec_Hash || null
    };
    this._files.set(String(item.value), file);
    return { ...item, thumbnail: file.thumbnail, url: file.url, key: file.key };
  }
}
