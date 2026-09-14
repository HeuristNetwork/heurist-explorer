import { $HR } from '#shared/ui';
import { TimelineConfigurationDialog } from './TimelineConfigurationDialog.js';
import { showTimelineMessage } from './timelineMessages.js';
/**
 * @file TimelineToolbar.js
 * @brief Provides the toolbar UI for the timeline viewport and navigation commands.
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/**
 * Provides the floating toolbar used to control the display and viewport of the timeline.
 */
export class TimelineToolbar {
  /**
   * Constructs a toolbar wrapper for the supplied public API.
   *
   * @param {{ api: object, settings: object }} options - API handle and settings object.
   */
  constructor({ api, settings }) {
    this.api = api;
    this.settings = settings;
    this.element = null;
  }

  /**
   * Mounts the toolbar into the DOM before the timeline container.
   *
   * @param {HTMLElement} container - The main timeline container.
   */
  mount(container) {
    if (this.settings.showToolbar === false) return;

    const bar = document.createElement("div");
    bar.className = "heurist-timeline-toolbar h-widget h-toolbar";

    const buttons = [
      ["fa-plus", "Zoom in", () => this.api.zoomIn()],
      ["fa-minus", "Zoom out", () => this.api.zoomOut()],
      ["fa-expand", "Zoom to all", () => this.api.zoomToAll()],
      ["fa-crosshairs", "Zoom to selection", () => this.api.zoomToSelection()],
      ["fa-chevron-left", "Move to start", () => this.api.moveToStart()],
      ["fa-chevron-right", "Move to end", () => this.api.moveToEnd()],
      ["fa-gear", "Timeline options", () => this._openOptions()],
      ["fa-tag", "Label options", () => this._cycleLabelMode()],
    ];

    for (const [icon, title, handler] of buttons) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "heurist-icon-button";
      button.title = $HR(title);
      button.setAttribute("aria-label", $HR(title));
      button.innerHTML = `<i class="fa-solid ${icon}"></i>`;
      button.addEventListener("click", () => {
        Promise.resolve().then(handler).catch(error => showTimelineMessage(error, { error: true }));
      });
      bar.appendChild(button);
      if (icon === "fa-tag") this.labelButton = button;
    }

    this._syncLabelButton(this.settings.labelMode || "full");
    container.parentElement?.insertBefore(bar, container);
    this.element = bar;
    this.optionsHandler = event => this._syncLabelButton(event.detail.labelMode);
    this.api.addEventListener("heurist-timeline-options-changed", this.optionsHandler);
  }

  /**
   * Cycles the label display mode (full -> truncated -> hidden) and refreshes
   * the button hint.
   */
  _openOptions() {
    this.configurationDialog ||= new TimelineConfigurationDialog({ api: this.api });
    this.configurationDialog.open();
  }

  _cycleLabelMode() {
    this._syncLabelButton(this.api.cycleLabelMode());
  }

  /**
   * Updates the label button tooltip to describe the current mode and the next
   * click.
   *
   * @param {string} mode - The active label mode.
   */
  _syncLabelButton(mode) {
    const hints = {
      full: "Labels: full length — click to truncate",
      truncate: "Labels: truncated — click to hide",
      hidden: "Labels: hidden — click to show full length",
    };
    if (this.labelButton) this.labelButton.title = hints[mode] || "Label options";
  }

  /**
   * Removes the toolbar from the DOM.
   */
  destroy() {
    this.configurationDialog?.close();
    if (this.optionsHandler) this.api.removeEventListener("heurist-timeline-options-changed", this.optionsHandler);
    this.element?.remove();
    this.element = null;
  }
}

