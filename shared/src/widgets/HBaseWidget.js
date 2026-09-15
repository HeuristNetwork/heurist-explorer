/**
 * @file HBaseWidget.js
 * @brief Minimal lifecycle and DOM base for reusable Heurist widgets.
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Supplies lifecycle and DOM helpers for reusable Heurist widgets. */
export class HBaseWidget {
  /** Create the widget in its unattached, idle state. */
  constructor() {
    this.container = null;
    this.options = {};
    this.state = "idle";
    this._disposers = [];
  }

  /** Whether the widget has completed rendering into its container. */
  get isRendered() {
    return this.state === "rendered";
  }

  /**
   * Attach the widget to a container element and record its options.
   *
   * @param {HTMLElement} container Element the widget will render into.
   * @param {object} [options] Widget-specific options.
   * @returns {HBaseWidget} This instance, for chaining.
   * @throws {TypeError} When `container` is not an `HTMLElement`.
   */
  attach(container, options = {}) {
    if (!(container instanceof HTMLElement))
      throw new TypeError("Widget container must be an HTMLElement");
    this.container = container;
    this.options = { ...options };
    this.state = "attached";
    return this;
  }

  /**
   * Query a single descendant of the container.
   *
   * @param {string} selector CSS selector.
   * @returns {Element|null} Matching element, or `null` when unattached or not found.
   */
  $(selector) {
    return this.container?.querySelector(selector) || null;
  }

  /**
   * Query all descendants of the container matching a selector.
   *
   * @param {string} selector CSS selector.
   * @returns {NodeListOf<Element>|Array} Matching elements, or an empty array when unattached.
   */
  $$(selector) {
    return this.container?.querySelectorAll(selector) || [];
  }

  /**
   * Add an event listener and register it for automatic removal on `clearListeners`/`destroy`.
   *
   * @param {EventTarget} target Event target to listen on.
   * @param {string} type Event type.
   * @param {Function} handler Event handler.
   * @param {object|boolean} [options] `addEventListener` options.
   * @returns {void}
   */
  listen(target, type, handler, options) {
    target?.addEventListener(type, handler, options);
    this._disposers.push(() =>
      target?.removeEventListener(type, handler, options),
    );
  }

  /**
   * Listen for an event on `target`, invoking `handler` only when it originated
   * from a descendant matching `selector`.
   *
   * @param {EventTarget} target Event target to listen on.
   * @param {string} type Event type.
   * @param {string} selector CSS selector the event's target must match (or be inside).
   * @param {function(Event, Element): void} handler Called with the event and the matched element.
   * @returns {void}
   */
  delegate(target, type, selector, handler) {
    const listener = (event) => {
      const match =
        event.target instanceof Element ? event.target.closest(selector) : null;
      if (match && target.contains(match)) handler(event, match);
    };
    this.listen(target, type, listener);
  }

  /**
   * Remove every listener registered through `listen`/`delegate`.
   *
   * @returns {void}
   */
  clearListeners() {
    while (this._disposers.length) this._disposers.pop()?.();
  }

  /**
   * Remove listeners, clear the container's contents, and mark the widget destroyed.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    this.clearListeners();
    this.container?.replaceChildren();
    this.container = null;
    this.state = "destroyed";
  }
}
