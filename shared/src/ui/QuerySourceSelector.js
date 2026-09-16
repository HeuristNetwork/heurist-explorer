/**
 * @file QuerySourceSelector.js
 * @brief Renders Filtered Result and available persisted Query Sources.
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
import { $HR, applyI18n } from "./i18n/HResource.js";

/** Renders Filtered Result and persisted Query Source choices. */
export class QuerySourceSelector {
  /**
   * @param {object} options Selector dependencies.
   * @param {object} options.api Host application's public API instance.
   * @param {HTMLElement} options.container Element to render the Query Source rows into.
   * @param {Function|null} [options.onError] Called with `(error, operation)` when activation fails.
   * @param {string} [options.classPrefix='heurist-data'] Class-name prefix applied to generated row elements.
   */
  constructor({ api, container, onError = null, classPrefix = "heurist-data" }) {
    this.api = api;
    this.container = container;
    this.onError = onError;
    this.classPrefix = classPrefix;
  }

  /**
   * Render the Filtered Result row (optional) and one row per Query Source.
   *
   * @param {Array<{id: number, title: string}>} querySources Query Sources to list.
   * @param {number|string|null} activeId Currently active Query Source ID, if any.
   * @param {boolean} currentResultsActive Whether Filtered Result is the active source.
   * @param {object} [options] Display options.
   * @param {boolean} [options.showCurrentResults=true] Whether to render the Filtered Result row.
   * @param {string} [options.currentResultsTitle='Filtered Result'] Label for the Filtered Result row.
   * @param {boolean} [options.mainMode] Replace the Filtered Result row's radio with a pin toggle
   *        (main runtime: the row reflects a host-pushed DataSource, not a selectable choice).
   * @param {boolean} [options.pinned] Current pinned state, when `mainMode` is set.
   * @param {Function} [options.onTogglePin] Called when the pin toggle is clicked, when `mainMode` is set.
   * @returns {void}
   */
  render(
    querySources,
    activeId,
    currentResultsActive,
    {
      showCurrentResults = true,
      currentResultsTitle = "Filtered Result",
      mainMode = false,
      pinned = false,
      onTogglePin = null,
    } = {},
  ) {
    this.container.replaceChildren();
    if (showCurrentResults) {
      this.container.append(
        row(
          {
            id: null,
            title: currentResultsTitle,
            i18n: currentResultsTitle === "Filtered Result",
          },
          currentResultsActive,
          () => {
            void Promise.resolve(this.api.activateCurrentResults()).catch(
              (error) => this.onError?.(error, "activate-current-results"),
            );
          },
          this.classPrefix,
          mainMode ? { pinned, onTogglePin } : null,
        ),
      );
    }
    for (const querySource of querySources) {
      this.container.append(
        row(querySource, String(querySource.id) === String(activeId), () => {
          void Promise.resolve(this.api.setQuerySource(querySource.id)).catch((error) =>
            this.onError?.(error, "set-query-source"),
          );
        }, this.classPrefix),
      );
    }
    applyI18n(this.container);
  }
}

/**
 * Build a row for one Query Source (or the Filtered Result entry): a radio button that
 * activates it, or - when `pin` is set - a pin/unpin toggle that instead sticks the
 * active DataSource against inbound host pushes (see `GraphControlPanel`).
 */
function row(item, active, activate, classPrefix = "heurist-data", pin = null) {
  const label = document.createElement("label");
  const wrapper = document.createElement("div");
  wrapper.className = `${classPrefix}-selector-row${active ? " active" : ""}`;
  label.className = `${classPrefix}-query-source`;
  let control;
  if (pin) {
    control = document.createElement("button");
    control.type = "button";
    control.className = "heurist-icon-button heurist-graph-pin-toggle";
    control.classList.toggle("pinned", Boolean(pin.pinned));
    control.title = $HR(pin.pinned ? "Unstick current data" : "Stick current data");
    control.setAttribute("aria-pressed", String(Boolean(pin.pinned)));
    control.setAttribute("aria-label", control.title);
    control.innerHTML = `<span class="fa-solid ${pin.pinned ? "fa-thumbtack-slash" : "fa-thumbtack"}" aria-hidden="true"></span>`;
    control.addEventListener("click", (event) => {
      event.stopPropagation();
      pin.onTogglePin?.();
    });
  } else {
    control = document.createElement("input");
    control.type = "radio"; control.classList.add("h-checkbox");
    control.name = `${classPrefix}-query-source`;
    control.checked = active;
    control.addEventListener("change", () => {
      if (control.checked) activate();
    });
  }
  const title = document.createElement("span");
  if (item.i18n) title.classList.add("h-i18n");
  title.textContent = item.title;
  label.append(control, title);
  wrapper.append(label);
  return wrapper;
}
