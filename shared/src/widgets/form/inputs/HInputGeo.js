/**
 * @file HInputGeo.js
 * @brief Geographic extent input compatible with Map viewport bounds.
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

import { HInput } from './HInput.js';
import './HInputGeo.css';

const COORDINATES = ['west', 'south', 'east', 'north'];

/** Edits a viewport extent in Map's west/south/east/north format. */
export class HInputGeo extends HInput {
  /**
   * Create coordinate inputs and an optional map-selection action.
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLElement} Coordinate group.
   */
  renderControl(host) {
    const group = document.createElement('div');
    group.className = 'h-input-geo-coordinates';
    this.coordinates = {};

    for (const name of COORDINATES) {
      const input = document.createElement('input');
      input.className = 'h-input';
      input.type = 'number';
      input.step = 'any';
      input.placeholder = name;
      input.setAttribute('aria-label', name);
      input.addEventListener('input', () => this.notifyChange());
      group.append(input);
      this.coordinates[name] = input;
    }

    host.append(group);

    if (typeof this.options.selectExtent === 'function') {
      this.mapButton = document.createElement('button');
      this.mapButton.type = 'button';
      this.mapButton.className = 'h-btn h-input-geo-map h-i18n';
      this.mapButton.textContent = 'Set extent on map';
      this.listen(this.mapButton, 'click', async () => {
        try {
          const extent = await this.options.selectExtent(this.getValue());
          if (extent) {
            this.setValue(extent);
            this.notifyChange();
          }
        } catch (error) {
          this.container?.dispatchEvent(new CustomEvent('h-input-error', {
            bubbles: true,
            detail: { input: this, error }
          }));
        }
      });
      host.append(this.mapButton);
    }

    return group;
  }

  /** @returns {{west:number,south:number,east:number,north:number}|null} Extent. */
  getValue() {
    if (!this.coordinates) return this.value;
    const values = Object.fromEntries(COORDINATES.map((name) => [name, this.coordinates[name].value]));
    if (COORDINATES.every((name) => values[name] === '')) return null;
    if (COORDINATES.some((name) => values[name] === '')) return null;
    return Object.fromEntries(COORDINATES.map((name) => [name, Number(values[name])]));
  }

  /**
   * Set the extent.
   *
   * @param {object|null} value Map viewport bounds.
   * @returns {HInputGeo} This input.
   */
  setValue(value) {
    super.setValue(value);
    for (const name of COORDINATES) {
      if (this.coordinates?.[name]) this.coordinates[name].value = value?.[name] ?? '';
    }

    return this;
  }

  /**
   * Disable coordinate and map controls.
   *
   * @param {boolean} readOnly Whether editing is disabled.
   * @returns {HInputGeo} This input.
   */
  setReadOnly(readOnly) {
    for (const name of COORDINATES) {
      if (this.coordinates?.[name]) this.coordinates[name].disabled = Boolean(readOnly);
    }

    if (this.mapButton) this.mapButton.disabled = Boolean(readOnly);
    return this;
  }

  /** @returns {string[]} Validation errors. */
  validate() {
    const entered = COORDINATES.filter((name) => this.coordinates?.[name]?.value !== '');
    if (!entered.length) return this.options.required ? ['An extent is required'] : [];
    if (entered.length !== COORDINATES.length) return ['All four extent coordinates are required'];
    const value = this.getValue();
    if (!value || value.south > value.north
      || Math.abs(value.west) > 180 || Math.abs(value.east) > 180
      || Math.abs(value.south) > 90 || Math.abs(value.north) > 90) {
      return ['Invalid geographic extent'];
    }

    return [];
  }
}
