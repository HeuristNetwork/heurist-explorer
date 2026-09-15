/**
 * @file NavControls.js
 * @brief Custom pan/zoom overlay for the vis-network canvas.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 *
 * vis-network's built-in `interaction.navigationButtons` renders its glyphs as
 * baked-in PNG background images, so they can be neither recoloured nor
 * individually toggled. This overlay replaces them with Font Awesome buttons
 * (styled by `.heurist-graph-nav` in style.css) driving the same Network API,
 * and lets the "Native controls -> Zoom / Pan" configuration toggles actually
 * hide their button groups.
 */

import { $HR } from "#shared/ui";

const ZOOM_STEP = 1.2;
const PAN_STEP = 80; // canvas pixels per press

/** One button: `<button><span class="fa-solid fa-*"></span></button>`. */
function navButton(iconClass, title, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "heurist-graph-nav-button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML = `<span class="fa-solid ${iconClass}" aria-hidden="true"></span>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

export class NavControls {
  /**
   * @param {HTMLElement} container - the same element the Network is mounted in.
   * @param {import("vis-network/standalone").Network} network
   */
  constructor(container, network, onRearrange = () => {}) {
    this.network = network;
    this.root = document.createElement("div");
    this.root.className = "heurist-graph-nav";

    this.panGroup = document.createElement("div");
    this.panGroup.className = "heurist-graph-nav-group heurist-graph-nav-pan";
    // Arrow direction = camera movement direction; vis-network's y axis points
    // down, so "up" is a negative y step.
    this.panGroup.append(
      navButton("fa-chevron-up", "Pan up", () => this.#pan(0, -PAN_STEP)),
      navButton("fa-chevron-left", "Pan left", () => this.#pan(-PAN_STEP, 0)),
      navButton("fa-chevron-right", "Pan right", () => this.#pan(PAN_STEP, 0)),
      navButton("fa-chevron-down", "Pan down", () => this.#pan(0, PAN_STEP)),
    );

    this.zoomGroup = document.createElement("div");
    this.zoomGroup.className = "heurist-graph-nav-group heurist-graph-nav-zoom";
    this.zoomGroup.append(
      navButton("fa-plus", "Zoom in", () => this.#zoom(ZOOM_STEP)),
      navButton("fa-minus", "Zoom out", () => this.#zoom(1 / ZOOM_STEP)),
      navButton("fa-expand", "Fit graph", () => this.#fit()),
    );

    this.rearrangeButton = navButton("fa-rotate-right", $HR("Rearrange"), onRearrange);
    this.bottomGroup = document.createElement("div");
    this.bottomGroup.className = "heurist-graph-nav-bottom";
    this.bottomGroup.append(this.zoomGroup, this.rearrangeButton);
    this.root.append(this.panGroup, this.bottomGroup);
    container.appendChild(this.root);
  }

  /**
   * Show/hide the pan and zoom groups. Both default to visible so an omitted
   * flag keeps the previous behaviour.
   * @param {{zoom?: boolean, pan?: boolean}} [nativeControls]
   */
  setVisibility(nativeControls = {}) {
    const showZoom = nativeControls.zoom !== false;
    const showPan = nativeControls.pan !== false;
    this.zoomGroup.hidden = !showZoom;
    this.panGroup.hidden = !showPan;
    const showRearrange = nativeControls.rearrange !== false;
    this.rearrangeButton.hidden = !showRearrange;
    this.bottomGroup.hidden = !showZoom && !showRearrange;
    this.root.hidden = !showZoom && !showPan && !showRearrange;
  }

  #zoom(factor) {
    if (!this.network) return;
    const scale = this.network.getScale() * factor;
    this.network.moveTo({ scale, animation: { duration: 150 } });
  }

  #pan(dx, dy) {
    if (!this.network) return;
    const { x, y } = this.network.getViewPosition();
    const scale = this.network.getScale() || 1;
    // getViewPosition is in graph coordinates; convert the pixel step.
    this.network.moveTo({
      position: { x: x + dx / scale, y: y + dy / scale },
      animation: { duration: 150 },
    });
  }

  #fit() {
    this.network?.fit({ animation: { duration: 250 } });
  }

  destroy() {
    this.root?.remove();
    this.root = null;
    this.network = null;
  }
}
