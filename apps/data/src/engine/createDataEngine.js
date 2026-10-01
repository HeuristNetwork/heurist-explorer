/**
 * @file createDataEngine.js
 * @brief Creates the configured data rendering engine.
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

import { HRecordList } from "../widgets/HRecordList.js";

/**
 * Create the configured rendering engine adapter.
 *
 * @param {string} [name='datatables'] Engine name: `'datatables'` or `'recordlist'`.
 * @returns {Promise<object>} The created engine adapter.
 * @throws {Error} When `name` is not a known engine.
 */
export async function createDataEngine(name = "datatables") {
  if (name === "datatables") {
    // DataTables (with its Buttons extension and CSS) is loaded only when the
    // Table view is used; its export libraries load later still, only with the
    // Export control on (DataTablesAdapter#_initializeExportButtons).
    const { DataTablesAdapter } = await import("./datatables/DataTablesAdapter.js");
    return new DataTablesAdapter();
  }
  if (name === "recordlist") return new HRecordList();
  throw new Error(`Unknown Heurist Data engine: ${name}`);
}
