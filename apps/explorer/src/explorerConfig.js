/**
 * @file explorerConfig.js
 * @brief Reads and normalizes the Explorer application's bootstrap configuration.
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

import { getFrameHostBridge, getGlobalBootstrap } from '#shared/host';
import { resolveModuleBootstrap } from '#shared/config';
import { ExplorerUiConfig, resolveUiLanguage } from './core/ExplorerUiConfig.js';

/**
 * Build the normalized Explorer configuration from the host bridge or standalone bootstrap.
 *
 * @returns {object} Normalized Explorer configuration, including module modes/URLs and host bridge.
 */
export function getHeuristExplorerConfig() {
  const bridge = getFrameHostBridge('heuristExplorerHost');
  const standalone = getGlobalBootstrap('heuristModuleBootstrap');
  const bootstrap = resolveModuleBootstrap({
    bridge,
    // a page opened by a link (editor mode): the bootstrap from its URL (plan 21 §2.4)
    standalone: bridge || Object.keys(standalone).length ? standalone : urlBootstrap(globalThis.location)
  });
  return createHeuristExplorerConfig(bootstrap, { bridge });
}

/**
 * Explorer configuration from a given bootstrap: the page's own (getHeuristExplorerConfig)
 * or one passed by a host that mounts Explorer directly (direct.js, website pages).
 *
 * @param {object} bootstrap Normalized { runtime, settings, state } envelope.
 * @param {object} [options]
 * @param {object|null} [options.bridge] Host bridge, when there is one.
 * @param {string} [options.containerId] Id of the element Explorer renders into.
 * @returns {object} Normalized Explorer configuration.
 */
export function createHeuristExplorerConfig(bootstrap, { bridge = null, containerId = 'heurist-explorer' } = {}) {
  const runtime = bootstrap.runtime || {};
  const settings = bootstrap.settings || {};
  const state = bootstrap.state || {};
  const mode = runtime.runtimeMode === 'editor' ? 'editor' : 'main';
  const baseUrl = ensureSlash(runtime.baseUrl || '');
  const hostLanguage = normalizeLanguage(runtime.language);
  const published = ['published', 'website'].includes(String(runtime.runtimeMode || '').toLowerCase());
  // the interface language chosen in Explorer configuration wins over the host's;
  // Explorer passes it on to every module (runtime.language). A published Explorer
  // has the configuration of its page (plan 27b), never the visitor's browser one.
  const uiConfig = (published && isPlainObject(settings.ui)
    ? ExplorerUiConfig.fromValue(runtime.database, settings.ui)
    : new ExplorerUiConfig({ database: runtime.database })).load();

  return {
    containerId,
    // 'editor': the record editor alone in the page (plan 21 §2.4), see editor/RecordEditorShell.js
    mode,
    // Explorer on a website page or a publication (plan 27a): no welcome popup, no last query
    published,
    editor: mode === 'editor' ? editorTarget(state) : null,
    // open the CMS designer on this website / page at start (plan 27c §6)
    cms: Number(state?.cms?.site) > 0 ? { site: Number(state.cms.site), page: Number(state.cms.page) || 0 } : null,
    database: runtime.database || null,
    apiBaseUrl: runtime.apiBaseUrl || (baseUrl ? `${baseUrl}api` : null),
    baseUrl: baseUrl || null,
    accessToken: runtime.accessToken || null,
    requestHeaders: runtime.requestHeaders || {},
    language: resolveUiLanguage(uiConfig, hostLanguage),
    hostLanguage,
    // limits of the built-in record view (plan 23 §3.1), passed on to every module
    recordLimits: uiConfig.recordLimits,
    hostBridge: bridge || null,
    moduleModes: {
      data: normalizeMode(runtime.moduleModes?.data, 'direct'),
      map: normalizeMode(runtime.moduleModes?.map),
      timeline: normalizeMode(runtime.moduleModes?.timeline),
      graph: normalizeMode(runtime.moduleModes?.graph),
      recordview: normalizeMode(runtime.moduleModes?.recordview, 'direct')
    },
    moduleUrls: {
      data: runtime.moduleUrls?.data || (baseUrl ? `${baseUrl}hclient/modules/data/dataViewer.html` : null),
      map: runtime.moduleUrls?.map || (baseUrl ? `${baseUrl}hclient/modules/map/mapViewer.html` : null),
      timeline: runtime.moduleUrls?.timeline || (baseUrl ? `${baseUrl}hclient/modules/timeline/timelineViewer.html` : null),
      graph: runtime.moduleUrls?.graph || (baseUrl ? `${baseUrl}hclient/modules/graph/graphViewer.html` : null),
      recordview: runtime.moduleUrls?.recordview || (baseUrl ? `${baseUrl}hclient/modules/recordview/recordviewViewer.html` : null)
    },
    moduleAssetUrls: {
      data: runtime.moduleAssetUrls?.data || (baseUrl ? `${baseUrl}hclient/bundles/heurist-data` : null),
      recordview: runtime.moduleAssetUrls?.recordview || (baseUrl ? `${baseUrl}hclient/bundles/heurist-recordview` : null),
      reports: runtime.moduleAssetUrls?.reports || (baseUrl ? `${baseUrl}hclient/bundles/heurist-reports` : null),
      website: runtime.moduleAssetUrls?.website || (baseUrl ? `${baseUrl}hclient/bundles/heurist-website` : null)
    },
    settings,
    state
  };
}

/**
 * Record of the editor mode from the bootstrap state: `{recordId}` (edit) or
 * `{rectypeId, access}` (new record).
 *
 * @param {object} state Bootstrap state.
 * @returns {{recordId: number, rectypeId: number|string|null, access: object|null}}
 */
export function editorTarget(state = {}) {
  const recordId = Number(state?.recordId) || 0;
  const rectypeId = recordId > 0 ? null : (state?.rectypeId ?? null);
  return { recordId, rectypeId, access: recordId > 0 ? null : state?.access || null };
}

/**
 * Bootstrap of a page opened by a link without a host bootstrap or bridge:
 * `explorerViewer.html?db=NAME&mode=editor&recID=151` (or `&rty=12`), or the CMS designer of a website
 * `explorerViewer.html?db=NAME&mode=cms&site=12[&page=34]` (a design page opened outside the designer,
 * plan 27c §6). The Heurist root is three levels above `hclient/modules/explorer/`. Other URLs give nothing.
 *
 * @param {Location|URL|null} location Page location.
 * @returns {object} Bootstrap envelope, or `{}`.
 */
export function urlBootstrap(location) {
  if (!location?.search) return {};
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode');
  if (!['editor', 'cms'].includes(mode) || !params.get('db')) return {};
  const baseUrl = new URL('../../../', location.href).href;
  if (mode === 'cms') {
    return {
      runtime: { runtimeMode: 'main', database: params.get('db'), baseUrl, apiBaseUrl: `${baseUrl}api`, language: params.get('lang') || 'eng' },
      state: { cms: { site: Number(params.get('site')) || 0, page: Number(params.get('page')) || 0 } }
    };
  }
  const recordId = Number(params.get('recID') || params.get('recordId')) || 0;
  const rectypeId = params.get('rty') || params.get('rectypeId') || null;
  return {
    runtime: {
      runtimeMode: 'editor',
      database: params.get('db'),
      baseUrl,
      apiBaseUrl: `${baseUrl}api`,
      language: params.get('lang') || 'eng'
    },
    state: recordId > 0 ? { recordId } : { rectypeId }
  };
}

/** Normalize a module mode to `'direct'` or `'iframe'` (the default). */
function normalizeMode(value, fallback = 'iframe') {
  return String(value || fallback).toLowerCase() === 'direct' ? 'direct' : 'iframe';
}

/** Ensure a URL-like string ends in exactly one trailing slash, or return `''`. */
function ensureSlash(value) {
  const text = String(value || '').trim();
  return text ? text.replace(/\/?$/, '/') : '';
}

/** Whether a value is a plain (non-array) object. */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Normalize a language value to a supported three-letter code, defaulting to English. */
function normalizeLanguage(value) {
  const text = String(value || 'eng').toLowerCase().slice(0, 3);
  return /^[a-z]{3}$/.test(text) ? text : 'eng';
}
