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
 * `<style id="h-site-styles">`. A veil marks the node under the mouse in the tree, and the other way round.
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

/** Containers of the parts in the page (srv PageRenderer). */
const CONTAINERS = Object.freeze({ header: '.h-site-header', content: '.h-site-main', footer: '.h-site-footer' });

/** Preview widths of the page toolbar (§5.1): 1024 and 640 are the medium / narrow screens. */
export const PREVIEW_WIDTHS = Object.freeze([0, 1280, 1024, 640, 375]);

/** The preview iframe of the designer. */
export class CmsPreview {
  /**
   * @param {HTMLElement} container Center pane.
   * @param {object} options
   * @param {string} [options.baseUrl] Heurist base URL (background images of styles).
   * @param {(id: string|null) => void} [options.onHover] A node under the mouse in the preview.
   * @param {(id: string) => void} [options.onSelect] A node clicked in the preview.
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
   * @param {{base: object, nodes: object[], kinds: object[], presets: object[]}} draft.styles Styles, website first.
   */
  apply({ parts = {}, instances = {}, styles = null } = {}) {
    const doc = this.win?.document;
    if (!doc || !this.hooks) return;
    const config = { ...this.hooks.config, instances: { ...(this.hooks.config.instances || {}), ...instances } };
    for (const [part, html] of Object.entries(parts)) {
      const container = doc.querySelector(CONTAINERS[part]);
      if (!container || html === undefined) continue;
      const kept = new Map();
      for (const host of container.querySelectorAll('[data-h-instance]')) kept.set(host.getAttribute('data-h-instance'), host);
      container.innerHTML = html;
      this.hooks.enhance(container);
      for (const host of [...container.querySelectorAll('[data-h-instance]')]) {
        const id = host.getAttribute('data-h-instance');
        const settings = instanceKey(config.instances[id]);
        const old = kept.get(id);
        if (old && this.mountedConfig.get(id) === settings) {
          for (const name of ['data-h-node', 'data-h-style']) {
            if (host.hasAttribute(name)) old.setAttribute(name, host.getAttribute(name)); else old.removeAttribute(name);
          }
          host.replaceWith(old);
          continue;
        }
        this.mountedConfig.set(id, settings);
        void this.hooks.mountInstance(host, id, config).catch((error) => console.warn('Preview: instance not mounted', id, error));
      }
    }
    if (styles) this.restyle(styles);
    this.highlight(this._highlighted || null);
  }

  /** Compile the styles again into the page. */
  restyle({ base = {}, nodes = [], kinds = [], presets = [] }) {
    const element = this.win?.document?.getElementById('h-site-styles');
    if (element) element.textContent = `\n${compileCmsStyles(base, nodes, this.options.baseUrl || '', { kinds, presets }).css}`;
  }

  /** Mark a node in the preview (veil), or none. */
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
    for (const id of hooks.mounted?.keys?.() || []) this.mountedConfig.set(id, instanceKey(hooks.config.instances?.[id]));
    const doc = win.document;
    doc.addEventListener('mouseover', (event) => {
      const node = event.target?.closest?.('[data-h-node]');
      this.options.onHover?.(node ? node.getAttribute('data-h-node') : null);
    });
    doc.addEventListener('mouseleave', () => this.options.onHover?.(null));
    doc.addEventListener('click', (event) => {
      const node = event.target?.closest?.('[data-h-node]');
      // links do not leave the preview
      if (event.target?.closest?.('a[href]')) event.preventDefault();
      if (node) this.options.onSelect?.(node.getAttribute('data-h-node'));
    }, true);
    this.options.onReady?.();
  }
}

/** What decides whether an instance is mounted again: its type, settings and state. */
function instanceKey(instance) {
  // {} and [] (an empty object in PHP JSON) are the same
  const value = (item) => (item == null || (typeof item === 'object' && !Object.keys(item).length) ? null : item);
  return JSON.stringify([instance?.type ?? null, value(instance?.settings), value(instance?.state)]);
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
}
