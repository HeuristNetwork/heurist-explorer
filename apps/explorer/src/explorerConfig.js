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

/**
 * Build the normalized Explorer configuration from the host bridge or standalone bootstrap.
 *
 * @returns {object} Normalized Explorer configuration, including module modes/URLs and host bridge.
 */
export function getHeuristExplorerConfig() {
  const bridge = getFrameHostBridge('heuristExplorerHost');
  const bootstrap = resolveModuleBootstrap({
    bridge,
    standalone: getGlobalBootstrap('heuristModuleBootstrap')
  });
  const runtime = bootstrap.runtime || {};
  const settings = bootstrap.settings || {};
  const state = bootstrap.state || {};
  const baseUrl = ensureSlash(runtime.baseUrl || '');

  return {
    containerId: 'heurist-explorer',
    database: runtime.database || null,
    apiBaseUrl: runtime.apiBaseUrl || (baseUrl ? `${baseUrl}api` : null),
    baseUrl: baseUrl || null,
    accessToken: runtime.accessToken || null,
    requestHeaders: runtime.requestHeaders || {},
    language: normalizeLanguage(runtime.language),
    hostBridge: bridge || null,
    moduleModes: {
      data: normalizeMode(runtime.moduleModes?.data, 'direct'),
      map: normalizeMode(runtime.moduleModes?.map),
      timeline: normalizeMode(runtime.moduleModes?.timeline),
      graph: normalizeMode(runtime.moduleModes?.graph)
    },
    moduleUrls: {
      data: runtime.moduleUrls?.data || (baseUrl ? `${baseUrl}hclient/modules/data/dataViewer.html` : null),
      map: runtime.moduleUrls?.map || (baseUrl ? `${baseUrl}hclient/modules/map/mapViewer.html` : null),
      timeline: runtime.moduleUrls?.timeline || (baseUrl ? `${baseUrl}hclient/modules/timeline/timelineViewer.html` : null),
      graph: runtime.moduleUrls?.graph || (baseUrl ? `${baseUrl}hclient/modules/graph/graphViewer.html` : null)
    },
    moduleAssetUrls: {
      data: runtime.moduleAssetUrls?.data || (baseUrl ? `${baseUrl}hclient/bundles/heurist-data` : null)
    },
    settings,
    state
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

/** Normalize a language value to a supported three-letter code, defaulting to English. */
function normalizeLanguage(value) {
  const text = String(value || 'eng').toLowerCase().slice(0, 3);
  return /^[a-z]{3}$/.test(text) ? text : 'eng';
}
