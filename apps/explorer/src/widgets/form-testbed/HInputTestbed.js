/**
 * @file HInputTestbed.js
 * @brief Popup test form for shared text and enum inputs.
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
import { HInputText } from '#shared/widgets/form/inputs/HInputText.js';
import { HInputEnum } from '#shared/widgets/form/inputs/HInputEnum.js';
import './HInputTestbed.css';

/** Shows two editable fields selected from the current database snapshot. */
export class HInputTestbed extends HBaseWidget {
  /** Create an unattached testbed. */
  constructor() {
    super();
    this.inputs = new Map();
  }

  /**
   * Render a Person family-name and Gender form.
   *
   * @returns {HInputTestbed} This form.
   */
  render() {
    if (!this.container) throw new Error('HInputTestbed must be attached before render');

    const dbdefs = this.options.dbdefs;
    const nameField = dbdefs.field(10, 1);
    const genderField = dbdefs.field(10, 20);
    if (!nameField || !genderField || !genderField.vocabulary) {
      throw new Error('The test fields are missing from the database snapshot');
    }

    this.container.replaceChildren();
    this.container.className = 'h-widget h-input-testbed';

    const description = document.createElement('p');
    description.className = 'h-input-testbed-description h-i18n';
    description.textContent = 'Person fields from the current database definition. Values are not saved.';
    this.container.append(description);

    const nameHost = this._addHost();
    const nameInput = new HInputText();
    nameInput.attach(nameHost, { label: nameField.name, required: nameField.req === 'required' }).render();
    this.inputs.set('name', nameInput);

    const genderHost = this._addHost();
    const genderInput = new HInputEnum();
    genderInput.attach(genderHost, {
      label: genderField.name,
      required: genderField.req === 'required',
      terms: dbdefs.termChildren(genderField.vocabulary).map((id) => dbdefs.term(id)).filter(Boolean)
    }).render();
    this.inputs.set('gender', genderInput);

    const resultLabel = document.createElement('div');
    resultLabel.className = 'h-input-testbed-result-label h-i18n';
    resultLabel.textContent = 'Current values';
    this.result = document.createElement('pre');
    this.result.className = 'h-input-testbed-result';
    this.container.append(resultLabel, this.result);

    this.listen(this.container, 'h-input-change', () => this._showValues());
    this._showValues();
    this.state = 'rendered';
    return this;
  }

  /**
   * Read the current form values.
   *
   * @returns {{name:string, gender:number|null}} Current values.
   */
  getValues() {
    return {
      name: this.inputs.get('name')?.getValue() ?? '',
      gender: this.inputs.get('gender')?.getValue() ?? null
    };
  }

  /**
   * Validate the two fields.
   *
   * @returns {string[]} Validation errors.
   */
  validate() {
    const errors = [];

    for (const [key, input] of this.inputs) {
      for (const message of input.validate()) {
        errors.push(`${key}: ${message}`);
      }
    }

    return errors;
  }

  /**
   * Destroy child inputs and the test form.
   *
   * @returns {Promise<void>} Completion.
   */
  async destroy() {
    for (const input of this.inputs.values()) {
      await input.destroy();
    }

    this.inputs.clear();
    await super.destroy();
  }

  /** @returns {HTMLElement} New host for an input. */
  _addHost() {
    const host = document.createElement('div');
    host.className = 'h-input-testbed-field';
    this.container.append(host);
    return host;
  }

  /** Update the live value preview. */
  _showValues() {
    if (this.result) this.result.textContent = JSON.stringify(this.getValues(), null, 2);
  }
}
