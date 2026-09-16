/**
 * @file DataControlPanel.js
 * @brief Renders Query Source, filter, and data controls.
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

import { FilterSelector } from "./FilterSelector.js";
import { $HR, applyI18n, InlineHelp, QuerySourceSelector } from "#shared/ui";

/**
 * Fixed collapsible panel overlaying the DataTables toolbar.
 * Coordinates the application's Query Source and filter controls.
 */
export class DataControlPanel {
  /**
   * @param {object} options Panel dependencies.
   * @param {object} options.api Data public API instance.
   * @param {HTMLElement} options.tableContainer Element the rendering engine renders into; the panel is anchored above it.
   * @param {object} [options.options] Initial visibility/interaction options; refreshed via `applyOptions`.
   * @param {object|null} [options.querySourceListProvider] Provider used to list available Query Sources.
   * @param {object|null} [options.filterListProvider] Provider used to list and load available filters.
   */
  constructor({
    api,
    tableContainer,
    options = {},
    querySourceListProvider = null,
    filterListProvider = null,
  }) {
    this.api = api;
    this.tableContainer = tableContainer;
    this.options = options;
    this.querySourceListProvider = querySourceListProvider;
    this.filterListProvider = filterListProvider;
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
    // no Query Sources/Filters panels, control panel always visible.
    this.main =
      String(this.options.runtimeMode || "").toLowerCase() === "main";
    // Skip building the Query Sources/Filters selectors (and their provider calls)
    // only when nothing source-related is shown at all — always true in "main".
    this.skipDataPanels =
      this.options.showFilters === false &&
      this.options.showQuerySources === false &&
      this.options.showCurrentResults === false;
    this.element = document.createElement("aside");
    this.element.className = "h-widget heurist-module-control-panel";
    if (this.main) this.element.classList.add("main-mode");
    this.element.setAttribute("aria-label", $HR("Data controls"));
    const header = document.createElement("div");
    header.className = "h-toolbar heurist-module-panel-header";
    this.angleToggle = iconButton(
      "fa-solid fa-angle-up",
      "Show or hide panels",
      () => this.toggleBody(),
    );
    this.angleToggle.classList.add("heurist-module-panel-angle-toggle");
    header.append(this.angleToggle);

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

    const body = document.createElement("div");
    body.className = "heurist-module-panel-body";
    this.body = body;
    const querySources = section(body, "Query Sources");
    this.querySourcesSection = querySources.section;
    this.querySourcesContainer = querySources.content;
    const filters = section(body, "Filters");
    this.filtersSection = filters.section;
    this.filtersContainer = filters.content;
    this.element.append(header, body);
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
    if (this.skipDataPanels) {
      // No Query Sources/Filters lists are loaded here; keep only the source header.
      this.bind("heurist-data-loaded", (event) => {
        this.updateSourceHeader(event.detail);
        this.applyVisibility();
      });
      this.applyVisibility();
      this.updateSourceHeader();
      applyI18n(this.element);
      return this.element;
    }
    this.querySourceSelector = new QuerySourceSelector({
      api: this.api,
      container: this.querySourcesContainer,
      onError: (error, operation) => this.reportError(error, operation),
    });
    this.filterSelector = new FilterSelector({
      api: this.api,
      container: this.filtersContainer,
      loadFilter: (id) => this.filterListProvider.load(id),
      onLoading: (id) => this.api.notifyFilterLoading(id),
      onLoaded: (filter) => this.api.notifyFilterLoaded(filter),
      onError: (error, operation) => this.reportError(error, operation),
    });
    this.bind("heurist-data-loaded", () => {
      void this.renderQuerySources().catch((error) =>
        this.reportError(error, "render-query-sources"),
      );
    });
    this.bind("heurist-data-source-changed", () => {
      this.collapseBody();
      this.applyVisibility();
      void this.renderQuerySources().catch((error) =>
        this.reportError(error, "render-query-sources"),
      );
    });
    this.applyVisibility();
    await Promise.all([this.renderQuerySources(), this.renderFilters()]);
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
    const fullyCollapsed = this.element.classList.toggle("fully-collapsed");
    if (!fullyCollapsed) {
      this.element.classList.toggle("body-collapsed", !this.hasVisiblePanels);
    }
    this.updateExpandedState();
  }

  /**
   * Toggle the panel body (Query Sources/Filters sections) between expanded and collapsed,
   * falling back to fully-collapsing the panel when it has no visible panels to show.
   *
   * @returns {void}
   */
  toggleBody() {
    if (this.element.classList.contains("fully-collapsed")) return;
    if (!this.hasVisiblePanels) {
      this.toggleFullyCollapsed();
      return;
    }
    this.element.classList.toggle("body-collapsed");
    this.updateExpandedState();
  }

  /** Sync the header toggle buttons' `aria-expanded` state and icon direction with the current collapse state. */
  updateExpandedState() {
    const fullyCollapsed = this.element.classList.contains("fully-collapsed");
    const bodyCollapsed = this.element.classList.contains("body-collapsed");
    this.element
      .querySelector(".heurist-module-panel-toggle")
      ?.setAttribute("aria-expanded", String(!fullyCollapsed));
    if (this.angleToggle) {
      const expanded = !fullyCollapsed && !bodyCollapsed;
      this.angleToggle.setAttribute("aria-expanded", String(expanded));
      const icon = this.angleToggle.querySelector(".fa-solid");
      icon?.classList.toggle("fa-angle-up", expanded);
      icon?.classList.toggle("fa-angle-down", !expanded);
    }
  }

  /** Load the module user manual for the active language into a full-viewport overlay. */
  openHelp() {
    this.helpOverlay ||= new InlineHelp({
      moduleName: "data",
      baseUrl: this.options.helpBaseUrl || null,
    });
    return this.helpOverlay.open();
  }

  /**
   * Collapse the panel body (Query Sources/Filters sections), leaving the header visible.
   *
   * @returns {void}
   */
  collapseBody() {
    if (!this.element?.hidden) {
      this.element.classList.remove("fully-collapsed");
      this.element.classList.add("body-collapsed");
      this.updateExpandedState();
    }
  }

  /** Refresh the source-header caption without touching the Query Source list. */
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
   * Load and render the Query Sources list (or just refresh the source header when panels are skipped).
   *
   * @returns {Promise<void>}
   */
  async renderQuerySources() {
    if (this.skipDataPanels) return this.updateSourceHeader();
    const ids =
      this.options.allowAllQuerySources === false
        ? normalizeIds(this.options.allowedQuerySourceIds)
        : null;
    const result = (await this.querySourceListProvider?.list?.({ ids })) || [];
    let querySources = normalizeItems(result, "Query Source");
    const state = this.api.getState();
    const currentTitle = this.options.currentResultsTitle || "Filtered Result";
    const activeQuerySource = querySources.find(
      (item) => String(item.id) === String(state.querySourceId),
    );
    if (this.sourceHeader) {
      this.sourceHeader.textContent =
        activeQuerySource?.title ||
        (currentTitle === "Filtered Result" ? $HR(currentTitle) : currentTitle);
    }
    this.querySourceSelector?.render(querySources, state.querySourceId, !state.querySourceId, {
      showCurrentResults: this.options.showCurrentResults !== false,
      currentResultsTitle: currentTitle,
    });
  }
  /**
   * Load and render the Filters list.
   *
   * @returns {Promise<void>}
   */
  async renderFilters() {
    if (this.skipDataPanels) return;
    const ids =
      this.options.allowAllFilters === false
        ? this.options.allowedFilterIds
        : null;
    const result = (await this.filterListProvider?.list?.({ ids })) || [];
    this.filterSelector?.render(normalizeItems(result, "Filter"));
  }

  /**
   * Apply an updated persisted configuration: visibility/interaction options, then re-render the lists.
   *
   * @param {object} [settings] Persisted-configuration settings (or a bare `options` object).
   * @returns {Promise<void>}
   */
  async applyOptions(settings = {}) {
    const options = settings.options || settings;
    this.options = {
      ...this.options,
      ...options.ui,
      allowAllQuerySources: options.querySources?.allowAll,
      allowedQuerySourceIds: options.querySources?.allowed,
      allowAllFilters: options.filters?.allowAll,
      allowedFilterIds: options.filters?.allowed,
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
    await Promise.all([this.renderQuerySources(), this.renderFilters()]);
  }
  /**
   * Re-apply panel/button/section visibility from current options and runtime mode.
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
        readonly || standalone || this.options.showPublish === false;
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
    this.body?.classList.toggle(
      "with-source-header",
      this.options.showSourceHeader === true,
    );
    if (this.querySourcesSection)
      this.querySourcesSection.hidden =
        this.options.showQuerySources === false &&
        this.options.showCurrentResults === false;
    if (this.filtersSection)
      this.filtersSection.hidden = this.options.showFilters === false;
    const hasVisiblePanel = [this.querySourcesSection, this.filtersSection].some(
      (section) => section && !section.hidden,
    );
    this.hasVisiblePanels = hasVisiblePanel;
    if (this.main) {
      // Fixed layout: panel always shown as a header-only bar, no toggles.
      this.element.hidden = false;
      this.element.classList.remove("fully-collapsed");
      this.element.classList.add("body-collapsed");
      if (this.angleToggle) this.angleToggle.hidden = true;
      if (this.collapseToggle) this.collapseToggle.hidden = true;
      this.updateExpandedState();
      return;
    }
    if (this.angleToggle) this.angleToggle.hidden = !hasVisiblePanel;
    const hasVisibleToolButton = [
      this.helpButton,
      this.optionsButton,
      this.publishButton,
    ].some((button) => button && !button.hidden);
    this.element.hidden = !hasVisiblePanel && !hasVisibleToolButton;
    if (
      !hasVisiblePanel &&
      !this.element.classList.contains("fully-collapsed")
    ) {
      this.element.classList.add("body-collapsed");
    }
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

/** Build a titled `<section>` with a heading and content container, appended to `parent`. */
function section(parent, title) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.className = "h-i18n";
  heading.textContent = title;
  const content = document.createElement("div");
  section.append(heading, content);
  parent.append(section);
  return { section, content };
}
/** Normalize a list-provider payload into `{id, title}` entries, dropping invalid IDs. */
function normalizeItems(result, fallback) {
  const values = Array.isArray(result) ? result : result?.items || [];
  return values
    .map((item) => ({
      ...item,
      id: Number(item.id ?? item.rec_ID),
      title: String(
        item.title ??
          item.name ??
          item.rec_Title ??
          `${fallback} ${item.id ?? item.rec_ID}`,
      ),
    }))
    .filter((item) => Number.isInteger(item.id) && item.id > 0);
}
/** Normalize a value into an array of positive integer IDs. */
function normalizeIds(values) {
  return (Array.isArray(values) ? values : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
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
