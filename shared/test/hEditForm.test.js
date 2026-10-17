/**
 * @file hEditForm.test.js
 * @brief HEditForm with the fake DOM (plan 14a): every field type, checks,
 *        showWhen, behaviour by code, events and issues.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';

const document = installFakeDom();
// the value pickers use Node
globalThis.Node ??= globalThis.HTMLElement;
const { HEditForm } = await import('../src/widgets/edit-form/HEditForm.js');

const host = () => { const element = document.createElement('div'); document.body.append(element); return element; };
const apiClient = { get: async () => ({ records: [] }), request: async () => ({}) };

// every type except date: its calendar picker needs a real DOM (checked with the Test edit form tool)
const ALL_TYPES = ['freetext', 'blocktext', 'url', 'integer', 'float', 'year', 'boolean', 'enum',
  'resource', 'file', 'geo', 'color', 'json', 'special'];

const FORM = {
  groups: [
    { id: 'all', type: 'tabs', label: 'All', children: ALL_TYPES.map((type) => ({
      name: type, type, max: 0, ...(type === 'enum' ? { terms: ['a', 'b', 'c'] } : {})
    })) },
    { id: 'rules', type: 'accordion', label: 'Rules', children: [
      { name: 'mode', type: 'enum', terms: ['icon', 'image'], default: 'icon', req: 'required' },
      { name: 'image.url', type: 'url', req: 'required', showWhen: { mode: 'image' } },
      { name: 'code', type: 'freetext', pattern: '[a-z]*', patternMessage: 'Small letters only', maxLength: 5 },
      { name: 'size', type: 'integer', min: 1, maxValue: 10 },
      { name: 'title', type: 'freetext', req: 'required' }
    ] },
    { id: 'extra', type: 'group', label: 'Extra', slot: 'note', children: [{ name: 'extra', type: 'freetext' }] }
  ]
};

/** A rendered form. */
function makeForm(options = {}) {
  const element = host();
  const events = [];
  element.addEventListener('h-edit-form-ready', () => events.push('ready'));
  element.addEventListener('h-edit-form-change', (event) => events.push(`change:${event.detail.name}`));
  const form = new HEditForm().attach(element, { form: FORM, apiClient, ...options }).render();
  return { form, element, events };
}

test('every field type is rendered as a repeatable field', async () => {
  const { form, element, events } = makeForm();
  assert.deepEqual(form.warnings, []);
  for (const type of ALL_TYPES) {
    const widget = form.getFieldWidget(type);
    assert.ok(widget, type);
    assert.equal(widget.isRepeatable, true, `${type} repeatable`);
  }
  assert.equal(element.querySelectorAll('button.h-edit-form-tab').length, 1);
  assert.ok(element.querySelector('.h-edit-form-accordion'));
  assert.deepEqual(events, ['ready']);
  assert.equal(form.isDirty(), false);
  await form.destroy();
});

test('values: defaults out, given values in, change event and dirty', async () => {
  const { form, events } = makeForm({ values: { freetext: ['one', 'two'], integer: [3], extra: 'x' } });
  const values = form.getValues();
  assert.deepEqual(values.freetext, ['one', 'two']);
  assert.deepEqual(values.integer, [3]);
  assert.equal(values.mode, 'icon', 'default value');
  assert.equal('image' in values, false, 'field hidden by showWhen is left out');
  form.getFieldWidget('extra')._rows[0].input.setValue('y');
  form.getFieldWidget('extra')._rows[0].input.notifyChange();
  assert.equal(form.isDirty(), true);
  assert.ok(events.includes('change:extra'));
  await form.setValue('freetext', ['three']);
  assert.deepEqual(form.getValue('freetext'), ['three']);
  await form.destroy();
});

test('showWhen follows the values; hidden fields are not checked', async () => {
  const { form } = makeForm({ values: { title: 'T' } });
  const url = form.getFieldWidget('image.url');
  assert.equal(url.container.hidden, true);
  assert.deepEqual(form.validate(), [], 'hidden required field is not checked');
  await form.setValue('mode', 'image');
  assert.equal(url.container.hidden, false);
  const problems = form.validate();
  assert.deepEqual(problems.map((problem) => problem.field), ['image.url']);
  assert.ok(url.container.classList.contains('has-error'));
  await form.destroy();
});

test('field checks: required, pattern, length, number range, JSON, cross-field validate', async () => {
  const { form } = makeForm({
    values: { code: 'ABCDEFG', size: 20, json: ['{bad'] },
    validate: (values) => (values.extra ? null : [{ field: 'extra', message: 'Extra is needed' }])
  });
  const byField = Object.fromEntries(form.validate().map((problem) => [problem.field, problem.message]));
  assert.ok(byField.title, 'required');
  assert.ok(byField.code, 'pattern or length');
  assert.ok(byField.size, 'number range');
  assert.ok(byField.json, 'JSON');
  assert.equal(byField.extra, 'Extra is needed');
  await form.destroy();
});

test('behaviour by code: showGroup, showField, updateField, slot', async () => {
  const { form, element } = makeForm({
    onReady: (ready) => ready.showGroup('extra', false)
  });
  const extra = element.querySelector('.h-edit-form-group');
  assert.equal(extra.hidden, true, 'hidden in onReady');
  assert.equal('extra' in form.getValues(), false);
  form.showGroup('extra', true);
  assert.equal(extra.hidden, false);
  assert.ok(form.getSlot('note'), 'slot element');
  form.showField('title', false);
  assert.equal(form.validate().some((problem) => problem.field === 'title'), false);
  form.showField('title', true);
  await form.updateField('title', { required: false, label: 'Caption' });
  assert.equal(form.getFieldWidget('title').labelElement.textContent, 'Caption');
  assert.equal(form.validate().some((problem) => problem.field === 'title'), false);
  await form.destroy();
});

test('issues beside fields; unknown fields come back', async () => {
  const { form } = makeForm();
  const other = form.setIssues([
    { field: 'title', severity: 'warning', message: 'Short' },
    { field: 'nope', message: 'Elsewhere' }
  ]);
  assert.deepEqual(other.map((issue) => issue.message), ['Elsewhere']);
  assert.ok(form.getFieldWidget('title').container.classList.contains('has-warning'));
  await flush?.();
  await form.destroy();
});
