/**
 * @file fieldPathUtils.js
 * @brief Utilities shared by Query Source field-path helper editors.
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

/**
 * Header (metadata) leaves of the field tree → header field codes of `/records`
 * (`fields=rec_Title`, linked: `10:lt241:12:rec_ID`).
 */
const HEADER_LEAF_CODES = {
  ids: 'rec_ID',
  title: 'rec_Title',
  added: 'rec_Added',
  modified: 'rec_Modified',
  addedby: 'rec_AddedByUGrpID',
  url: 'rec_URL',
  owner: 'rec_OwnerUGrpID',
  access: 'rec_NonOwnerVisibility',
  notes: 'rec_ScratchPad'
};

/**
 * Encode a field-tree selection path as a persisted field/path code (e.g. `123:lt45:678`).
 * A header leaf (ID, Title, Added, ...) gives its `/records` header code: `rec_Title` for
 * the record itself, `123:lt45:678:rec_ID` for linked records.
 * @param {Array} [path] Field-tree path steps, root to leaf.
 * @param {number|null} [rootRtyId] Root record type id, prefixed when the path starts below it.
 * @returns {string} The path code, or '' if the path cannot be encoded.
 */
export function fieldPathCode(path = [], rootRtyId = null) {
  if (!Array.isArray(path) || !path.length) return '';
  if (path.length === 1 && path[0]?.code) return String(path[0].code);
  const leafHeader = HEADER_LEAF_CODES[String(path.at(-1)?.dty ?? '').toLowerCase()] || null;
  // a header field of the record itself does not depend on the record type
  if (leafHeader && path.length === 1) return leafHeader;
  const root = Number(rootRtyId);
  const parts = root > 0 ? [String(root)] : [];
  for (const step of path) {
    if (step?.code) {
      parts.push(String(step.code));
    } else if (step?.via) {
      const via = step.via;
      if (!(Number(via.dty) > 0)) return '';
      parts.push(`${via.link || 'lt'}${Number(via.dty)}`);
      if (Number(via.targetRty) > 0) parts.push(String(Number(via.targetRty)));
    } else if (Number(step?.dty) > 0) {
      parts.push(String(Number(step.dty)));
    } else if (step === path.at(-1) && leafHeader) {
      parts.push(leafHeader);
    } else {
      return ''; // a leaf that is not an output field (e.g. "Any field")
    }
  }
  return parts.join(':');
}

/**
 * Build a readable "A > B > C" caption for a field-tree selection path.
 * @param {Array} [path] Field-tree path steps, root to leaf.
 * @param {object} dbdefs Database definitions used to resolve field names.
 * @returns {string} The hierarchy caption, or '' if the path is empty.
 */
export function fieldPathLabel(path = [], dbdefs) {
  if (!Array.isArray(path) || !path.length) return '';
  const labels = [];
  for (const step of path) {
    if (step?.label) labels.push(step.label);
    else if (step?.code) labels.push(headerFieldLabel(step.code));
    else if (HEADER_LEAF_CODES[String(step?.dty ?? '').toLowerCase()]) {
      labels.push(headerFieldLabel(HEADER_LEAF_CODES[String(step.dty).toLowerCase()]));
    }
    else if (step?.via) {
      const via = step.via;
      const field = dbdefs?.fieldGlobal?.(Number(via.dty));
      labels.push(field?.name || `${via.link || 'lt'}${via.dty}`);
    } else if (Number(step?.dty) > 0) {
      const field = dbdefs?.fieldGlobal?.(Number(step.dty));
      labels.push(field?.name || String(step.dty));
    }
  }
  return labels.join(' > ');
}

/**
 * Resolve a persisted field/path code to a readable hierarchy caption.
 * @param {string|number} code Field/path code (e.g. `123:lt45:678` or `rec_Title`).
 * @param {object} dbdefs Database definitions used to resolve field names.
 * @returns {string} The hierarchy caption, or the original code if it cannot be resolved.
 */
export function fieldCodeLabel(code, dbdefs) {
  const text = String(code ?? '').trim();
  if (!text) return '';
  if (text.startsWith('rec_')) return headerFieldLabel(text);
  const tokens = text.split(':').filter(Boolean);
  const labels = [];
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      // Record-type ids are structural separators in a path. A final numeric token is a field id.
      continue;
    }
    const link = token.match(/^(lt|lf|rt|rf|r)(\d+)$/i);
    if (link) {
      const field = dbdefs?.fieldGlobal?.(Number(link[2]));
      if (field?.name) labels.push(field.name);
    }
  }
  const final = tokens.at(-1);
  if (final && /^\d+$/.test(final)) {
    const field = dbdefs?.fieldGlobal?.(Number(final));
    if (field?.name) labels.push(field.name);
  } else if (final && /^rec_/i.test(final)) {
    labels.push(headerFieldLabel(final)); // header field of linked records
  }
  return labels.length ? labels.join(' > ') : text;
}

/**
 * Repair a path code whose relationship (relmarker) hops were saved as pointer or
 * directed hops: `10:lt155:14:10` / `10:rt155:14:10` → `10:r155:14:10`. Field-path
 * editors follow a relationship field in either direction (`r` = related).
 * @param {string} code Field/path code.
 * @param {object|null} dbdefs Database definitions used to recognise relmarker fields.
 * @returns {string} The code with relationship hops as r.
 */
export function relationLinkCode(code, dbdefs) {
  if (!dbdefs?.fieldGlobal || !code.includes(':')) return code;
  return code.split(':').map((token) => {
    const link = token.match(/^(lt|lf|rt|rf)(\d+)$/i);
    if (!link || dbdefs.fieldGlobal(Number(link[2]))?.type !== 'relmarker') return token;
    return `r${link[2]}`;
  }).join(':');
}

/**
 * Normalize a mixed list of field codes/ids and partial descriptors into `{ field, title, ... }` objects.
 * @param {Array} [values] Field codes/ids or partial field descriptors.
 * @param {object|null} [dbdefs] Database definitions used to derive a missing title.
 * @returns {Array<object>} Normalized field descriptors, with invalid entries removed.
 */
export function normalizeFieldDescriptors(values = [], dbdefs = null) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => {
    if (typeof value === 'string' || typeof value === 'number') {
      const field = relationLinkCode(String(value), dbdefs);
      return { field, title: dbdefs ? fieldCodeLabel(field, dbdefs) : null };
    }
    if (!value || typeof value !== 'object') return null;
    const field = relationLinkCode(String(value.field ?? value.code ?? '').trim(), dbdefs);
    if (!field) return null;
    const title = value.title || (dbdefs ? fieldCodeLabel(field, dbdefs) : null);
    return { ...value, field, title };
  }).filter(Boolean);
}

// moved to shared (also used by heurist-data); re-exported for existing imports
export { inferRecordTypeId } from '#shared/data/queryRecordType.js';

function headerFieldLabel(code) {
  return ({
    rec_ID: 'Record ID',
    rec_Title: 'Title',
    rec_RecTypeID: 'Record type',
    rec_Modified: 'Modified',
    rec_Added: 'Added',
    rec_AddedByUGrpID: 'Creator',
    rec_URL: 'URL',
    rec_OwnerUGrpID: 'Owner',
    rec_NonOwnerVisibility: 'Visibility',
    rec_ScratchPad: 'Notes'
  })[String(code)] || String(code).replace(/^rec_/, '').replace(/_/g, ' ');
}
