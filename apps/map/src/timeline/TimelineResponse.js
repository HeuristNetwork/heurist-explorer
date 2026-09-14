/**
 * TimelineResponse.js - Reserved timeline contract
 *
 * @fileOverview Defines the reserved timeline response format and version for the future timeline integration phase.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

export const TIMELINE_FORMAT = 'heurist-timeline';
export const TIMELINE_VERSION = 1;

/**
 * Reserved Phase 2 timeline response shape. Timeline loading/rendering is not
 * connected until the dedicated timeline phase.
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
