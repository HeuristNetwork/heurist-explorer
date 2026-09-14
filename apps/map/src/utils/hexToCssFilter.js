/**
 * hexToCssFilter.js - Approximate monochrome image tint using CSS filters.
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 */

/** Return a deterministic CSS filter which tints a dark/monochrome icon toward a hex color. */
export function hexToCssFilter(color) {
  const rgb = parseHex(color);
  if (!rgb) return '';
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const invert = Math.round(l * 100);
  const saturation = Math.round(100 + s * 900);
  const brightness = Math.round(60 + l * 80);
  return `brightness(0) saturate(100%) invert(${invert}%) sepia(100%) saturate(${saturation}%) hue-rotate(${Math.round(h * 360 - 45)}deg) brightness(${brightness}%) contrast(100%)`;
}

function parseHex(value) {
  const text = String(value || '').trim();
  let match = /^#([0-9a-f]{6})$/i.exec(text);
  if (match) return { r: parseInt(match[1].slice(0,2),16), g: parseInt(match[1].slice(2,4),16), b: parseInt(match[1].slice(4,6),16) };
  match = /^#([0-9a-f]{3})$/i.exec(text);
  if (!match) return null;
  const h = match[1].split('').map((c) => c+c).join('');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}
