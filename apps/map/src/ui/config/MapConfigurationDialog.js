/**
 * MapConfigurationDialog.js - Reusable editor for persisted Heurist map settings
 *
 * The dialog owns no persistence. Preferences, website editing, and publishing
 * provide/receive the same allowlisted settings object through setValue(),
 * getValue(), and onSave.
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
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
const advancedStateByMode = new Map();

export class MapConfigurationDialog {
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

  setValue(value) {
    this.value = normalizeMapConfigurationSettings(value || {});
    this.value = prepareModeConfiguration(this.value, this.mode);
    if (this.form) {
      this.populate();
      this.applyModeControlState();
    }
    return this;
  }

  getValue() {
    if (this.form) this.value = normalizeMapConfigurationSettings(this.readForm());
    return clone(this.value);
  }

  serialize() { return serializeMapConfigurationSettings(this.getValue()); }

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

  finishCancel() {
    let value;
    try { value = this.getValue(); } catch { value = clone(this.value); }
    this.close();
    this.onCancel?.(value, { mode: this.mode });
    return true;
  }

  formStateSignature() {
    if (!this.form) return '';
    return JSON.stringify([...this.fields.entries()].map(([path, field]) => [
      path,
      field.control?.type === 'checkbox' ? field.control.checked : field.control?.value,
      field.defaultToggle?.checked ?? null,
      field.selectedControl ? [...field.selectedControl.options].map((option) => option.value) : null
    ]));
  }

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

  getPublishOptions() {
    return {
      preserveCurrentState: this.publishControls?.preserveState?.checked !== false,
      showOnlyActiveDocument: this.publishControls?.showOnlyActiveDocument?.checked === true
    };
  }

  buildCurrentResults(body) {
    this.checkbox(body, 'config.dynamicDocument.enabled', 'Enable current-results document', { hidden: true });
    this.text(body, 'config.dynamicDocument.title', 'Title');
    const dynamicLoading = this.checkbox(body, 'config.dynamicDocument.dynamicRequests', 'Load by map extent');
    dynamicLoading.title = $HR('Loads only records within the current map view and refreshes the layer when the map is moved or zoomed. Recommended for large result sets.');
    this.zoomFields(body, 'config.dynamicDocument', { allAdvanced: true });
    this.boundsFields(body, 'config.dynamicDocument.bounds', { advanced: true });
  }

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

  buildInteraction(body) {
    this.checkbox(body, 'options.interaction.readonly', 'Readonly');
    this.checkbox(body, 'options.interaction.selectionEnabled', 'Enable selection');
    this.checkbox(body, 'options.interaction.popupEnabled', 'Enable popups');
    this.checkbox(body, 'options.interaction.zoomOnSelection', 'Zoom on selection');
  }

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

  replaceTransferChoices(path, choices) {
    const field = this.fields.get(path);
    if (!field?.selectedControl) return;
    const selected = this.getTransferSelectedValues(field);
    field.choices = normalizeChoices(choices);
    this.renderTransferField(field, selected);
  }

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

  getTransferDefaultValues(field) {
    if (field.defaultValues === 'all') return field.choices.map(([value]) => String(value));
    if (Array.isArray(field.defaultValues)) return field.defaultValues.map(String);
    return [];
  }

  getTransferSelectedValues(field) {
    return [...(field.selectedControl?.options || [])].map((option) => option.value);
  }

  getTransferAllowedValues(field) {
    return field.defaultToggle?.checked
      ? this.getTransferDefaultValues(field)
      : this.getTransferSelectedValues(field);
  }

  transferChoiceLabel(field, value) {
    const found = field.choices.find(([candidate]) => String(candidate) === String(value));
    return found ? found[1] : String(value);
  }

  replaceConstrainedSelectChoices(path, choices) {
    const field = this.fields.get(path);
    if (!field?.control) return;
    const current = field.control.value;
    this.replaceSelectChoices(path, choices);
    field.control.value = [...field.control.options].some((option) => option.value === current)
      ? current
      : '';
  }

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

  text(body, path, labelText, options = {}) {
    const { row, control } = labelledControl('input', labelText);
    control.type = 'text';
    if (options.placeholder) control.placeholder = $HR(options.placeholder);
    this.register(path, control, options.kind || 'string-null');
    this.decorate(row, options);
    body.append(row);
    return row;
  }

  textarea(body, path, labelText, options = {}) {
    const { row, control } = labelledControl('textarea', labelText);
    control.rows = 3;
    this.register(path, control, 'string-null');
    this.decorate(row, options);
    body.append(row);
    return row;
  }

  json(body, path, labelText, options = {}) {
    const { row, control } = labelledControl('textarea', labelText);
    control.rows = 3;
    control.placeholder = $HR('JSON (optional)');
    this.register(path, control, 'json');
    this.decorate(row, options);
    body.append(row);
    return row;
  }

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

  decorate(element, options = {}) {
    if (options.advanced) this.markAdvanced(element);
    if (options.hidden) element.hidden = true;
  }

  markAdvanced(element) {
    element.dataset.advancedSetting = '1';
    return element;
  }

  updateAdvancedVisibility() {
    if (!this.form) return;
    for (const element of this.form.querySelectorAll('[data-advanced-setting="1"]')) {
      element.hidden = !this.advanced;
    }
  }

  register(path, control, kind) {
    control.dataset.configPath = path;
    this.fields.set(path, { control, kind });
  }

  populate() {
    for (const path of this.fields.keys()) this.populateField(path);
    this.updateHeuristControlState();
  }

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

  readForm() {
    // Start from the current normalized value so publish mode can render only
    // Interface/Publication without discarding settings from hidden sections.
    const result = clone(this.value);
    for (const [path, field] of this.fields) setPath(result, path, readControl(field, path));
    return result;
  }

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

  showError(message) {
    if (!this.form) return;
    const content = document.createElement('span');
    content.textContent = message;
    HMsg.showMsgErr(content, { title: 'Map configuration error' });
  }
}

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

function normalizeChoices(choices) {
  return (Array.isArray(choices) ? choices : []).map(([value, label]) => [String(value), String(label ?? value)]);
}

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

function legend(text) { const item = document.createElement('legend'); item.className = 'h-i18n'; item.textContent = text; return item; }
function sectionTitle(text) { const item = document.createElement('div'); item.className = 'heurist-map-config-control-section-title h-i18n'; item.textContent = text; return item; }
function configurationDialogTitle(title) {
  const version = typeof HEURIST_MODULE_VERSION !== 'undefined'
    ? String(HEURIST_MODULE_VERSION).trim() : '';
  const localizedTitle = $HR(title);
  return version ? `${localizedTitle} (v${version})` : localizedTitle;
}
function button(text, title, handler) {
  const item = document.createElement('button');
  item.type = 'button'; item.className = 'h-btn h-i18n'; item.textContent = $HR(text); item.title = $HR(title); item.addEventListener('click', handler); return item;
}

function linkButton(text, title, handler) {
  const item = button(text, title, handler);
  item.classList.add('heurist-map-config-link');
  return item;
}
function submitButton(text) { const item = document.createElement('button'); item.type = 'submit'; item.className = 'h-btn h-btn-primary h-i18n'; item.textContent = $HR(text); return item; }
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

function plainCheckbox(labelText, checked = false) {
  const row = document.createElement('label');
  row.className = 'heurist-map-config-check';
  const control = document.createElement('input');
  control.type = 'checkbox';
  control.checked = checked;
  row.append(control, i18nText(labelText));
  return { row, control };
}

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

function i18nText(text) {
  const item = document.createElement('span');
  item.className = 'h-i18n';
  item.textContent = text;
  return item;
}

function refreshExtentDisplay(display, fields, prefix) {
  const bounds = readBoundsFields(fields, prefix);
  display.value = bounds ? `${bounds.south},${bounds.west} - ${bounds.north},${bounds.east}` : '';
}

function readBoundsFields(fields, prefix) {
  const values = Object.fromEntries(['west', 'south', 'east', 'north'].map((key) => {
    const text = fields.get(`${prefix}.${key}`)?.control?.value;
    return [key, text === '' || text == null ? null : Number(text)];
  }));
  return Object.values(values).every(Number.isFinite) ? values : null;
}

function writeBoundsFields(fields, prefix, bounds, display) {
  for (const key of ['west', 'south', 'east', 'north']) {
    fields.get(`${prefix}.${key}`).control.value = String(bounds[key]);
  }
  refreshExtentDisplay(display, fields, prefix);
}

function submitLabel(mode) { return mode === 'publish' ? 'Publish' : mode === 'website' ? 'Save' : 'Apply'; }
function firstFocusable(root) { return root.querySelector('button, input, select, textarea, summary'); }
function defaultTitle(mode) { return mode === 'website' ? 'Website map configuration' : mode === 'publish' ? 'Publication configuration' : 'Map preferences'; }
function getPath(object, path) { return path.split('.').reduce((current, key) => current?.[key], object); }
function setPath(object, path, value) {
  const parts = path.split('.'); let current = object;
  for (let index = 0; index < parts.length - 1; index += 1) { current[parts[index]] ||= {}; current = current[parts[index]]; }
  current[parts.at(-1)] = value;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
