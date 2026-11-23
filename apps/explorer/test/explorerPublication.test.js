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

// the one list (review 7): listQueryChoices, sorted by name
const choices = publicationFilterChoices({
  choices: [
    { value: 'source:34', kind: 'source', id: 34, label: 'Map of sites', parameterized: false },
    { value: 'filter:12', kind: 'filter', id: 12, label: 'Persons', parameterized: true }
  ],
  current: { request: { q: [{ t: '10' }] } }
});

test('published configuration: no toolbar, no tools but Crosstabs, no docked lists, not simplified', () => {
  const value = publishedUiConfig({
    toolbar: { position: 'panes', buttonSize: 'large' }, lists: 'docked', isSimplifiedUI: true,
    regions: { data: 'west', map: 'center', report: 'center', export: 'center', crosstabs: 'east' }, language: 'fre'
  });
  assert.equal(value.toolbar.position, 'vertical');
  assert.equal(value.lists, 'popup');
  assert.equal(value.isSimplifiedUI, false);
  assert.equal(value.regions.map, 'center');
  for (const type of ['report', 'export', 'actions', 'storymap']) assert.equal(value.regions[type], 'unused');
  // the Crosstabs viewer may be on a page (review 2026-11-23)
  assert.equal(value.regions.crosstabs, 'east');
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
  assert.deepEqual(choices.map((choice) => choice.key), ['source:34', 'filter:12', 'current']);
  const form = explorerPublicationForm(choices);
  const fields = form.groups.flatMap((group) => group.children);
  const items = fields.find((field) => field.name === 'filter.items');
  assert.equal(items.multiple, true);
  // marks of the one picker instead of label text; a search row from more than 10 entries
  assert.deepEqual(items.terms.map((term) => [term.label, term.marks]),
    [['Map of sites', []], ['Persons', ['filter', 'parametrized']], ['Current query', []]]);
  assert.equal(items.filterThreshold, 10);
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

test('Explorer on a website page (2026-11-14): no language, values and layout of an instance', async () => {
  const { websiteFormValues, websiteLayoutList, websiteLayoutValue } = await import('../src/ui/config/explorerWebsitePanel.js');
  const form = explorerPublicationForm(choices);
  const language = form.groups.flatMap((group) => group.children).find((field) => field.name === 'ui.language');
  assert.deepEqual(language.modes, ['configuration', 'publication'], 'the page decides the language');
  const settings = {
    ui: { regions: { data: 'west', map: 'center', graph: 'unused', timeline: 'south', recordview: 'unused', report: 'center' },
      order: ['data', 'map', 'timeline'], panes: { south: true } },
    layout: [{ id: 'data', type: 'data', region: 'west', context: { role: 'current' }, settings: { a: 1 } },
      { id: 'map', type: 'map', region: 'center', settings: { b: 2 } }],
    modules: { timeline: { c: 3 } },
    filter: { items: [{ key: 'source:34', kind: 'source', id: 34, title: 'Map of sites' }], active: 'source:34', mode: 'list' }
  };
  assert.deepEqual(websiteFormValues(settings).filter, { items: ['source:34'], active: 'source:34', mode: 'list', placement: 'west' });
  const layout = websiteLayoutValue(settings);
  assert.equal(layout.regions.report, 'unused', 'no tools on a page');
  assert.equal(layout.panes.south, true);
  const list = websiteLayoutList(settings, { ...layout, regions: { ...layout.regions, map: 'east' } });
  assert.deepEqual(list.map((item) => [item.type, item.region]), [['data', 'west'], ['map', 'east'], ['timeline', 'south']]);
  assert.deepEqual(list[1].settings, { b: 2 }, 'an existing module keeps its settings');
  assert.deepEqual(list[2].settings, { c: 3 }, 'a new one gets the module settings of the instance');
  assert.deepEqual(list[0].context, { role: 'current' });
});

test('Explorer on a website page (2026-11-15): the settings of a new instance', async () => {
  const { websiteExplorerSettings } = await import('../src/ui/config/explorerWebsitePanel.js');
  const settings = websiteExplorerSettings({ data: { d: 1 }, map: { m: 1 } });
  assert.equal(settings.ui.language, 'auto', 'the language of the page');
  assert.equal(settings.ui.regions.report, 'unused', 'no tools');
  assert.deepEqual(settings.filter.items, []);
  const data = settings.layout.find((item) => item.type === 'data');
  assert.deepEqual(data.settings, { d: 1 }, 'each module with its website settings');
  assert.deepEqual(data.context, { role: 'current' });
});
