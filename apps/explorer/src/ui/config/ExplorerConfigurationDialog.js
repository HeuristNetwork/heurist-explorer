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
import { VIEW_MODES } from '../ExplorerRail.js';
import './ExplorerConfigurationDialog.css';

/** Cardinal regions, in reading order for the pane grid. */
const REGIONS = [
  { id: 'north', label: 'North' },
  { id: 'west', label: 'West' },
  { id: 'center', label: 'Center' },
  { id: 'east', label: 'East' },
  { id: 'south', label: 'South' }
];

/** Presentation module types, with the same icon/title used on the right rail. */
const MODULES = [
  { type: 'data', icon: 'fa-solid fa-table', title: 'Data' },
  { type: 'map', icon: 'fa-solid fa-map-location-dot', title: 'Map' },
  { type: 'graph', icon: 'fa-solid fa-hexagon-nodes', title: 'Graph' },
  { type: 'timeline', icon: 'fa-regular fa-clock', title: 'Timeline' },
  { type: 'recordview', icon: 'fa-regular fa-address-card', title: 'Record View' }
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
    this.chips = new Map();
    this.paneLists = new Map();
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
    this.content.append(
      this.section('Toolbar', (body) => this.buildToolbarSection(body), true),
      this.section('Layout', (body) => this.buildLayoutSection(body), true)
    );

    const footer = el('footer', 'heurist-config-footer h-dialog-footer');
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
   * Build the "Toolbar" section's fields: rail position and button size, both radio groups.
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildToolbarSection(body) {
    this.radioGroup(body, 'Position', [
      ['vertical', 'Vertical (side rails)'],
      ['horizontal', 'Horizontal (top toolbar)']
    ], this.value.toolbar.position, (next) => { this.value.toolbar.position = next; });

    this.radioGroup(body, 'Buttons size', VIEW_MODES.map((mode) => [mode.id, mode.label]),
      this.value.toolbar.buttonSize, (next) => { this.value.toolbar.buttonSize = next; });
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
   * Build the "Layout" section: the 5-pane cardinal grid with drag-and-drop module chips.
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildLayoutSection(body) {
    const hint = el('p', 'h-explorer-config-hint h-i18n');
    hint.textContent = 'Drag a module into the pane it should default to.';
    body.append(hint);

    const cardinal = el('div', 'h-explorer-config-cardinal');
    for (const region of REGIONS) {
      cardinal.append(this._buildPane(region));
    }
    body.append(cardinal);

    for (const module of MODULES) {
      const chip = this._buildChip(module);
      this.chips.set(module.type, chip);
      this.paneLists.get(this.value.regions[module.type])?.append(chip);
    }

    const reset = button('Reset', () => this.resetLayout(), 'Restore the default layout');
    reset.classList.add('h-explorer-config-reset');
    body.append(reset);
  }

  /**
   * Build one cardinal-region pane (label + drop target) and wire its drop handlers.
   *
   * @private
   * @param {{id: string, label: string}} region Region definition.
   * @returns {HTMLElement} The generated pane element.
   */
  _buildPane(region) {
    const pane = el('div', `h-explorer-config-pane h-explorer-config-pane-${region.id}`);
    const label = el('div', 'h-explorer-config-pane-label h-i18n');
    label.textContent = region.label;
    const list = el('div', 'h-explorer-config-pane-list');
    list.dataset.region = region.id;

    list.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      list.classList.add('h-drag-over');
    });
    list.addEventListener('dragleave', () => list.classList.remove('h-drag-over'));
    list.addEventListener('drop', (event) => {
      event.preventDefault();
      list.classList.remove('h-drag-over');
      const moduleType = event.dataTransfer.getData('text/plain');
      const chip = this.chips.get(moduleType);
      if (!chip) return;
      list.append(chip);
      this.value.regions[moduleType] = region.id;
    });

    pane.append(label, list);
    this.paneLists.set(region.id, list);
    return pane;
  }

  /**
   * Build one draggable module chip.
   *
   * @private
   * @param {{type: string, icon: string, title: string}} module Module definition.
   * @returns {HTMLElement} The generated chip element.
   */
  _buildChip(module) {
    const chip = el('div', 'h-explorer-config-chip');
    chip.draggable = true;
    chip.dataset.module = module.type;
    chip.title = $HR(module.title);
    const icon = el('span', module.icon);
    icon.setAttribute('aria-hidden', 'true');
    const label = el('span', 'h-i18n');
    label.textContent = module.title;
    chip.append(icon, label);

    chip.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', module.type);
      event.dataTransfer.effectAllowed = 'move';
      chip.classList.add('h-dragging');
    });
    chip.addEventListener('dragend', () => chip.classList.remove('h-dragging'));

    return chip;
  }

  /**
   * Reset the layout preview (pane assignments) to the built-in defaults, without saving.
   *
   * @returns {void}
   */
  resetLayout() {
    const defaults = ExplorerUiConfig.defaults().regions;
    for (const [type, region] of Object.entries(defaults)) {
      this.value.regions[type] = region;
      const chip = this.chips.get(type);
      const list = this.paneLists.get(region);
      if (chip && list) list.append(chip);
    }
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
    this.chips.clear();
    this.paneLists.clear();
    this.previousFocus?.focus?.();
    this.previousFocus = null;
  }
}

/** Merge a possibly-partial configuration value onto the built-in defaults. */
function mergeDefaults(value) {
  const defaults = ExplorerUiConfig.defaults();
  return {
    toolbar: { ...defaults.toolbar, ...(value?.toolbar || {}) },
    regions: { ...defaults.regions, ...(value?.regions || {}) }
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
