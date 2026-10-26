/**
 * @file PublishedDialog.js
 * @brief Generic successful-publication link dialog: the page URL, the embed code of a
 *        published page (plan 27b) and optional host actions.
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

/** Displays a successful publication link and close action. */
export class PublishedDialog {
  /**
   * @param {object} [options] Dialog configuration.
   * @param {{url?: string, embed?: string, actions?: Array}} [options.publication] Publication result: URL, embed
   *        code and the host's extra buttons (HostAdapter.publish).
   * @param {Array<{label: string, run: Function}>} [options.actions] Extra buttons (default: `publication.actions`).
   * @param {Element|null} [options.parent] Element to append the dialog to; defaults to `document.body`.
   */
  constructor({ publication = {}, actions = null, parent = null } = {}) {
    this.publication = publication;
    const list = actions ?? publication?.actions;
    this.actions = Array.isArray(list) ? list : [];
    this.parent = parent;
  }

  /**
   * Render and show the dialog, replacing any previously shown instance.
   *
   * @returns {PublishedDialog} This instance, for chaining.
   */
  open() {
    this.close();
    const url = String(this.publication?.url || '');
    const overlay = element('div', 'heurist-published-overlay');
    const dialog = element('section', 'heurist-published-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', $HR('Published'));
    const title = element('h2', 'h-i18n');
    title.textContent = 'Published';
    const text = element('p', 'h-i18n');
    text.textContent = 'The publication is available at:';
    const input = element('input', 'h-input');
    input.type = 'text';
    input.readOnly = true;
    input.value = url;
    input.setAttribute('aria-label', $HR('Published link'));
    dialog.append(title, text, input);

    const embed = String(this.publication?.embed || '');
    let embedArea = null;
    if (embed) {
      const embedText = element('p', 'h-i18n');
      embedText.textContent = 'To embed it in another web page:';
      embedArea = element('textarea', 'h-input');
      embedArea.readOnly = true;
      embedArea.rows = 3;
      embedArea.value = embed;
      embedArea.setAttribute('aria-label', $HR('Embed code'));
      dialog.append(embedText, embedArea);
    }

    const actions = element('div', 'heurist-published-actions');
    const copy = button('Copy link', async () => {
      await copyText(url, input);
      flash(copy, 'Copy link');
    });
    actions.append(copy);
    if (embedArea) {
      const copyEmbed = button('Copy embed code', async () => {
        await copyText(embed, embedArea);
        flash(copyEmbed, 'Copy embed code');
      });
      actions.append(copyEmbed);
    }
    this.actions.forEach((action) => {
      actions.append(button(action.label, async () => {
        this.close();
        await action.run();
      }));
    });
    actions.append(
      button('Open', () => { if (url) globalThis.open?.(url, '_blank', 'noopener'); }),
      button('Close', () => this.close())
    );
    dialog.append(actions);
    overlay.append(dialog);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) this.close(); });
    dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') this.close(); });
    (this.parent || document.body).append(overlay);
    applyI18n(dialog);
    this.element = overlay;
    input.focus();
    input.select();
    return this;
  }

  /**
   * Remove the dialog from the document, if shown.
   *
   * @returns {void}
   */
  close() {
    this.element?.remove();
    this.element = null;
  }
}

/** Copy text to the clipboard (the field's selection without the clipboard API). */
async function copyText(value, field) {
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
  else {
    field.focus();
    field.select();
    document.execCommand?.('copy');
  }
}

/** Show "Copied" on a button for a moment. */
function flash(node, label) {
  node.textContent = $HR('Copied');
  setTimeout(() => {
    if (node.isConnected) node.textContent = $HR(label);
  }, 1500);
}

/** Create an element, optionally with a class name. */
function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Create a labeled, i18n-marked button that runs an async click handler. */
function button(label, handler) {
  const node = element('button', 'h-btn h-i18n');
  node.type = 'button';
  node.textContent = label;
  node.addEventListener('click', () => Promise.resolve(handler()).catch(() => {}));
  return node;
}
