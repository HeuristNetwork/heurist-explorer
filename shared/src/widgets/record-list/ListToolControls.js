/**
 * @file ListToolControls.js
 * @brief Sort selector and See/hide owners link of the simplified interface
 *        (heurist-explorer "Interface for dummies"), shared by the HRecordList
 *        toolbar and the Table view's toolbar.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from "../../ui/i18n/HResource.js";
import "./ListToolControls.css";

/** Sort choices (v7 set): `/records` sort tokens; empty is the query's own sort. */
export const LIST_SORTS = [
  ["", "Default"],
  ["title", "Title A-Z"],
  ["-title", "Title Z-A"],
  ["-modified", "Modified (newest)"],
  ["-added", "Added (newest)"],
  ["type", "Record type"],
  ["id", "ID"],
];

/**
 * Build the Sort selector.
 *
 * @param {object} options
 * @param {string|null} [options.value] Current sort token.
 * @param {function(string|null): void} options.onChange Called with the new token (null: default).
 * @returns {HTMLElement} A label with the caption and the select.
 */
export function createSortSelect({ value = null, onChange }) {
  const label = document.createElement("label");
  label.className = "h-inline heurist-data-sort";
  const caption = document.createElement("span");
  caption.textContent = $HR("Sort");
  const select = document.createElement("select");
  select.className = "h-select heurist-data-sort-select";
  select.setAttribute("aria-label", $HR("Sort"));
  for (const [token, text] of LIST_SORTS) {
    const option = document.createElement("option");
    option.value = token;
    option.textContent = $HR(text);
    select.append(option);
  }
  select.value = value || "";
  select.addEventListener("change", () => onChange?.(select.value || null));
  label.append(caption, select);
  return label;
}

/**
 * Build the See/hide owners link: switches the Admin info option.
 *
 * @param {object} options
 * @param {boolean} options.shown Whether the owners (admin info) are shown now.
 * @param {function(): (Promise<boolean>|boolean)} options.onToggle Switches it; resolves with the new state.
 * @returns {HTMLButtonElement} The link-styled button; `syncShown(shown)` updates its caption.
 */
export function createOwnersToggle({ shown = false, onToggle }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "heurist-data-owners-toggle";
  const sync = (value) => {
    button.textContent = $HR(value ? "Hide owners" : "See owners");
    button.setAttribute("aria-pressed", String(Boolean(value)));
  };
  sync(shown);
  // the owner can follow a change made elsewhere (configuration dialog)
  button.syncShown = sync;
  button.addEventListener("click", async () => {
    const next = await onToggle?.();
    if (typeof next === "boolean") sync(next);
  });
  return button;
}
