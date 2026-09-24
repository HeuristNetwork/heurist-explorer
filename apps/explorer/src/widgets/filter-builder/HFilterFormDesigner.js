/**
 * @file HFilterFormDesigner.js
 * @brief Layout editor for parameters defined in HFilterBuilder.
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

import { HBaseWidget } from '#shared/widgets';
import { HFilterForm, defaultLayout } from '#shared/widgets/filter/HFilterForm.js';
import flatpickr from 'flatpickr';
import './HFilterFormDesigner.css';

/** Edits presentation of a fixed set of filter parameters. */
export class HFilterFormDesigner extends HBaseWidget {
  /**
   * Attach parameters and an optional existing layout.
   *
   * @param {HTMLElement} container Editor host.
   * @param {object} options Designer options.
   * @returns {HFilterFormDesigner} This designer.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.parameters = options.parameters || {};
    this.layout = structuredClone(options.layout || defaultLayout(this.parameters));
    this.query = options.query || [];
    this.dbdefs = options.dbdefs;
    this.selectExtent = options.selectExtent;
    this.preview = null;
    this._previewRevision = 0;
    this._previewScheduled = false;

    return this;
  }

  /**
   * Render order, labels and widget presentation choices.
   *
   * @returns {HFilterFormDesigner} This designer.
   */
  render() {
    if (!this.container) throw new Error('HFilterFormDesigner must be attached before render');
    this.container.className = 'h-widget h-filter-form-designer';
    this.container.replaceChildren();
    this._boundPickers = [];

    const orientation = document.createElement('select');
    orientation.className = 'h-select';
    for (const value of ['vertical', 'horizontal']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      option.className = 'h-i18n';
      orientation.append(option);
    }
    orientation.value = this.layout.settings?.orientation || 'vertical';

    const showPreview = document.createElement('input');
    showPreview.type = 'checkbox';
    showPreview.className = 'h-checkbox';
    showPreview.checked = true;
    const previewToggle = this._label('Show Form Preview', showPreview);
    previewToggle.classList.add('h-filter-form-designer-preview-toggle');

    const skipEmpty = document.createElement('input');
    skipEmpty.type = 'checkbox';
    skipEmpty.className = 'h-checkbox';
    skipEmpty.checked = Boolean(this.layout.settings?.skipEmptySearch);
    this.listen(skipEmpty, 'change', () => {
      this.layout.settings ||= {};
      this.layout.settings.skipEmptySearch = skipEmpty.checked;
      this._schedulePreview();
    });

    const toolbar = document.createElement('div');
    toolbar.className = 'h-filter-form-designer-toolbar';
    toolbar.append(this._label('Orientation', orientation),
      this._label("Don't search when the form is empty", skipEmpty), previewToggle);
    this.container.append(toolbar);

    this.workspace = document.createElement('div');
    this.workspace.className = 'h-filter-form-designer-workspace';
    this.rows = document.createElement('div');
    this.rows.className = 'h-filter-form-designer-rows';

    this.previewPane = document.createElement('section');
    this.previewPane.className = 'h-filter-form-designer-preview-pane';
    const previewTitle = document.createElement('h3');
    previewTitle.className = 'h-filter-form-designer-preview-title h-i18n';
    previewTitle.textContent = 'Filter Form preview';
    this.previewHost = document.createElement('div');
    this.previewHost.className = 'h-filter-form-designer-preview';
    this.previewPane.append(previewTitle, this.previewHost);
    this.workspace.append(this.rows, this.previewPane);
    this.container.append(this.workspace);

    const applyWorkspaceOrientation = () => {
      const vertical = orientation.value === 'vertical';
      this.workspace.classList.toggle('is-preview-side', vertical);
      this.workspace.classList.toggle('is-preview-below', !vertical);
    };
    applyWorkspaceOrientation();
    this.listen(orientation, 'change', () => {
      this.layout.settings ||= {};
      this.layout.settings.orientation = orientation.value;
      applyWorkspaceOrientation();
      this._schedulePreview();
    });
    this.listen(showPreview, 'change', () => {
      this.previewPane.hidden = !showPreview.checked;
      if (showPreview.checked) this._schedulePreview();
    });
    this._renderRows();
    this.state = 'rendered';
    return this;
  }

  /** @returns {object} Edited, detached layout definition. */
  getLayout() {
    for (const config of this.layout.groups.flatMap((group) => group.children || [])) {
      const id = config.input;
      if (config.widget?.control !== 'slider') continue;
      const { min, max } = config.widget;
      const type = this.parameters[id]?.type;
      const valid = type === 'date'
        ? /^\d{4}-\d{2}-\d{2}$/.test(min || '') && /^\d{4}-\d{2}-\d{2}$/.test(max || '') && min < max
        : min !== '' && max !== '' && Number.isFinite(Number(min)) && Number.isFinite(Number(max))
          && Number(min) < Number(max);
      if (!valid) throw new Error(`Slider for ${id} requires minimum and maximum bounds`);
    }

    const layout = structuredClone(this.layout);
    for (const child of layout.groups.flatMap((group) => group.children || [])) {
      const parameter = this.parameters[child.input];
      if (child.label === parameter?.label) delete child.label;
      if (child.mode === 'select') delete child.mode;
      if (child.orientation === 'column') delete child.orientation;
      if (child.multiple === false) delete child.multiple;
      if (child.widget?.control === 'direct') delete child.widget;
      if (!String(child.help ?? '').trim()) delete child.help;
    }
    if (layout.settings?.orientation === 'vertical') delete layout.settings.orientation;
    if (layout.settings && !layout.settings.skipEmptySearch) delete layout.settings.skipEmptySearch;
    if (layout.settings && !Object.keys(layout.settings).length) delete layout.settings;
    return layout;
  }

  /** Render one editable row per available parameter. */
  _renderRows() {
    for (const picker of this._boundPickers || []) picker.destroy();
    this._boundPickers = [];
    this.rows.replaceChildren();
    const group = this.layout.groups?.[0];
    if (!group) throw new Error('Filter form layout requires a root group');
    const companionInputs = new Set(Object.values(this.parameters)
      .map((parameter) => parameter.endInput).filter(Boolean));
    group.children = group.children.filter((child) => !companionInputs.has(child.input));
    const ordered = group.children.map((child) => child.input);
    for (const id of Object.keys(this.parameters)) {
      if (!companionInputs.has(id) && !ordered.includes(id)) ordered.push(id);
    }

    for (const id of ordered) {
      const parameter = this.parameters[id];
      if (!parameter) continue;
      const config = group.children.find((child) => child.input === id) || { input: id };
      const row = document.createElement('div');
      row.className = 'h-filter-form-designer-row';
      row.dataset.input = id;
      const drag = document.createElement('span');
      drag.className = 'h-filter-form-designer-drag';
      drag.textContent = '⠿';
      drag.title = 'Drag to reorder';
      drag.setAttribute('aria-label', 'Drag to reorder');
      this.listen(drag, 'dragstart', (event) => {
        this._draggedInput = id;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
        row.classList.add('is-dragging');
      });
      this.listen(drag, 'dragend', () => {
        this._draggedInput = null;
        row.classList.remove('is-dragging');
      });
      this.listen(row, 'dragover', (event) => {
        if (!this._draggedInput || this._draggedInput === id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      });
      this.listen(row, 'drop', (event) => {
        event.preventDefault();
        this._moveBefore(this._draggedInput, id);
      });
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = group.children.some((child) => child.input === id);
      drag.draggable = enabled.checked;
      row.classList.toggle('is-hidden-input', !enabled.checked);
      enabled.setAttribute('aria-label', `Show ${id}`);
      enabled.title = 'Show this input in the Filter Form';
      this.listen(enabled, 'change', () => {
        group.children = group.children.filter((child) => child.input !== id);
        if (enabled.checked) group.children.push(config);
        this._renderRows();
      });
      const name = document.createElement('span');
      name.className = 'h-filter-form-designer-name';
      name.textContent = parameter.pathLabel || parameter.label || id;
      name.title = id;
      const label = document.createElement('input');
      label.className = 'h-input';
      label.value = config.label || parameter.label || id;
      label.setAttribute('aria-label', `Label for ${id}`);
      this.listen(label, 'input', () => { config.label = label.value; this._schedulePreview(); });
      const help = document.createElement('input');
      help.className = 'h-input h-filter-form-designer-help';
      help.value = config.help || '';
      help.placeholder = 'Help text';
      help.setAttribute('aria-label', `Help text for ${id}`);
      this.listen(help, 'input', () => { config.help = help.value; this._schedulePreview(); });
      row.append(drag, enabled, name, label, help);

      if (parameter.type === 'enum') {
        const mode = this._select(['select', 'radio', 'checkbox'], config.mode || 'select');
        this.listen(mode, 'change', () => {
          config.mode = mode.value;
          config.multiple = mode.value === 'checkbox';
          this._schedulePreview();
        });
        row.append(mode);
        const orientation = this._select(['column', 'inline'], config.orientation || 'column');
        this.listen(orientation, 'change', () => {
          config.orientation = orientation.value;
          this._schedulePreview();
        });
        row.append(orientation);
      }

      if ((parameter.type === 'number' || parameter.type === 'date') && parameter.range) {
        const control = this._select(['direct', 'slider'], config.widget?.control || 'direct');
        this.listen(control, 'change', () => {
          config.widget = { ...(config.widget || {}), type: 'range', control: control.value };
          this._renderRows();
        });
        row.append(control);

        for (const bound of ['min', 'max']) {
          const input = document.createElement('input');
          input.className = 'h-input h-filter-form-designer-bound';
          input.type = parameter.type === 'number' ? 'number' : 'text';
          input.placeholder = bound;
          input.setAttribute('aria-label', `${bound} for ${id}`);
          input.value = config.widget?.[bound] ?? '';
          input.hidden = control.value !== 'slider';
          this.listen(input, 'change', () => {
            config.widget = { ...(config.widget || {}), type: 'range', control: control.value };
            config.widget[bound] = input.value || undefined;
            this._schedulePreview();
          });
          row.append(input);
          if (parameter.type === 'date') {
            this._boundPickers.push(flatpickr(input, {
              dateFormat: 'Y-m-d',
              allowInput: true,
              onOpen: (_dates, _text, picker) => positionDesignerCalendar(input, picker),
              onChange: () => input.dispatchEvent(new Event('change', { bubbles: true }))
            }));
          }
        }
      }

      this.rows.append(row);
    }
    this._schedulePreview();
  }

  /** Schedule one live preview refresh after the current designer update. */
  _schedulePreview() {
    this._previewRevision++;
    if (this._previewScheduled || !this.previewHost) return;
    this._previewScheduled = true;
    queueMicrotask(() => void this._refreshPreview());
  }

  /** Rebuild the runtime Filter Form preview from the latest layout. */
  async _refreshPreview() {
    const revision = this._previewRevision;
    this._previewScheduled = false;
    const previous = this.preview;
    this.preview = null;
    if (previous) await previous.destroy();
    if (revision !== this._previewRevision) {
      this._schedulePreview();
      return;
    }
    const preview = new HFilterForm();
    preview.attach(this.previewHost, {
      definition: { query: this.query, filterForm: structuredClone(this.layout) },
      dbdefs: this.dbdefs,
      selectExtent: this.selectExtent,
      preview: true
    }).render();
    this.preview = preview;
  }

  /** Dispose calendar widgets and DOM listeners. */
  async destroy() {
    for (const picker of this._boundPickers || []) picker.destroy();
    this._boundPickers = [];
    this._previewRevision++;
    await this.preview?.destroy?.();
    this.preview = null;
    await super.destroy();
  }

  /** @returns {HTMLElement} A labeled control. */
  _label(text, control) {
    const label = document.createElement('label');
    label.className = 'h-filter-form-designer-setting';
    const caption = document.createElement('span');
    caption.className = 'h-i18n';
    caption.textContent = text;
    label.append(caption, control);
    return label;
  }

  /** @returns {HTMLSelectElement} A select for presentation values. */
  _select(values, selected) {
    const select = document.createElement('select');
    select.className = 'h-select';
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      option.className = 'h-i18n';
      select.append(option);
    }
    select.value = selected;
    return select;
  }

  /** Move one visible input before another after a drag operation. */
  _moveBefore(sourceId, targetId) {
    if (!sourceId || sourceId === targetId) return;
    const children = this.layout.groups[0].children;
    const source = children.findIndex((child) => child.input === sourceId);
    const target = children.findIndex((child) => child.input === targetId);
    if (source < 0 || target < 0) return;
    const [item] = children.splice(source, 1);
    children.splice(children.findIndex((child) => child.input === targetId), 0, item);
    this._renderRows();
  }
}

/** Keep a slider-bound calendar within the visible designer dialog. */
function positionDesignerCalendar(input, picker) {
  const calendar = picker.calendarContainer;
  const dialog = input.closest('dialog');
  const parent = dialog || document.body;
  if (calendar.parentElement !== parent) parent.append(calendar);
  const rect = input.getBoundingClientRect();
  const bounds = dialog?.getBoundingClientRect();
  const top = Math.max(8, bounds?.top ?? 8);
  const bottom = Math.min(window.innerHeight - 8, bounds?.bottom ?? window.innerHeight - 8);
  const height = Math.max(80, Math.min(calendar.offsetHeight || 320, bottom - top - 16));
  const below = bottom - rect.bottom;
  const openBelow = below >= height || below >= rect.top - top;
  calendar.style.position = 'fixed';
  calendar.style.maxHeight = `${height}px`;
  calendar.style.overflowY = 'auto';
  calendar.style.top = `${Math.max(top, openBelow ? rect.bottom + 2 : rect.top - height - 2)}px`;
  calendar.style.left = `${Math.max(8, Math.min(rect.left,
    window.innerWidth - calendar.offsetWidth - 8))}px`;
}
