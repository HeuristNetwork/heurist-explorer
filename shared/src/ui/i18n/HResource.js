/**
 * @file HResource.js
 * @brief Lightweight Heurist localization resource loader.
 *
 * Shared by heurist-map, heurist-data, heurist-graph, and later independent
 * Vite modules. Each module ships its own `assets/localization/localization_*.txt`
 * pair; this loader only knows the fetch convention, not module-specific content.
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

let strings = {};
let activeLanguage = 'eng';
let assetBaseUrl = '';

/**
 * Parse a localization_xxx.txt resource into a key/value dictionary.
 *
 * @param {string} [text] Raw resource file contents.
 * @returns {object} Key/value dictionary of resource strings.
 */
export function parseLocale(text = '') {
  const dictionary = {};

  for (const line of String(text).replace(/\r/g, '').split('\n')) {
    const match = line.match(/^#(.+?)#(.*)$/);
    if (match) dictionary[match[1]] = match[2];
  }

  return dictionary;
}

/**
 * Load English as the fallback dictionary, then overlay the requested locale.
 *
 * @param {string} [language='eng'] Three-letter language code to activate.
 * @param {string} [baseUrl] Base URL under which `assets/localization/` is hosted.
 * @returns {Promise<void>} Resolves once the dictionaries are loaded.
 */
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

/**
 * Merge another directly hosted module's resources into the active locale.
 *
 * @param {string} [language] Three-letter language code to overlay; defaults to the active language.
 * @param {string} [baseUrl] Base URL under which the other module's `assets/localization/` is hosted.
 * @returns {Promise<void>} Resolves once the dictionaries are merged.
 */
export async function extendLocale(language = activeLanguage, baseUrl = '') {
  const selectedLanguage = normalizeLanguage(language);
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) return;

  const prefix = `${base}/assets/localization/`;
  Object.assign(strings, parseLocale(await fetchText(`${prefix}localization_eng.txt`)));
  if (selectedLanguage !== 'eng') {
    Object.assign(strings, parseLocale(await fetchText(`${prefix}localization_${selectedLanguage}.txt`)));
  }
}

/**
 * Return a localized resource, falling back to the key or explicit fallback.
 *
 * @param {string} key Resource key to look up.
 * @param {string} [fallback] Text to use when the key is not translated; defaults to the key itself.
 * @returns {string} Localized text.
 */
export function $HR(key, fallback) {
  if (!String(key ?? '').trim()) return '';

  const normalized = String(key).trim();
  const value = strings[normalized];
  if (value !== undefined) return value || (fallback !== undefined ? fallback : normalized);
  return fallback !== undefined ? fallback : normalized;
}

/**
 * Translate text-only elements marked with h-i18n under the supplied root.
 *
 * @param {Element|null} root Root element to scan for `.h-i18n` descendants.
 * @returns {void}
 */
export function applyI18n(root) {
  root?.querySelectorAll?.('.h-i18n').forEach((element) => {
    const text = element.textContent?.trim();
    if (text) element.textContent = $HR(text);
  });
}

/** Return the currently active three-letter language code. */
export function getActiveLanguage() { return activeLanguage; }

/** Return the base URL the active locale's assets were loaded from. */
export function getAssetBaseUrl() { return assetBaseUrl; }

/** Normalize a language value to a supported three-letter code, defaulting to English. */
function normalizeLanguage(value) {
  const language = String(value || 'eng').trim().toLowerCase().slice(0, 3);
  return /^[a-z]{3}$/.test(language) && language !== 'aut' ? language : 'eng';
}

/** Fetch a text resource, tolerating network failures and non-OK responses. */
async function fetchText(url) {
  try { const response = await fetch(url); return response.ok ? response.text() : ''; }
  catch { return ''; }
}

if (typeof globalThis !== 'undefined' && typeof globalThis.$HR !== 'function') globalThis.$HR = $HR;
