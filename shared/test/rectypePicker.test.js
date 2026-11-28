/**
 * @file rectypePicker.test.js
 * @brief The shared record type picker (27q3 §17.4): RectypeSource with the header switches grouped / hide without
 *        records (the chosen types stay), counts and marks, the state shared by a host; HValuePicker shows the
 *        switches below the filter input and loads the list again when one changes.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
const { HValuePicker } = await import('../src/widgets/picker/HValuePicker.js');
const { RectypeSource } = await import('../src/data/valueSources/index.js');

/** Definitions: Person, Event (no records), Place, Area; with or without record counts. */
function dbdefs({ counts = true } = {}) {
  return {
    rectypes: () => [
      { id: 5, name: 'Person', group: 1 }, { id: 3, name: 'Event', group: 1 },
      { id: 10, name: 'Place', group: 2 }, { id: 12, name: 'Area', group: 2 }
    ],
    rectypeGroups: () => [{ id: 1, name: 'People' }, { id: 2, name: 'Places' }],
    rectypeName: (id) => ({ 3: 'Event', 5: 'Person', 10: 'Place', 12: 'Area' }[id] || ''),
    hasRectypeCounts: () => counts,
    isRectypeUsed: (id) => Number(id) !== 3
  };
}

const values = (source, options) => source.items(options).map((item) => item.value);

test('switches: grouped always, hide without records only with record counts', () => {
  assert.deepEqual(new RectypeSource(dbdefs()).toggles().map((item) => [item.id, item.checked]), [['grouped', true], ['hideEmpty', false]]);
  assert.deepEqual(new RectypeSource(dbdefs({ counts: false })).toggles().map((item) => item.id), ['grouped']);
  assert.equal(new RectypeSource(dbdefs(), { hideEmpty: true }).toggles()[1].checked, true);
});

test('grouped: by record type group; off: one alphabetical list after the data source types', () => {
  const source = new RectypeSource(dbdefs(), { priority: [10] });
  assert.deepEqual(source.items().map((item) => [item.value, item.groupLabel]),
    [[10, 'Current data source'], [3, 'People'], [5, 'People'], [12, 'Places']]);
  source.setToggle('grouped', false);
  assert.deepEqual(source.items().map((item) => [item.value, item.groupLabel]),
    [[10, 'Current data source'], [12, ''], [3, ''], [5, '']]);
});

test('hide without records: the types without records are left out, the chosen ones stay', () => {
  const source = new RectypeSource(dbdefs(), { hideEmpty: true });
  assert.deepEqual(values(source), [5, 12, 10]);
  assert.deepEqual(values(source, { selected: [3] }), [3, 5, 12, 10], 'a chosen type stays');
  source.setToggle('hideEmpty', false);
  assert.deepEqual(values(source), [3, 5, 12, 10]);
  // without counts every type counts as used
  assert.deepEqual(values(new RectypeSource(dbdefs({ counts: false }), { hideEmpty: true })), [3, 5, 12, 10]);
});

test('counts and marks after the names; the ids of a subset', () => {
  const items = new RectypeSource(dbdefs(), { ids: [5, 10], counts: { 5: 7 }, marks: { 10: ['not in the test records'] } }).items();
  assert.deepEqual(items.map((item) => [item.value, item.count ?? null, item.marks ?? null]),
    [[5, 7, null], [10, null, ['not in the test records']]]);
});

test('prefs of a host: every source of it reads and writes the same state', () => {
  const prefs = { hideEmpty: true, grouped: true };
  const changes = [];
  const first = new RectypeSource(dbdefs(), { prefs, onToggle: (id, on) => changes.push([id, on]) });
  const second = new RectypeSource(dbdefs(), { prefs });
  first.setToggle('hideEmpty', false);
  assert.equal(prefs.hideEmpty, false);
  assert.equal(second.hideEmpty, false);
  assert.deepEqual(changes, [['hideEmpty', false]]);
});

test('picker: the filter input and the switches are there for record types; a switch loads the list again', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const picker = new HValuePicker().attach(host, { source: new RectypeSource(dbdefs()), value: 3 }).render();
  await picker.open();
  assert.equal(picker.filterRow.hidden, false, 'a short list has the filter input too');
  const boxes = picker.filterRow.querySelectorAll('.h-value-picker-toggle').map((label) => label.querySelector('input'));
  assert.deepEqual(boxes.map((box) => box.dataset.toggle), ['grouped', 'hideEmpty']);
  const labels = () => picker.list.querySelectorAll('.h-value-picker-item').map((row) => row.querySelector('.h-value-picker-label').textContent);
  assert.deepEqual(labels(), ['Event', 'Person', 'Area', 'Place']);
  boxes[1].checked = true;
  boxes[1].fire('change');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(labels(), ['Event', 'Person', 'Area', 'Place'], 'Event is chosen: it stays');
  picker.setValue(5);
  await picker.load();
  assert.deepEqual(labels(), ['Person', 'Area', 'Place']);
});
