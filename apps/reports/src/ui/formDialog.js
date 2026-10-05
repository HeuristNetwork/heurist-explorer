/**
 * @file formDialog.js
 * @brief Small modal form on top of HMsg: text, textarea, number, select,
 *        checkbox, radio and note fields; a fixed prefix before a text input;
 *        characters allowed in an input; fields shown only for some values of
 *        another field.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-reports
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR, HMsg } from '#shared/ui';

const DIALOG_ID = 'h-reports-dialog';

/** Characters of file names and file name suffixes: letters A-Z, digits, "-", "_", "(", ")", space. */
export const FILE_NAME_CHARS = /[^A-Za-z0-9 _()-]/g;

/**
 * Show a form and resolve with its values, or null when cancelled.
 *
 * @param {object} options
 * @param {string} options.title Dialog title (resource key).
 * @param {Array<object>} options.fields Field definitions:
 *        `{name, label, type: text|textarea|number|select|checkbox|radio|note, value,
 *          options: [{value, label}], required, hint, prefix, allowed, showWhen}`.
 *        `prefix`: fixed text shown before a text input (not part of the value);
 *        `allowed`: RegExp of characters removed while typing (e.g. FILE_NAME_CHARS);
 *        `showWhen`: `{field: value}` or `(values) => boolean` - the row is shown only then.
 * @param {string} [options.okLabel='OK'] Label of the confirm button.
 * @param {function(object): (string|null)} [options.validate] Returns an error text or null.
 * @param {string} [options.dialogId] Dialog element id (a second form over an open dialog).
 * @returns {Promise<object|null>}
 */
export function openFormDialog({ title, fields, okLabel = 'OK', validate = null, dialogId = DIALOG_ID }) {
  return new Promise((resolve) => {
    const form = document.createElement('form');
    form.className = 'h-reports-form';
    const inputs = new Map();
    const rows = new Map();
    for (const field of fields) {
      const row = fieldRow(field, inputs);
      rows.set(field.name, row);
      form.append(row);
    }
    const error = document.createElement('div');
    error.className = 'h-reports-form-error';
    form.append(error);

    // conditional rows follow the values of the fields they depend on
    const updateVisibility = () => {
      const values = readValues(fields, inputs);
      for (const field of fields) {
        if (field.showWhen) rows.get(field.name).hidden = !isShown(field, values);
      }
    };
    form.addEventListener('change', updateVisibility);
    form.addEventListener('input', updateVisibility);
    updateVisibility();

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      HMsg.closeMsgDlg(dialogId);
      resolve(value);
    };
    const submit = () => {
      const values = readValues(fields, inputs);
      const missing = fields.find((field) => field.required && isShown(field, values)
        && (values[field.name] === '' || values[field.name] == null));
      const message = missing ? `${$HR(missing.label)}: ${$HR('a value is required')}` : validate?.(values) || null;
      if (message) {
        error.textContent = message;
        return;
      }
      finish(values);
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });

    const dialog = HMsg.showMsgDlg(form, {
      dialogId,
      title,
      buttons: [
        { label: okLabel, class: 'h-btn h-btn-primary', onClick: submit },
        { label: 'Cancel', class: 'h-btn', onClick: () => finish(null) }
      ]
    });
    dialog.addEventListener('close', () => finish(null), { once: true });
    form.querySelector('input:not([type=hidden]), select')?.focus?.();
  });
}

/** Whether a field with `showWhen` is shown for these values. */
function isShown(field, values) {
  if (!field.showWhen) return true;
  if (typeof field.showWhen === 'function') return field.showWhen(values) === true;
  return Object.entries(field.showWhen).every(([name, value]) => String(values[name]) === String(value));
}

/** One labelled form row. */
function fieldRow(field, inputs) {
  const row = document.createElement('div');
  row.className = `h-reports-form-row h-reports-form-${field.type || 'text'}`;
  if (field.type === 'note') {
    row.textContent = $HR(field.label);
    row.classList.add('h-muted');
    return row;
  }
  const label = document.createElement('label');
  const caption = document.createElement('span');
  caption.className = 'h-reports-form-label';
  caption.textContent = $HR(field.label);

  if (field.type === 'radio') {
    const group = document.createElement('div');
    group.className = 'h-reports-form-radios';
    const radios = [];
    for (const option of field.options || []) {
      const optionLabel = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = field.name;
      radio.value = String(option.value);
      radio.checked = String(option.value) === String(field.value);
      radio.disabled = option.disabled === true;
      optionLabel.append(radio, ` ${option.label}`);
      group.append(optionLabel);
      radios.push(radio);
    }
    row.append(caption, group);
    inputs.set(field.name, radios);
    return row;
  }

  let input;
  if (field.type === 'select') {
    input = document.createElement('select');
    input.className = 'h-select';
    for (const option of field.options || []) {
      const element = document.createElement('option');
      element.value = String(option.value);
      element.textContent = option.label;
      element.selected = String(option.value) === String(field.value ?? '');
      input.append(element);
    }
  } else if (field.type === 'textarea') {
    input = document.createElement('textarea');
    input.className = 'h-input h-reports-form-textarea';
    input.rows = field.rows || 3;
    input.value = field.value ?? '';
  } else {
    input = document.createElement('input');
    input.type = field.type === 'checkbox' ? 'checkbox' : field.type === 'number' ? 'number' : 'text';
    input.className = field.type === 'checkbox' ? 'h-checkbox' : 'h-input';
    if (field.type === 'checkbox') input.checked = field.value === true;
    else input.value = field.value ?? '';
    if (field.type === 'number') input.min = '0';
  }
  input.name = field.name;
  if (field.allowed) {
    input.value = String(input.value).replace(field.allowed, '');
    input.addEventListener('input', () => {
      const cleaned = input.value.replace(field.allowed, '');
      if (cleaned !== input.value) input.value = cleaned;
    });
  }

  if (field.type === 'checkbox') {
    label.append(input, caption);
  } else if (field.prefix) {
    const line = document.createElement('span');
    line.className = 'h-reports-form-prefixed';
    const prefix = document.createElement('span');
    prefix.className = 'h-reports-form-prefix';
    prefix.textContent = field.prefix;
    prefix.title = field.prefix;
    line.append(prefix, input);
    label.append(caption, line);
  } else {
    label.append(caption, input);
  }
  row.append(label);
  if (field.hint) {
    const hint = document.createElement('div');
    hint.className = 'h-reports-form-hint h-muted';
    hint.textContent = $HR(field.hint);
    row.append(hint);
  }
  inputs.set(field.name, input);
  return row;
}

/** Values of all inputs by field name. */
function readValues(fields, inputs) {
  const values = {};
  for (const field of fields) {
    const input = inputs.get(field.name);
    if (!input) continue;
    if (field.type === 'radio') values[field.name] = input.find((radio) => radio.checked)?.value ?? null;
    else if (field.type === 'checkbox') values[field.name] = input.checked === true;
    else if (field.type === 'number') values[field.name] = input.value === '' ? null : Number(input.value);
    else values[field.name] = String(input.value ?? '').trim();
  }
  return values;
}

/**
 * Yes/No confirmation.
 *
 * @param {string} message Message (resource key or text).
 * @param {{title?: string, yesLabel?: string, dialogId?: string}} [options]
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, { title = 'Please confirm', yesLabel = 'Yes', dialogId = DIALOG_ID } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      HMsg.closeMsgDlg(dialogId);
      resolve(value);
    };
    const text = document.createElement('div');
    text.textContent = message;
    const dialog = HMsg.showMsgDlg(text, {
      dialogId,
      title,
      buttons: [
        { label: yesLabel, class: 'h-btn h-btn-primary', onClick: () => finish(true) },
        { label: 'Cancel', class: 'h-btn', onClick: () => finish(false) }
      ]
    });
    dialog.addEventListener('close', () => finish(false), { once: true });
  });
}
