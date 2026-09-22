/**
 * @file DataTablesAdapter.js
 * @brief DataTables.net rendering engine.
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

import DataTable from "datatables.net-dt";
import "datatables.net-dt/css/dataTables.dataTables.css";
import "datatables.net-buttons-dt";
import "datatables.net-buttons-dt/css/buttons.dataTables.css";
import "datatables.net-buttons/js/buttons.html5.mjs";
import { DataEngineAdapter } from "../DataEngineAdapter.js";
import { $HR } from "#shared/ui";
import {
  fieldValues,
  sanitizeTextHtml,
  stripHtml,
} from "../../core/FieldValueFormatter.js";

const RECORD_TYPE_ICON_TOKEN = Date.now();

/** Renders application data with DataTables.net. */
export class DataTablesAdapter extends DataEngineAdapter {
  /**
   * Build the toolbar, export buttons, and DataTables instance.
   *
   * @param {object} context Engine context; see `DataApplication#_engineContext`.
   * @param {HTMLElement} context.container Element to render the table into.
   * @param {object} [context.options] Engine options (columns, controls, interaction flags, page length, …).
   * @param {Function} context.onSelectionChange Called with selected record IDs.
   * @param {Function} context.onEditRecord Called with a record ID to edit.
   * @param {Function} context.onViewRecord Called with a record ID to view.
   * @param {Function} context.onCollectionToggle Called with `(recordId, collected)` to toggle persistent collection membership.
   * @param {Function} context.onCollectionAction Called with `(action, recordIds)` for bulk collection actions.
   * @param {Function} context.onDataRequest Called with `{offset, limit, sort, filter}` to request a page of data.
   * @param {Function} context.onViewModeChange Called with the new view mode.
   * @param {Function} context.onDataSourceAction Called with a datasource action id (workspace/save-filter/save-source).
   * @returns {Promise<void>}
   */
  async initialize({
    container,
    options = {},
    onSelectionChange,
    onEditRecord,
    onViewRecord,
    onCollectionToggle,
    onCollectionAction,
    onDataRequest,
    onViewModeChange,
    onDataSourceAction,
  }) {
    this.container = container;
    this.options = options;
    this.onSelectionChange = onSelectionChange;
    this.onEditRecord = onEditRecord;
    this.onViewRecord = onViewRecord;
    this.onCollectionToggle = onCollectionToggle;
    this.onCollectionAction = onCollectionAction;
    this.onDataRequest = onDataRequest;
    this.onViewModeChange = onViewModeChange;
    this.onDataSourceAction = onDataSourceAction;
    this.pendingRequestKey = null;
    this.pendingRequest = null;
    this.selected = new Set();
    this.collected = new Set();
    this._buildToolbar();
    this.exportButtons = [];
    if (this.options.controls?.export !== false) {
      await this._initializeExportButtons();
    }
    this.tableElement = document.createElement("table");
    this.tableElement.className = "display heurist-data-table";
    this.container.replaceChildren(this.tableElement);
    this.container.classList.add("heurist-data-table-host");
    this.container.style.setProperty(
      "--heurist-data-font-size",
      `${Number(this.options.fontSize) || 14}px`,
    );
    this.clickHandler = (event) => this._handleClick(event);
    this.tableElement.addEventListener("click", this.clickHandler);
  }

  /**
   * Build the dedicated toolbar rendered as a sibling above the DataTables
   * container, mirroring the HRecordList toolbar: quick search, view-mode
   * selector, and selection / collection actions. The native DataTables
   * search box and top layout row are not used.
   */
  _buildToolbar() {
    const interaction = this.options.interaction || {};
    const controls = this.options.controls || {};
    const bar = document.createElement("div");
    bar.className = "heurist-data-toolbar";

    const searchLabel = document.createElement("label");
    searchLabel.className = "heurist-data-toolbar-search";
    this.searchInput = document.createElement("input");
    this.searchInput.type = "search";
    this.searchInput.className = "h-input";
    this.searchInput.autocomplete = "off";
    this.searchInput.placeholder = $HR("Search in results");
    this.searchInput.setAttribute("aria-label", $HR("Search in results"));
    searchLabel.append(this.searchInput);
    searchLabel.hidden = controls.search === false;
    let searchTimer;
    this.searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(
        () => this.instance?.search(this.searchInput.value.trim()).draw(),
        Number(this.options.searchDelay) || 400,
      );
    });

    const viewLabel = document.createElement("label");
    viewLabel.className = "h-inline";
    const viewCaption = document.createElement("span");
    viewCaption.className = "heurist-data-toolbar-label";
    viewCaption.textContent = $HR("View");
    const select = document.createElement("select");
    select.className = "h-select heurist-data-view-mode";
    [
      ["list", "List"],
      ["card", "Cards"],
      ["row", "Rows"],
      ["big", "Extended"],
      ["datatable", "Table"],
    ].forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = $HR(text);
      select.append(option);
    });
    select.value = "datatable";
    select.addEventListener("change", () => {
      const value = select.value;
      select.value = "datatable";
      if (value !== "datatable") this.onViewModeChange?.(value);
    });
    viewLabel.append(viewCaption, select);

    const actions = document.createElement("details");
    actions.className = "h-dropdown";
    this.selectionButton = document.createElement("summary");
    this.selectionButton.className = "h-btn h-btn-small";
    const menu = document.createElement("ul");
    menu.className = "h-menu";
    const collectionEnabled =
      interaction.persistentSelectionEnabled === true;
    const menuItems = [
      { selection: "page", label: "Select all on page" },
      { selection: "none", label: "Select none" },
      ...(collectionEnabled
        ? [
            { divider: true },
            { collection: "add-selected", label: "Add selected to collection" },
            { collection: "add-page", label: "Add page to collection" },
            {
              collection: "remove-selected",
              label: "Remove selected from collection",
            },
            { collection: "clear", label: "Clear collection" },
            { collection: "show", label: "Show collection" },
          ]
        : []),
    ];
    menuItems.forEach((item) => {
      const li = document.createElement("li");
      if (item.divider) {
        li.innerHTML = '<hr class="h-menu-divider">';
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "h-menu-item";
        button.textContent = $HR(item.label);
        if (item.selection) button.dataset.selectionAction = item.selection;
        else button.dataset.collectionActionName = item.collection;
        li.append(button);
      }
      menu.append(li);
    });
    actions.append(this.selectionButton, menu);
    actions.hidden =
      interaction.selectionEnabled === false ||
      controls.selectionActions === false;
    actions.addEventListener("click", (event) => {
      const target = event.target.closest(
        "[data-selection-action],[data-collection-action-name]",
      );
      if (!target) return;
      event.preventDefault();
      actions.removeAttribute("open");
      if (target.dataset.selectionAction)
        this._selectionAction(target.dataset.selectionAction);
      else void this._collectionAction(target.dataset.collectionActionName);
    });

    this.sourceActions = document.createElement("span");
    this.sourceActions.className = "heurist-data-source-actions";
    this.workspaceButton = sourceActionButton(
      "workspace",
      "fa-regular fa-object-group",
      "Add to workspace",
    );
    this.saveFilterButton = sourceActionButton(
      "save-filter",
      "fa-regular fa-floppy-disk",
      "Save as Filter",
    );
    this.saveSourceButton = sourceActionButton(
      "save-source",
      "fa-solid fa-database",
      "Save as Source",
    );
    this.sourceActions.append(
      this.workspaceButton,
      this.saveFilterButton,
      this.saveSourceButton,
    );
    this.sourceActions.hidden = this.options.sourceActionsEnabled !== true;
    this.sourceActions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-source-action]");
      if (!button) return;
      Promise.resolve(this.onDataSourceAction?.(button.dataset.sourceAction))
        .catch(() => {});
    });

    bar.append(searchLabel, viewLabel, actions, this.sourceActions);
    this.toolbarElement = bar;
    this.searchLabel = searchLabel;
    this.selectionActionsEl = actions;
    this._updateSelectionButton();
  }

  /** Re-apply toolbar control visibility after a configuration change. */
  _syncToolbarVisibility() {
    const interaction = this.options.interaction || {};
    const controls = this.options.controls || {};
    if (this.searchLabel) this.searchLabel.hidden = controls.search === false;
    if (this.selectionActionsEl)
      this.selectionActionsEl.hidden =
        interaction.selectionEnabled === false ||
        controls.selectionActions === false;
    if (this.sourceActions)
      this.sourceActions.hidden = this.options.sourceActionsEnabled !== true;
  }

  /**
   * Show/hide the source-actions toolbar group and reflect workspace membership on its button.
   *
   * @param {{enabled?: boolean, inWorkspace?: boolean}} [options] Visibility and workspace-membership state.
   * @returns {Promise<void>}
   */
  async setDataSourceActions({ enabled = false, inWorkspace = false } = {}) {
    if (this.sourceActions) this.sourceActions.hidden = !enabled;
    if (this.workspaceButton) {
      this.workspaceButton.classList.toggle("active", inWorkspace);
      const icon = this.workspaceButton.querySelector("i");
      icon?.classList.toggle("fa-regular", !inWorkspace);
      icon?.classList.toggle("fa-solid", inWorkspace);
      const title = $HR(inWorkspace ? "Remove from workspace" : "Add to workspace");
      this.workspaceButton.title = title;
      this.workspaceButton.setAttribute("aria-label", title);
    }
  }

  /** Record ids on the currently rendered DataTables page. */
  _pageIds() {
    if (!this.instance) return [];
    return this.instance
      .rows({ page: "current" })
      .data()
      .toArray()
      .map((row) => Number(row?.rec_ID))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  /** Apply a toolbar selection shortcut ('page' selects the visible page, 'none' clears selection). */
  _selectionAction(name) {
    if (name === "page")
      this._pageIds().forEach((id) => this.selected.add(id));
    else if (name === "none") this.selected.clear();
    else return;
    this._applySelectionClasses();
    this.onSelectionChange?.([...this.selected]);
  }

  /** Dispatch a toolbar persistent-collection shortcut to the host-level collection action handler. */
  async _collectionAction(name) {
    const selected = [...this.selected];
    if (name === "add-selected")
      await this.onCollectionAction?.("add", selected);
    else if (name === "add-page")
      await this.onCollectionAction?.("add", this._pageIds());
    else if (name === "remove-selected")
      await this.onCollectionAction?.("remove", selected);
    else if (name === "clear") await this.onCollectionAction?.("clear", []);
    else if (name === "show") await this.onCollectionAction?.("show", []);
  }

  /** Refresh the selection-count toolbar button's label. */
  _updateSelectionButton() {
    if (this.selectionButton)
      this.selectionButton.textContent = `${$HR("Selected")}: ${this.selected.size}`;
  }

  /** Move the toolbar to sit between the source header and the DataTables container. */
  _placeToolbar() {
    if (!this.toolbarElement || !this.container) return;
    const dt = this.container.querySelector(".dt-container");
    if (dt) this.container.insertBefore(this.toolbarElement, dt);
    else this.container.append(this.toolbarElement);
    this.container.classList.add("heurist-data-has-toolbar");
  }

  /** Load large, format-specific exporters only when export controls are enabled. */
  async _initializeExportButtons() {
    const exportOptions = { orthogonal: "export", stripHtml: true };
    this.exportButtons = [
      { extend: "copyHtml5", text: "Copy", exportOptions },
      { extend: "csvHtml5", exportOptions },
    ];

    try {
      const { default: JSZip } = await import("jszip");
      DataTable.Buttons.jszip(JSZip);
      this.exportButtons.push({ extend: "excelHtml5", exportOptions });
    } catch {
      // CSV and clipboard export remain available without JSZip.
    }

    try {
      const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
        import("pdfmake/build/pdfmake.js"),
        import("pdfmake/build/vfs_fonts.js"),
      ]);
      pdfMake.addVirtualFileSystem(pdfFonts);
      DataTable.Buttons.pdfMake(pdfMake);
      this.exportButtons.push({ extend: "pdfHtml5", exportOptions });
    } catch {
      // Other export formats remain available if PDF initialization fails.
    }
  }

  /**
   * Rebuild the DataTables instance for a new page of data.
   *
   * @param {{querySource: object|null, records: Array<object>, meta: object, pagination: object}} data Data to render.
   * @returns {Promise<void>}
   */
  async setData({ querySource, records, meta, pagination }) {
    this.instance?.destroy();
    this.instance = null;
    this.tableElement.replaceChildren();
    this.selected.clear();
    this.querySource = querySource;
    this.records = records;
    this.meta = meta;
    const fields =
      querySource?.fields?.filter((field) => field.visible !== false) || [];
    const projected = projectRecords(records, fields);
    const interaction = this.options.interaction || {};
    const collectionEnabled = interaction.persistentSelectionEnabled === true;
    const adminEnabled = interaction.adminInfoEnabled === true;
    const actionEnabled =
      interaction.editEnabled === true || interaction.popupEnabled === true;
    const columns = [
      ...(collectionEnabled
        ? [
            {
              title: "",
              data: "rec_ID",
              width: "1.6em",
              orderable: false,
              searchable: false,
              className: "heurist-data-collection-cell",
              render: (value) =>
                `<input type="checkbox" class="heurist-data-collection" data-record-id="${Number(value)}" aria-label="${escapeHtml($HR("In collection"))}">`,
            },
          ]
        : []),
      ...(adminEnabled
        ? [
            {
              title: $HR("Record info"),
              data: "_record",
              width: "9em",
              orderable: false,
              searchable: false,
              className: "heurist-data-admin-cell",
              render: (record, type) =>
                type === "display"
                  ? renderAdminInfo(record, this.options)
                  : String(record?.rec_OwnerName || ""),
            },
          ]
        : []),
      ...fields.map((field, index) => ({
        title: field.title || fieldTitle(field.field, meta),
        data: columnKey(index),
        width: field.width || undefined,
        orderable: Boolean(sortCode(field.field)),
        render: (value, type) =>
          formatProjectedCell(value, type, fieldType(field.field, meta)),
      })),
      ...(actionEnabled
        ? [
            {
              title: "",
              data: "rec_ID",
              width: "3em",
              orderable: false,
              searchable: false,
              className: "heurist-data-actions-cell",
              render: (value) => renderRowActions(value, interaction),
            },
          ]
        : []),
    ];
    let initialPage = {
      records: projected,
      total: Number(pagination?.total) || projected.length,
    };
    this.instance = new DataTable(this.tableElement, {
      columns,
      pageLength: Number(this.options.pageLength) || 100,
      lengthMenu: [50, 100, 500, 1000, 5000],
      layout: this._layoutOptions(),
      serverSide: true,
      processing: true,
      ajax: async (request, callback) => {
        try {
          let page;
          if (initialPage) {
            page = {
              ...initialPage,
              records: initialPage.records.slice(
                Number(request.start) || 0,
                (Number(request.start) || 0) + (Number(request.length) || 25),
              ),
            };
            initialPage = null;
          } else {
            const order = request.order?.[0];
            const columnIndex = order ? Number(order.column) : -1;
            const firstFieldColumn =
              (collectionEnabled ? 1 : 0) + (adminEnabled ? 1 : 0);
            const field =
              columnIndex >= firstFieldColumn
                ? fields[columnIndex - firstFieldColumn]
                : null;
            const serverSort = field ? sortCode(field.field) : null;
            const search = String(request.search?.value || "").trim();
            const result = await this._requestPageOnce({
              offset: Number(request.start) || 0,
              limit: Number(request.length) || 25,
              // Omit sort when DataTables has no applicable ordering so the
              // base query's stored top-level sort remains effective.
              sort: serverSort
                ? `${order.dir === "desc" ? "-" : ""}${serverSort}`
                : undefined,
              filter: search ? { f: search } : null,
            });
            page = {
              records: projectRecords(result?.records || [], fields),
              total: result?.recordsTotal || 0,
              filtered: result?.recordsFiltered || 0,
            };
          }
          callback({
            draw: request.draw,
            data: page.records,
            recordsTotal: page.total,
            recordsFiltered: page.filtered ?? page.total,
          });
          this._applySelectionClasses();
          this._applyCollectionClasses();
        } catch (error) {
          callback({
            draw: request.draw,
            data: [],
            recordsTotal: 0,
            recordsFiltered: 0,
          });
          // Rapid filtering, sorting or paging intentionally supersedes the
          // previous fetch. DataTables discards this older draw by draw number.
          if (
            error?.name !== "AbortError" &&
            error !== "Superseded data request" &&
            error?.message !== "Superseded data request"
          ) {
            this.container.dispatchEvent(
              new CustomEvent("heurist-data-table-error", {
                detail: { error },
              }),
            );
          }
        }
      },
      deferRender: true,
      autoWidth: false,
      order: [],
      searchDelay: Number(this.options.searchDelay) || 400,
      scrollY: "100%",
      scrollCollapse: true,
      language: dataTablesLanguage(this.options.emptyResultMessage),
    });
    this.pagination = pagination;
    this._placeToolbar();
    this._updateSelectionButton();
  }

  /**
   * Native DataTables layout. The custom toolbar and the fixed ControlPanel are
   * rendered outside the DataTables container, so the top row stays empty.
   */
  _layoutOptions() {
    const controls = this.options.controls || {};
    const buttons =
      controls.export !== false && this.exportButtons?.length
        ? { buttons: this.exportButtons }
        : null;
    return {
      topStart: null,
      topEnd: null,
      bottomStart: controls.pageSize === false ? null : "pageLength",
      bottom2Start: buttons,
      bottom2End: controls.counter === false ? null : "info",
      bottomEnd: "paging",
    };
  }

  /**
   * Apply the current record selection to the rendered rows.
   *
   * @param {Array<number>} recordIds Selected record IDs.
   * @returns {Promise<void>}
   */
  async setSelection(recordIds) {
    this.selected = new Set(recordIds.map(Number));
    this._applySelectionClasses();
  }

  /**
   * Apply the current persistent-collection membership to the rendered rows.
   *
   * @param {Array<number>} recordIds Collected record IDs.
   * @returns {Promise<void>}
   */
  async setCollection(recordIds) {
    this.collected = new Set(recordIds.map(Number));
    this._applyCollectionClasses();
  }

  /** Coalesce duplicate DataTables draws while an identical request is active. */
  _requestPageOnce(request) {
    const key = JSON.stringify(request);
    if (key === this.pendingRequestKey && this.pendingRequest) {
      return this.pendingRequest;
    }
    this.pendingRequestKey = key;
    const pending = Promise.resolve(this.onDataRequest?.(request));
    this.pendingRequest = pending.finally(() => {
      if (this.pendingRequestKey === key) {
        this.pendingRequestKey = null;
        this.pendingRequest = null;
      }
    });
    return this.pendingRequest;
  }

  /** Route a click on the table body to collection toggling, record editing/viewing, or row selection. */
  _handleClick(event) {
    const collection = event.target.closest(".heurist-data-collection");
    if (collection) {
      const id = Number(collection.dataset.recordId);
      const checked = collection.checked;
      Promise.resolve(this.onCollectionToggle?.(id, checked)).catch(() => {
        collection.checked = !checked;
      });
      return;
    }
    const edit = event.target.closest(".heurist-data-record");
    if (edit) {
      this.onEditRecord?.(Number(edit.dataset.recordId));
      return;
    }
    const action = event.target.closest(".heurist-data-row-action");
    if (action) {
      const id = Number(action.dataset.recordId);
      action.blur();
      action.dataset.action === "edit"
        ? this.onEditRecord?.(id)
        : this.onViewRecord?.(id);
      return;
    }
    const row = event.target.closest("tr");
    if (this.options.interaction?.selectionEnabled === false) return;
    if (!row || !this.instance) return;
    const record = this.instance.row(row).data();
    const id = Number(record?.rec_ID);
    if (!Number.isInteger(id) || id < 1) return;
    if (event.ctrlKey || event.metaKey) {
      this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
    } else {
      this.selected = new Set([id]);
    }
    this._applySelectionClasses();
    this.onSelectionChange?.([...this.selected]);
  }

  /** Sync the selection toolbar button and each visible row's selected-row class. */
  _applySelectionClasses() {
    this._updateSelectionButton();
    if (!this.instance) return;
    const selected = this.selected;
    this.instance.rows().every(function () {
      const node = this.node();
      node?.classList.toggle(
        "heurist-data-selected",
        selected.has(Number(this.data()?.rec_ID)),
      );
    });
  }

  /** Sync each visible row's collection checkbox with `this.collected`. */
  _applyCollectionClasses() {
    if (!this.instance) return;
    const collected = this.collected;
    this.instance.rows().every(function () {
      const id = Number(this.data()?.rec_ID);
      const checkbox = this.node()?.querySelector(".heurist-data-collection");
      if (checkbox) checkbox.checked = collected.has(id);
    });
  }

  /**
   * Re-adjust DataTables column widths after a container size change.
   *
   * @returns {Promise<void>}
   */
  async resize() {
    this.instance?.columns.adjust();
  }

  /**
   * Apply updated engine options: toolbar visibility, font size, and (if data is loaded) a re-render.
   *
   * @param {object} [options] Updated engine options, merged into `this.options`.
   * @returns {Promise<void>}
   */
  async applyConfiguration(options = {}) {
    this.options = { ...this.options, ...options };
    this._syncToolbarVisibility();
    if (this.container)
      this.container.style.setProperty(
        "--heurist-data-font-size",
        `${Number(this.options.fontSize) || 14}px`,
      );
    if (this.querySource)
      await this.setData({
        querySource: this.querySource,
        records: this.records || [],
        meta: this.meta || {},
        pagination: this.pagination || {},
      });
  }

  /**
   * Destroy the DataTables instance and remove the toolbar and event listeners.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    this.instance?.destroy();
    this.instance = null;
    this.pendingRequestKey = null;
    this.pendingRequest = null;
    this.tableElement?.removeEventListener("click", this.clickHandler);
    this.toolbarElement?.remove();
    this.toolbarElement = null;
    this.selectionButton = null;
    this.searchInput = null;
    this.searchLabel = null;
    this.selectionActionsEl = null;
    this.sourceActions = null;
    this.workspaceButton = null;
    this.container?.classList.remove(
      "heurist-data-has-toolbar",
      "heurist-data-table-host",
    );
    this.container?.replaceChildren();
  }
}

/** Build one toolbar icon button for a datasource action (workspace/save-filter/save-source). */
function sourceActionButton(action, icon, title) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "heurist-data-toolbar-button heurist-data-source-action";
  button.dataset.sourceAction = action;
  button.title = $HR(title);
  button.setAttribute("aria-label", button.title);
  button.innerHTML = `<i class="${icon}" aria-hidden="true"></i>`;
  return button;
}

/**
 * Project raw records into DataTables row objects, keyed by generated field columns.
 *
 * @param {Array<object>} records Raw Heurist records.
 * @param {Array<{field: string, ext?: string}>} fields Field descriptors; see `FieldValueFormatter#fieldValues`.
 * @returns {Array<object>} Row objects: `{rec_ID, _record, field_0, field_1, ...}`.
 */
export function projectRecords(records, fields) {
  return records.map((record) => {
    const row = { rec_ID: record.rec_ID, _record: record };
    fields.forEach((field, index) => {
      row[columnKey(index)] = fieldValues(record, field);
    });
    return row;
  });
}

/**
 * Format one field's values for display or export.
 *
 * @param {object} record Raw Heurist record.
 * @param {{field: string, ext?: string, type?: string}} field Field descriptor.
 * @param {'display'|'export'} [type='display'] `'display'` renders HTML per-value formatting joined by `<br>`; otherwise plain values joined by `' | '`.
 * @returns {string} Formatted cell content.
 */
export function formatCell(record, field, type = "display") {
  const normalized = fieldValues(record, field).map(String);
  return formatProjectedCell(normalized, type, field.type || null);
}

/** Join one field's already-stringified values into display HTML or plain export text. */
function formatProjectedCell(value, type = "display", dataType = null) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const plain = values.map((item) => stripHtml(String(item ?? "")));
  if (type !== "display") return plain.join(" | ");
  return values
    .map((item, index) =>
      formatDisplayValue(String(item ?? ""), plain[index], dataType),
    )
    .join("<br>");
}

/** Build the generated column key for a field at a given index (`field_0`, `field_1`, ...). */
function columnKey(index) {
  return `field_${index}`;
}

/** Map a projected column code (`rec_*` or a field id/path) to the API's sort field token, or `null` when unsortable. */
function sortCode(code) {
  if (code === "rec_ID") return "id";
  if (code === "rec_Title") return "title";
  if (code === "rec_RecTypeID") return "type";
  if (code === "rec_Added") return "added";
  if (code === "rec_Modified") return "modified";
  if (/^\d+$/.test(code)) return `f:${code}`;
  const parts = code.split(":");
  if (parts.length === 2 && parts.every((part) => /^\d+$/.test(part))) {
    return `f:${parts[1]}`;
  }
  return null;
}

/** Build DataTables' localized `language` option object, from the configured empty-result message. */
function dataTablesLanguage(emptyResultMessage) {
  const empty = String(emptyResultMessage || "No records");
  return {
    emptyTable: $HR(empty, empty),
    zeroRecords: $HR(empty, empty),
    search: $HR("Search"),
    lengthMenu: $HR("Show _MENU_ entries"),
    info: $HR("Showing _START_ to _END_ of _TOTAL_ entries"),
    infoEmpty: $HR("Showing 0 to 0 of 0 entries"),
    infoFiltered: $HR("(filtered from _MAX_ total entries)"),
    paginate: {
      first: $HR("First"),
      previous: $HR("Previous"),
      next: $HR("Next"),
      last: $HR("Last"),
    },
    processing: $HR("Processing..."),
  };
}

/** Resolve a field's display name from the response metadata's field details, falling back to its code. */
function fieldTitle(code, meta) {
  const raw = meta?.fields?.details || meta?.details || [];
  const details = Array.isArray(raw) ? raw : Object.values(raw);
  const found = details.find(
    (item) => item.dty_PathCode === code || String(item.dty_ID) === code,
  );
  return found?.dty_Name || code;
}

/** Escape HTML-significant characters in a string via the DOM, for safe interpolation into markup. */
function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}

/** Render the admin-only owner/visibility/bookmark/record-type-icon column HTML for one record. */
function renderAdminInfo(record, options) {
  const visibility = String(record?.rec_NonOwnerVisibility || "").toLowerCase();
  const visibilityInfo = {
    hidden: { icon: "fa-eye-slash", hint: "hidden_hint", color: "#c62828" },
    visible: { icon: "fa-eye", hint: "visible_hint", color: "#e07b00" },
    pending: { icon: "fa-eye", hint: "pending_hint", color: "#2e8b57" },
    public: { icon: "fa-eye", hint: "public_hint", color: "#777" },
  }[visibility] || { icon: "fa-eye", hint: "public_hint", color: "#777" };
  const visibilityHint = $HR(visibilityInfo.hint);
  const baseUrl = String(
    options?.baseUrl ||
      globalThis.heuristModuleBootstrap?.runtime?.baseUrl ||
      "",
  );
  const heuristRoot =
    baseUrl && !baseUrl.endsWith("/") ? `${baseUrl}/` : baseUrl;
  const database = String(
    options?.database ||
      globalThis.heuristModuleBootstrap?.runtime?.database ||
      "",
  );
  const typeId = Number(record?.rec_RecTypeID);
  const typeIcon =
    typeId > 0 && heuristRoot
      ? `${heuristRoot}?db=${encodeURIComponent(database)}&icon=${typeId}&t=${RECORD_TYPE_ICON_TOKEN}&version=thumb`
      : "";
  const bookmarked = Number(record?.rec_Bookmarked) !== 0;
  return (
    '<span class="heurist-data-admin">' +
    `<span class="heurist-data-owner" title="${escapeHtml(record?.rec_OwnerName || "")}">${escapeHtml(record?.rec_OwnerName || "")}</span>` +
    `<span class="heurist-data-visibility" title="${escapeHtml(visibilityHint)}"><i class="fa-regular ${visibilityInfo.icon}" style="color:${visibilityInfo.color}" aria-label="${escapeHtml(visibilityHint)}"></i></span>` +
    `<i class="fa-regular fa-bookmark heurist-data-bookmark${bookmarked ? "" : " is-placeholder"}" title="Bookmarked" aria-label="Bookmarked"></i>` +
    (typeIcon
      ? `<img class="heurist-data-rectype-icon" src="${escapeHtml(typeIcon)}" width="18" height="18" alt="">`
      : '<span class="heurist-data-rectype-icon"></span>') +
    "</span>"
  );
}

/** Resolve a field's `dty_Type` from the response metadata's field details, or `null` when unknown. */
function fieldType(code, meta) {
  const raw = meta?.fields?.details || meta?.details || [];
  const details = Array.isArray(raw) ? raw : Object.values(raw);
  return (
    details.find(
      (item) => item.dty_PathCode === code || String(item.dty_ID) === code,
    )?.dty_Type || null
  );
}

/** Format one value's display HTML per its data type (blocktext/JSON/geo get special treatment; others are sanitized HTML). */
function formatDisplayValue(value, plain, dataType) {
  const type = String(dataType || "").toLowerCase();
  if (type === "blocktext") {
    const shortened = truncate(plain, 240);
    return `<span class="heurist-data-memo" title="${escapeHtml(plain)}">${escapeHtml(shortened)}</span>`;
  }
  if (type === "json" || looksLikeJson(plain)) {
    return `<span class="heurist-data-structured" title="${escapeHtml(plain)}">${escapeHtml(compactJson(plain))}</span>`;
  }
  if (type === "geo") {
    return `<span class="heurist-data-structured" title="${escapeHtml(plain)}">${escapeHtml(truncate(plain, 90))}</span>`;
  }
  return sanitizeTextHtml(value);
}

/** Whether a string looks like JSON (starts with `{`/`[` and parses successfully). */
function looksLikeJson(value) {
  const text = String(value || "").trim();
  if (!(text.startsWith("{") || text.startsWith("["))) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Re-serialize a JSON string compactly and truncate it for display. */
function compactJson(value) {
  try {
    return truncate(JSON.stringify(JSON.parse(value)), 90);
  } catch {
    return truncate(value, 90);
  }
}

/** Truncate text to `length` characters, appending an ellipsis when shortened. */
function truncate(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/** Render the per-row edit/view action-button HTML for a record id. */
function renderRowActions(value, interaction) {
  const id = Number(value);
  return (
    '<span class="heurist-data-row-actions">' +
    (interaction.editEnabled === true
      ? `<button class="heurist-data-row-action" data-action="edit" data-record-id="${id}" title="Edit"><i class="fa-solid fa-pen"></i></button>`
      : "") +
    (interaction.popupEnabled === true
      ? `<button class="heurist-data-row-action" data-action="view" data-record-id="${id}" title="View"><i class="fa-solid fa-circle-info"></i></button>`
      : "") +
    "</span>"
  );
}
