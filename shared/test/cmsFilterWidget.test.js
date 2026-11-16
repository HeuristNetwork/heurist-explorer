/**
 * @file cmsFilterWidget.test.js
 * @brief The Filter widget of a website page (plan 27l §3): settings and the DataSource of its items; saved filters
 *        as DataSources (shared/src/data/savedFilters.js).
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
import {
  cmsFilterItemKey, cmsFilterWidgetSettings, resolveCmsFilterItem, storedCmsFilterWidget
} from '../src/site/cmsFilterWidget.js';
import { savedFilterDataSource, savedFilterRecord } from '../src/data/savedFilters.js';

test('settings: known kinds with an id, no duplicates, active one of the items', () => {
  const settings = cmsFilterWidgetSettings({
    items: [{ kind: 'source', id: 12, title: 'People' }, { kind: 'filter', id: '34' }, { kind: 'source', id: 12 },
      { kind: 'query', id: 1 }, { kind: 'filter', id: 0 }],
    active: 'filter:34', mode: 'odd'
  });
  assert.deepEqual(settings.items.map((item) => item.key), ['source:12', 'filter:34']);
  assert.equal(settings.items[1].title, '#34');
  assert.equal(settings.active, 'filter:34');
  assert.equal(settings.mode, 'buttons');
  assert.equal(cmsFilterWidgetSettings({ items: [], active: 'filter:34' }).active, null);
  assert.equal(cmsFilterItemKey('source', '7'), 'source:7');
  assert.deepEqual(storedCmsFilterWidget({ items: [{ kind: 'source', id: 12, title: 'P' }], mode: 'list' }),
    { items: [{ kind: 'source', id: 12, title: 'P' }], mode: 'list' });
});

test('items: a query source keeps its parameters; a saved filter of the record format; unknown kinds are null', async () => {
  const calls = [];
  const apiClient = {
    get: async (path) => {
      calls.push(path);
      if (path === '/records/querysource/12') return { querySource: { id: 12, title: 'People', source: { query: { t: '10', title: '$NAME$' } } } };
      if (path === '/sys/filter/34') return { record: { rec_ID: 34, rec_Title: 'Places', details: { query: [{ value: '{"q":{"t":"12"},"w":"all"}' }] } } };
      return null;
    }
  };
  const source = await resolveCmsFilterItem({ kind: 'source', id: 12 }, { apiClient });
  assert.deepEqual(source.reference, { type: 'source', id: 12 });
  assert.deepEqual(source.request.q, { t: '10', title: '$NAME$' });
  const filter = await resolveCmsFilterItem({ kind: 'filter', id: 34 }, { apiClient });
  assert.equal(filter.reference.type, 'filter');
  assert.equal(filter.reference.id, 34);
  assert.deepEqual(filter.request.q, { t: '12' });
  assert.equal(filter.title, 'Places');
  assert.equal(await resolveCmsFilterItem({ kind: 'query' }, { apiClient }), null);
  assert.deepEqual(calls, ['/records/querysource/12', '/sys/filter/34']);
});

test('saved filters: the record, the legacy converter, an empty request', async () => {
  assert.equal(savedFilterRecord({ details: {} }), null);
  const record = savedFilterRecord({ svs_ID: 5, title: 'T', query: 't:10' });
  assert.deepEqual(record, { id: 5, title: 'T', query: 't:10', definition: { q: 't:10' } });
  const converted = await savedFilterDataSource(record, {
    legacyConverter: { convert: async () => ({ status: 'ok', definition: { q: { t: '11' }, filterForm: { a: 1 } }, warnings: ['w'] }) }
  });
  assert.deepEqual(converted.request.q, { t: '11' });
  assert.deepEqual(converted.presentation.filterForm, { a: 1 });
  assert.deepEqual(converted.meta.warnings, ['w']);
  await assert.rejects(() => savedFilterDataSource(record, {
    legacyConverter: { convert: async () => ({ status: 'unsupported', warnings: ['old'], legacyQuery: 'x' }) }
  }), /T: old/);
  assert.equal(await savedFilterDataSource({ id: 6, title: 'E', query: '', definition: {} }), null);
});

test('captions as in the published Explorer: a query source its name (DT_NAME) in the language of the page', async () => {
  const { filterItemCaptions, querySourceNames } = await import('../src/site/cmsFilterWidget.js');
  const calls = [];
  const apiClient = {
    get: async (path, { query }) => {
      calls.push([path, query]);
      return { records: [{ rec_ID: '12', details: { 1: ['People', 'fre:Personnes'] } }] };
    }
  };
  const names = await querySourceNames(apiClient, [12, 12, 0], 1);
  assert.deepEqual(calls, [['/records/', { q: [{ ids: '12' }], fields: 'rec_ID,1', limit: 1 }]]);
  assert.deepEqual(names.get(12), ['People', 'fre:Personnes']);
  const items = [{ key: 'source:12', kind: 'source', id: 12, title: 'people [ q = ... ]' }, { key: 'filter:4', kind: 'filter', id: 4, title: 'Saved' },
    { key: 'source:13', kind: 'source', id: 13, title: 'Places' }];
  const fre = filterItemCaptions(items, (id) => names.get(id), 'fre');
  assert.deepEqual(fre.map((item) => item.title), ['Personnes', 'Saved', 'Places'], 'saved filter and unknown source: stored title');
  assert.equal(filterItemCaptions(items, (id) => names.get(id), 'ger')[0].title, 'People', 'no translation: the value without a language');
  assert.equal((await querySourceNames(apiClient, [12], 0)).size, 0, 'no DT_NAME: nothing read');
});
