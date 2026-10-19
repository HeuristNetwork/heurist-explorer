/**
 * @file FileUploader.js
 * @brief Chunked upload and registration of files through `/files` (plan 20, Phase 2).
 *
 * `upload()` starts an upload (`POST /files/upload`), sends the file in chunks
 * (`PUT /files/upload/{token}` with Content-Range), resumes after a broken
 * connection (`GET /files/upload/{token}` gives the received size) and returns
 * the finished upload: token, MD5, type and the files with the same content
 * (`duplicates`). `register()` turns the token into a registered file
 * (`POST /files/0`); `registerUrl()` registers an external resource.
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

/** Header the server requires on chunks (a cross-site page cannot send it without a CORS preflight). */
export const UPLOAD_CLIENT_HEADER = { 'X-Heurist-Client': 'heurist-client' };

/** Uploads files in chunks and registers them. */
export class FileUploader {
  /**
   * @param {object} api HeuristApiClient (needs `request`, `upload`).
   * @param {{retries?: number, wait?: (ms: number) => Promise<void>}} [options] Retries of a failed chunk
   *        (network errors), wait function (tests).
   */
  constructor(api, { retries = 3, wait = defaultWait } = {}) {
    if (!api?.request || !api?.upload) throw new TypeError('FileUploader requires an API client with upload()');
    this.api = api;
    this.retries = Math.max(0, Number(retries) || 0);
    this.wait = wait;
  }

  /**
   * Upload a file.
   *
   * @param {Blob & {name?: string}} file File or blob (a blob needs `options.name`).
   * @param {object} [options] Upload options.
   * @param {string} [options.name] File name (default `file.name`).
   * @param {(sent: number, total: number) => void} [options.onProgress] Bytes sent so far.
   * @param {AbortSignal} [options.signal] Cancels the upload (also on the server).
   * @returns {Promise<{token: string, name: string, size: number, md5: string, mime: string, ext: string,
   *          thumbnail: boolean, duplicates: number[]}>} The finished upload.
   */
  async upload(file, { name = file?.name, onProgress, signal } = {}) {
    const size = Number(file?.size) || 0;
    const start = await this.api.request('/files/upload', {
      method: 'POST',
      body: { name: name || 'file', size, type: file?.type || '' },
      signal
    });
    const token = start.token;
    const chunkSize = Math.max(1, Number(start.chunkSize) || 5242880);
    let offset = Number(start.received) || 0;
    let status = start;
    let failures = 0;
    onProgress?.(offset, size);
    try {
      while (offset < size) {
        const end = Math.min(size, offset + chunkSize) - 1;
        const from = offset;
        try {
          status = await this.api.upload(`/files/upload/${encodeURIComponent(token)}`, file.slice(from, end + 1), {
            headers: { 'Content-Range': `bytes ${from}-${end}/${size}`, ...UPLOAD_CLIENT_HEADER },
            onProgress: (loaded) => onProgress?.(from + loaded, size),
            signal
          });
          offset = Number(status.received) || end + 1;
          failures = 0;
        } catch (error) {
          if (isAbort(error, signal)) throw error;
          if (error?.status === 409 && Number.isFinite(Number(error?.details?.received))) {
            offset = Number(error.details.received); // the server has another size: continue there
            continue;
          }
          if (error?.status || failures >= this.retries) throw error;
          failures += 1;
          await this.wait(1000 * failures);
          status = await this.api.request(`/files/upload/${encodeURIComponent(token)}`, { signal });
          offset = Number(status.received) || 0;
        }
        onProgress?.(offset, size);
      }
    } catch (error) {
      if (isAbort(error, signal)) this.cancel(token).catch(() => {});
      throw error;
    }
    return { duplicates: [], ...status, token };
  }

  /**
   * Cancel an upload on the server (its files are removed).
   *
   * @param {string} token Upload token.
   * @returns {Promise<void>}
   */
  async cancel(token) {
    await this.api.request(`/files/upload/${encodeURIComponent(token)}`, { method: 'DELETE' });
  }

  /**
   * Register a finished upload.
   *
   * @param {string} token Upload token.
   * @param {{details?: object, visibility?: string}} [fields] Field values by field id; rec_NonOwnerVisibility.
   * @returns {Promise<object>} The file record (`records[0]` of the response) with `meta` (issues).
   */
  async register(token, { details = {}, visibility = null } = {}) {
    const body = { upload: token, details };
    if (visibility) body.rec_NonOwnerVisibility = visibility;
    return fileRecord(await this.api.request('/files/0', { method: 'POST', body }));
  }

  /**
   * Register an external resource (an already registered URL gives its registration, meta.existing).
   *
   * @param {string} url http(s) address.
   * @param {{details?: object}} [fields] Field values by field id.
   * @returns {Promise<object>} The file record with `meta`.
   */
  async registerUrl(url, { details = {} } = {}) {
    return fileRecord(await this.api.request('/files/0', { method: 'POST', body: { rec_URL: url, details } }));
  }
}

/** @returns {object} The record of a write response, with the response meta. */
function fileRecord(payload) {
  const record = payload?.records?.[0];
  if (!record) throw new Error('The server did not return the file');
  return { ...record, meta: payload.meta || {} };
}

function isAbort(error, signal) {
  return error?.name === 'AbortError' || Boolean(signal?.aborted);
}

function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
