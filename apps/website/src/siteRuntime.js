/**
 * @file siteRuntime.js
 * @brief Runtime of a v4 website page (plan 27a §5): layout controls, menu and modules.
 *
 * The server (heurist srv/Website/PageRenderer.php) writes the page HTML and one
 * `<script type="application/json" id="h-site-config">` block. This runtime turns
 * `data-h-control="tabs"` containers into tabs and `data-h-control="accordion"`
 * groups into one-open accordions, and mounts every host (`data-h-instance`):
 * the menu widget, or a module mounted directly through its `direct.js` (only the
 * modules on the page are loaded), or in an iframe (`"mount": "iframe"`). The
 * record modules mounted directly work together through the PageSync of their page (plan 27l: one page = one domain,
 * results, selection and map document, instance setting `sync`); a module in an iframe stays independent.
 * One lazy listener serves the action Player / Viewer of all media of the page (HMediaViewer).
 * mountHosts / unmountInstance mount and remove the instances of one part (a page section of the
 * navigation modes swap / scroll, siteNavigator.js; a part replaced by the designer).
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

import { $HR } from '#shared/ui';
import { createTabSet } from '#shared/widgets/layout/tabs.js';
import { exclusiveAccordion } from '#shared/widgets/layout/accordion.js';
import { actionMenuItems, HMenu } from '#shared/widgets/site/HMenu.js';
import { HLangSwitch } from '#shared/widgets/site/HLangSwitch.js';
import { HEmailForm } from '#shared/widgets/site/HEmailForm.js';
import { fileMediaUrls } from '#shared/recordview/fileMediaItem.js';
import { resolveFileUrls } from '#shared/data/fileUrls.js';
import { SITE_WIDGETS, mountSiteWidget } from './siteWidgets.js';
import { mountBreadcrumbs, recordTrail, showTrail } from './siteBreadcrumbs.js';
import { sectionTree } from '#shared/site/cmsMenu.js';
import { QuerySource } from '#shared/data/QuerySource.js';
import { CMS_FILTER_KINDS, CMS_FILTER_MODULES, cmsFilterRequest, parseCmsFilterQuery } from '#shared/site/cmsSavedFilter.js';
import { PageSync, instanceLinks } from './PageSync.js';
import { normalizeDataSource } from '#shared/data/DataSource.js';
import { cmsInstanceDataSource } from '#shared/site/cmsDocument.js';
import { CMS_RECORDS_MODULES } from '#shared/site/cmsRecords.js';

/**
 * The direct entries of the modules, loaded only when a page has the module
 * (lazy chunks; the architecture rule allows apps/website to import them).
 */
export const MODULE_LOADERS = Object.freeze({
  data: () => import('../../data/src/direct.js').then((entry) => entry.mountHeuristData),
  recordview: () => import('../../recordview/src/direct.js').then((entry) => entry.mountHeuristRecordView),
  map: () => import('../../map/src/direct.js').then((entry) => entry.mountHeuristMap),
  timeline: () => import('../../timeline/src/direct.js').then((entry) => entry.mountHeuristTimeline),
  graph: () => import('../../graph/src/direct.js').then((entry) => entry.mountHeuristGraph),
  explorer: () => import('../../explorer/src/direct.js').then((entry) => entry.mountHeuristExplorer)
});

const HEADINGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

/**
 * The configuration block written by the server, or null.
 *
 * @param {Document} [doc]
 * @returns {object|null}
 */
export function readSiteConfig(doc = document) {
  const element = doc.getElementById?.('h-site-config');
  if (!element) return null;
  try {
    return JSON.parse(element.textContent || 'null');
  } catch (error) {
    console.error('Website configuration is not valid JSON', error);
    return null;
  }
}

/**
 * Start a page: controls first (hosts inside tabs exist before modules mount), then the instances.
 *
 * @param {object} options
 * @param {HTMLElement} options.root Element that holds the page (document.body).
 * @param {object} options.config The configuration block.
 * @param {object} [options.loaders] Module loaders (MODULE_LOADERS; tests pass their own).
 * @returns {Promise<Map<string, object>>} Mounted instances by id: the module API or the widget.
 */
export async function startSite({ root, config, loaders = MODULE_LOADERS }) {
  enhanceControls(root, config.runtime);
  const jobs = [];
  // written by the server, so they are here already; a preview of the designer opens nothing; with the navigation
  // modes swap / scroll other pages come later (one listener on the root serves them too)
  const navigation = config.site?.layout?.navigation;
  if (!config.runtime?.design && (root.querySelector('[data-h-view]') || navigation === 'swap' || navigation === 'scroll')) {
    jobs.push(import('#shared/widgets/site/HMediaViewer.js').then(({ attachMediaViews }) => attachMediaViews(root)));
  }
  // also in the preview of the designer (CmsPreview keeps the button when it writes the draft header)
  if (root.classList?.contains('h-site-header-slide')) {
    const runtime = config.runtime || {};
    attachHeaderToggle(root, { key: `${HEADER_STATE_KEY}.${runtime.database || ''}.${runtime.site || config.site?.id || 0}` });
  }
  // shrink on scroll (plan 27k §4) and the Back to top button (§6): also in the preview of the designer (review
  // 2026-11-16: the preview is a page in its own frame and scrolls as one)
  if (root.classList?.contains('h-site-header-shrink')) attachHeaderShrink(root);
  if (root.classList?.contains('h-site-back-to-top')) attachBackToTop(root);
  if (!config.runtime?.design) root.addEventListener('click', (event) => onAction(event));
  const mounted = await mountHosts(root, config, loaders);
  await Promise.all(jobs);
  return mounted;
}

/** localStorage key prefix of the state of a slide out header, per database and website. */
const HEADER_STATE_KEY = 'heurist.site.header';

/**
 * The slide out header (plan 27f §13): a button expands or collapses it (class h-site-header-collapsed on the body);
 * on the right of a horizontal header, above the logo of a vertical one (CSS); a click anywhere on the collapsed header
 * expands it too. It starts expanded; the choice of the
 * visitor is kept in the browser for the next pages.
 *
 * @param {HTMLElement} body Element with the class h-site-header-slide.
 * @param {object} [options]
 * @param {string} [options.key] Storage key of this website ('' = not kept).
 * @param {Storage|null} [options.storage] localStorage (tests pass their own).
 * @returns {() => void} Removes the button.
 */
export function attachHeaderToggle(body, { key = '', storage = safeLocalStorage() } = {}) {
  const header = body.querySelector('.h-site-header');
  const doc = body.ownerDocument || globalThis.document;
  const button = doc?.createElement?.('button');
  if (!header || !button) return () => {};
  const show = (collapsed) => {
    body.classList.toggle('h-site-header-collapsed', collapsed);
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', $HR(collapsed ? 'Expand the header' : 'Collapse the header'));
    button.title = button.getAttribute('aria-label');
    const vertical = body.classList.contains('h-site-header-vertical');
    const icon = vertical ? (collapsed ? 'fa-angles-right' : 'fa-angles-left') : (collapsed ? 'fa-angles-down' : 'fa-angles-up');
    button.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
  };
  let stored = null;
  try {
    stored = key ? storage?.getItem(key) : null;
  } catch {
    stored = null;
  }
  button.type = 'button';
  button.className = 'h-site-header-toggle';
  show(stored === 'collapsed');
  const change = (collapsed) => {
    show(collapsed);
    try {
      if (key) storage?.setItem(key, collapsed ? 'collapsed' : 'expanded');
    } catch {
      // private mode or no storage: the choice is not kept
    }
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    change(!body.classList.contains('h-site-header-collapsed'));
  });
  // a click anywhere on the collapsed header expands it (review 2026-11-10); links keep working
  const expand = (event) => {
    if (!body.classList.contains('h-site-header-collapsed') || event.target?.closest?.('a[href]')) return;
    change(false);
  };
  header.addEventListener('click', expand);
  header.prepend(button);
  return () => {
    header.removeEventListener('click', expand);
    button.remove?.();
  };
}

/** A shrunk header grows again when the page is scrolled back above this many pixels (plan 27k §4). */
export const HEADER_SHRINK_BACK = 8;

/**
 * Shrink on scroll (plan 27k §4): a fixed horizontal header (body class h-site-header-shrink) becomes small (class
 * h-site-header-shrunk: a small logo, the menu and the languages, CSS) when the page is scrolled down further than the
 * height of the header (at least 40px), and grows again near the top (HEADER_SHRINK_BACK). The two limits keep the
 * header from jumping when its height changes. A page that is not much longer than the window keeps its header.
 *
 * @param {HTMLElement} body Element with the class h-site-header-shrink.
 * @param {object} [options]
 * @param {Window} [options.win] The window (tests pass their own).
 * @param {Document} [options.doc] The document (the height of the page; tests pass their own).
 * @returns {() => void} Stops it (the header grows again).
 */
export function attachHeaderShrink(body, { win = globalThis.window, doc = body.ownerDocument || globalThis.document } = {}) {
  const header = body.querySelector('.h-site-header');
  if (!header || !win?.addEventListener) return () => {};
  let frame = 0;
  const update = () => {
    frame = 0;
    const y = Number(win.scrollY) || 0;
    const shrunk = body.classList.contains('h-site-header-shrunk');
    if (shrunk) {
      if (y < HEADER_SHRINK_BACK) body.classList.remove('h-site-header-shrunk');
      return;
    }
    const limit = Math.max(40, Number(header.offsetHeight) || 0);
    // room to scroll after the header is small: else the page would get shorter and scroll back (a loop)
    const room = (Number(doc?.documentElement?.scrollHeight) || 0) - (Number(win.innerHeight) || 0);
    if (y > limit && room > limit * 2) body.classList.add('h-site-header-shrunk');
  };
  const onScroll = () => {
    if (frame) return;
    if (typeof win.requestAnimationFrame === 'function') frame = win.requestAnimationFrame(update);
    else update();
  };
  win.addEventListener('scroll', onScroll, { passive: true });
  update();
  return () => {
    win.removeEventListener('scroll', onScroll);
    if (frame) win.cancelAnimationFrame?.(frame);
    body.classList.remove('h-site-header-shrunk');
  };
}

/** @returns {Storage|null} localStorage, or null when the browser does not give it. */
function safeLocalStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** Module APIs mounted on the page (all parts and loaded pages): {id, type, api, host}; for the actions of action menus
 *  and the map of a story map. */
const MODULES = [];

/**
 * The public API of a module of the page by its instance id; a module still mounting is waited for (a story map finds
 * its map, plan 27q1 §8).
 *
 * @param {string} instanceId
 * @param {number} [timeout=15000] ms.
 * @returns {Promise<object|null>}
 */
export async function findPageModule(instanceId, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    const module = MODULES.find((item) => item.id === instanceId && (!item.host || item.host.isConnected !== false));
    if (module) return module.api || null;
    if (Date.now() > end) return null;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * The PageSync of each page by the runtime of its configuration block (a page loaded by the navigator has its own, plan
 * 27l; the designer gives a copy of the block with each draft, the runtime stays the same object).
 */
const PAGE_SYNCS = new WeakMap();

/** Module API => {sync, id}: its registration, removed by unmountInstance. */
const SYNC_MEMBERS = new WeakMap();

/**
 * The PageSync of a page (plan 27l §2.2), made at the first use; also in the preview of the designer (queries run there
 * too, review 2026-11-16 §11.5: nothing of it goes into the draft).
 *
 * @param {object} config The configuration block of the page.
 * @returns {PageSync|null}
 */
export function pageSyncOf(config) {
  if (!config || typeof config !== 'object') return null;
  const key = config.runtime && typeof config.runtime === 'object' ? config.runtime : config;
  let sync = PAGE_SYNCS.get(key);
  if (!sync) {
    sync = new PageSync();
    PAGE_SYNCS.set(key, sync);
  }
  return sync;
}

/** Register a mounted module with the PageSync of its page (by its `sync` setting). */
function joinPageSync(config, id, instance, api, start = null) {
  const sync = pageSyncOf(config);
  if (!sync || !api || SYNC_MEMBERS.has(api)) return;
  // its records and selection (plan 27l §12); the search it started with goes on to the modules that take from it
  if (sync.register(id, instance?.type, api, instanceLinks(instance, config.instances), start)) SYNC_MEMBERS.set(api, { sync, id });
}

/**
 * An action of an action menu (`data-h-action`, plan 27f §6): Add record goes to the Explorer of the page; Back (plan
 * 27g) goes to the page before when the visitor came from this website, else it follows its link (the home page).
 *
 * @param {Event} event A click in the page.
 * @param {{history?: History, location?: Location, referrer?: string}} [env] Browser objects (tests).
 * @returns {boolean} Whether the click was an action.
 */
export function onAction(event, env = {}) {
  const link = event.target?.closest?.('[data-h-action]');
  if (!link) return false;
  const action = link.getAttribute('data-h-action');
  const target = link.getAttribute('data-h-target');
  if (action === 'back') {
    const history = env.history ?? globalThis.history;
    const location = env.location ?? globalThis.location;
    const referrer = env.referrer ?? globalThis.document?.referrer ?? '';
    let sameSite = false;
    try {
      sameSite = Boolean(referrer) && new URL(referrer).origin === new URL(location?.href).origin;
    } catch {
      sameSite = false;
    }
    // the navigator (swap / scroll) pushes its own entries: the page before is in the history then too
    if ((sameSite || history?.state?.hPage) && Number(history?.length) > 1) {
      event.preventDefault?.();
      history.back();
    }
    return true;
  }
  event.preventDefault?.();
  if (action === 'toggle') {
    toggleElement(target, env.document ?? globalThis.document);
    return true;
  }
  if (action === 'addRecord') {
    const explorer = MODULES.find((module) => module.type === 'explorer' && typeof module.api?.addRecord === 'function'
      && (!module.host || module.host.isConnected !== false));
    if (!explorer) {
      globalThis.window?.alert?.($HR('This action needs Heurist Explorer on this page'));
      return true;
    }
    const recordType = Number(target) || target;
    Promise.resolve(explorer.api.addRecord(recordType)).catch((error) => console.warn('Add record failed', error));
  }
  return true;
}

/**
 * Show / hide an element of the page (plan 27n §10, action `toggle`): an initially hidden element (`data-h-hidden`)
 * is shown by class h-site-shown, any other element is hidden by class h-site-hidden. The links of the action get
 * `is-active` and `aria-expanded` while the element is shown; a shown element fades in, and the window gets a `resize`
 * (maps, timelines measure their box again).
 *
 * @param {string} nodeId `data-h-node` of the element.
 * @param {Document|HTMLElement} [doc] Where the element and the links are.
 * @returns {boolean|null} Whether the element is shown now; null without the element.
 */
export function toggleElement(nodeId, doc = globalThis.document) {
  if (!nodeId || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(nodeId)) return null;
  const node = doc?.querySelector?.(`[data-h-node="${nodeId}"]`);
  if (!node) return null;
  // initially hidden (`data-h-hidden`) and the Reveal effect are two options (review 27n §18.2b)
  const initiallyHidden = node.hasAttribute('data-h-hidden');
  const shown = initiallyHidden ? !node.classList.contains('h-site-shown') : node.classList.contains('h-site-hidden');
  if (initiallyHidden) node.classList.toggle('h-site-shown', shown); else node.classList.toggle('h-site-hidden', !shown);
  node.classList.remove('h-site-toggle-in');
  if (shown) {
    // shown with its Reveal effect, else a short fade in; again on each show
    if (node.hasAttribute('data-h-reveal')) {
      playReveal(node);
    } else {
      void node.offsetWidth;
      node.classList.add('h-site-toggle-in');
    }
  }
  const links = [...doc.querySelectorAll('[data-h-action="toggle"]')].filter((link) => link.getAttribute('data-h-target') === nodeId);
  for (const link of links) {
    link.classList.toggle('is-active', shown);
    link.setAttribute('aria-expanded', String(shown));
    // in a menu: shown like the current item
    link.closest?.('.h-site-menu-item')?.classList.toggle('is-current', shown);
  }
  if (shown) {
    const view = doc.defaultView ?? doc.ownerDocument?.defaultView ?? globalThis.window;
    if (typeof view?.dispatchEvent === 'function' && typeof Event === 'function') view.dispatchEvent(new Event('resize'));
  }
  return shown;
}

/**
 * Mount every host inside an element (the page, or a page section loaded by the navigator, plan 27f).
 *
 * @param {HTMLElement} root
 * @param {object} config The configuration block that has the instances of these hosts.
 * @param {object} [loaders] Module loaders.
 * @returns {Promise<Map<string, object>>} Mounted instances by id.
 */
export async function mountHosts(root, config, loaders = MODULE_LOADERS) {
  const mounted = new Map();
  const jobs = [];
  // the trail of the breadcrumbs (plan 27k §6): a record page shown now, also by the navigator (swap / scroll); the
  // breadcrumbs outside this part (a header kept by swap) show it too
  if (!config?.runtime?.design && Number(config?.site?.record)) {
    recordTrail(config);
    const doc = root.ownerDocument || globalThis.document;
    for (const list of doc?.querySelectorAll?.('.h-site-breadcrumbs[data-h-mode="history"]') || []) showTrail(list, config);
  }
  for (const host of root.querySelectorAll('[data-h-instance]')) {
    const id = host.getAttribute('data-h-instance');
    if (mounted.has(id)) continue; // a second host of one instance: the server reported it
    mounted.set(id, null);
    jobs.push(mountInstance(host, id, config, loaders).then((instance) => mounted.set(id, instance)));
  }
  await Promise.all(jobs);
  return mounted;
}

/**
 * Remove a mounted instance: `destroy()` of a widget (HBaseWidget) or module API; an iframe goes blank.
 * Errors of a module are logged; the page goes on.
 *
 * @param {object|null} instance What mountInstance returned.
 */
export function unmountInstance(instance) {
  if (!instance) return;
  const index = MODULES.findIndex((module) => module.api === instance);
  if (index >= 0) MODULES.splice(index, 1);
  const member = SYNC_MEMBERS.get(instance);
  if (member) {
    member.sync.unregister(member.id);
    SYNC_MEMBERS.delete(instance);
  }
  try {
    if (instance.tagName === 'IFRAME') {
      instance.src = 'about:blank';
      instance.remove?.();
    } else if (typeof instance.destroy === 'function') {
      instance.destroy();
    }
  } catch (error) {
    console.warn('Unable to remove a part of the page', error);
  }
}

/**
 * Tabs and one-open accordions of the controls inside an element (the page, or a part the designer replaced), and the
 * background videos of groups.
 *
 * @param {HTMLElement} root
 * @param {object} [runtime] `runtime` of the configuration block (baseUrl, database): the background videos.
 */
export function enhanceControls(root, runtime = null) {
  for (const container of root.querySelectorAll('[data-h-control="tabs"]')) enhanceTabs(container);
  for (const container of root.querySelectorAll('[data-h-control="accordion"]')) enhanceAccordion(container);
  if (runtime) enhanceBackgroundVideos(root, runtime);
  // reveal on scroll (plan 27k §6): not in the preview of the designer (every element stays visible there)
  if (runtime && !runtime.design) enhanceReveal(root);
}

/**
 * An accordion (plan 27k §6): one open section at a time unless `data-h-multiple`; with `data-h-first-open` the first
 * section is open at start when none is.
 *
 * @param {HTMLElement} container Element with data-h-control="accordion".
 */
export function enhanceAccordion(container) {
  if (container.getAttribute('data-h-multiple') !== 'true') exclusiveAccordion(container);
  const sections = [...container.children].filter((child) => child.tagName === 'DETAILS');
  if (container.getAttribute('data-h-first-open') === 'true' && sections.length && !sections.some((details) => details.open)) {
    sections[0].open = true;
  }
}

/**
 * Reveal on scroll (plan 27k §6, 27n §8): an element with `data-h-reveal` (fade, up, down, left, right, zoom) is hidden
 * (class h-site-reveal-pending) until it comes into the window, then shown with its animation (CSS). Nothing without
 * IntersectionObserver or with prefers-reduced-motion: the elements are shown as they are. `hidden` is left to the
 * Show / hide action (CSS keeps it hidden).
 *
 * @param {HTMLElement} root
 * @param {object} [options]
 * @param {Function} [options.Observer] IntersectionObserver (tests pass their own).
 * @param {boolean} [options.reduced] Whether the visitor asks for less motion.
 * @returns {object|null} The observer.
 */
export function enhanceReveal(root, {
  Observer = globalThis.IntersectionObserver,
  reduced = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
} = {}) {
  const items = [...(root.matches?.('[data-h-reveal]') ? [root] : []), ...root.querySelectorAll('[data-h-reveal]')]
    // an initially hidden element is revealed when a Show / hide action shows it (review 27n §18.2b)
    .filter((item) => !item.classList.contains('h-site-reveal-done') && !item.hasAttribute('data-h-hidden'))
    // a list of cards or a gallery has no box of its own (display: contents): its items are revealed (review 27n §14.2)
    .flatMap((item) => {
      if (!item.classList.contains('h-site-widget-list') || !item.children.length) return [item];
      const effect = item.getAttribute('data-h-reveal');
      item.classList.add('h-site-reveal-done');
      return [...item.children].map((child, index) => {
        child.setAttribute('data-h-reveal', effect);
        // one after another (review §16.2)
        child.style?.setProperty?.('--h-site-reveal-delay', `${Math.min(index, 8) * 120}ms`);
        return child;
      });
    });
  if (!items.length || typeof Observer !== 'function' || reduced) return null;
  // the first report of an element: in the window already (the top of the page, a row of a gallery seen in part) it is
  // revealed at once; else it is hidden until a quarter of it, or a third of the window, shows it (a tall element;
  // review §16.2, §18.2a): the effect is seen while the element comes into view, and nothing seen is hidden again
  const started = new Set();
  const observer = new Observer((entries) => {
    for (const entry of entries) {
      const item = entry.target;
      if (!started.has(item)) {
        started.add(item);
        if (entry.isIntersecting) {
          playReveal(item);
          observer.unobserve(item);
        } else {
          item.classList.add('h-site-reveal-pending');
        }
        continue;
      }
      if (!entry.isIntersecting) continue;
      const seen = entry.intersectionRect?.height ?? Infinity;
      const view = entry.rootBounds?.height ?? 0;
      if (entry.intersectionRatio !== undefined && entry.intersectionRatio < 0.25 && seen < view / 3) continue;
      item.classList.remove('h-site-reveal-pending');
      item.classList.add('h-site-reveal-done');
      observer.unobserve(item);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: [0, 0.1, 0.25, 0.5] });
  for (const item of items) observer.observe(item);
  return observer;
}

/**
 * Play the Reveal effect of an element now (review 27n §18): its hidden state, then the transition of style.css to
 * visible. A list of cards or a gallery (no box of its own) plays it on its items.
 *
 * @param {HTMLElement} item An element with `data-h-reveal`.
 */
export function playReveal(item) {
  const effect = item?.getAttribute?.('data-h-reveal');
  if (!effect) return;
  const targets = item.classList.contains('h-site-widget-list') && item.children.length ? [...item.children] : [item];
  for (const [index, target] of targets.entries()) {
    if (target !== item) {
      target.setAttribute('data-h-reveal', effect);
      target.style?.setProperty?.('--h-site-reveal-delay', `${Math.min(index, 8) * 120}ms`);
    }
    target.classList.remove('h-site-reveal-done');
    target.classList.add('h-site-reveal-pending');
  }
  // the hidden state is applied before it is removed: the transition runs
  void item.offsetWidth;
  for (const target of targets) {
    void target.offsetWidth;
    target.classList.remove('h-site-reveal-pending');
    target.classList.add('h-site-reveal-done');
  }
}

/**
 * The Back to top button (plan 27k §6, body class h-site-back-to-top): shown after one screen of scrolling; a click
 * scrolls to the top (smoothly unless the visitor asks for less motion).
 *
 * @param {HTMLElement} body
 * @param {object} [options]
 * @param {Window} [options.win] The window (tests pass their own).
 * @returns {() => void} Removes the button.
 */
export function attachBackToTop(body, { win = globalThis.window } = {}) {
  const doc = body.ownerDocument || globalThis.document;
  const button = doc?.createElement?.('button');
  if (!button || !win?.addEventListener) return () => {};
  button.type = 'button';
  button.className = 'h-site-back-to-top-button';
  button.title = $HR('Back to top');
  button.setAttribute('aria-label', button.title);
  button.innerHTML = '<i class="fa-solid fa-arrow-up" aria-hidden="true"></i>';
  const update = () => button.classList.toggle('is-visible', (Number(win.scrollY) || 0) > (Number(win.innerHeight) || 0));
  button.addEventListener('click', () => {
    const reduced = Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    win.scrollTo?.({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });
  win.addEventListener('scroll', update, { passive: true });
  body.append(button);
  update();
  return () => {
    win.removeEventListener('scroll', update);
    button.remove?.();
  };
}

/**
 * The background videos of groups (plan 27i §9 D): a group with `data-h-bg-video` (the key of a registered file) gets a
 * muted video in a loop as its first child (CSS: behind the content, over the whole group). The background image of
 * the group stays as the poster.
 *
 * The video comes from the file endpoint of the API (`/files/{key}/asset`, ranges; 2026-11-16).
 *
 * @param {HTMLElement} root
 * @param {{baseUrl?: string, apiBaseUrl?: string, database?: string}} runtime
 */
export function enhanceBackgroundVideos(root, runtime) {
  const apiBaseUrl = runtime.apiBaseUrl || `${String(runtime.baseUrl || '/').replace(/\/?$/, '/')}api`;
  const urls = fileMediaUrls(runtime.baseUrl || '', runtime.database || '', { apiBaseUrl });
  const groups = [...(root.matches?.('[data-h-bg-video]') ? [root] : []), ...root.querySelectorAll('[data-h-bg-video]')];
  for (const group of groups) {
    const key = group.getAttribute('data-h-bg-video') || '';
    const current = [...group.children].find((child) => child.tagName === 'VIDEO' && child.classList.contains('h-site-bg-video'));
    if (current?.getAttribute('data-key') === key) continue;
    current?.remove();
    if (!/^[A-Za-z0-9]+$/.test(key)) continue;
    const video = (group.ownerDocument || document).createElement('video');
    video.className = 'h-site-bg-video';
    video.setAttribute('data-key', key);
    video.setAttribute('aria-hidden', 'true');
    for (const name of ['autoplay', 'muted', 'loop', 'playsinline']) video.setAttribute(name, '');
    video.muted = true;
    video.preload = 'auto';
    video.src = urls.file(key);
    group.prepend(video);
  }
}

/**
 * The CMS designer this preview page is in (plan 27c §6): `window.hCmsDesigner` of the parent page,
 * or null when the page is not in the designer's iframe.
 *
 * @param {Window} win The page's window.
 * @returns {object|null}
 */
export function designerHost(win = globalThis.window) {
  try {
    const parent = win?.parent;
    return parent && parent !== win && parent.hCmsDesigner ? parent.hCmsDesigner : null;
  } catch {
    return null; // another origin
  }
}

/**
 * Whether the page is in an iframe (also of another origin).
 *
 * @param {Window} win
 * @returns {boolean}
 */
export function isFramed(win = globalThis.window) {
  try {
    return Boolean(win) && win.parent !== win;
  } catch {
    return true;
  }
}

/**
 * Explorer page that opens the CMS designer on this website / page (a design page opened outside the
 * designer, plan 27c §6).
 *
 * @param {object} runtime `runtime` of the configuration block (database, baseUrl, site, page).
 * @returns {string}
 */
export function designerUrl(runtime = {}) {
  const site = Number(runtime.site) || Number(runtime.page) || 0;
  const params = new URLSearchParams({ db: String(runtime.database || ''), mode: 'cms', site: String(site) });
  if (Number(runtime.site) > 0 && Number(runtime.page) > 0 && Number(runtime.page) !== site) params.set('page', String(runtime.page));
  return `${runtime.baseUrl || ''}hclient/modules/explorer/explorerViewer.html?${params}`;
}

/**
 * Hooks given to the designer: it replaces parts of the page with its draft and keeps the mounted instances.
 *
 * @param {object} options
 * @param {object} options.config The configuration block.
 * @param {Map<string, object>} options.mounted Mounted instances (startSite).
 * @param {object} [options.loaders] Module loaders.
 * @returns {{config: object, mounted: Map, enhance: Function, mountInstance: Function, unmountInstance: Function,
 *          applySettings: Function}}
 */
export function designHooks({ config, mounted, loaders = MODULE_LOADERS }) {
  return {
    config,
    mounted,
    enhance: (root) => enhanceControls(root, config.runtime),
    // new settings of a mounted module without mounting it again (review 2026-11-15); false: it must be mounted again
    applySettings: (id, before, after) => applyInstanceSettings(mounted.get(id), before, after),
    unmountInstance: (id) => {
      unmountInstance(mounted.get(id));
      mounted.delete(id);
    },
    mountInstance: async (host, id, instanceConfig = config) => {
      const instance = await mountInstance(host, id, instanceConfig, loaders);
      mounted.set(id, instance);
      return instance;
    }
  };
}

/**
 * New settings of a mounted module through its API (the CMS designer, review 2026-11-15): a module its
 * `setConfiguration`; Explorer `applySettings` (filters, layout, modules; not another language), an older Explorer
 * the settings of its modules (`setModuleSettings`) when nothing else changed. The work goes on in the background.
 *
 * @param {object|null} api What mountInstance returned.
 * @param {object|null} before The instance configuration the module was mounted with.
 * @param {object|null} after The new one.
 * @returns {boolean} Whether the module takes them (else it must be mounted again).
 */
export function applyInstanceSettings(api, before, after) {
  if (!api || !before || !after || before.kind !== 'module' || before.type !== after.type || before.mount === 'iframe') return false;
  if (JSON.stringify(before.state ?? null) !== JSON.stringify(after.state ?? null)) return false;
  // other records and selection, or own records (plan 27l §11.3, §12): mounted again
  const links = (item) => JSON.stringify([item.sync ?? null, item.records ?? null, item.selection ?? null, item.dataSource ?? null]);
  if (links(before) !== links(after)) return false;
  if (after.type === 'explorer') {
    // filters and layout too, as the settings of its modules (review 2026-11-15); another language: mounted again
    if (typeof api.applySettings === 'function'
      && JSON.stringify(before.settings?.ui?.language ?? null) === JSON.stringify(after.settings?.ui?.language ?? null)) {
      void Promise.resolve(api.applySettings(after.settings || {})).catch((error) => console.warn('Explorer settings not applied', error));
      return true;
    }
    const types = explorerModuleChanges(before.settings, after.settings);
    if (!types || typeof api.setModuleSettings !== 'function') return false;
    for (const type of types) void api.setModuleSettings(type, after.settings.modules[type]);
    return true;
  }
  if (typeof api.setConfiguration !== 'function') return false;
  void api.setConfiguration(after.settings || {});
  return true;
}

/**
 * The module types whose settings changed between two Explorer settings, when only module settings changed (in
 * `modules` and the settings of the layout items); null when anything else changed (the layout, the filters ...).
 */
export function explorerModuleChanges(before = {}, after = {}) {
  const rest = (settings) => JSON.stringify({ ...(settings || {}), modules: null,
    layout: (settings?.layout || []).map((item) => ({ ...item, settings: null })) });
  if (rest(before) !== rest(after)) return null;
  const types = new Set([...Object.keys(before?.modules || {}), ...Object.keys(after?.modules || {})]);
  return [...types].filter((type) => JSON.stringify(before?.modules?.[type] ?? null) !== JSON.stringify(after?.modules?.[type] ?? null)
    && after?.modules?.[type]);
}

/**
 * Tabs from a container: each child element is a panel, its first heading the tab label.
 * Without this the panels show one after another.
 *
 * @param {HTMLElement} container Element with data-h-control="tabs".
 * @returns {object} The tab set (shared/src/widgets/layout/tabs.js).
 */
export function enhanceTabs(container) {
  const panels = [...container.children];
  const run = createTabSet({
    prefix: 'h-site',
    element: container,
    // a module in a panel shown now gets the size of the panel
    onSelect: () => globalThis.window?.dispatchEvent?.(new Event('resize'))
  });
  for (const [position, panel] of panels.entries()) {
    const heading = [...panel.children].find((child) => HEADINGS.includes(child.tagName));
    heading?.classList.add('h-site-tab-heading');
    run.add(heading?.textContent?.trim() || `${position + 1}`, panel);
  }
  if (panels.length) run.select(0);
  return run;
}

/**
 * The URL of a page of the website in the designer's draft (plan 27k §13): from the menu tree of the configuration (the
 * home page: its item); '#' elsewhere and for a page not in the menu (a published page has the links of the server).
 *
 * @param {object} config The configuration block.
 * @param {number} id Page id.
 * @returns {string}
 */
export function draftPageUrl(config, id) {
  const site = config?.site || {};
  if (!config?.runtime?.design) return '#';
  if (Number(id) === Number(site.id)) return site.homeItem?.url || '#';
  const find = (items) => {
    for (const item of items || []) {
      if (Number(item.id) === Number(id)) return item.url || '#';
      const found = find(item.children);
      if (found) return found;
    }
    return '';
  };
  return find(site.menu) || '#';
}

/**
 * Mount one host. Problems are shown in the host; other hosts are not affected.
 *
 * @param {HTMLElement} host Element with data-h-instance.
 * @param {string} id Instance id.
 * @param {object} config The configuration block.
 * @param {object} loaders Module loaders.
 * @returns {Promise<object|null>} The module API or widget, or null.
 */
export async function mountInstance(host, id, config, loaders) {
  const instance = config?.instances?.[id];
  if (!instance) return showMessage(host, $HR('This part of the page is not configured'));
  if (instance.problem) return showMessage(host, `${$HR('This part of the page can not be shown')}: ${instance.problem}`);
  if (instance.kind === 'widget' && instance.type === 'breadcrumbs') return mountBreadcrumbs(host, instance, config);
  if (instance.kind === 'widget' && instance.type === 'menu') {
    return new HMenu().attach(host, {
      // the section of the page only (plan 27k §6; the designer's draft: the server writes the menu of a page)
      items: instance.settings?.scope === 'section' ? sectionTree(config.site?.menu || []) : config.site?.menu || [],
      settings: instance.settings || {},
      homeItem: config.site?.homeItem || null
    }).render();
  }
  if (instance.kind === 'widget' && instance.type === 'actionmenu') {
    const settings = instance.settings || {};
    const language = config.site?.language || '';
    return new HMenu().attach(host, {
      // the draft of the designer: Go to a page has the URL of the page (its link opens the page there, plan 27k §13)
      items: actionMenuItems(settings, { language, pageUrl: (id) => draftPageUrl(config, id) }),
      // style, orientation, the button of expand (plan 27k §1-2), open, buttonText, lineWidth / lineColor (review 2026-11-16)
      settings: { presentation: settings.presentation || 'links', style: settings.style, orientation: settings.orientation,
        icon: settings.icon, label: settings.labels?.[language] ?? settings.label, open: settings.open, buttonText: settings.buttonText,
        lineWidth: settings.lineWidth, lineColor: settings.lineColor },
      label: settings.labels?.[language] ?? settings.label ?? 'Actions'
    }).render();
  }
  if (instance.kind === 'widget' && instance.type === 'badges') {
    // written by the server; the designer's draft has an empty host: the HTML of the settings (plan 27f §7)
    host.classList.add('h-site-badges');
    if (instance.settings?.source !== 'host') badgesLayout(host, instance.settings || {});
    if (!host.querySelector('.h-site-badges-row')) {
      const html = instance.settings?.html || {};
      if (instance.settings?.source === 'host') {
        // written by the server from the files of the installation; the draft shows where it goes
        host.textContent = config.runtime?.design ? $HR('Logo of the host organisation') : '';
      } else {
        // stored file URLs (./api/…) made absolute (plan 34)
        host.innerHTML = resolveFileUrls(html[config.site?.language || ''] ?? html.def ?? Object.values(html)[0] ?? '',
          { baseUrl: config.runtime?.baseUrl || '' });
      }
    }
    return null;
  }
  if (instance.kind === 'widget' && instance.type === 'language') {
    return new HLangSwitch().attach(host, {
      languages: config.site?.languages || [],
      language: config.site?.language || null,
      appearance: instance.settings?.appearance
    }).render();
  }
  if (instance.kind === 'widget' && instance.type === 'email') {
    // written by the server (plan 27h); the draft of the designer: the same markup, nothing is sent
    const runtime = config.runtime || {};
    return new HEmailForm().attach(host, {
      url: `${runtime.apiBaseUrl || `${runtime.baseUrl || '/'}api`}/${encodeURIComponent(runtime.database || '')}/external/email`,
      settings: instance.settings || {},
      site: Number(runtime.site) || Number(runtime.page) || Number(config.site?.id) || 0,
      language: config.site?.language || runtime.language || '',
      design: Boolean(runtime.design)
    }).render();
  }
  if (instance.kind === 'widget' && instance.type === 'filter') {
    // the Filter widget (plan 27l §3): a lazy chunk; it runs its filters for the modules of the page
    try {
      const { mountPageFilter } = await import('./siteFilter.js');
      return await mountPageFilter(host, instance, config, { id, sync: pageSyncOf(config), pageRequest: pageFilterRequest });
    } catch (error) {
      console.error(`Unable to show the filter (${id})`, error);
      return showMessage(host, $HR('This part of the page can not be shown'));
    }
  }
  if (instance.kind === 'widget' && instance.type === 'storymap') {
    // the story map (plan 27q1 §8): a lazy chunk; a member of the page (selection, its source records)
    try {
      const { mountStoryMap } = await import('./siteStoryMap.js');
      const mounted = await mountStoryMap(host, instance, config, { findModule: (instanceId) => findPageModule(instanceId) });
      if (!mounted) return null;
      joinPageSync(config, id, instance, mounted.widget, mounted.start);
      return mounted.widget;
    } catch (error) {
      console.error(`Unable to show the story map (${id})`, error);
      return showMessage(host, $HR('This part of the page can not be shown'));
    }
  }
  if (instance.kind === 'widget' && instance.type === 'crosstabs') {
    // crosstabs (plan 27q2 §10): a lazy chunk; a member of the page (its records, a clicked count sent on)
    try {
      const { mountCrosstabs } = await import('./siteCrosstabs.js');
      const sync = pageSyncOf(config);
      const mounted = await mountCrosstabs(host, instance, config, {
        id,
        sendRecords: sync ? (request, origin) => void sync.setRequest(request, { origin }) : null
      });
      if (!mounted) return null;
      // a target of a Saved filter (review 2026-11-23): the query of the link of a page without other modules
      if (sync && instanceLinks(instance, config.instances).from.includes('links') && !sync.latest(['links'])) {
        const search = config.runtime?.filterSearch ?? globalThis.location?.search ?? '';
        const request = await pageFilterRequest(config.runtime || {}, search).catch(() => null);
        if (request && !sync.latest(['links'])) sync.remember(request, 'links');
      }
      // the member of the page: its api (the Filter Form of a Saved filter link, review 6); removed with it
      joinPageSync(config, id, instance, mounted.api);
      return mounted.api;
    } catch (error) {
      console.error(`Unable to show the crosstabs (${id})`, error);
      return showMessage(host, $HR('This part of the page can not be shown'));
    }
  }
  if (instance.kind === 'widget' && SITE_WIDGETS.includes(instance.type)) return mountSiteWidget(host, instance, config);
  if (instance.kind !== 'module' || !Object.hasOwn(loaders, instance.type)) {
    return showMessage(host, $HR('This part of the page can not be shown'));
  }
  host.classList.add('h-site-module');
  if (instance.mount === 'iframe') {
    const frame = document.createElement('iframe');
    frame.className = 'h-site-frame';
    frame.title = instance.type;
    const frameUrl = config.runtime?.frameUrl || '';
    // a language asked in the page URL goes to the module page too
    const lang = config.runtime?.languageRequested && config.runtime.language
      ? `${frameUrl.includes('?') ? '&' : '?'}lang=${encodeURIComponent(config.runtime.language)}` : '';
    frame.src = `${frameUrl}${encodeURIComponent(id)}${lang}`;
    host.replaceChildren(frame);
    return frame;
  }
  try {
    const mount = await loaders[instance.type]();
    // the module renders into its own element: its CSS (loaded later) can not change the host,
    // whose size and box come from the node styles of the page
    const container = document.createElement('div');
    container.className = 'h-site-module-root';
    host.replaceChildren(container);
    // its first records (plan 27l §12): the Saved filter of the page URL, its own query, the latest search of the page
    const { state, request: start } = await moduleStart(instance, config);
    // the requests of the module report to the page (Stop, plan 27l §4); Explorer has its own monitor and Stop
    const sync = instance.type === 'explorer' ? null : pageSyncOf(config);
    const api = await mount({
      container,
      bootstrap: { runtime: { ...(config.runtime || {}) }, settings: instance.settings || {}, state },
      bridge: sync ? sync.bridge() : null,
      assetBaseUrl: config.runtime?.moduleBaseUrl ? `${config.runtime.moduleBaseUrl}heurist-${instance.type}/` : null
    });
    MODULES.push({ id, type: instance.type, api, host });
    joinPageSync(config, id, instance, api, start);
    return api;
  } catch (error) {
    console.error(`Unable to show ${instance.type} (${id})`, error);
    return showMessage(host, $HR('This part of the page can not be shown'));
  }
}

/** Requests of the Saved filters of page URLs (plan 27j), by the query string: one load for all modules of a page. */
const FILTER_REQUESTS = new Map();

/**
 * The Saved filter asked by the page URL (plan 27j): `?source=<id>&v.<NAME>=` (cmsSavedFilter.js), or `?filter=<id>` a
 * saved filter (plan 27l §7.2). The query source (`GET /records/querysource/{id}`) or saved filter (`GET
 * /sys/filter/{id}`, legacy kinds converted by the lazy chunk siteFilter.js) is read with the rights of the visitor; the
 * given values are filled in.
 *
 * @param {object} runtime `apiBaseUrl`, `database`.
 * @param {string} [search] `location.search`.
 * @param {Function} [load] fetch.
 * @returns {Promise<{dataSource: object, raw: object, values: object, missing: string[]}|null>} Null without a Saved
 *          filter, or when the source can not be read.
 */
export function pageFilterRequest(runtime = {}, search = globalThis.location?.search || '', load = globalThis.fetch) {
  const asked = parseCmsFilterQuery(search);
  if (!asked || typeof load !== 'function') return Promise.resolve(null);
  const key = String(search);
  if (!FILTER_REQUESTS.has(key)) FILTER_REQUESTS.set(key, readFilterTarget(runtime, asked, asked.values, load));
  return FILTER_REQUESTS.get(key);
}

/**
 * The request of a query source or saved filter read with the rights of the visitor, the values filled in.
 *
 * @param {object} runtime `apiBaseUrl` / `baseUrl`, `database`.
 * @param {{kind: 'source'|'filter', id: number}} target
 * @param {object} values Values by parameter name.
 * @param {Function} load fetch.
 * @returns {Promise<{dataSource: object, raw: object, values: object, missing: string[]}|null>} Null when it can not be read.
 */
async function readFilterTarget(runtime, target, values, load) {
  const api = `${runtime.apiBaseUrl || `${runtime.baseUrl || '/'}api`}/${encodeURIComponent(runtime.database || '')}`;
  const url = target.kind === 'filter' ? `${api}/sys/filter/${target.id}` : `${api}/records/querysource/${target.id}`;
  try {
    const response = await load(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`${response.status}`);
    const payload = await response.json();
    if (target.kind === 'filter') {
      const { savedFilterRequest } = await import('./siteFilter.js');
      return await savedFilterRequest(payload, values, runtime);
    }
    return cmsFilterRequest(new QuerySource(payload?.querySource || payload), values);
  } catch (error) {
    console.warn(`Saved filter: ${target.kind === 'filter' ? 'saved filter' : 'query source'} ${target.id} can not be read`, error);
    return null;
  }
}

/**
 * The own records of a module (plan 27l §11.3, §12): the request of its query source, saved filter or query; null for a
 * record (Record View: `state.recordId`), without one or when it can not be read.
 *
 * @param {object} instance Instance configuration (`dataSource`).
 * @param {object} [runtime] `runtime` of the configuration block.
 * @param {Function} [load] fetch.
 * @returns {Promise<{dataSource: object, raw?: object, values: object, missing: string[]}|null>}
 */
export async function instanceSourceRequest(instance, runtime = {}, load = globalThis.fetch) {
  const source = cmsInstanceDataSource(instance?.dataSource, instance?.type);
  if (!source || source.record) return null;
  if (source.query) {
    return { dataSource: normalizeDataSource({ reference: { type: 'query' }, title: '', request: { q: source.query } }), values: {}, missing: [] };
  }
  if (typeof load !== 'function') return null;
  const target = source.filter ? { kind: 'filter', id: source.filter } : { kind: 'source', id: source.source };
  const request = await readFilterTarget(runtime, target, {}, load);
  // a parameterized one has no records without values (the designer offers only the ones without parameters)
  return request && !request.missing?.length ? request : null;
}

/**
 * The start of a module instance (plan 27l §12): the Saved filter of the page URL when it takes Saved filter links (plan
 * 27j), else its own query, else the newest search of the page it takes (a module mounted later); the stored state
 * without one. Record View: its own record (`state.recordId`).
 *
 * @param {object} instance Instance configuration.
 * @param {object} config The configuration block of the page.
 * @returns {Promise<{state: object|null, request: object|null}>} `request`: the search it starts with.
 */
async function moduleStart(instance, config) {
  const state = instance.state ?? null;
  if (!CMS_RECORDS_MODULES.includes(instance.type)) return { state, request: null };
  const links = instanceLinks(instance, config.instances);
  if (links.own?.record) return { state: { ...(state && typeof state === 'object' ? state : {}), recordId: links.own.record }, request: null };
  const sync = pageSyncOf(config);
  let request = null;
  if (links.from.includes('links') && CMS_FILTER_MODULES.includes(instance.type)) {
    // a page loaded by the navigation modes swap / scroll: the query of its link (phase C), the URL is pushed later
    const search = config.runtime?.filterSearch ?? globalThis.location?.search ?? '';
    request = await pageFilterRequest(config.runtime || {}, search);
    // the modules mounted later start with it too
    if (request && sync?.latest(['links']) !== request) sync?.remember(request, 'links');
  }
  if (!request && links.own) request = await instanceSourceRequest(instance, config.runtime || {});
  if (!request) request = sync?.latest(links.from) ?? null;
  return { state: request ? filterInstanceState(instance.type, state, request) : state, request };
}

/**
 * The start state of a module with a Saved filter (plan 27j), in the keys each module reads at start: Explorer
 * `pageRequest` (it asks for missing values in its filter form), Data `dataSource` + `query`, Map `query` in its
 * Filtered Result document, Graph `query`, Timeline `query` + `currentDataSource`.
 *
 * @param {string} type Module type.
 * @param {object|null} state The stored state.
 * @param {{dataSource: object, raw: object, values: object, missing: string[]}} request pageFilterRequest.
 * @returns {object}
 */
export function filterInstanceState(type, state, request) {
  const base = state && typeof state === 'object' ? { ...state } : {};
  const { dataSource } = request;
  const query = dataSource.request.q;
  switch (type) {
    case 'explorer':
      return { ...base, pageRequest: request };
    case 'data':
      return { ...base, querySourceId: null, query, dataSource, title: dataSource.title, fields: dataSource.presentation?.data?.fields || [] };
    case 'map':
      return { ...base, query, activeDocumentId: 'dynamic' };
    case 'graph':
      return { ...base, query, querySourceId: null, querySourceTitle: dataSource.title,
        ...(dataSource.request.rules?.length ? { expansions: { rules: dataSource.request.rules } } : { expansions: null }) };
    case 'timeline': {
      // the stored snapshot and bands would win over the query
      delete base.moduleState;
      delete base.contexts;
      return { ...base, query, currentDataSource: dataSource, activeDocumentId: 'dynamic' };
    }
    default:
      return base;
  }
}

/**
 * A Saved filter for modules already on the page (plan 27j phase C: a link to the current page, a page kept by the
 * navigation mode swap / scroll): the PageSync of the page gives the records to every module with `sync: all`
 * (Explorer: `applyPageRequest`, missing values in its filter form; the others through ModuleHandle).
 *
 * @param {Map<string, object>} mounted Instance id => what mountInstance returned.
 * @param {object} config The configuration block of the page (its instances and runtime).
 * @param {string} search The query string of the link.
 * @returns {Promise<boolean>} Whether a Saved filter was applied.
 */
export async function applyPageFilter(mounted, config, search) {
  const request = await pageFilterRequest(config?.runtime || {}, search);
  const sync = pageSyncOf(config);
  if (!request || !sync) return false;
  // modules mounted before they could join (an older part of the page) join now
  for (const [id, api] of mounted || []) {
    const instance = config?.instances?.[id];
    if (api && CMS_RECORDS_MODULES.includes(instance?.type)) joinPageSync(config, id, instance, api);
  }
  await sync.setRequest(request);
  return true;
}

/** Whether a URL has a Saved filter (`source=` a query source, `filter=` a saved filter). */
export function hasPageFilter(url) {
  try {
    const params = new URL(url, globalThis.location?.href || 'http://localhost/').searchParams;
    return CMS_FILTER_KINDS.some((key) => params.has(key));
  } catch {
    return false;
  }
}

/**
 * The URL without the parameters of a Saved filter (`source` / `filter`, `v.*`) and its anchor: the page it opens.
 *
 * @param {string} url Absolute URL.
 * @returns {{page: string, search: string}} `search`: the query string of the Saved filter ('' without one).
 */
export function splitFilterUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { page: String(url).split('#')[0], search: '' };
  }
  parsed.hash = '';
  if (!CMS_FILTER_KINDS.some((key) => parsed.searchParams.has(key))) return { page: parsed.href, search: '' };
  const filter = new URLSearchParams();
  for (const [key, value] of [...parsed.searchParams]) {
    if (CMS_FILTER_KINDS.includes(key) || key.startsWith('v.')) filter.append(key, value);
  }
  for (const key of [...new Set([...filter.keys()])]) parsed.searchParams.delete(key);
  return { page: parsed.href, search: `?${filter.toString()}` };
}

/**
 * The navigation mode reload (plan 27j phase C): a Saved filter link to the current page applies its records to the
 * modules of the page without loading it again (history entry added); back / forward between such entries apply
 * them again, back to the page without a filter loads it.
 *
 * @param {{root: HTMLElement, config: object, mounted: Map, win?: Window}} options
 * @returns {() => void} Stops listening.
 */
export function attachSamePageFilters({ root, config, mounted, win = globalThis.window }) {
  if (!root || !win || config?.runtime?.design) return () => {};
  const pageOf = (url) => splitFilterUrl(new URL(url, win.location.href).href).page;
  // a filter was applied on this page (back to the page without one: load it again)
  let filtered = hasPageFilter(win.location.href);
  const onClick = (event) => {
    if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target?.closest?.('a[href]');
    if (!link || (link.getAttribute('target') && link.getAttribute('target') !== '_self')) return;
    const href = new URL(link.getAttribute('href'), win.location.href).href;
    if (!hasPageFilter(href) || pageOf(href) !== pageOf(win.location.href)) return;
    event.preventDefault();
    win.history?.pushState?.({ hFilter: true }, '', href);
    filtered = true;
    void applyPageFilter(mounted, config, splitFilterUrl(href).search);
  };
  const onPop = (event) => {
    if (hasPageFilter(win.location.href)) void applyPageFilter(mounted, config, splitFilterUrl(win.location.href).search);
    else if (filtered) win.location.reload?.();
  };
  root.addEventListener('click', onClick);
  win.addEventListener?.('popstate', onPop);
  return () => {
    root.removeEventListener('click', onClick);
    win.removeEventListener?.('popstate', onPop);
  };
}

/** A message in a host instead of its instance. */
function showMessage(host, text) {
  const message = document.createElement('div');
  message.className = 'h-site-message';
  message.textContent = text;
  host.replaceChildren(message);
  return null;
}

/**
 * Height, gap and alignment of badges on their host (review 2026-11-11): as PageContent::badgesLayout of the server
 * (the purifier removes the style of the stored HTML).
 */
function badgesLayout(host, settings) {
  const align = ['start', 'center', 'end'].includes(settings.align) ? settings.align : 'center';
  const height = Number(settings.height) > 0 ? Math.min(Number(settings.height), 400) : 48;
  const gap = Number(settings.gap) >= 0 ? Math.min(Number(settings.gap), 200) : 16;
  host.classList.remove('h-site-badges-start', 'h-site-badges-center', 'h-site-badges-end');
  host.classList.add(`h-site-badges-${align}`);
  host.style.setProperty('--h-site-badge-height', `${height}px`);
  host.style.setProperty('--h-site-badge-gap', `${gap}px`);
}
