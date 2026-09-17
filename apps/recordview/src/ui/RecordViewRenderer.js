/**
 * @file RecordViewRenderer.js
 * @brief Renders the currently displayed record into the module body.
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
import { $HR } from "#shared/ui";
import { fieldValues, sanitizeTextHtml, looksLikeJson } from "../core/FieldValueFormatter.js";

const VISIBILITY_LABELS = { hidden: "Hidden", viewable: "Viewable", public: "Public" };

/** Renders the empty state, the `builtin` engine's header/media/sections/footer, or the `legacy`/`smarty` iframe. */
export class RecordViewRenderer {
  /**
   * @param {object} options Renderer configuration.
   * @param {HTMLElement} options.container Element the renderer owns and clears on every render.
   * @param {string|null} [options.baseUrl] Legacy Heurist base URL, for the `builtin` engine's icon/media links.
   * @param {string|null} [options.database] Target Heurist database name, for the same links.
   */
  constructor({ container, baseUrl, database } = {}) {
    this.container = container;
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
   * Render the `builtin` engine's header, media strip, sectioned fields, and footer.
   *
   * @param {object} record Resolved record (`rec_*` fields plus a `details` map), from `RecordDataProvider`.
   * @param {object} options Render options.
   * @param {Array<object>} options.sections Field sections, from `RecordStructureProvider#fieldSections`.
   * @param {string|null} [options.recordTypeName] Record type display name, for the header.
   * @param {boolean} [options.canEdit] Whether the edit pencil is shown.
   * @param {(recordId: number) => void} [options.onEdit] Invoked when the edit pencil is activated.
   * @param {(recordId: number) => void} [options.onNavigate] Invoked when a resource-field link is followed.
   * @returns {void}
   */
  showBuiltin(record, { sections = [], recordTypeName = null, canEdit = false, onEdit = () => {}, onNavigate = () => {} } = {}) {
    const children = [this.#buildHeader(record, { recordTypeName, canEdit, onEdit })];
    const media = this.#buildMedia(record, sections);
    if (media) children.push(media);
    children.push(this.#buildSections(record, sections, { onNavigate }));
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
  #buildHeader(record, { recordTypeName, canEdit, onEdit }) {
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
    text.append(title, meta);
    header.append(text);
    return header;
  }

  /** Media strip: one thumbnail + viewer link per `file`-type detail value. */
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
    if (!files.length) return null;
    const media = document.createElement("div");
    media.className = "heurist-recordview-media";
    for (const value of files) {
      const file = value?.file;
      if (!file?.ulf_ObfuscatedFileID) continue;
      media.append(this.#buildMediaItem(file));
    }
    return media.childElementCount ? media : null;
  }

  /**
   * One media item. Audio/video render as a native `<audio>`/`<video>` player; everything
   * else as a thumbnail whose click toggles it between the thumbnail and full-size image
   * (images only — see `#fileUrl`). Below that, per-type viewer links: OSD for images,
   * Mirador for images/audio/video, and "open in new tab" for an externally-referenced file.
   */
  #buildMediaItem(file) {
    const fileId = file.ulf_ObfuscatedFileID;
    const mimeType = String(file.fxm_MimeType || "");
    const isImage = mimeType.startsWith("image/");
    const isAudio = mimeType.startsWith("audio/");
    const isVideo = mimeType.startsWith("video/");
    // Matches the legacy renderer's `fileUrl()`: an external reference is embedded directly
    // unless it's plain (insecure) `http://`, in which case it's proxied through Heurist.
    const externalUrl = file.ulf_ExternalFileReference || null;
    const mediaSrc = externalUrl && !/^http:\/\//i.test(externalUrl) ? externalUrl : this.#fileUrl(fileId);

    const item = document.createElement("div");
    item.className = "heurist-recordview-media-item";

    if (isAudio || isVideo) {
      item.classList.add("heurist-recordview-media-item-player");
      const player = document.createElement(isVideo ? "video" : "audio");
      player.className = "heurist-recordview-media-player";
      player.controls = true;
      const source = document.createElement("source");
      source.src = mediaSrc;
      if (mimeType) source.type = mimeType;
      player.append(source);
      item.append(player);
    } else {
      const thumb = document.createElement("img");
      thumb.className = "heurist-recordview-media-thumb";
      thumb.src = this.#thumbUrl(fileId);
      thumb.alt = file.ulf_Caption || file.ulf_OrigFileName || "";
      if (isImage) {
        thumb.classList.add("heurist-recordview-media-thumb-zoomable");
        thumb.addEventListener("click", () => {
          const expanded = item.classList.toggle("heurist-recordview-media-item-expanded");
          thumb.src = expanded ? mediaSrc : this.#thumbUrl(fileId);
        });
      }
      item.append(thumb);
    }

    const links = document.createElement("div");
    links.className = "heurist-recordview-media-links";
    if (isImage) links.append(this.#buildMediaLink(this.#osdUrl(fileId), "Show in OSD"));
    if (isImage || isAudio || isVideo) links.append(this.#buildMediaLink(this.#miradorUrl(fileId), "Show in Mirador"));
    if (externalUrl) links.append(this.#buildMediaLink(externalUrl, "Show in new tab"));
    if (links.childElementCount) item.append(links);

    return item;
  }

  /** One `target="_blank"` viewer link, used inside a media item's link list. */
  #buildMediaLink(href, label) {
    const link = document.createElement("a");
    link.className = "heurist-recordview-media-link";
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = $HR(label);
    return link;
  }

  /** Fields grouped into `<fieldset>`s per section; only populated, non-`file` fields are shown. */
  #buildSections(record, sections, { onNavigate }) {
    const wrapper = document.createElement("div");
    wrapper.className = "heurist-recordview-sections";
    for (const section of sections) {
      const rows = [];
      for (const field of section.fields) {
        if (field.type === "file") continue;
        const values = record?.details?.[String(field.id)];
        if (!Array.isArray(values) || !values.length) continue;
        rows.push(this.#buildFieldRow(record, field, values, { onNavigate }));
      }
      if (!rows.length) continue;
      const fieldset = document.createElement("fieldset");
      fieldset.className = "heurist-recordview-section";
      if (section.title) {
        const legend = document.createElement("legend");
        legend.textContent = section.title;
        fieldset.append(legend);
      }
      const dl = document.createElement("dl");
      dl.className = "heurist-recordview-section-fields";
      for (const [dt, dd] of rows) dl.append(dt, dd);
      fieldset.append(dl);
      wrapper.append(fieldset);
    }
    return wrapper;
  }

  /**
   * One field row: a resource field renders as links that trigger `onNavigate`; a blocktext
   * field renders sanitized rich text (or a system-format notice when its content is JSON);
   * everything else renders as plain text. Each value gets its own line within `dd`, so the
   * label sits inline with the first value and further values stack beneath it.
   */
  #buildFieldRow(record, field, values, { onNavigate }) {
    const dt = document.createElement("dt");
    dt.textContent = field.name || `Field ${field.id}`;
    const dd = document.createElement("dd");
    if (field.type === "resource") {
      for (const value of values) {
        const line = document.createElement("div");
        line.className = "heurist-recordview-value-line";
        const link = document.createElement("a");
        link.href = "#";
        link.className = "heurist-recordview-resource-link";
        link.innerHTML = sanitizeTextHtml(value?.rec_Title || `#${value?.rec_ID ?? ""}`);
        link.addEventListener("click", (event) => {
          event.preventDefault();
          if (value?.rec_ID) onNavigate(value.rec_ID);
        });
        line.append(link);
        dd.append(line);
      }
    } else if (field.type === "blocktext") {
      for (const text of fieldValues(record, { field: String(field.id) })) {
        const line = document.createElement("div");
        line.className = "heurist-recordview-value-line";
        const plain = String(text ?? "");
        if (looksLikeJson(plain)) {
          line.classList.add("heurist-recordview-value-systemformat");
          line.textContent = $HR("Data in system format");
        } else {
          line.innerHTML = sanitizeTextHtml(plain, { extraTags: ["p"] });
        }
        dd.append(line);
      }
    } else {
      for (const text of fieldValues(record, { field: String(field.id) })) {
        const line = document.createElement("div");
        line.className = "heurist-recordview-value-line";
        line.textContent = String(text ?? "");
        dd.append(line);
      }
    }
    return [dt, dd];
  }

  /**
   * Give every section's `<dt>` label column the same width — each section's `<dl>` is its
   * own CSS grid, so left to `max-content` alone their columns would size independently and
   * labels would land at different x-positions section to section. Measures each label's
   * natural (already `max-content`-sized) width, then pins every section's column to the
   * widest one via a shared CSS variable.
   */
  #alignFieldLabels() {
    const dts = this.body.querySelectorAll(".heurist-recordview-section-fields dt");
    if (!dts.length) return;
    let maxWidth = 0;
    for (const dt of dts) maxWidth = Math.max(maxWidth, dt.getBoundingClientRect().width);
    for (const dl of this.body.querySelectorAll(".heurist-recordview-section-fields")) {
      dl.style.setProperty("--heurist-recordview-label-width", `${maxWidth}px`);
    }
  }

  /** Footer: created/modified dates, owner group id, and a visibility label. No rating/tags row (deferred). */
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

  /** Full uploaded-file URL (`?db={db}&file={obfuscatedId}`), for playback and full-size viewing. */
  #fileUrl(fileId) {
    return `${this.baseUrl}?db=${encodeURIComponent(this.database)}&file=${encodeURIComponent(fileId)}`;
  }

  /** OpenSeadragon viewer URL, for image files. */
  #osdUrl(fileId) {
    return `${this.baseUrl}hclient/widgets/viewers/openSeadragonViewer.php?db=${encodeURIComponent(this.database)}&recID=${encodeURIComponent(fileId)}`;
  }

  /** Mirador viewer URL, for everything else (audio/video/documents). */
  #miradorUrl(fileId) {
    return `${this.baseUrl}hclient/widgets/viewers/miradorViewer.php?db=${encodeURIComponent(this.database)}&id=${encodeURIComponent(fileId)}`;
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
