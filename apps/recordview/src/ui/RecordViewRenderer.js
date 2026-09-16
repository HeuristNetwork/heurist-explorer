/**
 * @file RecordViewRenderer.js
 * @brief Renders the currently displayed record into the module body.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { $HR } from "#shared/ui";
import { displayFieldValue } from "../core/FieldValueFormatter.js";

/** Renders the empty state, the `builtin` field list, or the `legacy`/`smarty` iframe. */
export class RecordViewRenderer {
  /** @param {{container: HTMLElement}} options Element the renderer owns and clears on every render. */
  constructor({ container }) {
    this.container = container;
    this.notice = document.createElement("div");
    this.notice.className = "heurist-recordview-notice";
    this.notice.hidden = true;
    this.body = document.createElement("div");
    this.body.className = "heurist-recordview-body";
    this.container.replaceChildren(this.notice, this.body);
  }

  /**
   * Show (or hide) the multi-selection notice above the rendered record.
   *
   * @param {string|null} text Notice text, or `null`/`''` to hide it.
   * @returns {void}
   */
  setNotice(text) {
    const value = String(text || "").trim();
    this.notice.hidden = !value;
    this.notice.textContent = value;
  }

  /**
   * Show the neutral empty state (no record to display).
   *
   * @param {string} message Empty-state message.
   * @returns {void}
   */
  showEmpty(message) {
    const empty = document.createElement("div");
    empty.className = "heurist-recordview-empty";
    // Only the default message is a translation key; custom configured text
    // (e.g. a user-entered emptyMessage) is shown verbatim, matching how
    // DataControlPanel treats its own default-vs-custom source caption.
    const text = String(message || "Select a record");
    empty.textContent = text === "Select a record" ? $HR(text) : text;
    this.body.replaceChildren(empty);
  }

  /**
   * Render the `builtin` engine's simple field/value list.
   *
   * @param {object} record Resolved record (`rec_*` fields plus a `details` map).
   * @param {{fields: Map<number,string>, recordTypes: Map<number,string>}} vocabulary Resolved field/record-type names.
   * @returns {void}
   */
  showBuiltin(record, vocabulary) {
    const dl = document.createElement("dl");
    dl.className = "heurist-recordview-fields";
    const heading = document.createElement("h2");
    const recordTypeId = Number(record?.rec_RecTypeID) || 0;
    heading.textContent =
      record?.rec_Title || vocabulary.recordTypes.get(recordTypeId) || `Record ${record?.rec_ID ?? ""}`;
    dl.append(heading);
    for (const [key, raw] of Object.entries(record?.details || {})) {
      const fieldId = Number(key);
      const label = vocabulary.fields.get(fieldId) || `Field ${key}`;
      const value = displayFieldValue(record, { field: key });
      if (!String(value ?? "").trim()) continue;
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      dl.append(dt, dd);
      void raw;
    }
    this.body.replaceChildren(dl);
  }

  /**
   * Render the `legacy`/`smarty` engine as an embedded iframe.
   *
   * @param {URL|string} url Renderer URL built by `RecordContentProvider#buildUrl`.
   * @returns {void}
   */
  showFrame(url) {
    const frame = document.createElement("iframe");
    frame.className = "heurist-recordview-frame";
    frame.title = $HR("Record");
    frame.src = String(url);
    this.body.replaceChildren(frame);
  }

  /** Remove all rendered content, leaving the body empty. */
  clear() {
    this.body.replaceChildren();
  }

  /** Remove the renderer's DOM from its container. */
  destroy() {
    this.notice.remove();
    this.body.remove();
  }
}
