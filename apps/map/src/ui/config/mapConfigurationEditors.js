/**
 * @file mapConfigurationEditors.js
 * @brief Inputs of the map configuration form in the map's own window (plan 29): the
 *        symbology editor of the default and selection symbology, and the extent picker.
 *        In heurist-explorer the form uses Explorer's editors instead.
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

/**
 * HEditForm options of the map configuration form.
 *
 * @param {object} options
 * @param {object|null} [options.apiClient] HeuristApiClient (the record picker of the map documents).
 * @param {((value: object|null, options: object) => Promise<object|null>)|null} [options.editSymbology] Symbology
 *        editor; resolves with the complete symbol, or null when cancelled.
 * @param {((bounds: object|null, options?: object) => Promise<object|null>)|null} [options.editExtent] Extent picker
 *        of the host (bridge `editExtent`).
 * @returns {object} `specialEditors`, `selectExtent` and `apiClient`.
 */
export function mapConfigurationFormOptions({ apiClient = null, editSymbology = null, editExtent = null } = {}) {
  const parse = (value) => {
    try { return value ? JSON.parse(value) : null; } catch { return null; }
  };
  return {
    specialEditors: typeof editSymbology === 'function' ? {
      symbology: {
        json: true,
        icon: 'fa-palette',
        title: 'Open symbology editor',
        describe: (value) => (parse(value) ? 'Defined' : ''),
        // configuration values are complete symbols (SymbologyService.edit)
        edit: async (value) => {
          const result = await editSymbology(parse(value), { complete: true });
          return result == null ? undefined : (Object.keys(result).length ? JSON.stringify(result) : '');
        }
      }
    } : {},
    ...(typeof editExtent === 'function' ? { selectExtent: (value) => editExtent(value) } : {}),
    ...(apiClient ? { apiClient } : {})
  };
}
