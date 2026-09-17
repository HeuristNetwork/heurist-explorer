import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR } from '#shared/ui';
import { HFieldTree } from '../../filter-builder/HFieldTree.js';
import { fieldPathCode, fieldPathLabel, fieldCodeLabel, normalizeFieldDescriptors } from './fieldPathUtils.js';
import './QuerySourceHelpers.css';

/** Base multi-field selector used by fieldset, geo and time Query Source helpers. */
export class HFieldSelectionEditor extends HBaseWidget {
  constructor({ dbdefs, title = 'Fields', selectableTypes = null, allowReorder = true, includeHeaders = false, hideUnselectable = false, showSort = true } = {}) {
    super();
    if (!dbdefs) throw new TypeError('HFieldSelectionEditor requires dbdefs');
    this.dbdefs = dbdefs;
    this.title = title;
    this.selectableTypes = selectableTypes;
    this.allowReorder = allowReorder;
    this.includeHeaders = includeHeaders;
    this.hideUnselectable = hideUnselectable;
    this.showSort = showSort !== false;
    this.tree = new HFieldTree({ dbdefs });
    this.recordTypeId = null;
    this.fields = [];
  }

  setRecordType(recordTypeId) { this.recordTypeId = Number(recordTypeId) || null; return this; }
  setValue(value) { this.fields = normalizeFieldDescriptors(value, this.dbdefs).map((x) => ({ ...x })); if (this.isRendered) this._renderRows(); return this; }
  getValue() { return this.fields.map((x) => ({ ...x })); }

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
      showSort: this.showSort
    }, (path) => {
      const field = fieldPathCode(path, this.recordTypeId);
      if (!field || this.fields.some((item) => item.field === field)) return;
      this.fields.push({ field, title: fieldPathLabel(path, this.dbdefs) || fieldCodeLabel(field, this.dbdefs), visible: true, _type: path.at(-1)?.fieldType || null });
      this._renderRows();
    });
  }

  _renderRows() {
    if (!this._rows) return;
    this._rows.replaceChildren();
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
    row.append(label);
    if (this.allowReorder) {
      row.append(
        smallButton('↑', $HR('Move up'), () => this._move(index, -1)),
        smallButton('↓', $HR('Move down'), () => this._move(index, 1))
      );
    }
    row.append(remove);
    return row;
  }

  _move(index, delta) {
    const next = index + delta;
    if (next < 0 || next >= this.fields.length) return;
    const [item] = this.fields.splice(index, 1);
    this.fields.splice(next, 0, item);
    this._renderRows();
  }

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
