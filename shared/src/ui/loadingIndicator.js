/**
 * @file loadingIndicator.js
 * @brief "Loading…" / "Saving…" line with a rotating icon (`.h-spinner`, heurist-ui.css),
 *        shared by the record view, the record popups and the record editor (plan 23).
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

/**
 * Fill an element with the rotating icon and a text.
 *
 * @param {HTMLElement} element Element to fill (its content is replaced).
 * @param {string} text Text after the icon (already translated).
 * @returns {HTMLElement} The element, with class `h-loading`.
 */
export function fillLoading(element, text) {
  const spinner = document.createElement('span');
  spinner.className = 'h-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = text;
  element.classList.add('h-loading');
  element.replaceChildren(spinner, label);
  return element;
}

/**
 * A new `div` with the rotating icon and a text.
 *
 * @param {string} text Text after the icon (already translated).
 * @param {string} [className] Extra classes of the element.
 * @returns {HTMLDivElement}
 */
export function loadingIndicator(text, className = '') {
  const element = document.createElement('div');
  if (className) element.className = className;
  return fillLoading(element, text);
}
