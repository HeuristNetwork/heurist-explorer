/**
 * @file LegendRenderer.js
 * @brief Visual legend for layer and thematic symbology.
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

import { $HR } from '#shared/ui';

import { mergeThematicSymbol } from '../../thematic/thematicSymbolResolver.js';
import { hexToCssFilter } from '../../utils/hexToCssFilter.js';

/**
 * Create a compact geometry-neutral preview for configuration forms.
 *
 * @param {object} [symbol] Symbol definition to preview.
 * @returns {HTMLElement} The preview element.
 */
export function createSymbolPreview(symbol = {}) {
  const preview = document.createElement('span');
  preview.className = 'heurist-map-symbol-preview';
  appendGeometrySamples(preview, symbol || {}, { point: true, line: true, polygon: true });
  return preview;
}

/**
 * Create the legend for the currently selected layer symbology.
 *
 * @param {object} layer Normalized runtime layer.
 * @returns {HTMLElement|null} The legend element, or `null` when the layer is not loaded.
 */
export function createLayerLegend(layer) {
  if (layer?.loadState !== 'loaded') return null;

  const style = layer?.style || {};
  const thematic = Array.isArray(style.thematic) ? style.thematic : [];
  const activeTheme = thematic.find((theme) => theme?.active === true) || null;
  const geometryTypes = normalizeGeometryTypes(layer?.geometryTypes);

  const legend = document.createElement('div');
  legend.className = 'heurist-map-layer-legend';

  if (!activeTheme) {
    legend.append(createLegendRow({
      label: thematic.length ? $HR('Default') : '',
      symbol: style.symbol || {},
      geometryTypes,
      iconContext: layer?.iconContext,
      recordTypeId: firstRecordTypeId(layer)
    }));
    return legend;
  }

  const fields = Array.isArray(activeTheme.fields) ? activeTheme.fields : [];
  for (const field of fields) {
    const ranges = Array.isArray(field?.ranges) ? field.ranges : [];
    if (!ranges.length) continue;

    const section = document.createElement('div');
    section.className = 'heurist-map-legend-field';

    const heading = document.createElement('div');
    heading.className = 'heurist-map-legend-field-title';
    heading.textContent = field?.title || field?.code || $HR('Values');
    section.append(heading);

    for (const range of ranges) {
      section.append(createLegendRow({
        label: getRangeLabel(range),
        symbol: mergeThematicSymbol(activeTheme.symbol || {}, range?.symbol || {}),
        geometryTypes,
        iconContext: layer?.iconContext,
        recordTypeId: firstRecordTypeId(layer)
      }));
    }
    legend.append(section);
  }

  // A thematic definition without ranges is still represented by its base symbol.
  if (!legend.childElementCount) {
    legend.append(createLegendRow({
      label: activeTheme.title || 'Theme',
      symbol: activeTheme.symbol || style.symbol || {},
      geometryTypes,
      iconContext: layer?.iconContext,
      recordTypeId: firstRecordTypeId(layer)
    }));
  }
  return legend;
}

/**
 * Build one legend row (geometry sample plus label).
 *
 * @param {object} options
 * @param {string} options.label Row label.
 * @param {object} options.symbol Resolved symbol for the row.
 * @param {{point: boolean, line: boolean, polygon: boolean}} options.geometryTypes Geometry families present in the layer.
 * @param {object} [options.iconContext] Record-type icon resolution context.
 * @param {number|null} [options.recordTypeId] Record type id used for record-type icon symbols.
 * @returns {HTMLElement} The row element.
 */
function createLegendRow({ label, symbol, geometryTypes, iconContext = null, recordTypeId = null }) {
  const row = document.createElement('div');
  row.className = 'heurist-map-legend-row';

  const samples = document.createElement('span');
  samples.className = 'heurist-map-legend-samples';
  appendGeometrySamples(samples, symbol, geometryTypes, { iconContext, recordTypeId });

  const text = document.createElement('span');
  text.className = 'heurist-map-legend-label';
  text.textContent = label;
  text.title = label;

  row.append(samples);
  if (label) row.append(text);
  return row;
}

/**
 * Append one geometry sample per geometry family present in the layer.
 *
 * @param {HTMLElement} container Element the samples are appended to.
 * @param {object} symbol Resolved symbol.
 * @param {{point: boolean, line: boolean, polygon: boolean}} geometryTypes Geometry families to render.
 * @param {object} [context] Extra context (`iconContext`, `recordTypeId`) for point samples.
 * @returns {void}
 */
function appendGeometrySamples(container, symbol, geometryTypes, context = {}) {
  const known = geometryTypes.point || geometryTypes.line || geometryTypes.polygon;
  // Loaded-but-empty GeoJSON has no geometry family to infer. Use a marker as
  // a compact generic fallback rather than drawing all three representations.
  const types = known ? geometryTypes : { point: true, line: false, polygon: false };

  if (types.point) container.append(createPointSample(symbol, context));
  if (types.line) container.append(createLineSample(symbol));
  if (types.polygon) container.append(createPolygonSample(symbol));
}

/**
 * Build a point-geometry legend sample (icon font, image marker, or plain circle).
 *
 * @param {object} symbol Resolved symbol.
 * @param {{iconContext?: object|null, recordTypeId?: number|null}} [options]
 * @returns {HTMLElement} The sample element.
 */
function createPointSample(symbol, { iconContext = null, recordTypeId = null } = {}) {
  const wrapper = document.createElement('span');
  wrapper.className = 'heurist-map-legend-sample heurist-map-legend-point';

  if (symbol?.iconType === 'iconfont' && symbol.iconFont) {
    const icon = document.createElement('span');
    icon.className = normalizeIconFontClass(symbol.iconFont);
    icon.style.color = symbol.color || symbol.fillColor || '';
    const size = pointSize(symbol);
    icon.style.fontSize = `${size}px`;
    icon.style.width = `${size}px`;
    icon.style.height = `${size}px`;
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.justifyContent = 'center';
    wrapper.append(icon);
    return wrapper;
  }

  const imageUrl = resolveLegendImageUrl(symbol, iconContext, recordTypeId);
  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = '';
    image.style.width = `${pointSize(symbol)}px`;
    image.style.height = `${pointSize(symbol)}px`;
    if (symbol?.color) image.style.filter = hexToCssFilter(symbol.color);
    wrapper.append(image);
    return wrapper;
  }

  const marker = document.createElement('span');
  marker.className = 'heurist-map-legend-circle';
  const size = pointSize(symbol);
  marker.style.width = `${size}px`;
  marker.style.height = `${size}px`;
  marker.style.borderStyle = symbol?.stroke === false ? 'none' : 'solid';
  marker.style.borderWidth = `${Math.max(1, Number(symbol?.weight) || 1)}px`;
  marker.style.borderColor = symbol?.stroke === false
    ? 'transparent'
    : cssColorWithOpacity(symbol?.color || 'transparent', numberOr(symbol?.opacity, 1));
  marker.style.background = symbol?.fill === false
    ? 'transparent'
    : cssColorWithOpacity(symbol?.fillColor || 'transparent', numberOr(symbol?.fillOpacity, 1));
  wrapper.append(marker);
  return wrapper;
}

/**
 * Build a line-geometry legend sample.
 *
 * @param {object} symbol Resolved symbol.
 * @returns {HTMLElement} The sample element.
 */
function createLineSample(symbol) {
  const wrapper = document.createElement('span');
  wrapper.className = 'heurist-map-legend-sample heurist-map-legend-line';
  const line = document.createElement('span');
  line.style.borderTopWidth = `${Math.max(1, Number(symbol?.weight) || 2)}px`;
  line.style.borderTopColor = symbol?.stroke === false ? 'transparent' : (symbol?.color || '#777');
  line.style.borderTopStyle = dashStyle(symbol?.dashArray);
  line.style.opacity = String(numberOr(symbol?.opacity, 1));
  wrapper.append(line);
  return wrapper;
}

/**
 * Build a polygon-geometry legend sample.
 *
 * @param {object} symbol Resolved symbol.
 * @returns {HTMLElement} The sample element.
 */
function createPolygonSample(symbol) {
  const wrapper = document.createElement('span');
  wrapper.className = 'heurist-map-legend-sample heurist-map-legend-polygon';
  const polygon = document.createElement('span');
  polygon.style.borderStyle = symbol?.stroke === false ? 'none' : 'solid';
  polygon.style.borderWidth = `${Math.max(1, Number(symbol?.weight) || 1)}px`;
  polygon.style.borderColor = symbol?.stroke === false
    ? 'transparent'
    : cssColorWithOpacity(symbol?.color || 'transparent', numberOr(symbol?.opacity, 1));
  polygon.style.background = symbol?.fill === false
    ? 'transparent'
    : cssColorWithOpacity(symbol?.fillColor || 'transparent', numberOr(symbol?.fillOpacity, 1));
  wrapper.append(polygon);
  return wrapper;
}

/**
 * Resolve a point sample's pixel size from its symbol's radius or icon size.
 *
 * @param {object} symbol Resolved symbol.
 * @returns {number} Pixel size, clamped to `[5, 28]`.
 */
function pointSize(symbol) {
  const radiusSize = Number(symbol?.radius) * 2;
  if ((symbol?.iconType || 'circle') === 'circle' && Number.isFinite(radiusSize) && radiusSize > 0) {
    return Math.max(5, Math.min(28, Math.round(radiusSize)));
  }
  const iconSize = Array.isArray(symbol?.iconSize) ? Number(symbol.iconSize[0]) : Number(symbol?.iconSize);
  const size = Number.isFinite(iconSize) && iconSize > 0
    ? iconSize
    : (Number.isFinite(radiusSize) && radiusSize > 0 ? radiusSize : 12);
  return Math.max(5, Math.min(28, Math.round(size)));
}

/**
 * Normalize a raw icon-font class string, defaulting Font Awesome icons to solid style.
 *
 * @param {string} iconFont Raw icon font class string.
 * @returns {string} Normalized class string.
 */
function normalizeIconFontClass(iconFont) {
  const classes = String(iconFont || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const isFontAwesome = classes.some((name) =>
    name === 'fa' || name === 'fas' || name === 'far' || name === 'fab' || name.startsWith('fa-')
  );
  if (isFontAwesome) {
    const hasStyleClass = classes.some((name) =>
      name === 'fa-solid' || name === 'fa-regular' || name === 'fa-brands'
      || name === 'fas' || name === 'far' || name === 'fab'
    );
    if (!hasStyleClass) classes.unshift('fa-solid');
    return classes.join(' ');
  }
  const iconClass = classes.find((name) => name.startsWith('ui-icon-')) || classes[0] || 'ui-icon-location';
  return `ui-icon ${iconClass.startsWith('ui-icon-') ? iconClass : `ui-icon-${iconClass}`}`;
}

/**
 * Resolve the CSS border style for a line/polygon dash-array value.
 *
 * @param {*} value Raw dash-array value.
 * @returns {'solid'|'dashed'} The resolved CSS border style.
 */
function dashStyle(value) {
  if (value == null || value === '' || value === false) return 'solid';
  return 'dashed';
}

/**
 * Resolve a thematic range's display label.
 *
 * @param {object} range Thematic range descriptor.
 * @returns {string} The resolved label.
 */
function getRangeLabel(range) {
  const label = range?.symbol?.legendLabel; // range?.title ?? range?.label;
  if (label != null && String(label).trim()) return String(label);
  if (range?.min != null || range?.max != null) {
    return `${range.min ?? ''} – ${range.max ?? ''}`.trim();
  }
  if (Array.isArray(range?.value)) return range.value.join(', ');
  const value = String(range?.value ?? '');
  return value.includes('<>') ? value.replace('<>', ' – ') : value;
}

/**
 * Normalize a raw geometry-types flag object to strict booleans.
 *
 * @param {object} value Raw geometry-types flags.
 * @returns {{point: boolean, line: boolean, polygon: boolean}} Normalized flags.
 */
function normalizeGeometryTypes(value) {
  return {
    point: value?.point === true,
    line: value?.line === true,
    polygon: value?.polygon === true
  };
}

/**
 * Coerce a value to a finite number, or `fallback` when it is not one.
 *
 * @param {*} value Candidate value.
 * @param {number} fallback Value used when `value` does not parse as finite.
 * @returns {number} The finite number, or `fallback`.
 */
function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Convert a hex color and opacity to an `rgba()` CSS color string.
 *
 * @param {string} color Hex color (`#rgb` or `#rrggbb`), or any other CSS color string.
 * @param {number} opacity Opacity in `[0, 1]`.
 * @returns {string} The `rgba()` string, or the original `color` when it is not hex.
 */
function cssColorWithOpacity(color, opacity) {
  const alpha = Math.min(1, Math.max(0, numberOr(opacity, 1)));
  const text = String(color || '').trim();
  const short = /^#([0-9a-f]{3})$/i.exec(text);
  const full = /^#([0-9a-f]{6})$/i.exec(text);
  let hex = full?.[1] || null;
  if (short) hex = short[1].split('').map((c) => c + c).join('');
  if (!hex) return text;
  return `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${alpha})`;
}

/**
 * Return a layer's first configured record type id, if any.
 *
 * @param {object} layer Normalized runtime layer.
 * @returns {number|null} The first record type id, or `null`.
 */
function firstRecordTypeId(layer) {
  const ids = Array.isArray(layer?.recordTypeIds) ? layer.recordTypeIds : [];
  return Number.isInteger(Number(ids[0])) ? Number(ids[0]) : null;
}

/**
 * Resolve the image URL for a point symbol (direct icon URL, or record-type icon endpoint).
 *
 * @param {object} symbol Resolved symbol.
 * @param {object} iconContext Record-type icon resolution context (`baseUrl`, `database`).
 * @param {number|null} recordTypeId Record type id used for record-type icon symbols.
 * @returns {string|null} The resolved image URL, or `null` when the symbol has no image.
 */
function resolveLegendImageUrl(symbol, iconContext, recordTypeId) {
  const type = String(symbol?.iconType || '').toLowerCase();
  if ((type === 'url' || type === 'image' || type === 'icon' || type === 'marker') && symbol?.iconUrl) return String(symbol.iconUrl);
  if (type !== 'rectype' || !recordTypeId || !iconContext?.baseUrl || !iconContext?.database) return null;
  const url = new URL(iconContext.baseUrl);
  url.searchParams.set('db', iconContext.database);
  url.searchParams.set('icon', String(recordTypeId));
  return url.toString();
}
