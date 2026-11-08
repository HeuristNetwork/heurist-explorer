/**
 * @file WebsiteCheck.js
 * @brief Result of the check of a website (review 2026-11-08): problems of the format of all its pages, then the
 *        records a visitor can not see (the website, its pages, records picked on the pages: record fields, media,
 *        generated reports, record cards, media galleries) in HRecordLists with owner, visibility, edit and info.
 *        Used by the Website manager (details) and by the CMS designer (popup).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HBaseWidget } from '#shared/widgets';
import { HRecordList } from '#shared/widgets/record-list/HRecordList.js';
import { RecordListLoader } from '#shared/data/RecordListLoader.js';
import { $HR } from '#shared/ui';
import './WebsiteCheck.css';

/** Groups of the records a visitor can not see, by `role` of the check. */
const GROUPS = [
  ['website', 'Website'],
  ['page', 'Pages'],
  ['reference', 'Records used on the pages']
];

/** Names of the elements that refer to records (`kind` of the check). */
const KIND_TEXT = {
  field: 'Record field',
  media: 'Media',
  report: 'Generated report',
  cards: 'Record cards',
  gallery: 'Media gallery'
};

/** Visibility of a record as text (missing records are not in the lists). */
const VISIBILITY_TEXT = { hidden: 'Hidden (owners only)', viewable: 'Logged-in users only' };

/** Problems and records a visitor can not see. */
export class WebsiteCheck extends HBaseWidget {
  /**
   * @param {HTMLElement} container Host element.
   * @param {object} options
   * @param {object} options.apiClient HeuristApiClient.
   * @param {Function} [options.onEditRecord] `(id)` → Promise; edit a record (the check runs again after it).
   * @param {Function} [options.onViewRecord] `(id)` - view a record.
   * @param {Function} [options.onRecheck] `()` - run the check again (after an edit).
   * @param {string} [options.baseUrl] Heurist base URL (record type icons).
   * @param {string} [options.database] Database name.
   * @returns {WebsiteCheck}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.lists = [];
    this.result = null;
    return this;
  }

  /**
   * Show a check result.
   *
   * @param {{issues?: Array<object>, records?: Array<object>}} result Answer of `GET /website/{id}/validate`.
   * @returns {Promise<void>}
   */
  async setResult(result) {
    this.result = result || {};
    await this._destroyLists();
    const root = el('div', 'h-website-check');
    this.container.replaceChildren(root);
    this._renderIssues(root, this.result.issues || []);
    await this._renderRecords(root, this.result.records || []);
  }

  _renderIssues(root, issues) {
    const section = el('section', 'h-website-check-section', root);
    el('h4', '', section).textContent = $HR('Format');
    if (!issues.length) {
      el('p', 'h-website-ok', section).textContent = $HR('No problems found');
      return;
    }
    // grouped by page; header, footer and website problems come with the first page (the home)
    const pages = new Map();
    for (const issue of issues) {
      const key = String(issue.page || 0);
      if (!pages.has(key)) pages.set(key, { title: issue.pageTitle || '', issues: [] });
      pages.get(key).issues.push(issue);
    }
    for (const page of pages.values()) {
      if (pages.size > 1 || page.title) el('div', 'h-website-check-page', section).textContent = page.title;
      const list = el('ul', 'h-website-issues', section);
      for (const issue of page.issues) {
        const item = el('li', `h-website-issue h-website-issue-${issue.level || 'warning'}`, list);
        item.textContent = `${issue.message}${issue.node ? ` (${issue.node})` : ''}`;
      }
    }
  }

  async _renderRecords(root, records) {
    const section = el('section', 'h-website-check-section', root);
    el('h4', '', section).textContent = $HR('Records a visitor can not see');
    if (!records.length) {
      el('p', 'h-website-ok', section).textContent = $HR('All records are public');
      return;
    }
    el('p', 'h-muted', section).textContent = $HR('These records are not public: visitors do not see them or their parts of the pages.');
    for (const [role, title] of GROUPS) {
      const rows = records.filter((record) => record.role === role && record.visibility !== 'missing');
      if (!rows.length) continue;
      el('div', 'h-website-check-group', section).textContent = $HR(title);
      await this._renderList(el('div', 'h-website-check-list', section), rows);
    }
    const missing = records.filter((record) => record.visibility === 'missing');
    if (missing.length) {
      const note = el('p', 'h-website-issue h-website-issue-warning', section);
      note.textContent = `${$HR('Records not found')}: ${missing.map((record) => `${record.id} (${usedInText(record)})`).join(', ')}`;
    }
  }

  async _renderList(host, rows) {
    const byId = new Map(rows.map((row) => [Number(row.id), row]));
    const loader = new RecordListLoader({
      apiClient: this.options.apiClient,
      query: [{ ids: [...byId.keys()].join(',') }, { sortby: 'set' }]
    });
    const list = new HRecordList();
    this.lists.push(list);
    await list.initialize({
      container: host,
      options: {
        viewMode: 'list',
        pageLength: 100,
        topBar: false,
        controls: { pageSize: false, search: false, counter: false, pagination: false, viewMode: false, selectionActions: false },
        baseUrl: this.options.baseUrl,
        database: this.options.database,
        emptyResultMessage: $HR('You can not see these records'),
        interaction: {
          adminInfoEnabled: true,
          editEnabled: typeof this.options.onEditRecord === 'function',
          popupEnabled: typeof this.options.onViewRecord === 'function',
          selectionEnabled: false,
          persistentSelectionEnabled: false
        }
      },
      onDataRequest: (request) => loader.load(request),
      onEditRecord: (id) => void this._edit(id),
      onViewRecord: (id) => this.options.onViewRecord?.(Number(id)),
      // visibility and where the record is used
      recordTools: (record) => {
        const row = byId.get(Number(record?.rec_ID));
        if (!row) return null;
        const note = el('span', 'h-website-check-used');
        note.textContent = [$HR(VISIBILITY_TEXT[row.visibility] || row.visibility), usedInText(row)].filter(Boolean).join(' · ');
        return note;
      }
    });
    await list.reload();
  }

  async _edit(id) {
    await this.options.onEditRecord?.(Number(id));
    this.options.onRecheck?.();
  }

  async _destroyLists() {
    const lists = this.lists || [];
    this.lists = [];
    await Promise.all(lists.map((list) => list.destroy()));
  }

  /** @returns {Promise<void>} */
  async destroy() {
    await this._destroyLists();
    await super.destroy();
  }
}

/** "About · Record field (n3); Team · Record cards (c1)". */
function usedInText(record) {
  return (record.usedIn || [])
    .map((use) => `${use.pageTitle || `#${use.page}`} · ${$HR(KIND_TEXT[use.kind] || use.kind)}${use.node ? ` (${use.node})` : ''}`)
    .join('; ');
}

function el(tag, className, parent = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.append(node);
  return node;
}
