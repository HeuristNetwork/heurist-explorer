/**
 * @file TimelineControlPanel.js
 * @brief Floating control panel exposing zoom, navigation, and options commands for the timeline.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { TimelineConfigurationDialog } from './TimelineConfigurationDialog.js';
import { showTimelineMessage } from './timelineMessages.js';

/** Floating icon toolbar for timeline zoom, navigation, and options commands. */
export class TimelineControlPanel {
  /**
   * @param {{api: object, container: HTMLElement, options: object}} options Public API, host container, and panel options.
   */
  constructor({ api, container, options }) {
    this.api = api;
    this.container = container;
    this.options = options;
  }

  /**
   * Build the panel and insert it before the timeline container.
   *
   * @returns {TimelineControlPanel} This instance, for chaining.
   */
  mount() {
    this.element = document.createElement("div");
    this.element.className = "h-timeline-toolbar h-widget h-toolbar";
    this.element.innerHTML = `
      <button type="button" class="heurist-icon-button" data-action="zoom-in" title="Zoom in"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
      <button type="button" class="heurist-icon-button" data-action="zoom-out" title="Zoom out"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
      <button type="button" class="heurist-icon-button" data-action="all" title="Zoom to all"><i class="fa-solid fa-arrows-left-right-to-line"></i></button>
      <button type="button" class="heurist-icon-button" data-action="selection" title="Zoom to selection"><i class="fa-solid fa-crosshairs"></i></button>
      <button type="button" class="heurist-icon-button" data-action="start" title="Move to start"><i class="fa-solid fa-backward-step"></i></button>
      <button type="button" class="heurist-icon-button" data-action="end" title="Move to end"><i class="fa-solid fa-forward-step"></i></button>
      <button type="button" class="heurist-icon-button" data-action="options" title="Timeline options"><i class="fa-solid fa-gear"></i></button>`;
    this.container.parentElement.insertBefore(this.element, this.container);
    this.element.addEventListener("click", (e) => {
      Promise.resolve().then(() => this._action(e)).catch((error) => showTimelineMessage(error, { error: true }));
    });
    return this;
  }

  /**
   * Dispatch a click on one of the panel's buttons to the matching API call.
   *
   * @private
   * @param {MouseEvent} event Click event from the panel.
   * @returns {*} Result of the dispatched API call, if any.
   */
  _action(event) {
    const action = event.target.closest("button")?.dataset.action;
    if (!action) return;
    if (action === "zoom-in") return this.api.zoomIn();
    else if (action === "zoom-out") return this.api.zoomOut();
    else if (action === "all") return this.api.zoomToAll();
    else if (action === "selection") return this.api.zoomToSelection();
    else if (action === "start") return this.api.moveToStart();
    else if (action === "end") return this.api.moveToEnd();
    else if (action === "options") return this._openOptions();
  }

  /**
   * Open the timeline configuration dialog, creating it on first use.
   *
   * @private
   * @returns {void}
   */
  _openOptions() {
    this.configurationDialog ||= new TimelineConfigurationDialog({ api: this.api });
    this.configurationDialog.open();
  }

  /**
   * Remove the panel (and any open configuration dialog) from the document.
   *
   * @returns {void}
   */
  destroy() {
    this.configurationDialog?.close();
    this.element?.remove();
  }
}
