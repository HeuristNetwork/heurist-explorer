/**
 * @file CmsDesigner.js
 * @brief The CMS designer of v4 websites and standalone pages (plan 27c), over the whole screen.
 *
 * West (reviews 2026-10-31, 2026-11-01): toolbar (Properties, Styles, Help, Close), preview language and page width, tabs
 * *Site* (the website tree: Header, Home with the menu pages, Footer; drag and drop = `assign`, saved at once) and
 * *Page* (Undo / Redo / Save / Discard, the structure of the open part with drag and drop, the element picker and
 * the properties of the selected node), then a help panel. Center: the preview alone (CmsPreview).
 *
 * Draft per part: edits change the record document (cmsEdit.js) and the preview; Save PATCHes only the changed
 * fields with the record's `rec_Modified` (one value per record: header, home and footer are one record);
 * leaving a dirty part asks Save / Discard / Cancel; undo / redo per part. The website Styles are saved at once
 * and only when no part is dirty. Runs only inside Explorer (its bridge edits records and configures modules).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR, HMsg } from '#shared/ui';
import { HCardinalLayout } from '#shared/widgets/layout/HCardinalLayout.js';
import { HTree } from '#shared/widgets/tree/HTree.js';
import { createTabSet } from '#shared/widgets/layout/tabs.js';
import { CMS_ELEMENTS, CMS_PAGE_PRESETS, CMS_TEAM_TEMPLATE, cmsPageStarter } from '#shared/site/cmsEdit.js';
import { normalizeRecordLimits } from '#shared/recordview/recordLimits.js';
import { CMS_MEDIA_DEFAULTS, buildCmsGalleryItem, buildCmsMedia, cmsMediaCaption, cmsMediaView } from '#shared/site/cmsMedia.js';
import { fileMediaUrls } from '#shared/recordview/fileMediaItem.js';
import { systemFieldIds } from '#shared/data/systemEntities.js';
import { TranslationClient } from '#shared/data/TranslationClient.js';
import { oneAtATime } from '#shared/ui/oneAtATime.js';
import { openTextTranslationDialog } from '#shared/widgets/translation/HTextTranslationDialog.js';
import { openTranslationDialog } from '#shared/widgets/translation/HTranslationDialog.js';
import { CmsPreview, PREVIEW_WIDTHS } from './CmsPreview.js';
import { openCardsForm, openFieldForm, openMediaForm, openReportForm, teamReportBody } from './widgetForms.js';
import {
  changedDetails, dropPlace, menuPlace, previewUrl, recordDocument, subPageIds
} from './designerData.js';
import {
  askConflict, askRemovePage, askSaveDiscard, confirm, confirmNear, openAddElementForm,
  openAddPageForm, openStyleForm, openStylesDialog
} from './designerDialogs.js';
import './designer.css';

const PART_LABELS = Object.freeze({ header: 'Header', content: 'Home', footer: 'Footer' });
const ROOT = '#root';

/** Icons of the website parts and pages (Site tree and the root of the part tree). */
const PART_ICONS = Object.freeze({ header: 'fa-heading', content: 'fa-house', footer: 'fa-f', page: 'fa-file-lines' });
const CLIP_KEY = 'heurist.cms.clipboard';
const HELP_KEY = 'heurist.cms.help';

/** Texts of the help panel below the trees. */
const HELP = Object.freeze({
  site: [
    'Drag pages to change their order in the main menu of the website; drop a page onto another one to make it a sub page.',
    'Add a page with "Add page" on Home, a sub page with + of a page; × removes a page from the website.',
    'Click Header, Home, Footer or a page to edit it on the Page tab.',
    'Properties edits the website record; Styles sets the colours, fonts and common styles of the whole website.'
  ],
  page: [
    'Drag elements to change their order on the page; groups, tabs and accordions take other elements inside.',
    'Add elements with "Add element" on the page or + of a group, or below the tree: there they go into the selected group or after the selected element.',
    'Select an element here or in the preview to edit its content, properties and style. Changes are kept until you Save or Discard them.'
  ]
});

/** The CMS designer. */
export class CmsDesigner {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container Host over the whole screen.
   * @param {object} options.apiClient HeuristApiClient.
   * @param {object} options.websites WebsiteClient.
   * @param {object} options.bridge Explorer's bridge: editRecord, browseRecords, openConfiguration, configureExplorerInstance.
   * @param {object} [options.dbdefs] HDbDefs of the database (`meta.javaScriptAllowed`: the Custom CSS warning).
   * @param {{baseUrl: string, database: string}} options.runtime
   * @param {() => void} [options.onClose]
   * @param {(name: string) => Promise<Function>} [options.loadEditor] createTinyMceEditor (lazy; tests).
   */
  constructor(options) {
    this.options = options;
    // the forms of an element load before they show: a repeated click must not open a second copy
    const single = oneAtATime();
    for (const name of ['_editText', '_editField', '_editMedia', '_editCaption', '_configure', '_ownStyle']) {
      this[name] = single(this[name]);
    }
    this.apiClient = options.apiClient;
    this.websites = options.websites;
    this.bridge = options.bridge || null;
    this.records = new Map();
    // the record managers of the forms, kept for the life of the designer (plan 27e §11)
    this.browsers = new Map();
    this.current = null;
    this.selectedNode = null;
    this.undoStack = [];
    this.redoStack = [];
    this.language = null;
    // Side by side / Show HTML of the text popup, kept between openings
    this.textDialogState = {};
    this.clipboard = readClipboard(options.runtime?.database);
  }

  /**
   * Open a website (or a standalone page) and one of its parts.
   *
   * @param {number} recordId Website or standalone page.
   * @param {{page?: number}} [options] A page of the website to open first.
   * @returns {Promise<boolean>} False when it can not be opened (not format 4, no bridge).
   */
  async open(recordId, { page = 0 } = {}) {
    if (!this.bridge?.editRecord) {
      HMsg.showMsgErr?.($HR('The website editor works only inside Explorer.'));
      return false;
    }
    this.codes = await this.websites.codes();
    const summary = await this.websites.summary(recordId);
    if (!summary.v4) {
      HMsg.showMsgErr?.($HR('This website is of an older format: open it in the legacy website editor.'));
      return false;
    }
    if (summary.kind === 'page') {
      HMsg.showMsgErr?.($HR('Open the website of this page in the editor.'));
      return false;
    }
    this.site = summary.kind === 'website' ? summary : null;
    this.standalone = summary.kind === 'standalone' ? summary : null;
    this.readOnly = !summary.canEdit;
    this._render();
    const first = this.site && page && menuPlace(this.site.pages, page) ? { recordId: page, part: 'content' } : { recordId, part: 'content' };
    await this.selectPart(first.recordId, first.part, { force: true });
    return true;
  }

  /** Close (asks about unsaved changes). */
  async close() {
    if (!(await this._leaveDirty())) return false;
    this.destroy();
    this.options.onClose?.();
    return true;
  }

  /** Remove the designer. */
  destroy() {
    globalThis.window?.removeEventListener?.('beforeunload', this._unload);
    for (const browser of this.browsers.values()) void browser.destroy?.();
    this.browsers.clear();
    this.preview?.destroy();
    this.layout?.destroy();
    this.root?.remove();
    this.root = null;
  }

  /** Whether the open part has changes that are not saved. */
  isDirty() {
    const record = this.current && this.records.get(this.current.recordId);
    return Boolean(record) && JSON.stringify(record.doc.serialize()) !== JSON.stringify(record.saved);
  }

  /**
   * Open a part: header / content / footer of the website, the content of a page.
   *
   * @param {number} recordId
   * @param {string} part
   * @param {{force?: boolean}} [options] force: no question about changes (start).
   */
  async selectPart(recordId, part, { force = false } = {}) {
    if (!force && this.current?.recordId === recordId && this.current.part === part) return;
    if (!force && !(await this._leaveDirty())) {
      this.siteTree?.select(this._partItemId(this.current));
      return;
    }
    const before = this.current;
    await this._record(recordId);
    if (this.site && recordId !== this.site.id) await this._record(this.site.id);
    this.current = { recordId, part };
    this.selectedNode = null;
    this.undoStack = [];
    this.redoStack = [];
    this.siteTree?.select(this._partItemId(this.current));
    this._renderPart();
    if (!before || this._previewPage(before) !== this._previewPage(this.current)) this._loadPreview();
    else this._applyPreview();
    this._updateBar();
  }

  /** Save the open part (Ctrl+S). */
  async save({ force = false } = {}) {
    if (!this.current || this.readOnly) return true;
    return this._saveRecord(this.current.recordId, { force });
  }

  /** Back to the saved state of the open record. */
  discard() {
    const record = this.current && this.records.get(this.current.recordId);
    if (!record) return;
    record.doc = recordDocument(record.record, this.codes);
    this.undoStack = [];
    this.redoStack = [];
    this._renderPart();
    this._loadPreview();
    this._updateBar();
  }

  /** Undo the last change of the part. */
  undo() {
    const record = this._currentRecord();
    if (!record || !this.undoStack.length) return;
    this.redoStack.push(record.doc.snapshot());
    record.doc.restore(this.undoStack.pop());
    this._changed();
  }

  /** Redo a change. */
  redo() {
    const record = this._currentRecord();
    if (!record || !this.redoStack.length) return;
    this.undoStack.push(record.doc.snapshot());
    record.doc.restore(this.redoStack.pop());
    this._changed();
  }

  // ------------------------------------------------------------------ records

  async _record(id, { reload = false } = {}) {
    if (!reload && this.records.has(id)) return this.records.get(id);
    const entity = this.site && id === this.site.id ? 'website' : 'page';
    const response = await this.apiClient.request(`/${entity}/${id}`, { method: 'GET', query: { fields: '_all' } });
    const data = response?.data ?? response;
    const record = data?.records?.[0];
    if (!record) throw new Error(`Record ${id} was not found`);
    const doc = recordDocument(record, this.codes);
    const entry = { id, entity, record, doc, saved: doc.serialize(), modified: String(record.rec_Modified || ''), canEdit: data.meta?.canEdit !== false };
    this.records.set(id, entry);
    return entry;
  }

  /** Save the changed fields of a record; `extra`: other fields to send (Custom CSS). */
  async _saveRecord(id, { force = false, extra = {} } = {}) {
    const record = this.records.get(id);
    if (!record) return true;
    const now = record.doc.serialize();
    const details = { ...changedDetails(now, record.saved, this.codes), ...extra };
    if (!Object.keys(details).length) return true;
    const issues = record.doc.check(this.options.runtime?.baseUrl || '').filter((issue) => issue.level === 'error');
    if (issues.length) {
      HMsg.showMsgErr?.(issues.map((issue) => issue.message).join('\n'));
      return false;
    }
    try {
      const response = await this.apiClient.request(`/${record.entity}/${id}`, {
        method: 'PATCH',
        query: force ? { force: 1 } : null,
        body: { rec_ID: id, rec_Modified: record.modified, details }
      });
      const saved = (response?.data ?? response)?.records?.[0];
      record.saved = now;
      record.modified = String(saved?.rec_Modified || record.modified);
      if (saved) record.record = { ...record.record, ...saved };
      if (Object.keys(extra).length) record.record = { ...record.record, details: { ...record.record.details, ...mapValues(extra) } };
    } catch (error) {
      if (error?.status === 409 && !force) {
        const answer = await askConflict();
        if (answer === 'overwrite') return this._saveRecord(id, { force: true, extra });
        if (answer === 'reload') {
          await this._record(id, { reload: true });
          this.undoStack = [];
          this.redoStack = [];
          this._renderPart();
          this._loadPreview();
          this._updateBar();
        }
        return false;
      }
      HMsg.showMsgErr?.(error?.message || String(error));
      return false;
    }
    this._updateBar();
    HMsg.showMsgFlash?.($HR('Saved'), { showDelay: 1200 });
    // a new Record field: the server knows it now
    if (this.preview?.unknownField) this._loadPreview();
    return true;
  }

  /** rec_Modified of the loaded records again (after menu changes: they changed on the server). */
  async _refreshModified() {
    for (const record of this.records.values()) {
      try {
        const response = await this.apiClient.request(`/${record.entity}/${record.id}`, { method: 'GET', query: { fields: 'rec_ID,rec_Modified' } });
        const value = (response?.data ?? response)?.records?.[0]?.rec_Modified;
        if (value) record.modified = String(value);
      } catch {
        this.records.delete(record.id); // deleted
      }
    }
  }

  async _leaveDirty() {
    if (!this.isDirty()) return true;
    const answer = await askSaveDiscard(this._partLabel());
    if (answer === 'save') return this.save();
    if (answer === 'discard') {
      const record = this._currentRecord();
      record.doc = recordDocument(record.record, this.codes);
      return true;
    }
    return false;
  }

  _currentRecord() {
    return this.current ? this.records.get(this.current.recordId) : null;
  }

  // ------------------------------------------------------------------ screen

  _render() {
    const root = element('div', 'h-cms-designer');
    root.tabIndex = -1;
    this.root = root;
    this.options.container.append(root);
    const body = element('div', 'h-cms-body');
    root.append(body);
    this.layout = new HCardinalLayout(body, { westSize: 360, minWest: 280, splitterButtons: true });
    this.layout.setContent('west', this._renderWest());
    this.layout.show('west');
    const center = element('div', 'h-cms-center');
    this.layout.setContent('center', center);
    this.previewNote = element('div', 'h-cms-preview-note');
    this.previewNote.textContent = $HR('The preview shows the saved page only: it comes from another address than this editor'
      + ' (e.g. a development server). Open the editor from Heurist to see the changes in the preview.');
    this.previewNote.hidden = true;
    const previewHost = element('div', 'h-cms-preview-host');
    center.append(this.previewNote, previewHost);
    this.preview = new CmsPreview(previewHost, {
      baseUrl: this.options.runtime?.baseUrl || '',
      onHover: (id) => this.partTree?.highlight(id),
      onSelect: (id) => this._selectNode(id, { fromPreview: true }),
      onReady: () => {
        this.previewNote.hidden = true;
        this._applyPreview();
      },
      onUnavailable: () => { this.previewNote.hidden = false; }
    });
    root.addEventListener('keydown', (event) => this._key(event));
    this._unload = (event) => {
      if (!this.isDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    globalThis.window?.addEventListener?.('beforeunload', this._unload);
    root.focus?.();
  }

  /** West pane: toolbar, page widths, the tabs Site | Page and the help panel; the preview is alone in the center. */
  _renderWest() {
    const west = element('div', 'h-cms-west');
    west.append(this._renderToolbar(), this._renderViewBar());
    this.partPane = element('div', 'h-cms-part-pane');
    const pagePanel = element('div', 'h-cms-page-panel');
    pagePanel.append(this._renderPageBar(), this.partPane);
    this.tabs = createTabSet({ prefix: 'h-cms', onSelect: () => this._tabChanged() });
    if (this.site) this.tabs.add($HR('Site'), this._renderSitePane()).title = this.site.title || '';
    const pageTab = this.tabs.add($HR('Page'), pagePanel);
    this.dirtyMark = element('span', 'h-cms-dirty');
    this.dirtyMark.textContent = ' ●';
    this.dirtyMark.title = $HR('Changes not saved');
    this.dirtyMark.hidden = true;
    pageTab.append(this.dirtyMark);
    this.help = element('div', 'h-cms-help');
    this.help.hidden = !readHelpShown();
    west.append(this.tabs.element, this.help);
    this.tabs.select(0);
    return west;
  }

  /** Toolbar above the tabs: Properties, Styles, Help, Close. */
  _renderToolbar() {
    const bar = element('div', 'h-cms-toolbar');
    if (!this.readOnly) {
      this.propertiesButton = barButton('fa-gear', 'Properties', () => this._editRecord(this._propertiesRecord()), 'Properties');
      bar.append(this.propertiesButton, barButton('fa-palette', 'Styles of the whole website', () => this._styles(), 'Styles'));
    }
    bar.append(
      element('span', 'h-cms-toolbar-spacer'),
      barButton('fa-circle-question', 'Show or hide the help', () => this._toggleHelp()),
      barButton('fa-door-open', 'Close', () => this.close(), 'Close')
    );
    return bar;
  }

  /** Toolbar of the Page tab: Undo, Redo, Discard and, on the right, Save. */
  _renderPageBar() {
    const bar = element('div', 'h-cms-pane-bar');
    if (this.readOnly) {
      const note = element('span', 'h-cms-readonly');
      note.textContent = $HR('Read only: you can not change this website');
      bar.append(note);
      return bar;
    }
    this.buttons = {
      undo: barButton('fa-rotate-left', 'Undo (Ctrl+Z)', () => this.undo()),
      redo: barButton('fa-rotate-right', 'Redo (Ctrl+Y)', () => this.redo()),
      save: barButton('fa-floppy-disk', 'Save (Ctrl+S)', () => this.save(), 'Save'),
      discard: barButton('fa-xmark', 'Discard the changes', async () => {
        if (await confirm(this._discardQuestion(), { yes: 'Discard', narrow: true })) this.discard();
      }, 'Discard')
    };
    this.buttons.save.classList.add('h-btn-primary');
    bar.append(this.buttons.undo, this.buttons.redo, this.buttons.discard, element('span', 'h-cms-toolbar-spacer'), this.buttons.save);
    return bar;
  }

  /** 'Discard the changes of page "About"?', or of Header / Home / Footer. */
  _discardQuestion() {
    const name = this._partLabel();
    if (this.site && this.current?.recordId === this.site.id) return `${$HR('Discard the changes of')} ${name}?`;
    return `${$HR('Discard the changes of page')} "${name}"?`;
  }

  _updateBar() {
    const dirty = this.isDirty();
    this.dirtyMark.hidden = !dirty;
    if (this.buttons) {
      this.buttons.save.disabled = !dirty;
      this.buttons.discard.disabled = !dirty;
      this.buttons.undo.disabled = !this.undoStack.length;
      this.buttons.redo.disabled = !this.redoStack.length;
    }
  }

  /** Second row, right aligned: preview language (several languages only) and page width of the preview. */
  _renderViewBar() {
    const bar = element('div', 'h-cms-view-bar');
    const languages = this.site?.languages || [];
    if (languages.length > 1) {
      const select = element('select', 'h-select h-compact');
      select.title = $HR('Preview language');
      for (const code of languages) select.append(option(code, code.toUpperCase()));
      select.addEventListener('change', () => {
        this.language = select.value === languages[0] ? null : select.value;
        this._loadPreview();
      });
      bar.append(caption('Language'), select);
    }
    const width = element('select', 'h-select h-compact');
    width.title = $HR('Page width of the preview');
    for (const value of PREVIEW_WIDTHS) width.append(option(String(value), value ? `${value} px` : $HR('Full width')));
    width.addEventListener('change', () => this.preview.setWidth(Number(width.value) || 0));
    bar.append(caption('Page width'), width);
    return bar;
  }

  /** Whether the Site tab is shown (a website, not a standalone page). */
  _siteTabActive() {
    return Boolean(this.site) && this.tabs?.selected === 0;
  }

  /** Record of *Properties*: the website on the Site tab, the open record (website or page) on the Page tab. */
  _propertiesRecord() {
    if (this._siteTabActive()) return this.site.id;
    return this.current?.recordId || (this.site || this.standalone).id;
  }

  _showPageTab() {
    const last = this.tabs ? this.tabs.panels.length - 1 : 0;
    if (this.tabs && this.tabs.selected !== last) this.tabs.select(last);
  }

  _tabChanged() {
    if (this.propertiesButton) {
      this.propertiesButton.title = $HR(this._propertiesRecord() === this.site?.id ? 'Website properties' : 'Page properties');
    }
    this._renderHelp();
  }

  _toggleHelp() {
    this.help.hidden = !this.help.hidden;
    writeHelpShown(!this.help.hidden);
    this._renderHelp();
  }

  /** Help below the tree: Site tab, Page tab, or the selected element. */
  _renderHelp() {
    if (!this.help || this.help.hidden) return;
    let texts = HELP.page;
    if (this._siteTabActive()) {
      texts = HELP.site;
    } else {
      const node = this.selectedNode ? this._treeItem(this.selectedNode) : null;
      if (node) texts = elementHelp(node, this._currentRecord(), (this.site?.languages || []).length > 1);
    }
    this.help.replaceChildren(...texts.map((text) => {
      const line = element('p');
      line.textContent = $HR(text);
      return line;
    }));
  }

  // ------------------------------------------------------------------ website tree (Site tab)

  _renderSitePane() {
    const pane = element('div', 'h-cms-site-pane');
    const host = element('div', 'h-cms-tree-host');
    pane.append(host);
    this.siteTree = new HTree().attach(host, {
      items: this._siteItems(),
      tools: (item) => this._siteTools(item),
      canDrop: (dragId, targetId, position) => this._canDropPage(dragId, targetId, position),
      onDrop: (dragId, targetId, position) => void this._dropPage(dragId, targetId, position),
      onSelect: (id) => void this._selectSiteItem(id),
      onTool: (action, id) => void this._siteTool(action, id),
      ...(this.readOnly ? { onDrop: null } : {})
    }).render();
    return pane;
  }

  _siteItems() {
    const pages = (list) => (list || []).map((page) => ({
      id: `page:${page.id}`, label: page.title || `#${page.id}`, icon: PART_ICONS.page, bold: true, children: pages(page.children)
    }));
    return [
      { id: 'part:header', label: $HR('Header'), icon: PART_ICONS.header, bold: true, draggable: false },
      { id: 'part:content', label: $HR('Home'), icon: PART_ICONS.content, bold: true, draggable: false, children: pages(this.site.pages) },
      { id: 'part:footer', label: $HR('Footer'), icon: PART_ICONS.footer, bold: true, draggable: false }
    ];
  }

  _siteTools(item) {
    if (this.readOnly) return [];
    // no toolbar on the Site tab: Add page is always on Home
    if (item.id === 'part:content') return [{ action: 'add', icon: 'fa-plus', title: $HR('Add page'), label: $HR('Add page'), always: true }];
    if (!item.id.startsWith('page:')) return [];
    return [
      { action: 'edit', icon: 'fa-pen', title: $HR('Edit record') },
      { action: 'add', icon: 'fa-plus', title: $HR('Add sub page') },
      { action: 'remove', icon: 'fa-xmark', title: $HR('Remove from website') }
    ];
  }

  _partItemId(current) {
    if (!current || !this.site) return null;
    return current.recordId === this.site.id ? `part:${current.part}` : `page:${current.recordId}`;
  }

  /** A click on Header, Home, Footer or a page opens it on the Page tab. */
  async _selectSiteItem(id) {
    if (id.startsWith('part:')) await this.selectPart(this.site.id, id.slice(5));
    else await this.selectPart(Number(id.slice(5)), 'content');
    if (this._partItemId(this.current) === id) this._showPageTab();
  }

  _canDropPage(dragId, targetId, position) {
    if (!dragId.startsWith('page:')) return false;
    if (targetId === 'part:content') return position === 'inside' && Boolean(dropPlace(this.site.pages, pageId(dragId), 0, 'inside'));
    if (!targetId.startsWith('page:')) return false;
    return Boolean(dropPlace(this.site.pages, pageId(dragId), pageId(targetId), position));
  }

  async _dropPage(dragId, targetId, position) {
    const target = targetId === 'part:content' ? 0 : pageId(targetId);
    const place = dropPlace(this.site.pages, pageId(dragId), target, position);
    if (!place) return;
    await this._menuChange(() => this.websites.assign(this.site.id, pageId(dragId), { parent: place.parent, index: place.index }));
  }

  async _siteTool(action, id) {
    const page = pageId(id);
    if (action === 'edit') return this._editRecord(page);
    if (action === 'add') return this._addPage(page);
    if (action === 'remove') return this._removePage(page);
    return undefined;
  }

  async _addPage(parent) {
    const values = await openAddPageForm({ title: parent ? 'Add sub page' : 'Add page' });
    if (!values) return;
    // the templates come one by one (plan 27e): the others give a blank page for now
    const template = CMS_PAGE_PRESETS.includes(values.template) ? values.template : 'blank';
    const starter = cmsPageStarter(template, values.title);
    const codes = this.codes;
    try {
      if (template === 'team') await this._ensureTeamReport();
      const response = await this.apiClient.request('/page/0', {
        method: 'POST',
        body: { rec_ID: 0, details: { [codes.name]: values.title, [codes.version]: '4', [codes.content]: starter.content, [codes.configuration]: starter.configuration } }
      });
      const id = Number((response?.data ?? response)?.records?.[0]?.rec_ID);
      await this._menuChange(() => this.websites.assign(this.site.id, id, { parent }));
      await this.selectPart(id, 'content');
    } catch (error) {
      HMsg.showMsgErr?.(error?.message || String(error));
    }
  }

  /**
   * Remove a page from the website (review 2026-11-01): its menu entry with the sub menus; the pages are not made
   * standalone. With the box of the popup checked the page and its sub pages are deleted.
   */
  async _removePage(page) {
    const place = menuPlace(this.site.pages, page);
    if (!place) return;
    const answer = await askRemovePage(place.page.title || `#${page}`);
    if (!answer) return;
    const removed = [page, ...subPageIds(place.page)];
    const opened = this.current && removed.includes(this.current.recordId);
    if (opened && !(await this._leaveDirty())) return;
    await this._menuChange(async () => {
      await this.websites.removeFromMenu(this.site.id, page, { standalone: false });
      if (answer.deletePages) for (const id of removed) await this.websites.remove(id, { entity: 'page', force: true });
      return null;
    });
    for (const id of removed) this.records.delete(id);
    if (opened) await this.selectPart(this.site.id, 'content', { force: true });
  }

  /** A menu change (saved at once): then the tree, rec_Modified of the records and the preview (its menu). */
  async _menuChange(run) {
    try {
      await run();
    } catch (error) {
      HMsg.showMsgErr?.(error?.message || String(error));
    }
    this.site = await this.websites.summary(this.site.id, { entity: 'website' });
    this.siteTree.setItems(this._siteItems());
    this.siteTree.select(this._partItemId(this.current));
    await this._refreshModified();
    this._loadPreview();
  }

  async _editRecord(id) {
    const result = await this.bridge.editRecord(Number(id));
    if (result?.saved === false) return;
    if (this.site) {
      this.site = await this.websites.summary(this.site.id, { entity: 'website' });
      this.siteTree?.setItems(this._siteItems());
      this.siteTree?.select(this._partItemId(this.current));
    }
    const record = this.records.get(Number(id));
    if (record) {
      const open = this.current?.recordId === Number(id);
      if (open && this.isDirty()) {
        await this._refreshModified();
      } else {
        await this._record(Number(id), { reload: true });
        if (open) this._renderPart();
      }
    }
    this._loadPreview();
  }

  async _styles() {
    if (!(await this._leaveDirty())) return;
    const id = this.site ? this.site.id : this.standalone.id;
    const record = await this._record(id);
    const css = this.codes.css ? fieldText(record.record.details?.[this.codes.css]) : '';
    const values = await openStylesDialog({
      base: record.doc.base(),
      kinds: record.doc.kinds(),
      presets: record.doc.presets(),
      css,
      javaScriptAllowed: this.options.dbdefs?.meta?.javaScriptAllowed === true,
      files: this._files(),
      createCodeEditor: async (host, options) => {
        const { createCodeTextEditor } = await import('#shared/widgets/rich-text/HCodeTextEditor.js');
        return createCodeTextEditor(host, options);
      }
    });
    if (!values) return;
    record.doc.setCommonStyles(values);
    // Custom CSS (DT_CMS_CSS) is a field of the record, not of the document: saved with the styles
    const extra = this.codes.css && values.css !== css ? { [this.codes.css]: values.css } : {};
    if (await this._saveRecord(id, { extra })) {
      // the custom CSS is in the head of the page: load it again
      if (Object.keys(extra).length) this._loadPreview(); else this._applyPreview();
      this._renderProperties();
    }
    this._updateBar();
  }

  // ------------------------------------------------------------------ part tree (Page tab)

  _renderPart() {
    this.partPane.replaceChildren();
    this.pasteButton = null;
    this.pickerBox = null;
    const host = element('div', 'h-cms-tree-host');
    this.partPane.append(host);
    this.partTree = new HTree().attach(host, {
      items: this._partItems(),
      tools: (item) => this._nodeTools(item),
      canDrop: (dragId, targetId, position) => this._canDropNode(dragId, targetId, position),
      onDrop: this.readOnly ? null : (dragId, targetId, position) => this._dropNode(dragId, targetId, position),
      onSelect: (id) => this._selectNode(id === ROOT ? null : id),
      onHover: (id) => this.preview?.highlight(id === ROOT ? null : id),
      onTool: (action, id, button) => void this._nodeTool(action, id, button),
      onActivate: (id) => void this._activateNode(id)
    }).render();
    if (!this.readOnly) this.partPane.append(this._renderPicker());
    this._renderProperties();
  }

  _partLabel() {
    if (!this.current) return '';
    if (this.standalone) return this.standalone.title;
    if (this.current.recordId === this.site.id) return $HR(PART_LABELS[this.current.part]);
    return menuPlace(this.site.pages, this.current.recordId)?.page?.title || `#${this.current.recordId}`;
  }

  /** The icon of the part tree root: the one of the Site tree (header, home, footer, page). */
  _partIcon() {
    if (!this.current || this.standalone || this.current.recordId !== this.site.id) return PART_ICONS.page;
    return PART_ICONS[this.current.part] || PART_ICONS.page;
  }

  _partItems() {
    const record = this._currentRecord();
    const map = (items) => items.map((item) => ({
      id: item.id,
      label: item.label,
      icon: nodeIcon(item),
      badge: item.configured ? '' : $HR('not configured'),
      title: [item.kind, item.preset ? `${$HR('preset')}: ${item.preset}` : ''].filter(Boolean).join(' · '),
      children: map(item.children)
    }));
    return [{
      id: ROOT, label: this._partLabel(), icon: this._partIcon(), bold: true, draggable: false,
      children: record ? map(record.doc.tree(this.current.part)) : []
    }];
  }

  /**
   * Tools of the part tree (review 2026-11-01): + on the root (always) and on containers (tabs and accordions: a
   * new panel), pen on texts and groups (a group: its caption), gear on modules and widgets, remove.
   */
  _nodeTools(item) {
    if (this.readOnly) return [];
    if (item.id === ROOT) return [{ action: 'add', icon: 'fa-plus', title: $HR('Add element'), label: $HR('Add element'), always: true }];
    const node = this._treeItem(item.id);
    const tools = [];
    if (node?.kind === 'control') {
      tools.push({ action: 'add', icon: 'fa-plus', title: $HR(node.control === 'group' ? 'Add element' : 'Add panel') });
    }
    if (node?.kind === 'text' && !node.field) tools.push({ action: 'edit', icon: 'fa-pen', title: $HR('Edit text') });
    if (node?.field) tools.push({ action: 'field', icon: 'fa-pen', title: $HR('Edit field') });
    if (node?.kind === 'media') tools.push({ action: 'media', icon: 'fa-pen', title: $HR('Edit media') });
    if (node?.control === 'group') tools.push({ action: 'caption', icon: 'fa-pen', title: $HR('Edit caption') });
    if (node?.kind === 'instance') tools.push({ action: 'configure', icon: 'fa-gear', title: $HR('Configuration') });
    tools.push({ action: 'delete', icon: 'fa-trash', title: $HR('Remove') });
    return tools;
  }

  _canDropNode(dragId, targetId, position) {
    const record = this._currentRecord();
    if (!record || dragId === ROOT) return false;
    if (targetId === ROOT) return position === 'inside' && record.doc.canDrop(dragId, { id: null, position: 'inside', part: this.current.part });
    return record.doc.canDrop(dragId, { id: targetId, position, part: this.current.part });
  }

  _dropNode(dragId, targetId, position) {
    this._edit((doc) => doc.move(dragId, { id: targetId === ROOT ? null : targetId, position, part: this.current.part }));
  }

  async _nodeTool(action, id, button) {
    if (!this._currentRecord()) return undefined;
    if (action === 'add') return this._addElement(id);
    this._selectNode(id);
    if (action === 'edit') return this._editText(id);
    if (action === 'field') return this._editField(id);
    if (action === 'media') return this._editMedia(id);
    if (action === 'caption') return this._editCaption(id);
    if (action === 'configure') return this._configure(id);
    if (action === 'delete' && (await confirmNear(button, 'Remove this element?'))) {
      this._edit((doc) => doc.remove(id));
      this._selectNode(null);
    }
    return undefined;
  }

  /** Double click in the part tree: the text popup of a text, the caption of a group, the configuration of a module. */
  _activateNode(id) {
    if (this.readOnly || id === ROOT || !this._currentRecord()) return undefined;
    const node = this._treeItem(id);
    if (!node) return undefined;
    this._selectNode(id);
    if (node.kind === 'text') return node.field ? this._editField(id) : this._editText(id);
    if (node.kind === 'media') return this._editMedia(id);
    if (node.control === 'group') return this._editCaption(id);
    if (node.kind === 'instance') return this._configure(id);
    return undefined;
  }

  /** + of the tree: a new panel of tabs / accordions; else the chosen element into the group or the part root. */
  async _addElement(id) {
    const node = id === ROOT ? null : this._treeItem(id);
    if (node && node.control !== 'group') {
      let added = null;
      this._edit((doc) => {
        added = doc.addPanel(id);
        return Boolean(added);
      });
      if (added) this._selectNode(added);
      return;
    }
    await this._insertChosen({ id: node ? id : null, position: 'inside' });
  }

  /** The element popup, then the element at a place; its title is the heading of a text or the caption of a group. */
  async _insertChosen(target) {
    const values = await openAddElementForm();
    if (!values || !CMS_ELEMENTS.includes(values.element)) return;
    if (values.element === 'field') {
      await this._insertField(target);
      return;
    }
    let added = null;
    this._edit((doc) => {
      added = doc.insertElement(this.current.part, values.element, target);
      if (values.title && doc.isContainer(added)) doc.setCaption(added, values.title);
      else if (values.title && doc.text(added)) doc.setText(added, `<h2>${escapeHtml(values.title)}</h2>${doc.text(added)}`);
      return true;
    });
    if (added) this._selectNode(added);
    // a new media element: its file at once
    if (added && values.element === 'media') await this._editMedia(added);
  }

  /** Copy the selected element (Copy structure / Copy all below the tree). */
  _copy(mode) {
    const record = this._currentRecord();
    if (!record || !this.selectedNode) return;
    const clip = record.doc.copy(this.selectedNode, mode);
    if (!clip) return;
    this.clipboard = clip;
    writeClipboard(this.options.runtime?.database, this.clipboard);
    if (this.pasteButton) this.pasteButton.disabled = false;
    HMsg.showMsgFlash?.($HR('Copied'), { showDelay: 1000 });
  }

  _paste() {
    if (!this.clipboard) return;
    const target = this._insertTarget();
    let pasted = null;
    this._edit((doc) => {
      pasted = doc.paste(this.clipboard, this.current.part, target);
      return Boolean(pasted);
    });
    if (!pasted) HMsg.showMsgFlash?.($HR('It can not be pasted here'), { showDelay: 2500 });
    else this._selectNode(pasted);
  }

  /**
   * Below the tree (§25): the tools of the selected element (Own style, Caption, Edit text, Configuration) and,
   * on the right, Copy (with its texts) and Paste as icons.
   */
  _renderPicker() {
    this.pickerBox = element('div', 'h-cms-picker');
    this._updatePicker();
    return this.pickerBox;
  }

  _updatePicker() {
    const box = this.pickerBox;
    if (!box) return;
    box.replaceChildren();
    const node = this.selectedNode ? this._treeItem(this.selectedNode) : null;
    if (node) {
      box.append(barButton('fa-palette', 'Own style and preset of the element', () => this._ownStyle(node.id), 'Own style'));
      if (node.control === 'group') box.append(barButton('fa-heading', 'Caption of the group', () => this._editCaption(node.id), 'Caption'));
      if (node.kind === 'text' && !node.field) box.append(barButton('fa-pen', 'Edit the text and its translations', () => this._editText(node.id), 'Edit text'));
      if (node.field) box.append(barButton('fa-pen', 'The record, the field and its value', () => this._editField(node.id), 'Edit field'));
      if (node.kind === 'media') box.append(barButton('fa-pen', 'The file, caption and size of the media', () => this._editMedia(node.id), 'Edit media'));
      if (node.kind === 'instance') box.append(barButton('fa-gear', 'Configuration', () => this._configure(node.id), 'Configuration'));
    }
    const spacer = element('span', 'h-cms-picker-spacer');
    const copy = barButton('fa-copy', 'Copy the selected element with its texts', () => this._copy('all'));
    copy.disabled = !node || node.kind === 'instance';
    this.pasteButton = barButton('fa-paste', 'Paste the copied element into the selected group or after the selected element', () => this._paste());
    this.pasteButton.disabled = !this.clipboard;
    box.append(spacer, copy, this.pasteButton);
  }

  /** Where a new or pasted element goes: into the selected control, after the selected node, else the part root. */
  _insertTarget() {
    const record = this._currentRecord();
    const id = this.selectedNode;
    if (!id) return { id: null, position: 'inside' };
    return record.doc.isContainer(id) ? { id, position: 'inside' } : { id, position: 'after' };
  }

  _selectNode(id, { fromPreview = false } = {}) {
    const record = this._currentRecord();
    if (id && record) id = record.doc.captionGroup(id) || id; // a caption is edited through its group
    if (id && record && record.doc.find(id)?.part !== this.current.part) return;
    this.selectedNode = id || null;
    this.partTree?.select(id || ROOT);
    if (!fromPreview) this.preview?.reveal(id);
    this._renderProperties();
  }

  /** Help and the tools of the selected element. */
  _renderProperties() {
    this._renderHelp();
    this._updatePicker();
  }

  /** Kind defaults and presets that apply to the part: the website's, then the page's. */
  _commonStyles() {
    const kinds = {};
    const presets = {};
    for (const record of this._styleRecords()) {
      Object.assign(kinds, record.doc.kinds());
      Object.assign(presets, record.doc.presets());
    }
    return { kinds, presets };
  }

  /** Whether an element is in a group that is a flex box (own style, then preset, then the group kind default). */
  _inFlexGroup(id) {
    const record = this._currentRecord();
    const group = record?.doc.parentGroup(id);
    if (!group) return false;
    const { kinds, presets } = this._commonStyles();
    const display = record.doc.nodeStyle(group.id).display || presets[group.preset]?.display || kinds.group?.display;
    return display === 'flex';
  }

  _styleRecords() {
    const records = [];
    const site = this.site ? this.records.get(this.site.id) : null;
    const current = this._currentRecord();
    if (site) records.push(site);
    if (current && current !== site) records.push(current);
    return records;
  }

  _treeItem(id) {
    const record = this._currentRecord();
    let found = null;
    const visit = (items) => { for (const item of items) { if (item.id === id) found = item; else visit(item.children); } };
    if (record) visit(record.doc.tree(this.current.part));
    return found;
  }

  /**
   * Edit a text and its translations in one popup (§26): the languages of the website, the original first; it
   * opens in the language of the preview. All changed languages are one undo step.
   */
  async _editText(id) {
    const record = this._currentRecord();
    const codes = this.site?.languages?.length ? this.site.languages : [''];
    const texts = Object.fromEntries(codes.map((code, index) => [code, index ? record.doc.translation(code, id) : record.doc.text(id)]));
    const runtime = this.options.runtime || {};
    const loadEditor = this.options.loadEditor;
    const result = await openTextTranslationDialog({
      texts,
      languages: codes.map((code) => ({ code, label: code.toUpperCase() })),
      language: this.language || codes[0],
      translator: this._translator(),
      baseUrl: runtime.baseUrl || '',
      remember: this.textDialogState,
      ...(loadEditor ? { createEditor: async (...args) => (await loadEditor())(...args) } : {})
    });
    const changed = Object.entries(result?.texts || {});
    if (!changed.length) return;
    this._edit((doc) => {
      for (const [code, html] of changed) {
        if (code === codes[0]) doc.setText(id, html);
        else doc.setTranslation(code, id, html);
      }
      return true;
    });
  }

  /**
   * Caption of a group and its translations in the translation popup (§26): the caption in the first website
   * language, the others below; one language or none: the caption only. A panel of tabs / accordions must keep one.
   */
  async _editCaption(id) {
    const record = this._currentRecord();
    const current = record.doc.caption(id);
    const languages = this.site?.languages || [];
    const result = await openTranslationDialog({
      title: 'Caption',
      value: current?.text || '',
      translations: current?.translations || {},
      languages,
      original: languages[0] || '',
      translator: this._translator(),
      required: record.doc.isPanel(id)
    });
    if (!result) return;
    // languages left out are removed
    const translations = Object.fromEntries(languages.slice(1).map((code) => [code, result.translations[code] || '']));
    this._edit((doc) => doc.setCaption(id, result.value.trim(), translations));
  }

  /**
   * Edit media: the media form with one source; the HTML of the figure is made for the first language of the website and
   * for each other one (its caption, its link labels), by the same code as a gallery (plan 27e §20).
   */
  async _editMedia(id) {
    const record = this._currentRecord();
    const current = record?.doc.media(id);
    if (!current) return;
    const languages = this.site?.languages || [];
    const settings = { ...current.settings };
    // an element saved before plan 27e §20 knows only the key of its file
    if (settings.file && !settings.record) settings.record = (await this._mediaFile(settings.file))?.id || 0;
    const result = await openMediaForm({
      single: true,
      settings,
      caption: cmsMediaCaption(current.html),
      translations: Object.fromEntries(Object.entries(current.translations).map(([code, html]) => [code, cmsMediaCaption(html)])),
      languages,
      translator: this._translator(),
      dbdefs: this.options.dbdefs,
      apiClient: this.apiClient,
      services: this._formServices()
    });
    if (!result) return;
    const { file } = result.items[0];
    const runtime = this.options.runtime || {};
    const urls = fileMediaUrls(runtime.baseUrl || '', runtime.database || '');
    const view = result.settings.action === 'viewer' ? cmsMediaView(file, urls) : null;
    const saved = { ...result.settings, file: file.key };
    const html = (caption, language) => buildCmsMedia(file, { ...saved, view: Boolean(view) }, { urls, caption, language });
    const translations = Object.fromEntries(languages.slice(1).map((code) => [code, html(result.translations[code] || result.caption, code)]));
    this._edit((doc) => doc.setMedia(id, { settings: saved, html: html(result.caption, languages[0] || 'eng'), translations, view }));
  }

  /**
   * A registered file by its key for the media popup (GET /files/{key}): id, name, file type (extension), source
   * (local, external, tiled, iiif, iiif_image), URL and whether guests may see it; null when it is not found.
   */
  async _mediaFile(key) {
    const response = await this.apiClient.get(`/files/${encodeURIComponent(key)}`, { query: { fields: '_all' } });
    const record = (response?.data ?? response)?.records?.[0];
    if (!record) return null;
    const dbdefs = this.options.dbdefs;
    const ids = systemFieldIds('file', dbdefs);
    const first = (name) => {
      const value = record.details?.[String(ids[name])];
      const item = Array.isArray(value) ? value[0] : value;
      return item && typeof item === 'object' ? item.id ?? item.value ?? '' : item ?? '';
    };
    const term = (name) => String(dbdefs?.termLabel?.(first(name)) || '').trim().toLowerCase().replace(/\s+/g, '_');
    return {
      key,
      id: Number(record.rec_ID) || 0,
      name: String(first('originalName') || record.rec_Title || ''),
      ext: term('fileType'),
      source: term('type'),
      url: String(record.rec_URL || ''),
      public: record.rec_NonOwnerVisibility ? record.rec_NonOwnerVisibility === 'public' : true
    };
  }

  /** The Smarty report of the template Team: made when the database has no template file of this name. */
  async _ensureTeamReport() {
    const list = await this.apiClient.get('/report', { query: { fields: 'rec_ID', limit: 5000 } });
    if (Object.values(list?.meta?.items ?? {}).some((report) => report.file === CMS_TEAM_TEMPLATE)) return;
    const id = (code) => Number(this.options.dbdefs?.dbconst?.(code)) || 0;
    const created = await this.apiClient.post('/report/0', { body: {
      rec_RecTypeID: id('RT_CUSTOM_REPORT'),
      details: {
        [id('DT_NAME')]: ['Team member'],
        [id('DT_EXTENDED_DESCRIPTION')]: ['A card of one person (website template Team)'],
        [id('DT_FILE_NAME')]: [CMS_TEAM_TEMPLATE.replace(/\.tpl$/, '')],
        [id('DT_IS_CARD_VIEW')]: [id('TRM_YES')]
      }
    } });
    const reportId = Number(created?.records?.[0]?.rec_ID) || 0;
    await this.apiClient.request(`/report/${reportId}/asset`, { method: 'PUT', body: { body: teamReportBody(this.options.dbdefs) } });
  }

  /** Services of the forms of semi-static content (plan 27e): one record manager per kind for the life of the designer. */
  _formServices() {
    const runtime = this.options.runtime || {};
    return {
      browseRecords: typeof this.bridge?.browseRecords === 'function' ? (options) => this.bridge.browseRecords(options) : null,
      createRecordBrowser: typeof this.bridge?.createRecordBrowser === 'function' ? (request) => this._recordBrowser(request) : undefined,
      editQuery: typeof this.bridge?.editQuery === 'function' ? (query, filterForm, options) => this.bridge.editQuery(query, filterForm, options) : null,
      describeQuery: typeof this.bridge?.describeQuery === 'function' ? (query) => this.bridge.describeQuery(query) : null,
      // the card templates of Record cards (plan 27e §29): reports marked "Single record (card)"
      cardTemplates: async () => {
        const response = await this.apiClient.get('/report', { query: { fields: 'rec_ID', limit: 5000 } });
        return Object.values(response?.meta?.items ?? {}).filter((report) => report.isCardView && report.id != null);
      },
      // Add and Upload in the record manager of a source
      addRecord: typeof this.bridge?.addRecord === 'function' ? (rectypeId) => this.bridge.addRecord(rectypeId) : undefined,
      mediaItems: (settings) => this._mediaItems(settings),
      fileUrl: fileMediaUrls(runtime.baseUrl || '', runtime.database || '').file,
      // "Limit values per field" of the Explorer configuration (plan 23)
      valueLimit: normalizeRecordLimits(runtime.recordLimits).values
    };
  }

  /** The kept record manager of a request; the form only opens it, the designer destroys it. */
  _recordBrowser(request) {
    const key = JSON.stringify(request);
    if (!this.browsers.has(key)) this.browsers.set(key, this.bridge.createRecordBrowser(request));
    const browser = this.browsers.get(key);
    return { open: () => browser.open(), destroy: async () => {} };
  }

  /**
   * The popup of a Record field element.
   *
   * @param {string|null} reference Current `data-h-field`; null for a new element.
   * @returns {Promise<{reference: string, html: string}|null>}
   */
  async _askField(reference) {
    try {
      return await openFieldForm({
        reference,
        records: { site: this.site?.id || 0, page: this.current?.recordId || 0 },
        languages: this.site?.languages || [],
        dbdefs: this.options.dbdefs,
        apiClient: this.apiClient,
        services: {
          ...this._formServices(),
          translator: this._translator(),
          recordField: await this.bridge?.recordFieldServices?.(),
          cmsFields: ['content', 'header', 'footer', 'configuration', 'translations', 'css', 'script'].map((key) => this.codes[key]).filter(Boolean),
          saveField: (id, details, modified) => this._saveField(id, details, modified)
        }
      });
    } catch (error) {
      HMsg.showMsgErr?.(error?.message || String(error));
      return null;
    }
  }

  /** Edit field of a Record field element. */
  async _editField(id) {
    const record = this._currentRecord();
    if (!record) return;
    const result = await this._askField(record.doc.field(id));
    if (!result) return;
    this._edit((doc) => doc.setField(id, result.reference, result.html));
    // the value in the language of the preview comes from the server
    this._loadPreview();
  }

  /** A new Record field element: the popup first, so Cancel leaves nothing. */
  async _insertField(target) {
    const result = await this._askField(null);
    if (!result) return;
    let added = null;
    this._edit((doc) => {
      added = doc.insertElement(this.current.part, 'field', target);
      return doc.setField(added, result.reference, result.html);
    });
    if (added) this._selectNode(added);
  }

  /**
   * PATCH of one field of a record. A website or page open here keeps its `rec_Modified`, or its next save is refused.
   *
   * @param {number} id Record id.
   * @param {Object<string, Array>} details The field.
   * @param {string} modified `rec_Modified` of the loaded record.
   * @returns {Promise<void>}
   */
  async _saveField(id, details, modified) {
    const open = this.records.get(id);
    const response = await this.apiClient.request(`/${open?.entity || 'records'}/${id}`, {
      method: 'PATCH',
      body: { rec_ID: id, rec_Modified: open?.modified || modified, details }
    });
    if (!open) return;
    const saved = (response?.data ?? response)?.records?.[0];
    open.modified = String(saved?.rec_Modified || open.modified);
    open.record = { ...open.record, ...(saved || {}), details: { ...open.record.details, ...(saved?.details || {}), ...details } };
  }

  /** Configuration of the widgets Custom report, Record cards and Media gallery. */
  async _configureWidget(instanceId, instance) {
    const services = this._formServices();
    const common = { settings: instance.settings || {}, dbdefs: this.options.dbdefs, apiClient: this.apiClient, services };
    if (instance.type === 'cards') {
      const settings = await openCardsForm(common);
      if (settings) this._edit((doc) => doc.setInstance(instanceId, { settings }));
    } else if (instance.type === 'report') {
      // the generated reports panel of heurist-reports, through Explorer (plan 27e §28)
      const settings = await openReportForm({
        settings: instance.settings,
        languages: this.site?.languages || [],
        services: {
          createOutputsPanel: typeof this.bridge?.createReportOutputsPanel === 'function'
            ? (options) => this.bridge.createReportOutputsPanel(options) : null
        }
      });
      if (settings) this._edit((doc) => doc.setInstance(instanceId, { settings }));
    } else if (instance.type === 'gallery') {
      const result = await openMediaForm(common);
      if (!result) return;
      const html = this._galleryHtml(result.settings, result.items);
      this._edit((doc) => doc.setInstance(instanceId, { settings: { ...result.settings, html } }));
    }
  }

  /** The HTML of a gallery (stored per language): a figure for each file. */
  _galleryHtml(settings, items) {
    const runtime = this.options.runtime || {};
    const urls = fileMediaUrls(runtime.baseUrl || '', runtime.database || '');
    const media = { ...CMS_MEDIA_DEFAULTS, width: settings.width, height: settings.height, view: settings.action === 'viewer' };
    const build = (language) => items.map(({ file, caption }) => buildCmsGalleryItem(file, { ...media, file: file.key }, {
      urls, caption: settings.caption ? caption : '', language
    })).join('');
    const languages = this.site?.languages || [];
    return languages.length ? Object.fromEntries(languages.map((code) => [code, build(code)])) : { def: build('') };
  }

  /**
   * The files of the media form in the chosen order, with the title as caption (plan 27e §14): of file records, the first file of
   * each media record, or of any record the file field: its first file for one element, all of them in a row for a gallery (§26).
   * A file that is not found has `file: null`.
   *
   * @param {{mode: string, ids: number[], field?: number, single?: boolean}} settings
   * @returns {Promise<Array<{file: object|null, caption: string, label: string}>>}
   */
  async _mediaItems({ mode, ids, field = 0, single = true }) {
    const files = mode === 'files';
    const source = mode === 'record' ? field : Number(this.options.dbdefs?.dbconst?.('DT_FILE_RESOURCE')) || 0;
    const response = files
      ? await this.apiClient.get('/files', { query: { ids: ids.join(','), fields: 'rec_ID,rec_Title,rec_Hash', limit: ids.length } })
      : await this.apiClient.get('/records', { query: { ids: ids.join(','), fields: `rec_ID,rec_Title,${source}`, resolveDetails: 1, limit: ids.length } });
    const records = (response?.data ?? response)?.records ?? [];
    const keysOf = (record) => {
      if (files) return [record?.rec_Hash];
      const keys = (record?.details?.[String(source)] || []).map((value) => value?.file?.ulf_ObfuscatedFileID);
      return mode === 'record' && !single ? keys : keys.slice(0, 1);
    };
    const entries = ids.flatMap((id) => {
      const record = records.find((item) => Number(item.rec_ID) === id);
      const keys = keysOf(record).filter(Boolean);
      return (keys.length ? keys : [null]).map((key) => ({ id, record, key }));
    });
    return Promise.all(entries.map(async ({ id, record, key }) => {
      const file = key ? await this._mediaFile(key) : null;
      const title = String(record?.rec_Title || file?.name || '');
      return { file, caption: title, label: title || `#${id}` };
    }));
  }

  /** The translation service of the server (Translate in the popups). */
  _translator() {
    return new TranslationClient({ apiClient: this.apiClient, available: Boolean(this.options.dbdefs?.translator?.()) });
  }

  async _ownStyle(id) {
    const record = this._currentRecord();
    const node = this._treeItem(id);
    const kind = node?.kind === 'control' ? node.control : node?.kind;
    const presets = Object.entries(this._commonStyles().presets).map(([name, preset]) => [name, preset?.label || name]);
    const result = await openStyleForm({
      style: record.doc.nodeStyle(id),
      title: $HR('Own style'),
      kind,
      inFlexGroup: this._inFlexGroup(id),
      presets,
      preset: node?.preset || null,
      cssClass: record.doc.cssClass(id),
      javaScriptAllowed: this.options.dbdefs?.meta?.javaScriptAllowed === true,
      base: Object.assign({}, ...this._styleRecords().map((item) => item.doc.base())),
      files: this._files()
    });
    if (!result) return;
    this._edit((doc) => {
      doc.setNodeStyle(id, result.style);
      doc.setPreset(id, result.preset);
      doc.setCssClass(id, result.cssClass);
      return true;
    });
  }

  /** The image picker of background images (styleRows): registered files, in Explorer's record manager. */
  _files() {
    return {
      apiClient: this.apiClient,
      baseUrl: this.options.runtime?.baseUrl || '',
      database: this.options.runtime?.database || '',
      browseRecords: typeof this.bridge?.browseRecords === 'function' ? (options) => this.bridge.browseRecords(options) : null,
      fileRecordType: Number(this.options.dbdefs?.dbconst?.('RT_REGISTERED_FILE')) || 0
    };
  }

  async _configure(id) {
    const record = this._currentRecord();
    const node = this._treeItem(id);
    const instance = node?.instance ? record.doc.instance(node.instance) : null;
    if (!instance) return;
    if (instance.kind === 'widget' && instance.type === 'menu') {
      HMsg.showMsgFlash?.($HR('The menu shows the pages of the website; it has no settings.'), { showDelay: 3000 });
      return;
    }
    try {
      if (instance.kind === 'widget') {
        await this._configureWidget(node.instance, instance);
        return;
      }
      if (instance.type === 'explorer') {
        if (!this.bridge.configureExplorerInstance) throw new Error($HR('Explorer can not be configured here'));
        const result = await this.bridge.configureExplorerInstance({ value: null });
        if (result) this._edit((doc) => doc.setInstance(node.instance, result));
        return;
      }
      if (!this.bridge.openConfiguration) throw new Error($HR('Modules can not be configured here'));
      const hasSettings = instance.settings && typeof instance.settings === 'object' && Object.keys(instance.settings).length;
      const settings = await this.bridge.openConfiguration({
        moduleType: instance.type, mode: 'website', value: hasSettings ? instance.settings : null, title: `${$HR('Configuration')}: ${instance.type}`
      });
      if (settings) this._edit((doc) => doc.setInstance(node.instance, { settings }));
    } catch (error) {
      HMsg.showMsgErr?.(error?.message || String(error));
    }
  }

  // ------------------------------------------------------------------ changes

  /** Run a change of the record document; a change that did nothing (false) leaves no undo step. */
  _edit(change) {
    const record = this._currentRecord();
    if (!record || this.readOnly) return false;
    const before = record.doc.snapshot();
    const result = change(record.doc);
    if (result === false || record.doc.snapshot() === before) return false;
    this.undoStack.push(before);
    this.redoStack = [];
    this._changed();
    return true;
  }

  _changed() {
    this.partTree?.setItems(this._partItems());
    if (this.selectedNode && !this._treeItem(this.selectedNode)) this.selectedNode = null;
    this.partTree?.select(this.selectedNode || ROOT);
    this._renderProperties();
    this._applyPreview();
    this._updateBar();
  }

  // ------------------------------------------------------------------ preview

  /** Page of the preview: a website page id, or 0 (home / standalone). */
  _previewPage(current) {
    return this.site && current && current.recordId !== this.site.id ? current.recordId : 0;
  }

  _loadPreview() {
    const url = (this.site || this.standalone).url;
    this.preview.load(previewUrl(url, this._previewPage(this.current), this.language));
  }

  _applyPreview() {
    if (!this.current) return;
    const site = this.site ? this.records.get(this.site.id) : null;
    const current = this._currentRecord();
    const language = this.language;
    const parts = {};
    const instances = {};
    if (site) {
      parts.header = site.doc.html('header', language);
      parts.footer = site.doc.html('footer', language);
      Object.assign(instances, site.doc.config.instances);
    }
    if (current) {
      parts.content = current.doc.html('content', language);
      Object.assign(instances, current.doc.config.instances);
    }
    const records = this._styleRecords();
    const home = !site || current === site;
    const styleRecords = home ? [current] : records;
    this.preview.apply({
      parts,
      instances,
      styles: {
        base: Object.assign({}, ...styleRecords.map((record) => record.doc.base())),
        nodes: styleRecords.map((record) => record.doc.config.styles.nodes || {}),
        kinds: styleRecords.map((record) => record.doc.kinds()),
        presets: styleRecords.map((record) => record.doc.presets())
      }
    });
  }

  _key(event) {
    const key = String(event.key || '').toLowerCase();
    if (!(event.ctrlKey || event.metaKey)) return;
    if (key === 's') {
      event.preventDefault();
      void this.save();
    } else if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.undo();
    } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      this.redo();
    }
  }
}

/**
 * Open the CMS designer over a host element (Website manager, *Open editor*).
 *
 * @param {object} options CmsDesigner options and `recordId`, `page`.
 * @returns {Promise<CmsDesigner|null>} Null when it can not be opened.
 */
export async function openCmsDesigner({ recordId, page = 0, ...options }) {
  const designer = new CmsDesigner(options);
  try {
    if (await designer.open(recordId, { page })) return designer;
  } catch (error) {
    HMsg.showMsgErr?.(error?.message || String(error));
  }
  designer.destroy();
  options.onClose?.();
  return null;
}

function nodeIcon(item) {
  if (item.field) return 'fa-database';
  if (item.type === 'report') return 'fa-file';
  if (item.kind === 'text') return 'fa-paragraph';
  if (item.kind === 'media') return 'fa-photo-film';
  if (item.kind === 'instance') return item.type === 'menu' ? 'fa-bars' : 'fa-cube';
  if (item.control === 'tabs') return 'fa-folder-open';
  if (item.control === 'accordion') return 'fa-list';
  if (item.preset === 'columns2' || item.preset === 'columns3') return 'fa-table-columns';
  return item.kind === 'control' ? 'fa-layer-group' : 'fa-code';
}

/** Help for the selected element of the part tree. */
function elementHelp(node, record, multilingual) {
  const texts = ['Apply a preset (a style defined once in Styles) or define an own style for this element.'];
  if (node.field) {
    texts.push('Choose the record and its field with the pen or a double click. The value can be edited there: the record itself changes.');
  } else if (node.kind === 'text') {
    texts.push(multilingual ? 'Edit the text with the pen or a double click; the popup shows the languages of the website: translate the text there.' : 'Edit the text with the pen or a double click.');
  } else if (node.kind === 'media') {
    texts.push('Choose the file, its caption and size with the pen or a double click. The page shows it without a script.');
  } else if (node.kind === 'instance') {
    const instance = node.instance ? record?.doc.instance(node.instance) : null;
    texts.push(instance?.kind === 'widget'
      ? 'The menu shows the pages of the website: change them on the Site tab.'
      : 'Set what the module shows and how in its configuration (gear).');
  } else if (node.control === 'tabs' || node.control === 'accordion') {
    texts.push('Each panel is a group with a caption (its label): + adds a panel, the pen of a panel edits its caption.'
      + ' Without panels the element is removed.');
  } else {
    texts.push('Add elements into it with +, or drag elements onto it. The pen edits its caption (a heading on top).');
  }
  if (node.kind !== 'instance') texts.push('Copy structure or Copy all below the tree, then Paste it into another place or page.');
  return texts;
}

function readHelpShown() {
  try {
    return globalThis.localStorage?.getItem(HELP_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeHelpShown(shown) {
  try {
    globalThis.localStorage?.setItem(HELP_KEY, shown ? '1' : '0');
  } catch {
    // shown again next time
  }
}

function pageId(itemId) {
  return Number(String(itemId).replace(/^page:/, '')) || 0;
}

function readClipboard(database) {
  try {
    const clip = JSON.parse(globalThis.sessionStorage?.getItem(`${CLIP_KEY}.${database}`) || 'null');
    return clip?.format === 'heurist-cms-clip' ? clip : null;
  } catch {
    return null;
  }
}

function writeClipboard(database, clip) {
  try {
    globalThis.sessionStorage?.setItem(`${CLIP_KEY}.${database}`, JSON.stringify(clip));
  } catch {
    // the clipboard of this designer only
  }
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function caption(text) {
  const node = element('span', 'h-cms-caption');
  node.textContent = $HR(text);
  return node;
}

/** {field: value} as record details ({field: [value]}). */
function mapValues(fields) {
  return Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, [value]]));
}

/** Text of the first value of a field (`details[field]`: values or {value} objects). */
function fieldText(values) {
  const value = Array.isArray(values) ? values[0] : values;
  return String((value && typeof value === 'object' ? value.value : value) ?? '');
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function option(value, label) {
  const node = element('option');
  node.value = value;
  node.textContent = label;
  return node;
}

function barButton(icon, title, run, label = '') {
  const button = element('button', 'h-btn h-compact');
  button.type = 'button';
  button.title = $HR(title);
  const glyph = element('i', `fa-solid ${icon}`);
  glyph.setAttribute('aria-hidden', 'true');
  button.append(glyph);
  if (label) button.append(document.createTextNode(` ${$HR(label)}`));
  button.addEventListener('click', () => void run());
  return button;
}
