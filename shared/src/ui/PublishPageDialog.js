/**
 * @file PublishPageDialog.js
 * @brief "Publish as page" (plan 27b §6): the title of the page and whether to update the
 *        page this module published last or to create a new one.
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

import { $HR, applyI18n } from './i18n/HResource.js';

/**
 * Ask for the title and the target page.
 *
 * @param {object} options
 * @param {string} [options.title] Proposed title.
 * @param {{id: number, title: string}|null} [options.lastPage] Page that can be updated (checked by the caller).
 * @param {Element|null} [options.parent] Element to append the dialog to; default `document.body`.
 * @returns {Promise<{title: string, pageId: number}|null>} Null when cancelled; `pageId` 0 = new page.
 */
export function openPublishPageDialog({ title = '', lastPage = null, parent = null } = {}) {
  return new Promise((resolve) => {
    const overlay = element('div', 'heurist-published-overlay');
    const dialog = element('form', 'heurist-published-dialog heurist-publish-page-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', $HR('Publish as page'));
    const heading = element('h2', 'h-i18n');
    heading.textContent = 'Publish as page';
    const label = element('label', 'heurist-publish-page-label');
    const caption = element('span', 'h-i18n');
    caption.textContent = 'Page title';
    const input = element('input', 'h-input');
    input.type = 'text';
    input.required = true;
    input.value = title || lastPage?.title || '';
    label.append(caption, input);
    dialog.append(heading, label);

    let update = null;
    if (lastPage?.id > 0) {
      const choices = element('fieldset', 'heurist-publish-page-target');
      update = radio(`${$HR('Update the page')} "${lastPage.title}" (${lastPage.id})`, true);
      choices.append(update.label, radio($HR('New page'), false).label);
      dialog.append(choices);
    }
    const note = element('p', 'heurist-publish-page-note h-i18n');
    note.textContent = 'The page is public. Open it later in the Website manager to edit it or add it to a website menu.';
    dialog.append(note);

    const actions = element('div', 'heurist-published-actions');
    const ok = element('button', 'h-btn h-btn-primary h-i18n');
    ok.type = 'submit';
    ok.textContent = 'Publish';
    const cancel = element('button', 'h-btn h-i18n');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    actions.append(ok, cancel);
    dialog.append(actions);
    overlay.append(dialog);

    const finish = (value) => {
      overlay.remove();
      resolve(value);
    };
    dialog.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) {
        input.focus();
        return;
      }
      finish({ title: value, pageId: update?.input.checked ? Number(lastPage.id) : 0 });
    });
    cancel.addEventListener('click', () => finish(null));
    dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') finish(null); });
    (parent || document.body).append(overlay);
    applyI18n(dialog);
    input.focus();
    input.select?.();
  });
}

/** A radio of the target choice. */
function radio(text, checked) {
  const label = element('label', 'heurist-publish-page-choice');
  const input = element('input');
  input.type = 'radio';
  input.name = 'heurist-publish-page-target';
  input.checked = checked;
  const span = element('span');
  span.textContent = text;
  label.append(input, span);
  return { label, input };
}

/** Create an element, optionally with a class name. */
function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
