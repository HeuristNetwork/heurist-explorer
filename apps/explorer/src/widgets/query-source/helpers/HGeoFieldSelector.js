/**
 * @file HGeoFieldSelector.js
 * @brief Geographic field-path selector plus viewport/zoom Query Source options.
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

import { HFieldSelectionEditor } from './HFieldSelectionEditor.js';
import { fieldCodeLabel } from './fieldPathUtils.js';
import { $HR, HMsg } from '#shared/ui';

const RT_PLACE = '3-1009';
const DT_GEO_OBJECT = '2-28';

/** Geographic field-path selector plus viewport/zoom Query Source options. */
export class HGeoFieldSelector extends HFieldSelectionEditor {
  /** @param {object} [options] Forwarded to HFieldSelectionEditor; `title` and the geo-specific selection settings are fixed. */
  constructor(options = {}) {
    super({ ...options, title: 'Geographic fields', selectableTypes: ['geo'], hideUnselectable: true, allowReorder: false, showSort: false });
    this.mapOptions = { dynamicRequests: false, minZoom: null, maxZoom: null, geoOutputMode: 'records' };
  }

  /**
   * @param {object} [profile] Map presentation profile (`geoFields`, `dynamicRequests`, `minZoom`, `maxZoom`, `geoOutputMode`).
   * @returns {HGeoFieldSelector} this, for chaining.
   */
  setMapProfile(profile = {}) {
    this.setValue(profile.geoFields || []);
    this.mapOptions = {
      dynamicRequests: profile.dynamicRequests === true,
      minZoom: finiteOrNull(profile.minZoom),
      maxZoom: finiteOrNull(profile.maxZoom),
      geoOutputMode: profile.geoOutputMode === 'features' ? 'features' : 'records'
    };
    if (this.isRendered) this._syncOptions();
    return this;
  }

  /** @returns {object} The current map presentation profile (`geoFields` plus viewport/zoom options). */
  getMapProfile() { return { geoFields: this.getValue().map((item) => item.field), ...this.mapOptions }; }

  /** @returns {HGeoFieldSelector} this, for chaining. */
  render() {
    super.render();
    const auto = document.createElement('button');
    auto.type = 'button';
    auto.className = 'h-btn h-btn-small';
    auto.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ' + $HR('Auto select Place→Location');
    auto.title = $HR('Find a link to Place and select its Location field');
    auto.addEventListener('click', () => this._autoSelectPlaceLocation());
    this._add.after(auto);

    const box = document.createElement('div');
    box.className = 'h-qse-helper-options h-qse-geo-options';
    this._dynamic = checkbox($HR('Load dynamically by map extent'));
    this._features = checkbox($HR('Individual Linked Map Features'));
    this._min = numberInput(0, 22);
    this._max = numberInput(0, 22);
    const featureRow = document.createElement('div');
    featureRow.className = 'h-qse-helper-option-row';
    featureRow.append(this._features.wrap);
    const dynamicRow = document.createElement('div');
    dynamicRow.className = 'h-qse-helper-option-row';
    dynamicRow.append(
      this._dynamic.wrap,
      labelled($HR('Minimum zoom'), this._min),
      labelled($HR('Maximum zoom'), this._max)
    );
    box.append(featureRow, dynamicRow);
    this.container.append(box);
    this._dynamic.input.addEventListener('change', () => this._readOptions());
    this._features.input.addEventListener('change', () => this._readOptions());
    this._min.addEventListener('change', () => this._readOptions());
    this._max.addEventListener('change', () => this._readOptions());
    this._syncOptions();
    return this;
  }

  _readOptions() {
    this.mapOptions = {
      dynamicRequests: this._dynamic.input.checked,
      minZoom: finiteOrNull(this._min.value),
      maxZoom: finiteOrNull(this._max.value),
      geoOutputMode: this._features.input.checked ? 'features' : 'records'
    };
  }

  _syncOptions() {
    if (!this._dynamic) return;
    this._dynamic.input.checked = this.mapOptions.dynamicRequests;
    this._features.input.checked = this.mapOptions.geoOutputMode === 'features';
    this._min.value = this.mapOptions.minZoom ?? '';
    this._max.value = this.mapOptions.maxZoom ?? '';
  }

  _autoSelectPlaceLocation() {
    const rootRty = Number(this.recordTypeId);
    const placeRty = Number(this.dbdefs.localId?.('rty', RT_PLACE));
    const geoDty = Number(this.dbdefs.localId?.('dty', DT_GEO_OBJECT));
    if (!(rootRty > 0) || !(placeRty > 0) || !(geoDty > 0)) {
      HMsg.showMsgFlash?.($HR('Place or Location definition is not available in this database'));
      return;
    }

    let code = '';
    if (rootRty === placeRty) {
      code = `${rootRty}:${geoDty}`;
    } else {
      const pointer = this.dbdefs.fields(rootRty).find((field) => {
        if (!['resource', 'relmarker'].includes(field.type)) return false;
        const targets = this.dbdefs.fieldGlobal(field.id)?.targetTypes || [];
        return targets.map(Number).includes(placeRty);
      });
      if (pointer) code = `${rootRty}:lt${pointer.id}:${placeRty}:${geoDty}`;
    }

    if (!code) {
      HMsg.showMsgFlash?.($HR('No Place link was found in this query record type'));
      return;
    }
    if (!this.fields.some((item) => item.field === code)) {
      this.fields.push({ field: code, title: fieldCodeLabel(code, this.dbdefs), visible: true, _type: 'geo' });
      this._renderRows();
    }
  }
}

function finiteOrNull(value) { const n = Number(value); return value === '' || value == null || !Number.isFinite(n) ? null : n; }
function numberInput(min, max) { const i = document.createElement('input'); i.type = 'number'; i.className = 'h-input h-qse-zoom'; i.min = String(min); i.max = String(max); return i; }
function labelled(text, input) { const l = document.createElement('label'); l.className = 'h-qse-option'; l.append(document.createTextNode(text + ' '), input); return l; }
function checkbox(text) { const wrap = document.createElement('label'); wrap.className = 'h-qse-option'; const input = document.createElement('input'); input.type = 'checkbox'; wrap.append(input, document.createTextNode(' ' + text)); return { wrap, input }; }
