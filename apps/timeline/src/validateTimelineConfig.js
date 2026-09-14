/**
 * @file validateTimelineConfig.js
 * @brief Validates the timeline runtime config before any browser initialization occurs.
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/**
 * Validates that the supplied configuration includes a valid container target.
 *
 * @param {object|null|undefined} config - Candidate timeline configuration.
 * @returns {{ config: object, container: Element }} Sanitized config and DOM element.
 * @throws {Error} If the configuration is missing or the DOM node cannot be resolved.
 */
export function validateTimelineConfig(config) {
  const safeConfig = config && typeof config === "object" ? config : null;

  if (!safeConfig || !safeConfig.containerId || typeof safeConfig.containerId !== "string") {
    throw new Error(
      "Timeline initialization requires a config object with a valid containerId.",
    );
  }

  const container =
    typeof document !== "undefined" ? document.getElementById(safeConfig.containerId) : null;

  if (!container) {
    throw new Error(`Timeline container #${safeConfig.containerId} was not found`);
  }

  return { config: safeConfig, container };
}

