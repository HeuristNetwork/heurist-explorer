/**
 * HeuristHostAdapter.js - Main Heurist host integration
 *
 * Uses the internal FrontController endpoints for preferences and published maps.
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 */
import { HostAdapter } from '#shared/host';

export class HeuristHostAdapter extends HostAdapter {
  constructor({ baseUrl, database, fetchImpl = null, bridge = null } = {}) {
    super({ bridge, baseUrl, database, fetchImpl, moduleType: 'map' });
  }

  supportsSymbologyEditing() {
    return typeof this.bridge?.editSymbology === 'function';
  }

  getHostContext() { return this.bridge?.getHostContext?.() || {}; }

  supportsWorkspace() {
    return this.getHostContext()?.name === 'heurist-explorer'
      && typeof this.bridge?.addDataSourceToWorkspace === 'function';
  }

  addDataSourceToWorkspace(source, options = {}) { return this.bridge?.addDataSourceToWorkspace?.(source, options); }
  removeDataSourceFromWorkspace(source) { return this.bridge?.removeDataSourceFromWorkspace?.(source); }
  isDataSourceInWorkspace(source) { return this.bridge?.isDataSourceInWorkspace?.(source) === true; }
  updateDataSourceInWorkspace(source) { return this.bridge?.updateDataSourceInWorkspace?.(source); }
  showDatasource(source) { return this.bridge?.showDatasource?.(source); }

  async editSymbology(value, options = {}) {
    if (!this.supportsSymbologyEditing()) {
      throw new Error('Symbology editing is not available from the Heurist host');
    }
    return this.bridge.editSymbology(value ?? null, options || {});
  }

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

  async loadLegacySymbolPreference(key) {
    const response = await this.request('UserController', 'get_prefs', { key });
    return normalizeSymbolPreference(response);
  }

  async loadPublishedMap(id) {
    return this.request('PublicationController', 'get', { id, type: 'map' });
  }

  async deletePublishedMap(id) {
    return this.request('PublicationController', 'delete', { id, type: 'map' }, {});
  }
}

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
