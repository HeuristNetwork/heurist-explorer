/**
 * @file ExplorerUserGroupManager.js
 * @brief "Manage users" and "Manage groups" (plan 20, Phase 4d): the record manager of the
 *        System user / System User Group type on /sys, and the editor of one user or group
 *        (HEditForm on the hard-coded structures of systemEntities.js) in a dialog.
 *
 * A user: account (login name, e-mail, password with its repeat, status for administrators),
 * person, activity (read only), the groups with the role and the image. A group: name, long
 * name, description, URLs, the members with the role and the image. The memberships are the
 * relmarker DT_GROUP_MEMBERSHIP (plan 24): "Manage" opens the relations mode of the record
 * manager, the changes are written at once (POST /sys/group/{id}/members), not with Save.
 * The server decides who may change what (administrators, the user, the admins of a group).
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
import { formStates } from '#shared/data/editFormSchema.js';
import { MembershipRelationStore } from '#shared/data/relationStores.js';

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
    const result = await editUserOrGroup(type, id, { apiClient, dbdefs, isAdmin, currentUserId, baseUrl, database });
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
export async function editUserOrGroup(type, id, { apiClient, dbdefs, isAdmin = false, currentUserId = 0, baseUrl = '', database = '' }) {
  const client = new UserGroupClient({ apiClient, dbdefs }, type);
  let item = { id: 0, title: '', modified: null, values: {} };
  if (id > 0) {
    try {
      item = await client.get(id);
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error));
      return { saved: false, recordId: 0 };
    }
  }
  const form = userGroupForm(type, dbdefs, { item, client, isAdmin, isSelf: id > 0 && id === currentUserId });
  const states = formStates(form, item.values);
  const membership = await membershipService(type, form, item, { apiClient, dbdefs, baseUrl, database, states, isAdmin, currentUserId });
  let saved = 0;
  const { openEditFormDialog } = await import('#shared/widgets/edit-form/editFormDialog.js');
  await openEditFormDialog({
    title: id > 0 ? `${$HR(type === 'user' ? 'User' : 'Group')}: ${item.title}` : $HR(type === 'user' ? 'New user' : 'New group'),
    form,
    states,
    relationships: membership?.service || null,
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
        if (result.issues?.length) HMsg.showMsgFlash?.(result.issues.map((issue) => issue.message).join('; '));
        return true;
      } catch (error) {
        HMsg.showMsgErr(error?.message || String(error), { title: $HR('Not saved') });
        return false;
      }
    }
  });
  const changed = saved > 0 || membership?.changed() === true;
  return { saved: changed, recordId: saved || item.id };
}

/**
 * The memberships of a saved user or group (plan 24): the relmarker field of the form with
 * its relations in `states`, and the field service whose `manage` opens the relations mode
 * of the record manager. A new user or group: none (the field is read only).
 *
 * @returns {Promise<{service: object, changed: () => boolean}|null>}
 */
async function membershipService(type, form, item, { apiClient, dbdefs, baseUrl, database, states, isAdmin = false, currentUserId = 0 }) {
  const name = type === 'group' ? 'members' : 'groups';
  const field = form.groups.flatMap((group) => group.children).find((child) => child.name === name);
  if (!field || !(item.id > 0)) return null;
  const store = new MembershipRelationStore({ apiClient, dbdefs, field, record: { id: item.id, title: item.title } });
  const entries = (relations) => ({ values: relations.map((relation) => ({ value: relation.relId, hidden: false, relation })), translations: [] });
  try {
    states.set(name, entries(await store.list()));
  } catch (error) {
    HMsg.showMsgErr(error?.message || String(error));
  }
  let changed = false;
  const service = {
    ensureRecord: async () => ({ id: item.id, title: item.title }),
    load: async () => null,
    fits: () => true,
    changed: () => {},
    // the remove action of one membership
    remove: async (relId) => {
      const relation = (await store.list()).find((entry) => entry.relId === Number(relId));
      if (relation) await store.remove(relation);
      changed = true;
    },
    manage: async () => {
      const { openRecordManager } = await import('#shared/widgets/record-manager/openRecordManager.js');
      // "Find or Add": the other type with its Add button (users by administrators, groups by anyone)
      const other = type === 'group' ? 'user' : 'group';
      const canAdd = other === 'group' || isAdmin;
      const addActions = canAdd ? [{
        id: 'add', icon: 'fa-plus-circle', label: other === 'user' ? 'Add new user' : 'Add new group',
        run: () => editUserOrGroup(other, 0, { apiClient, dbdefs, isAdmin, currentUserId, baseUrl, database })
      }] : [];
      const result = await openRecordManager({
        selectMode: 'relations',
        relations: { store },
        browseRecords: (browse) => openRecordManager({ apiClient, dbdefs, baseUrl, database, addActions, ...browse }),
        title: `${$HR(type === 'group' ? 'Members of' : 'Groups of')} ${item.title}`,
        apiClient,
        dbdefs,
        baseUrl,
        database
      });
      if (result?.changed) changed = true;
      return store.list();
    }
  };
  return { service, changed: () => changed };
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
        password: { req: item.id > 0 ? 'optional' : 'required' },
        groups: membershipField(item)
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
  const form = systemEditForm('group', dbdefs, { fields: { members: membershipField(item) } });
  return withImage(form, type, item, client);
}

/** The membership field: read only until the user / group is saved. */
function membershipField(item) {
  return item.id > 0 ? {} : { readOnly: true, help: 'Save first: the memberships are changed after the first save' };
}

/** The image field of a saved user or group (changed at once, not with the save). */
function withImage(form, type, item, client) {
  if (item.id > 0) {
    const image = {
      name: 'image', type: 'file', label: type === 'user' ? 'Picture' : 'Logo', entityImage: { client, id: item.id },
      help: 'Upload an image; it is changed at once'
    };
    // in the User info tab (with the names) / the Info tab of a group (with its name)
    const near = type === 'user' ? 'givenNames' : 'name';
    const info = form.groups.find((group) => group.children.some((field) => field.name === near));
    if (info) info.children.push(image);
    else form.groups.push({ id: 'image', type: 'group', label: 'Image', children: [image] });
  }
  return form;
}

/** The values that differ from the loaded ones (a password only when given). */
function changedValues(type, before, next) {
  const changed = {};
  for (const [key, value] of Object.entries(next || {})) {
    if (['passwordRepeat', 'members', 'groups', 'image'].includes(key)) continue;
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
