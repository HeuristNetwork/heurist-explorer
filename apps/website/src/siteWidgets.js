/**
 * @file siteWidgets.js
 * @brief The website widgets Generated Report, Record cards and Media gallery in the browser (plan 27e §9-10). The
 *        server writes their HTML into the host; here only the start of HSlider (slider, actions), a lazy chunk
 *        loaded when a page has one. In the designer the host of a draft is filled here (first cards only) and a
 *        slider starts without rotation and actions, so the slides do not change the layout.
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

/** Widgets with HTML written by the server. */
export const SITE_WIDGETS = Object.freeze(['report', 'cards', 'gallery']);

/** Cards in the preview of the designer (plan 27e §11). */
export const PREVIEW_CARDS = 6;

/**
 * Whether a widget needs HSlider.
 *
 * @param {object} settings Settings of the instance.
 * @returns {boolean}
 */
export function needsSlider(settings = {}) {
  return settings.presentation === 'slider' || settings.action === 'url';
}

/**
 * Start a widget on a page.
 *
 * @param {HTMLElement} host Host of the instance.
 * @param {object} instance Instance of the configuration.
 * @param {object} config The configuration block.
 * @returns {Promise<object|null>} HSlider, or null.
 */
export async function mountSiteWidget(host, instance, config) {
  const settings = instance.settings || {};
  if (config.runtime?.design) {
    await fillPreview(host, instance, config.runtime);
    return settings.presentation === 'slider' ? startSlider(host, { ...settings, design: true }) : null;
  }
  return needsSlider(settings) ? startSlider(host, settings) : null;
}

/** The lazy HSlider over the elements of a host. */
async function startSlider(host, options) {
  const { HSlider } = await import('#shared/widgets/site/HSlider.js');
  return new HSlider().attach(host, options).render();
}

/** The host of a draft in the designer. */
async function fillPreview(host, instance, runtime) {
  const settings = instance.settings || {};
  const language = runtime.language || 'eng';
  if (instance.type === 'gallery') {
    host.innerHTML = settings.html?.[language] ?? settings.html?.def ?? '';
  } else if (instance.type === 'cards') {
    host.innerHTML = await previewCards(settings, runtime, language).catch((error) => {
      console.warn('Preview of cards', error);
      return '';
    });
  } else {
    const files = Object.values(settings.files || {});
    host.textContent = files.length ? `${$HR('Generated Report')}: ${files.join(', ')}` : '';
  }
  if (!host.innerHTML) host.textContent = $HR('Nothing to show yet: open the configuration of this element');
}

/** The first cards: the query, then the report of each record (no new endpoint). */
async function previewCards(settings, runtime, language) {
  if (!Array.isArray(settings.query) || !settings.query.length || !settings.template) return '';
  const api = `${runtime.apiBaseUrl}/${encodeURIComponent(runtime.database)}`;
  const query = new URLSearchParams({ q: JSON.stringify(settings.query), detail: 'ids', limit: String(PREVIEW_CARDS) });
  const found = await (await fetch(`${api}/records?${query}`, { credentials: 'same-origin' })).json();
  const ids = (found?.ids || found?.records || []).slice(0, PREVIEW_CARDS).map((item) => Number(item?.rec_ID ?? item));
  const cards = await Promise.all(ids.map(async (id) => {
    const url = `${api}/reports/${encodeURIComponent(settings.template)}/render?rec=${id}&lang=${encodeURIComponent(language)}`;
    const response = await fetch(url, { credentials: 'same-origin' });
    return response.ok ? `<div class="h-site-card">${await response.text()}</div>` : '';
  }));
  return cards.join('');
}
