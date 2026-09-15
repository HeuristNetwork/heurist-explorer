/**
 * @file DocumentControlPanel.js
 * @brief Engine-neutral document/layer/base-map control panel shared by the map and timeline
 *        applications, parameterized by their own `LayerPanel`/`BaseMapSelector` and message helper.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { MapDocumentSelector } from './MapDocumentSelector.js';
import { $HR, applyI18n, InlineHelp } from '#shared/ui';

/** Renders the module's document/layer/base-map control panel and its collapse behavior. */
export class DocumentControlPanel {
  /**
   * @param {object} config
   * @param {object} config.api Module's public API.
   * @param {HTMLElement} config.mapContainer The module's DOM element the panel attaches beside.
   * @param {object} config.options Panel presentation options.
   * @param {Function} config.LayerPanel Module-specific layer panel constructor.
   * @param {Function} config.BaseMapSelector Module-specific base-map selector constructor.
   * @param {string} [config.moduleName] Module name used in labels/event names (e.g. `'map'`, `'timeline'`).
   * @param {Function} config.showMessage Module-specific error/warning message function.
   */
  constructor({ api, mapContainer, options, LayerPanel, BaseMapSelector, moduleName = 'map', showMessage }) {
    this.api = api;
    this.LayerPanel = LayerPanel;
    this.BaseMapSelector = BaseMapSelector;
    this.moduleName = moduleName;
    this.showMessage = showMessage;
    this.mapContainer = mapContainer;
    this.options = options;
    this.listeners = [];
    this.baseMapsExpanded = options.baseMapsInitiallyExpanded === true;
  }

  /**
   * Build a small icon-only action button bound to this panel's module-specific message helper.
   *
   * @param {string} icon Font Awesome icon class.
   * @param {string} title Localizable tooltip/aria-label text.
   * @param {Function} handler Click handler; may be async.
   * @returns {HTMLButtonElement} The button element.
   */
  iconButton(icon, title, handler) { return iconButton(icon, title, handler, this.showMessage); }

  /**
   * Build, mount, and wire the control panel to the module's public API events.
   *
   * @returns {void}
   */
  mount() {
    if (this.options.enabled === false || this.options.placement === 'none') return;

    if (this.options.showSourceHeader === true) {
      this.sourceHeader = document.createElement('div');
      this.sourceHeader.className = 'heurist-source-header';
      // Prepend to the shared parent rather than inserting immediately before
      // mapContainer: a module toolbar (e.g. heurist-timeline-toolbar) may already
      // sit before mapContainer, and the source header must render above it.
      this.mapContainer.parentElement?.prepend(this.sourceHeader);
    }

    this.element = document.createElement('aside');
    this.element.className = 'heurist-module-control-panel h-widget';
    if (this.options.showSourceHeader === true) this.element.classList.add('with-source-header');
    this.element.setAttribute('aria-label', $HR(`${this.moduleName} controls`));
    if (this.options.position) this.element.classList.add(`position-${this.options.position}`);
    if (this.options.maxHeight) this.element.style.maxHeight = String(this.options.maxHeight);
    this.applyControlCss();

    const header = document.createElement('div');
    header.className = 'heurist-module-panel-header';
    const hasDocumentControls = this.options.showCurrentDocument !== false || this.options.showMapDocuments !== false;
    const configuredBaseMaps = this.api.getBaseMaps?.() || [];
    const hasSelectableBaseMaps = this.options.showBaseMaps !== false
      && configuredBaseMaps.some((item) => String(item?.id) !== 'None');
    const hasPanelSections = hasDocumentControls || hasSelectableBaseMaps;
    this.hasVisiblePanels = hasPanelSections;
    let layerToggle = null;
    if (!hasPanelSections) {
      this.element.classList.add('controls-only');
    } else {
      this.angleToggle = this.iconButton('fa-solid fa-angle-up', 'Show or hide panels', () => this.toggleBody());
      this.angleToggle.classList.add('heurist-module-panel-angle-toggle');
      header.append(this.angleToggle);

      layerToggle = this.iconButton('fa-solid fa-layer-group', `Show or hide ${this.moduleName} controls`, () => this.toggleFullyCollapsed());
      layerToggle.classList.add('heurist-module-panel-toggle');
    }

    this.actions = document.createElement('span');
    this.actions.className = 'heurist-module-panel-actions';
    if (this.api.getCapabilities?.().editing === true && this.api.requestAddMapDocument) {
      this.actions.append(this.iconButton('fa-solid fa-circle-plus', 'Create new map document', () => this.api.requestAddMapDocument()));
    }
    if (this.options.showHomeControl !== false) {
      this.actions.append(this.iconButton('fa-solid fa-house', 'Zoom to active map document', () => this.api.zoomHome()));
    }

    this.actions.append(this.iconButton('fa-solid fa-circle-question', 'Help', () => this.openHelp()));

    const hostCapabilities = this.api.getHostCapabilities?.() || {};
    if (this.options.showOptions !== false && hostCapabilities.mapPreferences) {
      this.actions.append(this.iconButton('fa-solid fa-gear', `${this.moduleName} options`, () => this.api.openPreferencesDialog()));
    }
    if (this.options.showPublish !== false && hostCapabilities.mapPublishing) {
      this.actions.append(this.iconButton('fa-solid fa-share-nodes', `Publish ${this.moduleName}`, () => this.api.openPublishDialog()));
    }
    header.append(this.actions);
    if (layerToggle) header.append(layerToggle);

    const body = document.createElement('div');
    body.className = 'heurist-module-panel-body';
    if (this.options.showSourceHeader === true) body.classList.add('with-source-header');
    if (this.options.initiallyExpanded === false) this.element.classList.add('fully-collapsed');

    if (hasDocumentControls) {
      this.documentsContainer = document.createElement('div');
      this.documentsContainer.className = 'heurist-map-documents';
      body.append(this.documentsContainer);
    }

    if (hasSelectableBaseMaps) {
      const baseSection = document.createElement('section');
      baseSection.className = 'heurist-map-basemap-section';
      this.baseMapsToggle = document.createElement('button');
      this.baseMapsToggle.type = 'button';
      this.baseMapsToggle.className = 'heurist-map-basemap-toggle';
      this.baseMapsToggle.addEventListener('click', () => {
        this.baseMapsExpanded = !this.baseMapsExpanded;
        this.updateBaseMapsExpansion();
      });
      this.baseMapsContainer = document.createElement('div');
      this.baseMapsContainer.className = 'heurist-map-basemap-list';
      baseSection.append(this.baseMapsToggle, this.baseMapsContainer);
      body.append(baseSection);
      this.updateBaseMapsExpansion();
    }

    this.element.append(header);
    if (hasPanelSections) this.element.append(body);
    const target = this.options.placement === 'external' && this.options.containerId
      ? document.getElementById(this.options.containerId)
      : this.mapContainer.parentElement;
    if (target && globalThis.getComputedStyle?.(target).position === 'static') target.style.position = 'relative';
    target?.append(this.element);
    applyI18n(this.element);
    this.updateExpandedState();

    this.documentSelector = this.documentsContainer
      ? new MapDocumentSelector({ api: this.api, container: this.documentsContainer })
      : null;
    this.baseMapSelector = this.baseMapsContainer
      ? new this.BaseMapSelector({ api: this.api, container: this.baseMapsContainer })
      : null;

    for (const eventName of [
      'heurist-map-documents-loaded', 'heurist-map-documents-changed',
      'heurist-map-document-activating', 'heurist-map-document-activated',
      'heurist-map-document-state-changed', 'heurist-map-document-unloaded',
      'heurist-map-layer-loaded', 'heurist-map-layer-visibility-changed',
      'heurist-map-layer-state-changed', 'heurist-map-layer-style-changed',
      'heurist-map-basemap-changed', 'heurist-map-error'
    ]) this.bind(eventName.replace('heurist-map-', `heurist-${this.moduleName}-`), () => this.refresh());

    // The opacity slider updates continuously. Rebuilding the panel for every
    // input event would remove the open popover, so defer that refresh until
    // the control is closed. Programmatic opacity changes still refresh when
    // no opacity control is open.
    this.bind('heurist-map-layer-opacity-changed', () => {
      if (!document.querySelector('[data-heurist-map-opacity-popover="1"]')) {
        this.refresh();
      }
    });
    this.refresh();
  }

  /**
   * Register a public API event listener and track it for later removal.
   *
   * @param {string} name Event name.
   * @param {Function} handler Event handler.
   * @returns {void}
   */
  bind(name, handler) {
    this.api.addEventListener(name, handler);
    this.listeners.push([name, handler]);
  }

  /**
   * Re-render the document, layer, and base-map sections from current API state.
   *
   * @returns {void}
   */
  refresh() {
    const activeDocument = this.api.getActiveMapDocument();
    const activeId = activeDocument?.id;
    const isDynamicDocument = activeDocument?.persistent === false;
    if (this.sourceHeader) this.sourceHeader.textContent = activeDocument?.title || '';
    const editingEnabled = this.api.getCapabilities?.().editing === true;
    const symbologyEditingEnabled = this.api.getCapabilities?.().symbologyEditing === true;
    const allDocuments = this.api.getMapDocuments();
    const documentActivating = allDocuments.some((item) => item.activating === true || item.loadState === 'loading');
    const documents = allDocuments.filter((item) => {
      if (item.showInPanel === false) return false;
      if (item.persistent === false) return this.options.showCurrentDocument !== false;
      return this.options.showMapDocuments !== false;
    });
    this.documentSelector?.render(documents, activeId, () => {
      if (this.options.showLayers === false) return null;
      const container = document.createElement('div');
      container.className = 'heurist-map-active-layers';
      new this.LayerPanel({
        api: this.api,
        container,
        editingEnabled,
        symbologyEditingEnabled,
        onEditLayer: (layerId) => this.editLayer(layerId),
        showLegend: this.options.showLegend !== false,
        showWorkspaceActions: !isDynamicDocument
      }).render(this.api.getLayers(), { loading: documentActivating });
      return container;
    }, {
      editingEnabled,
      onEditDocument: (documentId) => this.editMapDocument(documentId),
      onActivateDocument: () => {
        this.baseMapsExpanded = false;
        this.updateBaseMapsExpansion();
      }
    });
    this.baseMapSelector?.render(this.api.getBaseMaps(), this.api.getActiveBaseMap()?.id);
    this.updateBaseMapsExpansion();
  }

  /**
   * Request editing of a persisted MapDocument through the public map API.
   *
   * @param {*} documentId Id of the map document to edit.
   * @returns {*} Result of the underlying public API call.
   */
  editMapDocument(documentId) {
    return this.api.requestEditMapDocument(documentId);
  }

  /**
   * Request editing of a persisted MapLayer through the public map API.
   *
   * @param {*} layerId Id of the layer to edit.
   * @returns {*} Result of the underlying public API call.
   */
  editLayer(layerId) {
    return this.api.requestEditLayer(layerId);
  }

  /**
   * Sync the base-maps toggle label/aria state and section visibility with `baseMapsExpanded`.
   *
   * @returns {void}
   */
  updateBaseMapsExpansion() {
    if (!this.baseMapsToggle || !this.baseMapsContainer) return;
    this.baseMapsToggle.textContent = `${$HR('Base maps')} ${this.baseMapsExpanded ? '▾' : '▸'}`;
    this.baseMapsToggle.setAttribute('aria-expanded', String(this.baseMapsExpanded));
    this.baseMapsContainer.hidden = !this.baseMapsExpanded;
  }

  /**
   * Shrink or restore the whole panel down to its far-right toggle button.
   *
   * @returns {void}
   */
  toggleFullyCollapsed() {
    const fullyCollapsed = this.element.classList.toggle('fully-collapsed');
    if (!fullyCollapsed) {
      this.element.classList.toggle('body-collapsed', !this.hasVisiblePanels);
    }
    this.updateExpandedState();
  }

  /**
   * Show or hide the document/base-map list while keeping the header visible.
   *
   * @returns {void}
   */
  toggleBody() {
    if (this.element.classList.contains('fully-collapsed')) return;
    if (!this.hasVisiblePanels) {
      this.toggleFullyCollapsed();
      return;
    }
    this.element.classList.toggle('body-collapsed');
    this.updateExpandedState();
  }

  /**
   * Sync toggle aria-expanded state and the angle icon with the current collapse classes.
   *
   * @returns {void}
   */
  updateExpandedState() {
    const fullyCollapsed = this.element.classList.contains('fully-collapsed');
    const bodyCollapsed = this.element.classList.contains('body-collapsed');
    this.element.querySelector('.heurist-module-panel-toggle')
      ?.setAttribute('aria-expanded', String(!fullyCollapsed));
    if (this.angleToggle) {
      const expanded = !fullyCollapsed && !bodyCollapsed;
      this.angleToggle.setAttribute('aria-expanded', String(expanded));
      const icon = this.angleToggle.querySelector('.fa-solid');
      icon?.classList.toggle('fa-angle-up', expanded);
      icon?.classList.toggle('fa-angle-down', !expanded);
    }
  }

  /**
   * Load the module user manual for the active language into a full-viewport overlay.
   *
   * @returns {void}
   */
  openHelp() {
    this.helpOverlay ||= new InlineHelp({ moduleName: this.moduleName });
    this.helpOverlay.open();
  }

  /**
   * Apply custom Map Control CSS as inline declarations or a complete CSS rule.
   *
   * @returns {void}
   */
  applyControlCss() {
    this.controlCssStyle?.remove();
    this.controlCssStyle = null;
    const css = String(this.options.controlCss || '').trim();
    if (!css || !this.element) return;

    if (!css.includes('{')) {
      this.element.style.cssText = `${this.element.style.cssText};${css}`;
      return;
    }

    const style = document.createElement('style');
    style.className = 'heurist-map-control-custom-css';
    style.textContent = css;
    (this.element.ownerDocument?.head || document.head).append(style);
    this.controlCssStyle = style;
  }

  /**
   * Rebuild the lightweight control panel with new presentation options.
   *
   * @param {object} [options] Partial options merged over the current options.
   * @returns {HTMLElement|null} The rebuilt panel element, or `null` when it did not mount.
   */
  applyOptions(options = {}) {
    const next = { ...this.options, ...options };
    const wasExpanded = this.element ? !this.element.classList.contains('fully-collapsed') : next.initiallyExpanded !== false;
    this.destroy();
    this.options = next;
    this.listeners = [];
    this.baseMapsExpanded = next.baseMapsInitiallyExpanded === true;
    this.mount();
    if (this.element && wasExpanded !== (next.initiallyExpanded !== false)) {
      this.element.classList.toggle('fully-collapsed', !wasExpanded);
      this.updateExpandedState();
    }
    return this.element || null;
  }

  /**
   * Remove the panel, its custom CSS, and detach all bound event listeners.
   *
   * @returns {void}
   */
  destroy() {
    for (const [name, handler] of this.listeners) this.api.removeEventListener(name, handler);
    this.controlCssStyle?.remove();
    this.controlCssStyle = null;
    this.sourceHeader?.remove();
    this.sourceHeader = null;
    this.helpOverlay?.close();
    this.element?.remove();
  }
}

/**
 * Build a small icon-only action button that reports async failures through `showMessage`.
 *
 * @param {string} icon Font Awesome icon class.
 * @param {string} title Localizable tooltip/aria-label text.
 * @param {Function} handler Click handler; may be async.
 * @param {Function} showMessage Module-specific error/warning message function.
 * @returns {HTMLButtonElement} The button element.
 */
function iconButton(icon, title, handler, showMessage) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'heurist-icon-button';
  button.title = $HR(title);
  button.setAttribute('aria-label', $HR(title));
  button.innerHTML = `<span class="${icon}" aria-hidden="true"></span>`;
  button.addEventListener('click', (event) => { event.stopPropagation(); Promise.resolve().then(() => handler(event)).catch((error) => showMessage(error, { error: true, title: 'Map error' })); });
  return button;
}
