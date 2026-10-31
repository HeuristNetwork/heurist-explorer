/**
 * @file cmsDocument.js
 * @brief Website format v4 (plan 27a): configuration, checks and node styles, as on the server.
 *
 * The same rules as heurist srv/Website/CmsValidator.php, StyleCompiler.php and
 * srv/Utilities/StoredCss.php (values): both run the cases of
 * shared/test/fixtures/cms-v4/, so the designer (phase 3) shows the problems and the
 * CSS the server will. HTML is read with a start-tag scanner (it only lists the
 * data-h-* attributes; it is not a sanitizer - the server cleans HTML on save).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

export const CMS_SCHEMA = 'heurist-cms/4';

/** Known instance types by kind. */
export const CMS_TYPES = Object.freeze({
  module: Object.freeze(['explorer', 'data', 'map', 'timeline', 'graph', 'recordview']),
  widget: Object.freeze(['menu'])
});

/** Newest instance configuration version. */
export const CMS_CONFIG_VERSION = 1;

/** Base settings (key = CSS variable without "--h-"). */
export const BASE_SETTINGS = Object.freeze([
  'font-family', 'color-text', 'color-bg', 'color-surface', 'color-primary', 'color-link',
  'color-border', 'radius', 'site-font-size', 'site-heading-font', 'site-heading-color', 'site-width'
]);

/** Screen sizes of node styles: key => max width (px). */
export const SCREENS = Object.freeze({ medium: 1024, narrow: 640 });

/** Kinds of `styles.kinds` (plan 27c §6a) and their selectors. */
export const CMS_KINDS = Object.freeze({
  group: '[data-h-control="group"]',
  tabs: '[data-h-control="tabs"]',
  accordion: '[data-h-control="accordion"]',
  text: '[data-h-text]',
  instance: '[data-h-instance]'
});

const PROPERTIES = new Set([
  'display', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'gap', 'grid-template-columns',
  'grid-template-rows', 'grid-column', 'grid-row', 'order',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'overflow',
  'border-radius', 'box-shadow',
  'color', 'background-color', 'background-image', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align'
]);
const DISPLAY = ['block', 'flex', 'grid', 'none'];
const NODE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const URL_PATTERN = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

/**
 * Parse the configuration JSON (2-1187). An empty value is an empty configuration.
 *
 * @param {string} json
 * @returns {{config: object, issues: Array<object>}}
 */
export function parseCmsConfig(json) {
  const empty = { schema: CMS_SCHEMA, instances: {}, styles: {} };
  const text = String(json ?? '');
  if (!text.trim()) return { config: empty, issues: [] };
  let config;
  try {
    config = JSON.parse(text);
  } catch {
    config = null;
  }
  if (!config || typeof config !== 'object' || (Array.isArray(config) && config.length && !('schema' in config))) {
    return { config: empty, issues: [issue('error', 'cms_json', 'The website configuration is not a valid JSON object')] };
  }
  if (config.schema !== CMS_SCHEMA) {
    return { config: empty, issues: [issue('error', 'cms_schema', `The website configuration is not "${CMS_SCHEMA}"`)] };
  }
  const issues = [];
  for (const part of ['instances', 'styles']) {
    if (config[part] != null && !isMap(config[part])) {
      issues.push(issue('error', 'cms_json', `The "${part}" of the website configuration is not an object`));
      config[part] = {};
    }
  }
  config.instances = config.instances ?? {};
  config.styles = config.styles ?? {};
  return { config, issues };
}

/**
 * All checks of one page (CmsValidator::check).
 *
 * @param {object} config Parsed configuration.
 * @param {string[]} htmlParts Page HTML, and header / footer for a website.
 * @param {object} [translations] Language => {node id: html}.
 * @param {string} [baseUrl] Heurist base URL (background images).
 * @param {string[]} [otherInstances] Instance ids configured elsewhere.
 * @returns {Array<{level: string, code: string, message: string, node: string|null}>}
 */
export function checkCmsDocument(config, htmlParts, translations = {}, baseUrl = '', otherInstances = []) {
  const issues = [];
  const nodes = htmlParts.flatMap((html) => cmsNodes(html));
  const seenNodes = new Set();
  const seenHosts = new Set();
  const texts = new Set();
  const instances = isMap(config.instances) ? config.instances : {};
  for (const node of nodes) {
    const id = node.node;
    if (id !== '') {
      if (seenNodes.has(id)) issues.push(issue('warning', 'duplicate_node', `Node id "${id}" is used more than once`, id));
      seenNodes.add(id);
      if (node.text) texts.add(id);
    }
    const instance = node.instance;
    if (instance === null) continue;
    if (seenHosts.has(instance)) {
      issues.push(issue('warning', 'duplicate_instance', `Instance "${instance}" has more than one host`, id));
      continue;
    }
    seenHosts.add(instance);
    if (!Object.hasOwn(instances, instance) && !otherInstances.includes(instance)) {
      issues.push(issue('warning', 'host_without_config', `Instance "${instance}" is not configured`, id));
    }
  }
  for (const [instance, settings] of Object.entries(instances)) {
    if (!seenHosts.has(instance)) {
      issues.push(issue('warning', 'config_without_host', `Instance "${instance}" has no host in the page`));
    }
    const problem = cmsInstanceProblem(isMap(settings) ? settings : {});
    if (problem) issues.push(issue('warning', problem[0], `Instance "${instance}": ${problem[1]}`));
  }
  const styles = isMap(config.styles) ? config.styles : {};
  const part = (name) => (isMap(styles[name]) ? styles[name] : {});
  issues.push(...compileCmsStyles(part('base'), [part('nodes')], baseUrl,
    { kinds: [part('kinds')], presets: [part('presets')] }).issues);
  for (const [language, blocks] of Object.entries(translations || {})) {
    const ids = Object.keys(isMap(blocks) ? blocks : {});
    for (const id of ids) {
      if (!texts.has(id)) {
        issues.push(issue('warning', 'translation_orphan',
          `Translation "${language}" of "${id}": the page has no text block with this id`, id));
      }
    }
    for (const id of texts) {
      if (!ids.includes(id)) issues.push(issue('info', 'translation_missing', `Text block "${id}" is not translated into "${language}"`, id));
    }
  }
  return issues;
}

/**
 * Why an instance can not be mounted, or null.
 *
 * @param {object} settings Instance configuration.
 * @returns {[string, string]|null} Issue code and message.
 */
export function cmsInstanceProblem(settings) {
  const kind = String(settings.kind ?? '');
  const type = String(settings.type ?? '');
  if (!Object.hasOwn(CMS_TYPES, kind) || !CMS_TYPES[kind].includes(type)) {
    return ['unknown_type', `unknown kind / type "${kind}" / "${type}"`];
  }
  const version = parseInt(settings.configVersion ?? 1, 10) || 0;
  if (version > CMS_CONFIG_VERSION) {
    return ['config_version', `configuration version ${version} is newer than this Heurist`];
  }
  if (settings.mount != null && !['direct', 'iframe'].includes(settings.mount)) {
    return ['mount', 'mount must be "direct" or "iframe"'];
  }
  return null;
}

/**
 * Elements with data-h-node or data-h-instance, in document order (CmsHtml::nodes).
 *
 * @param {string} html Page HTML fragment.
 * @returns {Array<{node: string, instance: string|null, text: boolean, control: string|null, tag: string}>}
 */
export function cmsNodes(html) {
  const result = [];
  const pattern = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
  for (const match of String(html ?? '').matchAll(pattern)) {
    if (!match[2]) continue;
    const attributes = tagAttributes(match[3] || '');
    if (!attributes.has('data-h-node') && !attributes.has('data-h-instance')) continue;
    result.push({
      node: attributes.get('data-h-node') ?? '',
      instance: attributes.has('data-h-instance') ? attributes.get('data-h-instance') : null,
      text: attributes.has('data-h-text'),
      control: attributes.has('data-h-control') ? attributes.get('data-h-control') : null,
      tag: match[2].toLowerCase()
    });
  }
  return result;
}

/**
 * CSS of the base settings, kind defaults, presets and node styles (StyleCompiler::compile). Kind defaults and
 * presets (plan 27c §6a) come before the node styles, so a node's own style wins.
 *
 * @param {object} base Base settings (website merged with page).
 * @param {object[]} nodeSets Node styles, website first, then the page.
 * @param {string} [baseUrl] Heurist base URL: background images may only come from it (or be relative).
 * @param {{kinds?: object[], presets?: object[]}} [common] Kind defaults and presets, website first, then the page.
 * @returns {{css: string, issues: Array<object>}}
 */
export function compileCmsStyles(base, nodeSets, baseUrl = '', { kinds = [], presets = [] } = {}) {
  const issues = [];
  let css = '';
  const variables = baseVariables(base, issues);
  if (variables) css += `html.h-site{${variables}}\n`;
  const screens = Object.fromEntries(Object.keys(SCREENS).map((screen) => [screen, '']));
  const rule = (selector, style, id) => {
    const rules = declarations(style, id, baseUrl, issues);
    if (rules) css += `${selector}{${rules}}\n`;
    for (const screen of Object.keys(SCREENS)) {
      if (isMap(style[screen])) {
        const screenRules = declarations(style[screen], id, baseUrl, issues);
        if (screenRules) screens[screen] += `${selector}{${screenRules}}\n`;
      }
    }
  };
  for (const set of kinds) {
    if (!isMap(set)) continue;
    for (const [kind, style] of Object.entries(set)) {
      if (!Object.hasOwn(CMS_KINDS, kind) || !isMap(style)) {
        issues.push(issue('warning', 'style_kind', `Kind style "${kind}" is not valid`));
        continue;
      }
      rule(CMS_KINDS[kind], style, null);
    }
  }
  for (const set of presets) {
    if (!isMap(set)) continue;
    for (const [name, style] of Object.entries(set)) {
      if (!NODE_ID.test(name) || !isMap(style)) {
        issues.push(issue('warning', 'style_preset', `Style preset "${name}" is not valid`));
        continue;
      }
      const properties = { ...style };
      delete properties.label;
      rule(`[data-h-style="${name}"]`, properties, null);
    }
  }
  for (const nodes of nodeSets) {
    if (!isMap(nodes)) continue;
    for (const [id, style] of Object.entries(nodes)) {
      if (!NODE_ID.test(id) || !isMap(style)) {
        issues.push(issue('warning', 'style_node', `Node style "${id}" is not valid`, id));
        continue;
      }
      rule(`[data-h-node="${id}"]`, style, id);
    }
  }
  for (const [screen, width] of Object.entries(SCREENS)) {
    if (screens[screen]) css += `@media (max-width:${width}px){\n${screens[screen]}}\n`;
  }
  return { css, issues };
}

/** All style properties that may be written, for property selects (the designer's style forms). */
export const CMS_STYLE_PROPERTIES = Object.freeze([
  ...PROPERTIES,
  ...['margin', 'padding'].flatMap((name) => [name, ...['top', 'right', 'bottom', 'left'].map((side) => `${name}-${side}`)]),
  ...['', '-top', '-right', '-bottom', '-left'].flatMap((side) => ['', '-width', '-style', '-color'].map((part) => `border${side}${part}`))
].sort());

/** Whether a node style property may be written. */
export function isCmsStyleProperty(property) {
  return PROPERTIES.has(property)
    || /^(?:margin|padding)(?:-(?:top|right|bottom|left))?$/.test(property)
    || /^border(?:-(?:top|right|bottom|left))?(?:-(?:width|style|color))?$/.test(property);
}

/**
 * Whether one CSS value is safe (StoredCss::isSafeValue): no `<`, `;`, braces, comments,
 * `expression(`, `javascript:` and other URL schemes than http(s) and raster data images.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isSafeCssValue(value) {
  const text = String(value);
  return !/[<;{}\0]/.test(text) && !text.includes('/*') && isSafeCss(text);
}

/** CSS variables of the base settings. */
function baseVariables(base, issues) {
  let css = '';
  for (const [key, raw] of Object.entries(isMap(base) ? base : {})) {
    if (!BASE_SETTINGS.includes(key)) {
      issues.push(issue('warning', 'style_base', `Unknown base setting "${key}"`));
      continue;
    }
    if (!isScalar(raw) || !isSafeStyleValue(scalarText(raw), false, '')) {
      issues.push(issue('warning', 'style_value', `Value of base setting "${key}" is not allowed`));
      continue;
    }
    const value = scalarText(raw).trim();
    css += `--h-${key}:${value};`;
    if (key === 'color-primary') css += `--h-color-primary-hover:color-mix(in srgb, ${value} 85%, black);`;
  }
  return css;
}

/** Declarations of one node style (screen keys skipped). */
function declarations(style, id, baseUrl, issues) {
  let css = '';
  for (const [name, raw] of Object.entries(style)) {
    const property = name.toLowerCase();
    if (Object.hasOwn(SCREENS, property)) continue;
    if (!isCmsStyleProperty(property)) {
      issues.push(issue('warning', 'style_property', `Style property "${property}" is not allowed`, id));
      continue;
    }
    const value = isScalar(raw) ? scalarText(raw).trim() : '';
    const allowed = value !== '' && isSafeStyleValue(value, property === 'background-image', baseUrl)
      && (property !== 'display' || DISPLAY.includes(value.toLowerCase()));
    if (!allowed) {
      issues.push(issue('warning', 'style_value', `Value of style property "${property}" is not allowed`, id));
      continue;
    }
    css += `${property}:${value};`;
  }
  return css;
}

/** A style value: safe CSS; url() only in background-image, relative or from Heurist. */
function isSafeStyleValue(value, urlAllowed, baseUrl) {
  if (!isSafeCssValue(value)) return false;
  const urls = [...value.matchAll(URL_PATTERN)].map((match) => match[2].trim());
  if (!urls.length) return true;
  if (!urlAllowed) return false;
  return urls.every((url) => {
    const relative = !urlScheme(url) && !url.startsWith('//');
    return relative || (baseUrl !== '' && url.startsWith(baseUrl));
  });
}

/** StoredCss::isSafe for one value. */
function isSafeCss(segment) {
  const text = decodeCssEscapes(segment).toLowerCase();
  const compact = text.replace(/\s+/g, '');
  for (const word of ['expression(', 'behavior:', '-moz-binding', 'javascript:', 'vbscript:', '@charset']) {
    if (compact.includes(word)) return false;
  }
  const urls = [...text.matchAll(URL_PATTERN)].map((match) => match[2].trim());
  if (urls.length !== compact.split('url(').length - 1) return false;
  if (!urls.every(isSafeUrl)) return false;
  const imported = /@import\s+(?:url\(\s*)?['"]?([^'"\s)]*)/.exec(text);
  if (imported) {
    const host = /^(?:[a-z][a-z0-9+.-]*:)?\/\/([^/?#:]+)/.exec(imported[1])?.[1] ?? null;
    if (host !== null && host !== 'fonts.googleapis.com') return false;
  }
  return true;
}

/** Relative, http(s) and raster image data URLs only. */
function isSafeUrl(url) {
  if (/^data:/.test(url)) return /^data:image\/(?:png|gif|jpe?g|webp)[;,]/.test(url);
  const scheme = urlScheme(url);
  return scheme === null || ['http', 'https'].includes(scheme.toLowerCase());
}

/** Scheme of a URL ("https"), or null. */
function urlScheme(url) {
  return /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1] ?? null;
}

/** Decode CSS escapes so the checks see the real characters. */
function decodeCssEscapes(text) {
  return text.replace(/\\(?:([0-9a-f]{1,6})\s?|(.))/gi, (match, hex, char) => {
    if (hex) {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return char ?? '';
  });
}

/** Attributes of a start tag (names lower case, a few entities decoded). */
function tagAttributes(source) {
  const attributes = new Map();
  for (const match of source.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attributes.set(match[1].toLowerCase(), value.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  }
  return attributes;
}

function isMap(value) {
  return value !== null && typeof value === 'object';
}

function isScalar(value) {
  return ['string', 'number', 'boolean'].includes(typeof value);
}

/** Text of a scalar as PHP casts it ((string)true = "1", (string)false = ""). */
function scalarText(value) {
  if (typeof value === 'boolean') return value ? '1' : '';
  return String(value);
}

function issue(level, code, message, node = null) {
  return { level, code, message, node };
}
