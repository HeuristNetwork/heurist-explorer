/**
 * @file TimelineContext.js
 * @brief Defines the internal representation of an individual timeline context or band.
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
 * One independently loaded timeline band or context.
 */
export class TimelineContext {
  /**
   * Creates a normalized timeline context object.
   *
   * @param {object} [value={}] - Raw context data.
   * @param {number} [index=0] - Index used when generating fallback IDs.
   */
  constructor(value = {}, index = 0) {
    this.id = String(value.id || `context-${index + 1}`);
    this.title = String(value.title || `Band ${index + 1}`);
    this.query = value.query ?? null;
    this.ids = normalizeIds(value.ids);
    this.datasetId = positiveId(value.datasetId);
    this.source = value.source || (this.datasetId ? "dataset" : "query");
    this.timefields = normalizeFields(value.timefields);
    this.fields = normalizeFields(value.fields);
    this.visible = value.visible !== false;
    this.options = { ...(value.options || {}) };
    this.response = null;
  }

  /**
   * Serializes the context to a plain JSON-safe structure.
   *
   * @returns {object} Plain context object for persistence or transport.
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      query: this.query,
      ids: [...this.ids],
      datasetId: this.datasetId,
      source: this.source,
      timefields: [...this.timefields],
      fields: [...this.fields],
      visible: this.visible,
      options: { ...this.options },
    };
  }
}

/**
 * Normalizes a list of fields or a comma-separated field list.
 *
 * @param {Array|string|undefined} value - Raw field source.
 * @returns {Array<string>} Sanitized field names.
 */
function normalizeFields(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(String).map((entry) => entry.trim()).filter(Boolean))];
  }

  if (typeof value === "string") {
    return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
  }

  return [];
}

/**
 * Converts raw IDs into unique positive integer values.
 *
 * @param {Array|undefined} value - Raw record identifiers.
 * @returns {Array<number>} Sanitized IDs.
 */
function normalizeIds(value) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

/**
 * Validates a dataset ID and strips invalid values.
 *
 * @param {number|string|null|undefined} value - Candidate dataset ID.
 * @returns {number|null} Parsed positive integer or null.
 */
function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

