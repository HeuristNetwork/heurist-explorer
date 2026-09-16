/**
 * @file graphConfig.js
 * @brief Bootstrap normalization for heurist-graph.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import {
  getFrameHostBridge,
  getGlobalBootstrap,
} from "#shared/host";
import { resolveModuleBootstrap } from "#shared/config";
import { normalizeGraphConfigurationSettings } from "./ui/config/graphConfigurationSchema.js";

/**
 * Build the normalized Graph configuration from the host bridge or standalone bootstrap.
 *
 * @returns {object} Normalized Graph configuration.
 */
export function getHeuristGraphConfig() {
  const bridge = getFrameHostBridge("heuristGraphHost");
  const bootstrap = resolveModuleBootstrap({
    bridge,
    standalone: getGlobalBootstrap("heuristModuleBootstrap"),
  });
  const runtime = bootstrap.runtime || {};
  const settings = bootstrap.settings || {};
  const hasPersistedSettings = Boolean(
    settings?.format || settings?.options || settings?.config,
  );
  const persistedSettings = normalizeGraphConfigurationSettings(settings);
  // Embedded hosts supply `bootstrap.source` ({ query, selection }); publications
  // supply the richer `bootstrap.state` snapshot (query/querySourceId/expansions/
  // hidden) and no `source`. `normalizeModuleBootstrap` always materializes
  // `source` as an object, so it can never be used to fall back to `state` -
  // merge them, letting a publication's `state` win.
  const source = { ...bootstrap.source, ...(bootstrap.state || {}) };
  const language = String(runtime.language || "eng").slice(0, 3).toLowerCase();
  const runtimeMode = String(runtime.runtimeMode || "standalone").toLowerCase();
  return {
    containerId: "heurist-graph",
    runtimeMode,
    database: runtime.database || null,
    apiBaseUrl: runtime.apiBaseUrl || null,
    accessToken: runtime.accessToken || null,
    requestHeaders: runtime.requestHeaders || {},
    language: /^[a-z]{3}$/.test(language) ? language : "eng",
    localeBaseUrl: runtime.localeBaseUrl || runtime.moduleBaseUrl || null,
    host: runtime.baseUrl
      ? {
          type: "heurist",
          baseUrl: runtime.baseUrl,
          database: runtime.database || null,
          bridge,
        }
      : null,
    searchRealm: runtime.searchRealm ?? runtime.search_realm ?? null,
    sourceId: runtime.source ?? runtime.sourceId ?? null,
    query: source.query ?? null,
    querySourceId: toPositiveInt(source.querySourceId),
    querySourceTitle: source.querySourceTitle ?? null,
    // Published views carry their effective expansion rules under
    // `state.expansions.rules`; fall back to legacy `settings.rules`/`source.rules`.
    rules: settings.rules ?? source.expansions?.rules ?? source.rules ?? [],
    initialExpansions: source.expansions ?? null,
    initialHidden: source.hidden ?? null,
    links: normalizeLinks(settings.links ?? source.links),
    fields: normalizeFields(settings.fields ?? source.fields),
    limits: normalizeLimits({
      ...settings.limits,
      maxNodes: persistedSettings.config.defaults.maxNodes,
      maxEdges: persistedSettings.config.defaults.maxEdges,
    }),
    selection: normalizeIds(source.selection),
    engine: settings.engine || "vis-network",
    engineOptions: {
      ...settings.engineOptions,
      gravity: persistedSettings.config.defaults.gravity,
      layoutMode: persistedSettings.config.defaults.layoutMode,
      movement: persistedSettings.config.defaults.movement,
      scaling: persistedSettings.config.defaults.scaling,
      showNodeLabels: persistedSettings.config.defaults.showNodeLabels,
      showEdgeLabels: persistedSettings.config.defaults.showEdgeLabels,
      labelMaxLength: persistedSettings.config.defaults.labelLength,
      popupDelay: persistedSettings.config.defaults.popupDelay,
      popupTemplate: persistedSettings.config.defaults.popupTemplate,
      selectionEnabled: persistedSettings.options.interaction.selectionEnabled,
      popupEnabled: persistedSettings.options.interaction.popupEnabled,
      nativeControls: persistedSettings.options.nativeControls,
    },
    persistedSettings,
    ui: persistedSettings.options.ui,
    loadPreferencesOnInit:
      !hasPersistedSettings &&
      !["website", "publish", "published"].includes(runtimeMode),
  };
}

/** Normalize a links selection to `'all'` or an array of compact link specs. */
function normalizeLinks(value) {
  if (value == null || value === "") return "all";
  const values = Array.isArray(value) ? value : String(value).split(",");
  const specs = [
    ...new Set(values.map((spec) => String(spec).trim()).filter(Boolean)),
  ];
  if (!specs.length || specs.some((spec) => spec.toLowerCase() === "all"))
    return "all";
  return specs;
}

/** Normalize a field list, defaulting to title and record type. */
function normalizeFields(value) {
  if (value == null || value === "") return ["rec_Title", "rec_RecTypeID"];
  const values = Array.isArray(value) ? value : String(value).split(",");
  return [
    ...new Set(values.map((field) => String(field).trim()).filter(Boolean)),
  ];
}

/** Normalize a value into a de-duplicated array of positive integer IDs. */
function normalizeIds(value) {
  const values = Array.isArray(value) ? value : [];
  return [
    ...new Set(
      values.map(Number).filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

/** Normalize the graph's node/edge/depth budget, applying defaults for missing or invalid values. */
function normalizeLimits(value = {}) {
  return {
    maxNodes: positiveLimit(value.maxNodes, 5000),
    maxEdges: positiveLimit(value.maxEdges, 10000),
    maxDepth: positiveLimit(value.maxDepth, 5),
  };
}

/** Normalize a value to a positive integer, or a fallback when invalid. */
function positiveLimit(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

/** Normalize a value to a positive integer, or `null` when invalid. */
function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
