/**
 * @file hostBridge.js
 * @brief Low-level accessors for the same-origin iframe bridge and standalone bootstrap global.
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

/**
 * Return a same-origin bridge stored on the embedding iframe element.
 *
 * @param {string} propertyName Name of the bridge property set on `window.frameElement`.
 * @returns {object|null} The bridge object, or `null` when absent or cross-origin.
 */
export function getFrameHostBridge(propertyName) {
  if (!propertyName) return null;

  try {
    return globalThis.frameElement?.[propertyName] || null;
  } catch {
    return null;
  }
}

/**
 * Read a standalone bootstrap object from the global namespace.
 *
 * @param {string} propertyName Name of the global bootstrap variable.
 * @returns {object} The bootstrap object, or an empty object when absent or not a plain object.
 */
export function getGlobalBootstrap(propertyName) {
  if (!propertyName) return {};

  const value = globalThis[propertyName];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
