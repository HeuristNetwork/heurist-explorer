/**
 * @file LayerPanelItem.js
 * @brief One MapLayer row with state and actions.
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

import { createLayerLegend } from './legend/LegendRenderer.js';
import { $HR } from '#shared/ui';

/** Renders one MapLayer row, its state control, actions, thematic selector, and legend. */
export class LayerPanelItem {
  /**
   * @param {object} options
   * @param {object} options.api Map's public API.
   * @param {object} options.layer Normalized runtime layer.
   * @param {boolean} [options.editingEnabled] Whether layer editing controls are shown.
   * @param {boolean} [options.symbologyEditingEnabled] Whether symbology editing controls are shown.
   * @param {Function|null} [options.onEditLayer] Callback invoked to edit the layer.
   * @param {boolean} [options.showLegend] Whether the layer's legend is rendered.
   * @param {boolean} [options.showWorkspaceActions] Whether workspace-only actions are shown.
   */
  constructor({ api, layer, editingEnabled = false, symbologyEditingEnabled = false, onEditLayer = null, showLegend = true, showWorkspaceActions = true }) {
    this.api = api;
    this.layer = layer;
    this.empty = isEmptyMapLayer(layer);
    this.editingEnabled = editingEnabled;
    this.symbologyEditingEnabled = symbologyEditingEnabled;
    this.onEditLayer = onEditLayer;
    this.showLegend = showLegend !== false;
    this.showWorkspaceActions = showWorkspaceActions !== false;
    this.element = this.create();
  }

  /**
   * Build the full row element (state control, title, actions, thematic selector, legend).
   *
   * @returns {HTMLElement} The row element.
   */
  create() {
    const row = document.createElement('div');
    row.className = 'heurist-map-layer-row';
    if (this.layer.activeDataSource) row.classList.add('heurist-map-layer-active-datasource');
    if (this.empty) row.classList.add('heurist-map-layer-empty');
    row.dataset.layerId = this.layer.id;

    const main = document.createElement('div');
    main.className = 'heurist-map-row-main';
    main.append(this.createStateControl());

    const titleBlock = document.createElement('span');
    titleBlock.className = 'heurist-map-layer-title-block';
    const title = document.createElement('span');
    title.className = 'heurist-map-layer-title';
    const presentation = getLayerPresentation(this.layer);
    title.textContent = presentation.label;
    title.title = presentation.title;
    titleBlock.append(title);
    if (presentation.warning) {
      const warning = document.createElement('small');
      warning.className = 'heurist-map-layer-partial-warning';
      warning.textContent = presentation.warning;
      warning.title = presentation.warning;
      titleBlock.append(warning);
    }
    main.append(titleBlock);

    const actions = document.createElement('span');
    actions.className = 'heurist-map-row-actions';
    const hostCapabilities = this.api.getHostCapabilities?.() || {};
    const isCurrentResults = String(this.layer.id) === 'current-results';
    const isWorkspaceLayer = this.layer.options?.workspaceEntry === true;
    const hasDataSource = Boolean(this.layer.options?.dataSource && this.layer.source?.type === 'heurist-query');
    if (this.showWorkspaceActions && hostCapabilities.explorerWorkspace && isCurrentResults && hasDataSource) {
      actions.append(button(
        isWorkspaceLayer ? 'fa-solid fa-object-group' : 'fa-regular fa-object-group',
        isWorkspaceLayer ? 'Remove from workspace' : 'Add to workspace',
        () => this.api.toggleLayerWorkspace(this.layer.id)
      ));
    } else if (this.showWorkspaceActions && hostCapabilities.explorerWorkspace && isWorkspaceLayer) {
      actions.append(button(
        'fa-regular fa-circle-xmark',
        'Remove from workspace',
        () => this.api.removeLayerFromWorkspace(this.layer.id)
      ));
    }
    if (hostCapabilities.showDatasource && hasDataSource) {
      actions.append(button(
        'fa-solid fa-table',
        'Show data',
        () => this.api.showLayerDataSource(this.layer.id)
      ));
    }
    if (this.layer.loadState === 'loaded' && !this.empty) {
      const zoomButton = button(
        'fa-solid fa-magnifying-glass-plus',
        'Zoom to layer extent',
        () => this.api.zoomToLayer(this.layer.id)
      );
      zoomButton.classList.add('heurist-map-layer-zoom-action');
      actions.append(zoomButton);
      actions.append(createOpacityControl(this.api, this.layer, row));
    }
    if (this.layer.loadState === 'loaded') {
      if (!isCurrentResults && Number(this.layer.recordId) > 0 && this.editingEnabled && typeof this.onEditLayer === 'function') {
        actions.append(button(
          'fa-solid fa-pencil',
          'Edit layer',
          () => this.onEditLayer(this.layer.id)
        ));
      }
    }

    const header = document.createElement('div');
    header.className = 'heurist-map-layer-header';
    header.append(main, actions);
    row.append(header);

    const thematicSelector = this.createThematicSelector();
    if (thematicSelector) row.append(thematicSelector);

    const symbologyActions = this.createSymbologyActions();
    let legend = null;
    if (!this.empty && this.showLegend && supportsSymbologyLegend(this.layer)) {
      legend = createLayerLegend(this.layer);
      if (legend) {
        if (symbologyActions) legend.append(symbologyActions);
        row.append(legend);
      }
    }
    // If the legend is deliberately disabled, retain access to the editors in
    // the normal row actions rather than dropping the functionality entirely.
    if (!legend && symbologyActions) {
      while (symbologyActions.firstChild) actions.append(symbologyActions.firstChild);
    }
    return row;
  }

  /**
   * Build the symbology/thematic editor action buttons for this layer, when applicable.
   *
   * @returns {HTMLElement|null} The actions container, or `null` when no editors apply.
   */
  createSymbologyActions() {
    if (this.empty) return null;
    if (!this.symbologyEditingEnabled || !supportsSymbologyLegend(this.layer) || this.layer.loadState !== 'loaded') {
      return null;
    }

    const isCurrentResults = String(this.layer.id) === 'current-results';
    const isWorkspaceLayer = this.layer.options?.workspaceEntry === true;
    const hasPersistentLayer = Number(this.layer.recordId) > 0;
    if (!isCurrentResults && !isWorkspaceLayer && !hasPersistentLayer) return null;

    const actions = document.createElement('span');
    actions.className = 'heurist-map-legend-actions';
    actions.append(button(
      'fa-solid fa-palette',
      isCurrentResults && !isWorkspaceLayer ? 'Edit default symbology' : 'Edit layer symbology',
      () => this.api.requestEditLayerSymbology(this.layer.id, { thematic: false })
    ));

    if (!isCurrentResults && !isWorkspaceLayer && hasPersistentLayer && supportsThematicSelection(this.layer)) {
      actions.append(button(
        'fa-solid fa-chart-simple',
        'Edit thematic renderers',
        () => this.api.requestEditLayerSymbology(this.layer.id, { thematic: true })
      ));
    }
    return actions;
  }

  /**
   * Build the thematic-map radio selector for this layer, when it has configured themes.
   *
   * @returns {HTMLElement|null} The selector element, or `null` when no themes are configured.
   */
  createThematicSelector() {
    if (this.empty) return null;
    if (this.layer?.loadState !== 'loaded' || !supportsThematicSelection(this.layer)) return null;
    const thematic = Array.isArray(this.layer?.style?.thematic) ? this.layer.style.thematic : [];
    if (!thematic.length) return null;

    const list = document.createElement('div');
    list.className = 'heurist-map-layer-themes';
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', `${$HR('Symbology for')} ${this.layer.title || this.layer.id}`);

    const activeIndex = thematic.findIndex((theme) => theme?.active === true);
    list.append(this.createThemeRadio('Default', null, activeIndex < 0));
    thematic.forEach((theme, index) => {
      list.append(this.createThemeRadio(theme?.title || `Theme ${index + 1}`, index, activeIndex === index));
    });
    return list;
  }

  /**
   * Build one radio option for the thematic-map selector.
   *
   * @param {string} labelText Label text (may be a translatable "Theme N" placeholder).
   * @param {number|null} themeIndex Index of the thematic map, or `null` for "Default".
   * @param {boolean} checked Whether this option is initially selected.
   * @returns {HTMLElement} The radio option's label element.
   */
  createThemeRadio(labelText, themeIndex, checked) {
    const label = document.createElement('label');
    label.className = 'heurist-map-layer-theme-option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.classList.add('h-checkbox');
    radio.name = `heurist-map-layer-theme-${this.layer.id}`;
    radio.checked = checked;
    radio.value = themeIndex == null ? 'default' : String(themeIndex);
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      Promise.resolve(this.api.setLayerTheme(this.layer.id, themeIndex)).catch(() => {});
    });

    const text = document.createElement('span');
    text.className = 'h-i18n';
    text.textContent = /^Theme \d+$/.test(labelText)
      ? labelText.replace('Theme', $HR('Theme')) : $HR(labelText);
    label.append(radio, text);
    return label;
  }

  /**
   * Build the layer's leading state control (loading spinner, error retry, or visibility checkbox).
   *
   * @returns {HTMLElement} The state control element.
   */
  createStateControl() {
    if (this.layer.loadState === 'loading') {
      const status = document.createElement('span');
      status.className = 'heurist-map-layer-status';
      status.title = $HR('Loading layer');
      status.setAttribute('aria-label', $HR('Loading layer'));
      status.innerHTML = '<span class="heurist-map-spinner" aria-hidden="true"></span>';
      return status;
    }

    if (this.layer.loadState === 'error') {
      const retry = button(
        'fa-solid fa-triangle-exclamation',
        this.layer.error?.message || 'Layer loading failed; click to retry',
        () => this.api.reloadLayer(this.layer.id)
      );
      retry.classList.add('heurist-map-layer-error');
      return retry;
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.classList.add('h-checkbox');
    checkbox.checked = this.layer.visible;
    checkbox.disabled = this.layer.options?.emptyCurrentResult === true
      || (this.empty && String(this.layer.id) !== 'current-results');
    checkbox.title = this.layer.loadState === 'deferred'
      ? $HR('Layer has not been loaded')
      : $HR('Layer loaded');
    if (this.empty) checkbox.title = getLayerPresentation(this.layer).title;
    checkbox.addEventListener('change', async () => {
      const requested = checkbox.checked;
      try {
        await this.api.setLayerVisibility(this.layer.id, requested);
      } catch (error) {
        checkbox.checked = !requested;
        throw error;
      }
    });
    return checkbox;
  }
}

/** Only a successful, non-viewport vector load with a known zero count is empty. */
export function isEmptyMapLayer(layer) {
  if (layer?.loadState !== 'loaded' || layer.options?.dynamicRequests === true
    || !supportsSymbologyLegend(layer)) return false;
  const count = finiteCount(layer.resultMeta?.returnedFeatures) ?? finiteCount(layer.featureCount);
  return count === 0;
}

/**
 * Whether a layer's source type supports a symbology legend.
 *
 * @param {object} layer Normalized runtime layer.
 * @returns {boolean} `true` unless the source is an image/tile/iiif/geotiff raster.
 */
function supportsSymbologyLegend(layer) {
  const sourceType = String(layer?.source?.type || '');
  return !['image', 'tile', 'iiif', 'geotiff'].includes(sourceType);
}

/**
 * Whether a layer's source type supports thematic-attribute selection.
 *
 * @param {object} layer Normalized runtime layer.
 * @returns {boolean} `true` for Heurist query/record sources.
 */
function supportsThematicSelection(layer) {
  const sourceType = String(layer?.source?.type || '');
  // Thematic attributes are retrieved through the Heurist records API.
  // Do not expose thematic controls for external/vector-file or raster sources.
  return sourceType === 'heurist-query' || sourceType === 'record';
}

/**
 * Build a small icon-only action button.
 *
 * @param {string} icon Font Awesome icon class.
 * @param {string} title Localizable tooltip text.
 * @param {Function} handler Click handler.
 * @returns {HTMLButtonElement} The button element.
 */
function button(icon, title, handler) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'heurist-icon-button';
  element.title = $HR(title);
  element.innerHTML = `<span class="${icon}" aria-hidden="true"></span>`;
  element.addEventListener('click', handler);
  return element;
}

/**
 * Build the trigger button that opens a layer's opacity popover.
 *
 * @param {object} api Map's public API.
 * @param {object} layer Normalized runtime layer.
 * @param {HTMLElement} row The layer row the popover attaches to.
 * @returns {HTMLElement} The opacity control container.
 */
function createOpacityControl(api, layer, row) {
  const control = document.createElement('span');
  control.className = 'heurist-map-opacity-control';

  const trigger = button(
    'fa-solid fa-circle-half-stroke',
    'Set layer opacity',
    (event) => {
      event.stopPropagation();
      openOpacityPopover({ api, layer, row, trigger });
    }
  );

  control.append(trigger);
  return control;
}

/**
 * Open the opacity-slider popover for one layer, closing any other open popover first.
 *
 * @param {{api: object, layer: object, row: HTMLElement, trigger: HTMLElement}} context
 * @returns {void}
 */
function openOpacityPopover({ api, layer, row, trigger }) {
  closeOpenOpacityPopover();

  const popover = document.createElement('div');
  popover.className = 'heurist-map-opacity-popover';
  popover.dataset.heuristMapOpacityPopover = '1';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'heurist-map-opacity-close';
  close.title = $HR('Close opacity control');
  close.setAttribute('aria-label', $HR('Close opacity control'));
  close.textContent = '×';

  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.step = '1';
  input.value = String(Math.round((layer.opacity ?? 1) * 100));
  input.title = $HR('Layer opacity');
  input.setAttribute('aria-label', $HR('Layer opacity'));

  const value = document.createElement('span');
  value.className = 'heurist-map-opacity-value';
  value.textContent = `${input.value}%`;

  popover.append(input, value, close);
  row.append(popover);

  input.addEventListener('input', () => {
    value.textContent = `${input.value}%`;
    api.setLayerOpacity(layer.id, Number(input.value));
  });

  const cleanup = () => {
    document.removeEventListener('pointerdown', onOutsidePointerDown, true);
    popover.remove();
  };
  popover._heuristCleanup = cleanup;

  const onOutsidePointerDown = (event) => {
    if (!popover.contains(event.target) && !trigger.contains(event.target)) {
      cleanup();
    }
  };

  close.addEventListener('click', (event) => {
    event.stopPropagation();
    cleanup();
  });
  popover.addEventListener('pointerdown', (event) => event.stopPropagation());

  // Defer registration so the pointer event that opened the popover cannot
  // immediately close it again.
  queueMicrotask(() => document.addEventListener('pointerdown', onOutsidePointerDown, true));
}

/**
 * Close the currently open opacity popover, if any.
 *
 * @returns {void}
 */
function closeOpenOpacityPopover() {
  const popover = document.querySelector('[data-heurist-map-opacity-popover="1"]');
  if (typeof popover?._heuristCleanup === 'function') {
    popover._heuristCleanup();
  } else {
    popover?.remove();
  }
}

/**
 * Resolve a layer's display label, tooltip, and optional partial-load warning.
 *
 * @param {object} layer Normalized runtime layer.
 * @returns {{label: string, title: string, warning: string|null}} Presentation strings.
 */
function getLayerPresentation(layer) {
  let label, title;
  let warning = null;

  const meta = layer?.resultMeta || {};
  const features = finiteCount(meta.returnedFeatures) ?? finiteCount(layer?.featureCount) ?? 0;
  if (meta.isPartial === true) {
    const returnedRecords = finiteCount(meta.returnedRecords);
    const totalRecords = finiteCount(meta.totalRecords);
    const detail = returnedRecords != null && totalRecords != null
      ? `first ${formatCount(returnedRecords)} of ${formatCount(totalRecords)} records processed`
      : 'only part of the result set was loaded';
    title = `Result: ${formatCount(features)} features — ${detail}`;
    warning = `Partial load: ${detail}.`;
  } else {
    title = `Result: ${formatCount(features)} features`;
  }

  label = layer?.title || String(layer?.id ?? '');
  if (isEmptyMapLayer(layer)) {
    title += meta.isPartial === true
      ? '. No map features found in the loaded results.'
      : '. No map features found.';
    if (layer.options?.dataSource) title += ' Records are still available through Show Data.';
  }
  if (String(label).trim().toLowerCase() === '[vector]') {
    label = `${formatCount(features)} features`;
  }

  return { label, title, warning: warning };
}

/**
 * Coerce a value to a non-negative integer count, or `null` when it is not one.
 *
 * @param {*} value Candidate value.
 * @returns {number|null} The non-negative integer, or `null`.
 */
function finiteCount(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : null;
}

/**
 * Format a count using the runtime's default locale grouping.
 *
 * @param {number} value Count to format.
 * @returns {string} The formatted count.
 */
function formatCount(value) {
  return new Intl.NumberFormat().format(value);
}
