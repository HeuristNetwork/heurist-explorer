import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { userGroupForm } = await import('../src/ui/ExplorerUserGroupManager.js');

const CONSTANTS = {
  DT_NAME: 1, DT_SHORT_SUMMARY: 3, DT_EMAIL: 23, DT_LOGIN_NAME: 1200, DT_PASSWORD: 1201, DT_ACCOUNT_STATUS: 1203,
  DT_GROUP_MEMBERSHIP: 1196, TRM_GROUP_ROLE: 10674
};
const dbdefs = {
  dbconst: (name) => CONSTANTS[name] ?? 0,
  localId: (kind, code) => ({ 'rty:2-1107': 133, 'rty:2-1108': 134 })[`${kind}:${code}`] || 0,
  users: () => [{ id: 2, name: 'Artem (osmakov)' }, { id: 7, name: 'Ian (ijohnson)' }]
};
const fields = (form) => form.groups.flatMap((group) => group.children);

test('user form: the password repeat after the password; the status read only on the own account; the image of a saved user', () => {
  const client = {};
  const own = userGroupForm('user', dbdefs, { item: { id: 2 }, client, isAdmin: true, isSelf: true });
  const names = fields(own).map((field) => field.name);
  assert.deepEqual(names.slice(0, 5), ['login', 'email', 'password', 'passwordRepeat', 'status']);
  assert.equal(fields(own).find((field) => field.name === 'status').readOnly, true);
  assert.equal(fields(own).find((field) => field.name === 'password').req, 'optional', 'a saved user keeps the password');
  assert.deepEqual(fields(own).find((field) => field.name === 'image').entityImage, { client, id: 2 });
  const added = userGroupForm('user', dbdefs, { item: { id: 0 }, client, isAdmin: true });
  assert.equal(fields(added).find((field) => field.name === 'password').req, 'required', 'a new user needs a password');
  assert.equal(fields(added).find((field) => field.name === 'status').readOnly, false);
  assert.equal(fields(added).some((field) => field.name === 'image'), false, 'no image before the first save');
});

test('group form: the members are the membership relmarker (plan 24); read only before the first save', () => {
  const form = userGroupForm('group', dbdefs, { item: { id: 5 }, client: {} });
  const members = fields(form).find((field) => field.name === 'members');
  assert.equal(members.type, 'relmarker');
  assert.equal(members.max, 0);
  assert.equal(members.vocabulary, 10674);
  assert.deepEqual(members.targetTypes, [133]);
  assert.notEqual(members.readOnly, true);
  assert.deepEqual(fields(form).map((field) => field.name), ['name', 'longName', 'image', 'members']);
  assert.deepEqual(form.groups.map((group) => [group.type, group.label]), [['tabs', 'Info'], ['tabs', 'Membership']]);
  const added = userGroupForm('group', dbdefs, { item: { id: 0 }, client: {} });
  assert.equal(fields(added).find((field) => field.name === 'members').readOnly, true);
});

test('user form: the groups of the user are the reverse membership field', () => {
  const form = userGroupForm('user', dbdefs, { item: { id: 7 }, client: {}, isAdmin: true });
  const groups = fields(form).find((field) => field.name === 'groups');
  assert.equal(groups.type, 'relmarker');
  assert.equal(groups.reverse, true);
  assert.deepEqual(groups.sourceTypes, [134]);
});
