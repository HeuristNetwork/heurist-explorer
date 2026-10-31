/**
 * @file CmsDesigner.js
 * @brief The CMS designer of v4 websites and standalone pages (plan 27c), over the whole screen.
 *
 * West: the website tree (Header, Home with the menu pages, Footer; drag and drop = `assign`, saved at once).
 * Center: the preview (CmsPreview). East: the structure of the selected part (header, home, footer or a page):
 * tree with drag and drop, the element picker and the properties of the selected node (kind default, preset,
 * own style, text, translation, instance configuration).
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
import { CMS_ELEMENTS, cmsPageStarter } from '#shared/site/cmsEdit.js';
import { CMS_KINDS } from '#shared/site/cmsDocument.js';
import { CmsPreview, PREVIEW_WIDTHS } from './CmsPreview.js';
import {
  changedDetails, dropPlace, menuPlace, previewUrl, recordDocument, subPageIds
} from './designerData.js';
import {
  askConflict, askSaveDiscard, chooseOption, chooseSubPages, confirm, cssText, openAddPageForm, openStyleForm,
  openStylesDialog, openTextEditor
} from './designerDialogs.js';
import './designer.css';

/** Labels of the element picker (§5.2). */
const ELEMENT_LABELS = Object.freeze({
  text: 'Text', group: 'Group', columns2: 'Two columns', columns3: 'Three columns', tabs: 'Tabs', accordion: 'Accordion',
  explorer: 'Explorer', data: 'Data', map: 'Map', timeline: 'Timeline', graph: 'Graph', recordview: 'Record view', menu: 'Menu'
});

const PART_LABELS = Object.freeze({ header: 'Header', content: 'Home', footer: 'Footer' });
const ROOT = '#root';
const CLIP_KEY = 'heurist.cms.clipboard';

/** The CMS designer. */
export class CmsDesigner {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container Host over the whole screen.
   * @param {object} options.apiClient HeuristApiClient.
   * @param {object} options.websites WebsiteClient.
   * @param {object} options.bridge Explorer's bridge: editRecord, openConfiguration, configureExplorerInstance.
   * @param {{baseUrl: string, database: string}} options.runtime
   * @param {() => void} [options.onClose]
   * @param {(name: string) => Promise<Function>} [options.loadEditor] createTinyMceEditor (lazy; tests).
   */
  constructor(options) {
    this.options = options;
    this.apiClient = options.apiClient;
    this.websites = options.websites;
    this.bridge = options.bridge || null;
    this.records = new Map();
    this.current = null;
    this.selectedNode = null;
    this.undoStack = [];
    this.redoStack = [];
    this.language = null;
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

  async _saveRecord(id, { force = false } = {}) {
    const record = this.records.get(id);
    if (!record) return true;
    const now = record.doc.serialize();
    const details = changedDetails(now, record.saved, this.codes);
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
    } catch (error) {
      if (error?.status === 409 && !force) {
        const answer = await askConflict();
        if (answer === 'overwrite') return this._saveRecord(id, { force: true });
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
    const answer = await askSaveDiscard();
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
    root.append(this._renderBar());
    const body = element('div', 'h-cms-body');
    root.append(body);
    this.layout = new HCardinalLayout(body, { westSize: 260, eastSize: 340, minWest: 200, minEast: 280, splitterButtons: true });
    if (this.site) {
      this.layout.setContent('west', this._renderSitePane());
      this.layout.show('west');
    } else {
      this.layout.hide('west');
    }
    this.partPane = element('div', 'h-cms-part-pane');
    this.layout.setContent('east', this.partPane);
    this.layout.show('east');
    const center = element('div', 'h-cms-center');
    this.layout.setContent('center', center);
    center.append(this._renderWidths());
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

  _renderBar() {
    const bar = element('div', 'h-cms-bar');
    const title = element('span', 'h-cms-bar-title');
    title.textContent = (this.site || this.standalone)?.title || '';
    this.dirtyMark = element('span', 'h-cms-dirty');
    this.dirtyMark.textContent = '●';
    this.dirtyMark.title = $HR('Changes not saved');
    bar.append(title, this.dirtyMark);
    const languages = this.site?.languages || [];
    if (languages.length > 1) {
      const select = element('select', 'h-select h-compact');
      select.title = $HR('Preview language');
      for (const code of languages) select.append(option(code, code.toUpperCase()));
      select.addEventListener('change', () => {
        this.language = select.value === languages[0] ? null : select.value;
        this._loadPreview();
      });
      bar.append(select);
    }
    const spacer = element('span', 'h-cms-bar-spacer');
    bar.append(spacer);
    this.buttons = {
      undo: barButton('fa-rotate-left', 'Undo', () => this.undo()),
      redo: barButton('fa-rotate-right', 'Redo', () => this.redo()),
      save: barButton('fa-floppy-disk', 'Save', () => this.save(), 'Save'),
      discard: barButton('fa-xmark', 'Discard', async () => {
        if (await confirm('Discard the changes of this part?')) this.discard();
      }, 'Discard'),
      close: barButton('fa-door-open', 'Close', () => this.close(), 'Close')
    };
    if (this.readOnly) {
      const note = element('span', 'h-cms-readonly');
      note.textContent = $HR('Read only: you can not change this website');
      bar.append(note, this.buttons.close);
    } else {
      bar.append(this.buttons.undo, this.buttons.redo, this.buttons.save, this.buttons.discard, this.buttons.close);
    }
    return bar;
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

  _renderWidths() {
    const bar = element('div', 'h-cms-widths');
    for (const width of PREVIEW_WIDTHS) {
      const button = element('button', 'h-btn h-compact');
      button.type = 'button';
      button.textContent = width ? `${width}` : $HR('Full');
      button.title = width ? `${width} px` : $HR('Full width');
      button.addEventListener('click', () => {
        for (const other of bar.children) other.classList.toggle('h-cms-width-active', other === button);
        this.preview.setWidth(width);
      });
      if (!width) button.classList.add('h-cms-width-active');
      bar.append(button);
    }
    return bar;
  }

  // ------------------------------------------------------------------ website tree (west)

  _renderSitePane() {
    const pane = element('div', 'h-cms-site-pane');
    const bar = element('div', 'h-cms-pane-bar');
    if (!this.readOnly) {
      bar.append(
        barButton('fa-file-circle-plus', 'Add page', () => this._addPage(0), 'Add page'),
        barButton('fa-gear', 'Website properties', () => this._editRecord(this.site.id)),
        barButton('fa-palette', 'Styles', () => this._styles(), 'Styles')
      );
    }
    const host = element('div', 'h-cms-tree-host');
    pane.append(bar, host);
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
      id: `page:${page.id}`, label: page.title || `#${page.id}`, icon: 'fa-file-lines', children: pages(page.children)
    }));
    return [
      { id: 'part:header', label: $HR('Header'), icon: 'fa-heading', draggable: false },
      { id: 'part:content', label: $HR('Home'), icon: 'fa-house', draggable: false, children: pages(this.site.pages) },
      { id: 'part:footer', label: $HR('Footer'), icon: 'fa-shoe-prints', draggable: false }
    ];
  }

  _siteTools(item) {
    if (this.readOnly || !item.id.startsWith('page:')) return [];
    return [
      { action: 'edit', icon: 'fa-pen', title: $HR('Edit record') },
      { action: 'add', icon: 'fa-plus', title: $HR('Add sub page') },
      { action: 'unmenu', icon: 'fa-arrow-right-from-bracket', title: $HR('Remove from menu') },
      { action: 'delete', icon: 'fa-trash', title: $HR('Delete page') }
    ];
  }

  _partItemId(current) {
    if (!current || !this.site) return null;
    return current.recordId === this.site.id ? `part:${current.part}` : `page:${current.recordId}`;
  }

  async _selectSiteItem(id) {
    if (id.startsWith('part:')) await this.selectPart(this.site.id, id.slice(5));
    else await this.selectPart(Number(id.slice(5)), 'content');
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
    if (action === 'unmenu') {
      if (await confirm(`${$HR('Remove the page from the menu? It stays as a standalone page.')}`)) {
        if (this.current?.recordId === page && !(await this._leaveDirty())) return undefined;
        await this._menuChange(() => this.websites.removeFromMenu(this.site.id, page));
        if (this.current?.recordId === page) await this.selectPart(this.site.id, 'content', { force: true });
      }
      return undefined;
    }
    if (action === 'delete') return this._deletePage(page);
    return undefined;
  }

  async _addPage(parent) {
    const values = await openAddPageForm({ title: parent ? 'Add sub page' : 'Add page' });
    if (!values) return;
    const starter = cmsPageStarter(values.preset, values.title);
    const codes = this.codes;
    try {
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

  async _deletePage(page) {
    const place = menuPlace(this.site.pages, page);
    if (!place) return;
    const subPages = subPageIds(place.page);
    let mode = 'delete';
    if (subPages.length) {
      mode = await chooseSubPages(place.page.title, place.page.children.length);
      if (!mode) return;
    } else if (!(await confirm(`${$HR('Delete the page')} "${place.page.title}"?`, { yes: 'Delete' }))) {
      return;
    }
    const opened = this.current && (this.current.recordId === page || subPages.includes(this.current.recordId));
    if (opened && !(await this._leaveDirty())) return;
    await this._menuChange(async () => {
      if (mode === 'up') {
        for (const [index, child] of place.page.children.entries()) {
          await this.websites.assign(this.site.id, Number(child.id), { parent: place.parent, index: place.index + 1 + index });
        }
      }
      await this.websites.removeFromMenu(this.site.id, page);
      await this.websites.remove(page, { entity: 'page', force: true });
      if (mode === 'delete') for (const id of subPages) await this.websites.remove(id, { entity: 'page', force: true });
      return null;
    });
    for (const id of [page, ...(mode === 'delete' ? subPages : [])]) this.records.delete(id);
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
    const values = await openStylesDialog({ base: record.doc.base(), kinds: record.doc.kinds(), presets: record.doc.presets() });
    if (!values) return;
    record.doc.setCommonStyles(values);
    if (await this._saveRecord(id)) {
      this._applyPreview();
      this._renderProperties();
    }
    this._updateBar();
  }

  // ------------------------------------------------------------------ part pane (east)

  _renderPart() {
    this.partPane.replaceChildren();
    this.pasteButton = null;
    const bar = element('div', 'h-cms-pane-bar');
    const title = element('span', 'h-cms-pane-title');
    title.textContent = this._partLabel();
    bar.append(title);
    if (!this.readOnly) {
      this.pasteButton = barButton('fa-paste', 'Paste', () => this._paste());
      this.pasteButton.disabled = !this.clipboard;
      bar.append(this.pasteButton);
    }
    const host = element('div', 'h-cms-tree-host');
    this.partPane.append(bar, host);
    this.partTree = new HTree().attach(host, {
      items: this._partItems(),
      tools: (item) => this._nodeTools(item),
      canDrop: (dragId, targetId, position) => this._canDropNode(dragId, targetId, position),
      onDrop: this.readOnly ? null : (dragId, targetId, position) => this._dropNode(dragId, targetId, position),
      onSelect: (id) => this._selectNode(id === ROOT ? null : id),
      onHover: (id) => this.preview?.highlight(id === ROOT ? null : id),
      onTool: (action, id) => void this._nodeTool(action, id)
    }).render();
    if (!this.readOnly) this.partPane.append(this._renderPicker());
    this.propertiesBox = element('div', 'h-cms-properties');
    this.partPane.append(this.propertiesBox);
    this._renderProperties();
  }

  _partLabel() {
    if (!this.current) return '';
    if (this.standalone) return this.standalone.title;
    if (this.current.recordId === this.site.id) return $HR(PART_LABELS[this.current.part]);
    return menuPlace(this.site.pages, this.current.recordId)?.page?.title || `#${this.current.recordId}`;
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
    return [{ id: ROOT, label: this._partLabel(), icon: 'fa-square-full', draggable: false, children: record ? map(record.doc.tree(this.current.part)) : [] }];
  }

  _nodeTools(item) {
    if (this.readOnly || item.id === ROOT) return [];
    const node = this._treeItem(item.id);
    const tools = [];
    if (node?.kind === 'text') {
      tools.push({ action: 'edit', icon: 'fa-pen', title: $HR('Edit text') });
      if ((this.site?.languages || []).length > 1) tools.push({ action: 'translate', icon: 'fa-language', title: $HR('Translate') });
    }
    if (node?.kind === 'instance') tools.push({ action: 'configure', icon: 'fa-gear', title: $HR('Configuration') });
    tools.push({ action: 'style', icon: 'fa-palette', title: $HR('Own style') });
    if (node?.kind !== 'instance') {
      tools.push({ action: 'copyStructure', icon: 'fa-clone', title: $HR('Copy structure') });
      tools.push({ action: 'copyAll', icon: 'fa-copy', title: $HR('Copy all') });
    }
    tools.push({ action: 'delete', icon: 'fa-trash', title: $HR('Delete') });
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

  async _nodeTool(action, id) {
    const record = this._currentRecord();
    if (!record) return;
    this._selectNode(id);
    if (action === 'edit') return this._editText(id);
    if (action === 'translate') return this._translate(id);
    if (action === 'configure') return this._configure(id);
    if (action === 'style') return this._ownStyle(id);
    if (action === 'copyStructure' || action === 'copyAll') {
      this.clipboard = record.doc.copy(id, action === 'copyAll' ? 'all' : 'structure');
      writeClipboard(this.options.runtime?.database, this.clipboard);
      if (this.pasteButton) this.pasteButton.disabled = !this.clipboard;
      HMsg.showMsgFlash?.($HR('Copied'), { showDelay: 1000 });
      return undefined;
    }
    if (action === 'delete') {
      this._edit((doc) => doc.remove(id));
      this._selectNode(null);
    }
    return undefined;
  }

  _paste() {
    if (!this.clipboard) return;
    const target = this._insertTarget();
    let pasted = null;
    this._edit((doc) => {
      pasted = doc.paste(this.clipboard, this.current.part, target);
      return Boolean(pasted);
    });
    if (!pasted) HMsg.showMsgFlash?.($HR('It can not be pasted here (not into the copied element itself)'), { showDelay: 2500 });
    else this._selectNode(pasted);
  }

  _renderPicker() {
    const box = element('div', 'h-cms-picker');
    const select = element('select', 'h-select h-compact');
    for (const name of CMS_ELEMENTS) select.append(option(name, $HR(ELEMENT_LABELS[name])));
    const add = barButton('fa-plus', 'Add', () => {
      let id = null;
      this._edit((doc) => {
        id = doc.insertElement(this.current.part, select.value, this._insertTarget());
        return true;
      });
      if (id) this._selectNode(id);
    }, 'Add');
    const caption = element('span', 'h-cms-caption');
    caption.textContent = $HR('Add element');
    box.append(caption, select, add);
    return box;
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
    if (id && record && record.doc.find(id)?.part !== this.current.part) return;
    this.selectedNode = id || null;
    this.partTree?.select(id || ROOT);
    if (!fromPreview) this.preview?.reveal(id);
    this._renderProperties();
  }

  _renderProperties() {
    const box = this.propertiesBox;
    if (!box) return;
    box.replaceChildren();
    const record = this._currentRecord();
    const node = this.selectedNode ? this._treeItem(this.selectedNode) : null;
    if (!record || !node) {
      const hint = element('p', 'h-cms-hint');
      hint.textContent = $HR('Select an element in the tree or in the preview.');
      box.append(hint);
      return;
    }
    const kind = node.kind === 'control' ? node.control : node.kind;
    const kinds = this._commonStyles().kinds;
    const line = (label, value) => {
      const row = element('div', 'h-cms-property');
      const caption = element('span', 'h-cms-caption');
      caption.textContent = $HR(label);
      const text = element('span', 'h-cms-property-value');
      text.textContent = value;
      row.append(caption, text);
      box.append(row);
      return row;
    };
    line('Kind', kind);
    if (Object.hasOwn(CMS_KINDS, kind)) line('Kind default', cssText(kinds[kind]) || $HR('(none)'));
    const presetRow = line('Preset', '');
    const presets = this._commonStyles().presets;
    const select = element('select', 'h-select h-compact');
    select.append(option('', $HR('(none)')));
    for (const [name, preset] of Object.entries(presets)) select.append(option(name, preset?.label || name));
    select.value = node.preset || '';
    select.disabled = this.readOnly;
    select.addEventListener('change', () => this._edit((doc) => doc.setPreset(node.id, select.value || null)));
    presetRow.querySelector('.h-cms-property-value').replaceWith(select);
    line('Own style', cssText(record.doc.nodeStyle(node.id)) || $HR('(none)'));
    if (!this.readOnly) {
      const actions = element('div', 'h-cms-property-actions');
      actions.append(barButton('fa-palette', 'Own style', () => this._ownStyle(node.id), 'Own style…'));
      if (node.kind === 'text') actions.append(barButton('fa-pen', 'Edit text', () => this._editText(node.id), 'Edit text'));
      if (node.kind === 'instance') actions.append(barButton('fa-gear', 'Configuration', () => this._configure(node.id), 'Configuration'));
      box.append(actions);
    }
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

  async _editText(id) {
    const record = this._currentRecord();
    const createEditor = await this._editor();
    const html = await openTextEditor({ html: record.doc.text(id), baseUrl: this.options.runtime?.baseUrl || '', createEditor });
    if (html !== null) this._edit((doc) => doc.setText(id, html));
  }

  async _translate(id) {
    const record = this._currentRecord();
    const languages = (this.site?.languages || []).slice(1);
    let language = languages[0];
    if (languages.length > 1) {
      language = await chooseOption('Translate into', 'Translate', languages.map((code) => [code, code.toUpperCase()]));
      if (!language) return;
    }
    const createEditor = await this._editor();
    const html = await openTextEditor({
      html: record.doc.translation(language, id) || record.doc.text(id),
      original: record.doc.text(id),
      baseUrl: this.options.runtime?.baseUrl || '',
      title: `${$HR('Translate')}: ${language.toUpperCase()}`,
      createEditor
    });
    if (html !== null) this._edit((doc) => { doc.setTranslation(language, id, html); return true; });
  }

  async _ownStyle(id) {
    const record = this._currentRecord();
    const style = await openStyleForm({ style: record.doc.nodeStyle(id), title: $HR('Own style') });
    if (style) this._edit((doc) => { doc.setNodeStyle(id, style); return true; });
  }

  async _configure(id) {
    const record = this._currentRecord();
    const node = this._treeItem(id);
    const instance = node?.instance ? record.doc.instance(node.instance) : null;
    if (!instance) return;
    if (instance.kind === 'widget') {
      HMsg.showMsgFlash?.($HR('The menu shows the pages of the website; it has no settings.'), { showDelay: 3000 });
      return;
    }
    try {
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

  async _editor() {
    if (this.options.loadEditor) return this.options.loadEditor();
    const { createTinyMceEditor } = await import('#shared/widgets/rich-text/HTinyMceEditor.js');
    return createTinyMceEditor;
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
  if (item.kind === 'text') return 'fa-paragraph';
  if (item.kind === 'instance') return item.type === 'menu' ? 'fa-bars' : 'fa-cube';
  if (item.control === 'tabs') return 'fa-folder-open';
  if (item.control === 'accordion') return 'fa-list';
  if (item.preset === 'columns2' || item.preset === 'columns3') return 'fa-table-columns';
  return item.kind === 'control' ? 'fa-layer-group' : 'fa-code';
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
