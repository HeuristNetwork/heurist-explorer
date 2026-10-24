/**
 * @file TranslationClient.js
 * @brief Machine translation of a text with DeepL through the legacy server translator
 *        (plan 25): `hserv/controller/usr_info.php?a=translate_string` (string, target,
 *        source; 3-letter language codes), as the legacy record editor. Whether the
 *        installation has a DeepL key: `meta.translator` of the definitions snapshot
 *        (HDbDefs#translator).
 *
 *   const translator = new TranslationClient({ baseUrl, database, available: dbdefs.translator() });
 *   if (translator.available) text = await translator.translate({ string: 'Hello', target: 'FRE' });
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

/** Translates texts with the legacy translator of the server. */
export class TranslationClient {
  /**
   * @param {object} options
   * @param {string} options.baseUrl Heurist base URL (the legacy controllers are below it).
   * @param {string} options.database Database name.
   * @param {boolean} [options.available=false] Whether DeepL is configured (HDbDefs#translator).
   * @param {Function} [options.fetchImpl] `fetch` (tests).
   */
  constructor({ baseUrl, database, available = false, fetchImpl = null } = {}) {
    const base = String(baseUrl ?? '').trim();
    this.baseUrl = base && !base.endsWith('/') ? `${base}/` : base;
    this.database = String(database ?? '');
    this._available = Boolean(available) && Boolean(this.baseUrl) && Boolean(this.database);
    this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
  }

  /** @returns {boolean} Whether texts can be translated. */
  get available() {
    return this._available;
  }

  /**
   * Translate a text.
   *
   * @param {{string: string, target: string, source?: string, signal?: AbortSignal}} request Text and
   *        3-letter language codes (`FRE`); without `source` DeepL detects the language.
   * @returns {Promise<string>} The translated text.
   * @throws {Error} Without a translator, or the server's message.
   */
  async translate({ string, target, source = '', signal = null } = {}) {
    if (!this.available) throw new Error('Automatic translation is not configured on this server');
    const body = new URLSearchParams({ a: 'translate_string', db: this.database, string: String(string ?? ''), target: String(target ?? '') });
    if (source) body.set('source', String(source));
    const response = await this.fetchImpl(`${this.baseUrl}hserv/controller/usr_info.php`, {
      method: 'POST',
      body,
      credentials: 'same-origin',
      signal
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`The translation failed (HTTP ${response.status})`);
    }
    if (payload?.status !== 'ok') throw new Error(payload?.message || payload?.status || 'The translation failed');
    return String(payload.data ?? '');
  }
}
