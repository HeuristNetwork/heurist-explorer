/**
 * @file popover.js
 * @brief Popover under a toolbar button (report list, generated files).
 *        Closed by a click outside, Escape, or `close()`.
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

let openPopover = null;

/**
 * Show content in a popover below an anchor element. Only one popover is open.
 *
 * @param {HTMLElement} anchor Button the popover belongs to.
 * @param {HTMLElement} content Popover content.
 * @param {{className?: string, onClose?: Function, align?: 'left'|'right'}} [options] `right`: the
 *        right edges of the popover and the anchor's group (split button) are aligned.
 * @returns {{element: HTMLElement, close: Function}}
 */
export function showPopover(anchor, content, { className = '', onClose = null, align = 'left' } = {}) {
  openPopover?.close();
  const element = document.createElement('div');
  element.className = `h-reports-popover ${className}`.trim();
  element.append(content);
  (anchor.closest?.('dialog') || document.body).append(element);

  const onDocument = (event) => {
    if (!element.contains(event.target) && !anchor.contains(event.target)) close();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };
  const close = () => {
    if (!element.parentElement) return;
    document.removeEventListener('mousedown', onDocument, true);
    document.removeEventListener('keydown', onKey, true);
    element.remove();
    if (openPopover?.element === element) openPopover = null;
    anchor.setAttribute?.('aria-expanded', 'false');
    onClose?.();
  };
  // defer: the click that opened the popover must not close it
  setTimeout(() => {
    document.addEventListener('mousedown', onDocument, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
  anchor.setAttribute?.('aria-expanded', 'true');
  place(element, anchor, align);
  openPopover = { element, close };
  return openPopover;
}

/** Close the open popover, if any. */
export function closePopover() {
  openPopover?.close();
}

/** Fixed position under the anchor, kept inside the window. */
function place(element, anchor, align) {
  const rect = anchor.getBoundingClientRect?.();
  if (!rect || !globalThis.innerWidth) return;
  element.style.position = 'fixed';
  element.style.top = `${Math.round(rect.bottom + 2)}px`;
  const width = Math.min(element.offsetWidth || 380, globalThis.innerWidth - 16);
  const left = align === 'right' ? rect.right - width : rect.left;
  element.style.left = `${Math.round(Math.max(8, Math.min(left, globalThis.innerWidth - width - 8)))}px`;
  element.style.maxHeight = `${Math.max(160, Math.round(globalThis.innerHeight - rect.bottom - 16))}px`;
}
