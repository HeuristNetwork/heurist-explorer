/**
 * @file HRecordPrivate.js
 * @brief The user's private data on one record (plan 20, Phase 4b): the Private panel
 *        of the record editor's Record summary.
 *
 * Two blocks, values read-only with a pen (as Owner and access in Admin):
 * - the bookmark of the user: rating, notes, private note; a plus beside "Not bookmarked"
 *   when there is none, the pen edits it in a popup HEditForm, the bin removes it;
 * - the user's reminders on the record: one line each (frequency, start date,
 *   recipient, message) with a pen and a bin; a plus (fa-circle-plus) on the right of the heading, or
 *   beside "No reminders". The popup has Save and
 *   Send now (sent at once, not saved; legacy "Send immediately").
 * The forms are the hard-coded structures of systemEntities.js. The changes are sent
 * at once (like tags): bookmarks and reminders are not fields of the record.
 *
 *   new HRecordPrivate().attach(host, { apiClient, dbdefs, recordId, readOnly, onChange }).render();
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
import { openEditFormDialog } from '../edit-form/editFormDialog.js';
import { confirmTagAction } from '../tags/tagGroups.js';
import { BookmarkClient, ReminderClient } from '../../data/UserDataClient.js';
import { UserGroupSource } from '../../data/valueSources/localSources.js';
import { systemEditForm, systemFieldIds } from '../../data/systemEntities.js';
import { loadingIndicator } from '../../ui/loadingIndicator.js';
import { HMsg } from '../../ui/HMsg.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HRecordPrivate.css';

/** Stars of a rating 1-5. */
const STARS = ['', '★', '★★', '★★★', '★★★★', '★★★★★'];

/** The bookmark and the reminders of the user on a record. */
export class HRecordPrivate extends HBaseWidget {
  /**
   * @param {HTMLElement} container Panel host.
   * @param {object} options
   * @param {object} options.apiClient HeuristApiClient (`get`, `request`).
   * @param {object} options.dbdefs HDbDefs (field ids, terms, users and groups).
   * @param {number} options.recordId The record (saved).
   * @param {boolean} [options.readOnly] Show the values only.
   * @param {(change: {type: 'bookmark'|'reminder', item: object|null}) => void} [options.onChange] After a change.
   * @returns {HRecordPrivate} This panel.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    if (!options.apiClient) throw new TypeError('HRecordPrivate requires an API client');
    this.bookmarks = new BookmarkClient({ apiClient: options.apiClient, dbdefs: options.dbdefs });
    this.reminders = new ReminderClient({ apiClient: options.apiClient, dbdefs: options.dbdefs });
    this.bookmark = null;
    this.encrypted = true;
    this.reminderList = [];
    return this;
  }

  /** @returns {HRecordPrivate} This panel (the data loads). */
  render() {
    if (!this.container) throw new Error('HRecordPrivate must be attached before render');
    this.container.classList.add('h-widget', 'h-record-private');
    void this.reload();
    this.state = 'rendered';
    return this;
  }

  /**
   * Load the bookmark and the reminders again.
   *
   * @returns {Promise<void>}
   */
  async reload() {
    this.container.replaceChildren(loadingIndicator($HR('Loading…'), 'h-record-private-note'));
    try {
      const [bookmark, reminders] = await Promise.all([
        this.bookmarks.ofRecord(this.options.recordId),
        this.reminders.ofRecord(this.options.recordId)
      ]);
      // destroyed while loading
      if (!this.container) return;
      this.bookmark = bookmark.bookmark;
      this.encrypted = bookmark.encrypted;
      this.reminderList = reminders;
      this._render();
    } catch (error) {
      if (error?.name === 'AbortError' || !this.container) return;
      this.container.replaceChildren(this._note(`${$HR('The private data could not be loaded')}: ${error?.message || error}`));
    }
  }

  _render() {
    this.clearListeners();
    this.container.replaceChildren(this._renderBookmark(), this._renderReminders());
  }

  /** Bookmark: the values with pen and bin, or "Not bookmarked" with a plus. */
  _renderBookmark() {
    const block = this._block('Bookmark');
    const bookmark = this.bookmark;
    if (!bookmark) {
      block.append(this._empty($HR('Not bookmarked'), 'Bookmark this record', () => void this._editBookmark()));
      return block;
    }
    const row = document.createElement('div');
    row.className = 'h-record-private-item';
    const lines = document.createElement('dl');
    lines.className = 'h-record-private-lines';
    this._line(lines, 'Rating', STARS[bookmark.rating] || $HR('Not rated'));
    if (bookmark.notes) this._line(lines, 'Notes', bookmark.notes);
    if (bookmark.privateInfo) this._line(lines, 'Private note', bookmark.privateInfo);
    if (bookmark.unreadable) this._line(lines, 'Private note', $HR('Encrypted with another key: it cannot be read'));
    row.append(lines);
    if (!this.options.readOnly) {
      row.append(this._tools([
        ['fa-pen', 'Edit the bookmark', () => void this._editBookmark()],
        ['fa-trash-can', 'Remove the bookmark', () => void this._removeBookmark()]
      ]));
    }
    block.append(row);
    return block;
  }

  /** Reminders: one line each with pen and bin; a plus in the heading, or beside "No reminders". */
  _renderReminders() {
    const add = () => void this._editReminder(null);
    if (!this.reminderList.length) {
      const block = this._block('Reminders');
      block.append(this._empty($HR('No reminders'), 'Add reminder', add));
      return block;
    }
    const block = this._block('Reminders', this.options.readOnly ? null : this._tools([['fa-circle-plus', 'Add reminder', add]]));
    for (const reminder of this.reminderList) {
      const row = document.createElement('div');
      row.className = 'h-record-private-item';
      const text = document.createElement('div');
      text.className = 'h-record-private-reminder';
      const when = document.createElement('div');
      when.textContent = `${this._frequencyLabel(reminder.frequency)} · ${reminder.startDate} → ${this._recipientLabel(reminder)}`;
      text.append(when);
      if (reminder.message) {
        const message = document.createElement('div');
        message.className = 'h-record-private-message';
        message.textContent = reminder.message;
        text.append(message);
      }
      row.append(text);
      if (!this.options.readOnly) {
        row.append(this._tools([
          ['fa-pen', 'Edit the reminder', () => void this._editReminder(reminder)],
          ['fa-trash-can', 'Delete the reminder', () => void this._removeReminder(reminder)]
        ]));
      }
      block.append(row);
    }
    return block;
  }

  /** The bookmark in a popup form (a new one when there is none). */
  async _editBookmark() {
    const bookmark = this.bookmark;
    const ratings = STARS.map((stars, value) => ({ id: String(value), label: value ? stars : $HR('Not rated') }));
    const form = systemEditForm('bookmark', this.options.dbdefs, {
      omit: ['record'],
      // the rating as stars (radio buttons)
      fields: { rating: { type: 'enum', mode: 'radio', terms: ratings, vocabulary: null } }
    });
    const values = {
      rating: String(bookmark?.rating || 0),
      notes: bookmark?.notes || '',
      privateInfo: bookmark?.privateInfo || ''
    };
    await openEditFormDialog({
      title: bookmark ? 'Edit bookmark' : 'Bookmark',
      form,
      values,
      dbdefs: this.options.dbdefs,
      apiClient: this.options.apiClient,
      className: 'h-record-private-dialog',
      buttons: [{ id: 'save', label: 'Save', primary: true }, { id: 'cancel', label: 'Cancel' }],
      onAction: async (action, edited) => {
        const changes = { rating: edited.rating ?? '0', notes: edited.notes ?? '', privateInfo: edited.privateInfo ?? '' };
        try {
          const saved = bookmark
            ? await this.bookmarks.update(bookmark.id, changes, { modified: bookmark.modified })
            : await this.bookmarks.create(this.options.recordId, changes);
          this._warn(saved.issues);
          this._changed('bookmark', saved.item);
          return true;
        } catch (error) {
          this._error(error, 'Bookmark');
          return false;
        }
      }
    });
  }

  async _removeBookmark() {
    if (!this.bookmark) return;
    if (!(await confirmTagAction($HR('Remove the bookmark (rating and notes) of this record?'), { title: $HR('Bookmark'), yes: $HR('Remove') }))) return;
    try {
      await this.bookmarks.remove(this.bookmark.id);
      this._changed('bookmark', null);
    } catch (error) {
      this._error(error, 'Bookmark');
    }
  }

  /** A reminder in a popup form (null: a new one) with Save and Send now. */
  async _editReminder(reminder) {
    const dbdefs = this.options.dbdefs;
    const recipients = new UserGroupSource(dbdefs).items().map((item) => ({ id: String(item.value), label: item.label }));
    const fieldIds = systemFieldIds('reminder', dbdefs);
    const form = systemEditForm('reminder', dbdefs, {
      omit: ['record'],
      fields: {
        // until users and groups are records (Phase 4d): a list of the users and groups
        recipient: { type: 'enum', terms: recipients, vocabulary: null, req: 'required', showWhen: { to: 'user' } },
        email: { req: 'required', showWhen: { to: 'email' } }
      }
    });
    // exactly one recipient: a user or group, or e-mails (as legacy)
    const to = {
      name: 'to', type: 'enum', mode: 'radio', label: 'Send to', req: 'required',
      terms: [{ id: 'user', label: $HR('User or group') }, { id: 'email', label: $HR('E-mail addresses') }]
    };
    if (fieldIds.recipient && fieldIds.email) form.groups[0]?.children.unshift(to);
    const vocabulary = Number(dbdefs?.vocabRoot?.(fieldIds.frequency)) || 0;
    const once = vocabulary ? dbdefs.termIdByLabel?.(vocabulary, 'Once') : null;
    const values = {
      to: reminder?.email ? 'email' : 'user',
      recipient: reminder?.recipient || String(dbdefs?.currentUserId?.() || ''),
      email: reminder?.email || '',
      message: reminder?.message || '',
      startDate: reminder?.startDate || today(),
      frequency: reminder?.frequency || (once ? String(once) : '')
    };
    const plain = (edited) => ({
      recipient: edited.to === 'email' ? '' : (edited.recipient ?? ''),
      email: edited.to === 'email' ? (edited.email ?? '') : '',
      message: edited.message ?? '',
      startDate: edited.startDate ?? '',
      frequency: edited.frequency ?? ''
    });
    await openEditFormDialog({
      title: reminder ? 'Edit reminder' : 'Add reminder',
      form,
      values,
      dbdefs,
      apiClient: this.options.apiClient,
      className: 'h-record-private-dialog',
      buttons: [
        { id: 'save', label: 'Save', primary: true },
        { id: 'send', label: 'Send now' },
        { id: 'cancel', label: 'Cancel' }
      ],
      onAction: async (action, edited) => {
        try {
          if (action === 'send') {
            await this.reminders.send(this.options.recordId, plain(edited));
            HMsg.showMsgFlash($HR('The reminder has been sent'));
            // the dialog stays open: the reminder is not saved by Send now
            return false;
          }
          const saved = reminder
            ? await this.reminders.update(reminder.id, plain(edited), { modified: reminder.modified })
            : await this.reminders.create(this.options.recordId, plain(edited));
          this._changed('reminder', saved.item);
          return true;
        } catch (error) {
          this._error(error, 'Reminder');
          return false;
        }
      }
    });
  }

  async _removeReminder(reminder) {
    if (!(await confirmTagAction($HR('Delete this reminder?'), { title: $HR('Reminder'), yes: $HR('Delete') }))) return;
    try {
      await this.reminders.remove(reminder.id);
      this._changed('reminder', null);
    } catch (error) {
      this._error(error, 'Reminder');
    }
  }

  /** Reload and tell the host. */
  _changed(type, item) {
    void this.reload();
    this.options.onChange?.({ type, item });
  }

  _frequencyLabel(termId) {
    return this.options.dbdefs?.termLabel?.(termId) || String(termId || '');
  }

  _recipientLabel(reminder) {
    if (reminder.email) return reminder.email;
    const id = Number(reminder.recipient) || 0;
    return this.options.dbdefs?.userGroupName?.(id) || (id ? `#${id}` : '');
  }

  /** Warnings of a save (e.g. the private note is not encrypted). */
  _warn(issues) {
    const messages = (issues || []).map((issue) => issue?.message).filter(Boolean);
    if (messages.length) HMsg.showMsgFlash(messages.join('\n'), { showDelay: 4000 });
  }

  _error(error, title) {
    const code = error?.code;
    const message = code === 'conflict'
      ? $HR('It was changed meanwhile (in another window?). Close the form and try again')
      : (error?.message || String(error));
    HMsg.showMsgErr(message, { title: $HR(title) });
  }

  /** A block with its heading and the icon buttons of the heading on the right. */
  _block(title, tools = null) {
    const block = document.createElement('div');
    block.className = 'h-record-private-block';
    const heading = document.createElement('div');
    heading.className = 'h-record-private-heading';
    const caption = document.createElement('span');
    caption.className = 'h-i18n';
    caption.textContent = $HR(title);
    heading.append(caption);
    if (tools) heading.append(tools);
    block.append(heading);
    return block;
  }

  /** "Not bookmarked" / "No reminders" with the plus button on the right. */
  _empty(text, title, run) {
    const row = document.createElement('div');
    row.className = 'h-record-private-item h-record-private-empty';
    row.append(this._note(text));
    if (!this.options.readOnly) row.append(this._tools([['fa-circle-plus', title, run]]));
    return row;
  }

  _line(lines, label, value) {
    const dt = document.createElement('dt');
    dt.className = 'h-i18n';
    dt.textContent = $HR(label);
    const dd = document.createElement('dd');
    dd.textContent = value;
    lines.append(dt, dd);
  }

  /** Icon buttons of an item. */
  _tools(list) {
    const tools = document.createElement('div');
    tools.className = 'h-record-private-tools';
    for (const [icon, title, run] of list) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'heurist-icon-button';
      button.title = $HR(title);
      button.setAttribute('aria-label', button.title);
      const glyph = document.createElement('span');
      glyph.className = `fa-solid ${icon}`;
      glyph.setAttribute('aria-hidden', 'true');
      button.append(glyph);
      this.listen(button, 'click', run);
      tools.append(button);
    }
    return tools;
  }

  _note(text) {
    const note = document.createElement('div');
    note.className = 'h-record-private-note';
    note.textContent = text;
    return note;
  }
}

/** @returns {string} Today as YYYY-MM-DD (local). */
function today() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
