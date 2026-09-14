/**
 * HeuristMapConfigurationApi.js - Lightweight configuration-only public API
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 */
import { MapConfigurationDialog } from '../ui/config/MapConfigurationDialog.js';
import { createMapConfigurationDefaults } from '../ui/config/mapConfigurationDefaults.js';
import {
  normalizeMapConfigurationSettings,
  serializeMapConfigurationSettings
} from '../ui/config/mapConfigurationSchema.js';

/** Public API used when heurist-map is loaded only as a configuration editor. */
export class HeuristMapConfigurationApi {
  constructor({ mapDocumentListProvider = null, baseMapCatalog = [], hostBridge = null, host = null } = {}) {
    this.configurationDialog = null;
    this.mapDocumentListProvider = mapDocumentListProvider;
    this.baseMapCatalog = Array.isArray(baseMapCatalog) ? baseMapCatalog : [];
    this.hostBridge = hostBridge || null;
    this.host = host || null;
  }

  ready() { return Promise.resolve(this); }

  /**
   * Open the configuration editor, self-healing a missing starting value for
   * "preferences" mode by fetching the user's own saved `heurist-map`
   * preference live. This lightweight boot has no MapApplication/persistedSettings
   * of its own; without this, a caller opening "preferences" mode with no
   * explicit value would show canonical defaults instead of the user's real
   * settings, the same live fetch HeuristMapPublicApi.openPreferencesDialog()
   * already performs for a running map.
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

  normalizeConfiguration(value = {}) {
    return normalizeMapConfigurationSettings(value);
  }

  serializeConfiguration(value = {}) {
    return serializeMapConfigurationSettings(value);
  }

  getConfigurationDefaults() {
    return createMapConfigurationDefaults();
  }

  destroy() {
    this.configurationDialog?.close?.();
    this.configurationDialog = null;
  }
}
