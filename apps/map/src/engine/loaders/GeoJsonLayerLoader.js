/**
 * GeoJsonLayerLoader.js - Heurist GeoJSON layer loader
 *
 * @fileOverview Loads query, record, or inline GeoJSON sources and produces normalized engine-neutral runtime layers.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import { normalizeGeoJson } from '../../utils/normalizeGeoJson.js';
import { detectGeometryTypes } from '../../utils/geometryTypes.js';
import {
  applyThematicAttributes,
  collectThematicRecordIds,
  getAllThematicFieldCodes
} from '../../thematic/thematicAttributes.js';

/**
 * Loads Heurist query, record, and inline GeoJSON MapLayers.
 */
export class GeoJsonLayerLoader {
  /**
   * Create and initialize the class instance.
   */
  constructor({ queryGeoData, thematicAttributes = null }) {
    this.queryGeoData = queryGeoData;
    this.thematicAttributes = thematicAttributes;
  }

  /**
   * Load a MapLayer using the loader registered for its source type.
   * @returns {Promise<*>} Resolves when the operation completes.
   */
  async load(mapLayer, context) {
    const source = mapLayer.source;
    let geoJson;

    switch (source.type) {
      case 'heurist-query':
        // The host wrapper has already reduced old/new search responses to an
        // effective query. This loader owns only map execution: /map paging,
        // the configured feature ceiling, and optional viewport extent.
        geoJson = await this.queryGeoData.searchAll({
          query: source.query,
          extent: context.viewport,
          limit: source.limit || mapLayer.options?.maxAllowedFeatures || 1000,
          maxFeatures: source.limit || mapLayer.options?.maxAllowedFeatures || 1000,
          simplify: source.simplify === true,
          geoFields: source.geoFields,
          geoOutputMode: source.geoOutputMode,
          signal: context.signal
        });
        break;
      case 'record':
        geoJson = await this.queryGeoData.getRecord(source.recordId, {
          simplify: source.simplify === true,
          geoFields: source.geoFields,
          geoOutputMode: source.geoOutputMode,
          signal: context.signal
        });
        break;
      case 'inline-geojson':
        geoJson = source.data;
        break;
      default:
        throw new Error(`Unsupported GeoJSON source type "${source.type}"`);
    }

    const id = context.reference.id ?? `map-layer-${context.reference.recordId}`;
    const normalizedGeoJson = normalizeGeoJson(geoJson, {
      layerId: id,
      sourceType: mapLayer.source.type
    });

    if (source.type === 'heurist-query' || source.type === 'record') {
      await this.enrichThematicAttributes(mapLayer, normalizedGeoJson, context);
    }

    return createGeoJsonRuntimeLayer(mapLayer, context, normalizedGeoJson, { normalized: true });
  }

  /** Load thematic attributes without making geometry loading depend on enrichment success. */
  async enrichThematicAttributes(mapLayer, geoJson, context) {
    const fieldCodes = getAllThematicFieldCodes(mapLayer.style);
    const recordIds = collectThematicRecordIds(geoJson);
    if (!fieldCodes.length || !recordIds.length || !this.thematicAttributes) return geoJson;

    try {
      const response = await this.thematicAttributes.load({
        recordIds,
        fieldCodes,
        signal: context.signal
      });
      applyThematicAttributes(geoJson, response);
    } catch (error) {
      if (isAbortError(error) || context.signal?.aborted) throw error;
      const message = `Thematic attributes could not be loaded for layer \"${mapLayer.title || context.reference.id}\"`;
      console.warn(message, error);
      context.application?.dispatch?.('heurist-map-warning', {
        code: 'thematic-attributes-unavailable',
        message,
        layerId: context.reference.id ?? null,
        error: serializeError(error)
      });
    }
    return geoJson;
  }
}

/**
 * Create geo json runtime layer.
 *
 * @returns {*} Function result.
 */
export function createGeoJsonRuntimeLayer(mapLayer, context, geoJson, { normalized = false } = {}) {
  const id = context.reference.id ?? `map-layer-${context.reference.recordId}`;
  return {
    id,
    recordId: mapLayer.id,
    title: mapLayer.title,
    description: mapLayer.description,
    type: 'geojson',
    visible: mapLayer.visible !== false,
    visibilityMinZoom: mapLayer.options?.effectiveMinZoom ?? mapLayer.options?.minZoom,
    visibilityMaxZoom: mapLayer.options?.effectiveMaxZoom ?? mapLayer.options?.maxZoom,
    selectable: mapLayer.selectable !== false,
    data: normalized
      ? geoJson
      : normalizeGeoJson(geoJson, { layerId: id, sourceType: mapLayer.source.type }),
    resultMeta: normalizeResultMeta(geoJson?.meta),
    geometryTypes: detectGeometryTypes(geoJson),
    recordTypeIds: collectRecordTypeIds(geoJson),
    iconContext: createIconContext(context.application?.config),
    style: mapLayer.style,
    popup: normalizePopup(mapLayer.options?.popup, mapLayer.options?.popupTemplate),
    options: mapLayer.options,
    source: mapLayer.source,
    order: context.reference.order ?? 0
  };
}

function normalizePopup(value, template = null) {
  if (value === false) {
    return { enabled: false };
  }
  const popup = value && typeof value === 'object' ? value : {};
  return {
    enabled: popup.enabled !== false,
    titleField: popup.titleField || null,
    fields: Array.isArray(popup.fields) ? [...popup.fields] : [],
    showRecordId: popup.showRecordId !== false,
    template: typeof template === 'string' && template.trim() ? template : null
  };
}

function normalizeResultMeta(value) {
  if (!value || typeof value !== 'object') return null;
  const numberOrNull = (item) => {
    const number = Number(item);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  return {
    totalRecords: numberOrNull(value.totalRecords ?? value.total),
    returnedRecords: numberOrNull(value.returnedRecords),
    returnedFeatures: numberOrNull(value.returnedFeatures),
    offset: numberOrNull(value.offset) ?? 0,
    limit: numberOrNull(value.limit),
    isPartial: value.isPartial === true
  };
}


function isAbortError(error) {
  return error?.name === 'AbortError';
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error || 'Unknown error')
  };
}


/** @deprecated Viewports are now sent to /map as the separate extent parameter. */
export function addViewportToQuery(query, bounds) {
  void bounds;
  return query;
}

function collectRecordTypeIds(geoJson) {
  const ids = new Set();
  for (const feature of geoJson?.features || []) {
    const value = feature?.properties?.heurist?.recordTypeId ?? feature?.properties?.rec_RecTypeID;
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

function createIconContext(config = {}) {
  const apiBaseUrl = String(config?.apiBaseUrl || '').replace(/\/+$/, '');
  if (!apiBaseUrl || !config?.database) return null;
  const baseUrl = apiBaseUrl.replace(/\/api$/i, '') + '/';
  return { baseUrl, database: String(config.database) };
}
