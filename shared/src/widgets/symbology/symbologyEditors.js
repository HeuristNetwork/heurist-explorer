/**
 * @file symbologyEditors.js
 * @brief The symbology editors in one module, loaded lazily by SymbologyService
 *        (plan 17): symbol, thematic map, image filter.
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

import { HSymbolEditor } from './HSymbolEditor.js';
import { HThematicMapEditor } from './HThematicMapEditor.js';
import { HImageFilterEditor } from './HImageFilterEditor.js';

export { HSymbolEditor, HThematicMapEditor, HImageFilterEditor };

/**
 * Edit a symbol.
 *
 * @param {*} value Stored value.
 * @param {object} [options] See HSymbolEditor.open.
 * @returns {Promise<object|null>} New value, or null on Cancel.
 */
export function editSymbol(value, options = {}) {
  return HSymbolEditor.open(value, options);
}

/**
 * Edit the thematic maps of a layer.
 *
 * @param {*} value Stored value.
 * @param {object} options See HThematicMapEditor.open.
 * @returns {Promise<object|null>} New value, or null on Cancel.
 */
export function editThematicMaps(value, options = {}) {
  return HThematicMapEditor.open(value, options);
}

/**
 * Edit the image filters of an image layer.
 *
 * @param {*} value Stored value.
 * @param {object} [options] See HImageFilterEditor.open.
 * @returns {Promise<object|null>} New value, or null on Cancel.
 */
export function editImageFilter(value, options = {}) {
  return HImageFilterEditor.open(value, options);
}
