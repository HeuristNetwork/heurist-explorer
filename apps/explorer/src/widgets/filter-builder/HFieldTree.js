/**
 * @file HFieldTree.js
 * @brief Framework-free hierarchical field picker for the Filter Builder.
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
    this._openKeys = new Set();
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
    this._rtyId = scope?.rtyId ?? '';
    this._flatOnly = scope?.flatOnly === true;
    this._maxDepth = Number.isInteger(Number(scope?.maxDepth)) ? Math.max(0, Number(scope.maxDepth)) : 1;
    this._selectableTypes = Array.isArray(scope?.selectableTypes) && scope.selectableTypes.length
      ? new Set(scope.selectableTypes.map((value) => String(value).toLowerCase())) : null;
    this._hideUnselectable = scope?.hideUnselectable === true;
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
    this._onPick = onPick;
    this._openKeys.clear();
    this._openKeys.add(`rty:${this._rtyId}`);
    this._openKeys.add(`root:fields:${this._rtyId}`);

    const el = document.createElement('div');
    el.className = 'h-fbtree';
    this.element = el;
    // Toggling a folder rebuilds the body, so the clicked node is gone by the
    // time the document click handler runs and `element.contains(target)` would
    // be false - swallow every click inside the popover so it never reaches it.
    el.addEventListener('click', (event) => event.stopPropagation());

    const toolbar = document.createElement('div');
    toolbar.className = 'h-fbtree-toolbar';
    if (this._showSort) {
      toolbar.append(this._toggle($HR('Alphabetic'), this._alpha, (on) => {
        this._alpha = on;
        this._renderBody();
      }));
    }
    toolbar.append(this._toggle($HR('Show linked-from types'), this._showReverse, (on) => {
      this._showReverse = on;
      this._renderBody();
    }));

    this._body = document.createElement('div');
    this._body.className = 'h-fbtree-body';

    el.append(toolbar, this._body);
    // Append inside the modal <dialog> when there is one - a modal dialog makes
    // everything outside its subtree inert, so a popover on document.body would
    // render behind the backdrop and be unclickable.
    this._host = anchor.closest('dialog');
    (this._host || document.body).append(el);
    this._host?.addEventListener('close', this._onHostClose);
    document.addEventListener('keydown', this._onKeyDown, true);
    this._renderBody();
    positionNear(el, anchor);

    // defer so the click that opened us does not immediately close it
    setTimeout(() => document.addEventListener('click', this._onDocClick), 0);
    return this;
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

  /** Leaves every record has, for a scope without a record type: any field, title, metadata. */
  _anyRecordNodes(viaChain) {
    const nodes = [this._headerLeaf({ dty: 'anyfield', label: 'Any field', fieldType: 'freetext' }, viaChain)];
    if (this._includeHeaders) {
      nodes.push(
        this._headerLeaf({ dty: 'title', label: 'Title', fieldType: 'freetext' }, viaChain),
        ...this._headerFields().map((field) => this._headerLeaf(field, viaChain))
      );
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
      this._headerLeaf({ dty: 'reltype', label: 'Relation type', fieldType: 'relationtype', rel: true }, viaChain),
      this._sectionFolder($HR('Relationship Fields'), `${pathKey(viaChain)}:relfields`, () =>
        (this.dbdefs.fields(relRty) || [])
          .filter((field) => !implied.has(Number(field.id)) && field.type !== 'file')
          .map((field) => this._headerLeaf(
            { dty: field.id, label: field.name, fieldType: field.type, rel: true, translate: false }, viaChain)))
    ];
  }

  /** Build the record's Title, metadata and field sections. */
  _scopeNodes(rtyId, viaChain, linkedContext) {
    const nodes = [];
    if (linkedContext) {
      nodes.push(this._headerLeaf({ dty: 'exists', label: `${this.dbdefs.rectypeName(rtyId)} records`, fieldType: 'exists' }, viaChain));
    }
    if (this._includeHeaders) {
      nodes.push(this._headerLeaf({ dty: 'title', label: 'Title', fieldType: 'freetext' }, viaChain));
      nodes.push(this._sectionFolder($HR('metadata'), `${pathKey(viaChain)}:metadata:${rtyId}`, () =>
        this._headerFields().map((field) => this._headerLeaf(field, viaChain))));
    }
    nodes.push(this._sectionFolder($HR('fields'), `${pathKey(viaChain)}:fields:${rtyId}`, () => [
      this._headerLeaf({ dty: 'anyfield', label: 'Any field', fieldType: 'freetext' }, viaChain),
      ...this._fieldNodes(rtyId, viaChain)
    ]));
    return nodes;
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
      if (field.type === 'file' || (this._hideUnselectable && !selectable && !linkable)) continue;
      if (linkable && viaChain.length < this._maxDepth && !this._flatOnly) {
        const targets = this.dbdefs.fieldGlobal(field.id)?.targetTypes || [];
        // in the Filter Builder a relmarker is a bidirectional `related` branch;
        // field-path editors keep the plain link path
        const link = this._builderMode && field.type === 'relmarker' ? 'related' : 'lt';
        out.push(this._linkFolder({
          label: field.name,
          key: `${pathKey(viaChain)}:${link}:${field.id}`,
          via: { link, dty: field.id, targetRty: targets.length === 1 ? targets[0] : '' },
          childRtyId: targets.length === 1 ? targets[0] : null,
          targets,
          viaChain
        }));
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
    row.addEventListener('click', () => {
      const pick = { dty: item.dty, fieldType: item.fieldType };
      if (item.rel) pick.rel = true;
      this._onPick?.([...viaChain, pick]);
      this.close();
    });
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
    row.addEventListener('click', () => {
      const path = [...viaChain, { dty: field.id, fieldType: field.type }];
      this._onPick?.(path);
      this.close();
    });
    return row;
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


/** Return a stable branch identifier for a linked path. */
function pathKey(viaChain) {
  return (viaChain || []).map(({ via }) =>
    (via?.link || 'lt') + ':' + (via?.dty ?? '') + ':' + (via?.targetRty ?? '')).join('>') || 'root';
}

/** Place the field tree below its anchor, or above when more room is available there. */
function positionNear(el, anchor) {
  const rect = anchor.getBoundingClientRect();
  const dialogRect = anchor.closest('dialog')?.getBoundingClientRect();
  const topLimit = Math.max(8, dialogRect?.top ?? 8);
  const bottomLimit = Math.min(window.innerHeight - 8, dialogRect?.bottom ?? window.innerHeight - 8);
  const below = bottomLimit - rect.bottom - 4;
  const above = rect.top - topLimit - 4;
  const openBelow = below >= el.offsetHeight || below >= above;
  const height = Math.max(80, Math.min(el.offsetHeight, openBelow ? below : above));
  el.style.maxHeight = `${height}px`;
  el.style.position = 'fixed';
  el.style.top = `${Math.max(topLimit, openBelow ? rect.bottom + 2 : rect.top - height - 2)}px`;
  el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - el.offsetWidth - 8))}px`;
}
