/**
 * @file HeuristTimelinePublicApi.js
 * @brief Exposes the embeddable public API for the timeline application.
 * @project     Heurist academic knowledge management system
 * @package     heurist-timeline
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/**
 * Public API facade that exposes timeline operations to callers and host applications.
 */
export class HeuristTimelinePublicApi {
  /**
   * Creates the public API wrapper around the application instance.
   *
   * @param {object} application - Timeline application controller.
   */
  constructor(application) {
    this.application = application;
    this.readyPromise = null;
  }

  /**
   * Registers the promise that resolves once the timeline is ready.
   *
   * @param {Promise<object>} value - Ready promise.
   */
  setReadyPromise(value) {
    this.readyPromise = value;
  }

  /**
   * Resolves when the application is ready.
   *
   * @returns {Promise<object>} Pending ready promise or the API object itself.
   */
  ready() {
    return this.readyPromise || Promise.resolve(this);
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
    return { ...this.application.getState(), options: { ...this.application.config.settings } };
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
   * Cycles through the available label display modes.
   *
   * @returns {string} The newly selected label mode.
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
    this.application.dispatch('heurist-timeline-options-changed', { ...settings });
    return { ...settings };
  }

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

