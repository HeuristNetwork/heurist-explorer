/**
 * @file HRecordList.js
 * @brief Framework-independent reusable Heurist record-list widget.
 *
 * Search ownership and server pagination remain in DataApplication. This class
 * only renders pages and reports interaction through adapter callbacks.
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

import { HBaseWidget } from '#shared/widgets';
import { $HR } from '#shared/ui';
import template from "./HRecordList.html?raw";
import "./HRecordList.css";

const PAGE_SIZES = [50, 100, 500, 1000, 5000];
const VIEW_MODES = ["list", "card", "row", "big"];
const RECORD_TYPE_ICON_TOKEN = Date.now();

/** Renders records using native DOM/CSS without a UI framework. */
export class HRecordList extends HBaseWidget {
  /**
   * Attach to a container, build the widget shell, and wire up interaction callbacks.
   *
   * @param {object} context Widget context; see `DataApplication#_engineContext`.
   * @param {HTMLElement} context.container Element to render the record list into.
   * @param {object} [context.options] Engine options (columns, controls, interaction flags, view mode, …).
   * @param {Function} context.onSelectionChange Called with selected record IDs.
   * @param {Function} context.onEditRecord Called with a record ID to edit.
   * @param {Function} context.onCollectionToggle Called with `(recordId, collected)` to toggle persistent collection membership.
   * @param {Function} context.onCollectionAction Called with `(action, recordIds)` for bulk collection actions.
   * @param {Function} context.onDataRequest Called with `{offset, limit, sort, filter}` to request a page of data.
   * @param {Function} context.onRecordContentRequest Called to lazily load a record's presentation HTML.
   * @param {Function} context.onViewRecord Called with a record ID to view.
   * @param {Function} context.onExport Called with an export format to export the current results.
   * @param {Function} context.onViewModeChange Called with the new view mode.
   * @param {Function} context.onDataSourceAction Called with a datasource action id (workspace/save-filter/save-source).
   * @returns {Promise<void>}
   */
  async initialize({
    container,
    options = {},
    onSelectionChange,
    onEditRecord,
    onCollectionToggle,
    onCollectionAction,
    onDataRequest,
    onRecordContentRequest,
    onViewRecord,
    onExport,
    onViewModeChange,
    onDataSourceAction,
  }) {
    this.attach(container, normalizeOptions(options));
    Object.assign(this, {
      onSelectionChange,
      onEditRecord,
      onCollectionToggle,
      onCollectionAction,
      onDataRequest,
      onRecordContentRequest,
      onViewRecord,
      onExport,
      onViewModeChange,
      onDataSourceAction,
    });
    this.selected = new Set();
    this.collected = new Set();
    this.records = [];
    this.total = 0;
    this.filteredTotal = 0;
    this.offset = Math.max(0, Number(this.options.initialOffset) || 0);
    this.filter = "";
    this.showSelectionOnly = false;
    this.lastSelectedIndex = -1;
    this.container.classList.add("h-recordlist-host", "h-widget");
    this.container.style.setProperty(
      "--h-recordlist-font-size",
      `${this.options.fontSize}px`,
    );
    this.container.innerHTML = template;
    this.content = this.$('[data-role="content"]');
    this._initializeControls();
    this._createObserver();
    this.state = "rendered";
  }

  /** Localize static labels and wire up toolbar/list interaction listeners. */
  _initializeControls() {
    this.$$("[data-label]").forEach((el) => {
      el.textContent = $HR(el.dataset.label);
    });
    const search = this.$('[data-role="search"]');
    search.placeholder = $HR("Search");
    search.setAttribute("aria-label", $HR("Search"));
    this.$('[data-role="page-size-label"]').textContent = $HR("Show");
    this.$('[data-role="view-label"]').textContent = $HR("View");
    this.$$('[data-role="view-mode"] option').forEach((el) => {
      el.textContent = $HR(el.dataset.label);
    });
    this.pageSizeSelect = this.$('[data-role="page-size"]');
    this.viewModeSelect = this.$('[data-role="view-mode"]');
    this.pageSizeSelect.value = String(this.options.pageLength);
    this.viewModeSelect.value = this.options.viewMode;
    this._applyControlVisibility();
    this._createDataSourceActions();
    this._updateSelectionButton();
    let searchTimer;
    this.listen(search, "input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(
        () => {
          this.filter = search.value.trim();
          this.offset = 0;
          void this._requestPage();
        },
        Number(this.options.searchDelay) || 400,
      );
    });
    this.listen(this.pageSizeSelect, "change", () => {
      this.options.pageLength = Number(this.pageSizeSelect.value);
      this.offset = 0;
      void this._requestPage();
    });
    this.listen(this.viewModeSelect, "change", () => {
      const mode = this.viewModeSelect.value;
      if (mode === "datatable") {
        // The Table choice belongs to the DataTables engine. Keep the current
        // RecordList mode visible until DataApplication replaces this engine.
        this.viewModeSelect.value = this.options.viewMode;
        void this.onViewModeChange?.("datatable");
        return;
      }
      this.options.viewMode = normalizeViewMode(mode);
      this._render();
      void this.onViewModeChange?.(this.options.viewMode);
    });
    this.delegate(this.container, "click", "[data-page]", (event, target) => {
      event.preventDefault();
      const page = Number(target.dataset.page);
      if (Number.isInteger(page)) {
        this.offset = page * this.options.pageLength;
        void this._requestPage();
      }
    });
    this.delegate(
      this.container,
      "click",
      "[data-selection-action]",
      (event, target) => {
        event.preventDefault();
        this._closeDropdown(target);
        this._selectionAction(target.dataset.selectionAction);
      },
    );
    this.delegate(
      this.container,
      "click",
      "[data-collection-action-name]",
      (event, target) => {
        event.preventDefault();
        this._closeDropdown(target);
        void this._collectionAction(target.dataset.collectionActionName);
      },
    );
    this.delegate(this.container, "click", "[data-export]", (event, target) => {
      event.preventDefault();
      this._closeDropdown(target);
      void this._export(target.dataset.export);
    });
    this.delegate(
      this.content,
      "click",
      "[data-record-action]",
      (event, target) => {
        event.stopPropagation();
        this._recordAction(target);
      },
    );
    this.delegate(
      this.content,
      "change",
      ".h-recordlist-collection",
      (event, target) => this._collectionChanged(target),
    );
    this.delegate(
      this.content,
      "click",
      ".h-recordlist-item",
      (event, target) => this._recordClicked(event, target),
    );
  }

  /** Close the `<details>` dropdown containing `target`, if any. */
  _closeDropdown(target) {
    target?.closest("details.h-dropdown")?.removeAttribute("open");
  }

  /** Build the workspace/save-filter/save-source toolbar buttons. */
  _createDataSourceActions() {
    const host = document.createElement("span");
    host.className = "h-recordlist-source-actions";
    const definitions = [
      ["workspace", "fa-regular fa-object-group", "Add to workspace"],
      ["save-filter", "fa-regular fa-floppy-disk", "Save as Filter"],
      ["save-source", "fa-solid fa-database", "Save as Source"],
    ];
    for (const [action, icon, title] of definitions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "h-recordlist-source-action";
      button.dataset.sourceAction = action;
      button.title = $HR(title);
      button.setAttribute("aria-label", button.title);
      button.innerHTML = `<i class="${icon}" aria-hidden="true"></i>`;
      host.append(button);
    }
    host.hidden = this.options.sourceActionsEnabled !== true;
    this.sourceActionsHost = host;
    this._syncSourceSaveButtons();
    const selection = this.$('[data-control="selectionActions"]');
    selection?.after(host);
    this.listen(host, "click", (event) => {
      const button = event.target.closest("[data-source-action]");
      if (!button) return;
      Promise.resolve(this.onDataSourceAction?.(button.dataset.sourceAction))
        .catch(() => {});
    });
    this.sourceActions = host;
    this.workspaceButton = host.querySelector('[data-source-action="workspace"]');
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

  /**
   * Render a new page of data.
   *
   * @param {{querySource: object|null, records?: Array<object>, meta?: object, pagination?: object}} data Data to render.
   * @returns {Promise<void>}
   */
  async setData({ querySource, records = [], meta = {}, pagination = {} }) {
    this.querySource = querySource;
    this.records = records;
    this.meta = meta;
    this.offset = Number(pagination.offset) || 0;
    this.total = Number(pagination.total) || records.length;
    this.filteredTotal = this.total;
    this._render();
  }

  /**
   * Show or hide the loading indicator for an externally-triggered load
   * (e.g. the host applying a new DataSource), sharing the same indicator
   * `_requestPage()` toggles for its own internal page/filter requests.
   *
   * @param {boolean} loading Whether a load is in progress.
   * @returns {void}
   */
  setLoading(loading) {
    this._setLoading(Boolean(loading));
  }

  /** Increment/decrement the shared loading count and toggle the indicator at the 0<->1+ edge. */
  _setLoading(loading) {
    this._loadingCount = Math.max(0, (this._loadingCount || 0) + (loading ? 1 : -1));
    this.container.classList.toggle("h-recordlist-loading", this._loadingCount > 0);
  }

  /** Request the current offset/page-length/filter page of data and re-render, tolerating supersession/abort. */
  async _requestPage() {
    if (!this.onDataRequest) return;
    this._setLoading(true);
    try {
      const result = await this.onDataRequest({
        offset: this.offset,
        limit: this.options.pageLength,
        filter: this.filter ? { f: this.filter } : null,
      });
      this.records = result?.records || [];
      this.meta = result?.meta || this.meta;
      this.total = Number(result?.recordsTotal) || 0;
      this.filteredTotal = Number(result?.recordsFiltered) || 0;
      this._render();
    } catch (error) {
      if (
        error?.name !== "AbortError" &&
        error?.message !== "Superseded data request"
      ) {
        this.container.dispatchEvent(
          new CustomEvent("heurist-data-recordlist-error", {
            detail: { error },
          }),
        );
      }
    } finally {
      this._setLoading(false);
    }
  }

  /** Re-render the visible record list, pagination, counter, and selection classes. */
  _render() {
    if (!this.content) return;
    this.observer?.disconnect();
    this.contentAbort?.abort();
    this.contentAbort = new AbortController();
    this.renderGeneration = (this.renderGeneration || 0) + 1;
    this.content.replaceChildren();
    this.content.dataset.viewMode = this.options.viewMode;
    const visible = this.showSelectionOnly
      ? this.records.filter((record) => this.selected.has(recordId(record)))
      : this.records;
    if (!visible.length) {
      const message = document.createElement("div");
      message.className = "h-recordlist-message";
      message.textContent = $HR(
        this.options.emptyResultMessage || "No records",
      );
      this.content.append(message);
    } else {
      visible.forEach((record, index) =>
        this.content.append(this._renderRecord(record, index)),
      );
    }
    this._renderPagination();
    this._updateCounter();
    this._applySelection();
  }

  /** Build one record's list item, choosing markup by the active view mode (list/card/row/big). */
  _renderRecord(record, index) {
    const id = recordId(record);
    const item = document.createElement("article");
    item.className = `h-recordlist-item h-recordlist-${this.options.viewMode}`;
    item.dataset.recordId = String(id);
    item.dataset.recordIndex = String(index);
    item.tabIndex = 0;
    if (this.options.viewMode === "list") {
      item.innerHTML = this._tableHtml(record);
    } else if (
      this.options.viewMode === "card" ||
      this.options.viewMode === "row"
    ) {
      const templateName = this._templateForMode();
      if (templateName) {
        item.innerHTML = this._templateShellHtml(record);
        item._record = record;
        item.classList.add("h-recordlist-template-item");
        this.observer?.observe(item);
      } else {
        item.innerHTML =
          this.options.viewMode === "card"
            ? this._cardHtml(record)
            : this._rowHtml(record);
      }
    } else if (this.options.viewMode === "big" && this.onRecordContentRequest) {
      item.classList.add("h-recordlist-template-item");
      item.innerHTML = this._templateShellHtml(record);
      item._record = record;
      this.observer?.observe(item);
    } else {
      item.innerHTML = this._fallbackExtendedHtml(record);
    }
    return item;
  }

  /** Build "list" view-mode markup: collection/type/admin markers, title, and row actions. */
  _tableHtml(record) {
    return (
      `${this._collectionHtml(record)}${this._typeIconHtml(record)}${this._adminHtml(record)}` +
      `<span class="h-recordlist-title">${sanitizeTextHtml(record.rec_Title)}</span>` +
      this._actionsHtml(record)
    );
  }

  /** Build "card" view-mode markup: thumbnail, title, and actions. */
  _cardHtml(record) {
    const ownThumbnail = String(record.rec_ThumbnailURL || "");
    const thumbnail =
      ownThumbnail ||
      record.rec_RecTypeIconURL ||
      this._recordTypeThumbnail(record);
    const fallbackClass = ownThumbnail
      ? ""
      : " h-recordlist-thumbnail-fallback";
    const content = `${thumbnail ? `<img class="h-recordlist-thumbnail${fallbackClass}" loading="lazy" src="${escapeAttr(thumbnail)}" alt="">` : "<div></div>"}<div class="h-recordlist-title">${sanitizeTextHtml(record.rec_Title)}</div>`;
    return `<div class="h-recordlist-card-top">${this._collectionHtml(record)}${this._typeIconHtml(record)}${this._adminHtml(record)}</div>${content}${this._actionsHtml(record)}`;
  }

  /** Build "row" view-mode markup: thumbnail, title, and actions in a horizontal layout. */
  _rowHtml(record) {
    const ownThumbnail = String(record.rec_ThumbnailURL || "");
    const thumbnail =
      ownThumbnail ||
      record.rec_RecTypeIconURL ||
      this._recordTypeThumbnail(record);
    const fallbackClass = ownThumbnail
      ? ""
      : " h-recordlist-thumbnail-fallback";
    const image = thumbnail
      ? `<img class="h-recordlist-thumbnail${fallbackClass}" loading="lazy" src="${escapeAttr(thumbnail)}" alt="">`
      : "";
    return (
      `<div class="h-recordlist-card-top">${this._collectionHtml(record)}${this._typeIconHtml(record)}${this._adminHtml(record)}</div>` +
      image +
      `<div class="h-recordlist-title">${sanitizeTextHtml(record.rec_Title)}</div>` +
      this._actionsHtml(record)
    );
  }

  /** Build placeholder markup shown while a record's template content loads lazily. */
  _templateShellHtml(record) {
    const loader =
      '<div class="h-recordlist-template-content h-recordlist-placeholder">' +
      '<span class="h-spinner" aria-hidden="true"></span></div>';
    return `<div class="h-recordlist-card-top">${this._collectionHtml(record)}${this._typeIconHtml(record)}${this._adminHtml(record)}</div>${loader}${this._actionsHtml(record)}`;
  }

  /** Report-template name configured for the active view mode, or `null` when using the built-in renderer. */
  _templateForMode() {
    if (this.options.viewMode === "card" || this.options.viewMode === "row") {
      return nullableTemplate(this.options.cardTemplate);
    }
    if (this.options.viewMode === "big")
      return nullableTemplate(this.options.viewTemplate);
    return null;
  }
  /** Build the record-type icon URL used as a card/row thumbnail fallback. */
  _recordTypeThumbnail(record) {
    const typeId = Number(record?.rec_RecTypeID);
    const baseUrl = String(this.options.baseUrl || "");
    if (!(typeId > 0) || !baseUrl) return "";
    const heuristRoot = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return `${heuristRoot}?db=${encodeURIComponent(this.options.database || "")}&icon=${typeId}&t=${RECORD_TYPE_ICON_TOKEN}&version=thumb`;
  }
  /** Build fallback "big" view-mode markup used when no report template or content is available. */
  _fallbackExtendedHtml(record) {
    return (
      `<strong class="h-recordlist-title">${sanitizeTextHtml(record.rec_Title)}</strong>` +
      this._typeIconHtml(record) +
      this._adminHtml(record) +
      this._actionsHtml(record)
    );
  }
  /** Build the persistent-collection checkbox markup, when that interaction is enabled. */
  _collectionHtml(record) {
    if (!this.options.interaction.persistentSelectionEnabled) return "";
    return (
      `<input type="checkbox" class="h-checkbox h-recordlist-collection"` +
      ` data-record-id="${recordId(record)}" aria-label="${escapeAttr($HR("In collection"))}">`
    );
  }

  /** Build the record-type icon markup shown on each list item. */
  _typeIconHtml(record) {
    const baseUrl = String(this.options.baseUrl || "");
    const heuristRoot =
      baseUrl && !baseUrl.endsWith("/") ? `${baseUrl}/` : baseUrl;
    const database = String(this.options.database || "");
    const typeId = Number(record?.rec_RecTypeID);
    const typeIcon =
      typeId > 0 && heuristRoot
        ? `${heuristRoot}?db=${encodeURIComponent(database)}&icon=${typeId}&t=${RECORD_TYPE_ICON_TOKEN}&version=thumb`
        : "";
    return typeIcon
      ? `<img class="h-recordlist-rectype-icon" src="${escapeAttr(typeIcon)}" width="18" height="18" alt="">`
      : '<span class="h-recordlist-rectype-icon"></span>';
  }

  /** Build the owner/visibility/bookmark admin-info markup, when that interaction is enabled. */
  _adminHtml(record) {
    if (!this.options.interaction.adminInfoEnabled) return "";
    const visibility = String(
      record?.rec_NonOwnerVisibility || "",
    ).toLowerCase();
    const visibilityInfo = {
      hidden: { icon: "fa-eye-slash", hint: "hidden_hint", color: "#c62828" },
      visible: { icon: "fa-eye", hint: "visible_hint", color: "#e07b00" },
      pending: { icon: "fa-eye", hint: "pending_hint", color: "#2e8b57" },
      public: { icon: "fa-eye", hint: "public_hint", color: "#777" },
    }[visibility] || { icon: "fa-eye", hint: "public_hint", color: "#777" };
    const visibilityHint = $HR(visibilityInfo.hint);
    const bookmarked = Number(record?.rec_Bookmarked) !== 0;
    return (
      '<span class="h-recordlist-admin">' +
      `<span class="h-recordlist-owner" title="${escapeAttr(record?.rec_OwnerName || "")}">${escapeHtml(record?.rec_OwnerName || "")}</span>` +
      `<span class="h-recordlist-visibility" title="${escapeAttr(visibilityHint)}"><i class="fa-solid ${visibilityInfo.icon}" style="color:${visibilityInfo.color}" aria-label="${escapeAttr(visibilityHint)}"></i></span>` +
      `<i class="fa-solid fa-bookmark h-recordlist-bookmark${bookmarked ? "" : " is-placeholder"}" title="Bookmarked" aria-label="Bookmarked"></i>` +
      "</span>"
    );
  }
  /** Build the edit/view row-action buttons markup, per enabled interactions. */
  _actionsHtml(record) {
    const id = recordId(record);
    const edit =
      this.options.interaction.editEnabled === false
        ? ""
        : `<button class="h-recordlist-icon-button" data-record-action="edit" data-record-id="${id}" title="${escapeAttr($HR("Edit"))}"><i class="fa-solid fa-pen"></i></button>`;
    const view =
      this.options.interaction.popupEnabled === false
        ? ""
        : `<button class="h-recordlist-icon-button" data-record-action="view" data-record-id="${id}" title="${escapeAttr($HR("View"))}"><i class="fa-solid fa-circle-info"></i></button>`;
    return `<span class="h-recordlist-actions">${edit}${view}</span>`;
  }

  /** Create the IntersectionObserver that lazily loads template content for scrolled-into-view items. */
  _createObserver() {
    if (typeof IntersectionObserver === "undefined") return;
    this.observer = new IntersectionObserver(
      (entries) => {
        const items = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target);
        items.forEach((item) => this.observer.unobserve(item));
        if (items.length) void this._loadVisibleContent(items);
      },
      { root: this.content, rootMargin: "300px 0px", threshold: 0 },
    );
  }

  /** Load and inject template presentation HTML for newly visible record items. */
  async _loadVisibleContent(items) {
    const records = items.map((item) => item._record).filter(Boolean);
    const generation = this.renderGeneration;
    const signal = this.contentAbort?.signal;
    try {
      const result = await this.onRecordContentRequest?.({
        records,
        viewMode: this.options.viewMode,
        template: this._templateForMode(),
        signal,
      });
      if (signal?.aborted || generation !== this.renderGeneration) return;
      const content =
        result instanceof Map ? result : new Map(Object.entries(result || {}));
      items.forEach((item) => {
        const id = recordId(item._record);
        const html = content.get(id) ?? content.get(String(id));
        const target = item.querySelector(".h-recordlist-template-content");
        const replacement =
          html == null
            ? this._fallbackExtendedHtml(item._record)
            : String(html);
        if (target) {
          target.classList.remove("h-recordlist-placeholder");
          target.innerHTML = replacement;
        } else {
          item.classList.remove("h-recordlist-placeholder");
          item.innerHTML = replacement;
        }
      });
      this._applyCollection();
      this._applySelection();
    } catch {
      if (signal?.aborted || generation !== this.renderGeneration) return;
      items.forEach((item) => {
        const target = item.querySelector(".h-recordlist-template-content");
        if (target) {
          target.classList.remove("h-recordlist-placeholder");
          target.innerHTML = this._fallbackExtendedHtml(item._record);
        } else {
          item.classList.remove("h-recordlist-placeholder");
          item.innerHTML = this._fallbackExtendedHtml(item._record);
        }
      });
    }
  }

  /** Apply click/ctrl-click/shift-click selection semantics to a clicked record item. */
  _recordClicked(event, item) {
    if (
      this.options.interaction.selectionEnabled === false ||
      event.target.closest("button,input,a")
    )
      return;
    const id = Number(item.dataset.recordId);
    const index = Number(item.dataset.recordIndex);
    if (event.shiftKey && this.lastSelectedIndex >= 0) {
      const [from, to] = [this.lastSelectedIndex, index].sort((a, b) => a - b);
      this.records
        .slice(from, to + 1)
        .forEach((record) => this.selected.add(recordId(record)));
    } else if (event.ctrlKey || event.metaKey) {
      this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
    } else {
      this.selected = new Set([id]);
    }
    this.lastSelectedIndex = index;
    this._applySelection();
    this.onSelectionChange?.([...this.selected]);
  }

  /** Dispatch a row-action button click (edit or view) for its record. */
  _recordAction(target) {
    const id = Number(target.dataset.recordId);
    target.dataset.recordAction === "edit"
      ? this.onEditRecord?.(id)
      : this.onViewRecord?.(id);
  }

  /** Toggle persistent collection membership for the record whose checkbox changed. */
  _collectionChanged(target) {
    const id = Number(target.dataset.recordId);
    const checked = target.checked;
    Promise.resolve(this.onCollectionToggle?.(id, checked)).catch(() => {
      target.checked = !checked;
    });
  }

  /** Apply a toolbar selection shortcut ('page' selects the loaded page, 'none' clears, 'show' filters to selection). */
  _selectionAction(action) {
    if (action === "page") {
      this.records.forEach((record) => this.selected.add(recordId(record)));
    } else if (action === "none") {
      this.selected.clear();
    } else if (action === "show") {
      this.showSelectionOnly = !this.showSelectionOnly;
    }
    this._render();
    this.onSelectionChange?.([...this.selected]);
  }

  /** Dispatch a toolbar persistent-collection shortcut to the host-level collection action handler. */
  async _collectionAction(action) {
    const selected = [...this.selected];
    const page = this.records.map(recordId);
    if (action === "add-selected")
      await this.onCollectionAction?.("add", selected);
    else if (action === "add-page")
      await this.onCollectionAction?.("add", page);
    else if (action === "remove-selected")
      await this.onCollectionAction?.("remove", selected);
    else if (action === "clear") await this.onCollectionAction?.("clear", []);
    else if (action === "show") await this.onCollectionAction?.("show", []);
  }
  /**
   * Apply the current record selection to the rendered items and scroll the first into view.
   *
   * @param {Array<number>} ids Selected record IDs.
   * @returns {Promise<void>}
   */
  async setSelection(ids) {
    this.selected = new Set((ids || []).map(Number));
    this._applySelection();
    this._scrollSelectedIntoView();
  }

  /** Scroll the first selected record's item into view, if rendered. */
  _scrollSelectedIntoView() {
    const [firstId] = this.selected;
    if (firstId == null) return;
    const item = this.$(`.h-recordlist-item[data-record-id="${firstId}"]`);
    item?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  /**
   * Apply the current persistent-collection membership to the rendered items.
   *
   * @param {Array<number>} ids Collected record IDs.
   * @returns {Promise<void>}
   */
  async setCollection(ids) {
    this.collected = new Set((ids || []).map(Number));
    this._applyCollection();
  }

  /** Sync the selection toolbar button and each rendered item's selected-item class. */
  _applySelection() {
    this.$$(".h-recordlist-item").forEach((item) => {
      item.classList.toggle(
        "h-recordlist-selected",
        this.selected.has(Number(item.dataset.recordId)),
      );
    });
    this._updateSelectionButton();
  }

  /** Sync each rendered item's collection checkbox with `this.collected`. */
  _applyCollection() {
    this.$$(".h-recordlist-collection").forEach((input) => {
      input.checked = this.collected.has(Number(input.dataset.recordId));
    });
  }

  /** Refresh the selection-count toolbar button's label. */
  _updateSelectionButton() {
    const button = this.$('[data-role="selection-button"]');
    if (button)
      button.textContent = `${$HR("Selected")}: ${this.selected?.size || 0}`;
  }

  /** Rebuild the pagination control from the current offset, page length, and filtered total. */
  _renderPagination() {
    const host = this.$('[data-role="pagination"]');
    if (!host) return;
    host.replaceChildren();
    const pages = Math.max(
      1,
      Math.ceil(this.filteredTotal / this.options.pageLength),
    );
    const current = Math.min(
      pages - 1,
      Math.floor(this.offset / this.options.pageLength),
    );
    pageEntries(current, pages).forEach((page) => {
      const li = document.createElement("li");
      li.className = "h-page-item";
      const button = document.createElement("button");
      button.className = `h-page-button${page === current ? " is-active" : ""}`;
      button.disabled = page === null;
      button.textContent = page === null ? "…" : String(page + 1);
      if (page !== null) button.dataset.page = String(page);
      li.append(button);
      host.append(li);
    });
  }

  /** Refresh the "start–end / total" record counter, including a filtered-count suffix when filtered. */
  _updateCounter() {
    const start = this.filteredTotal ? this.offset + 1 : 0;
    const end = Math.min(this.offset + this.records.length, this.filteredTotal);
    const suffix =
      this.filteredTotal !== this.total
        ? ` (${$HR("filtered from")} ${this.total})`
        : "";
    this.$('[data-role="counter"]').textContent =
      `${start}–${end} / ${this.filteredTotal}${suffix}`;
  }

  /** Show/hide toolbar controls per the configured `controls`/`interaction` options. */
  _applyControlVisibility() {
    const controls = this.options.controls;
    const datatableOption = this.viewModeSelect?.querySelector('option[value="datatable"]');
    if (datatableOption) datatableOption.hidden = this.options.engineSwitch !== true;
    this.$$("[data-control]").forEach((el) => {
      const name = el.dataset.control;
      el.classList.toggle(
        "h-recordlist-hidden",
        Boolean(name && controls[name] === false),
      );
    });
    this.$('[data-control="selectionActions"]')?.classList.toggle(
      "h-recordlist-hidden",
      this.options.interaction.selectionEnabled === false ||
        controls.selectionActions === false,
    );
    this.$$("[data-collection-action]").forEach((el) => {
      el.hidden = this.options.interaction.persistentSelectionEnabled !== true;
    });
  }

  /**
   * Export the current results in the given format.
   *
   * @param {'copy'|'csv'|'excel'|'pdf'} format Export format.
   * @returns {Promise<void>}
   * @todo The implementation below is currently commented out, so this is a no-op until it is restored.
   */
  async _export(format) {
/*
    if (this.onExport) {
      return this.onExport({
        format,
        records: this.records,
        selection: [...this.selected],
      });
    }
    const rows = exportRows(this.records, this.querySource?.fields || []);
    if (format === "copy")
      return navigator.clipboard?.writeText(toDelimited(rows, "\t"));
    if (format === "csv")
      return downloadBlob(
        toDelimited(rows, ","),
        "heurist-records.csv",
        "text/csv;charset=utf-8",
      );
    if (format === "excel") {
      const table = `<table>${rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</table>`;
      return downloadBlob(
        table,
        "heurist-records.xls",
        "application/vnd.ms-excel;charset=utf-8",
      );
    }
    if (format === "pdf") {
      const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
        import("pdfmake/build/pdfmake.js"),
        import("pdfmake/build/vfs_fonts.js"),
      ]);
      pdfMake.addVirtualFileSystem(pdfFonts);
      pdfMake
        .createPdf({ content: [{ table: { body: rows } }] })
        .download("heurist-records.pdf");
    }
*/
  }

  /**
   * Apply updated engine options: merges into the current options, refreshes toolbar controls, and re-renders.
   *
   * @param {object} [options] Updated engine options, merged into `this.options`.
   * @returns {Promise<void>}
   */
  async applyConfiguration(options = {}) {
    this.options = normalizeOptions({
      ...this.options,
      ...options,
      controls: { ...this.options.controls, ...options.controls },
      interaction: { ...this.options.interaction, ...options.interaction },
    });
    this.container?.style.setProperty(
      "--h-recordlist-font-size",
      `${this.options.fontSize}px`,
    );
    if (this.pageSizeSelect) this.pageSizeSelect.value = String(this.options.pageLength);
    if (this.viewModeSelect) this.viewModeSelect.value = this.options.viewMode;
    this._applyControlVisibility();
    if (this.sourceActions)
      this.sourceActions.hidden = this.options.sourceActionsEnabled !== true;
    this._syncSourceSaveButtons();
    this._render();
  }

  /** Save as Filter / Save as Source only when the host can save (`sourceSaveEnabled`). */
  _syncSourceSaveButtons() {
    const hidden = this.options.sourceSaveEnabled === false;
    for (const button of this.sourceActionsHost?.querySelectorAll?.("[data-source-action]") || []) {
      if (button.dataset.sourceAction !== "workspace") button.hidden = hidden;
    }
  }

  /**
   * Return the current engine-neutral rendering state.
   *
   * @returns {{viewMode: string, pagination: {offset: number, limit: number}}} Current view mode and pagination.
   */
  getState() {
    return {
      viewMode: this.options.viewMode,
      pagination: { offset: this.offset, limit: this.options.pageLength },
    };
  }

  /**
   * No-op: HRecordList's layout reflows automatically with its container.
   *
   * @returns {Promise<void>}
   */
  async resize() {}

  /**
   * Disconnect the intersection observer, abort in-flight content loads, and tear down the widget.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    this.observer?.disconnect();
    this.contentAbort?.abort();
    this.observer = null;
    this.contentAbort = null;
    this.container?.classList.remove("h-recordlist-host", "h-widget");
    await super.destroy();
  }
}

/** Normalize widget options, filling in page-size/font-size/view-mode/controls/interaction defaults. */
function normalizeOptions(options) {
  return {
    ...options,
    pageLength: PAGE_SIZES.includes(Number(options.pageLength))
      ? Number(options.pageLength)
      : 100,
    fontSize: Number(options.fontSize) || 14,
    viewMode: normalizeViewMode(options.viewMode),
    controls: {
      pageSize: true,
      search: true,
      counter: true,
      export: true,
      pagination: true,
      viewMode: true,
      selectionActions: true,
      ...(options.controls || {}),
    },
    interaction: {
      editEnabled: true,
      selectionEnabled: true,
      persistentSelectionEnabled: false,
      popupEnabled: true,
      adminInfoEnabled: false,
      ...(options.interaction || {}),
    },
  };
}

/** Normalize a view mode to one of `VIEW_MODES`, defaulting to `'card'`. */
function normalizeViewMode(value) {
  return VIEW_MODES.includes(value) ? value : "card";
}

/** Normalize a template value, treating the legacy `'standard'` sentinel as unset. */
function nullableTemplate(value) {
  const text = String(value || "").trim();
  return text && text !== "standard" ? text : null;
}

/** Extract a record's numeric id. */
function recordId(record) {
  return Number(record?.rec_ID);
}

/**
 * Build the page-number list for pagination controls: first, last, a window around
 * the current page, and `null` gaps where pages are skipped.
 *
 * @param {number} current Current page index (0-based).
 * @param {number} count Total page count.
 * @returns {Array<number|null>} Page indices to render, with `null` marking an ellipsis gap.
 */
function pageEntries(current, count) {
  if (count <= 9) return Array.from({ length: count }, (_, i) => i);
  const values = new Set(
    [
      0,
      count - 1,
      current - 2,
      current - 1,
      current,
      current + 1,
      current + 2,
    ].filter((page) => page >= 0 && page < count),
  );
  const result = [];
  [...values]
    .sort((a, b) => a - b)
    .forEach((page, index, sorted) => {
      if (index && page - sorted[index - 1] > 1) result.push(null);
      result.push(page);
    });
  return result;
}

/** Build a header + data row matrix (ID plus visible field titles/values) for export. */
function exportRows(records, fields) {
  const visible = fields.filter((field) => field.visible !== false);
  return [
    ["ID", ...visible.map((field) => field.title || field.field)],
    ...records.map((record) => [
      record.rec_ID,
      ...visible.map((field) => displayFieldValue(record, field)),
    ]),
  ];
}

/** Serialize a row matrix to a quoted, delimited text block (CSV/TSV). */
function toDelimited(rows, delimiter) {
  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(delimiter),
    )
    .join("\r\n");
}

/** Trigger a browser download of a value (text or Blob) as a named file. */
function downloadBlob(value, filename, type) {
  const blob = value instanceof Blob ? value : new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Read and project a field's values, joined into one display string. */
function displayFieldValue(record, field, separator = " | ") {
  const raw = String(field?.field || "").startsWith("rec_")
    ? record?.[field.field]
    : record?.details?.[field?.field];
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return values.map((item) => projectFieldValue(item, field?.ext)).join(separator);
}

/** Project one detail value to a display string per its fieldset output option (`ext`). */
function projectFieldValue(item, ext = null) {
  if (item == null) return "";
  if (typeof item !== "object") return item;
  const key = String(ext || "").toLowerCase();
  const first = (...values) => values.find((value) => value !== null && value !== undefined) ?? "";
  if (key === "term") return first(item.trm_Label, item.term, item.label, item.value);
  if (key === "code") return first(item.trm_Code, item.code, item.value);
  if (key === "conceptid") return first(item.trm_ConceptCode, item.conceptId, item.conceptid);
  if (key === "id") return first(item.trm_ID, item.rec_ID, item.file?.ulf_ID, item.ulf_ID, item.id, item.value);
  if (key === "url") return first(item.file?.ulf_ExternalFileReference, item.file?.fullPath, item.url, item.fileUrl);
  if (key === "thumb") return first(item.file?.thumbnailUrl, item.thumbnailUrl, item.thumbnail, item.thumb);
  if (key === "wkt") return first(item.geo?.wkt, item.wkt);
  if (key && item[ext] != null) return serializeValue(item[ext]);
  return serializeValue(first(item.trm_Label, item.rec_Title, item.file?.ulf_Caption, item.file?.ulf_OrigFileName, item.file?.ulf_ExternalFileReference, item.file?.fullPath, item.geo?.wkt, item.value, item.label, item.title, item.code, item.id, ""));
}

/** JSON-stringify an object value; pass scalars through, and `''` for `null`/`undefined`. */
function serializeValue(value) {
  if (value == null) return "";
  if (typeof value !== "object") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

/** Strip HTML down to a small allowlist of inline formatting tags (`u`, `i`, `b`, `strong`, `em`). */
function sanitizeTextHtml(value) {
  const allowed = new Set(["u", "i", "b", "strong", "em"]);
  return String(value ?? "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (tag, name) => {
      const normalized = name.toLowerCase();
      if (!allowed.has(normalized)) return "";
      return tag.startsWith("</") ? `</${normalized}>` : `<${normalized}>`;
    });
}

/** Escape HTML-significant characters in a string via the DOM, for safe interpolation into markup. */
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

/** Escape a value for safe interpolation into an HTML attribute delimited by backticks. */
function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
