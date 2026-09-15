/**
 * @file LayoutManager.js
 * @brief Semantic Explorer layout controller built on HCardinalLayout.
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

import { isSameDataSource } from './DataSource.js';
import { HCardinalLayout } from '../ui/HCardinalLayout.js';

const REGIONS = ['north', 'west', 'center', 'east', 'south'];

const DEFAULT_REGION_BY_TYPE = {
  data: 'west',
  map: 'center',
  graph: 'center',
  timeline: 'south',
  recordview: 'east'
};

/**
 * Semantic Explorer layout controller built on HCardinalLayout.
 *
 * LayoutManager owns module discovery, semantic module-to-region assignment,
 * presentation visibility and activation. HCardinalLayout owns only geometry,
 * splitter resizing, collapse and focus behavior.
 */
export class LayoutManager extends EventTarget {
  /**
   * @param {HTMLElement} container Explorer workspace container.
   * @param {object} [options] Layout options.
   */
  constructor(container, options = {}) {
    super();

    this.container = container;
    this.slots = new Map();
    this.assignments = new Map();
    this.regionAssignments = new Map();
    this.definitions = [];
    this.modules = null;
    this.activeModuleId = null;
    this.mode = 'presentation';
    this.activeToolId = null;
    this._toolSnapshot = null;
    this._toolSlotId = '__explorer-tool';
    this.cardinal = new HCardinalLayout(container, options.cardinal || {});

    this._forwardCardinalEvents();
  }

  /**
   * Binds the Explorer module registry used for discovery operations.
   *
   * @param {Map<string, object>} modules Explorer module registry.
   * @returns {LayoutManager}
   */
  bindModules(modules) {
    this.modules = modules || null;
    return this;
  }

  /**
   * Applies module definitions and assigns them to cardinal regions.
   *
   * A definition may specify `region`. Otherwise defaults are:
   * data=west, map/graph=center, recordview=east, timeline=south.
   *
   * @param {Array<object>} definitions Module definitions.
   * @returns {LayoutManager}
   */
  setLayout(definitions = []) {
    const list = Array.isArray(definitions) ? definitions : [];
    this.definitions = list.map((item) => ({ ...item, id: String(item.id) }));
    const active = new Set(this.definitions.map((item) => item.id));

    for (const [id, slot] of this.slots) {
      if (!active.has(id) && slot.dataset.transient !== 'true') {
        this.removeSlot(id);
      }
    }

    for (const definition of this.definitions) {
      const slot = this.createSlot(definition.id, definition.type);
      const region = normalizeRegion(definition.region)
        || DEFAULT_REGION_BY_TYPE[definition.type]
        || 'center';

      if (definition.title) {
        slot.setAttribute('aria-label', definition.title);
      }

      this.assignModule(definition.id, region);
    }

    this._syncRegionVisibility();
    return this;
  }

  /**
   * Adds or replaces one module definition without rebuilding the layout.
   *
   * @param {object} definition Module definition.
   * @returns {object} Normalized definition.
   */
  addDefinition(definition) {
    const item = { ...definition, id: String(definition.id) };
    const index = this.definitions.findIndex((entry) => entry.id === item.id);

    if (index >= 0) {
      this.definitions[index] = item;
    } else {
      this.definitions.push(item);
    }

    this.createSlot(item.id, item.type);
    const region = normalizeRegion(item.region)
      || DEFAULT_REGION_BY_TYPE[item.type]
      || 'center';
    this.assignModule(item.id, region);
    return item;
  }

  /**
   * Removes one module definition and its slot.
   *
   * @param {string} id Module id.
   */
  removeDefinition(id) {
    const key = String(id);
    this.definitions = this.definitions.filter((item) => item.id !== key);
    this.removeSlot(key);
  }

  /**
   * Returns a module definition by id.
   *
   * @param {string} id Module id.
   * @returns {object|null}
   */
  getDefinition(id) {
    const key = String(id);
    return this.definitions.find((item) => item.id === key) || null;
  }

  /**
   * Creates or returns the DOM slot for an Explorer module.
   *
   * @param {string} id Module id.
   * @param {string} [type] Module type.
   * @returns {HTMLElement}
   */
  createSlot(id, type) {
    const key = String(id);

    if (this.slots.has(key)) {
      return this.slots.get(key);
    }

    const slot = document.createElement('section');
    slot.className = 'h-explorer-slot';
    slot.dataset.moduleId = key;
    slot.dataset.moduleType = type || '';
    slot.hidden = true;
    this.slots.set(key, slot);
    return slot;
  }

  /**
   * Returns a module slot by id.
   *
   * @param {string} id Module id.
   * @returns {HTMLElement|null}
   */
  getSlot(id) {
    return this.slots.get(String(id)) || null;
  }

  /**
   * Returns all current module slots.
   *
   * @returns {Array<HTMLElement>}
   */
  getSlots() {
    return [...this.slots.values()];
  }

  /**
   * Removes a module slot and its cardinal assignment.
   *
   * @param {string} id Module id.
   * @returns {boolean}
   */
  removeSlot(id) {
    const key = String(id);
    const slot = this.getSlot(key);

    if (!slot) {
      return false;
    }

    const region = this.assignments.get(key);
    slot.remove();
    this.slots.delete(key);
    this.assignments.delete(key);

    if (region && this.regionAssignments.get(region) === key) {
      this.regionAssignments.delete(region);
      const replacement = this._firstAssignedSlot(region, key);

      if (replacement) {
        this.regionAssignments.set(region, replacement);
        const replacementSlot = this.getSlot(replacement);

        if (replacementSlot) {
          replacementSlot.hidden = false;
        }
      } else {
        this.cardinal.hide(region);
      }
    }

    if (this.activeModuleId === key) {
      this.activeModuleId = null;
    }

    this._emit('moduleassignmentchange', { id: key, region: null });
    return true;
  }

  /**
   * Assigns one module slot to a cardinal region.
   *
   * One module occupies a region at a time. Assigning another module to the
   * same region hides the previous occupant but keeps its slot registered.
   *
   * @param {string} id Module id.
   * @param {'north'|'west'|'center'|'east'|'south'} region Target region.
   * @returns {boolean}
   */
  assignModule(id, region) {
    const key = String(id);
    const targetRegion = normalizeRegion(region);
    const slot = this.getSlot(key);

    if (!slot || !targetRegion) {
      return false;
    }

    const oldRegion = this.assignments.get(key);
    const targetHost = this.cardinal.getRegionElement(targetRegion);

    // Existing iframe slots must remain mounted. Removing and re-appending
    // them unloads their browsing context and invalidates the child API.
    // Reparent only when a module is genuinely moved to another region.
    if (slot.parentElement !== targetHost) {
      targetHost.append(slot);
    }

    if (oldRegion && oldRegion !== targetRegion && this.regionAssignments.get(oldRegion) === key) {
      this.regionAssignments.delete(oldRegion);

      if (!this._hasAssignedSlots(oldRegion, key)) {
        this.cardinal.hide(oldRegion);
      }
    }

    const previousId = this.regionAssignments.get(targetRegion);

    if (previousId && previousId !== key) {
      const previousSlot = this.getSlot(previousId);

      if (previousSlot) {
        previousSlot.hidden = true;
      }
    }

    this.assignments.set(key, targetRegion);
    this.regionAssignments.set(targetRegion, key);

    for (const [slotId, assignedRegion] of this.assignments) {
      if (assignedRegion !== targetRegion) {
        continue;
      }

      const regionSlot = this.getSlot(slotId);

      if (regionSlot) {
        regionSlot.hidden = slotId !== key;
      }
    }

    slot.hidden = false;
    this.cardinal.show(targetRegion);

    this._emit('moduleassignmentchange', {
      id: key,
      region: targetRegion,
      previousId: previousId || null
    });
    return true;
  }

  /**
   * Returns the region currently assigned to a module.
   *
   * @param {string} id Module id.
   * @returns {string|null}
   */
  getRegionForModule(id) {
    return this.assignments.get(String(id)) || null;
  }

  /**
   * Returns the module id currently occupying a region.
   *
   * @param {string} region Cardinal region.
   * @returns {string|null}
   */
  getModuleForRegion(region) {
    const targetRegion = normalizeRegion(region);
    return targetRegion ? this.regionAssignments.get(targetRegion) || null : null;
  }

  /**
   * Returns registered Explorer modules matching a predicate.
   *
   * @param {Function|null} predicate Predicate receiving module instance.
   * @returns {Array<object>}
   */
  findModules(predicate = null) {
    const list = [...(this.modules?.values?.() || [])];
    return typeof predicate === 'function' ? list.filter(predicate) : list;
  }

  /**
   * Returns all registered heurist-data modules.
   *
   * @returns {Array<object>}
   */
  findDataModules() {
    return this.findModules((module) => module.type === 'data');
  }

  /**
   * Finds modules with the same logical DataSource.
   *
   * @param {object} source DataSource to match.
   * @param {object} [options] Match options.
   * @param {string|null} [options.type='data'] Optional module type filter.
   * @returns {Array<object>}
   */
  findByDataSource(source, { type = 'data' } = {}) {
    return this.findModules((module) => {
      return (!type || module.type === type) && isSameDataSource(module.dataSource, source);
    });
  }

  /**
   * Returns the reusable Current-result data module, when present.
   *
   * @returns {object|null}
   */
  findCurrentResultDataModule() {
    const views = this.findDataModules();
    return views.find((module) => module.context?.role === 'current')
      || views.find((module) => module.dataSource?.reference?.type === 'query')
      || views.find((module) => module.id === 'data')
      || null;
  }

  /**
   * Activates and reveals a registered module.
   *
   * @param {string} id Module id.
   * @returns {boolean}
   */
  activateModule(id) {
    const key = String(id);

    if (!this.modules?.has?.(key)) {
      return false;
    }

    this.activeModuleId = key;
    this.showModule(key);

    for (const [slotId, slot] of this.slots) {
      const active = slotId === key;
      slot.classList.toggle('h-explorer-slot-active', active);
      slot.setAttribute('aria-current', active ? 'true' : 'false');
    }

    this._emit('moduleactivate', {
      moduleId: key,
      module: this.modules.get(key)
    });
    return true;
  }

  /**
   * Shows a module by activating its assigned region.
   *
   * @param {string} id Module id.
   * @returns {boolean}
   */
  showModule(id) {
    const key = String(id);
    const region = this.assignments.get(key);

    if (!region) {
      return false;
    }

    if (this.regionAssignments.get(region) !== key) {
      this.assignModule(key, region);
    }

    this.cardinal.show(region);
    this.getSlot(key).hidden = false;
    this._emit('modulevisibilitychange', { id: key, visible: true, region });
    return true;
  }

  /**
   * Hides a module's region without destroying the module.
   *
   * @param {string} id Module id.
   * @returns {boolean}
   */
  hideModule(id) {
    const key = String(id);
    const region = this.assignments.get(key);

    if (!region || this.regionAssignments.get(region) !== key) {
      return false;
    }

    this.cardinal.hide(region);
    this._emit('modulevisibilitychange', { id: key, visible: false, region });
    return true;
  }

  /**
   * Toggles visibility for a module's assigned region.
   *
   * @param {string} id Module id.
   * @returns {boolean} New visibility state.
   */
  toggleModule(id) {
    const key = String(id);
    const region = this.assignments.get(key);

    if (!region) {
      return false;
    }

    const visible = this.cardinal.getState()[region].visible;

    if (visible && this.regionAssignments.get(region) === key) {
      this.hideModule(key);
      return false;
    }

    this.showModule(key);
    return true;
  }

  /**
   * Gives a module full workspace focus.
   *
   * @param {string} id Module id.
   * @returns {boolean}
   */
  focusModule(id) {
    const region = this.getRegionForModule(id);
    return region ? this.cardinal.focus(region) : false;
  }

  /**
   * Restores layout after focusModule().
   *
   * @returns {boolean}
   */
  restoreFocus() {
    return this.cardinal.restoreFocus();
  }

  /**
   * Returns true when Tools mode is active.
   *
   * @param {string|null} [toolId] Optional tool id to match.
   * @returns {boolean}
   */
  isToolMode(toolId = null) {
    if (this.mode !== 'tool') {
      return false;
    }

    return toolId == null || this.activeToolId === String(toolId);
  }

  /**
   * Temporarily switches the cardinal layout to Data | Tool.
   *
   * The complete presentation geometry and region occupancy are preserved and
   * restored by exitToolMode(). Presentation modules remain mounted.
   *
   * @param {string} toolId Tool id.
   * @param {HTMLElement} content Tool content element.
   * @param {object} [options] Reserved tool options.
   * @returns {boolean}
   */
  enterToolMode(toolId, content, options = {}) {
    if (!(content instanceof HTMLElement)) {
      return false;
    }

    if (this.mode !== 'tool') {
      this._toolSnapshot = {
        cardinal: this.cardinal.getState(),
        regions: Object.fromEntries(this.regionAssignments),
        activeModuleId: this.activeModuleId
      };
    }

    this.mode = 'tool';
    this.activeToolId = String(toolId || 'tool');

    const toolSlot = this.createSlot(this._toolSlotId, 'tool');
    toolSlot.replaceChildren(content);
    this.assignModule(this._toolSlotId, 'center');

    const dataModule = this.findCurrentResultDataModule();

    if (dataModule) {
      this.assignModule(dataModule.id, 'west');
      this.showModule(dataModule.id);
    } else {
      this.cardinal.hide('west');
    }

    this.cardinal.hide('north');
    this.cardinal.hide('east');
    this.cardinal.hide('south');
    this.cardinal.show('center');
    toolSlot.hidden = false;

    this._emit('modechange', {
      mode: this.mode,
      toolId: this.activeToolId,
      options
    });
    return true;
  }

  /**
   * Restores the presentation layout saved by enterToolMode().
   *
   * @returns {boolean}
   */
  exitToolMode() {
    if (this.mode !== 'tool') {
      return false;
    }

    const snapshot = this._toolSnapshot;
    this.removeSlot(this._toolSlotId);
    this.mode = 'presentation';
    this.activeToolId = null;

    if (snapshot) {
      for (const [region, moduleId] of Object.entries(snapshot.regions || {})) {
        if (moduleId && this.slots.has(moduleId)) {
          this.assignModule(moduleId, region);
        }
      }

      this.cardinal.setState(snapshot.cardinal || {});
      this.activeModuleId = snapshot.activeModuleId || null;
    }

    this._toolSnapshot = null;
    this._emit('modechange', { mode: this.mode, toolId: null });
    return true;
  }

  /**
   * Returns presentation visibility independent of temporary Tools mode.
   *
   * @param {string} type Presentation module type.
   * @returns {boolean}
   */
  isPresentationVisible(type) {
    const sourceState = this.mode === 'tool' && this._toolSnapshot
      ? this._toolSnapshot
      : {
        cardinal: this.cardinal.getState(),
        regions: Object.fromEntries(this.regionAssignments)
      };

    for (const [region, moduleId] of Object.entries(sourceState.regions || {})) {
      const slot = moduleId ? this.getSlot(moduleId) : null;

      if (
        sourceState.cardinal?.[region]?.visible
        && slot?.dataset.moduleType === type
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns cardinal geometry and semantic module assignments.
   *
   * @returns {object}
   */
  getState() {
    return {
      mode: this.mode,
      activeToolId: this.activeToolId,
      cardinal: this.cardinal.getState(),
      assignments: Object.fromEntries(this.assignments),
      regions: Object.fromEntries(this.regionAssignments),
      activeModuleId: this.activeModuleId
    };
  }

  /**
   * Restores cardinal geometry and known module assignments.
   *
   * @param {object} state LayoutManager state.
   * @returns {LayoutManager}
   */
  setState(state = {}) {
    if (state.cardinal) {
      this.cardinal.setState(state.cardinal);
    }

    if (state.assignments && typeof state.assignments === 'object') {
      for (const [id, region] of Object.entries(state.assignments)) {
        if (this.slots.has(id) && normalizeRegion(region)) {
          this.assignModule(id, region);
        }
      }
    }

    if (state.activeModuleId && this.modules?.has?.(state.activeModuleId)) {
      this.activateModule(state.activeModuleId);
    }

    return this;
  }

  /**
   * Re-applies cardinal geometry after outer resizing.
   *
   * @returns {LayoutManager}
   */
  resize() {
    this.cardinal.resize();
    return this;
  }

  /**
   * Destroys the layout and all generated slots.
   */
  destroy() {
    this.cardinal.destroy();
    this.slots.clear();
    this.assignments.clear();
    this.regionAssignments.clear();
    this.definitions = [];
    this.modules = null;
    this._toolSnapshot = null;
    this.activeToolId = null;
    this.mode = 'presentation';
  }

  /**
   * Whether another slot besides `excludingId` is still assigned to a region.
   *
   * @private
   * @param {string} region Cardinal region.
   * @param {string|null} [excludingId] Module id to ignore.
   * @returns {boolean}
   */
  _hasAssignedSlots(region, excludingId = null) {
    for (const [id, assignedRegion] of this.assignments) {
      if (id !== excludingId && assignedRegion === region && this.slots.has(id)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Finds another slot besides `excludingId` still assigned to a region.
   *
   * @private
   * @param {string} region Cardinal region.
   * @param {string|null} [excludingId] Module id to ignore.
   * @returns {string|null} Its module id, or `null` when none remain.
   */
  _firstAssignedSlot(region, excludingId = null) {
    for (const [id, assignedRegion] of this.assignments) {
      if (id !== excludingId && assignedRegion === region && this.slots.has(id)) {
        return id;
      }
    }

    return null;
  }

  /**
   * Shows every occupied region and hides every empty one.
   *
   * @private
   * @returns {void}
   */
  _syncRegionVisibility() {
    for (const region of REGIONS) {
      if (this.regionAssignments.has(region)) {
        this.cardinal.show(region);
      } else {
        this.cardinal.hide(region);
      }
    }
  }

  /**
   * Re-dispatch HCardinalLayout's geometry/visibility events as LayoutManager events.
   *
   * @private
   * @returns {void}
   */
  _forwardCardinalEvents() {
    const eventNames = [
      'regionresize',
      'regionvisibilitychange',
      'regioncollapsechange',
      'focuschange',
      'layoutchange'
    ];

    for (const eventName of eventNames) {
      this.cardinal.addEventListener(eventName, (event) => {
        this._emit(eventName, event.detail);
      });
    }
  }

  /**
   * Dispatch a CustomEvent carrying `detail`.
   *
   * @private
   * @param {string} type Event type.
   * @param {object} detail Event detail payload.
   * @returns {void}
   */
  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

/** Normalize a region value to one of `REGIONS`, or `null` when not a valid region. */
function normalizeRegion(region) {
  const value = String(region || '').toLowerCase();
  return REGIONS.includes(value) ? value : null;
}
