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
 * The fields are an HEditForm (plan 14a) of the JSON in symbolEditorForms.js; the
 * previews are drawn in the slots of its groups.
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
import { HEditForm } from '../edit-form/HEditForm.js';
import { BOOLEAN_FIELDS, symbolEditorForm } from './symbolEditorForms.js';
import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';
import { DEFAULT_MAP_SYMBOL } from '../../symbology/normalizeMapSymbol.js';
import { buildSymbology, effectiveSymbol, sparseSymbol, splitSymbology } from '../../symbology/symbology.js';
import { renderSymbolPreview } from '../../symbology/symbolPreview.js';
import './HSymbolEditor.css';

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
   * @param {object} options `mode`, `value` (form values), `parentSymbol`, `iconUrl`, `rectypeId`,
   *        `labelPos` (default inline), `inputPos` (default stack).
   * @returns {HSymbolEditor} This editor.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.mode = TITLES[options.mode] ? options.mode : 'symbol';
    this.form = null;
    this.previews = [];
    return this;
  }

  /** @returns {HSymbolEditor} This editor. */
  render() {
    if (!this.container) throw new Error('HSymbolEditor must be attached before render');
    void this.form?.destroy();
    this.container.className = `h-widget h-symbol-editor h-symbol-editor-${this.mode}`;
    this.container.replaceChildren();
    const host = document.createElement('div');
    this.container.append(host);
    this.previews = [];
    this.form = new HEditForm().attach(host, {
      form: symbolEditorForm(this.mode),
      values: formValuesOf(this.options.value || {}),
      // labels beside their inputs, one field per line (shared form layout, plan 18)
      labelPos: this.options.labelPos || 'inline',
      inputPos: this.options.inputPos || 'stack',
      onReady: (form) => this._renderPreviews(form),
      onChange: () => this._refresh()
    }).render();
    this.state = 'rendered';
    this._refresh();
    return this;
  }

  /**
   * The edited values: symbol properties (booleans for Yes/No, numbers, colours),
   * without empty ones and without fields that are not shown.
   *
   * @returns {object} Values.
   */
  getValue() {
    const result = {};
    for (const [key, value] of Object.entries(this.form?.getValues() || {})) {
      if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) continue;
      result[key] = typeof value === 'string' ? value.trim() : value;
    }
    return result;
  }

  /** @returns {object} The values, as getValue (the previews use the shown fields only). */
  getValueWithHidden() {
    return this.getValue();
  }

  /** Remove the form. */
  async destroy() {
    await this.form?.destroy();
    this.form = null;
    await super.destroy();
  }

  /** Preview rows in the slots of the groups (`preview-<kind>`). */
  _renderPreviews(form) {
    for (const kind of ['point', 'line', 'polygon', 'gradient', 'shapes']) {
      const slot = form.getSlot(`preview-${kind}`);
      if (slot) this._preview(slot, kind);
    }
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

  /** Redraw the previews. */
  _refresh() {
    if (!this.form) return;
    const values = this.getValue();
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
}

/** Form values of a symbol: Yes/No properties as booleans (stored as 1/0, "true", "yes"...). */
function formValuesOf(symbol) {
  const values = { ...symbol };
  for (const key of BOOLEAN_FIELDS) {
    const value = values[key];
    if (value === null || value === undefined || value === '') continue;
    values[key] = value === true || value === 1 || ['1', 'true', 'yes', 'y'].includes(String(value).toLowerCase());
  }
  return values;
}
