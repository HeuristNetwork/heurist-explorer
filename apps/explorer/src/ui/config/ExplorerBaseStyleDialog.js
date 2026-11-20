/**
 * @file ExplorerBaseStyleDialog.js
 * @brief Base style settings of Explorer (Options menu, 2026-11-20): the Base settings form of the CMS Styles popup
 *        (theme, colours, fonts) and its preview, for the Explorer UI and its modules. Saved with the Explorer
 *        configuration (`baseStyle`) via `onSave`.
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
import { $HR, applyI18n, HMsg } from '#shared/ui';
import { normalizeBaseStyle, UI_BASE_SETTINGS } from '#shared/ui/baseStyle.js';
import {
  basePreviewHtml, createBaseSettingsPane, createPreviewColumn, helpLine
} from '#shared/widgets/styles/baseSettingsForm.js';
import './ExplorerBaseStyleDialog.css';

const HELP = 'Colours, fonts and sizes of the Explorer interface and its modules. Choose a theme to fill the colours,'
  + ' then change single values. Empty values use the Heurist defaults. Explorer reloads when you apply the changes.';

/** Editor of Explorer's base style, saved via `onSave`. */
export class ExplorerBaseStyleDialog {
  /**
   * @param {object} [options] Dialog configuration.
   * @param {object|null} [options.value] Base settings now (`baseStyle` of the Explorer configuration).
   * @param {Element|null} [options.parent] Element to append the dialog to; defaults to `document.body`.
   * @param {Function|null} [options.onSave] Called with the new base settings; returning `false` keeps the dialog open.
   */
  constructor({ value = null, parent = null, onSave = null } = {}) {
    this.base = normalizeBaseStyle(value);
    this.parent = parent;
    this.onSave = typeof onSave === 'function' ? onSave : null;
    this.dialog = null;
  }

  /**
   * Build the dialog and show it modally.
   *
   * @returns {ExplorerBaseStyleDialog} This instance.
   * @throws {Error} When there is no browser `document`.
   */
  open() {
    if (typeof document === 'undefined') throw new Error('ExplorerBaseStyleDialog requires a browser document');
    if (this.dialog) return this;
    this.previousFocus = document.activeElement;

    this.dialog = el('dialog', 'h-dialog h-explorer-base-style-dialog');
    this.dialog.setAttribute('aria-label', $HR('Base style settings'));
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.cancel();
    });

    const header = el('header', 'h-dialog-header');
    const heading = el('h2', 'h-dialog-title h-i18n');
    heading.textContent = 'Base style settings';
    const close = button('×', () => this.cancel(), 'Close');
    close.classList.add('h-dialog-close');
    header.append(heading, close);

    const form = el('form', 'h-explorer-base-style-form');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.save();
    });

    // two columns as in the CMS Styles popup: the settings, and the preview (half as wide)
    const layout = el('div', 'h-cms-styles-layout h-dialog-body');
    const pane = el('div', 'h-cms-styles-pane');
    const config = el('div', 'h-cms-styles-config');
    pane.append(helpLine(HELP), config);
    const preview = createPreviewColumn();
    layout.append(pane, preview.element);
    const refresh = () => preview.show(basePreviewHtml(this.base));
    createBaseSettingsPane(config, { base: this.base, keys: UI_BASE_SETTINGS, onChange: refresh });
    refresh();

    const footer = el('footer', 'h-dialog-footer');
    const apply = el('button', 'h-btn h-btn-primary h-i18n');
    apply.type = 'submit';
    apply.textContent = 'Apply';
    footer.append(button('Cancel', () => this.cancel()), apply);
    form.append(layout, footer);
    this.dialog.append(header, form);
    (this.parent || document.body).append(this.dialog);

    this.initialState = this.signature();
    applyI18n(this.dialog);
    this.dialog.showModal();
    this.dialog.querySelector('select,input')?.focus();
    return this;
  }

  /**
   * The base settings in the form.
   *
   * @returns {object}
   */
  getValue() {
    return normalizeBaseStyle(this.base);
  }

  /**
   * A comparable snapshot of the form, to find unsaved changes.
   *
   * @returns {string}
   */
  signature() {
    return JSON.stringify(this.getValue());
  }

  /**
   * Save via `onSave`, closing the dialog on success.
   *
   * @returns {Promise<object|false>} The saved base settings, or false.
   */
  async save() {
    try {
      const value = this.getValue();
      if ((await this.onSave?.(value)) === false) return false;
      this.close();
      return value;
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error), { title: 'Base style settings' });
      return false;
    }
  }

  /**
   * Close, confirming discard first when the form has unsaved changes.
   *
   * @returns {boolean} True once closed; false while the confirmation is open.
   */
  cancel() {
    if (this.initialState && this.signature() !== this.initialState) {
      if (this.discardDialog?.open) return false;
      this.discardDialog = HMsg.showMsgDlg('Discard changes to the base style settings?', {
        title: 'Discard changes',
        dialogId: 'heurist-explorer-discard-base-style',
        buttons: [
          { label: 'Keep editing', class: 'h-btn', onClick: () => this.discardDialog.close() },
          { label: 'Discard changes', class: 'h-btn h-btn-danger', onClick: () => {
            this.discardDialog.close();
            this.close();
          } }
        ]
      });
      return false;
    }
    this.close();
    return true;
  }

  /**
   * Close and remove the dialog, restoring the focus.
   *
   * @returns {void}
   */
  close() {
    this.discardDialog?.close();
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
    this.initialState = null;
    this.previousFocus?.focus?.();
    this.previousFocus = null;
  }
}

/** Create an element with classes. */
function el(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** A button with a click handler. */
function button(label, handler, title = label) {
  const node = el('button', 'h-btn');
  if (/[A-Za-z]/.test(label)) node.classList.add('h-i18n');
  node.type = 'button';
  node.textContent = label;
  node.title = $HR(title);
  node.addEventListener('click', handler);
  return node;
}
