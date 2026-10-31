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
 *     onSelect: (id) => {}, onHover: (id) => {}, onTool: (action, id) => {}
 *   }).render();
 *   tree.setItems(items); tree.select(id); tree.highlight(id);
 *
 * Keyboard: Up / Down move the selection, Home / End, Enter selects (onSelect).
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
   *        draggable?: boolean, children?: Array}>} [options.items]
   * @param {(item: object) => Array<{action: string, icon: string, title: string}>} [options.tools] Tools of an item.
   * @param {(dragId: string, targetId: string, position: string) => boolean} [options.canDrop]
   * @param {(dragId: string, targetId: string, position: string) => void} [options.onDrop]
   * @param {(id: string) => void} [options.onSelect]
   * @param {(id: string|null) => void} [options.onHover]
   * @param {(action: string, id: string) => void} [options.onTool]
   * @param {string} [options.emptyText] Shown without items.
   * @returns {HTree}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.items = Array.isArray(options.items) ? options.items : [];
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
      this.options.onTool?.(button.dataset.action, button.closest('.h-tree-row').dataset.id);
    });
    this.delegate(this.root, 'click', '.h-tree-row', (event, row) => {
      if (!event.target?.closest?.('.h-tree-tool')) this._choose(row.dataset.id);
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
      if (item.children?.length) entry.append(this._list(item.children, depth + 1));
      list.append(entry);
    }
    return list;
  }

  _rowOf(item, depth) {
    const row = document.createElement('div');
    row.className = `h-tree-row${item.muted ? ' h-tree-muted' : ''}`;
    row.dataset.id = item.id;
    row.setAttribute('role', 'treeitem');
    row.style.paddingLeft = `${4 + depth * 14}px`;
    if (item.draggable !== false && this.options.onDrop) row.draggable = true;
    if (item.title) row.title = item.title;
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
        button.className = 'h-tree-tool';
        button.dataset.action = tool.action;
        button.title = tool.title || tool.action;
        button.setAttribute('aria-label', button.title);
        const icon = document.createElement('i');
        icon.className = `fa-solid ${tool.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon);
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
    const ids = this.ids();
    if (!ids.length) return;
    const index = ids.indexOf(this.selectedId);
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
