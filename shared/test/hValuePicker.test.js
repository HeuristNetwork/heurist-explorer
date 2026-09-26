import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';

const document = installFakeDom();
const { HValuePicker } = await import('../src/widgets/picker/HValuePicker.js');
const { HValueCombo } = await import('../src/widgets/picker/HValueCombo.js');
const { StaticSource } = await import('../src/data/valueSources/index.js');

const many = (n) => new StaticSource(Array.from({ length: n }, (_, i) => [i + 1, `Value ${i + 1}`]));
const rowLabels = (picker) => picker.list.querySelectorAll('.h-value-picker-item')
  .map((row) => row.querySelector('.h-value-picker-label').textContent);
const statusText = (picker) => picker.list.querySelector('.h-value-picker-status')?.textContent || '';

function mount(options) {
  const host = document.createElement('div');
  document.body.append(host);
  return new HValuePicker().attach(host, options).render();
}

test('values load on first open, not on render (V11)', async () => {
  let loads = 0;
  const source = { load: async () => { loads++; return { items: [{ value: 1, label: 'One' }], total: 1, complete: true }; } };
  const picker = mount({ source });
  assert.equal(loads, 0);
  await picker.open();
  await picker.open();
  assert.equal(loads, 1);
  assert.deepEqual(rowLabels(picker), ['One']);
});

test('the filter row appears only above the threshold, and filters locally', async () => {
  const short = mount({ source: many(30) });
  await short.open();
  assert.equal(short.filterRow.hidden, true);

  const long = mount({ source: many(31) });
  await long.open();
  assert.equal(long.filterRow.hidden, false);
  long.input.value = 'value 3';
  long.input.fire('input');
  assert.deepEqual(rowLabels(long), ['Value 3', 'Value 30', 'Value 31']);
  long.input.value = 'nothing';
  long.input.fire('input');
  assert.equal(statusText(long), 'Nothing matches the filter');
});

test('long lists render a limited number of rows with an "x of y" row', async () => {
  const picker = mount({ source: many(250), maxRows: 200 });
  await picker.open();
  assert.equal(rowLabels(picker).length, 200);
  assert.equal(statusText(picker), '200 of 250 entries shown');
});

test('single pick replaces the value; multiple pick toggles', async () => {
  const changes = [];
  const single = mount({ source: many(3), onChange: (value) => changes.push(value) });
  await single.open();
  single.list.querySelectorAll('.h-value-picker-item')[1].querySelector('.h-value-picker-label').click();
  assert.equal(single.getValue(), 2);
  assert.deepEqual(changes, [2]);

  const multiple = mount({ source: many(3), multiple: true, value: [1] });
  await multiple.open();
  multiple.pick({ value: 3 });
  multiple.pick({ value: 1 });
  assert.deepEqual(multiple.getValue(), [3]);
  const selected = multiple.list.querySelectorAll('.h-value-picker-item.is-selected');
  assert.equal(selected.length, 1);
});

test('keyboard: arrows move the highlight, Enter picks it', async () => {
  const picker = mount({ source: many(40) });
  await picker.open();
  picker.input.fire('keydown', { key: 'ArrowDown' });
  picker.input.fire('keydown', { key: 'ArrowDown' });
  assert.equal(picker.activeItem().value, 2);
  picker.input.fire('keydown', { key: 'Enter' });
  assert.equal(picker.getValue(), 2);
});

test('controlled mode: the host drives filter text and selection', async () => {
  const picked = [];
  const picker = mount({ source: many(40), controlled: true, onPick: (item) => picked.push(item.value) });
  await picker.open();
  assert.equal(picker.filterRow.hidden, true);
  picker.setFilterText('value 4');
  assert.deepEqual(rowLabels(picker), ['Value 4', 'Value 40']);
  picker.moveActive(1);
  picker.moveActive(1);
  assert.equal(picker.commitActive(), true);
  assert.deepEqual(picked, [40]);
});

test('an incomplete source is asked again with the filter text', async () => {
  const texts = [];
  const source = {
    load: async ({ text }) => {
      texts.push(text);
      return { items: [{ value: text || 'all', label: text || 'all' }], total: 5000, complete: false };
    }
  };
  const picker = mount({ source });
  await picker.open();
  assert.equal(picker.filterRow.hidden, false);
  picker.input.value = 'ab';
  picker.input.fire('input');
  picker.input.value = 'abc';
  picker.input.fire('input');
  await flush(300);
  assert.deepEqual(texts, ['', 'abc']);
  assert.deepEqual(rowLabels(picker), ['abc']);
  assert.equal(statusText(picker), '1 of 5000 entries shown');
});

test('a failing source reports an error row and event', async () => {
  const picker = mount({ source: { load: async () => { throw new Error('offline'); } } });
  let errors = 0;
  picker.container.addEventListener('h-value-picker-error', () => errors++);
  await picker.open();
  assert.equal(picker.hasError(), true);
  assert.equal(errors, 1);
  assert.equal(statusText(picker), 'Values could not be loaded');
});

test('group changes are separated', async () => {
  const source = new StaticSource([
    { value: 1, label: 'Managers', group: 'groups' }, { value: 2, label: 'alice', group: 'users' }
  ]);
  const picker = mount({ source });
  await picker.open();
  assert.equal(picker.list.querySelectorAll('.h-value-picker-separator').length, 1);
});

test('combobox shows the selection label and closes after a single pick', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const values = [];
  const combo = new HValueCombo().attach(host, {
    source: many(5), value: 3, onChange: (value) => values.push(value)
  }).render();
  assert.equal(combo.buttonText.textContent, 'Value 3');
  await combo.open();
  assert.equal(combo.isOpen(), true);
  combo.picker.pick({ value: 5, label: 'Value 5' });
  assert.equal(combo.isOpen(), false);
  assert.equal(combo.getValue(), 5);
  assert.equal(combo.buttonText.textContent, 'Value 5');
  assert.deepEqual(values, [5]);
  combo.setValue(null);
  assert.equal(combo.buttonText.textContent, 'Select a value');
  await combo.destroy();
});
