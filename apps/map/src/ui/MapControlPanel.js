/**
 * @file MapControlPanel.js
 * @brief Map-specific DocumentControlPanel wiring layers, base maps and messaging.
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

import { DocumentControlPanel } from '#shared/ui/documents/DocumentControlPanel.js';
import { LayerPanel } from './LayerPanel.js';
import { BaseMapSelector } from './BaseMapSelector.js';
import { showMapMessage } from './mapMessages.js';

/** Map-specific DocumentControlPanel wiring layers, base maps and messaging. */
export class MapControlPanel extends DocumentControlPanel {
  constructor(options) { super({ ...options, LayerPanel, BaseMapSelector, showMessage: showMapMessage }); }
}
