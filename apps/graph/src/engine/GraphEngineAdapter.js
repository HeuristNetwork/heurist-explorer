/**
 * @file GraphEngineAdapter.js
 * @brief Engine-neutral graph rendering contract.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

export class GraphEngineAdapter {
  async initialize() {
    throw new Error("GraphEngineAdapter.initialize() is not implemented");
  }

  async setGraph() {
    throw new Error("GraphEngineAdapter.setGraph() is not implemented");
  }

  async mergeGraph() {
    throw new Error("GraphEngineAdapter.mergeGraph() is not implemented");
  }

  async setSelection() {
    throw new Error("GraphEngineAdapter.setSelection() is not implemented");
  }

  /** Apply updated engine options to an already-initialized engine, live. */
  async applyConfiguration() {}

  async fit() {
    throw new Error("GraphEngineAdapter.fit() is not implemented");
  }

  async resize() {
    throw new Error("GraphEngineAdapter.resize() is not implemented");
  }

  async destroy() {
    throw new Error("GraphEngineAdapter.destroy() is not implemented");
  }
}
