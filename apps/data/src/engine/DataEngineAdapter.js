/**
 * @file DataEngineAdapter.js
 * @brief Engine-neutral rendering contract for table, card and report engines.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
/** Base contract implemented by data rendering engines. */
export class DataEngineAdapter {
  async initialize() {}
  async setData() {
    throw new Error("Data engine does not implement setData");
  }
  async setSelection() {}
  async setCollection() {}
  async applyConfiguration() {}
  async resize() {}
  async destroy() {}
}
