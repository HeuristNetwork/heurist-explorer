/**
 * @file DataControlPanel.js
 * @brief Renders the Data module's header-only control bar (source caption, help/options/publish).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR, applyI18n, InlineHelp } from "#shared/ui";

/**
 * Fixed header-only bar overlaying the DataTables toolbar: source caption plus
 * help/options/publish actions. The module no longer browses Query Sources or
 * Filters itself - the host resolves and pushes a complete DataSource.
 */
export class DataControlPanel {
  /**
   * @param {object} options Panel dependencies.
   * @param {object} options.api Data public API instance.
   * @param {HTMLElement} options.tableContainer Element the rendering engine renders into; the panel is anchored above it.
   * @param {object} [options.options] Initial visibility/interaction options; refreshed via `applyOptions`.
   */
  constructor({ api, tableContainer, options = {} }) {
    this.api = api;
    this.tableContainer = tableContainer;
    this.options = options;
    this.listeners = [];
  }

  /**
   * Build the panel DOM, wire up API event listeners, and load its initial content.
   *
   * @returns {Promise<HTMLElement|null>} The mounted panel element, or `null` when the panel is disabled.
   */
  async mount() {
    if (this.options.enabled === false) return null;
    // "main" = the module embedded in the main Heurist editor: fixed layout,
    // control panel always visible as a header-only bar.
    this.main =
      String(this.options.runtimeMode || "").toLowerCase() === "main";
    this.element = document.createElement("aside");
    this.element.className = "h-widget heurist-module-control-panel";
    if (this.main) this.element.classList.add("main-mode");
    this.element.setAttribute("aria-label", $HR("Data controls"));
    const header = document.createElement("div");
    header.className = "h-toolbar heurist-module-panel-header";

    this.actions = document.createElement("span");
    this.actions.className = "h-inline heurist-module-panel-actions";
    // The column / fields picker now lives in the DataTables engine toolbar
    // (Table view only), not in this panel header.
    this.helpButton = iconButton("fa-solid fa-circle-question", "Help", () =>
      this.openHelp(),
    );
    this.helpButton.classList.add("heurist-data-help-button");
    this.optionsButton = iconButton("fa-solid fa-gear", "Options", () =>
      this.api.openPreferencesDialog(),
    );
    this.publishButton = iconButton("fa-solid fa-share-nodes", "Publish", () =>
      this.api.openPublishDialog(),
    );
    this.actions.append(this.helpButton, this.optionsButton, this.publishButton);
    header.append(this.actions);

    this.collapseToggle = iconButton(
      "fa-solid fa-layer-group",
      "Show or hide data controls",
      () => this.toggleFullyCollapsed(),
    );
    this.collapseToggle.classList.add("heurist-module-panel-toggle");
    header.append(this.collapseToggle);

    this.element.append(header);
    const target = this.tableContainer.parentElement || document.body;
    if (target && globalThis.getComputedStyle?.(target).position === "static")
      target.style.position = "relative";
    target.append(this.element);
    this.sourceHeader = document.createElement("div");
    this.sourceHeader.className = "heurist-source-header";
    this.tableContainer.prepend(this.sourceHeader);
    if (this.options.initiallyExpanded === false && !this.main)
      this.element.classList.add("fully-collapsed");
    this.bind("heurist-data-configuration-changed", (event) => {
      void this.applyOptions(event.detail).catch((error) =>
        this.reportError(error, "apply-options"),
      );
    });
    this.bind("heurist-data-loaded", (event) => {
      this.updateSourceHeader(event.detail);
      this.applyVisibility();
    });
    this.applyVisibility();
    this.updateSourceHeader();
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

  /**
   * Dispatch a `heurist-data-error` event for a failure that occurred within the panel.
   *
   * @param {Error} error The error that occurred.
   * @param {string} operation Short operation label identifying where the error occurred.
   * @returns {void}
   */
  reportError(error, operation) {
    this.api.application?.dispatch("heurist-data-error", { error, operation });
  }

  /**
   * Toggle the panel between its normal and fully-collapsed (icon-only) states.
   *
   * @returns {void}
   */
  toggleFullyCollapsed() {
    this.element.classList.toggle("fully-collapsed");
    this.updateExpandedState();
  }

  /** Sync the collapse toggle's `aria-expanded` state with the current collapse state. */
  updateExpandedState() {
    const fullyCollapsed = this.element.classList.contains("fully-collapsed");
    this.element
      .querySelector(".heurist-module-panel-toggle")
      ?.setAttribute("aria-expanded", String(!fullyCollapsed));
  }

  /** Load the module user manual for the active language into a full-viewport overlay. */
  openHelp() {
    this.helpOverlay ||= new InlineHelp({
      moduleName: "data",
      baseUrl: this.options.helpBaseUrl || null,
    });
    return this.helpOverlay.open();
  }

  /** Refresh the source-header caption from the active DataSource/Query Source/Filtered Result title. */
  updateSourceHeader(detail = null) {
    if (!this.sourceHeader) return;
    const currentTitle = this.options.currentResultsTitle || "Filtered Result";
    const querySourceTitle = detail?.querySource?.title;
    const dataSourceTitle = detail?.dataSource?.title || detail?.title;
    this.sourceHeader.textContent =
      dataSourceTitle ||
      querySourceTitle ||
      this.api.getState?.()?.title ||
      (currentTitle === "Filtered Result" ? $HR(currentTitle) : currentTitle);
  }

  /**
   * Apply an updated persisted configuration: visibility/interaction options, then refresh the header.
   *
   * @param {object} [settings] Persisted-configuration settings (or a bare `options` object).
   * @returns {Promise<void>}
   */
  async applyOptions(settings = {}) {
    const options = settings.options || settings;
    this.options = {
      ...this.options,
      ...options.ui,
      readonly: this.options.readonly || options.interaction?.readonly === true,
      editEnabled: options.interaction?.editEnabled,
      currentResultsTitle:
        settings.config?.currentResults?.title ||
        this.options.currentResultsTitle,
    };
    if (!this.main)
      this.element?.classList.toggle(
        "fully-collapsed",
        this.options.initiallyExpanded === false,
      );
    this.applyVisibility();
    this.updateSourceHeader();
  }

  /**
   * Re-apply panel/button visibility from current options and runtime mode.
   *
   * @returns {void}
   */
  applyVisibility() {
    if (!this.element) return;
    const standalone = ["standalone", "publish", "published"].includes(
      String(this.options.runtimeMode || "").toLowerCase(),
    );
    const readonly =
      this.options.readonly === true ||
      String(this.options.runtimeMode || "").toLowerCase() === "readonly";
    if (this.sourceHeader && !this.sourceHeader.isConnected)
      this.tableContainer.prepend(this.sourceHeader);
    if (this.optionsButton)
      this.optionsButton.hidden =
        readonly || standalone || this.options.showOptions === false;
    if (this.publishButton)
      this.publishButton.hidden =
        readonly || this.options.runtimeMode !== "main";
    if (this.sourceHeader)
      this.sourceHeader.hidden = this.options.showSourceHeader !== true;
    this.tableContainer.classList.toggle(
      "heurist-has-source-header",
      this.options.showSourceHeader === true,
    );
    this.element.classList.toggle(
      "with-source-header",
      this.options.showSourceHeader === true,
    );
    if (this.main) {
      // Fixed layout: panel always shown as a header-only bar, no collapse toggle.
      this.element.hidden = false;
      this.element.classList.remove("fully-collapsed");
      if (this.collapseToggle) this.collapseToggle.hidden = true;
      this.updateExpandedState();
      return;
    }
    const hasVisibleToolButton = [
      this.helpButton,
      this.optionsButton,
      this.publishButton,
    ].some((button) => button && !button.hidden);
    this.element.hidden = !hasVisibleToolButton;
    this.updateExpandedState();
  }

  /**
   * Detach API event listeners and remove the panel and source header from the DOM.
   *
   * @returns {void}
   */
  destroy() {
    for (const [name, handler] of this.listeners)
      this.api.removeEventListener(name, handler);
    this.tableContainer?.classList.remove("heurist-has-source-header");
    this.sourceHeader?.remove();
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
