/**
 * @file largeRecordForm.test.js
 * @brief Very large records in the edit form (plan 23 §4): lazy groups of HEditForm,
 *        inputs of the first values of a field (HEditField valueLimit), the picker of
 *        HValueCombo made on first use, automatic groups of a large record type.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
// the value pickers use Node
globalThis.Node ??= globalThis.HTMLElement;
const { HEditForm } = await import('../src/widgets/edit-form/HEditForm.js');
const { HEditField } = await import('../src/widgets/edit-form/HEditField.js');
const { HValueCombo } = await import('../src/widgets/picker/HValueCombo.js');
const { splitLargeGroups, structureFields } = await import('../src/data/recordEditStructure.js');

const host = () => { const element = document.createElement('div'); document.body.append(element); return element; };
const apiClient = { get: async () => ({ records: [] }), request: async () => ({}) };

const FORM = {
  groups: [
    { id: 'one', type: 'tabs', label: 'One', children: [{ name: 'a', type: 'freetext' }] },
    { id: 'two', type: 'tabs', label: 'Two', children: [
      { name: 'b', type: 'freetext', req: 'required' },
      { name: 'n', type: 'integer' }
    ] },
    { id: 'closed', type: 'accordion', label: 'Closed', open: false, children: [{ name: 'c', type: 'freetext', max: 0 }] }
  ]
};

/** A rendered form; `lazyGroups` unless told otherwise. */
function makeForm(options = {}) {
  const element = host();
  const groups = [];
  element.addEventListener('h-edit-form-group-rendered', (event) => groups.push(event.detail.group.id));
  const form = new HEditForm().attach(element, {
    form: structuredClone(FORM), apiClient, lazyGroups: true,
    values: { a: 'first', b: 'second', n: 5, c: ['x', 'y'] },
    ...options
  }).render();
  return { form, element, groups };
}

test('lazy groups: only the shown group has widgets; the others keep their states', () => {
  const { form, groups } = makeForm();
  assert.ok(form.getFieldWidget('a'));
  assert.equal(form.getFieldWidget('b'), null, 'inactive tab');
  assert.equal(form.getFieldWidget('c'), null, 'closed accordion');
  assert.deepEqual(groups, ['one']);
  // the values of all fields, also without widgets
  assert.deepEqual(form.getValues(), { a: 'first', b: 'second', n: 5, c: ['x', 'y'] });
  assert.equal(form.getValue('c').length, 2);
  assert.equal(form.isDirty(), false);
});

test('lazy groups: a tab or an accordion gets its widgets when it is first shown, without a change', () => {
  const { form, element, groups } = makeForm();
  element.querySelectorAll('button.h-edit-form-tab')[1].click();
  assert.ok(form.getFieldWidget('b'));
  assert.deepEqual(groups, ['one', 'two']);
  const details = element.querySelector('.h-edit-form-accordion');
  details.open = true;
  details.fire('toggle');
  assert.ok(form.getFieldWidget('c'));
  assert.equal(form.isDirty(), false, 'opening groups is not a change');
  assert.deepEqual(form.getValues(), { a: 'first', b: 'second', n: 5, c: ['x', 'y'] });
});

test('lazy groups: setValue, revealField and the special editors work for a field without its widget', async () => {
  const { form } = makeForm();
  await form.setValue('b', 'changed');
  assert.equal(form.getValue('b'), 'changed');
  assert.equal(form.isDirty(), true);
  form.revealField('b');
  assert.equal(form.getFieldWidget('b').getValue(), 'changed', 'the widget is made with the kept state');
  const context = form._specialContext({ name: 'x' });
  assert.equal(context.hasField('c'), true);
  assert.equal(context.getValue('c'), 'x');
  context.setValue('c', 'z');
  assert.deepEqual(form.getValue('c'), ['z', 'y']);
});

test('lazy groups: validate makes the group of an empty required field and shows the problem there', () => {
  const { form } = makeForm({ values: { a: 'first' } });
  const problems = form.validate();
  assert.deepEqual(problems.map((problem) => problem.field), ['b']);
  const widget = form.getFieldWidget('b');
  assert.ok(widget, 'the group of the problem is made');
  assert.ok(widget.container.classList.contains('has-error'));
  // a server issue of a field without widget
  const other = form.setIssues([{ field: 'c', message: 'Bad' }]);
  assert.deepEqual(other, []);
  assert.ok(form.getFieldWidget('c'));
});

test('lazy groups are off by default: every widget at render', () => {
  const { form, groups } = makeForm({ lazyGroups: false });
  assert.ok(form.getFieldWidget('b'));
  assert.ok(form.getFieldWidget('c'));
  assert.deepEqual(groups, []);
});

/** A repeatable field with `count` values and the given value limit. */
function manyValues(count, valueLimit, max = 0) {
  const element = host();
  const values = Array.from({ length: count }, (_, index) => ({ value: `v${index + 1}`, hidden: false }));
  const field = new HEditField().attach(element, {
    field: { name: 'f', type: 'freetext', label: 'F', max }, state: { values, translations: [] }, valueLimit
  }).render();
  return { field, element };
}

test('values limit: inputs of the first values only, the others stay in the state', () => {
  const { field, element } = manyValues(25, 10);
  assert.equal(field._rows.length, 10);
  assert.equal(field.getState().values.length, 25);
  assert.equal(field.getState().values.at(-1).value, 'v25');
  const link = element.querySelector('.h-edit-field-more').querySelector('a');
  assert.equal(link.textContent, 'Show all values (25)');
  link.click();
  assert.equal(field._rows.length, 25);
  assert.equal(element.querySelector('.h-edit-field-more'), null);
  assert.deepEqual(field.getState().values.map((entry) => entry.value).slice(9, 11), ['v10', 'v11']);
});

test('values limit: an added value goes after all stored values; remove and max count every value', () => {
  const { field } = manyValues(12, 10);
  field.addButton.click();
  field._rows.at(-1).input.setValue('new');
  const values = field.getState().values.map((entry) => entry.value);
  assert.equal(values.length, 13);
  assert.equal(values.at(-1), 'new', 'after the values without inputs');
  field._showPending();
  assert.deepEqual(field.getState().values.map((entry) => entry.value).slice(-3), ['v11', 'v12', 'new']);

  const limited = manyValues(12, 10, 12).field;
  assert.equal(limited.addButton.hidden, true, 'max 12 reached (10 shown + 2 not shown)');
  assert.equal(manyValues(5, 10).field._rows.length, 5, 'under the limit: all');
  assert.equal(manyValues(25, 0).field._rows.length, 25, 'no limit');
});

test('HValueCombo: the picker is made on first use, not at render', async () => {
  const source = { load: async () => ({ items: [{ value: 1, label: 'One' }], complete: true }), labelFor: (value) => `#${value}` };
  const combo = new HValueCombo().attach(host(), { source, value: 1 }).render();
  assert.equal(combo._picker, null);
  assert.equal(combo.button.textContent.includes('#1'), true, 'the button shows the label without the picker');
  combo.setValue(1);
  assert.equal(combo._picker, null, 'setValue does not make it');
  assert.ok(combo.picker, 'reading picker makes it');
  await combo.destroy();
});

test('automatic groups: a group past "Limit fields" keeps N fields; the others in collapsed parts of N', () => {
  const fields = (from, count) => Array.from({ length: count }, (_, index) => ({ dty: from + index, type: 'freetext' }));
  const structure = { rty: 1, groups: [
    { id: null, type: 'group', label: null, children: fields(1, 2) },
    { id: 57, type: 'tabs', label: 'Big', children: fields(10, 120) }
  ] };
  const split = splitLargeGroups(structure, 50);
  assert.deepEqual(split.groups.map((group) => [group.id, group.type, group.inner === true, group.children.length]), [
    [null, 'group', false, 2],
    [57, 'tabs', false, 50],
    ['57-fields-51', 'accordion', true, 50],
    ['57-fields-101', 'accordion', true, 20]
  ]);
  assert.deepEqual(split.groups.slice(2).map((group) => [group.label, group.open]), [['Fields 51-100', false], ['Fields 101-120', false]]);
  assert.equal(structureFields(split).length, 122, 'no field lost');
  assert.equal(splitLargeGroups(structure, 200), structure, 'nothing to split: the same structure');
  assert.equal(splitLargeGroups(structure, 0), structure);
});

const { HStructureTree, FIND_THRESHOLD } = await import('../src/widgets/structure-tree/HStructureTree.js');
const { normalizeEditForm } = await import('../src/data/editFormSchema.js');

/** A normalized form: a tab with an inner part, a second tab; `extra` more optional fields. */
function treeForm(extra = 0) {
  return normalizeEditForm({ localized: true, groups: [
    { id: 't1', type: 'tabs', label: 'General', children: [
      { name: 'title', type: 'freetext', label: 'Title', req: 'required' },
      { name: 'kind', type: 'enum', label: 'Kind', req: 'recommended', terms: ['a'] },
      { name: 'note', type: 'blocktext', label: 'Note', req: 'optional' }
    ] },
    { id: 'part', type: 'accordion', inner: true, label: 'Fields 4-5', children: [
      { name: 'place', type: 'resource', label: 'Place', req: 'recommended' },
      { name: 'size', type: 'integer', label: 'Size', req: 'optional' }
    ] },
    { id: 't2', type: 'tabs', label: 'More', children: Array.from({ length: extra }, (_, index) => ({
      name: `x${index}`, type: 'freetext', label: `Extra ${index}`, req: 'optional'
    })) }
  ] }).form;
}

/** A rendered tree with the given value counts. */
function makeTree(form, counts = {}) {
  const selected = [];
  const element = host();
  const tree = new HStructureTree().attach(element, {
    form, valueCount: (name) => counts[name] || 0, onSelect: (name) => selected.push(name)
  }).render();
  const listed = () => [...tree.rows.values()].filter((row) => !row.element.hidden).map((row) => row.field.name);
  return { tree, element, selected, listed };
}

test('structure tree: groups as in the form (inner part inside its tab), all fields at start', () => {
  const { element, listed } = makeTree(treeForm());
  const groups = element.querySelectorAll('.h-structure-tree-group');
  assert.deepEqual(groups.map((group) => group.querySelector('.h-structure-tree-group-label').textContent),
    ['General', 'Fields 4-5', 'More']);
  assert.ok(groups[0].contains(groups[1]), 'the inner part is inside its tab');
  assert.deepEqual(listed(), ['title', 'kind', 'note', 'place', 'size'], 'no filter at start');
  assert.equal(groups[2].hidden, true, 'a group without a listed field is hidden');
  assert.equal(element.querySelector('.h-structure-tree-find'), null, 'no Find for a small form');
});

test('structure tree: Required only (disables the others), Show optional, Empty only, the type filter; the form gets the names', () => {
  const changes = [];
  const element = host();
  const tree = new HStructureTree().attach(element, {
    form: treeForm(), valueCount: (name) => ({ title: 1, place: 2 })[name] || 0, onFilterChange: (names) => changes.push(names)
  }).render();
  const listed = () => [...tree.rows.values()].filter((row) => !row.element.hidden).map((row) => row.field.name);
  const [requiredOnly, showOptional, emptyOnly] = element.querySelectorAll('input.h-checkbox');
  assert.equal(showOptional.checked, true, 'Show optional is on at start: all fields');
  assert.deepEqual(changes, [], 'no filter: nothing to tell');
  // Show optional off: the optional fields are hidden (as in the legacy editor)
  showOptional.checked = false;
  showOptional.fire('change');
  assert.deepEqual(listed(), ['title', 'kind', 'place']);
  assert.deepEqual([...changes.at(-1)], ['title', 'kind', 'place'], 'the form shows the same fields');
  emptyOnly.checked = true;
  emptyOnly.fire('change');
  assert.deepEqual(listed(), ['kind'], 'not optional and without values');
  // Required only: the other two are disabled and do not apply
  requiredOnly.checked = true;
  requiredOnly.fire('change');
  assert.deepEqual(listed(), ['title'], 'title has a value: Empty only does not apply');
  assert.deepEqual([showOptional.disabled, emptyOnly.disabled, emptyOnly.checked], [true, true, false]);
  requiredOnly.checked = false;
  requiredOnly.fire('change');
  assert.deepEqual([showOptional.disabled, emptyOnly.disabled, showOptional.checked], [false, false, false],
    'Show optional keeps its state');
  showOptional.checked = true;
  showOptional.fire('change');
  assert.equal(changes.at(-1), null, 'no filter any more');
  emptyOnly.checked = true;
  emptyOnly.fire('change');
  assert.deepEqual(listed(), ['kind', 'note', 'size'], 'Empty only: the fields without values');
  // the type filter is for the tree only (the form keeps the Empty only fields)
  const type = element.querySelector('.h-structure-tree-type');
  assert.deepEqual(type.querySelectorAll('option').map((option) => option.value), ['all', 'text', 'enum', 'numeric', 'pointer'],
    'only the types of the form');
  type.value = 'text';
  type.fire('change');
  assert.deepEqual(listed(), ['note']);
  assert.deepEqual([...changes.at(-1)], ['kind', 'note', 'size']);
  type.value = 'enum';
  type.fire('change');
  assert.deepEqual(listed(), ['kind']);
  tree.clearFilters();
  assert.equal(changes.at(-1), null, 'all fields again');
  assert.deepEqual([showOptional.checked, emptyOnly.checked], [true, false]);
  assert.deepEqual(listed(), ['title', 'kind', 'note', 'place', 'size']);
});

test('structure tree: value counts from 1, selection, Find for a large form (Enter selects the first match)', () => {
  const form = treeForm(FIND_THRESHOLD);
  const { tree, element, selected } = makeTree(form, { title: 1, kind: 3 });
  assert.equal(tree.rows.get('title').count.textContent, '(1)');
  assert.equal(tree.rows.get('kind').count.textContent, '(3)');
  assert.equal(tree.rows.get('note').count.textContent, '');
  assert.ok(tree.rows.get('title').element.classList.contains('is-filled'));
  assert.equal(tree.rows.get('note').element.classList.contains('is-filled'), false);
  tree.rows.get('place').element.click();
  assert.deepEqual(selected, ['place']);
  assert.ok(tree.rows.get('place').element.classList.contains('is-selected'));
  const find = element.querySelector('.h-structure-tree-find');
  assert.ok(find, 'more than 25 fields: Find');
  find.value = 'extra 1';
  find.fire('input');
  assert.equal([...tree.rows.values()].filter((row) => !row.element.hidden).length, 11, 'Extra 1, Extra 10..19');
  find.fire('keydown', { key: 'Enter' });
  assert.deepEqual(selected, ['place', 'x1']);
});

test('view filter of the form: hides fields and groups (tabs) without a shown field; values and checks stay', () => {
  const { form, element } = makeForm({ values: { a: 'first', n: 5, c: ['x'] } });
  form.setViewFilter(['b']);
  const tabs = element.querySelectorAll('button.h-edit-form-tab');
  assert.equal(tabs[0].hidden, true, 'tab One has no shown field');
  assert.ok(form.getFieldWidget('b'), 'tab Two is selected and made');
  assert.equal(form.getFieldWidget('n').container.hidden, true, 'n is filtered out');
  assert.equal(element.querySelector('.h-edit-form-accordion').hidden, true);
  assert.deepEqual(form.getValues(), { a: 'first', b: null, n: 5, c: ['x'] }, 'the values of hidden fields stay');
  form.setViewFilter(null);
  assert.equal(tabs[0].hidden, false);
  assert.equal(form.getFieldWidget('n').container.hidden, false);
});

test('view filter: a problem in a field filtered out shows all fields again (event)', () => {
  const { form, element } = makeForm({ values: { a: 'first' } });
  let cleared = 0;
  element.addEventListener('h-edit-form-view-filter-cleared', () => { cleared++; });
  form.setViewFilter(['a']);
  const problems = form.validate();
  assert.deepEqual(problems.map((problem) => problem.field), ['b'], 'b is required');
  assert.equal(cleared, 1);
  assert.equal(element.querySelectorAll('button.h-edit-form-tab')[1].hidden, false);
});

test('record titles keep the few formatting tags of h-recordlist-title (pointer picker and button)', () => {
  const source = { load: async () => ({ items: [], complete: true }), labelFor: () => '<b>Bold</b> <a href="x">link</a><script>x</script>' };
  const combo = new HValueCombo().attach(host(), { source, value: 1, htmlLabels: true }).render();
  assert.equal(combo.buttonText.innerHTML, '<b>Bold</b> link');
  assert.equal(combo.button.title, 'Bold link', 'the tooltip as text');
  const plain = new HValueCombo().attach(host(), { source, value: 1 }).render();
  assert.equal(plain.buttonText.innerHTML, '<b>Bold</b> <a href="x">link</a><script>x</script>', 'without htmlLabels: text');
});

test('structure tree: Show help calls the owner; the form hides the field help texts', () => {
  const shown = [];
  const element = host();
  new HStructureTree().attach(element, { form: treeForm(), showHelp: false, onShowHelpChange: (value) => shown.push(value) }).render();
  const help = element.querySelectorAll('input.h-checkbox')[3];
  assert.equal(help.checked, false, 'the given state');
  help.checked = true;
  help.fire('change');
  assert.deepEqual(shown, [true]);
  const { form, element: formElement } = makeForm();
  form.setFieldHelpVisible(false);
  assert.ok(formElement.classList.contains('is-field-help-hidden'));
  form.setFieldHelpVisible(true);
  assert.equal(formElement.classList.contains('is-field-help-hidden'), false);
});
