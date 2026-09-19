/**
 * @file HTimeFieldSelector.js
 * @brief Direct/linked date and year field selector used by Timeline Query Source profile.
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

import { HFieldSelectionEditor } from './HFieldSelectionEditor.js';

/** Direct/linked date and year field selector used by Timeline Query Source profile. */
export class HTimeFieldSelector extends HFieldSelectionEditor {
  /** @param {object} [options] Forwarded to HFieldSelectionEditor; `title` and the date/year selection settings are fixed. */
  constructor(options = {}) {
    super({ ...options, title: 'Time fields', selectableTypes: ['date', 'year'], hideUnselectable: true, allowReorder: false, showSort: false });
  }
}
