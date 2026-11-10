/**
 * @file OwnershipAction.js
 * @brief Form of the action "Ownership and visibility" of the Actions tool (plan 33): the
 *        owner and visibility form of HRecordEditor Summary → Admin (HRecordAccess), inline.
 *
 * The edit groups are not offered (as in the record editor): the stored ones are kept.
 * The owner starts as the current user, the visibility as "Any logged-in user".
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

import { HRecordAccess, describeAccess } from '#shared/widgets/record-access/HRecordAccess.js';
import { $HR } from '#shared/ui';

/** Ownership form of the Actions tool. */
export class OwnershipAction {
  /**
   * @param {object} options
   * @param {object} options.dbdefs HDbDefs (users and groups overlay).
   * @param {() => void} [options.onChange] The owner or visibility changed.
   */
  constructor({ dbdefs, onChange = null }) {
    this.dbdefs = dbdefs;
    this.onChange = onChange || (() => {});
    this.access = null;
  }

  /**
   * Show the form in a host element (the users and groups are loaded first).
   *
   * @param {HTMLElement} host Host element.
   * @returns {OwnershipAction} this.
   */
  attach(host) {
    this.host = host;
    host.classList.add('h-actions-ownership');
    host.textContent = $HR('Loading...');
    this.ready = this._render();
    return this;
  }

  /** Record types do not matter for this action. */
  async setRecordTypes() {
    await this.ready;
  }

  /** @returns {string[]} No problems: the form always has a value. */
  problems() {
    return this.access ? [] : ['Loading...'];
  }

  /** @returns {{action: string, title: string, owner: number, visibility: string, viewGroups: number[]}} */
  params() {
    const value = this.access?.getValue?.() || { owner: 0, visibility: 'viewable', viewGroups: [] };
    const described = describeAccess(value, this.dbdefs);
    return {
      action: 'ownership',
      title: `${$HR('Ownership and visibility')}: ${described.owner} · ${described.access}`,
      owner: Number(value.owner) || 0,
      visibility: value.visibility || 'viewable',
      viewGroups: value.visibility === 'viewable' ? (value.viewGroups || []).map(Number) : []
    };
  }

  /** Remove the form. */
  async destroy() {
    await this.ready?.catch?.(() => {});
    await this.access?.destroy?.();
    this.access = null;
    this.host?.replaceChildren();
  }

  async _render() {
    try {
      await this.dbdefs?.ensureUserGroups?.(['users', 'groups']);
    } catch (error) {
      console.warn('Actions: users and groups are not available', error);
    }
    if (!this.host) return;
    const box = document.createElement('div');
    this.host.replaceChildren(box);
    const userId = Number(this.dbdefs?.currentUserId?.()) || 0;
    this.access = new HRecordAccess().attach(box, {
      dbdefs: this.dbdefs,
      value: { owner: userId, visibility: 'viewable', viewGroups: [] },
      editGroups: false,
      onChange: () => this.onChange()
    }).render();
    this.onChange();
  }
}
