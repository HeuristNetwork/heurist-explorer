/**
 * @file DataConfigurationDialog.js
 * @brief Reusable persistence-neutral editor for heurist-data settings.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import {
  normalizeDataConfigurationMode,
  normalizeDataConfigurationSettings,
  serializeDataConfigurationSettings,
} from "./dataConfigurationSchema.js";
import { $HR, applyI18n, HMsg } from "#shared/ui";

/** Edits and serializes heurist-data settings in a modal dialog. */
export class DataConfigurationDialog {
  constructor({
    mode = "preferences",
    value = null,
    parent = null,
    title = null,
    onSave = null,
    onCancel = null,
    datasetListProvider = null,
    filterListProvider = null,
    reportTemplateProvider = null,
    widgetListProvider = null,
    publishContext = null,
    runtimeMode = null,
  } = {}) {
    this.mode = normalizeDataConfigurationMode(mode);
    this.runtimeMode = String(runtimeMode || "").toLowerCase();
    this.value = prepareMode(
      normalizeDataConfigurationSettings(value || {}),
      this.mode,
      this.runtimeMode,
    );
    this.parent = parent;
    this.title = title || defaultTitle(this.mode);
    this.onSave = typeof onSave === "function" ? onSave : null;
    this.onCancel = typeof onCancel === "function" ? onCancel : null;
    this.datasetListProvider = datasetListProvider;
    this.filterListProvider = filterListProvider;
    this.reportTemplateProvider = reportTemplateProvider;
    this.widgetListProvider = widgetListProvider;
    this.publishContext = publishContext || {};
    this.fields = new Map();
    this.element = null;
  }

  get isMain() {
    return this.runtimeMode === "main";
  }

  setValue(value) {
    this.value = prepareMode(
      normalizeDataConfigurationSettings(value || {}),
      this.mode,
      this.runtimeMode,
    );
    return this;
  }
  getValue() {
    if (this.form)
      this.value = normalizeDataConfigurationSettings(this.readForm());
    return clone(this.value);
  }
  serialize() {
    return serializeDataConfigurationSettings(this.getValue());
  }

  open() {
    if (typeof document === "undefined")
      throw new Error("DataConfigurationDialog requires a browser document");
    if (this.element) return this;
    this.previousFocus = document.activeElement;
    this.dialog = el("dialog", "h-dialog heurist-data-config-dialog");
    this.element = this.dialog;
    const header = el("header", "h-dialog-header heurist-data-config-header");
    const heading = el("h2", "h-dialog-title h-i18n");
    heading.textContent = this.title;
    const close = button("×", () => this.cancel(), "Close");
    close.classList.add("h-dialog-close", "heurist-data-config-close");
    header.append(heading, close);
    this.form = el("form", "heurist-data-config-form");
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.save();
    });
    this.form.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.cancel();
      }
    });
    this.content = el("div", "heurist-data-config-content");
    this.buildSections();
    const footer = el("footer", "h-dialog-footer heurist-data-config-footer");
    footer.append(
      button("Cancel", () => this.cancel()),
      submitButton(this.mode === "publish" ? "Publish" : "Apply"),
    );
    this.form.append(this.content, footer);
    this.dialog.append(header, this.form);
    (this.parent || document.body).append(this.dialog);
    this.populate();
    this.applyDependencies();
    this.initialState = this.signature();
    applyI18n(this.dialog);
    void this.loadProviderOptions().then(() => applyI18n(this.dialog));
    this.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.cancel();
    });
    this.dialog.showModal();
    this.dialog.querySelector("input,select,textarea,button")?.focus();
    return this;
  }

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
    // The "main" runtime hides the website-editor-only source sections.
    if (!this.isMain) {
      this.content.append(
        this.section(
          "Filtered Result",
          (body) => this.buildCurrentResults(body),
          true,
        ),
        this.section("Datasets and Filters", (body) =>
          this.buildDatasetsAndFilters(body),
        ),
      );
    }
    this.content.append(
      this.section("Interaction", (body) => this.buildInteraction(body)),
    );
  }

  buildInterface(body) {
    // In "main" runtime the Filtered Result / Datasets / Filters visibility and
    // the panel layout are fixed, so their toggles are not offered.
    if (!this.isMain) {
      body.append(
        this.check("options.ui.showCurrentResults", "Filtered Result"),
        this.check("options.ui.showDatasets", "Datasets"),
        this.check("options.ui.showFilters", "Filters"),
        this.separator(),
      );
      const sourceHeader = this.check("options.ui.showSourceHeader", "Header");
      sourceHeader.title = $HR("source_header_hint");
      body.append(
        this.check("options.ui.initiallyExpanded", "Initially expanded"),
        sourceHeader,
      );
    }
    body.append(
      this.check(
        "options.ui.showColumnPicker",
        "Columns picker (Table view only)",
      ),
      this.check("options.ui.showOptions", "Options"),
      this.check("options.ui.showPublish", "Publish"),
    );
    const controls = el("fieldset", "heurist-data-config-subgroup");
    const legend = el("legend", "h-i18n");
    legend.textContent = "Native controls";
    const exportControl = this.check(
      "options.nativeControls.export",
      "Export (CSV, Excel, PDF)",
    );
    const exportWarning = el(
      "button",
      "h-btn h-btn-small heurist-data-config-export-warning h-i18n",
    );
    exportWarning.type = "button";
    exportWarning.textContent = "Export warning";
    exportWarning.addEventListener("click", () =>
      HMsg.showMsgDlg("Export_warning", {
        title: "Export",
        buttons: { OK: () => HMsg.closeMsgDlg() },
      }),
    );
    controls.append(
      legend,
      this.check("options.nativeControls.pageSize", "Page size"),
      this.check("options.nativeControls.search", "Search in results"),
      this.check("options.nativeControls.counter", "Counter"),
      exportControl,
      this.check("options.nativeControls.viewMode", "View mode"),
      this.check(
        "options.nativeControls.selectionActions",
        "Selection actions",
      ),
      exportWarning,
    );
    body.append(controls);
    if (this.mode === "publish" || this.mode === "website") {
      this.select(body, "options.ui.language", "Language", [
        ["auto", "Auto"],
        ["eng", "English"],
        ["fre", "French"]
        //["ger", "German"],
        //["por", "Portuguese"],
      ]);
    }
  }

  buildDefaults(body) {
    // The rendering engine is derived from the view mode: "Table" selects the
    // DataTables engine, every other mode the record-list engine.
    this.select(body, "config.defaults.viewMode", "View mode", [
      ["list", "List"],
      ["card", "Cards"],
      ["row", "Rows"],
      ["big", "Extended"],
      ["datatable", "Table"],
    ]);
    this.select(body, "config.defaults.pageSize", "Page size", [
      [50, "50"],
      [100, "100"],
      [500, "500"],
      [1000, "1000"],
      [5000, "5000"],
    ]);
    this.number(body, "config.defaults.fontSize", "Font size", 8, 30);
    this.textarea(
      body,
      "config.defaults.emptyResultMessage",
      "Empty result message",
      3,
    );
    this.select(body, "config.defaults.cardTemplate", "Card and row template", [
      ["", "Built-in renderer"],
    ]);
    this.select(
      body,
      "config.defaults.viewTemplate",
      "Extended view template",
      [["", "Standard record view"]],
    );
    this.fields
      .get("config.defaults.viewMode")
      .control.addEventListener("change", () => this.applyDependencies());
  }

  buildCurrentResults(body) {
    this.text(body, "config.currentResults.title", "Title");
    this.text(body, "config.currentResults.initialQuery", "Initial query");
    if (this.mode === "website") {
      const row = el(
        "div",
        "heurist-data-config-row heurist-data-config-filterby",
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
        void this.loadWidgetOptions();
      });
    }
  }

  buildDatasetsAndFilters(body) {
    const datasetBox = el("div", "heurist-data-config-list-section");
    const datasetHeading = el("div", "heurist-data-config-list-heading");
    const datasetTitle = el("strong", "h-i18n");
    datasetTitle.textContent = "Datasets";
    datasetHeading.append(
      datasetTitle,
      this.check("options.datasets.allowAll", "Allow all"),
    );
    datasetBox.append(datasetHeading);
    const datasetTransfer = this.transfer(
      "options.datasets.allowed",
      "Available datasets",
      "Allowed datasets",
    );
    datasetBox.append(datasetTransfer.row);
    this.select(
      datasetBox,
      "options.datasets.initiallyActive",
      "Default dataset",
      [["", "None"]],
    );
    const filterBox = el("div", "heurist-data-config-list-section");
    const filterHeading = el("div", "heurist-data-config-list-heading");
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
    body.append(datasetBox, filterBox);
    this.fields
      .get("options.datasets.allowAll")
      .control.addEventListener("change", () => this.applyDependencies());
    this.fields
      .get("options.filters.allowAll")
      .control.addEventListener("change", () => this.applyDependencies());
  }

  buildInteraction(body) {
    body.append(
      this.check("options.interaction.editEnabled", "Enable edit"),
      this.check("options.interaction.selectionEnabled", "Enable selection"),
      this.check(
        "options.interaction.persistentSelectionEnabled",
        "Collection / Persistent selection",
      ),
      this.check("options.interaction.popupEnabled", "Enable popups"),
      this.check("options.interaction.adminInfoEnabled", "Admin info"),
    );
  }

  buildPublication(body) {
    const preserve = plainCheck("Preserve current state", true);
    preserve.row.title = $HR(
      "Preserve the active dataset or query, page, sort, filter and selection.",
    );
    body.append(
      preserve.row,
      this.check("options.interaction.popupEnabled", "Enable popups"),
    );
    this.publishControls = { preserveCurrentState: preserve.control };
  }

  section(title, builder, open = false) {
    const details = el("details", "heurist-data-config-section");
    details.open = open;
    const summary = el("summary", "h-i18n");
    summary.textContent = title;
    const body = el("div", "heurist-data-config-section-body");
    builder(body);
    details.append(summary, body);
    return details;
  }
  check(path, labelText) {
    const item = plainCheck(labelText);
    this.register(path, item.control, item.row);
    return item.row;
  }
  text(parent, path, labelText) {
    return this.inputRow(parent, path, labelText, "text");
  }
  number(parent, path, labelText, min, max) {
    const row = this.inputRow(parent, path, labelText, "number");
    const control = this.fields.get(path).control;
    control.min = min;
    control.max = max;
    return row;
  }
  textarea(parent, path, labelText, rows) {
    const row = el("label", "heurist-data-config-row");
    const caption = el("span", "h-i18n");
    caption.textContent = labelText;
    const control = el("textarea", "h-input");
    control.rows = rows;
    row.append(caption, control);
    parent.append(row);
    this.register(path, control, row);
    return row;
  }
  inputRow(parent, path, labelText, type) {
    const row = el("label", "heurist-data-config-row");
    const caption = el("span", "h-i18n");
    caption.textContent = labelText;
    const control = el("input", "h-input");
    control.type = type;
    row.append(caption, control);
    parent.append(row);
    this.register(path, control, row);
    return row;
  }
  select(parent, path, labelText, options) {
    const row = el("label", "heurist-data-config-row");
    const caption = el("span", "h-i18n");
    caption.textContent = labelText;
    const control = select(options);
    row.append(caption, control);
    parent.append(row);
    this.register(path, control, row);
    return row;
  }
  separator() {
    return el("span", "heurist-data-config-break");
  }
  register(path, control, row, extras = {}) {
    this.fields.set(path, { control, row, ...extras });
    return control;
  }

  transfer(path, availableLabel, selectedLabel) {
    const row = el("div", "heurist-data-config-transfer");
    const available = el("select", "h-select");
    available.multiple = true;
    available.setAttribute("aria-label", $HR(availableLabel));
    const selected = el("select", "h-select");
    selected.multiple = true;
    selected.setAttribute("aria-label", $HR(selectedLabel));
    const controls = el("div", "heurist-data-config-transfer-buttons");
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

  async loadProviderOptions() {
    await Promise.allSettled([
      this.loadRecordOptions(
        this.datasetListProvider,
        "options.datasets.allowed",
        "options.datasets.initiallyActive",
      ),
      this.loadRecordOptions(
        this.filterListProvider,
        "options.filters.allowed",
      ),
      this.loadTemplateOptions(),
      this.loadWidgetOptions(),
    ]);
  }

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

  async loadTemplateOptions() {
    if (!this.reportTemplateProvider) return;
    const items = normalizeItems(await callList(this.reportTemplateProvider));
    const controls = [
      ["config.defaults.cardTemplate", "Built-in renderer"],
      ["config.defaults.viewTemplate", "Standard record view"],
    ];
    controls.forEach(([path, defaultLabel]) => {
      const control = this.fields.get(path)?.control;
      if (!control) return;
      const current = getPath(this.value, path);
      fillSelect(control, [
        { value: "", label: defaultLabel, i18n: true },
        ...items,
      ]);
      control.value = current || "";
    });
  }
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

  applyDependencies() {
    const optionsControl = this.fields.get("options.ui.showOptions")?.control;
    if (optionsControl) optionsControl.disabled = this.mode !== "website";
    const datasetsAll = this.fields.get("options.datasets.allowAll");
    if (datasetsAll)
      this.fields.get("options.datasets.allowed").row.hidden =
        datasetsAll.control.checked;
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
    // The template pickers only apply to their record-list render modes.
    const viewModeValue =
      this.fields.get("config.defaults.viewMode")?.control?.value ||
      getPath(this.value, "config.defaults.viewMode");
    const cardRow = this.fields.get("config.defaults.cardTemplate")?.row;
    if (cardRow)
      cardRow.hidden = !["card", "row"].includes(viewModeValue);
    const viewRow = this.fields.get("config.defaults.viewTemplate")?.row;
    if (viewRow) viewRow.hidden = viewModeValue !== "big";
    if (this.mode === "publish") {
      for (const path of [
        "options.ui.showColumnPicker",
        "options.ui.showPublish",
        "options.nativeControls.selectionActions",
      ]) {
        const control = this.fields.get(path)?.control;
        if (control) {
          control.checked = false;
          control.disabled = true;
        }
      }
    }
  }
  getPublishOptions() {
    return {
      preserveCurrentState:
        this.publishControls?.preserveCurrentState.checked !== false,
    };
  }
  signature() {
    return JSON.stringify(this.readForm());
  }
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
  cancel(force = false) {
    if (
      !force &&
      this.initialState &&
      this.signature() !== this.initialState
    ) {
      HMsg.showMsgDlg("Discard changes to data configuration?", {
        title: "Confirm",
        buttons: [
          {
            label: "Discard",
            class: "h-btn h-btn-danger",
            onClick: () => {
              HMsg.closeMsgDlg();
              this.cancel(true);
            },
          },
          {
            label: "Cancel",
            class: "h-btn",
            onClick: () => HMsg.closeMsgDlg(),
          },
        ],
      });
      return false;
    }
    const value = this.getValue();
    this.close();
    this.onCancel?.(value, { mode: this.mode });
    return true;
  }
  showError(message) {
    HMsg.showMsgErr(message);
  }
  close() {
    if (this.dialog?.open) this.dialog.close();
    this.element?.remove();
    this.element = this.dialog = this.form = null;
    this.fields.clear();
    this.previousFocus?.focus?.();
    this.previousFocus = null;
  }
}

function prepareMode(value, mode, runtimeMode = "") {
  const result = prepareForMode(value, mode);
  if (runtimeMode === "main") {
    // The module in the main Heurist editor uses a fixed interface: header
    // always on; no Filtered Result / Datasets / Filters panels.
    result.options.ui.showSourceHeader = true;
    result.options.ui.showCurrentResults = false;
    result.options.ui.showFilters = false;
    result.options.ui.showDatasets = false;
  }
  return result;
}

function prepareForMode(value, mode) {
  if (mode === "publish") {
    const copy = clone(value);
    copy.options.ui.showOptions = false;
    copy.options.ui.showColumnPicker = false;
    copy.options.ui.showPublish = false;
    copy.options.nativeControls.selectionActions = false;
    copy.options.interaction.readonly = true;
    copy.options.interaction.editEnabled = false;
    copy.options.interaction.selectionEnabled = false;
    copy.options.interaction.persistentSelectionEnabled = false;
    copy.options.interaction.popupEnabled = true;
    copy.options.interaction.adminInfoEnabled = false;
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
function defaultTitle(mode) {
  return mode === "publish" ? "Publication configuration" : "Settings";
}
function el(tag, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
function button(label, handler, title = label) {
  const node = el("button", "h-btn h-btn-small");
  if (/[A-Za-z]/.test(label)) node.classList.add("h-i18n");
  node.type = "button";
  node.textContent = label;
  node.title = $HR(title);
  node.addEventListener("click", handler);
  return node;
}
function submitButton(label) {
  const node = el("button", "h-btn h-btn-small h-btn-primary h-i18n");
  node.type = "submit";
  node.textContent = label;
  return node;
}
function plainCheck(labelText, checked = false) {
  const row = el("label", "heurist-data-config-check");
  const control = el("input", "h-checkbox");
  const caption = el("span", "h-i18n");
  caption.textContent = labelText;
  control.type = "checkbox";
  control.checked = checked;
  row.append(control, caption);
  return { row, control };
}
function select(items) {
  const node = el("select", "h-select");
  fillSelect(node, items);
  return node;
}
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
function moveSelected(source, target) {
  [...source.selectedOptions].forEach((option) => target.append(option));
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function getPath(value, path) {
  return path.split(".").reduce((item, key) => item?.[key], value);
}
function setPath(value, path, next) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((item, key) => (item[key] ||= {}), value);
  target[last] = next;
}
async function callList(provider, options) {
  if (typeof provider === "function") return provider(options);
  if (typeof provider.list === "function") return provider.list(options);
  if (typeof provider.search === "function")
    return provider.search(null, options);
  return [];
}
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
