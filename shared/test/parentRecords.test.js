import test from 'node:test';
import assert from 'node:assert/strict';
import { HDbDefs } from '../src/data/HDbDefs.js';
import { assignParent, loadParents, parentCandidate } from '../src/data/parentRecords.js';
import { fieldPathCode } from '../src/data/fieldPathCodes.js';
import { segmentsFromPath, buildFieldSnippet } from '../src/smarty/smartySnippetBuilder.js';

export const snapshot = {
  meta: { dbId: 1 },
  rectypes: { 1: { name: 'Collection' }, 2: { name: 'Item' }, 3: { name: 'Other' } },
  fields: {
    1: { name: 'Name', type: 'freetext' },
    10: { name: 'Items', type: 'resource', targetTypes: [2] },
    11: { name: 'Any child', type: 'resource' },
    12: { name: 'Forbidden', type: 'resource', targetTypes: [2] },
    247: { name: 'Parent entity', type: 'resource', concept: '2-247' }
  },
  structure: [
    { rty: 1, dty: 10, createChild: true },
    { rty: 3, dty: 10, createChild: false },
    { rty: 1, dty: 11, createChild: true },
    { rty: 1, dty: 12, createChild: true, req: 'forbidden' },
    { rty: 2, dty: 1 }
  ]
};

test('child type detection uses the structure flag, target constraints and forbidden status', () => {
  const defs = new HDbDefs(snapshot);
  assert.deepEqual(defs.parentLinks(2), [
    { parentRectypeId: 1, fieldId: 10, childRectypeId: 2 },
    { parentRectypeId: 1, fieldId: 11, childRectypeId: 2 }
  ]);
  assert.equal(defs.parentLinks(3).length, 1, 'unconstrained child pointer');
  assert.equal(defs.isChildRectype(0), false);
  assert.equal(defs.field(1, 10).createChild, true);
  assert.equal(defs.field(3, 10).createChild, false);
  const old = new HDbDefs({ ...snapshot, structure: snapshot.structure.map(({ createChild, ...row }) => row) });
  assert.equal(old.isChildRectype(2), false);
});

test('parent lookup constrains the source type/field and follows all pages; errors propagate', async () => {
  const defs = new HDbDefs(snapshot);
  const calls = [];
  const apiClient = { async get(path, options) {
    calls.push(options.query);
    const q = options.query;
    if (q.q[1]['lt:11']) return { records: [], pagination: { total: 0 } };
    return { records: [{ rec_ID: String(100 + q.offset), rec_RecTypeID: '1' }], pagination: { total: 2 } };
  } };
  const rows = await loadParents({ apiClient, dbdefs: defs, recordId: 7, rectypeId: 2 });
  assert.deepEqual(rows.map((row) => row.record.rec_ID), ['100', '101']);
  assert.deepEqual(calls[0].q.slice(0, 2), [{ t: '1' }, { 'lt:10': [{ ids: '7' }] }]);
  await assert.rejects(loadParents({ apiClient: { get: async () => { throw new Error('offline'); } }, dbdefs: defs, recordId: 7, rectypeId: 2 }), /offline/);
});

test('assignment preserves resolved/hidden values, uses the concurrency token and is idempotent', async () => {
  const calls = [];
  const existing = { value: '8', hidden: true };
  const record = { rec_ID: '100', rec_RecTypeID: '1', rec_Modified: 'token', details: { 10: [existing] } };
  const apiClient = { async request(path, request) {
    calls.push({ path, ...request });
    if (request.method === 'PATCH') record.details = request.body.details;
    return { records: [record] };
  } };
  const options = { apiClient, dbdefs: new HDbDefs(snapshot), childId: 7, childRectypeId: 2, parentId: 100, fieldId: 10 };
  await assignParent(options);
  assert.deepEqual(calls[1].body, { rec_Modified: 'token', details: { 10: [existing, '7'] } });
  await assignParent(options);
  assert.equal(calls.filter((call) => call.method === 'PATCH').length, 1);
  await assert.rejects(assignParent({ ...options, fieldId: 12 }), /valid parent field/);
});

test('a selected parent is read as a header only, with its eligible fields', async () => {
  const calls = [];
  const apiClient = { async get(path, options) {
    calls.push(options.query);
    return { records: options.query.q[0].ids === '100' ? [{ rec_ID: '100', rec_RecTypeID: '1' }] : [] };
  } };
  const { links } = await parentCandidate({ apiClient, dbdefs: new HDbDefs(snapshot), parentId: 100, childRectypeId: 2 });
  assert.deepEqual(links.map((link) => link.fieldId), [10, 11]);
  assert.equal(calls[0].fields, 'rec_Title,rec_RecTypeID');
  await assert.rejects(parentCandidate({ apiClient, dbdefs: new HDbDefs(snapshot), parentId: 5, childRectypeId: 2 }), /does not exist/);
});

test('incoming parent paths reuse column/filter codes and existing Smarty traversal', () => {
  const path = [{ via: { link: 'lf', dty: 10, targetRty: 1 } }, { dty: 1, fieldType: 'freetext' }];
  assert.equal(fieldPathCode(path, 2), '2:lf10:1:1');
  const segments = segmentsFromPath(path);
  assert.deepEqual(segments[0], { kind: 'linked_from', fieldId: '10', sourceRectypeId: '1' });
  assert.match(buildFieldSnippet({ segments }, {}, { rootRectypeId: 2, isRepeatable: () => false }), /getLinkedFromRecords/);
});
