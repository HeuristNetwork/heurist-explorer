import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { userGroupForm } = await import('../src/ui/ExplorerUserGroupManager.js');

const CONSTANTS = { DT_NAME: 1, DT_SHORT_SUMMARY: 3, DT_EMAIL: 23, DT_LOGIN_NAME: 1200, DT_PASSWORD: 1201, DT_ACCOUNT_STATUS: 1203 };
const dbdefs = {
  dbconst: (name) => CONSTANTS[name] ?? 0,
  localId: () => 0,
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

test('group form: admins and members are lists of the users', () => {
  const form = userGroupForm('group', dbdefs, { item: { id: 5 }, client: {} });
  const admins = fields(form).find((field) => field.name === 'admins');
  assert.equal(admins.type, 'enum');
  assert.equal(admins.max, 0);
  assert.deepEqual(admins.terms, [{ id: 2, label: 'Artem (osmakov)' }, { id: 7, label: 'Ian (ijohnson)' }]);
  assert.deepEqual(fields(form).map((field) => field.name), ['name', 'longName', 'admins', 'members', 'image']);
});
