/**
 * @file WebsiteCheck.js
 * @brief Result of the check of a website (review 2026-11-08): three sections - problems of the format of all its
 *        pages, pages a visitor can not see, records used on the pages that a visitor can not see (also record
 *        fields whose field or values are hidden from the public). Records are shown in HRecordLists with owner,
 *        visibility, edit and info; the records used on the pages with the page name and, as a tooltip, the
 *        elements. Used by the Website manager (details) and by the CMS designer (popup).
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

/** Names of the elements that refer to records (`kind` of the check). */
const KIND_TEXT = {
  field: 'Record field',
  media: 'Media',
  report: 'Generated report',
  cards: 'Record cards',
  gallery: 'Media gallery'
};

/** Texts of the three sections. */
const TEXT = {
  format: {
    title: 'Format',
    tip: 'Problems of the HTML and of the settings of the pages. An error can stop a part of the page from being shown; '
      + 'warnings should be corrected too. The element is given in brackets: open the page in the website editor and '
      + 'correct or remove it.',
    ok: 'All is correct. No problems of the format.'
  },
  pages: {
    title: 'Non public pages',
    tip: 'These pages are not public, the visitors do not see them. Open Record Editor and make this page Public in '
      + 'summary section.',
    ok: 'All is correct. All pages are public.'
  },
  records: {
    title: 'Non public records on pages',
    tip: 'Elements refer to non public records. Their values will not be visible to visitors. Open Record Editor and '
      + 'make the record Public in summary section. For a Record field the field itself or some of its values may be '
      + 'hidden from the public: change the visibility of the value in Record Editor.',
    ok: 'All is correct. All records used on the pages are public.'
  }
};

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
    const records = this.result.records || [];
    this._renderIssues(root, this.result.issues || []);
    el('hr', 'h-website-check-line', root);
    await this._renderPages(root, records.filter((record) => record.role === 'website' || record.role === 'page'));
    el('hr', 'h-website-check-line', root);
    await this._renderRecords(root, records.filter((record) => record.role === 'reference'));
  }

  /** Section with its title and tip; `count` 0 shows the OK message instead of the tip. */
  _section(root, texts, count) {
    const section = el('section', 'h-website-check-section', root);
    const head = el('h4', 'h-website-check-title', section);
    head.textContent = $HR(texts.title);
    if (count) el('span', 'h-website-check-count', head).textContent = String(count);
    if (count) el('p', 'h-website-check-tip', section).textContent = $HR(texts.tip);
    else el('p', 'h-website-ok', section).textContent = $HR(texts.ok);
    return section;
  }

  _renderIssues(root, issues) {
    const section = this._section(root, TEXT.format, issues.length);
    if (!issues.length) return;
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

  async _renderPages(root, rows) {
    const section = this._section(root, TEXT.pages, rows.length);
    if (rows.length) await this._renderList(el('div', 'h-website-check-list', section), rows, false);
  }

  async _renderRecords(root, rows) {
    const section = this._section(root, TEXT.records, rows.length);
    const found = rows.filter((record) => record.visibility !== 'missing');
    if (found.length) await this._renderList(el('div', 'h-website-check-list', section), found, true);
    const missing = rows.filter((record) => record.visibility === 'missing');
    if (missing.length) {
      const note = el('p', 'h-website-issue h-website-issue-warning', section);
      note.textContent = `${$HR('Records not found (deleted?)')}: ${missing.map((record) => `${record.id} (${usedInText(record)})`).join('; ')}`;
    }
  }

  /** Records in a standard HRecordList; `withPages`: the page name column (the elements as its tooltip). */
  async _renderList(host, rows, withPages) {
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
      recordTools: withPages ? (record) => pageColumn(byId.get(Number(record?.rec_ID))) : undefined
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

/**
 * Pages and elements with a problem in a check result (the designer highlights them in its trees).
 *
 * @param {{issues?: Array<object>, records?: Array<object>}} result Answer of `GET /website/{id}/validate`.
 * @returns {{pages: Set<number>, nodes: Map<number, Set<string>>}} Page ids, and the element names per page.
 */
export function checkProblemPlaces(result) {
  const pages = new Set();
  const nodes = new Map();
  const add = (page, node) => {
    const id = Number(page) || 0;
    if (!id) return;
    pages.add(id);
    if (!node) return;
    if (!nodes.has(id)) nodes.set(id, new Set());
    nodes.get(id).add(String(node));
  };
  for (const issue of result?.issues || []) add(issue.page, issue.node);
  for (const record of result?.records || []) {
    if (record.role === 'website' || record.role === 'page') add(record.id, null);
    for (const use of record.usedIn || []) add(use.page, use.node);
  }
  return { pages, nodes };
}

/** Column of a record used on the pages: the page name(s); the elements and hidden fields as the tooltip. */
function pageColumn(row) {
  if (!row) return null;
  const pages = [...new Set((row.usedIn || []).map((use) => use.pageTitle || `#${use.page}`))];
  const cell = el('div', 'h-website-check-pages');
  if (row.fields?.length) el('i', 'fa-solid fa-eye-slash h-website-check-field', cell).setAttribute('aria-hidden', 'true');
  el('span', 'h-website-check-pages-text', cell).textContent = pages.join(', ');
  const lines = [usedInText(row, '\n')];
  for (const field of row.fields || []) {
    lines.push(`${field.name}: ${$HR(field.state === 'partly' ? 'some values are not public' : 'not public')}`);
  }
  cell.title = lines.filter(Boolean).join('\n');
  return cell;
}

/** "About · Record field (n3); Team · Record cards (c1)". */
function usedInText(record, separator = '; ') {
  return (record.usedIn || [])
    .map((use) => `${use.pageTitle || `#${use.page}`} · ${$HR(KIND_TEXT[use.kind] || use.kind)}${use.node ? ` (${use.node})` : ''}`)
    .join(separator);
}

function el(tag, className, parent = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.append(node);
  return node;
}
