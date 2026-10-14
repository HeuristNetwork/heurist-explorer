/**
 * @file HRangeGenerator.js
 * @brief "Generate ranges" of a thematic field (legacy mapThemesEditor
 *        _defineAutoRanges / _definePreviewRanges): intervals of a numeric or date
 *        field from its bounds, or the categories of an enum field (the values in
 *        the database, or every term of the vocabulary), with a preview (plan 17 §5).
 *
 * The ranges themselves come from the shared range definitions
 * (data/ranges/rangeDefinitions.js), which crosstabs will use too.
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

import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';
import {
  DATE_ROUNDINGS, NUMBER_ROUNDINGS, categoryRanges, formatRange, generateRanges, isIntervalType
} from '../../data/ranges/rangeDefinitions.js';
import { fieldBounds, fieldCodeDty, fieldCodeType, fieldValues } from '../../symbology/thematicFields.js';

/**
 * Open the dialog for one field.
 *
 * @param {object} options
 * @param {string} options.code Field path code.
 * @param {object} options.api HeuristApiClient.
 * @param {object} options.dbdefs HDbDefs.
 * @param {Array|object|string} options.query Layer query.
 * @returns {Promise<Array<{value: string}>|null>} The ranges, or null on Close.
 */
export function openRangeGenerator({ code, api, dbdefs, query }) {
  const type = fieldCodeType(code, dbdefs);
  const interval = isIntervalType(type);
  const date = type === 'date' || type === 'year';
  const host = document.createElement('div');
  host.className = 'h-range-generator';
  const preview = document.createElement('div');
  preview.className = 'h-range-generator-preview';
  const status = document.createElement('p');
  status.className = 'h-range-generator-status h-muted';
  let ranges = [];

  const show = (items) => {
    ranges = items;
    preview.replaceChildren(...items.map((range) => {
      const row = document.createElement('div');
      row.className = 'h-range-generator-row';
      if (range.min != null) {
        row.textContent = `${range.min}  –  ${range.max}`;
      } else {
        row.textContent = range.label ? `${range.label}` : range.value;
        row.title = String(range.value);
      }
      return row;
    }));
    status.textContent = items.length ? `${items.length} ${$HR(interval ? 'ranges' : 'categories')}` : $HR('No ranges');
  };

  if (interval) {
    const count = numberInput(10, { min: 1, max: 50 });
    const min = textInput();
    const max = textInput();
    const rounding = document.createElement('select');
    rounding.className = 'h-select';
    for (const [value, label] of date ? DATE_ROUNDINGS : NUMBER_ROUNDINGS) rounding.append(new Option($HR(label), String(value)));
    rounding.value = '0';
    const recompute = () => show(generateRanges({
      fieldType: type, min: min.value, max: max.value, count: Number(count.value), rounding: Number(rounding.value)
    }));
    for (const control of [count, min, max, rounding]) control.addEventListener('input', recompute);
    rounding.addEventListener('change', recompute);
    host.append(
      row('Intervals count', count),
      row('Min / Range from', min),
      row('Max / Range to', max),
      row('Rounding', rounding),
      status, preview
    );
    status.textContent = $HR('Loading');
    fieldBounds(api, code, query).then((bounds) => {
      min.value = bounds.min ?? '';
      max.value = bounds.max ?? '';
      recompute();
    }, (error) => { status.textContent = error?.message || String(error); });
  } else {
    const actual = radio('h-range-enum', true, 'Use actual values from database');
    const all = radio('h-range-enum', false, 'Use all terms');
    const recompute = async () => {
      if (all.input.checked) {
        const vocab = dbdefs?.vocabRoot?.(fieldCodeDty(code));
        const terms = vocab ? (dbdefs.termTree(vocab, { flat: true }) || []).slice(1) : [];
        show(categoryRanges(terms.map((term) => term.internalid))
          .map((range) => ({ ...range, label: dbdefs.termLabel(range.value) })));
        return;
      }
      status.textContent = $HR('Loading');
      try {
        const values = await fieldValues(api, code, query);
        show(categoryRanges(values).map((range) => ({
          ...range, label: values.find((item) => item.value === range.value)?.label || range.value
        })));
      } catch (error) {
        status.textContent = error?.message || String(error);
      }
    };
    actual.input.addEventListener('change', recompute);
    all.input.addEventListener('change', recompute);
    host.append(actual.label, all.label, status, preview);
    void recompute();
  }

  return new Promise((resolve) => {
    const id = `h-range-generator-${Date.now()}`;
    let finished = false;
    const finish = (apply) => {
      if (finished) return;
      finished = true;
      HMsg.closeMsgDlg(id);
      resolve(apply && ranges.length
        ? ranges.map((range, index) => ({ value: range.min != null
          ? formatRange(date ? yearText(range.min) : range.min, date ? dateRangeEnd(range.max, index === ranges.length - 1) : range.max)
          : String(range.value) }))
        : null);
    };
    const dialog = HMsg.showMsgDlg(host, {
      dialogId: id,
      title: $HR('Define ranges'),
      preventClose: true,
      buttons: [
        { label: $HR('Apply'), class: 'h-btn h-btn-primary', onClick: () => finish(true) },
        { label: $HR('Close'), class: 'h-btn', onClick: () => finish(false) }
      ]
    });
    dialog?.classList.add('h-range-generator-dialog');
    dialog?.addEventListener('close', () => finish(false), { once: true });
  });
}

/**
 * The end of a date range: dates are compared as text, so a range up to year Y ends on
 * the last day of Y (the last range) or of the year before the next range starts.
 */
function dateRangeEnd(year, last) {
  const value = Math.round(Number(year)) - (last ? 0 : 1);
  return Number.isFinite(value) && value >= 0 ? `${yearText(value)}-12-31` : String(year);
}

/** A year as four digits (dates are compared as text). */
function yearText(year) {
  const value = Math.round(Number(year));
  return Number.isFinite(value) && value >= 0 ? String(value).padStart(4, '0') : String(year);
}

/** A labelled row. */
function row(label, control) {
  const element = document.createElement('label');
  element.className = 'h-range-generator-field';
  const caption = document.createElement('span');
  caption.className = 'h-i18n';
  caption.textContent = $HR(label);
  element.append(caption, control);
  return element;
}

/** A number box. */
function numberInput(value, { min, max }) {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'h-input';
  Object.assign(input, { min, max, value: String(value) });
  return input;
}

/** A text box. */
function textInput() {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'h-input';
  return input;
}

/** A radio button with its label. */
function radio(name, checked, text) {
  const label = document.createElement('label');
  label.className = 'h-range-generator-choice';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.checked = checked;
  const caption = document.createElement('span');
  caption.textContent = $HR(text);
  label.append(input, caption);
  return { label, input };
}
