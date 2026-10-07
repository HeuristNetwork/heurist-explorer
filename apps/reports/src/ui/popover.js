/**
 * @file popover.js
 * @brief Popover of the reports manager: the shared popover with the reports class
 *        (report list, generated files).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-reports
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { showPopover as showSharedPopover, closePopover } from '#shared/widgets/popover/popover.js';

/**
 * Show content in a popover below an anchor element (see the shared popover).
 *
 * @param {HTMLElement} anchor Button the popover belongs to.
 * @param {HTMLElement} content Popover content.
 * @param {{className?: string, onClose?: Function, align?: 'left'|'right'}} [options]
 * @returns {{element: HTMLElement, close: Function}}
 */
export function showPopover(anchor, content, options = {}) {
  return showSharedPopover(anchor, content, { ...options, className: `h-reports-popover ${options.className || ''}`.trim() });
}

export { closePopover };
