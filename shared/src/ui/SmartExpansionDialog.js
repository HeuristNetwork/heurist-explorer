/**
 * @file SmartExpansionDialog.js
 * @brief Smart expansion: choose the record types the next expansion step reaches.
 *
 * Used by heurist-graph and heurist-data. The caller has counted the records the
 * next step would reach per record type (`detail=rectypes`); the dialog lists
 * them (most first) in an HValuePicker and returns the chosen types.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from "./i18n/index.js";
import { HMsg } from "./HMsg.js";
import { HValuePicker } from "../widgets/picker/HValuePicker.js";
import { StaticSource } from "../data/valueSources/localSources.js";
import "./SmartExpansionDialog.css";

/**
 * Let the user choose record types to expand to.
 *
 * @param {Array<{id: number, label: string, count: number}>} types Reached record types with record counts.
 * @returns {Promise<Array<number>|null>} Chosen record type IDs, or `null` when cancelled.
 */
export function chooseRecordTypes(types) {
  const dialogId = "h-smart-expansion-dialog";
  const host = document.createElement("div");
  host.className = "h-smart-expansion";
  const hint = document.createElement("p");
  hint.className = "h-smart-expansion-hint";
  hint.textContent = $HR("Records the next step reaches, by record type. Choose the types to add.");
  const list = document.createElement("div");
  host.append(hint, list);
  let expand = null;
  const picker = new HValuePicker().attach(list, {
    source: new StaticSource(types.map((type) => ({ value: type.id, label: type.label, count: type.count }))),
    multiple: true,
    value: [],
    loadOnRender: true,
    showCounts: true,
    onChange: (value) => { if (expand) expand.disabled = !value.length; },
  }).render();
  return new Promise((resolve) => {
    const finish = (value) => {
      HMsg.closeMsgDlg(dialogId);
      void picker.destroy();
      resolve(value);
    };
    const dlg = HMsg.showMsgDlg(host, {
      dialogId,
      title: $HR("Smart expansion"),
      preventClose: true,
      buttons: [
        { label: $HR("Expand"), class: "h-btn h-btn-primary", onClick: () => finish(picker.getValue().map(Number)) },
        { label: $HR("Cancel"), class: "h-btn", onClick: () => finish(null) },
      ],
    });
    expand = dlg?.querySelector(".h-dialog-footer .h-btn-primary") || null;
    if (expand) expand.disabled = true;
  });
}

/**
 * Run a smart expansion from a module control: count the reached record types,
 * let the user choose, then expand.
 *
 * @param {object} api Module public API with `smartExpansionTypes()` and `smartExpand(types)`.
 * @param {object} [options]
 * @param {(message: string) => void} [options.onEmpty] Shows "the next step reaches no records".
 * @returns {Promise<boolean>} Whether the module expanded.
 */
export async function runSmartExpansion(api, { onEmpty = null } = {}) {
  const types = await api.smartExpansionTypes();
  if (types == null) return false;
  if (!types.length) {
    onEmpty?.($HR("The next expansion step reaches no records"));
    return false;
  }
  const chosen = await chooseRecordTypes(types);
  if (!chosen?.length) return false;
  return api.smartExpand(chosen);
}
