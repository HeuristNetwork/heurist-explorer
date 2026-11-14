/**
 * @file explorerLayoutEditor.js
 * @brief The Layout of Explorer (the 5-pane cardinal grid with drag-and-drop module chips and the Unused bucket):
 *        in the Explorer configuration dialog with every module, and in the configuration of an Explorer instance of a
 *        website page with the presentation modules only (no tools, 2026-11-14).
 *
 *   const editor = createLayoutEditor(host, { value: { regions, order, panes }, types: PRESENTATION_TYPES });
 *   editor.getValue(); // {regions, order, panes}
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
import { ExplorerUiConfig, MODULE_TYPES, UNUSED_REGION } from '../../core/ExplorerUiConfig.js';
import './ExplorerConfigurationDialog.css';

/** Cardinal regions, in reading order for the pane grid. */
export const LAYOUT_REGIONS = Object.freeze([
  { id: 'north', label: 'North' },
  { id: 'west', label: 'West' },
  { id: 'center', label: 'Center' },
  { id: 'east', label: 'East' },
  { id: 'south', label: 'South' }
]);

/** The bucket for modules not shown at all (no checkbox). */
const UNUSED = { id: UNUSED_REGION, label: 'Unused' };

/** Module types (presentations and tools), with the same icon/title used on the right rail. */
export const LAYOUT_MODULES = Object.freeze([
  { type: 'data', icon: 'fa-solid fa-table', title: 'Result' },
  { type: 'map', icon: 'fa-solid fa-map-location-dot', title: 'Map' },
  { type: 'graph', icon: 'fa-solid fa-hexagon-nodes', title: 'Graph' },
  { type: 'timeline', icon: 'fa-regular fa-clock', title: 'Timeline' },
  { type: 'recordview', icon: 'fa-regular fa-address-card', title: 'Record View' },
  // tools are placed in panes like the presentations (2026-10-14)
  { type: 'report', icon: 'fa-regular fa-file', title: 'Report' },
  { type: 'crosstabs', icon: 'fa-solid fa-chart-column', title: 'Crosstabs' },
  { type: 'actions', icon: 'fa-solid fa-bolt', title: 'Actions' },
  { type: 'export', icon: 'fa-solid fa-file-export', title: 'Export' }
]);

/** Result always has a pane: a DataSource is shown there (and so not everything is unused). */
const ALWAYS_USED = new Set(['data']);

/**
 * The Layout editor in a host. The value is changed in place (the configuration dialog keeps it in its value).
 *
 * @param {HTMLElement} host Section body.
 * @param {object} options
 * @param {{regions: object, order: string[], panes: object}} options.value Layout; changed by the editor.
 * @param {string[]} [options.types] Module types offered (default: all, tools included).
 * @param {() => void} [options.onChange] Called after a change.
 * @returns {{getValue: () => {regions: object, order: string[], panes: object}, reset: () => void, destroy: () => void}}
 */
export function createLayoutEditor(host, { value, types = MODULE_TYPES, onChange = null } = {}) {
  const modules = LAYOUT_MODULES.filter((module) => types.includes(module.type));
  const chips = new Map();
  const paneLists = new Map();
  const paneChecks = new Map();
  let dragType = null;
  const changed = () => onChange?.();

  const markDropTarget = (target) => {
    for (const chip of chips.values()) {
      chip.classList.toggle('h-drop-before', target?.chip === chip && !target.after);
      chip.classList.toggle('h-drop-after', target?.chip === chip && target.after);
    }
  };

  // the module order from the chips, pane by pane; the types not offered keep their place at the end
  const readOrder = () => {
    const order = [];
    for (const list of paneLists.values()) {
      for (const chip of list.querySelectorAll('.h-explorer-config-chip')) order.push(chip.dataset.module);
    }
    value.order = [...order, ...(value.order || []).filter((type) => !order.includes(type))];
  };

  const buildPane = (region) => {
    const unused = region.id === UNUSED_REGION;
    const pane = el('div', `h-explorer-config-pane h-explorer-config-pane-${region.id}`);
    const head = el('div', 'h-explorer-config-pane-head');
    const label = el('div', 'h-explorer-config-pane-label h-i18n');
    label.textContent = region.label;
    head.append(label);
    // checked: the pane is expanded when Explorer starts, otherwise it starts hidden
    if (!unused) {
      const expanded = el('input', 'h-checkbox h-explorer-config-pane-expanded');
      expanded.type = 'checkbox';
      expanded.checked = value.panes?.[region.id] === true;
      expanded.title = $HR('Expanded when Explorer starts');
      expanded.setAttribute('aria-label', `${$HR(region.label)}: ${expanded.title}`);
      expanded.addEventListener('change', () => {
        value.panes = { ...(value.panes || {}), [region.id]: expanded.checked };
        changed();
      });
      paneChecks.set(region.id, expanded);
      head.append(expanded);
    }
    const list = el('div', 'h-explorer-config-pane-list');
    list.dataset.region = region.id;
    if (unused) list.title = $HR('Modules not shown. Result always has a pane.');
    // Result can not be unused (the drag type is unreadable during dragover, so it is kept)
    const refused = () => unused && ALWAYS_USED.has(dragType);

    list.addEventListener('dragover', (event) => {
      if (refused()) {
        list.classList.add('h-drop-refused');
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      list.classList.add('h-drag-over');
      markDropTarget(dropPosition(event));
    });
    list.addEventListener('dragleave', (event) => {
      if (list.contains(event.relatedTarget)) return;
      list.classList.remove('h-drag-over', 'h-drop-refused');
      markDropTarget(null);
    });
    list.addEventListener('drop', (event) => {
      event.preventDefault();
      list.classList.remove('h-drag-over', 'h-drop-refused');
      markDropTarget(null);
      const moduleType = event.dataTransfer.getData('text/plain');
      const chip = chips.get(moduleType);
      if (!chip || (unused && ALWAYS_USED.has(moduleType))) return;
      // dropped on another chip: placed before or after it; otherwise last in the pane
      const target = dropPosition(event);
      if (target && target.chip !== chip) target.chip[target.after ? 'after' : 'before'](chip);
      else if (!target) list.append(chip);
      value.regions = { ...(value.regions || {}), [moduleType]: region.id };
      readOrder();
      changed();
    });

    pane.append(head, list);
    paneLists.set(region.id, list);
    return pane;
  };

  const buildChip = (module) => {
    const chip = el('div', 'h-explorer-config-chip');
    chip.draggable = true;
    chip.dataset.module = module.type;
    chip.title = $HR(module.title);
    const icon = el('span', module.icon);
    icon.setAttribute('aria-hidden', 'true');
    const label = el('span', 'h-i18n');
    label.textContent = module.title;
    chip.append(icon, label);
    chip.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', module.type);
      event.dataTransfer.effectAllowed = 'move';
      chip.classList.add('h-dragging');
      dragType = module.type;
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('h-dragging');
      markDropTarget(null);
      dragType = null;
      for (const list of paneLists.values()) list.classList.remove('h-drop-refused');
    });
    return chip;
  };

  // every module chip in its pane, in the configured order
  const placeChips = () => {
    const order = [...(value.order || []), ...modules.map((module) => module.type)];
    for (const type of [...new Set(order)]) {
      const chip = chips.get(type);
      if (chip) paneLists.get(value.regions?.[type] || UNUSED_REGION)?.append(chip);
    }
  };

  const hint = el('p', 'h-explorer-config-hint h-i18n');
  hint.textContent = 'Drag a module into a pane, or within a pane to change its order. Checked panes are expanded when Explorer starts and show their first module. Modules in Unused are not shown.';
  host.append(hint);
  const cardinal = el('div', 'h-explorer-config-cardinal');
  for (const region of LAYOUT_REGIONS) cardinal.append(buildPane(region));
  host.append(cardinal, buildPane(UNUSED));
  for (const module of modules) chips.set(module.type, buildChip(module));
  placeChips();

  const editor = {
    getValue: () => ({ regions: { ...(value.regions || {}) }, order: [...(value.order || [])], panes: { ...(value.panes || {}) } }),
    /** The pane assignments and expanded panes of the built-in defaults (not saved). */
    reset: () => {
      const defaults = ExplorerUiConfig.defaults();
      value.regions = { ...defaults.regions };
      value.order = [...defaults.order];
      placeChips();
      value.panes = { ...defaults.panes };
      for (const [region, expanded] of Object.entries(defaults.panes)) {
        const check = paneChecks.get(region);
        if (check) check.checked = expanded;
      }
      changed();
    },
    destroy: () => {
      chips.clear();
      paneLists.clear();
      paneChecks.clear();
    }
  };
  const reset = el('button', 'h-btn h-i18n h-explorer-config-reset');
  reset.type = 'button';
  reset.textContent = 'Reset';
  reset.title = $HR('Restore the default layout');
  reset.addEventListener('click', () => editor.reset());
  host.append(reset);
  return editor;
}

/**
 * The chip a drag is over, and whether the drop goes after it (pointer past its
 * horizontal middle).
 */
function dropPosition(event) {
  const chip = event.target?.closest?.('.h-explorer-config-chip');
  if (!chip) return null;
  const box = chip.getBoundingClientRect();
  return { chip, after: event.clientX > box.left + box.width / 2 };
}

function el(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
