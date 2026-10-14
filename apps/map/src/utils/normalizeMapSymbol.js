/**
 * @file normalizeMapSymbol.js
 * @brief Re-export of the shared map symbol normalization (moved to
 *        shared/src/symbology on 2026-10-13, plan 17) for existing imports.
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

export {
  DEFAULT_MAP_SYMBOL, canonicalizeMapSymbol, normalizeMapSymbol, normalizeMapSymbolOverride, normalizeOpacity
} from '#shared/symbology/normalizeMapSymbol.js';
