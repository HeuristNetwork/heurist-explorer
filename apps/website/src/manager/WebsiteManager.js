/**
 * @file WebsiteManager.js
 * @brief Website manager view (plan 27b §3, §11): over the whole screen, a header with the
 *        title and Close; two panes (HCardinalLayout): west - the list of websites and
 *        standalone pages (HRecordManager), center - the toolbar and the details of the
 *        selected record.
 *
 * Toolbar: New website | for the selection: Open editor, Open, Check, Generate (Edit, Add to
 * menu and Delete are hidden since 2026-10-31: the record is edited with the pen beside the
 * title of the details). Legacy websites (format 1-3) are listed with their mark and can only
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
import { $HR, HMsg } from '#shared/ui';
import { WebsiteDetails, el } from './WebsiteDetails.js';
import { confirmDialog, openAddToMenuForm, openNewWebsiteForm } from './websiteForms.js';
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
    const header = el('div', 'heurist-source-header h-website-manager-header', root);
    el('span', 'h-website-manager-title', header).textContent = $HR('Websites and published pages');
    if (typeof this.options.onClose === 'function') {
      const close = el('button', 'h-btn h-website-close', header);
      close.type = 'button';
      close.title = $HR('Close the Website manager');
      el('i', 'fa-solid fa-xmark', close).setAttribute('aria-hidden', 'true');
      el('span', '', close).textContent = $HR('Close');
      this.listen(close, 'click', () => this.options.onClose());
    }
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
    this.buttons.check = this.tool(this.recordTools, 'fa-list-check', 'Check', 'Check the website format', () => this.check());
    this.buttons.generate = this.tool(this.recordTools, 'fa-file-zipper', 'Generate',
      'Write all pages into files (a zip to download); the modules still use this server', () => this.generate());
    this.buttons.addToMenu = this.tool(this.recordTools, 'fa-sitemap', 'Add to menu', 'Add this page to a website menu', () => this.addToMenu());
    this.buttons.remove = this.tool(this.recordTools, 'fa-trash', 'Delete', 'Delete the website or page', () => this.remove());

    this.setupHost = el('div', 'h-website-setup', center);
    this.detailsHost = el('div', 'h-website-manager-details', center);
    this.details = new WebsiteDetails().attach(this.detailsHost, {
      application: this.app,
      onEditRecord: (id) => this.run(() => this.app.editRecord(id)),
      onRemoveFromMenu: (id) => this.run(() => this.removeFromMenu(id))
    });
    this.renderSetup();
    void this.renderList();
    this.update();
  }

  /** Toolbar button with icon and caption (the caption is hidden on narrow screens). */
  tool(parent, icon, label, title, onClick) {
    const button = el('button', 'h-btn h-website-tool', parent);
    button.type = 'button';
    button.title = $HR(title);
    button.setAttribute('aria-label', $HR(label));
    el('i', `fa-solid ${icon}`, button).setAttribute('aria-hidden', 'true');
    el('span', 'h-website-tool-label', button).textContent = $HR(label);
    this.listen(button, 'click', () => this.run(onClick));
    return button;
  }

  /** Setup notice when the definitions of the format are missing. */
  renderSetup() {
    const status = this.app.status || {};
    this.setupHost.replaceChildren();
    this.setupHost.hidden = status.installed !== false || !this.app.hasRecordTypes() || Boolean(status.error);
    if (this.setupHost.hidden) return;
    el('span', '', this.setupHost).textContent = status.canSetup
      ? $HR('The fields of the website format 4 are not installed in this database.')
      : $HR('The fields of the website format 4 are not installed in this database. Ask the database owner to install them.');
    if (status.canSetup) {
      const button = el('button', 'h-btn h-btn-primary h-btn-small', this.setupHost);
      button.type = 'button';
      button.textContent = $HR('Install');
      this.listen(button, 'click', () => this.run(async () => {
        const report = await this.app.setup();
        HMsg.showMsgDlg(report.map((line) => `<div>${escapeHtml(line)}</div>`).join('') || $HR('Done'), { title: 'Website definitions' });
        this.renderSetup();
        this.update();
      }));
    }
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
      query: app.codes.pageType && app.codes.standalonePage
        ? [{ any: [{ t: String(app.codes.home) }, { [`f:${app.codes.pageType}`]: String(app.codes.standalonePage) }] }]
        : null,
      listFields: versionField ? [versionField] : [],
      recordTools: (record) => versionBadge(record, versionField),
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

  /** Toolbar state and details for the selection. */
  update() {
    const app = this.app;
    const summary = app.summary;
    const loggedIn = app.status && !app.status.error;
    const installed = app.status?.installed === true;
    this.buttons.create.disabled = !loggedIn || !installed;
    this.recordTools.hidden = !app.selectedId;
    const v4 = summary?.v4 === true;
    const show = (button, visible) => { button.hidden = !visible; };
    show(this.buttons.designer, v4 && summary.kind !== 'page' && app.canEditRecords());
    // hidden (2026-10-31): the pen beside the title of the details edits the record
    show(this.buttons.edit, false);
    show(this.buttons.open, Boolean(summary?.url));
    show(this.buttons.check, v4 && summary.kind !== 'page');
    show(this.buttons.generate, v4 && summary.kind !== 'page' && summary.canEdit);
    // hidden for now (2026-10-31): the menu is edited in the designer
    show(this.buttons.addToMenu, false);
    show(this.buttons.remove, false);
    this.buttons.generate.disabled = (app.builds || []).some((job) => ['queued', 'running'].includes(job.status));
    this.details.render();
  }

  /** New website form, then the website is selected. */
  async createWebsite() {
    const values = await openNewWebsiteForm({ languages: this.app.dbdefs?.translationLanguages?.() || [] });
    if (!values) return;
    const result = await this.app.createWebsite(values);
    HMsg.showMsgFlash($HR('The website is created'), { showDelay: 2000 });
    return result;
  }

  /** Open the selected website or page. */
  open() {
    const url = this.app.summary?.url;
    if (url) globalThis.open?.(url, '_blank', 'noopener');
  }

  /** Problems of the format in the details. */
  async check() {
    this.details.setIssues(await this.app.validate());
  }

  /** Start a build; its progress is shown in the details. */
  async generate() {
    await this.app.startBuild();
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

  /** Delete the selected standalone page, or the website (asked twice: the website, then its pages). */
  async remove() {
    const summary = this.app.summary;
    if (!summary) return;
    if (summary.kind !== 'website') {
      if (!(await confirmDialog(`${$HR('Delete the page')} "${summary.title}"?`, { yesLabel: 'Delete' }))) return;
      await this.app.deleteSelected();
      return;
    }
    if (!(await confirmDialog(`${$HR('Delete the website')} "${summary.title}"?`, { yesLabel: 'Delete' }))) return;
    let pages = false;
    if (summary.pages?.length) {
      pages = await confirmDialog($HR('Delete its menu pages too? Pages that other records point to (e.g. another website) are kept.'),
        { yesLabel: 'Delete the pages', noLabel: 'Keep the pages' });
    }
    const result = await this.app.deleteSelected({ pages });
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
   * @param {{page?: number}} [options] A page of the website to open first.
   * @returns {Promise<object|null>} The designer, or null.
   */
  async openDesigner(id, { page = 0 } = {}) {
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
      runtime: { baseUrl: this.app.config.baseUrl, database: this.app.config.database },
      onClose: () => {
        host.remove();
        this.designer = null;
        void this.list?.reload();
        void this.app.reloadSummary();
      }
    });
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
