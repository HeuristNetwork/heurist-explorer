/**
 * @file FieldValuesAction.js
 * @brief Form of the Field values actions Add, Replace and Delete of the Actions tool
 *        (plan 33), inline in the action pane.
 *
 * Top: the united flat list of the fields of all record types in scope (each field once;
 * freetext, blocktext, date, float and enum fields), with the field type filter of HFieldTree
 * and a name filter. Below it, once a field is picked, an
 * HEditForm (rebuilt for every field):
 *   - Replace / Delete: All values | Conditionally; the condition = an HFilterBuilderItem
 *     with the field fixed (the operators and value inputs of the Filter Builder) in the
 *     slot "condition"; Replace: "Insert as new value if none exist";
 *   - Add / Replace: the value input of the type of the field.
 * The owner reads `problems()` and `params()` (job parameters without the scope).
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

import { HEditForm } from '#shared/widgets/edit-form/HEditForm.js';
import { $HR } from '#shared/ui';
import { fieldTypeOptions, fieldTypeShown } from '#shared/data/fieldTypeFilters.js';
import queryVocabulary from '../../utils/queryVocabulary.json';
import { HFilterBuilderItem } from '../../widgets/filter-builder/HFilterBuilderItem.js';
import {
  conditionFromRow, fieldValueParams, fieldValueProblems, unitedFieldList, valueList
} from './fieldValueParams.js';

/** Options of the field type filter (as HFieldTree; the option is its own translation key). */
const TYPE_FILTER_OPTIONS = ['all', 'text', 'enum', 'date', 'numeric'];

/** Captions of the field types in the list. */
const TYPE_LABELS = { freetext: 'Text', blocktext: 'Memo', date: 'Date', float: 'Number', enum: 'Term' };

/** Field values action form. */
export class FieldValuesAction {
  /**
   * @param {object} options
   * @param {'add'|'replace'|'delete'} options.mode Action mode.
   * @param {object} options.dbdefs HDbDefs.
   * @param {object} [options.apiClient] HeuristApiClient (inputs that load values).
   * @param {string} [options.language] UI language.
   * @param {object} [options.vocabulary] queryVocabulary.json (tests).
   * @param {() => void} [options.onChange] A field, value or condition changed.
   */
  constructor({ mode, dbdefs, apiClient = null, language = 'eng', vocabulary = queryVocabulary, onChange = null }) {
    this.mode = mode;
    this.dbdefs = dbdefs;
    this.apiClient = apiClient;
    this.language = language;
    this.vocabulary = vocabulary;
    this.onChange = onChange || (() => {});
    this.fields = [];
    this.field = null;
    this.form = null;
    this.condition = null;
    this.filterText = '';
    this.typeFilter = 'all';
  }

  /**
   * Build the field list and the empty form box in a host element.
   *
   * @param {HTMLElement} host Host element.
   * @returns {FieldValuesAction} this.
   */
  attach(host) {
    this.host = host;
    host.classList.add('h-actions-fieldvalues');
    const fieldBox = element('div', 'h-actions-fields');
    const head = element('div', 'h-actions-fields-head');
    const caption = element('span', 'h-actions-fields-caption');
    caption.textContent = $HR('Field');
    this._filter = element('input', 'h-input h-actions-fields-filter');
    this._filter.type = 'search';
    this._filter.placeholder = $HR('Filter fields');
    this._filter.addEventListener('input', () => {
      this.filterText = this._filter.value.trim().toLowerCase();
      this._renderList();
    });
    this._typeSelect = element('select', 'h-select h-actions-fields-type');
    this._typeSelect.setAttribute('aria-label', $HR('Field type'));
    this._typeSelect.title = $HR('Show fields of this type');
    this._typeSelect.addEventListener('change', () => {
      this.typeFilter = this._typeSelect.value;
      this._renderList();
    });
    head.append(caption, this._typeSelect, this._filter);
    this._list = element('div', 'h-actions-fields-list');
    this._list.setAttribute('role', 'listbox');
    fieldBox.append(head, this._list);
    this._formHost = element('div', 'h-actions-fieldvalues-form');
    host.append(fieldBox, this._formHost);
    return this;
  }

  /**
   * Record types in scope: the field list again; the picked field stays when it is still there.
   *
   * @param {number[]} rectypeIds Record types.
   * @returns {Promise<void>}
   */
  async setRecordTypes(rectypeIds) {
    this.fields = unitedFieldList(this.dbdefs, rectypeIds);
    const kept = this.field ? this.fields.find((field) => field.id === this.field.id) : null;
    this._fillTypeFilter();
    this._renderList();
    if (kept) {
      this.field = kept;
      this._markPicked();
      return;
    }
    if (this.field) await this.pick(null);
  }

  /**
   * Pick a field (null: none) and build its form.
   *
   * @param {object|null} field Entry of the field list.
   * @returns {Promise<void>}
   */
  async pick(field) {
    this.field = field || null;
    this._markPicked();
    await this._buildForm();
    this.onChange();
  }

  /** @returns {object} The values of the form: mode, field, values, condition, addIfNone. */
  state() {
    const form = this.form;
    const conditional = this.mode !== 'add' && form?.getValue?.('matchMode') === 'conditional';
    const { condition, problem } = conditional && this.condition
      ? conditionFromRow(this.condition.getRowModel(), this.vocabulary)
      : { condition: null, problem: conditional ? 'Enter the value of the condition' : null };
    return {
      mode: this.mode,
      field: this.field,
      values: this.mode === 'delete' || !form ? [] : valueList(form.getValue('value')),
      conditional,
      condition,
      conditionProblem: problem,
      addIfNone: this.mode === 'replace' && form?.getValue?.('addIfNone') === true
    };
  }

  /** @returns {string[]} Problems that prevent a run (to translate). */
  problems() {
    return fieldValueProblems(this.state());
  }

  /** @returns {object} Job parameters without the scope (fieldValueParams). */
  params() {
    return fieldValueParams(this.state());
  }

  /** Remove the form and the condition. */
  async destroy() {
    await this._destroyForm();
    this.host?.replaceChildren();
  }

  // ------------------------------------------------------------------ list

  /** Type filter options: those that have fields in the list (`all` first). */
  _fillTypeFilter() {
    const select = this._typeSelect;
    if (!select) return;
    const options = fieldTypeOptions(this.fields.map((field) => field.type), TYPE_FILTER_OPTIONS);
    select.replaceChildren(...options.map((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = $HR(value);
      return option;
    }));
    if (!options.includes(this.typeFilter)) this.typeFilter = 'all';
    select.value = this.typeFilter;
  }

  _renderList() {
    if (!this._list) return;
    this._list.replaceChildren();
    const shown = this.fields.filter((field) => fieldTypeShown(this.typeFilter, field.type)
      && (!this.filterText || field.name.toLowerCase().includes(this.filterText)));
    if (!shown.length) {
      const empty = element('div', 'h-muted h-actions-fields-empty');
      empty.textContent = this.fields.length ? $HR('No fields match') : $HR('The record types of the scope have no fields of these types');
      this._list.append(empty);
      return;
    }
    for (const field of shown) {
      const row = element('button', 'h-actions-field');
      row.type = 'button';
      row.dataset.field = String(field.id);
      row.setAttribute('role', 'option');
      const name = element('span', 'h-actions-field-name');
      name.textContent = field.name;
      const type = element('span', 'h-muted h-actions-field-type');
      type.textContent = $HR(TYPE_LABELS[field.type] || field.type);
      const types = element('span', 'h-muted h-actions-field-rectypes');
      // fixed column, cut with an ellipsis; the tooltip has every record type
      types.textContent = field.rectypes.map((item) => item.name).join(', ');
      row.title = `${field.name} (${$HR(TYPE_LABELS[field.type] || field.type)}): ${types.textContent}`;
      row.append(name, type, types);
      row.addEventListener('click', () => void this.pick(field));
      this._list.append(row);
    }
    this._markPicked();
  }

  _markPicked() {
    for (const row of this._list?.querySelectorAll?.('.h-actions-field') || []) {
      const picked = Number(row.dataset.field) === Number(this.field?.id);
      row.classList.toggle('is-picked', picked);
      row.setAttribute('aria-selected', picked ? 'true' : 'false');
    }
  }

  // ------------------------------------------------------------------ form

  /** The form JSON of the picked field. */
  _formJson() {
    const field = this.field;
    const groups = [];
    if (this.mode !== 'add') {
      groups.push({
        id: 'match', type: 'group',
        children: [{
          name: 'matchMode', type: 'enum', mode: 'radio', label: this.mode === 'delete' ? 'Delete' : 'Replace',
          terms: [{ id: 'all', label: 'All values' }, { id: 'conditional', label: 'Conditionally' }],
          default: 'all', clearable: false
        }]
      });
      groups.push({
        id: 'condition', type: 'group', label: 'Values that match', slot: 'condition',
        showWhen: { matchMode: 'conditional' },
        children: this.mode === 'replace'
          ? [{ name: 'addIfNone', type: 'boolean', mode: 'checkbox', label: 'Insert as new value if none exist' }]
          : []
      });
    }
    if (this.mode !== 'delete') {
      const value = { name: 'value', type: field.type, label: this.mode === 'add' ? 'Value to be added' : 'Replace with', req: 'required' };
      if (field.type === 'enum' && field.vocabulary) value.vocabulary = field.vocabulary;
      if (field.type === 'blocktext') value.rows = 3;
      groups.push({ id: 'value', type: 'group', children: [value] });
    }
    return { format: 'heurist-edit-form/1', localized: false, groups };
  }

  async _buildForm() {
    await this._destroyForm();
    this._formHost.replaceChildren();
    if (!this.field) return;
    const caption = element('div', 'h-actions-fieldvalues-caption');
    caption.textContent = `${$HR('Field')}: ${this.field.name}`;
    const host = element('div', 'h-actions-fieldvalues-editform');
    this._formHost.append(caption, host);
    this.form = new HEditForm().attach(host, {
      form: this._formJson(),
      values: { matchMode: 'all' },
      dbdefs: this.dbdefs,
      apiClient: this.apiClient,
      labelPos: 'above',
      onReady: (form) => this._mountCondition(form),
      onChange: () => this.onChange()
    });
    await this.form.render();
  }

  /** The condition (Filter Builder row of the field) in the slot of the form. */
  _mountCondition(form) {
    const slot = form.getSlot?.('condition');
    if (!slot || this.condition) return;
    const box = element('div', 'h-actions-condition');
    slot.append(box);
    this.condition = new HFilterBuilderItem({
      dbdefs: this.dbdefs,
      vocabulary: this.vocabulary,
      lang: this.language,
      apiClient: this.apiClient,
      fixedField: true,
      onChange: () => this.onChange()
    });
    this.condition.attach(box);
    this.condition.render();
    this.condition.setField({ dty: this.field.id, fieldType: this.field.type });
  }

  async _destroyForm() {
    const condition = this.condition;
    const form = this.form;
    this.condition = null;
    this.form = null;
    await condition?.destroy?.();
    await form?.destroy?.();
  }
}

/** Create an element with a class name. */
function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
