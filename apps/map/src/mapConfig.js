/**
 * @file mapConfig.js
 * @brief Bootstrap configuration normalization.
 *
 * Consumes one bootstrap contract: { runtime, settings, state }.
 * Runtime transport/host values are deliberately separate from persisted map
 * settings. Basemap definitions and application mechanics are internal.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { normalizeMapDocument } from './core/MapDocument.js';
import { normalizeMapConfigurationSettings } from './ui/config/mapConfigurationSchema.js';
import { applySimplifiedMapSettings } from './ui/config/simplifiedMapSettings.js';
import { getDefaultBaseMaps } from './basemaps/defaultBasemaps.js';
import {
  getFrameHostBridge,
  getGlobalBootstrap
} from '#shared/host';
import { resolveModuleBootstrap } from '#shared/config';
import { normalizeRecordLimits } from '#shared/recordview/recordLimits.js';

/**
 * Return normalized application configuration from the single bootstrap object.
 * Missing settings are filled entirely from canonical configuration defaults.
 *
 * @returns {object} Normalized application configuration.
 */
export function getHeuristMapConfig() {
  const bridge = getFrameHostBridge('heuristMapHost');
  // Both mapViewer and standalone published pages provide the canonical
  // { runtime, settings, state } bootstrap contract.
  const bootstrap = resolveModuleBootstrap({
    bridge,
    standalone: getGlobalBootstrap('heuristModuleBootstrap')
  });
  return createHeuristMapConfig(bootstrap, { bridge });
}

/**
 * Normalized configuration from a given bootstrap: the page's own (getHeuristMapConfig)
 * or one passed by a host that mounts the map directly (direct.js, website pages).
 *
 * @param {object} bootstrap Normalized { runtime, settings, state } envelope.
 * @param {object} [options]
 * @param {object|null} [options.bridge] Host bridge, when there is one.
 * @param {string} [options.containerId] Id of the element the map renders into.
 * @returns {object} Normalized application configuration.
 */
export function createHeuristMapConfig(bootstrap, { bridge = null, containerId = 'heurist-map' } = {}) {
  const url = new URL(globalThis.location?.href || 'http://localhost/');
  const runtime = bootstrap.runtime && typeof bootstrap.runtime === 'object' ? bootstrap.runtime : {};
  const hostContext = typeof bridge?.getHostContext === 'function' ? bridge.getHostContext() : {};
  const explorerHost = hostContext?.name === 'heurist-explorer';
  const runtimeMode = String(runtime.runtimeMode || 'main').toLowerCase();
  // A host that already merged real settings into the bootstrap (mapViewer,
  // a website page, a published page) always sets at least one of these.
  // A host that supplies nothing (e.g. heurist-explorer's iframe bridge before
  // it started loading the user's own map preference) leaves this envelope
  // empty, which would otherwise silently boot the map from bare defaults.
  const hasPersistedSettings = Boolean(
    bootstrap.settings?.format || bootstrap.settings?.options || bootstrap.settings?.config
  );

  const config = {
    viewerMode: ['configuration', 'draw'].includes(runtime.viewerMode) ? runtime.viewerMode : 'map',
    configurationMode: runtime.configurationMode || 'website',

    // Application mechanics are internal constants rather than bootstrap options.
    containerId,
    engine: 'leaflet',
    hostContext,
    explorerHost,

    apiBaseUrl: runtime.apiBaseUrl || null,
    database: runtime.database || null,
    language: normalizeLanguage(runtime.language),
    // limits of the built-in record popup, from the Explorer configuration (plan 23 §3.1)
    recordLimits: normalizeRecordLimits(runtime.recordLimits),
    localeBaseUrl: runtime.localeBaseUrl || runtime.moduleBaseUrl || null,
    accessToken: runtime.accessToken || null,
    requestHeaders: runtime.requestHeaders || {},
    baseMapProviderOptions: runtime.baseMapProviderOptions || {},
    host: buildHostConfiguration(runtime, bridge),

    initialState: bootstrap.state ?? null,
    documentQuery: parseDocumentQuery(url.searchParams.get('doc')),

    // A website page or publication always embeds its own real settings (see
    // docs/configuration.md §9), so this can only ever be true for a live
    // "main" client session whose host left the bootstrap settings empty.
    // initHeuristMap() uses it to fetch the user's own `heurist-map`
    // preference once, before MapApplication is constructed, mirroring
    // heurist-graph/heurist-data's loadPreferencesOnInit self-heal.
    loadPreferencesOnInit: !hasPersistedSettings && !['website', 'standalone', 'published'].includes(runtimeMode),

    readonly: runtime.readonly === true,
    // heurist-explorer's "Interface for dummies": fixed settings (simplifiedMapSettings.js)
    simplified: runtime.simplifiedUI === true,

    // Internal mutable representation of the currently rendered MapDocument.
    // It is intentionally not part of heuristModuleBootstrap.
    mapDocument: normalizeMapDocument({})
  };

  return applyPersistedSettings(config, bootstrap.settings || {});
}

/**
 * Derive every config field that comes from the persisted settings envelope
 * and merge it onto a base config object. Used both for the initial
 * bootstrap-supplied settings and, when `loadPreferencesOnInit` is true, to
 * re-derive config from a freshly fetched `heurist-map` preference before
 * MapApplication is constructed.
 *
 * @param {object} config Base application configuration.
 * @param {object} rawSettings Raw (possibly enveloped) persisted settings.
 * @returns {object} `config` merged with fields derived from `rawSettings`.
 */
export function applyPersistedSettings(config, rawSettings) {
  const configuredDynamicTitle = rawSettings?.config?.dynamicDocument?.title;
  const settings = normalizeMapConfigurationSettings(rawSettings || {});
  if (!configuredDynamicTitle) {
    settings.config.dynamicDocument.title = config.explorerHost ? 'Workspace' : 'Filtered Result';
  }
  if (config.simplified === true) applySimplifiedMapSettings(settings);

  const configuredDefaultDocumentId = settings.options.mapDocuments.initiallyActive;
  const defaultDocumentId = configuredDefaultDocumentId == null ? 'dynamic' : configuredDefaultDocumentId;
  const preventContinuousWorldBasemap = settings.config.defaults.preventContinuousWorldBasemap;

  return {
    ...config,
    // no editing: the host's runtime flag, or editing switched off (plan 29)
    readonly: config.readonly === true || settings.options.interaction.editEnabled === false,

    persistedSettings: settings,

    // MapDocuments are controlled only by persisted settings. The optional
    // standalone ?doc= URL parameter remains a convenient explicit startup filter.
    documents: {
      query: settings.options.mapDocuments.allowed ?? config.documentQuery ?? null,
      initiallyActive: defaultDocumentId
    },

    defaults: settings.config.defaults,

    dynamicDocument: {
      enabled: settings.config.dynamicDocument.enabled,
      id: 'dynamic',
      title: String(configuredDynamicTitle || (config.explorerHost ? 'Workspace Map' : 'Filtered Result')),
      minZoom: settings.config.dynamicDocument.minZoom,
      maxZoom: settings.config.dynamicDocument.maxZoom,
      minimumZoomKm: settings.config.dynamicDocument.minimumZoomKm,
      maximumZoomKm: settings.config.dynamicDocument.maximumZoomKm,
      bounds: settings.config.dynamicDocument.bounds,
      dynamicRequests: settings.config.dynamicDocument.dynamicRequests === true,
      keepContent: true,
      layers: []
    },

    // Basemap definitions come from the built-in catalog; settings only filter
    // the catalog and select its initial item. Continuous-world behavior is a
    // global default even though it affects the map engine rather than layers.
    baseMaps: normalizeBaseMaps(settings.options.baseMaps, preventContinuousWorldBasemap),
    interaction: settings.options.interaction,
    nativeControls: settings.options.nativeControls,
    ui: {
      ...settings.options.ui,
      // Internal Map Control defaults that are not persisted configuration.
      // Panel max-height is driven by CSS (.heurist-module-control-panel in
      // document-controls.css), not set here, so a low-height viewport media
      // query can override it without fighting an inline style.
      baseMapsInitiallyExpanded: false
    }
  };
}

/**
 * Normalize a raw language code to a supported 3-letter lowercase code.
 *
 * @param {*} value Raw language value.
 * @returns {string} A 3-letter language code, defaulting to `'eng'`.
 */
function normalizeLanguage(value) {
  const language = String(value || 'eng').trim().toLowerCase().slice(0, 3);
  return /^[a-z]{3}$/.test(language) && language !== 'aut' ? language : 'eng';
}

/**
 * Build Heurist internal host persistence only when a Heurist base URL exists.
 *
 * @param {object} runtime Raw bootstrap runtime values.
 * @param {object|null} bridge Frame host bridge, when available.
 * @returns {object|null} Host configuration, or `null` when no Heurist base URL is configured.
 */
function buildHostConfiguration(runtime, bridge) {
  if (!runtime?.baseUrl) return null;
  return {
    type: 'heurist',
    baseUrl: runtime.baseUrl,
    database: runtime.database || null,
    bridge: bridge || null
  };
}

/**
 * Parse the standalone `?doc=` URL parameter into a MapDocument query.
 *
 * @param {string|null} value Raw `doc` query parameter value.
 * @returns {Array<number>|string|null} Parsed record ids, raw query text, or `null` when absent.
 */
function parseDocumentQuery(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  return /^\d+(?:,\d+)*$/.test(text) ? text.split(',').map(Number) : text;
}

/**
 * Resolve the configured base-map list from the built-in catalog and persisted settings.
 *
 * @param {object} [settings] Persisted base-map settings (`allowed`, `initial`).
 * @param {boolean} [preventContinuousWorldBasemap] Whether tile basemaps should disable world wrapping.
 * @returns {Array<object>} Resolved base-map list, with the initial selection moved to the front.
 */
function normalizeBaseMaps(settings = {}, preventContinuousWorldBasemap = false) {
  const defaults = getDefaultBaseMaps();
  const defaultById = new Map(defaults.map((item) => [String(item.id), item]));
  let result = defaults;
  if (Array.isArray(settings.allowed)) {
    // an id must be one name (a list joined into one text, 2026-10-28, is skipped); nothing usable: all
    const ids = settings.allowed.flat(Infinity).map((id) => String(id ?? '').trim())
      .filter((id) => id && !/[,\s]/.test(id));
    const allowed = ids.map((key) => defaultById.get(key) || { id: key, title: key, type: key === 'None' ? 'none' : 'tile', provider: key });
    if (allowed.length) result = allowed;
  }
  if (preventContinuousWorldBasemap) {
    result = result.map((item) => item.type === 'tile' ? { ...item, noWrap: true } : item);
  }
  if (settings.initial != null) {
    const index = result.findIndex((item) => String(item.id) === String(settings.initial));
    if (index > 0) result = [result[index], ...result.slice(0, index), ...result.slice(index + 1)];
  }
  return result;
}
