/**
 * @file reportForms.js
 * @brief Forms of the reports manager: report properties (new, register, edit),
 *        generation and schedule. They replace the legacy record editor for the
 *        report records until the dynamic HEditForm exists (2026-10-05).
 *
 * File names and suffixes accept only letters A-Z, digits, "-", "_", "(", ")" and spaces.
 * The name of a generated file always starts with the report's file name; the
 * user adds a suffix only.
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
import { ReportsApplication, REPORT_FORMATS, SCHEDULE_INTERVALS } from '../core/ReportsApplication.js';
import { openFormDialog, FILE_NAME_CHARS } from './formDialog.js';

/**
 * Properties of a report: title, description, card flag, template file name.
 *
 * @param {object|null} report Report to edit or register; null for a new report.
 * @returns {Promise<{title: string, description: string, isCardView: boolean, file?: string}|null>}
 *          `file` only when it was changed (or for a new report).
 */
export async function openPropertiesForm(report) {
  const isNew = !report;
  const unregistered = report && report.id == null;
  const initialFile = report ? fileNameValue(report) : '';
  const values = await openFormDialog({
    title: isNew ? 'New report' : unregistered ? 'Create report record' : 'Report properties',
    okLabel: isNew || unregistered ? 'Create' : 'Save',
    fields: [
      { name: 'title', label: 'Title', value: report?.title || '', required: true },
      { name: 'description', label: 'Description', type: 'textarea', value: report?.description || '' },
      { name: 'isCardView', label: 'Single record (card) report', type: 'checkbox', value: report?.isCardView === true,
        hint: 'Card reports are offered for record popups, cards and Record view.' },
      { name: 'file', label: 'Template file name', value: report ? fileNameValue(report) : '', allowed: FILE_NAME_CHARS,
        required: !isNew,
        hint: isNew ? 'Letters A-Z, digits, "-", "_", "(", ")" and spaces. Empty: made from the title.'
          : 'Letters A-Z, digits, "-", "_", "(", ")" and spaces. Changing it renames the template file.' }
    ]
  });
  // an unchanged name is not sent: a legacy name with other characters is not renamed
  if (values && report && values.file === initialFile) delete values.file;
  return values;
}

/**
 * Generate a report: current result or a Query Source, format and file name suffix.
 *
 * @param {ReportsApplication} app Controller.
 * @param {object} report Report to generate.
 * @returns {Promise<object|null>} report-generate parameters, or null when cancelled.
 */
export async function openGenerateForm(app, report) {
  const [current, sources] = await Promise.all([app.currentResult(), app.querySourcesForReports()]);
  const choices = [];
  if (current) {
    const count = current.total == null ? '' : ` (${current.total} ${$HR('records')})`;
    choices.push({ value: 'current', label: `${$HR('Current result')}${current.title ? `: ${current.title}` : ''}${count}` });
  }
  choices.push({ value: 'source', label: $HR('Query Source') });
  const prefix = ReportsApplication.outputPrefix(report);
  const values = await openFormDialog({
    title: 'Generate report',
    okLabel: 'Generate',
    fields: [
      { name: 'from', label: 'Records', type: 'radio', value: choices[0].value, options: choices },
      querySourceField(sources, { showWhen: { from: 'source' } }),
      { name: 'format', label: 'Format', type: 'select', value: 'html', options: REPORT_FORMATS.map((f) => ({ value: f, label: f })) },
      { name: 'suffix', label: 'File name', prefix: `${prefix} `, allowed: FILE_NAME_CHARS,
        hint: 'Optional end of the file name. Your user id is added; for a shared file use a schedule.' }
    ],
    validate: (v) => (v.from === 'source' && !(Number(v.querySource) > 0) ? $HR('Choose a Query Source') : null)
  });
  if (!values) return null;
  const params = { report: ReportsApplication.reference(report), format: values.format, suffix: values.suffix };
  if (values.from === 'current') params.query = current.query;
  else params.querySource = Number(values.querySource);
  return params;
}

/**
 * Add or change a schedule.
 *
 * @param {ReportsApplication} app Controller.
 * @param {object} report Report of the schedule.
 * @param {object|null} schedule Schedule to change; null for a new one.
 * @returns {Promise<object|null>} Schedule values, or null when cancelled.
 */
export async function openScheduleForm(app, report, schedule = null) {
  const sources = await app.querySourcesForReports();
  const prefix = ReportsApplication.outputPrefix(report);
  const suffix = schedule?.file && schedule.file.startsWith(`${prefix} `) ? schedule.file.slice(prefix.length + 1) : '';
  const interval = schedule ? (Number(schedule.intervalMinutes) || 0) : 1440;
  const intervals = SCHEDULE_INTERVALS.map((item) => ({ value: item.value, label: $HR(item.label) }));
  if (!intervals.some((item) => item.value === interval)) intervals.push({ value: interval, label: `${interval} min` });
  const values = await openFormDialog({
    title: schedule ? 'Edit schedule' : 'Add schedule',
    okLabel: schedule ? 'Save' : 'Add',
    fields: [
      { name: 'title', label: 'Title', value: schedule?.title || report.title, required: true },
      querySourceField(sources, { value: schedule?.dataSourceId, required: true }),
      { name: 'format', label: 'Format', type: 'select', value: schedule?.format || 'html', options: REPORT_FORMATS.map((f) => ({ value: f, label: f })) },
      { name: 'suffix', label: 'File name', prefix: `${prefix} `, value: suffix, allowed: FILE_NAME_CHARS,
        hint: 'Optional end of the file name; the file is written to generated-reports.' },
      { name: 'intervalMinutes', label: 'Regenerate', type: 'select', value: interval, options: intervals }
    ]
  });
  if (!values) return null;
  return { ...values, querySource: Number(values.querySource), intervalMinutes: Number(values.intervalMinutes) || 0 };
}

/** Query Source field: a list from the host, or a record id when there is none. */
function querySourceField(sources, { value = '', required = false, showWhen = null } = {}) {
  if (sources.length) {
    return {
      name: 'querySource', label: 'Query Source', type: 'select', value: value || '', required, showWhen,
      options: [{ value: '', label: '' }, ...sources.map((source) => ({ value: source.id, label: source.title }))],
      hint: 'Query Sources with parameters (Filter Form) are not listed.'
    };
  }
  return { name: 'querySource', label: 'Query Source record id', type: 'number', value: value || '', required, showWhen };
}

/** Template file name of a report without ".tpl", limited to the allowed characters. */
function fileNameValue(report) {
  return String(report.file || '').replace(/\.tpl$/i, '').replace(FILE_NAME_CHARS, '_');
}
