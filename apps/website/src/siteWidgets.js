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

/** Presentations with one element visible: slideshow and carousel (HSlider ONE_VISIBLE, not imported: HSlider is a lazy chunk). */
const ONE_VISIBLE = Object.freeze(['slider', 'carousel']);

/** Widgets with HTML written by the server. */
export const SITE_WIDGETS = Object.freeze(['report', 'cards', 'gallery']);

/** Cards in the preview of the designer (plan 27e §11). */
export const PREVIEW_CARDS = 6;

/** Bytes of a generated report in the preview of the designer and with `display: cut` (server: PageContent::REPORT_CUT). */
export const REPORT_CUT = 102400;

/**
 * The output of a page language (plan 27e §28, server: PageContent::reportOutput): the language, else `def`, else the
 * default language of the website, else the first one.
 *
 * @param {Object<string, number|string>} files `{language: output id}`.
 * @param {string} language Language of the page.
 * @param {string[]} [languages] Languages of the website, the default first.
 * @returns {number} 0 when there is none.
 */
export function reportOutput(files, language, languages = []) {
  const outputs = Object.entries(files || {}).map(([code, id]) => [code, Number(id)]).filter(([, id]) => id > 0);
  const find = (code) => outputs.find(([key]) => key === code)?.[1];
  const wanted = [String(language || '').toLowerCase(), 'def', String(languages[0] || '').toLowerCase()];
  for (const code of wanted) {
    if (code && find(code)) return find(code);
  }
  return outputs[0]?.[1] ?? 0;
}

/**
 * The first part of a report: cut before the last tag that starts before the limit; the browser closes the open
 * elements when it is put into the page.
 *
 * @param {string} html
 * @param {number} [limit] Characters.
 * @returns {string}
 */
export function cutReport(html, limit = REPORT_CUT) {
  if (html.length <= limit) return html;
  const part = html.slice(0, limit);
  const open = part.lastIndexOf('<');
  return open > 0 ? part.slice(0, open) : part;
}

/** The content of `<body>` of a whole document, else the text. */
export function reportBody(html) {
  const body = /<body\b[^>]*>([\s\S]*)<\/body\s*>/i.exec(html);
  return body ? body[1] : html;
}

/**
 * Links of a generated report written by the server (Show link only, Show more): the text in the language of the
 * page; Show more puts the whole report into the host, or opens the file when it can not be loaded.
 *
 * @param {HTMLElement} host
 */
export function attachReportLinks(host) {
  host.querySelector('.h-site-report-link')?.replaceChildren($HR('Open report'));
  const more = host.querySelector('.h-site-report-more');
  if (!more) return;
  more.textContent = $HR('Show more');
  more.addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(more.href, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(String(response.status));
      host.innerHTML = reportBody(await response.text());
    } catch {
      globalThis.window?.open(more.href, '_blank', 'noopener');
    }
  });
}

/**
 * Whether a widget needs HSlider.
 *
 * @param {object} settings Settings of the instance.
 * @returns {boolean}
 */
export function needsSlider(settings = {}) {
  return ONE_VISIBLE.includes(settings.presentation) || settings.action === 'url';
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
  if (instance.type === 'report' && !config.runtime?.design) attachReportLinks(host);
  if (config.runtime?.design) {
    await fillPreview(host, instance, config.runtime, (config.site?.languages || []).map((item) => item?.code ?? item));
    return ONE_VISIBLE.includes(settings.presentation) ? startSlider(host, { ...settings, design: true }) : null;
  }
  return needsSlider(settings) ? startSlider(host, settings) : null;
}

/** The lazy HSlider over the elements of a host. */
async function startSlider(host, options) {
  const { HSlider } = await import('#shared/widgets/site/HSlider.js');
  return new HSlider().attach(host, options).render();
}

/** The host of a draft in the designer. */
async function fillPreview(host, instance, runtime, languages = []) {
  const settings = instance.settings || {};
  const language = runtime.language || 'eng';
  if (instance.type === 'gallery' || instance.type === 'cards') {
    // the classes the server gives the host: a list lays out its cards as the parent group does (style.css)
    host.classList.add(instance.type === 'cards' ? 'h-site-cards' : 'h-site-gallery');
    host.classList.toggle('h-site-widget-list', !ONE_VISIBLE.includes(settings.presentation));
  }
  if (instance.type === 'gallery') {
    host.innerHTML = settings.html?.[language] ?? settings.html?.def ?? '';
  } else if (instance.type === 'cards') {
    host.innerHTML = await previewCards(settings, runtime, language).catch((error) => {
      console.warn('Preview of cards', error);
      return '';
    });
  } else {
    host.innerHTML = await previewReport(settings, runtime, language, languages).catch((error) => {
      console.warn('Preview of a generated report', error);
      return '';
    });
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
    const url = `${api}/report/${encodeURIComponent(settings.template)}/execute?recordId=${id}&lang=${encodeURIComponent(language)}`;
    const response = await fetch(url, { credentials: 'same-origin' });
    return response.ok ? `<div class="h-site-card">${await response.text()}</div>` : '';
  }));
  return cards.join('');
}

/**
 * A generated report in the preview (plan 27e §28): the file of the language through the output record, always
 * cut, so a big report does not slow the designer; Show link only shows the link.
 */
async function previewReport(settings, runtime, language, languages) {
  const id = reportOutput(settings.files, language, languages);
  if (!id) return '';
  const url = `${runtime.apiBaseUrl}/${encodeURIComponent(runtime.database)}/output/${id}/asset`;
  const link = (className, text) => {
    const anchor = document.createElement('a');
    anchor.className = className;
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.textContent = $HR(text);
    return anchor.outerHTML;
  };
  if (settings.display === 'link') return link('h-site-report-link', 'Open report');
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) return '';
  const body = reportBody(await response.text());
  if (body.length <= REPORT_CUT) return body;
  const note = document.createElement('div');
  note.className = 'h-site-message';
  note.textContent = $HR('The report is cut in the designer');
  return `<div class="h-site-report-part">${cutReport(body)}</div>${settings.display === 'cut' ? link('h-site-report-more', 'Show more') : note.outerHTML}`;
}
