/**
 * @file WebsiteManager.js
 * @brief Website manager view (plan 27b §3, §11): over the whole screen, a header with the
 *        title and Close; two panes (HCardinalLayout): west - the list of websites and
 *        standalone pages (HRecordManager), center - the toolbar and the details of the
 *        selected record.
 *
 * The List of the websites (plan 27q3 §2.1: Website has no viewer, its List is over the whole screen): the header and the
 * buttons of the common shell of the presentations (presentationShell.js). Toolbar: New website | for the selection: Open
 * editor, Open, Check, Delete (Generate is in the details since 2026-11-17; Edit and
 * Add to menu are hidden since 2026-10-31: the record is edited with the pen beside the title of
 * the details; Delete is back since 2026-11-09). Legacy websites (format 1-3) are listed with their mark and can only
 * be opened. In a narrow pane only the icons are shown. "Publish this view" is in Explorer's
 * options menu (§11).
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
import { HRecordManager } from '#shared/widgets/record-manager/HRecordManager.js';
import { HCardinalLayout } from '#shared/widgets/layout/HCardinalLayout.js';
import { createSourceHeader, presentationButton } from '#shared/widgets/presentation/presentationShell.js';
import { $HR, HMsg } from '#shared/ui';
import { setupNotice } from '#shared/ui/setupNotice.js';
import { WebsiteDetails, el } from './WebsiteDetails.js';
import { confirmDialog, openAddToMenuForm, openGenerateForm, openNewWebsiteForm } from './websiteForms.js';
import './WebsiteManager.css';

/** Website manager view. */
export class WebsiteManager extends HBaseWidget {
  /**
   * @param {HTMLElement} container View host.
   * @param {object} options
   * @param {import('./WebsiteApplication.js').WebsiteApplication} options.application Controller.
   * @param {Function|null} [options.onClose] Close button of the header (none without it).
   * @returns {WebsiteManager}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.app = options.application;
    this.list = null;
    this.layout = null;
    this.render();
    this.listen(this.app, 'selectionchange', () => this.update());
    this.listen(this.app, 'buildchange', () => this.update());
    this.listen(this.app, 'listchange', () => void this.list?.reload());
    return this;
  }

  /** Build the header, the two panes and the list. */
  render() {
    const root = el('div', 'h-website-manager');
    // the header of the full screen views (plan 27q3 §2.3): the title and Close
    const header = createSourceHeader({
      title: $HR('Websites and published pages'),
      closeTitle: 'Close the Website manager',
      className: 'h-website-manager-header',
      onClose: typeof this.options.onClose === 'function' ? () => this.options.onClose() : null
    });
    header.close?.classList.add('h-website-close');
    root.append(header.element);
    const body = el('div', 'h-website-manager-body', root);
    this.container.replaceChildren(root);
    // the details (preview) pane: a third of the width at first
    this.layout = new HCardinalLayout(body, { westRatio: 2 / 3, minWest: 260, minCenterWidth: 320 });

    // west: the list; center: the toolbar, the setup notice and the details
    this.listHost = el('div', 'h-website-manager-list');
    this.layout.setContent('west', this.listHost);
    const center = el('div', 'h-website-manager-main');
    this.layout.setContent('center', center);
    const toolbar = el('div', 'h-toolbar h-website-toolbar', center);
    toolbar.setAttribute('role', 'toolbar');
    this.buttons = {};
    this.buttons.create = this.tool(toolbar, 'fa-plus', 'New website', 'Create a new website', () => this.createWebsite());
    this.recordTools = el('span', 'h-website-tool-group', toolbar);
    el('span', 'h-website-separator', this.recordTools).setAttribute('aria-hidden', 'true');
    this.buttons.designer = this.tool(this.recordTools, 'fa-pen-ruler', 'Open editor', 'Open the website editor (CMS designer)',
      () => this.openDesigner(this.app.selectedId));
    this.buttons.designer.classList.add('h-btn-primary');
    this.buttons.edit = this.tool(this.recordTools, 'fa-pen', 'Edit', 'Edit the record', () => this.app.editRecord(this.app.selectedId));
    this.buttons.open = this.tool(this.recordTools, 'fa-up-right-from-square', 'Open', 'Open in a new tab', () => this.open());
    this.buttons.check = this.tool(this.recordTools, 'fa-list-check', 'Check', 'Check the format of all pages and the records a visitor can not see', () => this.check());
    this.buttons.addToMenu = this.tool(this.recordTools, 'fa-sitemap', 'Add to menu', 'Add this page to a website menu', () => this.addToMenu());
    this.buttons.remove = this.tool(this.recordTools, 'fa-trash', 'Delete', 'Delete the website or page', () => this.remove());

    this.setupHost = el('div', 'h-website-setup', center);
    this.detailsHost = el('div', 'h-website-manager-details', center);
    this.details = new WebsiteDetails().attach(this.detailsHost, {
      application: this.app,
      onEditRecord: (id) => this.run(() => this.app.editRecord(id)),
      onRemoveFromMenu: (id) => this.run(() => this.removeFromMenu(id)),
      onRecheck: () => this.run(() => this.check()),
      // the Generated site section of the details (2026-11-17, was a toolbar button)
      onGenerate: () => this.run(() => this.generate()),
      onDeleteGenerated: () => this.run(() => this.deleteGenerated()),
      onClearBuilds: () => this.run(() => this.clearBuilds())
    });
    this.renderSetup();
    void this.renderList();
    // not after the list: its first page may still be loading (review 2026-11-14)
    void this.run(() => this.offerNewWebsite());
    this.update();
  }

  /** On opening (2026-11-14): no website and no standalone page yet: the New website form at once. */
  async offerNewWebsite() {
    const status = this.app.status;
    if (!this.app.hasRecordTypes() || !status || status.error || status.installed !== true || status.canCreate === false) return;
    if (await this.app.hasSites()) return;
    await this.createWebsite();
  }

  /** Toolbar button with icon and caption (the button of the presentation shell; the caption is hidden on narrow screens). */
  tool(parent, icon, label, title, onClick) {
    const button = presentationButton(parent, { icon, label, title, run: () => void this.run(onClick) });
    button.classList.add('h-website-tool');
    button.querySelector('.h-presentation-btn-label')?.classList.add('h-website-tool-label');
    return button;
  }

  /**
   * Setup notice when the definitions of the format are missing (the record types 99-51 / 99-52 or
   * their format 4 fields): the same notice and Install as the Reports module (plan 30 §15).
   */
  renderSetup() {
    const status = this.app.status || {};
    this.setupHost.replaceChildren();
    this.setupHost.hidden = status.installed !== false || Boolean(status.error);
    if (this.setupHost.hidden) return;
    this.setupHost.append(setupNotice({
      text: $HR('In order to work with websites you need to install the new record types and fields (Web home, Web page, Registered file, website format 4).'),
      missing: status.missing || [],
      canSetup: status.canSetup === true,
      onInstall: () => this.run(() => this.install())
    }));
  }

  /** Install the definitions, show the report, then the list and the notice again. */
  async install() {
    const hadTypes = this.app.hasRecordTypes();
    const report = await this.app.setup();
    HMsg.showMsgDlg(report.map((line) => `<div>${escapeHtml(line)}</div>`).join('') || $HR('Done'), { title: 'Website definitions' });
    if (!hadTypes) {
      // the list needs the new record types
      await this.list?.destroy?.();
      this.list = null;
      this.listHost.replaceChildren();
      await this.renderList();
    }
    this.renderSetup();
    this.update();
  }

  /** The list of websites and standalone pages. */
  async renderList() {
    const app = this.app;
    if (!app.hasRecordTypes()) {
      el('p', 'h-muted', this.listHost).textContent = $HR('This database has no website record types.');
      return;
    }
    const versionField = app.codes.version;
    this.list = new HRecordManager().attach(this.listHost, {
      apiClient: app.apiClient,
      dbdefs: app.dbdefs,
      selectMode: 'manager',
      recordTypes: [app.codes.home, app.codes.page],
      allowAddition: false,
      // websites and standalone pages; menu pages are shown in the menu of their website
      query: app.siteListQuery(),
      listFields: versionField ? [versionField] : [],
      recordTools: (record) => this.listTools(record, versionField),
      editRecord: app.canEditRecords() ? (id) => app.editRecord(id) : undefined,
      // a short list (§11): no view mode, selection menu, page size or "i"; all records on one page
      listOptions: {
        pageLength: 500,
        controls: { viewMode: false, selectionActions: false, pageSize: false },
        interaction: { popupEnabled: false }
      },
      baseUrl: app.config.baseUrl,
      database: app.config.database
    });
    this.listen(this.listHost, 'h-record-manager-selection', (event) => {
      const ids = event.detail?.ids || [];
      void this.run(() => this.app.select(ids.length ? ids[ids.length - 1] : null));
    });
    this.listen(this.listHost, 'h-record-manager-error', (event) => HMsg.showMsgErr(event.detail?.error?.message || String(event.detail?.error)));
    await this.list.render();
  }

  /**
   * The tools of a record in the list (2026-11-14): the format badge, Open editor (a website of format 4 the user may
   * edit) and Open website (in a new tab).
   *
   * @param {object} record List record.
   * @param {number} versionField DT of the format version.
   * @returns {HTMLElement}
   */
  listTools(record, versionField) {
    const box = el('span', 'h-website-list-tools');
    const badge = versionBadge(record, versionField);
    if (badge) box.append(badge);
    const id = Number(record?.rec_ID) || 0;
    const website = Number(record?.rec_RecTypeID) === Number(this.app.codes.home);
    const v4 = badge?.classList.contains('h-website-badge-v4') === true;
    const icon = (glyph, title, run) => {
      const button = el('button', 'heurist-icon-button h-website-list-tool', box);
      button.type = 'button';
      button.title = $HR(title);
      button.setAttribute('aria-label', button.title);
      el('i', `fa-solid ${glyph}`, button).setAttribute('aria-hidden', 'true');
      // not the selection of the list item
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        void this.run(run);
      });
      button.addEventListener('dblclick', (event) => event.stopPropagation());
    };
    if (website && v4 && this.app.canEditRecords()) icon('fa-pen-ruler', 'Open editor', () => this.openDesigner(id));
    icon('fa-up-right-from-square', 'Open in a new tab', () => this.openRecord(id, website));
    return box;
  }

  /**
   * Open a website or a standalone page in a new tab: the tab is opened at once (a popup blocker allows it only in the
   * click), its URL follows from the summary.
   */
  async openRecord(id, website) {
    const tab = globalThis.open?.('about:blank', '_blank');
    try {
      const summary = await this.app.websites.summary(id, { entity: website ? 'website' : 'page' });
      if (!summary?.url) throw new Error($HR('This record has no address to open'));
      if (tab) {
        tab.opener = null;
        tab.location.href = summary.url;
      } else {
        globalThis.open?.(summary.url, '_blank', 'noopener');
      }
    } catch (error) {
      tab?.close();
      throw error;
    }
  }

  /** Toolbar state and details for the selection. */
  update() {
    const app = this.app;
    const summary = app.summary;
    const loggedIn = app.status && !app.status.error;
    const installed = app.status?.installed === true;
    this.buttons.create.disabled = !loggedIn || !installed;
    // only database administrators create websites (review 2026-11-08)
    this.buttons.create.hidden = app.status?.canCreate === false;
    this.recordTools.hidden = !app.selectedId;
    const v4 = summary?.v4 === true;
    const show = (button, visible) => { button.hidden = !visible; };
    show(this.buttons.designer, v4 && summary.kind !== 'page' && app.canEditRecords());
    // hidden (2026-10-31): the pen beside the title of the details edits the record
    show(this.buttons.edit, false);
    show(this.buttons.open, Boolean(summary?.url));
    show(this.buttons.check, v4 && summary.kind !== 'page');
    // hidden for now (2026-10-31): the menu is edited in the designer
    show(this.buttons.addToMenu, false);
    // shown again (review 2026-11-09)
    show(this.buttons.remove, v4 && summary.kind !== 'page' && Boolean(summary.canEdit));
    this.details.render();
  }

  /** New website form, then the website is selected and opened in the CMS editor. */
  async createWebsite() {
    const app = this.app;
    const values = await openNewWebsiteForm({
      languages: app.dbdefs?.translationLanguages?.() || [],
      dbdefs: app.dbdefs,
      apiClient: app.apiClient,
      codes: await app.websites.codes(),
      services: {
        recordField: await app.bridge?.recordFieldServices?.(),
        browseRecords: app.bridge?.browseRecords,
        createRecordBrowser: app.bridge?.createRecordBrowser
      }
    });
    if (!values) return;
    // one popup while the website and its starter pages are made, then the editor (review 2026-11-15)
    const { openProgressDialog } = await import('#shared/ui/progressDialog.js');
    const progress = openProgressDialog({ title: $HR('New website'), text: $HR('Creating the website...'), cancel: false });
    let result = null;
    try {
      result = await this.app.createWebsite(values);
      progress.update(1, 3);
      // the editor makes the starter pages (2026-11-14)
      if (result?.id) await this.openDesigner(result.id, { starterPages: values.pages || [], progress });
    } finally {
      progress.close();
    }
    return result;
  }

  /** Open the selected website or page. */
  open() {
    const url = this.app.summary?.url;
    if (url) globalThis.open?.(url, '_blank', 'noopener');
  }

  /** Check of the selected website: problems of the format of all pages and records a visitor can not see. */
  async check() {
    const id = this.app.selectedId;
    const result = await this.app.validate();
    this.details.setCheck(result ? { ...result, id } : null);
  }

  /** The Generate options (plan 27m §2.1), then a build; its progress is shown in the details. */
  async generate() {
    const summary = this.app.summary;
    if (!summary) return;
    const options = await openGenerateForm({
      languages: summary.languages || [],
      recordPages: summary.kind === 'website' ? recordPagesOf(summary.pages || []) : [],
      previous: summary.generated?.options || null,
      services: {
        editQuery: typeof this.app.bridge?.editQuery === 'function' ? (query, form, opts) => this.app.bridge.editQuery(query, form, opts) : null,
        describeQuery: typeof this.app.bridge?.describeQuery === 'function' ? (query) => this.app.bridge.describeQuery(query) : null,
        // ▾ of the query fields (plan 27n1 §4)
        apiClient: this.app.apiClient,
        dbdefs: this.app.dbdefs
      }
    });
    if (!options) return;
    await this.app.startBuild(options);
  }

  /** Remove the generated site of the selected record after a question (plan 27m §3). */
  async deleteGenerated() {
    if (!(await confirmDialog($HR('Delete the generated pages? The website address shows the live pages again.'), { yesLabel: 'Delete' }))) return;
    await this.app.deleteGenerated();
  }

  /** Remove the finished builds of the selected record (their log and ZIP files) after a question (2026-11-17). */
  async clearBuilds() {
    if (!(await confirmDialog($HR('Clear the log and delete the ZIP files of the earlier generations?'), { yesLabel: 'Clear' }))) return;
    await this.app.clearBuilds();
  }

  /** Add the selected standalone page to a website menu. */
  async addToMenu() {
    const choice = await openAddToMenuForm({ websites: await this.app.editableWebsites() });
    if (!choice) return;
    await this.app.addToMenu(choice.siteId, choice.parentId);
    HMsg.showMsgFlash($HR('The page is in the menu'), { showDelay: 2000 });
  }

  /** Take a page out of the menu of the selected website. */
  async removeFromMenu(pageId) {
    if (!(await confirmDialog($HR('Take this page out of the menu? The page is kept as a standalone page.'), { yesLabel: 'Take out' }))) return;
    await this.app.removeFromMenu(pageId);
  }

  /** Delete the selected standalone page, or the website (one question with the checkbox "Delete its menu pages too"). */
  async remove() {
    const summary = this.app.summary;
    if (!summary) return;
    if (summary.kind !== 'website') {
      if (!(await confirmDialog(`${$HR('Delete the page')} "${summary.title}"?`, { yesLabel: 'Delete' }))) return;
      await this.app.deleteSelected();
      return;
    }
    const checkbox = summary.pages?.length
      ? { label: $HR('Delete its menu pages too. Pages that other records point to (e.g. another website) are kept.'), checked: false }
      : null;
    if (!(await confirmDialog(`${$HR('Delete the website')} "${summary.title}"?`, { yesLabel: 'Delete', checkbox }))) return;
    const result = await this.app.deleteSelected({ pages: checkbox?.checked === true });
    if (result.kept?.length) {
      HMsg.showMsgDlg(`${$HR('Pages kept, they are used elsewhere')}: ${result.kept.join(', ')}`, { title: 'Delete website' });
    }
  }

  /** Select a record (Explorer after Publish). */
  async selectRecord(id) {
    await this.app.select(id);
    await this.list?.reload();
  }

  /**
   * Open the CMS designer over the whole screen (plan 27c §3), a lazy chunk. The list and summary are reloaded
   * when it is closed.
   *
   * @param {number} id Website or standalone page.
   * @param {{page?: number, starterPages?: string[]}} [options] A page of the website to open first; `starterPages`: the
   *        pages a new website gets (addStarterPages).
   * @returns {Promise<object|null>} The designer, or null.
   */
  async openDesigner(id, { page = 0, starterPages = null, progress = null } = {}) {
    if (!id || this.designer) return this.designer || null;
    const { openCmsDesigner } = await import('../designer/CmsDesigner.js');
    const host = document.createElement('div');
    host.className = 'h-cms-designer-host';
    document.body.append(host);
    this.designer = await openCmsDesigner({
      container: host,
      recordId: Number(id),
      page: Number(page) || 0,
      apiClient: this.app.apiClient,
      websites: this.app.websites,
      bridge: this.app.bridge,
      dbdefs: this.app.dbdefs,
      runtime: { baseUrl: this.app.config.baseUrl, database: this.app.config.database, recordLimits: this.app.config.recordLimits },
      onClose: () => {
        host.remove();
        this.designer = null;
        void this.list?.reload();
        void this.app.reloadSummary();
      }
    });
    progress?.update(2, 3);
    if (this.designer && Array.isArray(starterPages)) await this.designer.addStarterPages(starterPages);
    return this.designer;
  }

  /** Run an action and show its error. */
  async run(action) {
    try {
      return await action();
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error));
      return null;
    }
  }

  /** @inheritdoc */
  async destroy() {
    if (this.designer) {
      this.designer.destroy();
      this.designer = null;
    }
    await this.details?.destroy();
    await this.list?.destroy();
    this.list = null;
    this.layout?.destroy();
    this.layout = null;
    await super.destroy();
  }
}

/** The format mark of a list record: v4 or legacy. */
function versionBadge(record, versionField) {
  if (!versionField) return null;
  const values = record?.details?.[String(versionField)];
  const value = Array.isArray(values) ? values[0] : values;
  const version = String(value?.value ?? value ?? '').trim();
  const badge = document.createElement('span');
  badge.className = `h-website-badge${version === '4' ? ' h-website-badge-v4' : ''}`;
  badge.textContent = version === '4' ? 'v4' : $HR('legacy');
  badge.title = version === '4' ? $HR('Website format 4') : $HR('Website of an earlier format (open only)');
  return badge;
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The record pages of a menu tree (plan 27g: `record: true`), depth first, for the Generate dialog (plan 27m §2.1).
 *
 * @param {Array<{id: number, title: string, record?: boolean, children?: Array}>} pages
 * @returns {Array<{id: number, title: string}>}
 */
export function recordPagesOf(pages) {
  const result = [];
  const walk = (items) => {
    for (const page of items || []) {
      if (page.record) result.push({ id: Number(page.id), title: page.title || '' });
      walk(page.children);
    }
  };
  walk(pages);
  return result;
}
