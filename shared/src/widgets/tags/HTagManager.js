/**
 * @file HTagManager.js
 * @brief Manager of the tags (keywords) of the user and of the user's groups (plan 20,
 *        Phase 4a), as the legacy tag manager (manageUsrTags.js).
 *
 * One accordion per owner: "Personal tags", then each group of the user. Each lists
 * its tags with the number of tagged records (a link: the host searches the records of
 * the tag) and a × to delete; an input with a + button adds a tag to the owner. A click
 * on a tag opens an inline input (HInputText): Enter or leaving it saves, Esc cancels;
 * a name the owner has already asks to merge the two tags. A tag on records is deleted
 * after a question that names the number of records (its links are removed).
 *
 *   new HTagManager().attach(host, { tagClient, currentUserId, groups, onSearchTag, onChange }).render();
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
import { createHInput } from '../form/inputs/createHInput.js';
import { tagTextProblem } from '../../data/TagClient.js';
import { confirmTagAction, tagOwnerGroups } from './tagGroups.js';
import { loadingIndicator } from '../../ui/loadingIndicator.js';
import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HTagManager.css';

/** Tags of the user and of the user's groups: add, rename, merge, delete. */
export class HTagManager extends HBaseWidget {
  /**
   * @param {HTMLElement} container Manager host.
   * @param {object} options
   * @param {import('../../data/TagClient.js').TagClient} options.tagClient Tag API.
   * @param {number} options.currentUserId The user (owner of the personal tags).
   * @param {Array<{id: number, name: string}>} [options.groups] The user's groups.
   * @param {(tag: {id: number, name: string}) => void} [options.onSearchTag] Searches the records of a tag
   *        (the usage count is a link with it).
   * @param {() => void} [options.onChange] After a tag was added, changed, merged or deleted.
   * @returns {HTagManager} This manager.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    if (!options.tagClient) throw new TypeError('HTagManager requires a tag client');
    this.tags = [];
    this.openOwners = null; // owners whose accordion is open (kept over reloads)
    return this;
  }

  /** @returns {HTagManager} This manager (the tags load). */
  render() {
    if (!this.container) throw new Error('HTagManager must be attached before render');
    this.container.classList.add('h-widget', 'h-tag-manager');
    void this.reload();
    this.state = 'rendered';
    return this;
  }

  /**
   * Load the tags again and show them.
   *
   * @returns {Promise<void>}
   */
  async reload() {
    if (!this.tags.length) this.container.replaceChildren(loadingIndicator($HR('Loading…'), 'h-tag-manager-note'));
    try {
      const { tags } = await this.options.tagClient.list();
      // destroyed while the tags loaded
      if (!this.container) return;
      this.tags = tags;
      this._renderGroups();
    } catch (error) {
      if (error?.name === 'AbortError' || !this.container) return;
      const note = document.createElement('div');
      note.className = 'h-tag-manager-note';
      note.textContent = `${$HR('The tags could not be loaded')}: ${error?.message || error}`;
      this.container.replaceChildren(note);
    }
  }

  /** The owner accordions. */
  _renderGroups() {
    this.clearListeners();
    const groups = tagOwnerGroups(this.tags, { currentUserId: this.options.currentUserId, groups: this.options.groups });
    if (this.openOwners === null) this.openOwners = new Set(groups.slice(0, 1).map((group) => group.owner));
    this.container.replaceChildren(...groups.map((group) => this._renderGroup(group)));
  }

  /** One owner: caption with the number of tags, the add row, the tags. */
  _renderGroup(group) {
    const details = document.createElement('details');
    details.className = 'h-tag-manager-group';
    details.open = this.openOwners.has(group.owner);
    details.dataset.owner = String(group.owner);
    this.listen(details, 'toggle', () => {
      if (details.open) this.openOwners.add(group.owner);
      else this.openOwners.delete(group.owner);
    });
    const summary = document.createElement('summary');
    summary.textContent = `${group.label} (${group.tags.length})`;
    const body = document.createElement('div');
    body.className = 'h-tag-manager-body';
    body.append(this._renderAddRow(group));
    const list = document.createElement('div');
    list.className = 'h-tag-manager-list';
    for (const tag of group.tags) list.append(this._renderTag(tag, group));
    if (!group.tags.length) {
      const empty = document.createElement('div');
      empty.className = 'h-tag-manager-empty';
      empty.textContent = $HR('No tags yet');
      list.append(empty);
    }
    body.append(list);
    details.append(summary, body);
    return details;
  }

  /** Input and + of an owner. */
  _renderAddRow(group) {
    const row = document.createElement('div');
    row.className = 'h-tag-manager-add';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'h-input h-tag-manager-add-input';
    input.placeholder = $HR('Add a tag');
    input.maxLength = 63;
    input.setAttribute('aria-label', `${$HR('Add a tag')}: ${group.label}`);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'heurist-icon-button h-tag-manager-add-button';
    button.title = $HR('Add a tag');
    button.setAttribute('aria-label', button.title);
    button.innerHTML = '<span class="fa-solid fa-circle-plus" aria-hidden="true"></span>';
    const add = () => void this._add(group, input);
    this.listen(button, 'click', add);
    this.listen(input, 'keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        add();
      }
    });
    row.append(input, button);
    return row;
  }

  /** One tag: its name (click: rename), the usage (search link), delete. */
  _renderTag(tag, group) {
    const row = document.createElement('div');
    row.className = 'h-tag-manager-tag';
    row.dataset.id = String(tag.id);
    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'h-tag-manager-name';
    name.textContent = tag.name;
    name.title = tag.description || $HR('Click to rename');
    this.listen(name, 'click', () => this._editName(tag, group, row, name));
    row.append(name);
    const usage = document.createElement(this.options.onSearchTag ? 'a' : 'span');
    usage.className = 'h-tag-manager-usage';
    usage.textContent = String(tag.usage);
    if (this.options.onSearchTag) {
      usage.href = '#';
      usage.title = $HR('Find records with this tag');
      this.listen(usage, 'click', (event) => {
        event.preventDefault();
        this.options.onSearchTag({ id: tag.id, name: tag.name });
      });
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'heurist-icon-button h-tag-manager-delete';
    remove.title = $HR('Delete the tag');
    remove.setAttribute('aria-label', remove.title);
    remove.innerHTML = '<span class="fa-solid fa-xmark" aria-hidden="true"></span>';
    this.listen(remove, 'click', () => void this._delete(tag));
    row.append(usage, remove);
    return row;
  }

  /** Inline rename: an HInputText in place of the name. */
  _editName(tag, group, row, name) {
    if (row.querySelector('.h-tag-manager-edit')) return;
    const host = document.createElement('div');
    host.className = 'h-tag-manager-edit';
    name.hidden = true;
    name.after(host);
    const input = createHInput('freetext', host, { value: tag.name, suppressLabel: true, clearButton: false, label: $HR('Tag') });
    const control = input.control;
    if (control) control.maxLength = 63;
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const text = String(input.getValue() ?? '').trim();
      if (save && text !== tag.name) await this._rename(tag, group, text);
      void input.destroy();
      host.remove();
      name.hidden = false;
    };
    this.listen(control, 'keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        void finish(false);
      }
    });
    this.listen(control, 'blur', () => void finish(true));
    control?.focus?.();
    control?.select?.();
  }

  /** Add a tag to an owner (a name it has already is shown, not added). */
  async _add(group, input) {
    const text = input.value.trim();
    const problem = tagTextProblem(text);
    if (problem) {
      HMsg.showMsgFlash($HR(problem));
      return;
    }
    const same = group.tags.find((tag) => tag.name.toLowerCase() === text.toLowerCase());
    if (same) {
      HMsg.showMsgFlash(`${$HR('This tag exists already')}: ${same.name}`);
      return;
    }
    try {
      await this.options.tagClient.create({ name: text, owner: group.owner });
      input.value = '';
      this.openOwners.add(group.owner);
      await this._changed();
    } catch (error) {
      this._error(error);
    }
  }

  /** Rename a tag; onto a name the owner has: merge after a question. */
  async _rename(tag, group, text) {
    const problem = tagTextProblem(text);
    if (problem) {
      HMsg.showMsgFlash($HR(problem));
      return;
    }
    const same = group.tags.find((other) => other.id !== tag.id && other.name.toLowerCase() === text.toLowerCase());
    try {
      if (same) {
        const merge = await confirmTagAction(`${$HR('The tag')} "${same.name}" ${$HR('exists already. Merge')} "${tag.name}" `
          + `${$HR('into it? Its records get the tag')} "${same.name}".`, { yes: $HR('Merge') });
        if (!merge) return;
        await this.options.tagClient.merge(tag.id, same.id);
      } else {
        await this.options.tagClient.update(tag.id, { name: text, modified: tag.modified });
      }
      await this._changed();
    } catch (error) {
      this._error(error);
    }
  }

  /** Delete a tag after a question (with the number of records it is on). */
  async _delete(tag) {
    const message = tag.usage > 0
      ? `${$HR('The tag')} "${tag.name}" ${$HR('is on')} ${tag.usage} ${$HR('record(s). Delete it and remove it from the records?')}`
      : `${$HR('Delete the tag')} "${tag.name}"?`;
    if (!(await confirmTagAction(message, { yes: $HR('Delete') }))) return;
    try {
      await this.options.tagClient.remove(tag.id, { force: tag.usage > 0 });
      await this._changed();
    } catch (error) {
      this._error(error);
    }
  }

  /** After a write: reload and tell the host. */
  async _changed() {
    await this.reload();
    this.options.onChange?.();
  }

  /** Show a failed write. */
  _error(error) {
    HMsg.showMsgErr(error?.message || String(error), { title: $HR('Tags') });
    void this.reload();
  }
}
