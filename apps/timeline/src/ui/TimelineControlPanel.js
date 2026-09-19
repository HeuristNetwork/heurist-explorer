/**
 * @file TimelineControlPanel.js
 * @brief Timeline-specific DocumentControlPanel wiring the layer panel and messaging.
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

import { DocumentControlPanel } from '#shared/ui/documents/DocumentControlPanel.js';
import { TimelineLayerPanel } from './TimelineLayerPanel.js';
import { showTimelineMessage } from './timelineMessages.js';

/** Timeline-specific DocumentControlPanel wiring the layer panel and messaging. */
export class TimelineControlPanel extends DocumentControlPanel {
  constructor({ api, container, options = {} }) {
    super({ api, mapContainer: container, options: { ...options, showBaseMaps: false, showHomeControl: false },
      moduleName: 'timeline', LayerPanel: TimelineLayerPanel, showMessage: showTimelineMessage });
  }
}
