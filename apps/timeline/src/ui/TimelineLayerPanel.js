/**
 * @file TimelineLayerPanel.js
 * @brief Renders the timeline's document bands as a layer panel, mirroring the map layer panel.
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

import { sourceAction, showDataAction } from '#shared/ui/documents/SourceActions.js';
import { showTimelineMessage } from './timelineMessages.js';

/**
 * Renders the active document's bands as layer-panel rows.
 *
 * Band rows retain record actions when no dated items were found.
 */
export class TimelineLayerPanel {
  /**
   * @param {object} options Panel dependencies, assigned directly onto the instance
   *        (`api`, `container`, `editingEnabled`, etc.), matching the map `LayerPanel` shape.
   */
  constructor(options) { Object.assign(this, options); }

  /**
   * Render the band list.
   *
   * @param {Array<object>} layers Bands of the active document, in the layer-panel shape
   *        returned by `TimelineDocumentApplication#getLayers`.
   * @returns {void}
   */
  render(layers) {
    this.container.replaceChildren();
    const report = (error) => showTimelineMessage(error, { error: true });
    for (const layer of layers) {
      const empty = layer.loadState === 'loaded' && layer.count === 0;
      const row = element('div', 'heurist-map-layer-row');
      row.dataset.layerId = layer.id;
      row.classList.toggle('heurist-map-layer-empty', empty);
      row.classList.toggle('heurist-map-layer-active-datasource', layer.activeDataSource);
      const header = element('div', 'heurist-map-layer-header');
      const main = element('div', 'heurist-map-row-main');
      let control;
      if (layer.loadState === 'loading') {
        control = element('span', 'heurist-map-spinner');
        control.title = 'Loading band';
      } else if (layer.loadState === 'error') {
        control = sourceAction('fa-solid fa-triangle-exclamation', layer.error?.message || 'Retry loading band', () => this.api.reloadLayer(layer.id), report);
      } else {
        control = element('input', 'h-checkbox');
        control.type = 'checkbox';
        control.checked = layer.visible;
        control.disabled = empty && layer.id !== 'current-results';
        control.setAttribute('aria-label', `Show ${layer.title}`);
        control.addEventListener('change', () => Promise.resolve(this.api.setLayerVisibility(layer.id, control.checked)).catch(report));
      }
      const block = element('span', 'heurist-map-layer-title-block');
      const title = element('span', 'heurist-map-layer-title');
      title.textContent = layer.title;
      title.title = layer.loadState === 'loaded' ? `${layer.count} timeline items` : 'Band has not been loaded';
      if (empty) title.title = layer.partial ? 'No timeline items found in the loaded results.' : 'No timeline items found.';
      if (empty && layer.options?.dataSource) title.title += ' Records are still available through Show Data.';
      block.append(title);
      if (layer.partial) {
        const warning = element('small', 'heurist-map-layer-partial-warning');
        warning.textContent = 'Partial load: only part of the result set was loaded.';
        block.append(warning);
      }
      main.append(control, block);
      const actions = element('span', 'heurist-map-row-actions');
      if (this.api.getHostCapabilities().showDatasource && layer.options?.dataSource) actions.append(showDataAction(this.api, layer.id, report));
      if (this.editingEnabled && layer.recordId) actions.append(sourceAction('fa-solid fa-pencil', 'Edit layer', () => this.api.requestEditLayer(layer.id), report));
      if (this.api.getHostCapabilities().explorerWorkspace && layer.options?.dataSource) {
        if (layer.workspaceEntry) actions.append(sourceAction('fa-regular fa-circle-xmark', 'Remove from workspace', () => this.api.removeLayerFromWorkspace(layer.id), report));
        else actions.append(sourceAction('fa-regular fa-object-group', 'Add to workspace', () => this.api.addLayerToWorkspace(layer.id), report));
      }
      header.append(main, actions);
      row.append(header);
      this.container.append(row);
    }
  }
}
/**
 * Create an element with the given tag and class name.
 *
 * @param {string} tag Element tag name.
 * @param {string} className CSS class name.
 * @returns {HTMLElement} The created element.
 */
function element(tag, className) { const node = document.createElement(tag); node.className = className; return node; }
