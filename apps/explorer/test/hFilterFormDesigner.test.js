import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

const document = installFakeDom();
const { HFilterFormDesigner } = await import('../src/widgets/filter-builder/HFilterFormDesigner.js');

const PARAMETERS = {
  X1: { type: 'enum', fieldId: 26, predicate: 'f', label: 'Country' },
  X2: { type: 'text', fieldId: 1, predicate: 'f', label: 'Name' },
  X3: { type: 'text', fieldId: 2, predicate: 'f', label: 'Notes' },
  X4: { type: 'text', fieldId: null, predicate: 'owner', label: 'owner' },
  X5: { type: 'text', fieldId: null, predicate: 'tag', label: 'tag' },
  X6: { type: 'date', fieldId: 10, predicate: 'f', label: 'Start', range: true, endInput: 'X6_to' },
  X6_to: { type: 'date', fieldId: 10, predicate: 'f', label: 'Start' },
  X7: { type: 'number', fieldId: 3, predicate: 'f', label: 'Size', range: true, endInput: 'X7_to' },
  X7_to: { type: 'number', fieldId: 3, predicate: 'f', label: 'Size' },
  X8: { type: 'date', fieldId: 11, predicate: 'f', label: 'End', operator: '' },
  X9: { type: 'date', fieldId: 12, predicate: 'f', label: 'Born', operator: '>' }
};

function designer(children, settings) {
  return new HFilterFormDesigner().attach(document.createElement('div'), {
    parameters: PARAMETERS,
    layout: { version: 1, ...(settings ? { settings } : {}), groups: [{ id: 'main', children }] }
  });
}

test('text parameters in a list mode are marked exact; direct text drops list options', () => {
  const layout = designer([
    { input: 'X1', mode: 'select', facets: true },
    { input: 'X2', mode: 'checkbox', orientation: 'inline', multiple: true },
    { input: 'X3', mode: 'direct', orientation: 'inline', exact: true },
    { input: 'X4' }
  ]).getLayout();
  const [country, name, notes, owner] = layout.groups[0].children;
  assert.deepEqual(country, { input: 'X1', facets: true });
  assert.deepEqual(name, { input: 'X2', mode: 'checkbox', orientation: 'inline', multiple: true, exact: true });
  assert.deepEqual(notes, { input: 'X3' });
  assert.deepEqual(owner, { input: 'X4' });
});

test('a text parameter keeps "select" (the picker), unlike enum where it is the default', () => {
  const layout = designer([{ input: 'X1', mode: 'select' }, { input: 'X2', mode: 'select' }]).getLayout();
  assert.deepEqual(layout.groups[0].children, [{ input: 'X1' }, { input: 'X2', mode: 'select', exact: true }]);
});

test('tag lists keep their mode but match by ID, not exact text', () => {
  const layout = designer([{ input: 'X5', mode: 'checkbox', exact: true }]).getLayout();
  assert.deepEqual(layout.groups[0].children, [{ input: 'X5', mode: 'checkbox' }]);
});

test('the form-wide list size is kept unless it is the default', () => {
  assert.equal(designer([{ input: 'X1' }], { listThreshold: 10 }).getLayout().settings.listThreshold, 10);
  assert.equal(designer([{ input: 'X1' }], { listThreshold: 20 }).getLayout().settings, undefined);
});

test('form options: hierarchy, accordion and counts are kept unless default', () => {
  const settings = { showHierarchy: true, accordion: true, countsAlign: 'label', countsMode: 'none', skipEmptySearch: false };
  assert.deepEqual(designer([{ input: 'X1' }], settings).getLayout().settings,
    { showHierarchy: true, accordion: true, countsAlign: 'label', countsMode: 'none' });
  const defaults = { showHierarchy: false, accordion: false, countsAlign: 'right', countsMode: 'badge' };
  assert.equal(designer([{ input: 'X1' }], defaults).getLayout().settings, undefined);
});

test('date and numeric ranges picked from a list keep their grouping; other modes drop it', () => {
  const layout = designer([
    { input: 'X6', mode: 'radio', orientation: 'inline', groupBy: 'decade', widget: { type: 'range', control: 'direct' } },
    { input: 'X7', mode: 'select', ranges: 40 },
    { input: 'X8', mode: 'checkbox', multiple: true },
    { input: 'X9', mode: 'select', groupBy: 'year' },
    { input: 'X1', groupBy: 'year' }
  ]).getLayout();
  const [start, size, end, born, country] = layout.groups[0].children;
  assert.deepEqual(start, { input: 'X6', mode: 'radio', orientation: 'inline', groupBy: 'decade' });
  assert.deepEqual(size, { input: 'X7', mode: 'select', ranges: 20 });
  // "falls in" (a plain date token) is a range operator; "after" is not
  assert.deepEqual(end, { input: 'X8', mode: 'checkbox', multiple: true, groupBy: 'year' });
  // any operator: a picked range is searched as that range
  assert.deepEqual(born, { input: 'X9', mode: 'select', groupBy: 'year' });
  assert.deepEqual(country, { input: 'X1' });
});

test('direct date and numeric inputs drop list options', () => {
  const layout = designer([
    { input: 'X7', mode: 'direct', multiple: true, ranges: 5, widget: { type: 'range', control: 'direct' } }
  ]).getLayout();
  assert.deepEqual(layout.groups[0].children, [{ input: 'X7' }]);
});

test('items show label, presentation, grouping, help and field name in that order', () => {
  const host = document.createElement('div');
  const form = new HFilterFormDesigner().attach(host, {
    parameters: PARAMETERS,
    query: [{ 'f:10': '$X6$<>$X6_to$' }],
    layout: { version: 1, groups: [{ id: 'main', children: [{ input: 'X6', mode: 'radio', groupBy: 'century' }] }] }
  }).render();
  const row = host.querySelector('.h-filter-form-designer-row');
  // drag handle and visibility checkbox, then the four lines
  const lines = row.children.slice(2).map((child) => child.className);
  assert.deepEqual(lines, [
    'h-filter-form-designer-line h-filter-form-designer-main',
    'h-filter-form-designer-line h-filter-form-designer-options',
    'h-filter-form-designer-line h-filter-form-designer-help-line',
    'h-filter-form-designer-name'
  ]);
  const options = row.children[3];
  assert.ok(options.querySelector('.h-filter-form-designer-presentation'));
  assert.equal(options.querySelector('select').parentElement, options, 'presentation starts the options line');
  assert.equal(options.querySelectorAll('select').at(-1).value, 'century', 'grouping is on the options line');
  const presentation = row.querySelector('.h-filter-form-designer-presentation');
  assert.equal(presentation.value, 'list-column');
  assert.deepEqual(presentation.children.map((option) => option.value),
    ['direct', 'slider', 'select', 'list-column', 'list-inline']);
  return form.destroy();
});

test('a slider without bounds is auto; one bound alone is an error', () => {
  const auto = designer([{ input: 'X7', widget: { type: 'range', control: 'slider', min: '', max: undefined } }]);
  assert.deepEqual(auto.getLayout().groups[0].children, [{ input: 'X7', widget: { type: 'range', control: 'slider' } }]);
  const fixed = designer([{ input: 'X7', widget: { type: 'range', control: 'slider', min: '1', max: '9' } }]);
  assert.deepEqual(fixed.getLayout().groups[0].children[0].widget, { type: 'range', control: 'slider', min: '1', max: '9' });
  assert.throws(() => designer([{ input: 'X7', widget: { type: 'range', control: 'slider', min: '5' } }]).getLayout(),
    /requires both bounds/);
});

test('the auto checkbox hides the bounds; unchecking shows them', () => {
  const host = document.createElement('div');
  const form = new HFilterFormDesigner().attach(host, {
    parameters: PARAMETERS,
    query: [{ 'f:3': '$X7$<>$X7_to$' }],
    layout: { version: 1, groups: [{ id: 'main', children: [{ input: 'X7', widget: { type: 'range', control: 'slider' } }] }] }
  }).render();
  const options = host.querySelector('.h-filter-form-designer-options');
  const auto = options.querySelectorAll('label')
    .find((label) => label.querySelector('span')?.textContent === 'auto').querySelector('input');
  const bounds = options.querySelectorAll('.h-filter-form-designer-bound');
  assert.equal(auto.checked, true);
  assert.deepEqual(bounds.map((input) => input.hidden), [true, true]);
  auto.checked = false;
  auto.fire('change');
  assert.deepEqual(bounds.map((input) => input.hidden), [false, false]);
  return form.destroy();
});

test('date slider bounds may be negative years', () => {
  const ok = designer([{ input: 'X6', widget: { type: 'range', control: 'slider', min: '-0500-01-01', max: '0100-12-31' } }]);
  assert.deepEqual(ok.getLayout().groups[0].children[0].widget,
    { type: 'range', control: 'slider', min: '-0500-01-01', max: '0100-12-31' });
  // compared as days, not strings ('-0100' < '-0500' as text)
  assert.throws(() => designer([{ input: 'X6', widget: { type: 'range', control: 'slider', min: '-0100-01-01', max: '-0500-01-01' } }]).getLayout(),
    /requires both bounds/);
});
