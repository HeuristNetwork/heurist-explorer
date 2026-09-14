/**
 * @file Dataset.js
 * @brief Engine-neutral Dataset domain model.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

const AGGREGATIONS = new Set(["count", "sum", "avg", "min", "max"]);

/** Represents a normalized persisted or transient Dataset definition. */
export class Dataset {
  constructor(definition = {}) {
    const value = normalizeDataset(definition);
    Object.assign(this, value);
  }

  /** Return unique field codes in their configured order. */
  getFieldCodes() {
    return [...new Set(this.fields.map((field) => field.field))];
  }

  /** Return a serializable copy of the Dataset definition. */
  toJSON() {
    return {
      format: this.format,
      version: this.version,
      id: this.id,
      title: this.title,
      description: this.description,
      source: structuredCloneSafe(this.source),
      fields: structuredCloneSafe(this.fields),
    };
  }
}

export function normalizeDataset(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Dataset definition must be an object");
  }
  if (value.format && value.format !== "heurist-dataset") {
    throw new TypeError(`Unsupported Dataset format: ${value.format}`);
  }
  const source =
    value.source && typeof value.source === "object" ? { ...value.source } : {};
  if (source.query == null || source.query === "") {
    throw new TypeError("Dataset source query is required");
  }
  return {
    format: "heurist-dataset",
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
    fields: normalizeDatasetFields(value.fields),
  };
}

export function normalizeDatasetFields(fields = []) {
  if (!Array.isArray(fields))
    throw new TypeError("Dataset fields must be an array");
  return fields.map((item) => {
    const value =
      typeof item === "string" || typeof item === "number"
        ? { field: String(item) }
        : item;
    if (!value || typeof value !== "object")
      throw new TypeError("Invalid Dataset field");
    const field = String(value.field ?? value.code ?? "").trim();
    if (!field) throw new TypeError("Dataset field code is required");
    const aggregation =
      value.aggregation == null || value.aggregation === ""
        ? null
        : String(value.aggregation);
    if (aggregation && !AGGREGATIONS.has(aggregation)) {
      throw new TypeError(`Unsupported Dataset aggregation: ${aggregation}`);
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

function positiveIntegerOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1)
    throw new TypeError("ID must be a positive integer");
  return number;
}

function structuredCloneSafe(value) {
  if (value == null) return value;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
