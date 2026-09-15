import { DocumentControlPanel } from '#shared/ui/documents/DocumentControlPanel.js';
import { TimelineLayerPanel } from './TimelineLayerPanel.js';
import { showTimelineMessage } from './timelineMessages.js';
export class TimelineControlPanel extends DocumentControlPanel {
  constructor({ api, container, options = {} }) {
    super({ api, mapContainer: container, options: { ...options, showBaseMaps: false, showHomeControl: false },
      moduleName: 'timeline', LayerPanel: TimelineLayerPanel, showMessage: showTimelineMessage });
  }
}
