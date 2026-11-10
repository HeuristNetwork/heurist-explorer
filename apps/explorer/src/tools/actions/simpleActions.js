/**
 * @file simpleActions.js
 * @brief Forms of the Actions tool without fields (plan 33): Rebuild record titles and Rebuild
 *        calculation fields (scope only), and Delete records (a warning; the server password
 *        above DELETE_FREE records).
 *
 * Same interface as FieldValuesAction: attach, setRecordTypes, setScope, problems, params, destroy.
 * The server checks the delete again (srv/Records/Actions/DeleteGuard.php): the password above
 * 10 records, half of the database or more only for the database owner.
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

import { $HR } from '#shared/ui';

/** Records deleted without the server password (server: DeleteGuard::FREE). */
export const DELETE_FREE = 10;

/** Share of the database that only the database owner may delete (server: DeleteGuard::SHARE). */
export const DELETE_SHARE = 0.5;

/** An action without a form: the scope only (titles, calculated fields). */
export class NoFormAction {
  /**
   * @param {{action: string, name: string}} options Action id and its name (job title).
   */
  constructor({ action, name }) {
    this.action = action;
    this.name = name;
  }

  /** @returns {NoFormAction} this. */
  attach(host) {
    this.host = host;
    const note = document.createElement('div');
    note.className = 'h-muted h-actions-noform';
    note.textContent = $HR('No options: the action runs on the records of the scope.');
    host.replaceChildren(note);
    return this;
  }

  async setRecordTypes() {}

  /** @returns {string[]} */
  problems() {
    return [];
  }

  /** @returns {{action: string, title: string}} */
  params() {
    return { action: this.action, title: $HR(this.name) };
  }

  async destroy() {
    this.host?.replaceChildren();
  }
}

/** Delete records: warning and the server password for more than DELETE_FREE records. */
export class DeleteAction {
  /**
   * @param {object} options
   * @param {object} [options.dbdefs] HDbDefs (record counts of the database, for the share).
   * @param {() => void} [options.onChange] The password was typed.
   */
  constructor({ dbdefs = null, onChange = null } = {}) {
    this.dbdefs = dbdefs;
    this.onChange = onChange || (() => {});
    this.count = 0;
  }

  /** @returns {DeleteAction} this. */
  attach(host) {
    this.host = host;
    host.classList.add('h-actions-delete');
    const warning = document.createElement('div');
    warning.className = 'h-actions-warning';
    warning.innerHTML = '<span class="fa-solid fa-triangle-exclamation" aria-hidden="true"></span> ';
    warning.append(document.createTextNode($HR('The records are deleted for good: this cannot be undone. Pointers to them '
      + 'from other records are removed and their relationship records are deleted.')));
    this._share = document.createElement('div');
    this._share.className = 'h-actions-warning h-actions-delete-share';
    this._share.hidden = true;
    this._passwordRow = document.createElement('label');
    this._passwordRow.className = 'h-actions-row h-actions-delete-password';
    const caption = document.createElement('span');
    caption.className = 'h-actions-row-label';
    caption.textContent = $HR('Server password');
    this._password = document.createElement('input');
    this._password.type = 'password';
    this._password.className = 'h-input';
    this._password.autocomplete = 'off';
    this._password.addEventListener('input', () => this.onChange());
    const help = document.createElement('div');
    help.className = 'h-muted h-actions-note';
    help.textContent = $HR('More than 10 records: enter the server password (not your login password; ask the system administrator).');
    this._passwordRow.append(caption, this._password);
    this._passwordBox = document.createElement('div');
    this._passwordBox.append(this._passwordRow, help);
    host.replaceChildren(warning, this._share, this._passwordBox);
    this._update();
    return this;
  }

  async setRecordTypes() {}

  /**
   * Records in the scope: the password is asked above DELETE_FREE; the share of the database is shown.
   *
   * @param {{count: number}} scope Records in the scope.
   */
  setScope({ count = 0 } = {}) {
    this.count = Number(count) || 0;
    this._update();
  }

  /** @returns {boolean} The server password is needed. */
  needsPassword() {
    return this.count > DELETE_FREE;
  }

  /** @returns {string[]} */
  problems() {
    return this.needsPassword() && !this._password?.value ? ['Enter the server password to delete more than 10 records'] : [];
  }

  /** @returns {{action: string, title: string, password?: string}} The password goes only into the start request. */
  params() {
    const params = { action: 'delete', title: `${$HR('Delete records')}: ${this.count}` };
    if (this.needsPassword()) params.password = this._password?.value || '';
    return params;
  }

  async destroy() {
    if (this._password) this._password.value = '';
    this.host?.replaceChildren();
  }

  /** Records of the database (record type counts of Explorer), null when not known. */
  _databaseTotal() {
    const defs = this.dbdefs;
    if (!defs?.hasRectypeCounts?.()) return null;
    const ids = (defs.rectypes?.() || []).map((item) => Number(item?.id ?? item?.rty_ID ?? item));
    const total = ids.reduce((sum, id) => sum + (Number(defs.rectypeCount?.(id)) || 0), 0);
    return total > 0 ? total : null;
  }

  _update() {
    if (!this._passwordBox) return;
    this._passwordBox.hidden = !this.needsPassword();
    const total = this._databaseTotal();
    const large = this.needsPassword() && total && this.count >= total * DELETE_SHARE;
    this._share.hidden = !large;
    if (large) {
      this._share.textContent = `${this.count} / ${total} ${$HR('records: half of the database or more. Only the database owner may do this; '
        + 'otherwise use Database administration > Clear database.')}`;
    }
  }
}
