/**
 * @file ExplorerControlPanel.js
 * @brief Coordinates Explorer left/right command rails and ephemeral flyouts.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR, applyI18n, HMsg, InlineHelp } from '#shared/ui';
import { ExplorerRail } from './ExplorerRail.js';
import './ExplorerControlPanel.css';

/**
 * Owns Explorer command rails but delegates presentation geometry to LayoutManager.
 *
 * Left rail commands operate on search/navigation. Right rail commands operate
 * on presentation visibility and tools. HFilter and other navigation panels are
 * ephemeral overlays over the Explorer workspace.
 */
export class ExplorerControlPanel {
  /**
   * @param {object} options Control panel options.
   * @param {import('../core/ExplorerApplication.js').ExplorerApplication} options.application Explorer application.
   */
  constructor({ application } = {}) {
    this.application = application;
    this.activeTool = null;
    this.pinnedPanels = new Map();
    this._savedFilterView = { text: '', group: '', type: '' };
    this._recordTypeView = { sort: 'usage', groups: false };
    this._querySourceView = { text: '' };
    this._onDocumentPointerDown = (event) => this._handleOutsidePointer(event);
    this._onWindowBlur = () => {
      setTimeout(() => {
        if (document.activeElement?.tagName === 'IFRAME') {
          this.closeToolPanel();
        }
      }, 0);
    };
  }

  /**
   * Mounts both rails and the shared ephemeral tool flyout.
   *
   * @param {HTMLElement} parent Explorer root element.
   * @returns {Promise<HTMLElement>} Left rail element.
   */
  async mount(parent) {
    this.parent = parent;

    this.leftRail = new ExplorerRail({
      side: 'left',
      followPointer: false,
      buttons: leftButtons(),
      onRailClick: () => this.openSearch(this.leftRail?.getButtonElement('search'))
    });
    this.leftRail.mount(parent);
    this.leftRail.addEventListener('toolselect', (event) => this._handleLeftTool(event.detail.id));

    this.rightRail = new ExplorerRail({
      side: 'right',
      buttons: rightButtons()
    });
    this.rightRail.mount(parent);
    this.rightRail.addEventListener('toolselect', (event) => this._handleRightTool(event.detail.id));

    this._buildFlyout(parent);
    this._syncPresentationButtons();

    document.addEventListener('pointerdown', this._onDocumentPointerDown, true);
    window.addEventListener('blur', this._onWindowBlur);
    applyI18n(parent);
    return this.leftRail.element;
  }

  /**
   * Opens HFilter over the Explorer workspace.
   *
   * @param {HTMLElement|null} [anchor] Element to anchor the flyout to; defaults to the rail's Search button.
   * @returns {void}
   */
  openSearch(anchor = null) {
    if (this.isPanelPinned('search')) {
      this.closeToolPanel();
      this.showPinnedPanel('search');
      this.leftRail?.setActive('search', true);
      this.application.filter?.focus?.();
      return;
    }

    if (this._toggleIfActive('search')) {
      return;
    }

    this._setActiveTool('search');
    this._showToolPanel(
      'Filter',
      this.application.filterHost,
      anchor || this.leftRail?.getButtonElement('search'),
      {
        headerVariant: 'filter',
        onHelp: () => this._openFilterHelp(),
        onPin: () => this.pinPanel({
          id: 'search',
          title: 'Filter',
          content: this.application.filterHost,
          region: 'north',
          onHelp: () => this._openFilterHelp()
        })
      }
    );
    this.application.filter?.focus?.();
  }

  /**
   * Opens the Favorites panel over the Explorer workspace.
   *
   * @param {HTMLElement|null} [anchor] Element to anchor the flyout to; defaults to the rail's Favorites button.
   */
  openFavorites(anchor = null) {
    if (this._toggleIfActive('favorites')) return;
    this._setActiveTool('favorites');
    this._showToolPanel(
      'Favorites',
      this._buildFavoritesPanel(),
      anchor || this.leftRail?.getButtonElement('favorites')
    );
  }

  /**
   * Opens the DataSource History panel over the Explorer workspace.
   *
   * @param {HTMLElement|null} [anchor] Element to anchor the flyout to; defaults to the rail's History button.
   */
  openHistory(anchor = null) {
    if (this._toggleIfActive('history')) return;
    this._setActiveTool('history');
    this._showToolPanel(
      'History',
      this._buildHistoryPanel(),
      anchor || this.leftRail?.getButtonElement('history')
    );
  }

  /**
   * Opens the Workspace panel over the Explorer workspace.
   *
   * @param {HTMLElement|null} [anchor] Element to anchor the flyout to; defaults to the rail's Workspace button.
   */
  openWorkspace(anchor = null) {
    if (this._toggleIfActive('workspace')) return;
    this._setActiveTool('workspace');
    this._showToolPanel(
      'Workspace',
      this._buildWorkspacePanel(),
      anchor || this.leftRail?.getButtonElement('workspace')
    );
  }

  /**
   * Opens the Saved Filters panel over the Explorer workspace.
   *
   * @param {HTMLElement|null} [anchor] Element to anchor the flyout to; defaults to the rail's Saved Filters button.
   */
  openSavedFilters(anchor = null) {
    if (this._toggleIfActive('saved-filters')) return;
    this._setActiveTool('saved-filters');
    this._showToolPanel(
      'Saved Filters',
      this._buildSavedFiltersPanel(),
      anchor || this.leftRail?.getButtonElement('saved-filters'),
      { fullHeight: true }
    );
  }

  /**
   * Opens the Record Types panel over the Explorer workspace.
   *
   * @param {HTMLElement|null} [anchor] Element to anchor the flyout to; defaults to the rail's Record Types button.
   */
  openRecordTypes(anchor = null) {
    if (this._toggleIfActive('record-types')) return;
    this._setActiveTool('record-types');
    this._showToolPanel(
      'Record Types',
      this._buildRecordTypesPanel(),
      anchor || this.leftRail?.getButtonElement('record-types'),
      { fullHeight: true }
    );
  }

  /**
   * Opens the Query Sources panel over the Explorer workspace.
   *
   * @param {HTMLElement|null} [anchor] Element to anchor the flyout to; defaults to the rail's Query Sources button.
   */
  openQuerySources(anchor = null) {
    if (this._toggleIfActive('query-sources')) return;
    this._setActiveTool('query-sources');
    this._showToolPanel(
      'Query Sources',
      this._buildQuerySourcesPanel(),
      anchor || this.leftRail?.getButtonElement('query-sources'),
      { fullHeight: true }
    );
  }

  /**
   * Re-renders the currently open flyout's list content in place, if one of the
   * list-backed panels (Favorites, History, Workspace, Saved Filters, Record
   * Types, or Query Sources) is open.
   *
   * @returns {void}
   */
  refreshNavigationLists() {
    if (this.flyout?.hidden) return;
    if (this.activeTool === 'favorites') {
      this.flyoutBody.replaceChildren(this._buildFavoritesPanel());
    } else if (this.activeTool === 'history') {
      this.flyoutBody.replaceChildren(this._buildHistoryPanel());
    } else if (this.activeTool === 'workspace') {
      this.flyoutBody.replaceChildren(this._buildWorkspacePanel());
    } else if (this.activeTool === 'saved-filters') {
      this.flyoutBody.replaceChildren(this._buildSavedFiltersPanel());
    } else if (this.activeTool === 'record-types') {
      this.flyoutBody.replaceChildren(this._buildRecordTypesPanel());
    } else if (this.activeTool === 'query-sources') {
      this.flyoutBody.replaceChildren(this._buildQuerySourcesPanel());
    }
  }

  /**
   * Opens the query-language help over the Explorer root.
   */
  _openFilterHelp() {
    this.filterHelpOverlay ||= new InlineHelp({
      parent: this.application.container,
      moduleName: 'explorer',
      fileBase: 'searchQueryLanguage'
    });
    this.filterHelpOverlay.open();
  }

  /**
   * Closes the currently visible ephemeral tool panel.
   *
   * @returns {boolean} True when a panel existed.
   */
  closeToolPanel() {
    if (!this.flyout) {
      return false;
    }

    this.flyout.hidden = true;
    this.flyout.classList.remove('open');
    this._setActiveTool(null);
    return true;
  }

  /**
   * Pin a tool's content into a cardinal region. Reusable for Record View/East.
   *
   * @param {object} options Panel definition.
   * @param {string} options.id Unique panel id.
   * @param {string} options.title Panel title.
   * @param {HTMLElement} options.content Panel content element.
   * @param {string} options.region LayoutManager region to assign the panel to.
   * @param {Function|null} [options.onHelp] Optional help handler shown as a panel action.
   * @returns {boolean} True when the panel was pinned.
   */
  pinPanel({ id, title, content, region, onHelp = null }) {
    const key = String(id);
    if (!(content instanceof HTMLElement) || this.isPanelPinned(key)) return false;

    const panel = this._createPinnedPanel({ id: key, title, content, onHelp });
    const slotId = `__pinned-panel-${key}`;
    const slot = this.application.layout.createSlot(slotId, 'pinned-tool');
    slot.classList.add('h-explorer-pinned-slot');
    slot.dataset.transient = 'true';
    slot.replaceChildren(panel);
    this.application.layout.assignModule(slotId, region);
    this.pinnedPanels.set(key, { id: key, title, content, region, panel, slotId, onHelp });

    this.closeToolPanel();
    this.leftRail?.setActive(key, true);
    content.querySelector('input, textarea, button, select')?.focus();
    return true;
  }

  /**
   * Unpin a previously pinned panel, removing its layout slot.
   *
   * Re-opens the search flyout when the search panel is unpinned, since the
   * left rail's search button otherwise has nothing left to activate.
   *
   * @param {string} id Panel id, as passed to {@link ExplorerControlPanel#pinPanel}.
   * @returns {boolean} True when a pinned panel existed and was removed.
   */
  unpinPanel(id) {
    const key = String(id);
    const entry = this.pinnedPanels.get(key);
    if (!entry) return false;

    // Preserve the live widget while its temporary layout slot is removed.
    entry.content.remove();
    this.application.layout.removeSlot(entry.slotId);
    this.pinnedPanels.delete(key);

    if (key === 'search') {
      this.openSearch(this.leftRail?.getButtonElement('search'));
    }
    return true;
  }

  /**
   * Show a pinned panel's layout slot.
   *
   * @param {string} id Panel id, as passed to {@link ExplorerControlPanel#pinPanel}.
   * @returns {boolean} True when the panel was found and shown.
   */
  showPinnedPanel(id) {
    const entry = this.pinnedPanels.get(String(id));
    return entry ? this.application.layout.showModule(entry.slotId) : false;
  }

  /**
   * Hide a pinned panel's layout slot and deactivate its rail button.
   *
   * @param {string} id Panel id, as passed to {@link ExplorerControlPanel#pinPanel}.
   * @returns {boolean} True when the panel was found and hidden.
   */
  hidePinnedPanel(id) {
    const key = String(id);
    const entry = this.pinnedPanels.get(key);
    if (!entry) return false;
    const hidden = this.application.layout.hideModule(entry.slotId);
    if (hidden) this.leftRail?.setActive(key, false);
    return hidden;
  }

  /**
   * Whether a panel is currently pinned.
   *
   * @param {string} id Panel id, as passed to {@link ExplorerControlPanel#pinPanel}.
   * @returns {boolean} True when the panel is pinned.
   */
  isPanelPinned(id) {
    return this.pinnedPanels.has(String(id));
  }

  /**
   * Refreshes right-rail toggle state from LayoutManager.
   */
  refreshPresentationState() {
    this._syncPresentationButtons();
  }

  /**
   * Clears active state from right-rail tool buttons.
   *
   * @returns {ExplorerControlPanel}
   */
  clearToolSelection() {
    for (const id of ['report', 'crosstabs', 'actions', 'export']) {
      this.rightRail?.setActive(id, false);
    }

    return this;
  }

  /**
   * Opens Explorer user help over the Explorer root.
   */
  openHelp() {
    this.closeToolPanel();
    this.helpOverlay ||= new InlineHelp({
      parent: this.application.container,
      moduleName: 'explorer'
    });
    this.helpOverlay.open();
  }

  /**
   * Removes rails, flyout and global listeners.
   */
  destroy() {
    document.removeEventListener('pointerdown', this._onDocumentPointerDown, true);
    window.removeEventListener('blur', this._onWindowBlur);
    this.helpOverlay?.close();
    this.filterHelpOverlay?.close();
    this.leftRail?.destroy();
    this.rightRail?.destroy();
    for (const entry of this.pinnedPanels.values()) {
      entry.panel.remove();
    }
    this.pinnedPanels.clear();
    this.flyout?.remove();
  }

  /**
   * Build the shared ephemeral flyout (title, help/pin/close actions, body) and mount it.
   *
   * @private
   * @param {HTMLElement} parent Explorer root element.
   * @returns {void}
   */
  _buildFlyout(parent) {
    this.flyout = document.createElement('section');
    this.flyout.className = 'h-explorer-tool-panel';
    this.flyout.hidden = true;
    this.flyout.setAttribute('role', 'dialog');

    const header = document.createElement('div');
    header.className = 'h-toolbar h-explorer-tool-panel-header';
    this.flyoutHeader = header;

    this.flyoutTitle = document.createElement('strong');
    this.flyoutTitle.className = 'h-i18n';

    const help = document.createElement('button');
    help.type = 'button';
    help.className = 'heurist-icon-button h-explorer-tool-panel-help';
    help.hidden = true;
    help.setAttribute('aria-label', $HR('Help'));
    help.title = $HR('Help');
    help.innerHTML = '<span class="fa-solid fa-circle-question" aria-hidden="true"></span>';
    help.addEventListener('click', () => this._helpHandler?.());
    this.flyoutHelp = help;

    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'heurist-icon-button h-explorer-tool-panel-pin';
    pin.hidden = true;
    pin.setAttribute('aria-label', $HR('Pin'));
    pin.title = $HR('Pin');
    pin.innerHTML = '<span class="fa-solid fa-thumbtack" aria-hidden="true"></span>';
    pin.addEventListener('click', () => this._pinHandler?.());
    this.flyoutPin = pin;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'heurist-icon-button h-explorer-tool-panel-close';
    close.setAttribute('aria-label', $HR('Close'));
    close.innerHTML = '<span class="fa-solid fa-xmark" aria-hidden="true"></span>';
    close.addEventListener('click', () => this.closeToolPanel());

    const actions = document.createElement('div');
    actions.className = 'h-explorer-tool-panel-actions';
    actions.append(help, pin, close);

    header.append(this.flyoutTitle, actions);

    this.flyoutBody = document.createElement('div');
    this.flyoutBody.className = 'h-explorer-tool-panel-body';
    this.flyout.append(header, this.flyoutBody);
    parent.append(this.flyout);
  }

  /**
   * Dispatch a left-rail toolselect event to the matching panel/action.
   *
   * @private
   * @param {string} id Left-rail button id.
   * @returns {void}
   */
  _handleLeftTool(id) {
    switch (id) {
      case 'search':
        this.openSearch(this.leftRail?.getButtonElement('search'));
        break;

      case 'favorites':
        this.openFavorites(this.leftRail?.getButtonElement('favorites'));
        break;

      case 'history':
        this.openHistory(this.leftRail?.getButtonElement('history'));
        break;

      case 'workspace':
        this.openWorkspace(this.leftRail?.getButtonElement('workspace'));
        break;

      case 'saved-filters':
        this.openSavedFilters(this.leftRail?.getButtonElement('saved-filters'));
        break;

      case 'record-types':
        this.openRecordTypes(this.leftRail?.getButtonElement('record-types'));
        break;

      case 'query-sources':
        this.openQuerySources(this.leftRail?.getButtonElement('query-sources'));
        break;

      case 'subsets':
        this._showPlaceholder(id, 'Subsets');
        break;

      case 'filter-builder':
        this.openSearch(this.leftRail?.getButtonElement('filter-builder'));
        this.application.openFilterBuilder?.();
        break;

      case 'manage-filters':
        this._showPlaceholder(id, 'Manage Filters');
        break;

      case 'manage-datasets':
        this._showPlaceholder(id, 'Manage Datasets');
        break;

      case 'help':
        this.openHelp();
        break;

      default:
        break;
    }
  }

  /**
   * Dispatch a right-rail toolselect event: toggle a presentation, or open a tool.
   *
   * @private
   * @param {string} id Right-rail button id.
   * @returns {Promise<void>}
   */
  async _handleRightTool(id) {
    if (['data', 'map', 'graph', 'timeline', 'recordview'].includes(id)) {
      await this.application.togglePresentation(id);
      this._syncPresentationButtons();
      return;
    }

    const active = this.application.openTool?.(id) === true;
    this.clearToolSelection();

    if (active) {
      this.rightRail?.setActive(id, true);
    }
  }

  /**
   * Show a "not implemented yet" placeholder panel for a left-rail button.
   *
   * @private
   * @param {string} id Left-rail button id.
   * @param {string} title Panel title.
   * @returns {void}
   */
  _showPlaceholder(id, title) {
    if (this._toggleIfActive(id)) {
      return;
    }

    this._setActiveTool(id);
    const message = document.createElement('p');
    message.className = 'h-explorer-panel-placeholder h-i18n';
    message.textContent = 'Not implemented yet';
    this._showToolPanel(title, message, this.leftRail?.getButtonElement(id));
  }

  /**
   * Build the Favorites panel content, grouped by reference type.
   *
   * @private
   * @returns {HTMLElement} The generated panel element.
   */
  _buildFavoritesPanel() {
    const panel = document.createElement('div');
    panel.className = 'h-explorer-source-panel';
    const entries = this.application.favorites?.list?.() || [];
    if (!entries.length) {
      panel.append(this._emptyMessage('No favorites'));
      return panel;
    }
    const sections = [
      { title: 'Saved Filters', type: 'filter', icon: 'fa-solid fa-filter' },
      { title: 'Record Types', type: 'recordtype', icon: null },
      { title: 'Sources', type: 'source', icon: 'fa-solid fa-database' }
    ];
    for (const section of sections) {
      const sectionEntries = entries.filter((entry) => entry.reference?.type === section.type);
      if (!sectionEntries.length) continue;
      panel.append(this._sectionTitle(section.title));
      const list = document.createElement('div');
      list.className = 'h-explorer-source-list';
      for (const entry of sectionEntries) {
        const currentRecordType = section.type === 'recordtype'
          ? this.application.recordTypes?.get?.(entry.reference.id)
          : null;
        const displayEntry = currentRecordType
          ? { ...entry, title: currentRecordType.title }
          : entry;
        list.append(this._sourceRow(displayEntry, {
          icon: section.icon,
          iconUrl: section.type === 'recordtype'
            ? this.application.recordTypes?.iconUrl(entry.reference.id)
            : null,
          activate: async () => {
            try {
              const activated = await this.application.activateFavorite(entry);
              if (activated) this.closeToolPanel();
            } catch (error) {
              HMsg.showMsgErr(error?.message || String(error));
            }
          },
          remove: () => this.application.toggleFavorite(entry.reference, entry.title)
        }));
      }
      panel.append(list);
    }
    return panel;
  }

  /**
   * Build the Record Types panel content, including sort/group controls.
   *
   * @private
   * @returns {HTMLElement} The generated panel element.
   */
  _buildRecordTypesPanel() {
    const panel = document.createElement('div');
    panel.className = 'h-explorer-source-panel h-explorer-record-types';

    const controls = document.createElement('div');
    controls.className = 'h-explorer-record-type-controls';
    const caption = document.createElement('span');
    caption.className = 'h-muted h-i18n';
    caption.textContent = 'Sort by';
    controls.append(caption);

    for (const [value, label] of [['usage', 'Usage'], ['name', 'Name']]) {
      const option = document.createElement('label');
      option.className = 'h-explorer-record-type-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'h-explorer-record-type-sort';
      input.value = value;
      input.checked = this._recordTypeView.sort === value;
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this._recordTypeView.sort = value;
        render();
      });
      const text = document.createElement('span');
      text.className = 'h-i18n';
      text.textContent = label;
      option.append(input, text);
      controls.append(option);
    }

    const groupOption = document.createElement('label');
    groupOption.className = 'h-explorer-record-type-option h-explorer-record-type-groups';
    const groupInput = document.createElement('input');
    groupInput.type = 'checkbox';
    groupInput.checked = this._recordTypeView.groups;
    const groupText = document.createElement('span');
    groupText.className = 'h-i18n';
    groupText.textContent = 'Groups';
    groupOption.append(groupInput, groupText);
    controls.append(groupOption);

    const body = document.createElement('div');
    body.className = 'h-explorer-record-type-list';
    const render = () => this._renderRecordTypeRows(body);
    groupInput.addEventListener('change', () => {
      this._recordTypeView.groups = groupInput.checked;
      render();
    });
    panel.append(controls, body);
    render();
    return panel;
  }

  /**
   * Render the Record Types list body, flat or grouped per `_recordTypeView`.
   *
   * @private
   * @param {HTMLElement} body List container to render into.
   * @returns {void}
   */
  _renderRecordTypeRows(body) {
    body.replaceChildren();
    const items = this.application.getRecordTypes({ sort: this._recordTypeView.sort });
    if (!items.length) {
      body.append(this._emptyMessage('No record types'));
      return;
    }
    if (!this._recordTypeView.groups) {
      const list = document.createElement('div');
      list.className = 'h-explorer-source-list';
      for (const item of items) list.append(this._recordTypeRow(item));
      body.append(list);
      return;
    }

    for (const group of this.application.recordTypes?.groups?.() || []) {
      const members = items.filter((item) => item.groupId === group.id);
      if (!members.length) continue;
      body.append(this._sectionTitle(group.name));
      const list = document.createElement('div');
      list.className = 'h-explorer-source-list';
      for (const item of members) list.append(this._recordTypeRow(item));
      body.append(list);
    }
  }

  /**
   * Build one Record Types list row: favorite toggle, icon, title, and usage count.
   *
   * @private
   * @param {object} item Record type entry; see `RecordTypeManager#list`.
   * @returns {HTMLElement} The generated row element.
   */
  _recordTypeRow(item) {
    const reference = { type: 'recordtype', id: item.id };
    const favorite = this.application.favorites?.has?.(reference) === true;
    const row = document.createElement('div');
    row.className = 'h-explorer-source-row h-explorer-record-type-row';

    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'heurist-icon-button h-explorer-filter-favorite';
    star.title = $HR(favorite ? 'Remove from favorites' : 'Add to favorites');
    star.setAttribute('aria-label', star.title);
    star.setAttribute('aria-pressed', String(favorite));
    star.innerHTML = `<span class="${favorite ? 'fa-solid fa-star' : 'fa-regular fa-star'}" aria-hidden="true"></span>`;
    star.addEventListener('click', () => this.application.toggleFavorite(reference, item.title));

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'h-explorer-source-select';
    select.title = item.title;
    if (item.iconUrl) {
      const icon = document.createElement('img');
      icon.className = 'h-explorer-record-type-icon';
      icon.src = item.iconUrl;
      icon.alt = '';
      icon.width = 18;
      icon.height = 18;
      icon.addEventListener('error', () => { icon.hidden = true; }, { once: true });
      select.append(icon);
    }
    const title = document.createElement('span');
    title.className = 'h-explorer-source-title';
    title.textContent = item.title;
    const count = document.createElement('span');
    count.className = 'h-explorer-source-meta h-explorer-record-type-count';
    count.textContent = String(item.count);
    select.append(title, count);
    select.addEventListener('click', () => void this._activateRecordType(item.id));
    row.append(star, select);
    return row;
  }

  /**
   * Activate a record type's datasource, closing the tool panel on success.
   *
   * @private
   * @param {number|string} id Record type id.
   * @returns {Promise<void>}
   */
  async _activateRecordType(id) {
    try {
      const activated = await this.application.activateRecordType(id);
      if (activated) this.closeToolPanel();
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error));
    }
  }

  /**
   * Build the Query Sources panel content, including its search box.
   *
   * @private
   * @returns {HTMLElement} The generated panel element.
   */
  _buildQuerySourcesPanel() {
    const panel = document.createElement('div');
    panel.className = 'h-explorer-source-panel h-explorer-query-sources';
    const controls = document.createElement('div');
    controls.className = 'h-explorer-filter-controls';
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'h-input h-grow';
    search.placeholder = $HR('Search sources');
    search.value = this._querySourceView.text;
    controls.append(search);
    const list = document.createElement('div');
    list.className = 'h-explorer-source-list';
    const render = () => {
      list.replaceChildren();
      const sources = this.application.getQuerySources(this._querySourceView);
      if (!sources.length) {
        list.append(this._emptyMessage('No query sources'));
        return;
      }
      for (const source of sources) {
        const reference = { type: 'source', id: source.id };
        const favorite = this.application.favorites?.has?.(reference) === true;
        const row = document.createElement('div');
        row.className = 'h-explorer-source-row h-explorer-query-source-row';
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'heurist-icon-button h-explorer-filter-favorite';
        star.title = $HR(favorite ? 'Remove from favorites' : 'Add to favorites');
        star.setAttribute('aria-label', star.title);
        star.setAttribute('aria-pressed', String(favorite));
        star.innerHTML = `<span class="${favorite ? 'fa-solid fa-star' : 'fa-regular fa-star'}" aria-hidden="true"></span>`;
        star.addEventListener('click', () => this.application.toggleFavorite(reference, source.title));
        const select = document.createElement('button');
        select.type = 'button';
        select.className = 'h-explorer-source-select';
        select.title = source.title;
        select.innerHTML = '<span class="fa-solid fa-database" aria-hidden="true"></span>';
        const title = document.createElement('span');
        title.className = 'h-explorer-source-title';
        title.textContent = source.title;
        select.append(title);
        select.addEventListener('click', () => void this._activateQuerySource(source.id));
        row.append(star, select);
        list.append(row);
      }
    };
    search.addEventListener('input', () => {
      this._querySourceView.text = search.value;
      render();
    });
    panel.append(controls, list);
    render();
    return panel;
  }

  /**
   * Activate a query source's datasource, closing the tool panel on success.
   *
   * @private
   * @param {number|string} id Source record id.
   * @returns {Promise<void>}
   */
  async _activateQuerySource(id) {
    try {
      const activated = await this.application.activateQuerySource(id);
      if (activated) this.closeToolPanel();
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error));
    }
  }

  /**
   * Build the History panel content.
   *
   * @private
   * @returns {HTMLElement} The generated panel element.
   */
  _buildHistoryPanel() {
    const panel = document.createElement('div');
    panel.className = 'h-explorer-source-panel';

    const entries = this.application.history?.list?.() || [];
    if (!entries.length) {
      panel.append(this._emptyMessage('No history'));
      return panel;
    }
    const list = document.createElement('div');
    list.className = 'h-explorer-source-list';
    for (const entry of entries) {
      list.append(this._sourceRow(entry, {
        icon: 'fa-solid fa-clock-rotate-left',
        activate: async () => {
          await this.application.activateHistoryEntry(entry);
          this.closeToolPanel();
        }
      }));
    }
    panel.append(list);
    return panel;
  }

  /**
   * Build the Workspace panel content.
   *
   * @private
   * @returns {HTMLElement} The generated panel element.
   */
  _buildWorkspacePanel() {
    const panel = document.createElement('div');
    panel.className = 'h-explorer-source-panel';
    const entries = this.application.workspace?.list?.() || [];
    if (!entries.length) {
      panel.append(this._emptyMessage('No workspace items'));
      return panel;
    }
    const list = document.createElement('div');
    list.className = 'h-explorer-source-list';
    for (const entry of entries) {
      list.append(this._sourceRow(entry, {
        icon: 'fa-regular fa-object-group',
        activate: async () => {
          try {
            const activated = await this.application.activateWorkspaceEntry(entry);
            if (activated) this.closeToolPanel();
          } catch (error) {
            HMsg.showMsgErr(error?.message || String(error));
          }
        },
        remove: () => this.application.removeDataSourceFromWorkspace(entry.key),
        removeTitle: 'Remove from workspace'
      }));
    }
    panel.append(list);
    return panel;
  }

  /**
   * Build the Saved Filters panel content, including its search/group/type controls.
   *
   * @private
   * @returns {HTMLElement} The generated panel element.
   */
  _buildSavedFiltersPanel() {
    const panel = document.createElement('div');
    panel.className = 'h-explorer-source-panel h-explorer-saved-filters';

    const controls = document.createElement('div');
    controls.className = 'h-explorer-filter-controls';
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'h-input h-grow';
    search.placeholder = $HR('Search filters');
    search.value = this._savedFilterView.text;

    const group = document.createElement('select');
    group.className = 'h-select';
    group.setAttribute('aria-label', $HR('User group'));
    group.append(new Option($HR('All groups'), ''));
    for (const id of this.application.savedFilters?.groups?.() || []) {
      group.append(new Option(`${$HR('Group')} ${id}`, String(id)));
    }
    group.value = this._savedFilterView.group;

    const type = document.createElement('select');
    type.className = 'h-select';
    type.setAttribute('aria-label', $HR('Filter type'));
    type.append(
      new Option($HR('All types'), ''),
      new Option($HR('Simple'), 'simple'),
      new Option($HR('Parametrized'), 'parametrized')
    );
    type.value = this._savedFilterView.type;
    controls.append(search, group, type);

    const list = document.createElement('div');
    list.className = 'h-explorer-source-list';
    const render = () => this._renderSavedFilterRows(list);
    search.addEventListener('input', () => {
      this._savedFilterView.text = search.value;
      render();
    });
    group.addEventListener('change', () => {
      this._savedFilterView.group = group.value;
      render();
    });
    type.addEventListener('change', () => {
      this._savedFilterView.type = type.value;
      render();
    });
    panel.append(controls, list);
    render();
    return panel;
  }

  /**
   * Render the Saved Filters list body per `_savedFilterView`'s search/group/type criteria.
   *
   * @private
   * @param {HTMLElement} list List container to render into.
   * @returns {void}
   */
  _renderSavedFilterRows(list) {
    list.replaceChildren();
    const filters = this.application.savedFilters?.list?.(this._savedFilterView) || [];
    if (!filters.length) {
      list.append(this._emptyMessage('No filters'));
      return;
    }

    for (const filter of filters) {
      const reference = { type: 'filter', id: filter.id };
      const favorite = this.application.favorites?.has?.(reference) === true;
      const row = document.createElement('div');
      row.className = 'h-explorer-source-row h-explorer-saved-filter-row';

      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'heurist-icon-button h-explorer-filter-favorite';
      star.title = $HR(favorite ? 'Remove from favorites' : 'Add to favorites');
      star.setAttribute('aria-label', star.title);
      star.setAttribute('aria-pressed', String(favorite));
      star.innerHTML = `<span class="${favorite ? 'fa-solid fa-star' : 'fa-regular fa-star'}" aria-hidden="true"></span>`;
      star.addEventListener('click', () => this.application.toggleFavorite(reference, filter.title));

      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'h-explorer-source-select';
      select.title = filter.title;
      const title = document.createElement('span');
      title.className = 'h-explorer-source-title';
      title.textContent = filter.title;
      const meta = document.createElement('span');
      meta.className = 'h-explorer-source-meta';
      meta.textContent = filter.kind === 'parametrized' ? $HR('Parametrized') : '';
      select.append(title, meta);
      select.addEventListener('click', () => void this._activateSavedFilter(filter.id));

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'heurist-icon-button h-explorer-filter-edit';
      edit.title = $HR('Edit saved filter');
      edit.setAttribute('aria-label', edit.title);
      edit.innerHTML = '<span class="fa-solid fa-pen" aria-hidden="true"></span>';
      edit.addEventListener('click', () => void this._editSavedFilter(filter.id));
      row.append(star, select, edit);
      list.append(row);
    }
  }

  /**
   * Activate a saved filter's datasource, closing the tool panel on success.
   *
   * @private
   * @param {number|string} id Saved filter record id.
   * @returns {Promise<void>}
   */
  async _activateSavedFilter(id) {
    try {
      const activated = await this.application.activateSavedFilter(id);
      if (activated) this.closeToolPanel();
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error));
    }
  }

  /**
   * Open the host's Saved Filter editor for one filter.
   *
   * @private
   * @param {number|string} id Saved filter record id.
   * @returns {Promise<void>}
   */
  async _editSavedFilter(id) {
    try {
      await this.application.editSavedFilter(id);
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error));
    }
  }

  /**
   * Build one generic source-list row: icon, title, activate click, and optional remove button.
   *
   * @private
   * @param {object} entry Entry to render (favorite, history, or workspace entry).
   * @param {object} options Row options.
   * @param {string|null} [options.icon] FontAwesome class for the row icon, when `iconUrl` is absent.
   * @param {string|null} [options.iconUrl] Image URL for the row icon, overriding `icon`.
   * @param {Function} options.activate Called when the row is clicked.
   * @param {Function|null} [options.remove] When provided, shows a remove button that calls this.
   * @param {string} [options.removeTitle='Remove from favorites'] Remove button tooltip/label.
   * @returns {HTMLElement} The generated row element.
   */
  _sourceRow(entry, {
    icon = null,
    iconUrl = null,
    activate,
    remove = null,
    removeTitle = 'Remove from favorites'
  }) {
    const row = document.createElement('div');
    row.className = 'h-explorer-source-row';

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'h-explorer-source-select';
    select.title = entry.title || '';
    const marker = iconUrl ? document.createElement('img') : document.createElement('span');
    if (iconUrl) {
      marker.className = 'h-explorer-record-type-icon';
      marker.src = iconUrl;
      marker.alt = '';
      marker.width = 18;
      marker.height = 18;
      marker.addEventListener('error', () => { marker.hidden = true; }, { once: true });
    } else {
      marker.className = icon || 'fa-solid fa-star';
      marker.setAttribute('aria-hidden', 'true');
    }
    const title = document.createElement('span');
    title.className = 'h-explorer-source-title';
    title.textContent = entry.title || entry.key;
    select.append(marker, title);
    select.addEventListener('click', () => void activate());
    row.append(select);

    if (remove) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'heurist-icon-button h-explorer-source-remove';
      button.title = $HR(removeTitle);
      button.setAttribute('aria-label', button.title);
      button.innerHTML = '<span class="fa-solid fa-xmark" aria-hidden="true"></span>';
      button.addEventListener('click', remove);
      row.append(button);
    }
    return row;
  }

  /**
   * Build a pinned panel's chrome (header with help/unpin/close actions, body) around its content.
   *
   * @private
   * @param {object} options Panel definition; see {@link ExplorerControlPanel#pinPanel}.
   * @returns {HTMLElement} The generated pinned panel element.
   */
  _createPinnedPanel({ id, title, content, onHelp }) {
    const panel = document.createElement('section');
    panel.className = 'h-explorer-pinned-tool';
    panel.dataset.pinnedTool = id;

    const header = document.createElement('div');
    header.className = 'h-toolbar h-explorer-pinned-tool-header';
    const heading = document.createElement('strong');
    heading.className = 'h-i18n';
    heading.textContent = title;
    const actions = document.createElement('div');
    actions.className = 'h-explorer-tool-panel-actions';

    if (typeof onHelp === 'function') {
      const help = document.createElement('button');
      help.type = 'button';
      help.className = 'heurist-icon-button';
      help.title = $HR('Help');
      help.setAttribute('aria-label', help.title);
      help.innerHTML = '<span class="fa-solid fa-circle-question" aria-hidden="true"></span>';
      help.addEventListener('click', onHelp);
      actions.append(help);
    }

    const unpin = document.createElement('button');
    unpin.type = 'button';
    unpin.className = 'heurist-icon-button';
    unpin.title = $HR('Unpin');
    unpin.setAttribute('aria-label', unpin.title);
    unpin.innerHTML = '<span class="fa-solid fa-thumbtack-slash" aria-hidden="true"></span>';
    unpin.addEventListener('click', () => this.unpinPanel(id));

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'heurist-icon-button';
    close.title = $HR('Close');
    close.setAttribute('aria-label', close.title);
    close.innerHTML = '<span class="fa-solid fa-xmark" aria-hidden="true"></span>';
    close.addEventListener('click', () => this.hidePinnedPanel(id));

    const body = document.createElement('div');
    body.className = 'h-explorer-pinned-tool-body';
    body.append(content);
    actions.append(unpin, close);
    header.append(heading, actions);
    panel.append(header, body);
    return panel;
  }

  /**
   * Build a list section heading.
   *
   * @private
   * @param {string} value Heading text.
   * @returns {HTMLElement}
   */
  _sectionTitle(value) {
    const title = document.createElement('h3');
    title.className = 'h-explorer-source-section-title h-i18n';
    title.textContent = value;
    return title;
  }

  /**
   * Build an "empty list" placeholder message.
   *
   * @private
   * @param {string} value Message text.
   * @returns {HTMLElement}
   */
  _emptyMessage(value) {
    const message = document.createElement('p');
    message.className = 'h-explorer-panel-empty h-i18n';
    message.textContent = value;
    return message;
  }

  /**
   * Show the shared flyout with new content, title, and header actions.
   *
   * @private
   * @param {string} title Flyout title.
   * @param {Node} content Flyout body content.
   * @param {Element|null} [anchor] Element to align the flyout to.
   * @param {object} [options] Flyout presentation options.
   * @param {string|null} [options.headerVariant] `'filter'` applies the filter-specific header style.
   * @param {Function|null} [options.onHelp] Shows and wires the header's help action when provided.
   * @param {Function|null} [options.onPin] Shows and wires the header's pin action when provided.
   * @param {boolean} [options.fullHeight=false] Apply the tall flyout variant.
   * @returns {void}
   */
  _showToolPanel(title, content, anchor = null, {
    headerVariant = null,
    onHelp = null,
    onPin = null,
    fullHeight = false
  } = {}) {
    this.flyoutTitle.textContent = title;
    this.flyoutBody.replaceChildren(content);
    this.flyoutHeader.classList.toggle('h-filter-header', headerVariant === 'filter');
    this.flyout.classList.toggle('h-explorer-filter-panel', headerVariant === 'filter');
    this.flyout.classList.toggle('h-explorer-tool-panel-tall', fullHeight);
    this._helpHandler = typeof onHelp === 'function' ? onHelp : null;
    this.flyoutHelp.hidden = !this._helpHandler;
    this._pinHandler = typeof onPin === 'function' ? onPin : null;
    this.flyoutPin.hidden = !this._pinHandler;
    this.flyout.hidden = false;
    this.flyout.classList.add('open');
    this._alignFlyout(anchor);
    applyI18n(this.flyout);
    this.flyoutBody.querySelector('input, button, select, textarea')?.focus();
  }

  /**
   * Position the flyout's top edge level with its anchor, clamped within the parent.
   *
   * @private
   * @param {Element|null} anchor Element to align to.
   * @returns {void}
   */
  _alignFlyout(anchor) {
    if (!this.flyout || !this.parent || !(anchor instanceof Element)) {
      this.flyout.style.top = '0px';
      return;
    }

    const parentRect = this.parent.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const requestedTop = anchorRect.top - parentRect.top;
    const maximumTop = Math.max(0, parentRect.height - this.flyout.offsetHeight);
    const top = Math.max(0, Math.min(requestedTop, maximumTop));

    this.flyout.style.top = `${Math.round(top)}px`;
  }

  /**
   * Close the flyout when it's already showing the given tool, acting as a toggle-off.
   *
   * @private
   * @param {string} id Tool id to check against the currently active tool.
   * @returns {boolean} True when the flyout was open for `id` and has now been closed.
   */
  _toggleIfActive(id) {
    if (this.activeTool !== id || this.flyout?.hidden) {
      return false;
    }

    this.closeToolPanel();
    return true;
  }

  /**
   * Record the active tool id and reflect it on the left rail's button states.
   *
   * @private
   * @param {string|null} id Tool id, or `null` to clear.
   * @returns {void}
   */
  _setActiveTool(id) {
    this.activeTool = id;
    this.leftRail?.clearActive();

    if (id) {
      this.leftRail?.setActive(id, true);
    }
  }

  /**
   * Reflect each presentation type's current visibility onto the right rail's toggle buttons.
   *
   * @private
   * @returns {void}
   */
  _syncPresentationButtons() {
    if (!this.rightRail || !this.application.layout) {
      return;
    }

    for (const type of ['data', 'map', 'graph', 'timeline', 'recordview']) {
      this.rightRail.setActive(
        type,
        this.application.layout.isPresentationVisible(type)
      );
    }
  }

  /**
   * Close the flyout on a pointerdown outside it, the rails, and any open top-layer dialog.
   *
   * @private
   * @param {PointerEvent} event Originating document pointerdown event.
   * @returns {void}
   */
  _handleOutsidePointer(event) {
    if (!this.flyout || this.flyout.hidden) {
      return;
    }

    // A modal dialog (HFilterBuilder, HMsg, …) renders in the top layer as a
    // child of <body>, so it is not contained by the flyout. Clicks inside it
    // - or on its backdrop - must not tear down the search flyout underneath.
    if (event.target instanceof Element && event.target.closest('dialog[open]')) {
      return;
    }

    if (
      this.flyout.contains(event.target)
      || this.leftRail?.element?.contains(event.target)
      || this.rightRail?.element?.contains(event.target)
    ) {
      return;
    }

    this.closeToolPanel();
  }
}

/** Build the left rail's button definitions. */
function leftButtons() {
  return [
    { id: 'search', icon: 'fa-solid fa-magnifying-glass', title: 'Search', group: 'find' },
    { id: 'saved-filters', icon: 'fa-solid fa-filter', title: 'Saved Filters', group: 'find' },
    { id: 'record-types', icon: 'fa-solid fa-shapes', title: 'Search by Record Type', group: 'find' },
    { id: 'query-sources', icon: 'fa-solid fa-database', title: 'Query Sources', group: 'find' },
    { id: 'favorites', icon: 'fa-solid fa-star', title: 'Favorites', group: 'activity' },
    { id: 'history', icon: 'fa-solid fa-clock-rotate-left', title: 'History', group: 'activity' },
    { id: 'workspace', icon: 'fa-regular fa-object-group', title: 'Workspace', group: 'activity' },
    { id: 'subsets', icon: 'fa-solid fa-arrows-left-right-to-line', title: 'Subsets', group: 'subsets' },
    // Manage Filters / Manage Sources remain hidden until their workflows
    // replace the legacy management widgets.
    { id: 'help', icon: 'fa-solid fa-circle-question', title: 'Help', group: 'help' }
  ];
}

/** Build the right rail's button definitions. */
function rightButtons() {
  return [
    { id: 'data', icon: 'fa-solid fa-table', title: 'Data', group: 'presentations', toggle: true },
    { id: 'map', icon: 'fa-solid fa-map-location-dot', title: 'Map', group: 'presentations', toggle: true },
    { id: 'graph', icon: 'fa-solid fa-hexagon-nodes', title: 'Graph', group: 'presentations', toggle: true },
    { id: 'timeline', icon: 'fa-regular fa-clock', title: 'Timeline', group: 'presentations', toggle: true },
    { id: 'recordview', icon: 'fa-regular fa-address-card', title: 'Record View', group: 'presentations', toggle: true },
    { id: 'report', icon: 'fa-regular fa-file', title: 'Report', group: 'tools' },
    { id: 'crosstabs', icon: 'fa-solid fa-chart-column', title: 'Crosstabs / Charts', group: 'tools' },
    { id: 'actions', icon: 'fa-solid fa-bolt', title: 'Actions Dashboard', group: 'tools' },
    { id: 'export', icon: 'fa-solid fa-file-export', title: 'Export Dashboard', group: 'tools' }
  ];
}
