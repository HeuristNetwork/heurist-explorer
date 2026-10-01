/**
 * @file MapPopupController.js
 * @brief Content of the map feature popup: record selector, linked-record path
 *        and the record itself in the configured popup mode.
 *
 * One click can show:
 * - several features drawn at the same spot: a selector list (record type icon
 *   and title, about ten lines visible, then scrolling);
 * - a feature found through a linked geo field (e.g. Person > Life event > Place):
 *   the path of records, indented per level;
 * - otherwise the record directly.
 * Choosing a line shows that record in the configured mode, with a "Back" link;
 * in the Built-in (basic) mode the lines are not choosable - a line already shows
 * all the basic card would (title, record ID and type).
 * The record itself is rendered by the shared `RecordPopupContent` (also used by
 * heurist-graph).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { $HR } from '#shared/ui';
import { RecordPopupContent, normalizePopupMode } from '#shared/recordview/RecordPopupContent.js';
import { sanitizeTextHtml } from '#shared/recordview/FieldValueFormatter.js';
import './MapPopupController.css';

/**
 * @typedef {object} PopupRecord
 * @property {number} id Record ID.
 * @property {?number} rty Record type ID, when known.
 * @property {string} title Record title (may contain Heurist's inline markup).
 */

/**
 * @typedef {object} PopupEntry
 * @property {Array<PopupRecord>} chain Records from the mapped (top) record to the
 *           record holding the geometry; one record for a feature of the record itself.
 */

/** Builds and updates the content of the single map feature popup. */
export class MapPopupController {
  /**
   * @param {object} options Controller dependencies.
   * @param {object} options.mapEngine Map engine adapter (`openFeaturePopup`).
   * @param {?object} [options.popupProvider] Loads server-rendered popup HTML (standard/template modes).
   * @param {?object} [options.recordViewLoader] Shared `RecordViewLoader`, for the `basic` type names and `builtin` mode.
   * @param {?string} [options.baseUrl] Heurist base URL, for record type icons and media.
   * @param {?string} [options.database] Database name, for record type icons and media.
   * @param {() => boolean} [options.canEditRecords] Whether the host can edit records now (shows the edit pencil).
   * @param {?(recordId: number) => Promise<?object>} [options.editRecord] Opens the host record editor.
   */
  constructor({
    mapEngine, popupProvider = null, recordViewLoader = null, baseUrl = null, database = null,
    canEditRecords = () => false, editRecord = null
  }) {
    this.mapEngine = mapEngine;
    this.popupProvider = popupProvider;
    this.recordViewLoader = recordViewLoader;
    this.baseUrl = baseUrl;
    this.database = database;
    this.canEditRecords = canEditRecords;
    this.editRecord = editRecord;
    this.handle = null;
    this.content = null;
    this.entries = [];
    this.mode = 'basic';
  }

  /**
   * Open the popup for a clicked Heurist feature.
   *
   * @param {object} options Popup options.
   * @param {string} options.layerId Runtime layer of the clicked feature (popup anchor).
   * @param {string} options.featureId Clicked feature (popup anchor).
   * @param {?{latitude: number, longitude: number}} [options.latlng] Clicked coordinate.
   * @param {string} options.mode Popup mode or template; see `normalizePopupMode`.
   * @param {Array<PopupEntry>} options.entries Records at the clicked spot, the clicked one first.
   * @returns {boolean} Whether a popup was opened.
   */
  open({ layerId, featureId, latlng = null, mode, entries }) {
    const list = uniqueEntries(entries);
    if (!list.length) return false;
    this.content?.cancel();
    this.entries = list;
    const content = new RecordPopupContent({
      recordViewLoader: this.recordViewLoader,
      loadHtml: this.popupProvider?.isConfigured?.()
        ? (id, template, signal) => this.popupProvider.load(id, { template, signal })
        : null,
      baseUrl: this.baseUrl,
      database: this.database,
      canEditRecords: this.canEditRecords,
      editRecord: this.editRecord,
      onLayout: () => this.handle?.update?.()
    });
    this.content = content;
    this.handle = this.mapEngine.openFeaturePopup?.(layerId, featureId, content.element, { latlng }) || null;
    if (!this.handle) return false;
    this.mode = normalizePopupMode(mode);
    if (list.length === 1 && list[0].chain.length === 1) content.showRecord(list[0].chain[0], mode);
    else content.showView(() => this.#buildList(content), mode);
    return true;
  }

  /**
   * Open the popup with prepared HTML (non-Heurist features: their property table).
   *
   * @param {object} options Popup options.
   * @param {string} options.layerId Runtime layer of the clicked feature.
   * @param {string} options.featureId Clicked feature.
   * @param {?{latitude: number, longitude: number}} [options.latlng] Clicked coordinate.
   * @param {string} options.html Popup HTML.
   * @returns {boolean} Whether a popup was opened.
   */
  openHtml({ layerId, featureId, latlng = null, html }) {
    this.content?.cancel();
    this.content = null;
    this.handle = this.mapEngine.openFeaturePopup?.(layerId, featureId, String(html), { latlng }) || null;
    return Boolean(this.handle);
  }

  /** Close the popup and cancel pending content requests. */
  close() {
    this.content?.cancel();
    this.content = null;
    this.handle?.close?.();
    this.handle = null;
  }

  /** Selector list: the records at this spot, linked-record paths indented per level. */
  #buildList(content) {
    const list = document.createElement('div');
    list.className = 'heurist-map-popup-list';
    list.setAttribute('role', 'listbox');
    const appendNodes = (nodes, depth) => {
      for (const node of nodes.values()) {
        list.append(this.#buildListItem(content, node.record, depth));
        appendNodes(node.children, depth + 1);
      }
    };
    appendNodes(recordTree(this.entries), 0);
    return list;
  }

  /**
   * One selector line: record type icon and title; choosing it shows the record.
   * In the basic mode a plain row: the line is the whole basic card.
   */
  #buildListItem(content, record, depth) {
    const basic = this.mode === 'basic';
    const item = document.createElement(basic ? 'div' : 'button');
    item.className = basic ? 'heurist-map-popup-item heurist-map-popup-item-static' : 'heurist-map-popup-item';
    if (!basic) {
      item.type = 'button';
      item.setAttribute('role', 'option');
    }
    item.style.paddingLeft = `${6 + depth * 16}px`;
    const iconUrl = content.iconUrl(record.rty);
    if (iconUrl) {
      const icon = document.createElement('img');
      icon.className = 'heurist-map-popup-item-icon';
      icon.src = iconUrl;
      icon.alt = '';
      item.append(icon);
    }
    const title = document.createElement('span');
    title.className = 'heurist-map-popup-item-title';
    title.innerHTML = sanitizeTextHtml(record.title || `${$HR('Record')} ${record.id}`);
    item.title = `${title.textContent} (${$HR('Record')} ${record.id})`;
    item.append(title);
    if (!basic) item.addEventListener('click', () => content.openRecord(record));
    return item;
  }
}

/**
 * Drop entries with an invalid record or the same record path as an earlier entry.
 *
 * @param {Array<PopupEntry>} entries Raw entries.
 * @returns {Array<PopupEntry>} Valid, distinct entries in their original order.
 */
export function uniqueEntries(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const chain = (entry?.chain || []).filter((record) => Number(record?.id) > 0);
    if (!chain.length) continue;
    const key = chain.map((record) => record.id).join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ chain });
  }
  return result;
}

/**
 * Merge record paths into a tree, so paths starting with the same records share
 * their lines (e.g. one person reaching the place through two events).
 *
 * @param {Array<PopupEntry>} entries Distinct entries.
 * @returns {Map<string, {record: PopupRecord, children: Map}>} Top-level nodes in entry order.
 */
export function recordTree(entries) {
  const top = new Map();
  for (const entry of entries) {
    let level = top;
    for (const record of entry.chain) {
      const key = String(record.id);
      if (!level.has(key)) level.set(key, { record, children: new Map() });
      level = level.get(key).children;
    }
  }
  return top;
}
