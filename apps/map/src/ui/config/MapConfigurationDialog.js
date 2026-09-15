/**
 * @file MapConfigurationDialog.js
 * @brief Reusable editor for persisted Heurist map settings. The dialog owns no
 *        persistence: preferences, website editing, and publishing provide/receive
 *        the same allowlisted settings object through setValue(), getValue(), and onSave.
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

import {
  normalizeMapConfigurationMode,
  normalizeMapConfigurationSettings,
  serializeMapConfigurationSettings
} from './mapConfigurationSchema.js';
import { getDefaultBaseMaps } from '../../basemaps/defaultBasemaps.js';
import { createSymbolPreview } from '../legend/LegendRenderer.js';
import { DEFAULT_MAP_SYMBOL, normalizeMapSymbol } from '../../utils/normalizeMapSymbol.js';
import { $HR, applyI18n, HMsg } from '#shared/ui';

const ZOOM_LEVEL_TOOLTIP = 'Level 1 = ~10,000km (15 deg.) to ~65,000 km (equator). Level 18 = ~50m (15 deg.) to ~250m (equator)';
/** Remembers each mode's "Advanced settings" toggle state across dialog instances. */
const advancedStateByMode = new Map();

/** Edits and serializes persisted heurist-map settings in a modal dialog. */
export class MapConfigurationDialog {
  /**
   * @param {Object} [options={}] Dialog configuration.
   * @param {string} [options.mode='preferences'] Dialog mode: `'preferences'`, `'website'`, or `'publish'`.
   * @param {?Object} [options.value=null] Initial settings value; normalized and mode-adjusted.
   * @param {?Element} [options.parent=null] Element to append the dialog to; defaults to `document.body`.
   * @param {?string} [options.title=null] Dialog title; defaults from `defaultTitle(mode)`.
   * @param {?Function} [options.onSave=null] Called with `(value, context)` on save; returning `false` keeps the dialog open.
   * @param {?Function} [options.onCancel=null] Called with `(value, {mode})` when the dialog is cancelled.
   * @param {?Function} [options.onEditSymbology=null] Opens the host symbology editor; returns the edited value.
   * @param {?Function} [options.onEditExtent=null] Opens the host extent/bounds editor; returns the edited bounds.
   * @param {?Object} [options.reportTemplateProvider=null] Provider used to list popup report templates.
   * @param {?Object} [options.mapDocumentListProvider=null] Provider used to list available MapDocuments.
   * @param {Array<Object>} [options.baseMapCatalog=[]] Reserved base-map catalogue; stored but not
   *        currently read (the "Base maps" section uses the curated default catalogue directly).
   * @param {?Object} [options.publishContext=null] Publish-mode context (`activeDocumentId`, `dynamicDocumentId`).
   */
  constructor({
    mode = 'preferences', value = null, parent = null, title = null,
    onSave = null, onCancel = null, onEditSymbology = null, onEditExtent = null, reportTemplateProvider = null,
    mapDocumentListProvider = null, baseMapCatalog = [], publishContext = null
  } = {}) {
    this.mode = normalizeMapConfigurationMode(mode);
    this.value = normalizeMapConfigurationSettings(value || {});
    this.value = prepareModeConfiguration(this.value, this.mode);
    this.parent = parent;
    this.title = title || defaultTitle(this.mode);
    this.onSave = typeof onSave === 'function' ? onSave : null;
    this.onCancel = typeof onCancel === 'function' ? onCancel : null;
    this.onEditSymbology = typeof onEditSymbology === 'function' ? onEditSymbology : null;
    this.onEditExtent = typeof onEditExtent === 'function' ? onEditExtent : null;
    this.reportTemplateProvider = reportTemplateProvider || null;
    this.mapDocumentListProvider = mapDocumentListProvider || null;
    this.baseMapCatalog = Array.isArray(baseMapCatalog) ? baseMapCatalog : [];
    this.publishContext = publishContext && typeof publishContext === 'object' ? { ...publishContext } : {};
    this.publishControls = null;
    this.defaultBaseMapIds = getDefaultBaseMaps().map((item) => String(item.id));
    this.element = null;
    this.dialog = null;
    this.form = null;
    this.fields = new Map();
    this.previousFocus = null;
    this.advanced = advancedStateByMode.get(this.mode) === true;
    this.initialFormState = null;
  }

  /**
   * Replace the dialog's current settings value.
   *
   * @param {?Object} value New settings value; normalized and mode-adjusted.
   * @returns {MapConfigurationDialog} This instance, for chaining.
   */
  setValue(value) {
    this.value = normalizeMapConfigurationSettings(value || {});
    this.value = prepareModeConfiguration(this.value, this.mode);
    if (this.form) {
      this.populate();
      this.applyModeControlState();
    }
    return this;
  }

  /**
   * Read the current settings value: the live form when open, otherwise the stored value.
   *
   * @returns {Object} Cloned, normalized settings.
   */
  getValue() {
    if (this.form) this.value = normalizeMapConfigurationSettings(this.readForm());
    return clone(this.value);
  }

  /**
   * Produce the versioned, JSON-safe settings envelope for persistence.
   *
   * @returns {Object} Serializable settings envelope.
   */
  serialize() { return serializeMapConfigurationSettings(this.getValue()); }

  /**
   * Build the dialog DOM, populate it, and show it modally.
   *
   * @returns {MapConfigurationDialog} This instance, for chaining.
   * @throws {Error} When there is no browser `document`.
   */
  open() {
    if (typeof document === 'undefined') throw new Error('MapConfigurationDialog requires a browser document');
    if (this.element) return this;

    this.previousFocus = document.activeElement;
    this.dialog = document.createElement('dialog');
    this.element = this.dialog;
    this.dialog.className = 'heurist-map-config-dialog h-dialog';
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.cancel();
    });
    const displayTitle = configurationDialogTitle(this.title);
    this.dialog.setAttribute('aria-label', displayTitle);

    const header = document.createElement('header');
    header.className = 'heurist-map-config-header h-dialog-header';
    const heading = document.createElement('h2');
    heading.className = 'h-i18n h-dialog-title';
    heading.textContent = displayTitle;
    const closeButton = button('×', 'Close', () => this.cancel());
    closeButton.classList.add('heurist-map-config-close', 'h-dialog-close');
    header.append(heading, closeButton);

    this.form = document.createElement('form');
    this.form.className = 'heurist-map-config-form';
    this.form.addEventListener('submit', (event) => { event.preventDefault(); void this.save(); });

    if (this.mode !== 'publish') this.form.append(this.buildAdvancedPanel());
    this.buildSections();

    const footer = document.createElement('footer');
    footer.className = 'heurist-map-config-footer h-dialog-footer';
    footer.append(button('Cancel', 'Cancel', () => this.cancel()), submitButton(submitLabel(this.mode)));
    this.form.append(footer);
    this.dialog.append(header, this.form);

    (this.parent || document.body).append(this.element);
    this.populate();
    this.updateAdvancedVisibility();
    this.applyModeControlState();
    applyI18n(this.dialog);
    this.initialFormState = this.formStateSignature();
    for (const control of this.dialog.querySelectorAll('input, select, textarea')) {
      control.classList.add(control.type === 'checkbox' || control.type === 'radio'
        ? 'h-checkbox' : control.tagName === 'SELECT' ? 'h-select' : 'h-input');
    }
    this.dialog.showModal();
    firstFocusable(this.dialog)?.focus();
    return this;
  }

  /**
   * Build the "Advanced settings" toggle panel shown above the sections.
   *
   * @returns {HTMLElement} The generated panel element.
   */
  buildAdvancedPanel() {
    const panel = document.createElement('div');
    panel.className = 'heurist-map-config-advanced-panel';
    const label = document.createElement('label');
    label.className = 'heurist-map-config-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.advanced;
    input.addEventListener('change', () => {
      this.advanced = input.checked;
      advancedStateByMode.set(this.mode, this.advanced);
      this.updateAdvancedVisibility();
    });
    label.append(input, i18nText('Advanced settings'));
    panel.append(label);
    return panel;
  }

  /**
   * Close the dialog, prompting to discard unsaved changes when the form was modified.
   *
   * @returns {boolean} `true` once the dialog has actually been cancelled/closed;
   *          `false` while a discard-confirmation dialog is pending.
   */
  cancel() {
    if (this.initialFormState !== null && this.formStateSignature() !== this.initialFormState) {
      if (this.discardDialog?.open) return false;
      this.discardDialog = HMsg.showMsgDlg('Discard changes to map configuration?', {
        title: 'Discard changes', dialogId: 'heurist-map-discard-changes',
        buttons: [
          { label: 'Keep editing', class: 'h-btn', onClick: () => this.discardDialog.close() },
          { label: 'Discard changes', class: 'h-btn h-btn-danger', onClick: () => {
            this.discardDialog.close();
            this.finishCancel();
          } }
        ]
      });
      return false;
    }
    return this.finishCancel();
  }

  /**
   * Close the dialog immediately and notify `onCancel`, without discard confirmation.
   *
   * @returns {boolean} `true` once cancellation has completed.
   */
  finishCancel() {
    let value;
    try { value = this.getValue(); } catch { value = clone(this.value); }
    this.close();
    this.onCancel?.(value, { mode: this.mode });
    return true;
  }

  /**
   * Compute a signature of the current form state, used to detect unsaved changes.
   *
   * @returns {string} JSON signature of every field's current value.
   */
  formStateSignature() {
    if (!this.form) return '';
    return JSON.stringify([...this.fields.entries()].map(([path, field]) => [
      path,
      field.control?.type === 'checkbox' ? field.control.checked : field.control?.value,
      field.defaultToggle?.checked ?? null,
      field.selectedControl ? [...field.selectedControl.options].map((option) => option.value) : null
    ]));
  }

  /**
   * Validate and submit the current form value through `onSave`, then close on success.
   *
   * @returns {Promise<Object|boolean>} Resolves with the saved value, or `false` when
   *          `onSave` rejected the save or an error occurred (shown to the user).
   */
  async save() {
    try {
      const value = this.getValue();
      const result = await this.onSave?.(value, {
        mode: this.mode,
        serialized: serializeMapConfigurationSettings(value),
        publishOptions: this.mode === 'publish' ? this.getPublishOptions() : null
      });
      if (result === false) return false;
      this.close();
      return value;
    } catch (error) {
      this.showError(error?.message || String(error));
      return false;
    }
  }

  /**
   * Close and tear down the dialog DOM, restoring focus to the previously focused element.
   *
   * @returns {void}
   */
  close() {
    this.discardDialog?.close();
    this.dialog?.close();
    this.element?.remove();
    this.element = this.dialog = this.form = null;
    this.fields.clear();
    this.initialFormState = null;
    if (this.previousFocus?.focus) this.previousFocus.focus();
    this.previousFocus = null;
  }

  /**
   * Build and append every section for the current mode.
   *
   * @returns {void}
   */
  buildSections() {
    if (this.mode === 'publish') {
      this.form.append(
        this.section('Interface', (body) => this.buildInterface(body), { open: true }),
        this.section('Publication', (body) => this.buildPublish(body), { open: true })
      );
      return;
    }
    this.form.append(
      this.section('Interface', (body) => this.buildInterface(body), { open: true }),
      this.section('Workspace/Filtered Result Map', (body) => this.buildCurrentResults(body), { open: true }),
      this.section('Default settings', (body) => this.buildDefaults(body), { open: true }),
      this.section('Map documents', (body) => this.buildMapDocuments(body), { advanced: true }),
      this.section('Base maps', (body) => this.buildBaseMaps(body), { advanced: true }),
      this.section('Interaction', (body) => this.buildInteraction(body), { advanced: true })
    );
  }

  /**
   * Build the "Publication" section's fields (preserve-state, active-document
   * scoping, and the dynamic-document title when publishing Filtered Result).
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildPublish(body) {
    const preserve = plainCheckbox('Preserve current state', true);
    preserve.row.title = $HR('Preserve current extent, zoom, basemap, visible layers, opacity, thematic map and selection.');
    const onlyActive = plainCheckbox('Show only active document', false);
    body.append(preserve.row, onlyActive.row);

    const activeId = this.publishContext.activeDocumentId;
    const dynamicId = String(this.publishContext.dynamicDocumentId || 'dynamic');
    const isDynamic = activeId == null || String(activeId) === dynamicId;
    let titleRow = null;
    if (isDynamic) {
      titleRow = this.text(body, 'config.dynamicDocument.title', 'Title');
    }

    this.publishControls = {
      preserveState: preserve.control,
      showOnlyActiveDocument: onlyActive.control,
      isDynamic,
      titleRow
    };
    onlyActive.control.addEventListener('change', () => this.updatePublishDocumentControls());
    this.updatePublishDocumentControls();
  }

  /**
   * Disable the corresponding "show current document" control while "Show only
   * active document" is checked in publish mode, since publishing collapses
   * document selection to just the active one.
   *
   * @returns {void}
   */
  updatePublishDocumentControls() {
    if (this.mode !== 'publish' || !this.publishControls) return;
    const checked = this.publishControls.showOnlyActiveDocument.checked === true;
    const path = this.publishControls.isDynamic
      ? 'options.ui.showMapDocuments'
      : 'options.ui.showCurrentDocument';
    const field = this.fields.get(path);
    if (!field?.control) return;
    if (checked) field.control.checked = false;
    field.control.disabled = checked;
  }

  /**
   * Read the publish-mode-only options not represented in the settings envelope.
   *
   * @returns {{preserveCurrentState: boolean, showOnlyActiveDocument: boolean}} Publish options.
   */
  getPublishOptions() {
    return {
      preserveCurrentState: this.publishControls?.preserveState?.checked !== false,
      showOnlyActiveDocument: this.publishControls?.showOnlyActiveDocument?.checked === true
    };
  }

  /**
   * Build the "Workspace/Filtered Result Map" section's fields.
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildCurrentResults(body) {
    this.checkbox(body, 'config.dynamicDocument.enabled', 'Enable current-results document', { hidden: true });
    this.text(body, 'config.dynamicDocument.title', 'Title');
    const dynamicLoading = this.checkbox(body, 'config.dynamicDocument.dynamicRequests', 'Load by map extent');
    dynamicLoading.title = $HR('Loads only records within the current map view and refreshes the layer when the map is moved or zoomed. Recommended for large result sets.');
    this.zoomFields(body, 'config.dynamicDocument', { allAdvanced: true });
    this.boundsFields(body, 'config.dynamicDocument.bounds', { advanced: true });
  }

  /**
   * Build the "Default settings" section's fields (point-selection extent,
   * default/select symbology, clustering, feature limits, popup template).
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildDefaults(body) {
    const pointExtent = this.number(body, 'config.defaults.zoomToPointInKM', 'Point selection extent (km)', { min: 0 });
    pointExtent.classList.add('heurist-map-config-inline-number', 'heurist-map-config-narrow-number');
    this.symbology(body, 'config.defaults.symbology', 'Default symbology');
    this.symbology(body, 'config.defaults.selectSymbology', 'Select symbology', { advanced: true, selection: true });
    this.checkbox(body, 'config.defaults.preventContinuousWorldBasemap', 'Prevent continuous world basemap', { advanced: true });
    const clustering = document.createElement('div');
    clustering.className = 'heurist-map-config-clustering';
    this.checkbox(clustering, 'config.defaults.markerClustering', 'Marker clustering');
    const clusterGrid = this.number(clustering, 'config.defaults.markerClusterGridPixels', 'Grid pixels', { min: 0, max: 100 });
    clusterGrid.classList.add('heurist-map-config-inline-number', 'heurist-map-config-narrow-number');
    const clusterLevel = this.select(clustering, 'config.defaults.markerClusterMaxLevel', 'Stop at', zoomLevelChoices(false), { kind: 'number-null' });
    clusterLevel.title = `${$HR('The maximum zoom level that a marker can be part of a cluster.')} ${$HR(ZOOM_LEVEL_TOOLTIP)}`;
    body.append(clustering);
    this.select(body, 'config.defaults.maxAllowedFeatures', 'Maximum allowed features', [
      ['500', '500'], ['1000', '1,000'], ['2000', '2,000'], ['5000', '5,000']
    ], { kind: 'positive-int' });
    this.select(body, 'config.defaults.popupTemplate', 'Popup template', [
      ['standard', 'Standard'],
      ['minimal', 'Minimal'],
      ['none', 'None']
    ], { advanced: true });
    void this.loadReportTemplates();
  }

  /**
   * Populate the popup-template `<select>` with report templates from the provider,
   * preserving the currently stored value even if it is not among the loaded choices.
   *
   * @returns {Promise<void>} Resolves once the options have been populated (or on early return).
   */
  async loadReportTemplates() {
    const field = this.fields.get('config.defaults.popupTemplate');
    const control = field?.control;
    if (!control || !this.reportTemplateProvider?.isConfigured?.()) return;
    try {
      const templates = await this.reportTemplateProvider.list();
      if (!this.form || !control.isConnected) return;
      const current = getPath(this.value, 'config.defaults.popupTemplate');
      control.replaceChildren();
      for (const [value, label] of [['standard', 'Standard'], ['minimal', 'Minimal'], ['none', 'None']]) {
        const option = document.createElement('option');
        option.value = value;
        option.className = 'h-i18n';
        option.textContent = label;
        control.append(option);
      }
      for (const item of templates) {
        if (['standard', 'minimal', 'none'].includes(String(item.value || '').trim().toLowerCase())) continue;
        const option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        control.append(option);
      }
      if (current && ![...control.options].some((option) => option.value === String(current))) {
        const option = document.createElement('option');
        option.value = String(current);
        option.textContent = String(current);
        control.append(option);
      }
      control.value = current == null || current === '' ? 'standard' : String(current);
      applyI18n(control);
    } catch (error) {
      // Template discovery is configuration assistance only; keep the current
      // value usable even if the legacy ReportController is unavailable.
      const current = getPath(this.value, 'config.defaults.popupTemplate');
      if (current && ![...control.options].some((option) => option.value === String(current))) {
        const option = document.createElement('option');
        option.value = String(current);
        option.textContent = String(current);
        control.append(option);
        control.value = String(current);
      }
    }
  }

  /**
   * Build the "Map documents" section's fields (allowed MapDocuments, default document).
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildMapDocuments(body) {
    this.transferList(body, 'options.mapDocuments.allowed', 'Allowed MapDocuments', [], {
      kind: 'multi-number',
      defaultLabel: 'Allow all MapDocuments',
      defaultValues: 'all',
      onChange: () => this.refreshMapDocumentDefaultChoices()
    });
    this.select(body, 'options.mapDocuments.initiallyActive', 'Default document', [
      ['', 'Workspace/Filtered Result']
    ], { kind: 'identifier-select' });
    void this.loadMapDocumentChoices();
  }

  /**
   * Build the "Base maps" section's fields (allowed base maps, initial base map).
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildBaseMaps(body) {
    // Configuration deliberately exposes the Heurist-curated list only. The full
    // leaflet-providers catalogue remains available to the Leaflet adapter, but is
    // not presented here as an end-user configuration list.
    const choices = getDefaultBaseMaps().map((item) => [String(item.id), item.title || item.id]);
    this.transferList(body, 'options.baseMaps.allowed', 'Allowed base maps', choices, {
      kind: 'multi-string',
      defaultLabel: 'All Heurist base maps',
      defaultValues: this.defaultBaseMapIds,
      fixedSelectedValues: ['None'],
      availableNotice: {
        text: 'Email team for other base maps',
        href: 'https://leaflet-extras.github.io/leaflet-providers/preview/index.html'
      },
      onChange: () => this.refreshBaseMapInitialChoices()
    });
    this.select(body, 'options.baseMaps.initial', 'Initial base map', [], { kind: 'string-null-select' });
    this.refreshBaseMapInitialChoices();
  }

  /**
   * Load the available MapDocuments from the provider and populate the
   * allowed-MapDocuments transfer list and default-document choices.
   *
   * @returns {Promise<void>} Resolves once the choices have been populated (or on early return).
   */
  async loadMapDocumentChoices() {
    if (!this.mapDocumentListProvider) return;
    try {
      const result = await this.mapDocumentListProvider.search();
      if (!this.form) return;
      const choices = (result.items || []).map((item) => [String(item.id), item.title || `Map document ${item.id}`]);
      this.replaceTransferChoices('options.mapDocuments.allowed', choices);
      this.populateField('options.mapDocuments.allowed');
      this.refreshMapDocumentDefaultChoices();
      this.populateField('options.mapDocuments.initiallyActive');
      applyI18n(this.form);
    } catch (error) {
      this.showError(`${$HR('Cannot load MapDocument list:')} ${error?.message || String(error)}`);
    }
  }

  /**
   * Refresh the "Default document" choices to match the currently allowed MapDocuments.
   *
   * @returns {void}
   */
  refreshMapDocumentDefaultChoices() {
    const field = this.fields.get('options.mapDocuments.allowed');
    if (!field) return;
    const values = this.getTransferAllowedValues(field);
    const choices = values.map((value) => [value, this.transferChoiceLabel(field, value)]);
    this.replaceConstrainedSelectChoices(
      'options.mapDocuments.initiallyActive',
      [['', 'Workspace/Filtered Result'], ...choices]
    );
  }

  /**
   * Refresh the "Initial base map" choices to match the currently allowed base maps,
   * preserving the current selection when it is still valid.
   *
   * @returns {void}
   */
  refreshBaseMapInitialChoices() {
    const field = this.fields.get('options.baseMaps.allowed');
    if (!field) return;
    const values = this.getTransferAllowedValues(field);
    const choices = values.map((value) => [value, this.transferChoiceLabel(field, value)]);
    const initialField = this.fields.get('options.baseMaps.initial');
    const current = initialField?.control?.value || '';
    this.replaceSelectChoices('options.baseMaps.initial', choices);
    if (initialField?.control) {
      initialField.control.value = choices.some(([value]) => String(value) === String(current))
        ? current
        : (choices[0]?.[0] ?? '');
    }
  }

  /**
   * Build the "Interface" section's fields (Heurist control visibility toggles,
   * native Leaflet control toggles, and legacy hidden/internal controls).
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildInterface(body) {
    const controls = document.createElement('fieldset');
    controls.className = 'heurist-map-config-group heurist-map-config-controls-group';
    controls.append(legend('Map Controls'));

    const heuristSection = document.createElement('div');
    heuristSection.className = 'heurist-map-config-control-section';
    const masterRow = this.checkbox(heuristSection, 'options.ui.enabled', 'Heurist Map Controls');
    const masterControl = this.fields.get('options.ui.enabled')?.control;

    const primary = document.createElement('div');
    primary.className = 'heurist-map-config-inline-checks';
    this.checkbox(primary, 'options.ui.showCurrentDocument', 'Workspace/Filtered Result');
    this.checkbox(primary, 'options.ui.showMapDocuments', 'Map documents');
    this.checkbox(primary, 'options.ui.showBaseMaps', 'Base maps');
    heuristSection.append(primary);

    this.checkbox(heuristSection, 'options.ui.initiallyExpanded', 'Initially expanded');
    const sourceHeader = this.checkbox(heuristSection, 'options.ui.showSourceHeader', 'Header');
    sourceHeader.title = $HR('Show a header above the map with the active map document title.');

    const secondary = document.createElement('div');
    secondary.className = 'heurist-map-config-inline-checks';
    this.checkbox(secondary, 'options.ui.showHomeControl', 'Home');
    this.checkbox(secondary, 'options.ui.showOptions', 'Options');
    this.checkbox(secondary, 'options.ui.showPublish', 'Publish');
    heuristSection.append(secondary);

    const nativeSection = document.createElement('div');
    nativeSection.className = 'heurist-map-config-control-section heurist-map-config-native-controls';
    nativeSection.append(sectionTitle('Native Map Controls'));

    const native = document.createElement('div');
    native.className = 'heurist-map-config-inline-checks';
    this.checkbox(native, 'options.nativeControls.zoom', 'Zoom');
    this.checkbox(native, 'options.nativeControls.scale', 'Scale');
    this.checkbox(native, 'options.nativeControls.bookmark', 'Bookmark');
    this.checkbox(native, 'options.nativeControls.print', 'Print');
    const selectorRow = this.checkbox(native, 'options.nativeControls.selector', 'Selector');
    this.checkbox(native, 'options.nativeControls.search', 'Search');
    const selectorControl = this.fields.get('options.nativeControls.selector')?.control;
    if (selectorControl) {
      selectorControl.disabled = true;
      selectorRow.title = $HR('Feature area selector will be implemented with Leaflet.draw in a later step.');
    }
    nativeSection.append(native);

    // Existing hidden/internal controls remain persisted for compatibility.
    this.checkbox(controls, 'options.ui.showLegend', 'Legend', { hidden: true });
    this.checkbox(controls, 'options.ui.showLayers', 'Show layers', { hidden: true });
    this.select(controls, 'options.ui.placement', 'Control placement', [
      ['overlay', 'Overlay'], ['side', 'Side panel']
    ], { hidden: true });
    this.select(controls, 'options.ui.position', 'Control position', [
      ['top-left', 'Top left'], ['top-right', 'Top right'],
      ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right']
    ], { hidden: true });
    // Remove hidden:true to enable direct Map Control style definitions.
    this.textarea(controls, 'options.ui.controlCss', 'CSS for Map Control', { hidden: true });

    controls.append(heuristSection, nativeSection);
    body.append(controls);

    if (masterControl) {
      masterControl.addEventListener('change', () => this.updateHeuristControlState());
      masterRow.classList.add('heurist-map-config-master-control');
    }
  }

  /**
   * Disable the Heurist control-panel sub-options while the master
   * "Heurist Map Controls" checkbox is unchecked.
   *
   * @returns {void}
   */
  updateHeuristControlState() {
    const master = this.fields.get('options.ui.enabled')?.control;
    if (!master) return;
    const disabled = master.checked !== true;
    for (const path of [
      'options.ui.showCurrentDocument',
      'options.ui.showMapDocuments',
      'options.ui.showBaseMaps',
      'options.ui.initiallyExpanded',
      'options.ui.showHomeControl',
      'options.ui.showOptions',
      'options.ui.showPublish',
      'options.ui.showSourceHeader'
    ]) {
      const control = this.fields.get(path)?.control;
      if (control) control.disabled = disabled
        || (this.mode === 'website' && ['options.ui.showOptions', 'options.ui.showPublish'].includes(path));
    }
  }

  /**
   * Force the Options/Publish controls off and disabled in website mode, since
   * a website embed never shows the preferences/publish icons.
   *
   * @returns {void}
   */
  applyModeControlState() {
    if (this.mode !== 'website') return;
    for (const path of ['options.ui.showOptions', 'options.ui.showPublish']) {
      const control = this.fields.get(path)?.control;
      if (control) {
        control.checked = false;
        control.disabled = true;
      }
    }
  }

  /**
   * Build the "Interaction" section's fields (readonly, selection, popups, zoom-on-select).
   *
   * @param {HTMLElement} body Section body to append fields into.
   * @returns {void}
   */
  buildInteraction(body) {
    this.checkbox(body, 'options.interaction.readonly', 'Readonly');
    this.checkbox(body, 'options.interaction.selectionEnabled', 'Enable selection');
    this.checkbox(body, 'options.interaction.popupEnabled', 'Enable popups');
    this.checkbox(body, 'options.interaction.zoomOnSelection', 'Zoom on selection');
  }

  /**
   * Build a zoom-limit field row that lets the admin choose between native zoom
   * levels and kilometre-based distances, registering both representations.
   *
   * @param {HTMLElement} body Section body to append the row into.
   * @param {string} prefix Settings path prefix (`minZoom`/`maxZoom`/`minimumZoomKm`/`maximumZoomKm` are appended).
   * @param {Object} [options={}] Field options.
   * @param {boolean} [options.allAdvanced=false] Mark the whole row as an advanced setting.
   * @returns {void}
   */
  zoomFields(body, prefix, options = {}) {
    const row = document.createElement('div');
    row.className = 'heurist-map-config-zoom-row';
    if (options.allAdvanced === true) this.markAdvanced(row);
    const levelIn = this.select(row, `${prefix}.maxZoom`, 'Zoom In', zoomLevelChoices(true), { kind: 'number-null' });
    const levelOut = this.select(row, `${prefix}.minZoom`, 'Zoom Out', zoomLevelChoices(true), { kind: 'number-null' });
    levelIn.title = levelOut.title = $HR(ZOOM_LEVEL_TOOLTIP);
    const kmIn = this.number(row, `${prefix}.minimumZoomKm`, 'Zoom In', { min: 0, compact: true });
    const kmOut = this.number(row, `${prefix}.maximumZoomKm`, 'Zoom Out', { min: 0, compact: true });
    const modes = radioChoice(`${prefix}-zoom-mode`, [['level', 'Level'], ['km', 'Km']]);
    row.append(modes.element);
    const update = (clearInactive = false) => {
      const useLevels = modes.value() === 'level';
      levelIn.hidden = levelOut.hidden = !useLevels;
      kmIn.hidden = kmOut.hidden = useLevels;
      if (clearInactive) {
        for (const fieldRow of (useLevels ? [kmIn, kmOut] : [levelIn, levelOut])) {
          fieldRow.querySelector('input,select').value = '';
        }
      }
    };
    modes.element.addEventListener('change', () => update(true));
    const hasKm = getPath(this.value, `${prefix}.minimumZoomKm`) != null
      || getPath(this.value, `${prefix}.maximumZoomKm`) != null;
    modes.set(hasKm ? 'km' : 'level');
    update();
    body.append(row);
  }

  /**
   * Build a read-only extent display row with a "Define" button that opens the
   * host bounds editor, registering four hidden `west`/`south`/`east`/`north` fields.
   *
   * @param {HTMLElement} body Section body to append the row into.
   * @param {string} prefix Settings path prefix (`west`/`south`/`east`/`north` are appended).
   * @param {Object} [options={}] Field options.
   * @param {boolean} [options.advanced] Mark the row as an advanced setting.
   * @returns {void}
   */
  boundsFields(body, prefix, options = {}) {
    const row = document.createElement('div');
    row.className = 'heurist-map-config-field heurist-map-config-bounds';
    if (options.advanced) this.markAdvanced(row);
    const caption = document.createElement('span');
    caption.className = 'h-i18n';
    caption.textContent = 'Extent';
    const display = document.createElement('input');
    display.type = 'text';
    display.readOnly = true;
    display.placeholder = $HR('south,west - north,east');
    for (const key of ['west', 'south', 'east', 'north']) {
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      this.register(`${prefix}.${key}`, hidden, 'number-null');
      this.fields.get(`${prefix}.${key}`).onPopulate = () => refreshExtentDisplay(display, this.fields, prefix);
    }
    const define = button('Define', 'Define map extent', async () => {
      if (!this.onEditExtent) return;
      try {
        const result = await this.withHostEditor(() => this.onEditExtent(readBoundsFields(this.fields, prefix), { path: prefix, mode: this.mode }));
        if (result) writeBoundsFields(this.fields, prefix, result, display);
      } catch (error) {
        this.showError(error?.message || String(error));
      }
    });
    define.disabled = !this.onEditExtent;
    row.append(caption, display, define);
    body.append(row);
  }

  /**
   * Build a collapsible `<details>` section and populate its body via `build`.
   *
   * @param {string} title Section title (localized `<summary>` text).
   * @param {Function} build Called with the section's body element to append fields into.
   * @param {Object} [options={}] Section options.
   * @param {boolean} [options.open=false] Whether the section starts expanded.
   * @param {boolean} [options.advanced] Mark the whole section as an advanced setting.
   * @returns {HTMLElement} The generated `<details>` element.
   */
  section(title, build, options = {}) {
    const details = document.createElement('details');
    details.className = 'heurist-map-config-section';
    details.open = options.open === true;
    if (options.advanced) this.markAdvanced(details);
    const summary = document.createElement('summary');
    summary.className = 'h-i18n';
    summary.textContent = title;
    const body = document.createElement('div');
    body.className = 'heurist-map-config-section-body';
    build(body);
    details.append(summary, body);
    return details;
  }

  /**
   * Build and register a labeled checkbox field row.
   *
   * @param {HTMLElement} body Element to append the row into.
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @param {Object} [options={}] Field options (`advanced`, `hidden`).
   * @returns {HTMLElement} The generated row element.
   */
  checkbox(body, path, labelText, options = {}) {
    const row = document.createElement('label');
    row.className = 'heurist-map-config-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    this.register(path, input, 'boolean');
    row.append(input, i18nText(labelText));
    this.decorate(row, options);
    body.append(row);
    return row;
  }

  /**
   * Build and register a labeled `<select>` field row.
   *
   * @param {HTMLElement} body Element to append the row into.
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @param {Array<[*, string]>} choices Option `[value, label]` pairs.
   * @param {Object} [options={}] Field options (`kind` registration type, `advanced`, `hidden`).
   * @returns {HTMLElement} The generated row element.
   */
  select(body, path, labelText, choices, options = {}) {
    const { row, control } = labelledControl('select', labelText);
    for (const [value, text] of choices) {
      const option = document.createElement('option');
      option.value = value;
      option.className = 'h-i18n';
      option.textContent = text;
      control.append(option);
    }
    this.register(path, control, options.kind || 'string');
    this.decorate(row, options);
    body.append(row);
    return row;
  }

  /**
   * Build and register a dual-list "available/selected" transfer control, with an
   * optional "use default list" checkbox that hides the lists while checked.
   *
   * @param {HTMLElement} body Element to append the row into.
   * @param {string} path Dot-separated settings path (bound to the "selected" list, `null` means use defaults).
   * @param {string} labelText Field label.
   * @param {Array<[*, string]>} choices Initial choice `[value, label]` pairs.
   * @param {Object} [options={}] Field options.
   * @param {string} [options.kind='multi-string'] Registration kind (`multi-string` or `multi-number`).
   * @param {string} [options.defaultLabel='Use default list'] Label for the "use default" checkbox.
   * @param {*} [options.defaultValues] Default values used when the checkbox is checked (`'all'` or an array).
   * @param {Array<*>} [options.fixedSelectedValues] Values that are always selected and cannot be removed.
   * @param {{text: string, href: string}} [options.availableNotice] Optional link shown under the available list.
   * @param {Function} [options.onChange] Called whenever the selected values change.
   * @param {boolean} [options.advanced] Mark the row as an advanced setting.
   * @returns {HTMLElement} The generated row element.
   */
  transferList(body, path, labelText, choices, options = {}) {
    const row = document.createElement('div');
    row.className = 'heurist-map-config-field heurist-map-config-transfer-field';
    const caption = document.createElement('span');
    caption.className = 'h-i18n';
    caption.textContent = labelText;

    const content = document.createElement('div');
    content.className = 'heurist-map-config-transfer-content';

    const toggle = document.createElement('label');
    toggle.className = 'heurist-map-config-check heurist-map-config-list-default';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    toggle.append(checkbox, i18nText(options.defaultLabel || 'Use default list'));

    const lists = document.createElement('div');
    lists.className = 'heurist-map-config-transfer-lists';
    const availableColumn = transferColumn('Available');
    const selectedColumn = transferColumn('Selected');
    lists.append(availableColumn.column, selectedColumn.column);

    if (options.availableNotice?.text && options.availableNotice?.href) {
      const notice = document.createElement('a');
      notice.className = 'heurist-map-config-list-notice';
      notice.classList.add('h-i18n');
      notice.textContent = options.availableNotice.text;
      notice.href = options.availableNotice.href;
      notice.target = '_blank';
      notice.rel = 'noopener noreferrer';
      availableColumn.column.append(notice);
    }

    content.append(toggle, lists);
    row.append(caption, content);

    const field = {
      control: selectedColumn.select,
      availableControl: availableColumn.select,
      selectedControl: selectedColumn.select,
      listContainer: lists,
      kind: options.kind || 'multi-string',
      defaultToggle: checkbox,
      defaultValues: options.defaultValues || null,
      fixedSelectedValues: new Set((options.fixedSelectedValues || []).map(String)),
      choices: normalizeChoices(choices),
      onChange: typeof options.onChange === 'function' ? options.onChange : null
    };
    selectedColumn.select.dataset.configPath = path;
    this.fields.set(path, field);

    const transfer = (source, add) => {
      const option = source.selectedOptions?.[0];
      if (!option) return;
      const selected = new Set(this.getTransferSelectedValues(field));
      if (add) {
        selected.add(option.value);
      } else if (!field.fixedSelectedValues.has(String(option.value))) {
        selected.delete(option.value);
      }
      this.renderTransferField(field, [...selected]);
      field.onChange?.();
    };
    availableColumn.select.addEventListener('click', () => transfer(availableColumn.select, true));
    selectedColumn.select.addEventListener('click', () => transfer(selectedColumn.select, false));

    checkbox.addEventListener('change', () => {
      // Unchecking starts the curated list from scratch: nothing pre-selected,
      // full choice list moved into Available for the admin to pick from.
      this.renderTransferField(field, checkbox.checked ? this.getTransferDefaultValues(field) : []);
      lists.hidden = checkbox.checked;
      field.onChange?.();
    });

    this.decorate(row, options);
    body.append(row);
    return row;
  }

  /**
   * Replace a transfer field's available choices while preserving the current selection.
   *
   * @param {string} path Dot-separated settings path of a transfer field.
   * @param {Array<[*, string]>} choices Replacement choice `[value, label]` pairs.
   * @returns {void}
   */
  replaceTransferChoices(path, choices) {
    const field = this.fields.get(path);
    if (!field?.selectedControl) return;
    const selected = this.getTransferSelectedValues(field);
    field.choices = normalizeChoices(choices);
    this.renderTransferField(field, selected);
  }

  /**
   * Redistribute a transfer field's choices between its available/selected `<select>`s.
   *
   * @param {Object} field Registered transfer field.
   * @param {Array<*>} selectedValues Values that should render in the "selected" list.
   * @returns {void}
   */
  renderTransferField(field, selectedValues) {
    const selected = new Set((selectedValues || []).map(String));
    for (const value of field.fixedSelectedValues || []) selected.add(String(value));
    const known = new Set(field.choices.map(([value]) => String(value)));
    const choices = [...field.choices];

    // Preserve already-stored custom/legacy values even when they are no longer
    // offered in the Available list. They remain removable from Selected.
    for (const value of selected) {
      if (!known.has(value)) choices.push([value, value]);
    }

    field.availableControl.replaceChildren();
    field.selectedControl.replaceChildren();
    for (const [rawValue, label] of choices) {
      const value = String(rawValue);
      const option = document.createElement('option');
      option.value = value;
      option.className = 'h-i18n';
      option.textContent = $HR(label);
      if (selected.has(value) && field.fixedSelectedValues?.has(value)) {
        option.disabled = true;
        option.title = $HR('Always available');
      }
      (selected.has(value) ? field.selectedControl : field.availableControl).append(option);
    }
  }

  /**
   * Resolve the values a transfer field's "use default list" checkbox represents.
   *
   * @param {Object} field Registered transfer field.
   * @returns {Array<string>} Default values (`'all'` choices, an explicit array, or empty).
   */
  getTransferDefaultValues(field) {
    if (field.defaultValues === 'all') return field.choices.map(([value]) => String(value));
    if (Array.isArray(field.defaultValues)) return field.defaultValues.map(String);
    return [];
  }

  /**
   * Read the values currently shown in a transfer field's "selected" list.
   *
   * @param {Object} field Registered transfer field.
   * @returns {Array<string>} Currently selected values.
   */
  getTransferSelectedValues(field) {
    return [...(field.selectedControl?.options || [])].map((option) => option.value);
  }

  /**
   * Resolve a transfer field's effective allowed values (defaults when the
   * "use default list" checkbox is checked, otherwise the explicit selection).
   *
   * @param {Object} field Registered transfer field.
   * @returns {Array<string>} Effective allowed values.
   */
  getTransferAllowedValues(field) {
    return field.defaultToggle?.checked
      ? this.getTransferDefaultValues(field)
      : this.getTransferSelectedValues(field);
  }

  /**
   * Resolve the display label for one transfer field choice value.
   *
   * @param {Object} field Registered transfer field.
   * @param {*} value Choice value to look up.
   * @returns {string} The choice's label, or `value` stringified when not found.
   */
  transferChoiceLabel(field, value) {
    const found = field.choices.find(([candidate]) => String(candidate) === String(value));
    return found ? found[1] : String(value);
  }

  /**
   * Replace a plain `<select>` field's choices while preserving the current
   * selection when it remains valid, otherwise falling back to no selection.
   *
   * @param {string} path Dot-separated settings path of a select field.
   * @param {Array<[*, string]>} choices Replacement choice `[value, label]` pairs.
   * @returns {void}
   */
  replaceConstrainedSelectChoices(path, choices) {
    const field = this.fields.get(path);
    if (!field?.control) return;
    const current = field.control.value;
    this.replaceSelectChoices(path, choices);
    field.control.value = [...field.control.options].some((option) => option.value === current)
      ? current
      : '';
  }

  /**
   * Replace a plain `<select>` field's `<option>`s.
   *
   * @param {string} path Dot-separated settings path of a select field.
   * @param {Array<[*, string]>} choices Replacement choice `[value, label]` pairs.
   * @returns {void}
   */
  replaceSelectChoices(path, choices) {
    const field = this.fields.get(path);
    if (!field?.control) return;
    field.control.replaceChildren();
    for (const [value, text] of choices) {
      const option = document.createElement('option');
      option.value = value;
      option.className = 'h-i18n';
      option.textContent = $HR(text);
      field.control.append(option);
    }
  }

  /**
   * Build and register a labeled text `<input>` field row.
   *
   * @param {HTMLElement} body Element to append the row into.
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @param {Object} [options={}] Field options (`placeholder`, `kind`, `advanced`, `hidden`).
   * @returns {HTMLElement} The generated row element.
   */
  text(body, path, labelText, options = {}) {
    const { row, control } = labelledControl('input', labelText);
    control.type = 'text';
    if (options.placeholder) control.placeholder = $HR(options.placeholder);
    this.register(path, control, options.kind || 'string-null');
    this.decorate(row, options);
    body.append(row);
    return row;
  }

  /**
   * Build and register a labeled `<textarea>` field row.
   *
   * @param {HTMLElement} body Element to append the row into.
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @param {Object} [options={}] Field options (`advanced`, `hidden`).
   * @returns {HTMLElement} The generated row element.
   */
  textarea(body, path, labelText, options = {}) {
    const { row, control } = labelledControl('textarea', labelText);
    control.rows = 3;
    this.register(path, control, 'string-null');
    this.decorate(row, options);
    body.append(row);
    return row;
  }

  /**
   * Build and register a labeled JSON-editing `<textarea>` field row.
   *
   * @param {HTMLElement} body Element to append the row into.
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @param {Object} [options={}] Field options (`advanced`, `hidden`).
   * @returns {HTMLElement} The generated row element.
   */
  json(body, path, labelText, options = {}) {
    const { row, control } = labelledControl('textarea', labelText);
    control.rows = 3;
    control.placeholder = $HR('JSON (optional)');
    this.register(path, control, 'json');
    this.decorate(row, options);
    body.append(row);
    return row;
  }

  /**
   * Build and register a symbology field: a live preview, Edit/Show raw/Clear
   * links, and a hidden raw-JSON textarea kept in sync with the edited value.
   *
   * @param {HTMLElement} body Element to append the row into.
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @param {Object} [options={}] Field options.
   * @param {boolean} [options.selection=false] Whether this edits a selection symbology
   *        (passed through to `onEditSymbology`).
   * @param {boolean} [options.advanced] Mark the row as an advanced setting.
   * @returns {HTMLElement} The generated row element.
   */
  symbology(body, path, labelText, options = {}) {
    const row = document.createElement('div');
    row.className = 'heurist-map-config-field heurist-map-config-symbology-field';

    const label = document.createElement('span');
    label.className = 'h-i18n';
    label.textContent = labelText;

    const content = document.createElement('div');
    content.className = 'heurist-map-config-symbology-content';
    const previewHost = document.createElement('span');
    previewHost.className = 'heurist-map-config-symbology-preview';

    const links = document.createElement('span');
    links.className = 'heurist-map-config-symbology-links';

    const raw = document.createElement('textarea');
    raw.rows = 3;
    raw.placeholder = $HR('Default');
    raw.className = 'heurist-map-config-symbology-raw';
    raw.hidden = true;
    this.register(path, raw, 'json');

    const refreshPreview = (value = null) => {
      let symbol = value;
      if (symbol == null) {
        try { symbol = raw.value.trim() ? JSON.parse(raw.value) : null; } catch { return; }
      }
      if (symbol?.symbol && Array.isArray(symbol?.thematic)) symbol = symbol.symbol;
      // Configuration stores sparse overrides. Preview the effective symbol so
      // inherited built-in values (including fillOpacity) are visible exactly as
      // they will be rendered on the map.
      const effectiveSymbol = normalizeMapSymbol(symbol || {}, DEFAULT_MAP_SYMBOL);
      previewHost.replaceChildren(createSymbolPreview(effectiveSymbol));
      previewHost.classList.toggle('is-default', !symbol);
    };
    this.fields.get(path).onPopulate = refreshPreview;

    const edit = linkButton('Edit', `${$HR('Edit')} ${$HR(labelText).toLowerCase()}`, async () => {
      if (!this.onEditSymbology) return;
      try {
        const current = getPath(this.readForm(), path);
        const result = await this.withHostEditor(() => this.onEditSymbology(current, {
          path,
          selection: options.selection === true,
          mode: this.mode,
          // Configuration-level symbols inherit directly from the built-in map symbol.
          parentSymbol: normalizeMapSymbol({}, DEFAULT_MAP_SYMBOL)
        }));
        if (result == null) return;
        setPath(this.value, path, clone(result));
        raw.value = JSON.stringify(result, null, 2);
        refreshPreview(result);
      } catch (error) {
        this.showError(error?.message || String(error));
      }
    });
    edit.disabled = !this.onEditSymbology;

    const toggleRaw = linkButton('Show raw', `${$HR('Show or hide raw')} ${$HR(labelText).toLowerCase()}`, () => {
      raw.hidden = !raw.hidden;
      toggleRaw.textContent = $HR(raw.hidden ? 'Show raw' : 'Hide raw');
    });

    const clear = linkButton('×', `${$HR('Clear')} ${$HR(labelText).toLowerCase()}`, () => {
      setPath(this.value, path, null);
      raw.value = '';
      refreshPreview(null);
    });
    clear.classList.add('heurist-map-config-symbology-clear');

    raw.addEventListener('input', () => refreshPreview());
    links.append(edit, toggleRaw, clear);
    content.append(previewHost, links, raw);
    row.append(label, content);
    this.decorate(row, options);
    body.append(row);
    return row;
  }

  /**
   * Build and register a labeled numeric `<input>` field row.
   *
   * @param {HTMLElement} body Element to append the row into.
   * @param {string} path Dot-separated settings path.
   * @param {string} labelText Field label.
   * @param {Object} [options={}] Field options (`step`, `min`, `max`, `compact`, `advanced`, `hidden`).
   * @returns {HTMLElement} The generated row element.
   */
  number(body, path, labelText, options = {}) {
    const { row, control } = labelledControl('input', labelText);
    control.type = 'number';
    control.step = options.step ?? 'any';
    if (options.min !== undefined) control.min = String(options.min);
    if (options.max !== undefined) control.max = String(options.max);
    if (options.compact) row.classList.add('compact');
    this.register(path, control, path.endsWith('maxAllowedFeatures') ? 'positive-int' : 'number-null');
    this.decorate(row, options);
    body.append(row);
    return row;
  }

  /**
   * Apply the common `advanced`/`hidden` field-row options.
   *
   * @param {HTMLElement} element Field row element.
   * @param {Object} [options={}] Field options (`advanced`, `hidden`).
   * @returns {void}
   */
  decorate(element, options = {}) {
    if (options.advanced) this.markAdvanced(element);
    if (options.hidden) element.hidden = true;
  }

  /**
   * Mark an element as an advanced-only setting, toggled by {@link MapConfigurationDialog#updateAdvancedVisibility}.
   *
   * @param {HTMLElement} element Element to mark.
   * @returns {HTMLElement} `element`, unchanged.
   */
  markAdvanced(element) {
    element.dataset.advancedSetting = '1';
    return element;
  }

  /**
   * Show or hide every advanced-marked element according to `this.advanced`.
   *
   * @returns {void}
   */
  updateAdvancedVisibility() {
    if (!this.form) return;
    for (const element of this.form.querySelectorAll('[data-advanced-setting="1"]')) {
      element.hidden = !this.advanced;
    }
  }

  /**
   * Record a field's control under its settings path.
   *
   * @param {string} path Dot-separated settings path.
   * @param {HTMLElement} control Field's input/select/textarea control.
   * @param {string} kind Field value kind (see {@link readControl}).
   * @returns {void}
   */
  register(path, control, kind) {
    control.dataset.configPath = path;
    this.fields.set(path, { control, kind });
  }

  /**
   * Populate every registered field's control from the current settings value.
   *
   * @returns {void}
   */
  populate() {
    for (const path of this.fields.keys()) this.populateField(path);
    this.updateHeuristControlState();
  }

  /**
   * Populate one registered field's control from the current settings value.
   *
   * @param {string} path Dot-separated settings path.
   * @returns {void}
   */
  populateField(path) {
    const field = this.fields.get(path);
    if (!field) return;
    const current = getPath(this.value, path);
    if (field.kind === 'boolean') {
      field.control.checked = current === true;
    } else if (field.kind === 'json') {
      field.control.value = current == null ? '' : JSON.stringify(current, null, 2);
    } else if (field.kind === 'multi-number' || field.kind === 'multi-string') {
      const useDefault = current == null;
      if (field.defaultToggle) field.defaultToggle.checked = useDefault;
      const selected = Array.isArray(current) ? current.map(String) : this.getTransferDefaultValues(field);
      this.renderTransferField(field, selected);
      if (field.listContainer) field.listContainer.hidden = useDefault;
      field.onChange?.();
    } else if (field.kind === 'identifier-select' || field.kind === 'string-null-select') {
      if (path === 'options.baseMaps.initial' && current == null) {
        field.control.value = field.control.options[0]?.value || '';
      } else {
        field.control.value = current == null || current === 'dynamic' ? '' : String(current);
      }
    } else if (field.kind.startsWith('list-')) {
      field.control.value = Array.isArray(current) ? current.join(', ') : '';
    } else {
      field.control.value = current == null || current === '' ? 'standard' : String(current);
    }
    field.onPopulate?.(current);
  }

  /**
   * Read every registered field's current control value into a settings object.
   *
   * @returns {Object} Settings object with every registered path updated from the form.
   * @throws {Error} When a `json`-kind field contains invalid JSON.
   */
  readForm() {
    // Start from the current normalized value so publish mode can render only
    // Interface/Publication without discarding settings from hidden sections.
    const result = clone(this.value);
    for (const [path, field] of this.fields) setPath(result, path, readControl(field, path));
    return result;
  }

  /**
   * Run a host editor callback while the dialog is temporarily closed, so
   * legacy editors (which live outside the browser top layer) stay usable,
   * then reopen the dialog and restore focus.
   *
   * @param {Function} edit Async callback invoked while the dialog is closed.
   * @returns {Promise<*>} Resolves with `edit`'s result.
   */
  async withHostEditor(edit) {
    // Legacy host editors live outside the browser top layer. Suspend modality
    // while they run so they remain visible and interactive.
    const dialog = this.dialog;
    const focus = document.activeElement;
    dialog?.close();
    try { return await edit(); }
    finally {
      if (this.dialog === dialog && dialog?.isConnected) {
        dialog.showModal();
        if (focus?.isConnected) focus.focus();
      }
    }
  }

  /**
   * Show a modal error message dialog.
   *
   * @param {string} message Error message to display.
   * @returns {void}
   */
  showError(message) {
    if (!this.form) return;
    const content = document.createElement('span');
    content.textContent = message;
    HMsg.showMsgErr(content, { title: 'Map configuration error' });
  }
}

/**
 * Read one registered field's control value, coerced according to its registered `kind`.
 *
 * @param {Object} field Registered field.
 * @param {string} path Dot-separated settings path (used only in the JSON-parse error message).
 * @returns {*} The field's coerced value.
 * @throws {Error} When a `json`-kind field contains invalid JSON.
 */
function readControl(field, path) {
  const control = field.control;
  if (field.kind === 'boolean') return control.checked;
  if (field.kind === 'multi-number' || field.kind === 'multi-string') {
    if (field.defaultToggle?.checked) return null;
    const values = [...(field.selectedControl?.options || [])].map((option) => option.value);
    return field.kind === 'multi-number' ? values.map(Number).filter((value) => Number.isInteger(value) && value > 0) : values;
  }
  const text = control.value.trim();
  if (field.kind === 'number-null') return text === '' ? null : Number(text);
  if (field.kind === 'positive-int') return text === '' ? null : Number.parseInt(text, 10);
  if (field.kind === 'json') {
    if (!text) return null;
    try { return JSON.parse(text); } catch { throw new Error(`Invalid JSON in ${path}`); }
  }
  if (field.kind === 'list-number') {
    if (!text) return null;
    return text.split(',').map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0);
  }
  if (field.kind === 'list-string') {
    if (!text) return null;
    return text.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (field.kind === 'identifier-select') return text ? Number(text) : null;
  if (field.kind === 'string-null-select') return text || null;
  if (field.kind === 'identifier') {
    if (!text) return null;
    return text === 'dynamic' ? 'dynamic' : Number(text);
  }
  return text || null;
}

/**
 * Build one column (heading + multi-line `<select>`) of a transfer-list control.
 *
 * @param {string} title Column heading text.
 * @returns {{column: HTMLElement, select: HTMLSelectElement}} The column element and its `<select>`.
 */
function transferColumn(title) {
  const column = document.createElement('div');
  column.className = 'heurist-map-config-transfer-column';
  const heading = document.createElement('div');
  heading.className = 'heurist-map-config-transfer-title h-i18n';
  heading.textContent = title;
  const select = document.createElement('select');
  select.size = 8;
  column.append(heading, select);
  return { column, select };
}

/**
 * Normalize a choice list to `[String(value), String(label)]` pairs.
 *
 * @param {*} choices Candidate choice list.
 * @returns {Array<[string, string]>} Normalized choice pairs.
 */
function normalizeChoices(choices) {
  return (Array.isArray(choices) ? choices : []).map(([value, label]) => [String(value), String(label ?? value)]);
}

/**
 * Build a labeled field row wrapping one input/select/textarea control.
 *
 * @param {string} tag Control tag name (`'input'`, `'select'`, `'textarea'`).
 * @param {string} labelText Field label.
 * @returns {{row: HTMLElement, control: HTMLElement}} The row element and its control.
 */
function labelledControl(tag, labelText) {
  const row = document.createElement('label');
  row.className = 'heurist-map-config-field';
  const caption = document.createElement('span');
  caption.className = 'h-i18n';
  caption.textContent = labelText;
  const control = document.createElement(tag);
  row.append(caption, control);
  return { row, control };
}

/** Build a `<legend>` element for a fieldset. */
function legend(text) { const item = document.createElement('legend'); item.className = 'h-i18n'; item.textContent = text; return item; }

/** Build a section-title `<div>` used above a group of native controls. */
function sectionTitle(text) { const item = document.createElement('div'); item.className = 'heurist-map-config-control-section-title h-i18n'; item.textContent = text; return item; }

/**
 * Build the dialog's displayed title, appending the module version when available.
 *
 * @param {string} title Base (unlocalized) dialog title.
 * @returns {string} Localized title, optionally suffixed with `(vX.Y.Z)`.
 */
function configurationDialogTitle(title) {
  const version = typeof HEURIST_MODULE_VERSION !== 'undefined'
    ? String(HEURIST_MODULE_VERSION).trim() : '';
  const localizedTitle = $HR(title);
  return version ? `${localizedTitle} (v${version})` : localizedTitle;
}

/**
 * Build a labeled button with a click handler.
 *
 * @param {string} text Button label.
 * @param {string} title Button `title` attribute/tooltip.
 * @param {Function} handler Click event handler.
 * @returns {HTMLElement} The generated `<button>` element.
 */
function button(text, title, handler) {
  const item = document.createElement('button');
  item.type = 'button'; item.className = 'h-btn h-i18n'; item.textContent = $HR(text); item.title = $HR(title); item.addEventListener('click', handler); return item;
}

/**
 * Build a link-styled button (used for Edit/Show raw/Clear symbology actions).
 *
 * @param {string} text Button label.
 * @param {string} title Button `title` attribute/tooltip.
 * @param {Function} handler Click event handler.
 * @returns {HTMLElement} The generated `<button>` element.
 */
function linkButton(text, title, handler) {
  const item = button(text, title, handler);
  item.classList.add('heurist-map-config-link');
  return item;
}

/** Build the form's primary submit button. */
function submitButton(text) { const item = document.createElement('button'); item.type = 'submit'; item.className = 'h-btn h-btn-primary h-i18n'; item.textContent = $HR(text); return item; }

/**
 * Apply mode-specific forced settings overrides before rendering the form
 * (publish mode is handled separately by {@link preparePublishConfiguration}).
 *
 * @param {Object} value Normalized settings value.
 * @param {string} mode Dialog mode (`'preferences'`, `'website'`, or `'publish'`).
 * @returns {Object} The value, or a mode-adjusted clone.
 */
function prepareModeConfiguration(value, mode) {
  if (mode === 'publish') return preparePublishConfiguration(value);
  if (mode !== 'website') return value;
  const result = clone(value);
  result.options = result.options || {};
  result.options.ui = {
    ...(result.options.ui || {}),
    showBaseMaps: false,
    showOptions: false,
    showPublish: false
  };
  result.options.nativeControls = {
    ...(result.options.nativeControls || {}),
    bookmark: false,
    print: false
  };
  return result;
}

/**
 * Apply publish-mode forced settings overrides (disable Options/Publish icons,
 * force a minimal, predictable set of native controls).
 *
 * @param {Object} value Normalized settings value.
 * @returns {Object} A publish-mode-adjusted clone of `value`.
 */
function preparePublishConfiguration(value) {
  const result = clone(value);
  result.options = result.options || {};
  result.options.ui = { ...(result.options.ui || {}), showOptions: false, showPublish: false };
  result.options.nativeControls = {
    ...(result.options.nativeControls || {}),
    zoom: true,
    scale: true,
    bookmark: false,
    print: false,
    selector: false,
    search: false
  };
  return result;
}

/**
 * Build a standalone labeled checkbox not bound through `register()`.
 *
 * @param {string} labelText Checkbox label.
 * @param {boolean} [checked=false] Initial checked state.
 * @returns {{row: HTMLElement, control: HTMLElement}} The row element and its checkbox control.
 */
function plainCheckbox(labelText, checked = false) {
  const row = document.createElement('label');
  row.className = 'heurist-map-config-check';
  const control = document.createElement('input');
  control.type = 'checkbox';
  control.checked = checked;
  row.append(control, i18nText(labelText));
  return { row, control };
}

/**
 * Build the `[value, label]` choices for a native-zoom-level `<select>`, 1-18,
 * with descriptive suffixes at the worldwide/city/close-in levels.
 *
 * @param {boolean} includeEmpty Whether to prepend an empty "no limit" choice.
 * @returns {Array<[string, string]>} Zoom-level choice pairs.
 */
function zoomLevelChoices(includeEmpty) {
  const result = includeEmpty ? [['', '']] : [];
  for (let level = 1; level <= 18; level += 1) {
    const suffix = level === 1 ? ` (${$HR('Worldwide')})`
      : level === 10 ? ` (${$HR('City scale')})`
        : level === 18 ? ` (${$HR('Zoomed right in')})` : '';
    result.push([String(level), `${$HR('level')} ${level}${suffix}`]);
  }
  return result;
}

/**
 * Build a group of radio buttons sharing one input `name`, with helpers to read/set the checked value.
 *
 * @param {string} name Shared `name` attribute for the radio inputs.
 * @param {Array<[*, string]>} choices Option `[value, label]` pairs.
 * @returns {{element: HTMLElement, value: Function, set: Function}} The group element,
 *          a `value()` getter, and a `set(value)` setter.
 */
function radioChoice(name, choices) {
  const element = document.createElement('span');
  element.className = 'heurist-map-config-radio-choice';
  const controls = new Map();
  for (const [value, labelText] of choices) {
    const label = document.createElement('label');
    const control = document.createElement('input');
    control.type = 'radio';
    control.name = name;
    control.value = value;
    controls.set(value, control);
    label.append(control, i18nText(labelText));
    element.append(label);
  }
  return {
    element,
    value: () => [...controls].find(([, control]) => control.checked)?.[0] || choices[0][0],
    set: (value) => { (controls.get(value) || controls.values().next().value).checked = true; }
  };
}

/**
 * Build a localized `<span>` text node (used inside labels/radio choices).
 *
 * @param {string} text Text content.
 * @returns {HTMLElement} The generated `<span>` element.
 */
function i18nText(text) {
  const item = document.createElement('span');
  item.className = 'h-i18n';
  item.textContent = text;
  return item;
}

/**
 * Refresh the read-only extent display input from the current hidden bounds fields.
 *
 * @param {HTMLElement} display Read-only text input showing the formatted extent.
 * @param {Map<string, Object>} fields Registered fields map.
 * @param {string} prefix Settings path prefix (`west`/`south`/`east`/`north` are appended).
 * @returns {void}
 */
function refreshExtentDisplay(display, fields, prefix) {
  const bounds = readBoundsFields(fields, prefix);
  display.value = bounds ? `${bounds.south},${bounds.west} - ${bounds.north},${bounds.east}` : '';
}

/**
 * Read the four hidden `west`/`south`/`east`/`north` bounds fields for one extent.
 *
 * @param {Map<string, Object>} fields Registered fields map.
 * @param {string} prefix Settings path prefix (`west`/`south`/`east`/`north` are appended).
 * @returns {?{west: number, south: number, east: number, north: number}} The bounds,
 *          or `null` when any coordinate is missing/non-finite.
 */
function readBoundsFields(fields, prefix) {
  const values = Object.fromEntries(['west', 'south', 'east', 'north'].map((key) => {
    const text = fields.get(`${prefix}.${key}`)?.control?.value;
    return [key, text === '' || text == null ? null : Number(text)];
  }));
  return Object.values(values).every(Number.isFinite) ? values : null;
}

/**
 * Write bounds into the four hidden `west`/`south`/`east`/`north` fields and refresh the display.
 *
 * @param {Map<string, Object>} fields Registered fields map.
 * @param {string} prefix Settings path prefix (`west`/`south`/`east`/`north` are appended).
 * @param {{west: number, south: number, east: number, north: number}} bounds Bounds to write.
 * @param {HTMLElement} display Read-only text input showing the formatted extent.
 * @returns {void}
 */
function writeBoundsFields(fields, prefix, bounds, display) {
  for (const key of ['west', 'south', 'east', 'north']) {
    fields.get(`${prefix}.${key}`).control.value = String(bounds[key]);
  }
  refreshExtentDisplay(display, fields, prefix);
}

/** Resolve the submit button label for a dialog mode. */
function submitLabel(mode) { return mode === 'publish' ? 'Publish' : mode === 'website' ? 'Save' : 'Apply'; }

/** Find the first focusable control inside a root element. */
function firstFocusable(root) { return root.querySelector('button, input, select, textarea, summary'); }

/** Default dialog title for a mode. */
function defaultTitle(mode) { return mode === 'website' ? 'Website map configuration' : mode === 'publish' ? 'Publication configuration' : 'Map preferences'; }

/** Read a dot-separated path from a nested object. */
function getPath(object, path) { return path.split('.').reduce((current, key) => current?.[key], object); }

/**
 * Write a value at a dot-separated path in a nested object, creating intermediate objects as needed.
 *
 * @param {Object} object Target object, mutated in place.
 * @param {string} path Dot-separated path.
 * @param {*} value Value to write.
 * @returns {void}
 */
function setPath(object, path, value) {
  const parts = path.split('.'); let current = object;
  for (let index = 0; index < parts.length - 1; index += 1) { current[parts[index]] ||= {}; current = current[parts[index]]; }
  current[parts.at(-1)] = value;
}

/** Deep-clone a JSON-safe value. */
function clone(value) { return JSON.parse(JSON.stringify(value)); }
