/**
 * @file tags.test.js
 * @brief Tags on /sys/tag (plan 20, Phase 4a): TagClient requests and tags, the owner
 *        groups, HTagManager (groups, add, rename) and HTagSelector (remove, pick, add new).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const { TagClient, tagTextProblem } = await import('../src/data/TagClient.js');
const { tagOwnerGroups } = await import('../src/widgets/tags/tagGroups.js');
const { HTagManager } = await import('../src/widgets/tags/HTagManager.js');
const { HTagSelector } = await import('../src/widgets/tags/HTagSelector.js');

const host = () => { const element = document.createElement('div'); document.body.append(element); return element; };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const dbdefs = { localId: (kind, code) => ({ 'dty:2-1': 11, 'dty:2-3': 13 })[`${kind}:${code}`] || 0 };

/** A tag record of /sys/tag. */
const record = (id, name, owner, { usage = 0, description = '', ownerName = '' } = {}) => ({
  rec_ID: String(id), rec_RecTypeID: '0', rec_Title: name, rec_OwnerUGrpID: String(owner), rec_Modified: '2026-10-22 10:00:00',
  rec_OwnerName: ownerName, rec_Usage: usage, details: { 11: [name], ...(description ? { 13: [description] } : {}) }
});

/** API with tags in memory: /sys lists, the tag routes write. */
function fakeApi(initial = []) {
  const tags = new Map(initial.map((tag) => [tag.id, { ...tag }]));
  const onRecord = new Set();
  const calls = [];
  let next = 100;
  const toRecord = (tag) => record(tag.id, tag.name, tag.owner, { usage: tag.usage || 0 });
  return {
    calls,
    tags,
    onRecord,
    async get(path, { query }) {
      calls.push(['GET', path, query]);
      const list = query.q.record ? [...tags.values()].filter((tag) => onRecord.has(tag.id)) : [...tags.values()];
      return { records: list.map(toRecord), meta: { currentUser: { id: 2 } } };
    },
    async request(path, { method, body, query }) {
      calls.push([method, path, body, query]);
      if (path === '/sys/tag/assign') {
        for (const id of body.add) onRecord.add(id);
        for (const id of body.remove) onRecord.delete(id);
        return { processed: 1, added: body.add.length, removed: body.remove.length, bookmarks: 0 };
      }
      const merge = path.match(/^\/sys\/tag\/(\d+)\/merge$/);
      if (merge) {
        tags.delete(Number(merge[1]));
        return { records: [toRecord(tags.get(body.into))], meta: {} };
      }
      const id = Number(path.split('/').pop());
      if (method === 'POST') {
        const tag = { id: ++next, name: body.details[11][0], owner: Number(body.rec_OwnerUGrpID || 2) };
        tags.set(tag.id, tag);
        return { records: [toRecord(tag)], meta: { issues: [] } };
      }
      if (method === 'PATCH') {
        const tag = tags.get(id);
        if (body.details?.[11]) tag.name = body.details[11][0];
        return { records: [toRecord(tag)], meta: { issues: [] } };
      }
      if (method === 'DELETE') {
        tags.delete(id);
        return { deleted: id, removed: 0 };
      }
      throw new Error(`unexpected ${method} ${path}`);
    }
  };
}

test('TagClient: list asks /sys for the tags of the user (or of a record) in the record format', async () => {
  const api = fakeApi([{ id: 1, name: 'alpha', owner: 2 }]);
  const client = new TagClient({ apiClient: api, dbdefs });
  const { currentUserId, tags } = await client.list();
  assert.equal(currentUserId, 2);
  assert.deepEqual(api.calls[0], ['GET', '/sys', { q: { t: 'tag', user: 'current' }, fields: '_all,rec_OwnerName', limit: 5000, sort: 'title' }]);
  assert.deepEqual(tags[0], { id: 1, name: 'alpha', description: '', owner: 2, ownerName: '', usage: 0, modified: '2026-10-22 10:00:00' });
  await client.list({ record: 81 });
  assert.equal(api.calls[1][2].q.record, '81');
});

test('TagClient: create, update, assign, merge and remove send the /sys/tag requests', async () => {
  const api = fakeApi([{ id: 1, name: 'alpha', owner: 2 }]);
  const client = new TagClient({ apiClient: api, dbdefs });
  const created = await client.create({ name: ' beta ', owner: 7, description: 'B' });
  assert.deepEqual(api.calls[0].slice(0, 3), ['POST', '/sys/tag/0', { rec_ID: '0', rec_OwnerUGrpID: '7', details: { 11: ['beta'], 13: ['B'] } }]);
  assert.equal(created.name, 'beta');
  await client.update(1, { name: 'alfa', modified: '2026-10-22 10:00:00' });
  assert.deepEqual(api.calls[1].slice(0, 3), ['PATCH', '/sys/tag/1', { details: { 11: ['alfa'] }, rec_Modified: '2026-10-22 10:00:00' }]);
  await client.assign({ records: ['81'], add: [1], remove: [created.id] });
  assert.deepEqual(api.calls[2].slice(0, 3), ['POST', '/sys/tag/assign', { records: [81], add: [1], remove: [created.id], replace: false }]);
  const into = await client.merge(created.id, 1);
  assert.equal(into.id, 1);
  await client.remove(1, { force: true });
  assert.deepEqual(api.calls.at(-1).slice(0, 2), ['DELETE', '/sys/tag/1']);
  assert.deepEqual(api.calls.at(-1)[3], { force: 1 });
});

test('TagClient: the usage is the Usage field 2-1189 when the database has it, else the header rec_Usage', () => {
  const withField = new TagClient({ apiClient: fakeApi(), dbdefs: { localId: (kind, code) => ({ '2-1': 11, '2-3': 13, '2-1189': 15 })[code] || 0 } });
  assert.equal(withField.toTag({ rec_ID: '1', rec_Title: 'a', details: { 11: ['a'], 15: ['4'] } }).usage, 4);
  const without = new TagClient({ apiClient: fakeApi(), dbdefs });
  assert.equal(without.toTag({ rec_ID: '1', rec_Title: 'a', rec_Usage: 2, details: { 11: ['a'] } }).usage, 2);
});

test('tag texts: the rules of the legacy tag manager', () => {
  assert.equal(tagTextProblem(''), 'Enter the tag');
  assert.equal(tagTextProblem('ab'), 'A tag has at least 3 characters');
  assert.equal(tagTextProblem('x'.repeat(64)), 'A tag has at most 63 characters');
  assert.equal(tagTextProblem('  abc  '), '');
});

test('owner groups: Personal first, then the groups of the user (also empty), then other owners', () => {
  const groups = tagOwnerGroups([
    { id: 1, name: 'zeta', owner: 2 }, { id: 2, name: 'Alpha', owner: 2 }, { id: 3, name: 'g', owner: 9, ownerName: 'Other' }
  ], { currentUserId: 2, groups: [{ id: 5, name: 'Team' }] });
  assert.deepEqual(groups.map((group) => [group.owner, group.name, group.tags.map((tag) => tag.name)]),
    [[2, 'Personal', ['Alpha', 'zeta']], [5, 'Team', []], [9, 'Other', ['g']]]);
  assert.equal(groups[0].personal, true);
});

test('HTagManager: accordions per owner; + adds a tag to the owner; a click on a tag renames it inline', async () => {
  const api = fakeApi([{ id: 1, name: 'alpha', owner: 2, usage: 3 }]);
  let changes = 0;
  const element = host();
  const manager = new HTagManager().attach(element, {
    tagClient: new TagClient({ apiClient: api, dbdefs }), currentUserId: 2, groups: [{ id: 5, name: 'Team' }],
    onChange: () => { changes++; }
  }).render();
  await flush();
  const groups = element.querySelectorAll('.h-tag-manager-group');
  assert.deepEqual(groups.map((group) => group.querySelector('summary').textContent), ['Personal tags (1)', 'Team tags (0)']);
  assert.equal(element.querySelector('.h-tag-manager-usage').textContent, '3');

  const teamInput = groups[1].querySelector('.h-tag-manager-add-input');
  teamInput.value = 'shared';
  groups[1].querySelector('.h-tag-manager-add-button').click();
  await flush();
  await flush();
  assert.deepEqual(api.calls.find((call) => call[0] === 'POST')?.[2], { rec_ID: '0', rec_OwnerUGrpID: '5', details: { 11: ['shared'] } });
  assert.equal(changes, 1);

  element.querySelector('.h-tag-manager-name').click();
  const edit = element.querySelector('.h-tag-manager-edit')?.querySelector('input');
  assert.ok(edit, 'an inline input');
  edit.value = 'alpha one';
  edit.fire('keydown', { key: 'Enter' });
  await flush();
  await flush();
  assert.equal(api.tags.get(1).name, 'alpha one');
  await manager.destroy();
});

test('HTagSelector: the record\'s tags with ×; a pick puts a tag on; "Add new tag" makes the typed text a tag', async () => {
  const api = fakeApi([{ id: 1, name: 'alpha', owner: 2 }, { id: 2, name: 'beta', owner: 2 }]);
  api.onRecord.add(1);
  const changes = [];
  const element = host();
  const selector = new HTagSelector().attach(element, {
    tagClient: new TagClient({ apiClient: api, dbdefs }), recordId: 81, currentUserId: 2,
    onChange: (tags) => changes.push(tags.map((tag) => tag.name))
  }).render();
  await flush();
  await flush();
  assert.deepEqual(element.querySelectorAll('.h-tag-selector-tag').map((chip) => chip.textContent.replace('×', '')), ['alpha']);
  const items = selector.combo.source.items().map((item) => item.label);
  assert.deepEqual(items, ['beta'], 'the picker lists the tags not on the record');

  selector.combo.options.onPick({ value: 2 });
  await flush();
  await flush();
  assert.deepEqual(changes.at(-1), ['alpha', 'beta']);

  element.querySelector('.h-tag-selector-remove').click();
  await flush();
  await flush();
  assert.deepEqual(changes.at(-1), ['beta']);

  const action = selector.combo.options.actions.find((item) => item.id === 'new');
  await action.run('gamma');
  await flush();
  assert.ok([...api.tags.values()].some((tag) => tag.name === 'gamma'), 'the new tag is made');
  assert.deepEqual(changes.at(-1), ['beta', 'gamma']);
  await selector.destroy();
});
