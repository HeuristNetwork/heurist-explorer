/**
 * @file HImageFilterEditor.js
 * @brief CSS image filters of an image (raster) map layer: blur, brightness,
 *        contrast, grayscale, hue rotation, invert, opacity, saturation, sepia and a
 *        transparent colour (plan 17 §4). Port of hclient/widgets/editing/imgFilter.js.
 *
 * The value is the layer's DT_SYMBOLOGY: only the filters that differ from their
 * neutral value, with their units (`{"blur": "2px", "brightness": "0.8"}`).
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

import { HBaseWidget } from '../HBaseWidget.js';
import { createHInput } from '../form/inputs/createHInput.js';
import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';
import { parseSymbology } from '../../symbology/symbology.js';
import './HImageFilterEditor.css';

/** Filters: name, neutral value, slider bounds, unit (as the legacy imgFilter.html). */
export const IMAGE_FILTERS = Object.freeze([
  { name: 'blur', neutral: 0, min: 0, max: 10, step: 0.1, unit: 'px' },
  { name: 'brightness', neutral: 1, min: 0, max: 3, step: 0.1 },
  { name: 'contrast', neutral: 1, min: 0, max: 3, step: 0.1 },
  { name: 'grayscale', neutral: 0, min: 0, max: 1, step: 0.01 },
  { name: 'hue-rotate', neutral: 0, min: 0, max: 360, step: 1, unit: 'deg' },
  { name: 'invert', neutral: 0, min: 0, max: 1, step: 0.01 },
  { name: 'opacity', neutral: 1, min: 0, max: 1, step: 0.01 },
  { name: 'saturate', neutral: 1, min: 0, max: 3, step: 0.1 },
  { name: 'sepia', neutral: 0, min: 0, max: 1, step: 0.01 }
]);

/** Sliders of the image filters, a transparent colour and a sample image. */
export class HImageFilterEditor extends HBaseWidget {
  /**
   * Edit the filters in a dialog.
   *
   * @param {*} value Stored filters (object or JSON text).
   * @param {{title?: string, sampleUrl?: string}} [options] `sampleUrl`: image for the preview.
   * @returns {Promise<object|null>} The filters to store, or null on Cancel.
   */
  static open(value, options = {}) {
    const host = document.createElement('div');
    const editor = new HImageFilterEditor().attach(host, { ...options, value: parseSymbology(value) || {} });
    editor.render();
    return new Promise((resolve) => {
      const id = `h-image-filter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let finished = false;
      const finish = async (save) => {
        if (finished) return;
        finished = true;
        const result = save ? editor.getValue() : null;
        HMsg.closeMsgDlg(id);
        await editor.destroy();
        resolve(result);
      };
      const dialog = HMsg.showMsgDlg(host, {
        dialogId: id,
        title: $HR(options.title || 'Define filters'),
        preventClose: true,
        buttons: [
          { label: $HR('Apply'), class: 'h-btn h-btn-primary', onClick: () => void finish(true) },
          { label: $HR('Reset'), class: 'h-btn', onClick: () => editor.reset() },
          { label: $HR('Cancel'), class: 'h-btn', onClick: () => void finish(false) }
        ]
      });
      dialog?.classList.add('h-image-filter-dialog');
      dialog?.addEventListener('close', () => void finish(false), { once: true });
    });
  }

  /** @returns {HImageFilterEditor} This editor. */
  render() {
    if (!this.container) throw new Error('HImageFilterEditor must be attached before render');
    this.container.className = 'h-widget h-image-filter';
    this.container.replaceChildren();
    const value = this.options.value || {};
    this.sliders = new Map();
    for (const filter of IMAGE_FILTERS) {
      const row = document.createElement('label');
      row.className = 'h-image-filter-row';
      const name = document.createElement('span');
      name.className = 'h-image-filter-name';
      name.textContent = $HR(filter.name);
      const slider = document.createElement('input');
      slider.type = 'range';
      Object.assign(slider, { min: filter.min, max: filter.max, step: filter.step });
      const stored = parseFloat(value[filter.name]);
      slider.value = String(Number.isFinite(stored) ? stored : filter.neutral);
      const shown = document.createElement('span');
      shown.className = 'h-image-filter-value';
      const sync = () => {
        shown.textContent = `${slider.value}${filter.unit || ''}`;
        this._refreshSample();
      };
      this.listen(slider, 'input', sync);
      row.append(name, slider, shown);
      this.container.append(row);
      this.sliders.set(filter.name, { slider, filter, sync });
      shown.textContent = `${slider.value}${filter.unit || ''}`;
    }
    const colourRow = document.createElement('div');
    colourRow.className = 'h-image-filter-row h-image-filter-colour';
    this.container.append(colourRow);
    this.transparent = createHInput('color', colourRow, {
      label: $HR('transparent color'),
      value: value.transparentColor || ''
    });
    if (this.options.sampleUrl) {
      this.sample = document.createElement('img');
      this.sample.className = 'h-image-filter-sample';
      this.sample.alt = '';
      this.sample.src = this.options.sampleUrl;
      this.container.append(this.sample);
    }
    this._refreshSample();
    this.state = 'rendered';
    return this;
  }

  /**
   * The filters that differ from their neutral value, with units, and the transparent colour.
   *
   * @returns {object} Filters.
   */
  getValue() {
    const result = {};
    for (const [name, { slider, filter }] of this.sliders || []) {
      const number = Number(slider.value);
      if (!Number.isFinite(number) || Math.abs(number - filter.neutral) < 1e-9) continue;
      result[name] = `${slider.value}${filter.unit || ''}`;
    }
    const colour = String(this.transparent?.getValue() || '').trim();
    if (colour) result.transparentColor = colour;
    return result;
  }

  /** Every filter back to its neutral value, no transparent colour. */
  reset() {
    for (const { slider, filter, sync } of this.sliders?.values() || []) {
      slider.value = String(filter.neutral);
      sync();
    }
    this.transparent?.setValue('');
  }

  /**
   * The CSS `filter` of the current values.
   *
   * @returns {string} Filter, `''` when neutral.
   */
  cssFilter() {
    return Object.entries(this.getValue())
      .filter(([name]) => name !== 'transparentColor')
      .map(([name, value]) => `${name}(${value})`)
      .join(' ');
  }

  /** Apply the filters to the sample image. */
  _refreshSample() {
    if (this.sample) this.sample.style.filter = this.cssFilter();
  }

  /** Remove the colour input. */
  async destroy() {
    await this.transparent?.destroy?.();
    await super.destroy();
  }
}
