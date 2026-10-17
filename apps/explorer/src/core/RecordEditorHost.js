/**
 * @file RecordEditorHost.js
 * @brief Explorer as record editor host (plan 14, Phase 3).
 *
 * Records of the system record types (query sources, map documents and
 * layers, reports, website pages - shared/src/data/writableRecordTypes.js)
 * open in HRecordEditor, in an Explorer dialog, for a logged-in user - also
 * without the legacy Heurist host. Other records keep the host's record editor
 * (title masks, calculated fields...). Modules reach this through the host
 * bridge: `editRecord(id, {recordType})`, `addRecord(rtyId)`,
 * `canEditRecordType(recordType)`.
 *
 * The special fields of these record types get a readable value plus the
 * editors Explorer already has: the query and its filter form (HFilterBuilder),
 * expansion rules (HRuleBuilder) and symbology (the shared symbology editors, plan 17).
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

import { HMsg, $HR } from '#shared/ui';
import { HRecordEditor } from '#shared/widgets/record-editor/HRecordEditor.js';
import { RecordEditClient } from '#shared/data/RecordEditClient.js';
import { RecordStructureProvider } from '#shared/recordview/RecordStructureProvider.js';
import { WRITABLE_RECORD_TYPE_CODES, isWritableRecordType } from '#shared/data/writableRecordTypes.js';
import { HRuleBuilder, describeExpansionRule } from '../widgets/query-source/helpers/HRuleBuilder.js';
import { HFieldSetEditor } from '../widgets/query-source/helpers/HFieldSetEditor.js';
import { HGeoFieldSelector } from '../widgets/query-source/helpers/HGeoFieldSelector.js';
import { HTimeFieldSelector } from '../widgets/query-source/helpers/HTimeFieldSelector.js';
import { showHelperDialog } from '../widgets/query-source/helpers/showHelperDialog.js';
import { fieldCodeLabel, inferRecordTypeId } from '../widgets/query-source/helpers/fieldPathUtils.js';
import { SymbologyService } from '#shared/symbology/SymbologyService.js';
import { RecordPopupContent } from '#shared/recordview/RecordPopupContent.js';
import { RecordViewLoader } from '#shared/recordview/RecordViewLoader.js';

/** Id prefix of the record editor dialogs (a numbered id each: a pointed record opens over its editor). */
const DIALOG_ID = 'h-record-editor-dialog';

/** Number of dialogs opened (unique dialog ids). */
let dialogCount = 0;

/** Opens system records in HRecordEditor; other records in the legacy host editor. */
export class RecordEditorHost {
  /**
   * @param {object} options
   * @param {object} options.apiClient HeuristApiClient.
   * @param {Function} options.getDbDefs Returns the loaded HDbDefs or null (sync).
   * @param {Function} options.ensureDbDefs Resolves with HDbDefs.
   * @param {Function} options.getBridge Returns the legacy host bridge (may be null).
   * @param {Function} options.isLoggedIn Whether a user is logged in.
   * @param {Function} [options.selectExtent] Map extent picker for geo fields.
   * @param {Function} [options.selectGeometry] Map drawing of a geometry for geo fields: `(wkt) → {type, wkt}|null`.
   * @param {Function} [options.editQuery] `(query, filterForm) => Promise<{query, filterForm}|null>` (HFilterBuilder).
   * @param {Function} [options.describeQuery] Query in words.
   * @param {Function} [options.onSaved] Called with `{record, created}` after each save.
   * @param {Function} [options.rectypeIconUrl] `(rectypeId) → url` of record type icons (symbol previews).
   * @param {string} [options.language] UI language.
   */
  constructor(options = {}) {
    this.options = options;
    this.client = new RecordEditClient({ apiClient: options.apiClient });
    this.structures = new RecordStructureProvider({ apiClient: options.apiClient });
    this.symbology = new SymbologyService({
      api: options.apiClient,
      loadDbDefs: () => options.ensureDbDefs(),
      iconUrl: options.rectypeIconUrl || null
    });
  }

  /**
   * Whether records of a type can be edited: system types in Explorer's editor
   * (logged-in user), any type with the legacy host editor.
   *
   * @param {number|string} recordType Record type id or code name (`RT_MAP_LAYER`).
   * @returns {boolean}
   */
  canEditRecordType(recordType) {
    return (this.options.isLoggedIn() && this._isWritable(recordType)) || this.canEditInHost();
  }

  /** @returns {boolean} Whether the legacy host record editor can be used. */
  canEditInHost() {
    const bridge = this.options.getBridge() || {};
    if (typeof bridge.editRecord !== 'function' || typeof bridge.canEditRecords !== 'function') return false;
    try {
      return bridge.canEditRecords() === true;
    } catch {
      return false;
    }
  }

  /**
   * Edit a record: system records in Explorer's editor, others in the host editor.
   *
   * @param {number|string} recordId Record id.
   * @param {{recordType?: number|string|null}} [options] Record type id or code name, when known.
   * @returns {Promise<{saved: boolean, recordId: number}|*>} Result of the editor.
   * @throws {Error} When no editor can edit the record.
   */
  async editRecord(recordId, { recordType = null } = {}) {
    const id = Number(recordId);
    if (!(id > 0)) throw new Error($HR('A valid record ID is required'));
    if (this.options.isLoggedIn()) {
      const rectypeId = await this._rectypeOf(id, recordType);
      if (this._isWritable(rectypeId)) return this.open({ recordId: id });
    }
    if (this.canEditInHost()) return this.options.getBridge().editRecord(id);
    throw new Error($HR('Record editor is not available'));
  }

  /**
   * Create a record of a type: system types in Explorer's editor, others in the host editor.
   *
   * @param {number|string} recordType Record type id or code name.
   * @returns {Promise<{saved: boolean, recordId: number}|*>}
   */
  async addRecord(recordType) {
    const rectypeId = await this._rectypeId(recordType);
    if (this.options.isLoggedIn() && this._isWritable(rectypeId)) return this.open({ rectypeId });
    const bridge = this.options.getBridge() || {};
    if (this.canEditInHost() && typeof bridge.addRecord === 'function') return bridge.addRecord(rectypeId);
    throw new Error($HR('Record editor is not available'));
  }

  /**
   * Open HRecordEditor in a dialog.
   *
   * @param {{recordId?: number, rectypeId?: number}} target Record to edit, or record type of a new record.
   * @returns {Promise<{saved: boolean, recordId: number, record: object|null}>} When the dialog closes.
   */
  async open({ recordId = 0, rectypeId = 0 } = {}) {
    const dbdefs = await this.options.ensureDbDefs();
    const dialogId = `${DIALOG_ID}-${++dialogCount}`;
    const host = document.createElement('div');
    host.className = 'h-record-editor-host';
    const editor = new HRecordEditor().attach(host, {
      apiClient: this.options.apiClient,
      dbdefs,
      recordId,
      rectypeId,
      client: this.client,
      structureProvider: this.structures,
      selectExtent: this.options.selectExtent,
      selectGeometry: this.options.selectGeometry,
      // Edit / View buttons of pointer fields (plan 14a)
      editRecord: (id) => this.editRecord(id),
      viewRecord: (id) => this.viewRecord(id),
      specialEditors: this.specialEditors(dbdefs),
      fileUrl: (file) => this._fileUrl(file)
    });
    let saved = null;
    return new Promise((resolve) => {
      let settled = false;
      let dialog = null;
      const finish = async () => {
        if (settled) return;
        settled = true;
        dialog?.removeEventListener('close', onDialogClose);
        HMsg.closeMsgDlg(dialogId);
        await editor.destroy();
        resolve({ saved: Boolean(saved), recordId: Number(saved?.rec_ID ?? recordId) || 0, record: saved });
      };
      // Escape closes the browser dialog even with preventClose: that is Close (unsaved changes are lost)
      const onDialogClose = () => void finish();
      host.addEventListener('h-record-editor-saved', (event) => {
        saved = event.detail.record;
        this.options.onSaved?.({ record: event.detail.record, created: event.detail.created });
      });
      host.addEventListener('h-record-editor-close', () => void finish());
      dialog = HMsg.showMsgDlg(host, {
        dialogId,
        title: recordId > 0 ? $HR('Edit record') : $HR('New record'),
        hideFooter: true,
        preventClose: true
      });
      dialog?.classList.add('h-dialog-record-editor');
      dialog?.addEventListener('close', onDialogClose);
      editor.open().catch((error) => {
        HMsg.showMsgErr?.(error?.message || String(error));
        void finish();
      });
    });
  }

  /**
   * Special fields of the system record types, by local field id.
   *
   * @param {object} dbdefs HDbDefs.
   * @returns {Object<number, {json: boolean, describe: Function, edit?: Function}>}
   */
  specialEditors(dbdefs) {
    const id = (code) => Number(dbdefs?.dbconst?.(code)) || 0;
    const query = id('DT_QUERY_STRING');
    const form = id('DT_FILTER_FORM');
    const rules = id('DT_EXPANSION_RULES');
    const columns = id('DT_TABLE_FIELDS');
    const geoFields = id('DT_GEO_FIELDS');
    const outputMode = id('DT_GEO_OUTPUTMODE');
    const timeFields = id('DT_TIMELINE_FIELDS');
    const yes = id('TRM_YES');
    const no = id('TRM_NO');
    const symbology = id('DT_SYMBOLOGY');
    const editQuery = this.options.editQuery;
    const specials = {};

    // query and filter form: one Filter Builder edits both; the filter form field is hidden
    // in the form and set from here (plan 14a, 2026-10-17)
    const editDefinition = async (context) => {
      const hasForm = Boolean(form) && context.hasField?.(form) !== false;
      const definition = await editQuery(parseJson(context.getValue(query)) ?? context.getValue(query) ?? [],
        hasForm ? parseJson(context.getValue(form)) : null);
      if (!definition) return null;
      if (definition.filterForm && !hasForm) {
        // the parameters would be saved without their form: keep the values
        throw new Error($HR('This record type has no Filter form field (DT_FILTER_FORM); the filter form cannot be saved'));
      }
      if (query) context.setValue(query, JSON.stringify(definition.query ?? []));
      if (hasForm) context.setValue(form, definition.filterForm ? JSON.stringify(definition.filterForm) : '');
      return definition;
    };
    if (query) {
      specials[query] = {
        json: false, // legacy query strings are text
        describe: (value) => this.options.describeQuery?.(parseJson(value) ?? value) || '',
        edit: editQuery ? async (value, context) => {
          const definition = await editDefinition(context);
          return definition ? JSON.stringify(definition.query ?? []) : undefined;
        } : undefined
      };
    }
    if (form) {
      // not shown: the Edit of the query field sets it
      specials[form] = { json: true, hidden: true };
    }
    if (rules) {
      specials[rules] = {
        json: true,
        describe: (value) => describeRules(parseJson(value), dbdefs),
        edit: async (value, context) => {
          const current = asArray(parseJson(value));
          const builder = new HRuleBuilder({ dbdefs, lang: this.options.language });
          const result = await builder.setRules(current).open({
            dataSource: { request: { q: query ? parseJson(context.getValue(query)) ?? context.getValue(query) : null } }
          });
          return result == null ? undefined : (result.length ? JSON.stringify(result) : '');
        }
      };
    }
    // the helpers of the Query Source editor, for the record type of the current query (plan 14a)
    const recordTypeOf = (context) => (query ? inferRecordTypeId(parseJson(context.getValue(query)) ?? context.getValue(query)) : null);
    const labels = (text) => listValues(text).map((code) => fieldCodeLabel(code, dbdefs) || code).join(', ');
    if (columns) {
      specials[columns] = {
        json: true,
        describe: (value) => describeColumns(parseJson(value)),
        edit: async (value, context) => {
          const editor = new HFieldSetEditor({ dbdefs });
          editor.setRecordType(recordTypeOf(context)).setValue(asArray(parseJson(value)));
          const result = await this._openHelper('Column fields', editor, () => editor.getValue());
          return result == null ? undefined : (result.length ? JSON.stringify(result) : '');
        }
      };
    }
    if (timeFields) {
      specials[timeFields] = {
        list: true, // one field code per value
        describe: (value) => labels(value),
        edit: async (value, context) => {
          const editor = new HTimeFieldSelector({ dbdefs });
          editor.setRecordType(recordTypeOf(context)).setValue(listValues(value).map((field) => ({ field })));
          const result = await this._openHelper('Time fields', editor, () => editor.getValue());
          return result == null ? undefined : result.map((item) => String(item.field));
        }
      };
    }
    if (geoFields) {
      // the dialog also sets the output mode (DT_GEO_OUTPUTMODE, hidden in the form); extent loading and
      // zoom levels stay fields of the form
      const features = (context) => outputMode > 0 && Number(context.getValue?.(outputMode)) === yes && yes > 0;
      specials[geoFields] = {
        list: true,
        describe: (value, context) => {
          const text = labels(value);
          return text && features(context) ? `${text} (${$HR('individual linked map features')})` : text;
        },
        edit: async (value, context) => {
          const editor = new HGeoFieldSelector({ dbdefs, viewportOptions: false });
          editor.setRecordType(recordTypeOf(context));
          editor.setMapProfile({ geoFields: listValues(value), geoOutputMode: features(context) ? 'features' : 'records' });
          const result = await this._openHelper('Geographic fields', editor, () => editor.getMapProfile());
          if (result == null) return undefined;
          if (outputMode > 0 && yes > 0 && no > 0 && context.hasField?.(outputMode) !== false) {
            context.setValue(outputMode, String(result.geoOutputMode === 'features' ? yes : no));
          }
          return (result.geoFields || []).map(String);
        }
      };
    }
    if (outputMode) specials[outputMode] = { json: false, hidden: true };
    if (symbology) specials[symbology] = this._symbologySpecial(dbdefs);
    return specials;
  }

  /**
   * DT_SYMBOLOGY (plan 17 §6): Style (symbol editor; image filters for a Map Layer of an
   * image source) and, for a Map Layer, Thematic maps - its data source is read on every
   * click (it may change while the form is open). The website colour scheme of
   * RT_CMS_HOME stays raw JSON.
   *
   * @private
   * @param {object} dbdefs HDbDefs.
   * @returns {object} Special field definition.
   */
  _symbologySpecial(dbdefs) {
    const id = (code) => Number(dbdefs?.dbconst?.(code)) || 0;
    const mapLayer = id('RT_MAP_LAYER');
    const cmsHome = id('RT_CMS_HOME');
    const describe = (value) => describeSymbology(parseJson(value));
    const store = (result) => (result == null ? undefined : (Object.keys(result).length ? JSON.stringify(result) : ''));
    const isRectype = (context, rty) => rty > 0 && Number(context.rectypeId || context.record?.rec_RecTypeID) === rty;
    const style = {
      label: 'Style',
      title: 'Open symbology editor',
      primary: true,
      run: async (value, context) => {
        if (isRectype(context, cmsHome)) return undefined;
        if (!isRectype(context, mapLayer)) return store(await this.symbology.edit(parseJson(value)));
        const source = await this._mapLayerSource(context, dbdefs);
        const kind = source?.image ? 'image' : 'style';
        return store(await this.symbology.edit(parseJson(value), { kind, query: source?.query || null }));
      }
    };
    const thematic = {
      label: 'Thematic maps',
      title: 'Open thematic maps editor',
      run: async (value, context) => {
        const source = await this._mapLayerSource(context, dbdefs);
        if (!source?.query) {
          HMsg.showMsgFlash?.($HR('Not supported for current data source'), 2000);
          return undefined;
        }
        return store(await this.symbology.edit(parseJson(value), { kind: 'thematic', query: source.query }));
      }
    };
    return {
      json: true,
      describe,
      // per record type: RT_CMS_HOME raw only, a Map Layer both editors, others the style editor
      actionsFor: (context) => {
        if (isRectype(context, cmsHome)) return [];
        return isRectype(context, mapLayer) ? [style, thematic] : [style];
      }
    };
  }

  /**
   * The data source of the Map Layer being edited: its record type, and the query of a
   * Query Source; `image` for an image / tiled image source.
   *
   * @private
   * @param {object} context Special field context (`getValue`).
   * @param {object} dbdefs HDbDefs.
   * @returns {Promise<{recordId: number, rectypeId: number, query: *, image: boolean}|null>}
   */
  async _mapLayerSource(context, dbdefs) {
    const id = (code) => Number(dbdefs?.dbconst?.(code)) || 0;
    const field = id('DT_DATA_SOURCE');
    let sourceId = field ? context.getValue?.(field) : null;
    if (Array.isArray(sourceId)) sourceId = sourceId[0];
    if (sourceId && typeof sourceId === 'object') sourceId = sourceId.id ?? sourceId.rec_ID ?? sourceId.value;
    const recordId = Number(sourceId) || 0;
    if (!recordId) return null;
    const payload = await this.options.apiClient.get('/records', { query: { q: `ids:${recordId}`, fields: '_all' } });
    const record = payload?.records?.[0];
    if (!record) return null;
    const rectypeId = Number(record.rec_RecTypeID) || 0;
    const queryField = id('DT_QUERY_STRING');
    const raw = rectypeId === id('RT_QUERY_SOURCE') && queryField ? record.details?.[queryField]?.[0] ?? null : null;
    const text = raw && typeof raw === 'object' ? raw.value ?? null : raw;
    return {
      recordId,
      rectypeId,
      query: text ? (parseJson(text) ?? text) : null,
      image: [id('RT_IMAGE_SOURCE'), id('RT_TILED_IMAGE_SOURCE')].filter(Boolean).includes(rectypeId)
    };
  }

  /** Whether a record type (id or code name) is written by the new editor. */
  _isWritable(recordType) {
    if (typeof recordType === 'string' && /^RT_/.test(recordType)) return WRITABLE_RECORD_TYPE_CODES.includes(recordType);
    const dbdefs = this.options.getDbDefs();
    return Boolean(dbdefs) && isWritableRecordType(dbdefs, recordType);
  }

  /** Local id of a record type given by id or code name. */
  async _rectypeId(recordType) {
    if (typeof recordType === 'string' && /^RT_/.test(recordType)) {
      const dbdefs = await this.options.ensureDbDefs();
      return Number(dbdefs?.dbconst?.(recordType)) || 0;
    }
    return Number(recordType) || 0;
  }

  /** Record type of a record: given, or read from the server. */
  async _rectypeOf(recordId, recordType) {
    if (recordType != null && recordType !== '') return this._rectypeId(recordType);
    try {
      const payload = await this.options.apiClient.get(`/records/${recordId}`, { query: { fields: 'rec_RecTypeID' } });
      return Number(payload?.records?.[0]?.rec_RecTypeID) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Services of the inputs of an HEditForm in Explorer (pointer titles, vocabularies,
   * map extent, file links), as the record editor has them (plan 14a).
   *
   * @returns {Promise<{apiClient: object, dbdefs: object, selectExtent: Function|null, selectGeometry: Function|null, fileUrl: Function}>}
   */
  async formServices() {
    return {
      apiClient: this.options.apiClient,
      dbdefs: await this.options.ensureDbDefs(),
      selectExtent: this.options.selectExtent || null,
      selectGeometry: this.options.selectGeometry || null,
      editRecord: (id) => this.editRecord(id),
      viewRecord: (id) => this.viewRecord(id),
      fileUrl: (file) => this._fileUrl(file)
    };
  }

  /**
   * Show a record in a dialog with the built-in record renderer (View button of
   * pointer fields: the Record view pane is behind the editor dialog).
   *
   * @param {number|string} recordId Record id.
   * @returns {void}
   */
  viewRecord(recordId) {
    const recId = Number(recordId);
    if (!(recId > 0)) return;
    this._recordViewLoader ??= RecordViewLoader.create({ apiClient: this.options.apiClient, language: this.options.language });
    const content = new RecordPopupContent({
      recordViewLoader: this._recordViewLoader,
      baseUrl: this.options.baseUrl || null,
      database: this.options.database || null,
      canEditRecords: () => false
    });
    const dialogId = `h-record-view-dialog-${++dialogCount}`;
    const dialog = HMsg.showMsgDlg(content.element, {
      dialogId,
      title: $HR('Record'),
      buttons: [{ label: $HR('Close'), class: 'h-btn', onClick: () => HMsg.closeMsgDlg(dialogId) }]
    });
    if (dialog) dialog.style.width = 'min(680px, calc(100vw - 24px))';
    dialog?.addEventListener('close', () => content.cancel(), { once: true });
    content.showRecord({ id: recId }, 'builtin', { full: true });
  }

  /**
   * Show a Query Source helper in its dialog (tests replace this method).
   *
   * @private
   * @param {string} title Dialog title.
   * @param {object} editor Helper widget.
   * @param {() => *} getResult Reads the result on Apply.
   * @returns {Promise<*>} The result, or null on Cancel.
   */
  _openHelper(title, editor, getResult) {
    return showHelperDialog(title, editor, getResult);
  }

  /** Link to view an uploaded file. */
  _fileUrl(file) {
    const obfuscated = String(file?.ulf_ObfuscatedFileID || '').replace(/[^a-z0-9]/gi, '');
    if (!obfuscated) return file?.ulf_ExternalFileReference || '';
    const base = String(this.options.baseUrl || '').replace(/\?$/, '');
    if (!base) return '';
    return `${base}${base.includes('?') ? '&' : '?'}db=${encodeURIComponent(this.options.database || '')}&file=${obfuscated}`;
  }
}

/** @returns {string[]} The values of a list special field (one per line). */
export function listValues(text) {
  return String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/** @returns {*} Parsed JSON, or null when the text is not JSON. */
export function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** @returns {Array} The value as an array. */
function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

/** Filter form in words: its inputs. */
export function describeFilterForm(form) {
  if (!form || typeof form !== 'object') return '';
  const groups = Array.isArray(form.groups) ? form.groups : [];
  const inputs = groups.flatMap((group) => group?.children || []);
  const labels = inputs.map((input) => input?.label).filter(Boolean);
  const count = `${inputs.length} ${inputs.length === 1 ? $HR('input') : $HR('inputs')}`;
  return labels.length ? `${count}: ${labels.join(', ')}` : count;
}

/** Expansion rules in words: their names. */
export function describeRules(rules, dbdefs) {
  const list = asArray(rules);
  if (!list.length) return '';
  const names = list.map((rule) => {
    if (rule?.name) return rule.name;
    try {
      return describeExpansionRule(rule, dbdefs)?.name || '';
    } catch {
      return '';
    }
  }).filter(Boolean);
  return names.length ? names.join('; ') : `${list.length} ${$HR('rules')}`;
}

/** Column fields in words: their number. */
export function describeColumns(columns) {
  if (Array.isArray(columns)) return `${columns.length} ${$HR('columns')}`;
  if (columns && typeof columns === 'object') {
    const list = columns.fields || columns.columns;
    if (Array.isArray(list)) return `${list.length} ${$HR('columns')}`;
  }
  return '';
}

/** Symbology in words: colours, icon, thematic maps. */
export function describeSymbology(symbology) {
  if (!symbology || typeof symbology !== 'object') return '';
  const symbol = symbology.symbol && typeof symbology.symbol === 'object' ? symbology.symbol : symbology;
  const parts = [];
  if (symbol.color) parts.push(`${$HR('line')} ${symbol.color}`);
  if (symbol.fillColor) parts.push(`${$HR('fill')} ${symbol.fillColor}`);
  if (symbol.iconType || symbol.iconUrl) parts.push(`${$HR('icon')} ${symbol.iconType || ''}`.trim());
  const thematic = Array.isArray(symbology.thematic) ? symbology.thematic.length : 0;
  if (thematic) parts.push(`${thematic} ${$HR('thematic maps')}`);
  return parts.join(', ') || $HR('Symbology defined');
}
