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
import { applyI18n } from "#shared/ui";
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
   * @param {{showCurrentResults?: boolean, currentResultsTitle?: string}} [options] Display options.
   * @returns {void}
   */
  render(
    datasets,
    activeId,
    currentResultsActive,
    { showCurrentResults = true, currentResultsTitle = "Filtered Result" } = {},
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

/** Build a radio-button row for one dataset (or the Filtered Result entry). */
function row(item, active, activate, classPrefix = "heurist-data") {
  const label = document.createElement("label");
  const wrapper = document.createElement("div");
  wrapper.className = `${classPrefix}-selector-row${active ? " active" : ""}`;
  label.className = "heurist-data-dataset";
  const input = document.createElement("input");
  input.type = "radio"; input.classList.add("h-checkbox");
  input.name = "heurist-data-dataset";
  input.checked = active;
  input.addEventListener("change", () => {
    if (input.checked) activate();
  });
  const title = document.createElement("span");
  if (item.i18n) title.classList.add("h-i18n");
  title.textContent = item.title;
  label.append(input, title);
  wrapper.append(label);
  return wrapper;
}
