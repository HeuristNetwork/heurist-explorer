/**
 * @file QuerySource.js
 * @brief Engine-neutral Query Source domain model.
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

const AGGREGATIONS = new Set(["count", "sum", "avg", "min", "max"]);

/** Represents a normalized persisted or transient Query Source definition. */
export class QuerySource {
  /** @param {object} [definition] Raw Query Source definition; normalized and assigned onto this instance. */
  constructor(definition = {}) {
    const value = normalizeQuerySource(definition);
    Object.assign(this, value);
  }

  /** Return unique field codes in their configured order. */
  getFieldCodes() {
    return [...new Set(this.fields.map((field) => field.field))];
  }

  /** Return a serializable copy of the Query Source definition. */
  toJSON() {
    return {
      format: this.format,
      version: this.version,
      id: this.id,
      title: this.title,
      description: this.description,
      source: structuredCloneSafe(this.source),
      fields: structuredCloneSafe(this.fields),
      timefields: structuredCloneSafe(this.timefields),
      map: structuredCloneSafe(this.map),
      rules: structuredCloneSafe(this.rules),
    };
  }
}

/**
 * Validate and normalize a raw Query Source definition.
 *
 * @param {object} [value] Raw Query Source definition.
 * @returns {object} Normalized Query Source fields, ready to assign onto a `QuerySource` instance.
 * @throws {TypeError} When `value` is not an object, has an unsupported format, or lacks a source query.
 */
export function normalizeQuerySource(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Query Source definition must be an object");
  }
  if (value.format && value.format !== "heurist-query-source") {
    throw new TypeError(`Unsupported Query Source format: ${value.format}`);
  }
  const source =
    value.source && typeof value.source === "object" ? { ...value.source } : {};
  if (source.query == null || source.query === "") {
    throw new TypeError("Query Source source query is required");
  }
  return {
    format: "heurist-query-source",
    version: Number(value.version) || 1,
    id: positiveIntegerOrNull(value.id),
    title: String(value.title || ""),
    description: String(value.description || ""),
    source: {
      type: source.type || "heurist-query",
      recordId: positiveIntegerOrNull(source.recordId),
      title: String(source.title || ""),
      query: structuredCloneSafe(source.query),
    },
    fields: normalizeQuerySourceFields(value.fields),
    timefields: normalizeQuerySourceFields(value.timefields),
    map: normalizeQuerySourceMap(value.map),
    // Expansion rules are opaque to the client (GraphExpansions consumes
    // them as-is) - passed through unvalidated; the server already validated
    // them (ExpansionRuleParser) before ever sending them here.
    rules: Array.isArray(value.rules) ? value.rules : [],
  };
}

/**
 * Normalize a Query Source's `map` presentation profile (geo fields and viewport hints).
 *
 * @param {object} [value] Raw `map` value.
 * @returns {{geoFields: Array<object>, dynamicRequests: boolean, minZoom: number|null, maxZoom: number|null}}
 */
function normalizeQuerySourceMap(value) {
  const map = value && typeof value === "object" ? value : {};
  return {
    geoFields: normalizeQuerySourceFields(map.geoFields),
    dynamicRequests: map.dynamicRequests === true,
    minZoom: finiteNumberOrNull(map.minZoom),
    maxZoom: finiteNumberOrNull(map.maxZoom),
  };
}

/**
 * Validate and normalize a Query Source's field list.
 *
 * @param {Array<string|number|object>} [fields] Raw field list (bare codes or field descriptor objects).
 * @returns {Array<object>} Normalized field descriptors.
 * @throws {TypeError} When `fields` is not an array, or a field is invalid, codeless, or has an unsupported aggregation.
 */
export function normalizeQuerySourceFields(fields = []) {
  if (!Array.isArray(fields))
    throw new TypeError("Query Source fields must be an array");
  return fields.map((item) => {
    const value =
      typeof item === "string" || typeof item === "number"
        ? { field: String(item) }
        : item;
    if (!value || typeof value !== "object")
      throw new TypeError("Invalid Query Source field");
    const field = String(value.field ?? value.code ?? "").trim();
    if (!field) throw new TypeError("Query Source field code is required");
    const aggregation =
      value.aggregation == null || value.aggregation === ""
        ? null
        : String(value.aggregation);
    if (aggregation && !AGGREGATIONS.has(aggregation)) {
      throw new TypeError(`Unsupported Query Source aggregation: ${aggregation}`);
    }
    return {
      field,
      title: value.title == null ? null : String(value.title),
      visible: value.visible !== false,
      width:
        value.width == null || value.width === "" ? null : String(value.width),
      aggregation,
      ext:
        (value.ext ?? value.output) == null ||
        (value.ext ?? value.output) === ""
          ? null
          : String(value.ext ?? value.output),
    };
  });
}

/**
 * Normalize an id value to a positive integer, or `null` when empty.
 *
 * @throws {TypeError} When the value is present but not a positive integer.
 */
function positiveIntegerOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1)
    throw new TypeError("ID must be a positive integer");
  return number;
}

/** Normalize a value to a finite number, or `null` when empty or invalid. */
function finiteNumberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Deep-clone a JSON-safe value, tolerating `null`/`undefined`. */
function structuredCloneSafe(value) {
  if (value == null) return value;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
