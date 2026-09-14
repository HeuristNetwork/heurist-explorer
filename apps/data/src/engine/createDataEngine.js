/**
 * @file createDataEngine.js
 * @brief Creates the configured data rendering engine.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { DataTablesAdapter } from "./datatables/DataTablesAdapter.js";
import { HRecordList } from "../widgets/HRecordList.js";

export async function createDataEngine(name = "datatables") {
  if (name === "datatables") return new DataTablesAdapter();
  if (name === "recordlist") {
    //const { HRecordList } = await import("#shared/widgets");
    return new HRecordList();
  }
  throw new Error(`Unknown Heurist Data engine: ${name}`);
}
