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
  constructor() {
    this.container = null;
    this.options = {};
    this.state = "idle";
    this._disposers = [];
  }

  get isRendered() {
    return this.state === "rendered";
  }

  attach(container, options = {}) {
    if (!(container instanceof HTMLElement))
      throw new TypeError("Widget container must be an HTMLElement");
    this.container = container;
    this.options = { ...options };
    this.state = "attached";
    return this;
  }

  $(selector) {
    return this.container?.querySelector(selector) || null;
  }
  $$(selector) {
    return this.container?.querySelectorAll(selector) || [];
  }

  listen(target, type, handler, options) {
    target?.addEventListener(type, handler, options);
    this._disposers.push(() =>
      target?.removeEventListener(type, handler, options),
    );
  }

  delegate(target, type, selector, handler) {
    const listener = (event) => {
      const match =
        event.target instanceof Element ? event.target.closest(selector) : null;
      if (match && target.contains(match)) handler(event, match);
    };
    this.listen(target, type, listener);
  }

  clearListeners() {
    while (this._disposers.length) this._disposers.pop()?.();
  }

  async destroy() {
    this.clearListeners();
    this.container?.replaceChildren();
    this.container = null;
    this.state = "destroyed";
  }
}
