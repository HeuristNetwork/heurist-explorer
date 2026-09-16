/**
 * @file RecordViewControlPanel.js
 * @brief Header-only control panel: title strip plus Help/Options/Publish, no dropdown body.
 *
 * Uses the same shared chrome every other module's control panel uses
 * (`.heurist-module-control-panel`/`.heurist-module-panel-header` from
 * `#shared/ui/heurist-module.css`) and the same DOM shape: an `<aside>`
 * sibling of the module's `<main>`, with `.heurist-source-header` prepended
 * into `<main>` itself - see `GraphControlPanel`/`DataControlPanel`. Record
 * View never has a Datasets/Filters list to collapse into, so unlike those
 * two panels this one has no `.heurist-module-panel-body` at all.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { $HR, applyI18n, InlineHelp } from "#shared/ui";

/** Header-only `<aside class="heurist-module-control-panel">`, sibling of the module's `<main>`. */
export class RecordViewControlPanel {
  /**
   * @param {object} options Panel dependencies.
   * @param {object} options.api Record View public API instance.
   * @param {HTMLElement} options.container Module's `<main>` element; the panel is anchored as its sibling and owns `.heurist-source-header` inside it.
   * @param {object} [options.options] Initial visibility/interaction options; refreshed via `applyOptions`.
   */
  constructor({ api, container, options = {} }) {
    this.api = api;
    this.container = container;
    this.options = options;
    this.listeners = [];
  }

  /**
   * Build the panel DOM, wire up API event listeners, and load its initial content.
   *
   * @returns {Promise<HTMLElement>} The mounted panel element.
   */
  async mount() {
    this.element = document.createElement("aside");
    this.element.className = "heurist-module-control-panel h-widget";
    this.element.setAttribute("aria-label", $HR("Record View controls"));

    const header = document.createElement("div");
    header.className = "heurist-module-panel-header";
    this.actions = document.createElement("span");
    this.actions.className = "h-inline heurist-module-panel-actions";
    this.helpButton = iconButton("fa-solid fa-circle-question", "Help", () => this.openHelp());
    this.optionsButton = iconButton("fa-solid fa-gear", "Options", () => this.api.openPreferencesDialog());
    this.publishButton = iconButton("fa-solid fa-share-nodes", "Publish", () => this.api.openPublishDialog());
    this.actions.append(this.helpButton, this.optionsButton, this.publishButton);
    header.append(this.actions);
    this.element.append(header);

    // Positioned absolute (not fixed, unlike Graph's viewport-docked panel):
    // Record View also supports `direct` module mode, where it can be
    // mounted alongside Explorer's own chrome in the same realm, so it must
    // stay anchored to its own container - see DataControlPanel's identical
    // choice/comment.
    const target = this.container.parentElement || document.body;
    if (target && globalThis.getComputedStyle?.(target).position === "static") target.style.position = "relative";
    target.append(this.element);
    this.sourceHeader = document.createElement("div");
    this.sourceHeader.className = "heurist-source-header";
    this.container.prepend(this.sourceHeader);

    this.bind("heurist-recordview-loaded", (event) => this.updateTitle(event.detail));
    this.bind("heurist-recordview-cleared", () => this.updateTitle(null));
    this.bind("heurist-recordview-configuration-changed", (event) => this.applyOptions(event.detail));

    this.applyVisibility();
    this.updateTitle(this.api.getState());
    applyI18n(this.element);
    return this.element;
  }

  /**
   * Subscribe to a public API event and remember the listener for `destroy`.
   *
   * @param {string} name Event type.
   * @param {Function} handler Event handler.
   * @returns {void}
   */
  bind(name, handler) {
    this.api.addEventListener(name, handler);
    this.listeners.push([name, handler]);
  }

  /** Refresh the source-header caption from a loaded/cleared-record detail (or `getState()`-shaped) value. */
  updateTitle(detail) {
    if (!this.sourceHeader) return;
    const headerTitle = this.options.headerTitle;
    const fallbackTitle = detail?.title ?? detail?.recordTitle ?? null;
    this.sourceHeader.textContent = headerTitle || fallbackTitle || $HR("Record View");
  }

  /** Load the module user manual for the active language into a full-viewport overlay. */
  openHelp() {
    this.helpOverlay ||= new InlineHelp({ moduleName: "recordview", baseUrl: this.options.helpBaseUrl || null });
    return this.helpOverlay.open();
  }

  /**
   * Apply an updated persisted configuration: visibility options, header title/message, then re-render the header.
   *
   * @param {{options?: object, config?: object}} [settings] Persisted-configuration settings.
   * @returns {void}
   */
  applyOptions(settings = {}) {
    const options = settings.options || {};
    const defaults = settings.config?.defaults || {};
    this.options = {
      ...this.options,
      showOptions: options.ui?.showOptions,
      showPublish: options.ui?.showPublish,
      showHeader: defaults.showHeader,
      headerTitle: defaults.headerTitle,
      readonly: options.interaction?.readonly,
    };
    this.applyVisibility();
    this.updateTitle(this.api.getState());
  }

  /** Re-apply header/button visibility from current options. */
  applyVisibility() {
    if (!this.element) return;
    const readonly = this.options.readonly === true;
    if (this.sourceHeader && !this.sourceHeader.isConnected) this.container.prepend(this.sourceHeader);
    if (this.optionsButton) this.optionsButton.hidden = readonly || this.options.showOptions === false;
    if (this.publishButton) this.publishButton.hidden = readonly || this.options.showPublish === false;
    if (this.sourceHeader) this.sourceHeader.hidden = this.options.showHeader === false;
    this.element.classList.toggle("with-source-header", this.options.showHeader !== false);
  }

  /**
   * Detach API event listeners and remove the panel and source header from the DOM.
   *
   * @returns {void}
   */
  destroy() {
    for (const [name, handler] of this.listeners) this.api.removeEventListener(name, handler);
    this.helpOverlay?.close();
    this.sourceHeader?.remove();
    this.element?.remove();
  }
}

/** Create a small icon-only button with a localized title/aria-label and an async click handler. */
function iconButton(icon, title, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "heurist-icon-button";
  button.title = $HR(title);
  button.setAttribute("aria-label", $HR(title));
  button.innerHTML = `<span class="${icon}" aria-hidden="true"></span>`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    Promise.resolve(handler()).catch(() => {});
  });
  return button;
}
