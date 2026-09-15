/**
 * @file TimelineResponse.js
 * @brief Defines the reserved timeline response format and version for the future
 *        timeline integration phase.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Format identifier for the reserved Phase 2 timeline response. */
export const TIMELINE_FORMAT = 'heurist-timeline';

/** Current reserved timeline response schema version. */
export const TIMELINE_VERSION = 1;

/**
 * Whether a value matches the reserved Phase 2 timeline response shape.
 *
 * Timeline loading/rendering is not connected until the dedicated timeline phase.
 *
 * @param {*} value Candidate value.
 * @returns {boolean} `true` when `value` matches the reserved timeline response shape.
 */
export function isTimelineResponse(value) {
  return Boolean(
    value
    && value.format === TIMELINE_FORMAT
    && value.version === TIMELINE_VERSION
    && Array.isArray(value.items)
    && value.meta
    && typeof value.meta === 'object'
  );
}
