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
import { GraphLegendEditor } from "./GraphLegendEditor.js";
import { DatasetSelector } from "./DatasetSelector.js";
import { FilterSelector } from "./FilterSelector.js";
import { $HR, applyI18n, InlineHelp } from "#shared/ui";

/** Owns Graph's control panel: dataset/filter selectors, legend, expansion controls, and toolbar actions. */
export class GraphControlPanel {
  /**
   * @param {object} options Panel dependencies.
   * @param {object} options.api Graph public API instance.
   * @param {HTMLElement} options.container Element the rendering engine renders into; the panel is anchored above it.
   * @param {object} [options.options] Initial visibility/interaction options; refreshed via `applyOptions`.
   * @param {object} options.datasetListProvider Provider used to list available datasets.
   * @param {object} options.datasetProvider Provider used to load a dataset's own record-type id when creating one.
   * @param {object} options.filterListProvider Provider used to list and load available filters.
   */
  constructor({ api, container, options = {}, datasetListProvider, datasetProvider, filterListProvider }) {
    this.api = api;
    this.container = container;
    this.options = options;
    this.datasetListProvider = datasetListProvider;
    this.datasetProvider = datasetProvider;
    this.filterListProvider = filterListProvider;
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
    const datasets = section(body);
    this.datasetsSection = datasets.section;
    this.datasetsSelector = new DatasetSelector({ api: this.api, container: datasets.content, classPrefix: "heurist-graph", onError: (error) => this.reportError(error) });
    const filters = section(body, "Filters", true);
    this.filtersSection = filters.section;
    this.filtersSelector = new FilterSelector({
      api: this.api,
      container: filters.content,
      classPrefix: "heurist-graph",
      loadFilter: (id) => this.filterListProvider?.load(id),
      onError: (error) => this.reportError(error),
    });
    this.legendSection = document.createElement('section');
    this.legendSection.className = 'heurist-graph-legend';

    this.legend = new GraphLegend({ api: this.api, container: this.legendSection,
      onEdit: () => this.editDataset(), onLinks: () => this.editLegend('links'),
      onRule: () => this.api.defineExpansions(), onError: (error, operation) => this.reportError(error, operation) });
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
   * Refresh the source header, dataset/filter lists, and legend from the current application state.
   *
   * @returns {Promise<void>}
   */
  async render() {
    const state = this.api.getState();
    const currentTitle = this.options.currentResultsTitle || "Filtered Result";
    this.sourceHeader.textContent =
      state.datasetTitle ||
      (currentTitle === "Filtered Result" ? $HR(currentTitle) : currentTitle);
    const isMainRuntime = this.options.runtimeMode === "main";
    const [datasets, filters] = isMainRuntime
      ? [[], []]
      : await Promise.all([
          this.datasetListProvider?.list?.() || [],
          this.filterListProvider?.list?.() || [],
        ]);
    this.datasetsSelector.render(
      normalizeItems(datasets, "Dataset"),
      state.datasetId,
      !state.datasetId,
      {
        showCurrentResults: this.options.showCurrentResults !== false,
        currentResultsTitle: currentTitle,
      },
    );
    this.renderLegend();
    this.filtersSelector.render(normalizeItems(filters, "Filter"));
    applyI18n(this.element);
  }

  /**
   * Attach the legend to the active dataset row, add an edit/add-dataset action when editable, and re-render it.
   *
   * @returns {void}
   */
  renderLegend() {
    const app = this.api.application;
    const state = this.api.getState();
    const interaction = app?.config.persistedSettings?.options?.interaction || {};
    const editEnabled = interaction.editEnabled !== false && interaction.readonly !== true && Boolean(app?.host?.supportsEditing?.());
    const activeRow = this.datasetsSection.querySelector('.heurist-graph-selector-row.active');
    this.datasetsSection.querySelectorAll('.heurist-graph-dataset-action').forEach(button => button.remove());
    if (activeRow) {
      activeRow.append(this.legendSection);
      if (editEnabled && (state.datasetId || typeof app.host.bridge?.addRecord === 'function')) {
        const action = this.legend.action(state.datasetId ? 'Edit Dataset' : 'Add Dataset', state.datasetId ? 'fa-pen' : 'fa-circle-plus', () => this.editDataset());
        action.classList.add('heurist-graph-dataset-action');
        activeRow.insertBefore(action, this.legendSection);
      }
    } else this.legendSection.remove();
    this.legend.render({ editEnabled });
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
      option.value = String(depth); option.textContent = `${$HR('Level')} ${depth}`;
      this.levelSelector.append(option);
    }
    this.levelSelector.value = String(Math.min(state.depth, state.maxDepth));
    this.levelSelector.title = $HR(this.expansionSeeds() ? 'Expansion depth for selected records' : 'Expansion depth for the base graph');
    this.levelSelector.disabled = state.busy || !state.maxDepth;
    this.pruneButton.disabled = state.busy || !state.depth;
    this.expandButton.disabled = state.busy || state.depth >= state.maxDepth;
  }

  /**
   * Edit the active Dataset (or create one, when the graph has none) via the host record editor.
   *
   * @returns {Promise<void>}
   */
  async editDataset() {
    const app = this.api.application;
    if (app?.datasetAvailable === false || app?.config.persistedSettings?.options?.interaction?.readonly === true || app?.config.persistedSettings?.options?.interaction?.editEnabled === false) return;
    const id = this.api.getState().datasetId;
    if (id) {
      await app.host.editRecord(id);
      if (this.api.getState().datasetId === id) await this.api.setDataset(id);
    } else {
      const info = await this.datasetListProvider.list({ ids: [] });
      if (!info.recordTypeId) return;
      const created = await app.host.addRecord(info.recordTypeId);
      const newId = Number(created?.recordId ?? created?.rec_ID ?? created?.id);
      if (newId > 0) await this.api.setDataset(newId);
    }
  }

  /**
   * Open the session-only legend/links editor.
   *
   * @param {string} mode Editor mode (currently only `'links'` is used).
   * @returns {void}
   */
  editLegend(mode) {
    this.legendEditor?.destroy();
    this.legendEditor = new GraphLegendEditor({ api: this.api, onError: error => this.reportError(error, 'legend-editor') });
    this.legendEditor.open(mode);
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
      this.publishButton.hidden = this.options.showPublish === false;
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
    if (this.datasetsSection)
      this.datasetsSection.hidden =
        this.options.showDatasets === false &&
        this.options.showCurrentResults === false;
    if (this.filtersSection)
      this.filtersSection.hidden =
        this.options.showFilters === false ||
        this.options.runtimeMode === "main";
    const hasVisiblePanel = [this.datasetsSection, this.filtersSection].some(
      (section) => section && !section.hidden,
    );
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
    this.legendEditor?.destroy();
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

/** Normalize a list-provider payload into `{id, title}` entries, dropping invalid IDs. */
function normalizeItems(result, fallback) {
  const values = Array.isArray(result) ? result : result?.items || [];
  return values.map((item) => ({
    ...item,
    id: Number(item.id ?? item.rec_ID),
    title: String(item.title ?? item.name ?? item.rec_Title ?? `${fallback} ${item.id ?? item.rec_ID}`),
  })).filter((item) => Number.isInteger(item.id) && item.id > 0);
}
