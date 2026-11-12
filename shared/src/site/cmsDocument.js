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
  widget: Object.freeze(['menu', 'report', 'cards', 'gallery', 'language', 'actionmenu', 'badges', 'email'])
});

/** Newest instance configuration version. */
export const CMS_CONFIG_VERSION = 1;

/**
 * Website layout (`layout` of the configuration, plan 27f §2-3): allowed values of each setting
 * (CmsValidator::LAYOUT). The first value is the default.
 */
export const CMS_LAYOUT = Object.freeze({
  navigation: Object.freeze(['reload', 'swap', 'scroll']),
  header: Object.freeze({
    // fixed is the default since 2026-11-09 (was `default` = scroll); slide = an expand / collapse button (§13)
    position: Object.freeze(['fixed', 'scroll', 'slide', 'none']),
    orientation: Object.freeze(['horizontal', 'vertical']),
    // the header default set: one row on normal screens, or two (plan 27f §13)
    rows: Object.freeze(['auto', 'two']),
    theme: Object.freeze(['default', 'surface', 'primary', 'selected', 'own'])
  }),
  footer: Object.freeze({
    position: Object.freeze(['default', 'fixed', 'none']),
    theme: Object.freeze(['default', 'surface', 'primary', 'selected', 'own'])
  })
});

/** A colour of the own theme of the header or footer (`layout.header.colors`: bg, text): hex, a name, rgb() or hsl(). */
export const CMS_LAYOUT_COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]{3,20}|(?:rgb|hsl)a?\([0-9\s.,%deg/]+\))$/i;

/**
 * Header height / width and footer height (`layout.header.height|width`, `layout.footer.height`; review 2026-11-10):
 * a number with px, em, rem, vh, vw or % (CmsValidator::LAYOUT_SIZE).
 */
export const CMS_LAYOUT_SIZE = /^\d{1,4}(?:\.\d{1,2})?(?:px|em|rem|vh|vw|%)$/;

/** The layout settings that are sizes (CMS_LAYOUT_SIZE). */
export const CMS_LAYOUT_SIZES = Object.freeze({ header: Object.freeze(['height', 'width']), footer: Object.freeze(['height']) });

/** Pages kept by the navigation mode swap (`layout.cache`): default and limits. */
export const CMS_LAYOUT_CACHE = Object.freeze({ default: 8, min: 1, max: 50 });

/** Base settings (key = CSS variable without "--h-"). */
export const BASE_SETTINGS = Object.freeze([
  'font-family', 'color-text', 'color-bg', 'color-surface', 'color-primary', 'color-link',
  'color-border', 'radius', 'site-font-size', 'site-heading-font', 'site-heading-color', 'site-width',
  'color-selected', 'color-selected-border', 'color-primary-text', 'color-text-muted', 'site-logo-height'
]);

/** Screen sizes of node styles: key => max width (px). */
export const SCREENS = Object.freeze({ medium: 1024, narrow: 640 });

/** Kinds of `styles.kinds` (plan 27c §6a) and their selectors. */
export const CMS_KINDS = Object.freeze({
  group: '[data-h-control="group"]',
  tabs: '[data-h-control="tabs"]',
  accordion: '[data-h-control="accordion"]',
  text: '[data-h-text]:not([data-h-media])',
  media: '[data-h-media]',
  // modules and widgets, not the hosts of menus (nav) and the language switch: the kind default (e.g. min-height 300px)
  // is meant for modules (2026-11-12); :where keeps the specificity of [data-h-instance], so an own style still wins
  instance: '[data-h-instance]:where(:not(nav, .h-site-lang-single):not(:has(> .h-site-lang)))'
});

const PROPERTIES = new Set([
  'display', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'gap', 'flex', 'grid-template-columns',
  'grid-template-rows', 'grid-column', 'grid-row', 'order',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'overflow',
  'border-radius', 'box-shadow', 'text-shadow',
  'color', 'background-color', 'background-image', 'background-position', 'background-repeat', 'background-size', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align'
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
  const empty = { schema: CMS_SCHEMA, instances: {}, styles: {}, media: {} };
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
  if (config.layout != null && !isMap(config.layout)) {
    issues.push(issue('error', 'cms_json', 'The "layout" of the website configuration is not an object'));
    delete config.layout;
  }
  for (const part of ['instances', 'styles', 'media']) {
    if (config[part] != null && !isMap(config[part])) {
      issues.push(issue('error', 'cms_json', `The "${part}" of the website configuration is not an object`));
      config[part] = {};
    }
  }
  config.instances = config.instances ?? {};
  config.styles = config.styles ?? {};
  config.media = config.media ?? {};
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
  const media = isMap(config.media) ? config.media : {};
  const seenMedia = new Set();
  for (const node of nodes) {
    const id = node.node;
    if (id !== '') {
      if (seenNodes.has(id)) issues.push(issue('warning', 'duplicate_node', `Node id "${id}" is used more than once`, id));
      seenNodes.add(id);
      // the value of a field comes from its record, it has no translations here (plan 27e)
      if (node.text && node.field === null) texts.add(id);
    }
    // `record.`: the record of the URL of a record page (plan 27g)
    if (node.field !== null && !/^(website|page|record|\d+)\.\d+(-\d+)?$/.test(node.field)) {
      issues.push(issue('warning', 'field_reference', `Field reference "${node.field}" is not valid`, id));
    }
    // a media element (plan 27c §33): its settings in config.media, one element each
    if (node.media !== null) {
      if (seenMedia.has(node.media)) {
        issues.push(issue('warning', 'duplicate_media', `Media "${node.media}" has more than one element`, id));
      } else if (!Object.hasOwn(media, node.media)) {
        issues.push(issue('warning', 'media_without_config', `Media "${node.media}" has no settings`, id));
      }
      seenMedia.add(node.media);
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
  for (const [mediaId, settings] of Object.entries(media)) {
    if (!seenMedia.has(mediaId)) issues.push(issue('warning', 'media_without_element', `Media "${mediaId}" has no element in the page`));
    const problem = cmsMediaProblem(isMap(settings) ? settings : {});
    if (problem) issues.push(issue('warning', 'media_settings', `Media "${mediaId}": ${problem}`));
  }
  for (const problem of cmsLayoutProblems(isMap(config.layout) ? config.layout : {})) {
    issues.push(issue('warning', 'layout', `Layout: ${problem}`));
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
 * Problems of the layout settings (CmsValidator::layoutProblems): unknown keys and values not in CMS_LAYOUT;
 * `header.colors` / `footer.colors` the own colours {bg, text} (CMS_LAYOUT_COLOR); sizes CMS_LAYOUT_SIZES (CMS_LAYOUT_SIZE);
 * `cache` a whole number in CMS_LAYOUT_CACHE; `hideHeader` / `hideFooter` (a page) true or false.
 *
 * @param {object} layout
 * @returns {string[]}
 */
export function cmsLayoutProblems(layout) {
  const problems = [];
  for (const [key, value] of Object.entries(layout)) {
    if (key === 'navigation') {
      if (!CMS_LAYOUT.navigation.includes(value)) problems.push(`navigation must be ${CMS_LAYOUT.navigation.join(', ')}`);
    } else if (key === 'cache') {
      if (!Number.isInteger(value) || value < CMS_LAYOUT_CACHE.min || value > CMS_LAYOUT_CACHE.max) {
        problems.push(`cache must be a number from ${CMS_LAYOUT_CACHE.min} to ${CMS_LAYOUT_CACHE.max}`);
      }
    } else if (key === 'hideHeader' || key === 'hideFooter') {
      if (typeof value !== 'boolean') problems.push(`${key} must be true or false`);
    } else if (key === 'header' || key === 'footer') {
      if (!isMap(value)) {
        problems.push(`${key} must be an object`);
        continue;
      }
      for (const [name, item] of Object.entries(value)) {
        if (name === 'colors') {
          const bad = !isMap(item) || Object.entries(item).some(([part, colour]) => !['bg', 'text'].includes(part)
            || typeof colour !== 'string' || !CMS_LAYOUT_COLOR.test(colour.trim()));
          if (bad) problems.push(`${key}.colors must be {bg, text} colours`);
          continue;
        }
        if (CMS_LAYOUT_SIZES[key].includes(name)) {
          if (typeof item !== 'string' || !CMS_LAYOUT_SIZE.test(item.trim())) problems.push(`${key}.${name} must be a size such as 120px, 10em or 20%`);
          continue;
        }
        const allowed = CMS_LAYOUT[key][name];
        if (!allowed) problems.push(`unknown setting ${key}.${name}`);
        else if (!allowed.includes(item)) problems.push(`${key}.${name} must be ${allowed.join(', ')}`);
      }
    } else {
      problems.push(`unknown setting ${key}`);
    }
  }
  return problems;
}

/**
 * Why the settings of a media element are not valid (CmsValidator::mediaProblem), or null: `file` the key of a
 * registered file, `width` / `height` 'auto', px or % (attributes of img / video), `action` none or viewer;
 * `playerWidth`, `playerHeight`, `player` of older pages.
 *
 * @param {object} settings
 * @returns {string|null}
 */
export function cmsMediaProblem(settings) {
  if (!/^[A-Za-z0-9]+$/.test(String(settings.file ?? ''))) return 'the file is missing';
  for (const name of ['width', 'height', 'playerWidth', 'playerHeight']) {
    const value = String(settings[name] ?? 'auto');
    if (value !== 'auto' && !/^(?:\d+\.?\d*|\.\d+)(?:px|%)$/.test(value)) return `${name} must be auto, px or %`;
  }
  if (settings.player != null && typeof settings.player !== 'boolean') return 'player must be true or false';
  if (settings.action != null && !['none', 'viewer'].includes(settings.action)) return 'action must be none or viewer';
  return null;
}

/**
 * Elements with data-h-node or data-h-instance, in document order (CmsHtml::nodes).
 *
 * @param {string} html Page HTML fragment.
 * @returns {Array<{node: string, instance: string|null, media: string|null, text: boolean, field: string|null,
 *          control: string|null, tag: string}>}
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
      media: attributes.has('data-h-media') ? attributes.get('data-h-media') : null,
      text: attributes.has('data-h-text'),
      field: attributes.has('data-h-field') ? attributes.get('data-h-field') : null,
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
 * @param {{kinds?: object[], presets?: object[], scope?: string}} [common] Kind defaults and presets, website first,
 *        then the page; `scope`: selector every rule is written below (plan 27f §2.2, e.g. `[data-h-page="5"]`).
 * @returns {{css: string, issues: Array<object>}}
 */
export function compileCmsStyles(base, nodeSets, baseUrl = '', { kinds = [], presets = [], scope = '' } = {}) {
  const issues = [];
  let css = '';
  const prefix = scope ? `${scope} ` : '';
  const variables = baseVariables(base, issues);
  if (variables) css += `${scope || 'html.h-site'}{${variables}}\n`;
  const screens = Object.fromEntries(Object.keys(SCREENS).map((screen) => [screen, '']));
  const rule = (bare, style, id) => {
    const selector = `${prefix}${bare}`;
    const rules = declarations(style, id, baseUrl, issues);
    if (rules) css += `${selector}{${rules}}\n`;
    for (const screen of Object.keys(SCREENS)) {
      if (isMap(style[screen])) {
        const screenRules = declarations(style[screen], id, baseUrl, issues);
        if (screenRules) screens[screen] += `${selector}{${screenRules}}\n`;
      }
    }
  };
  // the screen rules after the rules of their level (kinds, presets, nodes): a node's own style wins on every
  // screen (plan 27c §30); medium first, then narrow
  const flushScreens = () => {
    for (const [screen, width] of Object.entries(SCREENS)) {
      if (screens[screen]) css += `@media (max-width:${width}px){\n${screens[screen]}}\n`;
      screens[screen] = '';
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
  flushScreens();
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
  flushScreens();
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
  flushScreens();
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
