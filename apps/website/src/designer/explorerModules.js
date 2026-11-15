/**
 * @file explorerModules.js
 * @brief The modules of an Explorer instance as child items of its node in the part tree (review 2026-11-14): the
 *        presentation modules placed in a pane of its layout, each configured inline (its settings in the instance:
 *        `settings.modules[type]` and the items of `settings.layout`). No delete, no drag.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Presentation modules of Explorer: label and icon (as the chips of its Layout), in the order of its default layout. */
export const EXPLORER_MODULES = Object.freeze({
  data: { label: 'Result', icon: 'fa-table' },
  map: { label: 'Map', icon: 'fa-map-location-dot' },
  graph: { label: 'Graph', icon: 'fa-hexagon-nodes' },
  timeline: { label: 'Timeline', icon: 'fa-clock' },
  recordview: { label: 'Record View', icon: 'fa-address-card' }
});

/** Panes of the Explorer layout. */
const PANES = ['north', 'west', 'center', 'east', 'south'];

/** Separator of a child item id: `<node id>/module:<type>` (node ids have no slash). */
const SEPARATOR = '/module:';

/**
 * @param {string} nodeId Node of the Explorer instance.
 * @param {string} type Module type.
 * @returns {string} Id of the child item.
 */
export function moduleItemId(nodeId, type) {
  return `${nodeId}${SEPARATOR}${type}`;
}

/**
 * @param {string} id Tree item id.
 * @returns {{node: string, type: string}|null} The Explorer node and the module type of a child item, else null.
 */
export function parseModuleItemId(id) {
  const text = String(id ?? '');
  const at = text.indexOf(SEPARATOR);
  if (at < 1) return null;
  const type = text.slice(at + SEPARATOR.length);
  return Object.hasOwn(EXPLORER_MODULES, type) ? { node: text.slice(0, at), type } : null;
}

/**
 * The modules of an Explorer instance shown in its page: the presentation modules placed in a pane (`ui.regions`), in
 * the order of the layout; without a layout configuration the modules of `settings.layout`.
 *
 * @param {object|null} settings `instance.settings`.
 * @returns {string[]} Module types.
 */
export function explorerModuleTypes(settings) {
  const types = Object.keys(EXPLORER_MODULES);
  const regions = settings?.ui?.regions;
  if (regions && typeof regions === 'object') {
    const order = [...new Set([...(Array.isArray(settings.ui.order) ? settings.ui.order : []), ...types])];
    return order.filter((type) => types.includes(type) && PANES.includes(regions[type]));
  }
  const listed = (Array.isArray(settings?.layout) ? settings.layout : []).map((item) => item?.type);
  // an Explorer added before its settings: the modules of the default layout (review 2026-11-15)
  if (!listed.length) return [...types];
  return [...new Set(listed)].filter((type) => types.includes(type));
}

/**
 * The settings of a module of the instance: `settings.modules[type]`, else the settings of its layout item.
 *
 * @param {object|null} settings `instance.settings`.
 * @param {string} type Module type.
 * @returns {object|null}
 */
export function explorerModuleSettings(settings, type) {
  const own = settings?.modules?.[type];
  if (own && typeof own === 'object' && Object.keys(own).length) return clone(own);
  const item = (Array.isArray(settings?.layout) ? settings.layout : []).find((entry) => entry?.type === type && entry.settings);
  return item ? clone(item.settings) : null;
}

/**
 * The instance settings with new settings of one module: in `modules` and in its layout items (they win over
 * `modules` when the page makes the module).
 *
 * @param {object} settings `instance.settings` (not changed).
 * @param {string} type Module type.
 * @param {object} value New module settings.
 * @returns {object} New settings.
 */
export function withExplorerModuleSettings(settings, type, value) {
  const next = clone(settings || {});
  next.modules = { ...(next.modules || {}), [type]: clone(value) };
  if (Array.isArray(next.layout)) {
    next.layout = next.layout.map((item) => (item?.type === type ? { ...item, settings: clone(value) } : item));
  }
  return next;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
