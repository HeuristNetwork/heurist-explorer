/**
 * @file exportParams.js
 * @brief Pure helpers of the Export tool: settings, columns per record type and job parameters.
 *
 * The Export tool (plan 13) starts the background job type "export"; the server checks
 * the parameters again (srv/Records/Export/ExportRequest.php). Field codes are those of
 * the /records `fields` parameter and of the QSE column fields; enum outputs use the
 * report names term | code | conceptid | desc | internalid.
 *
 * Columns of a record type = its preset (minimal | metadata | all | custom; custom without
 * fields = minimal) merged with the marked data source settings (column fields, geo fields,
 * time fields) that fit the record type.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/**
 * Export formats: value, caption and what applies to them - columns (with value formats),
 * expansion rules, geo fields (geometry), the "names and local ids" option.
 */
export const EXPORT_FORMATS = [
  { value: 'xml', label: 'XML (HML)', columns: false, rules: true, geo: false, names: true },
  { value: 'json', label: 'JSON', columns: false, rules: true, geo: false, names: true },
  { value: 'csv', label: 'CSV (comma-separated)', columns: true, rules: false, geo: false, names: false },
  { value: 'tsv', label: 'TSV (tab-separated)', columns: true, rules: false, geo: false, names: false },
  { value: 'geojson', label: 'GeoJSON', columns: true, rules: false, geo: true, names: false },
  { value: 'kml', label: 'KML', columns: true, rules: false, geo: true, names: false },
  { value: 'gephi', label: 'Gephi (GEXF)', columns: true, rules: true, geo: false, names: false }
];

/** Value format choices (first = default); used by the formats with columns only. */
export const VALUE_CHOICES = {
  date: [['raw', 'Raw'], ['readable', 'Human readable']],
  file: [['url', 'File URL'], ['details', 'Full info'], ['id', 'ID']]
};

/** Column presets of a record type. */
export const COLUMN_MODES = [['minimal', 'Minimal'], ['metadata', 'Metadata'], ['all', 'All'], ['custom', 'Custom']];

/** Minimal columns: record id, record type and title. */
export const MINIMAL_FIELDS = ['rec_ID', 'rec_RecTypeID', 'rec_Title'];

/** Metadata columns: the minimal columns and the other header fields. */
export const METADATA_FIELDS = [...MINIMAL_FIELDS, 'rec_URL', 'rec_Added', 'rec_Modified', 'rec_AddedByUGrpID',
  'rec_OwnerUGrpID', 'rec_NonOwnerVisibility'];

/** Field types that have no values to export (layout and relationship markers). */
const NO_VALUE_TYPES = new Set(['separator', 'relmarker']);

/** "Any" link kinds of the expansion. */
export const ANY_LINK_KINDS = [
  ['connected', 'Any pointer or relationship'],
  ['links', 'Any pointer'],
  ['lf', 'Any outgoing pointer'],
  ['lt', 'Any incoming pointer'],
  ['related', 'Any relationship']
];

/** Depths of the "Any" expansion (levels reached from the result). */
export const ANY_DEPTHS = [1, 2, 3, 4];

/** Record limit choices (0 = all). */
export const LIMIT_CHOICES = [0, 50, 1000, 5000, 10000, 100000, 500000];

/** Records of a Gephi export at most (server: ExportRequest::GEPHI_MAX). */
export const GEPHI_MAX = 10000;

/** Default settings of the form. */
export function defaultExportState() {
  return {
    scope: 'result',
    format: 'xml',
    columnModes: {},
    columns: {},
    useColumnFields: true,
    useGeoFields: true,
    useTimeFields: true,
    rulesMode: 'none',
    anyKind: 'connected',
    anyDepth: 1,
    customRules: null,
    values: { date: 'raw', file: 'url', pointerTitle: true, termHierarchy: true },
    csv: { sep: ',', quote: '"', mvsep: '|', header: true, eol: 'nix' },
    names: false,
    limit: 0,
    fileName: ''
  };
}

/**
 * Format descriptor.
 *
 * @param {string} format Format value.
 * @returns {{value:string,label:string,columns:boolean,rules:boolean,geo:boolean,names:boolean}}
 */
export function exportFormat(format) {
  return EXPORT_FORMATS.find((item) => item.value === format) || EXPORT_FORMATS[0];
}

/**
 * Record type chosen in the scope select ("rt:<id>"), else null.
 *
 * @param {string} scope Scope value.
 * @returns {number|null}
 */
export function scopeRecordType(scope) {
  const match = /^rt:(\d+)$/.exec(String(scope || ''));
  return match ? Number(match[1]) : null;
}

/**
 * Limit choices of a format: Gephi only up to GEPHI_MAX (no "all").
 *
 * @param {string} format Format value.
 * @returns {number[]}
 */
export function limitChoices(format) {
  return format === 'gephi' ? LIMIT_CHOICES.filter((value) => value > 0 && value <= GEPHI_MAX) : LIMIT_CHOICES;
}

/**
 * The limit after a format change: "All", or the largest choice of Gephi.
 *
 * @param {string} format Format value.
 * @returns {number}
 */
export function defaultLimit(format) {
  return limitChoices(format)[0] === 0 ? 0 : limitChoices(format).at(-1);
}

/**
 * The limit sent for a format: a value the format allows (Gephi: at most GEPHI_MAX).
 *
 * @param {number} limit Chosen limit (0 = all).
 * @param {string} format Format value.
 * @returns {number}
 */
export function effectiveLimit(limit, format) {
  const value = Math.max(0, Math.trunc(Number(limit) || 0));
  if (format === 'gephi' && (value === 0 || value > GEPHI_MAX)) return GEPHI_MAX;
  return value;
}

/**
 * Expansion rules of the "Any" choice: one rule reaching any record type through the
 * link kind, repeated to the depth (each level from the previous one).
 *
 * @param {string} kind connected | links | lf | lt | related.
 * @param {number} depth 1..4.
 * @returns {Array<object>} Rules (DataSource rule format).
 */
export function anyRules(kind, depth) {
  const key = ANY_LINK_KINDS.some(([value]) => value === kind) ? kind : 'connected';
  const levels = Math.min(Math.max(1, Math.trunc(Number(depth) || 1)), ANY_DEPTHS.at(-1));
  let rule = null;
  for (let level = 0; level < levels; level += 1) {
    rule = { query: { [key]: [] }, levels: rule ? [rule] : [] };
  }
  return [rule];
}

/**
 * Field codes of a path belong to its first record type ("10:lf134:12:1" → 10).
 *
 * @param {string} code Field code.
 * @returns {number|null} Null for header fields and plain field ids (any type).
 */
export function fieldCodeRecordType(code) {
  const match = /^(\d+):/.exec(String(code || ''));
  return match ? Number(match[1]) : null;
}

/**
 * Fields of the DataSource (column, geo or time fields) that fit one record type: header
 * fields, fields of its structure and paths that start from it. The QSE "id" enum output
 * is kept; the server reads it as "internalid".
 *
 * @param {Array<object|string>} fields Field descriptors or codes.
 * @param {number} rtyId Record type.
 * @param {object|null} dbdefs Definitions (HDbDefs); without them every plain field fits.
 * @returns {Array<{field:string,title:string,ext?:string}>}
 */
export function columnsForRecordType(fields, rtyId, dbdefs = null) {
  const result = [];
  for (const item of Array.isArray(fields) ? fields : []) {
    const code = String(typeof item === 'object' && item ? item.field ?? '' : item ?? '').trim();
    if (!code || (typeof item === 'object' && item?.visible === false)) continue;
    const owner = fieldCodeRecordType(code);
    let fits;
    if (owner !== null) fits = owner === Number(rtyId);
    else if (/^\d+$/.test(code)) fits = !dbdefs || Boolean(dbdefs.field?.(Number(rtyId), Number(code)));
    else fits = /^rec_/i.test(code);
    if (!fits) continue;
    const column = { field: code, title: (typeof item === 'object' && item?.title) || code };
    if (typeof item === 'object' && item?.ext) column.ext = String(item.ext);
    result.push(column);
  }
  return result;
}

/**
 * Column, geo and time fields of a DataSource.
 *
 * @param {object|null} source DataSource.
 * @returns {{columns:Array, geo:string[], time:string[]}}
 */
export function dataSourceFields(source) {
  const presentation = source?.presentation || {};
  const codes = (list) => (Array.isArray(list) ? list : [])
    .map((item) => String(typeof item === 'object' && item ? item.field ?? '' : item ?? '').trim())
    .filter(Boolean);
  return {
    columns: Array.isArray(presentation.data?.fields) ? presentation.data.fields : [],
    geo: codes(presentation.map?.geoFields ?? presentation.map?.geofields),
    time: codes(presentation.timeline?.fields ?? presentation.timeline?.timefields)
  };
}

/**
 * Columns of the preset of a record type.
 *
 * @param {string} mode minimal | metadata | all | custom.
 * @param {number} rtyId Record type.
 * @param {Array<object>} custom Custom columns (custom without fields = minimal).
 * @param {object|null} dbdefs Definitions (fields of the record type for "all").
 * @returns {Array<{field:string,ext?:string}>}
 */
export function presetColumns(mode, rtyId, custom = [], dbdefs = null) {
  const fields = (codes) => codes.map((field) => ({ field }));
  switch (mode) {
    case 'metadata':
      return fields(METADATA_FIELDS);
    case 'all':
      return [...fields(METADATA_FIELDS), ...(dbdefs?.fields?.(rtyId) || [])
        .filter((field) => !NO_VALUE_TYPES.has(field.type))
        .map((field) => ({ field: String(field.id) }))];
    case 'custom':
      return Array.isArray(custom) && custom.length
        ? custom.map((column) => (column.ext ? { field: column.field, ext: column.ext } : { field: column.field }))
        : fields(MINIMAL_FIELDS);
    default:
      return fields(MINIMAL_FIELDS);
  }
}

/**
 * Columns of a record type: its preset merged with the marked data source fields
 * (geo fields only for the geo formats), each field and output once.
 *
 * @param {object} state Form state.
 * @param {number} rtyId Record type.
 * @param {object|null} source DataSource.
 * @param {object|null} dbdefs Definitions.
 * @returns {Array<{field:string,ext?:string}>}
 */
export function recordTypeColumns(state, rtyId, source = null, dbdefs = null) {
  const format = exportFormat(state.format);
  const fromSource = dataSourceFields(source);
  const list = [...presetColumns(state.columnModes?.[rtyId] || 'minimal', rtyId, state.columns?.[rtyId], dbdefs)];
  if (state.useColumnFields) list.push(...columnsForRecordType(fromSource.columns, rtyId, dbdefs));
  if (state.useGeoFields && format.geo) list.push(...columnsForRecordType(fromSource.geo, rtyId, dbdefs));
  if (state.useTimeFields) list.push(...columnsForRecordType(fromSource.time, rtyId, dbdefs));
  const seen = new Set();
  return list.filter((column) => {
    const key = `${column.field}|${column.ext || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((column) => (column.ext ? { field: column.field, ext: column.ext } : { field: column.field }));
}

/**
 * Expansion rules of the settings, or null for none (only the formats with expansion).
 *
 * @param {object} state Form state.
 * @param {Array<object>|null} sourceRules Rules of the DataSource.
 * @returns {Array<object>|null}
 */
export function exportRules(state, sourceRules = null) {
  if (!exportFormat(state.format).rules) return null;
  switch (state.rulesMode) {
    case 'any': return anyRules(state.anyKind, state.anyDepth);
    case 'source': return Array.isArray(sourceRules) && sourceRules.length ? sourceRules : null;
    case 'custom': return Array.isArray(state.customRules) && state.customRules.length ? state.customRules : null;
    default: return null;
  }
}

/**
 * Parameters of the "export" job.
 *
 * @param {object} state Form state (see defaultExportState()).
 * @param {object} context Current data: `query`, `title`, `selection` (ids), `rules` (of the
 *        DataSource), `source` (the DataSource), `recordTypes` (ids of the result), `dbdefs`.
 * @returns {object} Job parameters.
 */
export function buildExportParams(state, context = {}) {
  const format = exportFormat(state.format);
  const scope = { query: context.query ?? null };
  const rectype = scopeRecordType(state.scope);
  if (state.scope === 'selection') scope.ids = (context.selection || []).map(Number).filter((id) => id > 0);
  if (rectype) scope.rectypes = [rectype];

  const params = {
    format: format.value,
    scope,
    limit: effectiveLimit(state.limit, format.value),
    title: context.title || ''
  };
  if (state.fileName) params.fileName = String(state.fileName).trim();

  const rules = exportRules(state, context.rules);
  if (rules) params.rules = rules;

  if (format.columns) {
    params.values = { ...state.values };
    const columns = {};
    for (const rtyId of rectype ? [rectype] : (context.recordTypes || [])) {
      const list = recordTypeColumns(state, rtyId, context.source, context.dbdefs)
        .map((column) => (column.ext ? column : column.field));
      if (list.length) columns[rtyId] = list;
    }
    params.columns = columns;
    const fromSource = dataSourceFields(context.source);
    if (format.geo && state.useGeoFields && fromSource.geo.length) params.geofields = fromSource.geo;
    if (format.value === 'kml' && state.useTimeFields && fromSource.time.length) params.timefields = fromSource.time;
  }
  if (format.names) params.names = state.names === true;
  if (format.value === 'csv' || format.value === 'tsv') {
    params.csv = { ...state.csv, sep: format.value === 'tsv' ? 'tab' : state.csv.sep };
  }
  return params;
}

/**
 * Problems that prevent an export (empty list = ready).
 *
 * @param {object} state Form state.
 * @param {object} context `query`, `selection`, `rules`.
 * @returns {string[]} Messages (English, localized by the caller).
 */
export function exportProblems(state, context = {}) {
  const problems = [];
  if (state.scope === 'selection' && !(context.selection || []).length) problems.push('No records are selected');
  if (state.scope !== 'selection' && (context.query == null || context.query === '')) problems.push('There is no current result');
  const format = exportFormat(state.format);
  if (format.rules && state.rulesMode === 'source' && !(context.rules || []).length) problems.push('The data source has no expansion rules');
  if (format.rules && state.rulesMode === 'custom' && !(state.customRules || []).length) problems.push('Define the custom expansion rules');
  if (state.fileName && !/^[A-Za-z0-9 _\-()]{1,100}$/.test(state.fileName)) {
    problems.push('The file name may contain only letters, digits, spaces, "-", "_", "(" and ")"');
  }
  if (format.value === 'csv' && String(state.csv?.sep || '').length !== 1) problems.push('The CSV separator must be one character');
  return problems;
}

/**
 * Record types with counts from `/records detail=rectypes`, largest first.
 *
 * @param {Array<{rec_RecTypeID:number,count:number}>} rows Server rows.
 * @param {object|null} dbdefs Names.
 * @returns {Array<{id:number,name:string,count:number}>}
 */
export function recordTypeList(rows, dbdefs = null) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: Number(row.rec_RecTypeID),
      name: dbdefs?.rectypeName?.(Number(row.rec_RecTypeID)) || `#${row.rec_RecTypeID}`,
      count: Number(row.count) || 0
    }))
    .filter((row) => row.id > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
