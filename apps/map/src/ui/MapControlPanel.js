import { DocumentControlPanel } from '#shared/ui/documents/DocumentControlPanel.js';
import { LayerPanel } from './LayerPanel.js';
import { BaseMapSelector } from './BaseMapSelector.js';
import { showMapMessage } from './mapMessages.js';
export class MapControlPanel extends DocumentControlPanel {
  constructor(options) { super({ ...options, LayerPanel, BaseMapSelector, showMessage: showMapMessage }); }
}
