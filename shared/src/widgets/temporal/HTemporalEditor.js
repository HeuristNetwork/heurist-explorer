/**
 * @file HTemporalEditor.js
 * @brief Temporal editor popup (plan 19; port of the legacy editTemporalObject):
 *        four kinds of date as tabs - Simple date, Simple range, Fuzzy range,
 *        Radiometric - each an HEditForm of its own JSON form.
 *
 * The stored value (plain date text or temporal JSON) is read into the values of
 * one form and written back on OK (temporalValues.js). A tab switch keeps the
 * values entered so far and carries the dates over (a simple date becomes the
 * earliest estimate, a range the terminus dates). Only the Gregorian calendar is
 * edited: a value with another calendar is shown read only.
 *
 *   const value = await openTemporalEditor(text);   // undefined: cancelled
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

import { HEditForm } from '../edit-form/HEditForm.js';
import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';
import { formToTemporal, rangeApart, temporalToForm, validateTemporal } from './temporalValues.js';
import simpleForm from './temporalSimple.json';
import rangeForm from './temporalRange.json';
import fuzzyForm from './temporalFuzzy.json';
import radiometricForm from './temporalRadiometric.json';
import './HTemporalEditor.css';

/** The tabs: kind, label and form JSON. */
const KINDS = Object.freeze([
  { kind: 's', label: 'Simple date', form: simpleForm },
  { kind: 'r', label: 'Simple range', form: rangeForm },
  { kind: 'p', label: 'Fuzzy range', form: fuzzyForm },
  { kind: 'c', label: 'Radiometric', form: radiometricForm }
]);

/**
 * Edit a date value in a dialog.
 *
 * @param {string|object|null} value Plain date text or temporal JSON (text or object).
 * @param {object} [options]
 * @param {boolean} [options.readOnly] Display only.
 * @param {string} [options.title] Dialog title.
 * @returns {Promise<string|undefined>} The new value ('' when emptied), undefined when cancelled.
 */
export function openTemporalEditor(value, options = {}) {
  const start = temporalToForm(value);
  const readOnly = Boolean(options.readOnly || start.readOnly);
  const body = document.createElement('div');
  body.className = 'h-temporal-editor';

  const notes = [];
  if (start.calendar) {
    notes.push(`${$HR('Calendar')}: ${start.calendar}${start.native ? ` (${start.native})` : ''}. `
      + $HR('Dates in this calendar can be changed in the legacy editor only.'));
  }
  if (start.note) notes.push($HR(start.note));
  if (notes.length) {
    const note = document.createElement('div');
    note.className = 'h-temporal-editor-note';
    note.textContent = notes.join(' ');
    body.append(note);
  }

  const tabs = document.createElement('div');
  tabs.className = 'h-edit-form-tabs h-temporal-editor-tabs';
  const strip = document.createElement('div');
  strip.className = 'h-edit-form-tab-strip';
  strip.setAttribute('role', 'tablist');
  tabs.append(strip);
  const formHost = document.createElement('div');
  formHost.className = 'h-temporal-editor-form';
  formHost.setAttribute('role', 'tabpanel');
  tabs.append(formHost);
  body.append(tabs);

  let kind = start.kind;
  let bag = compact(start.values);
  let form = null;

  const buttons = new Map();
  for (const item of KINDS) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'h-edit-form-tab h-i18n';
    tab.setAttribute('role', 'tab');
    tab.textContent = $HR(item.label);
    tab.disabled = readOnly && item.kind !== kind;
    tab.addEventListener('click', () => void showKind(item.kind));
    strip.append(tab);
    buttons.set(item.kind, tab);
  }

  /** Make the form of a kind with the values entered so far. */
  const showKind = async (next) => {
    if (form) {
      // the fields of this form replace the kept values (also when emptied)
      const values = form.getValues();
      for (const name of Object.keys(values)) delete bag[name];
      bag = { ...bag, ...compact(values) };
      await form.destroy();
    }
    kind = next;
    for (const [key, tab] of buttons) {
      tab.classList.toggle('is-active', key === kind);
      tab.setAttribute('aria-selected', String(key === kind));
    }
    const item = KINDS.find((entry) => entry.kind === kind);
    form = new HEditForm().attach(formHost, {
      form: item.form,
      values: carry(kind, bag),
      readOnly,
      onReady: (ready) => prepareForm(kind, ready),
      onChange: (changed) => updateForm(kind, changed),
      validate: (values) => validateTemporal(kind, values).map((problem) => ({ ...problem, message: $HR(problem.message) }))
    });
    form.render();
  };

  return new Promise((resolve) => {
    const id = `h-temporal-editor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let finished = false;
    const finish = async (result) => {
      if (finished) return;
      finished = true;
      HMsg.closeMsgDlg(id);
      await form?.destroy();
      resolve(result);
    };
    const dialogButtons = readOnly
      ? [{ label: $HR('Close'), class: 'h-btn', onClick: () => void finish(undefined) }]
      : [
        {
          label: $HR('OK'),
          class: 'h-btn h-btn-primary',
          onClick: () => {
            if (!form || form.validate().length) return;
            void finish(formToTemporal(kind, form.getValues()));
          }
        },
        { label: $HR('Cancel'), class: 'h-btn', onClick: () => void finish(undefined) }
      ];
    const dialog = HMsg.showMsgDlg(body, {
      dialogId: id,
      title: options.title || $HR('Temporal object'),
      preventClose: true,
      buttons: dialogButtons
    });
    dialog?.classList.add('h-temporal-editor-dialog');
    dialog?.addEventListener('close', () => void finish(undefined), { once: true });
    void showKind(kind);
  });
}

/**
 * Values of a kind from the values entered so far: the dates of another kind are
 * carried over when the fields of this kind are empty.
 *
 * @param {string} kind Kind shown.
 * @param {object} values Values entered so far (all kinds).
 * @returns {object} Values of the form.
 */
export function carry(kind, values) {
  const result = { ...values };
  if (kind === 'r') {
    if (!result.earliest) result.earliest = values.tpq || values.date || undefined;
    if (!result.latest) result.latest = values.taq || undefined;
  } else if (kind === 'p') {
    if (!result.tpq) result.tpq = values.earliest || values.date || undefined;
    if (!result.taq) result.taq = values.latest || undefined;
  } else if (kind === 's') {
    if (!result.date) result.date = values.earliest || values.tpq || undefined;
  }
  return compact(result);
}

/** Slots of a form: the range line under the dates, the "set" buttons of the fuzzy range. */
function prepareForm(kind, form) {
  if (kind === 'r') {
    const slot = form.getSlot('rangeApart');
    slot?.parentElement?.append(slot);
    updateRange(form);
  } else if (kind === 'p') {
    const slot = form.getSlot('fuzzySet');
    if (!slot || form.options.readOnly) return;
    slot.parentElement?.append(slot);
    slot.classList.add('h-temporal-editor-set');
    slot.append(
      setButton('Probable begin = Terminus Post Quem', () => copyValue(form, 'tpq', 'pdb')),
      setButton('Probable end = Terminus Ante Quem', () => copyValue(form, 'taq', 'pde'))
    );
  }
}

/** After a value changed. */
function updateForm(kind, form) {
  if (kind === 'r') updateRange(form);
}

/** "N years M months D days apart" of the simple range. */
function updateRange(form) {
  const slot = form.getSlot('rangeApart');
  if (!slot) return;
  const apart = rangeApart(form.getValue('earliest'), form.getValue('latest'));
  slot.textContent = apart
    ? `${$HR('Range')}: ${apart.years} ${$HR('years')} ${apart.months} ${$HR('months')} ${apart.days} ${$HR('days apart')}`
    : '';
  slot.classList.add('h-temporal-editor-range');
}

/** Copy one date of the fuzzy range to another field. */
function copyValue(form, from, to) {
  const value = form.getValue(from);
  if (value) void form.setValue(to, value);
}

/** A small button of a slot. */
function setButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'h-btn h-btn-small h-i18n';
  button.textContent = $HR(label);
  button.addEventListener('click', onClick);
  return button;
}

/** Values without the empty ones (so that the fields get their defaults). */
function compact(values) {
  const result = {};
  for (const [name, value] of Object.entries(values || {})) {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) continue;
    result[name] = value;
  }
  return result;
}
