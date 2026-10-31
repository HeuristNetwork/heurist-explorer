/**
 * @file SmartExpansionDialog.js
 * @brief Smart expansion: choose the record types the next expansion step reaches.
 *
 * Used by heurist-graph and heurist-data. The caller has counted the records the
 * next step would reach per record type (`aggregate op=rectypes`); the dialog lists
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
  // a plain list with standard checkboxes (2026-10-31: was HValuePicker with icon checks)
  const list = document.createElement("ul");
  list.className = "h-smart-expansion-list";
  const boxes = types.map((type) => {
    const item = document.createElement("li");
    const label = document.createElement("label");
    label.className = "h-smart-expansion-item";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = String(type.id);
    const name = document.createElement("span");
    name.className = "h-smart-expansion-label";
    name.textContent = type.label;
    const count = document.createElement("span");
    count.className = "h-smart-expansion-count";
    count.textContent = String(type.count);
    label.append(box, name, count);
    item.append(label);
    list.append(item);
    return box;
  });
  host.append(hint, list);
  let expand = null;
  const chosen = () => boxes.filter((box) => box.checked).map((box) => Number(box.value));
  list.addEventListener("change", () => { if (expand) expand.disabled = !chosen().length; });
  return new Promise((resolve) => {
    const finish = (value) => {
      HMsg.closeMsgDlg(dialogId);
      resolve(value);
    };
    const dlg = HMsg.showMsgDlg(host, {
      dialogId,
      title: $HR("Smart expansion"),
      preventClose: true,
      buttons: [
        { label: $HR("Expand"), class: "h-btn h-btn-primary", onClick: () => finish(chosen()) },
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
