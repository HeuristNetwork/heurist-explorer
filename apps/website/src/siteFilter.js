/**
 * @file siteFilter.js
 * @brief The Filter widget of a website page (plan 27l §3): HFilter over the PageSync of the page. A lazy chunk (the
 *        Filter Form and the definitions are loaded only on pages with a Filter widget).
 *
 * A chosen filter runs for the modules of the page that take their records from this widget (PageSync origin
 * `filter:<id>`, plan 27l §12); a parameterized one shows
 * its Filter Form first. At start: the Saved filter of the page URL (its item marked; missing values asked in the
 * Filter Form), else the active item when the page has no result yet. A Saved filter link to the same page marks the
 * item too (`requestchange`). Stop while the requests of the page run (the page RequestMonitor). The page URL is not
 * changed (plan 27l §1.2).
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
import { HeuristApiClient, createModuleRequestMonitor } from '#shared/api';
import { HDbDefs } from '#shared/data/HDbDefs.js';
import { HFilter } from '#shared/widgets/filter/HFilter.js';
import { LegacySavedFilterConverter } from '#shared/data/legacy/LegacySavedFilterConverter.js';
import { savedFilterDataSource, savedFilterRecord } from '#shared/data/savedFilters.js';
import {
  cmsFilterItemKey, cmsFilterWidgetSettings, filterItemCaptions, querySourceNames, resolveCmsFilterItem
} from '#shared/site/cmsFilterWidget.js';
import { cmsFilterDataSourceRequest, cmsFilterFormValues } from '#shared/site/cmsSavedFilter.js';

/** The definitions by database and language: read once for the widgets and saved filters of the page. */
const DEFINITIONS = new Map();

/**
 * The definitions of the database (the Filter Form, the conversion of a legacy faceted search); null when they can not be
 * read.
 *
 * @param {object} runtime `apiBaseUrl` / `baseUrl`, `database`, `language`.
 * @param {string} [language]
 * @returns {Promise<object|null>}
 */
function pageDefinitions(runtime, language) {
  const apiClient = new HeuristApiClient({ apiBaseUrl: apiBaseUrl(runtime), database: runtime.database });
  const key = `${runtime.database}|${language}`;
  if (!DEFINITIONS.has(key)) {
    DEFINITIONS.set(key, HDbDefs.load(apiClient.buildUrl('/def/snapshot'), { lang: language }).catch((error) => {
      console.warn('The definitions can not be read', error);
      DEFINITIONS.delete(key);
      return null;
    }));
  }
  return DEFINITIONS.get(key);
}

/** The API base URL of the page. */
function apiBaseUrl(runtime) {
  return runtime.apiBaseUrl || `${String(runtime.baseUrl || '/').replace(/\/?$/, '/')}api`;
}

/**
 * The request of a saved filter of the page URL (`?filter=<id>`, plan 27l §7.2): its DataSource (legacy kinds
 * converted) with the given values filled in; null when it has no query.
 *
 * @param {object} payload The answer of `GET /sys/filter/{id}`.
 * @param {object} values The values of the URL.
 * @param {object} runtime The runtime of the page.
 * @returns {Promise<{dataSource: object, raw: object, values: object, missing: string[]}|null>}
 */
export async function savedFilterRequest(payload, values, runtime = {}) {
  const legacyConverter = new LegacySavedFilterConverter({ getDbDefs: () => pageDefinitions(runtime, runtime.language || 'eng') });
  const dataSource = await savedFilterDataSource(savedFilterRecord(payload?.record ?? payload), { legacyConverter, origin: 'saved-filter' });
  return dataSource ? cmsFilterDataSourceRequest(dataSource, values) : null;
}

/**
 * Mount the Filter widget.
 *
 * @param {HTMLElement} host
 * @param {object} instance Its configuration.
 * @param {object} config The configuration block of the page.
 * @param {object} options
 * @param {string} options.id Instance id (the origin of its results).
 * @param {import('./PageSync.js').PageSync|null} options.sync The PageSync of the page (also in the preview of the
 *        designer, review 2026-11-16 §11.5).
 * @param {(runtime: object, search: string) => Promise<object|null>} options.pageRequest The Saved filter of a URL
 *        (pageFilterRequest of siteRuntime.js).
 * @returns {Promise<HFilter|null>}
 */
export async function mountPageFilter(host, instance, config, { id, sync, pageRequest }) {
  const runtime = config?.runtime || {};
  const settings = cmsFilterWidgetSettings(instance.settings);
  host.classList.add('h-site-filter');
  if (!settings.items.length) {
    // a new widget in the designer: what it needs
    host.textContent = runtime.design ? $HR('Filter: choose its filters (gear of the element)') : '';
    return null;
  }
  const apiClient = new HeuristApiClient({
    apiBaseUrl: apiBaseUrl(runtime),
    database: runtime.database,
    // its requests report to the page too (Stop)
    requestMonitor: sync ? createModuleRequestMonitor(sync.bridge(), 'filter') : null
  });
  const loadDbDefs = () => pageDefinitions(runtime, runtime.language || config.site?.language || 'eng');
  const legacyConverter = new LegacySavedFilterConverter({ getDbDefs: loadDbDefs });
  // the Filter Form needs the definitions (field names, value lists): read before the list is shown
  const definitions = await loadDbDefs();
  // the captions as in the published Explorer: a query source its name (DT_NAME) in the language of the page
  const language = runtime.language || config.site?.language || 'eng';
  const names = await querySourceNames(apiClient, settings.items.filter((item) => item.kind === 'source').map((item) => item.id),
    Number(definitions?.dbconst?.('DT_NAME')) || 0).catch((error) => {
    console.warn('Filter: the names of the query sources can not be read', error);
    return new Map();
  });
  const filter = new HFilter().attach(host, {
    items: filterItemCaptions(settings.items, (id) => names.get(id), language),
    mode: settings.mode,
    dbdefs: definitions,
    apiClient,
    resolve: (item) => resolveCmsFilterItem(item, { apiClient, legacyConverter }),
    // its searches go to the modules that take their records from this widget (plan 27l §12)
    onRun: (dataSource) => (sync ? sync.setRequest({ dataSource, values: {}, missing: [] }, { origin: `filter:${id}` }) : undefined),
    onError: (error) => console.warn('Filter', error?.message || error),
    requestMonitor: sync?.monitor || null
  }).render();
  if (!sync) return filter;
  const showRequest = (request) => {
    const key = filterKey(request?.dataSource);
    if (request?.missing?.length) void filter.showSource(request.raw, cmsFilterFormValues(request.values || {}), { key });
    else filter.mark(key);
  };
  // a Saved filter link of the page: its item marked
  const onRequest = (event) => {
    if (event.detail?.origin === 'links') showRequest(event.detail?.request);
  };
  sync.addEventListener('requestchange', onRequest);
  const destroy = filter.destroy.bind(filter);
  filter.destroy = async () => {
    sync.removeEventListener('requestchange', onRequest);
    await destroy();
  };
  // start: the Saved filter of the URL, else the active item (when the page has no result yet)
  const asked = await pageRequest(runtime, runtime.filterSearch ?? globalThis.location?.search ?? '');
  if (asked) showRequest(asked);
  else if (settings.active && !sync.request) void filter.select(settings.active);
  return filter;
}

/** The item key of a DataSource (`source:12`, `filter:34`), or null. */
function filterKey(dataSource) {
  const reference = dataSource?.reference;
  return reference?.id && ['source', 'filter'].includes(reference.type) ? cmsFilterItemKey(reference.type, reference.id) : null;
}
