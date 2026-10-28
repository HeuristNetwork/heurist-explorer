/**
 * @file bootstrap.js
 * @brief Normalizes the module bootstrap envelope supplied by a host or a standalone page.
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

import {
  HEURIST_MODULE_BOOTSTRAP_FORMAT,
  HEURIST_MODULE_BOOTSTRAP_VERSION
} from '../contracts/moduleContracts.js';

/**
 * Return a safe, serializable module bootstrap envelope.
 *
 * @param {object} [value] Raw bootstrap payload from a host or standalone global.
 * @returns {{format: string, version: number, runtime: object, settings: object, state: *, source: object}} Normalized envelope.
 */
export function normalizeModuleBootstrap(value = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value : {};

  const runtime = cloneObject(input.runtime);
  const language = moduleLanguage(input);
  if (language) runtime.language = language;
  return {
    format: input.format || HEURIST_MODULE_BOOTSTRAP_FORMAT,
    version: Number.isInteger(Number(input.version))
      ? Number(input.version) : HEURIST_MODULE_BOOTSTRAP_VERSION,
    runtime,
    settings: cloneObject(input.settings),
    state: cloneValue(input.state),
    source: cloneObject(input.source)
  };
}

/**
 * Interface language of a module (plan 29, 2026-10-28): a language asked in the page URL
 * (`runtime.languageRequested`, `?lang=`) first, then the module's `options.ui.language`
 * on a published page (not `auto`), then the host's language.
 *
 * @param {object} [value] Raw bootstrap payload (`runtime`, `settings`).
 * @returns {string|null} 3-letter code (lower case), or null when none is given.
 */
export function moduleLanguage(value = {}) {
  const runtime = value?.runtime || {};
  const configured = String(value?.settings?.options?.ui?.language || '').toLowerCase();
  const own = /^[a-z]{3}$/.test(configured) ? configured : null;
  const host = runtime.language ? String(runtime.language).toLowerCase().slice(0, 3) : null;
  if (runtime.languageRequested === true && host) return host;
  if (runtime.runtimeMode === 'published' && own) return own;
  return host;
}

/**
 * Read bootstrap from an iframe bridge first, then from a standalone global.
 *
 * @param {{bridge?: {getConfiguration?: Function}, standalone?: object}} [options] Bridge and standalone fallback sources.
 * @returns {{format: string, version: number, runtime: object, settings: object, state: *, source: object}} Normalized envelope.
 */
export function resolveModuleBootstrap({ bridge, standalone } = {}) {
  const value = bridge && typeof bridge.getConfiguration === 'function'
    ? bridge.getConfiguration() : standalone;

  return normalizeModuleBootstrap(value);
}

/** Return a deep-cloned plain object, or an empty object when the input isn't one. */
function cloneObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return cloneValue(value);
}

/** Deep-clone any JSON-safe value, tolerating `null`/`undefined`. */
function cloneValue(value) {
  if (value == null) return value ?? null;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
