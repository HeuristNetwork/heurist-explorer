/**
 * @file HeuristApiError.js
 * @brief Structured error used for network, HTTP, validation, and response parsing failures.
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

/** Error returned by the Heurist public API client. */
export class HeuristApiError extends Error {
  /**
   * @param {string} message Human-readable error message.
   * @param {object} [options] Additional error context.
   * @param {number|null} [options.status] HTTP status code, when the failure followed a response.
   * @param {string|null} [options.statusText] HTTP status text.
   * @param {string|null} [options.url] Request URL that failed.
   * @param {string|null} [options.method] HTTP method used for the request.
   * @param {*} [options.code] Server-reported error code, when available.
   * @param {*} [options.details] Raw response payload or parsing details.
   * @param {Error} [options.cause] Underlying error that triggered this failure.
   */
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'HeuristApiError';
    this.status = options.status ?? null;
    this.statusText = options.statusText ?? null;
    this.url = options.url ?? null;
    this.method = options.method ?? null;
    this.code = options.code ?? null;
    this.details = options.details ?? null;
  }
}
