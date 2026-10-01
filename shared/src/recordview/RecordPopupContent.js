/**
 * @file RecordPopupContent.js
 * @brief Record content of a module popup (heurist-map, heurist-graph): one
 *        record in the configured popup mode, with "Back" navigation.
 *
 * Popup modes (see `normalizePopupMode`):
 * - `basic`: title, then "Record NNN · Type: YYY";
 * - `builtin`: the shared record renderer, compact (header and thumbnail) with
 *   "More..." for the full record; links to other records open them here;
 * - `standard` or a Smarty template name: server-rendered HTML (`loadHtml`).
 *
 * The owner may first show its own view (`showView`, e.g. Map's list of the
 * records at one spot); records opened from it get a "‹ Back" link.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { $HR } from "#shared/ui";
import { RecordViewRenderer } from "./RecordViewRenderer.js";
import { sanitizeTextHtml } from "./FieldValueFormatter.js";
import "./RecordPopupContent.css";

/**
 * @typedef {object} PopupRecord
 * @property {number} id Record ID.
 * @property {?number} [rty] Record type ID, when known.
 * @property {string} [title] Record title (may contain Heurist's inline markup).
 */

/**
 * Normalize a popup mode/template value: `'none'`, `'basic'` (the default for an
 * empty value), `'builtin'`, `'standard'` or a Smarty template name. The former
 * Map value `'minimal'` and the former Graph value `'vis'` read as `'basic'`.
 *
 * @param {*} value Raw popup mode/template value.
 * @returns {string} Normalized mode.
 */
export function normalizePopupMode(value) {
  const text = value == null ? "" : String(value).trim();
  if (!text) return "basic";
  const lower = text.toLowerCase();
  if (lower === "minimal" || lower === "vis") return "basic";
  if (["none", "basic", "builtin", "standard"].includes(lower)) return lower;
  return text;
}

/**
 * Whether a normalized popup mode is rendered by the server (legacy renderer or Smarty template).
 *
 * @param {string} mode Normalized popup mode.
 * @returns {boolean} `true` for `'standard'` and template names.
 */
export function isServerPopupMode(mode) {
  return !["none", "basic", "builtin"].includes(mode);
}

/** Builds and updates the record content of one popup. */
export class RecordPopupContent {
  /**
   * @param {object} options Dependencies.
   * @param {?object} [options.recordViewLoader] Shared `RecordViewLoader` (record type names, `builtin` mode).
   * @param {?(id: number, mode: string, signal: AbortSignal) => Promise<?string>} [options.loadHtml]
   *        Loads server-rendered HTML for the `standard`/template modes.
   * @param {?string} [options.baseUrl] Heurist base URL, for record type icons and media.
   * @param {?string} [options.database] Database name, for record type icons and media.
   * @param {() => boolean} [options.canEditRecords] Whether the host can edit records now (edit pencil).
   * @param {?(recordId: number) => Promise<?object>} [options.editRecord] Opens the host record editor.
   * @param {() => void} [options.onLayout] Called after the content changed (the popup re-lays itself out).
   */
  constructor({
    recordViewLoader = null, loadHtml = null, baseUrl = null, database = null,
    canEditRecords = () => false, editRecord = null, onLayout = null,
  } = {}) {
    this.recordViewLoader = recordViewLoader;
    this.loadHtml = loadHtml;
    const base = String(baseUrl || "").trim();
    this.baseUrl = base ? (base.endsWith("/") ? base : `${base}/`) : null;
    this.database = database == null ? null : String(database);
    this.canEditRecords = canEditRecords;
    this.editRecord = editRecord;
    this.onLayout = onLayout;
    this.mode = "basic";
    this.element = document.createElement("div");
    this.element.className = "h-record-popup";
    // Views are re-rendered inside their own click handlers ("More...", a list
    // line, Back), which detaches the clicked element. The host (Leaflet) then
    // cannot tell the click came from its popup, takes it for a map click and
    // closes the popup - so popup clicks never leave the popup.
    this.element.addEventListener("click", (event) => event.stopPropagation());
    this.views = [];
    this.generation = 0;
    this.abortController = null;
  }

  /**
   * Start over with an owner-built view (e.g. a list of records); records opened
   * from it show "‹ Back".
   *
   * @param {() => HTMLElement} build Builds the view's content.
   * @param {string} mode Popup mode used for the records opened from it.
   * @returns {RecordPopupContent} This instance.
   */
  showView(build, mode) {
    this.mode = normalizePopupMode(mode);
    this.views = [];
    this.#show({ type: "custom", build });
    return this;
  }

  /**
   * Start over with one record.
   *
   * @param {PopupRecord} record Record to show.
   * @param {string} mode Popup mode or template name.
   * @param {object} [options]
   * @param {boolean} [options.full=false] Built-in mode: show the full record at once
   *        (no compact card with "More...").
   * @returns {RecordPopupContent} This instance.
   */
  showRecord(record, mode, { full = false } = {}) {
    this.mode = normalizePopupMode(mode);
    this.views = [];
    this.#show({ type: "record", record, full: full === true });
    return this;
  }

  /**
   * Open a record above the current view (with "‹ Back").
   *
   * @param {PopupRecord} record Record to show.
   * @returns {RecordPopupContent} This instance.
   */
  openRecord(record) {
    this.#show({ type: "record", record, full: false });
    return this;
  }

  /** Record type icon URL (`?db={db}&icon={rty}`), or `''` when unknown. */
  iconUrl(rty) {
    if (!(Number(rty) > 0) || !this.baseUrl || !this.database) return "";
    return `${this.baseUrl}?db=${encodeURIComponent(this.database)}&icon=${Number(rty)}`;
  }

  /** Cancel pending requests (the popup was closed). */
  cancel() {
    this.generation += 1;
    this.abortController?.abort();
    this.abortController = null;
  }

  /** Push and render a view; `replace` swaps the current view instead (compact -> full). */
  #show(view, { replace = false } = {}) {
    if (replace) this.views.pop();
    this.views.push(view);
    this.#render();
  }

  /** Return to the previous view. */
  #back() {
    if (this.views.length < 2) return;
    this.views.pop();
    this.#render();
  }

  /** Render the current view. */
  #render() {
    this.cancel();
    this.abortController = new AbortController();
    const view = this.views.at(-1);
    const parts = [];
    if (this.views.length > 1) parts.push(this.#buildBack());
    const body = document.createElement("div");
    body.className = "h-record-popup-body";
    parts.push(body);
    this.element.replaceChildren(...parts);
    if (view.type === "custom") {
      body.append(view.build());
      this.#layout();
      return;
    }
    void this.#renderRecord(body, view);
  }

  /** The "‹ Back" link above a record opened from another view. */
  #buildBack() {
    const back = document.createElement("a");
    back.href = "#";
    back.className = "h-record-popup-back";
    back.textContent = `‹ ${$HR("Back")}`;
    back.addEventListener("click", (event) => {
      event.preventDefault();
      this.#back();
    });
    return back;
  }

  /** Render one record in the current mode. */
  async #renderRecord(body, view) {
    const generation = this.generation;
    const signal = this.abortController.signal;
    const mode = this.mode;
    const { record } = view;
    if (mode === "basic") {
      body.append(await this.#buildBasic(record, signal).catch(() => basicCard(record, null)));
      if (generation === this.generation) this.#layout();
      return;
    }
    body.append(message($HR("Loading...")));
    this.#layout();
    try {
      if (mode === "builtin" && this.recordViewLoader) {
        const data = await this.recordViewLoader.load(record.id, { full: view.full, signal });
        if (generation !== this.generation) return;
        if (!data) {
          body.replaceChildren(message($HR("Record not found")));
        } else {
          const container = document.createElement("div");
          container.className = "h-record-popup-record";
          body.replaceChildren(container);
          new RecordViewRenderer({ container, baseUrl: this.baseUrl, database: this.database }).showBuiltin(data.record, {
            sections: data.sections,
            recordTypeName: data.recordTypeName,
            tags: data.tags,
            relations: data.relations,
            canEdit: typeof this.editRecord === "function" && this.canEditRecords() === true,
            onEdit: (id) => this.#edit(id, view),
            compact: !view.full,
            onExpand: () => this.#show({ type: "record", record, full: true }, { replace: true }),
            onNavigate: (id) => this.#show({ type: "record", record: { id: Number(id), rty: null, title: "" }, full: true }),
          });
        }
      } else if (isServerPopupMode(mode) && typeof this.loadHtml === "function") {
        const html = await this.loadHtml(record.id, mode, signal);
        if (generation !== this.generation) return;
        const content = document.createElement("div");
        content.className = "h-record-popup-html";
        content.innerHTML = html || "";
        body.replaceChildren(content);
      } else {
        body.replaceChildren(await this.#buildBasic(record, signal));
      }
    } catch (error) {
      if (error?.name === "AbortError" || generation !== this.generation) return;
      body.replaceChildren(message($HR("Popup content could not be loaded")));
    }
    if (generation === this.generation) this.#layout();
  }

  /** Open the host record editor; after a save show the edited record again. */
  async #edit(id, view) {
    try {
      const result = await this.editRecord(Number(id));
      if (result?.saved === true && this.views.at(-1) === view) this.#render();
    } catch {
      // the host reports its own editor errors
    }
  }

  /** Basic card, resolving the record type name. */
  async #buildBasic(record, signal) {
    let typeName = null;
    const rty = Number(record.rty) || 0;
    if (rty && this.recordViewLoader?.vocabularyProvider) {
      const names = await this.recordViewLoader.vocabularyProvider.getRecordTypeNames([rty], { signal });
      typeName = names.get(rty) || null;
    }
    return basicCard(record, typeName);
  }

  /** Tell the owner the content changed. */
  #layout() {
    this.onLayout?.();
  }
}

/** Basic card: title, then "Record NNN · Type: YYY". */
function basicCard(record, typeName) {
  const card = document.createElement("div");
  card.className = "h-record-popup-basic";
  const title = document.createElement("div");
  title.className = "h-record-popup-basic-title";
  title.innerHTML = sanitizeTextHtml(record.title || `${$HR("Record")} ${record.id}`);
  const meta = document.createElement("div");
  meta.className = "h-record-popup-basic-meta";
  const type = typeName || (record.rty ? `#${record.rty}` : "");
  meta.textContent = [`${$HR("Record")} ${record.id}`, type ? `${$HR("Type")}: ${type}` : null].filter(Boolean).join(" · ");
  card.append(title, meta);
  return card;
}

/** A muted one-line status message. */
function message(text) {
  const element = document.createElement("div");
  element.className = "h-record-popup-message";
  element.textContent = text;
  return element;
}
