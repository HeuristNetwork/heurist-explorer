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

  return {
    format: input.format || HEURIST_MODULE_BOOTSTRAP_FORMAT,
    version: Number.isInteger(Number(input.version))
      ? Number(input.version) : HEURIST_MODULE_BOOTSTRAP_VERSION,
    runtime: cloneObject(input.runtime),
    settings: cloneObject(input.settings),
    state: cloneValue(input.state),
    source: cloneObject(input.source)
  };
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
