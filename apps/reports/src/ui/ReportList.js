/**
 * @file ReportList.js
 * @brief List of reports in the "Select report" popover: search, group and type
 *        selectors, accordions by owner group (like Explorer's Query Source list).
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

import { $HR } from '#shared/ui';
import { ownerSections } from '#shared/utils/ownerSections.js';
import { ReportsApplication } from '../core/ReportsApplication.js';

/** Key of the section of template files without a record. */
const UNREGISTERED = 'unregistered';

/** Report types of the type selector. */
const TYPES = [
  ['all', 'All types'],
  ['card', 'Single record (card)'],
  ['set', 'Record set'],
  [UNREGISTERED, 'Without report record']
];

/** Filter state, kept while the page is open. */
const view = { text: '', group: '', type: 'all', collapsed: new Set() };

/**
 * Build the report list.
 *
 * @param {ReportsApplication} app Controller.
 * @param {{onSelect: function(object): void}} options Called with the chosen report.
 * @returns {HTMLElement}
 */
export function buildReportList(app, { onSelect }) {
  const root = el('div', 'h-reports-picker');
  const controls = el('div', 'h-reports-picker-controls', root);
  const search = el('input', 'h-input h-reports-picker-search', controls);
  search.type = 'search';
  search.placeholder = $HR('Search reports');
  search.value = view.text;
  const group = el('select', 'h-select h-reports-picker-group', controls);
  group.setAttribute('aria-label', $HR('Group'));
  const type = el('select', 'h-select h-reports-picker-type', controls);
  type.setAttribute('aria-label', $HR('Report type'));
  for (const [value, label] of TYPES) type.append(option($HR(label), value));
  type.value = view.type;
  const list = el('div', 'h-reports-picker-list', root);
  list.setAttribute('role', 'listbox');

  const sections = allSections(app);
  group.append(option($HR('All groups'), ''));
  for (const section of sections) group.append(option(section.label, section.key));
  group.value = sections.some((section) => section.key === view.group) ? view.group : '';

  const render = () => {
    list.replaceChildren();
    const text = view.text.trim().toLowerCase();
    let shown = 0;
    for (const section of sections) {
      if (view.group && section.key !== view.group) continue;
      const items = section.items.filter((report) => matchesType(report, view.type)
        && (!text || `${report.title} ${report.description || ''}`.toLowerCase().includes(text)));
      if (!items.length) continue;
      shown += items.length;
      const details = el('details', 'h-reports-picker-section', list);
      details.open = Boolean(text) || !view.collapsed.has(section.key);
      details.addEventListener('toggle', () => {
        if (details.open) view.collapsed.delete(section.key);
        else view.collapsed.add(section.key);
      });
      const summary = el('summary', 'h-reports-picker-section-title', details);
      summary.textContent = `${section.label} (${items.length})`;
      for (const report of items) details.append(row(report));
    }
    if (!shown) el('div', 'h-reports-empty h-muted', list).textContent = $HR('No reports');
  };

  const row = (report) => {
    const reference = ReportsApplication.reference(report);
    const item = el('button', 'h-reports-picker-item');
    item.type = 'button';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', reference === app.selectedRef ? 'true' : 'false');
    item.classList.toggle('h-reports-picker-item-selected', reference === app.selectedRef);
    item.title = report.description || report.title;
    const icon = el('i', iconClass(report), item);
    icon.setAttribute('aria-hidden', 'true');
    el('span', 'h-reports-picker-item-title', item).textContent = report.title;
    if (app.generateJob && app.reportOfJob(app.generateJob) === report) {
      const running = el('i', 'fa-solid fa-spinner fa-spin h-reports-running', item);
      running.title = $HR('A report is being generated');
    }
    if ((report.schedules || []).length) {
      const badge = el('span', 'h-reports-badge', item);
      badge.textContent = String(report.schedules.length);
      badge.title = $HR('Schedules');
    }
    item.addEventListener('click', () => onSelect(report));
    return item;
  };

  search.addEventListener('input', () => {
    view.text = search.value;
    render();
  });
  group.addEventListener('change', () => {
    view.group = group.value;
    render();
  });
  type.addEventListener('change', () => {
    view.type = type.value;
    render();
  });
  render();
  setTimeout(() => search.focus?.(), 0);
  return root;
}

/** Owner sections of the report records, then the files without a record. */
function allSections(app) {
  const sections = ownerSections(app.data.reports || [], app.userGroups);
  if ((app.data.unregistered || []).length) {
    sections.push({
      key: UNREGISTERED,
      label: $HR('Templates without a report record'),
      items: [...app.data.unregistered].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    });
  }
  return sections;
}

/** Whether a report has the chosen type. */
function matchesType(report, type) {
  if (type === 'card') return report.id != null && report.isCardView;
  if (type === 'set') return report.id != null && !report.isCardView;
  if (type === UNREGISTERED) return report.id == null;
  return true;
}

/** Icon of a report type. */
export function iconClass(report) {
  if (report?.id == null) return 'fa-regular fa-file';
  return report.isCardView ? 'fa-regular fa-address-card' : 'fa-solid fa-list';
}

/** Element helper. */
function el(tag, className, parent = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  parent?.append(element);
  return element;
}

/** An `<option>` element. */
function option(label, value) {
  const element = document.createElement('option');
  element.value = String(value);
  element.textContent = label;
  return element;
}
