/**
 * @file dataConfig.js
 * @brief Runtime configuration normalization for heurist-data.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
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
import { normalizeDataConfigurationSettings } from "./ui/config/dataConfigurationSchema.js";

/**
 * Build the normalized Data configuration from the host bridge or standalone bootstrap.
 *
 * @returns {object} Normalized Data configuration; see `createHeuristDataConfig`.
 */
export function getHeuristDataConfig() {
  const bridge = getFrameHostBridge("heuristDataHost");
  const resolvedConfig = resolveModuleBootstrap({
    bridge,
    standalone: getGlobalBootstrap("heuristModuleBootstrap"),
  });
  return createHeuristDataConfig(resolvedConfig, { bridge });
}

/** Normalize an explicit bootstrap envelope for same-realm/direct hosting. */
export function createHeuristDataConfig(
  resolvedConfig = {},
  { bridge = null, containerId = "heurist-data" } = {},
) {
  const runtime = resolvedConfig.runtime || {};
  const settings = resolvedConfig.settings || {};
  const hasPersistedSettings = Boolean(
    settings?.format || settings?.options || settings?.config,
  );
  const persistedSettings = normalizeDataConfigurationSettings(settings);
  if (String(runtime.runtimeMode || "").toLowerCase() === "main") {
    // The module hosted in the main Heurist editor uses a fixed interface:
    // header always shown; no Filtered Result / Query Sources / Filters panels.
    Object.assign(persistedSettings.options.ui, {
      showSourceHeader: true,
      showCurrentResults: false,
      showFilters: false,
      showQuerySources: false,
    });
    // Main UI starts without a second client-side search layer unless the
    // setting was explicitly persisted by the user.
    if (settings?.options?.nativeControls?.search == null) {
      persistedSettings.options.nativeControls.search = false;
    }
  }
  const configuredLanguage = persistedSettings.options.ui.language;
  const language = normalizeLanguage(
    runtime.language ||
      (configuredLanguage !== "auto" ? configuredLanguage : null),
  );
  // Publications store the module snapshot under the shared `state` member;
  // Retain `source` for embedded host configurations created before publication.
  const source = resolvedConfig.source ?? resolvedConfig.state ?? {};
  const runtimeQuerySourceId = positiveId(source.querySourceId);
  const runtimeQuery =
    source.query == null || source.query === "" ? null : source.query;
  const configuredQuerySourceId =
    persistedSettings.options.querySources.initiallyActive;
  const initialQuerySourceId =
    runtimeQuerySourceId || (runtimeQuery == null ? configuredQuerySourceId : null);
  const initialQuery =
    runtimeQuery ??
    (initialQuerySourceId == null
      ? persistedSettings.config.currentResults.initialQuery
      : null);
  const readonly =
    runtime.readonly === true ||
    persistedSettings.options.interaction.readonly === true;
  const interaction = {
    ...persistedSettings.options.interaction,
    ...(readonly ? { editEnabled: false } : {}),
  };
  return {
    containerId,
    viewerMode:
      runtime.viewerMode === "configuration" ? "configuration" : "data",
    runtimeMode: runtime.runtimeMode || "standalone",
    readonly,
    language,
    searchRealm: runtime.searchRealm ?? runtime.search_realm ?? null,
    sourceId: runtime.source ?? runtime.sourceId ?? null,
    localeBaseUrl: runtime.localeBaseUrl || runtime.moduleBaseUrl || null,
    database: runtime.database || null,
    apiBaseUrl: runtime.apiBaseUrl || null,
    accessToken: runtime.accessToken || null,
    requestHeaders: runtime.requestHeaders || {},
    // View mode is the sole engine selector: Table => DataTables; all other
    // modes => HRecordList. Do not re-introduce the legacy top-level engine.
    engine:
      persistedSettings.config.defaults.viewMode === "datatable"
        ? "datatables"
        : "recordlist",
    engineOptions: {
      baseUrl: runtime.baseUrl || null,
      database: runtime.database || null,
      pageLength: persistedSettings.config.defaults.pageSize,
      ...persistedSettings.config.defaults,
      viewMode:
        source.viewMode ||
        settings.viewMode ||
        persistedSettings.config.defaults.viewMode,
      initialOffset: Math.max(0, Number(source.pagination?.offset) || 0),
      controls: persistedSettings.options.nativeControls,
      interaction,
      // Let the record-list widget offer the engine-switching "Table" option.
      engineSwitch: true,
      showColumnPicker: persistedSettings.options.ui.showColumnPicker,
    },
    persistedSettings,
    loadPreferencesOnInit:
      !hasPersistedSettings &&
      !["website", "publish", "published"].includes(
        String(runtime.runtimeMode || "").toLowerCase(),
      ),
    ui: persistedSettings.options.ui,
    source: {
      querySourceId: initialQuerySourceId,
      query: initialQuery,
      title: source.title == null ? null : String(source.title),
      dataSource: cloneValue(source.dataSource),
      fields: Array.isArray(source.fields) ? source.fields : [],
      selection: normalizeIds(source.selection),
      pagination: normalizePagination(source.pagination),
    },
    host: runtime.baseUrl
      ? {
          type: "heurist",
          baseUrl: runtime.baseUrl,
          database: runtime.database,
          bridge,
        }
      : null,
  };
}

/** Deep-clone a JSON-safe object value, returning `null` for non-objects. */
function cloneValue(value) {
  if (!value || typeof value !== "object") return null;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/** Normalize a value to a positive integer id, or `null` when invalid. */
function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Normalize a value into an array of positive integer IDs. */
function normalizeIds(value) {
  return (Array.isArray(value) ? value : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}

/** Normalize a language value to a supported three-letter code, defaulting to English. */
function normalizeLanguage(value) {
  const language = String(value || "eng")
    .trim()
    .toLowerCase()
    .slice(0, 3);
  return /^[a-z]{3}$/.test(language) && language !== "aut" ? language : "eng";
}

/** Normalize a pagination value to `{offset, limit}`, or `null` when both are zero. */
function normalizePagination(value) {
  const offset = Math.max(0, Number(value?.offset) || 0);
  const limit = Math.max(0, Number(value?.limit) || 0);
  return offset || limit ? { offset, limit } : null;
}
