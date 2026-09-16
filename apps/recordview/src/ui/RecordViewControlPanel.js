/**
 * @file RecordViewControlPanel.js
 * @brief Header-only control panel: title strip plus Help/Options/Publish, no dropdown body.
 *
 * Modeled on `apps/data/src/ui/DataControlPanel.js`'s `main` mode — Record
 * View never has a Datasets/Filters list to collapse into, so unlike Data's
 * panel this one has no expand/collapse toggle at all.
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

/** Fixed header bar: title strip plus Help/Options/Publish. No body, no collapse. */
export class RecordViewControlPanel {
  /**
   * @param {object} options Panel dependencies.
   * @param {object} options.api Record View public API instance.
   * @param {object} [options.options] Initial visibility/interaction options; refreshed via `applyOptions`.
   */
  constructor({ api, options = {} }) {
    this.api = api;
    this.options = options;
    this.listeners = [];
  }

  /**
   * Build the panel DOM, wire up API event listeners.
   *
   * @param {HTMLElement} container Element to append the panel into.
   * @returns {HTMLElement} The mounted panel element.
   */
  mount(container) {
    this.element = document.createElement("header");
    this.element.className = "h-widget heurist-module-control-panel heurist-recordview-control-panel";
    this.element.setAttribute("aria-label", $HR("Record View controls"));

    this.title = document.createElement("span");
    this.title.className = "heurist-recordview-control-title";
    this.element.append(this.title);

    this.actions = document.createElement("span");
    this.actions.className = "h-inline heurist-module-panel-actions";
    this.helpButton = iconButton("fa-solid fa-circle-question", "Help", () => this.openHelp());
    this.optionsButton = iconButton("fa-solid fa-gear", "Options", () => this.api.openPreferencesDialog());
    this.publishButton = iconButton("fa-solid fa-share-nodes", "Publish", () => this.api.openPublishDialog());
    this.actions.append(this.helpButton, this.optionsButton, this.publishButton);
    this.element.append(this.actions);

    container.prepend(this.element);

    this.bind("heurist-recordview-loaded", (event) => this.updateTitle(event.detail));
    this.bind("heurist-recordview-cleared", () => this.updateTitle(null));
    this.bind("heurist-recordview-configuration-changed", (event) => {
      this.applyOptions(event.detail);
    });

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

  /** Refresh the header title from a loaded/cleared-record detail (or `getState()`-shaped) value. */
  updateTitle(detail) {
    if (!this.title) return;
    const headerTitle = this.options.headerTitle;
    const fallbackTitle = detail?.title ?? detail?.recordTitle ?? null;
    this.title.textContent = headerTitle || fallbackTitle || $HR("Record View");
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
      emptyMessage: defaults.emptyMessage,
      readonly: options.interaction?.readonly,
    };
    this.applyVisibility();
    this.updateTitle(this.api.getState());
  }

  /** Re-apply header/button visibility from current options. */
  applyVisibility() {
    if (!this.element) return;
    const readonly = this.options.readonly === true;
    this.element.hidden = this.options.showHeader === false;
    if (this.optionsButton) this.optionsButton.hidden = readonly || this.options.showOptions === false;
    if (this.publishButton) this.publishButton.hidden = readonly || this.options.showPublish === false;
  }

  /**
   * Detach API event listeners and remove the panel from the DOM.
   *
   * @returns {void}
   */
  destroy() {
    for (const [name, handler] of this.listeners) this.api.removeEventListener(name, handler);
    this.helpOverlay?.close();
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
