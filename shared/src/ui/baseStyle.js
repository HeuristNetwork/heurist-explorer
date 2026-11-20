/**
 * @file baseStyle.js
 * @brief The base style of an application UI (Explorer *Base style settings*, 2026-11-20): the base settings of the
 *        CMS (colours, fonts, radius; `--h-*` variables) written as a style element of the document. Explorer applies
 *        it to its own document and passes it to the modules (`runtime.baseStyle`).
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

import { BASE_SETTINGS, baseVariables } from '../site/cmsDocument.js';

/** The base settings used by an application UI: not the page width and the logo height (website only). */
export const UI_BASE_SETTINGS = Object.freeze(BASE_SETTINGS.filter((key) => !['site-width', 'site-logo-height'].includes(key)));

/** Id of the style element. */
const STYLE_ID = 'h-base-style';

/**
 * Keep the UI base settings with a text value (trimmed); anything else is left out.
 *
 * @param {*} value Saved or given base settings.
 * @returns {object}
 */
export function normalizeBaseStyle(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const key of UI_BASE_SETTINGS) {
    const text = typeof value[key] === 'string' || typeof value[key] === 'number' ? String(value[key]).trim() : '';
    if (text) result[key] = text;
  }
  return result;
}

/**
 * Whether two base styles differ.
 *
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function baseStyleDiffers(a, b) {
  return JSON.stringify(normalizeBaseStyle(a)) !== JSON.stringify(normalizeBaseStyle(b));
}

/**
 * The CSS of a base style. The variables are set on `html:root` and `html .h-theme` (more specific than the defaults
 * of heurist-ui.css, whatever the order of the style elements). The font size is the normal size of the UI; the large,
 * small and tiny sizes follow it (14, 11 and 10 of 12). The heading font and colour apply to h1-h6.
 *
 * @param {object} base Base settings; unknown keys and unsafe values are left out.
 * @returns {string} Empty without settings.
 */
export function baseStyleCss(base) {
  const values = normalizeBaseStyle(base);
  let variables = '';
  const used = new Set();
  for (const [key, value] of Object.entries(values)) {
    const css = baseVariables({ [key]: value });
    if (!css) continue;
    variables += css;
    used.add(key);
  }
  if (used.has('site-font-size')) {
    const size = 'var(--h-site-font-size)';
    variables += `--h-font-size:${size};--h-font-size-large:calc(${size} * 14 / 12);`
      + `--h-font-size-small:calc(${size} * 11 / 12);--h-font-size-tiny:calc(${size} * 10 / 12);`;
  }
  if (!variables) return '';
  let css = `html:root,html .h-theme{${variables}}\n`;
  const heading = [];
  if (used.has('site-heading-font')) heading.push('font-family:var(--h-site-heading-font)');
  if (used.has('site-heading-color')) heading.push('color:var(--h-site-heading-color)');
  if (heading.length) css += `:is(h1,h2,h3,h4,h5,h6){${heading.join(';')}}\n`;
  return css;
}

/**
 * Write a base style into a document (a style element at the end of its head); no settings remove it.
 *
 * @param {Document} doc
 * @param {object} base Base settings.
 * @param {{removeEmpty?: boolean}} [options] `removeEmpty` false: no settings keep the style of the document (a module
 *        mounted directly into Explorer's page, or into a website page, without `runtime.baseStyle`).
 * @returns {void}
 */
export function applyBaseStyle(doc, base, { removeEmpty = true } = {}) {
  if (!doc?.head) return;
  const css = baseStyleCss(base);
  let style = doc.getElementById(STYLE_ID);
  if (!css) {
    if (removeEmpty) style?.remove();
    return;
  }
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
  }
  style.textContent = css;
  // last in the head, also after a style added before
  doc.head.append(style);
}
