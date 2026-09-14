/** Public bootstrap used when Heurist Explorer hosts Data in the same realm. */
import "#shared/ui/heurist-module.css";
import "./style.css";
import { extendLocale } from "#shared/ui";
import { createHeuristDataConfig } from "./dataConfig.js";
import { initHeuristData } from "./initHeuristData.js";

export async function mountHeuristData({
  container,
  bootstrap = {},
  bridge = null,
  assetBaseUrl = null,
} = {}) {
  if (!container) throw new Error("A container is required to mount Heurist Data");
  const containerId = container.id || uniqueContainerId();
  container.id = containerId;
  container.classList.add("heurist-data-root");
  await extendLocale(bootstrap.runtime?.language, assetBaseUrl);
  const config = createHeuristDataConfig(bootstrap, { bridge, containerId });
  config.exposeGlobal = false;
  config.moduleAssetBaseUrl = assetBaseUrl;
  return initHeuristData(config);
}

function uniqueContainerId() {
  let id;
  do id = `heurist-data-${++uniqueContainerId.counter}`;
  while (document.getElementById(id));
  return id;
}
uniqueContainerId.counter = 0;
