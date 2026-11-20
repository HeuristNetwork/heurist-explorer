/**
 * @file ExplorerConfigurationDialog.js
 * @brief Modal editor for Explorer's toolbar position/size and module-to-region layout.
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
import { ExplorerUiConfig } from '../../core/ExplorerUiConfig.js';
import { createLayoutEditor } from './explorerLayoutEditor.js';
import { normalizeRecordLimits, RECORD_LIMIT_OPTIONS } from '#shared/recordview/recordLimits.js';
import { normalizeRecordEditorSettings } from '#shared/data/recordEditorSettings.js';
import { normalizeBaseStyle } from '#shared/ui/baseStyle.js';
import { VIEW_MODES } from '../ExplorerRail.js';
import './ExplorerConfigurationDialog.css';

/** Interface languages, as in the modules' configuration dialogs. */
const LANGUAGES = [
  ['auto', 'Auto'],
  ['eng', 'English'],
  ['fre', 'French'],
  ['ger', 'German'],
  ['por', 'Portuguese']
];

/** Limits of the built-in record view (plan 23 §3.1): key and label. */
const RECORD_LIMITS = [
  ['fields', 'Limit fields'],
  ['values', 'Limit values per field'],
  ['thumbs', 'Limit thumbnails'],
  ['links', 'Limit reverse links']
];

/** Settings of the record editor (plan 25): key and label. */
const RECORD_EDITOR_OPTIONS = [
  ['showHelp', 'Show help'],
  ['showOptional', 'Show optional fields'],
  ['reverseRelations', 'Relationships from other records'],
  ['nonStandardFields', 'Non-standard fields'],
  ['wysiwygInline', 'Show wysiwyg editor inline']
];

/** Editor for Explorer's toolbar and layout configuration, saved via `onSave`. */
export class ExplorerConfigurationDialog {
  /**
   * @param {object} [options] Dialog configuration.
   * @param {object|null} [options.value] Initial configuration value; see `ExplorerUiConfig`'s shape.
   * @param {Element|null} [options.parent] Element to append the dialog to; defaults to `document.body`.
   * @param {Function|null} [options.onSave] Called with the new value on save; returning `false` keeps the dialog open.
   * @param {Function|null} [options.onCancel] Called with the (unsaved) current value when the dialog is cancelled.
   */
  constructor({ value = null, parent = null, onSave = null, onCancel = null } = {}) {
    this.value = mergeDefaults(value);
    this.parent = parent;
    this.onSave = typeof onSave === 'function' ? onSave : null;
    this.onCancel = typeof onCancel === 'function' ? onCancel : null;
    this.layoutEditor = null;
    this.element = null;
  }

  /**
   * Build the dialog DOM, populate it, and show it modally.
   *
   * @returns {ExplorerConfigurationDialog} This instance, for chaining.
   * @throws {Error} When there is no browser `document`.
   */
  open() {
    if (typeof document === 'undefined') throw new Error('ExplorerConfigurationDialog requires a browser document');
    if (this.element) return this;
    this.previousFocus = document.activeElement;

    this.dialog = el('dialog', 'heurist-config-dialog h-dialog');
    this.element = this.dialog;
    this.dialog.setAttribute('aria-label', $HR('Explorer configuration'));
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.cancel();
    });

    const header = el('header', 'h-dialog-header');
    const heading = el('h2', 'h-dialog-title h-i18n');
    heading.textContent = 'Explorer configuration';
    const close = button('×', () => this.cancel(), 'Close');
    close.classList.add('h-dialog-close');
    header.append(heading, close);

    this.form = el('form', 'heurist-config-form');
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.save();
    });
    this.content = el('div', 'heurist-config-content h-dialog-body');
    const layoutSection = this.section('Layout', (body) => this.buildLayoutSection(body), true);
    this.content.append(
      this.section('Interface', (body) => this.buildInterfaceSection(body), true),
      this.section('Record View and Edit limits', (body) => this.buildRecordViewSection(body)),
      this.section('Record editor', (body) => this.buildRecordEditorSection(body)),
      layoutSection
    );
    this._advancedControls.push(layoutSection);

    const footer = el('footer', 'heurist-config-footer h-dialog-footer');
    // the tools (Getting started, Query tracer, Manage tags ...) are in the Options menu (2026-11-20)
    this._syncSimplified();
    footer.append(button('Cancel', () => this.cancel()), submitButton('Apply'));
    this.form.append(this.content, footer);
    this.dialog.append(header, this.form);
    (this.parent || document.body).append(this.element);

    this.initialState = this.signature();
    applyI18n(this.dialog);
    this.dialog.showModal();
    this.dialog.querySelector('input,select,textarea,button')?.focus();
    return this;
  }

  /**
   * Build a collapsible `<details>` section with a heading and body.
   *
   * @param {string} title Section heading text.
   * @param {function(HTMLElement): void} builder Called with the section body to populate it.
   * @param {boolean} [open=false] Whether the section starts expanded.
   * @returns {HTMLElement} The generated `<details>` element.
   */
  section(title, builder, open = false) {
    const details = el('details', 'heurist-config-section');
    details.open = open;
    const summary = el('summary', 'h-i18n');
    summary.textContent = title;
    const body = el('div', 'heurist-config-section-body');
    builder(body);
    details.append(summary, body);
    return details;
  }

  /**
   * Build the "Interface" section's fields: toolbar position and button size, the
   * lists mode and the interface language.
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildInterfaceSection(body) {
    // the simplified interface fixes toolbar, lists and layout (effectiveUiConfig):
    // their controls are hidden while it is on. The checkbox is "Advanced UI", the
    // reverse of isSimplifiedUI (2026-10-17)
    const simplifiedRow = el('label', 'heurist-config-row h-explorer-config-simplified');
    const simplified = el('input', 'h-checkbox');
    simplified.classList.remove('h-input');
    simplified.type = 'checkbox';
    simplified.checked = this.value.isSimplifiedUI !== true;
    simplified.addEventListener('change', () => {
      this.value.isSimplifiedUI = !simplified.checked;
      this._syncSimplified();
    });
    const simplifiedCaption = el('span', 'h-i18n');
    simplifiedCaption.textContent = 'Advanced UI';
    simplifiedRow.append(simplifiedCaption, simplified);
    body.append(simplifiedRow);

    const positionRow = this.radioGroup(body, 'Toolbar position', [
      ['vertical', 'Vertical (side rails)'],
      ['horizontal', 'Horizontal (top toolbar)'],
      ['panes', 'In panes (buttons and tabs in the panes)']
    ], this.value.toolbar.position, (next) => { this.value.toolbar.position = next; });

    // every toolbar position, also "In panes" and the simplified interface: the left
    // rail and the tabs of collapsed panes (2026-10-15)
    this.radioGroup(body, 'Toolbar buttons size', VIEW_MODES.map((mode) => [mode.id, mode.label]),
      this.value.toolbar.buttonSize, (next) => { this.value.toolbar.buttonSize = next; });

    const listsRow = this.radioGroup(body, 'Lists (Filters, Entities, Sources, Favorites, History, Workspace)', [
      ['docked', 'Docked in the search pane'],
      ['popup', 'Popup']
    ], this.value.lists, (next) => { this.value.lists = next; });
    this._advancedControls = [positionRow, listsRow];

    // Explorer and every module use this language; changing it reloads Explorer
    this.selectRow(body, 'Language', LANGUAGES, this.value.language, (next) => { this.value.language = next; });
  }

  /**
   * Build the "Record View and Edit limits" section: how much of a very large record the built-in
   * record view (Record View, popups, Linked records of the editor) shows before a
   * "Show all" link (plan 23 §3.1). Changing a limit reloads Explorer.
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildRecordViewSection(body) {
    const options = RECORD_LIMIT_OPTIONS.map((value) => [String(value), String(value)]);
    for (const [key, label] of RECORD_LIMITS) {
      this.selectRow(body, label, options, String(this.value.recordLimits[key]), (next) => {
        this.value.recordLimits[key] = Number(next);
      });
    }
  }

  /**
   * Build the "Record editor" section (plan 25): the start settings of the Structure pane,
   * the optional groups of the form and the HTML editor of blocktext fields.
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildRecordEditorSection(body) {
    for (const [key, label] of RECORD_EDITOR_OPTIONS) {
      this.checkboxRow(body, label, this.value.recordEditor[key] === true, (checked) => { this.value.recordEditor[key] = checked; });
    }
  }

  /**
   * Build and append a labeled checkbox row.
   *
   * @param {HTMLElement} parent Element to append the row into.
   * @param {string} labelText Field label.
   * @param {boolean} checked Initial state.
   * @param {function(boolean): void} onChange Called with the new state.
   * @returns {HTMLElement} The generated row element.
   */
  checkboxRow(parent, labelText, checked, onChange) {
    const row = el('label', 'heurist-config-row heurist-config-check-row');
    const input = el('input', 'h-checkbox');
    input.classList.remove('h-input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    const caption = el('span', 'h-i18n');
    caption.textContent = labelText;
    row.append(caption, input);
    parent.append(row);
    return row;
  }

  /**
   * Hide the toolbar, lists and layout controls while the
   * simplified interface is on (Advanced UI unchecked): it sets them itself.
   *
   * @private
   * @returns {void}
   */
  _syncSimplified() {
    const on = this.value.isSimplifiedUI === true;
    for (const control of this._advancedControls || []) control.hidden = on;
  }

  /**
   * Build and append a labeled select row.
   *
   * @param {HTMLElement} parent Element to append the row into.
   * @param {string} labelText Field label.
   * @param {Array<[string, string]>} options Option `[value, label]` pairs.
   * @param {string} selected Initially selected value.
   * @param {function(string): void} onChange Called with the newly selected value.
   * @returns {HTMLElement} The generated row element.
   */
  selectRow(parent, labelText, options, selected, onChange) {
    const row = el('label', 'heurist-config-row');
    const caption = el('span', 'h-i18n');
    caption.textContent = labelText;
    const select = el('select', 'h-explorer-config-select');
    for (const [value, optionLabel] of options) {
      const option = el('option', 'h-i18n');
      option.value = value;
      option.textContent = optionLabel;
      select.append(option);
    }
    select.value = selected;
    select.addEventListener('change', () => onChange(select.value));
    row.append(caption, select);
    parent.append(row);
    return row;
  }

  /**
   * Build and append a labeled radio-button group row.
   *
   * @param {HTMLElement} parent Element to append the row into.
   * @param {string} labelText Field label.
   * @param {Array<[string, string]>} options Option `[value, label]` pairs.
   * @param {string} selected Initially selected value.
   * @param {function(string): void} onChange Called with the newly selected value.
   * @returns {HTMLElement} The generated row element.
   */
  radioGroup(parent, labelText, options, selected, onChange) {
    const row = el('div', 'heurist-config-row heurist-config-radio-row');
    const caption = el('span', 'h-i18n');
    caption.textContent = labelText;
    const group = el('div', 'h-explorer-config-radio-group');
    const name = `h-explorer-config-radio-${Math.random().toString(36).slice(2)}`;

    for (const [value, optionLabel] of options) {
      const option = el('label', 'heurist-config-check');
      const input = el('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.classList.remove('h-input');
      input.classList.add('h-checkbox');
      input.checked = value === selected;
      input.addEventListener('change', () => { if (input.checked) onChange(value); });
      const text = el('span', 'h-i18n');
      text.textContent = optionLabel;
      option.append(input, text);
      group.append(option);
    }

    row.append(caption, group);
    parent.append(row);
    return row;
  }

  /**
   * Build the "Layout" section: the 5-pane cardinal grid with drag-and-drop module chips (explorerLayoutEditor.js,
   * every module with the tools).
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildLayoutSection(body) {
    this.layoutEditor = createLayoutEditor(body, { value: this.value });
  }

  /**
   * Reset the layout preview (pane assignments) to the built-in defaults, without saving.
   *
   * @returns {void}
   */
  resetLayout() {
    this.layoutEditor?.reset();
  }

  /**
   * Read the current form value.
   *
   * @returns {object} Cloned configuration value.
   */
  getValue() {
    return clone(this.value);
  }

  /**
   * Build a comparable snapshot of the current form state, used to detect unsaved changes.
   *
   * @returns {string} JSON signature of the form state.
   */
  signature() {
    return JSON.stringify(this.value);
  }

  /**
   * Save the form via `onSave`, closing the dialog on success.
   *
   * @returns {Promise<object|false>} The saved value, or `false` when saving was cancelled or failed.
   */
  async save() {
    try {
      const value = this.getValue();
      if ((await this.onSave?.(value)) === false) return false;
      this.close();
      return value;
    } catch (error) {
      this.showError(error?.message || String(error));
      return false;
    }
  }

  /**
   * Cancel the dialog, confirming discard first when the form has unsaved changes.
   *
   * @returns {boolean} True once cancellation completed (immediately, or false while a confirm dialog is pending).
   */
  cancel() {
    if (this.initialState && this.signature() !== this.initialState) {
      if (this.discardDialog?.open) return false;
      this.discardDialog = HMsg.showMsgDlg('Discard changes to Explorer configuration?', {
        title: 'Discard changes',
        dialogId: 'heurist-explorer-discard-changes',
        buttons: [
          { label: 'Keep editing', class: 'h-btn', onClick: () => this.discardDialog.close() },
          { label: 'Discard changes', class: 'h-btn h-btn-danger', onClick: () => {
            this.discardDialog.close();
            this.finishCancel();
          } }
        ]
      });
      return false;
    }
    return this.finishCancel();
  }

  /**
   * Close the dialog and notify `onCancel` with the (unsaved) current value.
   *
   * @returns {boolean} Always `true`.
   */
  finishCancel() {
    const value = this.getValue();
    this.close();
    this.onCancel?.(value);
    return true;
  }

  /**
   * Show an error message dialog, only while the form is mounted.
   *
   * @param {string} message Error message text.
   * @returns {void}
   */
  showError(message) {
    if (this.form) HMsg.showMsgErr(message, { title: 'Explorer configuration error' });
  }

  /**
   * Close and remove the dialog, restoring focus to the previously focused element.
   *
   * @returns {void}
   */
  close() {
    this.discardDialog?.close();
    this.dialog?.close();
    this.initialState = null;
    this.element?.remove();
    this.element = this.dialog = this.form = null;
    this.layoutEditor?.destroy();
    this.layoutEditor = null;
    this.previousFocus?.focus?.();
    this.previousFocus = null;
  }
}

/** Merge a possibly-partial configuration value onto the built-in defaults. */
function mergeDefaults(value) {
  const defaults = ExplorerUiConfig.defaults();
  return {
    toolbar: { ...defaults.toolbar, ...(value?.toolbar || {}) },
    regions: { ...defaults.regions, ...(value?.regions || {}) },
    order: [...new Set([...(Array.isArray(value?.order) ? value.order : []), ...defaults.order])],
    panes: { ...defaults.panes, ...(value?.panes || {}) },
    lists: value?.lists === 'popup' ? 'popup' : defaults.lists,
    language: LANGUAGES.some(([code]) => code === value?.language) ? value.language : defaults.language,
    isSimplifiedUI: typeof value?.isSimplifiedUI === 'boolean' ? value.isSimplifiedUI : defaults.isSimplifiedUI,
    recordLimits: normalizeRecordLimits(value?.recordLimits),
    recordEditor: normalizeRecordEditorSettings(value?.recordEditor),
    // edited in Base style settings; kept as it is
    baseStyle: normalizeBaseStyle(value?.baseStyle)
  };
}

/** Create an element, applying the shared `h-input`/`h-select`/`h-btn` classes by tag. */
function el(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (['input', 'textarea'].includes(tag)) node.classList.add('h-input');
  if (tag === 'select') node.classList.add('h-select');
  if (tag === 'button') node.classList.add('h-btn');
  return node;
}

/** Build a labeled button with a click handler. */
function button(label, handler, title = label) {
  const node = el('button');
  if (/[A-Za-z]/.test(label)) node.classList.add('h-i18n');
  node.type = 'button';
  node.textContent = label;
  node.title = $HR(title);
  node.addEventListener('click', handler);
  return node;
}

/** Build the form's primary submit button. */
function submitButton(label) {
  const node = el('button', 'h-i18n h-btn-primary');
  node.type = 'submit';
  node.textContent = label;
  return node;
}

/** Deep-clone a JSON-safe value. */
function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
