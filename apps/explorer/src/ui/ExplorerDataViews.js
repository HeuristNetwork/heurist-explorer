/**
 * @file ExplorerDataViews.js
 * @brief Compact list of open heurist-data module instances in the Explorer workspace.
 *
 * It is a view only: module discovery/activation remain in LayoutManager.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR, applyI18n } from '#shared/ui';
import { dataSourceTitle as resolvedDataSourceTitle } from '../core/DataSource.js';

/** Compact list of open heurist-data module instances in the Explorer workspace. */
export class ExplorerDataViews {
  /**
   * @param {object} options View configuration.
   * @param {import('../core/ExplorerApplication.js').ExplorerApplication} options.application Explorer application controller.
   * @param {Function|null} [options.onSelect] Called with the selected module when a row is clicked.
   */
  constructor({ application, onSelect = null } = {}) {
    this.application = application;
    this.onSelect = onSelect;
    this.element = null;
  }

  /**
   * Create the list element and render its initial content.
   *
   * @param {HTMLElement} parent Parent element to mount into.
   * @returns {HTMLElement} The generated list element.
   */
  mount(parent) {
    this.element = document.createElement('div');
    this.element.className = 'h-explorer-data-view-list';
    parent.replaceChildren(this.element);
    this.render();
    return this.element;
  }

  /**
   * Re-render the list of open data views from the current layout.
   *
   * @returns {ExplorerDataViews} This instance, for chaining.
   */
  render() {
    if (!this.element) return this;
    this.element.replaceChildren();
    const views = this.application?.layout?.findDataModules?.() || [];

    if (!views.length) {
      const empty = document.createElement('div');
      empty.className = 'h-explorer-panel-empty h-i18n';
      empty.textContent = 'No data views are open';
      this.element.append(empty);
      applyI18n(this.element);
      return this;
    }

    for (const module of views) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'h-explorer-data-view-row';
      row.dataset.moduleId = module.id;

      const title = document.createElement('span');
      title.className = 'h-explorer-data-view-title';
      title.textContent = module.settings?.title || module.id;

      const source = document.createElement('span');
      source.className = 'h-explorer-data-view-source';
      source.textContent = dataSourceTitle(module.dataSource);

      row.append(title, source);
      row.addEventListener('click', async () => {
        this.application?.layout?.activateModule?.(module.id);
        await this.application?.focusModule?.(module.id);
        this.onSelect?.(module);
        this.element.dispatchEvent(new CustomEvent('dataviewselect', {
          bubbles: true,
          detail: { module }
        }));
      });
      this.element.append(row);
    }
    return this;
  }

  /**
   * Remove the generated list element.
   *
   * @returns {void}
   */
  destroy() {
    this.element?.remove();
    this.element = null;
  }
}

/** Resolve a display title for a data view's active source, with generic fallbacks by reference type. */
function dataSourceTitle(source) {
  if (!source) return $HR('No source');
  const title = resolvedDataSourceTitle(source);
  if (title) return title;
  if (source.reference?.type === 'query' || source.reference?.type === 'recordtype') return $HR('Current result');
  if (source.reference?.type === 'filter') return $HR('Filter');
  if (source.reference?.type === 'source') return $HR('Source');
  return $HR('Data source');
}
