/**
 * @file CmsPreview.js
 * @brief Preview of the CMS designer (plan 27c §6): the server page in design mode in an iframe, with the draft
 *        applied without reloads.
 *
 * The iframe loads `/{db}/site/{id}[/{page}]?design=1[&lang=]`. The page runtime finds `window.hCmsDesigner` of
 * this window and gives its design hooks (apps/website/src/siteRuntime.js `designHooks`). After a change the
 * designer calls apply(): the HTML of the header, main and footer of the page is replaced with the draft, the
 * controls (tabs, accordions) are enhanced again and the instance hosts get their mounted instances back (they
 * are not mounted again unless their configuration changed); the node styles are compiled again into the page's
 * `<style id="h-site-styles">`. A veil marks the node under the mouse in the tree, and the other way round. Links do not
 * leave the preview; a link of a navigation widget (website menu, action menu, breadcrumbs, logo / title of the header)
 * to a page of this website is given to the designer, which opens that page (plan 27k §13, NAVIGATION_LINKS).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { compileCmsStyles } from '#shared/site/cmsDocument.js';
import { resolveFileUrls } from '#shared/data/fileUrls.js';

/** Containers of the parts in the page (srv PageRenderer); the content is in the section of the page (plan 27f §2.2). */
const CONTAINERS = Object.freeze({ header: '.h-site-header', content: '.h-site-main > .h-site-page', footer: '.h-site-footer' });

/**
 * Navigation widgets of a page whose links open their page in the designer (plan 27k §13, agreed 2026-11-16): the website
 * menu and action menus (also the open collapsed panel and the full-screen overlay), breadcrumbs, the logo and title of
 * the header. Links in texts, Record cards and media keep selecting their element.
 */
const NAVIGATION_LINKS = '.h-site-menu, .h-site-menu-overlay, .h-site-breadcrumbs, .h-site-logo, .h-site-title';

/**
 * The page of this website a link opens (plan 27k §13): the pretty URL `/{db}/site/{site}[/{page}[/{record}]]` or
 * `?db=&site=&pageid=&rec=` (SiteUrls::page); the query of a Saved filter and the language are ignored.
 *
 * @param {string} href The link (absolute or relative).
 * @param {{database?: string, siteId?: number}} [site] The database and the website of the preview.
 * @returns {{pageId: number, record: number}|null} `pageId` 0: the website itself (home or the Startup page); null: not
 *          a page of this website.
 */
export function previewPageOf(href, { database = '', siteId = 0 } = {}) {
  let url;
  try {
    url = new URL(String(href ?? ''), 'http://preview.invalid/');
  } catch {
    return null;
  }
  let site = 0;
  let page = 0;
  let record = 0;
  const pretty = /\/([^/]+)\/site\/(\d+)(?:\/(\d+)(?:\/(\d+))?)?\/?$/.exec(url.pathname);
  if (pretty) {
    if (decodeURIComponent(pretty[1]) !== String(database)) return null;
    [site, page, record] = [pretty[2], pretty[3], pretty[4]].map((value) => Number(value) || 0);
  } else if (url.searchParams.has('site')) {
    if (url.searchParams.get('db') !== String(database)) return null;
    [site, page, record] = ['site', 'pageid', 'rec'].map((name) => Number(url.searchParams.get(name)) || 0);
  } else {
    return null;
  }
  if (!site || site !== Number(siteId)) return null;
  return { pageId: page, record };
}

/** Preview widths of the page toolbar (§5.1): 1024 and 640 are the medium / narrow screens. */
export const PREVIEW_WIDTHS = Object.freeze([0, 1280, 1024, 640, 375]);

/**
 * The values the server wrote into the Record field elements of a page, in the language of the page (plan 27e §23).
 *
 * @param {HTMLElement|Document} root The loaded page.
 * @returns {Map<string, string>} HTML by reference (`data-h-field`).
 */
export function readFieldValues(root) {
  return new Map([...root.querySelectorAll('[data-h-field]')].map((element) => [element.getAttribute('data-h-field'), element.innerHTML]));
}

/**
 * Put these values into the Record field elements of a draft: the draft has only the snapshot of one language.
 *
 * @param {HTMLElement} root The draft of a part.
 * @param {Map<string, string>} values See readFieldValues.
 * @returns {boolean} Whether an element has a reference the server does not know yet (it shows its snapshot).
 */
export function restoreFieldValues(root, values) {
  let unknown = false;
  for (const element of root.querySelectorAll('[data-h-field]')) {
    const reference = element.getAttribute('data-h-field');
    if (values.has(reference)) element.innerHTML = values.get(reference);
    else unknown = true;
  }
  return unknown;
}

/** The preview iframe of the designer. */
export class CmsPreview {
  /**
   * @param {HTMLElement} container Center pane.
   * @param {object} options
   * @param {string} [options.baseUrl] Heurist base URL (background images of styles).
   * @param {(id: string|null) => void} [options.onHover] A node under the mouse in the preview.
   * @param {(id: string) => void} [options.onSelect] A node clicked in the preview.
   * @param {(target: {pageId: number, record: number}) => void} [options.onNavigate] A link of a navigation widget to a
   *        page of this website was clicked (plan 27k §13, previewPageOf).
   * @param {(code: string) => void} [options.onLanguage] A language was chosen in the language switch of the page
   *        (plan 27k §13.1): the designer loads the preview in it (else the page would leave design mode).
   * @param {() => void} [options.onReady] The page is loaded and has its design hooks.
   * @param {() => void} [options.onUnavailable] The page loaded but did not connect (another origin).
   */
  constructor(container, options = {}) {
    this.options = options;
    this.container = container;
    this.frame = document.createElement('iframe');
    this.frame.className = 'h-cms-preview-frame';
    this.frame.title = 'Preview';
    this.box = document.createElement('div');
    this.box.className = 'h-cms-preview';
    this.box.append(this.frame);
    container.append(this.box);
    // the page did not connect (another origin, e.g. a dev server): the preview shows the saved page only
    this.frame.addEventListener('load', () => {
      const url = this.frame.src;
      setTimeout(() => {
        if (!this.hooks && this.frame.src === url && url && url !== 'about:blank') this.options.onUnavailable?.();
      }, 3000);
    });
    this.hooks = null;
    this.win = null;
    this.mountedConfig = new Map();
    // the instance configuration each mounted instance has (applySettings: what changed, review 2026-11-15)
    this.mountedInstances = new Map();
    this.fieldValues = new Map();
    // a Record field of the draft has no value of the server yet: a new load after Save gives it
    this.unknownField = false;
    this._previous = globalThis.window?.hCmsDesigner;
    if (globalThis.window) {
      globalThis.window.hCmsDesigner = { previewReady: (win, hooks) => this._ready(win, hooks) };
    }
  }

  /** Load a page (another part, Discard, another language). */
  load(url) {
    this.hooks = null;
    this.win = null;
    this.mountedConfig.clear();
    this.mountedInstances.clear();
    this.fieldValues.clear();
    this.unknownField = false;
    this.frame.src = url;
  }

  /** Width of the page: 0 = full width. */
  setWidth(pixels) {
    this.frame.style.width = pixels ? `${pixels}px` : '100%';
    this.box.classList.toggle('h-cms-preview-fixed', Boolean(pixels));
  }

  /**
   * Put the draft into the page.
   *
   * @param {object} draft
   * @param {Object<string, string>} draft.parts HTML by part (header, content, footer) to show.
   * @param {Object<string, object>} draft.instances Configured instances of the shown records.
   * @param {{base: object, nodes: object[], kinds: object[], presets: object[], page?: {id: number, style: object}}} draft.styles
   *        Styles, website first; `page`: the own style of the page (its section).
   */
  apply({ parts = {}, instances = {}, styles = null } = {}) {
    const doc = this.win?.document;
    if (!doc || !this.hooks) return;
    const config = { ...this.hooks.config, instances: { ...(this.hooks.config.instances || {}), ...instances } };
    this.unknownField = false;
    for (const [part, html] of Object.entries(parts)) {
      // a page written before plan 27f has no section
      const container = doc.querySelector(CONTAINERS[part]) || (part === 'content' ? doc.querySelector('.h-site-main') : null);
      if (!container || html === undefined) continue;
      const kept = new Map();
      for (const host of container.querySelectorAll('[data-h-instance]')) kept.set(host.getAttribute('data-h-instance'), host);
      const before = new Set(kept.keys());
      // the expand / collapse button of a slide out header (site runtime) is not part of the draft
      const toggle = container.querySelector(':scope > .h-site-header-toggle');
      // the new content goes in beside the old one: a kept instance is moved into it without leaving the document
      // (moveBefore keeps its iframes running; review 2026-11-15: a moved iframe was loaded again and its module lost
      // Explorer, so Map, Graph and Timeline of an Explorer got no new results), then the old content goes
      const oldNodes = [...container.childNodes].filter((node) => node !== toggle);
      const template = doc.createElement('template');
      // stored file URLs (./api/… or legacy ?file=) made absolute: the preview page is not the Heurist base (plan 34)
      template.innerHTML = resolveFileUrls(html, { baseUrl: this.options.baseUrl || '' });
      const fresh = [...template.content.querySelectorAll('[data-h-instance]')];
      container.append(template.content);
      const canMove = typeof container.moveBefore === 'function';
      const mounts = [];
      // kept hosts moved into the new content: not removed with the old content (a host may be a child of the part)
      const moved = new Set();
      for (const host of fresh) {
        const id = host.getAttribute('data-h-instance');
        const settings = instanceKey(config.instances[id]);
        // without moveBefore an instance with iframes is mounted again (a moved iframe loses its module)
        const old = kept.get(id) && (canMove || !kept.get(id).querySelector('iframe')) ? kept.get(id) : null;
        // new settings of a mounted module: given to it, not mounted again (review 2026-11-15)
        const applied = old && this.mountedConfig.get(id) !== settings
          && this.hooks.applySettings?.(id, this.mountedInstances.get(id) || null, config.instances[id]) === true;
        if (old && (applied || this.mountedConfig.get(id) === settings)) {
          if (applied) {
            this.mountedConfig.set(id, settings);
            this.mountedInstances.set(id, clone(config.instances[id]));
          }
          for (const name of ['data-h-node', 'data-h-style']) {
            if (host.hasAttribute(name)) old.setAttribute(name, host.getAttribute(name)); else old.removeAttribute(name);
          }
          // custom CSS classes of the element; the classes of the site runtime and its widgets (h-site-..., h-slider,
          // h-widget h-filter ...) stay (review 2026-11-16: HFilter lost h-filter, its hidden list was shown again)
          old.className = [...new Set([...[...old.classList].filter((name) => name.startsWith('h-')), ...host.classList])].join(' ');
          if (canMove) {
            host.parentNode.moveBefore(old, host);
            host.remove();
          } else {
            host.replaceWith(old);
          }
          moved.add(old);
          before.delete(id);
          continue;
        }
        // mounted again with new settings: the old instance goes
        if (before.delete(id)) this.hooks.unmountInstance?.(id);
        this.mountedConfig.set(id, settings);
        this.mountedInstances.set(id, clone(config.instances[id]));
        mounts.push([host, id]);
      }
      for (const node of oldNodes) {
        if (!moved.has(node)) node.remove();
      }
      if (toggle) container.prepend(toggle);
      if (restoreFieldValues(container, this.fieldValues)) this.unknownField = true;
      this.hooks.enhance(container);
      for (const [host, id] of mounts) {
        void this.hooks.mountInstance(host, id, config).catch((error) => console.warn('Preview: instance not mounted', id, error));
      }
      // hosts removed by the draft
      for (const id of before) {
        this.hooks.unmountInstance?.(id);
        this.mountedConfig.delete(id);
        this.mountedInstances.delete(id);
      }
    }
    if (styles) this.restyle(styles);
    this.highlight(this._highlighted || null);
  }

  /**
   * The hide flags of the page as classes of the body (PageRenderer::bodyClasses, plan 27f §3): the inline page form
   * shows them at once (plan 27i §10).
   *
   * @param {{hideHeader?: boolean, hideFooter?: boolean}} flags
   */
  setPageFlags({ hideHeader = false, hideFooter = false } = {}) {
    const body = this.win?.document?.body;
    if (!body) return;
    body.classList.toggle('h-site-hide-header', hideHeader);
    body.classList.toggle('h-site-hide-footer', hideFooter);
  }

  /** Compile the styles again into the page. */
  restyle({ base = {}, nodes = [], kinds = [], presets = [], page = null, parts = null }) {
    const doc = this.win?.document;
    const element = doc?.getElementById('h-site-styles');
    if (element) element.textContent = `\n${compileCmsStyles(base, nodes, this.options.baseUrl || '', { kinds, presets, page, parts }).css}`;
    // the page styles of the server (below the section, plan 27f) are in the draft now
    doc?.getElementById('h-page-styles')?.remove();
  }

  /** Mark a node in the preview (veil), or none. */
  /**
   * Show the Reveal effect of an element once (review 27n §14.2): the preview of the designer does not reveal elements; a
   * list of cards or a gallery (its box is `display: contents`) reveals its items.
   *
   * @param {string} id Node id.
   */
  playReveal(id) {
    const win = this.win;
    const target = id ? win?.document?.querySelector(`[data-h-node="${cssEscape(id)}"]`) : null;
    const effect = target?.getAttribute('data-h-reveal');
    if (!target || !effect || effect === 'hidden') return;
    const items = target.classList.contains('h-site-widget-list') ? [...target.children] : [target];
    // the effect as on the website (style.css): 1.2 s, 40px; the items of a list one after another
    const from = { up: 'translateY(40px)', down: 'translateY(-40px)', left: 'translateX(-40px)', right: 'translateX(40px)',
      zoom: 'scale(0.9)' }[effect] || 'none';
    items.forEach((item, index) => {
      item.animate?.([{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }],
        { duration: 1200, easing: 'ease', delay: Math.min(index, 8) * 120, fill: 'backwards' });
    });
  }

  highlight(id) {
    this._highlighted = id;
    const doc = this.win?.document;
    if (!doc) return;
    let veil = doc.getElementById('h-cms-veil');
    const target = id ? doc.querySelector(`[data-h-node="${cssEscape(id)}"]`) : null;
    if (!target) {
      if (veil) veil.hidden = true;
      return;
    }
    if (!veil) {
      veil = doc.createElement('div');
      veil.id = 'h-cms-veil';
      veil.setAttribute('style', 'position:absolute;pointer-events:none;z-index:2147483646;border:2px solid #1e88e5;'
        + 'background:rgba(30,136,229,0.08);box-sizing:border-box');
      doc.body.append(veil);
    }
    const box = target.getBoundingClientRect();
    const scrollX = this.win.scrollX || 0;
    const scrollY = this.win.scrollY || 0;
    Object.assign(veil.style, { left: `${box.left + scrollX}px`, top: `${box.top + scrollY}px`, width: `${box.width}px`, height: `${box.height}px` });
    veil.hidden = false;
  }

  /** Show a node (scroll it into view). */
  reveal(id) {
    const target = id ? this.win?.document?.querySelector(`[data-h-node="${cssEscape(id)}"]`) : null;
    target?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  /** Remove the iframe and the hook of this window. */
  destroy() {
    if (globalThis.window) globalThis.window.hCmsDesigner = this._previous;
    this.frame.src = 'about:blank';
    this.box.remove();
  }

  _ready(win, hooks) {
    if (win !== this.frame.contentWindow) return;
    this.win = win;
    this.hooks = hooks;
    for (const id of hooks.mounted?.keys?.() || []) {
      this.mountedConfig.set(id, instanceKey(hooks.config.instances?.[id]));
      this.mountedInstances.set(id, clone(hooks.config.instances?.[id] || null));
    }
    const doc = win.document;
    // before the draft replaces them
    this.fieldValues = readFieldValues(doc);
    doc.addEventListener('mouseover', (event) => {
      const node = event.target?.closest?.('[data-h-node]');
      this.options.onHover?.(node ? node.getAttribute('data-h-node') : null);
    });
    doc.addEventListener('mouseleave', () => this.options.onHover?.(null));
    // the drop-down of the language switch (HLangSwitch) would load the page without design=1 (plan 27k §13.1): stopped
    // before its own listener, the designer loads the preview in that language
    doc.addEventListener('change', (event) => {
      const select = event.target;
      if (select?.tagName !== 'SELECT' || !select.closest?.('.h-site-lang')) return;
      event.stopPropagation();
      const option = [...(select.options || select.children || [])].find((item) => item.selected || item.value === select.value);
      const code = option?.getAttribute?.('data-h-lang-code');
      if (code) this.options.onLanguage?.(code);
    }, true);
    doc.addEventListener('click', (event) => {
      const node = event.target?.closest?.('[data-h-node]');
      // links do not leave the preview
      const link = event.target?.closest?.('a[href]');
      if (link) event.preventDefault();
      // a link of the language switch: the designer loads the preview in that language (plan 27k §13.1)
      if (link?.hasAttribute?.('hreflang') && link.closest?.('.h-site-lang')) {
        this.options.onLanguage?.(link.getAttribute('hreflang'));
        return;
      }
      // a link of a navigation widget to a page of this website: the designer opens the page (plan 27k §13)
      const target = this._navigationTarget(link, hooks.config);
      if (target) {
        // not stopped: HMenu closes its open full-screen menu; no node is selected
        this.options.onNavigate?.(target);
        return;
      }
      if (node) this.options.onSelect?.(node.getAttribute('data-h-node'));
    }, true);
    this.options.onReady?.();
  }

  /**
   * The page a clicked link opens in the designer (plan 27k §13), or null: a link of a navigation widget (not an action
   * of the page such as Add record or Back, not a new tab) to a page of this website.
   *
   * @param {HTMLAnchorElement|null} link
   * @param {object} [config] The configuration block of the page (runtime.database, site.id).
   * @returns {{pageId: number, record: number}|null}
   */
  _navigationTarget(link, config) {
    if (!link || !link.closest?.(NAVIGATION_LINKS) || link.hasAttribute?.('data-h-action')
      || link.getAttribute?.('target') === '_blank') return null;
    return previewPageOf(link.getAttribute('href'), { database: config?.runtime?.database || '', siteId: Number(config?.site?.id) || 0 });
  }
}

/** What decides whether an instance is mounted again: its type, settings and state. */
/** A copy of an instance configuration (JSON). */
function clone(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function instanceKey(instance) {
  // {} and [] (an empty object in PHP JSON) are the same
  const value = (item) => (item == null || (typeof item === 'object' && !Object.keys(item).length) ? null : item);
  // records and selection, own records too (plan 27l §11.3, §12)
  return JSON.stringify([instance?.type ?? null, value(instance?.settings), value(instance?.state), instance?.sync ?? null,
    instance?.records ?? null, instance?.selection ?? null, instance?.dataSource ?? null]);
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
}
