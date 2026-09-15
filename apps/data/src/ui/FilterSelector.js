/**
 * @file FilterSelector.js
 * @brief Renders saved filters as Filtered Result search actions.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
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
  /**
   * @param {object} options Selector dependencies.
   * @param {object} options.api Data public API instance.
   * @param {HTMLElement} options.container Element to render the filter buttons into.
   * @param {Function|null} [options.loadFilter] Called with a filter ID to lazily load its full definition (query).
   * @param {Function|null} [options.onLoading] Called with a filter ID before it starts loading.
   * @param {Function|null} [options.onLoaded] Called with the loaded filter once available.
   * @param {Function|null} [options.onError] Called with `(error, operation)` when activation fails.
   */
  constructor({
    api,
    container,
    loadFilter = null,
    onLoading = null,
    onLoaded = null,
    onError = null,
  }) {
    this.api = api;
    this.container = container;
    this.loadFilter = loadFilter;
    this.onLoading = onLoading;
    this.onLoaded = onLoaded;
    this.onError = onError;
    this.loaded = new Map();
  }

  /**
   * Render one button per filter, or an empty-state message when there are none.
   *
   * @param {Array<{id: number, title: string}>} filters Filters to list.
   * @returns {void}
   */
  render(filters) {
    this.container.replaceChildren();
    for (const filter of filters) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "heurist-data-filter-row";
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
      empty.className = "heurist-data-empty";
      empty.classList.add("h-i18n");
      empty.textContent = $HR("No filters");
      this.container.append(empty);
    }
  }

  /**
   * Activate a filter, lazily loading its full definition (query) first if needed.
   *
   * @param {{id: number, title: string, query?: *}} filter Filter to activate; may be a lightweight list entry.
   * @returns {Promise<void>}
   */
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
