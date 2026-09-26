/**
 * @file HInput.js
 * @brief Base class for a single value input in edit and filter forms.
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

import { HBaseWidget } from '../../HBaseWidget.js';
import './HInput.css';

let nextInputId = 0;

/** Provides shared label, value, validation, and change behavior. */
export class HInput extends HBaseWidget {
  /** Create an unattached input. */
  constructor() {
    super();
    this.value = null;
    this.control = null;
  }

  /**
   * Attach the input and its field definition.
   *
   * @param {HTMLElement} container Input host.
   * @param {object} options Input definition and initial value.
   * @returns {HInput} This input.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.value = options.value ?? null;
    return this;
  }

  /**
   * Render the common field shell and the concrete control.
   *
   * @returns {HInput} This input.
   */
  render() {
    if (!this.container) throw new Error('HInput must be attached before render');

    this.container.replaceChildren();
    this.container.classList.add('h-widget', 'h-form-input');

    const label = document.createElement('label');
    label.className = 'h-form-input-label h-i18n';
    label.textContent = this.options.label || '';

    const controlHost = document.createElement('div');
    controlHost.className = 'h-form-input-control';
    const controlWrap = document.createElement('div');
    controlWrap.className = 'h-form-input-control-wrap';
    controlHost.append(controlWrap);
    // label row: the label plus the clear action, so the action stays in view
    // above tall controls (term lists, checkbox groups)
    const header = document.createElement('div');
    header.className = 'h-form-input-header';
    if (!this.options.suppressLabel) {
      const hierarchy = String(this.options.hierarchy ?? '').trim();
      if (hierarchy) {
        const path = document.createElement('div');
        path.className = 'h-form-input-hierarchy';
        path.textContent = hierarchy;
        path.title = hierarchy;
        this.container.append(path);
      }
      header.append(label);
      this.container.append(header);
      if (this.options.collapsible) this._makeCollapsible(label);
    }
    this.container.append(controlHost);

    this.label = label;
    this.control = this.renderControl(controlWrap);
    if (this.control) {
      this.control.id = `h-input-${++nextInputId}`;
      label.htmlFor = this.control.id;
      this.setValue(this.value);
      this.setReadOnly(Boolean(this.options.readOnly));
    }

    this.clearButton = document.createElement('button');
    this.clearButton.type = 'button';
    this.clearButton.className = 'heurist-icon-button h-form-input-clear';
    this.clearButton.textContent = '×';
    this.clearButton.title = 'Clear value';
    this.clearButton.setAttribute('aria-label', 'Clear value');
    this.listen(this.clearButton, 'click', () => {
      const fixed = this.options.fixedValue;
      this.setValue(fixed && typeof fixed === 'object' ? { ...fixed } : null);
      this.notifyChange();
    });
    // without a label row, keep the action beside the control
    (this.options.suppressLabel ? controlHost : header).append(this.clearButton);
    this._syncClearButton();

    const help = String(this.options.help ?? '').trim();
    if (help) {
      const helpText = document.createElement('div');
      helpText.className = 'h-form-input-help';
      helpText.id = `${this.control?.id || `h-input-${++nextInputId}`}-help`;
      helpText.textContent = help;
      this.container.append(helpText);
      this.control?.setAttribute('aria-describedby', helpText.id);
    }

    this.state = 'rendered';
    return this;
  }

  /**
   * Create the type-specific control in a host.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLElement} Primary control.
   */
  renderControl(host) {
    throw new Error(`renderControl is not implemented for ${this.constructor.name}`);
  }

  /**
   * Read the current value.
   *
   * @returns {*} Current value.
   */
  getValue() {
    return this.value;
  }

  /**
   * Replace the current value.
   *
   * @param {*} value New value.
   * @returns {HInput} This input.
   */
  setValue(value) {
    this.value = value ?? null;
    if (this.clearButton) queueMicrotask(() => this._syncClearButton());
    return this;
  }

  /**
   * Set the control's read-only state.
   *
   * @param {boolean} readOnly Whether editing is disabled.
   * @returns {HInput} This input.
   */
  setReadOnly(readOnly) {
    if (this.control) this.control.disabled = Boolean(readOnly);
    return this;
  }

  /**
   * Validate the current value.
   *
   * @returns {string[]} Error messages.
   */
  validate() {
    if (this.options.required && (this.getValue() === null || this.getValue() === '')) {
      return ['A value is required'];
    }

    return [];
  }

  /**
   * Wire a text-like control to notify only on Enter or a changed-value blur,
   * not on every keystroke.
   *
   * @param {HTMLElement} control Control to observe.
   * @param {{enter?: boolean}} [options] `enter: false` skips the Enter-key commit
   *        (e.g. multiline text, where Enter inserts a newline).
   * @returns {void}
   */
  _commitOnEnterOrBlur(control, { enter = true } = {}) {
    let committed = control.value;
    if (enter) {
      this.listen(control, 'keydown', (event) => {
        if (event.key !== 'Enter') return;
        committed = control.value;
        this.notifyChange();
      });
    }
    this.listen(control, 'blur', () => {
      if (control.value === committed) return;
      committed = control.value;
      this.notifyChange();
    });
  }

  /** Notify the form that this input changed. */
  notifyChange() {
    this._syncClearButton();
    this.container?.dispatchEvent(new CustomEvent('h-input-change', {
      bubbles: true,
      detail: { input: this, value: this.getValue() }
    }));
  }

  /**
   * Show a short note under the control (e.g. the range of the field's values),
   * or remove it with an empty text.
   *
   * @param {string} text Note text.
   * @returns {HInput} This input.
   */
  setNote(text) {
    const value = String(text ?? '').trim();
    if (!value) { this.noteElement?.remove(); this.noteElement = null; return this; }
    if (!this.noteElement) {
      this.noteElement = document.createElement('div');
      this.noteElement.className = 'h-form-input-note';
      const controlHost = this.container?.querySelector('.h-form-input-control');
      if (controlHost) controlHost.after(this.noteElement);
      else this.container?.append(this.noteElement);
    }
    this.noteElement.textContent = value;
    return this;
  }

  /**
   * Let the label collapse and expand the control and help (accordion view).
   *
   * @param {HTMLLabelElement} label Field label.
   * @returns {void}
   */
  _makeCollapsible(label) {
    const container = this.container;
    container.classList.add('is-collapsible');
    label.tabIndex = 0;
    label.setAttribute('role', 'button');
    const toggle = (collapsed) => {
      container.classList.toggle('is-collapsed', collapsed);
      label.setAttribute('aria-expanded', String(!collapsed));
      if (!collapsed) this._onExpand?.();
    };
    toggle(Boolean(this.options.collapsed));
    // preventDefault: a label click would otherwise focus (and open) the control
    this.listen(label, 'click', (event) => {
      event.preventDefault();
      toggle(!container.classList.contains('is-collapsed'));
    });
    this.listen(label, 'keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggle(!container.classList.contains('is-collapsed'));
    });
  }

  /** Show the clear action only when the input currently has a value. */
  _syncClearButton() {
    if (!this.clearButton) return;
    const value = this.getValue();
    const present = Array.isArray(value) ? value.length > 0
      : value && typeof value === 'object' ? Object.values(value).some((part) => part != null && part !== '')
        : value != null && value !== '';
    this.clearButton.hidden = !present || Boolean(this.options.readOnly);
  }
}
