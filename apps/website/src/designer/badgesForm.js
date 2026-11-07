/**
 * @file badgesForm.js
 * @brief The Badges widget in the CMS designer (plan 27f §7): logos with links, made on the media gallery code.
 *
 * The form is a list of the chosen images (registered files), each with a title (tooltip and alt text) and a URL,
 * plus the height of the logos, their alignment, the gap and "grey until hover". The designer builds the HTML
 * (buildBadgesHtml, per language as the gallery) and the server writes it into the page.
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
import { buildCmsMedia, CMS_MEDIA_DEFAULTS } from '#shared/site/cmsMedia.js';
import { formDialog } from './designerDialogs.js';
import { helpLine } from './designerStyles.js';

/** Defaults of the badge settings. */
export const BADGE_DEFAULTS = Object.freeze({ height: 48, align: 'center', gap: 16, grey: false });

const ALIGNMENTS = Object.freeze([['start', 'Left'], ['center', 'Centre'], ['end', 'Right']]);

/**
 * The HTML of the badges: a link (or a figure without URL) with the image of each file.
 *
 * @param {Array<{file: object|null, title?: string, url?: string}>} items Resolved files in order.
 * @param {object} settings height, align, gap, grey.
 * @param {{urls: object, language?: string}} options `urls`: fileMediaUrls(baseUrl, database).
 * @returns {string}
 */
export function buildBadgesHtml(items, settings = {}, { urls, language = 'eng' } = {}) {
  const height = Number(settings.height) > 0 ? Number(settings.height) : BADGE_DEFAULTS.height;
  const media = { ...CMS_MEDIA_DEFAULTS, width: 'auto', height: `${height}px`, view: false };
  const align = ALIGNMENTS.some(([value]) => value === settings.align) ? settings.align : BADGE_DEFAULTS.align;
  const gap = Number(settings.gap) >= 0 ? Number(settings.gap) : BADGE_DEFAULTS.gap;
  const badges = items.filter((item) => item.file).map((item) => {
    const image = buildCmsMedia(item.file, { ...media, file: item.file.key }, { urls, language });
    if (!image) return '';
    const title = escape(item.title || '');
    const url = String(item.url || '').trim();
    const safe = /^(https?:\/\/|mailto:|\/|\.\.?\/)/i.test(url);
    return safe
      ? `<a class="h-site-badge" href="${escape(url)}" target="_blank" rel="noopener" title="${title}">${image}</a>`
      : `<span class="h-site-badge" title="${title}">${image}</span>`;
  }).join('');
  return `<div class="h-site-badges-row${settings.grey ? ' is-grey' : ''}" style="justify-content:${align};gap:${gap}px">${badges}</div>`;
}

/**
 * The badges form.
 *
 * @param {object} options
 * @param {object} [options.settings] Settings: ids, links {id: {title, url}}, height, align, gap, grey.
 * @param {() => Promise<number[]|null>} options.browse Choose registered files (record manager).
 * @param {(ids: number[]) => Promise<Array<{id: number, file: object|null, caption: string}>>} options.resolve Files of records.
 * @returns {Promise<{settings: object, items: Array<object>}|null>} Settings and the resolved items in order.
 */
export async function openBadgesForm({ settings = {}, browse, resolve }) {
  const links = { ...(settings.links || {}) };
  let items = await resolve((settings.ids || []).map(Number).filter(Boolean)).catch(() => []);
  const form = element('form', 'h-cms-form h-cms-badges-form');
  form.append(helpLine('Logos of participants, sponsors or hosts, each with a link. Choose the images (registered files), then give each'
    + ' a title and the address it opens.'));
  const list = element('div', 'h-cms-badges-list');
  const draw = () => {
    list.replaceChildren();
    if (!items.length) {
      const empty = element('div', 'h-cms-badges-empty');
      empty.textContent = $HR('No images yet: add some.');
      list.append(empty);
    }
    items.forEach((item, index) => {
      const row = element('div', 'h-cms-badges-row');
      const name = element('span', 'h-cms-badges-file');
      name.textContent = item.caption || item.file?.name || `#${item.id}`;
      const link = links[item.id] || {};
      const title = element('input', 'h-input h-compact');
      title.type = 'text';
      title.placeholder = $HR('Title (tooltip)');
      title.value = link.title ?? item.caption ?? '';
      title.addEventListener('input', () => { links[item.id] = { ...(links[item.id] || {}), title: title.value }; });
      const url = element('input', 'h-input h-compact');
      url.type = 'text';
      url.placeholder = 'https://';
      url.value = link.url || '';
      url.addEventListener('input', () => { links[item.id] = { ...(links[item.id] || {}), url: url.value }; });
      const up = iconButton('fa-arrow-up', 'Move up');
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        [items[index - 1], items[index]] = [items[index], items[index - 1]];
        draw();
      });
      const remove = iconButton('fa-xmark', 'Remove');
      remove.addEventListener('click', () => {
        items.splice(index, 1);
        draw();
      });
      row.append(name, title, url, up, remove);
      list.append(row);
    });
  };
  const add = iconButton('fa-plus', 'Add images', true);
  add.addEventListener('click', async () => {
    const ids = (await browse())?.map(Number).filter((id) => id > 0 && !items.some((item) => item.id === id)) || [];
    if (!ids.length) return;
    items = [...items, ...(await resolve(ids).catch(() => []))];
    draw();
  });
  const height = numberInput(settings.height ?? BADGE_DEFAULTS.height, 8, 400);
  const gap = numberInput(settings.gap ?? BADGE_DEFAULTS.gap, 0, 200);
  const align = element('select', 'h-select h-compact');
  align.append(...ALIGNMENTS.map(([value, label]) => option(value, $HR(label))));
  align.value = ALIGNMENTS.some(([value]) => value === settings.align) ? settings.align : BADGE_DEFAULTS.align;
  const grey = element('input');
  grey.type = 'checkbox';
  grey.checked = settings.grey === true;
  form.append(list, add, line('Height of the logos (px)', height), line('Gap (px)', gap), line('Alignment', align),
    line('Grey until the mouse is over a logo', grey));
  draw();
  return formDialog(form, 'Badges', 'Save', () => {
    const ids = items.map((item) => item.id);
    const kept = Object.fromEntries(ids.filter((id) => links[id]).map((id) => [id, links[id]]));
    return {
      settings: {
        ids, links: kept, height: Number(height.value) || BADGE_DEFAULTS.height, gap: Number(gap.value) || 0, align: align.value,
        grey: grey.checked
      },
      items: items.map((item) => ({ ...item, title: kept[item.id]?.title ?? item.caption ?? '', url: kept[item.id]?.url || '' }))
    };
  }, null, 'h-dialog-cms-badges');
}

function numberInput(value, min, max) {
  const input = element('input', 'h-input h-compact');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  return input;
}

function line(label, control) {
  const node = element('label', 'h-cms-styles-field');
  const caption = element('span');
  caption.textContent = $HR(label);
  node.append(caption, control);
  return node;
}

function iconButton(icon, title, withLabel = false) {
  const node = element('button', 'h-btn h-compact');
  node.type = 'button';
  node.title = $HR(title);
  const glyph = element('i', `fa-solid ${icon}`);
  glyph.setAttribute('aria-hidden', 'true');
  node.append(glyph);
  if (withLabel) node.append(document.createTextNode(` ${$HR(title)}`));
  return node;
}

function option(value, label) {
  const node = element('option');
  node.value = value;
  node.textContent = label;
  return node;
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function escape(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
