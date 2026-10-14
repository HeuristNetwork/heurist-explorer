/**
 * @file HSymbolEditor.js
 * @brief Map symbol editor: symbols, outline and area fill with live previews
 *        (plan 17 §3). Port of hclient/widgets/editing/mapSymbolEditor.js.
 *
 * Modes (legacy editSymbology mode numbers):
 * - `symbol` (1/3): a layer symbol, or a default/selection symbol of the Map configuration;
 * - `range` (4): the symbol of one range of a thematic map, plus its legend caption;
 * - `gradient` (5): from/to values spread over the ranges of a thematic field;
 * - `draw` (2): the drawing style of the Map module.
 *
 * In the `symbol` and `range` modes the form shows the effective symbol (inherited
 * from `parentSymbol`) and `open` resolves with the sparse value to store - only the
 * properties that differ from the parent (legacy showEditSymbologyDialog). The
 * thematic renderers of a stored value are kept.
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

import { HBaseWidget } from '../HBaseWidget.js';
import { createHInput } from '../form/inputs/createHInput.js';
import { applyFormLayout, FORM_GROUP_CLASS, markInputField } from '../form/formLayout.js';
import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';
import { DEFAULT_MAP_SYMBOL } from '../../symbology/normalizeMapSymbol.js';
import { buildSymbology, effectiveSymbol, sparseSymbol, splitSymbology } from '../../symbology/symbology.js';
import { renderSymbolPreview } from '../../symbology/symbolPreview.js';
import './HSymbolEditor.css';

const YES_NO = [{ id: '1', label: 'Yes' }, { id: '0', label: 'No' }];
const ICON_TYPES = [
  { id: 'url', label: 'Image' },
  { id: 'iconfont', label: 'Icon font' },
  { id: 'circle', label: 'Circle' },
  { id: 'rectype', label: 'Record type icon' }
];
const OPACITY = { min: 0, max: 1, step: 0.1 };

/** Field groups of the `symbol` / `range` modes; `preview` is the sample shown above the group. */
const SYMBOL_GROUPS = [
  {
    title: 'Symbols', preview: 'point', fields: [
      { key: 'iconType', type: 'enum', label: 'Icon source', terms: ICON_TYPES, help: 'Type and source of the icon' },
      { key: 'iconUrl', type: 'url', label: 'Icon URL', show: (values) => values.iconType === 'url' },
      {
        key: 'iconFont', type: 'freetext', label: 'Icon', show: (values) => values.iconType === 'iconfont',
        help: 'Name of an icon of Font Awesome (e.g. fa-house) or of the jQuery UI icon font (e.g. location)'
      },
      { key: 'iconSize', type: 'integer', label: 'Icon size', min: 0, help: 'Icon size in pixels' }
    ]
  },
  {
    title: 'Outline', preview: 'line', fields: [
      { key: 'stroke', type: 'enum', label: 'Stroke', terms: YES_NO, boolean: true, help: 'Draw the outline of points, lines and areas' },
      { key: 'color', type: 'color', label: 'Stroke color' },
      { key: 'weight', type: 'float', label: 'Stroke width', min: 0, step: 1, help: 'Stroke width in pixels' },
      { key: 'dashArray', type: 'freetext', label: 'Dash array', help: 'Stroke dash pattern, e.g. 5, 5 (SVG stroke-dasharray)' },
      { key: 'opacity', type: 'float', label: 'Stroke opacity', ...OPACITY, help: 'Value from 0 (transparent) to 1 (opaque)' }
    ]
  },
  {
    title: 'Area fill', preview: 'polygon', fields: [
      { key: 'fill', type: 'enum', label: 'Fill', terms: YES_NO, boolean: true, help: 'Fill areas and circles with colour' },
      { key: 'fillColor', type: 'color', label: 'Fill color', help: 'Defaults to the stroke color' },
      { key: 'fillOpacity', type: 'float', label: 'Fill opacity', ...OPACITY, help: 'Value from 0 (transparent) to 1 (opaque)' }
    ]
  }
];

/** Field groups of the `gradient` mode: from/to pairs. */
const GRADIENT_GROUPS = [
  {
    title: 'Gradient', preview: 'gradient', pairs: true, fields: [
      { key: 'strokeColor1', type: 'color', label: 'Stroke color from' },
      { key: 'strokeColor2', type: 'color', label: 'to' },
      { key: 'strokeOpacity1', type: 'float', label: 'Stroke opacity from', ...OPACITY },
      { key: 'strokeOpacity2', type: 'float', label: 'to', ...OPACITY },
      { key: 'fillColor1', type: 'color', label: 'Fill color from' },
      { key: 'fillColor2', type: 'color', label: 'to' },
      { key: 'fillOpacity1', type: 'float', label: 'Fill opacity from', ...OPACITY },
      { key: 'fillOpacity2', type: 'float', label: 'to', ...OPACITY },
      { key: 'iconSize1', type: 'integer', label: 'Icon size from', min: 0 },
      { key: 'iconSize2', type: 'integer', label: 'to', min: 0 }
    ]
  }
];

/** Field groups of the `draw` mode. */
const DRAW_GROUPS = [
  {
    title: 'Drawing style', preview: 'shapes', fields: [
      { key: 'color', type: 'color', label: 'Stroke color' },
      { key: 'weight', type: 'integer', label: 'Stroke width', min: 0, help: 'Stroke width in pixels' },
      { key: 'opacity', type: 'float', label: 'Stroke opacity', ...OPACITY, help: 'Value from 0 (transparent) to 1 (opaque)' },
      { key: 'fillColor', type: 'color', label: 'Fill color', help: 'Defaults to the stroke color' },
      { key: 'fillOpacity', type: 'float', label: 'Fill opacity', ...OPACITY, help: 'Value from 0 (transparent) to 1 (opaque)' }
    ]
  }
];

const TITLES = {
  symbol: 'Define symbology',
  range: 'Symbology for thematic map range/category',
  gradient: 'Define symbology gradient values',
  draw: 'Drawing style'
};

/** Form of one map symbol (see the modes above). */
export class HSymbolEditor extends HBaseWidget {
  /**
   * Edit a symbol in a dialog.
   *
   * @param {*} value Stored value: a symbol, `{symbol, thematic}`, JSON text, or null.
   * @param {object} [options]
   * @param {'symbol'|'range'|'gradient'|'draw'} [options.mode='symbol'] Editor mode.
   * @param {object} [options.parentSymbol] Effective parent (symbol/range modes); default the built-in symbol.
   * @param {Function} [options.iconUrl] `(rectypeId) → url` for the record type icon preview.
   * @param {number} [options.rectypeId] Record type of that preview.
   * @param {string} [options.title] Dialog title.
   * @returns {Promise<object|null>} The value to store (symbol/range: sparse, with the thematic
   *          renderers of `value`; gradient/draw: the edited values), or null on Cancel.
   */
  static open(value, options = {}) {
    const mode = TITLES[options.mode] ? options.mode : 'symbol';
    const inherits = mode === 'symbol' || mode === 'range';
    const parent = inherits ? effectiveSymbol({}, options.parentSymbol || DEFAULT_MAP_SYMBOL) : null;
    const parts = splitSymbology(value);
    const local = parts.symbol || {};
    const initial = inherits
      ? { ...effectiveSymbol(local, parent), ...(mode === 'range' && local.legendLabel ? { legendLabel: local.legendLabel } : {}) }
      : { ...local };

    const host = document.createElement('div');
    const editor = new HSymbolEditor().attach(host, { ...options, mode, value: initial, parentSymbol: parent });
    editor.render();

    return new Promise((resolve) => {
      const id = `h-symbol-editor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let finished = false;
      const finish = async (save) => {
        if (finished) return;
        finished = true;
        let result = null;
        if (save) {
          const edited = editor.getValue();
          if (inherits) {
            const label = String(edited.legendLabel ?? '').trim();
            delete edited.legendLabel;
            const sparse = sparseSymbol(edited, parent);
            if (mode === 'range' && label) sparse.legendLabel = label;
            result = buildSymbology(sparse, parts.thematic);
          } else {
            result = edited;
          }
        }
        HMsg.closeMsgDlg(id);
        await editor.destroy();
        resolve(result);
      };
      const dialog = HMsg.showMsgDlg(host, {
        dialogId: id,
        title: $HR(options.title || TITLES[mode]),
        preventClose: true,
        buttons: [
          { label: $HR('Save'), class: 'h-btn h-btn-primary', onClick: () => void finish(true) },
          { label: $HR('Cancel'), class: 'h-btn', onClick: () => void finish(false) }
        ]
      });
      dialog?.classList.add('h-symbol-editor-dialog');
      dialog?.addEventListener('close', () => void finish(false), { once: true });
    });
  }

  /**
   * @param {HTMLElement} container Host.
   * @param {object} options `mode`, `value` (form values), `parentSymbol`, `iconUrl`, `rectypeId`.
   * @returns {HSymbolEditor} This editor.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.mode = TITLES[options.mode] ? options.mode : 'symbol';
    this.inputs = new Map();
    this.rows = new Map();
    this.previews = [];
    return this;
  }

  /** @returns {HSymbolEditor} This editor. */
  render() {
    if (!this.container) throw new Error('HSymbolEditor must be attached before render');
    this.container.className = `h-widget h-symbol-editor h-symbol-editor-${this.mode}`;
    // labels beside their inputs, one field per line (shared form layout, plan 18)
    applyFormLayout(this.container, { labelPos: this.options.labelPos || 'inline', inputPos: this.options.inputPos || 'stack' });
    this.container.replaceChildren();
    const values = this.options.value || {};
    const groups = this.mode === 'gradient' ? GRADIENT_GROUPS : this.mode === 'draw' ? DRAW_GROUPS : SYMBOL_GROUPS;

    if (this.mode === 'range') {
      const caption = this._group(null);
      this._field(caption, { key: 'legendLabel', type: 'freetext', label: 'Legend caption' }, values);
    }
    for (const group of groups) {
      const body = this._group(group.title, group.pairs);
      this._preview(body, group.preview);
      for (const field of group.fields) this._field(body, field, values);
    }
    this.listen(this.container, 'h-input-change', () => this._refresh());
    this.state = 'rendered';
    this._refresh();
    return this;
  }

  /**
   * The edited values: symbol properties (booleans for Yes/No, numbers, colours),
   * without empty ones.
   *
   * @returns {object} Values.
   */
  getValue() {
    const result = {};
    for (const [key, { input, field }] of this.inputs) {
      if (field.show && this.rows.get(key)?.hidden) continue;
      let value = input.getValue();
      if (Array.isArray(value)) value = value[0];
      if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) continue;
      if (field.boolean) value = String(value) === '1' || value === true;
      result[key] = typeof value === 'string' ? value.trim() : value;
    }
    return result;
  }

  /** Remove the inputs. */
  async destroy() {
    for (const { input } of this.inputs.values()) await input.destroy?.();
    this.inputs.clear();
    await super.destroy();
  }

  /** A titled group of fields. */
  _group(title, pairs = false) {
    const group = document.createElement('fieldset');
    group.className = `h-symbol-editor-group ${FORM_GROUP_CLASS}${pairs ? ' is-pairs' : ''}`;
    if (title) {
      const legend = document.createElement('legend');
      legend.className = 'h-i18n';
      legend.textContent = $HR(title);
      group.append(legend);
    }
    this.container.append(group);
    return group;
  }

  /** One field: a shared input of its type. */
  _field(parent, field, values) {
    const row = document.createElement('div');
    row.className = 'h-symbol-editor-field';
    row.dataset.key = field.key;
    parent.append(row);
    let value = values[field.key];
    if (field.boolean && value != null) value = value === true || value === 1 || value === '1' || value === 'true' ? '1' : '0';
    const options = {
      label: $HR(field.label),
      help: field.help ? $HR(field.help) : '',
      value: value ?? null
    };
    if (field.type === 'enum') {
      Object.assign(options, {
        terms: field.terms.map((term) => ({ id: term.id, label: $HR(term.label), depth: 1 })),
        numeric: false,
        mode: 'radio',
        orientation: 'inline',
        radioStyle: 'standard',
        countsMode: 'none'
      });
    }
    if (field.type === 'integer' || field.type === 'float') {
      Object.assign(options, { integer: field.type === 'integer', min: field.min, max: field.max, step: field.step });
    }
    const input = createHInput(field.type, row, options);
    // the row is the input's root (.h-form-input): a field of the form layout
    markInputField(input.container || row);
    this.inputs.set(field.key, { input, field });
    this.rows.set(field.key, row);
  }

  /** A preview row above a group. */
  _preview(parent, kind) {
    const row = document.createElement('div');
    row.className = 'h-symbol-editor-preview-row';
    const label = document.createElement('span');
    label.className = 'h-symbol-editor-preview-label h-i18n';
    label.textContent = $HR('Preview');
    row.append(label);
    if (kind === 'gradient') {
      for (const end of ['1', '2']) {
        const caption = document.createElement('span');
        caption.className = 'h-symbol-editor-preview-caption';
        caption.textContent = $HR(end === '1' ? 'From' : 'To');
        const sample = document.createElement('span');
        row.append(caption, sample);
        this.previews.push({ sample, kind, end });
      }
    } else {
      const sample = document.createElement('span');
      row.append(sample);
      this.previews.push({ sample, kind });
    }
    parent.append(row);
  }

  /** Show/hide dependent fields and redraw the previews. */
  _refresh() {
    const values = this.getValueWithHidden();
    for (const [key, { field }] of this.inputs) {
      if (field.show) this.rows.get(key).hidden = !field.show(values);
    }
    const parent = this.options.parentSymbol || DEFAULT_MAP_SYMBOL;
    for (const preview of this.previews) {
      const options = { iconUrl: this.options.iconUrl, rectypeId: this.options.rectypeId };
      if (preview.kind === 'gradient') {
        const end = preview.end;
        renderSymbolPreview(preview.sample, effectiveSymbol({
          color: values[`strokeColor${end}`], opacity: values[`strokeOpacity${end}`],
          fillColor: values[`fillColor${end}`], fillOpacity: values[`fillOpacity${end}`],
          iconSize: values[`iconSize${end}`], iconType: 'circle'
        }, DEFAULT_MAP_SYMBOL), options);
      } else if (preview.kind === 'shapes') {
        renderSymbolPreview(preview.sample, effectiveSymbol(values, DEFAULT_MAP_SYMBOL), { ...options, all: true });
      } else {
        renderSymbolPreview(preview.sample, effectiveSymbol(values, parent), { ...options, geometry: preview.kind });
      }
    }
  }

  /** Values including those of hidden fields (to decide what to show). */
  getValueWithHidden() {
    const result = {};
    for (const [key, { input, field }] of this.inputs) {
      let value = input.getValue();
      if (Array.isArray(value)) value = value[0];
      if (value === null || value === undefined || value === '') continue;
      result[key] = field.boolean ? String(value) === '1' : value;
    }
    return result;
  }
}
