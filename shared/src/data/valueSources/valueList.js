/**
 * @file valueList.js
 * @brief Pure list operations behind HValuePicker: text filtering, sorting and row limits.
 *
 * DOM-free so it can be tested directly and shared by every value source.
 * An item is `{ value, label, depth?, count?, group?, rty?, context? }`;
 * `depth` marks tree items (terms), `context` marks an ancestor kept only to
 * show where a match sits in the tree.
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

/** Items above this many show the filter row (V10). */
export const FILTER_ROW_THRESHOLD = 30;
/** Rows rendered at most; the rest is reported as "x of y shown" (V10). */
export const MAX_RENDERED_ROWS = 200;
/** Values requested from the server at once (V9). */
export const VALUE_LOAD_LIMIT = 1000;

/**
 * Fold a text for matching: lower case, without diacritics.
 *
 * @param {*} text Any value.
 * @returns {string} Folded text.
 */
export function foldText(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Keep the items whose label contains `text`. Tree items keep their ancestors
 * as `context` rows so indentation still makes sense.
 *
 * @param {Array<object>} items Items in display order.
 * @param {string} text Filter text.
 * @returns {Array<object>} Filtered items (the input when `text` is blank).
 */
export function filterItems(items, text) {
  const needle = foldText(text);
  if (!needle) return items;
  const matches = (item) => foldText(item.label ?? item.value).includes(needle);
  if (!items.some((item) => item.depth != null)) return items.filter(matches);

  const result = [];
  const ancestors = [];
  for (const item of items) {
    const depth = Number(item.depth) || 0;
    ancestors.length = depth;
    if (matches(item)) {
      for (const ancestor of ancestors) {
        if (ancestor && !ancestor.shown) {
          result.push({ ...ancestor.item, context: true });
          ancestor.shown = true;
        }
      }
      result.push(item);
    }
    ancestors[depth] = { item, shown: matches(item) };
  }
  return result;
}

/**
 * Sort items without touching the input.
 *
 * @param {Array<object>} items Items.
 * @param {'label'|'count'|'none'} mode `label`: alphabetical; `count`: by count
 *        (descending), then alphabetical; `none`: keep the given order (terms).
 * @returns {Array<object>} Sorted copy; items keep their `group` blocks in first-seen order.
 */
export function sortItems(items, mode = 'label') {
  if (mode === 'none') return items.slice();
  const byLabel = (a, b) => String(a.label ?? a.value).localeCompare(String(b.label ?? b.value),
    undefined, { numeric: true, sensitivity: 'base' });
  const compare = mode === 'count'
    ? (a, b) => (Number(b.count) || 0) - (Number(a.count) || 0) || byLabel(a, b)
    : byLabel;
  const groups = new Map();
  for (const item of items) {
    const key = item.group ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()].flatMap((group) => group.sort(compare));
}

/**
 * Cut a list to the rows that are rendered.
 *
 * @param {Array<object>} items Items to show.
 * @param {number} [max=MAX_RENDERED_ROWS] Row limit.
 * @returns {{rows: Array<object>, shown: number, total: number}} Rows plus counts
 *          of selectable items (context rows are not counted).
 */
export function limitRows(items, max = MAX_RENDERED_ROWS) {
  const rows = items.slice(0, Math.max(0, max));
  const countable = (list) => list.filter((item) => !item.context).length;
  return { rows, shown: countable(rows), total: countable(items) };
}

/**
 * Whether the filter row is shown (V10).
 *
 * @param {{complete: boolean, total: number}} state Source state.
 * @param {number} [threshold=FILTER_ROW_THRESHOLD] Item count above which it is shown.
 * @returns {boolean} True when the list is incomplete or long.
 */
export function needsFilterRow({ complete, total }, threshold = FILTER_ROW_THRESHOLD) {
  return !complete || Number(total) > threshold;
}

/**
 * Split a list for an explicit radio/checkbox presentation: the first
 * `threshold` items are listed, the rest stay reachable through a picker.
 * Selected items beyond the cut are appended to the explicit list (§3).
 *
 * @param {Array<object>} items All items in display order.
 * @param {number} threshold Explicit-list size.
 * @param {Array<*>} [selected=[]] Selected values.
 * @returns {{explicit: Array<object>, truncated: boolean}} Items listed explicitly.
 */
export function truncateForList(items, threshold, selected = []) {
  const limit = Math.max(1, Number(threshold) || FILTER_ROW_THRESHOLD);
  const selectable = items.filter((item) => !item.context);
  if (selectable.length < limit) return { explicit: items, truncated: false };
  const explicit = items.slice(0, limit);
  const listed = new Set(explicit.map((item) => String(item.value)));
  for (const value of selected) {
    if (listed.has(String(value))) continue;
    const item = items.find((candidate) => String(candidate.value) === String(value));
    if (item) { explicit.push(item); listed.add(String(value)); }
  }
  return { explicit, truncated: true };
}

/**
 * Merge facet counts into a vocabulary (V13, V15): keep the terms that occur
 * (count > 0) and their ancestors (no count, still selectable), in vocabulary
 * order; a selected term stays even when its count dropped to zero.
 *
 * @param {Array<object>} terms Vocabulary items with `depth`, in tree order.
 * @param {Map<string, number>} counts Count by term ID (string keys).
 * @param {Array<*>} [selected=[]] Selected values that must stay visible.
 * @returns {Array<object>} Facet items.
 */
export function mergeTermCounts(terms, counts, selected = []) {
  const keep = new Set(selected.map(String));
  const result = [];
  const ancestors = [];
  for (const term of terms) {
    const depth = Number(term.depth) || 0;
    ancestors.length = depth;
    const key = String(term.value);
    const count = counts.get(key) || 0;
    if (count > 0 || keep.has(key)) {
      for (const ancestor of ancestors) {
        if (ancestor && !ancestor.added) {
          const { count: _unused, ...plain } = ancestor.term;
          result.push(plain);
          ancestor.added = true;
        }
      }
      result.push({ ...term, count });
      ancestors[depth] = { term, added: true };
    } else {
      ancestors[depth] = { term, added: false };
    }
  }
  return result;
}

/**
 * Drop values whose count is zero, except selected ones (V15).
 *
 * @param {Array<object>} items Items with counts.
 * @param {Array<*>} [selected=[]] Selected values.
 * @returns {Array<object>} Remaining items.
 */
export function hideZeroCounts(items, selected = []) {
  const keep = new Set(selected.map(String));
  return items.filter((item) => item.count == null || item.count > 0 || keep.has(String(item.value)));
}
