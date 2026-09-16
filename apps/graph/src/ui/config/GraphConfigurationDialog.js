/**
 * @file GraphConfigurationDialog.js
 * @brief Reusable persistence-neutral editor for heurist-graph settings.
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
import {
  normalizeGraphConfigurationMode,
  normalizeGraphConfigurationSettings,
  serializeGraphConfigurationSettings,
} from "./graphConfigurationSchema.js";
import { $HR, applyI18n, HMsg } from "#shared/ui";
import { showGraphMessage } from "../graphMessages.js";

/** Edits and serializes heurist-graph settings in a modal dialog. */
export class GraphConfigurationDialog {
  /**
   * @param {object} [options] Dialog configuration.
   * @param {string} [options.mode='preferences'] Dialog mode: `'preferences'`, `'website'`, or `'publish'`.
   * @param {object|null} [options.value] Initial settings value; normalized and mode-adjusted.
   * @param {Element|null} [options.parent] Element to append the dialog to; defaults to `document.body`.
   * @param {string|null} [options.title] Dialog title; defaults from `defaultTitle(mode)`.
   * @param {Function|null} [options.onSave] Called with `(value, context)` on save; returning `false` keeps the dialog open.
   * @param {Function|null} [options.onCancel] Called with `(value, {mode})` when the dialog is cancelled.
   * @param {object|null} [options.querySourceListProvider] Provider used to list available Query Sources.
   * @param {object|null} [options.filterListProvider] Provider used to list available filters.
   * @param {object|null} [options.reportTemplateProvider] Provider used to list popup report templates.
   * @param {object|null} [options.widgetListProvider] Provider used to list "Filter by" target widgets.
   * @param {object|null} [options.publishContext] Reserved for publish-mode context.
   */
  constructor({
    mode = "preferences",
    value = null,
    parent = null,
    title = null,
    onSave = null,
    onCancel = null,
    querySourceListProvider = null,
    filterListProvider = null,
    reportTemplateProvider = null,
    widgetListProvider = null,
    publishContext = null,
  } = {}) {
    this.mode = normalizeGraphConfigurationMode(mode);
    this.value = prepareMode(
      normalizeGraphConfigurationSettings(value || {}),
      this.mode,
    );
    this.parent = parent;
    this.title = title || defaultTitle(this.mode);
    this.onSave = typeof onSave === "function" ? onSave : null;
    this.onCancel = typeof onCancel === "function" ? onCancel : null;
    this.querySourceListProvider = querySourceListProvider;
    this.filterListProvider = filterListProvider;
    this.reportTemplateProvider = reportTemplateProvider;
    this.widgetListProvider = widgetListProvider;
    this.publishContext = publishContext || {};
    this.fields = new Map();
    this.element = null;
  }

  /**
   * Replace the dialog's current settings value.
   *
   * @param {object} value New settings value; normalized and mode-adjusted.
   * @returns {GraphConfigurationDialog} This instance, for chaining.
   */
  setValue(value) {
    this.value = prepareMode(
      normalizeGraphConfigurationSettings(value || {}),
      this.mode,
    );
    return this;
  }

  /**
   * Read the current settings value: the live form when open, otherwise the stored value.
   *
   * @returns {object} Cloned, normalized settings.
   */
  getValue() {
    if (this.form)
      this.value = normalizeGraphConfigurationSettings(this.readForm());
    return clone(this.value);
  }

  /**
   * Produce the versioned, JSON-safe settings envelope for persistence.
   *
   * @returns {object} Serializable settings envelope.
   */
  serialize() {
    return serializeGraphConfigurationSettings(this.getValue());
  }

  /**
   * Build the dialog DOM, populate it, and show it modally.
   *
   * @returns {GraphConfigurationDialog} This instance, for chaining.
   * @throws {Error} When there is no browser `document`.
   */
  open() {
    if (typeof document === "undefined")
      throw new Error("GraphConfigurationDialog requires a browser document");
    if (this.element) return this;
    this.previousFocus = document.activeElement;
    this.dialog = el("dialog", "heurist-config-dialog h-dialog");
    this.element = this.dialog;
    this.dialog.setAttribute("aria-label", $HR(this.title));
    this.dialog.addEventListener("cancel", event => {
      event.preventDefault();
      this.cancel();
    });
    const header = el("header", "h-dialog-header");
    const heading = el("h2", "h-dialog-title h-i18n");
    heading.textContent = this.title;
    const close = button("×", () => this.cancel(), "Close");
    close.classList.add("h-dialog-close");
    header.append(heading, close);
    this.form = el("form", "heurist-config-form");
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.save();
    });
    this.content = el("div", "heurist-config-content h-dialog-body");
    this.buildSections();
    const footer = el("footer", "heurist-config-footer h-dialog-footer");
    footer.append(
      button("Cancel", () => this.cancel()),
      submitButton(this.mode === "publish" ? "Publish" : "Apply"),
    );
    this.form.append(this.content, footer);
    this.dialog.append(header, this.form);
    (this.parent || document.body).append(this.element);
    this.populate();
    this.applyDependencies();
    this.initialState = this.signature();
    applyI18n(this.dialog);
    void this.loadProviderOptions().then(() => { if (this.dialog) applyI18n(this.dialog); });
    this.dialog.showModal();
    this.dialog.querySelector("input,select,textarea,button")?.focus();
    return this;
  }

  /**
   * Build and append every section for the current mode.
   *
   * @returns {void}
   */
  buildSections() {
    this.content.append(
      this.section("Interface", (body) => this.buildInterface(body), true),
    );
    if (this.mode === "publish") {
      this.content.append(
        this.section(
          "Publication",
          (body) => this.buildPublication(body),
          true,
        ),
      );
      return;
    }
    this.content.append(
      this.section(
        "Default settings",
        (body) => this.buildDefaults(body),
        true,
      ),
    );
    if (this.mode === "website") {
      this.content.append(
        this.section(
          "Filtered Result",
          (body) => this.buildCurrentResults(body),
          true,
        ),
        this.section("Query Sources and Filters", (body) =>
          this.buildQuerySourcesAndFilters(body),
        ),
      );
    }
    this.content.append(
      this.section("Interaction", (body) => this.buildInteraction(body)),
    );
  }

  /**
   * Build the "Interface" section's fields (visibility toggles, native controls, language).
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildInterface(body) {
    if (this.mode === "website") {
      body.append(
        this.check("options.ui.showCurrentResults", "Filtered Result"),
        this.check("options.ui.showQuerySources", "Query Sources"),
        this.check("options.ui.showFilters", "Filters"),
      );
      body.append(this.separator());
    }
    const sourceHeader = this.check("options.ui.showSourceHeader", "Header");
    sourceHeader.title = $HR("source_header_hint");
    body.append(
      this.check("options.ui.initiallyExpanded", "Initially expanded"),
      sourceHeader,
      this.check("options.ui.showExpand", "Expand graph"),
      this.check("options.ui.showOptions", "Options"),
      this.check("options.ui.showPublish", "Publish"),
    );
    const controls = el("fieldset", "heurist-config-subgroup");
    const legend = el("legend", "h-i18n");
    legend.textContent = "Native controls";
    controls.append(
      legend,
      this.check("options.nativeControls.zoom", "Zoom"),
      this.check("options.nativeControls.pan", "Pan"),
      this.check("options.nativeControls.rearrange", "Rearrange"),
    );
    body.append(controls);
    if (this.mode === "publish" || this.mode === "website") {
      this.select(body, "options.ui.language", "Language", [
        ["auto", "Auto"],
        ["eng", "English"],
        ["fre", "French"],
        ["ger", "German"],
        ["por", "Portuguese"],
      ]);
    }
  }

  /**
   * Build the "Default settings" section's fields (limits, layout, movement, labels, popup, empty message).
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildDefaults(body) {
    this.select(body, "config.defaults.maxNodes", "Nodes limit", [[1000, "1000"], [5000, "5000"], [10000, "10000"]]);
    this.select(body, "config.defaults.maxEdges", "Edges limit", [[1000, "1000"], [5000, "5000"], [10000, "10000"]]);
    this.select(body, "config.defaults.layoutMode", "Layout", [
      ["forceAtlas2", "Automatic (ForceAtlas2)"],
      ["automatic", "Gravity (Barnes–Hut)"],
      ["hierarchical-ud", "Hierarchical top-down"],
      ["hierarchical-lr", "Hierarchical left-right"],
      ["record-types", "Group by record type"],
      ["grid", "Grid"],
    ]);
    this.fields.get("config.defaults.layoutMode").control.addEventListener("change", () => this.applyDependencies());
    this.select(body, "config.defaults.movement", "Movement", [
      ["continuous", "Continuous"], ["once", "Freeze"],
    ]);
    this.select(body, "config.defaults.gravity", "Gravity", [
      ["loose", "Loose"],
      ["normal", "Normal"],
      ["tight", "Tight"],
    ]);
    body.append(
      this.check("config.defaults.scaling", "Scale node size by connections"),
      this.check("config.defaults.showNodeLabels", "Show node labels"),
      this.check("config.defaults.showEdgeLabels", "Show edge labels"),
    );
    this.number(body, "config.defaults.labelLength", "Label length", 20, 100);
    this.number(body, "config.defaults.popupDelay", "Popup delay (seconds)", 1, 5);
    this.select(body, "config.defaults.popupTemplate", "Popup template", [
      ["", "Built-in renderer (vis native)"],
    ]);
    this.textarea(body, "config.defaults.emptyResultMessage", "Empty result message", 3);

  }

  /**
   * Build the "Interaction" section's fields (edit/selection/popup toggles).
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildInteraction(body) {
    body.append(
      this.check("options.interaction.editEnabled", "Enable edit"),
      this.check("options.interaction.selectionEnabled", "Enable selection"),
      this.check("options.interaction.popupEnabled", "Enable popups"),
    );
  }

  /**
   * Build the "Filtered Result" section's fields (title, initial query, and website-mode "Filter by").
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildCurrentResults(body) {
    this.text(body, "config.currentResults.title", "Title");
    this.text(body, "config.currentResults.initialQuery", "Initial query");
    if (this.mode === "website") {
      const row = el(
        "div",
        "heurist-config-row heurist-graph-config-filterby",
      );
      const label = el("label", "h-i18n");
      label.textContent = "Filter by";
      const mode = select([
        ["none", "None"],
        ["timefilter", "Time filter"],
        ["selection", "Selection"],
        ["lastSelected", "Last selected"],
      ]);
      const target = select([["", "Select widget"]]);
      const inLabel = el("span", "h-i18n");
      inLabel.textContent = "in";
      row.append(label, mode, inLabel, target);
      body.append(row);
      this.register("config.currentResults.filterBy.mode", mode, row);
      this.register("config.currentResults.filterBy.widgetId", target, row);
      mode.addEventListener("change", () => {
        this.applyDependencies();
        void this.loadWidgetOptions().catch(error => this.showError(error));
      });
    }
  }

  /**
   * Build the "Query Sources and Filters" section's fields (allow-all toggles, transfer lists, default Query Source).
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildQuerySourcesAndFilters(body) {
    const querySourceBox = el("div", "heurist-config-list-section");
    const querySourceHeading = el("div", "heurist-config-list-heading");
    const querySourceTitle = el("strong", "h-i18n");
    querySourceTitle.textContent = "Query Sources";
    querySourceHeading.append(
      querySourceTitle,
      this.check("options.querySources.allowAll", "Allow all"),
    );
    querySourceBox.append(querySourceHeading);
    const querySourceTransfer = this.transfer(
      "options.querySources.allowed",
      "Available Query Sources",
      "Allowed Query Sources",
    );
    querySourceBox.append(querySourceTransfer.row);
    this.select(
      querySourceBox,
      "options.querySources.initiallyActive",
      "Default Query Source",
      [["", "None"]],
    );
    const filterBox = el("div", "heurist-config-list-section");
    const filterHeading = el("div", "heurist-config-list-heading");
    const filterTitle = el("strong", "h-i18n");
    filterTitle.textContent = "Filters";
    filterHeading.append(
      filterTitle,
      this.check("options.filters.allowAll", "Allow all"),
    );
    filterBox.append(filterHeading);
    const filterTransfer = this.transfer(
      "options.filters.allowed",
      "Available filters",
      "Allowed filters",
    );
    filterBox.append(filterTransfer.row);
    body.append(querySourceBox, filterBox);
    this.fields
      .get("options.querySources.allowAll")
      .control.addEventListener("change", () => this.applyDependencies());
    this.fields
      .get("options.filters.allowAll")
      .control.addEventListener("change", () => this.applyDependencies());
  }

  /**
   * Build the "Publication" section's fields (preserve-state toggle, popup toggle).
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildPublication(body) {
    const preserve = plainCheck("Preserve current state", true);
    preserve.row.title = $HR(
      "Preserve the active Query Source or query, page, sort, filter and selection.",
    );
    body.append(
      preserve.row,
      this.check("options.interaction.popupEnabled", "Enable popups"),
    );
    this.publishControls = { preserveCurrentState: preserve.control };
  }

  /**
   * Build a collapsible `<details>` section with a heading and body.
   *
   * @param {string} title Section heading text.
   * @param {function(HTMLElement): void} builder Called with the section body to populate it.
   * @param {boolean} [open=false] Whether the section starts expanded.
   * @returns {HTMLElement} The generated `<details>` element.
   */
  section(title, builder, open = false) {
    const details = el("details", "heurist-config-section");
    details.open = open;
    const summary = el("summary", "h-i18n");
    summary.textContent = title;
    const body = el("div", "heurist-config-section-body");
    builder(body);
    details.append(summary, body);
    return details;
  }

  /**
   * Build and register a checkbox field row.
   *
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @returns {HTMLElement} The generated row element.
   */
  check(path, labelText) {
    const item = plainCheck(labelText);
    this.register(path, item.control, item.row);
    return item.row;
  }

  /**
   * Build and register a text input field row.
   *
   * @param {HTMLElement} parent Element to append the row into.
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @returns {HTMLElement} The generated row element.
   */
  text(parent, path, labelText) {
    return this.inputRow(parent, path, labelText, "text");
  }

  /**
   * Build and register a bounded number input field row.
   *
   * @param {HTMLElement} parent Element to append the row into.
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @param {number} min Minimum allowed value.
   * @param {number} max Maximum allowed value.
   * @returns {HTMLElement} The generated row element.
   */
  number(parent, path, labelText, min, max) {
    const row = this.inputRow(parent, path, labelText, "number");
    const control = this.fields.get(path).control;
    control.min = min;
    control.max = max;
    return row;
  }

  /**
   * Build and register a textarea field row.
   *
   * @param {HTMLElement} parent Element to append the row into.
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @param {number} rows Textarea row count.
   * @returns {HTMLElement} The generated row element.
   */
  textarea(parent, path, labelText, rows) {
    const row = el("label", "heurist-config-row");
    const caption = el("span", "h-i18n");
    caption.textContent = labelText;
    const control = el("textarea");
    control.rows = rows;
    row.append(caption, control);
    parent.append(row);
    this.register(path, control, row);
    return row;
  }

  /**
   * Build and register a labeled `<input>` field row.
   *
   * @param {HTMLElement} parent Element to append the row into.
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @param {string} type Input `type` attribute.
   * @returns {HTMLElement} The generated row element.
   */
  inputRow(parent, path, labelText, type) {
    const row = el("label", "heurist-config-row");
    const caption = el("span", "h-i18n");
    caption.textContent = labelText;
    const control = el("input");
    control.type = type;
    row.append(caption, control);
    parent.append(row);
    this.register(path, control, row);
    return row;
  }

  /**
   * Build and register a labeled `<select>` field row.
   *
   * @param {HTMLElement} parent Element to append the row into.
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @param {Array<[*, string]>} options Option `[value, label]` pairs.
   * @returns {HTMLElement} The generated row element.
   */
  select(parent, path, labelText, options) {
    const row = el("label", "heurist-config-row");
    const caption = el("span", "h-i18n");
    caption.textContent = labelText;
    const control = select(options);
    row.append(caption, control);
    parent.append(row);
    this.register(path, control, row);
    return row;
  }

  /**
   * Build a visual break element between grouped fields.
   *
   * @returns {HTMLElement}
   */
  separator() {
    return el("span", "heurist-config-break");
  }

  /**
   * Record a field's control/row (and any extra metadata) under its settings path.
   *
   * @param {string} path Dot-separated settings path.
   * @param {HTMLElement} control Field's input/select/textarea control.
   * @param {HTMLElement} row Field's row element.
   * @param {object} [extras] Extra metadata merged into the field record (e.g. transfer-list controls).
   * @returns {HTMLElement} `control`, unchanged.
   */
  register(path, control, row, extras = {}) {
    this.fields.set(path, { control, row, ...extras });
    return control;
  }

  /**
   * Build and register a dual-list "available/allowed" transfer control.
   *
   * @param {string} path Dot-separated settings path (bound to the "selected"/allowed list).
   * @param {string} availableLabel Label for the available-items list.
   * @param {string} selectedLabel Label for the selected/allowed-items list.
   * @returns {{row: HTMLElement, available: HTMLSelectElement, selected: HTMLSelectElement}}
   */
  transfer(path, availableLabel, selectedLabel) {
    const row = el("div", "heurist-config-transfer");
    const available = el("select");
    available.multiple = true;
    available.setAttribute("aria-label", $HR(availableLabel));
    const selected = el("select");
    selected.multiple = true;
    selected.setAttribute("aria-label", $HR(selectedLabel));
    const controls = el("div", "heurist-config-transfer-buttons");
    controls.append(
      button(
        "›",
        () => moveSelected(available, selected),
        `Add ${availableLabel.toLowerCase()}`,
      ),
      button(
        "‹",
        () => moveSelected(selected, available),
        `Remove ${selectedLabel.toLowerCase()}`,
      ),
    );
    const left = el("label");
    const leftCaption = el("span", "h-i18n");
    leftCaption.textContent = availableLabel;
    left.append(leftCaption, available);
    const right = el("label");
    const rightCaption = el("span", "h-i18n");
    rightCaption.textContent = selectedLabel;
    right.append(rightCaption, selected);
    row.append(left, controls, right);
    this.register(path, selected, row, {
      availableControl: available,
      selectedControl: selected,
    });
    return { row, available, selected };
  }

  /**
   * Apply the current settings value onto every registered field's control.
   *
   * @returns {void}
   */
  populate() {
    for (const [path, field] of this.fields) {
      const value = getPath(this.value, path);
      const control = field.control;
      if (field.selectedControl) {
        const ids = Array.isArray(value) ? value : [];
        fillSelect(
          field.selectedControl,
          ids.map((id) => ({ value: id, label: String(id) })),
        );
        continue;
      }
      if (control.type === "checkbox") control.checked = Boolean(value);
      else control.value = value ?? "";
    }
  }

  /**
   * Read every registered field's control value back into a settings object.
   *
   * @returns {object} Settings object built from the current form state.
   */
  readForm() {
    const result = clone(this.value);
    for (const [path, field] of this.fields) {
      let value;
      if (field.selectedControl)
        value = [...field.selectedControl.options].map((option) =>
          Number(option.value),
        );
      else if (field.control.type === "checkbox") value = field.control.checked;
      else if (field.control.type === "number")
        value = Number(field.control.value);
      else value = field.control.value || null;
      setPath(result, path, value);
    }
    return result;
  }

  /**
   * Load Query Source/filter/template/widget options from the configured providers, in parallel.
   *
   * @returns {Promise<void>}
   */
  async loadProviderOptions() {
    const results = await Promise.allSettled([
      this.loadRecordOptions(
        this.querySourceListProvider,
        "options.querySources.allowed",
        "options.querySources.initiallyActive",
      ),
      this.loadRecordOptions(
        this.filterListProvider,
        "options.filters.allowed",
      ),
      this.loadTemplateOptions(),
      this.loadWidgetOptions(),
    ]);
    const failures = results.filter(result => result.status === "rejected");
    if (failures.length) this.showError(failures.map(result => result.reason?.message || String(result.reason)).join("\n"));
  }

  /**
   * Load a record list provider's items into a transfer control's available/selected lists (and an optional default select).
   *
   * @param {object|null} provider Record list provider; a no-op when absent.
   * @param {string} transferPath Settings path of the transfer control to populate.
   * @param {string|null} [defaultPath] Settings path of a "default" select to populate with the same items.
   * @returns {Promise<void>}
   */
  async loadRecordOptions(provider, transferPath, defaultPath = null) {
    if (!provider) return;
    const payload = await callList(provider);
    const items = normalizeItems(payload);
    const field = this.fields.get(transferPath);
    if (!field) return;
    const allowed = new Set(
      (getPath(this.value, transferPath) || []).map(Number),
    );
    fillSelect(
      field.availableControl,
      items.filter((item) => !allowed.has(Number(item.value))),
    );
    fillSelect(
      field.selectedControl,
      items.filter((item) => allowed.has(Number(item.value))),
    );
    if (defaultPath) {
      const defaultControl = this.fields.get(defaultPath)?.control;
      if (defaultControl) {
        const current = getPath(this.value, defaultPath);
        fillSelect(defaultControl, [
          { value: "", label: "None", i18n: true },
          ...items,
        ]);
        defaultControl.value = current ?? "";
      }
    }
  }

  /**
   * Load the configured report templates into the popup-template select.
   *
   * @returns {Promise<void>}
   */
  async loadTemplateOptions() {
    if (!this.reportTemplateProvider) return;
    const control = this.fields.get("config.defaults.popupTemplate")?.control;
    if (!control) return;
    const items = normalizeItems(await callList(this.reportTemplateProvider));
    const current = getPath(this.value, "config.defaults.popupTemplate");
    fillSelect(control, [
      { value: "", label: "Built-in renderer (vis native)", i18n: true },
      ...items,
    ]);
    control.value = current || "";
  }

  /**
   * Load "Filter by" target widgets for the current filter mode (website mode only).
   *
   * @returns {Promise<void>}
   */
  async loadWidgetOptions() {
    if (this.mode !== "website" || !this.widgetListProvider) return;
    const mode = this.fields.get(
      "config.currentResults.filterBy.mode",
    )?.control;
    const target = this.fields.get(
      "config.currentResults.filterBy.widgetId",
    )?.control;
    if (!target) return;
    const items = normalizeItems(
      await callList(this.widgetListProvider, { type: mode?.value }),
    );
    const current = getPath(
      this.value,
      "config.currentResults.filterBy.widgetId",
    );
    fillSelect(target, [
      { value: "", label: "Select widget", i18n: true },
      ...items,
    ]);
    target.value = current || "";
  }

  /**
   * Re-apply cross-field enable/disable and visibility rules (layout/gravity/movement, allow-all lists,
   * filter-by widget, publish-mode publish toggle).
   *
   * @returns {void}
   */
  applyDependencies() {
    const layout = this.fields.get("config.defaults.layoutMode")?.control;
    const gravity = this.fields.get("config.defaults.gravity")?.control;
    const fixedLayout = ["grid", "record-types"].includes(layout?.value);
    if (gravity) gravity.disabled = fixedLayout || layout?.value.startsWith("hierarchical-");
    const movement = this.fields.get("config.defaults.movement")?.control;
    if (movement) movement.disabled = fixedLayout;
    const optionsControl = this.fields.get("options.ui.showOptions")?.control;
    if (optionsControl) optionsControl.disabled = this.mode !== "website";
    const querySourcesAll = this.fields.get("options.querySources.allowAll");
    if (querySourcesAll)
      this.fields.get("options.querySources.allowed").row.hidden =
        querySourcesAll.control.checked;
    const filtersAll = this.fields.get("options.filters.allowAll");
    if (filtersAll)
      this.fields.get("options.filters.allowed").row.hidden =
        filtersAll.control.checked;
    const filterMode = this.fields.get(
      "config.currentResults.filterBy.mode",
    )?.control;
    const widget = this.fields.get(
      "config.currentResults.filterBy.widgetId",
    )?.control;
    if (widget) widget.disabled = !filterMode || filterMode.value === "none";
    if (this.mode === "publish") {
      const control = this.fields.get("options.ui.showPublish")?.control;
      if (control) {
        control.checked = false;
        control.disabled = true;
      }
    }
  }

  /**
   * Read the publish-mode-only options (preserve current state).
   *
   * @returns {{preserveCurrentState: boolean}}
   */
  getPublishOptions() {
    return {
      preserveCurrentState:
        this.publishControls?.preserveCurrentState.checked !== false,
    };
  }

  /**
   * Build a comparable snapshot of the current form state, used to detect unsaved changes.
   *
   * @returns {string} JSON signature of the form state and publish options.
   */
  signature() {
    return JSON.stringify([this.readForm(), this.getPublishOptions()]);
  }

  /**
   * Validate and save the form via `onSave`, closing the dialog on success.
   *
   * @returns {Promise<object|false>} The saved value, or `false` when saving was cancelled or failed.
   */
  async save() {
    try {
      const value = this.getValue();
      const context = {
        mode: this.mode,
        serialized: this.serialize(),
        publishOptions:
          this.mode === "publish" ? this.getPublishOptions() : null,
      };
      if ((await this.onSave?.(value, context)) === false) return false;
      this.close();
      return value;
    } catch (error) {
      this.showError(error?.message || String(error));
      return false;
    }
  }

  /**
   * Cancel the dialog, confirming discard first when the form has unsaved changes.
   *
   * @returns {boolean} True once cancellation completed (immediately, or false while a confirm dialog is pending).
   */
  cancel() {
    if (this.initialState && this.signature() !== this.initialState) {
      if (this.discardDialog?.open) return false;
      this.discardDialog = HMsg.showMsgDlg('Discard changes to graph configuration?', {
        title: 'Discard changes', dialogId: 'heurist-graph-discard-changes',
        buttons: [
          { label: 'Keep editing', class: 'h-btn', onClick: () => this.discardDialog.close() },
          { label: 'Discard changes', class: 'h-btn h-btn-danger', onClick: () => {
            this.discardDialog.close();
            this.finishCancel();
          } }
        ]
      });
      return false;
    }
    return this.finishCancel();
  }

  /**
   * Close the dialog and notify `onCancel` with the (best-effort) current value.
   *
   * @returns {boolean} Always `true`.
   */
  finishCancel() {
    let value;
    try { value = this.getValue(); } catch { value = clone(this.value); }
    this.close();
    this.onCancel?.(value, { mode: this.mode });
    return true;
  }

  /**
   * Show an error message dialog, only while the form is mounted.
   *
   * @param {string} message Error message text.
   * @returns {void}
   */
  showError(message) {
    if (this.form) showGraphMessage(message, { error: true, title: 'Graph configuration error' });
  }

  /**
   * Close and remove the dialog, restoring focus to the previously focused element.
   *
   * @returns {void}
   */
  close() {
    this.discardDialog?.close();
    this.dialog?.close();
    this.initialState = null;
    this.element?.remove();
    this.element = this.dialog = this.form = null;
    this.fields.clear();
    this.previousFocus?.focus?.();
    this.previousFocus = null;
  }
}

/** Force mode-specific field overrides (publish is read-only except popups; preferences always shows Options). */
function prepareMode(value, mode) {
  if (mode === "publish") {
    const copy = clone(value);
    copy.options.ui.showOptions = false;
    copy.options.ui.showPublish = false;
    copy.options.interaction.readonly = true;
    copy.options.interaction.editEnabled = false;
    copy.options.interaction.selectionEnabled = false;
    copy.options.interaction.popupEnabled = true;
    return copy;
  }
  if (mode === "preferences") {
    const copy = clone(value);
    copy.options.ui.showOptions = true;
    return copy;
  }
  const copy = clone(value);
  copy.options.ui.showPublish = false;
  return copy;
}

/** Default dialog title for a mode. */
function defaultTitle(mode) {
  return mode === "publish" ? "Publication configuration" : "Settings";
}

/** Create an element, applying the shared `h-input`/`h-select`/`h-btn` classes by tag. */
function el(tag, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (["input", "textarea"].includes(tag)) node.classList.add("h-input");
  if (tag === "select") node.classList.add("h-select");
  if (tag === "button") node.classList.add("h-btn");
  return node;
}

/** Build a labeled button with a click handler. */
function button(label, handler, title = label) {
  const node = el("button");
  if (/[A-Za-z]/.test(label)) node.classList.add("h-i18n");
  node.type = "button";
  node.textContent = label;
  node.title = $HR(title);
  node.addEventListener("click", handler);
  return node;
}

/** Build the form's primary submit button. */
function submitButton(label) {
  const node = el("button", "h-i18n h-btn-primary");
  node.type = "submit";
  node.textContent = label;
  return node;
}

/** Build a standalone labeled checkbox not bound through `register`. */
function plainCheck(labelText, checked = false) {
  const row = el("label", "heurist-config-check");
  const control = el("input");
  const caption = el("span", "h-i18n");
  caption.textContent = labelText;
  control.type = "checkbox";
  control.classList.remove("h-input");
  control.classList.add("h-checkbox");
  control.checked = checked;
  row.append(control, caption);
  return { row, control };
}

/** Create a `<select>` populated with `items`. */
function select(items) {
  const node = el("select");
  fillSelect(node, items);
  return node;
}

/** Replace a `<select>`'s options from an array of `[value, label]` pairs or `{value, label, i18n}` objects. */
function fillSelect(node, items) {
  node.replaceChildren(
    ...items.map((item) => {
      const option = el("option");
      const label = String(Array.isArray(item) ? item[1] : item.label);
      if ((Array.isArray(item) || item.i18n === true) && /[A-Za-z]/.test(label))
        option.classList.add("h-i18n");
      option.value = String(Array.isArray(item) ? item[0] : item.value);
      option.textContent = label;
      return option;
    }),
  );
}

/** Move every selected `<option>` from one multi-select to another. */
function moveSelected(source, target) {
  [...source.selectedOptions].forEach((option) => target.append(option));
}

/** Deep-clone a JSON-safe value. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Read a dot-separated path from a nested object. */
function getPath(value, path) {
  return path.split(".").reduce((item, key) => item?.[key], value);
}

/** Write a value at a dot-separated path in a nested object, creating intermediate objects as needed. */
function setPath(value, path, next) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((item, key) => (item[key] ||= {}), value);
  target[last] = next;
}

/** Call a provider's `list`/`search` method, or invoke it directly when it's a plain function. */
async function callList(provider, options) {
  if (typeof provider === "function") return provider(options);
  if (typeof provider.list === "function") return provider.list(options);
  if (typeof provider.search === "function")
    return provider.search(null, options);
  return [];
}

/** Normalize a list-provider payload into `{value, label}` entries, dropping entries with no id. */
function normalizeItems(payload) {
  const source = Array.isArray(payload) ? payload : payload?.items || [];
  return source
    .map((item) => ({
      value: item.value ?? item.id ?? item.rec_ID,
      label:
        item.label ??
        item.title ??
        item.rec_Title ??
        String(item.value ?? item.id ?? item.rec_ID),
    }))
    .filter((item) => item.value !== undefined && item.value !== null);
}
