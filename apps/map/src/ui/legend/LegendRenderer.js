/**
 * LegendRenderer.js - Visual legend for layer and thematic symbology.
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 */
import { $HR } from '#shared/ui';

import { mergeThematicSymbol } from '../../thematic/thematicSymbolResolver.js';
import { hexToCssFilter } from '../../utils/hexToCssFilter.js';


/** Create a compact geometry-neutral preview for configuration forms. */
export function createSymbolPreview(symbol = {}) {
  const preview = document.createElement('span');
  preview.className = 'heurist-map-symbol-preview';
  appendGeometrySamples(preview, symbol || {}, { point: true, line: true, polygon: true });
  return preview;
}

/** Create the legend for the currently selected layer symbology. */
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

function appendGeometrySamples(container, symbol, geometryTypes, context = {}) {
  const known = geometryTypes.point || geometryTypes.line || geometryTypes.polygon;
  // Loaded-but-empty GeoJSON has no geometry family to infer. Use a marker as
  // a compact generic fallback rather than drawing all three representations.
  const types = known ? geometryTypes : { point: true, line: false, polygon: false };

  if (types.point) container.append(createPointSample(symbol, context));
  if (types.line) container.append(createLineSample(symbol));
  if (types.polygon) container.append(createPolygonSample(symbol));
}

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

function dashStyle(value) {
  if (value == null || value === '' || value === false) return 'solid';
  return 'dashed';
}

function getRangeLabel(range) {
  const label = range?.symbol?.legendLabel;//range?.title ?? range?.label;
  if (label != null && String(label).trim()) return String(label);
  if (range?.min != null || range?.max != null) {
    return `${range.min ?? ''} – ${range.max ?? ''}`.trim();
  }
  if (Array.isArray(range?.value)) return range.value.join(', ');
  const value = String(range?.value ?? '');
  return value.includes('<>') ? value.replace('<>', ' – ') : value;
}

function normalizeGeometryTypes(value) {
  return {
    point: value?.point === true,
    line: value?.line === true,
    polygon: value?.polygon === true
  };
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}


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

function firstRecordTypeId(layer) {
  const ids = Array.isArray(layer?.recordTypeIds) ? layer.recordTypeIds : [];
  return Number.isInteger(Number(ids[0])) ? Number(ids[0]) : null;
}

function resolveLegendImageUrl(symbol, iconContext, recordTypeId) {
  const type = String(symbol?.iconType || '').toLowerCase();
  if ((type === 'url' || type === 'image' || type === 'icon' || type === 'marker') && symbol?.iconUrl) return String(symbol.iconUrl);
  if (type !== 'rectype' || !recordTypeId || !iconContext?.baseUrl || !iconContext?.database) return null;
  const url = new URL(iconContext.baseUrl);
  url.searchParams.set('db', iconContext.database);
  url.searchParams.set('icon', String(recordTypeId));
  return url.toString();
}
