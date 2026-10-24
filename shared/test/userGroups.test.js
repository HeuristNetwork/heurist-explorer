/**
 * @file userGroups.test.js
 * @brief Users and groups on /sys (plan 20, Phase 4d): the hard-coded structures by DT_*
 *        constants (systemEntities.js), UserGroupClient (values, writes, members, image) and
 *        HInputFile in entity-image mode.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const { systemEditForm, systemEditRows, systemValues, systemDetails } = await import('../src/data/systemEntities.js');
const { UserGroupClient } = await import('../src/data/UserGroupClient.js');
const { createHInput } = await import('../src/widgets/form/inputs/createHInput.js');

const host = () => { const element = document.createElement('div'); document.body.append(element); return element; };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The constants of a database where only some of the new fields have codes. */
const CONSTANTS = {
  DT_NAME: 1, DT_SHORT_SUMMARY: 3, DT_EXTENDED_DESCRIPTION: 4, DT_GIVEN_NAMES: 18, DT_EMAIL: 23, DT_DEPARTMENT: 1004,
  DT_URL: 986, DT_LOGIN_NAME: 1200, DT_PASSWORD: 1201, DT_ACCOUNT_STATUS: 0, TRM_ACCOUNT_STATUS: 0, DT_ADDRESS: 1202,
  RT_SYS_USER: 133, RT_SYS_GROUP: 134
};
const dbdefs = {
  dbconst: (name) => CONSTANTS[name] ?? 0,
  localId: (kind, code) => ({ 'rty:2-1107': 133, 'rty:2-1108': 134 })[`${kind}:${code}`] || 0
};

test('user and group structures: fields by DT_* constants; a constant without a field is left out', () => {
  const user = systemEditRows('user', dbdefs);
  assert.deepEqual(user.map((row) => row.key), [
    'tabAccount', 'login', 'email', 'password', 'tabInfo', 'givenNames', 'familyName', 'department', 'address', 'urls', 'tabMembership'
  ]);
  assert.equal(user[0].dty_Type, 'separator');
  assert.equal(user[0].rst_DefaultValue, 'tabs');
  assert.equal(user.find((row) => row.key === 'login').rst_DetailTypeID, 1200);
  assert.equal(user.find((row) => row.key === 'login').rst_RequirementType, 'required');
  assert.equal(user.find((row) => row.key === 'password').form.inputType, 'password');
  const group = systemEditRows('group', dbdefs);
  assert.deepEqual(group.map((row) => [row.key, row.rst_DetailTypeID]), [
    ['tabInfo', -1], ['name', 1], ['longName', 3], ['description', 4], ['urls', 986], ['tabMembership', -6]
  ]);
});

test('user form: three tabs (Account, User info; Membership without the field is left out)', () => {
  const form = systemEditForm('user', dbdefs);
  assert.deepEqual(form.groups.map((group) => [group.type, group.label]), [['tabs', 'Account'], ['tabs', 'User info']]);
  assert.deepEqual(form.groups[0].children.map((field) => field.name), ['login', 'email', 'password']);
});

test('user values and details: the first value; a cleared value is []', () => {
  const record = { details: { 1200: ['ijohnson'], 23: ['ian@x.org'], 1: ['Johnson'], 1202: ['Sydney\nNSW\n2000'] } };
  const values = systemValues('user', record, dbdefs);
  assert.equal(values.login, 'ijohnson');
  assert.equal(values.address, 'Sydney\nNSW\n2000');
  assert.equal(values.password, '', 'no password is given');
  assert.deepEqual(systemDetails('user', { familyName: '', email: 'new@x.org' }, dbdefs), { 1: [], 23: ['new@x.org'] });
});

/** API that records the requests. */
function fakeApi(record) {
  const calls = [];
  return {
    calls,
    async get(path, options) {
      calls.push(['GET', path, options?.query]);
      if (path.endsWith('/image')) return { image: { url: 'u', thumbnail: 'http://h/t?x=1' } };
      return { records: [record] };
    },
    async request(path, { method, body } = {}) {
      calls.push([method, path, body]);
      if (path.endsWith('/members')) {
        return { records: [record], meta: { members: (body.add || []).map((id) => ({ id, role: body.role })) } };
      }
      if (path.endsWith('/image')) return { image: method === 'PUT' ? { url: 'u', thumbnail: 'http://h/t2?x=1' } : null };
      return { records: [{ ...record, rec_ID: path.endsWith('/0') ? '9' : record.rec_ID, ...body }], meta: { issues: [] } };
    }
  };
}

test('UserGroupClient: a group with its members; a save sends the changed fields; an empty password is not sent', async () => {
  const group = {
    rec_ID: '5', rec_Title: 'Team', rec_Modified: '2026-10-23 10:00:00',
    details: { 1: ['Team'], 4: ['About'], members: [{ id: 2, role: 'admin' }, { id: 7, role: 'member' }] }
  };
  const api = fakeApi(group);
  const client = new UserGroupClient({ apiClient: api, dbdefs }, 'group');
  const item = await client.get(5);
  assert.deepEqual(item.members, { 2: 'admin', 7: 'member' });
  assert.equal(item.values.description, 'About');
  assert.deepEqual(api.calls[0], ['GET', '/sys/group/5', { fields: '_all' }]);
  await client.save(5, { description: 'New' }, { modified: item.modified });
  assert.deepEqual(api.calls.at(-1).slice(0, 2), ['PATCH', '/sys/group/5']);
  assert.deepEqual(api.calls.at(-1)[2], { details: { 4: ['New'] }, rec_Modified: '2026-10-23 10:00:00' });

  const users = new UserGroupClient({ apiClient: fakeApi({ rec_ID: '2', details: {} }), dbdefs }, 'user');
  await users.save(2, { password: '  ', email: 'a@b.org' });
  assert.deepEqual(users.apiClient.calls.at(-1)[2].details, { 23: ['a@b.org'] }, 'no password key');
  await users.save(2, { password: 'secret' });
  assert.deepEqual(users.apiClient.calls.at(-1)[2].details, { 1201: ['secret'] });
});

test('HInputFile, entity-image mode: the image of the entity; upload and remove change it at once; no value', async () => {
  const api = fakeApi({ rec_ID: '5', details: {} });
  const client = new UserGroupClient({ apiClient: api, dbdefs }, 'group');
  const uploader = { async upload() { return { token: 'tk7', duplicates: [3] }; }, async cancel() {}, async register() { throw new Error('no'); } };
  const input = createHInput('file', host(), { entityImage: { client, id: 5 }, uploader, suppressLabel: true });
  await flush();
  assert.equal(input.getValue(), null);
  assert.equal(input.thumb.hidden, false);
  assert.match(input.thumb.src, /^http:\/\/h\/t\?x=1&t=/);
  assert.equal(input.removeImageButton.hidden, false);
  assert.equal(input.urlButton.hidden, true, 'no URL registration');
  await input.uploadFile({ name: 'logo.png', size: 9 });
  assert.deepEqual(api.calls.at(-1), ['PUT', '/sys/group/5/image', { upload: 'tk7' }]);
  assert.match(input.thumb.src, /t2/);
  input.removeImageButton.click();
  await flush();
  assert.deepEqual(api.calls.at(-1).slice(0, 2), ['DELETE', '/sys/group/5/image']);
  assert.equal(input.thumb.hidden, true);
  assert.equal(input.removeImageButton.hidden, true);
});
