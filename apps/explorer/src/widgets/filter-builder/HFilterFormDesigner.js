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
import { defaultLayout } from '#shared/widgets/filter/HFilterForm.js';
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
    this.layout.inputs ||= {};
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
    this.listen(orientation, 'change', () => {
      this.layout.settings ||= {};
      this.layout.settings.orientation = orientation.value;
    });
    this.container.append(this._label('Orientation', orientation));

    this.rows = document.createElement('div');
    this.rows.className = 'h-filter-form-designer-rows';
    this.container.append(this.rows);
    this._renderRows();
    this.state = 'rendered';
    return this;
  }

  /** @returns {object} Edited, detached layout definition. */
  getLayout() {
    for (const [id, config] of Object.entries(this.layout.inputs)) {
      if (config.widget?.control !== 'slider') continue;
      const { min, max } = config.widget;
      const type = this.parameters[id]?.type;
      const valid = type === 'date'
        ? /^\d{4}-\d{2}-\d{2}$/.test(min || '') && /^\d{4}-\d{2}-\d{2}$/.test(max || '') && min < max
        : min !== '' && max !== '' && Number.isFinite(Number(min)) && Number.isFinite(Number(max))
          && Number(min) < Number(max);
      if (!valid) throw new Error(`Slider for ${id} requires minimum and maximum bounds`);
    }

    return structuredClone(this.layout);
  }

  /** Render one editable row per available parameter. */
  _renderRows() {
    this.rows.replaceChildren();
    const group = this.layout.groups?.[0];
    if (!group) throw new Error('Filter form layout requires a root group');
    const ordered = group.children.map((child) => child.input);

    for (const id of Object.keys(this.parameters)) {
      if (!ordered.includes(id)) ordered.push(id);
    }

    for (const id of ordered) {
      const parameter = this.parameters[id];
      if (!parameter) continue;
      const config = this.layout.inputs[id] ||= {};
      const row = document.createElement('div');
      row.className = 'h-filter-form-designer-row';
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = group.children.some((child) => child.input === id);
      enabled.setAttribute('aria-label', `Show ${id}`);
      this.listen(enabled, 'change', () => {
        group.children = group.children.filter((child) => child.input !== id);
        if (enabled.checked) group.children.push({ input: id });
        this._renderRows();
      });
      const name = document.createElement('span');
      name.className = 'h-filter-form-designer-name';
      name.textContent = id;
      const label = document.createElement('input');
      label.className = 'h-input';
      label.value = config.label || parameter.label || id;
      label.setAttribute('aria-label', `Label for ${id}`);
      this.listen(label, 'input', () => { config.label = label.value; });
      row.append(enabled, name, label);

      if (parameter.type === 'enum') {
        const mode = this._select(['select', 'radio', 'checkbox'], config.mode || 'select');
        this.listen(mode, 'change', () => {
          config.mode = mode.value;
          config.multiple = mode.value === 'checkbox';
        });
        row.append(mode);
        const orientation = this._select(['column', 'inline'], config.orientation || 'column');
        this.listen(orientation, 'change', () => { config.orientation = orientation.value; });
        row.append(orientation);
      }

      if ((parameter.type === 'number' || parameter.type === 'date') && parameter.range) {
        const control = this._select(['direct', 'slider'], config.widget?.control || 'direct');
        this.listen(control, 'change', () => {
          config.widget = { ...(config.widget || {}), type: 'range', control: control.value };
        });
        row.append(control);

        for (const bound of ['min', 'max']) {
          const input = document.createElement('input');
          input.className = 'h-input h-filter-form-designer-bound';
          input.type = parameter.type === 'number' ? 'number' : 'date';
          input.placeholder = bound;
          input.setAttribute('aria-label', `${bound} for ${id}`);
          input.value = config.widget?.[bound] ?? '';
          this.listen(input, 'change', () => {
            config.widget = { ...(config.widget || {}), type: 'range', control: control.value };
            config.widget[bound] = input.value || undefined;
          });
          row.append(input);
        }
      }

      const up = this._moveButton('↑', id, -1);
      const down = this._moveButton('↓', id, 1);
      row.append(up, down);
      this.rows.append(row);
    }
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

  /** @returns {HTMLButtonElement} Order button. */
  _moveButton(text, id, direction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'h-btn h-btn-small';
    button.textContent = text;
    this.listen(button, 'click', () => {
      const children = this.layout.groups[0].children;
      const index = children.findIndex((child) => child.input === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= children.length) return;
      [children[index], children[target]] = [children[target], children[index]];
      this._renderRows();
    });
    return button;
  }
}
