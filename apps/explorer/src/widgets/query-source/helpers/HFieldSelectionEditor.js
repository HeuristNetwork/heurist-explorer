/**
 * @file HFieldSelectionEditor.js
 * @brief Base multi-field selector used by fieldset, geo and time Query Source helpers.
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

import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR } from '#shared/ui';
import { HFieldTree } from '#shared/widgets/field-tree/HFieldTree.js';
import { fieldPathCode, fieldPathLabel, fieldCodeLabel, normalizeFieldDescriptors } from './fieldPathUtils.js';
import './QuerySourceHelpers.css';

/**
 * Enum outputs offered in a multiSelect tree → column `ext` (the description has no column output).
 * The names are those of the report field tree (plan 13); columns saved before store "id" for the
 * internal id, which the presentations and the export still read.
 */
const ENUM_EXT = { term: 'term', code: 'code', conceptid: 'conceptid', internalid: 'internalid' };
const ENUM_EXT_LABELS = { code: 'Code', conceptid: 'Concept ID', internalid: 'Internal ID', id: 'Internal ID' };

/** Base multi-field selector used by fieldset, geo and time Query Source helpers. */
export class HFieldSelectionEditor extends HBaseWidget {
  /**
   * @param {object} options Widget configuration.
   * @param {object} options.dbdefs Database definitions used to resolve and label fields (required).
   * @param {string} [options.title] Editor title.
   * @param {string[]|null} [options.selectableTypes] Field types selectable via the tree; null allows all.
   * @param {boolean} [options.allowReorder] Whether selected fields can be reordered.
   * @param {boolean} [options.includeHeaders] Whether record header fields appear in the tree.
   * @param {boolean} [options.hideUnselectable] Whether non-selectable fields are hidden rather than shown disabled.
   * @param {boolean} [options.showSort] Whether the field tree offers a sort control.
   * @param {boolean} [options.multiSelect] Mark several fields in the tree and add them with
   *        "Add selected fields"; enum fields expand to their outputs (Term, Code, ...).
   * @param {boolean} [options.removeAll] Show a "Remove all fields" button.
   * @param {function(Array): void} [options.onChange] Called after every change of the list.
   */
  constructor({ dbdefs, title = 'Fields', selectableTypes = null, allowReorder = true, includeHeaders = false, hideUnselectable = false, showSort = true, multiSelect = false, removeAll = false, onChange = null } = {}) {
    super();
    if (!dbdefs) throw new TypeError('HFieldSelectionEditor requires dbdefs');
    this.dbdefs = dbdefs;
    this.title = title;
    this.selectableTypes = selectableTypes;
    this.allowReorder = allowReorder;
    this.includeHeaders = includeHeaders;
    this.hideUnselectable = hideUnselectable;
    this.showSort = showSort !== false;
    this.multiSelect = multiSelect === true;
    this.removeAll = removeAll === true;
    this.onChange = typeof onChange === 'function' ? onChange : null;
    this.tree = new HFieldTree({ dbdefs });
    this.recordTypeId = null;
    this.fields = [];
  }

  /**
   * @param {number} recordTypeId Record type the field tree is scoped to.
   * @returns {HFieldSelectionEditor} this, for chaining.
   */
  setRecordType(recordTypeId) { this.recordTypeId = Number(recordTypeId) || null; return this; }

  /**
   * @param {Array} value Field descriptors (or field codes/ids) to select.
   * @returns {HFieldSelectionEditor} this, for chaining.
   */
  setValue(value) { this.fields = normalizeFieldDescriptors(value, this.dbdefs).map((x) => ({ ...x })); if (this.isRendered) this._renderRows(); return this; }

  /** @returns {Array} A clone of the selected field descriptors. */
  getValue() { return this.fields.map((x) => ({ ...x })); }

  /** @returns {HFieldSelectionEditor} this, for chaining. */
  render() {
    if (!this.container) throw new Error('HFieldSelectionEditor must be attached before render');
    this.container.className = 'h-qse-helper';
    this.container.replaceChildren();

    const toolbar = document.createElement('div');
    toolbar.className = 'h-qse-helper-toolbar';
    this._add = document.createElement('button');
    this._add.type = 'button';
    this._add.className = 'h-btn h-btn-small';
    this._add.textContent = `+ ${$HR('Add field')}`;
    this._add.addEventListener('click', () => this._openTree());
    toolbar.append(this._add);
    if (this.removeAll) {
      this._clear = document.createElement('button');
      this._clear.type = 'button';
      this._clear.className = 'h-btn h-btn-small';
      this._clear.textContent = $HR('Remove all fields');
      this._clear.addEventListener('click', () => { this.fields = []; this._renderRows(); });
      toolbar.append(this._clear);
    }

    this._rows = document.createElement('div');
    this._rows.className = 'h-qse-helper-rows';
    this.container.append(toolbar, this._rows);
    this._renderRows();
    this.state = 'rendered';
    return this;
  }

  _openTree() {
    if (!this.recordTypeId) return;
    this.tree.open(this._add, {
      rtyId: this.recordTypeId,
      selectableTypes: this.selectableTypes,
      maxDepth: 3,
      includeHeaders: this.includeHeaders,
      hideUnselectable: this.hideUnselectable,
      showSort: this.showSort,
      tall: true,
      // column fields: several at once, values only (no "Any field" / "<type> records")
      ...(this.multiSelect ? {
        multiSelect: true,
        valuesOnly: true,
        enumOutputs: Object.keys(ENUM_EXT),
        onAddSelected: (paths) => {
          paths.forEach((path) => this._addPath(path));
          this._renderRows();
        }
      } : {})
    }, (path) => {
      if (this._addPath(path)) this._renderRows();
    });
  }

  /**
   * Append the field of a tree path unless it is already selected.
   *
   * @param {Array<object>} path Field-tree path.
   * @returns {boolean} Whether a field was added.
   */
  _addPath(path) {
    const field = fieldPathCode(path, this.recordTypeId);
    const leaf = path.at(-1) || {};
    const ext = leaf.term ? ENUM_EXT[leaf.term] || null : null;
    if (!field || this.fields.some((item) => item.field === field && (item.ext || null) === ext)) return false;
    const label = fieldPathLabel(path, this.dbdefs) || fieldCodeLabel(field, this.dbdefs);
    this.fields.push({
      field,
      title: ext && ENUM_EXT_LABELS[ext] ? `${label} (${$HR(ENUM_EXT_LABELS[ext])})` : label,
      visible: true,
      ...(ext ? { ext } : {}),
      _type: leaf.fieldType || null
    });
    return true;
  }

  _renderRows() {
    if (!this._rows) return;
    this._rows.replaceChildren();
    if (this._clear) this._clear.disabled = !this.fields.length;
    this.onChange?.(this.getValue());
    if (!this.fields.length) {
      const empty = document.createElement('div');
      empty.className = 'h-muted';
      empty.textContent = $HR('No fields selected');
      this._rows.append(empty);
      return;
    }
    this.fields.forEach((field, index) => this._rows.append(this._row(field, index)));
  }

  _row(field, index) {
    const row = document.createElement('div');
    row.className = 'h-qse-helper-row';
    row.dataset.field = field.field;

    const label = document.createElement('span');
    label.className = 'h-qse-helper-label';
    label.textContent = field.title || fieldCodeLabel(field.field, this.dbdefs) || field.field;
    label.title = field.field;

    const remove = smallButton('×', $HR('Remove'), () => { this.fields.splice(index, 1); this._renderRows(); });
    if (this.allowReorder) {
      row.append(this._dragHandle());
      this._enableDrag(row, index);
    }
    row.append(label, remove);
    return row;
  }

  /** @returns {HTMLElement} Drag handle of a reorderable row. */
  _dragHandle() {
    const drag = document.createElement('span');
    drag.className = 'h-qse-drag';
    drag.textContent = '↕';
    drag.title = $HR('Drag to reorder');
    return drag;
  }

  /**
   * Make a row draggable: dropping it on another row moves the field there.
   *
   * @param {HTMLElement} row Row element.
   * @param {number} index Index of its field.
   */
  _enableDrag(row, index) {
    row.draggable = true;
    row.addEventListener('dragstart', (event) => {
      this._dragIndex = index;
      event.dataTransfer?.setData('text/plain', String(index));
      event.dataTransfer?.setDragImage?.(row, 12, 12);
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend', () => { row.classList.remove('is-dragging'); this._dragIndex = null; });
    row.addEventListener('dragover', (event) => event.preventDefault());
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      const from = Number(event.dataTransfer?.getData('text/plain') ?? this._dragIndex);
      if (!Number.isInteger(from) || from === index || from < 0 || from >= this.fields.length) return;
      const [item] = this.fields.splice(from, 1);
      const target = from < index ? index - 1 : index;
      this.fields.splice(target, 0, item);
      this._renderRows();
    });
  }

  /** Tear down the field tree popover and the widget itself. */
  async destroy() { this.tree.destroy(); await super.destroy(); }
}

function smallButton(text, title, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'h-btn h-btn-small h-qse-helper-icon';
  button.textContent = text;
  button.title = title;
  button.addEventListener('click', onClick);
  return button;
}
