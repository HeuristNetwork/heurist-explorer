/**
 * @file recordAdminInfo.js
 * @brief Admin info markup (owner, visibility, bookmark) and the record-type icon URL,
 *        shared by the HRecordList views and the Table view, so both show the same icons.
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

import { $HR } from "#shared/ui";

/** Cache-busting token for record-type icon URLs, one per page load. */
const RECORD_TYPE_ICON_TOKEN = Date.now();

/** Icon, hint and colour of each non-owner visibility value. */
const VISIBILITY = {
  hidden: { icon: "fa-eye-slash", hint: "hidden_hint", color: "#c62828" },
  visible: { icon: "fa-eye", hint: "visible_hint", color: "#e07b00" },
  pending: { icon: "fa-eye", hint: "pending_hint", color: "#2e8b57" },
  public: { icon: "fa-eye", hint: "public_hint", color: "#777" },
};

/**
 * The record-type icon URL (thumb version) of a record.
 *
 * @param {object} record Record with `rec_RecTypeID`.
 * @param {{baseUrl?: string, database?: string}} [options] Heurist base URL and database;
 *        the module bootstrap's runtime values are used when missing.
 * @returns {string} The URL, or "" without a record type or base URL.
 */
export function recordTypeIconUrl(record, options = {}) {
  const runtime = globalThis.heuristModuleBootstrap?.runtime || {};
  const baseUrl = String(options.baseUrl || runtime.baseUrl || "");
  const database = String(options.database || runtime.database || "");
  const typeId = Number(record?.rec_RecTypeID);
  if (!(typeId > 0) || !baseUrl) return "";
  const heuristRoot = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${heuristRoot}?db=${encodeURIComponent(database)}&icon=${typeId}&t=${RECORD_TYPE_ICON_TOKEN}&version=thumb`;
}

/**
 * Owner, visibility and bookmark markup of a record, in a `<prefix>-admin` span with
 * `<prefix>-owner`, `<prefix>-visibility` and `<prefix>-bookmark` children (each view
 * styles its own prefix).
 *
 * @param {object} record Record with `rec_OwnerName`, `rec_NonOwnerVisibility`, `rec_Bookmarked`.
 * @param {string} prefix Class prefix: "h-recordlist" or "heurist-data".
 * @param {string} [extra=""] Markup appended inside the span (the Table view's record-type icon).
 * @returns {string} HTML.
 */
export function adminInfoHtml(record, prefix, extra = "") {
  const visibility = String(record?.rec_NonOwnerVisibility || "").toLowerCase();
  const info = VISIBILITY[visibility] || VISIBILITY.public;
  const hint = escapeAttr($HR(info.hint));
  const owner = escapeAttr(record?.rec_OwnerName || "");
  const bookmarked = Number(record?.rec_Bookmarked) !== 0;
  return (
    `<span class="${prefix}-admin">` +
    `<span class="${prefix}-owner" title="${owner}">${owner}</span>` +
    `<span class="${prefix}-visibility" title="${hint}"><i class="fa-regular ${info.icon}" style="color:${info.color}" aria-label="${hint}"></i></span>` +
    `<i class="fa-regular fa-bookmark ${prefix}-bookmark${bookmarked ? "" : " is-placeholder"}" title="Bookmarked" aria-label="Bookmarked"></i>` +
    extra +
    "</span>"
  );
}

/** Escape a value for HTML text and attribute values (also backticks). */
function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("`", "&#96;");
}
