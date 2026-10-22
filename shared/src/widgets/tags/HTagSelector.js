/**
 * @file HTagSelector.js
 * @brief Tags of one record (plan 20, Phase 4a): the Tags panel of the record editor's
 *        Record summary, as the compact legacy tag widget of the record editor.
 *
 * The record's tags of the user and of the user's groups, grouped by owner ("Personal",
 * then the groups), each with a × that takes it off the record. Below, a picker of the
 * user's other tags (grouped by owner): a pick puts the tag on the record; its action
 * "Add new tag" makes the typed text a new tag of the owner chosen beside it (Personal,
 * or a group of the user) and puts it on the record. The changes are sent at once
 * (`/sys/tag/assign`), like relationships: a tag is not a field of the record.
 *
 *   new HTagSelector().attach(host, { tagClient, recordId, currentUserId, groups, onChange, onManage }).render();
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
import { StaticSource } from '../../data/valueSources/localSources.js';
import { tagTextProblem } from '../../data/TagClient.js';
import { tagOwnerGroups } from './tagGroups.js';
import { loadingIndicator } from '../../ui/loadingIndicator.js';
import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HTagSelector.css';

/** The tags of a record: remove, pick, add new. */
export class HTagSelector extends HBaseWidget {
  /**
   * @param {HTMLElement} container Selector host.
   * @param {object} options
   * @param {import('../../data/TagClient.js').TagClient} options.tagClient Tag API.
   * @param {number} options.recordId The record (saved).
   * @param {number} options.currentUserId The user.
   * @param {Array<{id: number, name: string}>} [options.groups] The user's groups (owners of new tags).
   * @param {boolean} [options.readOnly] Show the tags only.
   * @param {(tags: Array<object>) => void} [options.onChange] After tags were put on or taken off.
   * @param {() => void} [options.onManage] Opens the tag manager ("Manage tags" link).
   * @param {(tag: {id: number, name: string}) => void} [options.onSearchTag] Searches the records of a tag.
   * @returns {HTagSelector} This selector.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    if (!options.tagClient) throw new TypeError('HTagSelector requires a tag client');
    this.recordTags = [];
    this.allTags = [];
    this.newOwner = Number(options.currentUserId) || 0;
    return this;
  }

  /** @returns {HTagSelector} This selector (the tags load). */
  render() {
    if (!this.container) throw new Error('HTagSelector must be attached before render');
    this.container.classList.add('h-widget', 'h-tag-selector');
    void this.reload();
    this.state = 'rendered';
    return this;
  }

  /**
   * Load the record's tags and the user's tags again.
   *
   * @returns {Promise<void>}
   */
  async reload() {
    if (!this.allTags.length) this.container.replaceChildren(loadingIndicator($HR('Loading…'), 'h-tag-selector-note'));
    try {
      const [onRecord, all] = await Promise.all([
        this.options.tagClient.list({ record: this.options.recordId }),
        this.options.readOnly ? Promise.resolve({ tags: [] }) : this.options.tagClient.list()
      ]);
      // destroyed while the tags loaded
      if (!this.container) return;
      this.recordTags = onRecord.tags;
      this.allTags = all.tags;
      await this._render();
    } catch (error) {
      if (error?.name === 'AbortError' || !this.container) return;
      this.container.replaceChildren(this._note(`${$HR('The tags could not be loaded')}: ${error?.message || error}`));
    }
  }

  /** @returns {Promise<void>} The tags and the add row. */
  async _render() {
    await this.combo?.destroy();
    this.combo = null;
    if (!this.container) return;
    this.clearListeners();
    const parts = [];
    const groups = tagOwnerGroups(this.recordTags, { currentUserId: this.options.currentUserId })
      .filter((group) => group.tags.length);
    for (const group of groups) parts.push(this._renderGroup(group));
    if (!groups.length) parts.push(this._note($HR('No tags')));
    if (!this.options.readOnly) parts.push(this._renderAdd());
    if (typeof this.options.onManage === 'function' && !this.options.readOnly) {
      const manage = document.createElement('a');
      manage.href = '#';
      manage.className = 'h-tag-selector-manage';
      manage.textContent = $HR('Manage tags');
      this.listen(manage, 'click', (event) => {
        event.preventDefault();
        this.options.onManage();
      });
      parts.push(manage);
    }
    this.container.replaceChildren(...parts);
  }

  /** One owner: label and the tags (link, ×). */
  _renderGroup(group) {
    const row = document.createElement('div');
    row.className = 'h-tag-selector-group';
    const label = document.createElement('span');
    label.className = 'h-tag-selector-owner';
    label.textContent = `${group.name}:`;
    row.append(label);
    for (const tag of group.tags) {
      const chip = document.createElement('span');
      chip.className = 'h-tag-selector-tag';
      const name = document.createElement(this.options.onSearchTag ? 'a' : 'span');
      name.textContent = tag.name;
      if (this.options.onSearchTag) {
        name.href = '#';
        name.title = $HR('Find records with this tag');
        this.listen(name, 'click', (event) => {
          event.preventDefault();
          this.options.onSearchTag({ id: tag.id, name: tag.name });
        });
      }
      chip.append(name);
      if (!this.options.readOnly) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'heurist-icon-button h-tag-selector-remove';
        remove.title = $HR('Remove the tag from the record');
        remove.setAttribute('aria-label', `${remove.title}: ${tag.name}`);
        remove.textContent = '×';
        this.listen(remove, 'click', () => void this._change({ remove: [tag.id] }));
        chip.append(remove);
      }
      row.append(chip);
    }
    return row;
  }

  /** The picker of the user's other tags (+ Add new tag) and the owner of new tags. */
  _renderAdd() {
    const row = document.createElement('div');
    row.className = 'h-tag-selector-add';
    const onRecord = new Set(this.recordTags.map((tag) => tag.id));
    const owners = tagOwnerGroups(this.allTags, { currentUserId: this.options.currentUserId, groups: this.options.groups });
    const items = owners.flatMap((group) => group.tags.filter((tag) => !onRecord.has(tag.id)).map((tag) => ({
      value: tag.id, label: tag.name, group: `owner:${group.owner}`, groupLabel: group.label
    })));
    const host = document.createElement('div');
    host.className = 'h-tag-selector-picker';
    row.append(host);
    this.combo = new HValueCombo().attach(host, {
      source: new StaticSource(items),
      emptyLabel: $HR('Add a tag…'),
      placeholder: $HR('Find or type a new tag'),
      actions: [{ id: 'new', icon: 'fa-plus-circle', title: 'Add new tag (the typed text)', run: (text) => this._addNew(text) }],
      onPick: (item) => void this._change({ add: [Number(item.value)] })
    }).render();
    // the owner of a new tag: Personal, or a group of the user
    const groups = this.options.groups || [];
    if (groups.length) {
      const select = document.createElement('select');
      select.className = 'h-select h-tag-selector-owner-select';
      select.title = $HR('Owner of a new tag');
      select.setAttribute('aria-label', select.title);
      for (const group of owners) {
        const option = document.createElement('option');
        option.value = String(group.owner);
        option.textContent = group.name;
        select.append(option);
      }
      select.value = String(this.newOwner);
      this.listen(select, 'change', () => { this.newOwner = Number(select.value) || this.newOwner; });
      row.append(select);
    }
    return row;
  }

  /** A new tag of the chosen owner, put on the record (an existing name of that owner is used). */
  async _addNew(text) {
    const name = String(text ?? '').trim();
    const problem = tagTextProblem(name);
    if (problem) {
      HMsg.showMsgFlash($HR(problem));
      return;
    }
    const owner = this.newOwner || Number(this.options.currentUserId);
    const same = this.allTags.find((tag) => tag.owner === owner && tag.name.toLowerCase() === name.toLowerCase());
    try {
      const tag = same || await this.options.tagClient.create({ name, owner });
      await this._change({ add: [tag.id] });
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error), { title: $HR('Tags') });
    }
  }

  /** Put on / take off tags, then show the new state. */
  async _change({ add = [], remove = [] }) {
    try {
      await this.options.tagClient.assign({ records: [this.options.recordId], add, remove });
      await this.reload();
      this.options.onChange?.(this.recordTags);
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error), { title: $HR('Tags') });
    }
  }

  _note(text) {
    const note = document.createElement('div');
    note.className = 'h-tag-selector-note';
    note.textContent = text;
    return note;
  }

  /** @returns {Promise<void>} */
  async destroy() {
    await this.combo?.destroy();
    this.combo = null;
    await super.destroy();
  }
}
