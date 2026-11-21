/**
 * @file HRangeList.js
 * @brief The ranges / categories of one field (plan 17 §5, shared with the crosstabs, plan 27q2 §13.1): one row per range
 *        with a remove action and its value — an enum field: the term picker (several terms = one merged category);
 *        other fields: from `<>` to — plus the columns of the user (the thematic editor: symbol preview, reset, legend;
 *        the crosstabs: the label of the range). Taken out of HThematicMapEditor; no new inputs (createHInput enum and
 *        text boxes as before).
 *
 * The ranges are `[{value, ...}]` in the syntax of rangeDefinitions.js; the list changes them in place.
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
import { $HR } from '../../ui/i18n/HResource.js';
import { TermSource } from '../../data/valueSources/localSources.js';
import { formatRange, parseRange } from '../../data/ranges/rangeDefinitions.js';
import './HRangeList.css';

/** The rows of the ranges of one field. */
export class HRangeList extends HBaseWidget {
  /**
   * @param {HTMLElement} container
   * @param {object} options
   * @param {Array<{value: string}>} options.ranges The ranges, changed in place.
   * @param {boolean} [options.enumField] Categories of terms (a term picker), else intervals / values (from <> to).
   * @param {object} [options.dbdefs] HDbDefs (the terms).
   * @param {number} [options.vocabulary] Vocabulary of the enum field.
   * @param {(row: HTMLElement, range: object, index: number) => Node[]} [options.extras] More columns of a row.
   * @param {() => void} [options.onChange] A value changed, or a range was removed.
   * @returns {HRangeList}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.inputs = [];
    return this;
  }

  /** @returns {HRangeList} */
  render() {
    void this._destroyInputs();
    this.container.classList.add('h-thematic-range-list');
    const ranges = this.options.ranges || [];
    const vocabulary = this.options.enumField ? Number(this.options.vocabulary) || 0 : 0;
    this.container.replaceChildren(...ranges.map((range, index) => this._row(range, index, vocabulary)));
    if (!ranges.length) {
      const note = document.createElement('div');
      note.className = 'h-thematic-empty h-muted';
      note.textContent = $HR('No ranges');
      this.container.append(note);
    }
    this.state = 'rendered';
    return this;
  }

  /**
   * Show other ranges (or the same after a change of the field).
   *
   * @param {Array<object>} ranges
   * @param {{enumField?: boolean, vocabulary?: number}} [field]
   * @returns {HRangeList}
   */
  setRanges(ranges, field = {}) {
    this.options = { ...this.options, ranges, ...field };
    return this.render();
  }

  /** @returns {Promise<void>} */
  async destroy() {
    await this._destroyInputs();
    await super.destroy();
  }

  /** @private One row. */
  _row(range, index, vocabulary) {
    const row = document.createElement('div');
    row.className = 'h-thematic-range';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'heurist-icon-button h-thematic-link h-thematic-range-remove';
    remove.title = $HR('Remove range');
    remove.setAttribute('aria-label', remove.title);
    remove.innerHTML = '<span class="fa-solid fa-circle-minus" aria-hidden="true"></span>';
    remove.addEventListener('click', () => {
      this.options.ranges.splice(index, 1);
      this.render();
      this.options.onChange?.();
    });
    const values = document.createElement('div');
    values.className = 'h-thematic-range-values';
    const parsed = parseRange(range.value);
    if (vocabulary && this.options.dbdefs) {
      const selected = parsed.kind === 'list' ? parsed.values : (parsed.value ? [parsed.value] : []);
      const input = createHInput('enum', values, {
        source: new TermSource(this.options.dbdefs, vocabulary),
        // no clear button: the row has its own remove action
        mode: 'select', multiple: true, suppressLabel: true, clearButton: false, value: selected.map(Number)
      });
      values.addEventListener('h-input-change', () => {
        const value = input.getValue();
        range.value = formatRange(Array.isArray(value) ? value : (value == null ? [] : [value]));
        this.options.onChange?.();
      });
      this.inputs.push(input);
    } else {
      const from = textBox(parsed.kind === 'interval' ? parsed.min : (parsed.kind === 'list' ? parsed.values.join(',') : parsed.value || ''));
      const to = textBox(parsed.kind === 'interval' ? parsed.max : '');
      const sync = () => {
        range.value = formatRange(from.value, to.value);
        this.options.onChange?.();
      };
      from.addEventListener('input', sync);
      to.addEventListener('input', sync);
      const separator = document.createElement('span');
      separator.className = 'h-thematic-range-separator';
      separator.textContent = '<>';
      values.append(from, separator, to);
    }
    row.append(remove, values, ...(this.options.extras?.(row, range, index) || []));
    return row;
  }

  /** @private Remove the term pickers. */
  async _destroyInputs() {
    const inputs = this.inputs || [];
    this.inputs = [];
    for (const input of inputs) await input.destroy?.();
  }
}

/** A text box of a range bound. */
function textBox(value) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'h-input h-thematic-range-bound';
  input.value = value ?? '';
  return input;
}
