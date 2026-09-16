/**
 * @file RecordViewConfigurationDialog.js
 * @brief Reusable persistence-neutral editor for heurist-recordview settings.
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
import {
  normalizeRecordViewConfigurationMode,
  normalizeRecordViewConfigurationSettings,
  serializeRecordViewConfigurationSettings,
} from "./recordViewConfigurationSchema.js";
import { $HR, applyI18n, HMsg } from "#shared/ui";
import { showRecordViewMessage } from "../recordViewMessages.js";

/** Edits and serializes heurist-recordview settings in a modal dialog. */
export class RecordViewConfigurationDialog {
  /**
   * @param {object} [options] Dialog configuration.
   * @param {string} [options.mode='preferences'] Dialog mode: `'preferences'`, `'website'`, or `'publish'`.
   * @param {object|null} [options.value] Initial settings value; normalized and mode-adjusted.
   * @param {Element|null} [options.parent] Element to append the dialog to; defaults to `document.body`.
   * @param {string|null} [options.title] Dialog title; defaults from `defaultTitle(mode)`.
   * @param {Function|null} [options.onSave] Called with `(value, context)` on save; returning `false` keeps the dialog open.
   * @param {Function|null} [options.onCancel] Called with `(value, {mode})` when the dialog is cancelled.
   * @param {object|null} [options.reportTemplateProvider] Provider used to list Smarty report templates.
   */
  constructor({
    mode = "preferences",
    value = null,
    parent = null,
    title = null,
    onSave = null,
    onCancel = null,
    reportTemplateProvider = null,
  } = {}) {
    this.mode = normalizeRecordViewConfigurationMode(mode);
    this.value = prepareMode(
      normalizeRecordViewConfigurationSettings(value || {}),
      this.mode,
    );
    this.parent = parent;
    this.title = title || defaultTitle(this.mode);
    this.onSave = typeof onSave === "function" ? onSave : null;
    this.onCancel = typeof onCancel === "function" ? onCancel : null;
    this.reportTemplateProvider = reportTemplateProvider;
    this.fields = new Map();
    this.element = null;
  }

  /**
   * Replace the dialog's current settings value.
   *
   * @param {object} value New settings value; normalized and mode-adjusted.
   * @returns {RecordViewConfigurationDialog} This instance, for chaining.
   */
  setValue(value) {
    this.value = prepareMode(
      normalizeRecordViewConfigurationSettings(value || {}),
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
      this.value = normalizeRecordViewConfigurationSettings(this.readForm());
    return clone(this.value);
  }

  /**
   * Produce the versioned, JSON-safe settings envelope for persistence.
   *
   * @returns {object} Serializable settings envelope.
   */
  serialize() {
    return serializeRecordViewConfigurationSettings(this.getValue());
  }

  /**
   * Build the dialog DOM, populate it, and show it modally.
   *
   * @returns {RecordViewConfigurationDialog} This instance, for chaining.
   * @throws {Error} When there is no browser `document`.
   */
  open() {
    if (typeof document === "undefined")
      throw new Error("RecordViewConfigurationDialog requires a browser document");
    if (this.element) return this;
    this.previousFocus = document.activeElement;
    this.dialog = el("dialog", "heurist-config-dialog h-dialog");
    this.element = this.dialog;
    this.dialog.setAttribute("aria-label", $HR(this.title));
    this.dialog.addEventListener("cancel", (event) => {
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
    this.buildFields(this.content);
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
    void this.loadTemplateOptions().then(() => {
      if (this.dialog) applyI18n(this.dialog);
    });
    this.dialog.showModal();
    this.dialog.querySelector("input,select,textarea,button")?.focus();
    return this;
  }

  /**
   * Build the form's fields for the current mode.
   *
   * @param {HTMLElement} body Container to append fields into.
   * @returns {void}
   */
  buildFields(body) {
    if (this.mode !== "publish") {
      this.select("config.defaults.engine", "Render engine", [
        ["builtin", "Built-in"],
        ["legacy", "Legacy viewer"],
        ["smarty", "Smarty template"],
      ]);
      this.templateRow = this.select(
        "config.defaults.template",
        "Smarty template",
        [],
      );
      this.select("config.defaults.selectionMode", "Selection mode", [
        ["first", "First selected"],
        ["last", "Last selected"],
        ["single-only", "Single selection only"],
      ]);
    }
    this.select("options.ui.language", "Language", [
      ["auto", "Auto"],
      ["eng", "English"],
      ["fre", "French"],
      ["ger", "German"],
      ["por", "Portuguese"],
    ]);
    this.check("config.defaults.showHeader", "Show header");
    this.text("config.defaults.headerTitle", "Header title");
    this.text("config.defaults.emptyMessage", "Empty message");
    for (const [path, field] of this.fields) {
      body.append(field.row);
      if (path === "config.defaults.engine") {
        field.control.addEventListener("change", () => this.applyDependencies());
      }
    }
  }

  /** Show or hide the template select based on the selected engine. */
  applyDependencies() {
    const engine = this.fields.get("config.defaults.engine")?.control.value;
    if (this.templateRow) this.templateRow.hidden = engine !== "smarty";
  }

  /** Load Smarty report template options from the configured provider. */
  async loadTemplateOptions() {
    if (!this.reportTemplateProvider) return;
    try {
      const items = await this.reportTemplateProvider.list();
      const control = this.fields.get("config.defaults.template")?.control;
      if (control) {
        fillSelect(control, [
          ["", "None"],
          ...items.map((item) => [item.value, item.label]),
        ]);
        control.value = getPath(this.value, "config.defaults.template") || "";
      }
    } catch (error) {
      this.showError(error?.message || String(error));
    }
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
   * Build and register a labeled text-input field row.
   *
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @returns {HTMLElement} The generated row element.
   */
  text(path, labelText) {
    const row = el("label", "heurist-config-row");
    const caption = el("span", "h-i18n");
    caption.textContent = labelText;
    const control = el("input");
    control.type = "text";
    row.append(caption, control);
    this.register(path, control, row);
    return row;
  }

  /**
   * Build and register a labeled `<select>` field row.
   *
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @param {Array<[*, string]>} options Option `[value, label]` pairs.
   * @returns {HTMLElement} The generated row element.
   */
  select(path, labelText, options) {
    const row = el("label", "heurist-config-row");
    const caption = el("span", "h-i18n");
    caption.textContent = labelText;
    const control = select(options);
    row.append(caption, control);
    this.register(path, control, row);
    return row;
  }

  /**
   * Record a field's control/row under its settings path.
   *
   * @param {string} path Dot-separated settings path.
   * @param {HTMLElement} control Field's input/select control.
   * @param {HTMLElement} row Field's row element.
   * @returns {HTMLElement} `control`, unchanged.
   */
  register(path, control, row) {
    this.fields.set(path, { control, row });
    return control;
  }

  /** Write `this.value` into every registered field's control. */
  populate() {
    for (const [path, field] of this.fields) {
      const value = getPath(this.value, path);
      const control = field.control;
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
      const value =
        field.control.type === "checkbox"
          ? field.control.checked
          : field.control.value || null;
      setPath(result, path, value);
    }
    return result;
  }

  /**
   * Validate and save the form via `onSave`, closing the dialog on success.
   *
   * @returns {Promise<object|false>} The saved value, or `false` when saving was cancelled or failed.
   */
  async save() {
    try {
      const value = this.getValue();
      const context = { mode: this.mode, serialized: this.serialize() };
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
      this.discardDialog = HMsg.showMsgDlg("Discard changes to Record View configuration?", {
        title: "Discard changes",
        dialogId: "heurist-recordview-discard-changes",
        buttons: [
          { label: "Keep editing", class: "h-btn", onClick: () => this.discardDialog.close() },
          {
            label: "Discard changes",
            class: "h-btn h-btn-danger",
            onClick: () => {
              this.discardDialog.close();
              this.finishCancel();
            },
          },
        ],
      });
      return false;
    }
    return this.finishCancel();
  }

  /** Close the dialog and notify `onCancel` with the (best-effort) current value. */
  finishCancel() {
    let value;
    try {
      value = this.getValue();
    } catch {
      value = clone(this.value);
    }
    this.close();
    this.onCancel?.(value, { mode: this.mode });
    return true;
  }

  /** Snapshot the live form for discard-confirmation comparisons. */
  signature() {
    return JSON.stringify(this.readForm());
  }

  /** Show an error message dialog, only while the form is mounted. */
  showError(message) {
    if (this.form) showRecordViewMessage(message, { error: true, title: "Record View configuration error" });
  }

  /** Close and remove the dialog, restoring focus to the previously focused element. */
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

/** Force mode-specific field overrides (publish is read-only; preferences always shows Options). */
function prepareMode(value, mode) {
  if (mode === "publish") {
    const copy = clone(value);
    copy.options.ui.showOptions = false;
    copy.options.ui.showPublish = false;
    copy.options.interaction.readonly = true;
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

/** Replace a `<select>`'s options from an array of `[value, label]` pairs. */
function fillSelect(node, items) {
  node.replaceChildren(
    ...items.map(([value, label]) => {
      const option = el("option");
      if (/[A-Za-z]/.test(String(label))) option.classList.add("h-i18n");
      option.value = String(value);
      option.textContent = String(label);
      return option;
    }),
  );
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
