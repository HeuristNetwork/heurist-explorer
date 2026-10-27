/**
 * @file HInputGeo.js
 * @brief Compact geographic value input with a map extent picker, or a map
 *        drawing of a geometry (`geoKind: 'feature'` with `selectGeometry`).
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
import { $HR } from '../../../ui/i18n/index.js';
import { extentFromWkt, extentToWkt, isExtent } from '../../../utils/geoExtent.js';
import { geoToHuman } from '../../../utils/geoText.js';
import './HInputGeo.css';

const COORDINATES = ['west', 'south', 'east', 'north'];

/**
 * Displays a WKT geometry or map extent and lets the user choose an extent on the map,
 * or draw a geometry (points, lines, polygons; WKT or GeoJSON can be pasted there).
 */
export class HInputGeo extends HInput {
  /** @returns {boolean} Whether the map button draws a geometry (else it picks an extent). */
  get drawsGeometry() {
    return this.options.geoKind === 'feature' && typeof this.options.selectGeometry === 'function';
  }

  /** @returns {boolean} Whether the host gives a map picker for this input. */
  get hasPicker() {
    return this.drawsGeometry || typeof this.options.selectExtent === 'function';
  }

  /** Render the read-only summary and map action. */
  renderControl(host) {
    const group = document.createElement('div');
    group.className = 'h-input-geo';
    this.summary = document.createElement('input');
    this.summary.className = 'h-input h-input-geo-summary';
    this.summary.type = 'text';
    this.summary.readOnly = true;
    this.summary.placeholder = this.drawsGeometry ? $HR('Draw on map') : $HR('Select extent on map');
    this.summary.setAttribute('aria-label', $HR('Geographic value'));

    // options.geoKind: 'extent' (filters: a bounding box, the default) or 'feature'
    // (a field value: a geometry) - only the button icon differs (2026-10-17)
    this.mapButton = document.createElement('button');
    this.mapButton.type = 'button';
    this.mapButton.className = 'h-btn h-input-geo-map';
    const icon = document.createElement('span');
    icon.className = this.options.geoKind === 'feature' ? 'fa-solid fa-draw-polygon' : 'fa-solid fa-expand';
    icon.setAttribute('aria-hidden', 'true');
    this.mapButton.append(icon);
    this.mapButton.title = this.drawsGeometry ? $HR('Draw on map') : $HR('Select extent on map');
    this.mapButton.setAttribute('aria-label', this.mapButton.title);
    this.mapButton.disabled = !this.hasPicker;
    this.listen(this.mapButton, 'click', async () => {
      try {
        if (this.drawsGeometry) {
          // the Map draw mode with points, lines, polygons and Add / Get Geometry (plan 14a)
          const current = isExtent(this.value) ? extentToWkt(this.value) : (this.value || null);
          const drawing = await this.options.selectGeometry(current);
          if (drawing?.wkt) {
            this.geoType = drawing.type || null;
            this.setValue(drawing.wkt);
            this.notifyChange();
          }
          return;
        }
        // a stored value is WKT: the picker starts at its bounds
        const current = isExtent(this.value) ? this.value : (this.value ? extentFromWkt(String(this.value)) : null);
        const extent = await this.options.selectExtent(current);
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
    group.append(this.summary, this.mapButton);
    host.append(group);
    return group;
  }

  /** @returns {string|object|null} WKT text or Map extent. */
  getValue() { return this.value; }

  /** Set a WKT geometry or Map extent. */
  setValue(value) {
    super.setValue(value);
    if (this.summary) this.summary.value = describeGeoValue(value);
    return this;
  }

  /** Disable or enable the map action. */
  setReadOnly(readOnly) {
    this._markReadOnly(readOnly);
    if (this.mapButton) {
      this.mapButton.disabled = Boolean(readOnly) || !this.hasPicker;
    }
    return this;
  }

  /** @returns {string[]} Validation errors. */
  validate() {
    if (this.value == null || this.value === '') {
      return this.options.required ? ['A geographic value is required'] : [];
    }
    if (isExtent(this.value)) {
      const extent = this.value;
      return extent.south <= extent.north
        && COORDINATES.every((key) => Number.isFinite(Number(extent[key])))
        ? [] : ['Invalid geographic extent'];
    }
    return typeof this.value === 'string' && /^((MULTI)?(POINT|LINESTRING|POLYGON)|GEOMETRYCOLLECTION)\s*\(/i.test(this.value.trim())
      ? [] : ['Invalid WKT geometry'];
  }
}

/**
 * Readable text of a WKT geometry or extent, without raw coordinate syntax: the shared
 * `geoToHuman` (feature type, vertices, coordinate ranges), as everywhere else.
 *
 * @param {string|object|null} value WKT text or Map extent.
 * @returns {string} The text.
 */
export function describeGeoValue(value) {
  return geoToHuman(value);
}
