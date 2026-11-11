/**
 * @file actionForms.js
 * @brief Forms of the action menu and its social media preset in the CMS designer (plan 27f §6).
 *
 * Action menu: the presentation (links, buttons, icons, drop-down with its label) and a list of items, each with
 * a label, a Font Awesome icon, the action (a page of the website, an external URL, Add record of a type) and its
 * target. Add record is offered only when the website has Heurist Explorer (the action is done by it, §9.4).
 * Social media: a fixed list of networks with an URL input each; the networks with an URL become icon items of an
 * action menu (`preset: 'social'`, presentation icons).
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

import '@fortawesome/fontawesome-free/css/brands.min.css';
import { $HR } from '#shared/ui';
import { formDialog } from './designerDialogs.js';
import { dragHandle, helpLine, sortableList } from './designerStyles.js';
import { recordPagePicker } from './recordPageField.js';

/** Social networks of the social media preset (hard-coded, §9.6): id, name, Font Awesome icon, URL hint. */
export const SOCIAL_NETWORKS = Object.freeze([
  { id: 'facebook', name: 'Facebook', icon: 'fa-brands fa-facebook', hint: 'https://www.facebook.com/...' },
  { id: 'x', name: 'X (Twitter)', icon: 'fa-brands fa-x-twitter', hint: 'https://x.com/...' },
  { id: 'instagram', name: 'Instagram', icon: 'fa-brands fa-instagram', hint: 'https://www.instagram.com/...' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'fa-brands fa-linkedin', hint: 'https://www.linkedin.com/...' },
  { id: 'youtube', name: 'YouTube', icon: 'fa-brands fa-youtube', hint: 'https://www.youtube.com/...' },
  { id: 'vimeo', name: 'Vimeo', icon: 'fa-brands fa-vimeo', hint: 'https://vimeo.com/...' },
  { id: 'mastodon', name: 'Mastodon', icon: 'fa-brands fa-mastodon', hint: 'https://mastodon.social/@...' },
  { id: 'bluesky', name: 'Bluesky', icon: 'fa-brands fa-bluesky', hint: 'https://bsky.app/profile/...' },
  { id: 'github', name: 'GitHub', icon: 'fa-brands fa-github', hint: 'https://github.com/...' },
  { id: 'orcid', name: 'ORCID', icon: 'fa-brands fa-orcid', hint: 'https://orcid.org/...' },
  { id: 'researchgate', name: 'ResearchGate', icon: 'fa-brands fa-researchgate', hint: 'https://www.researchgate.net/...' },
  { id: 'flickr', name: 'Flickr', icon: 'fa-brands fa-flickr', hint: 'https://www.flickr.com/...' },
  { id: 'email', name: 'Email', icon: 'fa-solid fa-envelope', hint: 'name@example.org' },
  { id: 'rss', name: 'RSS feed', icon: 'fa-solid fa-rss', hint: 'https://.../feed' }
]);

/** Presentations of an action menu: value, label. */
const PRESENTATIONS = Object.freeze([['links', 'Links'], ['buttons', 'Buttons'], ['icons', 'Icons'], ['dropdown', 'Drop-down menu']]);

/**
 * Actions of an item: value, label, disabled (Saved filter: not done yet). Record page: a record on a record page; Back:
 * the page before (plan 27g §6).
 */
const ACTIONS = Object.freeze([['page', 'Go to a page'], ['url', 'Open a URL'], ['addRecord', 'Add a record'],
  ['recordPage', 'Record page'], ['back', 'Back'], ['savedFilter', 'Saved filter', true]]);

/**
 * Settings of the social media preset from the URLs of the networks (empty URLs left out).
 *
 * @param {Object<string, string>} urls Network id => URL (Email: an address or mailto:).
 * @returns {{preset: string, presentation: string, items: Array<object>}}
 */
export function socialSettings(urls) {
  const items = [];
  for (const network of SOCIAL_NETWORKS) {
    let url = String(urls[network.id] || '').trim();
    if (!url) continue;
    if (network.id === 'email' && !/^mailto:/i.test(url)) url = `mailto:${url}`;
    items.push({ label: network.name, icon: network.icon, iconOnly: true, action: 'url', target: url, newTab: network.id !== 'email' });
  }
  return { preset: 'social', presentation: 'icons', items };
}

/**
 * URLs of the networks in the settings of a social media menu (by icon).
 *
 * @param {object} settings
 * @returns {Object<string, string>}
 */
export function socialUrls(settings = {}) {
  const urls = {};
  for (const item of settings.items || []) {
    const network = SOCIAL_NETWORKS.find((entry) => entry.icon === item.icon);
    if (network) urls[network.id] = network.id === 'email' ? String(item.target || '').replace(/^mailto:/i, '') : String(item.target || '');
  }
  return urls;
}

/**
 * The social media form: a row for each network (icon, name, URL).
 *
 * @param {{settings?: object}} options
 * @returns {Promise<object|null>} Settings of the action menu.
 */
export function openSocialForm({ settings = {} } = {}) {
  const urls = socialUrls(settings);
  const form = element('form', 'h-cms-form h-cms-social-form');
  form.append(helpLine('Enter the addresses of the website on social media. Networks without an address are not shown.'));
  const table = element('div', 'h-cms-social-list');
  const inputs = {};
  for (const network of SOCIAL_NETWORKS) {
    const icon = element('i', `${network.icon} h-cms-social-icon`);
    icon.setAttribute('aria-hidden', 'true');
    const name = element('label', 'h-cms-social-name');
    name.textContent = network.name;
    const input = element('input', 'h-input h-compact');
    input.type = 'text';
    input.value = urls[network.id] || '';
    input.placeholder = network.hint;
    input.id = `h-cms-social-${network.id}`;
    name.setAttribute('for', input.id);
    inputs[network.id] = input;
    table.append(icon, name, input);
  }
  form.append(table);
  return formDialog(form, 'Social media', 'Save', () => socialSettings(Object.fromEntries(Object.entries(inputs).map(([id, input]) => [id, input.value]))),
    null, 'h-dialog-cms-social');
}

/**
 * The action menu form.
 *
 * @param {object} options
 * @param {object} [options.settings] Settings of the action menu.
 * @param {Array<{id: number, title: string, depth?: number}>} [options.pages] Pages of the website (Home first).
 * @param {Array<{id: number, name: string}>} [options.recordTypes] Record types (Add record).
 * @param {boolean} [options.canAddRecord] Whether the website has Heurist Explorer (Add record).
 * @param {object} [options.services] Record page (plan 27g §6): `recordPageTerms()`, `createRecordPage`, `cardTemplates`,
 *        `templateTerms` (recordPagePicker) and `browseRecords` (the record).
 * @returns {Promise<object|null>} Settings.
 */
export function openActionMenuForm({ settings = {}, pages = [], recordTypes = [], canAddRecord = false, services = {} } = {}) {
  const form = element('form', 'h-cms-form h-cms-action-form');
  form.append(helpLine(canAddRecord ? 'Links to pages of the website or to other websites, and actions such as Add record.'
    : 'Links to pages of the website or to other websites. Add record needs Heurist Explorer on the website.'));
  const presentation = element('select', 'h-select h-compact');
  presentation.append(...PRESENTATIONS.map(([value, label]) => option(value, $HR(label))));
  presentation.value = PRESENTATIONS.some(([value]) => value === settings.presentation) ? settings.presentation : 'links';
  const label = element('input', 'h-input h-compact');
  label.type = 'text';
  label.value = settings.label || '';
  label.placeholder = $HR('Menu');
  const labelLine = line('Label of the drop-down button', label);
  const showLabel = () => { labelLine.hidden = presentation.value !== 'dropdown'; };
  presentation.addEventListener('change', showLabel);
  form.append(classed(line('Presentation', presentation), 'h-cms-action-presentation'), labelLine);
  showLabel();

  const list = element('div', 'h-cms-action-list');
  const actions = ACTIONS.filter(([value]) => value !== 'addRecord' || canAddRecord);
  const rows = [];
  const addRow = (item = {}) => {
    const row = element('div', 'h-cms-action-row');
    const text = element('input', 'h-input h-compact');
    text.type = 'text';
    text.value = item.label || '';
    text.placeholder = $HR('Label');
    const icon = element('input', 'h-input h-compact h-cms-action-icon');
    icon.type = 'text';
    icon.value = item.icon || '';
    icon.placeholder = 'fa-solid fa-star';
    icon.title = $HR('Font Awesome icon classes (optional)');
    const glyph = element('i', item.icon || '');
    glyph.setAttribute('aria-hidden', 'true');
    icon.addEventListener('input', () => { glyph.className = icon.value; });
    const action = element('select', 'h-select h-compact');
    action.append(...actions.map(([value, caption, disabled]) => {
      const node = option(value, $HR(caption));
      node.disabled = Boolean(disabled);
      return node;
    }));
    action.value = actions.some(([value]) => value === item.action) ? item.action : 'page';
    const target = element('span', 'h-cms-action-target');
    const page = element('select', 'h-select h-compact');
    page.append(...pages.map((entry) => option(String(entry.id), `${'  '.repeat(entry.depth || 0)}${entry.title || `#${entry.id}`}`)));
    const url = element('input', 'h-input h-compact');
    url.type = 'text';
    url.placeholder = 'https://';
    const type = element('select', 'h-select h-compact');
    type.append(...recordTypes.map((entry) => option(String(entry.id), entry.name)));
    // Record page: the page and the record (plan 27g §6)
    const recordPage = recordPagePicker(services, item.action === 'recordPage' ? Number(item.target) || null : null);
    let recordId = item.action === 'recordPage' ? Number(item.record) || 0 : 0;
    const chooseRecord = button('fa-magnifying-glass', 'Choose the record', true);
    const recordLabel = () => {
      chooseRecord.lastChild.textContent = ` ${recordId ? `#${recordId}` : $HR('Choose the record')}`;
    };
    recordLabel();
    chooseRecord.disabled = typeof services.browseRecords !== 'function';
    chooseRecord.addEventListener('click', async () => {
      const ids = await services.browseRecords({ selectMode: 'select', title: $HR('Record of the record page') });
      if (Number(ids?.[0]) > 0) {
        recordId = Number(ids[0]);
        recordLabel();
      }
    });
    const recordTarget = element('span', 'h-cms-action-record');
    recordTarget.append(recordPage.element, chooseRecord);
    if (item.action === 'url') url.value = item.target || '';
    else if (item.action === 'addRecord') type.value = String(item.target || '');
    else if (item.action !== 'recordPage' && item.target) page.value = String(item.target);
    const showTarget = () => target.replaceChildren(...({ page: [page], url: [url], addRecord: [type], recordPage: [recordTarget], back: [] }[action.value] || [page]));
    // Go to a page without a label: the name of the page (review 2026-11-11); Back: "Back"
    const pageLabel = () => {
      if (text.value.trim()) return;
      if (action.value === 'back') text.value = $HR('Back');
      if (action.value !== 'page') return;
      const chosen = pages.find((entry) => String(entry.id) === page.value);
      if (chosen?.title) text.value = chosen.title;
    };
    action.addEventListener('change', () => {
      showTarget();
      pageLabel();
    });
    page.addEventListener('change', pageLabel);
    showTarget();
    const newTab = checkbox('New tab', item.newTab);
    const iconOnly = checkbox('Icon only', item.iconOnly);
    const remove = button('fa-xmark', 'Remove');
    remove.addEventListener('click', () => {
      rows.splice(rows.findIndex((entry) => entry.row === row), 1);
      row.remove();
    });
    row.append(dragHandle(), text, glyph, icon, action, target, newTab.box, iconOnly.box, remove);
    list.append(row);
    rows.push({
      row,
      read: () => {
        pageLabel();
        const value = { label: text.value.trim(), action: action.value };
        if (icon.value.trim()) value.icon = icon.value.trim();
        if (action.value === 'page') value.target = Number(page.value) || 0;
        else if (action.value === 'url') value.target = url.value.trim();
        else if (action.value === 'recordPage') {
          value.target = Number(recordPage.select.value) || 0;
          value.record = recordId;
        } else if (action.value === 'addRecord') value.target = Number(type.value) || type.value;
        if (newTab.input.checked) value.newTab = true;
        if (iconOnly.input.checked && value.icon) value.iconOnly = true;
        if (item.labels) value.labels = item.labels;
        return value;
      }
    });
  };
  for (const item of settings.items || []) addRow(item);
  sortableList(list, (from, to) => {
    rows.splice(to, 0, ...rows.splice(from, 1));
    list.replaceChildren(...rows.map((entry) => entry.row));
  });
  const add = button('fa-plus', 'Add item', true, 'h-btn h-btn-primary h-cms-add-button');
  add.addEventListener('click', () => addRow({}));
  form.append(list, add);
  const problems = element('div', 'h-cms-style-problems');
  form.append(problems);
  return formDialog(form, 'Action menu', 'Save', () => {
    const items = rows.map((entry) => entry.read()).filter((item) => item.label || item.icon);
    const missing = items.find((item) => (item.action === 'url' && !item.target) || (item.action === 'page' && !item.target));
    if (missing) {
      problems.textContent = $HR('Every item needs a page or a URL');
      return null;
    }
    if (items.some((item) => item.action === 'recordPage' && (!item.target || !item.record))) {
      problems.textContent = $HR('A Record page item needs a record page and a record');
      return null;
    }
    const result = { presentation: presentation.value, items };
    if (presentation.value === 'dropdown' && label.value.trim()) result.label = label.value.trim();
    if (settings.labels) result.labels = settings.labels;
    return result;
  }, null, 'h-dialog-cms-actions');
}

/**
 * Pages of the website as a flat list for a select: Home, then the menu tree with its depth.
 *
 * @param {{id: number, title?: string, pages?: Array}} site Summary of the website (designer `site`).
 * @param {string} [homeLabel]
 * @param {{records?: boolean}} [options] `records: false`: without record pages (they need a record, plan 27g).
 * @returns {Array<{id: number, title: string, depth: number}>}
 */
export function sitePageList(site, homeLabel = 'Home', { records = true } = {}) {
  const list = site ? [{ id: Number(site.id), title: $HR(homeLabel), depth: 0 }] : [];
  const walk = (pages, depth) => {
    for (const page of pages || []) {
      if (!records && page.record) continue;
      list.push({ id: Number(page.id), title: page.title || `#${page.id}`, depth });
      walk(page.children, depth + 1);
    }
  };
  walk(site?.pages, 1);
  return list;
}

function line(label, control) {
  const node = element('label', 'h-cms-styles-field');
  const caption = element('span');
  caption.textContent = $HR(label);
  node.append(caption, control);
  return node;
}

function classed(node, className) {
  node.classList.add(className);
  return node;
}

function checkbox(label, checked) {
  const box = element('label', 'h-cms-check');
  const input = element('input');
  input.type = 'checkbox';
  input.checked = Boolean(checked);
  box.append(input, document.createTextNode(` ${$HR(label)}`));
  return { box, input };
}

function button(icon, title, withLabel = false, className = 'h-btn h-compact') {
  const node = element('button', className);
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
