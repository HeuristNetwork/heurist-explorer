/**
 * @file userData.test.js
 * @brief Bookmarks and reminders on /sys (plan 20, Phase 4b): the hard-coded structures
 *        (systemEntities.js), BookmarkClient / ReminderClient requests and items, and the
 *        Private panel HRecordPrivate (read-only values, Bookmark / Add reminder).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const {
  systemEditRows, systemEditStructure, systemEditForm, systemValues, systemDetails, systemFieldIds
} = await import('../src/data/systemEntities.js');
const { BookmarkClient, ReminderClient } = await import('../src/data/UserDataClient.js');
const { HRecordPrivate } = await import('../src/widgets/user-data/HRecordPrivate.js');

const host = () => { const element = document.createElement('div'); document.body.append(element); return element; };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Local ids of osmak_mapping (plan 20, §10.3). */
const LOCAL = {
  'dty:2-13': 13, 'dty:2-1190': 1185, 'dty:2-4': 4, 'dty:2-1192': 1186, 'dty:2-1193': 1187, 'dty:2-23': 23,
  'dty:2-10': 10, 'dty:2-1191': 1188, 'trm:2-10454': 10450, 'rty:2-1110': 135, 'rty:2-1111': 136,
  'rty:2-1107': 133, 'rty:2-1108': 134
};
const dbdefs = {
  localId: (kind, code) => LOCAL[`${kind}:${code}`] || 0,
  currentUserId: () => 2,
  groups: () => [{ id: 1, name: 'Database managers', role: 'admin' }],
  users: () => [{ id: 2, name: 'osmakov' }],
  userGroupName: (id) => ({ 1: 'Database managers', 2: 'osmakov' })[id] || '',
  termLabel: (id) => ({ 10452: 'Weekly', 10455: 'Once' })[id] || '',
  vocabRoot: (id) => (Number(id) === 1188 ? 10450 : 0),
  termIdByLabel: (root, label) => (label === 'Once' ? 10455 : null)
};

test('systemEntities: /rst rows with the local ids; a field the database lacks is left out', () => {
  const rows = systemEditRows('reminder', dbdefs);
  assert.deepEqual(rows.map((row) => row.rst_DetailTypeID), [13, 1187, 23, 4, 10, 1188]);
  assert.equal(rows.find((row) => row.key === 'frequency').dty_JsonTermIDTree, '10450');
  assert.equal(rows.find((row) => row.key === 'recipient').dty_PtrTargetRectypeIDs, '133,134');
  const partial = { ...dbdefs, localId: (kind, code) => (code === '2-1192' ? 0 : dbdefs.localId(kind, code)) };
  assert.deepEqual(systemEditRows('bookmark', partial).map((row) => row.key), ['record', 'rating', 'notes']);
  assert.throws(() => systemEditRows('nothing', dbdefs), TypeError);
});

test('systemEntities: the structure names fields by key with the form properties; the form omits and replaces', () => {
  const structure = systemEditStructure('bookmark', dbdefs);
  assert.equal(structure.rty, 135);
  const fields = structure.groups.flatMap((group) => group.children);
  assert.deepEqual(fields.map((field) => [field.name, field.dty]), [['record', 13], ['rating', 1185], ['notes', 4], ['privateInfo', 1186]]);
  assert.equal(fields.find((field) => field.name === 'privateInfo').maxLength, 140);
  const form = systemEditForm('bookmark', dbdefs, { omit: ['record'], fields: { rating: { type: 'enum', terms: [] } } });
  const formFields = form.groups.flatMap((group) => group.children);
  assert.equal(form.format, 'heurist-edit-form/1');
  assert.deepEqual(formFields.map((field) => field.name), ['rating', 'notes', 'privateInfo']);
  assert.equal(formFields[0].type, 'enum');
  assert.equal(systemEditStructure('reminder', dbdefs).groups[0].children.find((field) => field.name === 'startDate').temporal, false);
});

test('systemEntities: record values to plain values and back; an empty value clears the field', () => {
  const record = { rec_ID: '5', details: { 13: ['81'], 1185: ['4'], 4: [{ value: 'note' }] } };
  assert.deepEqual(systemValues('bookmark', record, dbdefs), { record: '81', rating: '4', notes: 'note', privateInfo: '' });
  assert.deepEqual(systemDetails('bookmark', { rating: 3, notes: '', unknown: 'x' }, dbdefs), { 1185: ['3'], 4: [] });
  assert.equal(systemFieldIds('reminder', dbdefs).recipient, 1187);
});

/** API with one bookmark and one reminder of record 81. */
function fakeApi() {
  const calls = [];
  const bookmark = { rec_ID: '7', rec_OwnerUGrpID: '2', rec_Modified: '2026-10-22 10:00:00', details: { 13: ['81'], 1185: ['4'], 1186: ['hint'] } };
  const reminder = {
    rec_ID: '9', rec_OwnerUGrpID: '2', rec_Modified: '2026-10-22 11:00:00',
    details: { 13: ['81'], 1187: ['1'], 4: ['Look'], 10: ['2026-11-01'], 1188: ['10452'] }
  };
  return {
    calls,
    async get(path, { query }) {
      calls.push(['GET', path, query]);
      if (query.q.t === 'bookmark') return { records: [bookmark], meta: { privateInfo: { encrypted: true, unreadable: [] } } };
      return { records: [reminder], meta: {} };
    },
    async request(path, { method, body }) {
      calls.push([method, path, body]);
      if (path === '/sys/reminder/send') return { sent: true, record: 81 };
      if (method === 'DELETE') return { deleted: Number(path.split('/').pop()) };
      const saved = path.startsWith('/sys/bookmark') ? bookmark : reminder;
      return { records: [{ ...saved, details: { ...saved.details, ...body.details } }], meta: { issues: [] } };
    }
  };
}

test('BookmarkClient: the bookmark of a record, create and update send /sys/bookmark requests', async () => {
  const api = fakeApi();
  const client = new BookmarkClient({ apiClient: api, dbdefs });
  const { bookmark, encrypted } = await client.ofRecord(81);
  assert.deepEqual(api.calls[0][2].q, { t: 'bookmark', 'f:record': '81' });
  assert.equal(encrypted, true);
  assert.deepEqual([bookmark.id, bookmark.recordId, bookmark.rating, bookmark.privateInfo, bookmark.unreadable], [7, 81, 4, 'hint', false]);
  await client.create(81, { rating: '2', notes: 'n' });
  assert.deepEqual(api.calls[1].slice(0, 2), ['POST', '/sys/bookmark/0']);
  assert.deepEqual(api.calls[1][2].details, { 13: ['81'], 1185: ['2'], 4: ['n'] });
  await client.update(7, { privateInfo: '', record: '99' }, { modified: '2026-10-22 10:00:00' });
  assert.deepEqual(api.calls[2].slice(0, 2), ['PATCH', '/sys/bookmark/7']);
  assert.deepEqual(api.calls[2][2], { details: { 1186: [] }, rec_Modified: '2026-10-22 10:00:00' });
});

test('ReminderClient: the reminders of a record and Send now (not saved)', async () => {
  const api = fakeApi();
  const client = new ReminderClient({ apiClient: api, dbdefs });
  const [reminder] = await client.ofRecord(81);
  assert.deepEqual([reminder.id, reminder.recipient, reminder.frequency, reminder.startDate], [9, '1', '10452', '2026-11-01']);
  const result = await client.send(81, { email: 'a@example.org', message: 'Now' });
  assert.deepEqual(result, { sent: true, record: 81 });
  assert.deepEqual(api.calls[1].slice(0, 2), ['POST', '/sys/reminder/send']);
  assert.deepEqual(api.calls[1][2].details, { 23: ['a@example.org'], 4: ['Now'], 13: ['81'] });
});

test('HRecordPrivate: the bookmark and reminders read-only with pens; Bookmark and Add reminder when there are none', async () => {
  const api = fakeApi();
  const element = host();
  const panel = new HRecordPrivate().attach(element, { apiClient: api, dbdefs, recordId: 81 }).render();
  await flush();
  await flush();
  const text = element.textContent;
  assert.match(text, /★★★★/);
  assert.match(text, /hint/);
  assert.match(text, /Weekly · 2026-11-01 → Database managers/);
  assert.match(text, /Look/);
  assert.equal(element.querySelectorAll('.h-record-private-tools').length, 2);
  assert.match(text, /Add reminder/);
  await panel.destroy();

  const empty = {
    ...fakeApi(),
    async get(path, { query }) { return { records: [], meta: query.q.t === 'bookmark' ? { privateInfo: { encrypted: false } } : {} }; }
  };
  const second = host();
  const readOnly = new HRecordPrivate().attach(second, { apiClient: empty, dbdefs, recordId: 81, readOnly: true }).render();
  await flush();
  await flush();
  assert.match(second.textContent, /Not bookmarked/);
  assert.match(second.textContent, /No reminders/);
  assert.equal(second.querySelectorAll('button').length, 0);
  await readOnly.destroy();
});
