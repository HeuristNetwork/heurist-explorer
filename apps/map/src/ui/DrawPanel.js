/**
 * @file DrawPanel.js
 * @brief Compact controls for an active map drawing session.
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

import { showMapMessage } from './mapMessages.js';
import { $HR, applyI18n } from '#shared/ui';

/** Compact floating panel exposing controls for an active map drawing session. */
export class DrawPanel {
  /**
   * @param {{api: object, container: HTMLElement}} options `api` is the map's public API;
   *        `container` is the element the panel mounts into.
   */
  constructor({ api, container }) {
    this.api = api;
    this.container = container;
    this.element = null;
  }

  /**
   * Build and mount the panel.
   *
   * @returns {DrawPanel} `this`, for chaining.
   */
  mount() {
    const panel = document.createElement('aside');
    panel.className = 'heurist-map-draw-panel';
    const multiple = checkbox('Allow multiple objects');
    this.multipleControl = multiple.control;
    multiple.control.addEventListener('change', () => {
      void this.api.setDrawingOptions({ allowMultiple: multiple.control.checked });
    });
    this.standardControls = [
      multiple.row,
      action('Set style', () => this.api.editDrawingStyle()),
      action('Add Geometry', () => this.openGeometryEditor('add')),
      action('Get Geometry', () => this.openGeometryEditor('get')),
      action('Zoom to drawing', () => this.api.zoomToDrawing()),
      action('Clear all', () => this.api.clearDrawing())
    ];
    this.cancelButton = action('Cancel', () => this.api.cancelDrawing());
    this.finishButton = action('Save', () => this.api.finishDrawing(), 'primary');
    panel.append(...this.standardControls, this.cancelButton, this.finishButton);
    this.container.append(panel);
    applyI18n(panel);
    this.sessionHandler = (event) => {
      this.multipleControl.checked = event.detail?.options?.allowMultiple === true;
      this.applySessionOptions(event.detail?.options || {});
    };
    this.container.addEventListener('heurist-map-drawing-session-started', this.sessionHandler);
    this.element = panel;
    return this;
  }

  /**
   * Show/hide and relabel controls to match the active drawing session mode.
   *
   * @param {object} options Drawing session options (`{ mode }`).
   * @returns {void}
   */
  applySessionOptions(options) {
    const mode = options.mode || 'full';
    const bboxExtent = mode === 'image' || mode === 'rectangle' || mode === 'filter';
    for (const control of this.standardControls) control.hidden = bboxExtent;
    this.finishButton.textContent = $HR(mode === 'image' ? 'Apply image extent'
      : mode === 'rectangle' ? 'Save extent'
        : mode === 'filter' ? 'Apply Extent' : 'Save');
  }

  /**
   * Open the "Add Geometry" or "Get Geometry" dialog.
   *
   * @param {'add'|'get'} mode Dialog mode.
   * @returns {void}
   */
  openGeometryEditor(mode) {
    this.geometryDialog?.close();
    this.geometryDialog?.remove();
    const dialog = document.createElement('dialog');
    dialog.className = 'h-dialog';
    const header = document.createElement('header');
    header.className = 'h-dialog-header';
    const heading = document.createElement('h2');
    heading.className = 'h-dialog-title h-i18n';
    heading.textContent = $HR(mode === 'add' ? 'Add Geometry' : 'Get Geometry');
    const textarea = document.createElement('textarea');
    textarea.className = 'h-input';
    textarea.style.resize = 'vertical';
    textarea.rows = 12;
    textarea.setAttribute('aria-label', heading.textContent);
    textarea.placeholder = mode === 'add' ? $HR('Paste WKT or GeoJSON') : '';
    const body = document.createElement('div');
    body.className = 'h-dialog-body h-stack';
    body.style.gap = 'var(--h-gap)';
    const controls = document.createElement('footer');
    controls.className = 'h-dialog-footer';
    let formatControl = null;
    const close = () => dialog.close();
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (this.geometryDialog === dialog) this.geometryDialog = null;
    });
    dialog.setAttribute('aria-label', heading.textContent);
    const closeButton = action('×', close, 'h-dialog-close');
    closeButton.setAttribute('aria-label', $HR('Close'));
    header.append(heading, closeButton);
    stopMapInteraction(dialog);

    if (mode === 'add') {
      controls.append(
        action('Cancel', close),
        action('Apply', async () => {
          try {
            await this.api.setDrawing(textarea.value, { clear: false, zoom: true });
            close();
          } catch (exception) {
            showMapMessage(exception, { error: true, title: 'Geometry error' });
          }
        }, 'h-btn-primary')
      );
    } else {
      const format = radioGroup('drawing-output-format', [
        ['wkt', 'WKT'], ['geojson', 'GeoJSON']
      ]);
      const refresh = () => {
        const result = this.api.getDrawing();
        textarea.value = !result ? '' : format.value() === 'geojson'
          ? JSON.stringify(result.geojson, null, 2) : result.wkt;
      };
      format.element.addEventListener('change', refresh);
      textarea.readOnly = true;
      formatControl = format.element;
      controls.append(action('Close', close));
      refresh();
    }

    if (formatControl) body.append(formatControl);
    body.append(textarea);
    dialog.append(header, body, controls);
    this.container.append(dialog);
    applyI18n(dialog);
    this.geometryDialog = dialog;
    dialog.showModal();
    textarea.focus();
  }

  /**
   * Remove the panel and any open dialog, and detach listeners.
   *
   * @returns {void}
   */
  destroy() {
    if (this.sessionHandler) {
      this.container.removeEventListener('heurist-map-drawing-session-started', this.sessionHandler);
    }
    this.element?.remove();
    this.geometryDialog?.close();
    this.geometryDialog?.remove();
    this.element = this.multipleControl = this.sessionHandler = this.geometryDialog = null;
  }
}

/**
 * Build a group of mutually exclusive radio inputs.
 *
 * @param {string} name Shared `name` attribute for the radio group.
 * @param {Array<[string, string]>} values `[value, label]` pairs; the first is selected by default.
 * @returns {{element: HTMLElement, value: Function}} The group element and a getter for the selected value.
 */
function radioGroup(name, values) {
  const element = document.createElement('div');
  element.className = 'h-inline';
  const controls = values.map(([value, label], index) => {
    const row = document.createElement('label');
    row.className = 'h-inline';
    const input = document.createElement('input');
    input.className = 'h-checkbox';
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = index === 0;
    const text = document.createElement('span'); text.className = 'h-i18n'; text.textContent = label;
    row.append(input, text);
    element.append(row);
    return input;
  });
  return { element, value: () => controls.find((item) => item.checked)?.value || values[0][0] };
}

/**
 * Stop pointer/touch events on an element from reaching the underlying map.
 *
 * @param {HTMLElement} element Element to isolate from map interaction.
 * @returns {void}
 */
function stopMapInteraction(element) {
  for (const eventName of ['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'wheel',
    'touchstart', 'touchmove', 'touchend']) {
    element.addEventListener(eventName, (event) => event.stopPropagation());
  }
}

/**
 * Build a button that runs an async handler and surfaces failures as a map error message.
 *
 * @param {string} label Localizable button label.
 * @param {Function} handler Click handler; may be async.
 * @param {string} [className] Additional CSS class(es).
 * @returns {HTMLButtonElement} The button element.
 */
function action(label, handler, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${className} h-btn h-i18n`.trim();
  button.textContent = $HR(label);
  button.addEventListener('click', async () => {
    try { await handler(); } catch (error) { showMapMessage(error, { error: true, title: 'Map error' }); }
  });
  return button;
}

/**
 * Build a labeled checkbox row.
 *
 * @param {string} label Localizable label text.
 * @returns {{row: HTMLElement, control: HTMLInputElement}} The row element and its checkbox input.
 */
function checkbox(label) {
  const row = document.createElement('label');
  const control = document.createElement('input');
  control.type = 'checkbox';
  const text = document.createElement('span'); text.className = 'h-checkbox h-i18n'; text.textContent = label;
  row.append(control, text);
  return { row, control };
}
