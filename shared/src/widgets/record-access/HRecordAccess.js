/**
 * @file HRecordAccess.js
 * @brief Owner and visibility of a record (plan 21 §6): port of the legacy access
 *        form (`hclient/widgets/record/recordAccess.js`), used by the Add record
 *        dialog and the Admin panel of HRecordEditor.
 *
 * - *Record is owned (editable) by*: Any logged-in user, Current user, the user's
 *   groups (a database administrator: all users and groups).
 * - *Record is viewable by* (radios): *User or group specified above* with the
 *   groups that can also view (not offered when the owner is any logged-in user),
 *   *Any logged-in user*, *Public*. The rules are in `data/recordAccess.js`.
 * - Option `editGroups`: the groups that can also edit (`rec_EditGroups`; the
 *   record editor; not in the legacy form).
 *
 * Event on the container: `h-record-access-change` (detail `{value}`).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HBaseWidget } from '../HBaseWidget.js';
import { HValueCombo } from '../picker/HValueCombo.js';
import { UserGroupSource } from '../../data/valueSources/localSources.js';
import { accessFormState, accessHeader } from '../../data/recordAccess.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HRecordAccess.css';

/** Visibility radios: value and label (legacy texts). */
const CHOICES = [
  ['hidden', 'User or group specified above'],
  ['viewable', 'Any logged-in user can view the record(s)'],
  ['public', 'Public - viewable for anyone in published live view, including data export (e.g. XML) without a login']
];

let nextAccessId = 0;

/**
 * Owners a user may choose (legacy `createUserGroupsSelect`): Any logged-in user,
 * Current user, the groups the user belongs to; a database administrator: all groups
 * and users. The current owner is kept in the list.
 *
 * @param {object} dbdefs HDbDefs with the users/groups overlay.
 * @param {number} [current] Current owner.
 * @returns {{load: Function, labelFor: Function, items: Function}} Value source.
 */
export function ownerChoices(dbdefs, current = null) {
  const userId = Number(dbdefs?.currentUserId?.()) || 0;
  const admin = dbdefs?.isDbAdmin?.() === true;
  const name = (id) => dbdefs?.userGroupName?.(id) || `#${id}`;
  const items = () => {
    const list = [{ value: 0, label: $HR('Any logged-in user') }];
    if (userId) list.push({ value: userId, label: `${$HR('Current user')} (${name(userId)})` });
    const groups = (dbdefs?.groups?.() || [])
      .filter((group) => admin || group.role === 'member' || group.role === 'admin')
      .map((group) => ({ value: group.id, label: group.name, group: 'groups', groupLabel: $HR('Groups') }));
    const users = admin
      ? (dbdefs?.users?.() || [])
        .filter((user) => user.id !== userId)
        .map((user) => ({ value: user.id, label: user.name, group: 'users', groupLabel: $HR('Users') }))
      : [];
    list.push(...sortByLabel(groups), ...sortByLabel(users));
    const owner = Number(current);
    if (owner > 0 && !list.some((item) => item.value === owner)) list.push({ value: owner, label: name(owner) });
    return list;
  };
  return {
    items,
    async load() {
      const list = items();
      return { items: list, total: list.length, complete: true };
    },
    labelFor(value) {
      const id = Number(value);
      if (id === 0) return $HR('Any logged-in user');
      if (id === userId) return `${$HR('Current user')} (${name(userId)})`;
      return dbdefs?.userGroupName?.(id) || '';
    }
  };
}

/** Owner and visibility form. */
export class HRecordAccess extends HBaseWidget {
  /**
   * @param {HTMLElement} container Form host.
   * @param {object} options
   * @param {object} options.dbdefs HDbDefs with the users/groups overlay.
   * @param {{owner?: number, visibility?: string, viewGroups?: number[], editGroups?: number[]}} [options.value]
   *        Record header (`rec_OwnerUGrpID`, `rec_NonOwnerVisibility`...).
   * @param {boolean} [options.editGroups=false] Show "Also editable by" (rec_EditGroups).
   * @param {boolean} [options.readOnly=false] Nothing can be changed.
   * @param {Function} [options.onChange] Called with the header after a change.
   * @returns {HRecordAccess} This form.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.formState = accessFormState(options.value || {});
    this._combos = [];
    return this;
  }

  /** @returns {HRecordAccess} This form. */
  render() {
    if (!this.container) throw new Error('HRecordAccess must be attached before render');
    const id = `h-record-access-${++nextAccessId}`;
    this.container.replaceChildren();
    this.container.classList.add('h-record-access');
    const readOnly = Boolean(this.options.readOnly);
    const state = this.formState;

    // owner
    const ownerRow = this._section('Record is owned (editable) by:');
    this.ownerCombo = this._combo(ownerRow, ownerChoices(this.options.dbdefs, state.owner), state.owner, false);

    // visibility
    const viewRow = this._section('Record is viewable by:');
    const radios = document.createElement('div');
    radios.className = 'h-record-access-choices';
    radios.setAttribute('role', 'radiogroup');
    viewRow.append(radios);
    this.radios = new Map();
    for (const [value, label] of CHOICES) {
      const line = document.createElement('label');
      line.className = `h-record-access-choice h-record-access-choice-${value}`;
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `${id}-visibility`;
      radio.value = value;
      radio.checked = state.choice === value;
      radio.disabled = readOnly;
      const text = document.createElement('span');
      text.className = 'h-i18n';
      text.textContent = $HR(label);
      line.append(radio, text);
      radios.append(line);
      this.radios.set(value, { line, radio });
      this.listen(radio, 'change', () => this._changed());
      if (value === 'hidden') {
        // the groups that can also view, under the first radio
        this.viewGroupsBox = document.createElement('div');
        this.viewGroupsBox.className = 'h-record-access-groups';
        const help = document.createElement('div');
        help.className = 'h-record-access-help h-i18n';
        help.textContent = $HR('Members of the following groups can also view the record(s)');
        const host = document.createElement('div');
        this.viewGroupsBox.append(help, host);
        radios.append(this.viewGroupsBox);
        this.viewGroupsCombo = this._combo(host, new UserGroupSource(this.options.dbdefs, { users: false }), state.viewGroups, true);
      }
    }
    if (state.pending) {
      this.pendingNote = document.createElement('div');
      this.pendingNote.className = 'h-record-access-help h-record-access-pending h-i18n';
      this.pendingNote.textContent = $HR('Public, changes pending approval');
      radios.append(this.pendingNote);
    }

    // edit groups (record editor only)
    if (this.options.editGroups === true) {
      const editRow = this._section('Also editable by:');
      this.editGroupsCombo = this._combo(editRow, new UserGroupSource(this.options.dbdefs), state.editGroups, true);
    }
    this._sync();
    this.state = 'rendered';
    return this;
  }

  /**
   * Record header of the form (the legacy save rule).
   *
   * @returns {{owner: number, visibility: string, viewGroups: number[], editGroups: number[]}}
   */
  getValue() {
    if (!this.ownerCombo) return accessHeader(this.formState);
    return accessHeader(this._formState());
  }

  /** @returns {Promise<void>} Completion after the pickers are removed. */
  async destroy() {
    for (const combo of this._combos) await combo.destroy();
    this._combos = [];
    this.container?.classList.remove('h-record-access');
    await super.destroy();
  }

  /** Form state from the controls. */
  _formState() {
    const choice = [...this.radios.entries()].find(([, item]) => item.radio.checked)?.[0] || 'viewable';
    return {
      owner: Number(this.ownerCombo.getValue()) || 0,
      choice,
      viewGroups: this.viewGroupsCombo?.getValue() || [],
      editGroups: this.editGroupsCombo?.getValue() || this.formState.editGroups,
      // pending stays while Public stays checked
      pending: this.formState.pending && choice === 'public'
    };
  }

  /**
   * Owner "any logged-in user": no "User or group specified above" (legacy: then
   * "Any logged-in user" is checked unless Public is); the groups only with that radio.
   */
  _sync() {
    const hidden = this.radios.get('hidden');
    const anyone = (Number(this.ownerCombo.getValue()) || 0) === 0;
    hidden.line.hidden = anyone;
    if (anyone && hidden.radio.checked) this.radios.get('viewable').radio.checked = true;
    this.viewGroupsBox.hidden = anyone || !hidden.radio.checked;
    if (this.pendingNote) this.pendingNote.hidden = !this.radios.get('public').radio.checked;
  }

  /** A control changed. */
  _changed() {
    this._sync();
    const value = this.getValue();
    this.options.onChange?.(value);
    this.container?.dispatchEvent(new CustomEvent('h-record-access-change', { bubbles: true, detail: { value } }));
  }

  /** A titled section of the form. */
  _section(title) {
    const section = document.createElement('div');
    section.className = 'h-record-access-section';
    const caption = document.createElement('div');
    caption.className = 'h-record-access-caption h-i18n';
    caption.textContent = $HR(title);
    section.append(caption);
    this.container.append(section);
    return section;
  }

  /** A users / groups picker. */
  _combo(host, source, value, multiple) {
    const box = document.createElement('div');
    box.className = 'h-record-access-picker';
    host.append(box);
    const combo = new HValueCombo().attach(box, {
      source,
      multiple,
      value,
      emptyLabel: multiple ? $HR('Nobody else') : $HR('Select…'),
      onChange: () => this._changed()
    }).render();
    combo.setReadOnly(Boolean(this.options.readOnly));
    this._combos.push(combo);
    return combo;
  }
}

/** Items sorted by label. */
function sortByLabel(items) {
  return items.sort((a, b) => String(a.label).localeCompare(String(b.label)));
}
