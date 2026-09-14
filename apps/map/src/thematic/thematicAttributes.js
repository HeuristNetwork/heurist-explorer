/**
 * thematicAttributes.js - Thematic attribute helpers
 *
 * @fileOverview Identifies the active thematic map, extracts requested field-path codes, and merges API values into GeoJSON features.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

const GEO_FIELD_CODE = 'rec_GeoField';

/** Return the single active thematic map from a normalized layer style. */
export function getActiveThematicMap(style) {
  if (!style) return null;
  const thematic = style.thematic;
  if (!thematic) return null;

  if (Array.isArray(thematic)) {
    return thematic.find((item) => item && typeof item === 'object' && item.active === true) || null;
  }

  if (Array.isArray(thematic.maps)) {
    return thematic.maps.find((item) => item && typeof item === 'object' && item.active === true) || null;
  }

  if (Array.isArray(thematic.fields) && thematic.active !== false) {
    return thematic;
  }

  return null;
}

/** Return unique field-path codes required by one active thematic map. */
export function getThematicFieldCodes(theme) {
  if (!theme || !Array.isArray(theme.fields)) return [];
  return [...new Set(theme.fields
    .map((field) => String(field?.code ?? '').trim())
    .filter((code) => code && code !== GEO_FIELD_CODE))];
}


/** Return unique field-path codes required by all configured thematic maps. */
export function getAllThematicFieldCodes(style) {
  const thematic = Array.isArray(style?.thematic)
    ? style.thematic
    : Array.isArray(style?.thematic?.maps)
      ? style.thematic.maps
      : style?.thematic && Array.isArray(style.thematic.fields)
        ? [style.thematic]
        : [];

  const codes = [];
  const seen = new Set();
  for (const theme of thematic) {
    for (const code of getThematicFieldCodes(theme)) {
      if (seen.has(code)) continue;
      seen.add(code);
      codes.push(code);
    }
  }
  return codes;
}

/** Return a cloned style with exactly one thematic map active, or none for default symbology. */
export function activateThematicMap(style, themeIndex = null) {
  const source = style && typeof style === 'object' ? style : {};
  const thematic = Array.isArray(source.thematic) ? source.thematic : [];
  const selected = themeIndex == null ? null : Number(themeIndex);
  if (selected != null && (!Number.isInteger(selected) || selected < 0 || selected >= thematic.length)) {
    throw new RangeError(`Unknown thematic map index "${themeIndex}"`);
  }
  return {
    ...source,
    thematic: thematic.map((theme, index) => ({
      ...theme,
      active: selected != null && index === selected
    }))
  };
}

/** Return unique Heurist record IDs represented by a normalized GeoJSON collection. */
export function collectThematicRecordIds(geoJson) {
  if (!geoJson || !Array.isArray(geoJson.features)) return [];
  const ids = [];
  const seen = new Set();
  for (const feature of geoJson.features) {
    const id = Number(
      feature?.properties?.heurist?.recordId
      ?? feature?.properties?.rec_ID
      ?? feature?.properties?.recordId
      ?? feature?.recordId
    );
    if (!Number.isInteger(id) || id < 1 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Attach the records response to normalized GeoJSON features under
 * properties.thematic, keyed by the exact requested field-path code.
 */
export function applyThematicAttributes(geoJson, response) {
  if (!geoJson || !Array.isArray(geoJson.features)) return geoJson;
  const records = Array.isArray(response?.records) ? response.records : [];
  const detailsByRecordId = new Map();

  for (const record of records) {
    const id = Number(record?.rec_ID);
    if (!Number.isInteger(id) || id < 1) continue;
    detailsByRecordId.set(id, isObject(record.details) ? record.details : {});
  }

  for (const feature of geoJson.features) {
    if (!feature || typeof feature !== 'object') continue;
    const properties = isObject(feature.properties) ? feature.properties : {};
    const recordId = Number(
      properties.heurist?.recordId
      ?? properties.rec_ID
      ?? properties.recordId
      ?? feature.recordId
    );
    const sourceDetails = Number.isInteger(recordId) && recordId > 0
      ? detailsByRecordId.get(recordId) || {}
      : {};
    properties.thematic = matchDetailsToFeature(
      feature,
      sourceDetails,
      geoJson.meta?.paths || {},
      response?.meta?.paths || {}
    );
    feature.properties = properties;
  }

  return geoJson;
}

/** Keep only thematic occurrences that belong to one geographic occurrence. */
export function matchDetailsToFeature(
  feature,
  details,
  geometryPaths = {},
  thematicPaths = {}
) {
  if (!isObject(details)) return {};
  const featurePath = isObject(feature?.properties?._path)
    ? feature.properties._path
    : null;
  // Records mode and direct geometry represent the top record as a whole.
  if (!featurePath) return cloneDetails(details);

  const geometryCode = pathDefinition(geometryPaths, featurePath.id);
  const geometryRecordIds = normalizePathRecordIds(featurePath.recordIDs);
  const matched = {};

  for (const [fieldCode, rawValues] of Object.entries(details)) {
    const values = detailOccurrences(rawValues);
    const accepted = values.filter((item) => {
      const thematicPath = isObject(item?.path) ? item.path : null;
      // A direct top-record attribute applies to every occurrence of that top.
      if (!thematicPath) return true;
      const thematicCode = pathDefinition(thematicPaths, thematicPath.id)
        || traversalFromFieldCode(fieldCode);
      const thematicRecordIds = normalizePathRecordIds(thematicPath.recordIDs);
      return pathOccurrencesMatch(
        geometryCode,
        geometryRecordIds,
        thematicCode,
        thematicRecordIds
      );
    });
    if (accepted.length) matched[fieldCode] = cloneDetails(accepted);
  }
  return matched;
}

/** Compare the actual record prefix shared by two configured compact paths. */
export function pathOccurrencesMatch(
  geometryCode,
  geometryRecordIds,
  thematicCode,
  thematicRecordIds
) {
  if (!geometryRecordIds.length || !thematicRecordIds.length) return false;
  const prefixLength = commonPathRecordLength(geometryCode, thematicCode);
  const required = Math.max(1, prefixLength);
  if (geometryRecordIds.length < required || thematicRecordIds.length < required) return false;
  for (let index = 0; index < required; index += 1) {
    if (geometryRecordIds[index] !== thematicRecordIds[index]) return false;
  }
  return true;
}

function commonPathRecordLength(leftCode, rightCode) {
  const left = pathSteps(leftCode);
  const right = pathSteps(rightCode);
  if (!left || !right || left.root !== right.root) return 1;
  let records = 1;
  const count = Math.min(left.steps.length, right.steps.length);
  for (let index = 0; index < count; index += 1) {
    const leftStep = left.steps[index];
    const rightStep = right.steps[index];
    if (leftStep.operator !== rightStep.operator || leftStep.recordType !== rightStep.recordType) break;
    records += /^(rt|rf)/i.test(leftStep.operator) ? 2 : 1;
  }
  return records;
}

function pathSteps(code) {
  const tokens = String(code || '').split(':').map((item) => item.trim()).filter(Boolean);
  if (!tokens.length || !/^\d+$/.test(tokens[0])) return null;
  const steps = [];
  for (let index = 1; index + 1 < tokens.length; index += 2) {
    if (!/^(lt|lf|rt|rf)\d*$/i.test(tokens[index]) || !/^\d+$/.test(tokens[index + 1])) break;
    steps.push({ operator: tokens[index].toLowerCase(), recordType: tokens[index + 1] });
  }
  return { root: tokens[0], steps };
}

function traversalFromFieldCode(code) {
  const tokens = String(code || '').split(':').map((item) => item.trim()).filter(Boolean);
  return tokens.length >= 4 && tokens.length % 2 === 0
    ? tokens.slice(0, -1).join(':')
    : null;
}

function pathDefinition(paths, id) {
  if (!paths || id === null || id === undefined) return null;
  return paths[id] ?? paths[String(id)] ?? null;
}

function normalizePathRecordIds(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value));
}

function detailOccurrences(value) {
  if (Array.isArray(value)) return value;
  if (isObject(value)) return Object.values(value);
  return value == null ? [] : [value];
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cloneDetails(value) {
  if (!isObject(value) && !Array.isArray(value)) return value;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
