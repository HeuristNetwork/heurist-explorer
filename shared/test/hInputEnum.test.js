import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';

const document = installFakeDom();
const { createHInput } = await import('../src/widgets/form/inputs/createHInput.js');
const { StaticSource } = await import('../src/data/valueSources/index.js');

const terms = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, label: `Term ${i + 1}`, depth: 1 }));
const host = () => { const element = document.createElement('div'); document.body.append(element); return element; };
const choiceLabels = (input) => input.listHost.querySelectorAll('label').map((label) => label.querySelector('span').textContent);

test('select presentation is a combobox over the terms', async () => {
  const changes = [];
  const element = host();
  element.addEventListener('h-input-change', (event) => changes.push(event.detail.value));
  const input = createHInput('enum', element, { terms: terms(3), value: 2, suppressLabel: true });
  assert.ok(input.combo, 'combobox rendered');
  assert.equal(input.combo.buttonText.textContent, 'Term 2');
  await input.combo.open();
  input.combo.picker.pick({ value: 3 });
  assert.equal(input.getValue(), 3);
  assert.deepEqual(changes, [3]);
  input.setValue(null);
  assert.equal(input.getValue(), null);
});

test('multiple select returns an array of numbers', () => {
  const input = createHInput('enum', host(), { terms: terms(3), multiple: true, value: ['1', 3] });
  assert.deepEqual(input.getValue(), [1, 3]);
});

test('checkbox list below the threshold is explicit, without a picker', async () => {
  const input = createHInput('enum', host(), { terms: terms(5), mode: 'checkbox', value: [2] });
  await flush();
  assert.deepEqual(choiceLabels(input), ['Term 1', 'Term 2', 'Term 3', 'Term 4', 'Term 5']);
  assert.equal(input.moreHost, undefined);
  input.choices[3].checked = true;
  input.choices[3].fire('change');
  assert.deepEqual(input.getValue(), [2, 4]);
});

test('a long radio list is truncated, with a picker for the rest', async () => {
  const changes = [];
  const element = host();
  element.addEventListener('h-input-change', (event) => changes.push(event.detail.value));
  const input = createHInput('enum', element, { terms: terms(8), mode: 'radio', listThreshold: 3 });
  await flush();
  assert.deepEqual(choiceLabels(input), ['Term 1', 'Term 2', 'Term 3']);
  assert.equal(input.moreHost.hidden, false);
  // picking from the picker adds the value to the list, selected
  input.moreCombo.picker.pick({ value: 7 });
  assert.equal(input.getValue(), 7);
  assert.deepEqual(choiceLabels(input), ['Term 1', 'Term 2', 'Term 3', 'Term 7']);
  assert.equal(input.choices[3].checked, true);
  assert.deepEqual(changes, [7]);
});

test('text values stay strings and show counts', async () => {
  const source = new StaticSource([{ value: 'France', label: 'France', count: 4 }, { value: '12', label: '12', count: 1 }]);
  const input = createHInput('enum', host(), { source, numeric: false, mode: 'checkbox', value: ['12'] });
  await flush();
  assert.deepEqual(input.getValue(), ['12']);
  assert.equal(input.listHost.querySelectorAll('.h-input-enum-count').length, 2);
});

test('a failing source switches to the fallback source', async () => {
  const failing = { load: async () => { throw new Error('offline'); } };
  const input = createHInput('enum', host(), {
    source: failing, fallbackSource: new StaticSource([[1, 'One']]), mode: 'checkbox'
  });
  await flush();
  assert.deepEqual(choiceLabels(input), ['One']);
});

test('list counts style and alignment are list classes (default: brackets beside the label)', async () => {
  const plain = createHInput('enum', host(), { terms: terms(2), mode: 'radio' });
  assert.ok(plain.listHost.classList.contains('h-input-enum-counts-brackets'));
  assert.ok(!plain.listHost.classList.contains('h-input-enum-counts-right'));
  const badge = createHInput('enum', host(), { terms: terms(2), mode: 'radio', countsMode: 'badge', countsAlign: 'right' });
  assert.ok(badge.listHost.classList.contains('h-input-enum-counts-badge'));
  assert.ok(badge.listHost.classList.contains('h-input-enum-counts-right'));
  const none = createHInput('enum', host(), { terms: terms(2), countsMode: 'none' });
  assert.equal(none.combo.options.showCounts, false);
});

test('hierarchy line sits above the label; a collapsible label toggles the control', () => {
  const element = host();
  const input = createHInput('enum', element, { terms: terms(2), label: 'Type', hierarchy: 'Event > Person', collapsible: true });
  assert.equal(element.children[0].className, 'h-form-input-hierarchy');
  assert.equal(element.children[0].textContent, 'Event > Person');
  assert.ok(element.classList.contains('is-collapsible'));
  assert.ok(!element.classList.contains('is-collapsed'));
  input.label.fire('click');
  assert.ok(element.classList.contains('is-collapsed'));
  assert.equal(input.label.getAttribute('aria-expanded'), 'false');
  input.label.fire('click');
  assert.ok(!element.classList.contains('is-collapsed'));
});

test('an empty list says so', async () => {
  const input = createHInput('enum', host(), { terms: [], mode: 'checkbox' });
  await flush();
  assert.equal(input.listHost.querySelector('.h-input-enum-empty')?.textContent, 'No values');
});

test('date bounds note: year alone on year boundaries, prehistoric years readable (widget needs a browser: flatpickr)', async () => {
  const { boundsNote } = await import('../src/widgets/form/inputs/HInputDate.js');
  assert.equal(boundsNote('-1000000000-01-01', '2026-09-18'), '-1000000000 – 2026-09-18');
  assert.equal(boundsNote('1850-01-01', '1850-12-31'), '1850');
  assert.equal(boundsNote(null, '2000-01-01'), '');
});

test('single-choice list: no radio circles; clicking the selected item clears it', async () => {
  const changes = [];
  const element = host();
  element.addEventListener('h-input-change', (event) => changes.push(event.detail.value));
  const input = createHInput('enum', element, { terms: terms(3), mode: 'radio', value: 2 });
  await flush();
  assert.ok(input.listHost.classList.contains('h-input-enum-single'));
  const selected = input.choices[1];
  assert.equal(selected.checked, true);
  selected.fire('click');
  assert.equal(input.getValue(), null);
  assert.equal(selected.checked, false);
  assert.deepEqual(changes, [null]);
  // clicking another item still selects it (change)
  input.choices[2].checked = true;
  input.choices[2].fire('click');
  input.choices[2].fire('change');
  assert.equal(input.getValue(), 3);
});
