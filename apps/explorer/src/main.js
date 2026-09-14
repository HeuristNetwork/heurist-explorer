import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import '@fortawesome/fontawesome-free/css/regular.min.css';
import '#shared/ui/heurist-ui.css';
import './style.css';
import { initLocale } from '#shared/ui';
import { getHeuristExplorerConfig } from './explorerConfig.js';
import { initHeuristExplorer } from './initHeuristExplorer.js';

const config = getHeuristExplorerConfig();
const startup = initLocale(
  config.language,
  config.localeBaseUrl || moduleBaseUrl(),
).then(() => initHeuristExplorer(config));

function moduleBaseUrl() {
  return new URL('./', import.meta.url).href;
}

startup.catch((error) => {
  const container = document.getElementById(config.containerId);
  if (container) container.textContent = error?.message || String(error);
  console.error('Unable to initialize heurist-explorer', error);
});
