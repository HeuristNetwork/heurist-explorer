/**
 * @file createSymbologyService.js
 * @brief The symbology editors of heurist-map (plan 17): the shared SymbologyService
 *        over the module's API client, with the database definitions (field tree of
 *        the thematic editor, DT_SYMBOLOGY id) loaded on first use.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { SymbologyService } from '#shared/symbology/SymbologyService.js';
import { HDbDefs } from '#shared/data/HDbDefs.js';

/**
 * Create the symbology service of the module.
 *
 * @param {object} options
 * @param {object} options.apiClient HeuristApiClient.
 * @param {string} [options.language] Interface language (definitions labels).
 * @param {string|null} [options.heuristBaseUrl] Heurist base URL (record type icons).
 * @param {string} [options.database] Database name (record type icons).
 * @param {object|null} [options.hostBridge] Frame host bridge: with `editSymbology` (heurist-explorer)
 *        the editors open in the host's window; saving stays here.
 * @returns {SymbologyService|null} The service, or null without a configured API client.
 */
export function createSymbologyService({ apiClient, language = null, heuristBaseUrl = null, database = '', hostBridge = null } = {}) {
  const service = createLocalService({ apiClient, language, heuristBaseUrl, database });
  if (!service || typeof hostBridge?.editSymbology !== 'function') return service;
  // same options as SymbologyService#edit (kind, mode, parentSymbol, query, complete, rectypeId)
  service.edit = (value, options = {}) => hostBridge.editSymbology(value, options);
  return service;
}

/** The service of this document: editors opened here, saving with the module's API client. */
function createLocalService({ apiClient, language, heuristBaseUrl, database }) {
  if (!apiClient || (typeof apiClient.isConfigured === 'function' && !apiClient.isConfigured())) return null;
  let definitions = null;
  const loadDbDefs = () => {
    definitions ??= HDbDefs.load(apiClient.buildUrl('/def/snapshot'), { lang: language }).catch((error) => {
      definitions = null;
      throw error;
    });
    return definitions;
  };
  const iconUrl = heuristBaseUrl && database
    ? (rectypeId) => `${heuristBaseUrl}?db=${encodeURIComponent(database)}&icon=${encodeURIComponent(rectypeId)}`
    : null;
  return new SymbologyService({ api: apiClient, loadDbDefs, iconUrl });
}
