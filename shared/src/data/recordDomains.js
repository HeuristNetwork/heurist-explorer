/**
 * @file recordDomains.js
 * @brief API domain of each record type (plan 20 §5, plan 21): where its records
 *        are searched and written.
 *
 * Every domain speaks the `/records` JSON. By default a record type is on
 * `records`; registered files (RT_REGISTERED_FILE) are on `files`; users, groups,
 * bookmarks and reminders have their own URL (`/user`, plan 28a), because their ids
 * overlap with records. Local ids come from the definitions snapshot (`meta.dbconst`);
 * a code the database does not have (yet) matches nothing, so its type stays on
 * `records`.
 *
 * The record-based entities (website, page, report, output, RECORD_ENTITIES) are stored
 * in Records, so a list of several types still goes to `/records`; one record of them is
 * read and written at the URL of its entity (recordEntityPath).
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

import { writableRecordTypeIds } from './writableRecordTypes.js';

/** Default domain. */
export const RECORDS_DOMAIN = 'records';

/**
 * Record types on another domain, by code name: `{domain, type?}` (`type`: the entity
 * of a `sys` record type).
 */
export const RECORD_TYPE_DOMAINS = Object.freeze({
  RT_REGISTERED_FILE: Object.freeze({ domain: 'files' }),
  RT_USER_BOOKMARKS: Object.freeze({ domain: 'sys', type: 'bookmark' }),
  RT_USER_REMINDERS: Object.freeze({ domain: 'sys', type: 'reminder' }),
  // users and groups in the record format (plan 20, Phase 4d)
  RT_SYS_USER: Object.freeze({ domain: 'sys', type: 'user' }),
  RT_SYS_GROUP: Object.freeze({ domain: 'sys', type: 'group' })
});

/** Record-based entities, by code name of the record type (plan 28; srv RecordEntityRegistry). */
export const RECORD_ENTITIES = Object.freeze({
  RT_CMS_HOME: 'website',
  RT_CMS_PAGE: 'page',
  RT_CUSTOM_REPORT: 'report',
  RT_REPORT_SCHEDULE: 'output'
});

/**
 * URL of the record-based entity of a record type.
 *
 * @param {object|null} dbdefs HDbDefs (needs `dbconst`).
 * @param {number|string} rectypeId Record type id.
 * @returns {string|null} `/website` ..., null when the type is not such an entity.
 */
export function recordEntityPath(dbdefs, rectypeId) {
  const id = Number(rectypeId);
  if (!(id > 0)) return null;
  for (const [code, entity] of Object.entries(RECORD_ENTITIES)) {
    if ((Number(dbdefs?.dbconst?.(code)) || 0) === id) return `/${entity}`;
  }
  return null;
}

/**
 * Domain entry of a record type.
 *
 * @param {object|null} dbdefs HDbDefs (needs `dbconst`).
 * @param {number|string} rectypeId Record type id.
 * @returns {{domain: string, type: string|null, path: string}} `path`: the search path
 *          (`/records`, `/files`, `/bookmark`); a record is `${path}/${id}`.
 */
export function recordTypeDomain(dbdefs, rectypeId) {
  const id = Number(rectypeId);
  if (id > 0) {
    for (const [code, entry] of Object.entries(RECORD_TYPE_DOMAINS)) {
      if ((Number(dbdefs?.dbconst?.(code)) || 0) === id) {
        const type = entry.type || null;
        return { domain: entry.domain, type, path: type ? `/${type}` : `/${entry.domain}` };
      }
    }
  }
  return { domain: RECORDS_DOMAIN, type: null, path: `/${RECORDS_DOMAIN}` };
}

/**
 * Domain name of a record type: `records`, `files` or `sys`.
 *
 * @param {object|null} dbdefs HDbDefs.
 * @param {number|string} rectypeId Record type id.
 * @returns {string}
 */
export function recordDomain(dbdefs, rectypeId) {
  return recordTypeDomain(dbdefs, rectypeId).domain;
}

/**
 * The one domain of a list of record types (a record list or pointer field): all must
 * be on the same domain; none (unconstrained) is `records`.
 *
 * @param {object|null} dbdefs HDbDefs.
 * @param {Array<number|string>} rectypeIds Record type ids.
 * @returns {{domain: string, type: string|null, path: string}}
 * @throws {TypeError} When the types are on different domains (they can not be listed together).
 */
export function recordTypesDomain(dbdefs, rectypeIds = []) {
  const entries = (rectypeIds || []).map((id) => recordTypeDomain(dbdefs, id));
  if (!entries.length) return recordTypeDomain(dbdefs, 0);
  const paths = new Set(entries.map((entry) => entry.path));
  if (paths.size > 1) {
    throw new TypeError(`Record types of different API domains can not be listed together: ${[...paths].join(', ')}`);
  }
  return entries[0];
}

/**
 * Record types of an unconstrained pointer or record list: user-data types on
 * `/records` (the writable system types and other domains are never offered, plan 21).
 *
 * @param {object|null} dbdefs HDbDefs (`rectypes`, `dbconst`).
 * @returns {number[]} Record type ids, in the HDbDefs order (by group, then name).
 */
export function userDataRecordTypeIds(dbdefs) {
  const system = new Set(writableRecordTypeIds(dbdefs));
  return (dbdefs?.rectypes?.() || [])
    .map((rectype) => Number(rectype?.id ?? rectype))
    .filter((id) => id > 0 && !system.has(id) && recordDomain(dbdefs, id) === RECORDS_DOMAIN);
}
