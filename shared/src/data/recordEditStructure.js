/**
 * @file recordEditStructure.js
 * @brief Edit form structure of a record type from its `/rst` rows (plan 14 §6).
 *
 * The record structure becomes groups of fields, the same groups/children idea
 * as the HFilterForm layout (plan 05): a separator row starts a group and its
 * `rst_DefaultValue` gives the group presentation, as in the legacy editor
 * (`manageRecords.js`, `editing2.js` __processGroupInside): `tabs`, `tabs_new`,
 * `accordion`, `expanded` and `group_break` are outer groups; `group`,
 * `accordion_inner`, `expanded_inner`, `explanation` and `explanation_break` are
 * inner groups - parts of the previous outer group (outer themselves when there is
 * no previous tabs/accordion group, e.g. after a `group_break`). Fields before the
 * first separator form a plain group without a heading. A forbidden separator only
 * hides its heading: its fields stay in the current group.
 *
 *   {rty, groups: [{id, type: 'tabs'|'accordion'|'group', label, help, inner, newTabs,
 *                   open, explanation, children: [field]}]}
 *   field: {dty, type, label, help, req, max, default, vocabulary, targetTypes,
 *           pointerMode, browseFilter, geoKind, width, height, multilang, concept}
 *
 * Pointer types and vocabularies come from the base field only (`dty_PtrTargetRectypeIDs`,
 * `dty_JsonTermIDTree`); `rst_PtrFilteredIDs` / `rst_FilteredJsonTermIDTree` are ignored
 * (plan 21, Artem 2026-10-19). Exception: the file type field of tiled images and report schedules
 * takes a hard-coded subset vocabulary (`vocabularyOf`, 2026-10-27).
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

import { isWritableRecordType } from './writableRecordTypes.js';
import { relationshipIds } from '../recordview/RecordRelationsProvider.js';

/** `/rst` columns the editor needs. */
export const EDIT_STRUCTURE_DETAILS = [
  'rst_ID', 'rst_DetailTypeID', 'rst_DisplayName', 'rst_DisplayOrder', 'rst_RequirementType', 'rst_DefaultValue',
  'rst_DisplayHelpText', 'rst_MaxValues', 'rst_PointerMode', 'rst_PointerBrowseFilter',
  'rst_DisplayWidth', 'rst_DisplayHeight', 'dty_Type', 'dty_Name', 'dty_JsonTermIDTree', 'dty_PtrTargetRectypeIDs'
].join(',');

/**
 * Presentations of a pointer field (`rst_PointerMode`, plan 21 §5): `dropdown_add` value
 * picker with Browse and Add, `dropdown` picker with Browse, `addorbrowse` the record
 * manager with Add, `addonly` a new record, `browseonly` the record manager without Add.
 */
export const POINTER_MODES = Object.freeze(['dropdown_add', 'dropdown', 'addorbrowse', 'addonly', 'browseonly']);

/**
 * Pointer mode of a field. The database column has the default `addorbrowse`, so a
 * stored `addorbrowse` (or nothing) on a pointer to system record types only means
 * `dropdown_add` (plan 21 §9.2: system types `dropdown_add`, user-data types -
 * RT_REGISTERED_FILE too - `addorbrowse`); other stored values are kept.
 *
 * @param {*} value `rst_PointerMode`.
 * @param {Array<number>} targetTypes Pointer constraint (empty = any type).
 * @param {object|null} dbdefs HDbDefs (system record types).
 * @returns {string} One of POINTER_MODES.
 */
export function resolvePointerMode(value, targetTypes = [], dbdefs = null) {
  const mode = String(value ?? '').trim().toLowerCase();
  const stored = POINTER_MODES.includes(mode) ? mode : '';
  const types = (targetTypes || []).map(Number).filter((id) => id > 0);
  const system = types.length > 0 && types.every((id) => isWritableRecordType(dbdefs, id));
  if (system && (!stored || stored === 'addorbrowse')) return 'dropdown_add';
  return stored || 'addorbrowse';
}

/**
 * Record types whose DT_GEO_OBJECT is a bounding box (Artem 2026-10-27): hard-coded until the record
 * structure gets `allowedFeatureTypes` (any, point, polyline, polygon, rectangle).
 */
const EXTENT_RECORD_TYPES = Object.freeze(['RT_MAP_DOCUMENT', 'RT_KML_SOURCE', 'RT_FILE_SOURCE', 'RT_SHP_SOURCE',
  'RT_QUERY_SOURCE', 'RT_IMAGE_SOURCE', 'RT_TILED_IMAGE_SOURCE']);

/**
 * What the map of a geo field gives: `extent` (a bounding box, the extent picker) or `feature`
 * (any geometry, the drawing).
 *
 * @param {number} rty Record type id.
 * @param {number} dty Field id.
 * @param {object|null} dbdefs HDbDefs (`dbconst`).
 * @returns {'extent'|'feature'}
 */
export function geoKindOf(rty, dty, dbdefs) {
  const id = (code) => Number(dbdefs?.dbconst?.(code)) || 0;
  const geoObject = id('DT_GEO_OBJECT');
  if (!(geoObject > 0) || Number(dty) !== geoObject) return 'feature';
  return EXTENT_RECORD_TYPES.some((code) => id(code) > 0 && id(code) === Number(rty)) ? 'extent' : 'feature';
}

/**
 * Vocabularies of the file type field (DT_FILE_EXT, 2-29) by record type (Artem 2026-10-27): subsets by
 * reference of the extensions vocabulary 2-533. Hard-coded until the record structure can give them.
 */
const FILE_EXT_VOCABULARIES = Object.freeze({
  RT_TILED_IMAGE_SOURCE: 'TRM_TILE_FORMATS', // png jpg jpeg gif webp
  RT_REPORT_SCHEDULE: 'TRM_REPORT_FORMATS' // html csv txt xml json js css
});

/**
 * Vocabulary of a field in a record type: the subset of the file type vocabulary for tiled images and
 * report schedules, else the field's own vocabulary.
 *
 * @param {number} rty Record type id.
 * @param {number} dty Field id.
 * @param {number|null} vocabulary The field's vocabulary.
 * @param {object|null} dbdefs HDbDefs (`dbconst`).
 * @returns {number|null}
 */
export function vocabularyOf(rty, dty, vocabulary, dbdefs) {
  const id = (code) => Number(dbdefs?.dbconst?.(code)) || 0;
  const fileExt = id('DT_FILE_EXT');
  if (!(fileExt > 0) || Number(dty) !== fileExt) return vocabulary;
  for (const [rectype, subset] of Object.entries(FILE_EXT_VOCABULARIES)) {
    // a database without the subset keeps the whole vocabulary
    if (id(rectype) > 0 && id(rectype) === Number(rty) && id(subset) > 0) return id(subset);
  }
  return vocabulary;
}

/** Legacy separator types (`rst_DefaultValue`); anything else is `group`. */
export const SEPARATOR_TYPES = Object.freeze(['group', 'group_break', 'tabs', 'tabs_new', 'accordion',
  'accordion_inner', 'expanded', 'expanded_inner', 'explanation', 'explanation_break']);

/** Separator types that are a part of the previous outer group. */
const INNER_TYPES = new Set(['group', 'accordion_inner', 'expanded_inner', 'explanation', 'explanation_break']);

/**
 * Legacy type of a separator (`rst_DefaultValue`).
 *
 * @param {*} value Separator default value.
 * @returns {string} One of SEPARATOR_TYPES.
 */
export function separatorType(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return SEPARATOR_TYPES.includes(text) ? text : 'group';
}

/**
 * Edit form properties of the separator groups, in order (port of legacy
 * `__processGroupInside`): an inner type after a tabs/accordion group is a part of it;
 * otherwise it is an outer group of the matching type (`group` becomes `group_break`,
 * `accordion_inner` an accordion...). A run of `expanded` groups opens its first one,
 * `accordion` groups are closed.
 *
 * @param {Array<object>} groups Groups with the legacy `kind` (null: fields before the first separator).
 * @returns {void}
 */
function placeGroups(groups) {
  let parent = false; // the previous outer group takes inner groups
  let previousKind = null;
  for (const group of groups) {
    const kind = group.kind;
    delete group.kind;
    if (kind === null) continue;
    const explanation = kind.startsWith('explanation');
    const accordion = kind.startsWith('accordion') || kind.startsWith('expanded');
    const expanded = kind.startsWith('expanded');
    if (INNER_TYPES.has(kind) && parent) {
      Object.assign(group, { type: accordion ? 'accordion' : 'group', inner: true, open: expanded });
    } else if (kind === 'tabs' || kind === 'tabs_new') {
      Object.assign(group, { type: 'tabs', newTabs: kind === 'tabs_new' });
      parent = true;
    } else if (kind === 'accordion' || kind === 'expanded') {
      Object.assign(group, { type: 'accordion', open: expanded && previousKind !== 'expanded' });
      parent = true;
    } else {
      // group_break, or an inner type without a parent
      if (kind === 'group_break') parent = false;
      Object.assign(group, accordion ? { type: 'accordion', open: expanded } : { type: 'group' });
    }
    if (explanation) group.explanation = true;
    if (!group.inner) previousKind = kind;
  }
}

/**
 * Groups shown: an inner group with fields (an explanation also with only its text),
 * an outer group with fields or inner groups. A left-out `tabs_new` passes the new
 * tab set to the next tabs group.
 *
 * @param {Array<object>} groups Placed groups.
 * @returns {Array<object>} Groups shown.
 */
function shownGroups(groups) {
  const hasText = (group) => group.explanation && Boolean(group.label || group.help);
  const inner = groups.filter((group) => !group.inner || group.children.length > 0 || hasText(group));
  const result = [];
  let newTabs = false;
  for (const [index, group] of inner.entries()) {
    const keep = group.inner || group.children.length > 0 || hasText(group) || inner[index + 1]?.inner === true;
    if (!keep) {
      newTabs = newTabs || group.newTabs === true;
      continue;
    }
    if (!group.inner && group.type === 'tabs' && newTabs) group.newTabs = true;
    if (!group.inner) newTabs = false;
    result.push(group);
  }
  return result;
}

/**
 * Build the edit structure of a record type.
 *
 * @param {Array<object>} rows `/rst/{rty}` items (EDIT_STRUCTURE_DETAILS).
 * @param {{rty: number, multilangIds?: number[], dbdefs?: object}} options
 *        `multilangIds`: fields with translations; `dbdefs`: concept codes of fields.
 * @returns {{rty: number, groups: Array<object>}}
 */
export function buildEditStructure(rows, { rty, multilangIds = [], dbdefs = null } = {}) {
  const multilang = new Set((multilangIds || []).map(Number));
  const sorted = [...(rows || [])].sort(byDisplayOrder);
  const groups = [];
  let current = { id: null, kind: null, type: 'group', label: null, help: '', children: [] };
  groups.push(current);
  for (const row of sorted) {
    const type = String(row.dty_Type || '');
    const req = String(row.rst_RequirementType || 'optional').toLowerCase();
    if (type === 'separator') {
      // a forbidden separator hides its heading only (legacy groupTitleVisible)
      if (req === 'forbidden') continue;
      current = {
        id: Number(row.rst_DetailTypeID) || null,
        kind: separatorType(row.rst_DefaultValue),
        type: 'group',
        label: String(row.rst_DisplayName || '') || null,
        help: String(row.rst_DisplayHelpText || ''),
        children: []
      };
      groups.push(current);
      continue;
    }
    if (req === 'forbidden') continue;
    const dty = Number(row.rst_DetailTypeID);
    if (!(dty > 0)) continue;
    const targets = idList(row.dty_PtrTargetRectypeIDs);
    current.children.push({
      dty,
      type,
      label: String(row.rst_DisplayName || row.dty_Name || dty),
      help: String(row.rst_DisplayHelpText || ''),
      req,
      max: Math.max(0, Number(row.rst_MaxValues) || 0),
      default: String(row.rst_DefaultValue ?? ''),
      vocabulary: vocabularyOf(rty, dty, idList(row.dty_JsonTermIDTree)[0] || null, dbdefs),
      targetTypes: targets,
      ...(type === 'resource' ? {
        pointerMode: resolvePointerMode(row.rst_PointerMode, targets, dbdefs),
        browseFilter: String(row.rst_PointerBrowseFilter ?? '').trim()
      } : {}),
      ...(type === 'geo' ? { geoKind: geoKindOf(rty, dty, dbdefs) } : {}),
      width: Math.max(0, Number(row.rst_DisplayWidth) || 0),
      height: Math.max(0, Number(row.rst_DisplayHeight) || 0),
      multilang: multilang.has(dty),
      concept: dbdefs?.fieldGlobal?.(dty)?.concept || null
    });
  }
  placeGroups(groups);
  return { rty: Number(rty) || 0, groups: shownGroups(groups) };
}

/**
 * Automatic groups of a very large record type (plan 23 §4.2): a group (also the
 * fields before the first separator, or all fields of a type without separators) with
 * more than `limit` fields keeps the first `limit`; the others follow in collapsed
 * inner accordions of `limit` fields ("Fields 51-100", ...), so they stay in the tab
 * or section of their group. Only the view: the structure of the type is not changed.
 *
 * @param {{groups: Array<object>}} structure Edit structure.
 * @param {number} limit Fields per group ("Limit fields" of the configuration).
 * @param {(from: number, to: number) => string} [labelOf] Caption of a part (field numbers within its group).
 * @returns {{groups: Array<object>}} The structure, or a copy with the parts.
 */
export function splitLargeGroups(structure, limit, labelOf = (from, to) => `Fields ${from}-${to}`) {
  const size = Math.floor(Number(limit));
  const groups = structure?.groups || [];
  if (!(size > 0) || !groups.some((group) => (group.children || []).length > size)) return structure;
  const result = [];
  for (const [index, group] of groups.entries()) {
    const children = group.children || [];
    if (children.length <= size) {
      result.push(group);
      continue;
    }
    result.push({ ...group, children: children.slice(0, size) });
    for (let from = size; from < children.length; from += size) {
      const part = children.slice(from, from + size);
      result.push({
        id: `${group.id ?? `group${index}`}-fields-${from + 1}`,
        type: 'accordion',
        inner: true,
        open: false,
        label: labelOf(from + 1, from + part.length),
        help: '',
        auto: true,
        children: part
      });
    }
  }
  return { ...structure, groups: result };
}

/**
 * Every field of an edit structure, in form order.
 *
 * @param {{groups: Array<object>}} structure Edit structure.
 * @returns {Array<object>} Fields.
 */
export function structureFields(structure) {
  return (structure?.groups || []).flatMap((group) => group.children || []);
}

/**
 * Fields with values in the record that the structure of its type does not have
 * (plan 18): the last group "Non-standard fields", editable with inputs of their
 * field types. Their values were always kept on save (buildRecordBody).
 *
 * @param {object|null} record Record in the write format (`details` keyed by field id).
 * @param {{groups: Array<object>}} structure Edit structure.
 * @param {object|null} dbdefs HDbDefs (field names, types, vocabularies).
 * @param {string} label Group caption.
 * @returns {object|null} The group, or null when there are no such values.
 */
export function nonStandardGroup(record, structure, dbdefs, label = 'Non-standard fields') {
  const known = new Set(structureFields(structure).map((field) => String(field.dty)));
  const children = [];
  for (const [key, values] of Object.entries(record?.details || {})) {
    if (known.has(key) || !/^\d+$/.test(key)) continue;
    if (!(Array.isArray(values) ? values.length : values != null)) continue;
    const global = dbdefs?.fieldGlobal?.(key) || null;
    const type = global?.type || 'freetext';
    if (type === 'separator') continue;
    children.push({
      dty: Number(key),
      type,
      label: global?.name || `#${key}`,
      help: '',
      req: 'optional',
      max: 0,
      default: '',
      vocabulary: global?.vocabulary || null,
      targetTypes: global?.targetTypes || [],
      ...(type === 'resource' ? { pointerMode: resolvePointerMode(null, global?.targetTypes || [], dbdefs), browseFilter: '' } : {}),
      width: 0,
      height: 0,
      multilang: false,
      concept: global?.concept || null,
      nonStandard: true
    });
  }
  return children.length ? { id: null, type: 'group', label, help: '', children, nonStandard: true } : null;
}

/**
 * Reverse relationship fields (plan 22): one field for each relmarker field of another
 * record type that targets this one; it shows (and adds) the relationships in which the
 * record is the target, with the inverse relation type. The group goes after the fields
 * of the record type, before "Non-standard fields".
 *
 * @param {number} rty Record type.
 * @param {object|null} dbdefs HDbDefs (link graph, field names, vocabularies).
 * @param {string} label Group caption.
 * @returns {object|null} The group, or null when no other type has such a field.
 */
export function reverseRelmarkerGroup(rty, dbdefs, label = 'Relationships from other records') {
  if (typeof dbdefs?.linkedRectypes !== 'function' || typeof dbdefs?.pointerFieldsBetween !== 'function') return null;
  const byDty = new Map();
  for (const from of dbdefs.linkedRectypes(rty, { direction: 'from', relation: true })) {
    for (const dty of dbdefs.pointerFieldsBetween(from, rty)) {
      if (dbdefs.fieldType?.(from, dty) !== 'relmarker') continue;
      let field = byDty.get(dty);
      if (!field) {
        const global = dbdefs.fieldGlobal?.(dty) || null;
        field = {
          name: `rev:${dty}`,
          dty: null,
          relmarkerDty: Number(dty),
          type: 'relmarker',
          reverse: true,
          fieldName: dbdefs.fieldName?.(from, dty) || global?.name || `#${dty}`,
          help: '',
          req: 'optional',
          max: 0,
          default: '',
          vocabulary: dbdefs.vocabRoot?.(dty) || global?.vocabulary || null,
          targetTypes: [Number(rty)],
          sourceTypes: [],
          width: 0,
          height: 0,
          multilang: false,
          concept: global?.concept || null
        };
        byDty.set(dty, field);
      }
      field.sourceTypes.push(Number(from));
    }
  }
  const children = [...byDty.values()].map((field) => ({
    ...field,
    label: `${field.fieldName} ← ${field.sourceTypes.map((id) => dbdefs.rectypeName?.(id) || `#${id}`).join(', ')}`
  }));
  // a closed accordion: opened on request (plan 25)
  return children.length
    ? { id: 'reverse-relationships', type: 'accordion', open: false, label, help: '', children, reverseRelations: true }
    : null;
}

/**
 * The relationship record (RT_RELATION) fields of a relmarker field (2026-10-22). Opened from
 * a relmarker field, the relation type gets the field's vocabulary, the other record its
 * allowed types (target, or source for a reverse field) and the side of the edited record
 * is read only. Without them (opened elsewhere) relation type, source and target are read
 * only: the base fields have no constraint.
 *
 * @param {{rty: number, groups: Array<object>}} structure Edit structure (cached: not changed).
 * @param {object|null} dbdefs HDbDefs (`localId` of the relationship concept codes).
 * @param {{vocabulary?: number|null, targetTypes?: number[], reverse?: boolean}|null} constraints
 *        From the relmarker field: vocabulary, allowed types of the other record, reverse.
 * @returns {{rty: number, groups: Array<object>}} The structure, or a copy for a relationship record.
 */
export function relationRecordStructure(structure, dbdefs, constraints = null) {
  const ids = relationshipIds(dbdefs);
  if (!structure || !ids || Number(structure.rty) !== ids.rty) return structure;
  const { type: typeDty, source: sourceDty, target: targetDty } = ids;
  const otherDty = constraints?.reverse ? sourceDty : targetDty;
  const types = (constraints?.targetTypes || []).map(Number).filter((rty) => rty > 0);
  const vocabulary = Number(constraints?.vocabulary) || null;
  const change = (field) => {
    const dty = Number(field.dty);
    if (!dty || ![typeDty, sourceDty, targetDty].includes(dty)) return field;
    if (!constraints) return { ...field, readOnly: true };
    if (dty === typeDty) return vocabulary ? { ...field, vocabulary } : field;
    if (dty !== otherDty) return { ...field, readOnly: true };
    return types.length ? { ...field, targetTypes: types } : field;
  };
  return {
    ...structure,
    groups: structure.groups.map((group) => ({ ...group, children: (group.children || []).map(change) }))
  };
}

/** @returns {number[]} Positive integers of a CSV list or JSON id tree. */
function idList(value) {
  return [...new Set(String(value ?? '').match(/\d+/g)?.map(Number).filter((id) => id > 0) || [])];
}

/**
 * Compare structure rows by display order, then by `rst_ID` as the legacy editor does
 * (`dbsData.php`): equal orders are common and the API returns them in any order.
 */
export function byDisplayOrder(a, b) {
  return order(a) - order(b) || (Number(a?.rst_ID) || 0) - (Number(b?.rst_ID) || 0);
}

/** @returns {number} Numeric display order of a structure row (zero-padded string in the API). */
function order(row) {
  const value = Number(row?.rst_DisplayOrder);
  return Number.isFinite(value) ? value : 0;
}
