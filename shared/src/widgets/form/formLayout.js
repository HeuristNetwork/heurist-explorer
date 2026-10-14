/**
 * @file formLayout.js
 * @brief Layout options of edit forms (plan 18), shared by the record editor and the
 *        symbology editors: where the labels are and how the fields are placed.
 *
 * - `labelPos`: `inline` (label left of its input), `above`, or `auto` (inline when
 *   the form is wide enough, otherwise above - a container query);
 * - `inputPos`: `stack` (one field per line, default) or `flow` (fields side by side
 *   within a group, wrapping when the width ends).
 *
 * The form root gets the classes; a field is an element with `h-form-layout-field`
 * whose label part has `h-form-layout-label` (everything else is the value part), and
 * fields are grouped in elements with `h-form-layout-group`.
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

import './formLayout.css';

export const LABEL_POSITIONS = Object.freeze(['inline', 'above', 'auto']);
export const INPUT_POSITIONS = Object.freeze(['flow', 'stack']);

/** Class of a field, of its label part and of a group of fields. */
export const FORM_FIELD_CLASS = 'h-form-layout-field';
export const FORM_LABEL_CLASS = 'h-form-layout-label';
export const FORM_GROUP_CLASS = 'h-form-layout-group';

/**
 * Set the layout classes on a form root (replacing earlier ones).
 *
 * @param {HTMLElement} root Form root.
 * @param {{labelPos?: string, inputPos?: string}} [options]
 * @returns {{labelPos: string, inputPos: string}} The applied options.
 */
export function applyFormLayout(root, { labelPos = 'auto', inputPos = 'stack' } = {}) {
  const label = LABEL_POSITIONS.includes(labelPos) ? labelPos : 'auto';
  const input = INPUT_POSITIONS.includes(inputPos) ? inputPos : 'stack';
  if (!root) return { labelPos: label, inputPos: input };
  root.classList.add('h-form-layout');
  for (const value of LABEL_POSITIONS) root.classList.toggle(`h-form-labels-${value}`, value === label);
  for (const value of INPUT_POSITIONS) root.classList.toggle(`h-form-inputs-${value}`, value === input);
  return { labelPos: label, inputPos: input };
}

/**
 * Mark a shared input (HInput: `.h-form-input` with its `.h-form-input-header`) as a
 * field of the form layout.
 *
 * @param {HTMLElement|null} element The input's `.h-form-input` element.
 * @returns {HTMLElement|null} The element.
 */
export function markInputField(element) {
  if (!element) return element;
  element.classList.add(FORM_FIELD_CLASS);
  [...(element.children || [])].find((child) => child.classList?.contains('h-form-input-header'))
    ?.classList.add(FORM_LABEL_CLASS);
  return element;
}
