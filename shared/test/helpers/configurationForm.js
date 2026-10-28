/**
 * @file configurationForm.js
 * @brief Test helper (plan 29 §11): a module configuration form JSON and the module
 *        defaults have the same keys, and the form gives the defaults back.
 */

import assert from 'node:assert/strict';
import { formFields, normalizeEditForm } from '../../src/data/editFormSchema.js';

/**
 * Dotted keys of the leaves of a settings object (null, scalars, lists).
 *
 * @param {object} value Settings `{options, config}`.
 * @param {string} [prefix] Key so far.
 * @returns {string[]} Keys.
 */
export function settingsKeys(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, item]) => settingsKeys(item, prefix ? `${prefix}.${key}` : key));
}

/**
 * Check a configuration form against the module defaults: every field is a key of the
 * defaults, every key of the defaults is a field (shown or `req: 'forbidden'`), and the
 * default of each field is the module default. `publish.*` fields (publication options) are left out.
 *
 * @param {object} json Form JSON.
 * @param {{options: object, config: object}} defaults Module defaults.
 * @param {string[]} [extra] Defaults keys a field holds as a whole (e.g. an extent object).
 * @returns {void}
 */
export function assertFormMatchesDefaults(json, defaults, extra = []) {
  const { form, warnings } = normalizeEditForm(json);
  assert.deepEqual(warnings, []);
  // publish.* are options of a publication, not settings (plan 29)
  const fields = formFields(form).filter((field) => !field.name.startsWith('publish.'));
  const names = fields.map((field) => field.name);
  const keys = settingsKeys(defaults).filter((key) => !extra.some((whole) => key.startsWith(`${whole}.`)));
  for (const whole of extra) if (!keys.includes(whole)) keys.push(whole);
  assert.deepEqual(names.filter((name) => !keys.includes(name)), [], 'form fields that are not settings');
  assert.deepEqual(keys.filter((key) => !names.includes(key)), [], 'settings without a form field');
  for (const field of fields) {
    const expected = field.name.split('.').reduce((object, part) => object?.[part], defaults);
    assert.deepEqual(field.default ?? null, expected ?? null, `default of ${field.name}`);
  }
}

/**
 * The texts of a configuration form shown to the user: group and field labels, help, the
 * label of the empty choice and term labels (no-UI fields left out), plus the texts of the
 * common dialog.
 *
 * @param {object} json Form JSON.
 * @returns {string[]} Texts, each once.
 */
export function formCaptions(json) {
  const texts = ['Advanced settings', 'Reset', 'Apply', 'Save', 'Publish', 'Cancel', 'Confirm', 'Discard',
    'Discard changes?', 'Reset all settings to their defaults?', 'Cancel publish?', 'Yes', 'No'];
  for (const group of json.groups || []) {
    if (group.label) texts.push(group.label);
    for (const field of group.children || []) {
      if (field.req === 'forbidden') continue;
      for (const key of ['label', 'help', 'emptyLabel']) if (field[key]) texts.push(field[key]);
      for (const term of field.terms || []) if (term && typeof term === 'object' && term.label) texts.push(term.label);
    }
  }
  // a number needs no translation (page sizes, limits)
  return [...new Set(texts)].filter((text) => !/^\d+$/.test(text));
}
