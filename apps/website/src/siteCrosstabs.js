/**
 * @file siteCrosstabs.js
 * @brief The website element Crosstabs (plan 27q2 §10), a lazy chunk: the stored crosstab (a Presentation set of kind
 *        Crosstab) as HCrosstab. On the page it is a member of PageSync: it counts the records of its sources
 *        (`settings.from`: its own query, Saved filter links, Filter widgets, other modules); with *A click shows the
 *        records* a click on a count sends the records of the cell on as `module:<id>`. The visitor level is the lower
 *        of the element (`settings.level`) and the crosstab. Labels of terms, record types and fields come from the
 *        definitions of the database (read once per page, as the Filter widget). Its own records (presentation-sources.md):
 *        `settings.query` (a crosstab published from Explorer with the records shown there), else the query of the
 *        crosstab; parameters get the values of the page URL (`v.<NAME>=`, a link from another page). Only records of the
 *        record type of the crosstab are counted (HCrosstab).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from '#shared/ui';
import { HeuristApiClient } from '#shared/api';
import { HDbDefs } from '#shared/data/HDbDefs.js';
import { normalizeDataSource } from '#shared/data/DataSource.js';
import { fieldCodeLabel } from '#shared/data/fieldPathCodes.js';
import { HCrosstab } from '#shared/widgets/crosstabs/HCrosstab.js';
import { CrosstabService } from '#shared/widgets/crosstabs/crosstabService.js';
import { cmsInstanceRecords } from '#shared/site/cmsRecords.js';
import { CMS_FILTER_LIMITS, normalizeCmsFilterValues } from '#shared/site/cmsSavedFilter.js';
import { ownQuery } from '#shared/data/presentationSource.js';

/** The definitions by database and language (labels of terms, record types and fields). */
const DEFINITIONS = new Map();

/**
 * Mount crosstabs.
 *
 * @param {HTMLElement} host Host of the instance.
 * @param {object} instance Instance configuration (`settings.preset`, `settings.from`, `settings.level`, `settings.query`).
 * @param {object} config The configuration block of the page.
 * @param {object} options
 * @param {string} options.id Instance id.
 * @param {(request: object, origin: string) => void} [options.sendRecords] Send a search on (PageSync.setRequest).
 * @returns {Promise<{widget: HCrosstab}|null>} null when the crosstab can not be read.
 */
export async function mountCrosstabs(host, instance, config, { id, sendRecords = null } = {}) {
  const runtime = config.runtime || {};
  const settings = instance.settings || {};
  host.classList.add('h-site-crosstabs');
  const apiBaseUrl = runtime.apiBaseUrl || `${String(runtime.baseUrl || '/').replace(/\/?$/, '/')}api`;
  const service = new CrosstabService({ apiBaseUrl, database: runtime.database || '' });
  const preset = await service.loadPreset(settings.preset).catch(() => null);
  if (!preset) {
    host.textContent = runtime.design ? $HR('Choose a crosstab in the configuration of this element') : '';
    return null;
  }
  const language = config.site?.language || runtime.language || '';
  const dbdefs = await definitions(apiBaseUrl, runtime.database, language);
  const container = document.createElement('div');
  container.className = 'h-site-crosstabs-root';
  host.replaceChildren(container);
  const { from } = cmsInstanceRecords(instance, config.instances || {});
  const widget = new HCrosstab().attach(container, {
    service,
    settings: preset.settings,
    level: settings.level || 'pivot',
    language,
    database: runtime.database || '',
    labels: {
      termLabel: (term) => dbdefs?.termLabel?.(term) || '',
      rectypeName: (type) => dbdefs?.rectypeName?.(type) || '',
      userGroupName: (group) => dbdefs?.userGroupName?.(group) || ''
    },
    fieldLabel: (code) => (/^\d+$/.test(String(code)) ? dbdefs?.fieldGlobal?.(Number(code))?.name : fieldCodeLabel(code, dbdefs)) || String(code),
    onCellQuery: sendRecords ? (query, title) => sendRecords({
      dataSource: normalizeDataSource({ reference: { type: 'query' }, title: title || preset.title, request: { q: query } }),
      values: {},
      missing: []
    }, `module:${id}`) : null,
    emptyText: runtime.design ? 'The crosstab counts the records of the page' : 'No records'
  }).render();
  // its own query first (with the values of the page URL); a search of the page replaces it (PageSync)
  const query = settings.query != null && settings.query !== '' ? settings.query : preset.query;
  if (from.includes('own') && query != null && query !== '') {
    const own = ownQuery(query, { values: urlValues(globalThis.location?.search || ''), filterForm: preset.settings.filterForm });
    if (own.missing.length) widget.clear(`${$HR('This crosstab needs a value of')} ${own.missing.join(', ')}`);
    else void widget.setQuery(own.q);
  }
  return { widget };
}

/**
 * The parameter values of a page URL (`v.<NAME>=`, as the Saved filter links of plan 27j), within the limits.
 *
 * @param {string} search `location.search`.
 * @returns {object} Values by parameter name.
 */
export function urlValues(search) {
  const raw = {};
  for (const [key, value] of new URLSearchParams(String(search || ''))) {
    if (!key.startsWith('v.')) continue;
    const name = key.slice(2);
    raw[name] = Object.hasOwn(raw, name) ? [raw[name]].flat().concat(value) : value;
  }
  const limited = Object.fromEntries(Object.entries(raw).slice(0, CMS_FILTER_LIMITS.values)
    .map(([name, value]) => [name, Array.isArray(value) ? value.slice(0, CMS_FILTER_LIMITS.items) : value]));
  return normalizeCmsFilterValues(limited).values;
}

/** The definitions of the database; null when they can not be read. */
function definitions(apiBaseUrl, database, language) {
  const key = `${database}|${language}`;
  if (!DEFINITIONS.has(key)) {
    const apiClient = new HeuristApiClient({ apiBaseUrl, database });
    DEFINITIONS.set(key, HDbDefs.load(apiClient.buildUrl('/def/snapshot'), { lang: language }).catch((error) => {
      console.warn('Crosstabs: the definitions can not be read', error);
      DEFINITIONS.delete(key);
      return null;
    }));
  }
  return DEFINITIONS.get(key);
}
