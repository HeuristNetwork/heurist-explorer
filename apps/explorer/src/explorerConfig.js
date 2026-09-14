import { getFrameHostBridge, getGlobalBootstrap } from '#shared/host';
import { resolveModuleBootstrap } from '#shared/config';

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
    moduleUrls: {
      data: runtime.moduleUrls?.data || (baseUrl ? `${baseUrl}hclient/modules/data/dataViewer.html` : null),
      map: runtime.moduleUrls?.map || (baseUrl ? `${baseUrl}hclient/modules/map/mapViewer.html` : null),
      timeline: runtime.moduleUrls?.timeline || (baseUrl ? `${baseUrl}hclient/modules/timeline/timelineViewer.html` : null),
      graph: runtime.moduleUrls?.graph || (baseUrl ? `${baseUrl}hclient/modules/graph/graphViewer.html` : null)
    },
    settings,
    state
  };
}

function ensureSlash(value) {
  const text = String(value || '').trim();
  return text ? text.replace(/\/?$/, '/') : '';
}

function normalizeLanguage(value) {
  const text = String(value || 'eng').toLowerCase().slice(0, 3);
  return /^[a-z]{3}$/.test(text) ? text : 'eng';
}
