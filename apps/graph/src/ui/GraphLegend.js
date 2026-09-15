/**
 * @file GraphLegend.js
 * @brief Active dataset legend. Counts describe loaded data, independent of visibility.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { $HR } from '#shared/ui';

/** Renders the record-type/link/expansion-rule legend for the active graph. */
export class GraphLegend {
  /**
   * @param {object} options Legend dependencies.
   * @param {object} options.api Graph public API instance.
   * @param {HTMLElement} options.container Element to render the legend into.
   * @param {Function} options.onEdit Called to open the legend editor for record-type styling.
   * @param {Function} options.onLinks Called to open the initial-links editor.
   * @param {Function} options.onRule Called to open the expansion-rules editor.
   * @param {Function} options.onError Called with `(error, operation)` when an action fails.
   */
  constructor({ api, container, onEdit, onLinks, onRule, onError }) {
    Object.assign(this, { api, container, onEdit, onLinks, onRule, onError });
    this.open = new Set();
  }

  /**
   * Render the record-types, links/relations, and expansion-rules sections from the current legend model.
   *
   * @param {{editEnabled?: boolean}} [options] Pass `editEnabled: true` to show edit affordances.
   * @returns {void}
   */
  render({ editEnabled = false } = {}) {
    const model = this.api.getLegend?.() || { recordTypes: [], links: [], rules: [] };
    const focusKey = this.container.contains(document.activeElement) ? document.activeElement?.dataset?.legendKey : null;
    this.container.replaceChildren();
    this.container.append(element('h4', $HR('Nodes (Record types)')));
    const nodesSection = element('section', null, 'heurist-graph-legend-items');
    this.container.append(nodesSection);
    const count = model.recordTypes.reduce((sum, row) => sum + row.count, 0);
    if (model.total != null && model.total > count) {
      nodesSection.append(element('p', model.offset ? `${$HR('Loaded')} ${count} ${$HR('of')} ${model.total}` : `${$HR('First')} ${count} ${$HR('of')} ${model.total}`, 'heurist-graph-legend-note'));
    }
    for (const row of model.recordTypes) {
      const item = this.checkbox(row.label || `Record type ${row.recordTypeId}`, row.count, row.visible, false, `node:${row.recordTypeId}`, value => this.api.setRecordTypeVisibility(row.recordTypeId, value));
      if (row.color) {
        const swatch = element('span', null, 'heurist-graph-legend-color');
        swatch.style.backgroundColor = row.color;
        swatch.setAttribute('aria-hidden', 'true');
        item.insertBefore(swatch, item.lastChild);
      }
      nodesSection.append(item);
    }
    if (!model.recordTypes.length) nodesSection.append(element('p', $HR('No records')));
    const edgesHeading = element('h4', $HR('Edges (Links and Relations)'));
    if (editEnabled) edgesHeading.append(this.action('Define initial links', 'fa-link', this.onLinks));
    this.container.append(edgesHeading);
    const edgesSection = element('section', null, 'heurist-graph-legend-items');
    this.container.append(edgesSection);
    const edgeCount = model.links.reduce((sum, row) => sum + row.count, 0);
    if (model.limits?.edgesTruncated) edgesSection.append(element('p', `${$HR('First')} ${edgeCount}${model.limits.edgesTotal != null ? ` ${$HR('of')} ${model.limits.edgesTotal}` : ` — ${$HR('edge limit reached')}`}`, 'heurist-graph-legend-note'));
    else if (model.limits?.truncated) edgesSection.append(element('p', $HR('Graph is truncated; only links between loaded records are shown.'), 'heurist-graph-legend-note'));
    const relationshipGroups = model.links.filter(group => group.relationships?.length);
    for (const group of model.links.filter(group => !group.relationships?.length)) {
      const endpoints = group.endpoints || [];
      const endpointSummary = endpoints.slice(0, 4).join(', ') + (endpoints.length > 4 ? ', …' : '');
      const label = `${group.label || group.spec || group.key}${endpoints.length ? ` (${endpointSummary})` : ''}`;
      const hiddenCount = (group.relationships || []).filter(entry => !entry.visible).reduce((sum, entry) => sum + entry.count, 0);
      const row = this.checkbox(label, group.count, group.visible && hiddenCount < group.count, group.visible && hiddenCount > 0 && hiddenCount < group.count, group.key, value => this.api.setLinkVisibility(group.key, value));
      edgesSection.append(row);
    }
    // Relationship groups describe edge provenance, not hierarchy roots.
    // Render their observed types together once under each vocabulary.
    const forest = relationForest({ relationships: relationshipGroups.flatMap(group => group.relationships) }, model.relationTypeTrees);
    for (const tree of forest) edgesSection.append(this.term(relationshipGroups, tree));
    if (!model.links.length) edgesSection.append(element('p', $HR('No links')));
    const rulesHeading = element('h4', $HR('Expansion Rules'));
    if (editEnabled) {
      const actions = element('span', null, 'heurist-graph-legend-rule-actions');
      if (this.api.getState?.().datasetId) actions.append(this.action('Reset: Use saved expansion rules', 'fa-rotate-left', () => this.api.resetExpansionRules()));
      actions.append(this.action('Define expansions', 'fa-pen', this.onRule));
      rulesHeading.append(actions);
    }
    this.container.append(rulesHeading);
    for (const [index, rule] of (model.rules || []).entries()) {
      const row = this.checkbox(rule.name || rule.title || `${$HR('Rule')} ${index + 1}`, null,
        !!rule.enabled, false, `rule:${rule.id}`, value => this.api.setRuleEnabled(rule.id, value));
      row.querySelector('input').disabled = !!this.api.getExpansionState?.().busy && !rule.enabled;
      row.title = rule.description || '';
      this.container.append(row);
    }
    if (!model.rules?.length) this.container.append(element('p', $HR('No expansion rules')));
    if (focusKey) [...this.container.querySelectorAll('input')].find(input => input.dataset.legendKey === focusKey)?.focus();
  }

  /**
   * Render one relationship-type tree node as a checkbox row, recursing into a collapsible branch when it has children.
   *
   * @param {Array<object>} groups Link groups carrying relationship entries.
   * @param {object} node Relationship-type tree node (`{id, label, children}`).
   * @returns {HTMLElement}
   */
  term(groups, node) {
    const ids = descendants(node);
    const entries = groups.flatMap(group => (group.relationships || [])
      .filter(entry => ids.includes(entry.id))
      .map(entry => ({ ...entry, group, visible: group.visible && entry.visible })));
    const visible = entries.filter(entry => entry.visible).length;
    const row = this.checkbox(node.label, entries.reduce((sum, entry) => sum + entry.count, 0),
      visible > 0, visible > 0 && visible < entries.length, `relation:term:${node.id}`, async value => {
        for (const group of groups) {
          const termIds = group.relationships.filter(entry => ids.includes(entry.id)).map(entry => entry.id);
          if (!termIds.length) continue;
          // Preserve each link's filter scope while operating on the shared tree.
          if (value && !group.visible) {
            const otherIds = group.relationships.filter(entry => !termIds.includes(entry.id)).map(entry => entry.id);
            if (otherIds.length) await this.api.setRelationshipVisibility(group.key, otherIds, false);
            await this.api.setLinkVisibility(group.key, true);
          }
          await this.api.setRelationshipVisibility(group.key, termIds, value);
        }
      });
    row.querySelector('input').disabled = !entries.length;
    if (!node.children?.length) row.className += ' heurist-graph-legend-leaf';
    return node.children?.length ? this.branch(`relation:tree:${node.id}`, row, node.children.map(child => this.term(groups, child))) : row;
  }

  /**
   * Wrap a row with a collapsible toggle and its child rows.
   *
   * @param {string} key Unique open/closed state key.
   * @param {HTMLElement} row The branch's own checkbox row.
   * @param {Array<HTMLElement>} children Child row/branch elements.
   * @returns {HTMLElement}
   */
  branch(key, row, children) {
    const branch = element('div', null, 'heurist-graph-legend-branch');
    const header = element('div', null, 'heurist-graph-legend-branch-header');
    const toggle = element('button', this.open.has(key) ? '▾' : '▸', 'heurist-icon-button');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', `${$HR('Expand or collapse')} ${row.textContent}`);
    toggle.setAttribute('aria-expanded', String(this.open.has(key)));
    const content = element('div', null, 'heurist-graph-legend-children');
    content.hidden = !this.open.has(key);
    content.append(...children);
    toggle.addEventListener('click', () => {
      content.hidden = !content.hidden;
      content.hidden ? this.open.delete(key) : this.open.add(key);
      toggle.textContent = content.hidden ? '▸' : '▾';
      toggle.setAttribute('aria-expanded', String(!content.hidden));
    });
    header.append(toggle, row); branch.append(header, content);
    return branch;
  }

  /**
   * Build a labeled checkbox row with an optional count suffix.
   *
   * @param {string} label Row label.
   * @param {number|null} count Count to append in parentheses; omitted when `null`.
   * @param {boolean} checked Initial checked state.
   * @param {boolean} mixed Initial indeterminate state.
   * @param {string} key Unique key stored on the checkbox for focus restoration.
   * @param {function(boolean): (void|Promise<void>)} handler Called with the new checked state.
   * @returns {HTMLElement}
   */
  checkbox(label, count, checked, mixed, key, handler) {
    const row = element('label', null, 'heurist-graph-legend-row');
    const input = element('input');
    input.type = 'checkbox'; input.classList.add("h-checkbox"); input.checked = checked; input.indeterminate = mixed;
    input.dataset.legendKey = key;
    input.addEventListener('click', event => event.stopPropagation());
    input.addEventListener('change', () => this.run(() => handler(input.checked)));
    row.append(input, element('span', count == null ? label : `${label} (${count})`));
    return row;
  }

  /**
   * Build a small icon-only action button.
   *
   * @param {string} title Localized tooltip/aria-label text.
   * @param {string} icon FontAwesome solid icon suffix (e.g. `'fa-pen'`).
   * @param {Function} handler Click handler, run through `run` for error reporting.
   * @returns {HTMLElement}
   */
  action(title, icon, handler) {
    const button = element('button', null, 'heurist-icon-button');
    button.type = 'button'; button.title = $HR(title); button.setAttribute('aria-label', $HR(title));
    const glyph = element('span', null, `fa-solid ${icon}`);
    glyph.setAttribute('aria-hidden', 'true'); button.append(glyph);
    button.addEventListener('click', () => this.run(handler));
    return button;
  }

  /**
   * Run a handler, reporting any rejection through `onError`.
   *
   * @param {Function} handler Handler to run.
   * @returns {void}
   */
  run(handler) { Promise.resolve().then(handler).catch(error => this.onError?.(error, 'legend')); }
}

/** Create an element, optionally with text content and a class name. */
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** Collect a relationship-type tree node's id and every descendant id. */
function descendants(node) { return [Number(node.id), ...(node.children || []).flatMap(descendants)]; }

/**
 * Retain a single copy of each observed branch, including its vocabulary ancestors.
 *
 * @param {{relationships?: Array<{id: number}>}} group Observed relationship entries.
 * @param {object} trees Relation-type trees keyed by root id.
 * @returns {Array<object>} Pruned forest roots covering every observed relationship type.
 */
export function relationForest(group, trees = {}) {
  const ids = new Set((group.relationships || []).map(row => row.id));
  const prune = (node, seen = new Set()) => {
    if (seen.has(Number(node.id))) return null;
    const next = new Set([...seen, Number(node.id)]);
    const children = (node.children || []).map(child => prune(child, next)).filter(Boolean);
    return ids.has(Number(node.id)) || children.length ? { ...node, children } : null;
  };
  const candidates = Object.values(trees).map(node => prune(node)).filter(Boolean);
  const childIds = new Set(candidates.flatMap(node => (node.children || []).flatMap(descendants)));
  const roots = candidates.filter(node => !childIds.has(Number(node.id)));
  const covered = new Set(roots.flatMap(descendants));
  for (const id of ids) if (!covered.has(id)) roots.push({ id, label: `Relation ${id}`, children: [] });
  return roots;
}
