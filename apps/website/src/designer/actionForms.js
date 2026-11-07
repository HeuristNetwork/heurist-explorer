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
import { helpLine } from './designerStyles.js';

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

/** Actions of an item: value, label. */
const ACTIONS = Object.freeze([['page', 'Go to a page'], ['url', 'Open a URL'], ['addRecord', 'Add a record']]);

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
 * @returns {Promise<object|null>} Settings.
 */
export function openActionMenuForm({ settings = {}, pages = [], recordTypes = [], canAddRecord = false } = {}) {
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
  form.append(line('Presentation', presentation), labelLine);
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
    action.append(...actions.map(([value, caption]) => option(value, $HR(caption))));
    action.value = actions.some(([value]) => value === item.action) ? item.action : 'page';
    const target = element('span', 'h-cms-action-target');
    const page = element('select', 'h-select h-compact');
    page.append(...pages.map((entry) => option(String(entry.id), `${'  '.repeat(entry.depth || 0)}${entry.title || `#${entry.id}`}`)));
    const url = element('input', 'h-input h-compact');
    url.type = 'text';
    url.placeholder = 'https://';
    const type = element('select', 'h-select h-compact');
    type.append(...recordTypes.map((entry) => option(String(entry.id), entry.name)));
    if (item.action === 'url') url.value = item.target || '';
    else if (item.action === 'addRecord') type.value = String(item.target || '');
    else if (item.target) page.value = String(item.target);
    const showTarget = () => target.replaceChildren({ page, url, addRecord: type }[action.value] || page);
    action.addEventListener('change', showTarget);
    showTarget();
    const newTab = checkbox('New tab', item.newTab);
    const iconOnly = checkbox('Icon only', item.iconOnly);
    const tools = element('span', 'h-cms-action-tools');
    const up = button('fa-arrow-up', 'Move up');
    const remove = button('fa-xmark', 'Remove');
    up.addEventListener('click', () => {
      const index = rows.findIndex((entry) => entry.row === row);
      if (index < 1) return;
      [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]];
      list.replaceChildren(...rows.map((entry) => entry.row));
    });
    remove.addEventListener('click', () => {
      rows.splice(rows.findIndex((entry) => entry.row === row), 1);
      row.remove();
    });
    tools.append(up, remove);
    row.append(text, glyph, icon, action, target, newTab.box, iconOnly.box, tools);
    list.append(row);
    rows.push({
      row,
      read: () => {
        const value = { label: text.value.trim(), action: action.value };
        if (icon.value.trim()) value.icon = icon.value.trim();
        if (action.value === 'page') value.target = Number(page.value) || 0;
        else if (action.value === 'url') value.target = url.value.trim();
        else value.target = Number(type.value) || type.value;
        if (newTab.input.checked) value.newTab = true;
        if (iconOnly.input.checked && value.icon) value.iconOnly = true;
        if (item.labels) value.labels = item.labels;
        return value;
      }
    });
  };
  for (const item of settings.items || []) addRow(item);
  const add = button('fa-plus', 'Add item', true);
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
 * @returns {Array<{id: number, title: string, depth: number}>}
 */
export function sitePageList(site, homeLabel = 'Home') {
  const list = site ? [{ id: Number(site.id), title: $HR(homeLabel), depth: 0 }] : [];
  const walk = (pages, depth) => {
    for (const page of pages || []) {
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

function checkbox(label, checked) {
  const box = element('label', 'h-cms-check');
  const input = element('input');
  input.type = 'checkbox';
  input.checked = Boolean(checked);
  box.append(input, document.createTextNode(` ${$HR(label)}`));
  return { box, input };
}

function button(icon, title, withLabel = false) {
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
