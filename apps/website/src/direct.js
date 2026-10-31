/**
 * @file direct.js
 * @brief Public bootstrap of the Website manager (plan 27b), mounted in the same realm by
 *        Heurist Explorer (Websites tool) or by a host page.
 *
 * Explorer imports this file lazily (dynamic import) when its Websites tool is opened. The
 * public site runtime (main.js) is a separate entry: visitors of a website never load the
 * manager.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import '#shared/ui/heurist-module.css';
import { extendLocale } from '#shared/ui';
import { WebsiteApplication } from './manager/WebsiteApplication.js';
import { WebsiteManager } from './manager/WebsiteManager.js';

/**
 * Normalized manager configuration from a bootstrap envelope.
 *
 * @param {object} [bootstrap] `{runtime}` (database, apiBaseUrl, baseUrl, accessToken, requestHeaders, language).
 * @returns {object}
 */
export function createWebsiteManagerConfig(bootstrap = {}) {
  const runtime = bootstrap.runtime || {};
  const baseUrl = String(runtime.baseUrl || '').replace(/\/?$/, '/');
  return {
    database: runtime.database || null,
    baseUrl: runtime.baseUrl ? baseUrl : null,
    apiBaseUrl: runtime.apiBaseUrl || (runtime.baseUrl ? `${baseUrl}api` : null),
    accessToken: runtime.accessToken || null,
    requestHeaders: runtime.requestHeaders || {},
    language: String(runtime.language || 'eng').toLowerCase()
  };
}

/**
 * Mount the Website manager into a container.
 *
 * @param {object} options Mount options.
 * @param {HTMLElement} options.container Element to mount into.
 * @param {object} [options.bootstrap] Bootstrap envelope (`runtime`).
 * @param {object|null} [options.bridge] Host bridge: `editRecord`, `viewRecord`, `canEditRecords`, `getDbDefs`.
 * @param {Function|null} [options.onClose] The Close button of the manager's header (Explorer: the manager is over
 *        the whole screen, plan 27b §11).
 * @param {string|null} [options.assetBaseUrl] Base URL of the bundle's own assets (localization).
 * @returns {Promise<{application: WebsiteApplication, selectRecord: Function, destroy: Function}>}
 * @throws {Error} When no container is supplied.
 */
export async function mountWebsiteManager({ container, bootstrap = {}, bridge = null, assetBaseUrl = null, onClose = null } = {}) {
  if (!container) throw new Error('A container is required to mount the Website manager');
  const config = createWebsiteManagerConfig(bootstrap);
  await extendLocale(config.language, assetBaseUrl).catch(() => {});
  const application = new WebsiteApplication({ config, bridge });
  await application.initialize();
  const view = new WebsiteManager().attach(container, { application, onClose });
  return {
    application,
    selectRecord: (id) => view.selectRecord(id),
    // the CMS designer on a website or standalone page (plan 27c), e.g. Explorer started with ?mode=cms
    openDesigner: (id, options) => view.openDesigner(id, options),
    hasUnsavedChanges: () => Boolean(view.designer?.isDirty?.()),
    destroy: () => view.destroy()
  };
}
