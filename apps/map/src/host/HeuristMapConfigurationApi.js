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
import { createConfigurationDialogFactory } from '#shared/ui/config/moduleConfigurationDialogFactory.js';
import { mapConfiguration } from '../configuration.js';
import { getDefaultBaseMaps } from '../basemaps/defaultBasemaps.js';
import { mapConfigurationFormOptions } from '../ui/config/mapConfigurationEditors.js';
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
   * @param {Array<object>} [options.baseMapCatalog] Available base-map definitions (kept; the form lists the Heurist base maps).
   * @param {object|null} [options.hostBridge] Same-origin host bridge, when embedded in an iframe.
   * @param {object|null} [options.host] Host adapter, used to self-heal a missing preferences value.
   * @param {object|null} [options.symbology] SymbologyService (default and selection symbology).
   */
  constructor({ mapDocumentListProvider = null, baseMapCatalog = [], hostBridge = null, host = null, symbology = null } = {}) {
    this.configurationDialog = null;
    this.mapDocumentListProvider = mapDocumentListProvider;
    this.baseMapCatalog = Array.isArray(baseMapCatalog) ? baseMapCatalog : [];
    this.hostBridge = hostBridge || null;
    this.host = host || null;
    this.symbology = symbology || null;
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
   * @returns {Promise<{result: Promise<object|null>, close: Function}>} The dialog handle.
   */
  async openConfigurationDialog(options = {}) {
    this.configurationDialog?.close?.();
    let value = options.value;
    if (value == null && options.mode === 'preferences' && typeof this.host?.loadPreferences === 'function') {
      try { value = await this.host.loadPreferences(); } catch { /* Fall back to canonical defaults. */ }
    }
    // the common configuration form (plan 29) in this window
    const factory = createConfigurationDialogFactory({
      configuration: mapConfiguration,
      formOptions: mapConfigurationFormOptions({
        // configuration values are complete symbols (see SymbologyService.edit)
        editSymbology: this.symbology
          ? ((symbol, editorOptions) => this.symbology.edit(symbol, { parentSymbol: editorOptions?.parentSymbol || null, complete: true }))
          : null,
        editExtent: typeof this.hostBridge?.editExtent === 'function' ? (bounds) => this.hostBridge.editExtent(bounds) : null
      })
    });
    const terms = await this.configurationTerms();
    const fields = this.mapDocumentTypeId > 0 ? { 'options.mapDocuments.allowed': { targetTypes: [this.mapDocumentTypeId] } } : {};
    this.configurationDialog = factory({ ...options, value, terms, fields });
    return this.configurationDialog;
  }

  /**
   * The lists of the Map documents and Base maps sections of the form.
   *
   * @returns {Promise<{mapDocuments: Array<object>, baseMaps: Array<object>}>}
   */
  async configurationTerms() {
    let documents = [];
    try {
      const result = await this.mapDocumentListProvider?.search?.();
      documents = result?.items || [];
      this.mapDocumentTypeId = Number(result?.recordTypeId) || 0;
    } catch {
      documents = []; // the list cannot be read: the section shows no documents
    }
    return {
      mapDocuments: documents.map((item) => ({ id: Number(item.id), label: item.title || `Map document ${item.id}` })),
      baseMaps: getDefaultBaseMaps().map((item) => ({ id: String(item.id), label: item.title || String(item.id) }))
    };
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
