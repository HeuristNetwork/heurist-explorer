/**
 * @file PageSync.js
 * @brief The modules of one website page work together (plan 27l §2.2, §12): records and selection.
 *
 * Records: every search of the page has an origin — `links` (a Saved filter of the URL or of a link to this page),
 * `filter:<id>` (a Filter widget), `module:<id>` (what another module shows). Each module takes the searches of the
 * origins in its `from` list (cmsRecords.js); a module shows the latest one. What a module shows is sent on as
 * `module:<id>` to the modules that take their records from it (its own query at start, later searches it took); the
 * path of a search stops loops. The latest search of each origin is kept, so a module mounted later (a tab, a section
 * loaded by the navigator) starts with the newest one it takes.
 *
 * Selection: one shared SyncEngine for the modules that share the selection (`selection` true): selection and map
 * document. A story map (plan 27q1 §8) takes the selection only and sends its source records on as `module:<id>`. Explorer on a page is one member: it takes `links` through `applyPageRequest`, its own modules stay in its
 * own SyncEngine (no page selection yet, phase D).
 *
 * The page RequestMonitor collects the requests of all modules (their monitors register through the small host bridge
 * given to direct mounts), so the page can stop them (Stop of the Filter widget).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { RequestMonitor } from '#shared/api';
import { SyncEngine } from '#shared/sync/SyncEngine.js';
import { ModuleHandle, SYNC_MODULE_TYPES } from '#shared/sync/ModuleHandle.js';
import { cmsInstanceRecords, cmsTakesRecords } from '#shared/site/cmsRecords.js';

/**
 * Records and selection of an instance (cmsInstanceRecords with the instances of its page).
 *
 * @param {object|null} instance Instance configuration.
 * @param {object} [instances] The instances of the page.
 * @returns {{from: string[], selection: boolean, own: object|null}}
 */
export function instanceLinks(instance, instances = {}) {
  return cmsInstanceRecords(instance || {}, instances);
}

/**
 * One PageSync per page, members by instance id. Event `requestchange` ({request, origin}): a new search of the page
 * (the Filter widget marks its item for `links`).
 */
export class PageSync extends EventTarget {
  constructor() {
    super();
    this.engine = new SyncEngine();
    this.monitor = new RequestMonitor({ source: 'page' });
    // the latest search of the page: {dataSource, raw?, values?, missing?} (the Filter widget: run its active item?)
    this.request = null;
    // origin => {request, seq}
    this._requests = new Map();
    this._seq = 0;
    this._members = new Map();
  }

  /**
   * The host bridge of a module mounted directly: only its request monitor reports to the page (the modules guard
   * every other bridge method, so they behave as without a host).
   *
   * @returns {{registerRequestMonitor: Function}}
   */
  bridge() {
    return {
      registerRequestMonitor: (monitor) => this.monitor.attachChild(monitor)
    };
  }

  /**
   * Register a mounted module (again: the old registration is replaced).
   *
   * @param {string} instanceId
   * @param {string} type Module type.
   * @param {object} api Its public API.
   * @param {{from?: string[], selection?: boolean}} [links] Its sources and whether it shares the selection.
   * @param {object|null} [start] The search it started with (sent on to the modules that take from it).
   * @returns {object|null} The member, null for a module that does not take part.
   */
  register(instanceId, type, api, { from = [], selection = true } = {}, start = null) {
    this.unregister(instanceId);
    if (!api) return null;
    let member = null;
    if (type === 'explorer') {
      member = new ExplorerMember(instanceId, api, from);
    } else if (type === 'storymap') {
      member = new StoryMapMember(instanceId, api);
    } else if (type === 'crosstabs') {
      member = new CrosstabsMember(instanceId, api, from);
    } else if (SYNC_MODULE_TYPES.includes(type)) {
      member = new ModuleMember(instanceId, type, api, from, selection);
    }
    if (!member) return null;
    this._members.set(instanceId, member);
    if (member.selection) {
      this.engine.register(member);
      // a module mounted later: the current selection (its records came with its start state)
      if (this.engine.selection.length) void member.setSelection(this.engine.selection);
    }
    if (start?.dataSource) void this._send(start, `module:${instanceId}`, [instanceId]);
    // a search sent while it was mounting (modules mount side by side): the newest one of its sources
    const missed = this.latest(member.from);
    if (missed && missed !== start) void this._deliver(member, missed, []);
    return member;
  }

  /** Remove a module (its part of the page was removed). */
  unregister(instanceId) {
    const member = this._members.get(instanceId);
    if (!member) return;
    if (member.selection) this.engine.unregister(instanceId);
    member.destroy();
    this._members.delete(instanceId);
  }

  /**
   * A new search of the page: every member that takes its origin gets it.
   *
   * @param {{dataSource: object, raw?: object, values?: object, missing?: string[]}} request
   * @param {object} [options]
   * @param {string} [options.origin='links'] `links`, `filter:<id>` or `module:<id>`.
   * @returns {Promise<void>}
   */
  async setRequest(request, { origin = 'links' } = {}) {
    if (!request?.dataSource) return;
    this.dispatchEvent(new CustomEvent('requestchange', { detail: { request, origin } }));
    await this._send(request, origin, []);
  }

  /**
   * Keep a search without giving it to the modules (the Saved filter of the URL: the modules start with it).
   *
   * @param {object} request
   * @param {string} [origin='links']
   */
  remember(request, origin = 'links') {
    if (!request?.dataSource) return;
    // a search of the page, not what a module sends on
    if (!origin.startsWith('module:')) this.request = request;
    this._requests.set(origin, { request, seq: ++this._seq });
  }

  /**
   * The newest kept search of the given origins (a module mounted later starts with it), or null.
   *
   * @param {string[]} from
   * @returns {object|null}
   */
  latest(from = []) {
    let found = null;
    for (const origin of from) {
      const kept = this._requests.get(origin);
      if (kept && (!found || kept.seq > found.seq)) found = kept;
    }
    return found?.request || null;
  }

  /** @returns {object|null} The latest page DataSource. */
  get dataSource() {
    return this.request?.dataSource || null;
  }

  /** @returns {string[]} Stop every running request of the page modules. */
  stopAll() {
    return this.monitor.abortAll();
  }

  /** Unregister every module. */
  destroy() {
    for (const id of [...this._members.keys()]) this.unregister(id);
  }

  /**
   * Keep a search and give it to the members that take its origin, then send on what each of them shows.
   *
   * @private
   * @param {object} request
   * @param {string} origin
   * @param {string[]} path Instance ids the search went through (a loop stops).
   */
  async _send(request, origin, path) {
    this.remember(request, origin);
    const takers = [...this._members.values()].filter((member) => !path.includes(member.id) && cmsTakesRecords(member.from, origin));
    await Promise.all(takers.map((member) => this._deliver(member, request, path)));
  }

  /**
   * Give a search to one member; what it shows then goes on to the modules that take their records from it.
   *
   * @private
   */
  async _deliver(member, request, path) {
    const taken = await member.setDataSource(request.dataSource, request);
    if (taken !== false) await this._send(request, `module:${member.id}`, [...path, member.id]);
  }
}

/** A record module of the page (a ModuleHandle with an id, its sources and whether it shares the selection). */
class ModuleMember extends EventTarget {
  constructor(id, type, api, from, selection) {
    super();
    this.id = id;
    this.type = type;
    this.from = from;
    this.selection = Boolean(selection);
    // the SyncEngine of the page gives it selection and map document only (PageSync gives the records)
    this.syncMode = 'all';
    this.handle = new ModuleHandle({ type, api }).bind();
    this._forward = (event) => this.dispatchEvent(new CustomEvent(event.type, { detail: event.detail }));
    this.handle.addEventListener('selectionchange', this._forward);
    this.handle.addEventListener('mapdocumentchange', this._forward);
  }

  /**
   * Map / Timeline show the document of the current result with it (as the Saved filter of the URL). A module that
   * fails does not stop the others: logged.
   *
   * @returns {Promise<*>} False when it did not take the records.
   */
  async setDataSource(source) {
    try {
      return await this.handle.setDataSource(source, { showDynamic: true });
    } catch (error) {
      console.warn(`Page result: ${this.type} (${this.id}) did not take the records`, error);
      return false;
    }
  }

  setSelection(ids) {
    return this.handle.setSelection(ids);
  }

  setActiveMapDocument(documentId) {
    return this.handle.setActiveMapDocument(documentId);
  }

  setRules(rules) {
    return this.handle.setRules(rules);
  }

  destroy() {
    this.handle.unbind();
    this.handle.removeEventListener('selectionchange', this._forward);
    this.handle.removeEventListener('mapdocumentchange', this._forward);
  }
}

/** A story map on the page (plan 27q1 §8): the selection only; it takes no records (its own come with its start). */
class StoryMapMember extends EventTarget {
  constructor(id, widget) {
    super();
    this.id = id;
    this.type = 'storymap';
    this.from = [];
    this.selection = true;
    this.syncMode = 'selection';
    this.widget = widget;
  }

  setDataSource() {
    return false;
  }

  setSelection(ids) {
    return this.widget?.setSelection?.(ids);
  }

  setActiveMapDocument() {}

  setRules() {}

  destroy() {}
}

/**
 * Crosstabs on the page (plan 27q2 §10): count the records of their sources; no selection. What they show is not sent on
 * (a clicked count is sent by the widget itself as `module:<id>`).
 */
class CrosstabsMember extends EventTarget {
  constructor(id, widget, from) {
    super();
    this.id = id;
    this.type = 'crosstabs';
    this.from = from.filter((origin) => origin !== 'own');
    this.selection = false;
    this.widget = widget;
  }

  /** The records of the page; with the request a Saved filter link shows the Filter Form of its source (review 6). */
  async setDataSource(dataSource, request = null) {
    try {
      if (typeof this.widget?.applyPageRequest === 'function') await this.widget.applyPageRequest(request || { dataSource, values: {}, missing: [] });
      else await this.widget?.setQuery?.(dataSource?.request?.q ?? null);
    } catch (error) {
      console.warn(`Page result: crosstabs (${this.id}) did not take the records`, error);
    }
    return false;
  }

  setSelection() {}

  setActiveMapDocument() {}

  setRules() {}

  destroy() {}
}

/** Explorer on the page: takes the Saved filter links (its filter form asks for missing values); no page selection. */
class ExplorerMember extends EventTarget {
  constructor(id, api, from) {
    super();
    this.id = id;
    this.type = 'explorer';
    this.from = from.filter((origin) => origin === 'links');
    this.selection = false;
    this.api = api;
  }

  /** The page request with its values and missing values. */
  async setDataSource(dataSource, request) {
    try {
      await this.api.applyPageRequest?.(request || { dataSource, values: {}, missing: [] });
      // its own result is not sent on (no module takes from Explorer)
      return false;
    } catch (error) {
      console.warn(`Page result: Explorer (${this.id}) did not take the records`, error);
      return false;
    }
  }

  destroy() {}
}
