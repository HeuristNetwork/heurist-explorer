/**
 * @file explorerPublication.test.js
 * @brief "Publish this view" (plan 27b §11.3): the configuration of a published Explorer, the
 *        filters of the page (references) and the publication form.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, normalizePublishedFilter, publishedModuleSettings, publishedUiConfig } from '../src/core/publishedView.js';
import {
  explorerPublicationForm, normalizePublicationValues, publicationFilterChoices, publicationSettings
} from '../src/ui/config/explorerPublication.js';

const choices = publicationFilterChoices({
  filters: [{ id: 12, title: 'Persons', kind: 'parametrized' }],
  sources: [{ id: 34, title: 'Map of sites', parametrized: false }],
  current: { request: { q: [{ t: '10' }] } }
});

test('published configuration: no toolbar, no tools, no docked lists, not simplified', () => {
  const value = publishedUiConfig({
    toolbar: { position: 'panes', buttonSize: 'large' }, lists: 'docked', isSimplifiedUI: true,
    regions: { data: 'west', map: 'center', report: 'center', export: 'center' }, language: 'fre'
  });
  assert.equal(value.toolbar.position, 'vertical');
  assert.equal(value.lists, 'popup');
  assert.equal(value.isSimplifiedUI, false);
  assert.equal(value.regions.map, 'center');
  for (const type of ['report', 'export', 'actions', 'crosstabs']) assert.equal(value.regions[type], 'unused');
  assert.equal(value.language, 'fre');
});

test('filters of a page are references; the current query keeps its request; unknown active is dropped', () => {
  const filter = normalizePublishedFilter({
    items: [{ kind: 'filter', id: '12', title: 'Persons' }, { kind: 'source', id: 0 }, { kind: 'bogus', id: 3 },
      { kind: 'query', title: 'Current query', request: { q: [{ t: '10' }] } }, { kind: 'filter', id: 12 }],
    active: 'source:99', mode: 'carousel', placement: 'north'
  });
  assert.deepEqual(filter.items.map((item) => item.key), ['filter:12', 'current']);
  assert.equal(filter.items[0].id, 12);
  assert.deepEqual(filter.items[1].request, { q: [{ t: '10' }] });
  assert.equal(filter.active, null);
  assert.equal(filter.mode, 'buttons');
  // the Search pane is in the West only (2026-10-29)
  assert.equal(filter.placement, 'west');
});

test('publication form: one list of saved filters, query sources and the current query', () => {
  assert.deepEqual(choices.map((choice) => choice.key), ['filter:12', 'source:34', 'current']);
  const form = explorerPublicationForm(choices);
  const fields = form.groups.flatMap((group) => group.children);
  const items = fields.find((field) => field.name === 'filter.items');
  assert.equal(items.multiple, true);
  assert.deepEqual(items.terms.map((term) => term.label), ['Persons [filter] (parameterized)', 'Map of sites [source]', 'Current query']);
  assert.deepEqual(fields.find((field) => field.name === 'filter.mode').terms.map((term) => term.id), ['buttons', 'list', 'select']);
});

test('page settings: the view, the language and the chosen filters with the active one', () => {
  const values = normalizePublicationValues({ ui: { language: 'auto' },
    filter: { items: ['source:34', 'filter:12'], active: 'filter:12', mode: 'list', placement: 'west' } });
  const settings = publicationSettings({ format: 'heurist-explorer-settings', layout: [], ui: { language: 'auto', lists: 'docked' } },
    values, choices, 'fre');
  assert.equal(settings.ui.language, 'fre');
  assert.equal(settings.ui.lists, 'docked');
  assert.deepEqual(settings.filter.items, [
    { key: 'source:34', kind: 'source', id: 34, title: 'Map of sites' },
    { key: 'filter:12', kind: 'filter', id: 12, title: 'Persons' }
  ]);
  assert.equal(settings.filter.active, 'filter:12');
  assert.equal(settings.filter.mode, 'list');
  // the active filter must be one of the available ones
  const other = publicationSettings({ ui: {} }, normalizePublicationValues({ filter: { items: ['source:34'], active: 'filter:12' } }), choices);
  assert.equal(other.filter.active, null);
});

test('the current query keeps its presentation: columns, geo and time fields (2026-10-31)', () => {
  const presentation = { data: { fields: [{ field: '10:1' }] }, map: { geoFields: [{ field: '12:28' }] }, timeline: { timeFields: ['10:10'] } };
  const withPresentation = publicationFilterChoices({ current: { request: { q: [{ t: '10' }] }, presentation } });
  const settings = publicationSettings({ ui: {} }, normalizePublicationValues({ filter: { items: ['current'], active: 'current' } }),
    withPresentation);
  assert.deepEqual(settings.filter.items[0].presentation, presentation);
  assert.deepEqual(normalizePublishedFilter(settings.filter).items[0].presentation, presentation);
});

test('memory storage: nothing reaches the browser storage', () => {
  const storage = memoryStorage();
  storage.setItem('a', 1);
  assert.equal(storage.getItem('a'), '1');
  assert.equal(storage.length, 1);
  storage.removeItem('a');
  assert.equal(storage.getItem('a'), null);
});

test('modules of a published page have no Help, Options and Publish buttons', () => {
  const settings = publishedModuleSettings({ options: { ui: { language: 'fre', showHelp: true } }, state: 1 });
  assert.deepEqual(settings.options.ui, { language: 'fre', showHelp: false, showOptions: false, showPublish: false });
  assert.equal(settings.state, 1);
  assert.equal(publishedModuleSettings(null).options.ui.showPublish, false);
});
