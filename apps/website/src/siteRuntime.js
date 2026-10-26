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
import { HMenu } from '#shared/widgets/site/HMenu.js';

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
  for (const container of root.querySelectorAll('[data-h-control="tabs"]')) enhanceTabs(container);
  for (const container of root.querySelectorAll('[data-h-control="accordion"]')) exclusiveAccordion(container);
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
      languages: config.site?.languages || [],
      language: config.site?.language || null
    }).render();
  }
  if (instance.kind !== 'module' || !Object.hasOwn(loaders, instance.type)) {
    return showMessage(host, $HR('This part of the page can not be shown'));
  }
  host.classList.add('h-site-module');
  if (instance.mount === 'iframe') {
    const frame = document.createElement('iframe');
    frame.className = 'h-site-frame';
    frame.title = instance.type;
    frame.src = `${config.runtime?.frameUrl || ''}${encodeURIComponent(id)}`;
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
    return await mount({
      container,
      bootstrap: { runtime: { ...(config.runtime || {}) }, settings: instance.settings || {}, state: instance.state ?? null },
      assetBaseUrl: config.runtime?.moduleBaseUrl ? `${config.runtime.moduleBaseUrl}heurist-${instance.type}/` : null
    });
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
