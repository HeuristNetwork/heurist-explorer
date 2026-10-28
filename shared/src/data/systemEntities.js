/**
 * @file systemEntities.js
 * @brief Hard-coded edit structures of the system record types (plan 20, §10.2, §10.9).
 *
 * The system record types (Bookmark, Reminder, File; later Saved filter, User, Group)
 * have no structure in the database. Their structures are kept here in the `/rst`
 * row format (`rst_*`, `dty_*` columns), with concept codes instead of local ids, so
 * the same `buildEditStructure` makes their edit forms. Later the structures come
 * from `/rst` without changes to the forms.
 *
 * Each row has a `key`: the name of the field in plain objects and in the HEditForm
 * values (`{rating: 3, notes: '...'}`); `form` adds HEditForm properties
 * (`minValue`, `maxLength`, `temporal`...). Fields the database lacks are left out.
 * A row names its field by concept code (`concept`), or by a DT_* constant (`constant`,
 * users and groups, plan 20 Phase 4d: the server's UserGroupCodes, read as `dbconst`);
 * its vocabulary by `vocabulary` (concept code) or `vocabularyConstant`. `max: 0` is a
 * repeatable field (an array in plain values). A relmarker row (group membership, plan 24)
 * is a field of the form, not of the plain values: it is written apart (the members).
 * `reverse: true` with `sourceTypes` (concept codes): the record is the target. A row of
 * `dty_Type: 'separator'` starts a group as in a database structure (`rst_DefaultValue`
 * `tabs`: a tab); a group without fields is left out.
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
  user: '2-1107', group: '2-1108', tag: '2-1109', bookmark: '2-1110', reminder: '2-1111', file: '2-1106'
});

/** Registered file types (DT_REGISTERED_FILE_TYPE 2-1186, vocabulary 2-10448) by term concept code. */
export const FILE_TYPES = Object.freeze({
  '2-10449': 'local', '2-10450': 'external', '2-10451': 'iiif_image', '2-10452': 'iiif', '2-10453': 'tiled'
});

/**
 * Fields of a registered file by its type (plan 20, §10.11): the type is never edited, so the
 * form is made for the type of the record. `show`: the field is in the form; `edit`: it can
 * be changed. iiif / iiif_image are JSON manifests: their file type is always json.
 */
const FILE_FIELDS_BY_TYPE = Object.freeze({
  local: { show: ['upload', 'downloadUrl', 'originalName', 'size', 'fileType'], edit: ['upload'] },
  tiled: { show: ['upload', 'fileType'], edit: ['upload', 'fileType'] },
  external: { show: ['url', 'fileType'], edit: ['url', 'fileType'] },
  iiif: { show: ['url', 'mimeJson'], edit: ['url'] },
  iiif_image: { show: ['url', 'mimeJson'], edit: ['url'] }
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
  }),
  // a user account (plan 20, Phase 4d, §10.13): the fields by DT_* constants (codes in srv
  // UserGroupCodes; a field the database lacks is left out); the password is written only
  user: Object.freeze({
    rectype: SYSTEM_RECORD_TYPES.user,
    // three tabs (plan 24 review): Account, User info, Membership
    rows: Object.freeze([
      { key: 'tabAccount', dty_Type: 'separator', rst_DisplayName: 'Account', rst_DefaultValue: 'tabs' },
      {
        key: 'login', constant: 'DT_LOGIN_NAME', rst_DisplayName: 'Login name', dty_Type: 'freetext',
        rst_RequirementType: 'required', form: { maxLength: 63 }
      },
      {
        key: 'email', constant: 'DT_EMAIL', rst_DisplayName: 'E-mail', dty_Type: 'freetext', rst_RequirementType: 'required',
        form: { maxLength: 100, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', patternMessage: 'An e-mail address' }
      },
      {
        key: 'password', constant: 'DT_PASSWORD', rst_DisplayName: 'Password', dty_Type: 'freetext',
        rst_DisplayHelpText: 'Leave empty to keep the password', form: { inputType: 'password' }
      },
      {
        key: 'status', constant: 'DT_ACCOUNT_STATUS', rst_DisplayName: 'Account status', dty_Type: 'enum',
        vocabularyConstant: 'TRM_ACCOUNT_STATUS', rst_DisplayHelpText: 'Set by administrators'
      },
      { key: 'lastLogin', constant: 'DT_LAST_LOGIN', rst_DisplayName: 'Last login', dty_Type: 'freetext', form: { readOnly: true } },
      { key: 'loginCount', constant: 'DT_LOGIN_COUNT', rst_DisplayName: 'Login count', dty_Type: 'integer', form: { readOnly: true } },
      { key: 'tabInfo', dty_Type: 'separator', rst_DisplayName: 'User info', rst_DefaultValue: 'tabs' },
      { key: 'givenNames', constant: 'DT_GIVEN_NAMES', rst_DisplayName: 'Given names', dty_Type: 'freetext', form: { maxLength: 40 } },
      { key: 'familyName', constant: 'DT_NAME', rst_DisplayName: 'Family name', dty_Type: 'freetext', form: { maxLength: 63 } },
      {
        key: 'organisation', constant: 'DT_ORGANISATION_NAME', rst_DisplayName: 'Organisation', dty_Type: 'freetext',
        form: { maxLength: 120 }
      },
      { key: 'department', constant: 'DT_DEPARTMENT', rst_DisplayName: 'Department', dty_Type: 'freetext', form: { maxLength: 120 } },
      {
        key: 'address', constant: 'DT_ADDRESS', rst_DisplayName: 'Address', dty_Type: 'blocktext',
        rst_DisplayHelpText: 'City, state and postcode, one line each', form: { rows: 3 }
      },
      {
        key: 'interests', constant: 'DT_RESEARCH_INTERESTS', rst_DisplayName: 'Research interests', dty_Type: 'freetext',
        form: { maxLength: 255 }
      },
      { key: 'urls', constant: 'DT_URL', rst_DisplayName: 'URL(s)', dty_Type: 'freetext', rst_DisplayHelpText: 'Separated by commas' },
      {
        key: 'orcid', constant: 'DT_ORCID', rst_DisplayName: 'ORCID iD', dty_Type: 'freetext',
        form: { pattern: '^\\d{4}-\\d{4}-\\d{4}-\\d{3}[\\dX]$', patternMessage: 'Written as 0000-0000-0000-0000' }
      },
      { key: 'tabMembership', dty_Type: 'separator', rst_DisplayName: 'Membership', rst_DefaultValue: 'tabs' },
      // the groups of the user with the role (plan 24): the group membership from the user's side
      {
        key: 'groups', constant: 'DT_GROUP_MEMBERSHIP', rst_DisplayName: 'Groups', dty_Type: 'relmarker', max: 0,
        vocabularyConstant: 'TRM_GROUP_ROLE', targetTypes: [SYSTEM_RECORD_TYPES.user], sourceTypes: [SYSTEM_RECORD_TYPES.group],
        reverse: true, rst_DisplayHelpText: 'Changed at once'
      }
    ])
  }),
  // a workgroup (plan 20, Phase 4d): its members are the relmarker DT_GROUP_MEMBERSHIP, the role as
  // the relation type (plan 24), written apart (POST /sys/group/{id}/members)
  group: Object.freeze({
    rectype: SYSTEM_RECORD_TYPES.group,
    // two tabs (plan 24 review): Info, Membership
    rows: Object.freeze([
      { key: 'tabInfo', dty_Type: 'separator', rst_DisplayName: 'Info', rst_DefaultValue: 'tabs' },
      {
        key: 'name', constant: 'DT_NAME', rst_DisplayName: 'Name', dty_Type: 'freetext', rst_RequirementType: 'required',
        rst_DisplayHelpText: 'A short name, unique among groups and users', form: { maxLength: 63 }
      },
      { key: 'longName', constant: 'DT_SHORT_SUMMARY', rst_DisplayName: 'Long name', dty_Type: 'freetext', form: { maxLength: 128 } },
      {
        key: 'description', constant: 'DT_EXTENDED_DESCRIPTION', rst_DisplayName: 'Description', dty_Type: 'blocktext',
        form: { maxLength: 1000 }
      },
      { key: 'urls', constant: 'DT_URL', rst_DisplayName: 'URL(s)', dty_Type: 'freetext', rst_DisplayHelpText: 'Separated by commas' },
      { key: 'tabMembership', dty_Type: 'separator', rst_DisplayName: 'Membership', rst_DefaultValue: 'tabs' },
      {
        key: 'members', constant: 'DT_GROUP_MEMBERSHIP', rst_DisplayName: 'Members', dty_Type: 'relmarker', max: 0,
        vocabularyConstant: 'TRM_GROUP_ROLE', targetTypes: [SYSTEM_RECORD_TYPES.user],
        rst_DisplayHelpText: 'Changed at once; a group has at least one admin'
      }
    ])
  }),
  // registered file (plan 20, §10.11): the fields of the record; the content, its URL and
  // download URL are added by fileEditStructure. Not in the form: stored name and folder
  // (2-62, 2-63, admins only), MD5 (2-68), configuration (2-1187)
  file: Object.freeze({
    rectype: SYSTEM_RECORD_TYPES.file,
    rows: Object.freeze([
      { key: 'type', concept: '2-1186', rst_DisplayName: 'Source', dty_Type: 'enum', vocabulary: '2-10448' },
      {
        key: 'originalName', concept: '2-1185', rst_DisplayName: 'File name', dty_Type: 'freetext',
        rst_DisplayHelpText: 'The name of the uploaded file'
      },
      { key: 'size', concept: '2-67', rst_DisplayName: 'Size (bytes)', dty_Type: 'integer' },
      {
        key: 'fileType', concept: '2-29', rst_DisplayName: 'File type', dty_Type: 'enum', vocabulary: '2-533',
        rst_RequirementType: 'required'
      },
      {
        key: 'caption', concept: '2-1', rst_DisplayName: 'Name / caption', dty_Type: 'freetext',
        rst_DisplayHelpText: 'A name of the file or image; the title of the file'
      },
      { key: 'description', concept: '2-4', rst_DisplayName: 'Description', dty_Type: 'blocktext' },
      {
        key: 'copyright', concept: '2-35', rst_DisplayName: 'Copyright', dty_Type: 'freetext',
        rst_DisplayHelpText: 'Copyright statement or a URI leading to a copyright statement'
      },
      {
        key: 'copyowner', concept: '2-1188', rst_DisplayName: 'Copyright owner', dty_Type: 'freetext',
        rst_DisplayHelpText: 'The owner of the copyright in the file (person or organisation)'
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
    if (row.dty_Type === 'separator') {
      // a group (tab) of the form: no field of the database (a negative id)
      rows.push({
        key: row.key, form: null, rst_DetailTypeID: -(index + 1), rst_DisplayName: row.rst_DisplayName,
        rst_DisplayOrder: index + 1, rst_RequirementType: 'optional', rst_DefaultValue: row.rst_DefaultValue || 'group',
        rst_DisplayHelpText: row.rst_DisplayHelpText || '', rst_MaxValues: 1, dty_Type: 'separator',
        dty_Name: row.rst_DisplayName, dty_JsonTermIDTree: '', dty_PtrTargetRectypeIDs: ''
      });
      continue;
    }
    const dty = rowFieldId(row, dbdefs);
    if (!dty) continue;
    const vocabulary = row.vocabularyConstant ? Number(dbdefs?.dbconst?.(row.vocabularyConstant)) || 0
      : row.vocabulary ? Number(dbdefs.localId('trm', row.vocabulary)) || 0 : 0;
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
      rst_MaxValues: row.max ?? 1,
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
  const definitions = new Map(definitionOf(type).rows.map((row) => [row.key, row]));
  for (const field of structureFields(structure)) {
    const row = byDty.get(Number(field.dty));
    Object.assign(field, { name: row.key }, row.form || {});
    // a reverse relmarker (the user's groups): the record is the target
    const definition = definitions.get(row.key);
    if (definition?.reverse) {
      field.reverse = true;
      field.sourceTypes = (definition.sourceTypes || []).map((code) => Number(dbdefs.localId('rty', code)) || 0).filter(Boolean);
    }
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
  for (const row of definitionOf(type).rows) {
    // a relmarker (group membership) and a separator are not values of the record
    if (row.dty_Type !== 'relmarker' && row.dty_Type !== 'separator') ids[row.key] = rowFieldId(row, dbdefs);
  }
  return ids;
}

/** @returns {number} Local field id of a structure row: its DT_* constant, else its concept code (0: none). */
function rowFieldId(row, dbdefs) {
  if (row.constant) return Number(dbdefs?.dbconst?.(row.constant)) || 0;
  return Number(dbdefs?.localId?.('dty', row.concept)) || 0;
}

/**
 * Plain values of a record of a system type: `{key: value}` (the first value of a field,
 * '' when empty; a repeatable field (`max: 0`): all its values).
 *
 * @param {string} type 'bookmark' | 'reminder'.
 * @param {object|null} record Record of `/sys/{type}`.
 * @param {object} dbdefs HDbDefs.
 * @returns {Object<string, string>}
 */
export function systemValues(type, record, dbdefs) {
  const values = {};
  const plain = (value) => {
    const item = value && typeof value === 'object' ? value.value ?? value.id ?? '' : value;
    return item === undefined || item === null ? '' : String(item);
  };
  const repeatable = new Set(definitionOf(type).rows.filter((row) => row.max === 0).map((row) => row.key));
  for (const [key, id] of Object.entries(systemFieldIds(type, dbdefs))) {
    const list = id ? record?.details?.[String(id)] || [] : [];
    values[key] = repeatable.has(key) ? list.map(plain).filter(Boolean) : plain(list[0]);
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
  const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
  for (const [key, value] of Object.entries(values || {})) {
    if (!ids[key]) continue;
    // a repeatable field: its values
    const list = Array.isArray(value) ? value.map(text).filter(Boolean) : [text(value)].filter(Boolean);
    details[String(ids[key])] = list;
  }
  return details;
}

/**
 * Type of a registered file: its DT_REGISTERED_FILE_TYPE term, else guessed from the record
 * (a URL without a file name is external).
 *
 * @param {object|null} record Record of `/files`.
 * @param {object} dbdefs HDbDefs.
 * @returns {'local'|'external'|'iiif'|'iiif_image'|'tiled'}
 */
export function registeredFileType(record, dbdefs) {
  const { type, originalName } = systemFieldIds('file', dbdefs);
  const term = Number(plainOf(record?.details?.[String(type)]?.[0])) || 0;
  const known = term ? FILE_TYPES[dbdefs?.conceptId?.('trm', term)] : null;
  if (known) return known;
  const name = originalName ? plainOf(record?.details?.[String(originalName)]?.[0]) : '';
  return record?.rec_URL && !name ? 'external' : 'local';
}

/**
 * Edit structure of a registered file (plan 20, §10.11), made for the type of the record:
 * the type (read only), the content (HInputFile in replace mode: the new content is sent
 * with the save), the URL (`rec_URL`), the download URL, name, size and file type (extension) as the
 * type allows, then caption, description, copyright and copyright owner.
 *
 * Fields that are not record details are named: `upload` (the token of a new content),
 * `url` (`header: 'rec_URL'`), `downloadUrl` and `mimeJson` (`transient`: shown, not sent).
 *
 * @param {object|null} record Record of `/files`.
 * @param {object} dbdefs HDbDefs.
 * @param {{fileUrls?: object, multilangIds?: number[]}} [options] `fileMediaUrls()` of the
 *        database (download URL); multilingual field ids (caption, description).
 * @returns {{rty: number, groups: Array<object>}}
 */
export function fileEditStructure(record, dbdefs, { fileUrls = null, multilangIds = [] } = {}) {
  const fileType = registeredFileType(record, dbdefs);
  const { show, edit } = FILE_FIELDS_BY_TYPE[fileType];
  // the size is shown formatted (a transient field below)
  const rows = systemEditRows('file', dbdefs)
    .filter((row) => row.key !== 'size' && (!['originalName', 'fileType'].includes(row.key) || show.includes(row.key)));
  const rty = Number(dbdefs?.localId?.('rty', SYSTEM_RECORD_TYPES.file)) || 0;
  const structure = buildEditStructure(rows, { rty, dbdefs, multilangIds });
  const byDty = new Map(rows.map((row) => [Number(row.rst_DetailTypeID), row]));
  const fields = [];
  for (const field of structureFields(structure)) {
    const row = byDty.get(Number(field.dty));
    field.key = row.key;
    // the type and what the server sets from the content are read only; so they are not required
    if (['type', 'originalName'].includes(row.key) || (row.key === 'fileType' && !edit.includes('fileType'))) {
      Object.assign(field, { readOnly: true, req: 'optional' });
    }
    fields.push(field);
  }
  const key = String(record?.rec_Hash || '');
  const sizeId = systemFieldIds('file', dbdefs).size;
  const bytes = sizeId ? Number(plainOf(record?.details?.[String(sizeId)]?.[0])) : NaN;
  const extra = {
    size: {
      name: 'size', type: 'freetext', label: 'Size', readOnly: true, transient: true,
      value: Number.isFinite(bytes) && bytes > 0 ? formatFileSize(bytes) : ''
    },
    upload: {
      name: 'upload', type: 'file', label: 'File', replace: true, req: 'optional',
      help: 'Upload a new file: it replaces the current content when the record is saved (the download URL stays)',
      // the current content: thumbnail and preview of the input
      file: record?.rec_ID ? {
        ulf_ID: Number(record.rec_ID),
        ulf_OrigFileName: String(record.rec_Title || ''),
        ulf_ObfuscatedFileID: key || null,
        ulf_ExternalFileReference: record.rec_URL || null,
        // derived from the file type by the server (fields=_all, 2026-10-27)
        fxm_MimeType: String(record.fxm_MimeType || '')
      } : null
    },
    url: {
      name: 'url', type: 'url', label: 'URL', header: 'rec_URL', req: 'required', width: 60,
      help: 'URL of the external resource (for IIIF: the manifest or info.json)'
    },
    downloadUrl: {
      name: 'downloadUrl', type: 'url', label: 'Download URL', readOnly: true, transient: true, width: 60,
      value: key && fileUrls?.download ? fileUrls.download(key) : ''
    },
    mimeJson: { name: 'mimeJson', type: 'freetext', label: 'File type', readOnly: true, transient: true, value: 'json' }
  };
  const ordered = [];
  const take = (name) => {
    const index = fields.findIndex((field) => field.key === name);
    if (index >= 0) ordered.push(fields.splice(index, 1)[0]);
  };
  take('type');
  for (const name of ['upload', 'url', 'downloadUrl', 'originalName', 'size', 'fileType', 'mimeJson']) {
    if (!show.includes(name)) continue;
    if (extra[name]) ordered.push(extra[name]);
    else take(name);
  }
  ordered.push(...fields);
  const group = structure.groups[0] || { id: null, kind: null, type: 'group', label: null, help: '' };
  return { rty, fileType, groups: [{ ...group, children: ordered }] };
}

/** @returns {string} "850 B", "12.4 KB" or "3.1 MB". */
export function formatFileSize(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/** @returns {string} The plain value of a stored value (term id, text). */
function plainOf(value) {
  if (value && typeof value === 'object') return String(value.value ?? value.trm_ID ?? value.id ?? '');
  return value === null || value === undefined ? '' : String(value);
}

/** @returns {object} The structure of a type, or throws. */
function definitionOf(type) {
  const definition = SYSTEM_STRUCTURES[type];
  if (!definition) throw new TypeError(`No structure of the system type ${type}`);
  return definition;
}
