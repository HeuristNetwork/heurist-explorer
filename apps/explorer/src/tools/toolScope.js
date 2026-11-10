/**
 * @file toolScope.js
 * @brief Record scope of the Explorer tools (Export, Actions): current result, selection or
 *        one record type of the result.
 *
 * Scope values of the select: `result`, `selection`, `rt:<record type id>`. The job
 * parameter is `{query, ids?, rectypes?}`; the server resolves it with
 * srv/Records/Query/RecordScope.php (ids = the selection replace the query).
 * Moved from the Export tool on 2026-11-10 (plan 33).
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

import { $HR } from '#shared/ui';
import { aggregate } from '#shared/data/aggregate.js';

/**
 * Record type chosen in the scope select ("rt:<id>"), else null.
 *
 * @param {string} scope Scope value.
 * @returns {number|null}
 */
export function scopeRecordType(scope) {
  const match = /^rt:(\d+)$/.exec(String(scope || ''));
  return match ? Number(match[1]) : null;
}

/**
 * Record types of the result from `/records/aggregate?op=rectypes`, most records first.
 *
 * @param {Array<{rec_RecTypeID:number,count:number}>} rows Aggregate rows.
 * @param {object} [dbdefs] HDbDefs (record type names).
 * @returns {Array<{id:number,name:string,count:number}>}
 */
export function recordTypeList(rows, dbdefs = null) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: Number(row.rec_RecTypeID),
      name: dbdefs?.rectypeName?.(Number(row.rec_RecTypeID)) || `#${row.rec_RecTypeID}`,
      count: Number(row.count) || 0
    }))
    .filter((row) => row.id > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Record types of a query with counts, and the count of the query itself.
 *
 * @param {object} apiClient HeuristApiClient.
 * @param {*} query Query of the DataSource (null: no result).
 * @param {object} [dbdefs] HDbDefs.
 * @param {object} [aggregateFn] Aggregate function (tests).
 * @returns {Promise<{recordTypes:Array<{id:number,name:string,count:number}>, total:number|null}>}
 */
export async function loadScopeRecordTypes(apiClient, query, dbdefs = null, aggregateFn = aggregate) {
  if (query == null || query === '') return { recordTypes: [], total: null };
  const response = await aggregateFn(apiClient, 'rectypes', { q: query }, { method: 'POST' });
  const data = response?.rectypes ? response : response?.data || {};
  const total = Number(data.total);
  return { recordTypes: recordTypeList(data.rectypes, dbdefs), total: Number.isFinite(total) ? total : null };
}

/**
 * Records of the current result: the server count of the query, else the DataSource count,
 * else the sum of the record type counts.
 *
 * @param {{total:number|null, source:object|null, recordTypes:Array<{count:number}>}} data
 * @returns {number}
 */
export function scopeResultTotal({ total = null, source = null, recordTypes = [] } = {}) {
  if (total != null) return total;
  const count = source?.meta?.count;
  if (count != null && Number.isFinite(Number(count)) && Number(count) > 0) return Number(count);
  return recordTypes.reduce((sum, item) => sum + item.count, 0);
}

/**
 * Records in a scope.
 *
 * @param {string} scope Scope value.
 * @param {{total:number, selection:number[], recordTypes:Array<{id:number,count:number}>}} data
 * @returns {number}
 */
export function scopeCount(scope, { total = 0, selection = [], recordTypes = [] } = {}) {
  if (scope === 'selection') return selection.length;
  const rectype = scopeRecordType(scope);
  if (rectype) return recordTypes.find((item) => item.id === rectype)?.count || 0;
  return total;
}

/**
 * Fill a scope select: current result, selection, then one option per record type of the
 * result. A value that is no longer offered falls back to `result`.
 *
 * @param {HTMLSelectElement} select The select.
 * @param {{total:number, selection:number[], recordTypes:Array<{id:number,name:string,count:number}>, value:string}} data
 * @returns {string} The selected value.
 */
export function fillScopeSelect(select, { total = 0, selection = [], recordTypes = [], value = 'result' } = {}) {
  select.replaceChildren();
  const [, selectionOption] = addOptions(select, [
    ['result', `${$HR('Current result')} (${total})`],
    ['selection', `${$HR('Selection')} (${selection.length})`]
  ]);
  selectionOption.disabled = selection.length === 0;
  const values = ['result', ...(selection.length ? ['selection'] : [])];
  if (recordTypes.length) {
    const group = document.createElement('optgroup');
    group.label = $HR('Record type');
    addOptions(group, recordTypes.map((item) => [`rt:${item.id}`, `${item.name} (${item.count})`]));
    select.append(group);
    values.push(...recordTypes.map((item) => `rt:${item.id}`));
  }
  const chosen = values.includes(value) ? value : 'result';
  select.value = chosen;
  return chosen;
}

/**
 * The scope job parameter.
 *
 * @param {string} scope Scope value.
 * @param {{query:*, selection:number[]}} context Query of the DataSource and the selection.
 * @returns {{query:*, ids?:number[], rectypes?:number[]}}
 */
export function scopeParams(scope, { query = null, selection = [] } = {}) {
  const params = { query: query ?? null };
  const rectype = scopeRecordType(scope);
  if (scope === 'selection') params.ids = (selection || []).map(Number).filter((id) => id > 0);
  if (rectype) params.rectypes = [rectype];
  return params;
}

/**
 * Problems of a scope (texts to translate).
 *
 * @param {string} scope Scope value.
 * @param {{query:*, selection:number[]}} context
 * @returns {string[]}
 */
export function scopeProblems(scope, { query = null, selection = [] } = {}) {
  if (scope === 'selection' && !(selection || []).length) return ['No records are selected'];
  if (scope !== 'selection' && (query == null || query === '')) return ['There is no current result'];
  return [];
}

/**
 * Append `[value, text]` options to a select or optgroup.
 *
 * @returns {HTMLOptionElement[]} The new options.
 */
function addOptions(parent, options) {
  return options.map(([value, text]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    parent.append(option);
    return option;
  });
}
