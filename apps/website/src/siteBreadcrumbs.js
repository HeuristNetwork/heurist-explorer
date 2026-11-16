/**
 * @file siteBreadcrumbs.js
 * @brief Breadcrumbs of a v4 website (plan 27k §6): the path written by the server, the draft of the designer and the
 *        trail of record pages visited before (mode history).
 *
 * The server writes `<ol class="h-site-breadcrumbs">` (PageRenderer::breadcrumbsHtml): Home, the parents of the page
 * and the page; on a record page the record. In mode history (`data-h-mode="history"`) the site runtime keeps the
 * record pages visited on this website in sessionStorage (this browser tab, at most TRAIL_MAX; opening a record of the
 * trail again cuts the trail there) and shows them on a record page: Home › record › record. No CSS here: the rules
 * are in style.css (the designer must not import a site file with CSS, plan 27k §7.1).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from '#shared/ui';
import { menuPath } from '#shared/site/cmsMenu.js';

/** Record pages kept in the trail. */
export const TRAIL_MAX = 8;

/** sessionStorage key prefix of the trail, per database and website. */
const TRAIL_KEY = 'heurist.site.trail';

/** @returns {Storage|null} sessionStorage, or null when the browser does not give it. */
function safeSessionStorage() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

/** The storage key of the trail of a website. */
function trailKey(config) {
  const runtime = config?.runtime || {};
  return `${TRAIL_KEY}.${runtime.database || ''}.${config?.site?.id || runtime.site || 0}`;
}

/**
 * The trail of record pages of a website.
 *
 * @param {object} config The configuration block of the page.
 * @param {Storage|null} [storage]
 * @returns {Array<{record: number, page: number, title: string, url: string}>}
 */
export function readTrail(config, storage = safeSessionStorage()) {
  try {
    const value = JSON.parse(storage?.getItem(trailKey(config)) || '[]');
    return Array.isArray(value) ? value.filter((item) => item && Number(item.record) > 0 && typeof item.url === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Add the record page of this page to the trail (nothing on another page or in the designer): a record already in the
 * trail cuts it there; at most TRAIL_MAX entries.
 *
 * @param {object} config The configuration block of the page.
 * @param {object} [options]
 * @param {Storage|null} [options.storage]
 * @param {string} [options.url] URL of the page (else the URL of the current language, else location.href).
 * @returns {Array<object>} The trail.
 */
export function recordTrail(config, { storage = safeSessionStorage(), url = '' } = {}) {
  const site = config?.site || {};
  const record = Number(site.record) || 0;
  if (config?.runtime?.design || !record) return readTrail(config, storage);
  const language = String(site.language || '').toLowerCase();
  const own = (site.languages || []).find((item) => String(item.code).toLowerCase() === language)?.url;
  const entry = { record, page: Number(site.pageId) || 0, title: String(site.recordTitle || '').trim() || `#${record}`,
    url: url || own || globalThis.location?.href || '#' };
  const trail = readTrail(config, storage);
  const at = trail.findIndex((item) => Number(item.record) === record);
  const next = [...(at >= 0 ? trail.slice(0, at) : trail), entry].slice(-TRAIL_MAX);
  try {
    storage?.setItem(trailKey(config), JSON.stringify(next));
  } catch {
    // private mode or no storage: no trail
  }
  return next;
}

/**
 * Write the entries of breadcrumbs into their list: links, the last one the current page.
 *
 * @param {HTMLElement} list The `ol.h-site-breadcrumbs`.
 * @param {Array<{title: string, url?: string, home?: boolean}>} items `home`: the home page (class is-home).
 */
export function renderBreadcrumbs(list, items) {
  const doc = list.ownerDocument || globalThis.document;
  list.replaceChildren(...items.map((item, index) => {
    const entry = doc.createElement('li');
    const last = index === items.length - 1;
    const target = doc.createElement(last ? 'span' : 'a');
    if (!last) target.setAttribute('href', item.url || '#');
    else entry.setAttribute('aria-current', 'page');
    target.textContent = item.title || '';
    if (item.home) entry.classList.add('is-home');
    entry.append(target);
    return entry;
  }));
}

/**
 * Activate breadcrumbs: the list the server wrote (mode history on a record page: Home and the trail), or in the
 * designer's draft the path from the menu tree of the configuration.
 *
 * @param {HTMLElement} host The host of the widget.
 * @param {object} instance The widget instance (`settings.mode`).
 * @param {object} config The configuration block of the page.
 * @param {object} [options]
 * @param {Storage|null} [options.storage]
 * @returns {{destroy: () => void}}
 */
export function mountBreadcrumbs(host, instance, config, { storage = safeSessionStorage() } = {}) {
  let list = host.querySelector?.('.h-site-breadcrumbs');
  const site = config?.site || {};
  if (!list) {
    // the draft of the designer: the path of the page being edited
    list = (host.ownerDocument || globalThis.document).createElement('ol');
    list.className = 'h-site-breadcrumbs';
    if (instance?.settings?.mode === 'history') list.setAttribute('data-h-mode', 'history');
    const home = site.homeItem ? [site.homeItem] : [];
    renderBreadcrumbs(list, site.home ? home : [...home, ...menuPath(site.menu || [])]);
    host.replaceChildren(list);
  }
  showTrail(list, config, storage);
  // the home page: "Home" in the language of the page (review 2026-11-16; the server writes Home)
  for (const entry of [...list.children].filter((item) => item.classList?.contains('is-home'))) {
    const target = entry.children?.[0];
    if (target) target.textContent = $HR('Home');
  }
  return { destroy: () => {} };
}

/**
 * Mode history on a record page: Home (the first entry the server wrote) and the trail; other pages keep the path.
 *
 * @param {HTMLElement} list
 * @param {object} config
 * @param {Storage|null} [storage]
 */
export function showTrail(list, config, storage = safeSessionStorage()) {
  if (list.getAttribute('data-h-mode') !== 'history' || config?.runtime?.design || !Number(config?.site?.record)) return;
  const trail = readTrail(config, storage);
  if (!trail.length) return;
  const homeLink = list.querySelector('a');
  const home = homeLink ? [{ title: homeLink.textContent || '', url: homeLink.getAttribute('href') || '#',
    home: Boolean(homeLink.parentElement?.classList?.contains('is-home')) }] : [];
  renderBreadcrumbs(list, [...home, ...trail]);
}
