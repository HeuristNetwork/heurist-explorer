/**
 * @file createHInput.js
 * @brief Factory for the shared filter and edit input widgets.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HInputText } from './HInputText.js';
import { HInputNumeric } from './HInputNumeric.js';
import { HInputEnum } from './HInputEnum.js';
import { HInputDate } from './HInputDate.js';
import { HInputGeo } from './HInputGeo.js';

const TYPES = {
  text: HInputText,
  freetext: HInputText,
  blocktext: HInputText,
  url: HInputText,
  numeric: HInputNumeric,
  integer: HInputNumeric,
  float: HInputNumeric,
  year: HInputNumeric,
  enum: HInputEnum,
  relationtype: HInputEnum,
  date: HInputDate,
  geo: HInputGeo
};

/**
 * Create and render an input for a known type.
 *
 * @param {string} type Field or widget type.
 * @param {HTMLElement} host Input host.
 * @param {object} options Input options.
 * @returns {HInput} Rendered input.
 */
export function createHInput(type, host, options = {}) {
  const InputClass = TYPES[type];
  if (!InputClass) throw new Error(`Unsupported input type: ${type}`);
  return new InputClass().attach(host, options).render();
}
