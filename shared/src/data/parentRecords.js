/**
 * @file parentRecords.js
 * @brief Virtual parent reads and forward-pointer assignment (plan 26).
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

import { RecordEditClient } from './RecordEditClient.js';

/** Load parents through the actual source type/field pairs; failures propagate to the caller. */
export async function loadParents({ apiClient, dbdefs, recordId, rectypeId, signal }) {
  if (!(Number(recordId) > 0)) return [];
  const lists = await Promise.all((dbdefs?.parentLinks(rectypeId) || []).map(async (link) => {
    const parents = [];
    let offset = 0;

    while (true) {
      const response = await apiClient.get('/records', { signal, query: {
        q: [{ t: String(link.parentRectypeId) }, { [`lt:${link.fieldId}`]: [{ ids: String(recordId) }] }, { sortby: 'id' }],
        fields: 'rec_Title,rec_RecTypeID', limit: 1000, offset
      } });
      if (!Array.isArray(response?.records)) throw new Error('The parents could not be loaded');
      parents.push(...response.records.map((record) => ({ ...link, record })));
      offset += response.records.length;
      if (!response.records.length || offset >= Number(response.pagination?.total ?? offset)) break;
    }

    return parents;
  }));
  return lists.flat().sort((a, b) => Number(a.record.rec_ID) - Number(b.record.rec_ID) || a.fieldId - b.fieldId);
}

/** Eligible forward fields of one parent record type for a child type. */
export function parentFieldsOf(dbdefs, childRectypeId, parentRectypeId) {
  return dbdefs.parentLinks(childRectypeId).filter((link) => link.parentRectypeId === Number(parentRectypeId));
}

/**
 * Header of a selected parent (no field values: a parent may have thousands of children)
 * and its eligible forward fields.
 *
 * @returns {Promise<{record: object, links: Array<object>}>}
 */
export async function parentCandidate({ apiClient, dbdefs, parentId, childRectypeId }) {
  const response = await apiClient.get('/records', { query: {
    q: [{ ids: String(parentId) }], fields: 'rec_Title,rec_RecTypeID', limit: 1
  } });
  const record = response?.records?.[0];
  if (!record) throw new Error('The parent record does not exist or you cannot see it');
  return { record, links: parentFieldsOf(dbdefs, childRectypeId, record.rec_RecTypeID) };
}

/** Append a child without replacing other pointers; use the parent's concurrency token. */
export async function assignParent({ apiClient, dbdefs, childId, childRectypeId, parentId, fieldId }) {
  const client = new RecordEditClient({ apiClient });
  const { record } = await client.load(parentId);
  if (!record) throw new Error('The parent record does not exist or you cannot see it');
  // the field was chosen with the selection (parentCandidate); check it against the stored type
  if (!parentFieldsOf(dbdefs, childRectypeId, record.rec_RecTypeID).some((link) => link.fieldId === Number(fieldId))) {
    throw new Error('Select a valid parent field');
  }
  const values = record.details?.[String(fieldId)] || [];
  if (values.some((value) => Number(value?.rec_ID ?? value?.value ?? value) === Number(childId))) return;
  const max = dbdefs.field(Number(record.rec_RecTypeID), Number(fieldId))?.max;
  if (max > 0 && values.length >= max) throw new Error('The parent field has no room for another child');
  await client.patch(parentId, {
    rec_Modified: record.rec_Modified,
    details: { [fieldId]: [...values, String(childId)] }
  });
}
