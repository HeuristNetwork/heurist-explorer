/**
 * @file DataControlPanel.js
 * @brief Renders the Data module's control panel: header (Expansion, help/options/publish)
 *        and, when the DataSource has expansion rules, a drop-down body with them.
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

import { $HR, applyI18n, InlineHelp, HMsg } from "#shared/ui";
import { DataExpansionBar } from "./DataExpansionBar.js";

/**
 * Control panel overlaying the top of the module: a header with the Expansion
 * button and the help/options/publish actions and - when expansion rules are
 * offered - a drop-down body with the Expansion Rules section (as the Graph and
 * Timeline control panels). The module no longer browses Query Sources or
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
    // The Expansion button stays visible (the actions show on hover only); the
    // expansion rules and level controls are in the drop-down body
    this.expansionBar = new DataExpansionBar({
      api: this.api,
      onError: (error, operation) => this.reportError(error, operation),
      onMessage: (message) => HMsg.showMsgFlash?.(message),
      onChange: () => this.updateBody(),
      // the Expansion button shows/hides the body together with the level pane
      onOpenChange: (open) => this.setBodyOpen(open),
    });
    const expansion = this.expansionBar.create();
    this.expansionButton = expansion.button;
    this.angleToggle = iconButton("fa-solid fa-angle-up", "Show or hide panels", () => this.toggleBody());
    this.angleToggle.classList.add("heurist-module-panel-angle-toggle");
    header.append(this.angleToggle, this.actions, expansion.button);

    this.collapseToggle = iconButton(
      "fa-solid fa-layer-group",
      "Show or hide data controls",
      () => this.toggleFullyCollapsed(),
    );
    this.collapseToggle.classList.add("heurist-module-panel-toggle");
    header.append(this.collapseToggle);

    this.body = document.createElement("div");
    this.body.className = "heurist-module-panel-body";
    this.body.append(expansion.section);
    this.element.append(header, this.body);
    // closed until the Expansion button opens it
    this.element.classList.add("body-collapsed");
    const target = this.tableContainer.parentElement || document.body;
    if (target && globalThis.getComputedStyle?.(target).position === "static")
      target.style.position = "relative";
    target.append(this.element);
    this.sourceHeader = document.createElement("div");
    this.sourceHeader.className = "heurist-source-header";
    this.tableContainer.prepend(this.sourceHeader);
    // the shrunk panel's width is kept free at the right of the source header (or toolbar)
    this.resizeObserver = globalThis.ResizeObserver
      ? new ResizeObserver(() => this.reserveSpace())
      : null;
    this.resizeObserver?.observe(this.element);
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
    this.updateBody();
    this.updateSourceHeader();
    applyI18n(this.element);
    return this.element;
  }

  /**
   * Show a host's element under the source header (heurist-explorer's simplified
   * interface: its Query Source editor), or remove it with `null`. Only an element
   * of this document (direct mode).
   *
   * @param {HTMLElement|null} element Element to show, or null.
   * @returns {boolean} Whether the element is shown (false: another document, or null).
   */
  setHeaderContent(element) {
    const next =
      element && element.ownerDocument === this.tableContainer.ownerDocument
        ? element
        : null;
    if (this.headerContent && this.headerContent !== next) {
      this.headerContent.classList.remove("heurist-data-header-content");
      this.headerContent.remove();
    }
    this.headerContent = next;
    next?.classList.add("heurist-data-header-content");
    this.applyVisibility();
    return Boolean(next);
  }

  /**
   * Show the drop-down body (and its toggle) only while there is something in it:
   * the expansion rules of the active DataSource.
   *
   * @returns {void}
   */
  updateBody() {
    if (!this.body) return;
    const available = this.expansionBar?.isAvailable() === true;
    this.body.hidden = !available;
    // the body toggle is offered only while Expansion is on
    if (this.angleToggle) this.angleToggle.hidden = !available || this.expansionBar?.open !== true;
    this.updateExpandedState();
  }

  /**
   * Show or hide the drop-down body (with the Expansion button).
   *
   * @param {boolean} open Whether the body is shown.
   * @returns {void}
   */
  setBodyOpen(open) {
    this.element?.classList.toggle("body-collapsed", !open);
    if (this.angleToggle) this.angleToggle.hidden = !open || this.expansionBar?.isAvailable() !== true;
    this.updateExpandedState();
  }

  /**
   * Show or hide the drop-down body.
   *
   * @returns {void}
   */
  toggleBody() {
    if (this.element.classList.contains("fully-collapsed")) return;
    this.element.classList.toggle("body-collapsed");
    this.updateExpandedState();
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

  /** Sync the toggles' `aria-expanded` state, the angle icon and the panel width with the current collapse state. */
  updateExpandedState() {
    const fullyCollapsed = this.element.classList.contains("fully-collapsed");
    // wide panel only while the expansion body is shown; otherwise the narrow header bar
    const bodyShown = this.expansionBar?.isAvailable() === true
      && !this.element.classList.contains("body-collapsed");
    this.element.classList.toggle("heurist-data-has-body", bodyShown);
    this.element.classList.toggle("main-mode", this.main === true && bodyShown);
    // without the body: one button (Expansion, else the collapse toggle) until the pointer
    // is over the panel; with neither the actions stay
    const pinned = [this.expansionButton, this.collapseToggle].find((button) => button && !button.hidden) || null;
    for (const button of [this.expansionButton, this.collapseToggle])
      button?.classList.toggle("heurist-panel-pinned", button === pinned);
    this.element.classList.toggle("is-shrunk", !bodyShown && !fullyCollapsed && pinned !== null);
    this.reserveSpace();
    this.element
      .querySelector(".heurist-module-panel-toggle")
      ?.setAttribute("aria-expanded", String(!fullyCollapsed));
    if (this.angleToggle) {
      const expanded = !fullyCollapsed && !this.element.classList.contains("body-collapsed");
      this.angleToggle.setAttribute("aria-expanded", String(expanded));
      const icon = this.angleToggle.querySelector(".fa-solid");
      icon?.classList.toggle("fa-angle-up", expanded);
      icon?.classList.toggle("fa-angle-down", !expanded);
    }
  }

  /**
   * Keep the panel's width free at the right of the source header (or of the toolbar
   * when the header is hidden):
   * `--heurist-panel-reserve` on the panel's container. Not measured while the pointer
   * is over the panel (it is wider then, over the header).
   *
   * @returns {void}
   */
  reserveSpace() {
    const host = this.element?.parentElement;
    if (!host) return;
    (globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 0)))(() => {
      if (!this.element || this.element.matches?.(":hover")) return;
      const width = this.element.hidden ? 0 : this.element.offsetWidth;
      host.style.setProperty("--heurist-panel-reserve", `${width ? width + 8 : 0}px`);
    });
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
    // the engines re-render the container: the host's content goes back after the header
    if (this.headerContent && !this.headerContent.isConnected)
      this.sourceHeader.after(this.headerContent);
    this.tableContainer.classList.toggle(
      "heurist-has-header-content",
      Boolean(this.headerContent),
    );
    if (this.optionsButton)
      this.optionsButton.hidden =
        readonly || standalone || this.options.showOptions === false;
    if (this.publishButton)
      this.publishButton.hidden =
        readonly || this.options.runtimeMode !== "main" || this.options.showPublish === false
        || (this.api.canPublish?.() !== true && this.api.application?.host?.supportsHostedPublishDialog?.() !== true);
    if (this.helpButton) this.helpButton.hidden = this.options.showHelp === false;
    this.expansionBar?.setEnabled(this.options.showExpansion !== false);
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
      this.expansionButton,
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
    this.expansionBar?.destroy();
    this.resizeObserver?.disconnect();
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
