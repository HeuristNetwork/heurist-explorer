/**
 * @file HFilterForm.js
 * @brief Base container reserved for parametrized saved-filter input forms.
 *
 * The persisted parameter schema is intentionally not guessed here. A concrete
 * form renderer can attach fields once that schema is defined.
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
import { HBaseWidget } from '#shared/widgets';

/** Base container for a parametrized saved-filter's input form. */
export class HFilterForm extends HBaseWidget {
  /** Create the form in its unattached state. */
  constructor() {
    super();
    this.filter = null;
    this.values = {};
  }

  /**
   * Attach the form to its container and record the owning filter and initial values.
   *
   * @param {HTMLElement} container Container element.
   * @param {object} [options] Attach options.
   * @param {*} [options.filter] Owning saved filter, when applicable.
   * @param {object} [options.values] Initial parameter values.
   * @returns {HFilterForm} This instance, for chaining.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.filter = options.filter ?? null;
    this.values = { ...(options.values || {}) };
    return this;
  }

  /**
   * Render the form's container classes. Concrete field rendering is left to a subclass.
   *
   * @returns {HFilterForm} This instance, for chaining.
   * @throws {Error} When the form has not been attached yet.
   */
  render() {
    if (!this.container) throw new Error('HFilterForm must be attached before render');
    this.container.classList.add('h-widget', 'h-filter-form');
    this.state = 'rendered';
    return this;
  }

  /**
   * Read the current parameter values.
   *
   * @returns {object} A copy of the current values.
   */
  getValues() { return { ...this.values }; }

  /**
   * Replace the current parameter values.
   *
   * @param {object} [values] New parameter values.
   * @returns {HFilterForm} This instance, for chaining.
   */
  setValues(values = {}) { this.values = { ...values }; return this; }
}
