/**
 * @file timelineConfig.js
 * @brief Builds and normalizes the runtime configuration for the Heurist timeline module.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { getFrameHostBridge, getGlobalBootstrap } from "#shared/host";
import { resolveModuleBootstrap } from "#shared/config";

/**
 * Creates the normalized configuration object used by the timeline runtime.
 *
 * @returns {object} The ready-to-use timeline configuration.
 */
export function getHeuristTimelineConfig() {
  const bridge = getFrameHostBridge("heuristTimelineHost");
  const bootstrap = resolveModuleBootstrap({
    bridge,
    standalone: getGlobalBootstrap("heuristModuleBootstrap"),
  });

  const runtime = bootstrap.runtime || {};
  const rawSettings = bootstrap.settings || {};
  const settings = normalizeSettings(rawSettings.options?.timeline || rawSettings);
  const source = bootstrap.source ?? bootstrap.state ?? {};
  const contexts = normalizeContexts(source.contexts);

  if (!contexts.length && source.query) {
    contexts.push({
      id: "current",
      title: "Current result",
      query: source.query,
      timefields: source.timefields || null,
      fields: source.fields || [],
    });
  }

  return {
    containerId: "heurist-timeline",
    runtimeMode: runtime.runtimeMode || "standalone",
    language: String(runtime.language || "eng").toLowerCase().slice(0, 3),
    database: runtime.database || null,
    baseUrl: runtime.baseUrl || null,
    apiBaseUrl: runtime.apiBaseUrl || null,
    accessToken: runtime.accessToken || null,
    requestHeaders: runtime.requestHeaders || {},
    searchRealm: runtime.searchRealm ?? runtime.search_realm ?? null,
    sourceId: runtime.source ?? runtime.sourceId ?? null,
    host: runtime.baseUrl
      ? {
          type: "heurist",
          baseUrl: runtime.baseUrl,
          database: runtime.database,
          bridge,
        }
      : null,
    settings,
    explorerHost: bridge?.getHostContext?.()?.name === 'heurist-explorer',
    initialState: bootstrap.state?.moduleState || bootstrap.state || null,
    documents: {
      query: rawSettings.options?.mapDocuments?.allowed ?? null,
      initiallyActive: rawSettings.options?.mapDocuments?.initiallyActive ?? 'dynamic'
    },
    ui: { showSourceHeader: false, initiallyExpanded: true, ...(rawSettings.options?.ui || rawSettings.ui || {}) },
    source: {
      contexts,
      selection: normalizeIds(source.selection),
    },
  };
}

/**
 * Normalizes and validates the UI settings object.
 *
 * @param {object} value - Raw settings from the host bootstrap.
 * @returns {object} Sanitized settings.
 */
function normalizeSettings(value) {
  return {
    stack: value.stack !== false,
    orientation: value.orientation || "both",
    labelMode: ["full", "truncate", "hidden"].includes(value.labelMode)
      ? value.labelMode
      : "full",
    labelPosition: value.labelPosition === "above" ? "above" : "bar",
    showToolbar: value.showToolbar !== false,
    zoomMax: Number(value.zoomMax) || 31536000000 * 500000,
  };
}

/**
 * Normalizes context descriptors into the internal timeline format.
 *
 * @param {Array|undefined} value - Raw context definitions.
 * @returns {Array<object>} Sanitized context list.
 */
function normalizeContexts(value) {
  return (Array.isArray(value) ? value : [])
    .map((context, index) => ({
      id: String(context?.id ?? `context-${index + 1}`),
      title: String(context?.title || `Band ${index + 1}`),
      query: context?.query ?? null,
      ids: Array.isArray(context?.ids) ? normalizeIds(context.ids) : null,
      timefields: context?.timefields ?? null,
      fields: Array.isArray(context?.fields) ? context.fields : [],
      visible: context?.visible !== false,
      options: { ...(context?.options || {}) },
    }))
    .filter((context) => context.query || context.ids?.length);
}

/**
 * Converts any incoming record ID collection into positive integer IDs.
 *
 * @param {Array|undefined} value - Raw record identifiers.
 * @returns {Array<number>} Unique normalized IDs.
 */
function normalizeIds(value) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}
