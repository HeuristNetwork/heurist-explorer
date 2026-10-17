/**
 * @file editFormTestSample.test.js
 * @brief The test JSON of the "Test edit form" tool (plan 14a) is a valid form
 *        with every field type, all repeatable on the tabs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEditForm, formFields, formStates, formValues, EDIT_FIELD_TYPES } from '../../../shared/src/data/editFormSchema.js';
import sample from '../src/dev/editFormTestSample.json' with { type: 'json' };

test('the test JSON has no warnings and every field type', () => {
  const { form, warnings } = normalizeEditForm(sample);
  assert.deepEqual(warnings, []);
  const types = new Set(formFields(form).map((field) => field.type));
  for (const type of EDIT_FIELD_TYPES.filter((item) => !['relationtype', 'relmarker'].includes(item))) {
    assert.ok(types.has(type), type);
  }
  const tabFields = form.groups.filter((group) => group.type === 'tabs').flatMap((group) => group.children);
  assert.ok(tabFields.every((field) => field.max === 0), 'all repeatable on the tabs');
});

test('the default values of the test JSON', () => {
  const { form } = normalizeEditForm(sample);
  const values = formValues(form, formStates(form, null));
  assert.equal(values.mode, 'icon');
  assert.deepEqual(values.icon, { font: 'fa-house', size: 16 });
  assert.equal(values.enabled, false);
  assert.deepEqual(values.layout, { labels: 'auto', width: 300 });
});
