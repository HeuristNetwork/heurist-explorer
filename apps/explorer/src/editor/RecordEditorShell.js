/**
 * @file RecordEditorShell.js
 * @brief Explorer in editor mode (plan 21 §2.4): the record editor alone in the
 *        page, without the Explorer workspace (no Query Source editor, saved
 *        filters, layout, modules or start-up query).
 *
 * The shell creates only the API client, the users and groups (owner pickers,
 * login), the record type icons, EditorServices (map drawing, query editor) and
 * RecordEditorHost, and shows the record in the page. The page that opened the
 * editor is told about saves and the close in two ways: the bridge callbacks
 * `onRecordSaved({record, created})` / `onEditorClosed({saved, recordId, record})`,
 * and `postMessage` to the parent frame or the opener window
 * (`{source: 'heurist-record-editor', type: 'saved'|'closed', ...}`, same origin).
 * A window opened with `window.open` closes itself after the editor closes.
 *
 * This folder must not import the Explorer workspace (test/architecture).
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

import { HeuristApiClient } from '#shared/api';
import { HDbDefs } from '#shared/data/HDbDefs.js';
import { $HR } from '#shared/ui';
import { UserGroupManager } from '../core/UserGroupManager.js';
import { RecordTypeManager } from '../core/RecordTypeManager.js';
import { RecordEditorHost } from '../core/RecordEditorHost.js';
import { EditorServices } from '../core/EditorServices.js';

/** `source` of the messages to the opener. */
export const EDITOR_MESSAGE_SOURCE = 'heurist-record-editor';

/** The record editor alone in a page. */
export class RecordEditorShell {
  /**
   * @param {{container: HTMLElement, config: object, window?: Window}} options Host element, the
   *        Explorer configuration (`editor`: the record to open) and the window (tests).
   */
  constructor({ container, config, window: win = globalThis.window }) {
    this.container = container;
    this.config = config;
    this.window = win;
    this.current = null;
  }

  /**
   * Load the users and groups and open the record of the configuration.
   *
   * @returns {Promise<RecordEditorShell>} This shell.
   */
  async initialize() {
    this.container.classList.add('h-explorer', 'h-record-editor-shell');
    this.apiClient = new HeuristApiClient({
      apiBaseUrl: this.config.apiBaseUrl,
      database: this.config.database,
      accessToken: this.config.accessToken,
      headers: this.config.requestHeaders
    });
    const dbDefsProvider = () => this._ensureDbDefs();
    this.userGroups = new UserGroupManager({ apiClient: this.apiClient, dbDefsProvider });
    this.recordTypes = new RecordTypeManager({
      apiClient: this.apiClient, dbDefsProvider, baseUrl: this.config.baseUrl, database: this.config.database
    });
    this.services = new EditorServices({
      config: this.config,
      apiClient: this.apiClient,
      ensureDbDefs: dbDefsProvider,
      getDbDefs: () => this._dbDefs || null
    });
    const services = this.services;
    this.host = new RecordEditorHost({
      apiClient: this.apiClient,
      getDbDefs: () => this._dbDefs || null,
      ensureDbDefs: dbDefsProvider,
      getBridge: () => this.config.hostBridge || null,
      isLoggedIn: () => this.isLoggedIn(),
      selectExtent: services.canDraw() ? (current) => services.selectFilterExtent(current) : null,
      selectGeometry: services.canDraw() ? (current) => services.selectGeometry(current) : null,
      editQuery: (query, filterForm) => services.editQuery(query, filterForm),
      describeQuery: (q) => services.describeQuery(q),
      onSaved: ({ record, created }) => this._notify('saved', { record, created }),
      rectypeIconUrl: (id) => this.recordTypes.iconUrl?.(id) || '',
      language: this.config.language,
      baseUrl: this.config.baseUrl,
      database: this.config.database,
      recordLimits: this.config.recordLimits
    });
    try {
      await this.userGroups.load();
    } catch (error) {
      if (error?.name !== 'AbortError') console.warn('Users and groups could not be loaded', error);
    }
    if (!this.isLoggedIn()) {
      this._message($HR('Log in to edit records'));
      return this;
    }
    const target = this.config.editor || {};
    if (Number(target.recordId) > 0 || target.rectypeId) await this.open(target);
    else this._message($HR('No record to edit'));
    return this;
  }

  /** @returns {boolean} Whether a user is logged in. */
  isLoggedIn() {
    return Number(this.userGroups?.data?.currentUserId) > 0;
  }

  /**
   * Show a record (or a new record of a type) in the page, instead of the current one.
   *
   * @param {{recordId?: number, rectypeId?: number|string, access?: object}} target Record to edit.
   * @returns {Promise<void>}
   */
  async open(target = {}) {
    if (this.current && !(await this.current.editor.close())) return;
    const mounted = await this.host.mount(this.container, target);
    this.current = mounted;
    void mounted.closed.then((result) => {
      if (this.current !== mounted) return;
      this.current = null;
      this._closed(result);
    });
  }

  /** @returns {boolean} Whether the record has unsaved changes. */
  isDirty() {
    return this.current?.editor.isDirty() === true;
  }

  /** @returns {object|null} The record in the write format, as a save would send it. */
  getRecord() {
    return this.current?.editor.getRecord() || null;
  }

  /**
   * Close the editor (unsaved changes are confirmed unless `confirm: false`).
   *
   * @param {{confirm?: boolean}} [options]
   * @returns {Promise<boolean>} True when closed.
   */
  async close(options = {}) {
    return this.current ? this.current.editor.close(options) : true;
  }

  /** @returns {Promise<void>} Completion after the editor and the drawing Map are removed. */
  async destroy() {
    await this.current?.editor.destroy();
    this.current = null;
    await this.services?.destroy();
  }

  /** The editor closed: tell the opener; a window opened for the editor closes itself. */
  _closed(result) {
    this._notify('closed', result);
    this._message(result?.saved ? $HR('Saved. The editor is closed.') : $HR('The editor is closed.'));
    const win = this.window;
    if (win?.opener && win.parent === win) win.close?.();
  }

  /**
   * Tell the page that opened the editor: bridge callback and postMessage.
   *
   * @param {'saved'|'closed'} type Event.
   * @param {object} detail `{record, created}` (saved) or `{saved, recordId, record}` (closed).
   */
  _notify(type, detail = {}) {
    const bridge = this.config.hostBridge || {};
    try {
      if (type === 'saved') bridge.onRecordSaved?.({ ...detail });
      else bridge.onEditorClosed?.({ ...detail });
    } catch (error) {
      console.warn('Record editor host callback failed', error);
    }
    const record = detail.record || null;
    const message = {
      source: EDITOR_MESSAGE_SOURCE,
      type,
      recordId: Number(detail.recordId ?? record?.rec_ID) || 0,
      rectypeId: Number(record?.rec_RecTypeID) || 0,
      created: detail.created === true,
      saved: type === 'saved' || detail.saved === true
    };
    const win = this.window;
    const target = win?.parent && win.parent !== win ? win.parent : win?.opener || null;
    try {
      target?.postMessage?.(message, win.location?.origin || '*');
    } catch (error) {
      console.warn('Record editor message could not be sent', error);
    }
  }

  /** A short message in place of the editor. */
  _message(text) {
    const box = document.createElement('div');
    box.className = 'h-record-editor-shell-message';
    box.textContent = text;
    this.container.replaceChildren(box);
  }

  /** The definitions snapshot (with the users / groups overlay of UserGroupManager). */
  async _ensureDbDefs() {
    if (!this._dbDefsPromise) {
      const url = this.apiClient.buildUrl('/def/snapshot');
      this._dbDefsPromise = HDbDefs.load(url, { lang: this.config.language }).then((dbdefs) => {
        this._dbDefs = dbdefs;
        return dbdefs;
      }, (error) => {
        this._dbDefsPromise = null;
        throw error;
      });
    }
    return this._dbDefsPromise;
  }
}

/** Public API of the editor mode (`window.heuristExplorer`). */
export class RecordEditorShellApi {
  /** @param {RecordEditorShell} shell The shell. */
  constructor(shell) {
    this.shell = shell;
    this.readyPromise = null;
  }

  /** @param {Promise<*>} promise Resolves when the shell is initialized. */
  setReadyPromise(promise) { this.readyPromise = promise; }

  /** @returns {Promise<RecordEditorShellApi>} Resolves when the shell is initialized. */
  ready() { return this.readyPromise || Promise.resolve(this); }

  /** @returns {string} The mode of this page. */
  get mode() { return 'editor'; }

  /** @param {{recordId?: number, rectypeId?: number|string, access?: object}} target Record to edit. */
  open(target) { return this.shell.open(target); }

  /** @returns {boolean} Whether there are unsaved changes. */
  isDirty() { return this.shell.isDirty(); }

  /** @returns {object|null} The record as a save would send it. */
  getRecord() { return this.shell.getRecord(); }

  /** @param {{confirm?: boolean}} [options] @returns {Promise<boolean>} */
  close(options) { return this.shell.close(options); }
}
