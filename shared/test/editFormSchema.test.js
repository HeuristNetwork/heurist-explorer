/**
 * @file editFormSchema.test.js
 * @brief The JSON of HEditForm (plan 14a): normalising, showWhen, values in and out.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEditForm, isVisible, formStates, formValues, stateToValue, valueToState, getPath, setPath, formFields
} from '../src/data/editFormSchema.js';

const FORM = {
  format: 'heurist-edit-form/1',
  groups: [
    { type: 'tabs', label: 'A', children: [
      { name: 'title', type: 'freetext', required: true },
      { name: 'tags', type: 'freetext', max: 0 },
      { name: 'size', type: 'integer', default: 12 },
      { name: 'on', type: 'boolean', default: true },
      { name: 'kind', type: 'enum', terms: ['a', 'b'], default: 'a' },
      { name: 'ids', type: 'enum', terms: [{ id: 1, label: 'One' }, { id: 2, label: 'Two' }], max: 0 },
      { name: 'layout.width', type: 'float' },
      { name: 'name', type: 'freetext', multilang: true },
      { dty: 12, type: 'blocktext' }
    ] },
    { id: 'more', type: 'whatever', showWhen: { kind: 'b' }, children: [{ name: 'x', type: 'strange' }] }
  ]
};

test('normalize: defaults, names, requirement, terms and warnings', () => {
  const { form, warnings } = normalizeEditForm(FORM);
  const fields = formFields(form);
  assert.equal(form.groups[0].id, 'g1');
  assert.equal(form.groups[1].type, 'group');
  assert.equal(fields.find((f) => f.name === 'title').req, 'required');
  assert.equal(fields.find((f) => f.name === 'title').max, 1, 'single value by default');
  assert.equal(fields.find((f) => f.name === '12').dty, 12, 'a record field is named by its dty');
  assert.deepEqual(fields.find((f) => f.name === 'kind').terms, [{ id: 'a', label: 'a', depth: 1 }, { id: 'b', label: 'b', depth: 1 }]);
  assert.equal(fields.find((f) => f.name === 'x').type, 'freetext');
  assert.equal(warnings.length, 2, warnings.join('; '));
});

test('showWhen: value, list of values, all entries', () => {
  assert.equal(isVisible(null, {}), true);
  assert.equal(isVisible({ kind: 'b' }, { kind: 'a' }), false);
  assert.equal(isVisible({ kind: ['a', 'b'] }, { kind: 'b' }), true);
  assert.equal(isVisible({ size: '12' }, { size: 12 }), true, 'compared as text');
  assert.equal(isVisible({ on: true }, { on: true }), true);
  assert.equal(isVisible({ tags: 'x' }, { tags: ['y', { value: 'x', hidden: true }] }), true, 'any value of a list');
  assert.equal(isVisible({ kind: 'a', on: true }, { kind: 'a', on: false }), false);
});

test('values: defaults, native types, dotted names, lists and translations', () => {
  const { form } = normalizeEditForm(FORM);
  const states = formStates(form, null);
  const values = formValues(form, states);
  assert.equal(values.title, null);
  assert.deepEqual(values.tags, []);
  assert.equal(values.size, 12);
  assert.equal(values.on, true);
  assert.equal(values.kind, 'a');
  assert.deepEqual(values.layout, { width: null }, 'dotted name nested');

  const edited = formStates(form, {
    title: 'T', tags: ['x', { value: 'y', hidden: true }], size: '5', on: 'false', kind: 'b', ids: [2, '1'],
    layout: { width: '0.5' }, name: ['Main', 'fre:Principal'], 12: 'text'
  });
  const out = formValues(form, edited);
  assert.deepEqual(out.tags, ['x', { value: 'y', hidden: true }]);
  assert.equal(out.size, 5);
  assert.equal(out.on, false);
  assert.deepEqual(out.ids, [2, 1], 'numeric term ids');
  assert.equal(out.layout.width, 0.5);
  assert.deepEqual(out.name, ['Main', 'fre:Principal'], 'multilingual: a list with the translations');
  assert.deepEqual(edited.get('name').translations, [{ lang: 'fre', value: 'Principal', hidden: false }]);
  assert.equal(out['12'], 'text');
  const shown = formValues(form, edited, (field) => field.name !== 'title');
  assert.equal('title' in shown, false, 'fields not shown are left out');
});

test('stateToValue / valueToState round trip; paths', () => {
  const { form } = normalizeEditForm(FORM);
  const tags = formFields(form).find((field) => field.name === 'tags');
  assert.deepEqual(stateToValue(tags, valueToState(tags, ['a', '', null, 'b'])), ['a', 'b']);
  const json = { name: 'j', type: 'json', max: 1 };
  const { form: jsonForm } = normalizeEditForm({ groups: [{ children: [json] }] });
  const field = formFields(jsonForm)[0];
  assert.equal(JSON.parse(stateToValue(field, valueToState(field, { a: 1 }))).a, 1, 'an object of a json field becomes its text');
  const target = {};
  setPath(target, 'a.b.c', 1);
  assert.deepEqual(target, { a: { b: { c: 1 } } });
  assert.equal(getPath(target, 'a.b.c'), 1);
  assert.equal(getPath({ 'a.b': 2 }, 'a.b'), 2, 'a key with the dot wins');
  assert.equal(getPath(target, 'a.x'), undefined);
});

test('width: characters or a CSS length', async () => {
  const { widthOf, cssWidth } = await import('../src/data/editFormSchema.js');
  assert.equal(widthOf(20), 20);
  assert.equal(widthOf('20'), 20);
  assert.equal(widthOf('400px'), '400px');
  assert.equal(widthOf('50%'), '50%');
  assert.equal(widthOf('wide'), 0);
  assert.equal(cssWidth(20), '20ch');
  assert.equal(cssWidth(999), '200ch', 'at most 200 characters');
  assert.equal(cssWidth('400px'), '400px');
  assert.equal(cssWidth(0), '');
});
