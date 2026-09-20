/**
 * @file HInputGeo.js
 * @brief Compact geographic value input with a map extent picker.
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
import './HInputGeo.css';

const COORDINATES = ['west', 'south', 'east', 'north'];

/** Displays a WKT geometry or map extent and lets the user choose an extent on the map. */
export class HInputGeo extends HInput {
  /** Render the read-only summary and map action. */
  renderControl(host) {
    const group = document.createElement('div');
    group.className = 'h-input-geo';
    this.summary = document.createElement('input');
    this.summary.className = 'h-input h-input-geo-summary';
    this.summary.type = 'text';
    this.summary.readOnly = true;
    this.summary.placeholder = $HR('Select extent on map');
    this.summary.setAttribute('aria-label', $HR('Geographic value'));

    this.mapButton = document.createElement('button');
    this.mapButton.type = 'button';
    this.mapButton.className = 'h-btn h-input-geo-map';
    this.mapButton.textContent = '✎';
    this.mapButton.title = $HR('Select extent on map');
    this.mapButton.setAttribute('aria-label', $HR('Select extent on map'));
    this.mapButton.disabled = typeof this.options.selectExtent !== 'function';
    this.listen(this.mapButton, 'click', async () => {
      try {
        const current = isExtent(this.value) ? this.value : null;
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
    if (this.mapButton) {
      this.mapButton.disabled = Boolean(readOnly) || typeof this.options.selectExtent !== 'function';
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
    return typeof this.value === 'string' && /^(POINT|LINESTRING|POLYGON)\s*\(/i.test(this.value.trim())
      ? [] : ['Invalid WKT geometry'];
  }
}

/** Summarize a WKT geometry or extent without exposing raw coordinate syntax. */
export function describeGeoValue(value) {
  if (isExtent(value)) {
    return `BBOX (${format(value.south)} ${format(value.east)} – ${format(value.north)} ${format(value.west)} ${$HR('lat long')})`;
  }
  const text = String(value ?? '').trim();
  if (!text) return '';
  const point = /^POINT\s*\(\s*([^\s,()]+)\s+([^\s,()]+)\s*\)/i.exec(text);
  if (point) return `POINT (${format(point[2])} ${format(point[1])} ${$HR('lat long')})`;
  const kind = /^(LINESTRING|POLYGON)\s*\(/i.exec(text)?.[1]?.toUpperCase();
  if (kind) {
    const vertices = text.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\s+-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) || [];
    const count = kind === 'POLYGON' && vertices.length > 1 && vertices[0] === vertices.at(-1)
      ? vertices.length - 1 : vertices.length;
    return `${kind === 'LINESTRING' ? 'LINE' : 'POLYGON'} ${count} ${$HR('vertices')}`;
  }
  return text;
}

/** Convert Map bounds to polygon WKT for a geographic field predicate. */
export function extentToWkt(extent) {
  if (!isExtent(extent)) return '';
  const { west, south, east, north } = extent;
  return `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`;
}

/** @returns {boolean} Whether a value carries all four map bounds. */
function isExtent(value) {
  return value && typeof value === 'object'
    && COORDINATES.every((key) => value[key] !== '' && value[key] != null);
}

/** Format a coordinate without insignificant trailing zeros. */
function format(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Number(number.toFixed(6))) : String(value);
}
