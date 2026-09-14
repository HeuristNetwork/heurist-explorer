export class HeuristExplorerPublicApi {
  constructor(application) {
    this.application = application;
    this.readyPromise = null;
  }
  setReadyPromise(promise) { this.readyPromise = promise; }
  ready() { return this.readyPromise || Promise.resolve(this); }
  setDataSource(source) { return this.application.setDataSource(source); }
  setSelection(ids) { return this.application.setSelection(ids); }
  applyLayout(layout) { return this.application.applyLayout(layout); }
  getState() { return this.application.getState(); }
  resize() { return this.application.resize(); }
  destroy() { return this.application.destroy(); }
}
