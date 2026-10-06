/**
 * @file HFieldTree.js
 * @brief Framework-free hierarchical field picker (Filter Builder, field-path editors,
 *        Smarty template editor).
 *
 * Replaces the legacy jQuery/Fancytree field tree in
 * `hclient/widgets/search/searchBuilder.js`. Shows the fields of a record type;
 * a resource / relmarker field expands one level into the linked record type's
 * fields (D3 - single linked level). A "show linked-from types" toggle adds
 * reverse-pointer branches. Emits a `path` describing the chosen leaf.
 *
 * path shape:
 *   [{ dty, fieldType }]                         flat field on the scope rectype
 *   [{ via:{ link:'lt'|'lf', dty, targetRty } }, // one pointer hop
 *    { dty, fieldType }]
 *   [{ dty, fieldType, term:'term'|'code'|'conceptid'|'desc'|'internalid' }]  enum output (scope.enumOutputs)
 *   [{ dty, fieldType, relationship:true }]      relationship of the record (scope.relationships):
 *                                                 dty is a property (recRelationType, ...) or a field id
 *
 * Shown as a popover under a button (open) or inline in a panel that stays
 * open after a pick (mount: the Smarty template editor). With `scope.multiSelect`
 * a click marks a leaf instead of picking it; the host reads `getSelectedPaths()`,
 * or, in a popover with `scope.onAddSelected`, gets them from the "Add selected fields" button.
 *
 * Moved from the Explorer filter builder to shared on 2026-10-05 (plan 12, Phase 5).
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

import { $HR } from '../../ui/i18n/HResource.js';
import './HFieldTree.css';

const LINKABLE = new Set(['resource', 'relmarker']);
const HEADER_FIELDS = [
  { dty: 'ids', label: 'ID', fieldType: 'integer' },
  { dty: 'added', label: 'Added', fieldType: 'date' },
  { dty: 'modified', label: 'Modified', fieldType: 'date' },
  { dty: 'addedby', label: 'Creator', fieldType: 'enum' },
  { dty: 'url', label: 'URL', fieldType: 'freetext' },
  // query-only header conditions (not output fields for column/map/timeline editors)
  { dty: 'notes', label: 'Notes', fieldType: 'freetext', builderOnly: true },
  { dty: 'tag', label: 'Tags', fieldType: 'tag', builderOnly: true },
  { dty: 'user', label: 'Bookmarked by', fieldType: 'user', builderOnly: true },
  { dty: 'owner', label: 'Owner', fieldType: 'enum' },
  { dty: 'access', label: 'Visibility', fieldType: 'enum' }
];

/** Outputs of an enum field offered with `scope.enumOutputs`: Smarty subfield → label. */
const ENUM_OUTPUTS = [
  { term: 'term', label: 'Term' },
  { term: 'code', label: 'Code' },
  { term: 'conceptid', label: 'Concept ID' },
  { term: 'desc', label: 'Description' },
  { term: 'internalid', label: 'Internal ID' }
];

/** Properties of a relationship (`scope.relationships`), as in the legacy report editor. */
const RELATIONSHIP_PROPS = [
  { dty: 'recRelationType', label: 'Relation Type' },
  { dty: 'recRelationNotes', label: 'Relation Notes' },
  { dty: 'recRelationStartDate', label: 'Relation StartDate' },
  { dty: 'recRelationEndDate', label: 'Relation EndDate' }
];

/** Relationship record fields already given by the properties above (or by the branch). */
const RELATIONSHIP_SKIPPED = ['DT_PRIMARY_RESOURCE', 'DT_TARGET_RESOURCE', 'DT_RELATION_TYPE',
  'DT_SHORT_SUMMARY', 'DT_START_DATE', 'DT_END_DATE'];

/** Type filter of the tree header: option → field types it shows (`all`: no filter). */
const TYPE_FILTERS = {
  all: null,
  text: ['freetext', 'blocktext'],
  enum: ['enum', 'relationtype'],
  date: ['date', 'year'],
  numeric: ['integer', 'float'],
  geo: ['geo']
  // file fields stay hidden until there is a proper way to select them
};

/** Framework-free hierarchical field picker popover for the Filter Builder. */
export class HFieldTree {
  /**
   * @param {{dbdefs:import('#shared/data/HDbDefs.js').HDbDefs}} deps
   */
  constructor({ dbdefs }) {
    this.dbdefs = dbdefs;
    this.element = null;
    this._onPick = null;
    this._rtyId = null;
    this._showReverse = false;
    this._alpha = false;
    // header: metadata sections shown, type filter (kept between openings)
    this._showMetadata = true;
    this._typeFilter = 'all';
    this._openKeys = new Set();
    // multiSelect: marked leaves (path key -> path, in marking order) and inserted ones
    this._selected = new Map();
    this._done = new Set();
    this._onDocClick = (event) => {
      if (this.element && !this.element.contains(event.target)) this.close();
    };
    // Escape closes the popover only (not the dialog under it)
    this._onKeyDown = (event) => {
      if (event.key !== 'Escape' || !this.element) return;
      event.preventDefault();
      event.stopPropagation();
      this.close();
    };
    // the host dialog closed by any route (Esc, button, code): never leave the popover behind
    this._onHostClose = () => this.close();
    this._host = null;
  }

  /**
   * Open the popover anchored under a button, scoped to a record type.
   *
   * @param {HTMLElement} anchor Button the popover attaches under.
   * @param {{rtyId:(number|string), hideUnusedRectypes?:boolean}} scope `hideUnusedRectypes`
   *        drops linked-from branches of record types without records (default: on
   *        unless `builderMode`).
   * @param {(path:Array)=>void} onPick
   * @returns {HFieldTree} This instance, for chaining.
   */
  open(anchor, scope, onPick) {
    this.close();
    this._inline = false;
    const el = this._build(scope, onPick);
    el.classList.toggle('h-fbtree-tall', this._tall);
    // Append inside the modal <dialog> when there is one - a modal dialog makes
    // everything outside its subtree inert, so a popover on document.body would
    // render behind the backdrop and be unclickable.
    this._host = anchor.closest('dialog');
    (this._host || document.body).append(el);
    this._host?.addEventListener('close', this._onHostClose);
    document.addEventListener('keydown', this._onKeyDown, true);
    this._renderBody();
    positionNear(el, anchor, { viewport: this._tall });

    // defer so the click that opened us does not immediately close it
    setTimeout(() => document.addEventListener('click', this._onDocClick), 0);
    return this;
  }

  /**
   * Show the tree inline in a container; it stays open after a pick.
   *
   * @param {HTMLElement} container Panel the tree fills.
   * @param {object} scope Same options as `open`, plus `enumOutputs` (enum fields
   *        expand to Term / Code / Internal ID ...; true or a list of outputs) and
   *        `includeFiles` (file fields).
   * @param {(path:Array)=>void} onPick Called with the path of each picked leaf.
   * @returns {HFieldTree} This instance, for chaining.
   */
  mount(container, scope, onPick) {
    this.close();
    this._inline = true;
    const el = this._build(scope, onPick);
    el.classList.add('h-fbtree-inline');
    container.replaceChildren(el);
    this._renderBody();
    return this;
  }

  /**
   * Show another record type (inline tree).
   *
   * @param {number|string} rtyId Record type.
   * @returns {void}
   */
  setRecordType(rtyId) {
    this._rtyId = rtyId ?? '';
    this._openKeys.clear();
    this._openKeys.add(`rty:${this._rtyId}`);
    this._openKeys.add(`root:fields:${this._rtyId}`);
    this._renderBody();
  }

  /**
   * Read the scope options and build the tree element with its toolbar.
   *
   * @private
   * @param {object} scope See `open` and `mount`.
   * @param {(path:Array)=>void} onPick
   * @returns {HTMLElement}
   */
  _build(scope, onPick) {
    this._rtyId = scope?.rtyId ?? '';
    // true: every output; a list: only these outputs (column fields: no description)
    this._enumOutputs = scope?.enumOutputs === true
      ? ENUM_OUTPUTS
      : (Array.isArray(scope?.enumOutputs) ? ENUM_OUTPUTS.filter((output) => scope.enumOutputs.includes(output.term)) : null);
    this._includeFiles = scope?.includeFiles === true;
    this._flatOnly = scope?.flatOnly === true;
    this._maxDepth = Number.isInteger(Number(scope?.maxDepth)) ? Math.max(0, Number(scope.maxDepth)) : 1;
    this._selectableTypes = Array.isArray(scope?.selectableTypes) && scope.selectableTypes.length
      ? new Set(scope.selectableTypes.map((value) => String(value).toLowerCase())) : null;
    this._hideUnselectable = scope?.hideUnselectable === true;
    // a tree limited to its selectable types (geo, date fields): no type filter and
    // no leaves of other types (Any field, "<type> records", title, metadata)
    this._fixedTypes = Boolean(this._selectableTypes && this._hideUnselectable);
    // field-path editors: a taller popover, bounded by the window rather than the dialog
    this._tall = scope?.tall === true;
    this._includeHeaders = scope?.includeHeaders !== false;
    this._linkedContext = scope?.linkedContext === true;
    this._builderMode = scope?.builderMode === true;
    // linked-from branches whose source record type has no records are hidden;
    // always for field-path editors, on request in the Filter Builder
    this._hideUnused = scope?.hideUnusedRectypes ?? !this._builderMode;
    this._disableLinks = scope?.disableLinks === true;
    this._excludedLinks = new Set((scope?.excludedLinks || []).map(String));
    this._excludedFields = new Set((scope?.excludedFields || []).map(String));
    this._showSort = scope?.showSort !== false;
    // opened inside a `related` sub-query: offer the Relationship record's own
    // conditions (relation type, relationship fields) above the endpoint's fields
    this._relationContext = scope?.relationContext === true;
    // report editor: a click marks leaves; a "Relationship" folder with the relationships of the record
    this._multiSelect = scope?.multiSelect === true;
    this._onSelectionChange = typeof scope?.onSelectionChange === 'function' ? scope.onSelectionChange : null;
    // popover (column fields): an "Add selected fields" button hands the marked leaves over
    this._onAddSelected = this._multiSelect && typeof scope?.onAddSelected === 'function' ? scope.onAddSelected : null;
    this._selected.clear();
    this._done.clear();
    this._relationships = scope?.relationships === true;
    // valuesOnly (report editor): no query-only leaves - "Any field" and "<type> records" (exists)
    this._valuesOnly = scope?.valuesOnly === true;
    this._onPick = onPick;
    this._openKeys.clear();
    this._openKeys.add(`rty:${this._rtyId}`);
    this._openKeys.add(`root:fields:${this._rtyId}`);
    if (this._fixedTypes && Number(this._rtyId) > 0) this._openFirstSelectable(this._rtyId);

    const el = document.createElement('div');
    el.className = 'h-fbtree';
    this.element = el;
    // Toggling a folder rebuilds the body, so the clicked node is gone by the
    // time the document click handler runs and `element.contains(target)` would
    // be false - swallow every click inside the popover so it never reaches it.
    el.addEventListener('click', (event) => event.stopPropagation());

    // header: ordering and linked-from types | metadata and the type filter
    const toolbar = document.createElement('div');
    toolbar.className = 'h-fbtree-toolbar';
    const first = document.createElement('div');
    first.className = 'h-fbtree-toolbar-column';
    const second = document.createElement('div');
    second.className = 'h-fbtree-toolbar-column';
    if (this._showSort) {
      first.append(this._toggle($HR('Alphabetic'), this._alpha, (on) => {
        this._alpha = on;
        this._renderBody();
      }));
    }
    first.append(this._toggle($HR('Show linked-from types'), this._showReverse, (on) => {
      this._showReverse = on;
      this._renderBody();
    }));
    if (this._includeHeaders) {
      second.append(this._toggle($HR('metadata'), this._showMetadata, (on) => {
        this._showMetadata = on;
        this._renderBody();
      }));
    }
    if (!this._fixedTypes) second.append(this._typeFilterSelect());
    toolbar.append(first, second);
    if (this._multiSelect) {
      const all = this._toggle($HR('Select all visible options'), false, (on) => this.selectVisible(on));
      all.classList.add('h-fbtree-select-all');
      this._selectAllBox = all.querySelector('input');
      toolbar.append(all);
    }

    this._body = document.createElement('div');
    this._body.className = 'h-fbtree-body';

    el.append(toolbar, this._body);
    if (this._onAddSelected) el.append(this._addSelectedFooter());
    return el;
  }

  /** @returns {HTMLElement} Footer with the "Add selected fields" button (popover multiSelect). */
  _addSelectedFooter() {
    const footer = document.createElement('div');
    footer.className = 'h-fbtree-footer';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'h-btn h-btn-small h-btn-primary';
    add.textContent = $HR('Add selected fields');
    add.disabled = true;
    add.addEventListener('click', () => {
      const paths = this.getSelectedPaths();
      if (!paths.length) return;
      const onAdd = this._onAddSelected;
      this.clearSelection();
      onAdd(paths);
      if (!this._inline) this.close();
    });
    this._addSelectedButton = add;
    footer.append(add);
    return footer;
  }

  /** Report a changed selection to the host and update the "Add selected fields" button. */
  _selectionChanged() {
    if (this._addSelectedButton) this._addSelectedButton.disabled = !this._selected.size;
    this._onSelectionChange?.(this._selected.size);
  }

  /** @returns {HTMLSelectElement} The "show fields of this type" filter. */
  _typeFilterSelect() {
    const typeFilter = document.createElement('select');
    typeFilter.className = 'h-select h-fbtree-type-filter';
    typeFilter.setAttribute('aria-label', $HR('Field type'));
    typeFilter.title = $HR('Show fields of this type');
    for (const value of Object.keys(TYPE_FILTERS)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = $HR(value);
      typeFilter.append(option);
    }
    typeFilter.value = this._typeFilter;
    typeFilter.addEventListener('change', () => {
      this._typeFilter = typeFilter.value;
      this._renderBody();
    });
    return typeFilter;
  }

  /**
   * Marked leaves of a multiSelect tree, in the order they were marked.
   *
   * @returns {Array<Array<object>>} Paths.
   */
  getSelectedPaths() {
    return [...this._selected.values()];
  }

  /**
   * Unmark leaves; with `inserted` they are shown as already inserted.
   *
   * @param {Array<Array<object>>|null} [paths] Paths to unmark (all when null).
   * @param {{inserted?: boolean}} [options]
   * @returns {void}
   */
  clearSelection(paths = null, { inserted = false } = {}) {
    const keys = paths ? paths.map(selectionKey) : [...this._selected.keys()];
    for (const key of keys) {
      this._selected.delete(key);
      if (inserted) this._done.add(key);
    }
    if (this._selectAllBox) this._selectAllBox.checked = false;
    this._renderBody();
    this._selectionChanged();
  }

  /**
   * Mark or unmark every leaf that is shown now (in open folders), as the legacy
   * "Select All Visible Options".
   *
   * @param {boolean} on Mark (true) or unmark.
   * @returns {void}
   */
  selectVisible(on) {
    if (!this._body) return;
    for (const row of this._body.querySelectorAll('.h-fbtree-leaf')) {
      if (row.disabled || !row._fbPath) continue;
      const key = selectionKey(row._fbPath);
      if (on) this._selected.set(key, row._fbPath);
      else this._selected.delete(key);
    }
    this._renderBody();
    this._selectionChanged();
  }

  /**
   * Pick a leaf (single mode) or switch its mark (multiSelect).
   *
   * @private
   * @param {HTMLElement} row Leaf row.
   * @param {Array<object>} path Leaf path.
   * @returns {void}
   */
  _choose(row, path) {
    if (!this._multiSelect) {
      this._onPick?.(path);
      if (!this._inline) this.close();
      return;
    }
    const key = selectionKey(path);
    if (this._selected.has(key)) this._selected.delete(key);
    else this._selected.set(key, path);
    this._markRow(row, path);
    this._selectionChanged();
  }

  /**
   * Prepare a leaf row: its path and, in multiSelect, the mark icon and state.
   *
   * @private
   * @param {HTMLElement} row Leaf row.
   * @param {Array<object>} path Leaf path.
   * @returns {void}
   */
  _setupLeaf(row, path) {
    row._fbPath = path;
    if (!this._multiSelect) return;
    const mark = document.createElement('i');
    mark.className = 'h-fbtree-mark';
    mark.setAttribute('aria-hidden', 'true');
    row.prepend(mark);
    this._markRow(row, path);
  }

  /** Show the marked / inserted state of a multiSelect leaf. */
  _markRow(row, path) {
    const key = selectionKey(path);
    const on = this._selected.has(key);
    row.setAttribute('aria-pressed', on ? 'true' : 'false');
    row.classList.toggle('is-selected', on);
    row.classList.toggle('is-inserted', this._done.has(key));
    const mark = row.querySelector('.h-fbtree-mark');
    if (mark) mark.className = `h-fbtree-mark ${on ? 'fa-solid fa-square-check' : 'fa-regular fa-square'}`;
  }

  /**
   * Close the popover and remove its outside-click listener.
   *
   * @returns {void}
   */
  close() {
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onKeyDown, true);
    this._host?.removeEventListener('close', this._onHostClose);
    this._host = null;
    this.element?.remove();
    this.element = null;
    this._body = null;
    this._selectAllBox = null;
    this._addSelectedButton = null;
    this._onPick = null;
  }

  /**
   * Close the popover. Alias kept for widget-lifecycle symmetry.
   *
   * @returns {void}
   */
  destroy() {
    this.close();
  }

  // ------------------------------------------------------------------ render ---

  /**
   * Render the popover body: the scope rectype's fields, plus reverse-pointer folders when enabled.
   *
   * @private
   * @returns {void}
   */
  _renderBody() {
    if (!this._body) return;
    this._body.replaceChildren();

    const rtyId = Number(this._rtyId) > 0 ? Number(this._rtyId) : null;
    if (this._relationContext && this._builderMode) {
      this._body.append(...this._relationNodes([]));
    }
    if (!rtyId && this._builderMode) {
      this._body.append(...this._anyRecordNodes([]));
      return;
    }
    if (!rtyId) {
      const hint = document.createElement('div');
      hint.className = 'h-fbtree-hint h-i18n';
      hint.textContent = 'Choose a record type first';
      this._body.append(hint);
      return;
    }

    this._body.append(this._sectionFolder(this.dbdefs.rectypeName(rtyId), `rty:${rtyId}`, () =>
      this._scopeNodes(rtyId, [], this._linkedContext)));
    if (this._relationships) {
      this._body.append(this._sectionFolder($HR('Relationship'), 'relationship', () => this._relationshipLeaves()));
    }

    if (this._showReverse && !this._flatOnly) {
      for (const folder of this._reverseLinks(rtyId)) {
        this._body.append(this._linkFolder({
          label: folder.label,
          key: `${folder.link}:${folder.dty}:${folder.fromRty}`,
          via: { link: folder.link, dty: folder.dty, targetRty: folder.fromRty },
          childRtyId: folder.fromRty,
          viaChain: []
        }));
      }
    }
  }

  /**
   * Record types that point at `rtyId`, one entry per field, sorted by label:
   * resource fields (`lf`), and in the Filter Builder relmarker fields as
   * bidirectional `related` branches.
   *
   * @private
   * @param {number} rtyId Scope record type.
   * @returns {{label:string, link:'lf'|'related', dty:number, fromRty:number}[]}
   */
  _reverseLinks(rtyId) {
    const out = [];
    const collect = (relation) => {
      const wanted = relation ? 'relmarker' : 'resource';
      for (const fromRty of this.dbdefs.linkedRectypes(rtyId, { direction: 'from', relation })) {
        if (this._hideUnused && this.dbdefs.isRectypeUsed?.(fromRty) === false) continue;
        for (const dty of this.dbdefs.pointerFieldsBetween(fromRty, rtyId)) {
          if (this.dbdefs.fieldGlobal(dty)?.type !== wanted) continue;
          const field = this.dbdefs.fieldName?.(fromRty, dty) || this.dbdefs.fieldGlobal(dty)?.name || `field ${dty}`;
          out.push({
            label: `« ${this.dbdefs.rectypeName(fromRty)} · ${field}${relation ? ` (${$HR('relationship')})` : ''}`,
            link: relation ? 'related' : 'lf',
            dty: Number(dty),
            fromRty: Number(fromRty)
          });
        }
      }
    };
    collect(false);
    if (this._builderMode) collect(true);
    return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  }

  /** Record header fields offered here; query-only ones appear in the Filter Builder only. */
  _headerFields() {
    return HEADER_FIELDS.filter((field) => this._builderMode || !field.builderOnly);
  }

  /** @returns {boolean} Whether a field type passes the header's type filter. */
  _typeShown(type) {
    if (this._fixedTypes) return this._selectableTypes.has(String(type || '').toLowerCase());
    const types = TYPE_FILTERS[this._typeFilter];
    return !types || types.includes(String(type || '').toLowerCase());
  }

  /** @returns {HTMLElement[]} Metadata leaves passing the type filter (none when metadata is hidden). */
  _metadataLeaves(viaChain) {
    if (!this._showMetadata) return [];
    return this._headerFields().filter((field) => this._typeShown(field.fieldType))
      .map((field) => this._headerLeaf(field, viaChain));
  }

  /** Leaves every record has, for a scope without a record type: any field, title, metadata. */
  _anyRecordNodes(viaChain) {
    const nodes = [];
    if (!this._valuesOnly && this._typeShown('freetext')) nodes.push(this._headerLeaf({ dty: 'anyfield', label: 'Any field', fieldType: 'freetext' }, viaChain));
    if (this._includeHeaders) {
      if (this._typeShown('freetext')) nodes.push(this._headerLeaf({ dty: 'title', label: 'Title', fieldType: 'freetext' }, viaChain));
      nodes.push(...this._metadataLeaves(viaChain));
    }
    return nodes;
  }

  /**
   * Relationship-record conditions of a `related` branch: "Relation type" (the most
   * used, so at the top) and a "Relationship Fields" folder with the Relationship
   * record type's other fields (source, target and type are implied by the branch).
   */
  _relationNodes(viaChain) {
    const relRty = this.dbdefs.dbconst?.('RT_RELATION') ?? 1;
    const implied = new Set(['DT_PRIMARY_RESOURCE', 'DT_TARGET_RESOURCE', 'DT_RELATION_TYPE']
      .map((name) => this.dbdefs.dbconst?.(name)).filter((id) => id != null).map(Number));
    return [
      ...(this._typeShown('relationtype')
        ? [this._headerLeaf({ dty: 'reltype', label: 'Relation type', fieldType: 'relationtype', rel: true }, viaChain)] : []),
      this._sectionFolder($HR('Relationship Fields'), `${pathKey(viaChain)}:relfields`, () =>
        (this.dbdefs.fields(relRty) || [])
          .filter((field) => !implied.has(Number(field.id)) && field.type !== 'file' && this._typeShown(field.type))
          .map((field) => this._headerLeaf(
            { dty: field.id, label: field.name, fieldType: field.type, rel: true, translate: false }, viaChain)))
    ];
  }

  /**
   * Leaves of the "Relationship" folder: the properties of a relationship and the
   * other fields of the Relationship record type (legacy report editor, mode 7).
   *
   * @private
   * @returns {HTMLElement[]}
   */
  _relationshipLeaves() {
    const relRty = this.dbdefs.dbconst?.('RT_RELATION') ?? 1;
    const skipped = new Set(RELATIONSHIP_SKIPPED.map((name) => this.dbdefs.dbconst?.(name))
      .filter((id) => id != null).map(Number));
    const items = RELATIONSHIP_PROPS.map((prop) => ({ ...prop, fieldType: 'relationship', relationship: true }));
    for (const field of this.dbdefs.fields(relRty) || []) {
      if (skipped.has(Number(field.id)) || field.type === 'file' || !this._typeShown(field.type)) continue;
      items.push({ dty: field.id, label: `${$HR('Relation')} ${field.name}`, fieldType: field.type, relationship: true, translate: false });
    }
    return items.map((item) => this._headerLeaf(item, []));
  }

  /** Build the record's Title, metadata and field sections. */
  _scopeNodes(rtyId, viaChain, linkedContext) {
    const nodes = [];
    if (linkedContext && this._typeFilter === 'all' && !this._fixedTypes && !this._valuesOnly) {
      nodes.push(this._headerLeaf({ dty: 'exists', label: `${this.dbdefs.rectypeName(rtyId)} records`, fieldType: 'exists' }, viaChain));
    }
    if (this._includeHeaders) {
      if (this._typeShown('freetext')) nodes.push(this._headerLeaf({ dty: 'title', label: 'Title', fieldType: 'freetext' }, viaChain));
      // hidden by the header checkbox, or when no metadata field has the chosen type
      if (this._metadataLeaves(viaChain).length) {
        nodes.push(this._sectionFolder($HR('metadata'), `${pathKey(viaChain)}:metadata:${rtyId}`, () =>
          this._metadataLeaves(viaChain)));
      }
    }
    const fieldNodes = () => [
      ...(!this._valuesOnly && this._typeShown('freetext') ? [this._headerLeaf({ dty: 'anyfield', label: 'Any field', fieldType: 'freetext' }, viaChain)] : []),
      ...this._fieldNodes(rtyId, viaChain)
    ];
    // without title/metadata (geo and time field editors) a "fields" folder
    // would be the only section: list the fields directly
    if (!nodes.length) return fieldNodes();
    nodes.push(this._sectionFolder($HR('fields'), `${pathKey(viaChain)}:fields:${rtyId}`, fieldNodes));
    return nodes;
  }

  /**
   * Open the folders leading to the nearest selectable field (fewest link hops),
   * so a tree limited to its types (geo, date fields) shows one at once.
   * Follows the same forward links as `_fieldNodes`.
   *
   * @private
   * @param {number} rtyId Scope record type.
   * @returns {void}
   */
  _openFirstSelectable(rtyId) {
    const queue = [{ rty: Number(rtyId), viaChain: [], keys: [] }];
    const visited = new Set();
    while (queue.length) {
      const { rty, viaChain, keys } = queue.shift();
      if (visited.has(rty)) continue;
      visited.add(rty);
      const fields = this.dbdefs.fields(rty) || [];
      if (fields.some((field) => field.type !== 'file' && this._selectableTypes?.has(String(field.type || '').toLowerCase()))) {
        for (const key of keys) this._openKeys.add(key);
        return;
      }
      if (viaChain.length >= this._maxDepth || this._flatOnly) continue;
      for (const field of fields) {
        if (!LINKABLE.has(field.type)) continue;
        const targets = (this.dbdefs.fieldGlobal(field.id)?.targetTypes || []).map(Number).filter((id) => id > 0);
        const link = field.type === 'relmarker' ? (this._builderMode ? 'related' : 'r') : 'lt';
        const key = `${pathKey(viaChain)}:${link}:${field.id}`;
        for (const target of targets) {
          queue.push({
            rty: target,
            viaChain: [...viaChain, { via: { link, dty: field.id, targetRty: target } }],
            // an ambiguous pointer has one sub-folder per target record type
            keys: [...keys, key, ...(targets.length > 1 ? [`${key}>${target}`] : [])]
          });
        }
      }
    }
  }

  /** Render one expandable section, preserving its open state. */
  _sectionFolder(label, key, children) {
    const wrap = document.createElement('div');
    wrap.className = 'h-fbtree-folder';
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'h-menu-item h-fbtree-folder-head h-i18n';
    head.textContent = `${this._openKeys.has(key) ? '▾' : '▸'} ${label}`;
    head.dataset.treeKey = key;
    head.addEventListener('click', () => this._toggleFolder(key, head));
    wrap.append(head);
    if (this._openKeys.has(key)) {
      const body = document.createElement('div');
      body.className = 'h-fbtree-children';
      body.append(...children());
      wrap.append(body);
    }
    return wrap;
  }

  /** @returns {HTMLElement[]} field rows + expandable pointer folders */
  _fieldNodes(rtyId, viaChain) {
    const fields = this.dbdefs.fields(rtyId);
    if (this._alpha) {
      fields.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }

    const out = [];
    for (const field of fields) {
      const linkable = LINKABLE.has(field.type);
      const branchBlocked = linkable && this._builderMode && viaChain.length === 0
        && (this._disableLinks || this._excludedLinks.has(String(field.id)));
      if (branchBlocked) {
        const disabled = document.createElement('button');
        disabled.type = 'button';
        disabled.className = 'h-menu-item h-fbtree-leaf h-fbtree-leaf-disabled';
        disabled.textContent = field.name;
        disabled.title = $HR('This linked branch is already present. Add more conditions inside its table.');
        disabled.disabled = true;
        out.push(disabled);
        continue;
      }
      if (linkable && this._builderMode && viaChain.length >= this._maxDepth) continue;
      const selectable = !this._selectableTypes || this._selectableTypes.has(String(field.type || '').toLowerCase());
      // file fields are not offered (no proper way to select them yet); a type filter
      // keeps the pointer branches, so fields of that type in linked records stay reachable
      if (field.type === 'file' && !this._includeFiles) continue;
      if (this._hideUnselectable && !selectable && !linkable) continue;
      if (!linkable && !this._typeShown(field.type)) continue;
      if (linkable && viaChain.length < this._maxDepth && !this._flatOnly) {
        const targets = this.dbdefs.fieldGlobal(field.id)?.targetTypes || [];
        // in the Filter Builder a relmarker is a bidirectional `related` branch;
        // field-path editors write lt for a pointer and r (related, either direction) for a relationship
        const link = field.type === 'relmarker' ? (this._builderMode ? 'related' : 'r') : 'lt';
        out.push(this._linkFolder({
          label: field.name,
          key: `${pathKey(viaChain)}:${link}:${field.id}`,
          via: { link, dty: field.id, targetRty: targets.length === 1 ? targets[0] : '' },
          childRtyId: targets.length === 1 ? targets[0] : null,
          targets,
          viaChain
        }));
      } else if (this._enumOutputs?.length && ['enum', 'relationtype'].includes(field.type)) {
        out.push(this._enumFolder(field, viaChain));
      } else if (!this._hideUnselectable || selectable) {
        out.push(this._leaf(field, viaChain));
      }
    }
    return out;
  }

  _headerLeaf(item, viaChain = []) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'h-menu-item h-fbtree-leaf h-fbtree-header-leaf';
    // field names come from the database; only built-in labels are translated
    row.textContent = item.translate === false ? item.label : $HR(item.label);
    const type = document.createElement('span');
    type.className = 'h-fbtree-type';
    type.textContent = item.fieldType;
    row.append(type);
    // a relationship field and an endpoint field may share an id
    const excludedKey = item.rel ? `rel:${item.dty}` : String(item.dty);
    if (!viaChain.length && this._excludedFields.has(excludedKey)) {
      row.disabled = true;
      row.classList.add('h-fbtree-leaf-disabled');
    }
    const pick = { dty: item.dty, fieldType: item.fieldType };
    if (item.rel) pick.rel = true;
    if (item.relationship) pick.relationship = true;
    const path = [...viaChain, pick];
    this._setupLeaf(row, path);
    row.addEventListener('click', () => this._choose(row, path));
    return row;
  }

  /**
   * Build a leaf row for one flat field, wired to call `onPick` with its full path.
   *
   * @private
   * @param {object} field Field descriptor; see `HDbDefs#fields`.
   * @param {Array} viaChain Pointer-hop prefix leading to this field's scope rectype.
   * @returns {HTMLButtonElement}
   */
  _leaf(field, viaChain) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'h-menu-item h-fbtree-leaf';
    const selectable = !this._selectableTypes || this._selectableTypes.has(String(field.type || '').toLowerCase());
    const available = selectable && (viaChain.length || !this._excludedFields.has(String(field.id)));
    if (!available) row.classList.add('h-fbtree-leaf-disabled');
    row.disabled = !available;
    row.textContent = `${field.name}`;
    const type = document.createElement('span');
    type.className = 'h-fbtree-type';
    type.textContent = field.type;
    row.append(type);
    const path = [...viaChain, { dty: field.id, fieldType: field.type }];
    this._setupLeaf(row, path);
    row.addEventListener('click', () => this._choose(row, path));
    return row;
  }

  /**
   * Folder of an enum field with one leaf per output (label, code, internal id).
   *
   * @private
   * @param {object} field Field descriptor; see `HDbDefs#fields`.
   * @param {Array} viaChain Pointer-hop prefix leading to this field's scope rectype.
   * @returns {HTMLElement}
   */
  _enumFolder(field, viaChain) {
    return this._sectionFolder(field.name, `${pathKey(viaChain)}:enum:${field.id}`, () => this._enumOutputs.map((output) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'h-menu-item h-fbtree-leaf h-fbtree-term-leaf';
      row.textContent = $HR(output.label);
      const type = document.createElement('span');
      type.className = 'h-fbtree-type';
      type.textContent = output.term;
      row.append(type);
      const path = [...viaChain, { dty: field.id, fieldType: field.type, term: output.term }];
      this._setupLeaf(row, path);
      row.addEventListener('click', () => this._choose(row, path));
      return row;
    }));
  }

  /**
   * Build an expandable pointer-field folder, recursing into its target rectype's fields when open.
   *
   * @private
   * @param {object} options Folder definition.
   * @param {string} options.label Folder label.
   * @param {string} options.key Unique open/closed state key.
   * @param {{link: string, dty: number, targetRty: number|string}} options.via Pointer hop this folder represents.
   * @param {number|string|null} options.childRtyId Target rectype to expand into, when unambiguous.
   * @param {Array<number>} [options.targets] Candidate target rectypes, when ambiguous.
   * @returns {HTMLElement}
   */
  _linkFolder({ label, key, via, childRtyId, targets = [], viaChain = [] }) {
    const wrap = document.createElement('div');
    wrap.className = 'h-fbtree-folder';

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'h-menu-item h-fbtree-folder-head';
    head.textContent = (this._openKeys.has(key) ? '▾ ' : '▸ ') + label;
    head.dataset.treeKey = key;
    head.addEventListener('click', () => this._toggleFolder(key, head));
    wrap.append(head);

    if (!this._openKeys.has(key)) return wrap;

    const kids = document.createElement('div');
    kids.className = 'h-fbtree-children';

    // a relationship branch starts with the Relationship record's own conditions
    const relation = via.link === 'related';
    const rty = Number(childRtyId) > 0 ? Number(childRtyId) : null;
    const ambiguous = !childRtyId && targets.length > 1;   // each target sub-folder lists them
    if (relation && !ambiguous) {
      kids.append(...this._relationNodes([...viaChain, { via: { ...via, targetRty: rty || '' } }]));
    }

    // ambiguous target: let the user pick which linked rectype to descend into
    if (ambiguous) {
      for (const target of targets) {
        kids.append(this._linkFolder({
          label: this.dbdefs.rectypeName(target),
          key: `${key}>${target}`,
          via: { ...via, targetRty: target },
          childRtyId: target,
          viaChain
        }));
      }
      wrap.append(kids);
      return wrap;
    }

    if (rty) {
      const nextChain = [...viaChain, { via: { ...via, targetRty: rty } }];
      for (const node of this._scopeNodes(rty, nextChain, true)) {
        kids.append(node);
      }
    } else if (relation) {
      // relationship to any record type
      kids.append(...this._anyRecordNodes([...viaChain, { via: { ...via, targetRty: '' } }]));
    }
    wrap.append(kids);
    return wrap;
  }


  /** Toggle a lazy folder without moving the clicked row in the scroll viewport. */
  _toggleFolder(key, head) {
    const previousTop = head.getBoundingClientRect().top;
    if (this._openKeys.has(key)) this._openKeys.delete(key);
    else this._openKeys.add(key);
    this._renderBody();
    const replacement = [...this._body.querySelectorAll('[data-tree-key]')]
      .find((node) => node.dataset.treeKey === key);
    if (replacement) this._body.scrollTop += replacement.getBoundingClientRect().top - previousTop;
  }

  /**
   * Build a labeled checkbox toolbar toggle.
   *
   * @private
   * @param {string} label Toggle label.
   * @param {boolean} checked Initial checked state.
   * @param {function(boolean): void} onChange Called with the new checked state.
   * @returns {HTMLElement}
   */
  _toggle(label, checked, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'h-fbtree-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'h-checkbox';
    input.checked = !!checked;
    input.addEventListener('change', () => onChange(input.checked));
    wrap.append(input, document.createTextNode(' ' + label));
    return wrap;
  }
}


/** Identity of a leaf path (marked leaves). */
function selectionKey(path) {
  return JSON.stringify(path);
}

/** Return a stable branch identifier for a linked path. */
function pathKey(viaChain) {
  return (viaChain || []).map(({ via }) =>
    (via?.link || 'lt') + ':' + (via?.dty ?? '') + ':' + (via?.targetRty ?? '')).join('>') || 'root';
}

/**
 * Place the field tree below its anchor, or above when more room is available there.
 * Bounded by the enclosing dialog, or by the window with `viewport`.
 */
function positionNear(el, anchor, { viewport = false } = {}) {
  const rect = anchor.getBoundingClientRect();
  const dialogRect = viewport ? null : anchor.closest('dialog')?.getBoundingClientRect();
  const topLimit = Math.max(8, dialogRect?.top ?? 8);
  const bottomLimit = Math.min(window.innerHeight - 8, dialogRect?.bottom ?? window.innerHeight - 8);
  const below = bottomLimit - rect.bottom - 4;
  const above = rect.top - topLimit - 4;
  const openBelow = below >= el.offsetHeight || below >= above;
  // The limit is the room on the chosen side (and the CSS cap: 60vh, 85vh when tall), not
  // the height at opening - that is only the collapsed folders, and expanded ones must fit.
  const cap = window.innerHeight * (viewport ? 0.85 : 0.6);
  el.style.maxHeight = `${Math.max(80, Math.min(cap, openBelow ? below : above))}px`;
  el.style.position = 'fixed';
  if (openBelow) {
    el.style.top = `${rect.bottom + 2}px`;
    el.style.bottom = '';
  } else {
    // anchored by its bottom edge, so it grows upwards as folders open
    el.style.top = '';
    el.style.bottom = `${window.innerHeight - rect.top + 2}px`;
  }
  el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - el.offsetWidth - 8))}px`;
}
