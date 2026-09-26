/**
 * @file localSources.js
 * @brief Value sources that need no server request: fixed lists, vocabularies,
 *        and the users/groups overlay kept in HDbDefs.
 *
 * Every source answers `load({ text, limit, signal })` with
 * `{ items, total, complete }` (plan §4.1). Local sources are always complete,
 * so HValuePicker filters them in the browser.
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

import { sortItems } from './valueList.js';

/** Base for sources whose whole list is known locally. */
class LocalSource {
  /** @returns {Array<object>} Every item, in display order. */
  items() {
    return [];
  }

  /**
   * @returns {Promise<{items: Array<object>, total: number, complete: boolean}>}
   *          The complete list; text filtering is left to the picker.
   */
  async load() {
    const items = this.items();
    return { items, total: items.length, complete: true };
  }

  /**
   * @param {*} value Item value.
   * @returns {string} Its label, or `''` when unknown.
   */
  labelFor(value) {
    return this.items().find((item) => String(item.value) === String(value))?.label || '';
  }
}

/** A fixed list of `{ value, label }` items. */
export class StaticSource extends LocalSource {
  /**
   * @param {Array<object|Array>} items Items, or `[value, label]` pairs.
   * @param {{sort?: 'label'|'count'|'none'}} [options] Order; default `none` (as given).
   */
  constructor(items = [], { sort = 'none' } = {}) {
    super();
    const normalized = items.map((item) => (Array.isArray(item)
      ? { value: item[0], label: String(item[1] ?? item[0]) }
      : { ...item, label: String(item.label ?? item.value) }));
    this._items = sortItems(normalized, sort);
  }

  /** @returns {Array<object>} The fixed items. */
  items() {
    return this._items;
  }
}

/**
 * Flatten a vocabulary below its root into tree-ordered items with `depth`
 * (0 = the root's children).
 *
 * @param {object} dbdefs HDbDefs (needs `termTree`).
 * @param {number|string} vocabId Vocabulary root term ID.
 * @returns {Array<{value: number, label: string, depth: number}>} Terms in vocabulary order.
 */
export function vocabularyItems(dbdefs, vocabId) {
  const root = Number(vocabId);
  if (!root || !dbdefs?.termTree) return [];
  const tree = dbdefs.termTree(root);
  const items = [];
  const visit = (node, depth) => {
    for (const child of node?.children || []) {
      items.push({ value: Number(child.id), label: child.label || String(child.id), depth });
      visit(child, depth + 1);
    }
  };
  visit(tree, 0);
  return items;
}

/** All terms of a vocabulary, in vocabulary order (V8). */
export class TermSource extends LocalSource {
  /**
   * @param {object} dbdefs HDbDefs.
   * @param {number|string} vocabId Vocabulary root term ID.
   */
  constructor(dbdefs, vocabId) {
    super();
    this.dbdefs = dbdefs;
    this.vocabId = Number(vocabId) || 0;
    this._items = null;
  }

  /** @returns {Array<object>} Vocabulary items (built once). */
  items() {
    this._items ??= vocabularyItems(this.dbdefs, this.vocabId);
    return this._items;
  }

  /** @returns {string} Term label from HDbDefs. */
  labelFor(value) {
    return this.dbdefs?.termLabel?.(value) || '';
  }
}

/**
 * Groups, then users (alphabetical within each block), from the HDbDefs
 * users/groups overlay (V6). Empty for guests.
 */
export class UserGroupSource extends LocalSource {
  /**
   * @param {object} dbdefs HDbDefs with the users/groups overlay.
   * @param {{groups?: boolean, users?: boolean}} [options] Which blocks to list.
   */
  constructor(dbdefs, { groups = true, users = true } = {}) {
    super();
    this.dbdefs = dbdefs;
    this.includeGroups = groups;
    this.includeUsers = users;
  }

  /** @returns {Array<object>} Group items then user items. */
  items() {
    const list = [];
    if (this.includeGroups) {
      for (const group of this.dbdefs?.groups?.() || []) {
        list.push({ value: group.id, label: group.name, group: 'groups', role: group.role });
      }
    }
    if (this.includeUsers) {
      for (const user of this.dbdefs?.users?.() || []) {
        list.push({ value: user.id, label: user.name, group: 'users' });
      }
    }
    return sortItems(list, 'label');
  }

  /** @returns {boolean} True when the overlay offers anything to pick. */
  isAvailable() {
    return this.items().length > 0;
  }

  /** @returns {string} User or group name from HDbDefs. */
  labelFor(value) {
    return this.dbdefs?.userGroupName?.(value) || '';
  }
}
