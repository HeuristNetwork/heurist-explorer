/**
 * @file HTree.js
 * @brief A generic tree with icons, tools per item, keyboard, hover and drag and drop (plan 27c §7).
 *
 * The CMS designer uses it for the website tree (pages) and the structure tree of a part
 * (nodes). Items are plain objects; the owner decides where an item may be dropped
 * (`canDrop`) and does the move (`onDrop`), then gives the new items with setItems().
 *
 *   const tree = new HTree().attach(host, {
 *     items: [{id: 'a', label: 'Header', icon: 'fa-heading', draggable: false, children: []}],
 *     tools: (item) => [{action: 'edit', icon: 'fa-pen', title: 'Edit'}],
 *     canDrop: (dragId, targetId, position) => true,   // position: 'before' | 'inside' | 'after'
 *     onDrop: (dragId, targetId, position) => {},
 *     onSelect: (id) => {}, onHover: (id) => {}, onTool: (action, id) => {},
 *     onActivate: (id) => {}                            // double click on an item
 *   }).render();
 *   tree.setItems(items); tree.select(id); tree.highlight(id);
 *
 * Keyboard: Up / Down move the selection, Home / End, Enter selects (onSelect). Option `collapsible(item)` (plan 27n1 §5):
 * such items with children get a chevron that collapses them; Left / Right collapse / expand the selected item; the set of
 * collapsed ids is kept across setItems() (`collapsed()` reads it, `expandTo(id)` opens the parents of an item).
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
import './HTree.css';

/** Tree of items with tools and drag and drop. */
export class HTree extends HBaseWidget {
  /**
   * @param {HTMLElement} container Tree host.
   * @param {object} options
   * @param {Array<{id: string, label: string, icon?: string, title?: string, badge?: string, muted?: boolean,
   *        bold?: boolean, danger?: boolean, draggable?: boolean, children?: Array}>} [options.items] `bold`: the label in bold;
   *        `danger`: the label in the danger colour (an item with a problem).
   * @param {(item: object) => Array<{action: string, icon: string, title: string, label?: string, always?: boolean}>} [options.tools]
   *        Tools of an item; shown on hover and on the selected item, `always` ones all the time. `label`: a
   *        caption after the icon.
   * @param {(dragId: string, targetId: string, position: string) => boolean} [options.canDrop]
   * @param {(dragId: string, targetId: string, position: string) => void} [options.onDrop]
   * @param {(id: string) => void} [options.onSelect]
   * @param {(id: string|null) => void} [options.onHover]
   * @param {(action: string, id: string, button: HTMLElement) => void} [options.onTool] `button`: the tool clicked
   *        (to show something next to it).
   * @param {(id: string) => void} [options.onActivate] Double click on an item (not on its tools).
   * @param {string} [options.emptyText] Shown without items.
   * @param {(item: object) => boolean} [options.collapsible] Items (with children) that can be collapsed.
   * @param {Iterable<string>} [options.collapsed] Ids collapsed at start.
   * @returns {HTree}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.items = Array.isArray(options.items) ? options.items : [];
    this._collapsed = new Set(options.collapsed || []);
    this.selectedId = null;
    this.highlightedId = null;
    this._dragId = null;
    return this;
  }

  /** Draw the tree. */
  render() {
    this.clearListeners();
    this.container.replaceChildren();
    this.root = document.createElement('div');
    this.root.className = 'h-tree';
    this.root.tabIndex = 0;
    this.root.setAttribute('role', 'tree');
    this.container.append(this.root);
    this._draw();
    this.delegate(this.root, 'click', '.h-tree-tool', (event, button) => {
      event.stopPropagation();
      this.options.onTool?.(button.dataset.action, button.closest('.h-tree-row').dataset.id, button);
    });
    this.delegate(this.root, 'click', '.h-tree-toggle', (event, button) => {
      event.stopPropagation();
      this.toggle(button.closest('.h-tree-row').dataset.id);
    });
    this.delegate(this.root, 'click', '.h-tree-row', (event, row) => {
      if (!event.target?.closest?.('.h-tree-tool, .h-tree-toggle')) this._choose(row.dataset.id);
    });
    this.delegate(this.root, 'dblclick', '.h-tree-row', (event, row) => {
      if (!event.target?.closest?.('.h-tree-tool')) this.options.onActivate?.(row.dataset.id);
    });
    this.delegate(this.root, 'mouseover', '.h-tree-row', (event, row) => this._hover(row.dataset.id));
    this.listen(this.root, 'mouseleave', () => this._hover(null));
    this.listen(this.root, 'keydown', (event) => this._key(event));
    this.delegate(this.root, 'dragstart', '.h-tree-row', (event, row) => {
      this._dragId = row.dataset.id;
      event.dataTransfer?.setData?.('text/plain', row.dataset.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    this.delegate(this.root, 'dragover', '.h-tree-row', (event, row) => {
      const position = this._dropPosition(event, row);
      this._markDrop(row, position);
      if (position) event.preventDefault();
    });
    this.delegate(this.root, 'drop', '.h-tree-row', (event, row) => {
      const position = this._dropPosition(event, row);
      const dragId = this._dragId;
      this._endDrag();
      if (!position || !dragId) return;
      event.preventDefault();
      this.options.onDrop?.(dragId, row.dataset.id, position);
    });
    this.listen(this.root, 'dragend', () => this._endDrag());
    this.state = 'rendered';
    return this;
  }

  /** Replace the items (after a change by the owner); the selection is kept when the item is still there. */
  setItems(items) {
    this.items = Array.isArray(items) ? items : [];
    if (this.selectedId && !this._find(this.selectedId)) this.selectedId = null;
    if (this.root) this._draw();
  }

  /**
   * Collapse or expand an item.
   *
   * @param {string} id
   * @param {boolean} [collapse] Default: the other state.
   */
  toggle(id, collapse = !this._collapsed.has(id)) {
    if (collapse === this._collapsed.has(id)) return;
    if (collapse) this._collapsed.add(id); else this._collapsed.delete(id);
    if (this.root) this._draw();
  }

  /** @returns {string[]} The ids of the collapsed items. */
  collapsed() {
    return [...this._collapsed];
  }

  /**
   * Expand the parents of an item (an item chosen in the preview); redrawn when one was collapsed.
   *
   * @param {string} id
   */
  expandTo(id) {
    const path = [];
    const visit = (items, parents) => items.some((item) => {
      if (item.id === id) {
        path.push(...parents);
        return true;
      }
      return visit(item.children || [], [...parents, item.id]);
    });
    visit(this.items, []);
    const closed = path.filter((parent) => this._collapsed.has(parent));
    if (!closed.length) return;
    for (const parent of closed) this._collapsed.delete(parent);
    if (this.root) this._draw();
  }

  /** Mark an item as selected (no onSelect). */
  select(id) {
    this.selectedId = id ?? null;
    for (const row of this.root?.querySelectorAll('.h-tree-row') || []) {
      row.classList.toggle('h-tree-selected', row.dataset.id === this.selectedId);
      row.setAttribute('aria-selected', String(row.dataset.id === this.selectedId));
    }
    this._row(this.selectedId)?.scrollIntoView?.({ block: 'nearest' });
  }

  /** Mark an item as hovered from outside (the preview), or none. */
  highlight(id) {
    this.highlightedId = id ?? null;
    for (const row of this.root?.querySelectorAll('.h-tree-row') || []) {
      row.classList.toggle('h-tree-highlighted', row.dataset.id === this.highlightedId);
    }
  }

  /** Ids of the items in display order. */
  ids() {
    const ids = [];
    const visit = (items) => { for (const item of items) { ids.push(item.id); visit(item.children || []); } };
    visit(this.items);
    return ids;
  }

  /** Ids of the shown items (not inside a collapsed item), in display order. */
  shownIds() {
    const ids = [];
    const visit = (items) => {
      for (const item of items) {
        ids.push(item.id);
        if (!this._isCollapsed(item)) visit(item.children || []);
      }
    };
    visit(this.items);
    return ids;
  }

  /** Whether an item can collapse (option `collapsible`, with children). */
  _canCollapse(item) {
    return Boolean(item.children?.length) && typeof this.options.collapsible === 'function' && this.options.collapsible(item) === true;
  }

  /** Whether the children of an item are hidden. */
  _isCollapsed(item) {
    return this._collapsed.has(item.id) && this._canCollapse(item);
  }

  _draw() {
    this.root.replaceChildren();
    if (!this.items.length) {
      const empty = document.createElement('div');
      empty.className = 'h-tree-empty';
      empty.textContent = this.options.emptyText || '';
      this.root.append(empty);
      return;
    }
    this.root.append(this._list(this.items, 0));
    this.select(this.selectedId);
    this.highlight(this.highlightedId);
  }

  _list(items, depth) {
    const list = document.createElement('ul');
    list.className = 'h-tree-list';
    list.setAttribute('role', depth ? 'group' : 'none');
    for (const item of items) {
      const entry = document.createElement('li');
      entry.className = 'h-tree-item';
      entry.setAttribute('role', 'none');
      entry.append(this._rowOf(item, depth));
      if (item.children?.length && !this._isCollapsed(item)) entry.append(this._list(item.children, depth + 1));
      list.append(entry);
    }
    return list;
  }

  _rowOf(item, depth) {
    const row = document.createElement('div');
    row.className = `h-tree-row${item.muted ? ' h-tree-muted' : ''}${item.bold ? ' h-tree-bold' : ''}${item.danger ? ' h-tree-danger' : ''}`;
    row.dataset.id = item.id;
    row.setAttribute('role', 'treeitem');
    row.style.paddingLeft = `${4 + depth * 14}px`;
    if (item.draggable !== false && this.options.onDrop) row.draggable = true;
    if (item.title) row.title = item.title;
    // the chevron of a collapsible item; other rows keep its place (aligned icons)
    if (typeof this.options.collapsible === 'function') {
      const can = this._canCollapse(item);
      const toggle = document.createElement(can ? 'button' : 'span');
      toggle.className = can ? 'h-tree-toggle' : 'h-tree-toggle is-empty';
      if (can) {
        const collapsed = this._collapsed.has(item.id);
        toggle.type = 'button';
        toggle.tabIndex = -1;
        toggle.title = collapsed ? 'Expand' : 'Collapse';
        toggle.setAttribute('aria-label', toggle.title);
        row.setAttribute('aria-expanded', String(!collapsed));
        const icon = document.createElement('i');
        icon.className = `fa-solid ${collapsed ? 'fa-caret-right' : 'fa-caret-down'}`;
        icon.setAttribute('aria-hidden', 'true');
        toggle.append(icon);
      }
      row.append(toggle);
    }
    if (item.icon) {
      const icon = document.createElement('i');
      icon.className = `h-tree-icon fa-solid ${item.icon}`;
      icon.setAttribute('aria-hidden', 'true');
      row.append(icon);
    }
    const label = document.createElement('span');
    label.className = 'h-tree-label';
    label.textContent = item.label ?? item.id;
    row.append(label);
    if (item.badge) {
      const badge = document.createElement('span');
      badge.className = 'h-tree-badge';
      badge.textContent = item.badge;
      row.append(badge);
    }
    const tools = this.options.tools?.(item) || [];
    if (tools.length) {
      const box = document.createElement('span');
      box.className = 'h-tree-tools';
      for (const tool of tools) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = tool.always ? 'h-tree-tool h-tree-tool-always' : 'h-tree-tool';
        button.dataset.action = tool.action;
        button.title = tool.title || tool.action;
        button.setAttribute('aria-label', button.title);
        const icon = document.createElement('i');
        icon.className = `fa-solid ${tool.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon);
        if (tool.label) {
          const caption = document.createElement('span');
          caption.className = 'h-tree-tool-label';
          caption.textContent = tool.label;
          button.append(caption);
        }
        box.append(button);
      }
      row.append(box);
    }
    return row;
  }

  _choose(id) {
    this.select(id);
    this.options.onSelect?.(id);
  }

  _hover(id) {
    if (id === this._hovered) return;
    this._hovered = id;
    this.options.onHover?.(id);
  }

  _key(event) {
    const ids = this.shownIds();
    if (!ids.length) return;
    const index = ids.indexOf(this.selectedId);
    // Left / Right: collapse / expand the selected item
    const selected = this.selectedId ? this._find(this.selectedId) : null;
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && selected && this._canCollapse(selected)) {
      event.preventDefault();
      this.toggle(selected.id, event.key === 'ArrowLeft');
      return;
    }
    let next = null;
    if (event.key === 'ArrowDown') next = ids[Math.min(ids.length - 1, index + 1)];
    else if (event.key === 'ArrowUp') next = ids[Math.max(0, index - 1)];
    else if (event.key === 'Home') next = ids[0];
    else if (event.key === 'End') next = ids[ids.length - 1];
    else if (event.key === 'Enter' && this.selectedId) next = this.selectedId;
    if (next == null) return;
    event.preventDefault();
    this._choose(next);
  }

  /** Before / inside / after by the pointer height in the row, or null when nothing is allowed. */
  _dropPosition(event, row) {
    const dragId = this._dragId;
    const targetId = row.dataset.id;
    if (!dragId || dragId === targetId) return null;
    const box = row.getBoundingClientRect();
    const share = box.height ? (event.clientY - box.top) / box.height : 0.5;
    const order = share < 0.3 ? ['before', 'inside', 'after'] : share > 0.7 ? ['after', 'inside', 'before'] : ['inside', 'before', 'after'];
    return order.find((position) => this.options.canDrop?.(dragId, targetId, position) !== false) || null;
  }

  _markDrop(row, position) {
    for (const other of this.root.querySelectorAll('.h-tree-drop-before, .h-tree-drop-inside, .h-tree-drop-after')) {
      if (other !== row) other.classList.remove('h-tree-drop-before', 'h-tree-drop-inside', 'h-tree-drop-after');
    }
    row.classList.toggle('h-tree-drop-before', position === 'before');
    row.classList.toggle('h-tree-drop-inside', position === 'inside');
    row.classList.toggle('h-tree-drop-after', position === 'after');
  }

  _endDrag() {
    this._dragId = null;
    for (const row of this.root?.querySelectorAll('.h-tree-row') || []) {
      row.classList.remove('h-tree-drop-before', 'h-tree-drop-inside', 'h-tree-drop-after');
    }
  }

  _row(id) {
    if (!id) return null;
    return [...(this.root?.querySelectorAll('.h-tree-row') || [])].find((row) => row.dataset.id === id) || null;
  }

  _find(id) {
    let found = null;
    const visit = (items) => { for (const item of items) { if (item.id === id) found = item; else visit(item.children || []); } };
    visit(this.items);
    return found;
  }
}
