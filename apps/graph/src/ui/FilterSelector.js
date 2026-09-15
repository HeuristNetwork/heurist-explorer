/**
 * @file FilterSelector.js
 * @brief Renders saved filters as Filtered Result search actions.
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
import { $HR } from "#shared/ui";
/** Renders saved filters as selectable actions. */
export class FilterSelector {
  constructor({
    api,
    container,
    loadFilter = null,
    onLoading = null,
    onLoaded = null,
    onError = null,
    classPrefix = "heurist-data",
  }) {
    this.api = api;
    this.container = container;
    this.loadFilter = loadFilter;
    this.onLoading = onLoading;
    this.onLoaded = onLoaded;
    this.onError = onError;
    this.classPrefix = classPrefix;
    this.loaded = new Map();
  }

  render(filters) {
    this.container.replaceChildren();
    for (const filter of filters) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `${this.classPrefix}-filter-row h-menu-item`;
      button.textContent = filter.title;
      button.title = `${$HR("Apply")} ${filter.title}`;
      button.addEventListener("click", () => {
        void this.activate(filter).catch((error) =>
          this.onError?.(error, "activate-filter"),
        );
      });
      this.container.append(button);
    }
    if (!filters.length) {
      const empty = document.createElement("div");
      empty.className = `${this.classPrefix}-empty`;
      empty.classList.add("h-i18n");
      empty.textContent = $HR("No filters");
      this.container.append(empty);
    }
  }

  async activate(filter) {
    let selected = this.loaded.get(Number(filter.id)) || filter;
    if (selected.query == null && this.loadFilter) {
      this.onLoading?.(filter.id);
      selected = await this.loadFilter(filter.id);
      if (selected) this.loaded.set(Number(filter.id), selected);
      this.onLoaded?.(selected);
    }
    if (selected) await this.api.activateFilter(selected);
  }
}
