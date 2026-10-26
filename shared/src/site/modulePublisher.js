/**
 * @file modulePublisher.js
 * @brief Publish a module or Explorer as a standalone v4 page (plan 27b §6).
 *
 * The module's publish payload (`{format: 'heurist-publication', options, config, state}`, as made by
 * each module's `publish()`) becomes the instance settings `{format: 'heurist-<type>-settings', version,
 * options, config}` and state; the server writes the page (`POST /website/publish`). The page this
 * module type published last is remembered per database in localStorage and offered for update when
 * it still exists, is standalone, v4 and editable (decision Q4); a new page is always possible.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { openPublishPageDialog } from '../ui/PublishPageDialog.js';

/** localStorage key prefix of the last published page, per database and module type. */
const LAST_PAGE_KEY = 'heurist.publish.page';

/** Module names for the default page title. */
const MODULE_NAMES = Object.freeze({
  explorer: 'Explorer', data: 'Data', map: 'Map', timeline: 'Timeline', graph: 'Graph', recordview: 'Record view'
});

/**
 * Instance settings of a module from its publish payload.
 *
 * @param {string} type Module type.
 * @param {object} payload Publish payload of the module.
 * @returns {{settings: object, state: object|null}}
 */
export function instanceFromPayload(type, payload = {}) {
  const value = payload && typeof payload === 'object' ? payload : {};
  const settings = {
    format: `heurist-${type}-settings`,
    version: Number(value.version) || 1,
    options: isObject(value.options) ? value.options : {},
    config: isObject(value.config) ? value.config : {}
  };
  return { settings, state: isObject(value.state) ? value.state : null };
}

/**
 * Embed code of a published page.
 *
 * @param {string} url Page URL.
 * @param {string} [title] Frame title.
 * @returns {string}
 */
export function embedCode(url, title = '') {
  const attr = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<iframe src="${attr(url)}" title="${attr(title || 'Heurist')}" style="width:100%;height:600px;border:0"></iframe>`;
}

/**
 * Ask for the title and target page, then publish.
 *
 * @param {object} options
 * @param {import('../api/WebsiteClient.js').WebsiteClient} options.client Website API client.
 * @param {string} options.database Database name (remembered page key).
 * @param {string} options.type Module type.
 * @param {object} [options.payload] Publish payload of the module (or `settings` / `state` directly).
 * @param {object} [options.settings] Instance settings (instead of `payload`; Explorer).
 * @param {object|null} [options.state] Instance state (with `settings`).
 * @param {Function} [options.openDialog] Dialog (tests): `({title, lastPage}) → Promise<{title, pageId}|null>`.
 * @param {Storage|null} [options.storage] Storage of the remembered page (tests).
 * @returns {Promise<{id: number, url: string, title: string, created: boolean, embed: string}|null>} Null when cancelled.
 */
export async function publishModulePage({ client, database, type, payload = null, settings = null, state = null,
  openDialog = openPublishPageDialog, storage = defaultStorage() }) {
  const key = `${LAST_PAGE_KEY}.${database || ''}.${type}`;
  const lastPage = await checkedLastPage(client, readJson(storage, key));
  const choice = await openDialog({
    title: lastPage?.title || `${MODULE_NAMES[type] || type} – ${new Date().toISOString().slice(0, 10)}`,
    lastPage
  });
  if (!choice) return null;
  const instance = settings ? { settings, state } : instanceFromPayload(type, payload);
  const result = await client.publish({ type, ...instance, title: choice.title, pageId: choice.pageId || 0 });
  writeJson(storage, key, { id: Number(result.id), title: result.title || choice.title });
  return { ...result, embed: embedCode(result.url, result.title || choice.title) };
}

/** The remembered page when it can still be updated, else null. */
async function checkedLastPage(client, remembered) {
  const id = Number(remembered?.id);
  if (!(id > 0)) return null;
  try {
    const summary = await client.summary(id);
    return summary?.v4 && summary.kind === 'standalone' && summary.canEdit ? { id, title: summary.title || remembered.title || '' } : null;
  } catch {
    return null;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** `localStorage` when accessible, otherwise null. */
function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function readJson(storage, key) {
  try { return JSON.parse(storage?.getItem(key) || 'null'); } catch { return null; }
}

function writeJson(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* private mode: not remembered */ }
}
