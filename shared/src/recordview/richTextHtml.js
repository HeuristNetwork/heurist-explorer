/**
 * @file richTextHtml.js
 * @brief HTML of a blocktext value for display (plan 25): the tags and attributes the server keeps
 *        for blocktext (srv/Utilities/StoredText.php, TinyMCE text, lists, links, tables, images
 *        and media), checked again here because old values were saved before that policy.
 *
 * DOM-based (a `<template>`), no regular expressions on HTML. Removed with their content:
 * script, style, SVG, MathML, forms and embeds; other unknown tags are unwrapped (their
 * text stays). URLs: http, https, mailto, tel and relative ones; `./?db=…` (the form TinyMCE
 * stores, as legacy) is resolved against the Heurist base URL; a bare record id (`href="123"`
 * or `123/template.tpl`, the legacy "Record" link) becomes a record link (`data-record-id`).
 * iframes only from YouTube, Vimeo and SoundCloud.
 *
 *   const html = sanitizeRichHtml(value, { baseUrl, database });
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

import { sanitizeTextHtml } from './FieldValueFormatter.js';

/** Allowed tags and their own attributes (as the server's blocktext allowlist). */
const TAGS = Object.freeze({
  p: [], div: [], span: [], br: [], hr: [], h1: [], h2: [], h3: [], h4: [], h5: [], h6: [], blockquote: [], pre: [], code: [],
  s: [], sup: [], sub: [], small: [], u: [], i: [], b: [], strong: [], em: [],
  ul: [], ol: ['start', 'type'], li: ['value'], dl: [], dt: [], dd: [],
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height', 'data-id'],
  table: ['width', 'border', 'cellpadding', 'cellspacing', 'summary'], caption: [], colgroup: [], col: ['span', 'width'],
  thead: [], tbody: [], tfoot: [], tr: [], th: ['colspan', 'rowspan', 'scope', 'abbr', 'width', 'height'],
  td: ['colspan', 'rowspan', 'width', 'height'],
  figure: [], figcaption: [],
  audio: ['src', 'controls', 'preload'], video: ['src', 'controls', 'preload', 'poster', 'width', 'height'], source: ['src', 'type'],
  iframe: ['src', 'width', 'height', 'title', 'frameborder', 'allowfullscreen']
});

/** Attributes of every allowed tag (no id: it could clash with the page). */
const GLOBAL_ATTRIBUTES = Object.freeze(['class', 'title', 'lang', 'dir']);

/** Removed with their content. */
const DROPPED = new Set(['script', 'style', 'svg', 'math', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select',
  'textarea', 'template', 'noscript', 'link', 'meta', 'base', 'frame', 'frameset']);

/** Attributes holding a URL. */
const URL_ATTRIBUTES = new Set(['href', 'src', 'poster']);

/** iframes that may be shown (as the server: SafeIframeRegexp). */
const SAFE_IFRAME = /^(https?:)?\/\/(www\.youtube(?:-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/|w\.soundcloud\.com\/player\/)/i;

/** A legacy record link: `123` or `123/template.tpl`. */
const RECORD_LINK = /^(\d+)(\/[\w.-]+)?$/;

/**
 * Sanitized HTML of a blocktext value.
 *
 * @param {*} value Stored value.
 * @param {{baseUrl?: string|null, database?: string|null}} [options] Heurist base URL (with or
 *        without the trailing slash) and database: relative URLs and record links.
 * @returns {string} HTML safe to show.
 */
export function sanitizeRichHtml(value, { baseUrl = null, database = null } = {}) {
  const text = String(value ?? '');
  const template = typeof document !== 'undefined' ? document.createElement('template') : null;
  // without a real DOM (tests, workers): the inline allowlist of the title, no attributes
  if (!template || !template.content || typeof template.content.querySelectorAll !== 'function') {
    return sanitizeTextHtml(text, { extraTags: ['p', 'br'] });
  }
  template.innerHTML = text;
  cleanChildren(template.content, { baseUrl: normalizeBase(baseUrl), database: database ? String(database) : '' });
  return template.innerHTML;
}

/** Clean the children of a node (depth first). */
function cleanChildren(node, context) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 8) {
      child.remove();
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tag = child.localName;
    if (DROPPED.has(tag)) {
      child.remove();
      continue;
    }
    if (!Object.hasOwn(TAGS, tag)) {
      // an unknown element: its content stays
      cleanChildren(child, context);
      child.replaceWith(...child.childNodes);
      continue;
    }
    cleanAttributes(child, tag, context);
    if (tag === 'iframe' && !SAFE_IFRAME.test(child.getAttribute('src') || '')) {
      child.remove();
      continue;
    }
    cleanChildren(child, context);
  }
}

/** Keep the allowed attributes with safe values. */
function cleanAttributes(element, tag, context) {
  const allowed = new Set([...TAGS[tag], ...GLOBAL_ATTRIBUTES]);
  for (const { name, value } of [...element.attributes]) {
    const lower = name.toLowerCase();
    if (!allowed.has(lower)) {
      element.removeAttribute(name);
      continue;
    }
    if (URL_ATTRIBUTES.has(lower)) {
      const url = safeUrl(value, tag, lower, context, element);
      if (url == null) element.removeAttribute(name);
      else element.setAttribute(name, url);
    }
  }
  if (tag === 'a') {
    const target = element.getAttribute('target');
    if (target && !['_blank', '_self'].includes(target)) element.removeAttribute('target');
    if (element.getAttribute('target') === '_blank') element.setAttribute('rel', 'noopener noreferrer');
  }
}

/** A safe URL (resolved), or null to drop the attribute. */
function safeUrl(raw, tag, attribute, { baseUrl, database }, element) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  // a record link of the legacy "Record" button
  const record = tag === 'a' && attribute === 'href' ? RECORD_LINK.exec(value) : null;
  if (record) {
    element.setAttribute('data-record-id', record[1]);
    if (!baseUrl) return '#';
    const template = record[2] ? `&template=${encodeURIComponent(record[2].slice(1))}` : '&fmt=html';
    return `${baseUrl}?db=${encodeURIComponent(database)}&recID=${record[1]}${template}`;
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (scheme) return ['http', 'https', 'mailto', 'tel'].includes(scheme[1].toLowerCase()) ? value : null;
  // relative to the Heurist base URL (TinyMCE stores ./?db=…&file=…)
  if (value.startsWith('./') && baseUrl) return `${baseUrl}${value.slice(2)}`;
  if (value.startsWith('?') && baseUrl) return `${baseUrl}${value}`;
  return value;
}

/** Base URL with one trailing slash, or ''. */
function normalizeBase(baseUrl) {
  const value = String(baseUrl ?? '').trim();
  if (!value) return '';
  return value.endsWith('/') ? value : `${value}/`;
}
