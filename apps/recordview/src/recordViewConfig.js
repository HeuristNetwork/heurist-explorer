/**
 * @file recordViewConfig.js
 * @brief Bootstrap normalization for heurist-recordview.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
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
import { normalizeRecordViewConfigurationSettings } from "./ui/config/recordViewConfigurationSchema.js";

/**
 * Build the normalized Record View configuration from the host bridge or standalone bootstrap.
 *
 * @returns {object} Normalized Record View configuration.
 */
export function getHeuristRecordViewConfig() {
  const bridge = getFrameHostBridge("heuristRecordviewHost");
  const bootstrap = resolveModuleBootstrap({
    bridge,
    standalone: getGlobalBootstrap("heuristModuleBootstrap"),
  });
  const runtime = bootstrap.runtime || {};
  const settings = bootstrap.settings || {};
  const persistedSettings = normalizeRecordViewConfigurationSettings(settings);
  // Embedded hosts supply `bootstrap.source` ({selection, recordId}); a
  // published view supplies the richer `bootstrap.state` snapshot
  // ({recordId, selectionMode}) and no `source` — let a publication's
  // `state` win, matching heurist-graph's own bootstrap merge.
  const source = { ...bootstrap.source, ...(bootstrap.state || {}) };
  const language = String(runtime.language || "eng").slice(0, 3).toLowerCase();
  const runtimeMode = String(runtime.runtimeMode || "standalone").toLowerCase();
  return {
    containerId: "heurist-recordview",
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
    selection: normalizeIds(source.selection),
    recordId: toPositiveInt(source.recordId),
    persistedSettings,
    options: persistedSettings.options,
    loadPreferencesOnInit:
      !hasPersistedSettings(settings) &&
      !["website", "publish", "published"].includes(runtimeMode),
  };
}

/** Whether the bootstrap settings envelope already carries persisted Record View settings. */
function hasPersistedSettings(settings) {
  return Boolean(settings?.format || settings?.options || settings?.config);
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

/** Normalize a value to a positive integer, or `null` when invalid. */
function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
