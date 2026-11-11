/**
 * @file siteNavigator.js
 * @brief Navigation modes swap and scroll of a v4 website (plan 27f §2).
 *
 * The server writes every page of a website in the same way: header, `<main>` with one
 * `<section class="h-site-page" data-h-page="{id}">`, footer, the page styles in
 * `<style id="h-page-styles" data-h-page="{id}">` (below the section) and the configuration block.
 * This navigator (loaded only when `site.layout.navigation` is swap or scroll) fetches the full page
 * of a link (the same URL, no other endpoint; it works on the generated pages too) and takes its
 * section, styles and instances:
 * - swap: header and footer stay, the section of the page is shown and the others are hidden; the
 *   last `layout.cache` pages are kept with their instances, older ones are removed;
 * - scroll: all pages of the menu are sections of one long page, loaded when they come near the
 *   window; the address, title and menu follow the section in view. A page hidden in the main menu and a
 *   record page (plan 27g) are shown alone; back on the long page, its scroll position is restored.
 * A record on a record page (plan 27g) is a view of its own (`{page}/{record}`, section `data-h-record`).
 * A language change, a link outside the website and a page that can not be loaded are opened as
 * usual (full load). Without JavaScript the links work as plain links.
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

import { CMS_LAYOUT_CACHE } from '#shared/site/cmsDocument.js';
import { MODULE_LOADERS, enhanceControls, mountHosts, unmountInstance } from './siteRuntime.js';

/** Part of the window height above which a section is the current one (scroll mode). */
const CURRENT_LINE = 0.3;

/**
 * Start the navigation mode of the page, or nothing for the mode reload, the designer and a standalone page.
 *
 * @param {object} options See SiteNavigator.
 * @returns {SiteNavigator|null}
 */
export function startNavigator(options) {
  const mode = options.config?.site?.layout?.navigation;
  if (options.config?.runtime?.design || (mode !== 'swap' && mode !== 'scroll') || !options.config?.site?.pages?.length) return null;
  return new SiteNavigator(options).start();
}

/**
 * The parts of a fetched page: its section, configuration block, page styles, title and alternate links.
 *
 * @param {string} text HTML of the page.
 * @returns {{section: Element|null, config: object|null, styles: Element|null, title: string, alternates: Element[]}}
 */
export function parsePage(text) {
  const doc = new DOMParser().parseFromString(String(text ?? ''), 'text/html');
  let config = null;
  try {
    config = JSON.parse(doc.getElementById('h-site-config')?.textContent || 'null');
  } catch {
    config = null;
  }
  return {
    section: doc.querySelector('.h-site-main > .h-site-page'),
    config,
    styles: doc.getElementById('h-page-styles'),
    title: doc.title || '',
    alternates: alternateLinks(doc)
  };
}

/**
 * Pages of a website in one document (modes swap and scroll). A view is a page, or a record shown by a record page
 * (plan 27g: key `{page}/{record}`, URL `.../{page}/{record}` or `&rec=`). In scroll mode a page hidden in the main
 * menu and a record page are not sections of the long page: they are shown alone (as in swap) and going back to a page
 * of the long page restores the scroll position.
 */
export class SiteNavigator {
  /**
   * @param {object} options
   * @param {object} options.config The configuration block of the first page.
   * @param {Map<string, object>} [options.mounted] Instances mounted by startSite (those of the first section are kept).
   * @param {Document} [options.doc]
   * @param {Window} [options.win]
   * @param {object} [options.loaders] Module loaders.
   * @param {(url: string) => Promise<string>} [options.fetchText] Loads the HTML of a page.
   * @param {(text: string) => object} [options.parse] See parsePage.
   */
  constructor({ config, mounted = new Map(), doc = globalThis.document, win = globalThis.window, loaders = MODULE_LOADERS,
    fetchText = defaultFetch, parse = parsePage }) {
    this.config = config;
    this.doc = doc;
    this.win = win;
    this.loaders = loaders;
    this.fetchText = fetchText;
    this.parse = parse;
    this.mode = config.site.layout.navigation;
    const cache = Number(config.site.layout.cache);
    this.cache = Number.isInteger(cache) && cache >= CMS_LAYOUT_CACHE.min ? Math.min(cache, CMS_LAYOUT_CACHE.max) : CMS_LAYOUT_CACHE.default;
    this.pages = config.site.pages.map((page) => ({ ...page, id: Number(page.id), url: this.absolute(page.url) }));
    this.byUrl = new Map(this.pages.map((page) => [this.key(page.url), page]));
    this.main = doc.querySelector('.h-site-main');
    /** @type {Map<number|string, {section: Element, mounted: Map, config: object, styles: Element|null, title: string, alternates: Element[], used: number, view: object}>} */
    this.entries = new Map();
    this.loading = new Map();
    this.clock = 0;
    /** Scroll mode: a hidden or record page shown alone, `{from, scrollY}` of the long page; null otherwise. */
    this.alone = null;
    const pageId = Number(config.site.pageId);
    const record = Number(config.site.record) || 0;
    const page = this.pages.find((item) => item.id === pageId);
    const view = page ? (record ? { key: `${pageId}/${record}`, page, record, url: this.key(this.absolute(win?.location?.href || page.url)) }
      : this.pageView(pageId)) : null;
    this.current = view ? view.key : pageId;
    const section = view ? this.sectionOf(view.key) : null;
    if (section) {
      const own = new Map([...mounted].filter(([id]) => section.querySelector(`[data-h-instance="${cssEscape(id)}"]`)));
      if (isAlone(view)) section.classList.add('h-site-page-alone');
      this.entries.set(view.key, {
        section, mounted: own, config, styles: doc.getElementById('h-page-styles'), title: doc.title,
        alternates: alternateLinks(doc), used: ++this.clock, view
      });
    }
    this._onClick = (event) => this.onClick(event);
    this._onPop = (event) => void this.onPop(event);
    this._onScroll = () => this.onScroll();
  }

  /** Listen to links and history; scroll mode: placeholders of the other pages. */
  start() {
    if (!this.main || !this.entries.has(this.current)) return this;
    this.doc.addEventListener('click', this._onClick);
    this.win?.addEventListener?.('popstate', this._onPop);
    this.win?.history?.replaceState?.(this.stateOf(this.entries.get(this.current).view), '', this.win.location?.href);
    if (this.mode === 'scroll') this.startScroll();
    return this;
  }

  /** Stop listening; the loaded pages stay as they are. */
  destroy() {
    this.doc.removeEventListener('click', this._onClick);
    this.win?.removeEventListener?.('popstate', this._onPop);
    this.win?.removeEventListener?.('scroll', this._onScroll);
    this.observer?.disconnect?.();
  }

  /** A click on a link to a page of the website (or a record on a record page) opens it here. */
  onClick(event) {
    if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target?.closest?.('a');
    if (!link || !link.hasAttribute('href') || link.hasAttribute('download') || (link.getAttribute('target') && link.getAttribute('target') !== '_self')) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    const view = this.viewOf(href);
    if (!view) return;
    event.preventDefault();
    void this.go(view, { push: true, hash: hashOf(this.absolute(href)) });
  }

  /** Back / forward. */
  async onPop(event) {
    const state = event?.state;
    const page = Number(state?.hPage);
    const view = page
      ? (Number(state.hRecord) > 0 ? this.viewOf(this.win?.location?.href || '') : this.pageView(page))
      : this.viewOf(this.win?.location?.href || '');
    if (view) await this.go(view, { push: false });
    else this.win?.location?.reload?.();
  }

  /**
   * Show a page or a record view: load it when needed, then swap (show its section) or scroll to it. In scroll mode
   * a hidden or record page is shown alone.
   *
   * @param {number|object} target Page id, or a view (viewOf).
   * @param {{push?: boolean, hash?: string}} [options] push: a new history entry; hash: an anchor in the page.
   * @returns {Promise<boolean>} False when the page was opened with a full load.
   */
  async go(target, { push = true, hash = '' } = {}) {
    const view = typeof target === 'object' && target ? target : this.pageView(Number(target));
    if (!view) return false;
    const entry = await this.load(view);
    if (!entry) {
      this.win?.location?.assign?.(view.url + hash);
      return false;
    }
    entry.used = ++this.clock;
    if (push && view.key !== this.current) this.win?.history?.pushState?.(this.stateOf(view), '', view.url + hash);
    if (this.mode === 'swap' || isAlone(view)) {
      // scroll mode: the long page is left at its position, the view is shown alone
      if (this.mode === 'scroll' && !this.alone) this.alone = { from: this.current, scrollY: Number(this.win?.scrollY) || 0 };
      for (const section of this.sections()) section.hidden = section !== entry.section;
      this.setCurrent(view);
      const anchor = hash ? this.doc.getElementById(decodeURIComponent(hash.slice(1))) : null;
      if (anchor) anchor.scrollIntoView?.(); else this.win?.scrollTo?.(0, 0);
      entry.section.setAttribute('tabindex', '-1');
      entry.section.focus?.({ preventScroll: true });
      // modules in the section shown now get its size
      this.win?.dispatchEvent?.(new Event('resize'));
      this.evict();
    } else {
      // scroll mode, a page of the long page: back from a page shown alone to the place it was left
      const back = this.alone;
      if (back) {
        this.alone = null;
        for (const section of this.sections()) section.hidden = section.classList.contains('h-site-page-alone');
        this.win?.dispatchEvent?.(new Event('resize'));
      }
      this.setCurrent(view);
      this.scrolling = true;
      if (back && back.from === view.key && !hash) this.win?.scrollTo?.(0, back.scrollY);
      else entry.section.scrollIntoView?.({ behavior: back ? 'auto' : 'smooth', block: 'start' });
      setTimeout(() => { this.scrolling = false; }, 800);
    }
    return true;
  }

  /**
   * The entry of a view: loaded before, or fetched now (its section is added hidden in swap mode and for a view shown
   * alone, in place of its placeholder in scroll mode). Null when the page can not be loaded.
   */
  async load(view) {
    const key = view.key;
    if (this.entries.has(key)) return this.entries.get(key);
    if (this.loading.has(key)) return this.loading.get(key);
    const job = (async () => {
      try {
        const parts = this.parse(await this.fetchText(view.url));
        if (!parts.section || !parts.config) return null;
        const section = this.doc.importNode ? this.doc.importNode(parts.section, true) : parts.section;
        const alone = isAlone(view);
        const placeholder = this.mode === 'scroll' && !alone ? this.sectionOf(key) : null;
        if (placeholder) {
          this.observer?.unobserve?.(placeholder);
          placeholder.replaceWith(section);
        } else {
          section.hidden = true;
          if (alone) section.classList.add('h-site-page-alone');
          this.main.append(section);
        }
        let styles = null;
        if (parts.styles) {
          styles = this.doc.importNode ? this.doc.importNode(parts.styles, true) : parts.styles;
          styles.removeAttribute('id'); // one id: the first page's block
          styles.setAttribute('data-h-page', String(view.page.id));
          this.doc.head.append(styles);
        }
        enhanceControls(section);
        for (const element of section.querySelectorAll('[data-h-view]')) element.setAttribute('tabindex', '0');
        const entry = {
          section, config: parts.config, styles, title: parts.title || view.page.title || '', alternates: parts.alternates || [],
          mounted: new Map(), used: ++this.clock, view
        };
        this.entries.set(key, entry);
        entry.mounted = await mountHosts(section, parts.config, this.loaders);
        return entry;
      } catch (error) {
        console.warn('Unable to load the page', view.url, error);
        return null;
      } finally {
        this.loading.delete(key);
      }
    })();
    this.loading.set(key, job);
    return job;
  }

  /**
   * Remove the views used longest ago above the cache size (never the current one): in swap mode any view, in scroll
   * mode the views shown alone (the long page stays).
   */
  evict() {
    const removable = ([key, entry]) => key !== this.current && (this.mode === 'swap' || isAlone(entry.view));
    while ([...this.entries].filter(removable).length > Math.max(0, this.cache - 1)) {
      let oldest = null;
      for (const item of this.entries) {
        if (removable(item) && (!oldest || item[1].used < oldest[1].used)) oldest = item;
      }
      if (!oldest) return;
      const [key, entry] = oldest;
      for (const instance of entry.mounted.values()) unmountInstance(instance);
      entry.section.remove();
      entry.styles?.remove();
      this.entries.delete(key);
    }
  }

  /** The current view: title, alternate links, menu marks and language links. */
  setCurrent(view) {
    this.current = view.key;
    const entry = this.entries.get(view.key);
    this.doc.title = entry?.title || view.page?.title || this.doc.title;
    if (entry) {
      // a page that hides the header / footer (plan 27f §3)
      const layout = entry.config.site?.layout || {};
      this.doc.body?.classList?.toggle('h-site-hide-header', layout.hideHeader === true);
      this.doc.body?.classList?.toggle('h-site-hide-footer', layout.hideFooter === true);
      for (const link of alternateLinks(this.doc)) link.remove();
      for (const link of entry.alternates) this.doc.head.append(this.doc.importNode ? this.doc.importNode(link, true) : link);
      // the language links of the menu and the language switch: this page in another language
      const languages = new Map((entry.config.site?.languages || []).map((item) => [String(item.code).toLowerCase(), item.url]));
      for (const link of this.doc.querySelectorAll('[hreflang]')) {
        if (link.tagName !== 'A') continue;
        const url = languages.get(String(link.getAttribute('hreflang')).toLowerCase());
        if (url) link.setAttribute('href', url);
      }
      // the select of HLangSwitch: option value = URL
      for (const option of this.doc.querySelectorAll('[data-h-lang-code]')) {
        if (option.tagName !== 'OPTION') continue;
        const url = languages.get(String(option.getAttribute('data-h-lang-code')).toLowerCase());
        if (url) option.value = url;
      }
    }
    markMenus(this.doc, this.key(view.url), (href) => this.key(this.absolute(href)));
  }

  // ------------------------------------------------------------------ scroll mode

  /**
   * Placeholders of the pages of the long page (not hidden, not record pages) in menu order, loaded when they come
   * near the window. A first page shown alone keeps them hidden until a page of the long page is opened.
   */
  startScroll() {
    const first = this.sectionOf(this.current);
    const alone = first?.classList.contains('h-site-page-alone');
    let before = !alone;
    for (const page of this.pages.filter((item) => !isAlone({ page: item }))) {
      if (!alone && page.id === this.current) {
        before = false;
        continue;
      }
      if (this.sectionOf(page.id)) continue;
      const placeholder = this.doc.createElement('section');
      placeholder.className = 'h-site-page h-site-page-pending';
      placeholder.setAttribute('data-h-page', String(page.id));
      placeholder.setAttribute('aria-busy', 'true');
      placeholder.hidden = Boolean(alone);
      if (before) first.before(placeholder); else this.main.append(placeholder);
    }
    if (alone) this.alone = { from: null, scrollY: 0 };
    else if (this.pages.find((item) => !isAlone({ page: item }))?.id !== this.current) first.scrollIntoView?.({ block: 'start' });
    const Observer = this.win?.IntersectionObserver;
    if (Observer) {
      this.observer = new Observer((items) => {
        for (const item of items) {
          if (item.isIntersecting) void this.load(this.pageView(Number(item.target.getAttribute('data-h-page'))));
        }
      }, { rootMargin: '100% 0px' });
      for (const placeholder of this.main.querySelectorAll('.h-site-page-pending')) this.observer.observe(placeholder);
    }
    this.win?.addEventListener?.('scroll', this._onScroll, { passive: true });
  }

  /** Scroll mode: the section at the top of the window is the current page (address and menu follow). */
  onScroll() {
    if (this.scrolling || this.frame || this.alone) return;
    const request = this.win?.requestAnimationFrame || ((callback) => setTimeout(callback, 50));
    this.frame = request(() => {
      this.frame = null;
      const line = (this.win?.innerHeight || 0) * CURRENT_LINE;
      let id = null;
      for (const section of this.sections()) {
        if (section.hidden || section.classList.contains('h-site-page-alone')) continue;
        if (section.getBoundingClientRect().top <= line) id = Number(section.getAttribute('data-h-page'));
      }
      id ??= this.pages.find((item) => !isAlone({ page: item }))?.id;
      if (!id || id === this.current) return;
      const view = this.pageView(id);
      this.win?.history?.replaceState?.(this.stateOf(view), '', view.url);
      this.setCurrent(view);
    });
  }

  // ------------------------------------------------------------------ helpers

  /** The view of a page of the website (no record). */
  pageView(id) {
    const page = this.pages.find((item) => item.id === id);
    return page ? { key: page.id, page, record: 0, url: page.url } : null;
  }

  /**
   * The view of a URL: a page of the website, or a record on a record page (`{page url}/{record}` or the page URL with
   * `rec={record}`); null for another URL.
   *
   * @param {string} href
   * @returns {{key: number|string, page: object, record: number, url: string}|null}
   */
  viewOf(href) {
    const url = this.key(this.absolute(href));
    const page = this.byUrl.get(url);
    if (page) return this.pageView(page.id);
    let target;
    try {
      target = new URL(url);
    } catch {
      return null;
    }
    for (const candidate of this.pages) {
      if (!candidate.record) continue;
      const base = new URL(candidate.url);
      if (target.origin !== base.origin) continue;
      let record = 0;
      const rest = target.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/`) ? target.pathname.slice(base.pathname.replace(/\/$/, '').length + 1) : '';
      if (/^\d+$/.test(rest) && sameQuery(target.searchParams, base.searchParams)) {
        record = Number(rest);
      } else if (target.pathname === base.pathname && /^\d+$/.test(target.searchParams.get('rec') || '')) {
        const params = new URLSearchParams(target.searchParams);
        params.delete('rec');
        if (sameQuery(params, base.searchParams)) record = Number(target.searchParams.get('rec'));
      }
      if (record > 0) return { key: `${candidate.id}/${record}`, page: candidate, record, url };
    }
    return null;
  }

  /** The history state of a view. */
  stateOf(view) {
    return view.record ? { hPage: view.page.id, hRecord: view.record } : { hPage: view.page.id };
  }

  /** The page sections of `<main>` (loaded and placeholders), in order. */
  sections() {
    return [...(this.main?.children || [])].filter((child) => child.classList?.contains('h-site-page'));
  }

  /** The section of a view key: a page id, or `{page}/{record}`. */
  sectionOf(key) {
    const [page, record = ''] = String(key).split('/');
    return this.sections().find((section) => section.getAttribute('data-h-page') === page
      && (section.getAttribute('data-h-record') || '') === record) || null;
  }

  absolute(url) {
    try {
      return new URL(url, this.doc.baseURI || this.win?.location?.href).href;
    } catch {
      return String(url);
    }
  }

  /** A URL without its anchor (pages are compared by it). */
  key(url) {
    return String(url).split('#')[0];
  }
}

/** Whether a view is shown alone in scroll mode: a page hidden in the main menu, or a record page (plan 27g). */
function isAlone(view) {
  return Boolean(view?.page?.hidden || view?.page?.record);
}

/** The same query parameters in any order. */
function sameQuery(a, b) {
  const text = (params) => [...params].map(([name, value]) => `${name}=${value}`).sort().join('&');
  return text(a) === text(b);
}

/**
 * Mark the links of the menus that open a page as current (`is-current`, `aria-current`) and their parent items
 * (`is-current-parent`). Language links are not changed.
 *
 * @param {Document} doc
 * @param {string} pageKey URL of the page without anchor.
 * @param {(href: string) => string} keyOf
 */
export function markMenus(doc, pageKey, keyOf) {
  const items = doc.querySelectorAll('.h-site-menu-item');
  for (const item of items) item.classList.remove('is-current', 'is-current-parent');
  for (const item of items) {
    const link = [...item.children].find((child) => child.tagName === 'A' && child.hasAttribute('href'));
    if (!link || link.hasAttribute('hreflang')) continue;
    const current = Boolean(pageKey) && keyOf(link.getAttribute('href')) === pageKey;
    if (current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    if (!current) continue;
    item.classList.add('is-current');
    let parent = item.parentElement?.closest?.('.h-site-menu-item');
    while (parent) {
      parent.classList.add('is-current-parent');
      parent = parent.parentElement?.closest?.('.h-site-menu-item');
    }
  }
}

/** `<link rel="alternate" hreflang>` of a document. */
function alternateLinks(doc) {
  return [...doc.querySelectorAll('link')].filter((link) => link.getAttribute('rel') === 'alternate' && link.hasAttribute('hreflang'));
}

async function defaultFetch(url) {
  const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function hashOf(url) {
  const index = String(url).indexOf('#');
  return index < 0 ? '' : String(url).slice(index);
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
}
