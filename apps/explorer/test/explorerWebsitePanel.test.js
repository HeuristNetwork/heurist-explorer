/**
 * The Explorer instance panel of the CMS designer with Records and selection (plan 27l §12, phase E2): the fields of the
 * designer at the top of the filters fieldset, the filter fields only with Own filters.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { createExplorerWebsitePanel } = await import('../src/ui/config/explorerWebsitePanel.js');

// the one list of query choices (review 7)
const choices = [{ value: 'filter:34', kind: 'filter', id: 34, label: 'People', parameterized: false },
  { value: 'source:12', kind: 'source', id: 12, label: 'Places', parameterized: false }];
const value = { settings: { filter: { items: [{ key: 'filter:34', kind: 'filter', id: 34, title: 'People' }], active: 'filter:34', mode: 'list' },
  ui: { regions: {}, order: [], panes: {} }, layout: [] }, state: null };

test('the fields of Records and selection go into the filters fieldset; without Own filters no filter items', async () => {
  const recordsSection = document.createElement('div');
  recordsSection.className = 'records';
  const panel = await createExplorerWebsitePanel({ value, choices, defaults: async () => ({}), recordsSection });
  const fieldset = recordsSection.parentElement;
  assert.equal(fieldset?.tagName, 'FIELDSET');
  assert.equal(fieldset.children.find((child) => child.tagName === 'LEGEND').textContent, 'Records and selection');
  assert.equal(typeof panel.showFilters, 'function');
  const shown = await panel.read();
  assert.deepEqual(shown.settings.filter.items.map((item) => item.key), ['filter:34']);
  assert.equal(shown.settings.filter.active, 'filter:34');
  panel.showFilters(false);
  const hidden = await panel.read();
  assert.deepEqual(hidden.settings.filter.items, []);
  assert.equal(hidden.settings.filter.active, null);
  panel.showFilters(true);
  assert.deepEqual((await panel.read()).settings.filter.items.map((item) => item.key), ['filter:34'], 'shown again: kept');
  await panel.destroy();
});

test('without the fields of the designer: the filters fieldset as before', async () => {
  const panel = await createExplorerWebsitePanel({ value, choices, defaults: async () => ({}) });
  const legends = panel.element.querySelectorAll('legend').map((legend) => legend.textContent);
  assert.ok(legends.includes('Filters') && !legends.includes('Records and selection'));
  await panel.destroy();
});
