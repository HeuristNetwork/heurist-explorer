/**
 * @file designerInline.js
 * @brief The inline Own style form of the page editor of the CMS designer (plan 27i §10, review 2026-11-14): a panel
 *        beside the part tree (below it when the west pane is narrow) with the own style of the selected element (a
 *        group: its caption above it). A change is applied to the draft and the preview at once. Close (top right)
 *        hides the panel; the changes stay in the draft (Save Page saves the page as before).
 *
 *   const panel = createFormPanel({ onClose: () => ... });
 *   panel.show([{ label: 'Caption', build: (host) => ... }, { label: 'Own style', build: (host) => ... }]);
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from '#shared/ui';

/** Minimum width of the form (also of the west pane while it is open). */
export const FORM_MIN_WIDTH = 370;

/** Width of the page panel from which the form is right of the tree: tree 250px + form at least 370px. */
export const FORM_SIDE_WIDTH = 250 + FORM_MIN_WIDTH;

/**
 * The form panel: Close in the top right corner and the sections of the selected element one under another.
 *
 * @param {{onClose?: () => void}} [options]
 * @returns {{element: HTMLElement, show: Function, hide: Function, isOpen: () => boolean, addHeadActions: Function}}
 */
export function createFormPanel({ onClose = null } = {}) {
  const panel = element('div', 'h-cms-form-panel');
  panel.hidden = true;
  // a header with the title of the form and Close (review 2026-11-15)
  const head = element('div', 'h-cms-form-head');
  const heading = element('span', 'h-cms-form-title');
  const close = element('button', 'h-btn h-compact h-cms-form-close');
  close.type = 'button';
  close.title = $HR('Close the form (the changes stay)');
  close.setAttribute('aria-label', close.title);
  close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
  close.addEventListener('click', () => onClose?.());
  // buttons of the form beside Close (Apply of a configuration form, review 2026-11-15)
  const headActions = element('span', 'h-cms-form-head-actions');
  head.append(heading, headActions, close);
  const body = element('div', 'h-cms-form-body');
  panel.append(head, body);
  let cleanups = [];
  const clear = async () => {
    const list = cleanups;
    cleanups = [];
    for (const cleanup of list) await cleanup?.();
    body.replaceChildren();
    headActions.replaceChildren();
  };
  return {
    element: panel,
    isOpen: () => !panel.hidden,
    /**
     * Buttons in the header beside Close, until the form changes.
     *
     * @param {...HTMLElement} buttons
     */
    addHeadActions: (...buttons) => headActions.append(...buttons),
    /**
     * Show the sections of an element. `build(host)` fills a section and may return its cleanup.
     *
     * @param {Array<{label: string, build: (host: HTMLElement) => (Function|void|Promise<Function|void>)}>} sections An empty
     *        label: no section title.
     * @param {{title?: string}} [options] The title in the header of the panel.
     */
    async show(sections, { title = '' } = {}) {
      await clear();
      panel.hidden = false;
      heading.textContent = title;
      for (const section of sections) {
        const host = element('div', 'h-cms-form-section');
        if (section.label) {
          const caption = element('div', 'h-cms-form-section-title');
          caption.textContent = section.label;
          host.append(caption);
        }
        body.append(host);
        cleanups.push(await section.build(host));
      }
    },
    /** Hide the panel and destroy its forms. */
    async hide() {
      await clear();
      panel.hidden = true;
    }
  };
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
