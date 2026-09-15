/**
 * @file HeuristHostAdapter.js
 * @brief Main Heurist host integration.
 *
 * Uses the internal FrontController endpoints for preferences and published maps.
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
import { HostAdapter } from '#shared/host';

/** Host adapter for heurist-map embedded in a legacy Heurist host. */
export class HeuristHostAdapter extends HostAdapter {
  /**
   * @param {object} [options] Host adapter configuration.
   * @param {string} options.baseUrl Base URL of the Heurist FrontController.
   * @param {string} options.database Target Heurist database name.
   * @param {Function|null} [options.fetchImpl] Fetch implementation to use instead of the global `fetch`.
   * @param {object|null} [options.bridge] Same-origin host bridge, when embedded in an iframe.
   */
  constructor({ baseUrl, database, fetchImpl = null, bridge = null } = {}) {
    super({ bridge, baseUrl, database, fetchImpl, moduleType: 'map' });
  }

  /** Whether the host can open its symbology editor. */
  supportsSymbologyEditing() {
    return typeof this.bridge?.editSymbology === 'function';
  }

  /**
   * Return the embedding host's identity.
   *
   * @returns {object} Host context, or `{}` when not yet known.
   */
  getHostContext() { return this.bridge?.getHostContext?.() || {}; }

  /** Whether the host is Heurist Explorer and supports the shared workspace. */
  supportsWorkspace() {
    return this.getHostContext()?.name === 'heurist-explorer'
      && typeof this.bridge?.addDataSourceToWorkspace === 'function';
  }

  /**
   * Add a datasource to the Explorer workspace.
   *
   * @param {object} source Datasource to add.
   * @param {object} [options] Options forwarded to the host bridge.
   * @returns {*} Result of the host bridge's call, or `undefined` when unsupported.
   */
  addDataSourceToWorkspace(source, options = {}) { return this.bridge?.addDataSourceToWorkspace?.(source, options); }

  /**
   * Remove a datasource from the Explorer workspace.
   *
   * @param {object|string} source Datasource or key identifying the workspace entry.
   * @returns {*} Result of the host bridge's call, or `undefined` when unsupported.
   */
  removeDataSourceFromWorkspace(source) { return this.bridge?.removeDataSourceFromWorkspace?.(source); }

  /**
   * Whether a datasource is in the Explorer workspace.
   *
   * @param {object} source Datasource to check.
   * @returns {boolean} True when present.
   */
  isDataSourceInWorkspace(source) { return this.bridge?.isDataSourceInWorkspace?.(source) === true; }

  /**
   * Persist module-owned presentation state for a workspace entry.
   *
   * @param {object} source Datasource carrying updated presentation state.
   * @returns {*} Result of the host bridge's call, or `undefined` when unsupported.
   */
  updateDataSourceInWorkspace(source) { return this.bridge?.updateDataSourceInWorkspace?.(source); }

  /**
   * Ask Explorer to activate and display a datasource.
   *
   * @param {object} source Datasource to show.
   * @returns {*} Result of the host bridge's call, or `undefined` when unsupported.
   */
  showDatasource(source) { return this.bridge?.showDatasource?.(source); }

  /**
   * Ask the host to open its symbology editor.
   *
   * @param {*} value Current symbology value.
   * @param {object} [options] Editor options.
   * @returns {Promise<*>} The host's edited symbology result.
   * @throws {Error} When the host does not support symbology editing.
   */
  async editSymbology(value, options = {}) {
    if (!this.supportsSymbologyEditing()) {
      throw new Error('Symbology editing is not available from the Heurist host');
    }
    return this.bridge.editSymbology(value ?? null, options || {});
  }

  /**
   * Return optional capabilities: preferences/publishing support, and workspace/datasource integration.
   *
   * @returns {object} Capability flags.
   */
  getCapabilities() {
    const explorerWorkspace = this.supportsWorkspace();
    const showDatasource = typeof this.bridge?.showDatasource === 'function';
    return {
      mapPreferences: true,
      mapPublishing: true,
      ...(explorerWorkspace ? { explorerWorkspace: true } : {}),
      ...(showDatasource ? { showDatasource: true } : {})
    };
  }

  /**
   * Apply legacy Heurist map symbol preferences as runtime defaults.
   *
   * This is a temporary compatibility bridge while old and new mapping coexist.
   * Explicit heurist-map defaults always win; legacy preferences only fill null
   * symbology/selectSymbology values and are never copied into persistedSettings.
   *
   * @param {{config?: object}} [options] `config.defaults` is filled in place with legacy preferences.
   * @returns {Promise<void>}
   */
  async initialize({ config } = {}) {
    const defaults = config?.defaults;
    if (!defaults) return;

    const requests = [];
    if (defaults.symbology == null) {
      requests.push(this.loadLegacySymbolPreference('map_default_style')
        .then((symbol) => { if (symbol) defaults.symbology = symbol; }));
    }
    if (defaults.selectSymbology == null) {
      requests.push(this.loadLegacySymbolPreference('map_select_style')
        .then((symbol) => { if (symbol) defaults.selectSymbology = symbol; }));
    }

    // Legacy preferences are compatibility defaults, not a startup dependency.
    // A failed preference read must not prevent the map itself from loading.
    if (requests.length) await Promise.allSettled(requests);
  }

  /**
   * Load and normalize one legacy symbol preference by key.
   *
   * @param {string} key Legacy preference key (e.g. `'map_default_style'`).
   * @returns {Promise<object|null>} Normalized symbol object, or `null` when absent or invalid.
   */
  async loadLegacySymbolPreference(key) {
    const response = await this.request('UserController', 'get_prefs', { key });
    return normalizeSymbolPreference(response);
  }

  /**
   * Load a published map definition by publication id.
   *
   * @param {number|string} id Publication id.
   * @returns {Promise<object>} Published map payload.
   */
  async loadPublishedMap(id) {
    return this.request('PublicationController', 'get', { id, type: 'map' });
  }

  /**
   * Delete a published map by publication id.
   *
   * @param {number|string} id Publication id.
   * @returns {Promise<*>} Result of the FrontController request.
   */
  async deletePublishedMap(id) {
    return this.request('PublicationController', 'delete', { id, type: 'map' }, {});
  }
}

/** Parse and validate a legacy symbol preference value, returning `null` when absent or malformed. */
function normalizeSymbolPreference(value) {
  if (typeof value === 'string' && value.trim()) {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return JSON.parse(JSON.stringify(value));
}
