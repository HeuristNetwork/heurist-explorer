/**
 * @file HStructureTree.js
 * @brief Tree of the groups and fields of an edit form (plan 23 §4.3): the
 *        "Structure" pane of the record editor, later also of the record type
 *        structure editor (HEditFormDesigner).
 *
 * It shows the normalized HEditForm form (editFormSchema.js): outer groups, the inner
 * groups after them, and their fields, in form order (the automatic groups of a large
 * record type too). A field shows its type, whether it is required (label colour as in
 * the form) and how many values it has. A click on a field calls `onSelect(name)`; the
 * record editor then shows the field in the form (HEditForm#revealField).
 *
 * Toolbar (Artem, 2026-10-22): "Required only" (it disables the other two), "Show
 * optional" (on at start; off hides the optional fields, as in the legacy editor) and
 * "Empty only" filter the tree and the form
 * (`onFilterChange` gives the names of the fields to show, or null for all); "Show help"
 * shows / hides the help texts of the form fields (`onShowHelpChange`, the owner keeps
 * the choice); the field type filter (fieldTypeFilters.js, as in
 * HFieldTree) and Find (shown when the form has more than FIND_THRESHOLD fields; Enter
 * selects the first match) filter the tree only. The filters apply when they change, not
 * while values are typed (a field does not vanish under the cursor), and they are not
 * remembered: every editor starts with all fields.
 *
 *   const tree = new HStructureTree().attach(host, { form, valueCount: (name) => n, onSelect, onFilterChange }).render();
 *   tree.refresh();       // after values changed: the counts
 *   tree.select(name);    // mark a field
 *   tree.clearFilters();  // all fields again (e.g. a problem in a field filtered out)
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
import { fieldTypeOptions, fieldTypeShown } from '../../data/fieldTypeFilters.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HStructureTree.css';

/** Find is shown for a form with more fields than this. */
export const FIND_THRESHOLD = 25;

/** Field types without values (headings only). */
const NO_VALUE_TYPES = new Set(['separator']);

/** Tree of the groups and fields of an edit form. */
export class HStructureTree extends HBaseWidget {
  /**
   * @param {HTMLElement} container Tree host.
   * @param {object} options
   * @param {{groups: Array<object>, localized?: boolean}} options.form Normalized form (HEditForm#form).
   * @param {(name: string) => number} [options.valueCount] Number of values of a field (shown, and "filled").
   * @param {(name: string) => void} [options.onSelect] Called with the name of a clicked field.
   * @param {(name: string) => boolean} [options.isShown] Whether a field is shown in the form (showWhen); default all.
   * @param {(names: Set<string>|null) => void} [options.onFilterChange] The fields the form shows by the
   *        requirement and "Empty only" filters (null: no such filter).
   * @param {boolean} [options.showHelp=true] State of "Show help".
   * @param {(shown: boolean) => void} [options.onShowHelpChange] "Show help" changed (no checkbox without it).
   * @returns {HStructureTree} This tree.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.selected = null;
    this.settings = defaultSettings();
    this.findText = '';
    this._formNames = null;
    return this;
  }

  /** @returns {HStructureTree} This tree. */
  render() {
    if (!this.container) throw new Error('HStructureTree must be attached before render');
    this.clearListeners();
    this.container.replaceChildren();
    this.container.classList.add('h-widget', 'h-structure-tree');
    this.rows = new Map(); // field name -> {field, element, count}
    this.groupNodes = [];
    const fields = this._fields();

    this.container.append(this._renderToolbar(fields));
    this.body = document.createElement('div');
    this.body.className = 'h-structure-tree-body';
    this.body.setAttribute('role', 'tree');
    for (const section of this._sections()) this.body.append(this._renderGroup(section.group, section.inner));
    this.container.append(this.body);
    this.refresh();
    this._applyFilters();
    this.state = 'rendered';
    return this;
  }

  /**
   * Show the current values (counts, filled marks) and apply the filters.
   *
   * @returns {void}
   */
  refresh() {
    if (!this.rows) return;
    for (const [name, row] of this.rows) {
      const count = Number(this.options.valueCount?.(name)) || 0;
      row.valueCount = count;
      row.count.textContent = count > 0 ? `(${count})` : '';
      row.element.classList.toggle('is-filled', count > 0);
    }
  }

  /**
   * All fields again: the toolbar filters off (the form too).
   *
   * @returns {void}
   */
  clearFilters() {
    this.settings = defaultSettings();
    this.findText = '';
    for (const [key, input] of Object.entries(this.checks || {})) {
      input.checked = this.settings[key];
      input.disabled = false;
    }
    if (this.typeSelect) this.typeSelect.value = 'all';
    if (this.findInput) this.findInput.value = '';
    if (this.rows) this._applyFilters();
  }

  /**
   * Mark a field (the field shown in the form).
   *
   * @param {string|null} name Field name.
   * @returns {void}
   */
  select(name) {
    this.selected = name == null ? null : String(name);
    for (const [key, row] of this.rows || []) {
      const active = key === this.selected;
      row.element.classList.toggle('is-selected', active);
      row.element.setAttribute('aria-selected', String(active));
    }
    this.rows?.get(this.selected)?.element.scrollIntoView?.({ block: 'nearest' });
  }

  /** @returns {Array<object>} Every field of the form with values (not headings), in form order. */
  _fields() {
    return (this.options.form?.groups || []).flatMap((group) => group.children || [])
      .filter((field) => !NO_VALUE_TYPES.has(field.type));
  }

  /** Outer groups with the inner groups after them (as HEditForm builds its sections). */
  _sections() {
    const sections = [];
    for (const group of this.options.form?.groups || []) {
      if (group.inner && sections.length) sections.at(-1).inner.push(group);
      else sections.push({ group, inner: [] });
    }
    return sections;
  }

  /** Required only, Show optional, Empty only, type filter and (many fields) Find. */
  _renderToolbar(fields) {
    const toolbar = document.createElement('div');
    toolbar.className = 'h-structure-tree-toolbar';
    this.checks = {};
    const check = (key, label) => {
      const wrap = document.createElement('label');
      wrap.className = 'h-structure-tree-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'h-checkbox';
      input.checked = this.settings[key] === true;
      this.listen(input, 'change', () => {
        this.settings[key] = input.checked;
        // Required only: the other two do not apply (disabled while it is on; Empty only off,
        // Show optional keeps its state for when Required only is off again)
        if (key === 'requiredOnly') {
          if (input.checked) this.settings.emptyOnly = false;
          this.checks.emptyOnly.checked = this.settings.emptyOnly;
          for (const other of ['showOptional', 'emptyOnly']) this.checks[other].disabled = input.checked;
        }
        this._applyFilters();
      });
      this.checks[key] = input;
      const text = document.createElement('span');
      text.textContent = $HR(label);
      wrap.append(input, text);
      return wrap;
    };
    toolbar.append(check('requiredOnly', 'Required only'), check('showOptional', 'Show optional'), check('emptyOnly', 'Empty only'));
    if (typeof this.options.onShowHelpChange === 'function') toolbar.append(this._renderHelpCheck());

    const options = fieldTypeOptions(fields.map((field) => field.type));
    if (!options.includes(this.settings.type)) this.settings.type = 'all';
    const type = document.createElement('select');
    type.className = 'h-select h-compact h-structure-tree-type';
    type.title = $HR('Show fields of this type');
    type.setAttribute('aria-label', $HR('Field type'));
    for (const value of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = $HR(value);
      type.append(option);
    }
    type.value = this.settings.type;
    this.listen(type, 'change', () => {
      this.settings.type = type.value;
      this._applyFilters();
    });
    toolbar.append(type);
    this.typeSelect = type;

    if (fields.length > FIND_THRESHOLD) {
      const find = document.createElement('input');
      find.type = 'search';
      find.className = 'h-input h-structure-tree-find';
      find.placeholder = $HR('Find field');
      find.setAttribute('aria-label', find.placeholder);
      this.listen(find, 'input', () => {
        this.findText = find.value.trim().toLowerCase();
        this._applyFilters();
      });
      this.listen(find, 'keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const first = [...this.rows.values()].find((row) => !row.element.hidden);
        if (first) this._choose(first.field.name);
      });
      toolbar.append(find);
      this.findInput = find;
    }
    return toolbar;
  }

  /** "Show help": the help texts of the form fields (not a filter; the owner remembers it). */
  _renderHelpCheck() {
    const wrap = document.createElement('label');
    wrap.className = 'h-structure-tree-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'h-checkbox';
    input.checked = this.options.showHelp !== false;
    this.listen(input, 'change', () => this.options.onShowHelpChange(input.checked));
    this.helpCheck = input;
    const text = document.createElement('span');
    text.textContent = $HR('Show help');
    wrap.append(input, text);
    return wrap;
  }

  /** One group (an outer group with its inner groups): a caret, the caption and the fields. */
  _renderGroup(group, inner = []) {
    const node = document.createElement('div');
    node.className = 'h-structure-tree-group';
    node.setAttribute('role', 'group');
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'h-structure-tree-group-head';
    head.setAttribute('aria-expanded', 'true');
    const caret = document.createElement('span');
    caret.className = 'fa-solid fa-caret-down h-structure-tree-caret';
    caret.setAttribute('aria-hidden', 'true');
    const caption = document.createElement('span');
    caption.className = 'h-structure-tree-group-label';
    caption.textContent = this._text(group.label) || $HR('Fields');
    head.append(caret, caption);
    const children = document.createElement('div');
    children.className = 'h-structure-tree-children';
    this.listen(head, 'click', () => {
      const open = children.hidden;
      children.hidden = !open;
      head.setAttribute('aria-expanded', String(open));
      caret.className = `fa-solid ${open ? 'fa-caret-down' : 'fa-caret-right'} h-structure-tree-caret`;
    });
    for (const field of group.children || []) {
      if (!NO_VALUE_TYPES.has(field.type)) children.append(this._renderField(field));
    }
    for (const part of inner) children.append(this._renderGroup(part));
    node.append(head, children);
    this.groupNodes.push(node);
    return node;
  }

  /** One field: type, label (requirement colour), number of values. */
  _renderField(field) {
    const element = document.createElement('div');
    element.className = 'h-structure-tree-field';
    element.setAttribute('role', 'treeitem');
    element.setAttribute('aria-selected', 'false');
    element.dataset.name = field.name;
    element.tabIndex = 0;
    element.classList.toggle('is-required', field.req === 'required');
    element.classList.toggle('is-recommended', field.req === 'recommended');
    const type = document.createElement('span');
    type.className = 'h-structure-tree-type-mark';
    type.textContent = typeMark(field.type);
    type.title = String(field.type || '');
    const label = document.createElement('span');
    label.className = 'h-structure-tree-label';
    label.textContent = this._text(field.label) || field.name;
    const count = document.createElement('span');
    count.className = 'h-structure-tree-count';
    element.append(type, label, count);
    this.listen(element, 'click', () => this._choose(field.name));
    this.listen(element, 'keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this._choose(field.name);
      }
    });
    this.rows.set(field.name, { field, element, count, text: label.textContent.toLowerCase() });
    return element;
  }

  /** A field was chosen: mark it and tell the owner. */
  _choose(name) {
    this.select(name);
    this.options.onSelect?.(name);
  }

  /**
   * Hide the fields the toolbar leaves out, and the groups without a listed field; give the
   * form the fields of the requirement and "Empty only" filters (onFilterChange).
   */
  _applyFilters() {
    const { requiredOnly, showOptional, emptyOnly, type } = this.settings;
    const formFilter = requiredOnly || !showOptional || emptyOnly;
    const formNames = new Set();
    for (const row of this.rows.values()) {
      const req = row.field.req || 'optional';
      const inForm = requiredOnly ? req === 'required'
        : (showOptional || req !== 'optional') && (!emptyOnly || !row.valueCount);
      if (inForm) formNames.add(row.field.name);
      const shown = this.options.isShown ? this.options.isShown(row.field.name) !== false : true;
      row.element.hidden = !(inForm && shown && fieldTypeShown(type, row.field.type)
        && (!this.findText || row.text.includes(this.findText)));
    }
    const names = formFilter ? formNames : null;
    if (!sameNames(names, this._formNames)) {
      this._formNames = names;
      this.options.onFilterChange?.(names);
    }
    // inner groups first (they are inside the outer ones)
    for (const node of [...this.groupNodes].reverse()) {
      const listed = [...node.querySelectorAll('.h-structure-tree-field')].some((element) => !element.hidden);
      node.hidden = !listed;
    }
  }

  /** @returns {string} A text of the form in the interface language (unless the form is localized). */
  _text(value) {
    const text = String(value ?? '');
    return text && !this.options.form?.localized ? $HR(text) : text;
  }
}

/** @returns {string} A short mark of a field type (a letter or symbol). */
function typeMark(type) {
  return ({
    freetext: 'T', blocktext: '¶', integer: '#', float: '#', year: 'Y', date: 'D', enum: '≡', relationtype: '≡',
    resource: '→', relmarker: '⇄', file: 'F', geo: 'G', boolean: '✓', color: 'C', url: 'U', json: '{}'
  })[type] || '•';
}

/** @returns {{requiredOnly: boolean, showOptional: boolean, emptyOnly: boolean, type: string}} No filter. */
function defaultSettings() {
  return { requiredOnly: false, showOptional: true, emptyOnly: false, type: 'all' };
}

/** @returns {boolean} Whether two name sets (or nulls) are the same. */
function sameNames(a, b) {
  if (!a || !b) return a === b;
  return a.size === b.size && [...a].every((name) => b.has(name));
}
