/**
 * @file relationshipDialog.js
 * @brief The popup that creates a relationship of a relmarker field (plan 22): an
 *        HEditForm with the three fields of a relationship record - source, relation
 *        type and target - not the full record editor.
 *
 * The edited record is the source (read only) and the target is chosen among the
 * field's target types; for a reverse field the record is the target and the source
 * is chosen among the field's source types. The relation type comes from the field's
 * vocabulary. *Create Link* saves the relationship record and closes; *Save and Edit
 * Attributes* saves it and asks the caller to open it in the record editor.
 *
 *   const created = await openRelationshipDialog({ dbdefs, field, record, relationships, ... });
 *   // created: {relId, editAttributes} or null
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

import { openEditFormDialog } from '../edit-form/editFormDialog.js';
import { relationshipIds } from '../../recordview/RecordRelationsProvider.js';
import { RecordEditError } from '../../data/RecordEditClient.js';
import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';

/**
 * Title of the popup: "Create relationship between <source type> and <target type(s)>
 * (Field: <field>)"; "records" for a field without a type constraint.
 *
 * @param {{dbdefs: object, field: object, record: {rty: number}}} options
 * @returns {string} Title.
 */
export function relationshipDialogTitle({ dbdefs, field, record }) {
  const names = (ids) => (ids || []).map(Number).filter((id) => id > 0)
    .map((id) => dbdefs?.rectypeName?.(id) || `#${id}`).join(', ');
  const own = names([record?.rty]);
  const others = names(field?.reverse ? field.sourceTypes : field.targetTypes) || $HR('records');
  const [source, target] = field?.reverse ? [others, own] : [own, others];
  const fieldLabel = field?.fieldName || field?.label || '';
  return `${$HR('Create relationship between')} ${source} ${$HR('and')} ${target} (${$HR('Field')}: ${fieldLabel})`;
}

/**
 * The form of the popup and the state of the edited record's field.
 *
 * @param {{dbdefs: object, field: object, record: {id: number, rty: number, title?: string}}} options
 * @returns {{form: object, states: Map<string, object>}}
 */
export function relationshipForm({ dbdefs, field, record }) {
  const rel = relationshipIds(dbdefs);
  const label = (dty, fallback) => (rel ? dbdefs.fieldName?.(rel.rty, dty) : '') || $HR(fallback);
  const reverse = field?.reverse === true;
  const own = { type: 'resource', req: 'required', max: 1, readOnly: true, targetTypes: [Number(record.rty)] };
  const chooser = {
    type: 'resource',
    req: 'required',
    max: 1,
    targetTypes: ((reverse ? field.sourceTypes : field.targetTypes) || []).map(Number).filter((id) => id > 0),
    pointerMode: 'dropdown_add'
  };
  const form = {
    localized: true,
    groups: [{
      id: 'relationship',
      children: [
        { name: 'source', label: label(rel?.source, 'Source record'), ...(reverse ? chooser : own) },
        { name: 'type', type: 'relationtype', label: label(rel?.type, 'Relationship type'), req: 'required', max: 1, vocabulary: Number(field?.vocabulary) || null },
        { name: 'target', label: label(rel?.target, 'Target record'), ...(reverse ? own : chooser) }
      ]
    }]
  };
  const ownState = { values: [{ value: Number(record.id), hidden: false, label: record.title || '', rectype: Number(record.rty) || null }], translations: [] };
  const states = new Map([[reverse ? 'target' : 'source', ownState]]);
  return { form, states };
}

/**
 * Show the popup and create the relationship.
 *
 * @param {object} options
 * @param {object} options.dbdefs HDbDefs.
 * @param {object} options.field Relmarker field (`vocabulary`, `targetTypes`; reverse: `sourceTypes`).
 * @param {{id: number, rty: number, title?: string}} options.record The edited record (saved).
 * @param {{create: Function}} options.relationships Editor service: `create({source, target, term}) → Promise<relId>`.
 * @param {object} [options.apiClient] HeuristApiClient (the record pickers).
 * @param {Function} [options.browseRecords] Record manager of the chooser (host).
 * @param {Function} [options.addRecord] New record of the chooser (host).
 * @param {Function} [options.viewRecord] View of a chosen record (host).
 * @param {{baseUrl: string, database: string}} [options.fileViewer] Heurist base URL and database (record type icons).
 * @returns {Promise<{relId: number, editAttributes: boolean}|null>} The new relationship, or null (cancelled).
 */
export async function openRelationshipDialog(options) {
  const { dbdefs, field, record, relationships } = options;
  const rel = relationshipIds(dbdefs);
  if (!rel) {
    HMsg.showMsgErr($HR('The database has no relationship record type'));
    return null;
  }
  const { form, states } = relationshipForm({ dbdefs, field, record });
  const names = { [String(rel.source)]: 'source', [String(rel.type)]: 'type', [String(rel.target)]: 'target' };
  let created = null;
  const result = await openEditFormDialog({
    title: relationshipDialogTitle({ dbdefs, field, record }),
    className: 'h-relationship-dialog',
    form,
    states,
    allowHidden: false,
    apiClient: options.apiClient,
    dbdefs,
    browseRecords: options.browseRecords,
    addRecord: options.addRecord,
    viewRecord: options.viewRecord,
    fileViewer: options.fileViewer || null,
    buttons: [
      { id: 'create', label: $HR('Create Link'), primary: true },
      { id: 'edit', label: $HR('Save and Edit Attributes') },
      { id: 'cancel', label: $HR('Cancel') }
    ],
    onAction: async (action, values, editForm) => {
      const reverse = field?.reverse === true;
      const relationship = {
        source: reverse ? Number(values.source) : Number(record.id),
        target: reverse ? Number(record.id) : Number(values.target),
        term: Number(values.type)
      };
      try {
        const relId = Number(await relationships.create(relationship)) || 0;
        if (!(relId > 0)) throw new Error($HR('The relationship could not be saved'));
        created = { relId, editAttributes: action === 'edit' };
        return true;
      } catch (error) {
        if (error instanceof RecordEditError && error.isValidation) {
          // issues of the three fields beside them, the others in a message
          const other = editForm.setIssues((error.issues || []).map((issue) => ({ ...issue, field: names[String(issue.field)] ?? issue.field })));
          if (other.length) HMsg.showMsgErr(other.map((issue) => issue.message).join('<br>'));
        } else {
          HMsg.showMsgErr(error?.message || String(error));
        }
        return false;
      }
    }
  });
  return result && created ? created : null;
}
