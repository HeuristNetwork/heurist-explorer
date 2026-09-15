/**
 * @file LeafletBasemapCatalog.js
 * @brief Leaflet provider discovery and layer creation.
 *
 * leaflet-providers.js remains third-party code. This module only adapts its
 * provider catalogue to the engine-neutral descriptors used by heurist-map.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import L from 'leaflet';
import { getDefaultBaseMaps } from '../../basemaps/defaultBasemaps.js';

/** Return the full Leaflet provider catalogue as normalized base-map descriptors. */
export function getLeafletBaseMapCatalog() {
  const providers = L.TileLayer?.Provider?.providers || {};
  const items = [];
  const seen = new Set();

  for (const [providerName, provider] of Object.entries(providers)) {
    addProvider(items, seen, providerName);
    for (const variantName of Object.keys(provider?.variants || {})) {
      addProvider(items, seen, `${providerName}.${variantName}`);
    }
  }

  // Heurist custom/default entries are also valid selectable base maps even
  // though they do not belong to the third-party Leaflet provider catalogue.
  for (const item of getDefaultBaseMaps()) {
    if (seen.has(String(item.id))) continue;
    seen.add(String(item.id));
    items.push(item);
  }

  return items;
}

/** Create a native Leaflet base layer from one normalized definition. */
export function createLeafletBaseMapLayer(definition, providerOptions = {}) {
  if (!definition || definition.type === 'none') return null;

  const options = compactOptions({
    ...providerOptionsFor(definition, providerOptions),
    ...(definition.options || {}),
    attribution: definition.attribution,
    minZoom: definition.minZoom,
    maxZoom: definition.maxZoom,
    subdomains: definition.subdomains,
    tms: definition.tms,
    noWrap: definition.noWrap
  });

  if (definition.url) return L.tileLayer(definition.url, options);

  const providerId = String(definition.provider || definition.id || '').trim();
  if (!providerId || typeof L.tileLayer?.provider !== 'function') {
    throw new Error(`Leaflet base-map provider "${providerId || definition.id}" is unavailable`);
  }
  return L.tileLayer.provider(providerId, options);
}

/** Add one provider id as a normalized base-map descriptor, skipping duplicates. */
function addProvider(items, seen, id) {
  if (!id || seen.has(id)) return;
  seen.add(id);
  items.push({ id, title: id, type: 'tile', provider: id });
}

/** Merge configured provider options for a base map's family (e.g. `Esri`) and specific id. */
function providerOptionsFor(definition, providerOptions) {
  const providerId = String(definition.provider || definition.id || '');
  const family = providerId.split('.')[0];
  return {
    ...(providerOptions?.[family] || {}),
    ...(providerOptions?.[providerId] || {})
  };
}

/** Return a shallow copy of an object with `null`/`undefined`-valued keys removed. */
function compactOptions(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null));
}
