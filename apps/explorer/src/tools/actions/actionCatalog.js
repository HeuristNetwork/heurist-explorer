/**
 * @file actionCatalog.js
 * @brief The actions of the Explorer Actions tool by group (plan 33): name, description
 *        (also the help text of the action pane) and whether it is implemented.
 *
 * Not implemented entries are listed but disabled. Implemented actions run as the
 * background job "record-action" (srv/Records/Actions); one selected record is changed by
 * PATCH (field values, ownership) or DELETE.
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

/** Groups in list order (Field values first, 2026-11-10). */
export const ACTION_GROUPS = [
  { id: 'values', name: 'Field values' },
  { id: 'metadata', name: 'Metadata' },
  { id: 'verify', name: 'Verify values' },
  { id: 'danger', name: 'Dangerous zone' }
];

/**
 * Actions. `descKey`: key of the description in the localization files (long texts are kept
 * under keys); `description`: the English text, used when the key is missing. `form`: the form
 * of the action pane (fieldValues | ownership | delete | none); `mode` of the field value
 * actions: add | replace | delete; `danger`: a warning icon in the list and the pane.
 *
 * @type {Array<{id:string, group:string, name:string, descKey:string, description:string, implemented:boolean,
 *   form?:string, mode?:string, danger?:boolean}>}
 */
export const ACTIONS = [
  {
    id: 'field-add', group: 'values', name: 'Add', implemented: true, form: 'fieldValues', mode: 'add', descKey: 'valueadd_desc',
    description: 'This function adds a new value for a specific field to the records of the scope. Existing values are '
      + 'unaffected. A record is skipped (and listed in the report) when the value would exceed the repeat count of the '
      + 'field, for example a second value of a single-value field.'
  },
  {
    id: 'field-replace', group: 'values', name: 'Replace', implemented: true, form: 'fieldValues', mode: 'replace', descKey: 'valuereplace_desc',
    description: 'This function replaces all values, or the values that match a condition, of a particular field for '
      + 'the records of the scope. Other fields / values are not affected. With a condition, the new value can be '
      + 'added to the records where no value matches.'
  },
  {
    id: 'field-delete', group: 'values', name: 'Delete', implemented: true, form: 'fieldValues', mode: 'delete', descKey: 'valuedelete_desc',
    description: 'This function deletes all values, or the values that match a condition, of a particular field for '
      + 'the records of the scope. Other fields / values are not affected. A record is skipped (and listed in the '
      + 'report) when the last value of a required field would be deleted.'
  },
  {
    id: 'link', group: 'values', name: 'Add Link or Relation', implemented: false, descKey: 'valuelink_desc',
    description: 'This function adds a pointer (record link) or a relationship from every record of the scope to a '
      + 'chosen record, through a pointer or relationship marker field of their record type. Existing links are kept.'
  },
  {
    id: 'calculations', group: 'values', name: 'Rebuild calculation fields', implemented: true, form: 'none', descKey: 'valuecalc_desc',
    description: 'This function runs the formulas of the calculated fields of the records of the scope again and saves '
      + 'the values that have changed (generally after a change of a formula or of the values it uses). At the end it '
      + 'lists the records whose calculated values were changed and the records whose formula failed.'
  },
  {
    id: 'ownership', group: 'metadata', name: 'Ownership and visibility', implemented: true, form: 'ownership', descKey: 'metaowner_desc',
    description: 'This function changes the owner (user or workgroup) and/or the visibility for non-owners of the '
      + 'records of the scope. Only the records you may edit are changed.'
  },
  {
    id: 'titles', group: 'metadata', name: 'Rebuild record titles', implemented: true, form: 'none', descKey: 'metatitles_desc',
    description: 'This function recalculates all the constructed (composite) record titles, compares them with the '
      + 'existing title and updates the title where the title has changed (generally due to changes in the title mask '
      + 'for the record type). At the end of the process it will display a list of records for which the titles were '
      + 'changed and a list of records for which the new title would be blank (an error condition).'
  },
  {
    id: 'convert', group: 'metadata', name: 'Convert to record type', implemented: false, descKey: 'metaconvert_desc',
    description: 'This function changes the record (entity) type of the records of the scope. All records will be '
      + 'converted to the new type. Warning: It is highly likely that the data recorded for many or all of these '
      + 'records will not satisfy the conditions set for the record type to which they are converted. Please use '
      + 'Verify > Verify integrity to locate and correct any invalid records generated by this process.'
  },
  {
    id: 'tags', group: 'metadata', name: 'Add or Remove Tags', implemented: false, descKey: 'metatags_desc',
    description: 'This function adds the chosen personal or workgroup tags to the records of the scope, or removes them. '
      + 'Records get a bookmark when a personal tag is added.'
  },
  {
    id: 'rate', group: 'metadata', name: 'Rate', implemented: false, descKey: 'metarate_desc',
    description: 'This function assigns your personal rating to the records of the scope. Records will be bookmarked.'
  },
  {
    id: 'unbookmark', group: 'metadata', name: 'Unbookmark', implemented: false, descKey: 'metaunbookmark_desc',
    description: 'This function removes your bookmarks of the records of the scope; your personal tags of these records '
      + 'are detached. It ONLY removes the bookmark from your resources, it does not delete the records.'
  },
  {
    id: 'verify', group: 'verify', name: 'Verify values', implemented: false, descKey: 'verifyvalues_desc',
    description: 'This function checks the values of the records of the scope against their record structure: missing '
      + 'required values, too many values, invalid terms, dates and pointers. It lists the records with problems; it '
      + 'changes nothing.'
  },
  {
    id: 'delete', group: 'danger', name: 'Delete records', implemented: true, form: 'delete', danger: true, descKey: 'dangerdelete_desc',
    description: 'This function deletes the records of the scope that you may edit, with their values and bookmarks. '
      + 'Pointers to them from other records are removed and their relationship records are deleted. This cannot be undone.'
  }
];

/**
 * Description of an action in the current language (its key, else the English text).
 *
 * @param {object} action Action of ACTIONS.
 * @param {(key: string, fallback?: string) => string} translate $HR.
 * @returns {string}
 */
export function actionDescription(action, translate) {
  return translate(action.descKey, action.description);
}

/**
 * An action by id.
 *
 * @param {string} id Action id.
 * @returns {object|null}
 */
export function actionById(id) {
  return ACTIONS.find((action) => action.id === id) || null;
}
