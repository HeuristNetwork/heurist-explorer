/**
 * @file ExplorerUserGroupManager.js
 * @brief "Manage users" and "Manage groups" (plan 20, Phase 4d): the record manager of the
 *        System user / System User Group type on /sys, and the editor of one user or group
 *        (HEditForm on the hard-coded structures of systemEntities.js) in a dialog.
 *
 * A user: account (login name, e-mail, password with its repeat, status for administrators),
 * person, activity (read only) and the image. A group: name, long name, description, URLs,
 * the admins and members (written with the members requests) and the image. The server
 * decides who may change what (administrators, the user, the admins of a group).
 *
 *   await openUserGroupManager('group', { apiClient, dbdefs, baseUrl, database, onChange });
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR, HMsg } from '#shared/ui';
import { UserGroupClient } from '#shared/data/UserGroupClient.js';
import { systemEditForm } from '#shared/data/systemEntities.js';

/**
 * Open the manager of users or groups.
 *
 * @param {'user'|'group'} type The type.
 * @param {{apiClient: object, dbdefs: object, baseUrl?: string, database?: string, onChange?: Function}} options
 *        `onChange`: after the manager closed when something was saved or deleted (the user / group lists).
 * @returns {Promise<void>} Resolved when the manager closes.
 */
export async function openUserGroupManager(type, { apiClient, dbdefs, baseUrl = '', database = '', onChange = null }) {
  const currentUserId = Number(dbdefs?.currentUserId?.()) || 0;
  if (currentUserId < 1) {
    HMsg.showMsgErr($HR('Log in to manage users and groups'));
    return;
  }
  const rty = Number(dbdefs?.dbconst?.(type === 'user' ? 'RT_SYS_USER' : 'RT_SYS_GROUP')) || 0;
  if (!(rty > 0)) {
    HMsg.showMsgErr($HR('This database has no record type for users and groups'));
    return;
  }
  const isAdmin = Boolean(dbdefs?.isDbAdmin?.());
  let changed = false;
  const edit = async (id) => {
    const result = await editUserOrGroup(type, id, { apiClient, dbdefs, isAdmin, currentUserId });
    if (result.saved) changed = true;
    return result;
  };
  const { openRecordManager } = await import('#shared/widgets/record-manager/openRecordManager.js');
  // users are added by administrators; any user adds a group (and becomes its admin)
  const canAdd = type === 'group' || isAdmin;
  await openRecordManager({
    selectMode: 'manager',
    recordTypes: [rty],
    title: $HR(type === 'user' ? 'Users' : 'Groups'),
    apiClient,
    dbdefs,
    editRecord: (id) => edit(Number(id)),
    viewRecord: null,
    addActions: canAdd ? [{
      id: 'add', icon: 'fa-plus-circle', label: type === 'user' ? 'Add new user' : 'Add new group', run: () => edit(0)
    }] : [],
    baseUrl,
    database
  });
  if (changed) await onChange?.();
}

/**
 * Edit (id 0: add) a user or group in a dialog.
 *
 * @returns {Promise<{saved: boolean, recordId: number}>}
 */
export async function editUserOrGroup(type, id, { apiClient, dbdefs, isAdmin = false, currentUserId = 0 }) {
  const client = new UserGroupClient({ apiClient, dbdefs }, type);
  let item = { id: 0, title: '', modified: null, values: {}, members: {} };
  if (id > 0) {
    try {
      item = await client.get(id);
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error));
      return { saved: false, recordId: 0 };
    }
  }
  const form = userGroupForm(type, dbdefs, { item, client, isAdmin, isSelf: id > 0 && id === currentUserId });
  const values = { ...item.values, ...membersValues(item.members) };
  let saved = 0;
  const { openEditFormDialog } = await import('#shared/widgets/edit-form/editFormDialog.js');
  await openEditFormDialog({
    title: id > 0 ? `${$HR(type === 'user' ? 'User' : 'Group')}: ${item.title}` : $HR(type === 'user' ? 'New user' : 'New group'),
    form,
    values,
    apiClient,
    dbdefs,
    className: 'h-explorer-user-group-dialog',
    buttons: [{ id: 'save', label: 'Save', primary: true }, { id: 'cancel', label: 'Cancel' }],
    onAction: async (action, next) => {
      if (action !== 'save') return true;
      if (type === 'user' && String(next.password || '') !== String(next.passwordRepeat || '')) {
        HMsg.showMsgErr($HR('The two passwords are not the same'));
        return false;
      }
      try {
        const result = await client.save(item.id, changedValues(type, item.values, next), { modified: item.modified });
        saved = result.item.id;
        if (type === 'group') await client.setMembers(saved, nextMembers(next, currentUserId, item.id > 0 ? item.members : null), item.id > 0 ? item.members : membersOf(saved, currentUserId));
        if (result.issues?.length) HMsg.showMsgFlash?.(result.issues.map((issue) => issue.message).join('; '));
        return true;
      } catch (error) {
        HMsg.showMsgErr(error?.message || String(error), { title: $HR('Not saved') });
        return false;
      }
    }
  });
  return { saved: saved > 0, recordId: saved };
}

/**
 * HEditForm JSON of a user or group: the structure, the password repeat, the admins and
 * members (groups), and the image (a saved one).
 *
 * @returns {object} `heurist-edit-form/1`.
 */
export function userGroupForm(type, dbdefs, { item, client, isAdmin = false, isSelf = false }) {
  if (type === 'user') {
    // the status: administrators only (not their own account)
    const form = systemEditForm('user', dbdefs, {
      fields: {
        status: { readOnly: !isAdmin || isSelf },
        password: { req: item.id > 0 ? 'optional' : 'required' }
      }
    });
    const fields = form.groups.flatMap((group) => group.children);
    const index = fields.findIndex((field) => field.name === 'password');
    if (index >= 0) {
      const group = form.groups.find((entry) => entry.children.includes(fields[index]));
      group.children.splice(group.children.indexOf(fields[index]) + 1, 0, {
        name: 'passwordRepeat', type: 'freetext', label: 'Repeat the password', inputType: 'password', req: 'optional'
      });
    }
    return withImage(form, type, item, client);
  }
  const users = (dbdefs?.users?.() || []).map((user) => ({ id: Number(user.id), label: String(user.name ?? `#${user.id}`) }));
  const form = systemEditForm('group', dbdefs);
  form.groups.push({
    id: 'members', type: 'group', label: 'Members', children: [
      { name: 'admins', type: 'enum', label: 'Admins', max: 0, terms: users, help: 'A group has at least one admin' },
      { name: 'members', type: 'enum', label: 'Members', max: 0, terms: users }
    ]
  });
  return withImage(form, type, item, client);
}

/** The image field of a saved user or group (changed at once, not with the save). */
function withImage(form, type, item, client) {
  if (item.id > 0) {
    form.groups.push({
      id: 'image', type: 'group', label: 'Image', children: [{
        name: 'image', type: 'file', label: type === 'user' ? 'Picture' : 'Logo', entityImage: { client, id: item.id },
        help: 'Upload an image; it is changed at once'
      }]
    });
  }
  return form;
}

/** The values that differ from the loaded ones (a password only when given). */
function changedValues(type, before, next) {
  const changed = {};
  for (const [key, value] of Object.entries(next || {})) {
    if (['passwordRepeat', 'admins', 'members', 'image'].includes(key)) continue;
    if (key === 'password') {
      if (String(value ?? '').trim()) changed.password = value;
      continue;
    }
    const text = Array.isArray(value) ? value.join(',') : String(value ?? '');
    const old = Array.isArray(before?.[key]) ? before[key].join(',') : String(before?.[key] ?? '');
    if (text !== old) changed[key] = value;
  }
  return changed;
}

/** Form values of the members: `{admins: [ids], members: [ids]}`. */
function membersValues(members) {
  const ids = (role) => Object.keys(members || {}).filter((id) => members[id] === role).map(Number);
  return { admins: ids('admin'), members: ids('member') };
}

/**
 * The members of the form: user id => role (an admin listed in both is an admin); a new
 * group without admins: its creator.
 */
function nextMembers(values, currentUserId, current) {
  const members = {};
  for (const id of values.members || []) members[Number(id)] = 'member';
  for (const id of values.admins || []) members[Number(id)] = 'admin';
  if (current === null && !Object.values(members).includes('admin') && currentUserId > 0) members[currentUserId] = 'admin';
  return members;
}

/** The members of a new group as the server made it: its creator as the admin. */
function membersOf(groupId, currentUserId) {
  return groupId > 0 && currentUserId > 0 ? { [currentUserId]: 'admin' } : {};
}
