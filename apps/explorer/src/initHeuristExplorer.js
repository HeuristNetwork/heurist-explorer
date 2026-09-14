import { ExplorerApplication } from './core/ExplorerApplication.js';
import { HeuristExplorerPublicApi } from './host/HeuristExplorerPublicApi.js';

export async function initHeuristExplorer(config) {
  const container = document.getElementById(config.containerId);
  if (!container) throw new Error(`#${config.containerId} was not found`);
  const application = new ExplorerApplication({ container, config });
  const api = new HeuristExplorerPublicApi(application);
  const ready = application.initialize().then(() => api);
  api.setReadyPromise(ready);
  globalThis.heuristExplorer = api;
  return ready;
}
