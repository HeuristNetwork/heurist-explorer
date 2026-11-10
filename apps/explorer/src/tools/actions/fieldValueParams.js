/**
 * @file fieldValueParams.js
 * @brief Pure helpers of the Field values actions (plan 33): the united field list of the
 *        record types in scope, the value condition from a Filter Builder row, the job
 *        parameters and the PATCH body of one record.
 *
 * The server checks the parameters again (srv/Records/Actions/RecordActionRequest.php).
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

import { composeQuery } from '../../utils/queryModel.js';

/** Field types the field value actions change (server: RecordActionRequest::FIELD_TYPES). */
export const FIELD_VALUE_TYPES = ['freetext', 'blocktext', 'date', 'float', 'enum'];

/**
 * The fields of all record types in scope, each field once, sorted by name.
 *
 * @param {object} dbdefs HDbDefs.
 * @param {number[]} rectypeIds Record types in scope.
 * @returns {Array<{id:number, name:string, type:string, vocabulary:number|null, rectypes:Array<{id:number,name:string}>}>}
 *          `name`: the name in the first record type (as the server list of record types: most records first).
 */
export function unitedFieldList(dbdefs, rectypeIds) {
  const fields = new Map();
  for (const rty of rectypeIds || []) {
    for (const field of dbdefs?.fields?.(rty) || []) {
      if (!FIELD_VALUE_TYPES.includes(field.type)) continue;
      let entry = fields.get(field.id);
      if (!entry) {
        entry = {
          id: Number(field.id),
          name: field.name,
          type: field.type,
          vocabulary: Number(dbdefs.fieldGlobal?.(field.id)?.vocabulary) || null,
          rectypes: []
        };
        fields.set(field.id, entry);
      }
      entry.rectypes.push({ id: Number(rty), name: dbdefs.rectypeName?.(rty) || `#${rty}` });
    }
  }
  return [...fields.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/**
 * The value condition of a Filter Builder row of one field: the value of `f:<field>` in the
 * composed query (e.g. `=Johnson`, `son%`, `-Johnson`, `1900<>2000`).
 *
 * @param {object} row FieldRow of HFilterBuilderItem (`getRowModel()`).
 * @param {object} vocabulary queryVocabulary.json.
 * @returns {{condition: string|null, problem: string|null}}
 */
export function conditionFromRow(row, vocabulary) {
  if (!row || !(Number(row.dty) > 0)) return { condition: null, problem: 'Choose a field' };
  const [predicate] = composeQuery({ rtyId: '', rows: [row] }, vocabulary);
  if (!predicate) return { condition: null, problem: 'Enter the value of the condition' };
  const value = predicate[`f:${Number(row.dty)}`];
  if (typeof value !== 'string' && typeof value !== 'number') {
    return { condition: null, problem: 'Use one condition (one value, or terms joined by OR)' };
  }
  const condition = String(value).trim();
  if (!condition || condition === 'NULL' || condition === '-NULL') {
    return { condition: null, problem: 'Enter the value of the condition' };
  }
  return { condition, problem: null };
}

/**
 * Values of the value input as texts (empty ones left out).
 *
 * @param {*} value Value of HEditForm (one value or a list).
 * @returns {string[]}
 */
export function valueList(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item) => item != null && String(item).trim() !== '').map((item) => String(item));
}

/**
 * Problems of a field value action (texts to translate).
 *
 * @param {{mode:string, field:object|null, values:string[], conditional:boolean, condition:string|null,
 *          conditionProblem:string|null}} state
 * @returns {string[]}
 */
export function fieldValueProblems({ mode, field, values = [], conditional = false, conditionProblem = null }) {
  if (!field) return ['Choose a field'];
  const problems = [];
  if (mode !== 'delete' && !values.length) problems.push(mode === 'add' ? 'Enter the value to be added' : 'Enter the new value');
  if (mode !== 'add' && conditional && conditionProblem) problems.push(conditionProblem);
  return problems;
}

/**
 * Parameters of the "record-action" job (without the scope).
 *
 * @param {{mode:string, field:object, values:string[], conditional:boolean, condition:string|null,
 *          addIfNone:boolean}} state
 * @returns {{action:string, title:string, field:number, values:string[], match:string, addIfNone:boolean}}
 */
export function fieldValueParams({ mode, field, values = [], conditional = false, condition = null, addIfNone = false }) {
  const match = mode !== 'add' && conditional && condition ? condition : '';
  const verb = { add: 'Add', replace: 'Replace', delete: 'Delete' }[mode] || mode;
  const shown = values.length ? ` ${values.join(', ')}` : '';
  return {
    action: `field-${mode}`,
    title: `${verb}${match ? ` [${match}]` : ''}${mode === 'replace' ? ' →' : ''}${mode === 'delete' ? '' : shown} · ${field.name}`,
    field: Number(field.id),
    values: mode === 'delete' ? [] : values,
    match,
    addIfNone: mode === 'replace' && Boolean(match) && addIfNone === true
  };
}

/**
 * PATCH body of one record for the same action (plan 32: details / detailsAdd / detailsMatch / addIfNone).
 *
 * @param {{action:string, field:number, values:string[], match:string, addIfNone:boolean}} params Job parameters.
 * @returns {object}
 */
export function fieldValuePatch(params) {
  const field = String(params.field);
  if (params.action === 'field-add') return { detailsAdd: { [field]: params.values } };
  const body = { details: { [field]: params.action === 'field-delete' ? [] : params.values } };
  if (params.match) body.detailsMatch = { [field]: params.match };
  if (params.addIfNone) body.addIfNone = [field];
  return body;
}
