/**
 * @file RecordEditorHost.js
 * @brief Explorer as record editor host (plan 14, Phase 3).
 *
 * Records of every type open in HRecordEditor, in an Explorer dialog, for a
 * logged-in user - also without the legacy Heurist host (plan 21 Phase 5; until
 * then only the system record types of shared/src/data/writableRecordTypes.js).
 * The host's (legacy) record editor is the fallback when nobody is logged in to
 * the new API. Modules reach this through the host
 * bridge: `editRecord(id, {recordType})`, `addRecord(rtyId)`,
 * `canEditRecordType(recordType)`, `browseRecords(options)` (the record manager,
 * plan 21: Browse of pointer fields).
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
import { HRuleBuilder, describeExpansionRule } from '../widgets/query-source/helpers/HRuleBuilder.js';
import { HFieldSetEditor } from '../widgets/query-source/helpers/HFieldSetEditor.js';
import { HGeoFieldSelector } from '../widgets/query-source/helpers/HGeoFieldSelector.js';
import { HTimeFieldSelector } from '../widgets/query-source/helpers/HTimeFieldSelector.js';
import { showHelperDialog } from '../widgets/query-source/helpers/showHelperDialog.js';
import { fieldCodeLabel, inferRecordTypeId } from '../widgets/query-source/helpers/fieldPathUtils.js';
import { SymbologyService } from '#shared/symbology/SymbologyService.js';
import { RecordPopupContent } from '#shared/recordview/RecordPopupContent.js';
import { RecordViewLoader } from '#shared/recordview/RecordViewLoader.js';
import { loadRecordAddDefaults, saveRecordAddDefaults } from '#shared/data/recordAccess.js';

/** Id prefix of the record editor dialogs (a numbered id each: a pointed record opens over its editor). */
const DIALOG_ID = 'h-record-editor-dialog';

/** Number of dialogs opened (unique dialog ids). */
let dialogCount = 0;

/** Last saved record of each editor host element (open / mount results). */
const savedRecords = new WeakMap();

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
    // registered files are records of RT_REGISTERED_FILE written through /files (plan 20)
    this.fileClient = new RecordEditClient({ apiClient: options.apiClient, domain: 'files' });
    this.structures = new RecordStructureProvider({ apiClient: options.apiClient });
    this.symbology = new SymbologyService({
      api: options.apiClient,
      loadDbDefs: () => options.ensureDbDefs(),
      iconUrl: options.rectypeIconUrl || null
    });
  }

  /**
   * Whether records of a type can be edited: any type in Explorer's editor (logged-in
   * user), or with the legacy host editor.
   *
   * @param {number|string} recordType Record type id or code name (`RT_MAP_LAYER`).
   * @returns {boolean}
   */
  canEditRecordType(recordType) {
    return (this.options.isLoggedIn() && this._usesNewEditor(recordType)) || this.canEditInHost();
  }

  /** @returns {boolean} Whether records can be edited at all (Explorer's editor or the host's). */
  canEditRecords() {
    return this.options.isLoggedIn() || this.canEditInHost();
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
   * Edit a record in Explorer's editor (logged-in user), else in the host editor.
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
      if (this._usesNewEditor(rectypeId)) return this.open({ recordId: id });
    }
    if (this.canEditInHost()) return this.options.getBridge().editRecord(id);
    throw new Error($HR('Record editor is not available'));
  }

  /**
   * Edit the details of a registered file (caption, description, copyright...) in the
   * record editor, written through `/files/{id}` (plan 20). Edit button of file fields.
   *
   * @param {number|string} fileId File id.
   * @returns {Promise<{saved: boolean, recordId: number, record: object|null}>}
   */
  async editFile(fileId) {
    const id = Number(fileId);
    if (!(id > 0)) throw new Error($HR('A valid file ID is required'));
    if (!this.options.isLoggedIn()) throw new Error($HR('Record editor is not available'));
    return this.open({ recordId: id, domain: 'files' });
  }

  /**
   * Create a record of a type in Explorer's editor (logged-in user), else in the host editor.
   * Without a type (an unconstrained pointer field, plan 21) the Add record dialog asks for
   * the type and the owner / visibility first. A new record starts with the remembered
   * owner and visibility of the user's last new record.
   *
   * @param {number|string|null} recordType Record type id or code name; null = ask.
   * @param {{access?: {owner: number, visibility: string, viewGroups: number[]}}} [options] Owner and
   *        visibility of the new record (default: the remembered ones).
   * @returns {Promise<{saved: boolean, recordId: number}|*>} `{saved: false}` when the dialog is cancelled.
   */
  async addRecord(recordType, { access = null } = {}) {
    if (recordType == null || recordType === '' || Number(recordType) === 0) {
      const dbdefs = await this.options.ensureDbDefs();
      const { openRecordAddDialog } = await import('#shared/widgets/record-access/openRecordAddDialog.js');
      const choice = await openRecordAddDialog({ dbdefs, database: this.options.database || '' });
      if (!choice) return { saved: false, recordId: 0, record: null };
      return this.addRecord(choice.rectypeId, { access: choice.access });
    }
    const rectypeId = await this._rectypeId(recordType);
    if (this.options.isLoggedIn() && this._usesNewEditor(rectypeId)) {
      return this.open({ rectypeId, access: access || loadRecordAddDefaults(await this._who()) });
    }
    const bridge = this.options.getBridge() || {};
    if (this.canEditInHost() && typeof bridge.addRecord === 'function') return bridge.addRecord(rectypeId);
    throw new Error($HR('Record editor is not available'));
  }

  /**
   * Open HRecordEditor in a dialog.
   *
   * @param {{recordId?: number, rectypeId?: number, domain?: 'records'|'files', access?: object}} target Record
   *        to edit, or record type of a new record (`access`: its owner and visibility); `files`: a
   *        registered file (plan 20).
   * @returns {Promise<{saved: boolean, recordId: number, record: object|null}>} When the dialog closes.
   */
  async open({ recordId = 0, rectypeId = 0, domain = 'records', access = null } = {}) {
    const isFile = domain === 'files';
    const dialogId = `${DIALOG_ID}-${++dialogCount}`;
    const host = document.createElement('div');
    host.className = 'h-record-editor-host';
    const editor = await this._createEditor(host, { recordId, rectypeId, domain, access });
    return new Promise((resolve) => {
      let settled = false;
      let dialog = null;
      const finish = async () => {
        if (settled) return;
        settled = true;
        dialog?.removeEventListener('close', onDialogClose);
        HMsg.closeMsgDlg(dialogId);
        await editor.destroy();
        resolve(this._result(host, recordId));
      };
      // Escape closes the browser dialog even with preventClose: that is Close (unsaved changes are lost)
      const onDialogClose = () => void finish();
      host.addEventListener('h-record-editor-close', () => void finish());
      dialog = HMsg.showMsgDlg(host, {
        dialogId,
        title: isFile ? $HR('File details') : (recordId > 0 ? $HR('Edit record') : $HR('New record')),
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
   * Show HRecordEditor in a container of the page (the editor mode, plan 21 Phase 6), not
   * in a dialog. Records opened from it (pointer Edit, Add, Browse) open dialogs over it.
   *
   * @param {HTMLElement} container Host element.
   * @param {{recordId?: number, rectypeId?: number, access?: object}} target Record to edit, or record
   *        type of a new record and its owner / visibility (default: the remembered ones).
   * @returns {Promise<{editor: HRecordEditor, closed: Promise<{saved: boolean, recordId: number, record: object|null}>}>}
   *          The editor (opened) and a promise of its Close.
   */
  async mount(container, { recordId = 0, rectypeId = 0, access = null } = {}) {
    const id = Number(recordId) || 0;
    const rty = id > 0 ? 0 : await this._rectypeId(rectypeId);
    if (!(id > 0) && !(rty > 0)) throw new Error($HR('A valid record ID is required'));
    const host = document.createElement('div');
    host.className = 'h-record-editor-host h-record-editor-page';
    container.replaceChildren(host);
    const editor = await this._createEditor(host, {
      recordId: id,
      rectypeId: rty,
      access: id > 0 ? null : access || loadRecordAddDefaults(await this._who())
    });
    const closed = new Promise((resolve) => {
      host.addEventListener('h-record-editor-close', async () => {
        await editor.destroy();
        resolve(this._result(host, id));
      }, { once: true });
    });
    await editor.open();
    return { editor, closed };
  }

  /** HRecordEditor with the services of this host; saves are reported and remembered. */
  async _createEditor(host, { recordId = 0, rectypeId = 0, domain = 'records', access = null } = {}) {
    const isFile = domain === 'files';
    const dbdefs = await this.options.ensureDbDefs();
    const editor = new HRecordEditor().attach(host, {
      apiClient: this.options.apiClient,
      dbdefs,
      recordId,
      rectypeId,
      access,
      client: isFile ? this.fileClient : this.client,
      structureProvider: this.structures,
      selectExtent: this.options.selectExtent,
      selectGeometry: this.options.selectGeometry,
      // Edit / View buttons of pointer fields (plan 14a); Browse / Add (plan 21)
      editRecord: (id) => this.editRecord(id),
      viewRecord: (id) => this.viewRecord(id),
      browseRecords: (options) => this.browseRecords(options),
      addRecord: (rectypeId) => this.addRecord(rectypeId),
      specialEditors: this.specialEditors(dbdefs),
      fileUrl: (file) => this._fileUrl(file),
      // Edit button of file fields (plan 20)
      editFile: (id) => this.editFile(id),
      // the file below a file field (thumbnail click, plan 21)
      fileViewer: this.options.baseUrl ? { baseUrl: this.options.baseUrl, database: this.options.database || '' } : null
    });
    host.addEventListener('h-record-editor-saved', (event) => {
      savedRecords.set(host, event.detail.record);
      // the owner / visibility of a new record are the defaults of the next one (plan 21)
      if (event.detail.created && !isFile) void this._rememberAccess(event.detail.record);
      this.options.onSaved?.({ record: event.detail.record, created: event.detail.created });
    });
    return editor;
  }

  /** Result of a closed editor: whether it saved, the record id and the saved record. */
  _result(host, recordId) {
    const saved = savedRecords.get(host) || null;
    return { saved: Boolean(saved), recordId: Number(saved?.rec_ID ?? recordId) || 0, record: saved };
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
        // icons and tooltips of the Query Source editor (2026-10-18)
        icon: 'fa-sliders',
        title: 'Open the Filter Builder',
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
        icon: 'fa-hexagon-nodes',
        title: 'Rules used by Graph to expand the result through linked records.',
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
        icon: 'fa-table',
        title: 'Columns and formatting used by the Data table presentation.',
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
        icon: 'fa-clock',
        title: 'Date and year fields used by Timeline.',
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
        icon: 'fa-map-location-dot',
        title: 'Fields used by Map to obtain geometry, including linked geographic fields.',
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
      // icons of the Map module control panel (2026-10-18)
      icon: 'fa-palette',
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
      icon: 'fa-chart-simple',
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

  /**
   * Whether a record type (id or code name) is edited in the new editor: every known
   * type (plan 21 Phase 5; the legacy save steps that srv does not do are listed in
   * plan 21 §6a).
   */
  _usesNewEditor(recordType) {
    if (typeof recordType === 'string' && /^RT_/.test(recordType)) return true;
    return Number(recordType) > 0;
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
      browseRecords: (options) => this.browseRecords(options),
      addRecord: (rectypeId) => this.addRecord(rectypeId),
      fileUrl: (file) => this._fileUrl(file),
      editFile: (id) => this.editFile(id),
      fileViewer: this.options.baseUrl ? { baseUrl: this.options.baseUrl, database: this.options.database || '' } : null
    };
  }

  /** @returns {Promise<{database: string, userId: number}>} Key of the remembered access of new records. */
  async _who() {
    const dbdefs = await this.options.ensureDbDefs();
    return { database: this.options.database || '', userId: Number(dbdefs?.currentUserId?.()) || 0 };
  }

  /** Remember the owner and visibility of a created record. */
  async _rememberAccess(record) {
    if (!record) return;
    saveRecordAddDefaults(await this._who(), {
      owner: Number(record.rec_OwnerUGrpID) || 0,
      visibility: record.rec_NonOwnerVisibility || 'viewable',
      viewGroups: (record.rec_NonOwnerVisibilityGroups || []).map(Number)
    });
  }

  /**
   * Browse records in the record manager (plan 21): pick records for a pointer field,
   * add new ones with the record editor. The manager is loaded on first use.
   *
   * @param {object} [options] HRecordManager options: `recordTypes`, `selectMode`
   *        (`select` default, `select_multi`, `manager`), `allowAddition`, `query`, `title`.
   * @returns {Promise<number[]|null>} Selected record ids, or null when cancelled.
   */
  async browseRecords(options = {}) {
    const dbdefs = await this.options.ensureDbDefs();
    const { openRecordManager } = await import('#shared/widgets/record-manager/openRecordManager.js');
    // registered files (/files, plan 20): edited with editFile, added by Upload / URL of the file input
    const fileType = Number(dbdefs?.dbconst?.('RT_REGISTERED_FILE')) || 0;
    const types = (options.recordTypes || []).map(Number).filter((id) => id > 0);
    const files = fileType > 0 && types.length > 0 && types.every((id) => id === fileType);
    return openRecordManager({
      selectMode: 'select',
      ...options,
      ...(files ? { allowAddition: false } : {}),
      apiClient: this.options.apiClient,
      dbdefs,
      addRecord: (rectypeId) => this.addRecord(rectypeId),
      // null = any type (the Add record dialog)
      canAddRecordType: (rectypeId) => (rectypeId == null ? this.options.isLoggedIn() : this.canEditRecordType(rectypeId)),
      editRecord: files ? (id) => this.editFile(id) : (id) => this.editRecord(id),
      viewRecord: files ? null : (id) => this.viewRecord(id),
      baseUrl: this.options.baseUrl || '',
      database: this.options.database || ''
    });
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
