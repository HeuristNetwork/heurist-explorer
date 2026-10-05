/**
 * @file direct.js
 * @brief Public bootstrap used when Heurist Explorer hosts the reports manager in the same realm.
 *
 * Explorer imports this file lazily (dynamic import) when its Report tool is
 * opened, so the manager and its editor are not part of Explorer's main bundle.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-reports
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import '#shared/ui/heurist-module.css';
import './style.css';
import { extendLocale } from '#shared/ui';
import { createHeuristReportsConfig } from './reportsConfig.js';
import { initHeuristReports } from './initHeuristReports.js';

/**
 * Mount heurist-reports into a same-realm container.
 *
 * @param {object} options Mount options.
 * @param {HTMLElement} options.container Element to mount into; assigned a generated id if it has none.
 * @param {object} [options.bootstrap] Bootstrap envelope (`runtime`, optional `state.report`).
 * @param {object|null} [options.bridge] Host bridge (record editor, current result, Query Sources).
 * @param {string|null} [options.assetBaseUrl] Base URL the module's own assets (localization) are loaded from.
 * @returns {Promise<import('./host/HeuristReportsPublicApi.js').HeuristReportsPublicApi>}
 * @throws {Error} When no container is supplied.
 */
export async function mountHeuristReports({ container, bootstrap = {}, bridge = null, assetBaseUrl = null } = {}) {
  if (!container) throw new Error('A container is required to mount the reports manager');
  const containerId = container.id || uniqueContainerId();
  container.id = containerId;
  await extendLocale(bootstrap.runtime?.language, assetBaseUrl);
  const config = createHeuristReportsConfig(bootstrap, { bridge, containerId });
  config.exposeGlobal = false;
  config.moduleAssetBaseUrl = assetBaseUrl;
  return initHeuristReports(config);
}

/** Generate a container id not already present in the document. */
function uniqueContainerId() {
  let id;
  do id = `heurist-reports-${++uniqueContainerId.counter}`;
  while (document.getElementById(id));
  return id;
}
uniqueContainerId.counter = 0;
