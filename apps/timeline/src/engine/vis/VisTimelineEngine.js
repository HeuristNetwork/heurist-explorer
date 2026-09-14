/**
 * @file VisTimelineEngine.js
 * @brief Wraps the vis-timeline library and maps the timeline API to the Heurist module lifecycle.
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { Timeline } from "vis-timeline/standalone";
import { DataSet } from "vis-data";
import "vis-timeline/styles/vis-timeline-graph2d.min.css";

/**
 * Hosts the underlying vis-timeline instance and exposes the application-facing lifecycle methods.
 */
export class VisTimelineEngine {
  /**
   * Initializes the timeline canvas and event handlers.
   *
   * @param {object} options - Runtime settings and callback handlers.
   * @returns {Promise<void>}
   */
  async initialize({ container, settings = {}, onSelectionChange, onRangeChange }) {
    this.container = container;
    this.settings = settings;
    this.onSelectionChange = onSelectionChange;
    this.onRangeChange = onRangeChange;
    this.groups = new DataSet();
    this.items = new DataSet();
    this.recordItemIds = new Map();

    this.timeline = new Timeline(container, this.items, this.groups, {
      orientation: settings.orientation || "both",
      // The item template emits our own classed markup and escapes every
      // interpolated value itself; vis-timeline's js-xss filter would otherwise
      // strip the class/style attributes the custom bar rendering depends on.
      xss: { disabled: true },
      // Pin range content to the bar's start so the overflowing marker+label
      // sizes .vis-item-content; vis then stacks the range by boxWidth + label
      // width and range labels stop colliding when zoomed in.
      align: "left",
      selectable: true,
      multiselect: true,
      stack: settings.stack !== false,
      margin: 1,
      zoomMax: settings.zoomMax,
      order: (a, b) => new Date(a.start) - new Date(b.start),
      template: (item) => this._template(item),
    });

    this.timeline.on("select", (params) =>
      this.onSelectionChange?.(this._recordsForItems(params.items || [])),
    );
    this.timeline.on("rangechanged", (params) =>
      this.onRangeChange?.({
        start: params.start,
        end: params.end,
        byUser: params.byUser === true,
      }),
    );
  }

  /**
   * Replaces the data sources used by the timeline.
   *
   * @param {{ groups?: Array<object>, items?: Array<object> }} options - New groups and items.
   * @returns {Promise<void>}
   */
  async setData({ groups = [], items = [] }) {
    this.recordItemIds.clear();

    for (const item of items) {
      const id = Number(item.recID);
      if (!this.recordItemIds.has(id)) this.recordItemIds.set(id, []);
      this.recordItemIds.get(id).push(item.id);
    }

    this.groups.clear();
    this.items.clear();
    this.groups.add(groups);
    this.items.add(items);
    this.timeline.setGroups(this.groups);
    this.timeline.setItems(this.items);
    this.zoomToAll();
  }

  /**
   * Selects the supplied record IDs within the timeline.
   *
   * @param {Array<number>} recordIds - Record IDs to select.
   * @param {{ zoom?: boolean }} [options={}] - Optional selection behavior.
   * @returns {Promise<void>}
   */
  async setSelection(recordIds, options = {}) {
    const itemIds = [
      ...new Set(
        (recordIds || []).flatMap((id) => this.recordItemIds.get(Number(id)) || []),
      ),
    ];

    this.timeline.setSelection(itemIds, { focus: false });
    if (options.zoom && itemIds.length) this.zoomToSelection();
  }

  /**
   * Zooms in by a moderate step.
   */
  zoomIn() {
    this.timeline.zoomIn(0.25);
  }

  /**
   * Zooms out by a moderate step.
   */
  zoomOut() {
    this.timeline.zoomOut(0.5);
  }

  /**
   * Fits the entire dataset into the current viewport.
   */
  zoomToAll() {
    if (this.items.length) this.timeline.fit({ animation: false });
  }

  /**
   * Focuses the current selection in the timeline viewport.
   */
  zoomToSelection() {
    const ids = this.timeline.getSelection();
    if (ids.length) this.timeline.focus(ids, { animation: false, zoom: true });
  }

  /**
   * Moves the viewport to the earliest item.
   */
  moveToStart() {
    const range = this.timeline.getItemRange();
    if (range?.min) this.timeline.moveTo(range.min, { animation: false });
  }

  /**
   * Moves the viewport to the latest item.
   */
  moveToEnd() {
    const range = this.timeline.getItemRange();
    if (range?.max) this.timeline.moveTo(range.max, { animation: false });
  }

  /**
   * Updates timeline display options in place.
   *
   * @param {object} [options={}] - Partial timeline options.
   */
  setOptions(options = {}) {
    this.settings = { ...this.settings, ...options };
    this.timeline.setOptions({
      stack: this.settings.stack !== false,
      orientation: this.settings.orientation || "both",
      template: (item) => this._template(item),
    });
    // Re-bind the items so vis-timeline re-runs the template and re-measures
    // every item width for stacking. A bare redraw() keeps the cached widths,
    // so switching e.g. hidden -> full leaves the items jammed together.
    this.timeline.setItems(this.items);
    this.timeline.redraw();
  }

  /**
   * Redraws the timeline.
   */
  resize() {
    this.timeline?.redraw();
  }

  /**
   * Destroys the timeline instance.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    this.timeline?.destroy();
    this.timeline = null;
  }

  /**
   * Maps item IDs back to their underlying record IDs.
   *
   * @param {Array<string>} itemIds - Timeline item identifiers.
   * @returns {Array<number>} Record IDs represented by the selected items.
   */
  _recordsForItems(itemIds) {
    return [
      ...new Set(
        itemIds
          .map((id) => Number(this.items.get(id)?.recID))
          .filter((id) => id > 0),
      ),
    ];
  }

  /**
   * Renders the custom timeline item: a record-type marker plus a label that
   * overflows to the right, layered over an uncertainty bar. Point kinds keep
   * the marker+label in flow so vis-timeline stacks items by label width;
   * range kinds size the bar to the time span and layer gradient caps behind
   * a label that also drives the stacking width.
   *
   * @param {object} item - vis-timeline item object.
   * @returns {string} HTML string for the item content.
   */
  _template(item) {
    const kind = item.temporalKind || "exact";
    const scaled = kind === "range" || kind === "fuzzy-range";
    const labelMode = this.settings.labelMode || "full";
    const labelPos = this.settings.labelPosition || "bar";
    const labelText = escapeHtml(labelMode === "hidden" ? "" : item.content || "");
    const tooltip = escapeHtml(item.temporal?.label || item.title || item.content || "");

    const iconUrl = this._iconUrl(item.rectypeId);
    const marker = iconUrl
      ? `<img class="htl-marker" width="16" height="16" alt="" src="${escapeHtml(iconUrl)}" title="${tooltip}">`
      : `<span class="htl-marker htl-marker-blank"></span>`;
    const lead = `<span class="htl-lead">${marker}<span class="htl-label">${labelText}</span></span>`;
    const common = `htl-kind-${kind} heurist-label-${labelMode} heurist-label-pos-${labelPos}`;

    if (!scaled) {
      return `<span class="htl-item htl-point ${common}">` +
               `<span class="htl-fuzzy"></span>${lead}` +
             `</span>`;
    }

    const fuzzy = item.fuzzy || { headPct: 0, tailPct: 0 };
    const profileStart = Number(item.temporal?.profileStart) || 0;
    const profileEnd = Number(item.temporal?.profileEnd) || 0;
    const hasCaps = fuzzy.headPct > 0 || fuzzy.tailPct > 0;
    // No caps but a profile -> gradient the whole bar; caps -> solid middle.
    const bodyGrad = hasCaps ? 0 : profileStart || profileEnd;
    const head = fuzzy.headPct > 0
      ? `<span class="htl-cap htl-cap-start htl-grad-${profileStart}" style="width:${fuzzy.headPct}%"></span>`
      : "";
    const tail = fuzzy.tailPct > 0
      ? `<span class="htl-cap htl-cap-end htl-grad-${profileEnd}" style="width:${fuzzy.tailPct}%"></span>`
      : "";

    return `<span class="htl-item htl-range ${common}">` +
             `<span class="htl-bar htl-grad-${bodyGrad}"></span>${head}${tail}${lead}` +
           `</span>`;
  }

  /**
   * Builds the Heurist record-type icon URL, or an empty string when the icon
   * cannot be resolved (missing base URL, database, or record-type id).
   *
   * @param {number|string|null|undefined} rectypeId - Record type identifier.
   * @returns {string} Icon URL or an empty string.
   */
  _iconUrl(rectypeId) {
    const base = this.settings.iconBaseUrl;
    const db = this.settings.database;
    if (!base || !db || rectypeId == null || rectypeId === "") return "";
    return `${base}?db=${encodeURIComponent(db)}&icon=${encodeURIComponent(rectypeId)}`;
  }
}

/**
 * Escapes HTML so content inserted in timeline labels stays safe.
 *
 * @param {string|number|undefined|null} value - Raw text.
 * @returns {string} Safe HTML string.
 */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

