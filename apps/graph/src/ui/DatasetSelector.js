/**
 * @file DatasetSelector.js
 * @brief Renders Filtered Result and available persisted datasets.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { $HR, applyI18n } from "#shared/ui";
/** Renders Filtered Result and persisted Dataset choices. */
export class DatasetSelector {
  /**
   * @param {object} options Selector dependencies.
   * @param {object} options.api Graph public API instance.
   * @param {HTMLElement} options.container Element to render the dataset rows into.
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
   * Render the Filtered Result row (optional) and one row per dataset.
   *
   * @param {Array<{id: number, title: string}>} datasets Datasets to list.
   * @param {number|string|null} activeId Currently active dataset ID, if any.
   * @param {boolean} currentResultsActive Whether Filtered Result is the active source.
   * @param {object} [options] Display options.
   * @param {boolean} [options.showCurrentResults] Whether to render the Filtered Result row.
   * @param {string} [options.currentResultsTitle] Label for the Filtered Result row.
   * @param {boolean} [options.mainMode] Replace the Filtered Result row's radio with a pin toggle
   *        (main runtime: the row reflects a host-pushed DataSource, not a selectable choice).
   * @param {boolean} [options.pinned] Current pinned state, when `mainMode` is set.
   * @param {Function} [options.onTogglePin] Called when the pin toggle is clicked, when `mainMode` is set.
   * @returns {void}
   */
  render(
    datasets,
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
    for (const dataset of datasets) {
      this.container.append(
        row(dataset, String(dataset.id) === String(activeId), () => {
          void Promise.resolve(this.api.setDataset(dataset.id)).catch((error) =>
            this.onError?.(error, "set-dataset"),
          );
        }, this.classPrefix),
      );
    }
    applyI18n(this.container);
  }
}

/**
 * Build a row for one dataset (or the Filtered Result entry): a radio button that
 * activates it, or - when `pin` is set - a pin/unpin toggle that instead sticks the
 * active DataSource against inbound host pushes (see `GraphControlPanel`).
 */
function row(item, active, activate, classPrefix = "heurist-data", pin = null) {
  const label = document.createElement("label");
  const wrapper = document.createElement("div");
  wrapper.className = `${classPrefix}-selector-row${active ? " active" : ""}`;
  label.className = "heurist-data-dataset";
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
    control.name = "heurist-data-dataset";
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
