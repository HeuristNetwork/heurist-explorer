/**
 * @file hEditFormConfigRules.test.js
 * @brief The module configuration rules of HEditForm (plan 29 §9): req optional / forbidden,
 *        modes, forced values, simplified interface, keepHidden and termsSource.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';
import { forcedValue, normalizeEditForm, resolveTermsSources, ruleHides, formFields } from '../src/data/editFormSchema.js';

const document = installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const { HEditForm } = await import('../src/widgets/edit-form/HEditForm.js');

const host = () => { const element = document.createElement('div'); document.body.append(element); return element; };

const FORM = {
  format: 'heurist-edit-form/1',
  groups: [
    { id: 'interface', label: 'Interface', children: [
      { name: 'options.ui.showHeader', type: 'boolean', req: 'recommended', default: false },
      { name: 'options.ui.showOptions', type: 'boolean', req: 'forbidden', default: true, forced: { website: false, publication: false } },
      { name: 'options.ui.language', type: 'enum', terms: ['auto', 'eng'], req: 'forbidden', default: 'auto',
        modes: ['publication'] },
      { name: 'options.ui.expanded', type: 'boolean', req: 'recommended', default: false, simplified: { value: false } }
    ] },
    { id: 'native', label: 'Native controls', modes: ['configuration', 'website'], children: [
      { name: 'options.nativeControls.zoom', type: 'boolean', req: 'recommended', default: true }
    ] },
    { id: 'more', label: 'More', req: 'optional', children: [
      { name: 'config.defaults.limit', type: 'integer', req: 'recommended', default: 10 },
      { name: 'config.defaults.cluster', type: 'boolean', req: 'optional', default: false },
      { name: 'config.defaults.pixels', type: 'integer', default: 20, showWhen: { 'config.defaults.cluster': true } }
    ] }
  ]
};

/** A rendered configuration form. */
function makeForm(options = {}) {
  return new HEditForm().attach(host(), { form: FORM, keepHidden: true, ...options }).render();
}

/** @returns {boolean} Whether the field's container is hidden. */
function hidden(form, name) {
  return form.getFieldWidget(name).container.hidden === true;
}

test('ruleHides and forcedValue', () => {
  const { form } = normalizeEditForm(FORM);
  const field = (name) => formFields(form).find((item) => item.name === name);
  assert.equal(ruleHides(field('options.ui.showOptions'), {}), true, 'forbidden: never shown');
  assert.equal(ruleHides(field('config.defaults.cluster'), { showOptional: false }), true);
  assert.equal(ruleHides(field('config.defaults.cluster'), { showOptional: true }), false);
  assert.equal(ruleHides(form.groups[1], { mode: 'publication' }), true, 'group not in the mode');
  assert.deepEqual(forcedValue(field('options.ui.showOptions'), { mode: 'website' }), { value: false });
  assert.equal(forcedValue(field('options.ui.showOptions'), { mode: 'configuration' }), null);
  assert.deepEqual(forcedValue(field('options.ui.expanded'), { simplified: true }), { value: false });
});

test('configuration mode: forbidden fields kept, optional shown with the Advanced switch', () => {
  const form = makeForm({ mode: 'configuration', showOptional: false,
    values: { options: { ui: { showOptions: true, language: 'eng' } }, config: { defaults: { limit: 50, pixels: 30 } } } });
  assert.equal(hidden(form, 'options.ui.showOptions'), true);
  assert.equal(hidden(form, 'options.ui.showHeader'), false);
  assert.equal(form._groups.get('more').element.hidden, true, 'optional group hidden without Advanced');
  const values = form.getValues();
  assert.equal(values.options.ui.showOptions, true, 'forbidden value kept');
  assert.equal(values.options.ui.language, 'eng');
  assert.equal(values.config.defaults.limit, 50, 'hidden by the Advanced switch, still in the values (keepHidden)');
  assert.equal(values.config.defaults.pixels, 30, 'hidden by showWhen, still in the values');

  form.setShowOptional(true);
  assert.equal(form._groups.get('more').element.hidden, false);
  assert.equal(hidden(form, 'config.defaults.cluster'), false);
});

test('publication mode: forced values, groups of other modes hidden', () => {
  const form = makeForm({ mode: 'publication', values: { options: { ui: { showOptions: true } } } });
  assert.equal(form._groups.get('native').element.hidden, true);
  assert.equal(hidden(form, 'options.ui.language'), true, 'still forbidden in its mode');
  const values = form.getValues();
  assert.equal(values.options.ui.showOptions, false, 'forced in publication');
  assert.equal(values.options.nativeControls.zoom, true, 'value of a hidden group kept');
});

test('a group whose fields are all hidden by the rules is hidden', () => {
  const form = new HEditForm().attach(host(), { form: {
    groups: [{ id: 'only', label: 'Only', children: [{ name: 'a', type: 'boolean', req: 'forbidden' }] }]
  }, mode: 'configuration' }).render();
  assert.equal(form._groups.get('only').element.hidden, true);
});

test('simplified interface: value forced and hidden', () => {
  const form = makeForm({ mode: 'configuration', simplified: true, values: { options: { ui: { expanded: true } } } });
  assert.equal(hidden(form, 'options.ui.expanded'), true);
  assert.equal(form.getValues().options.ui.expanded, false);
});

test('without the options a record form is unchanged (optional fields shown)', () => {
  const form = new HEditForm().attach(host(), { form: FORM }).render();
  assert.equal(hidden(form, 'config.defaults.cluster'), false);
  assert.equal(hidden(form, 'options.ui.showOptions'), true, 'forbidden is never shown');
  assert.equal(form.getValues().options.ui.showOptions, true, 'forbidden value kept without keepHidden too');
});

test('resolveTermsSources: own terms first, provider terms after, failures ignored', async () => {
  const json = { groups: [{ children: [
    { name: 'popup', type: 'enum', terms: [{ id: 'none', label: 'None' }], termsSource: 'smartyTemplates' },
    { name: 'card', type: 'enum', termsSource: 'smartyTemplates' },
    { name: 'other', type: 'enum', termsSource: 'missing' }
  ] }] };
  let calls = 0;
  const result = await resolveTermsSources(json, {
    smartyTemplates: async () => { calls++; return [{ id: 'a.tpl', label: 'a' }, { id: 'none', label: 'dup' }]; }
  });
  assert.equal(calls, 1, 'one load per source');
  assert.deepEqual(result.groups[0].children[0].terms.map((term) => term.id), ['none', 'a.tpl']);
  assert.deepEqual(result.groups[0].children[1].terms.map((term) => term.id), ['a.tpl', 'none']);
  assert.equal(result.groups[0].children[2].terms, undefined);
  assert.equal(json.groups[0].children[0].terms.length, 1, 'the JSON is not changed');
});

test('a forbidden field gives its value as it is (lists, objects)', () => {
  const form = new HEditForm().attach(host(), { form: {
    groups: [{ children: [
      { name: 'allowed', type: 'json', req: 'forbidden' },
      { name: 'bounds', type: 'json', req: 'forbidden' }
    ] }]
  }, values: { allowed: [3, 5], bounds: { west: 1, east: 2 } } }).render();
  assert.deepEqual(form.getValues(), { allowed: [3, 5], bounds: { west: 1, east: 2 } });
});

test('boolean: mode checkbox (unchecked is false) or select (empty, Yes, No)', async () => {
  const form = new HEditForm().attach(host(), { form: { groups: [{ children: [
    { name: 'setting', type: 'boolean', mode: 'checkbox', clearable: false, default: true },
    { name: 'record', type: 'boolean' }
  ] }] } }).render();
  const setting = form.getFieldWidget('setting').container.querySelector('.h-input-boolean');
  assert.equal(setting.type, 'checkbox');
  assert.equal(setting.checked, true);
  setting.checked = false;
  setting.dispatchEvent(new Event('change'));
  const record = form.getFieldWidget('record').container.querySelector('.h-input-boolean');
  assert.equal(record.tagName.toLowerCase(), 'select', 'select by default');
  assert.deepEqual(form.getValues(), { setting: false, record: null });
});

test('inlineCheckboxes: consecutive checkboxes in one row, another field ends it', () => {
  const element = host();
  const form = new HEditForm().attach(element, { inlineCheckboxes: true, form: { groups: [{ children: [
    { name: 'a', type: 'boolean', mode: 'checkbox', clearable: false, help: 'Help of a' },
    { name: 'b', type: 'boolean', mode: 'checkbox', clearable: false },
    { name: 'text', type: 'freetext' },
    { name: 'c', type: 'boolean', mode: 'checkbox', clearable: false },
    { name: 'select', type: 'boolean' },
    { name: 'list', type: 'boolean', mode: 'checkbox', max: 0 }
  ] }] } }).render();
  const rows = element.querySelectorAll('.h-edit-form-checkbox-row');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].children.length, 2, 'a and b');
  assert.equal(rows[1].children.length, 1, 'c; a select and a repeatable boolean are not in a row');
  assert.equal(form.getFieldWidget('a').container.title, 'Help of a', 'help as the tooltip');
  assert.ok(form.getFieldWidget('a').container.classList.contains('is-inline-checkbox'));
});

test('the actions slot is in every input of a setting, except a checkbox', () => {
  const form = new HEditForm().attach(host(), { form: { groups: [{ children: [
    { name: 'choice', type: 'enum', terms: ['a', 'b'], mode: 'select', clearable: false },
    { name: 'text', type: 'freetext' },
    { name: 'flag', type: 'boolean', mode: 'checkbox', clearable: false }
  ] }] } }).render();
  const slotted = (name) => form.getFieldWidget(name).container.querySelectorAll('.has-actions-slot').length > 0;
  assert.equal(slotted('choice'), true, 'a setting without value tools');
  assert.equal(slotted('text'), true, 'value tools');
  assert.equal(slotted('flag'), false);
});
