/**
 * @file FilterSearchRequest.js
 * @brief Converts a saved filter definition into a Heurist search request.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
export function createFilterSearchRequest(filter, runtime = {}) {
  const definition = parseDefinition(filter?.query);
  const request = {
    q: definition.q ?? "",
    detail: "ids",
    isNewEngine: true,
    search_realm: runtime.searchRealm ?? null,
    source: runtime.source ?? null,
  };
  if (definition.rules !== undefined) request.rules = definition.rules;
  if (definition.rulesonly !== undefined)
    request.rulesonly = definition.rulesonly;
  return request;
}

function parseDefinition(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return { q: "" };
  const text = value.trim();
  if (!text) return { q: "" };
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : { q: value };
  } catch {
    return { q: value };
  }
}
