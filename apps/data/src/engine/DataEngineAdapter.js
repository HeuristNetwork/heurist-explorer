/**
 * @file DataEngineAdapter.js
 * @brief Engine-neutral rendering contract for table, card and report engines.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
/** Base contract implemented by data rendering engines. */
export class DataEngineAdapter {
  /**
   * Mount the engine into its container and wire up interaction callbacks.
   *
   * @param {object} [context] Engine context: container, options, and `on*` callbacks; see `DataApplication#_engineContext`.
   * @returns {Promise<void>}
   */
  async initialize() {}

  /**
   * Render a page of records.
   *
   * @param {{querySource: object|null, records: Array<object>, meta: object, pagination: object}} [data] Data to render.
   * @returns {Promise<void>}
   * @throws {Error} Concrete engines must implement this method.
   */
  async setData() {
    throw new Error("Data engine does not implement setData");
  }

  /**
   * Apply the current record selection to the rendered view.
   *
   * @param {Array<number>} [recordIds] Selected record IDs.
   * @param {object} [options] Engine-specific selection options.
   * @returns {Promise<void>}
   */
  async setSelection() {}

  /**
   * Apply the current persistent-collection membership to the rendered view.
   *
   * @param {Array<number>} [recordIds] Collected record IDs.
   * @returns {Promise<void>}
   */
  async setCollection() {}

  /**
   * Apply updated engine options without a full re-initialize.
   *
   * @param {object} [options] Updated engine options.
   * @returns {Promise<void>}
   */
  async applyConfiguration() {}

  /**
   * Resize the rendered view after a container size change.
   *
   * @returns {Promise<void>}
   */
  async resize() {}

  /**
   * Tear down the engine and release its DOM/resources.
   *
   * @returns {Promise<void>}
   */
  async destroy() {}
}
