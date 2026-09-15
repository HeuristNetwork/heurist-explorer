/**
 * @file HeuristMapConfigurationApi.js
 * @brief Lightweight configuration-only public API.
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
import { MapConfigurationDialog } from '../ui/config/MapConfigurationDialog.js';
import { createMapConfigurationDefaults } from '../ui/config/mapConfigurationDefaults.js';
import {
  normalizeMapConfigurationSettings,
  serializeMapConfigurationSettings
} from '../ui/config/mapConfigurationSchema.js';

/** Public API used when heurist-map is loaded only as a configuration editor. */
export class HeuristMapConfigurationApi {
  /**
   * @param {object} [options] API configuration.
   * @param {object|null} [options.mapDocumentListProvider] Provider used to list available MapDocuments.
   * @param {Array<object>} [options.baseMapCatalog] Available base-map definitions.
   * @param {object|null} [options.hostBridge] Same-origin host bridge, when embedded in an iframe.
   * @param {object|null} [options.host] Host adapter, used to self-heal a missing preferences value.
   */
  constructor({ mapDocumentListProvider = null, baseMapCatalog = [], hostBridge = null, host = null } = {}) {
    this.configurationDialog = null;
    this.mapDocumentListProvider = mapDocumentListProvider;
    this.baseMapCatalog = Array.isArray(baseMapCatalog) ? baseMapCatalog : [];
    this.hostBridge = hostBridge || null;
    this.host = host || null;
  }

  /**
   * Resolves immediately; this facade has no asynchronous startup.
   *
   * @returns {Promise<HeuristMapConfigurationApi>} This instance.
   */
  ready() { return Promise.resolve(this); }

  /**
   * Open the configuration editor, self-healing a missing starting value for
   * "preferences" mode by fetching the user's own saved `heurist-map`
   * preference live. This lightweight boot has no MapApplication/persistedSettings
   * of its own; without this, a caller opening "preferences" mode with no
   * explicit value would show canonical defaults instead of the user's real
   * settings, the same live fetch HeuristMapPublicApi.openPreferencesDialog()
   * already performs for a running map.
   *
   * @param {object} [options] Dialog options.
   * @returns {Promise<MapConfigurationDialog>} The opened dialog.
   */
  async openConfigurationDialog(options = {}) {
    this.configurationDialog?.close?.();
    let value = options.value;
    if (value == null && options.mode === 'preferences' && typeof this.host?.loadPreferences === 'function') {
      try { value = await this.host.loadPreferences(); } catch { /* Fall back to canonical defaults. */ }
    }
    this.configurationDialog = new MapConfigurationDialog({
      ...options,
      value,
      mapDocumentListProvider: options.mapDocumentListProvider || this.mapDocumentListProvider,
      baseMapCatalog: options.baseMapCatalog || this.baseMapCatalog,
      onEditSymbology: options.onEditSymbology || (typeof this.hostBridge?.editSymbology === 'function'
        ? ((value, editorOptions) => this.hostBridge.editSymbology(value, { ...editorOptions, persist: false }))
        : null),
      onEditExtent: options.onEditExtent || (typeof this.hostBridge?.editExtent === 'function'
        ? ((bounds, editorOptions) => this.hostBridge.editExtent(bounds, editorOptions))
        : null)
    });
    this.configurationDialog.open();
    return this.configurationDialog;
  }

  /**
   * Normalize a raw persisted-settings value against the canonical defaults.
   *
   * @param {object} [value] Raw settings value.
   * @returns {object} Normalized settings.
   */
  normalizeConfiguration(value = {}) {
    return normalizeMapConfigurationSettings(value);
  }

  /**
   * Produce the versioned, JSON-safe settings envelope for persistence.
   *
   * @param {object} [value] Raw settings value to normalize and wrap.
   * @returns {object} Serializable settings envelope.
   */
  serializeConfiguration(value = {}) {
    return serializeMapConfigurationSettings(value);
  }

  /**
   * Build a fresh, mutable copy of the canonical default settings.
   *
   * @returns {object} Default settings.
   */
  getConfigurationDefaults() {
    return createMapConfigurationDefaults();
  }

  /**
   * Close any open configuration dialog.
   *
   * @returns {void}
   */
  destroy() {
    this.configurationDialog?.close?.();
    this.configurationDialog = null;
  }
}
