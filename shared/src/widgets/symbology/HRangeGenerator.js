/**
 * @file HRangeGenerator.js
 * @brief "Generate ranges" of a thematic field (legacy mapThemesEditor
 *        _defineAutoRanges / _definePreviewRanges): intervals of a numeric or date
 *        field from its bounds, or the categories of an enum field (the values in
 *        the database, or every term of the vocabulary), with a preview (plan 17 §5).
 *
 * The ranges themselves come from the shared range definitions
 * (data/ranges/rangeDefinitions.js), which crosstabs will use too. The settings
 * are an HEditForm (plan 14a); the preview is a table.
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
import { HEditForm } from '../edit-form/HEditForm.js';
import {
  DATE_ROUNDINGS, NUMBER_ROUNDINGS, categoryRanges, formatRange, generateRanges, isIntervalType
} from '../../data/ranges/rangeDefinitions.js';
import { fieldBounds, fieldCodeDty, fieldCodeType, fieldValues } from '../../symbology/thematicFields.js';
import './HRangeGenerator.css';

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
  const terms = type === 'enum' || type === 'relationtype';
  const host = document.createElement('div');
  host.className = 'h-range-generator';
  const formHost = document.createElement('div');
  const status = document.createElement('p');
  status.className = 'h-range-generator-status h-muted';
  const preview = document.createElement('div');
  preview.className = 'h-range-generator-preview';
  host.append(formHost, status, preview);
  let ranges = [];
  let form = null;

  // the ranges as a table: From / To, or the value (term id), its label and the record count
  const show = (items, { counts = false } = {}) => {
    ranges = items;
    preview.replaceChildren();
    status.textContent = items.length ? `${items.length} ${$HR(interval ? 'ranges' : 'categories')}` : $HR('No ranges');
    if (!items.length) return;
    if (interval) {
      preview.append(rangeTable(['From', 'To'], items.map((range) => [range.min, range.max]), [true, true]));
      return;
    }
    const headers = [terms ? 'Term ID' : 'Value', ...(terms ? ['Label'] : []), ...(counts ? ['Records'] : [])];
    const rows = items.map((range) => [range.value, ...(terms ? [range.label || ''] : []), ...(counts ? [range.count ?? ''] : [])]);
    preview.append(rangeTable(headers, rows, [terms, false, true]));
  };

  // the settings: labels beside the inputs, one per line
  const settings = (fields, onChange) => {
    form = new HEditForm().attach(formHost, {
      form: { format: 'heurist-edit-form/1', groups: [{ type: 'group', children: fields }] },
      labelPos: 'inline',
      onChange
    }).render();
  };

  if (interval) {
    const roundings = (date ? DATE_ROUNDINGS : NUMBER_ROUNDINGS).map(([value, label]) => ({ id: Number(value), label }));
    const recompute = () => {
      const values = form.getValues();
      show(generateRanges({
        fieldType: type,
        min: values.min ?? '',
        max: values.max ?? '',
        count: Number(values.count) || 0,
        rounding: Number(values.rounding) || 0
      }));
    };
    settings([
      { name: 'count', type: 'integer', label: 'Intervals count', default: 10, clearable: false, minValue: 1, maxValue: 50, width: '7em' },
      { name: 'min', type: 'freetext', label: 'Min / Range from', width: 20 },
      { name: 'max', type: 'freetext', label: 'Max / Range to', width: 20 },
      { name: 'rounding', type: 'enum', label: 'Rounding', mode: 'select', default: 0, clearable: false, terms: roundings, width: 20 }
    ], recompute);
    status.textContent = $HR('Loading');
    fieldBounds(api, code, query).then(async (bounds) => {
      await form.setValue('min', bounds.min ?? '');
      await form.setValue('max', bounds.max ?? '');
      recompute();
    }, (error) => { status.textContent = error?.message || String(error); });
  } else {
    const recompute = async () => {
      if (form.getValue('source') === 'all') {
        const vocab = dbdefs?.vocabRoot?.(fieldCodeDty(code));
        const ids = vocab ? (dbdefs.termTree(vocab, { flat: true }) || []).slice(1).map((term) => term.internalid) : [];
        show(categoryRanges(ids).map((range) => ({ ...range, label: dbdefs.termLabel(range.value) })));
        return;
      }
      status.textContent = $HR('Loading');
      try {
        // aggregate op=values gives the term ids only: the labels come from the definitions
        const values = await fieldValues(api, code, query);
        const byValue = new Map(values.map((item) => [item.value, item]));
        show(categoryRanges(values).map((range) => {
          const item = byValue.get(String(range.value));
          const label = terms ? dbdefs?.termLabel?.(range.value) || '' : item?.label || '';
          return { ...range, label, count: item?.count ?? null };
        }), { counts: true });
      } catch (error) {
        status.textContent = error?.message || String(error);
      }
    };
    settings([
      {
        name: 'source', type: 'enum', label: 'Values', mode: 'radio', default: 'actual', clearable: false,
        terms: [
          { id: 'actual', label: 'Use actual values from database' },
          ...(terms ? [{ id: 'all', label: 'Use all terms' }] : [])
        ]
      }
    ], () => void recompute());
    void recompute();
  }

  return new Promise((resolve) => {
    const id = `h-range-generator-${Date.now()}`;
    let finished = false;
    const finish = (apply) => {
      if (finished) return;
      finished = true;
      HMsg.closeMsgDlg(id);
      void form?.destroy();
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

/**
 * The ranges as a table.
 *
 * @param {string[]} headers Column headings.
 * @param {Array<Array<*>>} rows Cells.
 * @param {boolean[]} numeric Right-aligned columns.
 * @returns {HTMLTableElement} The table.
 */
function rangeTable(headers, rows, numeric) {
  const table = document.createElement('table');
  table.className = 'h-range-generator-table';
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const [index, text] of headers.entries()) {
    const cell = document.createElement('th');
    cell.className = `h-i18n${numeric[index] ? ' is-number' : ''}`;
    cell.textContent = $HR(text);
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement('tbody');
  for (const values of rows) {
    const row = document.createElement('tr');
    for (const [index, value] of values.entries()) {
      const cell = document.createElement('td');
      if (numeric[index]) cell.className = 'is-number';
      cell.textContent = value == null ? '' : String(value);
      row.append(cell);
    }
    body.append(row);
  }
  table.append(head, body);
  return table;
}
