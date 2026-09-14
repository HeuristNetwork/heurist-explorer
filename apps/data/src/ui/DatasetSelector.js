/**
 * @file DatasetSelector.js
 * @brief Renders Filtered Result and available persisted datasets.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
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
  constructor({ api, container, onError = null }) {
    this.api = api;
    this.container = container;
    this.onError = onError;
  }

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
        ),
      );
    }
    for (const dataset of datasets) {
      this.container.append(
        row(dataset, String(dataset.id) === String(activeId), () => {
          void Promise.resolve(this.api.setDataset(dataset.id)).catch((error) =>
            this.onError?.(error, "set-dataset"),
          );
        }),
      );
    }
    applyI18n(this.container);
  }
}

function row(item, active, activate) {
  const label = document.createElement("label");
  label.className = `heurist-data-selector-row${active ? " active" : ""}`;
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "heurist-data-dataset";
  input.checked = active;
  input.addEventListener("change", () => {
    if (input.checked) activate();
  });
  const title = document.createElement("span");
  if (item.i18n) title.classList.add("h-i18n");
  title.textContent = item.title;
  label.append(input, title);
  return label;
}
