/**
 * @file HeuristGraphHostAdapter.js
 * @brief Host bridge for embedded heurist-graph operation.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HostAdapter } from "#shared/host";

export class HeuristGraphHostAdapter extends HostAdapter {
  constructor({ bridge = null, baseUrl = null, database = null, fetchImpl = null } = {}) {
    super({ bridge, baseUrl, database, fetchImpl, moduleType: "graph" });
  }

  async initialize() {}

  editRules(value) {
    if (!this.bridge?.editRules) throw new Error('Expansion rule editor is not available in this host.');
    return this.bridge.editRules(value);
  }

  describeRules(rules) { return this.bridge?.describeRules?.(rules) || rules; }

  getCapabilities() {
    return {
      editing: this.supportsEditing(),
      graphPreferences: Boolean(this.baseUrl && this.database),
      graphPublishing: Boolean(this.baseUrl && this.database),
    };
  }

  publishSelection(recordIds) {
    return this.bridge?.onSelection?.([...recordIds]);
  }

  async destroy() {}
}
