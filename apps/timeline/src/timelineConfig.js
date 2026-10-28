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
import { normalizeTimelineConfigurationSettings } from "./ui/config/timelineConfigurationSchema.js";

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
  return createHeuristTimelineConfig(bootstrap, { bridge });
}

/**
 * Timeline configuration from a given bootstrap: the page's own (getHeuristTimelineConfig)
 * or one passed by a host that mounts the timeline directly (direct.js, website pages).
 *
 * @param {object} bootstrap Normalized { runtime, settings, state } envelope.
 * @param {object} [options]
 * @param {object|null} [options.bridge] Host bridge, when there is one.
 * @param {string} [options.containerId] Id of the element the timeline renders into.
 * @returns {object} The ready-to-use timeline configuration.
 */
export function createHeuristTimelineConfig(bootstrap, { bridge = null, containerId = "heurist-timeline" } = {}) {
  const runtime = bootstrap.runtime || {};
  const rawSettings = bootstrap.settings || {};
  // the persisted settings envelope (plan 29): options.ui, options.timeline, options.mapDocuments
  const normalized = normalizeTimelineConfigurationSettings(rawSettings);
  const settings = normalized.options.timeline;
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
    containerId,
    runtimeMode: runtime.runtimeMode || "standalone",
    // configuration-only start (plan 29 §12)
    viewerMode: runtime.viewerMode === "configuration" ? "configuration" : "timeline",
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
    interaction: normalized.options.interaction,
    documents: {
      query: normalized.options.mapDocuments.allowed,
      initiallyActive: normalized.options.mapDocuments.initiallyActive
    },
    // heurist-explorer's "Interface for dummies": the control panel starts collapsed (2026-10-14)
    simplified: runtime.simplifiedUI === true,
    ui: {
      ...normalized.options.ui,
      ...(runtime.simplifiedUI === true ? { initiallyExpanded: false } : {})
    },
    source: {
      contexts,
      selection: normalizeIds(source.selection),
    },
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
