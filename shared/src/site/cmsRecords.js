/**
 * @file cmsRecords.js
 * @brief Records and selection of a module on a website page (plan 27l §12): where its records come from and whether it
 *        shares the selection with the other modules.
 *
 * Instance keys: `records: {from: [...]}` — `own` (its own query, `dataSource`), `links` (Saved filter links of the page
 * and the Saved filter in the URL), `filter:<instanceId>` (a Filter widget), `module:<instanceId>` (another module: it
 * follows everything that module shows); `selection: false` (shares no selection; not written when it does). Not
 * stored = the default: Saved filter links and every Filter widget of the page, selection shared. A module shows the
 * latest search of any of its sources. Record View has no external source: its own record, or the selected record.
 * Explorer: `own` (its filters) and `links` only, no page selection yet (phase D). Crosstabs (a widget, plan 27q2):
 * `settings.from`, `own` = the query of the crosstab, no selection.
 *
 * An older `sync` (round 1, test pages only) is read: `all` = the default, `selection` = own records + selection,
 * `none` = own records only.
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

import { CMS_RECORDS_TOKEN, CMS_SOURCE_MODULES, cmsInstanceDataSource } from './cmsDocument.js';

/** Modules that take part in Records and selection. */
export const CMS_RECORDS_MODULES = Object.freeze(['explorer', ...CMS_SOURCE_MODULES]);

/**
 * The default sources of a module: Saved filter links and every Filter widget of the page (Explorer: its own filters and
 * the links).
 *
 * @param {string} type Module type.
 * @param {object} [instances] The instances of the page (its Filter widgets).
 * @returns {string[]}
 */
export function cmsDefaultRecordsFrom(type, instances = {}) {
  if (type === 'explorer') return ['own', 'links'];
  if (type === 'recordview') return [];
  const filters = Object.entries(instances || {})
    .filter(([, instance]) => instance?.kind === 'widget' && instance?.type === 'filter')
    .map(([id]) => `filter:${id}`);
  return ['links', ...filters];
}

/**
 * Records and selection of an instance with the defaults.
 *
 * @param {object} instance Instance configuration.
 * @param {object} [instances] The instances of the page (the default Filter widgets).
 * @returns {{from: string[], selection: boolean, own: object|null}} `own`: its own records (cmsInstanceDataSource) when
 *          `from` has `own`, else null.
 */
export function cmsInstanceRecords(instance, instances = {}) {
  const type = String(instance?.type ?? '');
  if (instance?.kind === 'widget' && type === 'crosstabs') {
    // crosstabs (plan 27q2 §10): `settings.from` (a widget has no `records`); own = the query of the crosstab
    const stored = instance.settings?.from;
    const from = Array.isArray(stored)
      ? [...new Set(stored.filter((token) => typeof token === 'string' && CMS_RECORDS_TOKEN.test(token)))]
      : ['own', ...cmsDefaultRecordsFrom(type, instances)];
    return { from, selection: false, own: null };
  }
  const own = cmsInstanceDataSource(instance?.dataSource, type);
  if (type === 'recordview') {
    // its own record, or the selected record
    const record = own?.record ? own : null;
    return { from: record ? ['own'] : [], selection: !record && instance?.selection !== false && instance?.sync !== 'none', own: record };
  }
  let from;
  if (Array.isArray(instance?.records?.from)) {
    from = instance.records.from.filter((token) => typeof token === 'string' && CMS_RECORDS_TOKEN.test(token));
  } else if (instance?.sync === 'selection' || instance?.sync === 'none') {
    from = ['own'];
  } else {
    from = cmsDefaultRecordsFrom(type, instances);
  }
  if (type === 'explorer') from = from.filter((token) => token === 'own' || token === 'links');
  from = [...new Set(from)];
  const selection = type !== 'explorer' && instance?.selection !== false && instance?.sync !== 'none';
  return { from, selection, own: type !== 'explorer' && from.includes('own') ? own : null };
}

/**
 * Whether a module takes the records of a search of the page.
 *
 * @param {string[]} from Its sources (cmsInstanceRecords).
 * @param {string} origin `links`, `filter:<id>` or `module:<id>`.
 * @returns {boolean}
 */
export function cmsTakesRecords(from, origin) {
  return Array.isArray(from) && from.includes(origin);
}
