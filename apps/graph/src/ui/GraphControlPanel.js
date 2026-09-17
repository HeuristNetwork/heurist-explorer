/**
 * @file GraphControlPanel.js
 * @brief Graph controls using the heurist-data panel interaction pattern.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { showGraphMessage } from "./graphMessages.js";
import { GraphLegend } from "./GraphLegend.js";
import { $HR, applyI18n, InlineHelp } from "#shared/ui";
import { showDataSourceAction } from "#shared/ui/documents/SourceActions.js";

/** Owns Graph's control panel: current-source row, legend, expansion controls, and toolbar actions. */
export class GraphControlPanel {
  /**
   * @param {object} options Panel dependencies.
   * @param {object} options.api Graph public API instance.
   * @param {HTMLElement} options.container Element the rendering engine renders into; the panel is anchored above it.
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
    this.element.setAttribute("aria-label", $HR("Graph controls"));
    const header = document.createElement("div");
    header.className = "heurist-module-panel-header";

    this.angleToggle = iconButton("fa-solid fa-angle-up", "Show or hide panels", () => this.toggleBody());
    this.angleToggle.classList.add("heurist-module-panel-angle-toggle");
    header.append(this.angleToggle);

    this.actions = document.createElement("span");
    this.actions.className = "heurist-module-panel-actions";
    this.expandButton = iconButton("fa-solid fa-angle-right", "Expand graph", () => this.expandGraph());
    this.pruneButton = iconButton('fa-solid fa-angle-left', 'Prune one level', () => this.api.pruneExpansion(this.expansionSeeds()).catch(error => this.reportError(error, 'expansion')));
    this.levelSelector = document.createElement('select');
    this.levelSelector.setAttribute('aria-label', $HR('Current expansion level'));
    this.levelSelector.className = 'h-select heurist-graph-level-selector';
    this.levelSelector.addEventListener('change', () => {
      void this.api.setExpansionDepth(this.levelSelector.value, this.expansionSeeds()).catch(error => this.reportError(error, 'expansion'));
    });
    this.exportButton = iconButton("fa-solid fa-file-export", "Export Gephi", () => this.api.exportGephi?.());
    this.helpButton = iconButton("fa-solid fa-circle-question", "Help", () => this.openHelp());
    this.optionsButton = iconButton("fa-solid fa-gear", "Options", () => this.api.openPreferencesDialog?.());
    this.publishButton = iconButton("fa-solid fa-share-nodes", "Publish", () => this.api.openPublishDialog?.());
    this.actions.append(this.pruneButton, this.levelSelector, this.expandButton, this.exportButton, this.helpButton, this.optionsButton, this.publishButton);
    header.append(this.actions);

    const toggle = iconButton("fa-solid fa-layer-group", "Show or hide graph controls", () => this.toggleFullyCollapsed());
    toggle.classList.add("heurist-module-panel-toggle");
    header.append(toggle);

    const body = document.createElement("div");
    body.className = "heurist-module-panel-body";
    this.body = body;
    const currentSource = section(body);
    this.querySourcesSection = currentSource.section;
    this.currentSourceRow = document.createElement("div");
    this.currentSourceRow.className = "heurist-graph-selector-row heurist-graph-current-source-row";
    const label = document.createElement("span");
    label.className = "heurist-graph-query-source";
    this.currentSourceTitle = document.createElement("span");
    label.append(this.currentSourceTitle);
    this.currentSourceRow.append(label);
    currentSource.content.append(this.currentSourceRow);
    this.legendSection = document.createElement('section');
    this.legendSection.className = 'heurist-graph-legend';

    this.legend = new GraphLegend({ api: this.api, container: this.legendSection,
      onError: (error, operation) => this.reportError(error, operation) });
    this.element.append(header, body);
    (this.container.parentElement || document.body).append(this.element);
    this.sourceHeader = document.createElement("div");
    this.sourceHeader.className = "heurist-source-header";
    this.container.prepend(this.sourceHeader);
    if (this.options.initiallyExpanded === false)
      this.element.classList.add("fully-collapsed");
    this.bind("heurist-graph-loaded", () => { void this.render().catch(error => this.reportError(error)); });
    this.bind("heurist-graph-vocabulary-changed", () => this.renderLegend());
    this.bind("heurist-graph-visibility-changed", () => this.renderLegend());
    this.bind('heurist-graph-expansions-changed', () => this.renderLegend());
    this.bind('heurist-graph-pin-changed', () => { void this.render().catch(error => this.reportError(error)); });
    this.bind('heurist-graph-selection-changed', () => this.renderExpansionControls());
    this.bind("heurist-graph-configuration-changed", (event) => {
      void this.applyOptions(event.detail).catch((error) => this.reportError(error, "apply-options"));
    });
    this.applyVisibility();
    await this.render();
    applyI18n(this.element);
    this.updateExpandedState();
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
   * Refresh the source header, current-source row, and legend from the current application state.
   *
   * @returns {Promise<void>}
   */
  async render() {
    const state = this.api.getState();
    const currentTitle = this.options.currentResultsTitle || "Filtered Result";
    const title =
      state.querySourceTitle ||
      (currentTitle === "Filtered Result" ? $HR(currentTitle) : currentTitle);
    this.sourceHeader.textContent = title;
    this.currentSourceTitle.textContent = title;
    const isMainRuntime = this.options.runtimeMode === "main";
    this.currentSourceRow.querySelectorAll(".heurist-graph-pin-toggle").forEach((button) => button.remove());
    if (isMainRuntime) {
      const label = this.currentSourceRow.querySelector(".heurist-graph-query-source");
      label.prepend(pinToggle(state.pinned, () => this.togglePin()));
    }
    this.renderLegend();
    applyI18n(this.element);
  }

  /** Stick or unstick the active DataSource against inbound host pushes (main runtime only). */
  togglePin() {
    try { this.api.togglePinned(); }
    catch (error) { this.reportError(error, "toggle-pin"); }
  }

  /**
   * Attach the legend to the current-source row, add a show-data action when the host
   * supports it, and re-render it.
   *
   * @returns {void}
   */
  renderLegend() {
    const app = this.api.application;
    this.currentSourceRow.append(this.legendSection);
    this.currentSourceRow.querySelectorAll('.heurist-graph-query-source-action').forEach(button => button.remove());
    // Persisted-record lifecycle (add/edit/save a Query Source) is fully host-owned;
    // offer to display the active DataSource instead - shown on hover/focus,
    // like the map/timeline layer row actions.
    if (app?.dataSource) {
      const capabilities = this.api.getHostCapabilities?.() || {};
      const report = (error) => this.reportError(error, 'datasource-action');
      const actions = document.createElement('span');
      actions.className = 'heurist-graph-query-source-action heurist-graph-row-actions';
      if (capabilities.showDatasource) actions.append(showDataSourceAction(this.api, report));
      if (actions.childElementCount) this.currentSourceRow.insertBefore(actions, this.legendSection);
    }
    this.legend.render();
    this.renderExpansionControls();
  }

  /**
   * The current selection, restricted to record ids present in the loaded graph.
   *
   * @returns {Array<number>|null} Seed record ids, or `null` to scope expansion controls to the base graph.
   */
  expansionSeeds() {
    const state = this.api.getState();
    const ids = (state.selection || []).filter(id => state.recordIds.includes(id));
    return ids.length ? ids : null;
  }

  /**
   * Rebuild the expansion-level select and prune/expand button states from the current expansion state.
   *
   * @returns {void}
   */
  renderExpansionControls() {
    const state = this.api.getExpansionState(this.expansionSeeds());
    this.levelSelector.replaceChildren();
    for (let depth = 0; depth <= state.maxDepth; depth++) {
      const option = document.createElement('option');
      option.value = String(depth); option.textContent = String(depth);
      this.levelSelector.append(option);
    }
    this.levelSelector.value = String(Math.min(state.depth, state.maxDepth));
    this.levelSelector.title = $HR(this.expansionSeeds() ? 'Expansion depth for selected records' : 'Expansion depth for the base graph');
    this.levelSelector.disabled = state.busy || !state.maxDepth;
    this.pruneButton.disabled = state.busy || !state.depth;
    this.expandButton.disabled = state.busy || state.depth >= state.maxDepth;
  }

  /** React to settings edited/saved in the Configuration dialog while the panel is mounted. */
  async applyOptions(settings = {}) {
    const options = settings.options || settings;
    this.options = {
      ...this.options,
      ...options.ui,
      currentResultsTitle:
        settings.config?.currentResults?.title || this.options.currentResultsTitle,
    };
    this.element.classList.toggle(
      "fully-collapsed",
      this.options.initiallyExpanded === false,
    );
    this.applyVisibility();
    await this.render();
  }

  /**
   * Expand the current selection (or the base graph) by one additional depth level.
   *
   * @returns {Promise<void>}
   */
  async expandGraph() {
    try { return await this.api.advanceExpansion(this.expansionSeeds()); }
    catch (error) { this.reportError(error, 'expansion'); }
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
   * Toggle the panel body between expanded and collapsed, falling back to fully-collapsing when it has no visible panels.
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

  /**
   * Sync the header toggle buttons' `aria-expanded` state and icon direction with the current collapse state.
   *
   * @returns {void}
   */
  updateExpandedState() {
    const fullyCollapsed = this.element.classList.contains("fully-collapsed");
    const bodyCollapsed = this.element.classList.contains("body-collapsed");
    this.element.querySelector(".heurist-module-panel-toggle")?.setAttribute("aria-expanded", String(!fullyCollapsed));
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
    this.helpOverlay ||= new InlineHelp({ moduleName: "graph" });
    this.helpOverlay.open();
  }

  /**
   * Re-apply panel/button/section visibility from current options and runtime mode.
   *
   * @returns {void}
   */
  applyVisibility() {
    if (!this.element) return;
    this.element.classList.toggle(
      "heurist-graph-runtime-main",
      this.options.runtimeMode === "main",
    );
    if (this.sourceHeader && !this.sourceHeader.isConnected)
      this.container.prepend(this.sourceHeader);
    if (this.expandButton)
      this.expandButton.hidden = this.options.showExpand === false;
    if (this.pruneButton) this.pruneButton.hidden = this.options.showExpand === false;
    if (this.levelSelector) this.levelSelector.hidden = this.options.showExpand === false;
    if (this.optionsButton)
      this.optionsButton.hidden = this.options.showOptions === false;
    if (this.publishButton)
      this.publishButton.hidden = this.options.runtimeMode !== "main";
    if (this.sourceHeader)
      this.sourceHeader.hidden = this.options.showSourceHeader !== true;
    this.element.classList.toggle(
      "with-source-header",
      this.options.showSourceHeader === true,
    );
    this.body?.classList.toggle(
      "with-source-header",
      this.options.showSourceHeader === true,
    );
    const hasVisiblePanel = Boolean(this.querySourcesSection);
    this.hasVisiblePanels = hasVisiblePanel;
    if (this.angleToggle) this.angleToggle.hidden = !hasVisiblePanel;
    if (
      !hasVisiblePanel &&
      !this.element.classList.contains("fully-collapsed")
    ) {
      this.element.classList.add("body-collapsed");
    }
    this.updateExpandedState();
  }

  /**
   * Dispatch a `heurist-graph-error` event for a failure that occurred within the panel.
   *
   * @param {Error} error The error that occurred.
   * @param {string} [operation] Short operation label identifying where the error occurred.
   * @returns {void}
   */
  reportError(error, operation) {
    this.api.application?.dispatch?.("heurist-graph-error", { error, operation });
  }

  /**
   * Detach API event listeners and remove the panel and legend editor from the DOM.
   *
   * @returns {void}
   */
  destroy() {
    this.listeners.forEach(([name, handler]) => this.api.removeEventListener(name, handler));
    this.sourceHeader?.remove();
    this.helpOverlay?.close();
    this.element?.remove();
  }
}

/** Build a titled `<section>` with a heading and content container, optionally collapsible, appended to `parent`. */
function section(parent, title, collapsible = false) {
  const section = document.createElement("section");
  const heading = document.createElement(collapsible ? "button" : "h3");
  heading.className = "h-i18n";
  heading.textContent = title;
  const content = document.createElement("div");
  if (title) section.append(heading);
  section.append(content);
  if (collapsible) {
    heading.type = 'button';
    heading.classList.add('heurist-graph-section-toggle');
    content.hidden = true;
    heading.setAttribute('aria-expanded', 'false');
    heading.addEventListener('click', () => {
      content.hidden = !content.hidden;
      heading.setAttribute('aria-expanded', String(!content.hidden));
    });
  }
  parent.append(section);
  return { section, content };
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
    Promise.resolve().then(handler).catch(error => showGraphMessage(error, { error: true }));
  });
  return button;
}

/** Build the pin/unpin toggle that sticks the active DataSource against inbound host pushes (main runtime only). */
function pinToggle(pinned, onToggle) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "heurist-icon-button heurist-graph-pin-toggle";
  button.classList.toggle("pinned", Boolean(pinned));
  button.title = $HR(pinned ? "Unstick current data" : "Stick current data");
  button.setAttribute("aria-pressed", String(Boolean(pinned)));
  button.setAttribute("aria-label", button.title);
  button.innerHTML = `<span class="fa-solid ${pinned ? "fa-thumbtack-slash" : "fa-thumbtack"}" aria-hidden="true"></span>`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onToggle();
  });
  return button;
}
