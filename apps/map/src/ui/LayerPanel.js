/**
 * @file LayerPanel.js
 * @brief Renders ordered layers for the active MapDocument.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { LayerPanelItem } from './LayerPanelItem.js';
import { $HR } from '#shared/ui';

/** Renders the ordered list of layers belonging to the active MapDocument. */
export class LayerPanel {
  /**
   * @param {object} options
   * @param {object} options.api Map's public API.
   * @param {HTMLElement} options.container Element the layer list renders into.
   * @param {boolean} [options.editingEnabled] Whether layer editing controls are shown.
   * @param {boolean} [options.symbologyEditingEnabled] Whether symbology editing controls are shown.
   * @param {Function|null} [options.onEditLayer] Callback invoked to edit a layer.
   * @param {boolean} [options.showLegend] Whether each layer shows its legend.
   * @param {boolean} [options.showWorkspaceActions] Whether workspace-only actions are shown.
   */
  constructor({ api, container, editingEnabled = false, symbologyEditingEnabled = false, onEditLayer = null, showLegend = true, showWorkspaceActions = true }) {
    this.api = api;
    this.container = container;
    this.editingEnabled = editingEnabled;
    this.onEditLayer = onEditLayer;
    this.symbologyEditingEnabled = symbologyEditingEnabled;
    this.showLegend = showLegend !== false;
    this.showWorkspaceActions = showWorkspaceActions !== false;
  }

  /**
   * Render the layer list.
   *
   * @param {Array<object>} layers Layers belonging to the active MapDocument.
   * @param {{loading?: boolean}} [options] `loading` shows a loading placeholder instead of "No layers".
   * @returns {void}
   */
  render(layers, { loading = false } = {}) {
    this.container.replaceChildren();
    for (const layer of layers) {
      this.container.append(new LayerPanelItem({
        api: this.api,
        layer,
        editingEnabled: this.editingEnabled,
        symbologyEditingEnabled: this.symbologyEditingEnabled,
        onEditLayer: this.onEditLayer,
        showLegend: this.showLegend,
        showWorkspaceActions: this.showWorkspaceActions
      }).element);
    }
    if (!layers.length) {
      const e = document.createElement('div');
      e.className = 'heurist-map-empty';
      e.classList.add('h-i18n');
      e.textContent = $HR(loading ? 'Loading...' : 'No layers');
      this.container.append(e);
    }
  }
}
