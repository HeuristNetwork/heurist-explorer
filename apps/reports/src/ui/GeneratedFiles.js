/**
 * @file GeneratedFiles.js
 * @brief Dropdown of the Generate button: the generated files of the selected
 *        report (names starting with its file name), newest first. A click on the
 *        name shows the file in the output frame; it can also be opened in a new
 *        window or deleted.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-reports
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR, HMsg } from '#shared/ui';
import { confirmDialog } from './formDialog.js';

/** Files larger than this are shown in the frame only after a warning (bytes). */
export const LARGE_FILE = 5 * 1024 * 1024;

/**
 * Build the list of generated files of a report: mark, name (shows the file), date, size,
 * open in a new window, download; bottom panel: Remove marked, Remove all (same layout as
 * the Export results of Explorer).
 *
 * @param {import('../core/ReportsApplication.js').ReportsApplication} app Controller.
 * @param {object} report Selected report.
 * @param {object} options
 * @param {function(string): void} options.onShow Shows a file URL in the output frame.
 * @param {function(): void} options.onClose Closes the dropdown.
 * @returns {HTMLElement}
 */
export function buildGeneratedList(app, report, { onShow, onClose }) {
  const root = el('div', 'h-reports-generated');
  const list = el('div', 'h-reports-generated-list', root);
  const footer = el('div', 'h-reports-generated-footer', root);
  const removeMarked = el('button', 'h-btn h-btn-small', footer);
  removeMarked.type = 'button';
  removeMarked.textContent = $HR('Remove marked');
  removeMarked.disabled = true;
  const removeAll = el('button', 'h-btn h-btn-small', footer);
  removeAll.type = 'button';
  removeAll.textContent = $HR('Remove all');
  removeAll.disabled = true;
  el('div', 'h-muted h-reports-generated-empty', list).textContent = $HR('Loading...');

  const marked = new Set();
  let files = [];

  /** Close the list at once (no second click), confirm, remove the files one by one. */
  const remove = (names) => run(async () => {
    onClose();
    if (!names.length) return;
    const question = names.length === 1
      ? `${$HR('Remove generated file')} "${names[0]}"?`
      : `${$HR('Remove generated files')}: ${names.length}?`;
    if (!(await confirmDialog(question, { yesLabel: 'Remove' }))) return;
    for (const name of names) await app.deleteGenerated(name);
  });
  removeMarked.addEventListener('click', () => remove([...marked]));
  removeAll.addEventListener('click', () => remove(files.map((file) => file.file)));

  const render = (items) => {
    files = Array.isArray(items) ? items : [];
    list.replaceChildren();
    marked.clear();
    removeMarked.disabled = true;
    removeAll.disabled = files.length === 0;
    if (!files.length) {
      el('div', 'h-muted h-reports-generated-empty', list).textContent = $HR('No generated files for this report');
      return;
    }
    for (const file of files) {
      const row = el('div', 'h-reports-generated-row', list);
      const mark = el('input', 'h-reports-generated-mark', row);
      mark.type = 'checkbox';
      mark.title = $HR('Mark');
      mark.addEventListener('change', () => {
        if (mark.checked) marked.add(file.file); else marked.delete(file.file);
        removeMarked.disabled = marked.size === 0;
      });
      const name = el('button', 'h-reports-generated-name', row);
      name.type = 'button';
      name.textContent = file.file;
      name.title = `${file.file} - ${$HR('show here')}`;
      name.addEventListener('click', () => run(async () => {
        if (file.size > LARGE_FILE
          && !(await confirmDialog(`${file.file}: ${formatSize(file.size)}. ${$HR('Large files can make the page slow. Show it here anyway?')}`, { yesLabel: 'Show' }))) {
          return;
        }
        onClose();
        onShow(file.url);
      }));
      el('span', 'h-reports-generated-date h-muted', row).textContent = formatDate(file.modified);
      const size = el('span', 'h-reports-generated-size h-muted', row);
      size.textContent = formatSize(file.size);
      if (file.size > LARGE_FILE) size.classList.add('h-reports-generated-large');
      const open = el('a', 'heurist-icon-button h-reports-icon', row);
      open.href = file.url;
      open.target = '_blank';
      open.rel = 'noopener';
      open.title = $HR('Open in a new window');
      el('i', 'fa-solid fa-up-right-from-square', open).setAttribute('aria-hidden', 'true');
      const download = el('a', 'heurist-icon-button h-reports-icon', row);
      download.href = file.url;
      download.download = file.file;
      download.title = $HR('Download');
      el('i', 'fa-solid fa-download', download).setAttribute('aria-hidden', 'true');
    }
  };

  app.generatedFiles(report).then(render).catch((error) => {
    list.replaceChildren();
    el('div', 'h-reports-warning', list).textContent = error?.message || String(error);
  });
  return root;
}

/** Run an action and show its error. */
async function run(action) {
  try {
    await action();
  } catch (error) {
    HMsg.showMsgErr(error?.message || String(error));
  }
}

/** Local date and time of an ISO date. */
export function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

/** "12 KB" */
export function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

/** Element helper. */
function el(tag, className, parent = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  parent?.append(element);
  return element;
}
