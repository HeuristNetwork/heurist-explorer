/**
 * @file DirectModuleAdapter.js
 * @brief Same-realm presentation-module adapter sharing IframeModuleAdapter's public API and host bridge.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { IframeModuleAdapter } from './IframeModuleAdapter.js';

/** Same-realm module adapter. It uses the same public API and host bridge as iframe mode. */
export class DirectModuleAdapter extends IframeModuleAdapter {
  /**
   * @param {object} options Adapter configuration.
   * @param {Function} options.mountModule Bootstraps the module in-process and returns its public API.
   * @param {string|null} [options.assetBaseUrl] Base URL the module should resolve its own assets from.
   * @param {object} options.rest Remaining options forwarded to `IframeModuleAdapter`.
   */
  constructor({ mountModule, assetBaseUrl = null, ...options }) {
    super(options);
    this.mountModule = mountModule;
    this.assetBaseUrl = assetBaseUrl;
    this.root = null;
  }

  /**
   * Mount the module in-process into a generated root element.
   *
   * @returns {Promise<DirectModuleAdapter>} This adapter, once the module is ready.
   * @throws {Error} When no `mountModule` bootstrap is configured, or it doesn't return a public API.
   */
  async mount() {
    if (typeof this.mountModule !== 'function') {
      throw new Error(`No direct bootstrap configured for ${this.type}`);
    }

    this.root = document.createElement('div');
    this.root.className = `h-explorer-direct-module h-explorer-direct-${this.type}`;
    this.container.replaceChildren(this.root);
    this.readyPromise = Promise.resolve(this.mountModule({
      container: this.root,
      bootstrap: this._bootstrap(),
      bridge: this._createChildHostBridge(),
      assetBaseUrl: this.assetBaseUrl
    })).then(async (api) => {
      if (!api) throw new Error(`${this.type} direct bootstrap did not return its public API`);
      this.api = api;
      if (typeof api.ready === 'function') await api.ready();
      return api;
    });
    await this.readyPromise;
    this._bindChildEvents();
    return this;
  }

  /**
   * Tear down the module and remove its generated root element.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    await super.destroy();
    this.root?.remove();
    this.root = null;
  }
}
