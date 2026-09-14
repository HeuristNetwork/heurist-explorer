/** LayerPanel.js - Render ordered layers for the active MapDocument. */
import { LayerPanelItem } from './LayerPanelItem.js';
import { $HR } from '#shared/ui';
export class LayerPanel {
  constructor({ api, container, editingEnabled = false, symbologyEditingEnabled = false, onEditLayer = null, showLegend = true, showWorkspaceActions = true }) {
    this.api = api;
    this.container = container;
    this.editingEnabled = editingEnabled;
    this.onEditLayer = onEditLayer;
    this.symbologyEditingEnabled = symbologyEditingEnabled;
    this.showLegend = showLegend !== false;
    this.showWorkspaceActions = showWorkspaceActions !== false;
  }
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
