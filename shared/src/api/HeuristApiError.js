/**
 * HeuristApiError.js - Heurist API error type
 *
 * @fileOverview Defines the structured error used for network, HTTP, validation, and response parsing failures.
 * @project     Heurist academic knowledge management system
 * @package     client-core.api
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

/**
 * Error returned by the Heurist public API client.
 */
export class HeuristApiError extends Error {
  /**
   * Create and initialize the class instance.
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
