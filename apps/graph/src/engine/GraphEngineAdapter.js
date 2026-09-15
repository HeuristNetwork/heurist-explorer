/**
 * @file GraphEngineAdapter.js
 * @brief Engine-neutral graph rendering contract.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Engine-neutral graph rendering contract; concrete engines (e.g. vis-network) implement every method. */
export class GraphEngineAdapter {
  /** Initialize the rendering engine into its container. Concrete engines must override this. */
  async initialize() {
    throw new Error("GraphEngineAdapter.initialize() is not implemented");
  }

  /** Replace the rendered graph. Concrete engines must override this. */
  async setGraph() {
    throw new Error("GraphEngineAdapter.setGraph() is not implemented");
  }

  /** Merge additional nodes/edges into the rendered graph. Concrete engines must override this. */
  async mergeGraph() {
    throw new Error("GraphEngineAdapter.mergeGraph() is not implemented");
  }

  /** Apply the current record selection to the rendered graph. Concrete engines must override this. */
  async setSelection() {
    throw new Error("GraphEngineAdapter.setSelection() is not implemented");
  }

  /** Apply updated engine options to an already-initialized engine, live. */
  async applyConfiguration() {}

  /** Fit the viewport to the rendered graph. Concrete engines must override this. */
  async fit() {
    throw new Error("GraphEngineAdapter.fit() is not implemented");
  }

  /** Resize the rendering surface. Concrete engines must override this. */
  async resize() {
    throw new Error("GraphEngineAdapter.resize() is not implemented");
  }

  /** Tear down the rendering engine. Concrete engines must override this. */
  async destroy() {
    throw new Error("GraphEngineAdapter.destroy() is not implemented");
  }
}
