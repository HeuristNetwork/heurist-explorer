import { showMapMessage } from './mapMessages.js';
/**
 * DrawPanel.js - Compact controls for an active map drawing session
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 */
import { $HR, applyI18n } from '#shared/ui';

export class DrawPanel {
  constructor({ api, container }) {
    this.api = api;
    this.container = container;
    this.element = null;
  }

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

  applySessionOptions(options) {
    const mode = options.mode || 'full';
    const bboxExtent = mode === 'image' || mode === 'rectangle' || mode === 'filter';
    for (const control of this.standardControls) control.hidden = bboxExtent;
    this.finishButton.textContent = $HR(mode === 'image' ? 'Apply image extent'
      : mode === 'rectangle' ? 'Save extent'
        : mode === 'filter' ? 'Apply Extent' : 'Save');
  }

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

function stopMapInteraction(element) {
  for (const eventName of ['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'wheel',
    'touchstart', 'touchmove', 'touchend']) {
    element.addEventListener(eventName, (event) => event.stopPropagation());
  }
}

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

function checkbox(label) {
  const row = document.createElement('label');
  const control = document.createElement('input');
  control.type = 'checkbox';
  const text = document.createElement('span'); text.className = 'h-checkbox h-i18n'; text.textContent = label;
  row.append(control, text);
  return { row, control };
}
