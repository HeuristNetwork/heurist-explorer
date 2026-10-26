/**
 * @file accordion.js
 * @brief Collapsible sections (native details / summary): HEditForm groups and v4 website pages (plan 27a).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/**
 * A collapsible section with a label.
 *
 * @param {object} options
 * @param {string} options.label Text of the summary.
 * @param {boolean} [options.open] Initial state.
 * @param {string} [options.className] Class of the details element.
 * @param {function(EventTarget,string,Function):void} [options.listen] Adds a listener (a widget's `listen`).
 * @param {function(boolean):void} [options.onToggle] Called when the section opens or closes.
 * @returns {HTMLDetailsElement}
 */
export function createAccordion({ label, open = false, className = 'h-accordion', listen = null, onToggle = null }) {
  const details = document.createElement('details');
  details.className = className;
  details.open = open;
  const summary = document.createElement('summary');
  summary.textContent = label || '';
  details.append(summary);
  if (onToggle) {
    const on = listen || ((target, type, handler) => target.addEventListener(type, handler));
    on(details, 'toggle', () => onToggle(details.open));
  }
  return details;
}

/**
 * One open section at a time among the `details` children of a container.
 *
 * @param {HTMLElement} container Parent of the sections.
 * @param {function(EventTarget,string,Function):void} [listen] Adds a listener.
 * @returns {void}
 */
export function exclusiveAccordion(container, listen = null) {
  const on = listen || ((target, type, handler) => target.addEventListener(type, handler));
  const sections = [...container.children].filter((child) => child.tagName === 'DETAILS');
  for (const details of sections) {
    on(details, 'toggle', () => {
      if (!details.open) return;
      for (const other of sections) {
        if (other !== details && other.open) other.open = false;
      }
    });
  }
}
