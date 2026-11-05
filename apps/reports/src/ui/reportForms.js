/**
 * @file reportForms.js
 * @brief The generation form of the reports manager. Report and schedule records are edited in
 *        the record editor (2026-11-05).
 *
 * The file name suffix accepts only letters A-Z, digits, "-", "_", "(", ")" and spaces. The name
 * of a generated file always starts with the report's file name; the user adds a suffix only.
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
import { ReportsApplication, REPORT_FORMATS } from '../core/ReportsApplication.js';
import { openFormDialog, FILE_NAME_CHARS } from './formDialog.js';

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
