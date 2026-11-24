/**
 * @file presentationPages.js
 * @brief The right panel of the List of Crosstabs and Story maps (plan 27q3 §2.1): the website pages that show the
 *        selected Presentation set, found by the back link *Presentations on this page* 2-1204 (an ordinary record
 *        search, no endpoint of its own). Standalone pages first, then the pages of websites.
 *
 * Row: visibility, languages, name, URL, changed (date); Edit, Copy URL, Open (new tab), Delete (a standalone page
 * only). The URL and the kind come from `/page/{id}` (meta.website).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from '../../ui/i18n/HResource.js';
import { HMsg } from '../../ui/HMsg.js';
import { askChoice } from '../../ui/askChoice.js';
import { visibilityIconHtml } from '../record-list/recordAdminInfo.js';
import { element } from './presentationShell.js';

/** Pages read at most. */
const PAGE_LIMIT = 200;

/**
 * The pages that show a Presentation set (field 2-1204), with their summary.
 *
 * @param {object} apiClient HeuristApiClient.
 * @param {object|null} dbdefs HDbDefs.
 * @param {number} presentationId
 * @returns {Promise<Array<{id: number, title: string, visibility: string, modified: string, url: string,
 *   languages: string[], kind: string, canEdit: boolean}>>}
 */
export async function loadPresentationPages(apiClient, dbdefs, presentationId) {
  const id = (code) => Number(dbdefs?.dbconst?.(code)) || 0;
  const page = id('RT_CMS_PAGE');
  const field = id('DT_PAGE_PRESENTATIONS');
  if (!page || !field || !(Number(presentationId) > 0)) return [];
  const answer = await apiClient.get('/records', {
    query: {
      q: JSON.stringify([{ t: String(page) }, { [`f:${field}`]: String(presentationId) }]),
      fields: 'rec_ID,rec_Title,rec_NonOwnerVisibility,rec_Modified',
      limit: PAGE_LIMIT
    }
  });
  const records = (answer?.data ?? answer)?.records || [];
  const pages = await Promise.all(records.map(async (record) => {
    const pageId = Number(record.rec_ID);
    const summary = await apiClient.get(`/page/${pageId}`, { query: { fields: 'rec_ID' } })
      .then((response) => (response?.data ?? response)?.meta?.website || null).catch(() => null);
    return {
      id: pageId,
      title: String(summary?.title || record.rec_Title || `#${pageId}`),
      visibility: String(record.rec_NonOwnerVisibility || ''),
      modified: String(record.rec_Modified || ''),
      url: String(summary?.url || ''),
      languages: Array.isArray(summary?.languages) ? summary.languages : [],
      kind: String(summary?.kind || 'page'),
      canEdit: summary?.canEdit === true
    };
  }));
  // standalone pages first (they are the publications), then the pages of websites
  return pages.sort((a, b) => Number(b.kind === 'standalone') - Number(a.kind === 'standalone') || a.title.localeCompare(b.title));
}

/**
 * Fill the right panel with the pages of a Presentation set.
 *
 * @param {HTMLElement} host
 * @param {object} options
 * @param {object} options.apiClient
 * @param {object|null} options.dbdefs
 * @param {number|null} options.presentationId Null: nothing selected.
 * @param {function(number): *} [options.editPage] Edit a page (the Website manager / CMS editor).
 * @param {function(): *} [options.publish] Publish the selected item (a button under an empty list).
 * @returns {Promise<void>}
 */
export async function renderPresentationPages(host, { apiClient, dbdefs, presentationId, editPage = null, publish = null }) {
  host.replaceChildren();
  if (!presentationId) return;
  const box = element('div', 'h-presentation-pages', host);
  element('div', 'h-presentation-pages-title', box).textContent = $HR('Published pages');
  const status = element('p', 'h-muted', box);
  status.textContent = $HR('Loading...');
  let pages = [];
  try {
    pages = await loadPresentationPages(apiClient, dbdefs, presentationId);
  } catch (error) {
    status.textContent = error?.message || String(error);
    return;
  }
  status.remove();
  if (!pages.length) {
    element('p', 'h-muted', box).textContent = $HR('It is not published on a web page yet');
    if (typeof publish === 'function') {
      const button = element('button', 'h-btn', box);
      button.type = 'button';
      element('i', 'fa-solid fa-share-nodes', button).setAttribute('aria-hidden', 'true');
      element('span', '', button).textContent = ` ${$HR('Publish')}`;
      button.addEventListener('click', () => publish());
    }
    return;
  }
  const table = element('table', 'h-presentation-pages-table', box);
  const head = element('tr', '', element('thead', '', table));
  for (const text of ['', 'Language', 'Name', 'Changed', '']) element('th', '', head).textContent = text ? $HR(text) : '';
  const body = element('tbody', '', table);
  for (const page of pages) {
    const row = element('tr', '', body);
    element('td', 'h-presentation-pages-visibility', row).innerHTML = visibilityIconHtml(page.visibility);
    element('td', '', row).textContent = page.languages.join(', ') || '—';
    const name = element('td', 'h-presentation-pages-name', row);
    const link = element('a', '', name);
    link.textContent = page.title;
    if (page.url) {
      link.href = page.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = page.url;
    }
    if (page.kind !== 'standalone') element('span', 'h-presentation-pages-note', name).textContent = $HR('in a website');
    element('td', 'h-presentation-pages-date', row).textContent = page.modified.slice(0, 16);
    const tools = element('td', 'h-presentation-pages-tools', row);
    const icon = (glyph, title, run, disabled = false) => {
      const button = element('button', 'heurist-icon-button', tools);
      button.type = 'button';
      button.title = $HR(title);
      button.setAttribute('aria-label', button.title);
      button.disabled = disabled;
      element('i', `fa-solid ${glyph}`, button).setAttribute('aria-hidden', 'true');
      button.addEventListener('click', () => void Promise.resolve(run()).catch((error) => HMsg.showMsgErr(error?.message || String(error))));
    };
    if (typeof editPage === 'function') icon('fa-pen-ruler', 'Edit the page', () => editPage(page.id), !page.canEdit);
    icon('fa-link', 'Copy the address', () => copyText(page.url), !page.url);
    icon('fa-up-right-from-square', 'Open in a new tab', () => globalThis.open?.(page.url, '_blank', 'noopener'), !page.url);
    // a page of a website is removed in its website
    if (page.kind === 'standalone') {
      icon('fa-trash-can', 'Delete the page', async () => {
        const answer = await askChoice(`${$HR('Delete the page')} "${page.title}"?`, $HR('Delete'), [['delete', $HR('Delete')]]);
        if (answer !== 'delete') return;
        await apiClient.request(`/page/${page.id}`, { method: 'DELETE' });
        await renderPresentationPages(host, { apiClient, dbdefs, presentationId, editPage, publish });
      }, !page.canEdit);
    }
  }
}

/**
 * A text of the use of a Presentation set before Delete (HPresentationList `describeUse`): the pages that show it; a
 * set used by pages is not deleted (409 on the server), so the text starts with "!".
 *
 * @param {object} apiClient
 * @param {object|null} dbdefs
 * @param {number} presentationId
 * @returns {Promise<string>}
 */
export async function describePresentationUse(apiClient, dbdefs, presentationId) {
  const pages = await loadPresentationPages(apiClient, dbdefs, presentationId).catch(() => []);
  if (!pages.length) return '';
  return `!${$HR('It is used by website pages and can not be deleted')}: ${pages.map((page) => page.title).join(', ')}`;
}

/** Copy a text to the clipboard (a message when it is done). */
async function copyText(text) {
  if (!text) return;
  await globalThis.navigator?.clipboard?.writeText(text);
  HMsg.showMsgFlash?.($HR('The address is copied'), { showDelay: 1500 });
}
