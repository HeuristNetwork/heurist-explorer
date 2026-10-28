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
 * default of each field is the module default.
 *
 * @param {object} json Form JSON.
 * @param {{options: object, config: object}} defaults Module defaults.
 * @param {string[]} [extra] Defaults keys a field holds as a whole (e.g. an extent object).
 * @returns {void}
 */
export function assertFormMatchesDefaults(json, defaults, extra = []) {
  const { form, warnings } = normalizeEditForm(json);
  assert.deepEqual(warnings, []);
  const fields = formFields(form);
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
