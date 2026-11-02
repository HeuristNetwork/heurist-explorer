/**
 * @file TranslationClient.js
 * @brief Machine translation of a text through the translation service of the server (plan 25, 2026-11-02):
 *        `POST /api/{db}/external/translate` with `{text, target, source?, format}` (`format` text or html,
 *        at most 5,000 characters; without `source` the service detects the language). The server chooses the
 *        provider. Available when the installation has a translation service: `meta.translator` of the
 *        definitions snapshot (HDbDefs#translator).
 *
 *   const translator = new TranslationClient({ apiClient, available: dbdefs.translator() });
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

/** Longest text the translation service takes (characters). */
export const MAX_TRANSLATION_LENGTH = 5000;

/** Translates texts with the translation service of the server. */
export class TranslationClient {
  /**
   * @param {object} options
   * @param {object} options.apiClient HeuristApiClient of the database.
   * @param {boolean} [options.available=false] Whether the server has a translation service (HDbDefs#translator).
   */
  constructor({ apiClient = null, available = false } = {}) {
    this.apiClient = apiClient;
    this._available = Boolean(available) && Boolean(apiClient);
  }

  /** @returns {boolean} Whether texts can be translated. */
  get available() {
    return this._available;
  }

  /**
   * Translate a text.
   *
   * @param {{string: string, target: string, source?: string, format?: 'text'|'html', signal?: AbortSignal}} request
   *        Text, language codes (`FRE`, `fr`, `pt-BR`; sent in lower case) and the format of the text (default html).
   * @returns {Promise<string>} The translated text.
   * @throws {Error} Without a translation service, a text too long, or the server's message.
   */
  async translate({ string, target, source = '', format = 'html', signal = null } = {}) {
    if (!this.available) throw new Error('Automatic translation is not configured on this server');
    const text = String(string ?? '');
    if ([...text].length > MAX_TRANSLATION_LENGTH) {
      throw new Error(`The text is too long to translate (at most ${MAX_TRANSLATION_LENGTH} characters)`);
    }
    const body = { text, target: String(target ?? '').toLowerCase(), format: format === 'text' ? 'text' : 'html' };
    if (source) body.source = String(source).toLowerCase();
    const payload = await this.apiClient.request('/external/translate', { method: 'POST', body, ...(signal ? { signal } : {}) });
    const translated = typeof payload === 'string' ? payload : payload?.text;
    if (typeof translated !== 'string') throw new Error('The translation service gave no text');
    return translated;
  }
}
