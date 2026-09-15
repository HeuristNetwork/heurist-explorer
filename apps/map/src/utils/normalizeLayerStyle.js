/**
 * @file normalizeLayerStyle.js
 * @brief Converts public MapLayer style definitions into a consistent engine-neutral style structure.
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

import {
  DEFAULT_MAP_SYMBOL,
  normalizeMapSymbol,
  normalizeMapSymbolOverride
} from './normalizeMapSymbol.js';

/**
 * Normalize layer style.
 *
 * Vector inheritance follows the same chain as main Heurist:
 * DEFAULT_MAP_SYMBOL -> configured default -> layer -> thematic renderer -> range.
 * Thematic range symbols remain sparse until feature resolution.
 *
 * @param {object} [value] Raw layer style.
 * @param {object} [defaults] Configured default symbol/selection to inherit from.
 * @returns {{symbol: object, selectSymbol: object|null, thematic: Array<object>}} Normalized style.
 */
export function normalizeLayerStyle(value = {}, defaults = {}) {
  const style = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const explicitSymbol = style.symbol !== undefined
    ? (hasMeaningfulSymbol(style.symbol) ? style.symbol : null)
    : (hasInlineSymbol(style) ? style : null);

  const defaultSymbol = normalizeMapSymbol(defaults.symbol ?? {}, DEFAULT_MAP_SYMBOL);
  const symbol = normalizeMapSymbol(explicitSymbol ?? {}, defaultSymbol);

  const selectSymbol = style.selectSymbol
    ?? style.selectSymbology
    ?? defaults.selectSymbol
    ?? defaults.selectSymbology
    ?? null;

  return {
    symbol,
    selectSymbol: normalizeSelectionSymbol(selectSymbol),
    thematic: normalizeThematicMaps(style.thematic, symbol)
  };
}


/** Normalize a selection-highlight symbol override, deriving `radius` from `iconSize` when present. */
function normalizeSelectionSymbol(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const symbol = normalizeMapSymbolOverride(value);
  if (Object.hasOwn(symbol, 'iconSize')) {
    const size = Array.isArray(symbol.iconSize) ? Number(symbol.iconSize[0]) : Number(symbol.iconSize);
    if (Number.isFinite(size) && size >= 0) symbol.radius = size / 2;
  }
  return symbol;
}

/** Normalize a layer's thematic-map list, ensuring at most one is marked active. */
function normalizeThematicMaps(value, layerSymbol) {
  const source = Array.isArray(value)
    ? value
    : (value && typeof value === 'object' ? [value] : []);

  let activeSeen = false;
  return source
    .filter((theme) => theme && typeof theme === 'object' && !Array.isArray(theme))
    .map((theme) => {
      const requestedActive = theme.active === true || theme.active === 1 || theme.active === '1';
      const active = requestedActive && !activeSeen;
      if (active) activeSeen = true;

      return {
        ...structuredCloneSafe(theme),
        active,
        fields: normalizeThematicFields(theme.fields),
        symbol: normalizeMapSymbol(theme.symbol ?? {}, layerSymbol)
      };
    });
}

/** Normalize a thematic map's field list. */
function normalizeThematicFields(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((field) => field && typeof field === 'object' && !Array.isArray(field))
    .map((field) => ({
      ...structuredCloneSafe(field),
      code: field.code == null ? '' : String(field.code),
      title: field.title == null ? '' : String(field.title),
      ranges: normalizeThematicRanges(field.ranges)
    }));
}

/** Normalize a thematic field's value ranges. */
function normalizeThematicRanges(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((range) => range && typeof range === 'object' && !Array.isArray(range))
    .map((range) => ({
      ...structuredCloneSafe(range),
      symbol: normalizeMapSymbolOverride(range.symbol)
    }));
}

/** Whether a style object carries symbol properties directly at its top level (legacy shape). */
function hasInlineSymbol(style) {
  const ignored = new Set(['type', 'thematic', 'selectSymbol', 'selectSymbology', 'symbol']);
  return Object.keys(style).some((key) => !ignored.has(key));
}

/** Whether a value is a non-empty plain object, suitable as an explicit symbol override. */
function hasMeaningfulSymbol(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length);
}

/** Deep-clone a JSON-safe value. */
function structuredCloneSafe(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
