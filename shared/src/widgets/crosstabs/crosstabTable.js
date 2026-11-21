/**
 * @file crosstabTable.js
 * @brief The table of a crosstab (plan 27q2 §6): one HTML table per page of crosstabTables — the row header column,
 *        per column value and percentages (a second header row when there are percentages), totals column and row —
 *        made a DataTable (sort, search, export buttons CSV / Excel / PDF / print with the export header). DataTables,
 *        jszip and pdfmake are loaded only when a table is shown.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { formatCellValue, formatPercent } from './crosstabModel.js';

/**
 * The sub-columns of each column: value, Row %, Column % as chosen (at least the value).
 *
 * @param {object} display
 * @param {boolean} percents Percentages make sense for the measure (count, sum).
 * @returns {Array<'value'|'percentRow'|'percentColumn'>}
 */
export function crosstabSubColumns(display, percents = true) {
  const parts = [];
  if (display.values || !percents) parts.push('value');
  if (percents && display.percentRow) parts.push('percentRow');
  if (percents && display.percentColumn) parts.push('percentColumn');
  return parts.length ? parts : ['value'];
}

/**
 * The table of one page.
 *
 * @param {object} table A table of crosstabTables.
 * @param {object} tables crosstabTables result (hasColumns, measure).
 * @param {object} options
 * @param {object} options.display Display settings.
 * @param {string} options.rowCaption Caption of the row header column.
 * @param {string} options.columnCaption Caption above the columns.
 * @param {string} options.valueCaption Caption of the value (Count, Sum of …).
 * @param {(text: string) => string} [options.translate]
 * @param {string} [options.language]
 * @param {(cell: {row: number|null, column: number|null}) => void} [options.onCell] A click on a count (drill-down).
 * @returns {HTMLTableElement}
 */
export function renderCrosstabTable(table, tables, { display, rowCaption = '', columnCaption = '', valueCaption = '',
  translate = (text) => text, language = '', onCell = null }) {
  const op = tables.measure?.op || 'count';
  const parts = crosstabSubColumns(display, op === 'count' || op === 'sum');
  const captions = { value: valueCaption || translate('Value'), percentRow: translate('Row %'), percentColumn: translate('Column %') };
  const element = document.createElement('table');
  element.className = 'h-crosstab-table display compact';
  const head = document.createElement('thead');
  const totals = display.totals !== false;
  const columns = tables.hasColumns ? table.columns : [{ index: 0, label: valueCaption, total: table.total }];
  const twoRows = tables.hasColumns && parts.length > 1;

  const first = document.createElement('tr');
  first.append(th(rowCaption, twoRows ? 2 : 1, 1, 'h-crosstab-rowhead'));
  for (const column of columns) {
    if (!tables.hasColumns) {
      for (const part of parts) first.append(th(part === 'value' ? captions.value : captions[part], 1, 1));
    } else {
      first.append(th(column.label, twoRows ? 1 : 1, twoRows ? parts.length : 1, 'h-crosstab-colhead', columnCaption));
    }
  }
  if (totals && tables.hasColumns) first.append(th(translate('Total'), twoRows ? 2 : 1, 1, 'h-crosstab-total'));
  head.append(first);
  if (twoRows) {
    const second = document.createElement('tr');
    for (let index = 0; index < columns.length; index++) {
      for (const part of parts) second.append(th(captions[part], 1, 1));
    }
    head.append(second);
  }

  const body = document.createElement('tbody');
  for (const row of table.rows) {
    const line = document.createElement('tr');
    const label = document.createElement('th');
    label.scope = 'row';
    label.textContent = row.label;
    if (onCell) clickable(label, () => onCell({ row: row.index, column: null }));
    line.append(label);
    row.cells.forEach((cell, index) => {
      for (const part of parts) {
        const td = valueCell(cell, part, display, language);
        if (onCell && part === 'value' && cell.records > 0) {
          clickable(td, () => onCell({ row: row.index, column: tables.hasColumns ? columns[index].index : null }));
        }
        line.append(td);
      }
    });
    if (totals && tables.hasColumns) {
      const td = valueCell(row.total, 'value', display, language);
      td.classList.add('h-crosstab-total');
      line.append(td);
    }
    body.append(line);
  }

  element.append(head, body);
  if (totals) {
    const foot = document.createElement('tfoot');
    const line = document.createElement('tr');
    const label = document.createElement('th');
    label.scope = 'row';
    label.textContent = translate('Total');
    line.append(label);
    for (const column of columns) {
      for (const part of parts) {
        const value = part === 'percentColumn' ? 100 : (part === 'percentRow' ? column.total?.percentRow : null);
        const td = part === 'value' ? valueCell(column.total || {}, 'value', display, language)
          : numberCell(value, formatPercent(value, language));
        if (onCell && tables.hasColumns && part === 'value') clickable(td, () => onCell({ row: null, column: column.index }));
        line.append(td);
      }
    }
    if (tables.hasColumns) {
      const grand = valueCell(table.total, 'value', display, language);
      grand.classList.add('h-crosstab-total');
      line.append(grand);
    }
    foot.append(line);
    element.append(foot);
  }
  return element;
}

/**
 * Make a table a DataTable: no paging, sort, search, export buttons.
 *
 * @param {HTMLTableElement} element
 * @param {object} [options]
 * @param {string[]} [options.exports] csv, xlsx, pdf, print (png is the chart's).
 * @param {string} [options.title] Title of the exports.
 * @param {string} [options.messageTop] Export header (database, date, N, query, measure).
 * @param {string} [options.filename]
 * @returns {Promise<{destroy: () => void}|null>} null when DataTables can not be loaded (the plain table stays).
 */
export async function enhanceCrosstabTable(element, { exports = [], title = '', messageTop = '', filename = 'crosstab' } = {}) {
  let DataTable;
  try {
    ({ default: DataTable } = await import('datatables.net-dt'));
    await Promise.all([
      import('datatables.net-dt/css/dataTables.dataTables.css'),
      import('datatables.net-buttons-dt'),
      import('datatables.net-buttons-dt/css/buttons.dataTables.css'),
      import('datatables.net-buttons/js/buttons.html5.mjs'),
      import('datatables.net-buttons/js/buttons.print.mjs')
    ]);
  } catch (error) {
    console.warn('Crosstab: DataTables is not available', error);
    return null;
  }
  const common = { title, messageTop, filename, footer: true, exportOptions: { stripHtml: true } };
  const buttons = [];
  if (exports.includes('csv')) buttons.push({ extend: 'csvHtml5', ...common });
  if (exports.includes('xlsx')) {
    try {
      const { default: JSZip } = await import('jszip');
      DataTable.Buttons.jszip(JSZip);
      buttons.push({ extend: 'excelHtml5', ...common });
    } catch {
      // the other exports stay
    }
  }
  if (exports.includes('pdf')) {
    try {
      const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
        import('pdfmake/build/pdfmake.js'), import('pdfmake/build/vfs_fonts.js')
      ]);
      pdfMake.addVirtualFileSystem(fonts);
      DataTable.Buttons.pdfMake(pdfMake);
      buttons.push({ extend: 'pdfHtml5', orientation: 'landscape', ...common });
    } catch {
      // the other exports stay
    }
  }
  if (exports.includes('print')) buttons.push({ extend: 'print', ...common });
  const instance = new DataTable(element, {
    paging: false,
    info: false,
    searching: true,
    order: [],
    autoWidth: false,
    layout: { topStart: buttons.length ? { buttons } : null, topEnd: 'search', bottomStart: null, bottomEnd: null }
  });
  return { destroy: () => instance.destroy() };
}

/** A header cell. */
function th(text, rowSpan, colSpan, className = '', title = '') {
  const cell = document.createElement('th');
  cell.textContent = text ?? '';
  if (rowSpan > 1) cell.rowSpan = rowSpan;
  if (colSpan > 1) cell.colSpan = colSpan;
  if (className) cell.className = className;
  if (title) cell.title = title;
  return cell;
}

/** A value or a percentage of a cell. */
function valueCell(cell, part, display, language) {
  if (part === 'value') return numberCell(cell.value, formatCellValue(cell.value, display, language));
  return numberCell(cell[part], formatPercent(cell[part], language), 'h-crosstab-percent');
}

/** A number cell: the text, the number for sorting. */
function numberCell(value, text, className = '') {
  const td = document.createElement('td');
  td.className = `h-crosstab-number${className ? ` ${className}` : ''}`;
  td.textContent = text;
  if (value != null && Number.isFinite(Number(value))) td.dataset.order = String(value);
  return td;
}

/** A cell that shows its records on a click. */
function clickable(cell, run) {
  cell.classList.add('h-crosstab-clickable');
  cell.tabIndex = 0;
  cell.addEventListener('click', run);
  cell.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') run();
  });
}
