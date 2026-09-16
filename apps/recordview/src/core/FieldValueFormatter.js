/**
 * @file FieldValueFormatter.js
 * @brief Resolve Heurist detail values according to fieldset output options.
 *
 * NOTE: this is now the *third* independent copy of this exact field-value
 * projection logic (heurist-data, heurist-graph, heurist-recordview). Per
 * `docs/architecture.md`'s migration policy ("shared extraction requires
 * explicit common contracts plus passing tests for both consumers"), three
 * real, identical consumers is the point at which extracting a shared
 * `#shared` contract should be seriously considered. Not done as part of
 * adding RecordView, to keep that change's scope to the new application —
 * but the next person touching any of these three copies should weigh
 * unifying them instead of editing a fourth place independently.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
/**
 * Project one detail value to a display string per its fieldset output option (`ext`).
 *
 * @param {*} item Raw detail value (a term/file/geo/plain-value object, or a scalar).
 * @param {string|null} [ext] Output option: `term`, `code`, `conceptid`, `id`, `url`, `thumb`, `wkt`, `geojson`, `pair`, `iso`, `human`, `raw`, or a bare object key.
 * @returns {*} Projected value; `''` for `null`/`undefined` input.
 */
export function projectFieldValue(item, ext = null) {
  if (item == null) return "";
  if (typeof item !== "object") return item;
  const key = String(ext || "").toLowerCase();

  if (key === "term")
    return first(item.trm_Label, item.term, item.label, item.value);
  if (key === "code") return first(item.trm_Code, item.code, item.value);
  if (key === "conceptid")
    return first(item.trm_ConceptCode, item.conceptId, item.conceptid);
  if (key === "id")
    return first(
      item.trm_ID,
      item.rec_ID,
      item.file?.ulf_ID,
      item.ulf_ID,
      item.id,
      item.value,
    );
  if (key === "url")
    return first(
      item.file?.ulf_ExternalFileReference,
      item.file?.fullPath,
      item.url,
      item.fileUrl,
    );
  if (key === "thumb")
    return first(
      item.file?.thumbnailUrl,
      item.thumbnailUrl,
      item.thumbnail,
      item.thumb,
    );
  if (key === "wkt") return first(item.geo?.wkt, item.wkt);
  if (key === "geojson")
    return serialize(first(item.geo?.geojson, item.geojson, item.geo));
  if (key === "pair") return coordinatePair(item.geo || item);
  if (key === "iso") return first(item.iso, item.value, item.raw);
  if (key === "human")
    return humanDate(first(item.human, item.display, item.value, item.raw));
  if (key === "raw") return serialize(first(item.raw, item.value, item));
  if (key && item[ext] != null) return serialize(item[ext]);

  return serialize(
    first(
      item.trm_Label,
      item.rec_Title,
      item.file?.ulf_Caption,
      item.file?.ulf_OrigFileName,
      item.file?.ulf_ExternalFileReference,
      item.file?.fullPath,
      item.geo?.wkt,
      item.value,
      item.label,
      item.title,
      item.code,
      item.id,
      "",
    ),
  );
}

/**
 * Read and project every value of a field on a record.
 *
 * @param {object} record Heurist record (`rec_*` fields plus a `details` map).
 * @param {{field: string, ext?: string}} field Field descriptor: `field` is `rec_*` or a detail-type code; `ext` selects the output projection.
 * @returns {Array<*>} Projected values, one per raw value (single-valued fields yield a one-element array).
 */
export function fieldValues(record, field) {
  const raw = String(field.field).startsWith("rec_")
    ? record?.[field.field]
    : record?.details?.[field.field];
  return (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).map((item) =>
    projectFieldValue(item, field.ext),
  );
}

/**
 * Read and project a field's values, joined into one display string.
 *
 * @param {object} record Heurist record.
 * @param {{field: string, ext?: string}} field Field descriptor; see `fieldValues`.
 * @param {string} [separator=' | '] Separator joining multiple values.
 * @returns {string} Joined display string.
 */
export function displayFieldValue(record, field, separator = " | ") {
  return fieldValues(record, field)
    .map((value) => String(value ?? ""))
    .join(separator);
}

/** Return the first defined, non-null value among the arguments, or `''`. */
function first(...values) {
  return values.find((value) => value !== null && value !== undefined) ?? "";
}

/** JSON-stringify an object value; pass scalars through, and `''` for `null`/`undefined`. */
function serialize(value) {
  if (value == null) return "";
  if (typeof value !== "object") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Render a geo value as a `"lat,lng"` pair, falling back to its raw WKT point or string. */
function coordinatePair(value) {
  const lat = value?.lat ?? value?.latitude;
  const lng = value?.lng ?? value?.lon ?? value?.longitude;
  if (lat != null && lng != null) return `${lat},${lng}`;
  const wkt = String(value?.wkt || "");
  const match = wkt.match(/^POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i);
  return match ? `${match[2]},${match[1]}` : wkt;
}

/** Format an ISO-like date string as a locale-medium date, falling back to the raw text. */
function humanDate(value) {
  const text = String(value ?? "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  if (!match) return text;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`),
    );
  } catch {
    return text;
  }
}
