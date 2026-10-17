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
      { name: 'size', type: 'integer', minValue: 1, maxValue: 10 },
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

test('radios of text ids are one group; showWhen shows and hides again (2026-10-17)', async () => {
  const { form } = makeForm({ form: {
    groups: [{ children: [
      { name: 'mode', type: 'enum', mode: 'radio', default: 'icon', terms: [{ id: 'icon', label: 'Icon' }, { id: 'circle', label: 'Circle' }] },
      { name: 'font', type: 'freetext', showWhen: { mode: 'icon' } },
      { name: 'radius', type: 'integer', showWhen: { mode: 'circle' } }
    ] }]
  } });
  await flush();
  const radios = form.getFieldWidget('mode')._rows[0].input.choices;
  assert.deepEqual(radios.map((radio) => radio.value), ['icon', 'circle'], 'text ids, not NaN');
  assert.equal(new Set(radios.map((radio) => radio.name)).size, 1, 'one radio group');
  const font = form.getFieldWidget('font').container;
  const radius = form.getFieldWidget('radius').container;
  assert.deepEqual([font.hidden, radius.hidden], [false, true]);
  const pick = (index) => { radios[index].checked = true; radios[index].dispatchEvent(new Event('change')); };
  pick(1);
  assert.equal(form.getValue('mode'), 'circle');
  assert.deepEqual([font.hidden, radius.hidden], [true, false], 'circle shown');
  pick(0);
  assert.deepEqual([font.hidden, radius.hidden], [false, true], 'icon shown again');
  await form.destroy();
});

test('number limits on the spinner; Add in front of the first value; extent and feature values', async () => {
  const { form } = makeForm({ form: {
    groups: [{ children: [
      { name: 'size', type: 'integer', max: 0, minValue: 1, maxValue: 10 },
      { name: 'box', type: 'geo', geoKind: 'extent', default: { west: 1, south: 2, east: 3, north: 4 } },
      { name: 'shape', type: 'geo', default: 'POINT(1 2)' }
    ] }]
  } });
  const size = form.getFieldWidget('size');
  const control = size._rows[0].input.control;
  assert.deepEqual([control.min, control.max], ['1', '10']);
  assert.equal(control.parentElement.parentElement.children[0], size._rows[0].input.actionsHost, 'actions before the control');
  assert.deepEqual(form.getValues(), { size: [], box: { west: 1, south: 2, east: 3, north: 4 }, shape: 'POINT(1 2)' },
    'empty fields are in the values');
  await form.destroy();
});

test('geo feature: the map button draws a geometry; extent keeps the extent picker', async () => {
  const calls = [];
  const { form } = makeForm({
    form: { groups: [{ children: [
      { name: 'shape', type: 'geo', default: 'POINT(1 2)' },
      { name: 'box', type: 'geo', geoKind: 'extent' }
    ] }] },
    selectGeometry: async (current) => { calls.push(['draw', current]); return { type: 'pl', wkt: 'POLYGON((0 0,1 0,1 1,0 0))' }; },
    selectExtent: async () => { calls.push(['extent']); return { west: 1, south: 2, east: 3, north: 4 }; }
  });
  const shape = form.getFieldWidget('shape');
  shape._rows[0].input.mapButton.click();
  await flush();
  form.getFieldWidget('box')._rows[0].input.mapButton.click();
  await flush();
  assert.deepEqual(calls, [['draw', 'POINT(1 2)'], ['extent']]);
  assert.equal(form.getValue('shape'), 'POLYGON((0 0,1 0,1 1,0 0))');
  assert.equal(shape.getState().values[0].geoType, 'pl', 'the drawn type for the record value');
  assert.deepEqual(form.getValue('box'), { west: 1, south: 2, east: 3, north: 4 });
  await form.destroy();
});

test('width on any input type: radios 400px, text 20 characters', async () => {
  const { form } = makeForm({ form: { groups: [{ children: [
    { name: 'mode', type: 'enum', mode: 'radio', width: '400px', terms: ['a', 'b'] },
    { name: 'text', type: 'freetext', width: 20 },
    { name: 'plain', type: 'freetext' }
  ] }] } });
  const host = (name) => form.getFieldWidget(name)._rows[0].element.children[0];
  assert.ok(host('mode').classList.contains('has-display-width'));
  assert.equal(host('mode').style['--h-field-width'], '400px');
  assert.ok(form.getFieldWidget('text').container.classList.contains('has-display-width'));
  assert.equal(host('plain').classList.contains('has-display-width'), false);
  await form.destroy();
});

test('pointer field: Edit and View buttons for the chosen record', async () => {
  const calls = [];
  const { form } = makeForm({
    form: { groups: [{ children: [{ name: 'ref', type: 'resource' }, { name: 'other', type: 'resource' }] }] },
    values: { ref: 12 },
    editRecord: async (id) => { calls.push(['edit', id]); return { saved: true, record: { rec_ID: id, rec_Title: '<b>New title</b>' } }; },
    viewRecord: (id) => calls.push(['view', id])
  });
  const input = form.getFieldWidget('ref')._rows[0].input;
  assert.equal(input.editButton.hidden, false);
  assert.equal(input.viewButton.hidden, false);
  assert.equal(form.getFieldWidget('other')._rows[0].input.editButton.hidden, true, 'no record: no buttons');
  input.viewButton.click();
  input.editButton.click();
  await flush();
  assert.deepEqual(calls, [['view', 12], ['edit', 12]]);
  assert.equal(input.source.labelFor(12), 'New title', 'the saved title is shown');
  assert.ok(input.container.classList.contains('h-form-input-compact'));
  await form.destroy();
});
