/**
 * @file recordEditStructure.js
 * @brief Edit form structure of a record type from its `/rst` rows (plan 14 §6).
 *
 * The record structure becomes groups of fields, the same groups/children idea
 * as the HFilterForm layout (plan 05): a separator row starts a group and its
 * `rst_DefaultValue` gives the group presentation (tabs, accordion or a plain
 * group, as in the legacy editor `manageRecords.js`); fields before the first
 * separator form a plain group without a heading.
 *
 *   {rty, groups: [{id, type: 'tabs'|'accordion'|'group', label, help, children: [field]}]}
 *   field: {dty, type, label, help, req, max, default, vocabulary, targetTypes,
 *           width, height, multilang, concept}
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

/** `/rst` columns the editor needs. */
export const EDIT_STRUCTURE_DETAILS = [
  'rst_DetailTypeID', 'rst_DisplayName', 'rst_DisplayOrder', 'rst_RequirementType', 'rst_DefaultValue',
  'rst_DisplayHelpText', 'rst_MaxValues', 'rst_PtrFilteredIDs', 'rst_FilteredJsonTermIDTree',
  'rst_DisplayWidth', 'rst_DisplayHeight', 'dty_Type', 'dty_Name', 'dty_JsonTermIDTree', 'dty_PtrTargetRectypeIDs'
].join(',');

/**
 * Group presentation of a separator (`rst_DefaultValue`): legacy values tabs,
 * tabs_new, accordion, accordion_inner, expanded, group, group_break.
 *
 * @param {*} value Separator default value.
 * @returns {'tabs'|'accordion'|'group'}
 */
export function separatorLayout(value) {
  const text = String(value ?? '').toLowerCase();
  if (text.startsWith('tab')) return 'tabs';
  if (text.startsWith('accordion') || text === 'expanded' || text === 'collapsed') return 'accordion';
  return 'group';
}

/**
 * Build the edit structure of a record type.
 *
 * @param {Array<object>} rows `/rst/{rty}` items (EDIT_STRUCTURE_DETAILS).
 * @param {{rty: number, multilangIds?: number[], dbdefs?: object}} options
 *        `multilangIds`: fields with translations; `dbdefs`: concept codes of fields.
 * @returns {{rty: number, groups: Array<object>}}
 */
export function buildEditStructure(rows, { rty, multilangIds = [], dbdefs = null } = {}) {
  const multilang = new Set((multilangIds || []).map(Number));
  const sorted = [...(rows || [])].sort((a, b) => order(a) - order(b));
  const groups = [];
  let current = { id: null, type: 'group', label: null, help: '', children: [] };
  groups.push(current);
  for (const row of sorted) {
    const type = String(row.dty_Type || '');
    if (type === 'separator') {
      current = {
        id: Number(row.rst_DetailTypeID) || null,
        type: separatorLayout(row.rst_DefaultValue),
        label: String(row.rst_DisplayName || '') || null,
        help: String(row.rst_DisplayHelpText || ''),
        children: []
      };
      groups.push(current);
      continue;
    }
    const req = String(row.rst_RequirementType || 'optional').toLowerCase();
    if (req === 'forbidden') continue;
    const dty = Number(row.rst_DetailTypeID);
    if (!(dty > 0)) continue;
    const targets = idList(row.rst_PtrFilteredIDs);
    current.children.push({
      dty,
      type,
      label: String(row.rst_DisplayName || row.dty_Name || dty),
      help: String(row.rst_DisplayHelpText || ''),
      req,
      max: Math.max(0, Number(row.rst_MaxValues) || 0),
      default: String(row.rst_DefaultValue ?? ''),
      vocabulary: idList(row.rst_FilteredJsonTermIDTree)[0] || idList(row.dty_JsonTermIDTree)[0] || null,
      targetTypes: targets.length ? targets : idList(row.dty_PtrTargetRectypeIDs),
      width: Math.max(0, Number(row.rst_DisplayWidth) || 0),
      height: Math.max(0, Number(row.rst_DisplayHeight) || 0),
      multilang: multilang.has(dty),
      concept: dbdefs?.fieldGlobal?.(dty)?.concept || null
    });
  }
  return { rty: Number(rty) || 0, groups: groups.filter((group) => group.children.length > 0) };
}

/**
 * Every field of an edit structure, in form order.
 *
 * @param {{groups: Array<object>}} structure Edit structure.
 * @returns {Array<object>} Fields.
 */
export function structureFields(structure) {
  return (structure?.groups || []).flatMap((group) => group.children || []);
}

/**
 * Fields with values in the record that the structure of its type does not have
 * (plan 18): the last group "Non-standard fields", editable with inputs of their
 * field types. Their values were always kept on save (buildRecordBody).
 *
 * @param {object|null} record Record in the write format (`details` keyed by field id).
 * @param {{groups: Array<object>}} structure Edit structure.
 * @param {object|null} dbdefs HDbDefs (field names, types, vocabularies).
 * @param {string} label Group caption.
 * @returns {object|null} The group, or null when there are no such values.
 */
export function nonStandardGroup(record, structure, dbdefs, label = 'Non-standard fields') {
  const known = new Set(structureFields(structure).map((field) => String(field.dty)));
  const children = [];
  for (const [key, values] of Object.entries(record?.details || {})) {
    if (known.has(key) || !/^\d+$/.test(key)) continue;
    if (!(Array.isArray(values) ? values.length : values != null)) continue;
    const global = dbdefs?.fieldGlobal?.(key) || null;
    const type = global?.type || 'freetext';
    if (type === 'separator') continue;
    children.push({
      dty: Number(key),
      type,
      label: global?.name || `#${key}`,
      help: '',
      req: 'optional',
      max: 0,
      default: '',
      vocabulary: global?.vocabulary || null,
      targetTypes: global?.targetTypes || [],
      width: 0,
      height: 0,
      multilang: false,
      concept: global?.concept || null,
      nonStandard: true
    });
  }
  return children.length ? { id: null, type: 'group', label, help: '', children, nonStandard: true } : null;
}

/** @returns {number[]} Positive integers of a CSV list or JSON id tree. */
function idList(value) {
  return [...new Set(String(value ?? '').match(/\d+/g)?.map(Number).filter((id) => id > 0) || [])];
}

/** @returns {number} Numeric display order of a structure row (zero-padded string in the API). */
function order(row) {
  const value = Number(row?.rst_DisplayOrder);
  return Number.isFinite(value) ? value : 0;
}
