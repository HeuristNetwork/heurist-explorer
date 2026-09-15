/**
 * @file ExplorerModule.js
 * @brief Engine-neutral base contract implemented by every Explorer module adapter.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Engine-neutral Explorer module contract. */
export class ExplorerModule extends EventTarget {
  /**
   * @param {object} options Module configuration.
   * @param {string} options.id Unique module instance id.
   * @param {string} options.type Module type (`data`, `map`, `timeline`, or `graph`).
   * @param {HTMLElement} options.container Element the module will mount into.
   * @param {object|null} [options.context] Module-specific context, deep-cloned on construction.
   */
  constructor({ id, type, container, context = null }) {
    super();
    this.id = id;
    this.type = type;
    this.container = container;
    this.context = context ? clone(context) : {};
    this.dataSource = null;
    this.selection = [];
  }

  /**
   * Mount the module into its container. Base implementation is a no-op; subclasses override.
   *
   * @returns {Promise<ExplorerModule>} This module instance.
   */
  async mount() { return this; }

  /**
   * Apply a new active datasource. Base implementation only records it locally.
   *
   * @param {object} source Datasource definition.
   * @returns {Promise<object>} The applied datasource.
   */
  async setDataSource(source) { this.dataSource = clone(source); return source; }

  /**
   * Apply a new record selection. Base implementation only records it locally.
   *
   * @param {Array<number>} ids Selected record IDs.
   * @returns {Promise<Array<number>>} The normalized, applied selection.
   */
  async setSelection(ids) { this.selection = normalizeIds(ids); return this.selection; }

  /**
   * Return this module's serialized state.
   *
   * @returns {Promise<{dataSource: object|null, selection: Array<number>, context: object}>} Current module state.
   */
  async getState() { return { dataSource: clone(this.dataSource), selection: [...this.selection], context: clone(this.context) }; }

  /**
   * Resize the module. Base implementation is a no-op.
   *
   * @returns {Promise<boolean>} Always `true`.
   */
  async resize() { return true; }

  /**
   * Release resources held by the module. Base implementation is a no-op; subclasses override.
   *
   * @returns {Promise<void>}
   */
  async destroy() {}
}

/**
 * Normalize a value into a de-duplicated array of positive integer record IDs.
 *
 * @param {*} values Value to normalize; non-arrays produce an empty result.
 * @returns {Array<number>} Normalized record IDs.
 */
export function normalizeIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
}

/**
 * Deep-clone a JSON-safe value, tolerating `null`/`undefined`.
 *
 * @param {*} value Value to clone.
 * @returns {*} Cloned value.
 */
export function clone(value) {
  if (value == null) return value;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
