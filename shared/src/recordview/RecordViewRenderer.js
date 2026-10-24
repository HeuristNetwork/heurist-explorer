/**
 * @file RecordViewRenderer.js
 * @brief Renders one record into a container: the full view of heurist-recordview,
 *        or a compact card (header and thumbnail) for record popups of other modules.
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
import { fieldValues, sanitizeTextHtml, looksLikeJson } from "./FieldValueFormatter.js";
import { sanitizeRichHtml } from "./richTextHtml.js";
import { geoToHuman } from "../utils/geoText.js";
import { temporalToHuman } from "../utils/temporal.js";
import { buildFileMediaItem, fileMediaUrls } from "./fileMediaItem.js";
import { DEFAULT_RECORD_LIMITS, normalizeRecordLimits } from "./recordLimits.js";
import { loadingIndicator } from "../ui/loadingIndicator.js";
import "./RecordViewRenderer.css";

const VISIBILITY_LABELS = { hidden: "Hidden", viewable: "Viewable", public: "Public" };

/** Renders the empty state, the `builtin` engine's header/media/sections/footer, or the `legacy`/`smarty` iframe. */
export class RecordViewRenderer {
  /**
   * @param {object} options Renderer configuration.
   * @param {HTMLElement} options.container Element the renderer owns and clears on every render.
   * @param {string|null} [options.baseUrl] Legacy Heurist base URL, for the `builtin` engine's icon/media links.
   * @param {string|null} [options.database] Target Heurist database name, for the same links.
   * @param {object|null} [options.limits] Fields, values per field, thumbnails and links shown before a
   *   "Show all" link (`recordLimits.js`, plan 23); defaults for missing values.
   * @param {(() => void)|null} [options.onGrow] Called after a "Show all" link added content (a popup lays itself out again).
   */
  constructor({ container, baseUrl, database, limits = null, onGrow = null } = {}) {
    this.container = container;
    this.limits = normalizeRecordLimits(limits);
    this.onGrow = typeof onGrow === "function" ? onGrow : null;
    const value = String(baseUrl || "").trim();
    this.baseUrl = value ? (value.endsWith("/") ? value : `${value}/`) : null;
    this.database = database == null ? null : String(database);
    this.notice = document.createElement("div");
    this.notice.className = "heurist-recordview-notice";
    this.notice.hidden = true;
    this.body = document.createElement("div");
    this.body.className = "heurist-recordview-body";
    this.container.replaceChildren(this.notice, this.body);
  }

  /**
   * Show (or hide) the multi-selection notice above the rendered record.
   *
   * @param {string|null} text Notice text, or `null`/`''` to hide it.
   * @returns {void}
   */
  setNotice(text) {
    const value = String(text || "").trim();
    this.notice.hidden = !value;
    this.notice.textContent = value;
  }

  /**
   * Show the neutral empty state (no record to display).
   *
   * @param {string} message Empty-state message.
   * @returns {void}
   */
  showEmpty(message) {
    const empty = document.createElement("div");
    empty.className = "heurist-recordview-empty";
    // Only the default message is a translation key; custom configured text
    // (e.g. a user-entered emptyMessage) is shown verbatim, matching how
    // DataControlPanel treats its own default-vs-custom source caption.
    const text = String(message || "Select a record");
    empty.textContent = text === "Select a record" ? $HR(text) : text;
    this.body.replaceChildren(empty);
  }

  /**
   * Show "Loading..." with a rotating icon while a record loads (plan 23: a very large
   * record takes a while).
   *
   * @returns {void}
   */
  showLoading() {
    this.body.replaceChildren(loadingIndicator($HR("Loading..."), "heurist-recordview-loading"));
  }

  /**
   * Render the `builtin` engine's header, media strip, sectioned fields, and footer.
   *
   * @param {object} record Resolved record (`rec_*` fields plus a `details` map), from `RecordDataProvider`.
   * @param {object} options Render options.
   * @param {Array<object>} options.sections Field sections, from `RecordStructureProvider#fieldSections`.
   * @param {string|null} [options.recordTypeName] Record type display name, for the header.
   * @param {boolean} [options.canEdit] Whether the edit pencil is shown.
   * @param {(recordId: number) => void} [options.onEdit] Invoked when the edit pencil is activated.
   * @param {(recordId: number) => void} [options.onNavigate] Invoked when a resource-field link is followed.
   * @param {boolean} [options.canZoomExtent] Whether the host has an active map module to zoom, gating the geo field's zoom button.
   * @param {(wkt: string) => void} [options.onZoomExtent] Invoked with a geo field's WKT value when its zoom button is activated.
   * @param {object|null} [options.tags] The record's tags, from `RecordDataProvider#loadTags`.
   * @param {object|null} [options.relations] Relationships and incoming links, from `RecordRelationsProvider#load`.
   * @param {((record: object) => void)|null} [options.onShowLinks] Shows the records linked/related to this one; the
   *   header button appears only with it and when the record has any link or relationship.
   * @param {((tag: {id:number, name:string}) => void)|null} [options.onSearchTag] Runs a search for a tag; without it tags are plain text.
   * @param {((query: Array<object>, title: string) => void)|null} [options.onSearchLinks] Runs the search of a cut
   *   row of linked records ("Show all (N) in search", plan 23); without it the row offers "Show more".
   * @param {boolean} [options.compact] Render only the header and the first file's thumbnail (no viewer
   *   links, no audio/video players), followed by a "More..." link when `onExpand` is given.
   * @param {(() => void)|null} [options.onExpand] Invoked by the compact card's "More..." link.
   * @returns {void}
   */
  showBuiltin(record, {
    sections = [], recordTypeName = null, canEdit = false, onEdit = () => {}, onNavigate = () => {},
    canZoomExtent = false, onZoomExtent = () => {}, tags = null, relations = null, onSearchTag = null,
    onShowLinks = null, compact = false, onExpand = null, onSearchLinks = null,
  } = {}) {
    const recordTitle = String(record?.rec_Title ?? "").replace(/<[^>]*>/g, "").trim();
    this.linkContext = { onSearchLinks, recordTitle };
    if (compact) {
      const card = [this.#buildHeader(record, { recordTypeName, canEdit, onEdit })];
      const thumbnail = this.#buildCompactMedia(record, sections);
      if (thumbnail) card.push(thumbnail);
      if (typeof onExpand === "function") card.push(this.#buildMore(onExpand));
      this.body.replaceChildren(...card);
      return;
    }
    const showLinks = typeof onShowLinks === "function" && hasLinks(record, relations) ? onShowLinks : null;
    const children = [this.#buildHeader(record, { recordTypeName, canEdit, onEdit, onShowLinks: showLinks })];
    const media = this.#buildMedia(record, sections);
    if (media) children.push(media);
    const body = this.#buildSections(record, sections, {
      onNavigate, canZoomExtent, onZoomExtent, related: relations?.related || {},
    });
    const linkedFrom = this.#buildLinkedFrom(relations, onNavigate);
    if (linkedFrom) body.append(linkedFrom);
    const tagSection = this.#buildTags(tags, onSearchTag);
    if (tagSection) body.append(tagSection);
    children.push(body);
    children.push(this.#buildFooter(record));
    this.body.replaceChildren(...children);
    this.#alignFieldLabels();
  }

  /**
   * Render the `legacy`/`smarty` engine as an embedded iframe.
   *
   * @param {URL|string} url Renderer URL built by `RecordContentProvider#buildUrl`.
   * @returns {void}
   */
  showFrame(url) {
    const frame = document.createElement("iframe");
    frame.className = "heurist-recordview-frame";
    frame.title = $HR("Record");
    frame.src = String(url);
    this.body.replaceChildren(frame);
  }

  /** Remove all rendered content, leaving the body empty. */
  clear() {
    this.body.replaceChildren();
  }

  /** Remove the renderer's DOM from its container. */
  destroy() {
    this.notice.remove();
    this.body.remove();
  }

  /** Header: rectype icon, title, and a meta line (rectype name + id, with an edit pencil right next to the id, gated on `canEdit`). */
  #buildHeader(record, { recordTypeName, canEdit, onEdit, onShowLinks = null }) {
    const header = document.createElement("div");
    header.className = "heurist-recordview-header";
    const recordTypeId = Number(record?.rec_RecTypeID) || 0;
    const iconUrl = this.#iconUrl(recordTypeId);
    if (iconUrl) {
      const icon = document.createElement("img");
      icon.className = "heurist-recordview-rty-icon";
      icon.src = iconUrl;
      icon.alt = "";
      header.append(icon);
    }
    const text = document.createElement("div");
    text.className = "heurist-recordview-header-text";
    const title = document.createElement("h2");
    title.className = "heurist-recordview-title";
    title.innerHTML = sanitizeTextHtml(record?.rec_Title || recordTypeName || `Record ${record?.rec_ID ?? ""}`);
    const meta = document.createElement("div");
    meta.className = "heurist-recordview-meta";
    const metaText = document.createElement("span");
    metaText.textContent = [recordTypeName, record?.rec_ID != null ? `#${record.rec_ID}` : null]
      .filter(Boolean)
      .join(" · ");
    meta.append(metaText);
    if (canEdit) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "heurist-recordview-edit-button";
      edit.title = $HR("Edit");
      edit.setAttribute("aria-label", $HR("Edit"));
      edit.textContent = "✎";
      edit.addEventListener("click", () => onEdit(record?.rec_ID));
      meta.append(edit);
    }
    if (onShowLinks) {
      const links = document.createElement("button");
      links.type = "button";
      links.className = "heurist-recordview-edit-button heurist-recordview-links-button";
      links.title = $HR("Show linked and related records");
      links.setAttribute("aria-label", $HR("Show linked and related records"));
      links.innerHTML = '<span class="fa-solid fa-hexagon-nodes" aria-hidden="true"></span>';
      links.addEventListener("click", () => onShowLinks(record));
      meta.append(links);
    }
    text.append(title, meta);
    header.append(text);
    return header;
  }

  /** Media strip: one thumbnail + viewer link per `file`-type detail value, the first `limits.thumbs` at once. */
  #buildMedia(record, sections) {
    if (!this.#isConfigured()) return null;
    const files = [];
    for (const section of sections) {
      for (const field of section.fields) {
        if (field.type !== "file") continue;
        const values = record?.details?.[String(field.id)];
        if (Array.isArray(values)) files.push(...values);
      }
    }
    const shown = files.map((value) => value?.file).filter((file) => file?.ulf_ObfuscatedFileID);
    if (!shown.length) return null;
    const media = document.createElement("div");
    media.className = "heurist-recordview-media";
    appendLimited(media, shown, (file) => this.#buildMediaItem(file), {
      limit: this.limits.thumbs, label: "Show all files", onGrow: this.onGrow,
    });
    return media;
  }

  /** Compact card media: the thumbnail of the record's first file only, without viewer links or players. */
  #buildCompactMedia(record, sections) {
    if (!this.#isConfigured()) return null;
    for (const section of sections) {
      for (const field of section.fields) {
        if (field.type !== "file") continue;
        const values = record?.details?.[String(field.id)];
        const file = (Array.isArray(values) ? values : []).find((value) => value?.file?.ulf_ObfuscatedFileID)?.file;
        if (!file) continue;
        const media = document.createElement("div");
        media.className = "heurist-recordview-media heurist-recordview-media-compact";
        const thumb = document.createElement("img");
        thumb.className = "heurist-recordview-media-thumb";
        thumb.src = this.#thumbUrl(file.ulf_ObfuscatedFileID);
        thumb.alt = file.ulf_Caption || file.ulf_OrigFileName || "";
        media.append(thumb);
        return media;
      }
    }
    return null;
  }

  /** The compact card's "More..." link, which asks the caller to show the full record. */
  #buildMore(onExpand) {
    const more = document.createElement("div");
    more.className = "heurist-recordview-more";
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = $HR("More...");
    link.addEventListener("click", (event) => {
      event.preventDefault();
      onExpand();
    });
    more.append(link);
    return more;
  }

  /** One media item (shared with the file input of the record editor: fileMediaItem.js). */
  #buildMediaItem(file) {
    return buildFileMediaItem(file, { urls: fileMediaUrls(this.baseUrl, this.database) });
  }

  /**
   * Fields grouped into `<fieldset>`s per section; only populated, non-`file` fields are shown.
   * A relmarker field lists its relationships (`related`): relation type and related record.
   * Only the first `limits.fields` fields are built; "Show all fields" builds the others in
   * their sections (plan 23 §3.2). A section without a shown field stays hidden until then.
   */
  #buildSections(record, sections, { onNavigate, canZoomExtent, onZoomExtent, related = {} }) {
    const wrapper = document.createElement("div");
    wrapper.className = "heurist-recordview-sections";
    const pending = []; // rows past the limit: {dl, fieldset, build}
    let total = 0;
    for (const section of sections) {
      const builders = [];
      for (const field of section.fields) {
        if (field.type === "file") continue;
        if (field.type === "relmarker") {
          const group = related[String(field.id)];
          if (groupTotal(group)) builders.push(() => this.#buildLinksRow(field.name || `Field ${field.id}`, group, onNavigate, true));
          continue;
        }
        const values = record?.details?.[String(field.id)];
        if (!Array.isArray(values) || !values.length) continue;
        builders.push(() => this.#buildFieldRow(record, field, values, { onNavigate, canZoomExtent, onZoomExtent }));
      }
      if (!builders.length) continue;
      const fieldset = document.createElement("fieldset");
      fieldset.className = "heurist-recordview-section";
      if (section.title) {
        const legend = document.createElement("legend");
        legend.textContent = section.title;
        fieldset.append(legend);
      }
      const dl = document.createElement("dl");
      dl.className = "heurist-recordview-section-fields";
      for (const build of builders) {
        if (++total <= this.limits.fields) dl.append(...build());
        else pending.push({ dl, fieldset, build });
      }
      fieldset.hidden = !dl.childElementCount;
      fieldset.append(dl);
      wrapper.append(fieldset);
    }

    if (pending.length) {
      wrapper.append(showAllLink(`${$HR("Show all fields")} (${total})`, (line) => {
        for (const { dl, fieldset, build } of pending) {
          dl.append(...build());
          fieldset.hidden = false;
        }
        line.remove();
        this.#alignFieldLabels();
        this.onGrow?.();
      }));
    }
    return wrapper;
  }

  /**
   * One field row: a resource field renders as links that trigger `onNavigate`; a blocktext
   * field renders sanitized rich text (or a system-format notice when its content is JSON);
   * a geo field renders its readable text (`geoToHuman`: type, vertices, coordinate ranges, never
   * the raw WKT) with an optional zoom button; a date field its readable date
   * (`temporalToHuman`); everything else renders as plain text. Each
   * value gets its own line within `dd`, so the label sits inline with the first value and
   * further values stack beneath it. Only the first `limits.values` values are built, then
   * "Show all values (N)".
   */
  #buildFieldRow(record, field, values, { onNavigate, canZoomExtent, onZoomExtent }) {
    const dt = document.createElement("dt");
    dt.textContent = field.name || `Field ${field.id}`;
    const dd = document.createElement("dd");
    let items = values;
    let buildLine;
    if (field.type === "resource") {
      buildLine = (value) => {
        const line = valueLine();
        const link = document.createElement("a");
        link.href = "#";
        link.className = "heurist-recordview-resource-link";
        link.innerHTML = sanitizeTextHtml(value?.rec_Title || `#${value?.rec_ID ?? ""}`);
        link.addEventListener("click", (event) => {
          event.preventDefault();
          if (value?.rec_ID) onNavigate(value.rec_ID);
        });
        line.append(link);
        return line;
      };
    } else if (field.type === "geo") {
      items = fieldValues(record, { field: String(field.id) });
      buildLine = (wkt) => {
        const line = valueLine();
        line.classList.add("heurist-recordview-geo-line");
        const summary = document.createElement("span");
        summary.className = "heurist-recordview-geo-summary";
        summary.textContent = geoToHuman(wkt);
        line.append(summary);
        if (canZoomExtent && String(wkt ?? "").trim()) {
          const zoom = document.createElement("button");
          zoom.type = "button";
          zoom.className = "heurist-icon-button heurist-recordview-geo-zoom";
          zoom.title = $HR("Zoom to extent");
          zoom.setAttribute("aria-label", $HR("Zoom to extent"));
          zoom.innerHTML = '<span class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></span>';
          zoom.addEventListener("click", () => onZoomExtent(wkt));
          line.append(zoom);
        }
        return line;
      };
    } else if (field.type === "blocktext") {
      items = fieldValues(record, { field: String(field.id) });
      buildLine = (text) => {
        const line = valueLine();
        const plain = String(text ?? "");
        if (looksLikeJson(plain)) {
          line.classList.add("heurist-recordview-value-systemformat");
          line.textContent = $HR("Data in system format");
        } else {
          // the HTML the server keeps for blocktext (TinyMCE: lists, links, tables, media; plan 25)
          line.classList.add("heurist-recordview-richtext");
          line.innerHTML = sanitizeRichHtml(plain, { baseUrl: this.baseUrl, database: this.database });
          // a record link of the editor's "Record" button opens the record here
          for (const link of line.querySelectorAll?.("a[data-record-id]") || []) {
            link.addEventListener("click", (event) => {
              event.preventDefault();
              onNavigate(Number(link.dataset.recordId));
            });
          }
        }
        return line;
      };
    } else if (field.type === "freetext") {
      // the inline tags of a record title (u, i, b, strong, em; plan 25)
      items = fieldValues(record, { field: String(field.id) });
      buildLine = (text) => {
        const line = valueLine();
        line.innerHTML = sanitizeTextHtml(String(text ?? ""));
        return line;
      };
    } else if (field.type === "date") {
      // plain dates and temporal objects (JSON) as readable text
      items = fieldValues(record, { field: String(field.id) });
      buildLine = (text) => {
        const line = valueLine();
        line.textContent = temporalToHuman(text);
        return line;
      };
    } else {
      items = fieldValues(record, { field: String(field.id) });
      buildLine = (text) => {
        const line = valueLine();
        line.textContent = String(text ?? "");
        return line;
      };
    }
    appendLimited(dd, items, buildLine, { limit: this.limits.values, label: "Show all values", onGrow: this.onGrow });
    return [dt, dd];
  }

  /**
   * Give every section's `<dt>` label column the same width — each section's `<dl>` is its
   * own CSS grid, so left to `max-content` alone their columns would size independently and
   * labels would land at different x-positions section to section. Measures each label's
   * natural (already `max-content`-sized) width, then pins every section's column to the
   * widest one via a shared CSS variable.
   */
  #alignFieldLabels(retry = true) {
    const dts = this.body.querySelectorAll(".heurist-recordview-section-fields dt");
    if (!dts.length) return;
    let maxWidth = 0;
    for (const dt of dts) maxWidth = Math.max(maxWidth, dt.getBoundingClientRect().width);
    // Rendered before it is on the page (e.g. Data's Extended view builds the
    // record, then inserts it): nothing is measured yet. A 0px label column would
    // put the labels over the values - keep each section's natural (max-content)
    // column and align once the record is laid out.
    if (!maxWidth) {
      if (retry && typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => this.#alignFieldLabels(false));
      }
      return;
    }
    for (const dl of this.body.querySelectorAll(".heurist-recordview-section-fields")) {
      dl.style.setProperty("--heurist-recordview-label-width", `${maxWidth}px`);
    }
  }

  /** "Linked from" section (buildLinkedFromSection, shared with the record editor). */
  #buildLinkedFrom(relations, onNavigate) {
    return buildLinkedFromSection(relations, onNavigate, this.#linkOptions());
  }

  /** One row of record links (buildLinksRow). */
  #buildLinksRow(label, source, onNavigate, withRelation = false) {
    return buildLinksRow(label, source, onNavigate, withRelation, this.#linkOptions());
  }

  /** Options of the link rows: the links limit, `onGrow`, and the search of a row's records (with the record title). */
  #linkOptions() {
    const { onSearchLinks, recordTitle } = this.linkContext || {};
    return {
      limit: this.limits.links,
      onGrow: this.onGrow,
      onSearch: typeof onSearchLinks === "function"
        ? (query, label) => onSearchLinks(query, recordTitle ? `${label}: ${recordTitle}` : label)
        : null,
    };
  }

  /**
   * "Tags" section: one row per tag owner - "Personal tags" first, then "<group> tags" -
   * each tag a link that searches the records carrying it (`onSearchTag`), or plain
   * text when the host cannot run a search.
   */
  #buildTags(tags, onSearchTag) {
    const groups = tagGroups(tags);
    if (!groups.length) return null;
    const fieldset = document.createElement("fieldset");
    fieldset.className = "heurist-recordview-section heurist-recordview-tags";
    const legend = document.createElement("legend");
    legend.textContent = $HR("Tags");
    const dl = document.createElement("dl");
    dl.className = "heurist-recordview-section-fields";
    for (const group of groups) {
      const dt = document.createElement("dt");
      dt.textContent = group.label;
      const dd = document.createElement("dd");
      const line = document.createElement("div");
      line.className = "heurist-recordview-value-line heurist-recordview-tag-list";
      group.tags.forEach((tag, index) => {
        if (index) line.append(", ");
        if (typeof onSearchTag !== "function") { line.append(tag.name); return; }
        const link = document.createElement("a");
        link.href = "#";
        link.className = "heurist-recordview-tag-link";
        link.textContent = tag.name;
        link.title = $HR("Find records with this tag");
        link.addEventListener("click", (event) => {
          event.preventDefault();
          onSearchTag(tag);
        });
        line.append(link);
      });
      dd.append(line);
      dl.append(dt, dd);
    }
    fieldset.append(legend, dl);
    return fieldset;
  }

  /** Footer: created/modified dates, owner group id, and a visibility label. No rating (deferred). */
  #buildFooter(record) {
    const footer = document.createElement("div");
    footer.className = "heurist-recordview-footer";
    const visibility = String(record?.rec_NonOwnerVisibility || "").toLowerCase();
    const items = [
      [$HR("Created"), formatDate(record?.rec_Added)],
      [$HR("Modified"), formatDate(record?.rec_Modified)],
      [$HR("Owner"), record?.rec_OwnerUGrpID != null ? `#${record.rec_OwnerUGrpID}` : ""],
      [$HR("Visibility"), VISIBILITY_LABELS[visibility] ? $HR(VISIBILITY_LABELS[visibility]) : ""],
    ];
    for (const [label, value] of items) {
      if (!String(value ?? "").trim()) continue;
      const span = document.createElement("span");
      span.className = "heurist-recordview-footer-item";
      span.textContent = `${label}: ${value}`;
      footer.append(span);
    }
    return footer;
  }

  /** Whether `baseUrl`/`database` are both set, and icon/media links can be built. */
  #isConfigured() {
    return Boolean(this.baseUrl && this.database);
  }

  /** Record type icon URL (`?db={db}&icon={rty}`), or `''` when unconfigured/invalid. */
  #iconUrl(recordTypeId) {
    if (!recordTypeId || !this.#isConfigured()) return "";
    return `${this.baseUrl}?db=${encodeURIComponent(this.database)}&icon=${recordTypeId}`;
  }

  /** File thumbnail URL (`?db={db}&thumb={obfuscatedId}`). */
  #thumbUrl(fileId) {
    return `${this.baseUrl}?db=${encodeURIComponent(this.database)}&thumb=${encodeURIComponent(fileId)}`;
  }
}

/** Format a Heurist `YYYY-MM-DD...` date string as a locale-medium date, falling back to the raw text. */
function formatDate(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`),
    );
  } catch {
    return text;
  }
}

/**
 * Tags grouped by owner for the "Tags" section: the current user's personal tags
 * first, then each group's tags by group name; tags sorted by name within each owner.
 *
 * @param {{currentUserId?: number, tags?: Array<{id:number, name:string, owner:number, ownerName:string}>}|null} data Record tags.
 * @returns {Array<{label: string, tags: Array<{id:number, name:string}>}>} Rows of the section.
 */
export function tagGroups(data) {
  const me = Number(data?.currentUserId) || 0;
  const byOwner = new Map();
  for (const tag of data?.tags || []) {
    if (!byOwner.has(tag.owner)) byOwner.set(tag.owner, { owner: tag.owner, ownerName: tag.ownerName, tags: [] });
    byOwner.get(tag.owner).tags.push({ id: Number(tag.id), name: String(tag.name ?? "") });
  }
  const collator = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  return [...byOwner.values()]
    .sort((a, b) => (b.owner === me) - (a.owner === me) || collator(a.ownerName || "", b.ownerName || ""))
    .map((entry) => ({
      label: entry.owner === me ? $HR("Personal tags") : `${entry.ownerName || `#${entry.owner}`} ${$HR("tags")}`,
      tags: entry.tags.sort((a, b) => collator(a.name, b.name)),
    }));
}

/**
 * Whether a record has any link or relationship: a pointer among its own fields, a
 * relationship of a relmarker field, a relationship to it or a record linking to it.
 *
 * @param {object} record Resolved record (`details` values of pointer fields carry `rec_ID`).
 * @param {object|null} relations From `RecordRelationsProvider#load`.
 * @returns {boolean}
 */
export function hasLinks(record, relations) {
  const pointer = Object.values(record?.details || {})
    .some((values) => Array.isArray(values) && values.some((value) => Number(value?.rec_ID) > 0));
  const filled = (group) => groupTotal(group) > 0;
  return pointer
    || Object.values(relations?.related || {}).some(filled)
    || (relations?.relationsFrom || []).some(filled)
    || (relations?.linkedFrom || []).some(filled);
}

/**
 * (Shared with the record editor's Record summary, plan 18.)
 * "Linked from" section: relationships that point at this record (one row per
 * relation type, inverse where defined), then records linking here through their
 * pointer fields (one row per record type).
 *
 * @param {object|null} relations From `RecordRelationsProvider#load` (groups).
 * @param {(recordId: number) => void} onNavigate Opens a record.
 * @param {{limit?: number, onGrow?: Function|null, onSearch?: Function|null}} [options] See buildLinksRow.
 * @returns {HTMLFieldSetElement|null} The section, or `null` without links.
 */
export function buildLinkedFromSection(relations, onNavigate, options = {}) {
  const rows = [];
  for (const group of relations?.relationsFrom || []) {
    if (groupTotal(group)) rows.push(buildLinksRow(group.label || $HR("Related"), group, onNavigate, false, options));
  }
  const rtyName = (rty) => relations?.dbdefs?.rectypeName?.(rty) || $HR("Records");
  for (const group of relations?.linkedFrom || []) {
    if (groupTotal(group)) rows.push(buildLinksRow(group.label || rtyName(group.rty), group, onNavigate, false, options));
  }
  if (!rows.length) return null;
  const fieldset = document.createElement("fieldset");
  fieldset.className = "heurist-recordview-section heurist-recordview-linked-from";
  const legend = document.createElement("legend");
  legend.textContent = $HR("Linked from");
  const dl = document.createElement("dl");
  dl.className = "heurist-recordview-section-fields";
  for (const [dt, dd] of rows) dl.append(dt, dd);
  fieldset.append(legend, dl);
  return fieldset;
}

/**
 * One row of record links (titles follow `onNavigate`), each on its own line;
 * `withRelation` puts the relation type before each title. Only the first `limit`
 * links are built (plan 23); a cut row ends with one link:
 * - every record loaded: "Show all (N)" builds the others in place;
 * - a group with more records than loaded and an `onSearch`: "Show all (N) in search";
 * - otherwise, with the group's `more()`: "Show more (shown / N)", the next `limit` each time.
 * The label of a cut row has the count: "Persons (1234)".
 *
 * @param {string} label Row label.
 * @param {Array<{id: number, title: string, relation?: string}>|object} source Linked records, or a
 *   `LinkGroup` of `RecordRelationsProvider` (`items`, `total`, `query`, `more`).
 * @param {(recordId: number) => void} onNavigate Opens a record.
 * @param {boolean} [withRelation=false] Show the relation type before each title.
 * @param {{limit?: number, onGrow?: Function|null, onSearch?: ((query: Array<object>, label: string) => void)|null}} [options]
 *   `limit`: links shown at once (default `DEFAULT_RECORD_LIMITS.links`); `onGrow`: called after links were
 *   added; `onSearch`: runs the group's search in the host.
 * @returns {[HTMLElement, HTMLElement]} The `dt` and `dd` of the row.
 */
export function buildLinksRow(label, source, onNavigate, withRelation = false, {
  limit = DEFAULT_RECORD_LIMITS.links, onGrow = null, onSearch = null,
} = {}) {
  const group = Array.isArray(source) ? { items: source } : source || {};
  const items = group.items || [];
  const total = groupTotal(group);
  const max = Number(limit) > 0 ? Number(limit) : items.length;
  const dt = document.createElement("dt");
  dt.textContent = total > max ? `${label} (${total})` : label;
  const dd = document.createElement("dd");
  const buildLine = (entry) => {
    const line = valueLine();
    if (withRelation && entry.relation) {
      const relation = document.createElement("span");
      relation.className = "heurist-recordview-relation-type";
      relation.textContent = entry.relation;
      line.append(relation, " ");
    }
    const link = document.createElement("a");
    link.href = "#";
    link.className = "heurist-recordview-resource-link";
    link.innerHTML = sanitizeTextHtml(entry.title || `#${entry.id}`);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      onNavigate(entry.id);
    });
    line.append(link);
    return line;
  };

  if (items.length >= total) {
    appendLimited(dd, items, buildLine, { limit: max, label: "Show all", onGrow });
  } else {
    let shown = Math.min(max, items.length);
    for (const entry of items.slice(0, shown)) dd.append(buildLine(entry));
    if (typeof onSearch === "function" && group.query) {
      dd.append(showAllLink(`${$HR("Show all")} (${total}) ${$HR("in search")}`, () => onSearch(group.query, label)));
    } else if (typeof group.more === "function") {
      const moreText = () => `${$HR("Show more")} (${shown} / ${total})`;
      let loading = false;
      const moreLine = showAllLink(moreText(), async (line) => {
        if (loading) return;
        loading = true;
        try {
          // the loaded records first, then the next page of the group
          if (shown + max > items.length && items.length < total) await group.more();
        } catch (error) {
          if (error?.name !== "AbortError") console.warn("Linked records could not be loaded", error);
        }
        loading = false;
        const next = items.slice(shown, shown + max);
        for (const entry of next) line.before(buildLine(entry));
        shown += next.length;
        if (!next.length || shown >= total) line.remove();
        else line.querySelector("a").textContent = moreText();
        onGrow?.();
      });
      dd.append(moreLine);
    }
  }
  return [dt, dd];
}

/**
 * Number of records of a row: a `LinkGroup`'s total, or the length of a plain list.
 *
 * @param {Array<object>|object|null} group Linked records, or a `LinkGroup`.
 * @returns {number}
 */
function groupTotal(group) {
  if (Array.isArray(group)) return group.length;
  const loaded = group?.items?.length || 0;
  return Math.max(loaded, Number(group?.total) || 0);
}

/** An empty value line (one value of a field row). */
function valueLine() {
  const line = document.createElement("div");
  line.className = "heurist-recordview-value-line";
  return line;
}

/**
 * Append the elements of the first `limit` items, then a "Show all (N)" link that
 * builds the others in its place (plan 23 §3.2): a very large record builds only
 * what is shown.
 *
 * @param {HTMLElement} parent Element the items go into.
 * @param {Array<*>} items Items.
 * @param {(item: *) => Node} build Builds the element of one item.
 * @param {{limit: number, label: string, onGrow?: Function|null}} options `label`: translation key of the link.
 * @returns {void}
 */
function appendLimited(parent, items, build, { limit, label, onGrow = null }) {
  const max = Number(limit) > 0 ? Number(limit) : items.length;
  for (const item of items.slice(0, max)) parent.append(build(item));
  if (items.length <= max) return;
  parent.append(showAllLink(`${$HR(label)} (${items.length})`, (line) => {
    line.replaceWith(...items.slice(max).map(build));
    onGrow?.();
  }));
}

/**
 * A "Show all" line: a link that calls `onShow` with the line (which replaces or removes it).
 *
 * @param {string} text Link text.
 * @param {(line: HTMLElement) => void} onShow Called on click.
 * @returns {HTMLElement} The line.
 */
function showAllLink(text, onShow) {
  const line = document.createElement("div");
  line.className = "heurist-recordview-show-all";
  const link = document.createElement("a");
  link.href = "#";
  link.textContent = text;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    onShow(line);
  });
  line.append(link);
  return line;
}
