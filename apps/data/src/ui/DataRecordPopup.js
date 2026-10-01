/**
 * @file DataRecordPopup.js
 * @brief Record popup of the Data module, opened by a record's "i" (View) action.
 *
 * Shows the record in the configured Popup template mode through the shared
 * `RecordPopupContent` (as heurist-map and heurist-graph): Built-in (the full
 * record at once), Standard (Legacy) or a Smarty template. The
 * popup floats beside the clicked action and closes on Escape, on its close
 * button or on a click outside it.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from "#shared/ui";
import { RecordPopupContent } from "#shared/recordview/RecordPopupContent.js";
import { dataPopupMode } from "../core/recordTemplates.js";
import "./DataRecordPopup.css";

/** Floating record popup beside a record's View action. */
export class DataRecordPopup {
  /**
   * @param {object} options Dependencies.
   * @param {?object} [options.recordViewLoader] Shared `RecordViewLoader` (Built-in mode).
   * @param {?object} [options.recordContent] Loads server-rendered HTML: `load({records, template, signal})`.
   * @param {?string} [options.baseUrl] Heurist base URL, for record type icons and media.
   * @param {?string} [options.database] Database name.
   * @param {() => boolean} [options.canEditRecords] Whether the host can edit records now (edit pencil).
   * @param {?(recordId: number) => Promise<?object>} [options.editRecord] Opens the host record editor.
   */
  constructor({
    recordViewLoader = null, recordContent = null, baseUrl = null, database = null,
    canEditRecords = () => false, editRecord = null,
  } = {}) {
    Object.assign(this, { recordViewLoader, recordContent, baseUrl, database, canEditRecords, editRecord });
    this.element = null;
    this.anchor = null;
    this.content = null;
    this.onOutside = (event) => {
      if (this.element && !this.element.contains(event.target) && !this.anchor?.contains?.(event.target)) this.close();
    };
    this.onKeyDown = (event) => {
      if (event.key !== "Escape" || !this.element) return;
      event.stopPropagation();
      this.close();
    };
  }

  /**
   * Show one record beside its View action.
   *
   * @param {object} options Popup options.
   * @param {number} options.recordId Record ID.
   * @param {?HTMLElement} [options.anchor] Clicked action; the popup is placed beside it.
   * @param {string} options.mode Popup mode; see `dataPopupMode`.
   * @returns {boolean} Whether the popup opened (`false` for the None mode).
   */
  open({ recordId, anchor = null, mode }) {
    const popupMode = dataPopupMode(mode);
    const id = Number(recordId);
    if (popupMode === "none" || !Number.isInteger(id) || id < 1) return false;
    this.close();
    const doc = anchor?.ownerDocument || document;
    this.doc = doc;
    this.anchor = anchor;
    this.element = doc.createElement("div");
    this.element.className = "h-widget heurist-data-popup";
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-label", $HR("Record"));
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "heurist-icon-button heurist-data-popup-close";
    close.title = $HR("Close");
    close.setAttribute("aria-label", close.title);
    close.textContent = "×";
    close.addEventListener("click", () => this.close());
    this.content = new RecordPopupContent({
      recordViewLoader: this.recordViewLoader,
      loadHtml: this.recordContent
        ? async (recordId, template, signal) => {
          const html = await this.recordContent.load({ records: [{ rec_ID: recordId }], template, signal });
          return html.get(recordId) ?? html.get(String(recordId)) ?? null;
        }
        : null,
      baseUrl: this.baseUrl,
      database: this.database,
      canEditRecords: this.canEditRecords,
      editRecord: this.editRecord,
      onLayout: () => this.place(),
    });
    this.element.append(close, this.content.element);
    doc.body.append(this.element);
    // Built-in shows the full record at once (no compact card with "More...")
    this.content.showRecord({ id }, popupMode, { full: true });
    this.place();
    // registered after the opening click has finished
    setTimeout(() => {
      doc.addEventListener("mousedown", this.onOutside, true);
      doc.addEventListener("keydown", this.onKeyDown, true);
    }, 0);
    return true;
  }

  /**
   * Place the popup below its anchor (above when there is no room), inside the window.
   *
   * @returns {void}
   */
  place() {
    const popup = this.element;
    if (!popup) return;
    const view = this.doc?.defaultView || globalThis;
    const width = view.innerWidth || 0;
    const height = view.innerHeight || 0;
    const anchor = this.anchor?.isConnected ? this.anchor.getBoundingClientRect() : null;
    const box = popup.getBoundingClientRect();
    let left = anchor ? anchor.right - box.width : (width - box.width) / 2;
    let top = anchor ? anchor.bottom + 4 : (height - box.height) / 2;
    if (anchor && top + box.height > height - 4 && anchor.top - box.height - 4 >= 4) top = anchor.top - box.height - 4;
    left = Math.max(4, Math.min(left, width - box.width - 4));
    top = Math.max(4, Math.min(top, height - box.height - 4));
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
  }

  /** Close the popup and cancel pending requests. */
  close() {
    if (!this.element) return;
    const doc = this.doc || document;
    doc.removeEventListener("mousedown", this.onOutside, true);
    doc.removeEventListener("keydown", this.onKeyDown, true);
    this.content?.cancel();
    this.element.remove();
    this.element = null;
    this.anchor = null;
    this.content = null;
  }
}
