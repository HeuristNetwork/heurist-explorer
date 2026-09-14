import { IframeModuleAdapter } from './IframeModuleAdapter.js';

/** Same-realm module adapter. It uses the same public API and host bridge as iframe mode. */
export class DirectModuleAdapter extends IframeModuleAdapter {
  constructor({ mountModule, assetBaseUrl = null, ...options }) {
    super(options);
    this.mountModule = mountModule;
    this.assetBaseUrl = assetBaseUrl;
    this.root = null;
  }

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

  async destroy() {
    await super.destroy();
    this.root?.remove();
    this.root = null;
  }
}
