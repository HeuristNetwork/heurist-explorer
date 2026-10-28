/**
 * @file HeuristTimelinePublicApi.js
 * @brief Exposes the embeddable public API for the timeline application.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HeuristModulePublicApi } from '#shared/host/HeuristModulePublicApi.js';
import { timelineConfiguration } from '../configuration.js';
import {
  normalizeTimelineConfigurationSettings,
  serializeTimelineConfigurationSettings,
} from '../ui/config/timelineConfigurationSchema.js';

/**
 * Public API facade that exposes timeline operations to callers and host applications. The
 * configuration API (plan 29 §12) comes from HeuristModulePublicApi.
 */
export class HeuristTimelinePublicApi extends HeuristModulePublicApi {
  getMapDocuments() { return this.application.getMapDocuments(); }
  getActiveMapDocument() { return this.application.getActiveMapDocument(); }
  getDynamicDocument() { return this.application.getDynamicDocument(); }
  activateMapDocument(id, options) { return this.application.activateMapDocument(id, options); }
  reloadMapDocument(id) { return this.application.activateMapDocument(id, { force: true }); }
  async zoomToMapDocument(id) { await this.activateMapDocument(id); return this.zoomToAll(); }
  setDynamicDataSources(value) { return this.application.setDynamicDataSources(value); }
  getLayers() { return this.application.getLayers(); }
  setLayerVisibility(id, visible) { return this.application.setLayerVisibility(id, visible); }
  showLayerDataSource(id) { return this.application.showLayerDataSource(id); }
  reloadLayer(id) { return this.application.reloadLayer(id); }
  requestEditMapDocument(id) { return this.application.requestEditMapDocument(id); }
  requestEditLayer(id) { return this.application.requestEditLayer(id); }
  getCapabilities() {
    // the host can edit and editing is enabled (options.interaction.editEnabled, plan 29)
    const enabled = this.application.config?.interaction?.editEnabled !== false;
    return { editing: enabled && this.application.host.supportsEditing('RT_MAP_DOCUMENT') };
  }
  getHostCapabilities() {
    const host = this.application.host;
    // a timeline is published from Explorer only: its form writes the page (plan 29)
    return { mapPreferences: true, mapPublishing: typeof host?.bridge?.openConfiguration === 'function',
      showDatasource: typeof host.bridge?.showDatasource === 'function',
      explorerWorkspace: typeof host.bridge?.addDataSourceToWorkspace === 'function' };
  }
  addLayerToWorkspace(id) {
    return this.application.host.bridge?.addDataSourceToWorkspace?.(this.getLayers().find((layer) => layer.id === id)?.options?.dataSource);
  }
  removeLayerFromWorkspace(id) {
    return this.application.host.bridge?.removeDataSourceFromWorkspace?.(this.getLayers().find((layer) => layer.id === id)?.options?.dataSource);
  }
  /**
   * @protected The settings in use: the timeline keeps them in its config, not as an envelope.
   *
   * @returns {{options: object, config: object}}
   */
  currentSettings() {
    const config = this.application.config || {};
    return {
      options: {
        ui: config.ui,
        timeline: config.settings,
        mapDocuments: { allowed: config.documents?.query ?? null, initiallyActive: config.documents?.initiallyActive ?? 'dynamic' },
        interaction: config.interaction,
      },
      config: {},
    };
  }

  /**
   * @protected Apply settings (normalized) to the timeline and its control panel, and hand them to the host.
   *
   * @param {object} settings Settings `{options, config}` or an envelope.
   * @returns {object} The applied settings envelope.
   */
  applySettings(settings) {
    const value = normalizeTimelineConfigurationSettings(settings);
    const config = this.application.config;
    this.application.engine.setOptions(value.options.timeline);
    config.settings = value.options.timeline;
    config.ui = { ...value.options.ui, ...(config.simplified === true ? { initiallyExpanded: false } : {}) };
    config.interaction = value.options.interaction;
    config.documents = { ...(config.documents || {}), query: value.options.mapDocuments.allowed,
      initiallyActive: value.options.mapDocuments.initiallyActive };
    // the panel is made again: icons, Enable edit
    this.application.controlPanel?.applyOptions(config.ui);
    const applied = this.getConfiguration();
    this.application.host?.bridge?.updateSettings?.({ options: applied.options, config: applied.config });
    this.application.dispatch('heurist-timeline-options-changed', { ...config.settings });
    return applied;
  }

  /**
   * Open the configuration form (plan 29): `configuration` applies the settings;
   * `publication` (Explorer only) gives Explorer the page settings and the state, and
   * Explorer's form writes the page.
   *
   * @param {{mode?: string}} [options]
   * @returns {Promise<object|null>} The applied settings or the publication; null when cancelled.
   */
  async openConfigurationDialog({ mode = 'configuration' } = {}) {
    const publication = mode === 'publication' || mode === 'publish';
    const title = publication ? 'Publish timeline' : 'Timeline options';
    // Explorer opens the form in its own window (plan 29): it gives the settings back, or in
    // publication mode publishes the page itself with the settings and state given here
    const bridge = this.application.host?.bridge;
    if (typeof bridge?.openConfiguration === 'function') {
      const result = await bridge.openConfiguration(publication
        ? { mode: 'publication', title, value: this.publicationSettings(), state: this.application.getState(),
          simplified: this.application.config?.simplified === true }
        : { mode: 'configuration', title, value: this.getConfiguration(),
          simplified: this.application.config?.simplified === true });
      if (!result || publication) return result;
      return this.setConfiguration(result);
    }
    // without Explorer: no publication (the page is written by Explorer's form)
    if (publication) return null;
    const [{ ModuleConfigurationDialog }, { timelineConfiguration }] = await Promise.all([
      import('#shared/ui/config/ModuleConfigurationDialog.js'),
      import('../configuration.js'),
    ]);
    return new ModuleConfigurationDialog({
      form: timelineConfiguration.form,
      formId: 'timeline',
      mode,
      title,
      value: this.getConfiguration(),
      defaults: timelineConfiguration.defaults,
      normalize: timelineConfiguration.normalize,
      simplified: this.application.config?.simplified === true,
      onSave: async (settings) => {
        await this.setConfiguration(settings);
        return true;
      },
    }).open();
  }

  /** @returns {Promise<object|null>} The configuration form (Options icon). */
  openPreferencesDialog() {
    return this.openConfigurationDialog({ mode: 'configuration' });
  }

  /** @returns {Promise<object|null>} The publication form (Publish icon). */
  openPublishDialog() {
    return this.openConfigurationDialog({ mode: 'publication' });
  }

  /**
   * Settings of a published page: the active document, no editing, and "auto" as the
   * language of now.
   *
   * @param {object} [settings] Settings (default: the current ones).
   * @returns {object} Settings envelope for the page.
   */
  publicationSettings(settings = this.getConfiguration()) {
    const value = normalizeTimelineConfigurationSettings(settings);
    const options = {
      ...value.options,
      // "auto" is the visitor's language in a published page: the language of now (as the other modules)
      ui: { ...value.options.ui, language: value.options.ui.language === 'auto'
        ? (this.application.config?.language || 'eng') : value.options.ui.language },
      mapDocuments: { allowed: value.options.mapDocuments.allowed, initiallyActive: this.application.activeDocumentId },
      // a published timeline does not edit (plan 29)
      interaction: { editEnabled: false },
    };
    return serializeTimelineConfigurationSettings({ options, config: {} });
  }
  /**
   * Creates the public API wrapper around the application instance.
   *
   * @param {object} application - Timeline application controller.
   */
  constructor(application) {
    super(application, { configuration: timelineConfiguration });
  }

  /**
   * Sets the active result query for the current context.
   *
   * @param {string|object|null} query - Query payload.
   * @param {object} [options={}] - Additional query options.
   * @returns {Promise<object>} Updated application state.
   */
  setQuery(query, options) {
    return this.application.setQuery(query, options);
  }

  /**
   * Replaces the entire list of timeline contexts.
   *
   * @param {Array<object>} contexts - Context definitions.
   * @param {object} [options={}] - Context update options.
   * @returns {Promise<object>} Updated application state.
   */
  setContexts(contexts, options) {
    return this.application.setContexts(contexts, options);
  }

  /**
   * Adds a new context to the current timeline definition.
   *
   * @param {object} context - Context definition to append.
   * @returns {Promise<object>} Updated application state.
   */
  addContext(context) {
    return this.application.addContext(context);
  }

  /**
   * Removes an existing context by identifier.
   *
   * @param {string|number} id - Context identifier.
   * @returns {Promise<object>} Updated application state.
   */
  removeContext(id) {
    return this.application.removeContext(id);
  }

  /**
   * Sets the selected record identifiers.
   *
   * @param {Array<number>} ids - Selected record IDs.
   * @param {object} [options={}] - Selection options.
   * @returns {Promise<Array<number>>} Updated selection list.
   */
  setSelection(ids, options) {
    return this.application.setSelection(ids, options);
  }

  /**
   * Clears any existing record selection.
   *
   * @returns {Promise<Array<number>>} Updated selection list.
   */
  clearSelection() {
    return this.application.clearSelection();
  }

  /**
   * Reloads the active contexts from the source payload.
   *
   * @returns {Promise<object>} Updated application state.
   */
  refresh() {
    return this.application.refresh();
  }

  /**
   * Resizes the timeline display.
   *
   * @returns {Promise<void>|void} Resize result.
   */
  resize() {
    return this.application.resize();
  }

  /**
   * Returns the current serialized timeline application state.
   *
   * @returns {object} Current application state.
   */
  getState() {
    return { ...this.application.getState(), options: { ...this.application.config.settings, ...this.application.config.ui } };
  }

  /**
   * Zooms in by one step.
   */
  zoomIn() {
    return this.application.engine.zoomIn();
  }

  /**
   * Zooms out by one step.
   */
  zoomOut() {
    return this.application.engine.zoomOut();
  }

  /**
   * Fits the timeline to all loaded items.
   *
   * @returns {Promise<void>|void} Result of the engine call.
   */
  zoomToAll() {
    return this.application.zoomToAll();
  }

  /**
   * Fits the viewport around the current selection.
   *
   * @returns {Promise<void>|void} Result of the engine call.
   */
  zoomToSelection() {
    return this.application.zoomToSelection();
  }

  /**
   * Moves the viewport to the first item in the dataset.
   */
  moveToStart() {
    return this.application.engine.moveToStart();
  }

  /**
   * Moves the viewport to the final item in the dataset.
   */
  moveToEnd() {
    return this.application.engine.moveToEnd();
  }

  /**
   * Validates and applies partial display option changes to the engine and configuration.
   *
   * @param {{labelMode?: string, labelPosition?: string, orientation?: string, stack?: boolean}} [options={}] - Partial option changes.
   * @returns {object} The fully resolved settings after applying the changes.
   * @throws {Error} When an option value is not one of its supported choices.
   */
  applyOptions(options = {}) {
    const settings = { ...this.application.config.settings };
    for (const [key, choices] of Object.entries({ labelMode: ['full', 'truncate', 'hidden'], labelPosition: ['bar', 'above'], orientation: ['top', 'bottom', 'both'] })) {
      if (key in options) {
        if (!choices.includes(options[key])) throw new Error('Invalid timeline option: ' + key);
        settings[key] = options[key];
      }
    }
    if ('stack' in options) settings.stack = options.stack !== false;
    this.application.engine.setOptions(settings);
    this.application.config.settings = settings;
    const ui = { ...this.application.config.ui };
    for (const key of ['showSourceHeader', 'initiallyExpanded']) if (key in options) ui[key] = options[key] === true;
    if (this.application.config.simplified === true) ui.initiallyExpanded = false;
    this.application.config.ui = ui;
    if ('showSourceHeader' in options || 'initiallyExpanded' in options) this.application.controlPanel?.applyOptions(ui);
    const applied = this.getConfiguration();
    this.application.host?.bridge?.updateSettings?.({ options: applied.options, config: applied.config });
    this.application.dispatch('heurist-timeline-options-changed', { ...settings });
    return { ...settings };
  }

  /**
   * Cycles through the available label display modes.
   *
   * @returns {string} The newly selected label mode.
   */
  cycleLabelMode() {
    const modes = ["full", "truncate", "hidden"];
    const engine = this.application.engine;
    const current = modes.indexOf(engine.settings.labelMode);
    const next = modes[(current + 1) % modes.length];
    this.applyOptions({ labelMode: next });
    return next;
  }

  /**
   * Adds a DOM event listener to the underlying application.
   *
   * @returns {void}
   */
  addEventListener(...args) {
    this.application.addEventListener(...args);
  }

  /**
   * Removes a DOM event listener from the underlying application.
   *
   * @returns {void}
   */
  removeEventListener(...args) {
    this.application.removeEventListener(...args);
  }

  /**
   * Tears down the timeline and releases hosted resources.
   *
   * @returns {Promise<void>} Destroy operation result.
   */
  destroy() {
    return this.application.destroy();
  }
}
