/**
 * @file fieldTypeFilters.js
 * @brief The "field type" filter of the field trees: HFieldTree (Filter Builder,
 *        field paths, Smarty editor) and HStructureTree (record editor, plan 23 §4.3).
 *        One list of options, so both trees offer the same groups of types.
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

/** Filter option → the field types it shows (`all`: no filter). The option is its own translation key. */
export const FIELD_TYPE_FILTERS = Object.freeze({
  all: null,
  text: ['freetext', 'blocktext'],
  enum: ['enum', 'relationtype'],
  date: ['date', 'year'],
  numeric: ['integer', 'float'],
  geo: ['geo'],
  pointer: ['resource', 'relmarker'],
  file: ['file']
});

/**
 * Whether a field type passes a filter option.
 *
 * @param {string} filter Option of FIELD_TYPE_FILTERS (unknown: no filter).
 * @param {string} type Field type.
 * @returns {boolean}
 */
export function fieldTypeShown(filter, type) {
  const types = FIELD_TYPE_FILTERS[filter];
  return !types || types.includes(String(type));
}

/**
 * The filter options that show at least one of the given field types, `all` first.
 *
 * @param {Iterable<string>} types Field types of a form or record type.
 * @param {string[]} [options] Options to offer (default: all of FIELD_TYPE_FILTERS).
 * @returns {string[]}
 */
export function fieldTypeOptions(types, options = Object.keys(FIELD_TYPE_FILTERS)) {
  const present = new Set([...types].map(String));
  return options.filter((option) => option === 'all' || (FIELD_TYPE_FILTERS[option] || []).some((type) => present.has(type)));
}
