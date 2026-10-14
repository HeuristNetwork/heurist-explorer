/**
 * @file HThematicMapEditor.js
 * @brief Thematic map editor of a map layer (plan 17 §5). Port of
 *        hclient/widgets/editing/mapThemesEditor.js, in its layout: the renderers
 *        and the settings of the selected one at the top; its fields on the left
 *        (with the field tree to add one); the ranges/categories of the selected
 *        field on the right.
 *
 * A renderer: `{title, active, symbol, fields: [{code, title, ranges: [{value, symbol}]}]}`.
 * Only one renderer is active by default. Symbols inherit: built-in → layer parent →
 * layer symbol → renderer base symbol → range symbol; each is stored sparse. The
 * result is the whole DT_SYMBOLOGY value: the layer symbol unchanged, plus the
 * renderers (`{symbol, thematic}`).
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
import { HFieldTree } from '../field-tree/HFieldTree.js';
import { createHInput } from '../form/inputs/createHInput.js';
import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';
import { TermSource } from '../../data/valueSources/localSources.js';
import { fieldPathCode, fieldCodeLabel } from '../../data/fieldPathCodes.js';
import { formatRange, isIntervalType, parseRange } from '../../data/ranges/rangeDefinitions.js';
import { DEFAULT_MAP_SYMBOL } from '../../symbology/normalizeMapSymbol.js';
import {
  buildSymbology, colourGradient, effectiveSymbol, numberGradient, splitSymbology
} from '../../symbology/symbology.js';
import { renderSymbolPreview } from '../../symbology/symbolPreview.js';
import { THEMATIC_FIELD_TYPES, fieldCodeDty, fieldCodeType, layerRecordTypes } from '../../symbology/thematicFields.js';
import { HSymbolEditor } from './HSymbolEditor.js';
import { openRangeGenerator } from './HRangeGenerator.js';
import './HThematicMapEditor.css';

/** Editor of the thematic renderers of one map layer. */
export class HThematicMapEditor extends HBaseWidget {
  /**
   * Edit the thematic maps of a layer in a dialog.
   *
   * @param {*} value Stored DT_SYMBOLOGY (symbol, `{symbol, thematic}`, legacy array or JSON text).
   * @param {object} options
   * @param {object} options.api HeuristApiClient (record types and values of the layer).
   * @param {object} options.dbdefs HDbDefs (fields, terms).
   * @param {Array|object|string} options.query Query of the layer.
   * @param {object} [options.parentSymbol] Effective parent of the layer symbol.
   * @param {Function} [options.iconUrl] `(rectypeId) → url` for record type icon previews.
   * @returns {Promise<object|null>} The value to store, or null on Cancel.
   */
  static open(value, options = {}) {
    const host = document.createElement('div');
    const editor = new HThematicMapEditor().attach(host, { ...options, value });
    editor.render();
    return new Promise((resolve) => {
      const id = `h-thematic-editor-${Date.now()}`;
      let finished = false;
      const finish = async (save) => {
        if (finished) return;
        if (save) {
          const problem = editor.validate();
          if (problem) {
            HMsg.showMsgErr?.(problem);
            return;
          }
        }
        finished = true;
        const result = save ? editor.getValue() : null;
        HMsg.closeMsgDlg(id);
        await editor.destroy();
        resolve(result);
      };
      const dialog = HMsg.showMsgDlg(host, {
        dialogId: id,
        title: $HR('Define thematic mapping'),
        preventClose: true,
        buttons: [
          { label: $HR('Save'), class: 'h-btn h-btn-primary', onClick: () => void finish(true) },
          { label: $HR('Cancel'), class: 'h-btn', onClick: () => void finish(false) }
        ]
      });
      dialog?.classList.add('h-thematic-editor-dialog');
      dialog?.addEventListener('close', () => { if (!finished) { finished = true; void editor.destroy(); resolve(null); } }, { once: true });
    });
  }

  /**
   * @param {HTMLElement} container Host.
   * @param {object} options See `open`, plus `value`.
   * @returns {HThematicMapEditor} This editor.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    const parts = splitSymbology(options.value);
    this.layerSymbol = parts.symbol || {};
    this.renderers = parts.thematic.map(normalizeRenderer);
    this.current = this.renderers.length ? 0 : -1;
    this.currentField = this.renderers[0]?.fields?.length ? 0 : -1;
    this.layerEffective = effectiveSymbol(this.layerSymbol, effectiveSymbol({}, options.parentSymbol || DEFAULT_MAP_SYMBOL));
    this.recordTypes = null;
    this.fieldTree = null;
    this.rangeInputs = [];
    return this;
  }

  /** @returns {HThematicMapEditor} This editor. */
  render() {
    if (!this.container) throw new Error('HThematicMapEditor must be attached before render');
    this.container.className = 'h-widget h-thematic-editor';
    this.container.replaceChildren();
    this.top = element('div', 'h-thematic-top');
    this.fieldsPane = element('div', 'h-thematic-fields');
    this.rangesPane = element('div', 'h-thematic-ranges');
    this.container.append(this.top, this.fieldsPane, this.rangesPane);
    this._renderTop();
    this._renderFields();
    this._renderRanges();
    this.state = 'rendered';
    return this;
  }

  /**
   * The value to store: the layer symbol and the renderers (ranges without a value
   * dropped, fields without ranges dropped, enum ranges with a legend caption).
   *
   * @returns {object} DT_SYMBOLOGY value.
   */
  getValue() {
    const renderers = this.renderers.map((renderer, index) => ({
      ...renderer,
      title: String(renderer.title || '').trim() || `${$HR('Renderer')} ${index + 1}`,
      active: renderer.active === true,
      symbol: isFilled(renderer.symbol) ? renderer.symbol : '',
      fields: renderer.fields
        .map((field) => ({ ...field, ranges: this._finalRanges(field) }))
        .filter((field) => field.ranges.length)
    }));
    return buildSymbology(this.layerSymbol, renderers);
  }

  /**
   * Check before Save (legacy doAction): every renderer has a field with ranges, titles differ.
   *
   * @returns {string|null} The problem, or null.
   */
  validate() {
    const titles = new Set();
    for (let index = 0; index < this.renderers.length; index++) {
      const renderer = this.renderers[index];
      const title = String(renderer.title || '').trim().toLowerCase();
      if (title && titles.has(title)) {
        this._selectRenderer(index);
        return $HR('Thematic renderer titles must differ');
      }
      titles.add(title);
      if (!renderer.fields.some((field) => this._finalRanges(field).length)) {
        this._selectRenderer(index);
        return `${$HR('Thematic renderer')} "${renderer.title || index + 1}": ${$HR('needs at least one field with ranges/categories')}`;
      }
    }
    return null;
  }

  /** Remove the inputs and the field tree. */
  async destroy() {
    await this._destroyRangeInputs();
    this.fieldTree?.destroy?.();
    this.fieldTree = null;
    await super.destroy();
  }

  // ---------------------------------------------------------------- renderers ---

  /** Renderers list (left) and the settings of the selected renderer (right). */
  _renderTop() {
    const list = element('div', 'h-thematic-list-pane');
    const heading = sectionHeading('Thematic renderers', 'Add renderer', () => this._addRenderer());
    this.rendererList = element('div', 'h-thematic-list');
    this.rendererList.setAttribute('role', 'listbox');
    list.append(heading, this.rendererList);
    this.settings = element('div', 'h-thematic-settings');
    this.top.replaceChildren(list, this.settings);
    this._renderRendererList();
    this._renderSettings();
  }

  /** The renderers, the selected one marked. */
  _renderRendererList() {
    this.rendererList.replaceChildren(...this.renderers.map((renderer, index) => {
      const item = listItem(renderer.title || `${$HR('Renderer')} ${index + 1}`, index === this.current,
        () => this._selectRenderer(index), () => this._deleteRenderer(index));
      if (renderer.active) item.classList.add('is-active');
      return item;
    }));
    if (!this.renderers.length) this.rendererList.append(emptyNote('No thematic renderers'));
  }

  /** Title, Active by default, base symbol of the selected renderer; or the explanation. */
  _renderSettings() {
    const renderer = this.renderers[this.current];
    if (!renderer) {
      this.settings.replaceChildren(helpBox('Add a thematic renderer', [
        'A thematic renderer styles layer features according to their attribute values.',
        'A layer can have several renderers, for example one showing population, another a category or status, another chronology. One renderer is displayed at a time; users switch between the default symbology of the layer and its renderers.'
      ]));
      return;
    }
    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'h-input h-thematic-title';
    title.value = renderer.title || '';
    title.setAttribute('aria-label', $HR('Title'));
    this.listen(title, 'input', () => {
      renderer.title = title.value;
      this._renderRendererList();
    });
    const active = document.createElement('input');
    active.type = 'checkbox';
    active.className = 'h-checkbox';
    active.checked = renderer.active === true;
    this.listen(active, 'change', () => {
      for (const other of this.renderers) other.active = false;
      renderer.active = active.checked;
      this._renderRendererList();
    });
    const activeHelp = element('span', 'h-thematic-help-inline h-muted');
    activeHelp.textContent = $HR('Only one renderer can be active by default. If none is active, the layer opens with its default symbology.');

    const preview = symbolButton($HR('Click to edit symbol'), () => void this._editBaseSymbol());
    renderSymbolPreview(preview, this._rendererBase(renderer), this._previewOptions());
    const reset = linkButton('×', $HR('Reset to inherited symbology'), () => {
      renderer.symbol = '';
      this._refreshPreviews();
    });

    this.settings.replaceChildren(
      settingRow('Title', title),
      settingRow('Active by default', active, activeHelp),
      settingRow('Base symbol', preview, reset)
    );
    this.basePreview = preview;
  }

  /** Add a renderer with a new title and select it. */
  _addRenderer() {
    let number = this.renderers.length + 1;
    const taken = new Set(this.renderers.map((renderer) => String(renderer.title || '').toLowerCase()));
    while (taken.has(`${$HR('Renderer')} ${number}`.toLowerCase())) number++;
    this.renderers.push({ title: `${$HR('Renderer')} ${number}`, active: false, symbol: '', fields: [] });
    this._selectRenderer(this.renderers.length - 1);
    this.settings.querySelector('.h-thematic-title')?.select?.();
  }

  /** Delete a renderer after confirmation. */
  _deleteRenderer(index) {
    const renderer = this.renderers[index];
    if (!renderer) return;
    HMsg.showMsgDlg(`${$HR('Delete thematic renderer')} "${renderer.title || index + 1}"?`, {
      dialogId: 'h-thematic-confirm',
      title: $HR('Delete'),
      buttons: () => {
        this.renderers.splice(index, 1);
        this._selectRenderer(Math.min(index, this.renderers.length - 1));
      }
    });
  }

  /** Select a renderer: its settings, fields and first field. */
  _selectRenderer(index) {
    this.current = index >= 0 && index < this.renderers.length ? index : -1;
    const renderer = this.renderers[this.current];
    this.currentField = renderer?.fields?.length ? 0 : -1;
    this._renderRendererList();
    this._renderSettings();
    this._renderFields();
    this._renderRanges();
  }

  /** Edit the base symbol of the selected renderer (inherits the layer symbol). */
  async _editBaseSymbol() {
    const renderer = this.renderers[this.current];
    if (!renderer) return;
    const result = await HSymbolEditor.open(isFilled(renderer.symbol) ? renderer.symbol : {}, {
      mode: 'symbol',
      parentSymbol: this.layerEffective,
      iconUrl: this.options.iconUrl,
      rectypeId: this._previewRectype()
    });
    if (result == null) return;
    renderer.symbol = isFilled(result) ? result : '';
    this._refreshPreviews();
  }

  // ------------------------------------------------------------------- fields ---

  /** Fields of the selected renderer, and the field tree to add one. */
  _renderFields() {
    const renderer = this.renderers[this.current];
    this.fieldsPane.hidden = !renderer;
    if (!renderer) return;
    const heading = sectionHeading('Fields', 'Add field', () => this._showFieldSelection(true));
    this.fieldList = element('div', 'h-thematic-list');
    this.fieldList.replaceChildren(...renderer.fields.map((field, index) => listItem(
      field.title || fieldCodeLabel(field.code, this.options.dbdefs), index === this.currentField,
      () => this._selectField(index), () => this._removeField(index))));
    if (!renderer.fields.length) this.fieldList.append(emptyNote('No fields'));
    this.selectionPanel = element('div', 'h-thematic-field-selection');
    this.fieldsPane.replaceChildren(heading, this.fieldList, this.selectionPanel);
    this._showFieldSelection(!renderer.fields.length);
  }

  /** Show or hide the record type selector and the field tree. */
  _showFieldSelection(show) {
    if (!this.selectionPanel) return;
    this.selectionPanel.hidden = !show;
    if (!show) return;
    this.selectionPanel.replaceChildren(emptyNote('Loading'));
    void this._loadRecordTypes().then((types) => this._renderFieldSelection(types));
  }

  /** Record types of the layer (once). */
  async _loadRecordTypes() {
    if (this.recordTypes) return this.recordTypes;
    const dbdefs = this.options.dbdefs;
    let types = [];
    if (this.options.api && this.options.query) {
      try {
        types = await layerRecordTypes(this.options.api, this.options.query);
      } catch {
        types = [];
      }
    }
    if (!types.length) {
      // no layer query (or it failed): every record type
      types = (dbdefs?.rectypes?.() || []).map((type) => ({ id: Number(type.id), label: type.name || String(type.id), count: 0 }));
    }
    this.recordTypes = types;
    this.scopeRectype ??= types[0]?.id || null;
    return types;
  }

  /** Record type choice (several types) and the field tree of the chosen type. */
  _renderFieldSelection(types) {
    const panel = this.selectionPanel;
    if (!panel) return;
    const scope = element('div', 'h-thematic-scope');
    if (types.length > 1) {
      const label = element('label', 'h-thematic-scope-label');
      label.textContent = $HR('Record types in layer');
      const select = document.createElement('select');
      select.className = 'h-select';
      for (const type of types) select.append(new Option(type.count ? `${type.label} (${type.count})` : type.label, String(type.id)));
      select.value = String(this.scopeRectype || types[0].id);
      this.listen(select, 'change', () => {
        this.scopeRectype = Number(select.value);
        this.fieldTree?.setRecordType(this.scopeRectype);
        this._refreshPreviews();
      });
      label.append(select);
      scope.append(label);
    } else if (types.length === 1) {
      scope.textContent = `${$HR('Layer record type')}: ${types[0].label}`;
    }
    const treeHost = element('div', 'h-thematic-tree');
    panel.replaceChildren(scope, treeHost);
    if (!this.options.dbdefs || !this.scopeRectype) {
      treeHost.append(emptyNote('No record types'));
      return;
    }
    this.fieldTree?.destroy?.();
    this.fieldTree = new HFieldTree({ dbdefs: this.options.dbdefs });
    this.fieldTree.mount(treeHost, {
      rtyId: this.scopeRectype,
      selectableTypes: THEMATIC_FIELD_TYPES,
      hideUnselectable: true,
      includeHeaders: false,
      showSort: false,
      maxDepth: 2
    }, (path) => this._addField(path));
  }

  /** Add a field from the tree to the selected renderer (once). */
  _addField(path) {
    const renderer = this.renderers[this.current];
    const code = fieldPathCode(path, this.scopeRectype);
    if (!renderer || !code) return;
    const existing = renderer.fields.findIndex((field) => field.code === code);
    if (existing >= 0) {
      this._selectField(existing);
      return;
    }
    const dty = fieldCodeDty(code);
    const name = path.at(-1)?.label || this.options.dbdefs?.fieldGlobal?.(dty)?.name || String(dty);
    renderer.fields.push({ code, title: name, ranges: [] });
    this.currentField = renderer.fields.length - 1;
    this._renderFields();
    this._showFieldSelection(false);
    this._renderRanges();
  }

  /** Remove a field from the selected renderer. */
  _removeField(index) {
    const renderer = this.renderers[this.current];
    if (!renderer) return;
    renderer.fields.splice(index, 1);
    this.currentField = Math.min(this.currentField, renderer.fields.length - 1);
    this._renderFields();
    this._renderRanges();
  }

  /** Select a field: its ranges on the right. */
  _selectField(index) {
    this.currentField = index;
    this._renderFields();
    this._showFieldSelection(false);
    this._renderRanges();
  }

  // ------------------------------------------------------------------- ranges ---

  /** The ranges/categories of the selected field, with the toolbar. */
  _renderRanges() {
    void this._destroyRangeInputs();
    const renderer = this.renderers[this.current];
    const field = renderer?.fields?.[this.currentField];
    if (!renderer) {
      this.rangesPane.replaceChildren();
      return;
    }
    if (!field) {
      this.rangesPane.replaceChildren(helpBox('Add fields to this renderer', [
        'Fields determine how attribute values change the appearance of map features. Define ranges or categories for a field, then the symbol to use for matching values.',
        'A renderer may use several fields: for example Country can control colour, Population symbol size and City type the marker icon; these changes are combined.'
      ]));
      return;
    }
    const title = element('h3', 'h-thematic-field-title');
    title.textContent = fieldCodeLabel(field.code, this.options.dbdefs);
    title.title = field.code;
    const label = document.createElement('input');
    label.type = 'text';
    label.className = 'h-input';
    label.value = field.title || '';
    this.listen(label, 'input', () => {
      field.title = label.value;
      const item = this.fieldList?.children?.[this.currentField];
      const text = item?.querySelector('.h-thematic-item-title');
      if (text) text.textContent = label.value || fieldCodeLabel(field.code, this.options.dbdefs);
    });
    const toolbar = element('div', 'h-thematic-toolbar');
    toolbar.append(
      button('Add range', () => this._addRange()),
      button('Generate ranges...', () => void this._generateRanges()),
      button('Remove all ranges', () => this._removeAllRanges()),
      button('Symbol gradient...', () => void this._applyGradient(), 'h-thematic-gradient')
    );
    this.rangeList = element('div', 'h-thematic-range-list');
    const mode = element('div', 'h-thematic-mode h-muted');
    mode.textContent = `${$HR('Mode')}: ${$HR('Ranges / categories')}`;
    this.rangesPane.replaceChildren(title, settingRow('Label', label), mode, toolbar, this.rangeList);
    this._renderRangeRows();
  }

  /** One row per range: value (term or from/to), symbol preview, edit, reset, delete. */
  _renderRangeRows() {
    void this._destroyRangeInputs();
    const field = this._field();
    if (!field || !this.rangeList) return;
    const enumField = !isIntervalType(fieldCodeType(field.code, this.options.dbdefs));
    const vocabulary = enumField ? this.options.dbdefs?.vocabRoot?.(fieldCodeDty(field.code)) : 0;
    this.rangeList.replaceChildren(...field.ranges.map((range, index) => {
      const row = element('div', 'h-thematic-range');
      const remove = linkButton('×', $HR('Remove range'), () => {
        field.ranges.splice(index, 1);
        this._renderRangeRows();
      });
      remove.classList.add('h-thematic-range-remove');
      const values = element('div', 'h-thematic-range-values');
      if (enumField && vocabulary) {
        const parsed = parseRange(range.value);
        const selected = parsed.kind === 'list' ? parsed.values : (parsed.value ? [parsed.value] : []);
        const input = createHInput('enum', values, {
          source: new TermSource(this.options.dbdefs, vocabulary),
          mode: 'select', multiple: true, suppressLabel: true, value: selected.map(Number)
        });
        values.addEventListener('h-input-change', () => {
          const value = input.getValue();
          range.value = formatRange(Array.isArray(value) ? value : (value == null ? [] : [value]));
        });
        this.rangeInputs.push(input);
      } else {
        const parsed = parseRange(range.value);
        const from = textBox(parsed.kind === 'interval' ? parsed.min : (parsed.kind === 'list' ? parsed.values.join(',') : parsed.value || ''));
        const to = textBox(parsed.kind === 'interval' ? parsed.max : '');
        const sync = () => { range.value = formatRange(from.value, to.value); };
        this.listen(from, 'input', sync);
        this.listen(to, 'input', sync);
        const separator = element('span', 'h-thematic-range-separator');
        separator.textContent = '<>';
        values.append(from, separator, to);
      }
      const preview = symbolButton($HR('Click to edit symbol'), () => void this._editRangeSymbol(range, preview));
      renderSymbolPreview(preview, this._rangeSymbol(range), this._previewOptions());
      const reset = linkButton('×', $HR('Reset to inherited symbology'), () => {
        range.symbol = '';
        renderSymbolPreview(preview, this._rangeSymbol(range), this._previewOptions());
      });
      const caption = element('span', 'h-thematic-range-caption h-muted');
      caption.textContent = isFilled(range.symbol) && range.symbol.legendLabel ? range.symbol.legendLabel : '';
      row.append(remove, values, preview, reset, caption);
      row._preview = preview;
      row._range = range;
      return row;
    }));
    if (!field.ranges.length) this.rangeList.append(emptyNote('No ranges'));
  }

  /** Add an empty range. */
  _addRange() {
    const field = this._field();
    if (!field) return;
    field.ranges.push({ value: '', symbol: '' });
    this._renderRangeRows();
  }

  /** Replace the ranges with generated ones (keeping the symbols of equal values). */
  async _generateRanges() {
    const field = this._field();
    if (!field) return;
    if (!this.options.api) {
      HMsg.showMsgErr?.($HR('Values of the layer are not available'));
      return;
    }
    const ranges = await openRangeGenerator({
      code: field.code, api: this.options.api, dbdefs: this.options.dbdefs, query: this.options.query
    });
    if (!ranges) return;
    const symbols = new Map(field.ranges.map((range) => [String(range.value), range.symbol]));
    field.ranges = ranges.map((range) => ({ value: range.value, symbol: symbols.get(String(range.value)) || '' }));
    this._renderRangeRows();
  }

  /** Remove every range of the field after confirmation. */
  _removeAllRanges() {
    const field = this._field();
    if (!field?.ranges.length) return;
    HMsg.showMsgDlg($HR('Are you sure?'), {
      dialogId: 'h-thematic-confirm',
      title: $HR('Remove all ranges'),
      buttons: () => {
        field.ranges = [];
        this._renderRangeRows();
      }
    });
  }

  /** Spread from/to symbol values over the ranges (legacy "Symbol gradient..."). */
  async _applyGradient() {
    const field = this._field();
    const count = field?.ranges?.length || 0;
    if (!count) return;
    const gradient = await HSymbolEditor.open({}, { mode: 'gradient' });
    if (!gradient) return;
    const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
    const series = {
      fillColor: gradient.fillColor1 && gradient.fillColor2 ? colourGradient(gradient.fillColor1, gradient.fillColor2, count) : [],
      color: gradient.strokeColor1 && gradient.strokeColor2 ? colourGradient(gradient.strokeColor1, gradient.strokeColor2, count) : [],
      fillOpacity: positive(gradient.fillOpacity1) || positive(gradient.fillOpacity2)
        ? numberGradient(gradient.fillOpacity1 || 0, gradient.fillOpacity2 || 0, count) : [],
      opacity: positive(gradient.strokeOpacity1) || positive(gradient.strokeOpacity2)
        ? numberGradient(gradient.strokeOpacity1 || 0, gradient.strokeOpacity2 || 0, count) : [],
      iconSize: positive(gradient.iconSize1) || positive(gradient.iconSize2)
        ? numberGradient(gradient.iconSize1 || 0, gradient.iconSize2 || 0, count, { round: 0 }) : []
    };
    field.ranges.forEach((range, index) => {
      const symbol = isFilled(range.symbol) ? { ...range.symbol } : {};
      for (const [key, values] of Object.entries(series)) if (values.length) symbol[key] = values[index];
      range.symbol = symbol;
    });
    this._renderRangeRows();
  }

  /** Edit the symbol of one range (inherits the renderer's base symbol). */
  async _editRangeSymbol(range, preview) {
    const renderer = this.renderers[this.current];
    if (!renderer) return;
    const result = await HSymbolEditor.open(isFilled(range.symbol) ? range.symbol : {}, {
      mode: 'range',
      parentSymbol: this._rendererBase(renderer),
      iconUrl: this.options.iconUrl,
      rectypeId: this._previewRectype()
    });
    if (result == null) return;
    range.symbol = isFilled(result) ? result : '';
    this._renderRangeRows();
    preview?.focus?.();
  }

  /** Ranges to store: with a value; enum categories get a legend caption (term labels). */
  _finalRanges(field) {
    const enumField = !isIntervalType(fieldCodeType(field.code, this.options.dbdefs));
    return (field.ranges || [])
      .filter((range) => String(range?.value ?? '').trim() !== '')
      .map((range) => {
        const symbol = isFilled(range.symbol) ? { ...range.symbol } : {};
        if (enumField && !symbol.legendLabel && this.options.dbdefs?.termLabel) {
          const parsed = parseRange(range.value);
          const ids = parsed.kind === 'list' ? parsed.values : [parsed.value];
          const labels = ids.map((id) => this.options.dbdefs.termLabel(id)).filter(Boolean);
          if (labels.length) symbol.legendLabel = labels.join(', ');
        }
        return { value: String(range.value).trim(), symbol: Object.keys(symbol).length ? symbol : '' };
      });
  }

  // ------------------------------------------------------------------ helpers ---

  /** @returns {object|null} The selected field. */
  _field() {
    return this.renderers[this.current]?.fields?.[this.currentField] || null;
  }

  /** Effective base symbol of a renderer. */
  _rendererBase(renderer) {
    return effectiveSymbol(isFilled(renderer?.symbol) ? renderer.symbol : {}, this.layerEffective);
  }

  /** Effective symbol of a range of the selected renderer. */
  _rangeSymbol(range) {
    return effectiveSymbol(isFilled(range?.symbol) ? range.symbol : {}, this._rendererBase(this.renderers[this.current]));
  }

  /** Record type of the record type icon in the previews. */
  _previewRectype() {
    return this.scopeRectype || this.recordTypes?.[0]?.id || 12;
  }

  /** Options of the previews. */
  _previewOptions() {
    return { iconUrl: this.options.iconUrl, rectypeId: this._previewRectype() };
  }

  /** Redraw the base and range previews (after a symbol of a parent changed). */
  _refreshPreviews() {
    const renderer = this.renderers[this.current];
    if (this.basePreview && renderer) renderSymbolPreview(this.basePreview, this._rendererBase(renderer), this._previewOptions());
    for (const row of this.rangeList?.children || []) {
      if (row._preview) renderSymbolPreview(row._preview, this._rangeSymbol(row._range), this._previewOptions());
    }
  }

  /** Remove the term pickers of the range rows. */
  async _destroyRangeInputs() {
    const inputs = this.rangeInputs || [];
    this.rangeInputs = [];
    for (const input of inputs) await input.destroy?.();
  }
}

/** A stored renderer with its parts as arrays (symbol kept as stored: object or ''). */
function normalizeRenderer(renderer) {
  const value = renderer && typeof renderer === 'object' ? renderer : {};
  return {
    ...value,
    title: String(value.title ?? ''),
    active: value.active === true,
    symbol: isFilled(value.symbol) ? value.symbol : (parseObject(value.symbol) || ''),
    fields: (Array.isArray(value.fields) ? value.fields : []).map((field) => ({
      ...field,
      code: String(field?.code ?? ''),
      title: String(field?.title ?? ''),
      ranges: (Array.isArray(field?.ranges) ? field.ranges : []).map((range) => ({
        ...range,
        value: Array.isArray(range?.value) ? formatRange(range.value)
          : (range?.min != null && range?.max != null ? formatRange(range.min, range.max) : String(range?.value ?? '')),
        symbol: isFilled(range?.symbol) ? range.symbol : (parseObject(range?.symbol) || '')
      }))
    }))
  };
}

/** Whether a symbol is a non-empty object. */
function isFilled(symbol) {
  return Boolean(symbol) && typeof symbol === 'object' && !Array.isArray(symbol) && Object.keys(symbol).length > 0;
}

/** A symbol stored as JSON text. */
function parseObject(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isFilled(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Create an element with a class. */
function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/** Section heading with an "add" action. */
function sectionHeading(title, addLabel, onAdd) {
  const heading = element('div', 'h-thematic-heading');
  const text = element('strong', 'h-i18n');
  text.textContent = $HR(title);
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'h-btn h-btn-small h-thematic-add';
  add.innerHTML = '<span class="fa-solid fa-circle-plus" aria-hidden="true"></span>';
  add.append(` ${$HR(addLabel)}`);
  add.addEventListener('click', onAdd);
  heading.append(text, add);
  return heading;
}

/** A list item with a delete action. */
function listItem(text, selected, onSelect, onDelete) {
  const item = element('div', `h-thematic-item${selected ? ' is-selected' : ''}`);
  item.setAttribute('role', 'option');
  item.setAttribute('aria-selected', String(selected));
  item.tabIndex = 0;
  const title = element('span', 'h-thematic-item-title');
  title.textContent = text;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'heurist-icon-button h-thematic-item-delete';
  remove.title = $HR('Delete');
  remove.setAttribute('aria-label', remove.title);
  remove.innerHTML = '<span class="fa-solid fa-xmark" aria-hidden="true"></span>';
  remove.addEventListener('click', (event) => {
    event.stopPropagation();
    onDelete();
  });
  item.addEventListener('click', onSelect);
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  });
  item.append(title, remove);
  return item;
}

/** A settings row: label and controls. */
function settingRow(label, ...controls) {
  const row = element('div', 'h-thematic-setting');
  const caption = element('span', 'h-thematic-setting-label h-i18n');
  caption.textContent = $HR(label);
  const body = element('span', 'h-thematic-setting-body');
  body.append(...controls);
  row.append(caption, body);
  return row;
}

/** A clickable symbol preview. */
function symbolButton(title, onClick) {
  const preview = document.createElement('button');
  preview.type = 'button';
  preview.className = 'h-thematic-symbol';
  preview.title = title;
  preview.setAttribute('aria-label', title);
  preview.addEventListener('click', onClick);
  return preview;
}

/** A small text button. */
function linkButton(text, title, onClick) {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'heurist-icon-button h-thematic-link';
  link.textContent = text;
  link.title = title;
  link.setAttribute('aria-label', title);
  link.addEventListener('click', onClick);
  return link;
}

/** A toolbar button. */
function button(label, onClick, className = '') {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `h-btn h-btn-small h-i18n ${className}`.trim();
  node.textContent = $HR(label);
  node.addEventListener('click', onClick);
  return node;
}

/** A text box of a range bound. */
function textBox(value) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'h-input h-thematic-range-bound';
  input.value = value ?? '';
  return input;
}

/** A muted note of an empty list. */
function emptyNote(text) {
  const note = element('div', 'h-thematic-empty h-muted');
  note.textContent = $HR(text);
  return note;
}

/** An explanation box: a heading and paragraphs. */
function helpBox(heading, paragraphs) {
  const box = element('div', 'h-thematic-help');
  const title = element('strong', 'h-thematic-help-title');
  title.textContent = $HR(heading);
  box.append(title, ...paragraphs.map((text) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = $HR(text);
    return paragraph;
  }));
  return box;
}
