/**
 * @file HInputRelmarker.js
 * @brief One relationship of a relationship marker field (plan 22). The value is the id
 *        of the relationship record; relationships are records of their own, created and
 *        deleted at once (not with the record).
 *
 * - No relationship: a button "Add Relationship to <types>" ("from" for a reverse
 *   field). It saves a new record first (the editor service `ensureRecord`), then opens
 *   the popup of relationshipDialog.js.
 * - A relationship, in an input-like box: relation type (muted), a triangle (to the left for
 *   a reverse field), the record type icon and the title of the other record with Edit / View
 *   on mouse over, the relationship record icon with
 *   Edit / View of the relationship record on mouse over. The clear action (value tools)
 *   deletes the relationship record after a warning.
 * No "hidden from the public" switch: it has no sense for a relationship.
 * `managed` (a repeatable field, plan 24): no Add; the relationships are added and changed
 * in the relations mode of the record manager ("No relationships" when none); the remove
 * action of each one deletes it (after the warning).
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

import { HInput } from './HInput.js';
import { recordTypeIconUrl } from '../../record-list/recordAdminInfo.js';
import { confirmRelationshipDelete, openRelationshipDialog } from '../../relationship/relationshipDialog.js';
import { HMsg } from '../../../ui/HMsg.js';
import { sanitizeTextHtml, stripHtml } from '../../../recordview/FieldValueFormatter.js';
import { $HR } from '../../../ui/i18n/HResource.js';
import './HInputRelmarker.css';

/** Edits (creates, shows, deletes) one relationship of a relmarker field. */
export class HInputRelmarker extends HInput {
  /**
   * @param {HTMLElement} container Input host.
   * @param {object} options HInput options plus: `relation` (the relation of the value,
   *        relmarkerRelations.js), `field` (the relmarker field: `vocabulary`, `targetTypes`,
   *        `reverse`, `sourceTypes`, `label`), `relationships` (editor service: `ensureRecord()`,
   *        `create()`, `remove(relId)`, `load(relId)`, `fits(field, relation)`, `changed()`),
   *        `dbdefs`, `iconBase` ({baseUrl, database}), `apiClient` and the host actions
   *        `editRecord(id, {relation})`, `viewRecord(id)`, `browseRecords(options)`, `addRecord(rectypeId)`;
   *        `managed`: shown only (plan 24).
   * @returns {HInputRelmarker} This input.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    // as wide as its box: the value tools stay beside it (review 2026-10-22)
    this.container.classList.add('h-form-input-compact', 'h-form-input-relmarker');
    this.relation = options.relation || null;
    return this;
  }

  /**
   * The Add button and the relationship box (one of them is shown).
   *
   * @param {HTMLElement} host Control host.
   * @returns {HTMLElement} The Add button.
   */
  renderControl(host) {
    const wrap = document.createElement('div');
    wrap.className = 'h-input-relmarker';
    this.addButton = document.createElement('button');
    this.addButton.type = 'button';
    this.addButton.className = 'h-btn h-input-relmarker-add';
    const plus = document.createElement('i');
    plus.className = 'fa-solid fa-circle-plus';
    plus.setAttribute('aria-hidden', 'true');
    const caption = document.createElement('span');
    caption.className = 'h-input-relmarker-add-caption';
    caption.textContent = this._addCaption();
    this.addButton.title = caption.textContent;
    this.addButton.append(plus, caption);
    this.listen(this.addButton, 'click', () => void this.openAddDialog());

    this.box = document.createElement('div');
    this.box.className = 'h-input-relmarker-box';
    this.termElement = document.createElement('span');
    this.termElement.className = 'h-input-relmarker-term';
    const arrow = document.createElement('i');
    arrow.className = `fa-solid ${this.options.field?.reverse ? 'fa-caret-left' : 'fa-caret-right'} h-input-relmarker-arrow`;
    arrow.setAttribute('aria-hidden', 'true');
    this.otherIcon = document.createElement('img');
    this.otherIcon.className = 'h-input-relmarker-othericon';
    this.otherIcon.alt = '';
    this.listen(this.otherIcon, 'error', () => { this.otherIcon.hidden = true; });
    this.titleElement = document.createElement('span');
    this.titleElement.className = 'h-input-relmarker-title';
    const otherActions = this._actions('h-input-relmarker-other-actions', [
      ['fa-pen', 'Edit', 'editRecord', () => this._editOther()],
      ['fa-circle-info', 'View', 'viewRecord', () => this.options.viewRecord(this.relation?.other?.id)]
    ]);
    this.relIcon = document.createElement('img');
    this.relIcon.className = 'h-input-relmarker-relicon';
    this.relIcon.alt = '';
    this.relIcon.title = $HR('Relationship record');
    this.listen(this.relIcon, 'error', () => { this.relIcon.hidden = true; });
    const relActions = this._actions('h-input-relmarker-rel-actions', [
      ['fa-pen', 'Edit relationship record', 'editRecord', () => this._editRelationship()],
      ['fa-circle-info', 'View relationship record', 'viewRecord', () => this.options.viewRecord(this.getValue())]
    ]);
    this.box.append(this.termElement, arrow, this.otherIcon, this.titleElement, otherActions, this.relIcon, relActions);
    this.noneElement = document.createElement('span');
    this.noneElement.className = 'h-input-relmarker-none h-i18n';
    this.noneElement.textContent = $HR('No relationships');
    wrap.append(this.addButton, this.noneElement, this.box);
    host.append(wrap);
    return this.addButton;
  }

  /** @returns {number|null} Id of the relationship record. */
  getValue() {
    return Number(this.value) > 0 ? Number(this.value) : null;
  }

  /**
   * Show a relationship, or the Add button (null).
   *
   * @param {number|null} value Relationship record id.
   * @returns {HInputRelmarker} This input.
   */
  setValue(value) {
    super.setValue(Number(value) > 0 ? Number(value) : null);
    if (!this.getValue()) this.relation = null;
    this._sync();
    return this;
  }

  /** @returns {object|null} The relation shown (relmarkerRelations.js). */
  getRelation() {
    return this.relation ? { ...this.relation, other: { ...this.relation.other } } : null;
  }

  /** Read only: no Add, no Edit buttons. */
  setReadOnly(readOnly) {
    this._readOnly = Boolean(readOnly);
    this._markReadOnly(readOnly);
    this._sync();
    return this;
  }

  /**
   * Create a relationship: a new record is saved first (the editor's `ensureRecord`),
   * then the popup; *Save and Edit Attributes* opens the new relationship record.
   *
   * @returns {Promise<boolean>} True when a relationship was created.
   */
  async openAddDialog() {
    const service = this.options.relationships;
    if (this._busy || this._readOnly || this.options.managed || !service) return false;
    this._busy = true;
    try {
      const record = await service.ensureRecord();
      if (!record) return false;
      const created = await openRelationshipDialog({
        dbdefs: this.options.dbdefs,
        field: this.options.field || {},
        record,
        relationships: service,
        apiClient: this.options.apiClient,
        browseRecords: this.options.browseRecords,
        addRecord: this.options.addRecord,
        viewRecord: this.options.viewRecord,
        fileViewer: this.options.iconBase || null
      });
      if (!created) return false;
      const relation = await service.load(created.relId);
      this.value = created.relId;
      this.relation = relation;
      this._sync();
      this.notifyChange();
      service.changed?.();
      if (created.editAttributes) await this._editRelationship();
      return true;
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error));
      return false;
    } finally {
      this._busy = false;
    }
  }

  /**
   * Clear: the relationship record is deleted after a warning; false keeps the value
   * (Cancel, or the delete failed).
   *
   * @returns {Promise<boolean>}
   */
  async beforeClear() {
    const id = this.getValue();
    if (!id) return true;
    if (!(await confirmRelationshipDelete())) return false;
    try {
      await this.options.relationships?.remove(id);
    } catch (error) {
      HMsg.showMsgErr(error?.message || String(error));
      return false;
    }
    this.options.relationships?.changed?.();
    return true;
  }

  /** Caption of the Add button: "Add Relationship to / from <types>". */
  _addCaption() {
    const field = this.options.field || {};
    const types = ((field.reverse ? field.sourceTypes : field.targetTypes) || []).map(Number).filter((id) => id > 0);
    const names = types.map((id) => this.options.dbdefs?.rectypeName?.(id) || `#${id}`).join(', ');
    if (!names) return $HR('Add Relationship');
    return `${$HR(field.reverse ? 'Add Relationship from' : 'Add Relationship to')} ${names}`;
  }

  /** Icon buttons shown on mouse over; only the host actions that exist. */
  _actions(className, list) {
    const actions = document.createElement('span');
    actions.className = `h-input-relmarker-actions ${className}`;
    for (const [icon, title, need, run] of list) {
      if (typeof this.options[need] !== 'function') continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'h-input-relmarker-action';
      button.dataset.action = `${need}:${title}`;
      if (icon === 'fa-pen') button.classList.add('is-edit');
      button.title = $HR(title);
      button.setAttribute('aria-label', button.title);
      const glyph = document.createElement('i');
      glyph.className = `fa-solid ${icon}`;
      glyph.setAttribute('aria-hidden', 'true');
      button.append(glyph);
      this.listen(button, 'click', () => void run());
      actions.append(button);
    }
    return actions;
  }

  /** Edit the other record; its new title after a save. */
  async _editOther() {
    const other = this.relation?.other;
    if (!other?.id) return;
    const result = await this.options.editRecord(other.id);
    const title = result?.record?.rec_Title;
    if (result?.saved && title) {
      other.title = String(title).replace(/<[^>]*>/g, '');
      this._sync();
      this.options.relationships?.changed?.();
    }
  }

  /**
   * Edit the relationship record, then load it again: a relationship that no longer
   * belongs to this field (deleted, other type or record) leaves it.
   */
  async _editRelationship() {
    const id = this.getValue();
    const service = this.options.relationships;
    if (!id || typeof this.options.editRecord !== 'function') return;
    // the relation types and the other record's types of this field (HRecordEditor `relation`)
    const field = this.options.field || {};
    await this.options.editRecord(id, {
      relation: {
        vocabulary: Number(field.vocabulary) || null,
        targetTypes: ((field.reverse ? field.sourceTypes : field.targetTypes) || []).map(Number).filter((rty) => rty > 0),
        reverse: field.reverse === true
      }
    });
    const relation = service ? await service.load(id) : this.relation;
    if (relation && (!service?.fits || service.fits(this.options.field || {}, relation))) {
      this.relation = relation;
      this._sync();
    } else if (this.options.removable) {
      this.container.dispatchEvent(new CustomEvent('h-input-remove', { bubbles: true, detail: { input: this } }));
    } else {
      this.setValue(null);
      this.notifyChange();
    }
    service?.changed?.();
  }

  /** Show the Add button or the relationship. */
  _sync() {
    if (!this.box) return;
    const relation = this.getValue() ? this.relation : null;
    this.addButton.hidden = Boolean(relation) || this._readOnly === true || this.options.managed === true;
    this.noneElement.hidden = Boolean(relation) || this.options.managed !== true;
    this.addButton.disabled = this._readOnly === true;
    this.box.hidden = !relation;
    this.termElement.textContent = relation?.termLabel || '';
    const other = relation?.other;
    // a record title may have a few formatting tags (as h-recordlist-title)
    const title = other ? (other.title || `#${other.id}`) : '';
    this.titleElement.innerHTML = sanitizeTextHtml(title);
    this.titleElement.title = stripHtml(title);
    const otherUrl = other?.rty ? recordTypeIconUrl({ rec_RecTypeID: other.rty }, this.options.iconBase || {}) : '';
    if (otherUrl && this.otherIcon.getAttribute('src') !== otherUrl) this.otherIcon.setAttribute('src', otherUrl);
    this.otherIcon.hidden = !otherUrl;
    this.otherIcon.title = (other?.rty && this.options.dbdefs?.rectypeName?.(other.rty)) || '';
    const relRty = Number(this.options.dbdefs?.dbconst?.('RT_RELATION')) || 1;
    const url = relation ? recordTypeIconUrl({ rec_RecTypeID: relRty }, this.options.iconBase || {}) : '';
    if (url && this.relIcon.getAttribute('src') !== url) this.relIcon.setAttribute('src', url);
    this.relIcon.hidden = !url;
    for (const button of this.box.querySelectorAll('.h-input-relmarker-action')) {
      if (button.classList.contains('is-edit')) button.hidden = this._readOnly === true;
    }
  }
}
