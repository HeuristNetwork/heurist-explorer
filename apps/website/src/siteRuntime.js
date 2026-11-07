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
 * instances are independent; synchronization (PageController) comes in phase 5.
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
import { SITE_WIDGETS, mountSiteWidget } from './siteWidgets.js';

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
  enhanceControls(root);
  const jobs = [];
  // written by the server, so they are here already; a preview of the designer opens nothing; with the navigation
  // modes swap / scroll other pages come later (one listener on the root serves them too)
  const navigation = config.site?.layout?.navigation;
  if (!config.runtime?.design && (root.querySelector('[data-h-view]') || navigation === 'swap' || navigation === 'scroll')) {
    jobs.push(import('#shared/widgets/site/HMediaViewer.js').then(({ attachMediaViews }) => attachMediaViews(root)));
  }
  if (!config.runtime?.design && root.classList?.contains('h-site-header-slide')) attachHeaderSlide(root);
  if (!config.runtime?.design) root.addEventListener('click', (event) => onAction(event));
  const mounted = await mountHosts(root, config, loaders);
  await Promise.all(jobs);
  return mounted;
}

/**
 * The slide out header (plan 27f §3): hidden while the visitor scrolls down past it, shown again when scrolling up.
 *
 * @param {HTMLElement} body Element with the class h-site-header-slide.
 * @param {Window} [win]
 * @returns {() => void} Removes the listener.
 */
export function attachHeaderSlide(body, win = globalThis.window) {
  let last = win?.scrollY || 0;
  const onScroll = () => {
    const now = win.scrollY || 0;
    const height = body.querySelector('.h-site-header')?.offsetHeight || 0;
    if (Math.abs(now - last) < 4) return;
    body.classList.toggle('h-site-header-away', now > last && now > height);
    last = now;
  };
  win?.addEventListener?.('scroll', onScroll, { passive: true });
  return () => win?.removeEventListener?.('scroll', onScroll);
}

/** Module APIs mounted on the page (all parts and loaded pages), for the actions of action menus. */
const MODULES = [];

/**
 * An action of an action menu (`data-h-action`, plan 27f §6): Add record goes to the Explorer of the page.
 *
 * @param {Event} event A click in the page.
 * @returns {boolean} Whether the click was an action.
 */
export function onAction(event) {
  const link = event.target?.closest?.('[data-h-action]');
  if (!link) return false;
  event.preventDefault?.();
  const action = link.getAttribute('data-h-action');
  const target = link.getAttribute('data-h-target');
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
 * Tabs and one-open accordions of the controls inside an element (the page, or a part the designer replaced).
 *
 * @param {HTMLElement} root
 */
export function enhanceControls(root) {
  for (const container of root.querySelectorAll('[data-h-control="tabs"]')) enhanceTabs(container);
  for (const container of root.querySelectorAll('[data-h-control="accordion"]')) exclusiveAccordion(container);
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
 * @returns {{config: object, mounted: Map, enhance: Function, mountInstance: Function, unmountInstance: Function}}
 */
export function designHooks({ config, mounted, loaders = MODULE_LOADERS }) {
  return {
    config,
    mounted,
    enhance: (root) => enhanceControls(root),
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
  if (instance.kind === 'widget' && instance.type === 'menu') {
    return new HMenu().attach(host, {
      items: config.site?.menu || [],
      settings: instance.settings || {},
      homeItem: config.site?.homeItem || null
    }).render();
  }
  if (instance.kind === 'widget' && instance.type === 'actionmenu') {
    const settings = instance.settings || {};
    const language = config.site?.language || '';
    return new HMenu().attach(host, {
      items: actionMenuItems(settings, { language }),
      settings: { presentation: settings.presentation || 'links', label: settings.labels?.[language] ?? settings.label },
      label: settings.labels?.[language] ?? settings.label ?? 'Actions'
    }).render();
  }
  if (instance.kind === 'widget' && instance.type === 'badges') {
    // written by the server; the designer's draft has an empty host: the HTML of the settings (plan 27f §7)
    host.classList.add('h-site-badges');
    if (!host.querySelector('.h-site-badges-row')) {
      const html = instance.settings?.html || {};
      if (instance.settings?.source === 'host') {
        // written by the server from the files of the installation; the draft shows where it goes
        host.textContent = config.runtime?.design ? $HR('Logo of the host organisation') : '';
      } else {
        host.innerHTML = html[config.site?.language || ''] ?? html.def ?? Object.values(html)[0] ?? '';
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
    const api = await mount({
      container,
      bootstrap: { runtime: { ...(config.runtime || {}) }, settings: instance.settings || {}, state: instance.state ?? null },
      assetBaseUrl: config.runtime?.moduleBaseUrl ? `${config.runtime.moduleBaseUrl}heurist-${instance.type}/` : null
    });
    MODULES.push({ type: instance.type, api, host });
    return api;
  } catch (error) {
    console.error(`Unable to show ${instance.type} (${id})`, error);
    return showMessage(host, $HR('This part of the page can not be shown'));
  }
}

/** A message in a host instead of its instance. */
function showMessage(host, text) {
  const message = document.createElement('div');
  message.className = 'h-site-message';
  message.textContent = text;
  host.replaceChildren(message);
  return null;
}
