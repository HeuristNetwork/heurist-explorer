/**
 * @file FieldValueFormatter.js
 * @brief Resolve Heurist detail values according to fieldset output options.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
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

export function fieldValues(record, field) {
  const raw = String(field.field).startsWith("rec_")
    ? record?.[field.field]
    : record?.details?.[field.field];
  return (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).map((item) =>
    projectFieldValue(item, field.ext),
  );
}

export function displayFieldValue(record, field, separator = " | ") {
  return fieldValues(record, field)
    .map((value) => String(value ?? ""))
    .join(separator);
}

export function sanitizeTextHtml(value) {
  const allowed = new Set(["u", "i", "b", "strong", "em"]);
  return String(value ?? "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (tag, name) => {
      const normalized = name.toLowerCase();
      if (!allowed.has(normalized)) return "";
      return tag.startsWith("</") ? `</${normalized}>` : `<${normalized}>`;
    });
}

export function stripHtml(value) {
  return String(value ?? "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<[^>]*>/g, "");
}

function serialize(value) {
  if (value == null) return "";
  if (typeof value !== "object") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function first(...values) {
  return values.find((value) => value !== null && value !== undefined) ?? "";
}

function coordinatePair(value) {
  const lat = value?.lat ?? value?.latitude;
  const lng = value?.lng ?? value?.lon ?? value?.longitude;
  if (lat != null && lng != null) return `${lat},${lng}`;
  const wkt = String(value?.wkt || "");
  const match = wkt.match(/^POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i);
  return match ? `${match[2]},${match[1]}` : wkt;
}

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
