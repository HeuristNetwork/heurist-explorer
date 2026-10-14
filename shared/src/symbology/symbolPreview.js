/**
 * @file symbolPreview.js
 * @brief Small samples of a map symbol: point (circle, icon font, image, record type
 *        icon), line and polygon. Used by the symbology editors (plan 17 §1).
 *
 * Port of hclient/widgets/editing/mapSymbolPreview.js (renderMapSymbolPreview),
 * without jQuery. The symbol given is complete (see effectiveSymbol).
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

import { hexToCssFilter } from './hexToCssFilter.js';
import { parseHexColour } from './symbology.js';
import './symbolPreview.css';

/**
 * Render samples of a symbol into a container (replacing its content).
 *
 * @param {HTMLElement} container Host element.
 * @param {object} symbol Complete symbol.
 * @param {object} [options]
 * @param {'point'|'line'|'polygon'|null} [options.geometry] One sample; default point and polygon.
 * @param {boolean} [options.all] Point, line and polygon.
 * @param {Function} [options.iconUrl] `(rectypeId) → url` of a record type icon.
 * @param {number|string} [options.rectypeId] Record type of the record type icon.
 * @returns {HTMLElement} The container.
 */
export function renderSymbolPreview(container, symbol = {}, options = {}) {
  if (!container) return container;
  container.classList.add('h-symbol-preview');
  container.replaceChildren();
  const value = symbol || {};
  const geometry = options.geometry || null;
  if (geometry === 'line') container.append(lineSample(value));
  else if (geometry === 'polygon') container.append(polygonSample(value));
  else if (geometry === 'point') container.append(pointSample(value, options));
  else {
    container.append(pointSample(value, options));
    if (options.all) container.append(lineSample(value));
    container.append(polygonSample(value));
  }
  return container;
}

/**
 * A new preview element.
 *
 * @param {object} symbol Complete symbol.
 * @param {object} [options] See renderSymbolPreview.
 * @returns {HTMLElement} The preview.
 */
export function createSymbolPreview(symbol, options = {}) {
  return renderSymbolPreview(document.createElement('span'), symbol, options);
}

/** Point: icon font, image, record type icon or a circle. */
function pointSample(symbol, options) {
  const wrapper = element('span', 'h-symbol-preview-point');
  const type = String(symbol.iconType || 'circle').toLowerCase();
  const size = pointSize(symbol);
  if (type === 'iconfont' && symbol.iconFont) {
    const icon = element('span', iconFontClass(symbol.iconFont));
    Object.assign(icon.style, { color: symbol.color || symbol.fillColor || '', fontSize: `${size}px`, width: `${size}px`, height: `${size}px` });
    wrapper.append(icon);
    return wrapper;
  }
  const url = type === 'url' ? symbol.iconUrl
    : (type === 'rectype' && typeof options.iconUrl === 'function' ? options.iconUrl(options.rectypeId || 12) : null);
  if (url) {
    const image = element('img', 'h-symbol-preview-image');
    image.alt = '';
    image.src = String(url);
    Object.assign(image.style, { width: `${size}px`, height: `${size}px` });
    const filter = hexToCssFilter(symbol.color);
    if (filter) image.style.filter = filter;
    image.addEventListener('error', () => image.replaceWith(circle(symbol)), { once: true });
    wrapper.append(image);
    return wrapper;
  }
  wrapper.append(circle(symbol));
  return wrapper;
}

/** Generic point: a circle with the outline and fill of the symbol. */
function circle(symbol) {
  const size = Math.min(24, pointSize(symbol));
  const dot = element('span', 'h-symbol-preview-circle');
  Object.assign(dot.style, {
    width: `${size}px`,
    height: `${size}px`,
    border: symbol.stroke === false ? 'none'
      : `${Math.max(1, Number(symbol.weight) || 1)}px solid ${withOpacity(symbol.color || '#777', numberOr(symbol.opacity, 1))}`,
    background: symbol.fill === false ? 'transparent'
      : withOpacity(symbol.fillColor || symbol.color || '#777', numberOr(symbol.fillOpacity, 1))
  });
  return dot;
}

/** Line: a stroke with the width, colour, dash and opacity of the symbol. */
function lineSample(symbol) {
  const wrapper = element('span', 'h-symbol-preview-shape');
  const line = element('span', 'h-symbol-preview-line');
  Object.assign(line.style, {
    borderTopWidth: `${Math.max(1, Math.min(6, Number(symbol.weight) || 2))}px`,
    borderTopStyle: symbol.dashArray ? 'dashed' : 'solid',
    borderTopColor: symbol.stroke === false ? 'transparent' : (symbol.color || '#777'),
    opacity: String(numberOr(symbol.opacity, 1))
  });
  wrapper.append(line);
  return wrapper;
}

/** Polygon: a square with the outline and fill of the symbol. */
function polygonSample(symbol) {
  const wrapper = element('span', 'h-symbol-preview-shape');
  const square = element('span', 'h-symbol-preview-polygon');
  Object.assign(square.style, {
    border: symbol.stroke === false ? 'none'
      : `${Math.max(1, Math.min(4, Number(symbol.weight) || 1))}px solid ${withOpacity(symbol.color || '#777', numberOr(symbol.opacity, 1))}`,
    background: symbol.fill === false ? 'transparent'
      : withOpacity(symbol.fillColor || symbol.color || '#777', numberOr(symbol.fillOpacity, 1))
  });
  wrapper.append(square);
  return wrapper;
}

/** Size of the point sample (5..24 px). */
function pointSize(symbol) {
  const radius = Number(symbol.radius) * 2;
  if ((symbol.iconType || 'circle') === 'circle' && Number.isFinite(radius) && radius > 0) {
    return Math.max(5, Math.min(24, Math.round(radius)));
  }
  let size = Array.isArray(symbol.iconSize) ? Number(symbol.iconSize[0]) : Number(symbol.iconSize);
  if (!Number.isFinite(size) || size <= 0) size = Number.isFinite(radius) && radius > 0 ? radius : 14;
  return Math.max(5, Math.min(24, Math.round(size)));
}

/** CSS classes of an icon font name: Font Awesome (`fa-...`) or jQuery UI icon font (`ui-icon-...`). */
export function iconFontClass(iconFont) {
  const classes = String(iconFont || '').trim().split(/\s+/).filter(Boolean);
  if (classes.some((name) => ['fa', 'fas', 'far', 'fab'].includes(name) || name.startsWith('fa-'))) {
    const styled = classes.some((name) => ['fa', 'fas', 'far', 'fab', 'fa-solid', 'fa-regular', 'fa-brands'].includes(name));
    return (styled ? classes : ['fa-solid', ...classes]).join(' ');
  }
  const name = classes[0] || 'location';
  return name.startsWith('ui-icon') ? `ui-icon ${name}` : `ui-icon ui-icon-${name}`;
}

/** A colour with an opacity (hex colours become rgba). */
function withOpacity(colour, opacity) {
  const rgb = parseHexColour(colour);
  if (!rgb) return colour;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.max(0, Math.min(1, opacity))})`;
}

/** A finite number or a fallback. */
function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** Create an element with a class. */
function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
