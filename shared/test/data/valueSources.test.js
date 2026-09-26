import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterItems, sortItems, limitRows, needsFilterRow, truncateForList, mergeTermCounts,
  hideZeroCounts, foldText, StaticSource, TermSource, UserGroupSource, vocabularyItems,
  FieldValueSource, FacetTermSource
} from '../../src/data/valueSources/index.js';

// vocabulary 100: Europe > (France > Paris, Germany), Asia > Japan
const TREE = {
  id: 100, label: 'Places', children: [
    { id: 1, label: 'Europe', children: [
      { id: 11, label: 'France', children: [{ id: 111, label: 'Paris' }] },
      { id: 12, label: 'Germany' }
    ] },
    { id: 2, label: 'Asia', children: [{ id: 21, label: 'Japan' }] }
  ]
};
const LABELS = { 1: 'Europe', 11: 'France', 111: 'Paris', 12: 'Germany', 2: 'Asia', 21: 'Japan' };
const dbdefs = {
  termTree: (id) => (Number(id) === 100 ? TREE : null),
  termLabel: (id) => LABELS[id] || '',
  groups: () => [{ id: 5, name: 'Zeta team', role: 'member' }, { id: 1, name: 'Database managers', role: 'admin' }],
  users: () => [{ id: 7, name: 'bob' }, { id: 2, name: 'Alice' }],
  userGroupName: (id) => ({ 5: 'Zeta team', 1: 'Database managers', 7: 'bob', 2: 'Alice' })[id] || ''
};

const labels = (items) => items.map((item) => item.label);

test('foldText ignores case and diacritics', () => {
  assert.equal(foldText('  Émile ZOLA '), 'emile zola');
});

test('vocabularyItems flattens a vocabulary in tree order with depth', () => {
  const items = vocabularyItems(dbdefs, 100);
  assert.deepEqual(labels(items), ['Europe', 'France', 'Paris', 'Germany', 'Asia', 'Japan']);
  assert.deepEqual(items.map((item) => item.depth), [0, 1, 2, 1, 0, 1]);
  assert.deepEqual(vocabularyItems(dbdefs, 0), []);
});

test('filterItems keeps ancestors of tree matches as context rows', () => {
  const items = vocabularyItems(dbdefs, 100);
  const result = filterItems(items, 'par');
  assert.deepEqual(labels(result), ['Europe', 'France', 'Paris']);
  assert.deepEqual(result.map((item) => Boolean(item.context)), [true, true, false]);
  // a matching ancestor is a real row, not a context row
  const europe = filterItems(items, 'e');
  assert.equal(europe.find((item) => item.label === 'Europe').context, undefined);
  assert.equal(filterItems(items, ''), items);
});

test('filterItems on flat lists is a plain substring filter', () => {
  const items = [{ value: 'a', label: 'Émile' }, { value: 'b', label: 'Other' }];
  assert.deepEqual(labels(filterItems(items, 'emi')), ['Émile']);
  assert.deepEqual(filterItems(items, 'zzz'), []);
});

test('sortItems: alphabetical, by count, or unchanged, keeping group blocks', () => {
  const items = [
    { value: 1, label: 'b10', count: 1, group: 'groups' },
    { value: 2, label: 'b9', count: 5, group: 'groups' },
    { value: 3, label: 'a', count: 5, group: 'users' }
  ];
  assert.deepEqual(labels(sortItems(items, 'label')), ['b9', 'b10', 'a']);
  assert.deepEqual(labels(sortItems(items, 'count')), ['b9', 'b10', 'a']);
  const flat = items.map(({ group, ...rest }) => rest);
  assert.deepEqual(labels(sortItems(flat, 'count')), ['a', 'b9', 'b10']);
  assert.deepEqual(labels(sortItems(flat, 'none')), ['b10', 'b9', 'a']);
});

test('limitRows reports shown/total without counting context rows', () => {
  const items = [{ label: 'x', context: true }, ...Array.from({ length: 5 }, (_, i) => ({ label: String(i) }))];
  assert.deepEqual(limitRows(items, 3), { rows: items.slice(0, 3), shown: 2, total: 5 });
});

test('needsFilterRow: incomplete or above the threshold', () => {
  assert.equal(needsFilterRow({ complete: true, total: 30 }), false);
  assert.equal(needsFilterRow({ complete: true, total: 31 }), true);
  assert.equal(needsFilterRow({ complete: false, total: 3 }), true);
  assert.equal(needsFilterRow({ complete: true, total: 5 }, 4), true);
});

test('truncateForList keeps selected values beyond the cut', () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ value: i, label: `v${i}` }));
  assert.deepEqual(truncateForList(items, 10), { explicit: items, truncated: false });
  const { explicit, truncated } = truncateForList(items, 3, [5, 1]);
  assert.equal(truncated, true);
  assert.deepEqual(explicit.map((item) => item.value), [0, 1, 2, 5]);
});

test('mergeTermCounts keeps used terms and their ancestors (no count), in vocabulary order', () => {
  const terms = vocabularyItems(dbdefs, 100);
  const merged = mergeTermCounts(terms, new Map([['111', 4], ['21', 2]]), [12]);
  assert.deepEqual(labels(merged), ['Europe', 'France', 'Paris', 'Germany', 'Asia', 'Japan']);
  assert.deepEqual(merged.map((item) => item.count), [undefined, undefined, 4, 0, undefined, 2]);
  assert.deepEqual(labels(mergeTermCounts(terms, new Map([['21', 1]]))), ['Asia', 'Japan']);
});

test('hideZeroCounts drops zero values except selected ones', () => {
  const items = [{ value: 1, count: 0 }, { value: 2, count: 3 }, { value: 3, count: 0 }, { value: 4 }];
  assert.deepEqual(hideZeroCounts(items, ['3']).map((item) => item.value), [2, 3, 4]);
});

test('StaticSource accepts pairs and is complete', async () => {
  const source = new StaticSource([['public', 'Public'], { value: 'hidden' }]);
  assert.deepEqual(await source.load(), {
    items: [{ value: 'public', label: 'Public' }, { value: 'hidden', label: 'hidden' }], total: 2, complete: true
  });
  assert.equal(source.labelFor('public'), 'Public');
});

test('TermSource lists the vocabulary and labels terms through HDbDefs', async () => {
  const source = new TermSource(dbdefs, 100);
  const result = await source.load();
  assert.equal(result.complete, true);
  assert.equal(result.total, 6);
  assert.equal(source.labelFor(21), 'Japan');
});

test('UserGroupSource lists groups then users, alphabetically', async () => {
  const { items } = await new UserGroupSource(dbdefs).load();
  assert.deepEqual(labels(items), ['Database managers', 'Zeta team', 'Alice', 'bob']);
  assert.deepEqual(items.map((item) => item.group), ['groups', 'groups', 'users', 'users']);
  assert.equal(items[0].role, 'admin');
  assert.deepEqual(labels((await new UserGroupSource(dbdefs, { groups: false }).load()).items), ['Alice', 'bob']);
  assert.equal(new UserGroupSource({}).isAvailable(), false);
});

/** Fake API returning a fixed values payload and recording requests. */
function fakeApi(payload) {
  const calls = [];
  return {
    calls,
    get: async (path, { query }) => { calls.push({ path, query }); return typeof payload === 'function' ? payload(query) : payload; }
  };
}

test('FieldValueSource requests detail=values and is complete when all values arrived', async () => {
  const api = fakeApi({ total: 2, values: [{ value: 'b', count: 1 }, { value: 'A', count: 3 }] });
  const source = new FieldValueSource(api, { query: [{ t: '10' }], field: 1 });
  const result = await source.load();
  assert.deepEqual(api.calls[0], {
    path: '/records/',
    query: { q: [{ t: '10' }], detail: 'values', field: '1', limit: 1000, sort: 'value' }
  });
  assert.equal(result.complete, true);
  assert.deepEqual(labels(result.items), ['A', 'b']);
  // cached: the same query and text do not ask again
  await source.load();
  assert.equal(api.calls.length, 1);
  source.invalidate();
  await source.load();
  assert.equal(api.calls.length, 2);
});

test('FieldValueSource is incremental when the server has more values, and sends the filter text', async () => {
  const api = fakeApi((query) => ({ total: 5000, values: [{ value: `x${query.text || ''}`, count: 1 }] }));
  const source = new FieldValueSource(api, { query: () => [{ t: '10' }], field: 'tag', sort: 'count' });
  const first = await source.load();
  assert.equal(first.complete, false);
  assert.equal(first.total, 5000);
  const filtered = await source.load({ text: ' ab ' });
  assert.equal(api.calls[1].query.text, 'ab');
  assert.equal(api.calls[1].query.sort, 'count');
  assert.equal(filtered.complete, false);
});

test('FieldValueSource labels enum values locally and keeps selected values visible', async () => {
  const api = fakeApi({ total: 1, values: [{ value: 21, count: 2 }] });
  const source = new FieldValueSource(api, {
    field: 5, labelFor: (id) => LABELS[id] || '', selected: () => [111]
  });
  const { items } = await source.load();
  assert.deepEqual(items.map((item) => [item.value, item.label, item.count]), [[21, 'Japan', 2], [111, 'Paris', 0]]);
  assert.equal(source.labelFor(21), 'Japan');
});

test('FieldValueSource uses server labels and group kinds', async () => {
  const owners = fakeApi({ total: 2, values: [
    { value: 7, count: 1, label: 'bob', kind: 'user' },
    { value: 5, count: 9, label: 'Zeta team', kind: 'group' }
  ] });
  const { items } = await new FieldValueSource(owners, { field: 'owner' }).load();
  assert.deepEqual(items.map((item) => [item.label, item.group]), [['Zeta team', 'groups'], ['bob', 'users']]);
  const records = fakeApi({ total: 1, values: [{ value: 44, count: 1, label: 'Paris record', rty: 12 }] });
  const [record] = (await new FieldValueSource(records, { field: 240 }).load()).items;
  assert.deepEqual([record.label, record.rty], ['Paris record', 12]);
});

test('FieldValueSource validates its arguments', () => {
  assert.throws(() => new FieldValueSource(null, { field: 1 }), TypeError);
  assert.throws(() => new FieldValueSource({ get() {} }, {}), TypeError);
});

test('FacetTermSource reduces a vocabulary to the terms in the result', async () => {
  const api = fakeApi({ total: 2, values: [{ value: 111, count: 4 }, { value: 21, count: 2 }] });
  const values = new FieldValueSource(api, { field: 5 });
  const result = await new FacetTermSource(dbdefs, 100, values).load();
  assert.deepEqual(labels(result.items), ['Europe', 'France', 'Paris', 'Asia', 'Japan']);
  assert.equal(result.complete, true);
});
