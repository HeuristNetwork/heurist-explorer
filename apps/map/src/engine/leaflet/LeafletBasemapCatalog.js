/**
 * LeafletBasemapCatalog.js - Leaflet provider discovery and layer creation.
 *
 * leaflet-providers.js remains third-party code. This module only adapts its
 * provider catalogue to the engine-neutral descriptors used by heurist-map.
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
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

function addProvider(items, seen, id) {
  if (!id || seen.has(id)) return;
  seen.add(id);
  items.push({ id, title: id, type: 'tile', provider: id });
}

function providerOptionsFor(definition, providerOptions) {
  const providerId = String(definition.provider || definition.id || '');
  const family = providerId.split('.')[0];
  return {
    ...(providerOptions?.[family] || {}),
    ...(providerOptions?.[providerId] || {})
  };
}

function compactOptions(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null));
}
