import { HFieldSelectionEditor } from './HFieldSelectionEditor.js';
import { fieldCodeLabel } from './fieldPathUtils.js';
import { $HR } from '#shared/ui';

/** Ordered Data-presentation column field-set editor built on HFieldTree. */
export class HFieldSetEditor extends HFieldSelectionEditor {
  constructor(options = {}) { super({ ...options, title: 'Column fields', includeHeaders: true, allowReorder: true }); }

  getValue() {
    return this.fields.map(({ _type, ...field }) => ({ ...field }));
  }

  _row(field, index) {
    const row = document.createElement('div');
    row.className = 'h-qse-fieldset-row';
    row.dataset.field = field.field;
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

    const drag = document.createElement('span');
    drag.className = 'h-qse-drag';
    drag.textContent = '↕';
    drag.title = $HR('Drag to reorder');

    const visible = document.createElement('input');
    visible.type = 'checkbox';
    visible.checked = field.visible !== false;
    visible.title = $HR('Visible');
    visible.addEventListener('change', () => { field.visible = visible.checked; });

    const name = document.createElement('span');
    name.className = 'h-qse-fieldset-name';
    name.textContent = fieldCodeLabel(field.field, this.dbdefs) || field.title || field.field;
    name.title = field.field;

    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'h-input h-qse-fieldset-title';
    title.value = field.title || fieldCodeLabel(field.field, this.dbdefs) || '';
    title.placeholder = $HR('Column title');
    title.addEventListener('input', () => { field.title = title.value || null; });

    const width = document.createElement('input');
    width.type = 'text';
    width.className = 'h-input h-qse-fieldset-width';
    width.value = field.width || '';
    width.placeholder = $HR('Auto');
    width.title = $HR('Width');
    width.addEventListener('input', () => { field.width = width.value || null; });

    const aggregation = document.createElement('select');
    aggregation.className = 'h-select h-qse-fieldset-aggregation';
    for (const [value, label] of [['', ''], ['count', 'Count'], ['sum', 'Sum'], ['avg', 'Average'], ['min', 'Minimum'], ['max', 'Maximum']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; aggregation.append(option);
    }
    aggregation.value = field.aggregation || '';
    aggregation.title = $HR('Aggregation');
    aggregation.addEventListener('change', () => { field.aggregation = aggregation.value || null; });

    const remove = smallButton('×', $HR('Remove'), () => { this.fields.splice(index, 1); this._renderRows(); });
    row.append(drag, visible, name, title, width, aggregation, remove);
    return row;
  }
}

function smallButton(text, title, onClick) {
  const button = document.createElement('button'); button.type = 'button';
  button.className = 'h-btn h-btn-small h-qse-helper-icon'; button.textContent = text; button.title = title;
  button.addEventListener('click', onClick); return button;
}
