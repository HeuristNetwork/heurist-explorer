/**
 * @file cmsEdit.js
 * @brief Editable document of a v4 website record for the CMS designer (plan 27c §7).
 *
 * A website record holds three HTML parts (header 2-929, home content 2-4, footer 2-940); a
 * page holds one (2-4). All parts of a record share one configuration (2-1187: instances and
 * styles) and one set of translations (2-1202: language => {node id: html}). The designer
 * edits the parts of one record through this model; every operation keeps the
 * configuration and the translations in step (no orphan instances, node styles or
 * translations).
 *
 * HTML is read by a small parser for the well-formed HTML the server stores (HTMLPurifier
 * output); it needs no DOM, so the tests run in node. The inner HTML of text blocks
 * (`data-h-text`) and instance hosts (`data-h-instance`) is kept as it is. Elements with
 * `data-h-node` are the nodes of the structure tree; only the part root and controls
 * (`data-h-control`) take children.
 *
 *   const doc = new CmsRecordDocument({ parts: { content: html }, config: json, translations });
 *   const id = doc.insertElement('content', 'columns2', { id: null, position: 'inside' });
 *   doc.move(id, { id: other, position: 'before' });
 *   const { parts, configuration, translations } = doc.serialize();
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

import { checkCmsDocument, CMS_CONFIG_VERSION, CMS_SCHEMA, parseCmsConfig } from './cmsDocument.js';

/** HTML parts of a record: field key => role. */
export const CMS_PARTS = Object.freeze(['header', 'content', 'footer']);

/** Controls that take children (plan 27c §5.1). */
export const CMS_CONTROLS = Object.freeze(['group', 'tabs', 'accordion']);

/** Elements the designer can add (§5.2). */
export const CMS_ELEMENTS = Object.freeze(['text', 'group', 'columns2', 'columns3', 'tabs', 'accordion', 'explorer',
  'data', 'map', 'timeline', 'graph', 'recordview', 'menu']);

/** Starting content of a new page (plan 27c §15 #4): text and column combinations only. */
export const CMS_PAGE_PRESETS = Object.freeze(['text', 'columns2', 'columns3', 'textColumns2', 'textColumns3']);

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TAGS = new Set(['script', 'style', 'textarea']);
const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const MODULES = ['explorer', 'data', 'map', 'timeline', 'graph', 'recordview'];

/**
 * Parse an HTML fragment into a tree: `{type: 'element', tag, attrs: [[name, value]], children, raw?}` and
 * `{type: 'text', text}` (text, comments). Text blocks, hosts and script/style keep their inner HTML in `raw`.
 *
 * @param {string} html
 * @returns {{type: 'root', children: Array<object>}}
 */
export function parseCmsHtml(html) {
  const root = { type: 'root', children: [] };
  const source = String(html ?? '');
  const stack = [root];
  const pattern = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
  let last = 0;
  let match;
  const top = () => stack[stack.length - 1];
  const addText = (text) => { if (text) top().children.push({ type: 'text', text }); };
  while ((match = pattern.exec(source))) {
    addText(source.slice(last, match.index));
    last = pattern.lastIndex;
    if (match[0].startsWith('<!--')) {
      addText(match[0]);
    } else if (match[1]) {
      const tag = match[1].toLowerCase();
      const index = stack.findLastIndex((node) => node.tag === tag);
      if (index > 0) stack.length = index; // closes it and anything left open inside
    } else {
      const tag = match[2].toLowerCase();
      const element = { type: 'element', tag, attrs: parseAttributes(match[3] || ''), children: [] };
      top().children.push(element);
      if (VOID.has(tag) || match[4] === '/') continue;
      if (RAW_TAGS.has(tag) || hasAttr(element, 'data-h-text') || hasAttr(element, 'data-h-instance')) {
        const end = closingIndex(source, tag, last);
        element.raw = source.slice(last, end.start);
        last = end.end;
        pattern.lastIndex = last;
        continue;
      }
      stack.push(element);
    }
  }
  addText(source.slice(last));
  return root;
}

/**
 * HTML of a tree (or of one element).
 *
 * @param {object} node Root, element or text.
 * @returns {string}
 */
export function serializeCmsHtml(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text;
  if (node.type === 'root') return node.children.map(serializeCmsHtml).join('');
  const attrs = node.attrs.map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join('');
  if (VOID.has(node.tag)) return `<${node.tag}${attrs}>`;
  const inner = node.raw !== undefined ? node.raw : node.children.map(serializeCmsHtml).join('');
  return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
}

/** A new node or instance id that is not in `used`: prefix + 6 characters (as WebsiteStarter::id). */
export function newCmsId(prefix, used = new Set()) {
  for (;;) {
    let id = prefix;
    for (let index = 0; index < 6; index++) id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    if (!used.has(id)) return id;
  }
}

/** Editable website or page record: its HTML parts, configuration and translations. */
export class CmsRecordDocument {
  /**
   * @param {object} options
   * @param {Object<string, string>} options.parts HTML by part: `content`, and `header` / `footer` for a website.
   * @param {string|object} [options.config] Configuration (2-1187), JSON or object.
   * @param {Object<string, Object<string, string>>} [options.translations] Language => {node id: html}.
   */
  constructor({ parts = {}, config = '', translations = {} } = {}) {
    this.roots = {};
    for (const name of CMS_PARTS) {
      if (typeof parts[name] === 'string') this.roots[name] = parseCmsHtml(parts[name]);
    }
    const parsed = typeof config === 'string' ? parseCmsConfig(config) : { config: clone(config), issues: [] };
    this.config = parsed.config;
    this.config.instances = isMap(this.config.instances) ? this.config.instances : {};
    this.config.styles = isMap(this.config.styles) ? this.config.styles : {};
    this.configIssues = parsed.issues;
    this.translations = clone(isMap(translations) ? translations : {});
  }

  /** Part names of this record, in page order. */
  partNames() {
    return CMS_PARTS.filter((name) => this.roots[name]);
  }

  /**
   * A snapshot of the whole document (undo).
   *
   * @returns {string}
   */
  snapshot() {
    return JSON.stringify({ roots: this.roots, config: this.config, translations: this.translations });
  }

  /** Go back to a snapshot. */
  restore(snapshot) {
    const state = JSON.parse(snapshot);
    this.roots = state.roots;
    this.config = state.config;
    this.translations = state.translations;
  }

  /**
   * Values to save: HTML of the parts, the configuration JSON and the translations by language.
   *
   * @returns {{parts: Object<string, string>, configuration: string, translations: Object<string, object>}}
   */
  serialize() {
    const parts = {};
    for (const name of this.partNames()) parts[name] = serializeCmsHtml(this.roots[name]);
    const config = { ...this.config, schema: CMS_SCHEMA };
    for (const key of ['instances', 'styles']) if (isMap(config[key]) && !Object.keys(config[key]).length) config[key] = {};
    const translations = {};
    for (const [language, blocks] of Object.entries(this.translations)) {
      if (isMap(blocks) && Object.keys(blocks).length) translations[language] = blocks;
    }
    return { parts, configuration: JSON.stringify(config), translations };
  }

  /**
   * HTML of a part, with the translations of a language put into the text blocks (preview).
   *
   * @param {string} part
   * @param {string|null} [language] Language of the translations; null = the original.
   */
  html(part, language = null) {
    const root = this.roots[part];
    if (!root) return '';
    const texts = language ? this.translations[language] || {} : null;
    if (!texts || !Object.keys(texts).length) return serializeCmsHtml(root);
    const copy = clone(root);
    walk(copy, (node) => {
      const id = attr(node, 'data-h-node');
      if (hasAttr(node, 'data-h-text') && id && typeof texts[id] === 'string') node.raw = texts[id];
    });
    return serializeCmsHtml(copy);
  }

  /**
   * The structure tree of a part: nodes with their kind, label and children.
   *
   * @param {string} part
   * @returns {Array<{id: string, kind: string, tag: string, label: string, control: string|null, instance: string|null,
   *          type: string|null, preset: string|null, configured: boolean, children: Array}>}
   */
  tree(part) {
    const root = this.roots[part];
    return root ? this._items(root) : [];
  }

  _items(container) {
    const items = [];
    for (const child of container.children) {
      if (child.type !== 'element') continue;
      const id = attr(child, 'data-h-node');
      if (!id) {
        items.push(...this._items(child)); // a wrapper without an id: its nodes go up
        continue;
      }
      const instanceId = attr(child, 'data-h-instance');
      const instance = instanceId ? this.config.instances[instanceId] : null;
      items.push({
        id,
        kind: kindOf(child),
        tag: child.tag,
        label: labelOf(child, instance),
        control: attr(child, 'data-h-control'),
        instance: instanceId,
        type: instance?.type || null,
        preset: attr(child, 'data-h-style'),
        configured: !instanceId || isConfigured(instance),
        children: child.raw === undefined ? this._items(child) : []
      });
    }
    return items;
  }

  /**
   * An element by node id: the element, its parent and part.
   *
   * @returns {{node: object, parent: object, part: string}|null}
   */
  find(id) {
    for (const part of this.partNames()) {
      const found = findNode(this.roots[part], id);
      if (found) return { ...found, part };
    }
    return null;
  }

  /** Whether an element (node id; null = the part root) takes children. */
  isContainer(id) {
    if (id == null) return true;
    const node = this.find(id)?.node;
    return Boolean(node) && node.raw === undefined && CMS_CONTROLS.includes(attr(node, 'data-h-control'));
  }

  /**
   * Whether a node may be put at a place: inside a container (last child), or before / after a node. Never into
   * itself or one of its descendants.
   *
   * @param {string} id Node to move.
   * @param {{id: string|null, position: 'inside'|'before'|'after', part?: string}} target
   */
  canDrop(id, target) {
    const moving = this.find(id);
    if (!moving) return false;
    if (target.id === id) return false;
    if (target.id != null && findNode(moving.node, target.id)) return false;
    if (target.position === 'inside') return this.isContainer(target.id);
    return target.id != null && Boolean(this.find(target.id));
  }

  /**
   * Add an element (§5.2) at a place: inside the target container (last child), before or after the target node.
   *
   * @param {string} part Part of the place when the target is the root.
   * @param {string} element One of CMS_ELEMENTS.
   * @param {{id: string|null, position: 'inside'|'before'|'after'}} target
   * @returns {string} Node id of the new element.
   */
  insertElement(part, element, target = { id: null, position: 'inside' }) {
    const node = this._create(element);
    this._place(part, node, target);
    return attr(node, 'data-h-node');
  }

  /**
   * Move a node.
   *
   * @param {string} id
   * @param {{id: string|null, position: 'inside'|'before'|'after', part?: string}} target
   * @returns {boolean} False when the place is not allowed.
   */
  move(id, target) {
    if (!this.canDrop(id, target)) return false;
    const moving = this.find(id);
    removeChild(moving.parent, moving.node);
    this._place(target.part || moving.part, moving.node, target);
    return true;
  }

  /**
   * Remove a node with its descendants, their node styles, translations and instances.
   *
   * @returns {boolean}
   */
  remove(id) {
    const found = this.find(id);
    if (!found) return false;
    removeChild(found.parent, found.node);
    const { nodes, instances } = idsIn(found.node);
    for (const nodeId of nodes) {
      if (isMap(this.config.styles.nodes)) delete this.config.styles.nodes[nodeId];
      for (const blocks of Object.values(this.translations)) if (isMap(blocks)) delete blocks[nodeId];
    }
    const hosts = this._instanceHosts();
    for (const instanceId of instances) if (!hosts.has(instanceId)) delete this.config.instances[instanceId];
    return true;
  }

  /**
   * Copy a node (§5.3). *structure*: containers and text blocks with styles and presets, texts empty;
   * *all*: with texts and translations. Instances become new instances of the same type with default settings.
   *
   * @param {string} id
   * @param {'structure'|'all'} [mode]
   * @returns {object|null} Clipboard value, or null (an instance alone can not be copied).
   */
  copy(id, mode = 'all') {
    const found = this.find(id);
    if (!found || hasAttr(found.node, 'data-h-instance')) return null;
    const node = clone(found.node);
    const styles = {};
    const translations = {};
    const instances = {};
    walk(node, (element) => {
      const nodeId = attr(element, 'data-h-node');
      if (nodeId && isMap(this.config.styles.nodes?.[nodeId])) styles[nodeId] = clone(this.config.styles.nodes[nodeId]);
      if (hasAttr(element, 'data-h-text')) {
        if (mode === 'structure') {
          element.raw = placeholderText(element);
        } else if (nodeId) {
          for (const [language, blocks] of Object.entries(this.translations)) {
            if (typeof blocks?.[nodeId] === 'string') (translations[language] ||= {})[nodeId] = blocks[nodeId];
          }
        }
      }
      const instanceId = attr(element, 'data-h-instance');
      if (instanceId) {
        const instance = this.config.instances[instanceId];
        instances[instanceId] = { kind: instance?.kind || 'module', type: instance?.type || 'data' };
      }
    });
    return { format: 'heurist-cms-clip', mode, sourceId: id, html: serializeCmsHtml(node), styles, translations, instances };
  }

  /**
   * Paste a clipboard value with new ids. Not into the copied node itself or one of its descendants.
   *
   * @param {object} clip Value of copy().
   * @param {string} part Part of the place when the target is the root.
   * @param {{id: string|null, position: 'inside'|'before'|'after'}} target
   * @returns {string|null} Node id of the pasted element, or null when the place is not allowed.
   */
  paste(clip, part, target) {
    if (clip?.format !== 'heurist-cms-clip') return null;
    const source = clip.sourceId ? this.find(clip.sourceId) : null;
    if (source && target.id != null && findNode(source.node, target.id)) return null;
    if (target.position === 'inside' ? !this.isContainer(target.id) : !this.find(target.id)) return null;
    const node = parseCmsHtml(clip.html).children.find((child) => child.type === 'element');
    if (!node) return null;
    const used = this._usedIds();
    walk(node, (element) => {
      const oldId = attr(element, 'data-h-node');
      if (oldId) {
        const nodeId = newCmsId('n', used);
        used.add(nodeId);
        setAttr(element, 'data-h-node', nodeId);
        if (isMap(clip.styles?.[oldId])) this._nodeStyles()[nodeId] = clone(clip.styles[oldId]);
        for (const [language, blocks] of Object.entries(clip.translations || {})) {
          if (typeof blocks?.[oldId] === 'string') (this.translations[language] ||= {})[nodeId] = blocks[oldId];
        }
      }
      const oldInstance = attr(element, 'data-h-instance');
      if (oldInstance) {
        const instanceId = newCmsId('i', used);
        used.add(instanceId);
        setAttr(element, 'data-h-instance', instanceId);
        element.raw = '';
        const { kind, type } = clip.instances?.[oldInstance] || { kind: 'module', type: 'data' };
        this.config.instances[instanceId] = defaultInstance(kind, type);
      }
    });
    this._place(part, node, target);
    return attr(node, 'data-h-node');
  }

  /** Inner HTML of a text block. */
  text(id) {
    const node = this.find(id)?.node;
    return node && hasAttr(node, 'data-h-text') ? node.raw || '' : '';
  }

  /** Set the inner HTML of a text block. */
  setText(id, html) {
    const node = this.find(id)?.node;
    if (!node || !hasAttr(node, 'data-h-text')) return false;
    node.raw = String(html ?? '');
    return true;
  }

  /** Translation of a text block, or ''. */
  translation(language, id) {
    return String(this.translations[language]?.[id] ?? '');
  }

  /** Set (or remove with an empty value) the translation of a text block. */
  setTranslation(language, id, html) {
    const text = String(html ?? '');
    if (!text.trim()) {
      if (this.translations[language]) delete this.translations[language][id];
      return;
    }
    (this.translations[language] ||= {})[id] = text;
  }

  /** Own style of a node (a copy), or {}. */
  nodeStyle(id) {
    return clone(this.config.styles.nodes?.[id] || {});
  }

  /** Set the own style of a node; an empty style removes it. */
  setNodeStyle(id, style) {
    if (isMap(style) && Object.keys(style).length) {
      this._nodeStyles()[id] = clone(style);
    } else if (isMap(this.config.styles.nodes)) {
      delete this.config.styles.nodes[id];
    }
  }

  /** Set the preset of a node (`data-h-style`); null removes it. */
  setPreset(id, name) {
    const node = this.find(id)?.node;
    if (!node) return false;
    if (name) setAttr(node, 'data-h-style', name); else removeAttr(node, 'data-h-style');
    return true;
  }

  /** Kind defaults (`styles.kinds`, a copy). */
  kinds() {
    return clone(this.config.styles.kinds || {});
  }

  /** Presets (`styles.presets`, a copy). */
  presets() {
    return clone(this.config.styles.presets || {});
  }

  /** Base settings (`styles.base`, a copy). */
  base() {
    return clone(this.config.styles.base || {});
  }

  /** Replace kind defaults, presets and / or base settings (the Styles dialog). */
  setCommonStyles({ base, kinds, presets } = {}) {
    if (base !== undefined) this.config.styles.base = clone(base || {});
    if (kinds !== undefined) this.config.styles.kinds = clone(kinds || {});
    if (presets !== undefined) this.config.styles.presets = clone(presets || {});
  }

  /** Configuration of an instance (a copy), or null. */
  instance(instanceId) {
    const instance = this.config.instances[instanceId];
    return instance ? clone(instance) : null;
  }

  /** Set the settings and state of an instance. */
  setInstance(instanceId, { settings, state } = {}) {
    const instance = this.config.instances[instanceId];
    if (!instance) return false;
    if (settings !== undefined) instance.settings = clone(settings || {});
    if (state !== undefined) instance.state = state == null ? null : clone(state);
    return true;
  }

  /**
   * Problems of the record (checkCmsDocument).
   *
   * @param {string} [baseUrl] Heurist base URL (background images).
   * @param {string[]} [otherInstances] Instances configured on the website (a page's header menu...).
   */
  check(baseUrl = '', otherInstances = []) {
    const parts = this.partNames().map((name) => serializeCmsHtml(this.roots[name]));
    return [...this.configIssues, ...checkCmsDocument(this.config, parts, this.translations, baseUrl, otherInstances)];
  }

  _create(element) {
    const used = this._usedIds();
    const id = (prefix) => {
      const value = newCmsId(prefix, used);
      used.add(value);
      return value;
    };
    const text = (html = '<p>Text</p>', tag = 'div') => element$(tag, [['data-h-node', id('n')], ['data-h-text', '']], html);
    const group = (children = [], preset = null, tag = 'div') => {
      const attrs = [['data-h-node', id('n')], ['data-h-control', 'group']];
      if (preset) attrs.push(['data-h-style', preset]);
      return element$(tag, attrs, undefined, children);
    };
    switch (element) {
      case 'text': return text();
      case 'group': return group();
      case 'columns2': return group([text(), text()], 'columns2');
      case 'columns3': return group([text(), text(), text()], 'columns3');
      case 'tabs':
        return element$('div', [['data-h-node', id('n')], ['data-h-control', 'tabs']], undefined, [1, 2].map((number) =>
          group([text(`Tab ${number}`, 'h3'), text()], null, 'section')));
      case 'accordion':
        return element$('div', [['data-h-node', id('n')], ['data-h-control', 'accordion']], undefined, [1, 2].map((number) =>
          group([text(`Section ${number}`, 'summary'), text()], null, 'details')));
      case 'menu': {
        const instanceId = id('i');
        const nodeId = id('n');
        this.config.instances[instanceId] = defaultInstance('widget', 'menu');
        // a widget host: not the min-height of the instance kind (WebsiteStarter does the same)
        this._nodeStyles()[nodeId] = { 'min-height': '0' };
        return element$('nav', [['data-h-node', nodeId], ['data-h-instance', instanceId]], '');
      }
      default: {
        if (!MODULES.includes(element)) throw new Error(`Unknown element "${element}"`);
        const instanceId = id('i');
        this.config.instances[instanceId] = defaultInstance('module', element);
        return element$('div', [['data-h-node', id('n')], ['data-h-instance', instanceId]], '');
      }
    }
  }

  _place(part, node, target) {
    let parent;
    let index;
    if (target.position === 'inside') {
      parent = target.id == null ? this.roots[part] : this.find(target.id)?.node;
      if (!parent) throw new Error(`No part or container for ${target.id ?? part}`);
      index = parent.children.length;
    } else {
      const found = this.find(target.id);
      if (!found) throw new Error(`No node ${target.id}`);
      parent = found.parent;
      index = parent.children.indexOf(found.node) + (target.position === 'after' ? 1 : 0);
    }
    parent.children.splice(index, 0, node);
  }

  _nodeStyles() {
    if (!isMap(this.config.styles.nodes)) this.config.styles.nodes = {};
    return this.config.styles.nodes;
  }

  _usedIds() {
    const used = new Set(Object.keys(this.config.instances));
    for (const part of this.partNames()) {
      const { nodes, instances } = idsIn(this.roots[part]);
      for (const value of [...nodes, ...instances]) used.add(value);
    }
    return used;
  }

  _instanceHosts() {
    const hosts = new Set();
    for (const part of this.partNames()) for (const value of idsIn(this.roots[part]).instances) hosts.add(value);
    return hosts;
  }
}

/**
 * Content and configuration of a new page from a page preset (plan 27c §4).
 *
 * @param {string} preset One of CMS_PAGE_PRESETS.
 * @param {string} title Page title (the first heading).
 * @returns {{content: string, configuration: string}}
 */
export function cmsPageStarter(preset, title) {
  const doc = new CmsRecordDocument({ parts: { content: '' }, config: { schema: CMS_SCHEMA, instances: {}, styles: {} } });
  const heading = doc.insertElement('content', 'text');
  doc.setText(heading, `<h1>${escapeText(title || 'Page')}</h1>`);
  if (preset === 'columns2' || preset === 'textColumns2') {
    if (preset === 'textColumns2') doc.insertElement('content', 'text');
    doc.insertElement('content', 'columns2');
  } else if (preset === 'columns3' || preset === 'textColumns3') {
    if (preset === 'textColumns3') doc.insertElement('content', 'text');
    doc.insertElement('content', 'columns3');
  } else {
    doc.insertElement('content', 'text');
  }
  const { parts, configuration } = doc.serialize();
  return { content: parts.content, configuration };
}

/** Kind of an element: control, text, instance or other. */
function kindOf(node) {
  if (hasAttr(node, 'data-h-instance')) return 'instance';
  if (hasAttr(node, 'data-h-text')) return 'text';
  if (hasAttr(node, 'data-h-control')) return 'control';
  return 'other';
}

/** Short label of a tree item. */
function labelOf(node, instance) {
  if (hasAttr(node, 'data-h-instance')) return instance?.type || 'instance';
  if (hasAttr(node, 'data-h-text')) {
    const text = plain(node.raw || '');
    return text.length > 40 ? `${text.slice(0, 40)}…` : text || '(empty text)';
  }
  const control = attr(node, 'data-h-control');
  if (control) {
    const heading = node.children.find((child) => child.type === 'element' && (HEADINGS.includes(child.tag) || child.tag === 'summary'));
    const title = heading ? plain(heading.raw ?? serializeCmsHtml(heading)) : '';
    return title ? `${control}: ${title}` : control;
  }
  return node.tag;
}

/** A configured instance: has settings (a pasted or new one has none). */
function isConfigured(instance) {
  if (!instance) return false;
  if (instance.kind === 'widget') return true;
  return isMap(instance.settings) && Object.keys(instance.settings).length > 0;
}

function defaultInstance(kind, type) {
  return { kind, type, configVersion: CMS_CONFIG_VERSION, settings: {}, state: null };
}

/** Placeholder text of an emptied text block (copy structure): its heading stays a heading. */
function placeholderText(node) {
  if (HEADINGS.includes(node.tag) || node.tag === 'summary') return 'Title';
  return '<p>Text</p>';
}

function element$(tag, attrs, raw, children = []) {
  const node = { type: 'element', tag, attrs, children };
  if (raw !== undefined) node.raw = raw;
  return node;
}

function findNode(container, id) {
  for (const child of container.children || []) {
    if (child.type !== 'element') continue;
    if (attr(child, 'data-h-node') === id) return { node: child, parent: container };
    const found = child.raw === undefined ? findNode(child, id) : null;
    if (found) return found;
  }
  if (container.type === 'element' && attr(container, 'data-h-node') === id) return { node: container, parent: null };
  return null;
}

function removeChild(parent, node) {
  const index = parent.children.indexOf(node);
  if (index >= 0) parent.children.splice(index, 1);
}

function walk(node, visit) {
  if (node.type === 'element') visit(node);
  if (node.raw === undefined) for (const child of node.children || []) if (child.type === 'element') walk(child, visit);
}

function idsIn(node) {
  const nodes = [];
  const instances = [];
  walk(node, (element) => {
    const id = attr(element, 'data-h-node');
    if (id) nodes.push(id);
    const instance = attr(element, 'data-h-instance');
    if (instance) instances.push(instance);
  });
  return { nodes, instances };
}

function closingIndex(source, tag, from) {
  const pattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  pattern.lastIndex = from;
  let depth = 1;
  let match;
  while ((match = pattern.exec(source))) {
    if (match[1]) depth--; else if (!match[0].endsWith('/>')) depth++;
    if (depth === 0) return { start: match.index, end: pattern.lastIndex };
  }
  return { start: source.length, end: source.length };
}

function parseAttributes(source) {
  const attrs = [];
  for (const match of source.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    attrs.push([match[1].toLowerCase(), decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')]);
  }
  return attrs;
}

function attr(node, name) {
  const found = node?.attrs?.find(([key]) => key === name);
  return found ? found[1] : null;
}

function hasAttr(node, name) {
  return Boolean(node?.attrs?.some(([key]) => key === name));
}

function setAttr(node, name, value) {
  const found = node.attrs.find(([key]) => key === name);
  if (found) found[1] = String(value); else node.attrs.push([name, String(value)]);
}

function removeAttr(node, name) {
  node.attrs = node.attrs.filter(([key]) => key !== name);
}

function decodeEntities(text) {
  return text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plain(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isMap(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
