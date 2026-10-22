/**
 * @file systemEntities.js
 * @brief Hard-coded edit structures of the system record types (plan 20, §10.2, §10.9).
 *
 * The system record types (Bookmark, Reminder; later Saved filter, User, Group, File)
 * have no structure in the database. Their structures are kept here in the `/rst`
 * row format (`rst_*`, `dty_*` columns), with concept codes instead of local ids, so
 * the same `buildEditStructure` makes their edit forms. Later the structures come
 * from `/rst` without changes to the forms.
 *
 * Each row has a `key`: the name of the field in plain objects and in the HEditForm
 * values (`{rating: 3, notes: '...'}`); `form` adds HEditForm properties
 * (`minValue`, `maxLength`, `temporal`...). Fields the database lacks are left out.
 *
 *   const form = systemEditForm('bookmark', dbdefs, { omit: ['record'] });
 *   const values = systemValues('bookmark', record, dbdefs);   // record -> {key: value}
 *   const details = systemDetails('bookmark', values, dbdefs); // {key: value} -> details
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

import { buildEditStructure, structureFields } from './recordEditStructure.js';
import { EDIT_FORM_FORMAT } from './editFormSchema.js';

/** Concept codes of the system record types (plan 20, §10.3). */
export const SYSTEM_RECORD_TYPES = Object.freeze({
  user: '2-1107', group: '2-1108', tag: '2-1109', bookmark: '2-1110', reminder: '2-1111'
});

/** The values of the reminder frequency (rem_Freq) by the term labels of the vocabulary 2-10454. */
export const REMINDER_FREQUENCIES = Object.freeze(['once', 'daily', 'weekly', 'monthly', 'annually']);

/** At most this many characters of the private note of a bookmark (plan 20, §10.3). */
export const PRIVATE_INFO_MAX_LENGTH = 140;

/**
 * The structures: record type and rows. `vocabulary` and `targetTypes` are concept codes.
 * Help texts and labels are English: the form translates them (`localized: false`).
 */
export const SYSTEM_STRUCTURES = Object.freeze({
  bookmark: Object.freeze({
    rectype: SYSTEM_RECORD_TYPES.bookmark,
    rows: Object.freeze([
      { key: 'record', concept: '2-13', rst_DisplayName: 'Record', dty_Type: 'resource', rst_RequirementType: 'required' },
      {
        key: 'rating', concept: '2-1190', rst_DisplayName: 'Rating', dty_Type: 'float',
        rst_DisplayHelpText: 'Your rating of the record: 1 to 5 stars', form: { minValue: 0, maxValue: 5, step: 1 }
      },
      { key: 'notes', concept: '2-4', rst_DisplayName: 'Notes', dty_Type: 'blocktext', rst_DisplayHelpText: 'Your personal notes' },
      {
        key: 'privateInfo', concept: '2-1192', rst_DisplayName: 'Private note', dty_Type: 'freetext',
        rst_DisplayHelpText: 'Only you see it (e.g. a password hint). Stored encrypted, at most 140 characters',
        form: { maxLength: PRIVATE_INFO_MAX_LENGTH }
      }
    ])
  }),
  reminder: Object.freeze({
    rectype: SYSTEM_RECORD_TYPES.reminder,
    rows: Object.freeze([
      { key: 'record', concept: '2-13', rst_DisplayName: 'Record', dty_Type: 'resource', rst_RequirementType: 'required' },
      {
        key: 'recipient', concept: '2-1193', rst_DisplayName: 'User or group', dty_Type: 'resource',
        targetTypes: [SYSTEM_RECORD_TYPES.user, SYSTEM_RECORD_TYPES.group],
        rst_DisplayHelpText: 'The user or the members of the group get the reminder'
      },
      {
        key: 'email', concept: '2-23', rst_DisplayName: 'E-mail', dty_Type: 'freetext',
        rst_DisplayHelpText: 'E-mail addresses, separated by commas', form: { maxLength: 255 }
      },
      {
        key: 'message', concept: '2-4', rst_DisplayName: 'Message', dty_Type: 'blocktext', form: { maxLength: 1000 }
      },
      {
        key: 'startDate', concept: '2-10', rst_DisplayName: 'Start date', dty_Type: 'date', rst_RequirementType: 'required',
        rst_DefaultValue: 'today', rst_DisplayHelpText: 'The first (or only) date of the reminder', form: { temporal: false }
      },
      {
        key: 'frequency', concept: '2-1191', rst_DisplayName: 'Frequency', dty_Type: 'enum', vocabulary: '2-10454',
        rst_RequirementType: 'required'
      }
    ])
  })
});

/**
 * `/rst` rows of a system type with the local ids of this database (fields it lacks are
 * left out). Each row keeps its `key` and `form`.
 *
 * @param {string} type 'bookmark' | 'reminder'.
 * @param {object} dbdefs HDbDefs (localId).
 * @returns {Array<object>}
 */
export function systemEditRows(type, dbdefs) {
  const definition = definitionOf(type);
  const rows = [];
  for (const [index, row] of definition.rows.entries()) {
    const dty = Number(dbdefs?.localId?.('dty', row.concept)) || 0;
    if (!dty) continue;
    const vocabulary = row.vocabulary ? Number(dbdefs.localId('trm', row.vocabulary)) || 0 : 0;
    const targets = (row.targetTypes || []).map((code) => Number(dbdefs.localId('rty', code)) || 0).filter(Boolean);
    rows.push({
      key: row.key,
      form: row.form || null,
      rst_DetailTypeID: dty,
      rst_DisplayName: row.rst_DisplayName,
      rst_DisplayOrder: index + 1,
      rst_RequirementType: row.rst_RequirementType || 'optional',
      rst_DefaultValue: row.rst_DefaultValue ?? '',
      rst_DisplayHelpText: row.rst_DisplayHelpText || '',
      rst_MaxValues: 1,
      dty_Type: row.dty_Type,
      dty_Name: row.rst_DisplayName,
      dty_JsonTermIDTree: vocabulary ? String(vocabulary) : '',
      dty_PtrTargetRectypeIDs: targets.join(',')
    });
  }
  return rows;
}

/**
 * Edit structure of a system type (as `buildEditStructure` gives it), each field named
 * by its `key` and with its `form` properties.
 *
 * @returns {{rty: number, groups: Array<object>}}
 */
export function systemEditStructure(type, dbdefs) {
  const rows = systemEditRows(type, dbdefs);
  const rty = Number(dbdefs?.localId?.('rty', definitionOf(type).rectype)) || 0;
  const structure = buildEditStructure(rows, { rty, dbdefs });
  const byDty = new Map(rows.map((row) => [Number(row.rst_DetailTypeID), row]));
  for (const field of structureFields(structure)) {
    const row = byDty.get(Number(field.dty));
    Object.assign(field, { name: row.key }, row.form || {});
  }
  return structure;
}

/**
 * HEditForm JSON of a system type.
 *
 * @param {string} type 'bookmark' | 'reminder'.
 * @param {object} dbdefs HDbDefs.
 * @param {{omit?: string[], fields?: Object<string, object>}} [options] Keys left out of the form, and
 *        properties that replace those of a field (e.g. a list of users and groups as `terms`).
 * @returns {object} `heurist-edit-form/1`.
 */
export function systemEditForm(type, dbdefs, { omit = [], fields = {} } = {}) {
  const structure = systemEditStructure(type, dbdefs);
  const groups = structure.groups.map((group) => ({
    ...group,
    children: group.children.filter((field) => !omit.includes(field.name)).map((field) => ({ ...field, ...(fields[field.name] || {}) }))
  })).filter((group) => group.children.length);
  return { format: EDIT_FORM_FORMAT, localized: false, groups };
}

/**
 * Local field ids of a system type by key (0: the database lacks the field).
 *
 * @returns {Object<string, number>}
 */
export function systemFieldIds(type, dbdefs) {
  const ids = {};
  for (const row of definitionOf(type).rows) ids[row.key] = Number(dbdefs?.localId?.('dty', row.concept)) || 0;
  return ids;
}

/**
 * Plain values of a record of a system type: `{key: value}` (the first value of a field,
 * '' when empty).
 *
 * @param {string} type 'bookmark' | 'reminder'.
 * @param {object|null} record Record of `/sys/{type}`.
 * @param {object} dbdefs HDbDefs.
 * @returns {Object<string, string>}
 */
export function systemValues(type, record, dbdefs) {
  const values = {};
  for (const [key, id] of Object.entries(systemFieldIds(type, dbdefs))) {
    let value = id ? record?.details?.[String(id)]?.[0] : undefined;
    if (value && typeof value === 'object') value = value.value ?? value.id ?? '';
    values[key] = value === undefined || value === null ? '' : String(value);
  }
  return values;
}

/**
 * `details` of a write from plain values: the given keys only; an empty value clears
 * the field (`[]`).
 *
 * @param {string} type 'bookmark' | 'reminder'.
 * @param {Object<string, *>} values `{key: value}`.
 * @param {object} dbdefs HDbDefs.
 * @returns {Object<string, Array<string>>}
 */
export function systemDetails(type, values, dbdefs) {
  const details = {};
  const ids = systemFieldIds(type, dbdefs);
  for (const [key, value] of Object.entries(values || {})) {
    if (!ids[key]) continue;
    const text = value === null || value === undefined ? '' : String(value).trim();
    details[String(ids[key])] = text === '' ? [] : [text];
  }
  return details;
}

/** @returns {object} The structure of a type, or throws. */
function definitionOf(type) {
  const definition = SYSTEM_STRUCTURES[type];
  if (!definition) throw new TypeError(`No structure of the system type ${type}`);
  return definition;
}
