/**
 * HResource.js - Lightweight Heurist localization resource loader
 *
 * Shared by heurist-map, heurist-data, heurist-graph, and later independent
 * Vite modules. Each module ships its own `assets/localization/localization_*.txt`
 * pair; this loader only knows the fetch convention, not module-specific content.
 *
 * @project     Heurist academic knowledge management system
 * @package     client-core.ui.i18n
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

let strings = {};
let activeLanguage = 'eng';
let assetBaseUrl = '';

/** Parse a localization_xxx.txt resource into a key/value dictionary. */
export function parseLocale(text = '') {
  const dictionary = {};
  for (const line of String(text).replace(/\r/g, '').split('\n')) {
    const match = line.match(/^#(.+?)#(.*)$/);
    if (match) dictionary[match[1]] = match[2];
  }
  return dictionary;
}

/** Load English as the fallback dictionary, then overlay the requested locale. */
export async function initLocale(language = 'eng', baseUrl = '') {
  activeLanguage = normalizeLanguage(language);
  const base = String(baseUrl || '').replace(/\/+$/, '');
  assetBaseUrl = base;
  if (!base) { strings = {}; return; }
  const prefix = `${base}/assets/localization/`;
  strings = parseLocale(await fetchText(`${prefix}localization_eng.txt`));
  if (activeLanguage !== 'eng') {
    Object.assign(strings, parseLocale(await fetchText(`${prefix}localization_${activeLanguage}.txt`)));
  }
}

/** Return a localized resource, falling back to the key or explicit fallback. */
export function $HR(key, fallback) {
  if (!String(key ?? '').trim()) return '';
  const normalized = String(key).trim();
  const value = strings[normalized];
  if (value !== undefined) return value || (fallback !== undefined ? fallback : normalized);
  return fallback !== undefined ? fallback : normalized;
}

/** Translate text-only elements marked with h-i18n under the supplied root. */
export function applyI18n(root) {
  root?.querySelectorAll?.('.h-i18n').forEach((element) => {
    const text = element.textContent?.trim();
    if (text) element.textContent = $HR(text);
  });
}

export function getActiveLanguage() { return activeLanguage; }

export function getAssetBaseUrl() { return assetBaseUrl; }

function normalizeLanguage(value) {
  const language = String(value || 'eng').trim().toLowerCase().slice(0, 3);
  return /^[a-z]{3}$/.test(language) && language !== 'aut' ? language : 'eng';
}
async function fetchText(url) {
  try { const response = await fetch(url); return response.ok ? response.text() : ''; }
  catch { return ''; }
}

if (typeof globalThis !== 'undefined' && typeof globalThis.$HR !== 'function') globalThis.$HR = $HR;
