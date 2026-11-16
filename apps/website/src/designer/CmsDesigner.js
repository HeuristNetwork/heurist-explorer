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
import { buildTemplatePage } from '#shared/site/cmsPageTemplates.js';
import { normalizeRecordLimits } from '#shared/recordview/recordLimits.js';
import {
  CMS_MEDIA_DEFAULTS, buildCmsGalleryItem, buildCmsMedia, buildCmsPlaceholder, cmsAssetUrl, cmsMediaCaption, cmsMediaType, cmsMediaView
} from '#shared/site/cmsMedia.js';
import { fileMediaUrls } from '#shared/recordview/fileMediaItem.js';
import { systemFieldIds } from '#shared/data/systemEntities.js';
import { TranslationClient } from '#shared/data/TranslationClient.js';
import { oneAtATime } from '#shared/ui/oneAtATime.js';
import { openTextTranslationDialog } from '#shared/widgets/translation/HTextTranslationDialog.js';
import { createTranslationForm, openTranslationDialog } from '#shared/widgets/translation/HTranslationDialog.js';
import { CmsPreview, PREVIEW_WIDTHS } from './CmsPreview.js';
import { WebsiteCheck, checkProblemPlaces } from '../manager/WebsiteCheck.js';
import { createWebsiteFieldsForm, PAGE_FIELD_KEYS, WEBSITE_FIELD_KEYS } from '../manager/websiteFields.js';
import { FORM_MIN_WIDTH, FORM_SIDE_WIDTH, createFormPanel } from './designerInline.js';
import { styleRows } from './designerStyles.js';
import {
  cardTemplateTerms, openBreadcrumbsForm, openCardsForm, openEmailForm, openFieldForm, openLanguageForm, openMediaForm, openMenuForm, openReportForm, teamReportBody
} from './widgetForms.js';
import { openNewRecordPageForm, recordPageTerms, sitePageTerms } from './recordPageField.js';
import { filterPageTerms, recordFilterFieldTerms } from './savedFilterField.js';
import { cmsFilterHref } from '#shared/site/cmsSavedFilter.js';
import { QuerySource } from '#shared/data/QuerySource.js';
import { QuerySourceProvider } from '#shared/data/QuerySourceProvider.js';
import { RecordTypeProvider } from '#shared/data/RecordTypeProvider.js';
import { openActionMenuForm, openSocialForm, sitePageList } from './actionForms.js';
import { buildBadgesHtml, openBadgesForm } from './badgesForm.js';
import {
  EXPLORER_MODULES, explorerModuleSettings, explorerModuleTypes, moduleItemId, parseModuleItemId, withExplorerModuleSettings
} from './explorerModules.js';
import { createTemplateForm, hasTemplateForm } from './templateForms.js';
import {
  changedDetails, dropPlace, menuPlace, previewUrl, recordDocument, startPageChoices, subPageIds
} from './designerData.js';
import {
  askConflict, askRemovePage, askSaveDiscard, confirm, confirmNear, openAddElementForm,
  openAddPageForm, openFooterForm, openPageForm, openStylesDialog
} from './designerDialogs.js';
import './designer.css';

/** The record type of query sources (RT_QUERY_SOURCE): its global concept code (Saved filter, plan 27j). */
const QUERY_SOURCE_CONCEPT_CODE = '3-1021';

/** Elements that are module instances: they get the website defaults of the module when added (review 2026-11-15). */
const MODULE_ELEMENTS = Object.freeze(['explorer', 'data', 'map', 'timeline', 'graph', 'recordview']);

/** The instance of a node of a record document (`data-h-instance`), or null. */
function instanceOfNode(doc, nodeId) {
  const node = doc.find(nodeId)?.node;
  return node?.attrs?.find(([name]) => name === 'data-h-instance')?.[1] || null;
}

/** Media types the text editor inserts (Media of TinyMCE, 2026-11-14). */
const TEXT_MEDIA_TYPES = Object.freeze(['image', 'video', 'audio', 'service']);

/** Styles of tabs (plan 27k §3, CMS_TAB_STYLES): value, label. */
const TAB_STYLE_LABELS = Object.freeze([['tabs', 'Tabs'], ['underline', 'Bottom border'], ['pills', 'Pills'], ['links', 'Links'],
  ['buttons', 'Buttons'], ['outline', 'Outlined buttons']]);

const PART_LABELS = Object.freeze({ header: 'Header', content: 'Home', footer: 'Footer' });
const ROOT = '#root';

/** The usual minimum width of the west pane. */
const WEST_MIN_WIDTH = 280;

/** Icons of the website parts and pages (Site tree and the root of the part tree). */
const PART_ICONS = Object.freeze({ header: 'fa-heading', content: 'fa-house', footer: 'fa-f', page: 'fa-file-lines', recordPage: 'fa-id-card' });
const CLIP_KEY = 'heurist.cms.clipboard';
const HELP_KEY = 'heurist.cms.help';
/** Dialog element of the Check popup. */
const CHECK_DIALOG = 'h-cms-check-dialog';

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
    'Select an element here or in the preview to edit its content, properties and style. Changes are kept until you Save or Discard them.',
    'A click on a link of a menu, of the breadcrumbs or on the logo in the preview opens its page.'
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
    for (const name of ['_editText', '_editField', '_editMedia', '_editCaption', '_configure', '_editPage']) {
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
    // pages and elements with a problem found by Check, marked in the trees
    this.problems = null;
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
    this._formObserver?.disconnect?.();
    void this.formPanel?.hide();
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
    if (!record) return false;
    // the page fields of the page popup (plan 27i §10) are saved with the page
    return Object.keys(record.fieldChanges || {}).length > 0 || JSON.stringify(record.doc.serialize()) !== JSON.stringify(record.saved);
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
    await this._closeForm();
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
    record.doc = recordDocument(record.record, this.codes, { baseUrl: this.options.runtime?.baseUrl || '' });
    delete record.fieldChanges;
    this.undoStack = [];
    this.redoStack = [];
    this._renderPart();
    this._loadPreview();
    this._updateBar();
    if (this.formPanel?.isOpen()) void this._openForm(this.formNode);
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
    const doc = recordDocument(record, this.codes, { baseUrl: this.options.runtime?.baseUrl || '' });
    const entry = { id, entity, record, doc, saved: doc.serialize(), modified: String(record.rec_Modified || ''), canEdit: data.meta?.canEdit !== false };
    this.records.set(id, entry);
    return entry;
  }

  /** Save the changed fields of a record; `extra`: other fields to send (Custom CSS). Save shows Saving while it runs. */
  async _saveRecord(id, options = {}) {
    if (this.saving) return false;
    this._setSaving(true);
    try {
      return await this._patchRecord(id, options);
    } finally {
      this._setSaving(false);
    }
  }

  async _patchRecord(id, { force = false, extra = {}, quiet = false } = {}) {
    const record = this.records.get(id);
    if (!record) return true;
    const now = record.doc.serialize();
    const fieldChanges = record.fieldChanges || {};
    const details = { ...changedDetails(now, record.saved, this.codes), ...fieldChanges, ...extra };
    if (!Object.keys(details).length) return true;
    const issues = record.doc.check(this.options.runtime?.baseUrl || '').filter((issue) => issue.level === 'error');
    if (issues.length) {
      HMsg.showMsgErr?.(issues.map((issue) => issue.message).join('\n'));
      return false;
    }
    try {
      const response = await this.apiClient.request(`/${record.entity}/${id}`, {
        method: 'PATCH',
        query: { fields: SAVED_HEADER, ...(force ? { force: 1 } : {}) },
        body: { rec_ID: id, rec_Modified: record.modified, details }
      });
      const saved = (response?.data ?? response)?.records?.[0];
      record.saved = now;
      record.modified = String(saved?.rec_Modified || record.modified);
      // the answer is the header only (plan 32): the sent fields are the saved state
      record.record = { ...record.record, ...savedHeader(saved), details: { ...record.record.details, ...mapValues(details) } };
      delete record.fieldChanges;
    } catch (error) {
      if (error?.status === 409 && !force) {
        const answer = await askConflict();
        if (answer === 'overwrite') return this._patchRecord(id, { force: true, extra, quiet });
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
    // quiet: a save of a series (the starter pages of a new website)
    if (!quiet) HMsg.showMsgFlash?.($HR('Saved'), { showDelay: 1200 });
    // a new name or menu entry of a page: the Site tree and the menus of the preview
    if (this.site && Object.keys(fieldChanges).length) {
      this.site = await this.websites.summary(this.site.id, { entity: 'website' });
      this.siteTree?.setItems(this._siteItems());
      this.siteTree?.select(this._partItemId(this.current));
      this._loadPreview();
      if (this.formPanel?.isOpen()) void this._openForm(this.formNode);
      return true;
    }
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
      record.doc = recordDocument(record.record, this.codes, { baseUrl: this.options.runtime?.baseUrl || '' });
      delete record.fieldChanges;
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
    this.layout = new HCardinalLayout(body, { westSize: 360, minWest: WEST_MIN_WIDTH, splitterButtons: true });
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
      // a link of a menu, breadcrumbs or the logo (plan 27k §13): its page opens here
      onNavigate: (target) => void this._navigate(target),
      // the language switch of the page (plan 27k §13.1): the Language of the preview toolbar
      onLanguage: (code) => this._previewLanguage(code),
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
    this.pagePanel = pagePanel;
    // the inline Own style form of the page editor (plan 27i §10): right of the tree in a wide pane, below it in a narrow one
    this.pageBar = this._renderPageBar();
    this.formPanel = createFormPanel({ onClose: () => void this._closeForm() });
    const pageMain = element('div', 'h-cms-page-main');
    pageMain.append(this.partPane);
    pagePanel.append(pageMain, this.formPanel.element);
    if (typeof globalThis.ResizeObserver === 'function') {
      this._formObserver = new globalThis.ResizeObserver(([entry]) => {
        pagePanel.classList.toggle('h-cms-form-side', (entry?.contentRect?.width || 0) >= FORM_SIDE_WIDTH);
      });
      this._formObserver.observe(pagePanel);
    }
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

  /** Toolbar above the tabs: Properties, Styles, Check, Open, Help, Close. */
  _renderToolbar() {
    const bar = element('div', 'h-cms-toolbar');
    if (!this.readOnly) {
      this.propertiesButton = barButton('fa-gear', 'Properties', () => this._editRecord(this._propertiesRecord()), 'Properties');
      bar.append(this.propertiesButton, barButton('fa-palette', 'Styles of the whole website', () => this._styles(), 'Styles'));
    }
    bar.append(
      barButton('fa-list-check', 'Check the format of all pages and the records a visitor can not see', () => this._check(), 'Check'),
      // as Open of the Website manager (2026-11-12)
      barButton('fa-up-right-from-square', 'Open the website in a new tab (the saved version)', () => this._openSite(), 'Open'),
      element('span', 'h-cms-toolbar-spacer'),
      barButton('fa-circle-question', 'Show or hide the help', () => this._toggleHelp()),
      barButton('fa-door-open', 'Close', () => this.close(), 'Close')
    );
    return bar;
  }

  /**
   * Open the website (or the standalone page) in a new tab, at the selected page of the menu; a record page needs a
   * record in its URL, so the website opens at its home page then.
   */
  _openSite() {
    const top = this.site || this.standalone;
    if (!top?.url) return;
    const id = Number(this.current?.recordId) || 0;
    const find = (pages) => {
      for (const page of pages || []) {
        if (Number(page.id) === id) return page;
        const found = find(page.children);
        if (found) return found;
      }
      return null;
    };
    const page = this.site && id !== Number(this.site.id) ? find(this.site.pages) : null;
    globalThis.open?.(page && !page.record ? `${top.url}/${page.id}` : top.url, '_blank', 'noopener');
  }

  /**
   * Bars of the part tree (plan 27i §10, review 2026-11-14). Above the tree: Copy, Paste, Layout (header and footer)
   * and, on the right, a second Save Page (2026-11-14); below it: Own style (the inline form), Undo, Redo, Discard and
   * Save Page. Read only: one note below the tree.
   */
  _renderPageBar() {
    const bar = element('div', 'h-cms-pane-bar');
    if (this.readOnly) {
      const note = element('span', 'h-cms-readonly');
      note.textContent = $HR('Read only: you can not change this website');
      bar.append(note);
      return bar;
    }
    this.buttons = {
      style: barButton('fa-palette', 'Own style of the selected element, beside the tree', () => void this._toggleStyleForm()),
      undo: barButton('fa-rotate-left', 'Undo (Ctrl+Z)', () => this.undo()),
      redo: barButton('fa-rotate-right', 'Redo (Ctrl+Y)', () => this.redo()),
      discard: barButton('fa-xmark', 'Discard the changes', async () => {
        if (await confirm(this._discardQuestion(), { yes: 'Discard', narrow: true })) this.discard();
      }, 'Discard'),
      copy: barButton('fa-copy', 'Copy the selected element with its texts', () => this._copy('all')),
      paste: barButton('fa-paste', 'Paste the copied element into the selected group or after the selected element', () => this._paste()),
      // header and footer: their position, orientation and theme, and the fields of the website (plan 27f §13)
      layout: barButton('fa-sliders', 'Position, orientation, theme and fields of the header and footer', () => this._styles({ tab: 'layout' }), 'Layout'),
      save: barButton('fa-floppy-disk', 'Save the page (Ctrl+S)', () => this.save(), 'Save Page')
    };
    this.buttons.saveTop = barButton('fa-floppy-disk', 'Save the page (Ctrl+S)', () => this.save(), 'Save Page');
    this.buttons.save.classList.add('h-btn-primary');
    this.buttons.saveTop.classList.add('h-btn-primary');
    const { style, undo, redo, discard, copy, paste, layout, save, saveTop } = this.buttons;
    this.pageTopBar = element('div', 'h-cms-pane-bar h-cms-pane-bar-top');
    this.pageTopBar.append(copy, paste, layout, element('span', 'h-cms-toolbar-spacer'), saveTop);
    bar.append(style, undo, redo, discard, element('span', 'h-cms-toolbar-spacer'), save);
    return bar;
  }

  /** 'Discard the changes of page "About"?', or of Header / Home / Footer. */
  _discardQuestion() {
    const name = this._partLabel();
    if (this.site && this.current?.recordId === this.site.id) return `${$HR('Discard the changes of')} ${name}?`;
    return `${$HR('Discard the changes of page')} "${name}"?`;
  }

  /** Save buttons: a rotating icon and Saving while a save runs. */
  _setSaving(on) {
    this.saving = on;
    for (const button of [this.buttons?.save, this.buttons?.saveTop]) {
      if (!button) continue;
      if (on) {
        button.dataset.label = button.innerHTML;
        button.innerHTML = `<span class="h-spinner" aria-hidden="true"></span> ${$HR('Saving...')}`;
      } else if (button.dataset.label) {
        button.innerHTML = button.dataset.label;
        delete button.dataset.label;
      }
    }
    this._updateBar();
  }

  _updateBar() {
    const dirty = this.isDirty();
    if (this.dirtyMark) this.dirtyMark.hidden = !dirty;
    if (this.buttons) {
      this.buttons.save.disabled = !dirty || Boolean(this.saving);
      this.buttons.saveTop.disabled = this.buttons.save.disabled;
      this.buttons.discard.disabled = !dirty;
      this.buttons.undo.disabled = !this.undoStack.length;
      this.buttons.redo.disabled = !this.redoStack.length;
      const record = this._currentRecord();
      const node = record && this.selectedNode ? this._treeItem(this.selectedNode) : null;
      this.buttons.copy.disabled = !node || node.kind === 'instance';
      this.buttons.paste.disabled = !this.clipboard || !record;
      this.buttons.layout.hidden = !(this.site && this.current?.recordId === this.site.id && ['header', 'footer'].includes(this.current.part));
      // the page, the header and the footer have an own style too (review 2026-11-16)
      this.buttons.style.disabled = !record;
      this.buttons.style.classList.toggle('is-active', Boolean(this.formPanel?.isOpen()));
    }
  }

  /**
   * Second row: preview language (several languages only) on the left, page width of the preview on the right
   * (2026-11-12).
   */
  _renderViewBar() {
    const bar = element('div', 'h-cms-view-bar');
    const languages = this.site?.languages || [];
    if (languages.length > 1) {
      const select = element('select', 'h-select h-compact');
      select.title = $HR('Preview language');
      for (const code of languages) select.append(option(code, code.toUpperCase()));
      select.value = this.language || languages[0];
      select.addEventListener('change', () => {
        this.language = select.value === languages[0] ? null : select.value;
        this._loadPreview();
      });
      this.languageSelect = select;
      bar.append(caption('Language'), select, element('span', 'h-cms-toolbar-spacer'));
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
    // problems found by Check (Highlight issues in tree)
    const marked = (id) => Boolean(this.problems?.pages.has(Number(id)));
    const pages = (list) => (list || []).map((page) => ({
      // a record page (plan 27g): its own icon, it is not shown in website menus
      id: `page:${page.id}`, label: page.title || `#${page.id}`, icon: page.record ? PART_ICONS.recordPage : PART_ICONS.page,
      title: page.record ? $HR('Record page: shows the record of its URL, not in the menus of the website') : undefined,
      bold: true, danger: marked(page.id),
      children: pages(page.children)
    }));
    return [
      { id: 'part:header', label: $HR('Header'), icon: PART_ICONS.header, bold: true, draggable: false, danger: this._sitePartProblem('header') },
      { id: 'part:content', label: $HR('Home'), icon: PART_ICONS.content, bold: true, draggable: false, danger: this._sitePartProblem('content'),
        children: pages(this.site.pages) },
      { id: 'part:footer', label: $HR('Footer'), icon: PART_ICONS.footer, bold: true, draggable: false, danger: this._sitePartProblem('footer') }
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

  /**
   * The preview in another language, chosen in the language switch of the page (plan 27k §13.1): as the Language of the
   * preview toolbar (the first language of the website = null); a language the website does not have, or the shown one:
   * nothing.
   *
   * @param {string} code Language code (hreflang of the switch).
   * @returns {boolean} Whether the preview loads in another language.
   */
  _previewLanguage(code) {
    const languages = this.site?.languages || [];
    const chosen = languages.find((item) => String(item).toLowerCase() === String(code || '').toLowerCase());
    if (!chosen) return false;
    const language = chosen === languages[0] ? null : chosen;
    if (language === this.language) return false;
    this.language = language;
    if (this.languageSelect) this.languageSelect.value = chosen;
    this._loadPreview();
    return true;
  }

  /**
   * Open the page of a link clicked in the preview (plan 27k §13): as a click on the page in the website tree (with the
   * Save / Discard question of changes). A link without a page: the Startup page (layout.startPage) when it is a page of
   * the website, else Home; the id of the website: Home. From the header or footer the content of the page opens. A page not in the website
   * tree: a message, nothing changes.
   *
   * @param {{pageId?: number}} target
   * @returns {Promise<boolean>} Whether a page was opened (or is open already).
   */
  async _navigate({ pageId = 0 } = {}) {
    if (!this.site) return false;
    const find = (pages, id) => {
      for (const page of pages || []) {
        if (Number(page.id) === id) return page;
        const found = find(page.children, id);
        if (found) return found;
      }
      return null;
    };
    let id = Number(pageId) || 0;
    if (!id) {
      // a link without a page: the Startup page; the id of the website in a link is the home page itself (the server
      // writes it when there is a Startup page: "Enter site" of a Cover page, 2026-11-16)
      const start = Number(this.records.get(this.site.id)?.doc.layout()?.startPage) || 0;
      id = start && find(this.site.pages, start) ? start : 0;
    } else if (id === Number(this.site.id)) {
      id = 0;
    }
    const item = id ? `page:${id}` : 'part:content';
    if (id && !find(this.site.pages, id)) {
      HMsg.showMsgFlash?.($HR('This page is not in the website'), { showDelay: 2000 });
      return false;
    }
    if (this._partItemId(this.current) === item) return true;
    await this._selectSiteItem(item);
    return this._partItemId(this.current) === item;
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

  /**
   * Add page (review 2026-11-14): one popup, the templates and the form of the chosen one (page fields, elements of
   * the template); Record page asks for its Smarty report afterwards.
   */
  async _addPage(parent) {
    const languages = this.site?.languages || [];
    const services = { ...this._formServices(), translator: this._translator(), recordField: await this.bridge?.recordFieldServices?.() };
    const values = await openAddPageForm({
      title: parent ? 'Add sub page' : 'Add page',
      createForm: (host, template, title) => (template === 'record' ? null : createTemplateForm(host, template, {
        title, codes: this.codes, languages, dbdefs: this.options.dbdefs, apiClient: this.apiClient, services
      }))
    });
    if (!values) return;
    if (values.template === 'record') {
      // record page (2026-11-12): the Smarty report is chosen in the popup Define new record page, as in the forms
      const recordServices = { ...this._formServices(), createRecordPage: (template, title) => this._createRecordPage(template, values.title || title, parent) };
      const page = await openNewRecordPageForm(recordServices);
      if (page) await this.selectPart(page.id, 'content');
      return;
    }
    const answer = values.form;
    if (!answer) return;
    const codes = this.codes;
    const title = fieldText(answer.details[codes.name]).trim() || values.title;
    if (!fieldText(answer.details[codes.name]).trim()) delete answer.details[codes.name];
    // Blog is still a blank page
    const template = CMS_PAGE_PRESETS.includes(values.template) || hasTemplateForm(values.template) ? values.template : 'blank';
    try {
      const { id, configure } = await this._createTemplatePage(template, title, { values: answer.values, details: answer.details,
        layout: answer.layout, parent });
      await this.selectPart(id, 'content');
      if (template === 'cover') await this._coverAsStartPage(id);
      // a widget that needs its choice at once (Publications: the generated report)
      for (const node of configure) await this._configure(node);
    } catch (error) {
      HMsg.showMsgErr?.(error?.message || String(error));
    }
  }

  /**
   * A new page of a template or preset in the menu of the website (Add page; the starter pages of a new website).
   *
   * @param {string} template Template or preset.
   * @param {string} title Name of the page.
   * @param {{values?: object, details?: object, layout?: object|null, parent?: number|null, index?: number|null}} [options]
   *        `values`: of the template form (none: all elements of the template); `details`: other fields of the page
   *        record; `index`: the place in the menu (default: the end).
   * @returns {Promise<{id: number, configure: string[]}>} `configure`: nodes whose widget needs its choice.
   */
  async _createTemplatePage(template, title, { values = {}, details = {}, layout = null, parent = null, index = null } = {}) {
    const codes = this.codes;
    const languages = this.site?.languages || [];
    const options = { layout };
    if (hasTemplateForm(template)) {
      Object.assign(options, { values, site: await this._templateSite(), language: languages[0] || 'eng', ...this._templateBuilders() });
    }
    const starter = cmsPageStarter(template, title, options);
    starter.configuration = await this._withWebsiteDefaults(starter.configuration);
    if (template === 'team' && options.values?.fromDatabase && options.values.cardTemplate === CMS_TEAM_TEMPLATE) {
      await this._ensureTeamReport();
    }
    // the name keeps its translations; an empty name: the default title of the template
    const body = { [codes.name]: [title], ...details, [codes.version]: '4', [codes.content]: starter.content,
      [codes.configuration]: starter.configuration };
    const response = await this.apiClient.request('/page/0', { method: 'POST', body: { rec_ID: 0, details: body } });
    const id = Number((response?.data ?? response)?.records?.[0]?.rec_ID);
    await this._menuChange(() => this.websites.assign(this.site.id, id, { parent, ...(Number.isInteger(index) ? { index } : {}) }));
    return { id, configure: starter.configure || [] };
  }

  /**
   * The starter pages of a new website (New website, 2026-11-14): the home content becomes the template Landing, the
   * "About" page of the server is replaced by the chosen template pages (Cover, About, Discover, Contact; all their
   * elements); a Cover page becomes the Startup page.
   *
   * @param {string[]} pages Chosen templates.
   * @returns {Promise<void>}
   */
  async addStarterPages(pages = []) {
    if (!this.site || this.readOnly) return;
    const chosen = new Set(pages);
    const languages = this.site.languages || [];
    const titles = { cover: 'Cover', about: 'About', discover: 'Discover', contact: 'Contact' };
    const problems = [];
    // each step on its own: one failing step does not stop the others (review 2026-11-14)
    const step = async (name, run) => {
      try {
        return await run();
      } catch (error) {
        problems.push(`${$HR(name)}: ${error?.message || String(error)}`);
        return null;
      }
    };
    // no flash messages: the New website popup is shown while the pages are made (review 2026-11-15)
    // the home content: the template Landing
    await step('Home', async () => {
      const home = await this._record(this.site.id);
      for (const item of home.doc.tree('content')) home.doc.remove(item.id);
      buildTemplatePage(home.doc, 'landing', $HR('Welcome'), { values: {}, site: await this._templateSite(), language: languages[0] || 'eng',
        ...this._templateBuilders() });
      await this._saveRecord(this.site.id, { quiet: true });
    });
    // the About page of the server: filled with the template About, or removed after the other pages exist (the top
    // menu can not be empty: "Top level menus" is required)
    const starter = (this.site.pages || []).map((page) => Number(page.id)).filter((id) => id > 0);
    const about = starter[0] || 0;
    if (about && chosen.has('about')) await step('About', () => this._fillTemplatePage(about, 'about', $HR(titles.about)));
    let created = 0;
    let cover = 0;
    for (const template of ['cover', 'about', 'discover', 'contact']) {
      if (!chosen.has(template) || (template === 'about' && about)) continue;
      // the Cover page first in the menu
      // the Cover page: first in the menu, without the header and the footer (as the Add page form gives it)
      const page = await step(titles[template], () => this._createTemplatePage(template, $HR(titles[template]),
        template === 'cover' ? { index: 0, layout: { hideHeader: true, hideFooter: true }, details: this._hiddenInMenu() } : {}));
      if (!page?.id) continue;
      created += 1;
      if (template === 'cover') cover = page.id;
    }
    if (about && !chosen.has('about')) {
      if (created) {
        await step('About', async () => {
          await this.websites.removeFromMenu(this.site.id, about, { standalone: false });
          await this.websites.remove(about, { entity: 'page', force: true });
        });
      }
      // else the page About is kept: the menu of a website needs one page
    }
    if (cover) await step('Cover', () => this._coverAsStartPage(cover, { quiet: true }));
    await this._menuChange(async () => {});
    await this.selectPart(this.site.id, 'content', { force: true });
    if (problems.length) HMsg.showMsgErr?.(problems.join('\n'));
  }

  /**
   * The website defaults of a module element (bridge `websiteDefaults`, review 2026-11-15): `{settings, state}`, null
   * without them (an older host: the module defaults as before).
   */
  async _websiteDefaults(type) {
    if (typeof this.bridge?.websiteDefaults !== 'function') return null;
    try {
      return await this.bridge.websiteDefaults({ moduleType: type });
    } catch (error) {
      console.warn('Website defaults of a module', type, error);
      return null;
    }
  }

  /** The configuration of a template page with the website defaults of its modules without settings (JSON text). */
  async _withWebsiteDefaults(configuration) {
    let config = null;
    try {
      config = JSON.parse(configuration);
    } catch {
      return configuration;
    }
    let changed = false;
    for (const instance of Object.values(config?.instances || {})) {
      const empty = !instance.settings || !Object.keys(instance.settings).length;
      if (instance.kind !== 'module' || !empty) continue;
      const defaults = await this._websiteDefaults(instance.type);
      if (!defaults) continue;
      Object.assign(instance, defaults);
      changed = true;
    }
    return changed ? JSON.stringify(config) : configuration;
  }

  /**
   * Fill an existing page with a template (the About page of a new website, 2026-11-14): its content and configuration
   * written at once (PATCH), the name kept.
   *
   * @param {number} id Page record.
   * @param {string} template Template.
   * @param {string} title Title of the template (its heading).
   * @returns {Promise<void>}
   */
  async _fillTemplatePage(id, template, title) {
    const languages = this.site?.languages || [];
    const starter = cmsPageStarter(template, title, { values: {}, site: await this._templateSite(), language: languages[0] || 'eng',
      ...this._templateBuilders() });
    starter.configuration = await this._withWebsiteDefaults(starter.configuration);
    const codes = this.codes;
    await this.apiClient.request(`/page/${id}`, {
      method: 'PATCH',
      query: { force: 1, fields: 'rec_ID,rec_Modified' },
      body: { rec_ID: id, details: { [codes.content]: starter.content, [codes.configuration]: starter.configuration } }
    });
    // a loaded copy of the page is out of date
    this.records.delete(id);
  }

  /**
   * A new Cover page becomes the Startup page of the website (layout.startPage, 2026-11-14) when none is chosen (or the
   * home page is); saved at once. Not when the website record has unsaved changes (they are not saved by this).
   */
  async _coverAsStartPage(pageId, { quiet = false } = {}) {
    if (!this.site || this.readOnly) return;
    const record = await this._record(this.site.id);
    const layout = record.doc.layout();
    const start = Number(layout.startPage) || 0;
    if (start && start !== this.site.id && menuPlace(this.site.pages, start)) return;
    if (Object.keys(record.fieldChanges || {}).length || JSON.stringify(record.doc.serialize()) !== JSON.stringify(record.saved)) return;
    record.doc.setLayout({ ...layout, startPage: pageId });
    if (await this._saveRecord(this.site.id, { quiet }) && !quiet) {
      HMsg.showMsgFlash?.($HR('The Cover page is the Startup page of the website (Navigation and layout)'), { showDelay: 3000 });
    }
  }

  /**
   * The values of the website for a page template (plan 27i §9): title, subtitle, summary, the logo file and the home
   * page (the website record).
   *
   * @returns {Promise<{title: string, subtitle: string, summary: string, logo: object|null, homeId: number}>}
   */
  async _templateSite() {
    if (!this.site) return {};
    const details = (await this._record(this.site.id)).record.details || {};
    const value = (key) => (this.codes[key] ? fieldText(details[this.codes[key]]) : '');
    const logoId = Number(value('logo')) || 0;
    let logo = null;
    if (logoId) {
      try {
        const [item] = await this._mediaItems({ mode: 'files', ids: [logoId] });
        logo = item?.file && cmsMediaType(item.file) === 'image' ? item.file : null;
      } catch {
        logo = null;
      }
    }
    return { title: value('name') || this.site.title || '', subtitle: value('subtitle'), summary: value('shortSummary'), logo,
      homeId: this.site.id };
  }

  /** HTML makers of a page template (plan 27i §9): media, placeholder images, a gallery of placeholders, asset URLs. */
  _templateBuilders() {
    const runtime = this.options.runtime || {};
    const baseUrl = runtime.baseUrl || '';
    // stored HTML: the relative file endpoints (./api/…, plan 34), made absolute by the server and the preview
    const urls = fileMediaUrls(baseUrl, runtime.database || '', { relative: true });
    const languages = this.site?.languages || [];
    return {
      mediaHtml: (file, settings) => buildCmsMedia(file, settings, { urls, language: languages[0] || 'eng' }),
      placeholderHtml: (name, settings) => buildCmsPlaceholder(name, settings, baseUrl),
      assetUrl: (name) => cmsAssetUrl(baseUrl, name),
      // the same figures in every language: no captions
      galleryHtml: (names) => {
        const html = names.map((name) => `<figure class="h-site-card" data-h-media="">${buildCmsPlaceholder(name, {}, baseUrl)}</figure>`).join('');
        return languages.length ? Object.fromEntries(languages.map((code) => [code, html])) : { def: html };
      }
    };
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

  /**
   * Check of the website (review 2026-11-08): saved state only (asks about unsaved changes), result in a popup.
   * The record editor and the record viewer are dialogs over it; after an edit the check runs again. *Highlight
   * issues in tree* marks the pages and elements with a problem in the site and page trees.
   */
  async _check() {
    if (!(await this._leaveDirty())) return;
    const top = this.site || this.standalone;
    if (!top) return;
    let result;
    try {
      result = await this.websites.validate(top.id, { entity: this.site ? 'website' : 'page' });
    } catch (error) {
      HMsg.showMsgErr?.(error?.message || String(error));
      return;
    }
    // a new check: the marks of the last one go
    this._setProblemMarks(null);
    const places = checkProblemPlaces(result);
    const host = element('div');
    const close = () => HMsg.closeMsgDlg(CHECK_DIALOG);
    const widget = new WebsiteCheck().attach(host, {
      apiClient: this.apiClient,
      baseUrl: this.options.runtime?.baseUrl,
      database: this.options.runtime?.database,
      onEditRecord: this.readOnly ? undefined : (id) => this._editRecord(id),
      onViewRecord: typeof this.bridge?.viewRecord === 'function' ? (id) => this.bridge.viewRecord(id) : undefined,
      onRecheck: () => void this._check()
    });
    const buttons = [{ label: 'Close', class: 'h-btn', onClick: close }];
    if (places.pages.size) {
      buttons.unshift({ label: 'Highlight issues in tree', class: 'h-btn h-btn-primary', onClick: () => {
        close();
        this._setProblemMarks(places);
      } });
    }
    const dialog = HMsg.showMsgDlg(host, { dialogId: CHECK_DIALOG, title: 'Check', buttons });
    if (dialog) dialog.style.width = 'min(1100px, calc(100vw - 24px))';
    const onClose = () => {
      if (dialog.open) return;
      dialog.removeEventListener('close', onClose);
      dialog.style.width = '';
      void widget.destroy();
    };
    dialog?.addEventListener('close', onClose);
    await widget.setResult(result);
  }

  /** Pages and elements with a problem marked in the trees (`checkProblemPlaces`), null: no marks. */
  _setProblemMarks(places) {
    this.problems = places;
    if (this.siteTree) {
      this.siteTree.setItems(this._siteItems());
      this.siteTree.select(this._partItemId(this.current));
    }
    if (this.partTree) {
      this.partTree.setItems(this._partItems());
      this.partTree.select(this.selectedNode || ROOT);
    }
  }

  /** Whether a part of the website record (header, content, footer) has a marked problem. */
  _sitePartProblem(part) {
    const siteId = this.site?.id;
    if (!siteId || !this.problems?.pages.has(siteId)) return false;
    const nodes = this.problems.nodes.get(siteId);
    const doc = this.records.get(siteId)?.doc;
    const inPart = (name) => {
      const ids = new Set();
      const walk = (items) => items.forEach((item) => { ids.add(item.id); walk(item.children || []); });
      walk(doc?.tree(name) || []);
      return [...(nodes || [])].some((node) => ids.has(node));
    };
    if (inPart(part)) return true;
    // a problem of the website record itself, or of an element not found in a part: Home
    return part === 'content' && !['header', 'content', 'footer'].some((name) => inPart(name));
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

  /**
   * The Styles popup of the website or standalone page; with a website also its fields title, subtitle, logo and banner
   * (Header block of Navigation and layout, plan 27f §13), saved with the styles.
   *
   * @param {{tab?: string}} [options] `tab: 'layout'` opens Navigation and layout (button Layout below the page tree).
   */
  async _styles({ tab = '' } = {}) {
    if (!(await this._leaveDirty())) return;
    const id = this.site ? this.site.id : this.standalone.id;
    const record = await this._record(id);
    const css = this.codes.css ? fieldText(record.record.details?.[this.codes.css]) : '';
    const recordField = this.site ? await this.bridge?.recordFieldServices?.() : null;
    const values = await openStylesDialog({
      tab,
      websiteFields: this.site ? (host) => createWebsiteFieldsForm(host, {
        dbdefs: this.options.dbdefs,
        apiClient: this.apiClient,
        codes: this.codes,
        keys: ['name', 'subtitle', 'logo', 'banner'],
        record: record.record,
        languages: this.site.languages || [],
        services: { ...this._formServices(), translator: this._translator(), recordField }
      }) : null,
      base: record.doc.base(),
      kinds: record.doc.kinds(),
      presets: record.doc.presets(),
      layout: record.doc.layout(),
      startPages: this.site ? startPageChoices(this.site.pages) : null,
      css,
      javaScriptAllowed: this.options.dbdefs?.meta?.javaScriptAllowed === true,
      files: this._files(),
      createCodeEditor: async (host, options) => {
        const { createCodeTextEditor } = await import('#shared/widgets/rich-text/HCodeTextEditor.js');
        return createCodeTextEditor(host, options);
      }
    });
    if (!values) return;
    const layoutBefore = JSON.stringify(record.doc.layout());
    record.doc.setCommonStyles(values);
    record.doc.setLayout(values.layout);
    const layoutChanged = JSON.stringify(record.doc.layout()) !== layoutBefore;
    // Custom CSS (DT_CMS_CSS) and the website fields are fields of the record, not of the document: saved with the styles
    const extra = { ...(values.fields || {}), ...(this.codes.css && values.css !== css ? { [this.codes.css]: values.css } : {}) };
    if (await this._saveRecord(id, { extra })) {
      // the custom CSS is in the head of the page, the layout in the page written by the server: load it again
      if (Object.keys(extra).length || layoutChanged) this._loadPreview(); else this._applyPreview();
      this._renderProperties();
    }
    this._updateBar();
  }

  // ------------------------------------------------------------------ part tree (Page tab)

  _renderPart() {
    this.partPane.replaceChildren();
    if (this.pageTopBar) this.partPane.append(this.pageTopBar);
    const host = element('div', 'h-cms-tree-host');
    this.partPane.append(host);
    this.partTree = new HTree().attach(host, {
      items: this._partItems(),
      tools: (item) => this._nodeTools(item),
      canDrop: (dragId, targetId, position) => this._canDropNode(dragId, targetId, position),
      onDrop: this.readOnly ? null : (dragId, targetId, position) => this._dropNode(dragId, targetId, position),
      onSelect: (id) => (parseModuleItemId(id) ? this._selectModuleItem(id) : this._selectNode(id === ROOT ? null : id)),
      onHover: (id) => this.preview?.highlight(id === ROOT ? null : parseModuleItemId(id)?.node || id),
      onTool: (action, id, button) => void this._nodeTool(action, id, button),
      onActivate: (id) => void this._activateNode(id)
    }).render();
    if (this.pageBar) this.partPane.append(this.pageBar);
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
    // elements with a problem found by Check (Highlight issues in tree)
    const marked = this.current ? this.problems?.nodes.get(this.current.recordId) : null;
    const map = (items) => items.map((item) => ({
      id: item.id,
      label: item.fieldOnly ? this._fieldLabel(item.field) : item.label,
      icon: nodeIcon(item),
      danger: Boolean(marked?.has(item.id)),
      badge: item.configured ? '' : $HR('not configured'),
      title: [item.kind, item.preset ? `${$HR('preset')}: ${item.preset}` : ''].filter(Boolean).join(' · '),
      children: [...map(item.children), ...this._explorerModuleItems(item, record)]
    }));
    return [{
      id: ROOT, label: this._partLabel(), icon: this._partIcon(), bold: true, draggable: false,
      danger: this.site && this.current?.recordId === this.site.id ? this._sitePartProblem(this.current.part)
        : Boolean(this.current && this.problems?.pages.has(this.current.recordId)),
      children: record ? map(record.doc.tree(this.current.part)) : []
    }];
  }

  /**
   * The modules of an Explorer instance (review 2026-11-14): child items of its node, configured inline with the gear;
   * not dragged, not removed.
   */
  _explorerModuleItems(item, record) {
    if (item.kind !== 'instance' || item.type !== 'explorer' || !item.instance || !record) return [];
    const settings = record.doc.instance(item.instance)?.settings || null;
    return explorerModuleTypes(settings).map((type) => ({
      id: moduleItemId(item.id, type),
      label: $HR(EXPLORER_MODULES[type].label),
      icon: EXPLORER_MODULES[type].icon,
      draggable: false,
      title: $HR('A module of this Explorer: its configuration on this page'),
      children: []
    }));
  }

  /**
   * Label of a field reference without text (review 2026-11-10): `website.2-38` -> "website: Logo image"; the name of
   * the field in the record type (HDbDefs), else the reference itself.
   *
   * @param {string} reference `website.{code}`, `page.{code}` or `{record id}.{code}`.
   * @returns {string}
   */
  _fieldLabel(reference) {
    const [owner, code] = String(reference).split('.');
    const dbdefs = this.options.dbdefs;
    const fieldId = /^\d+$/.test(code || '') ? Number(code) : Number(dbdefs?.localId?.('dty', code)) || 0;
    const rectype = { website: 'RT_CMS_HOME', page: 'RT_CMS_PAGE' }[owner];
    const name = fieldId ? dbdefs?.fieldName?.(rectype ? Number(dbdefs.dbconst?.(rectype)) || 0 : 0, fieldId) : '';
    return name ? `${/^\d+$/.test(owner) ? `#${owner}` : owner}: ${name}` : reference;
  }

  /**
   * Tools of the part tree (review 2026-11-01, 2026-11-14): + on the root (always) and on containers (tabs and
   * accordions: a new panel); the pen (gear on modules and widgets) opens the popup of the element: the page, a text,
   * a record field, media, the caption of a group, the configuration; remove. The Own style form opens from the palette
   * of the bar below the tree (no palette on the rows, 2026-11-14).
   */
  _nodeTools(item) {
    if (this.readOnly) return [];
    // a module of an Explorer: its configuration only (review 2026-11-14)
    if (parseModuleItemId(item.id)) return [{ action: 'config', icon: 'fa-gear', title: $HR('Configuration of this module on the page') }];
    if (item.id === ROOT) {
      const page = this.current?.part === 'content';
      return [
        // the page is the root group (plan 27i §9 B): its fields
        ...(page ? [{ action: 'page', icon: 'fa-pen', title: $HR('Page: name, menu, header and footer') }] : []),
        { action: 'add', icon: 'fa-plus', title: $HR('Add element'), label: $HR('Add element'), always: true }
      ];
    }
    const node = this._treeItem(item.id);
    const tools = [];
    if (node?.kind === 'control') {
      tools.push({ action: 'add', icon: 'fa-plus', title: $HR(node.control === 'group' ? 'Add element' : 'Add panel') });
    }
    const popup = this._popupTool(item.id, node);
    if (popup) tools.push(popup);
    tools.push({ action: 'delete', icon: 'fa-trash', title: $HR('Remove') });
    return tools;
  }

  /** The popup of an element (pen, gear; also a double click): null when it has none. */
  _popupTool(id, node) {
    if (!node) return null;
    if (node.field) return { action: 'field', icon: 'fa-pen', title: $HR('The record, the field and its value') };
    if (node.kind === 'text') return { action: 'edit', icon: 'fa-pen', title: $HR('Edit text') };
    if (node.kind === 'media') return { action: 'media', icon: 'fa-pen', title: $HR('The file, caption and size of the media') };
    if (node.kind === 'instance') return { action: 'configure', icon: 'fa-gear', title: $HR('Configuration') };
    // a panel of tabs / an accordion: its caption; a group: the palette opens its Own style with the caption above
    // (2026-11-14)
    if (node.kind === 'control' && this._currentRecord()?.doc.isPanel(id)) {
      return { action: 'caption', icon: 'fa-pen', title: $HR('Captions of the panels') };
    }
    // tabs / an accordion: the captions of all its panels in one popup (review 2026-11-15); tabs also their orientation
    // and style (plan 27k §3)
    if (node.kind === 'control' && ['tabs', 'accordion'].includes(node.control)) {
      return { action: 'captions', icon: 'fa-gear',
        title: $HR(node.control === 'tabs' ? 'Orientation, style and captions of the tabs' : 'Options and captions of the accordion') };
    }
    if (node.kind === 'control' && node.control === 'group') {
      return { action: 'style', icon: 'fa-palette', title: $HR('Own style and caption of the group') };
    }
    return null;
  }

  _canDropNode(dragId, targetId, position) {
    const record = this._currentRecord();
    if (!record || dragId === ROOT || parseModuleItemId(dragId) || parseModuleItemId(targetId)) return false;
    if (targetId === ROOT) return position === 'inside' && record.doc.canDrop(dragId, { id: null, position: 'inside', part: this.current.part });
    return record.doc.canDrop(dragId, { id: targetId, position, part: this.current.part });
  }

  _dropNode(dragId, targetId, position) {
    this._edit((doc) => doc.move(dragId, { id: targetId === ROOT ? null : targetId, position, part: this.current.part }));
  }

  async _nodeTool(action, id, button) {
    if (!this._currentRecord()) return undefined;
    if (action === 'config' || parseModuleItemId(id)) return this._openConfig(id);
    if (action === 'add') return this._addElement(id);
    if (action === 'page') return this._editPage();
    this._selectNode(id);
    if (action === 'edit') return this._editText(id);
    if (action === 'field') return this._editField(id);
    if (action === 'media') return this._editMedia(id);
    if (action === 'caption') return this._editCaption(id);
    if (action === 'captions') return this._editCaptions(id);
    if (action === 'style') return this._openForm(id);
    if (action === 'configure') return this._configure(id);
    if (action === 'delete' && (await confirmNear(button, 'Remove this element?'))) {
      this._edit((doc) => doc.remove(id));
      this._selectNode(null);
    }
    return undefined;
  }

  /** Double click in the part tree: the popup of the element (the pen or gear), of the page on the root. */
  _activateNode(id) {
    if (this.readOnly || !this._currentRecord()) return undefined;
    if (parseModuleItemId(id)) return this._openConfig(id);
    if (id === ROOT) return this.current?.part === 'content' ? this._editPage() : undefined;
    const tool = this._popupTool(id, this._treeItem(id));
    return tool ? this._nodeTool(tool.action, id) : undefined;
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
    // the header default set belongs into the header (plan 27f §13)
    if (values.element === 'headerSet' && this.current.part !== 'header') {
      HMsg.showMsgFlash?.($HR('The header default set can be added to the header only'), { showDelay: 3000 });
      return;
    }
    // the footer composer: its blocks first (plan 27f §3.2)
    const footerOptions = values.element === 'siteFooter' ? await openFooterForm() : {};
    if (!footerOptions) return;
    // the powered by and hosted at lines need the base URL and the host organisation (review 2026-11-10)
    const options = values.element === 'siteFooter'
      ? { ...footerOptions, baseUrl: this.options.runtime?.baseUrl || '', host: this.site?.host || null } : footerOptions;
    // a module: its website defaults at once (review 2026-11-15), not the defaults of the module
    const defaults = MODULE_ELEMENTS.includes(values.element) ? await this._websiteDefaults(values.element) : null;
    let added = null;
    this._edit((doc) => {
      added = doc.insertElement(this.current.part, values.element, target, options);
      const instanceId = defaults && added ? instanceOfNode(doc, added) : null;
      if (instanceId) doc.setInstance(instanceId, defaults);
      if (values.title && doc.isContainer(added)) doc.setCaption(added, values.title);
      else if (values.title && doc.text(added)) doc.setText(added, `<h2>${escapeHtml(values.title)}</h2>${doc.text(added)}`);
      return true;
    });
    if (added) this._selectNode(added);
    // a new media element: its file at once; a new helper widget: its settings (plan 27f)
    if (added && values.element === 'media') await this._editMedia(added);
    // a new text: its popup at once (plan 27i §10)
    if (added && values.element === 'text') await this._editText(added);
    if (added && ['actionmenu', 'social', 'badges'].includes(values.element)) await this._configure(added);
  }

  /** Copy the selected element (Copy structure / Copy all below the tree). */
  _copy(mode) {
    const record = this._currentRecord();
    if (!record || !this.selectedNode) return;
    const clip = record.doc.copy(this.selectedNode, mode);
    if (!clip) return;
    this.clipboard = clip;
    writeClipboard(this.options.runtime?.database, this.clipboard);
    this._updateBar();
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
    const changed = (id || null) !== this.selectedNode;
    this.selectedNode = id || null;
    this.partTree?.select(id || ROOT);
    if (!fromPreview) this.preview?.reveal(id);
    this._renderProperties();
    // the open form follows the selection (the last input is applied first); a module form: the form of the module
    if (changed && this.formPanel?.isOpen()) void (this.formMode === 'config' ? this._followConfig(id) : this._openForm(id || ROOT));
  }

  /** A module of an Explorer selected in the tree: its Explorer in the preview; an open form shows its configuration. */
  _selectModuleItem(id) {
    const child = parseModuleItemId(id);
    if (!child) return;
    this.selectedNode = child.node;
    this.partTree?.select(id);
    this.preview?.reveal(child.node);
    this._renderProperties();
    if (this.formPanel?.isOpen()) void this._openConfig(id);
  }

  /** The module form follows the selection: a module instance shows its configuration, another element closes it. */
  async _followConfig(id) {
    const node = id ? this._treeItem(id) : null;
    const instance = node?.instance ? this._currentRecord()?.doc.instance(node.instance) : null;
    if (instance?.kind === 'module') await this._openConfig(id);
    else await this._closeForm();
  }

  /** Help and the tools of the selected element. */
  _renderProperties() {
    this._renderHelp();
    this._updateBar();
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
      // the Heurist buttons of TinyMCE (2026-11-14): a registered media file, a link (the action menu item popup)
      insertMedia: () => this._insertTextMedia(),
      insertRecordLink: (text) => this._insertTextLink(text),
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
   * Media of the text editor (2026-11-14): a registered file chosen in the record manager of files (Select File
   * Resource) as an image, a video or audio player, or the player of a video / audio service (as a media element);
   * other files are not inserted.
   *
   * @returns {Promise<string|null>} HTML, or null.
   */
  async _insertTextMedia() {
    const files = this._files();
    if (!files.browseRecords || !files.fileRecordType) {
      HMsg.showMsgErr?.($HR('Files can not be chosen here'));
      return null;
    }
    const ids = await files.browseRecords({ recordTypes: [files.fileRecordType], selectMode: 'select', title: $HR('Select File Resource') });
    const id = Number(ids?.[0]) || 0;
    if (!id) return null;
    const [item] = await this._mediaItems({ mode: 'files', ids: [id] });
    const file = item?.file;
    if (!file || !TEXT_MEDIA_TYPES.includes(cmsMediaType(file))) {
      HMsg.showMsgFlash?.($HR('Not a media file: choose an image, a video or an audio file, or a video / audio service'), { showDelay: 3000 });
      return null;
    }
    const runtime = this.options.runtime || {};
    const html = buildCmsMedia(file, {}, { urls: fileMediaUrls(runtime.baseUrl || '', runtime.database || '', { relative: true }), language: this.language || 'eng' });
    // the caption of buildCmsMedia is empty: the media alone (Caption of the toolbar adds one)
    return html || null;
  }

  /**
   * Link of the text editor (2026-11-14): the item popup of the action menu with one item (a page, a record on a record
   * page, a URL); the selected text is its label.
   *
   * @param {string} text Selected text.
   * @returns {Promise<string|null>} HTML of the link, or null.
   */
  async _insertTextLink(text) {
    await this._loadTemplateTerms();
    const label = String(text ?? '').trim();
    const item = await openActionMenuForm({
      settings: { items: [{ label, action: this.site ? 'recordPage' : 'url' }] },
      pages: sitePageList(this.site, 'Home', { records: false }),
      services: this._actionServices(this._formServices()),
      single: { title: 'Link', actions: this.site ? ['page', 'recordPage', 'savedFilter', 'url'] : ['url'] }
    });
    if (!item) return null;
    const href = this._linkUrl(item);
    if (!href) return null;
    const icon = item.icon ? `<i class="${escapeHtml(item.icon).replace(/"/g, '&quot;')}" aria-hidden="true"></i> ` : '';
    const target = item.newTab ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${escapeHtml(href).replace(/"/g, '&quot;')}"${target}>${icon}${escapeHtml(label || item.label)}</a>`;
  }

  /** URL of a link item: a page of this website (the home page by its id), a record on a record page, a URL. */
  _linkUrl(item) {
    if (item.action === 'url') return String(item.target || '');
    // Saved filter (plan 27j): the target page with the query source and its values
    if (item.action === 'savedFilter') return cmsFilterHref(this._linkUrl({ action: 'page', target: item.target }), item.source, item.values);
    const top = this.site || this.standalone;
    const base = String(top?.url || '');
    if (!base || !(Number(item.target) > 0)) return '';
    const record = item.action === 'recordPage' ? Number(item.record) || 0 : 0;
    if (base.includes('?')) return `${base}&pageid=${Number(item.target)}${record ? `&rec=${record}` : ''}`;
    return `${base.replace(/\/+$/, '')}/${Number(item.target)}${record ? `/${record}` : ''}`;
  }

  /** Services of the action menu forms: the record of a Record page item in HInputResource (2026-11-14). */
  _actionServices(services) {
    const runtime = this.options.runtime || {};
    return { ...services, apiClient: this.apiClient, dbdefs: this.options.dbdefs,
      iconBase: { baseUrl: runtime.baseUrl || '', database: runtime.database || '' } };
  }

  /**
   * Caption of a group and its translations in the translation popup (§26): the caption in the first website
   * language, the others below; one language or none: the caption only. A panel of tabs / accordions must keep one.
   */
  async _editCaption(id) {
    const record = this._currentRecord();
    // a panel: the captions of all panels of its tabs / accordion, this one with the cursor (review 2026-11-15)
    const control = record.doc.panelControl(id);
    if (control) return this._editCaptions(control, id);
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
   * The captions of all panels of tabs or an accordion in one popup (review 2026-11-15): a block per panel (Tab 1,
   * Section 2 ...) with the rows of the Caption popup; the cursor in the first one, or in the caption of `focusId` (the
   * pen of a panel). Every caption is required (the panel label). One undo step.
   *
   * @param {string} id Tabs or accordion.
   * @param {string|null} [focusId] A panel.
   */
  async _editCaptions(id, focusId = null) {
    const record = this._currentRecord();
    const panels = record?.doc.panels(id) || [];
    if (!panels.length) return;
    const tabs = this._treeItem(id)?.control === 'tabs';
    const languages = this.site?.languages || [];
    const dialogId = 'h-cms-captions-dialog';
    const content = element('div', 'h-cms-captions');
    // tabs (plan 27k §3): orientation and style above the captions
    const look = tabs ? record.doc.tabsLook(id) : null;
    const orientation = look ? lookSelect([['horizontal', 'Horizontal'], ['vertical', 'Vertical (tabs on the left on wide screens)']], look.orientation) : null;
    const tabStyle = look ? lookSelect(TAB_STYLE_LABELS, look.style) : null;
    if (look) {
      const row = element('div', 'h-cms-captions-look');
      for (const [caption, control] of [['Orientation', orientation], ['Style of the tabs', tabStyle]]) {
        const field = element('label', 'h-cms-styles-field');
        const text = element('span');
        text.textContent = $HR(caption);
        field.append(text, control);
        row.append(field);
      }
      content.append(row);
    }
    // an accordion (plan 27k §6): several sections open at a time, the first one open at start
    const accordion = tabs ? null : record.doc.accordionLook(id);
    const lookCheck = (label, checked) => {
      const box = element('label', 'h-cms-check');
      const input = element('input');
      input.type = 'checkbox';
      input.checked = checked;
      box.append(input, document.createTextNode(` ${$HR(label)}`));
      return { box, input };
    };
    const multiple = accordion ? lookCheck('Several sections open at a time', accordion.multiple) : null;
    const firstOpen = accordion ? lookCheck('The first section open at start', accordion.firstOpen) : null;
    if (accordion) {
      const row = element('div', 'h-cms-captions-look');
      row.append(multiple.box, firstOpen.box);
      content.append(row);
    }
    let forms = [];
    const read = () => {
      const values = forms.map((form) => form.read());
      return values.every(Boolean) ? values : null;
    };
    const result = await new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        done = true;
        HMsg.closeMsgDlg(dialogId);
        resolve(value);
      };
      const submit = () => {
        const values = read();
        if (values) finish(values);
      };
      forms = panels.map((panel, index) => {
        const current = record.doc.caption(panel);
        const block = element('div', 'h-cms-captions-item');
        const label = element('div', 'h-cms-captions-label');
        label.textContent = `${$HR(tabs ? 'Tab' : 'Section')} ${index + 1}`;
        const form = createTranslationForm({
          value: current?.text || '',
          translations: current?.translations || {},
          languages,
          original: languages[0] || '',
          translator: this._translator(),
          required: true,
          onSubmit: submit
        });
        block.append(label, form.element);
        content.append(block);
        return form;
      });
      const dialog = HMsg.showMsgDlg(content, {
        dialogId,
        title: $HR(tabs ? 'Tabs: orientation, style and captions' : 'Accordion: options and captions'),
        buttons: [
          { label: 'OK', class: 'h-btn h-btn-primary', onClick: submit },
          { label: 'Cancel', class: 'h-btn', onClick: () => finish(null) }
        ]
      });
      dialog?.classList.add('h-dialog-translation');
      dialog?.addEventListener('close', () => {
        dialog.classList.remove('h-dialog-translation');
        for (const form of forms) form.destroy();
        if (!done) resolve(null);
      }, { once: true });
      const index = Math.max(0, panels.indexOf(focusId));
      forms[index]?.focus();
      forms[index]?.element.scrollIntoView?.({ block: 'nearest' });
    });
    if (!result) return;
    // languages left out are removed
    this._edit((doc) => {
      let changed = false;
      panels.forEach((panel, index) => {
        const translations = Object.fromEntries(languages.slice(1).map((code) => [code, result[index].translations[code] || '']));
        if (doc.setCaption(panel, result[index].value.trim(), translations)) changed = true;
      });
      if (look && doc.setTabsLook(id, { orientation: orientation.value, style: tabStyle.value })) changed = true;
      if (accordion && doc.setAccordionLook(id, { multiple: multiple.input.checked, firstOpen: firstOpen.input.checked })) changed = true;
      return changed;
    });
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
    await this._loadTemplateTerms();
    const options = {
      single: true,
      settings,
      caption: cmsMediaCaption(current.html),
      translations: Object.fromEntries(Object.entries(current.translations).map(([code, html]) => [code, cmsMediaCaption(html)])),
      languages,
      translator: this._translator(),
      dbdefs: this.options.dbdefs,
      apiClient: this.apiClient,
      services: this._formServices(),
      // Go to a page (2026-11-14)
      sitePages: sitePageTerms(this.site)
    };
    const result = await openMediaForm(options);
    if (result) this._applyMedia(id, result);
  }

  /** The result of the media form into the element: its settings and the HTML of each language. */
  _applyMedia(id, result) {
    const languages = this.site?.languages || [];
    const { file } = result.items[0];
    const runtime = this.options.runtime || {};
    const urls = fileMediaUrls(runtime.baseUrl || '', runtime.database || '', { relative: true });
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
      rec_RecTypeID: id('RT_REPORT_TEMPLATE'),
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
      // record pages of the website: links of records, Define new record page (plan 27g §6)
      recordPageTerms: () => recordPageTerms(this.site?.pages || [], this._templateTerms || []),
      templateTerms: (reports) => cardTemplateTerms(reports).terms,
      createRecordPage: this.site && !this.readOnly ? (template, title) => this._createRecordPage(template, title) : undefined,
      // Add and Upload in the record manager of a source
      addRecord: typeof this.bridge?.addRecord === 'function' ? (rectypeId) => this.bridge.addRecord(rectypeId) : undefined,
      mediaItems: (settings) => this._mediaItems(settings),
      // Saved filter (plan 27j): the public query sources, the definition of one, the target pages; the Filter Form
      querySources: () => this._publicQuerySources(),
      querySourceDefinition: (id) => this._querySourceDefinition(id),
      filterPages: () => filterPageTerms(this.site),
      selectExtent: typeof this.bridge?.selectExtent === 'function' ? (current) => this.bridge.selectExtent(current) : null,
      apiClient: this.apiClient,
      dbdefs: this.options.dbdefs,
      // the snapshot of a file field (an image): the relative web copy (plan 34)
      fileUrl: fileMediaUrls(runtime.baseUrl || '', runtime.database || '', { relative: true }).web,
      // "Limit values per field" of the Explorer configuration (plan 23)
      valueLimit: normalizeRecordLimits(runtime.recordLimits).values
    };
  }

  /**
   * The public query sources of the database (Saved filter, plan 27j): visitors can read them. Read once per designer.
   *
   * @returns {Promise<Array<{id: number, title: string}>>}
   */
  _publicQuerySources() {
    this._querySources ||= (async () => {
      const typeId = await new RecordTypeProvider({ apiClient: this.apiClient }).getIdByConceptCode(QUERY_SOURCE_CONCEPT_CODE);
      if (!typeId) return [];
      const answer = await this.apiClient.get('/records/', {
        query: { q: [{ t: String(typeId) }, { access: 'public' }], fields: 'rec_ID,rec_Title', limit: 1000 }
      });
      const title = (record) => String(record.rec_Title ?? '').replace(/<[^>]*>/g, '').trim() || `#${record.rec_ID}`;
      return (answer?.records || []).map((record) => ({ id: Number(record.rec_ID), title: title(record) }))
        .sort((a, b) => a.title.localeCompare(b.title));
    })().catch((error) => {
      this._querySources = null;
      throw error;
    });
    return this._querySources;
  }

  /** The definition of a query source (its query and Filter Form, plan 27j). */
  async _querySourceDefinition(id) {
    return new QuerySource(await new QuerySourceProvider({ apiClient: this.apiClient }).load(id));
  }

  /** The field value "Hide in menu" of a page (DT_CMS_MENU_FORMAT = TRM_HIDDEN_ITEM), {} without the definitions. */
  _hiddenInMenu() {
    const constant = (name) => Number(this.options.dbdefs?.dbconst?.(name)) || 0;
    return constant('DT_CMS_MENU_FORMAT') && constant('TRM_HIDDEN_ITEM') ? { [constant('DT_CMS_MENU_FORMAT')]: [constant('TRM_HIDDEN_ITEM')] } : {};
  }

  /**
   * A new record page (plan 27g §6): one Record cards widget in mode `url` with the report, at the end of the top level
   * of the menu (the server leaves record pages out of website menus).
   *
   * @param {number|string} template Report id or file name.
   * @param {string} title Title of the page (the name of the report, or the title given in Add page).
   * @param {number|null} [parent] Parent page in the menu (Add sub page); null = top level.
   * @returns {Promise<{id: number, title: string}>}
   */
  async _createRecordPage(template, title, parent = null) {
    const starter = cmsPageStarter('record', title, { template });
    const codes = this.codes;
    const details = { [codes.name]: title, [codes.version]: '4', [codes.content]: starter.content, [codes.configuration]: starter.configuration };
    // hidden in the main menu (DT_CMS_MENU_FORMAT = TRM_HIDDEN_ITEM, 2026-11-12); the server leaves record pages out
    // of website menus anyway
    const constant = (name) => Number(this.options.dbdefs?.dbconst?.(name)) || 0;
    if (constant('DT_CMS_MENU_FORMAT') && constant('TRM_HIDDEN_ITEM')) details[constant('DT_CMS_MENU_FORMAT')] = [constant('TRM_HIDDEN_ITEM')];
    const response = await this.apiClient.request('/page/0', { method: 'POST', body: { rec_ID: 0, details } });
    const id = Number((response?.data ?? response)?.records?.[0]?.rec_ID);
    if (!id) throw new Error($HR('The record page was not created'));
    await this._menuChange(() => this.websites.assign(this.site.id, id, { parent }));
    return { id, title };
  }

  /** Names of the card templates for the record page lists (loaded once; plan 27g §6). */
  async _loadTemplateTerms() {
    if (this._templateTerms) return;
    try {
      this._templateTerms = cardTemplateTerms(await this._formServices().cardTemplates()).terms;
    } catch {
      this._templateTerms = [];
    }
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
   * @param {object} [style] Own style of the element: its width and height go into the popup (a file field).
   * @param {string|null} [link] `data-h-link` of the element (plan 27g §6).
   * @returns {Promise<{reference: string, html: string, link: string, size?: object}|null>}
   */
  async _askField(reference, style = {}, link = null, linkValues = null) {
    try {
      await this._loadTemplateTerms();
      return await openFieldForm({
        reference,
        link,
        linkValues,
        sitePages: sitePageTerms(this.site),
        size: { width: style.width, height: style.height },
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
    const result = await this._askField(record.doc.field(id), record.doc.nodeStyle(id), record.doc.fieldLink(id), record.doc.fieldLinkValues(id));
    if (!result) return;
    this._edit((doc) => doc.setField(id, result.reference, result.html) && doc.setFieldLink(id, result.link, result.linkValues)
      && setFieldSize(doc, id, result.size));
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
      return doc.setField(added, result.reference, result.html) && doc.setFieldLink(added, result.link, result.linkValues)
        && setFieldSize(doc, added, result.size);
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
      query: { fields: SAVED_HEADER },
      body: { rec_ID: id, rec_Modified: open?.modified || modified, details }
    });
    if (!open) return;
    const saved = (response?.data ?? response)?.records?.[0];
    open.modified = String(saved?.rec_Modified || open.modified);
    open.record = { ...open.record, ...savedHeader(saved), details: { ...open.record.details, ...details } };
  }

  /** Configuration of the widgets: Custom report, Record cards, Media gallery, menus, badges, email form. */
  async _configureWidget(instanceId, instance) {
    await this._loadTemplateTerms();
    const services = this._formServices();
    const common = { settings: instance.settings || {}, dbdefs: this.options.dbdefs, apiClient: this.apiClient, services };
    // the popup of a widget, then `apply(result)`
    const run = async (open, apply) => {
      const result = await open({});
      if (result) apply(result);
    };
    const setSettings = (settings) => this._edit((doc) => doc.setInstance(instanceId, { settings }));
    if (instance.type === 'badges' && instance.settings?.source === 'host') {
      HMsg.showMsgFlash?.($HR('The logo and address of the organisation that hosts this Heurist are set on the server.'), { showDelay: 3000 });
    } else if (instance.type === 'badges') {
      const fileType = Number(this.options.dbdefs?.dbconst?.('RT_REGISTERED_FILE')) || 0;
      const result = await openBadgesForm({
        settings: instance.settings || {},
        browse: () => (services.browseRecords ? services.browseRecords({ recordTypes: [fileType], selectMode: 'select_multi' }) : Promise.resolve(null)),
        resolve: async (ids) => (await this._mediaItems({ mode: 'files', ids, single: false })).map((item, index) => ({ id: ids[index], ...item }))
      });
      if (!result) return;
      const runtime = this.options.runtime || {};
      const urls = fileMediaUrls(runtime.baseUrl || '', runtime.database || '', { relative: true });
      const build = (language) => buildBadgesHtml(result.items, result.settings, { urls, language });
      const languages = this.site?.languages || [];
      const html = languages.length ? Object.fromEntries(languages.map((code) => [code, build(code)])) : { def: build('') };
      this._edit((doc) => doc.setInstance(instanceId, { settings: { ...result.settings, html } }));
    } else if (instance.type === 'actionmenu') {
      const settings = instance.settings?.preset === 'social'
        ? await openSocialForm(common)
        : await openActionMenuForm({
          settings: instance.settings || {},
          pages: sitePageList(this.site, 'Home', { records: false }),
          recordTypes: this.options.dbdefs?.rectypes?.() || [],
          canAddRecord: this._hasExplorer(),
          // the action Record page (plan 27g §6): record pages, Define new record page, the record picker
          services: this._actionServices(services),
          // Saved filter on a record page (plan 27j phase B): values from the record of the page, any record type
          recordFields: this._onRecordPage() ? async () => recordFilterFieldTerms(this.options.dbdefs) : null
        });
      if (settings) this._edit((doc) => doc.setInstance(instanceId, { settings }));
    } else if (instance.type === 'menu' || instance.type === 'language') {
      await run((extra) => (instance.type === 'menu' ? openMenuForm({ ...common, ...extra }) : openLanguageForm({ ...common, ...extra })), setSettings);
    } else if (instance.type === 'breadcrumbs') {
      // breadcrumbs (plan 27k §6): the path of the page or the record pages visited before
      await run((extra) => openBreadcrumbsForm({ ...common, ...extra }), setSettings);
    } else if (instance.type === 'email') {
      // the email form (plan 27h): inline or a button, the caption of the button in the languages of the website
      await run((extra) => openEmailForm({ settings: instance.settings || {}, languages: this.site?.languages || [],
        translator: this._translator(), ...extra }), setSettings);
    } else if (instance.type === 'cards') {
      await run((extra) => openCardsForm({ ...common, ...extra }), setSettings);
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
      await run((extra) => openMediaForm({ ...common, ...extra }), (result) => {
        const html = this._galleryHtml(result.settings, result.items);
        this._edit((doc) => doc.setInstance(instanceId, { settings: { ...result.settings, html } }));
      });
    }
  }

  /** Whether the website (its loaded records) has Heurist Explorer: Add record of an action menu needs it (plan 27f §9.4). */
  _hasExplorer() {
    for (const record of this.records.values()) {
      const instances = record?.doc?.config?.instances || {};
      if (Object.values(instances).some((instance) => instance?.type === 'explorer')) return true;
    }
    return false;
  }

  /** The HTML of a gallery (stored per language): a figure for each file. */
  _galleryHtml(settings, items) {
    const runtime = this.options.runtime || {};
    const urls = fileMediaUrls(runtime.baseUrl || '', runtime.database || '', { relative: true });
    const media = { ...CMS_MEDIA_DEFAULTS, width: settings.width, height: settings.height, view: settings.action === 'viewer' };
    // Type Any record: the record of each figure, for the link of the action (plan 27g §6)
    const record = settings.mode === 'record';
    const build = (language) => items.map((item) => buildCmsGalleryItem(item.file, { ...media, file: item.file.key }, {
      urls, caption: settings.caption ? item.caption : '', language, record: record ? item.record : 0
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
      return { file, caption: title, label: title || `#${id}`, record: id };
    }));
  }

  /** The translation service of the server (Translate in the popups). */
  _translator() {
    return new TranslationClient({ apiClient: this.apiClient, available: Boolean(this.options.dbdefs?.translator?.()) });
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
    try {
      if (instance.kind === 'widget') {
        await this._configureWidget(node.instance, instance);
        return;
      }
      // the inline form below the tree (review 2026-11-14); the popup for an older host
      if (this._hasConfigPanels()) {
        await this._openConfig(id);
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

  // ------------------------------------------------------------------ Own style form (plan 27i §10, review 2026-11-14)

  /** The palette of the bar: the Own style form of the selected element (of the page), or closes it. */
  async _toggleStyleForm() {
    if (this.formPanel?.isOpen()) await this._closeForm();
    else await this._openForm(this.selectedNode || ROOT);
  }

  /**
   * Open the Own style form of an element (or of the page, ROOT) beside the tree; a group has its caption above. The
   * root of the header / footer has none.
   *
   * @param {string|null} id Node id, or ROOT.
   */
  async _openForm(id) {
    if (this.readOnly || !this._currentRecord()) return;
    if (parseModuleItemId(id) || (this.formMode === 'config' && id && id === this.formNode)) {
      await this._openConfig(id);
      return;
    }
    const ticket = (this._formTicket || 0) + 1;
    this._formTicket = ticket;
    this.formMode = 'style';
    this.pagePanel?.classList.remove('h-cms-form-below');
    const target = id || ROOT;
    const sections = this._formSections(target);
    if (!sections) {
      await this._closeForm();
      return;
    }
    this.formNode = target;
    this._formWestMinimum(true);
    const rootTitle = { header: 'Own style of the header', footer: 'Own style of the footer' }[this.current?.part] || 'Own style of the page';
    await this.formPanel.show(sections, { title: $HR(target === ROOT ? rootTitle : 'Own style') });
    if (ticket === this._formTicket) this._updateBar();
  }

  /** Hide the form (the changes stay in the draft). */
  async _closeForm() {
    if (!this.formPanel?.isOpen()) return;
    this._formTicket = (this._formTicket || 0) + 1;
    await this.formPanel.hide();
    this.formNode = null;
    this.formMode = null;
    this.pagePanel?.classList.remove('h-cms-form-below');
    this._formWestMinimum(false);
    this._updateBar();
  }

  /** Whether the content of a record page is edited (plan 27g): its record gives values to Saved filters (plan 27j). */
  _onRecordPage() {
    if (this.current?.part !== 'content' || !this.site) return false;
    const id = Number(this.current.recordId);
    const find = (pages) => {
      for (const page of pages || []) {
        if (Number(page.id) === id) return page;
        const found = find(page.children);
        if (found) return found;
      }
      return null;
    };
    return Boolean(find(this.site.pages)?.record);
  }

  /** Whether the host gives the configuration forms without a dialog (bridge, review 2026-11-14). */
  _hasConfigPanels() {
    return typeof this.bridge?.createConfigurationPanel === 'function' && typeof this.bridge?.createExplorerInstancePanel === 'function';
  }

  /**
   * The configuration form of a module instance, of an Explorer instance or of a module of an Explorer, inline as the
   * Own style form (beside the tree when the pane is wide, review 2026-11-15), with Reset and Apply (Apply also in the
   * header of the form).
   *
   * @param {string} id Node id of the instance, or the id of a module item of an Explorer.
   */
  async _openConfig(id) {
    if (this.readOnly || !this._currentRecord() || !id) return;
    if (!this._hasConfigPanels()) {
      const child = parseModuleItemId(id);
      if (!child) await this._configure(id);
      return;
    }
    const child = parseModuleItemId(id);
    const node = this._treeItem(child ? child.node : id);
    const instance = node?.instance ? this._currentRecord().doc.instance(node.instance) : null;
    if (!instance || instance.kind !== 'module') return;
    const ticket = (this._formTicket || 0) + 1;
    this._formTicket = ticket;
    this.formNode = id;
    this.formMode = 'config';
    // beside the tree in a wide pane, below it in a narrow one, as Own style (review 2026-11-15)
    this.pagePanel?.classList.remove('h-cms-form-below');
    this._formWestMinimum(true);
    const name = child ? EXPLORER_MODULES[child.type].label : (instance.type === 'explorer' ? 'Explorer' : EXPLORER_MODULES[instance.type]?.label || instance.type);
    await this.formPanel.show([{ label: '', build: (host) => this._configSection(host, id) }],
      { title: `${$HR('Configuration')}: ${$HR(name)}` });
    if (ticket === this._formTicket) this._updateBar();
  }

  /** The form of _openConfig: the panel of Explorer (bridge), Reset and Apply; returns its cleanup. */
  async _configSection(host, id) {
    const child = parseModuleItemId(id);
    const nodeId = child ? child.node : id;
    const instanceOf = () => {
      const node = this._treeItem(nodeId);
      return node?.instance ? { instanceId: node.instance, instance: this._currentRecord()?.doc.instance(node.instance) } : null;
    };
    const found = instanceOf();
    if (!found?.instance) return undefined;
    const { instance } = found;
    const loading = element('div', 'h-cms-form-loading');
    loading.textContent = $HR('Loading...');
    host.append(loading);
    let panel = null;
    try {
      if (child) {
        panel = await this.bridge.createConfigurationPanel({ moduleType: child.type, mode: 'website',
          value: explorerModuleSettings(instance.settings, child.type) });
      } else if (instance.type === 'explorer') {
        panel = await this.bridge.createExplorerInstancePanel({ value: instance });
      } else {
        const hasSettings = instance.settings && typeof instance.settings === 'object' && Object.keys(instance.settings).length;
        panel = await this.bridge.createConfigurationPanel({ moduleType: instance.type, mode: 'website', value: hasSettings ? instance.settings : null });
      }
    } catch (error) {
      loading.textContent = error?.message || String(error);
      return undefined;
    }
    loading.remove();
    host.append(panel.element);
    const bar = element('div', 'h-cms-form-actions');
    const reset = element('button', 'h-btn h-compact');
    reset.type = 'button';
    reset.textContent = $HR('Reset');
    reset.title = $HR('The default settings (applied with Apply)');
    reset.addEventListener('click', () => panel.reset());
    const applyButton = () => {
      const button = element('button', 'h-btn h-btn-primary h-compact');
      button.type = 'button';
      button.textContent = $HR('Apply');
      button.title = $HR('Apply the configuration to the page (saved with Save Page)');
      button.addEventListener('click', () => void doApply());
      return button;
    };
    const apply = applyButton();
    const headApply = applyButton();
    const doApply = async () => {
      if (apply.disabled) return;
      apply.disabled = true;
      headApply.disabled = true;
      try {
        const value = await panel.read();
        const current = instanceOf();
        if (!value || !current?.instance) return;
        const changed = this._applyEdit((doc) => {
          if (child) return doc.setInstance(current.instanceId, { settings: withExplorerModuleSettings(current.instance.settings, child.type, value) });
          if (current.instance.type === 'explorer') return doc.setInstance(current.instanceId, value);
          return doc.setInstance(current.instanceId, { settings: value });
        });
        HMsg.showMsgFlash?.($HR(changed ? 'Applied: Save Page saves it' : 'No changes'), { showDelay: 1500 });
      } catch (error) {
        HMsg.showMsgErr?.(error?.message || String(error));
      } finally {
        apply.disabled = false;
        headApply.disabled = false;
      }
    };
    bar.append(reset, element('span', 'h-cms-toolbar-spacer'), apply);
    host.append(bar);
    this.formPanel.addHeadActions?.(headApply);
    return () => panel.destroy();
  }

  /**
   * While the Own style form is open the west pane is at least as wide as the form (FORM_MIN_WIDTH, 2026-11-14): the
   * form below the tree does not overflow. Closed: the usual minimum again (the width stays).
   */
  _formWestMinimum(open) {
    const layout = this.layout;
    if (!layout?.options) return;
    layout.options.minWest = open ? FORM_MIN_WIDTH + 10 : WEST_MIN_WIDTH;
    const size = Number(layout.getSize?.('west')) || 0;
    if (open && size < layout.options.minWest) layout.setSize('west', layout.options.minWest);
  }

  /**
   * Sections of the form of an element: the caption of a group or panel, then the own style; the page: its own style.
   *
   * @param {string} id Node id or ROOT.
   * @returns {Array<{label: string, build: Function}>|null}
   */
  _formSections(id) {
    const record = this._currentRecord();
    if (id === ROOT) {
      // the page, the header or the footer (review 2026-11-16); no section caption: the header of the form has the title
      if (!['content', 'header', 'footer'].includes(this.current?.part)) return null;
      return [{ label: '', build: (host) => this._styleSection(host, ROOT) }];
    }
    const node = this._treeItem(id);
    if (!node) return null;
    const sections = [];
    if (node.kind === 'control' && (node.control === 'group' || record.doc.isPanel(id))) {
      sections.push({ label: $HR('Caption'), build: (host) => this._captionSection(host, id) });
    }
    sections.push({ label: sections.length ? $HR('Own style') : '', build: (host) => this._styleSection(host, id) });
    return sections;
  }

  /**
   * The height and the own colours of the header / footer in the layout (the Styles popup before 2026-11-16) move into
   * the own style of the part: min-height, background-color, color; the layout keeps its theme (own = default).
   *
   * @param {'header'|'footer'} part
   */
  _movePartLayout(part) {
    const settings = this._currentRecord()?.doc.layout()?.[part];
    if (!settings || (!settings.height && !settings.colors && settings.theme !== 'own')) return;
    this._formEdit(`style:${part}`, (doc) => {
      const layout = doc.layout();
      const old = { ...layout[part] };
      const style = doc.partStyle(part);
      // the height of a vertical header is not used (its width is)
      if (old.height && !(part === 'header' && old.orientation === 'vertical') && !style['min-height']) style['min-height'] = old.height;
      if (old.theme === 'own' && old.colors?.bg && !style['background-color']) style['background-color'] = old.colors.bg;
      if (old.theme === 'own' && old.colors?.text && !style.color) style.color = old.colors.text;
      delete old.height;
      delete old.colors;
      if (old.theme === 'own') delete old.theme;
      if (Object.keys(old).length) layout[part] = old; else delete layout[part];
      doc.setLayout(layout);
      doc.setPartStyle(part, style);
      return true;
    });
  }

  /**
   * Reveal on scroll of an element (plan 27k §6): none, fade in or slide up, applied at once; beside the preset of the
   * Own style (review 2026-11-16). Every element of the content; null in the header and footer.
   *
   * @param {string} id Node id.
   * @returns {HTMLElement|null}
   */
  _revealField(id) {
    if (this.current?.part !== 'content') return null;
    const select = lookSelect([['', 'None'], ['fade', 'Fade in'], ['up', 'Slide up']], this._currentRecord()?.doc.reveal(id) || '');
    const field = element('label', 'h-cms-style-field');
    const text = element('span');
    text.textContent = $HR('Reveal on scroll');
    field.append(text, select);
    select.addEventListener('change', () => this._formEdit(`reveal:${id}`, (doc) => doc.setReveal(id, select.value)));
    return field;
  }

  /** The own style in the form (plan 27i §10): every change at once; a group may have a background video. */
  _styleSection(host, id) {
    const record = this._currentRecord();
    const base = Object.assign({}, ...this._styleRecords().map((item) => item.doc.base()));
    const part = this.current?.part;
    if (id === ROOT && (part === 'header' || part === 'footer')) {
      // the header / footer (review 2026-11-16): its own style on the website record; the height and own colours of
      // the layout (Styles, before 2026-11-16) move into it
      this._movePartLayout(part);
      let ready = false;
      styleRows(host, record.doc.partStyle(part), (style) => {
        if (ready) this._formEdit(`style:${part}`, (doc) => (doc.setPartStyle(part, style), true));
      }, { kind: 'group', presets: null, base, files: this._files() });
      ready = true;
      return undefined;
    }
    if (id === ROOT) {
      let ready = false;
      styleRows(host, record.doc.pageStyle(), (style) => {
        if (ready) this._formEdit('style:page', (doc) => (doc.setPageStyle(style), true));
      }, { kind: 'group', presets: null, base, files: this._files() });
      ready = true;
      return undefined;
    }
    const node = this._treeItem(id);
    const kind = node?.kind === 'control' ? node.control : node?.kind;
    const presets = Object.entries(this._commonStyles().presets).map(([name, preset]) => [name, preset?.label || name]);
    let editor = null;
    editor = styleRows(host, record.doc.nodeStyle(id), (style) => {
      if (!editor) return;
      const cssClass = editor.cssClass();
      this._formEdit(`style:${id}`, (doc) => {
        doc.setNodeStyle(id, style);
        doc.setPreset(id, editor.preset());
        if (cssClass !== null) doc.setCssClass(id, cssClass);
        if (kind === 'group') doc.setBackgroundVideo(id, editor.video());
        return true;
      });
    }, {
      kind, inFlexGroup: this._inFlexGroup(id), presets, preset: node?.preset || null, cssClass: record.doc.cssClass(id),
      classInput: this.options.dbdefs?.meta?.javaScriptAllowed === true, base, files: this._files(),
      video: kind === 'group' ? record.doc.backgroundVideo(id) : null, headExtra: this._revealField(id)
    });
    return undefined;
  }

  /**
   * The caption of a group or panel in the form: the same rows as the Caption popup (language badge, clear, Translate
   * of each translation, Add a language; 2026-11-14), applied while typing.
   */
  _captionSection(host, id) {
    const record = this._currentRecord();
    const current = record.doc.caption(id);
    const languages = this.site?.languages || [];
    const form = createTranslationForm({
      value: current?.text || '',
      translations: current?.translations || {},
      languages,
      original: languages[0] || '',
      translator: this._translator(),
      onChange: ({ value, translations }) => {
        const text = value.trim();
        // a panel of tabs / an accordion needs its caption
        if (!text && record.doc.isPanel(id)) return;
        // languages left out are removed
        const all = Object.fromEntries(languages.slice(1).map((code) => [code, (translations[code] || '').trim()]));
        this._formEdit(`caption:${id}`, (doc) => doc.setCaption(id, text, all));
      }
    });
    host.append(form.element);
    return () => form.destroy();
  }

  /**
   * The page popup (pen of the page, review 2026-11-14): its prominent fields (name, description, icon, menu item; the
   * website: its fields) and the hide flags. The fields are saved with the page (Save Page); the flags are a change of
   * the draft.
   */
  async _editPage() {
    const record = this._currentRecord();
    if (!record || this.readOnly || this.current?.part !== 'content') return;
    const home = Boolean(this.site) && record.id === this.site.id;
    // the changes not saved yet are shown again
    const pending = record.fieldChanges || {};
    const recordField = await this.bridge?.recordFieldServices?.();
    const result = await openPageForm({
      title: home ? $HR('Home page') : `${$HR('Page')}: ${this._partLabel()}`,
      layout: record.doc.layout(),
      createFields: (host) => createWebsiteFieldsForm(host, {
        dbdefs: this.options.dbdefs,
        apiClient: this.apiClient,
        codes: this.codes,
        type: home ? 'home' : 'page',
        keys: home ? WEBSITE_FIELD_KEYS : PAGE_FIELD_KEYS,
        record: { ...record.record, details: { ...record.record.details, ...mapValues(pending) } },
        languages: this.site?.languages || [],
        services: { ...this._formServices(), translator: this._translator(), recordField }
      })
    });
    if (!result || this._currentRecord() !== record) return;
    const changed = { ...pending, ...result.fields };
    if (Object.keys(changed).length) record.fieldChanges = changed; else delete record.fieldChanges;
    if (!this._edit((doc) => (doc.setLayout(result.layout), true))) this._updateBar();
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

  /** A change applied by a configuration form (Apply, review 2026-11-14): one undo step; the open form stays. */
  _applyEdit(change) {
    const record = this._currentRecord();
    if (!record || this.readOnly) return false;
    const before = record.doc.snapshot();
    const result = change(record.doc);
    if (result === false || record.doc.snapshot() === before) return false;
    this.undoStack.push(before);
    this.redoStack = [];
    this._changed({ fromForm: true });
    if (parseModuleItemId(this.formNode)) this.partTree?.select(this.formNode);
    return true;
  }

  /**
   * After a change of the draft: the tree, the tools, the preview and the bar. `fromForm`: made by the inline form (it
   * is not drawn again); `stylesOnly`: only the styles changed (the preview gets the styles, not the parts).
   */
  _changed({ fromForm = false, stylesOnly = false } = {}) {
    this.partTree?.setItems(this._partItems());
    if (this.selectedNode && !this._treeItem(this.selectedNode)) this.selectedNode = null;
    this.partTree?.select(this.selectedNode || ROOT);
    this._renderProperties();
    this._applyPreview({ stylesOnly });
    this._updateBar();
    // undo, redo, a popup: the open form shows the new values
    if (!fromForm && this.formPanel?.isOpen()) void this._openForm(this.formNode);
  }

  /**
   * A change made by the inline form (plan 27i §10): applied at once; the changes of one field following each other
   * (same `key`, less than 2 s apart) are one undo step.
   *
   * @param {string} key Field of the change (e.g. `style:n1`).
   * @param {(doc: object) => (boolean|void)} change
   * @returns {boolean}
   */
  _formEdit(key, change) {
    const record = this._currentRecord();
    if (!record || this.readOnly) return false;
    const before = record.doc.snapshot();
    const html = record.doc.html(this.current.part);
    const instances = JSON.stringify(record.doc.config.instances);
    const result = change(record.doc);
    if (result === false || record.doc.snapshot() === before) return false;
    const now = Date.now();
    const last = this._lastFormEdit;
    const same = last && last.key === key && now - last.time < 2000 && last.depth === this.undoStack.length && !this.redoStack.length;
    if (!same) this.undoStack.push(before);
    this._lastFormEdit = { key, time: now, depth: this.undoStack.length };
    this.redoStack = [];
    // the same HTML and instances: a style, the page style or the layout flags
    const stylesOnly = record.doc.html(this.current.part) === html && JSON.stringify(record.doc.config.instances) === instances;
    this._changed({ fromForm: true, stylesOnly });
    return true;
  }

  // ------------------------------------------------------------------ preview

  /** Page of the preview: a website page id, or 0 (home / standalone). */
  _previewPage(current) {
    // the home page by its id too: the URL without a page shows the Startup page (layout.startPage, 2026-11-14)
    return this.site && current ? current.recordId : 0;
  }

  _loadPreview() {
    const url = (this.site || this.standalone).url;
    this.preview.load(previewUrl(url, this._previewPage(this.current), this.language));
  }

  _applyPreview({ stylesOnly = false } = {}) {
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
    const styles = {
      base: Object.assign({}, ...styleRecords.map((record) => record.doc.base())),
      nodes: styleRecords.map((record) => record.doc.config.styles.nodes || {}),
      kinds: styleRecords.map((record) => record.doc.kinds()),
      presets: styleRecords.map((record) => record.doc.presets()),
      // the own style of the page (plan 27i §9 B): its section
      page: current ? { id: current.id, style: current.doc.pageStyle() } : null,
      // the own styles of the header and footer (review 2026-11-16): the website record
      parts: site ? { header: site.doc.partStyle('header'), footer: site.doc.partStyle('footer') } : null
    };
    // the hide flags of the page: classes of the body (PageRenderer::bodyClasses)
    const layout = current?.doc.layout() || {};
    this.preview.setPageFlags?.({ hideHeader: layout.hideHeader === true, hideFooter: layout.hideFooter === true });
    // a style of the inline form (plan 27i §10): the styles only, the parts stay
    if (stylesOnly) {
      this.preview.restyle(styles);
      return;
    }
    this.preview.apply({ parts, instances, styles });
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
  if (item.kind === 'instance') return { menu: 'fa-bars', breadcrumbs: 'fa-angles-right' }[item.type] || 'fa-cube';
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

/** A compact select of [value, label] pairs with the given value (orientation and style of tabs). */
function lookSelect(options, value) {
  const select = element('select', 'h-select h-compact');
  for (const [key, label] of options) {
    const option = element('option');
    option.value = key;
    option.textContent = $HR(label);
    select.append(option);
  }
  select.value = options.some(([key]) => key === value) ? value : options[0][0];
  return select;
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

/** {field: value} as record details ({field: [value]}); a list of values stays a list. */
function mapValues(fields) {
  return Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, Array.isArray(value) ? value : [value]]));
}

/** Fields of the answer of a PATCH (plan 32): the header only, the record keeps its own details. */
const SAVED_HEADER = 'rec_ID,rec_RecTypeID,rec_Title,rec_Modified';

/** Header of a PATCH answer without its (empty) details. */
function savedHeader(saved) {
  const header = { ...(saved || {}) };
  delete header.details;
  return header;
}

/**
 * Width and height of a Record field element with a file (its own style; '' removes the property).
 *
 * @param {object} doc Record document.
 * @param {string} id Node id.
 * @param {{width: string, height: string}|undefined} size From the field popup; none: the style is not changed.
 * @returns {boolean} Always true (a step of an edit).
 */
function setFieldSize(doc, id, size) {
  if (!size) return true;
  const style = doc.nodeStyle(id);
  for (const key of ['width', 'height']) {
    if (size[key]) style[key] = size[key]; else delete style[key];
  }
  doc.setNodeStyle(id, style);
  return true;
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
