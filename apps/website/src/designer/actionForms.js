/**
 * @file actionForms.js
 * @brief Forms of the action menu and its social media preset in the CMS designer (plan 27f §6).
 *
 * Action menu: the presentation (a row, icons, behind a button, icons that grow on hover; review 2026-11-16) and a list
 * of items, each with
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
import { createHInput } from '#shared/widgets/form/inputs/createHInput.js';
import { HInputColor } from '#shared/widgets/form/inputs/HInputColor.js';
import { ITEM_COLORS, MENU_COLOR, MENU_EXPAND_ICON, MENU_LINE_WIDTHS, faIcon, menuLook } from '#shared/site/cmsMenu.js';
import { formDialog } from './designerDialogs.js';
import { formChanged, sectionTitle, showDomForm } from './panelForms.js';
import { createTranslationForm } from '#shared/widgets/translation/HTranslationDialog.js';
import { dragHandle, helpLine, sortableList } from './designerStyles.js';
import { recordPagePicker } from './recordPageField.js';
import { savedFilterPicker, storedSavedFilter } from './savedFilterField.js';
import { cmsFilterKeys, cmsFilterTarget } from '#shared/site/cmsSavedFilter.js';

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

/**
 * Presentations of an action menu (plan 27k §1-2): value, label. Behind a button = the former drop-down and "icons behind
 * a button" (review 2026-11-16: one presentation, opened on hover or on a click); grow: icons that show their name.
 */
const PRESENTATIONS = Object.freeze([['row', 'Items in a row'], ['icons', 'Icons'], ['expand', 'Behind a button'],
  ['grow', 'Icons that show their name on hover']]);

/** How the list behind the button opens (review 2026-11-16). */
const OPEN_MODES = Object.freeze([['hover', 'On hover (and a click)'], ['click', 'On a click']]);

/**
 * Fields of the line of the underline style (review 2026-11-16) for HEditForm (website menu form): width and colour,
 * shown with the style underline.
 */
export const MENU_LINE_FIELDS = Object.freeze([
  { name: 'lineWidth', type: 'enum', label: 'Width of the line', max: 1, showWhen: { style: 'underline' },
    terms: [{ id: '', label: '2px (default)' }, ...MENU_LINE_WIDTHS.filter((width) => width !== '2px').map((id) => ({ id, label: id }))] },
  { name: 'lineColor', type: 'color', label: 'Colour of the line', max: 1, showWhen: { style: 'underline' },
    help: 'Empty: the colour of the text' }
]);

/**
 * Values of MENU_LINE_FIELDS from the settings of a menu.
 *
 * @param {object} settings
 * @returns {{lineWidth: string, lineColor: string}}
 */
export function menuLineValues(settings = {}) {
  return { lineWidth: MENU_LINE_WIDTHS.includes(settings.lineWidth) ? settings.lineWidth : '', lineColor: settings.lineColor || '' };
}

/**
 * Settings of the line from the values (only with the style underline; defaults and colours that are not allowed are
 * left out).
 *
 * @param {{style?: string, lineWidth?: string, lineColor?: string}} values
 * @returns {{lineWidth?: string, lineColor?: string}}
 */
export function menuLineSettings(values = {}) {
  const result = {};
  if (values.style !== 'underline') return result;
  if (MENU_LINE_WIDTHS.includes(values.lineWidth) && values.lineWidth !== '2px') result.lineWidth = values.lineWidth;
  const colour = String(values.lineColor || '').trim();
  if (colour && MENU_COLOR.test(colour)) result.lineColor = colour;
  return result;
}

/** Styles of the items of a menu (plan 27k §1): value, label; also the website menu form. */
export const ITEM_STYLES = Object.freeze([['plain', 'Plain'], ['links', 'Links (underlined)'], ['underline', 'Bottom border on hover'],
  ['pills', 'Pills (current item filled)'], ['buttons', 'Buttons'], ['outline', 'Outlined buttons']]);

/** Presentations of the social media preset (plan 27k §2, grow: review 2026-11-16). */
const SOCIAL_PRESENTATIONS = Object.freeze([['icons', 'Icons'], ['expand', 'Icons behind a button (expand on hover)'],
  ['grow', 'Icons that show their name on hover']]);

/** Colours of the items of tabs, menus and action menus (plan 27n §7, ITEM_COLORS of cmsMenu.js): value, label. */
export const ITEM_COLOR_LABELS = Object.freeze([['', 'Colours of the website'], ['inverted', 'Inverted (over a banner)'],
  ['own', 'Own (Own style > Item colours)']]);

/** Orientations of an action menu (plan 27k §2). */
const ORIENTATIONS = Object.freeze([['horizontal', 'Horizontal'], ['vertical', 'Vertical']]);

/**
 * Actions of an item: value, label. Record page: a record on a record page; Back: the page before (plan 27g §6); Saved
 * filter: a query source shown on a page of the website (plan 27j, savedFilterField.js); Show / hide: a named element of
 * the page, header or footer (plan 27n §10), not in text links.
 */
const ACTIONS = Object.freeze([['page', 'Go to a page'], ['url', 'Open a URL'], ['addRecord', 'Add a record'],
  ['recordPage', 'Record page'], ['back', 'Back'], ['savedFilter', 'Saved filter'], ['search', 'Search box (Saved filter)'],
  ['toggle', 'Show / hide element']]);

/**
 * Label of an item without one (2026-11-14: an item is not lost when its label is forgotten); Go to a page: the name of
 * the page.
 */
const DEFAULT_LABELS = Object.freeze({ page: 'Page', url: 'Link', addRecord: 'Add', recordPage: 'Record link', back: 'Back',
  savedFilter: 'Filter', search: 'Search', toggle: 'More' });

/**
 * Settings of the social media preset from the URLs of the networks (empty URLs left out).
 *
 * @param {Object<string, string>} urls Network id => URL (Email: an address or mailto:).
 * @param {object} [look] Presentation `icons` | `expand` (plan 27k §2), `style`, `orientation`, `icon` and `label` of the
 *        expand button; defaults are not written.
 * @returns {{preset: string, presentation: string, items: Array<object>}}
 */
export function socialSettings(urls, look = {}) {
  const items = [];
  for (const network of SOCIAL_NETWORKS) {
    let url = String(urls[network.id] || '').trim();
    if (!url) continue;
    if (network.id === 'email' && !/^mailto:/i.test(url)) url = `mailto:${url}`;
    items.push({ label: network.name, icon: network.icon, iconOnly: true, action: 'url', target: url, newTab: network.id !== 'email' });
  }
  const settings = { preset: 'social', presentation: ['expand', 'grow'].includes(look.presentation) ? look.presentation : 'icons', items };
  if (ITEM_STYLES.some(([value]) => value === look.style) && look.style !== 'plain') settings.style = look.style;
  if (look.orientation === 'vertical') settings.orientation = 'vertical';
  if (settings.presentation === 'expand') {
    if (String(look.icon || '').trim()) settings.icon = String(look.icon).trim();
    if (String(look.label || '').trim()) settings.label = String(look.label).trim();
  }
  return settings;
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
 * @param {{settings?: object, inline?: object|null, presentationExtra?: HTMLElement|null}} options `inline`: in the element
 *        panel (panelForms.showDomForm); `presentationExtra`: a field of the designer at the end of Presentation (Reveal).
 * @returns {Promise<object|null>} Settings of the action menu.
 */
export function openSocialForm({ settings = {}, inline = null, presentationExtra = null } = {}) {
  const urls = socialUrls(settings);
  const form = element('form', 'h-cms-form h-cms-social-form');
  // the sections of plan 27n §6: Source (the networks), Presentation
  form.append(sectionTitle($HR('Source')),
    helpLine('Enter the addresses of the website on social media. Networks without an address are not shown.'));
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
  // the icons in a row or behind a button that expands on hover (plan 27k §2), their style and orientation
  const presentation = select(SOCIAL_PRESENTATIONS, ['expand', 'grow'].includes(settings.presentation) ? settings.presentation : 'icons');
  const style = select(ITEM_STYLES, menuLook(settings).style);
  const orientation = select(ORIENTATIONS, settings.orientation === 'vertical' ? 'vertical' : 'horizontal');
  const icon = element('input', 'h-input h-compact h-cms-action-icon');
  icon.type = 'text';
  icon.value = settings.icon || '';
  icon.placeholder = MENU_EXPAND_ICON;
  icon.title = $HR('Font Awesome icon classes (optional)');
  const iconLine = line('Icon of the button', icon);
  const showIcon = () => { iconLine.hidden = presentation.value !== 'expand'; };
  presentation.addEventListener('change', showIcon);
  const settingsBox = element('div', 'h-cms-action-settings');
  settingsBox.append(line('Show as', presentation), iconLine, line('Style of the items', style), line('Orientation', orientation));
  form.append(sectionTitle($HR('Presentation')), settingsBox);
  if (presentationExtra) form.append(presentationExtra);
  showIcon();
  return showDomForm(form, $HR('Social media'), () => socialSettings(Object.fromEntries(Object.entries(inputs).map(([id, input]) => [id, input.value])),
    { presentation: presentation.value, style: style.value, orientation: orientation.value, icon: icon.value, label: settings.label }),
  { inline, className: 'h-dialog-cms-social' });
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
 *        `templateTerms` (recordPagePicker) and `browseRecords` (the record); with `apiClient` and `dbdefs` the record
 *        is chosen in HInputResource (its title and record type icon; `iconBase` {baseUrl, database} of the icons).
 * @param {(() => Promise<Array<object>>)|null} [options.recordFields] The action menu of a record page (plan 27j phase B):
 *        the fields offered as values from the record of a Saved filter.
 * @param {{title?: string, actions?: string[]}|null} [options.single] One item without the presentation, Add and Remove
 *        (Link of the text editor, 2026-11-14): the title of the popup and the offered actions; the answer is the item.
 * @returns {Promise<object|null>} Settings (single: the item).
 */
export function openActionMenuForm({ settings = {}, pages = [], recordTypes = [], canAddRecord = false, services = {}, single = null,
  recordFields = null, elements = [], languages = [], translator = null, inline = null, presentationExtra = null } = {}) {
  const form = element('form', 'h-cms-form h-cms-action-form');
  if (single) form.classList.add('h-cms-action-single');
  form.append(helpLine(single ? 'A link to a page of the website, a record on a record page, or another website.'
    : canAddRecord ? 'Links to pages of the website or to other websites, and actions such as Add record.'
      : 'Links to pages of the website or to other websites. Add record needs Heurist Explorer on the website.'));
  // stored links / buttons: a row with that style, a stored drop-down: behind a button opened by a click (menuLook); a new
  // menu: a row of links
  const look = menuLook(settings.presentation ? settings : { presentation: 'links', ...settings });
  const presentation = select(PRESENTATIONS, look.presentation === 'menu' ? 'row' : look.presentation);
  const style = select(ITEM_STYLES, look.style);
  const orientation = select(ORIENTATIONS, look.orientation === 'vertical' ? 'vertical' : 'horizontal');
  // the items (created here: the expand / collapse button of their section refers to them)
  const list = element('div', 'h-cms-action-list');
  const label = element('input', 'h-input h-compact');
  label.type = 'text';
  label.value = settings.label || '';
  label.placeholder = $HR('Actions');
  const labelLine = line('Name of the button (rollover)', label);
  const icon = element('input', 'h-input h-compact h-cms-action-icon');
  icon.type = 'text';
  icon.value = settings.icon || '';
  icon.placeholder = MENU_EXPAND_ICON;
  icon.title = $HR('Font Awesome icon classes (optional)');
  // the preview of the icon: fa-solid when no style is given (review 2026-11-16)
  const iconGlyph = element('i', faIcon(settings.icon) || MENU_EXPAND_ICON);
  iconGlyph.setAttribute('aria-hidden', 'true');
  icon.addEventListener('input', () => { iconGlyph.className = faIcon(icon.value) || MENU_EXPAND_ICON; });
  const iconBox = element('span', 'h-cms-action-icon-box');
  iconBox.append(iconGlyph, icon);
  const iconLine = line('Icon of the button', iconBox);
  // the name on the button (the former drop-down), how the list opens (review 2026-11-16)
  const buttonText = checkbox('Show the name on the button', look.buttonText);
  const buttonTextLine = block('', buttonText.box);
  const open = select(OPEN_MODES, look.open);
  const openLine = line('Open the list', open);
  const styleLine = line('Style of the items', style);
  // the line of the underline style (review 2026-11-16)
  const lineWidth = select([['', '2px (default)'], ...MENU_LINE_WIDTHS.filter((width) => width !== '2px').map((width) => [width, width])],
    MENU_LINE_WIDTHS.includes(settings.lineWidth) ? settings.lineWidth : '');
  const lineWidthLine = line('Width of the line', lineWidth);
  const lineColorHost = element('div', 'h-cms-action-colour');
  const lineColor = new HInputColor().attach(lineColorHost, { suppressLabel: true, clearButton: false, value: settings.lineColor || '',
    placeholder: $HR('Colour of the text') }).render();
  const lineColorLine = block('Colour of the line', lineColorHost);
  const orientationLine = line('Orientation', orientation);
  // colours of the items (plan 27n §7)
  const colors = select(ITEM_COLOR_LABELS, ITEM_COLORS.includes(settings.colors) ? settings.colors : '');
  const colorsLine = line('Colours', colors);
  const showPresentation = () => {
    const behind = presentation.value === 'expand';
    labelLine.hidden = !behind;
    iconLine.hidden = !behind;
    buttonTextLine.hidden = !behind;
    openLine.hidden = !behind;
    lineWidthLine.hidden = style.value !== 'underline';
    lineColorLine.hidden = style.value !== 'underline';
  };
  presentation.addEventListener('change', showPresentation);
  style.addEventListener('change', showPresentation);
  if (!single) {
    // the settings of the menu above the list of items, aligned (review 2026-11-16)
    const settingsBox = element('div', 'h-cms-action-settings');
    // advanced settings (review 27n §21): Show as (new: Items in a row) and Colours (of the website)
    settingsBox.append(classed(classed(line('Show as', presentation), 'h-cms-action-presentation'), ADVANCED), labelLine, iconLine,
      buttonTextLine, openLine, styleLine, lineWidthLine, lineColorLine, orientationLine, classed(colorsLine, ADVANCED));
    // the sections of plan 27n §6: Presentation, then the actions
    form.append(sectionTitle($HR('Presentation')), settingsBox);
    if (presentationExtra) form.append(presentationExtra);
    // Actions: expand / collapse all items (review §19.23h); collapsed: drag handle, caption and Remove only
    const actionsTitle = sectionTitle($HR('Actions'));
    const toggleAll = button('fa-angles-up', '');
    toggleAll.classList.add('h-cms-action-toggle');
    const markToggle = () => {
      const collapsed = list.classList.contains('is-collapsed');
      toggleAll.title = $HR(collapsed ? 'Expand all actions' : 'Collapse all actions');
      toggleAll.setAttribute('aria-label', toggleAll.title);
      toggleAll.querySelector('i').className = `fa-solid ${collapsed ? 'fa-angles-down' : 'fa-angles-up'}`;
    };
    toggleAll.addEventListener('click', () => {
      const collapsed = !list.classList.contains('is-collapsed');
      if (collapsed) for (const entry of rows) entry.summary?.();
      list.classList.toggle('is-collapsed', collapsed);
      markToggle();
    });
    actionsTitle.append(toggleAll);
    form.append(actionsTitle);
    markToggle();
  }
  showPresentation();

  // Show / hide not in a single link (text links, plan 27n §12.4)
  const actions = ACTIONS.filter(([value]) => (single?.actions ? single.actions.includes(value)
    : (value !== 'addRecord' || canAddRecord) && !(single && value === 'toggle')));
  const rows = [];
  // the caption of an item with its translations (plan 27n §6.2, as the other captions): a website with several languages
  const multilang = !single && languages.length > 1;
  const addRow = (item = {}) => {
    const row = element('div', 'h-cms-action-row');
    const text = element('input', 'h-input h-compact');
    text.type = 'text';
    text.value = item.label || '';
    text.placeholder = $HR('Label');
    const caption = multilang ? createTranslationForm({
      value: item.label || '',
      translations: item.labels || {},
      languages,
      original: languages[0] || '',
      translator,
      onChange: () => formChanged(form)
    }) : null;
    // with the translations the input only takes the default label (pageLabel)
    if (caption) text.value = '';
    const icon = element('input', 'h-input h-compact h-cms-action-icon');
    icon.type = 'text';
    icon.value = item.icon || '';
    icon.placeholder = 'fa-star';
    icon.title = $HR('Font Awesome icon classes (optional; fa-solid when no style is given)');
    const glyph = element('i', faIcon(item.icon));
    glyph.setAttribute('aria-hidden', 'true');
    icon.addEventListener('input', () => { glyph.className = faIcon(icon.value); });
    const action = element('select', 'h-select h-compact');
    action.append(...actions.map(([value, caption, disabled]) => {
      const node = option(value, $HR(caption));
      node.disabled = Boolean(disabled);
      return node;
    }));
    action.value = actions.some(([value]) => value === item.action) ? item.action : actions[0][0];
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
    const record = recordInput(services, item.action === 'recordPage' ? Number(item.record) || 0 : 0);
    // one link: the page and the record together; a mini form: the page on the line of Action, the record on a line of
    // its own (review 27n §20.4)
    const recordTarget = element('span', 'h-cms-action-record');
    const recordLine = element('div', 'h-cms-action-line h-cms-action-record-line');
    if (single) recordTarget.append(recordPage.element, record.element);
    else recordLine.append(fieldLabel('Record'), record.element);
    // Saved filter (plan 27j): the query source, the target page and the values in a popup
    const filter = savedFilterPicker(services, item.action === 'savedFilter' ? storedSavedFilter(item) : null, { recordFields });
    // a search box (plan 27k §6): a Saved filter whose parameter takes the typed text; the label is its placeholder
    const searchFilter = savedFilterPicker(services, item.action === 'search' ? storedSavedFilter(item) : null,
      { recordFields, search: true });
    // Show / hide (plan 27n §10): the named elements of the page, header and footer; the node id is stored
    const toggleTarget = element('select', 'h-select h-compact');
    toggleTarget.append(option('', elements.length ? $HR('(choose an element)') : $HR('(no named elements: give an element a name)')),
      ...elements.map((entry) => option(entry.id, `${entry.name} · ${entry.type}`)));
    if (item.action === 'toggle' && item.target && !elements.some((entry) => entry.id === item.target)) {
      toggleTarget.append(option(String(item.target), `${$HR('missing element')} (${item.target})`));
    }
    if (item.action === 'toggle') toggleTarget.value = String(item.target || '');
    if (item.action === 'url') url.value = item.target || '';
    else if (item.action === 'addRecord') type.value = String(item.target || '');
    else if (!['recordPage', 'savedFilter', 'search', 'toggle'].includes(item.action) && item.target) page.value = String(item.target);
    const showTarget = () => {
      target.replaceChildren(...({ page: [page], url: [url], addRecord: [type],
        recordPage: [single ? recordTarget : recordPage.element], back: [],
        savedFilter: [filter.element], search: [searchFilter.element], toggle: [toggleTarget] }[action.value] || [page]));
      recordLine.hidden = action.value !== 'recordPage';
    };
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
      caption?.destroy?.();
      formChanged(form);
    });
    if (single) {
      // one link (the text editor, 2026-11-14): a control per line
      row.classList.add('h-cms-action-single-row');
      const iconBox = element('span', 'h-cms-action-icon-box');
      iconBox.append(glyph, icon);
      row.append(line('Label', text), line('Icon', iconBox), line('Action', action), block('Link to', target), newTab.box);
    }
    else {
      // a mini form (plan 27n §6.2, review §19.23): drag handle, the caption (with its translations) and Remove; Icon with
      // Icon only; Action with New tab and the settings of the action (on the same line when the form is wide enough);
      // the record of a Record page on the next line (review §20.4). Collapsed: the caption as text.
      row.classList.add('h-cms-action-item');
      const summary = element('span', 'h-cms-action-summary');
      const head = element('div', 'h-cms-action-line h-cms-action-caption');
      head.append(dragHandle(), caption ? caption.element : text, summary, remove);
      const look = element('div', 'h-cms-action-line h-cms-action-look');
      const iconBox = element('span', 'h-cms-action-icon-box');
      iconBox.append(glyph, icon);
      look.append(fieldLabel('Icon'), classed(iconBox, 'h-cms-action-icon-line'), iconOnly.box);
      const what = element('div', 'h-cms-action-line h-cms-action-what');
      what.append(fieldLabel('Action'), action, classed(newTab.box, ADVANCED), target);
      // the icon and New tab (off) are advanced settings (review 27n §21)
      look.classList.add(ADVANCED);
      row.append(head, look, what, recordLine);
      row.summary = () => {
        const shown = (caption ? caption.values?.().value : text.value) || '';
        summary.textContent = shown.trim() || $HR(DEFAULT_LABELS[action.value] || 'Link');
      };
    }
    list.append(row);
    rows.push({
      row,
      summary: () => row.summary?.(),
      destroy: () => {
        record.destroy();
        caption?.destroy?.();
      },
      read: () => {
        pageLabel();
        // the caption with its translations (a website with several languages)
        const captions = caption?.read?.() || null;
        // a forgotten label: a default one (2026-11-14; Go to a page: the name of the page), the item is kept
        const label = (captions ? captions.value.trim() : '') || text.value.trim();
        const value = { label: label || $HR(DEFAULT_LABELS[action.value] || 'Link'), action: action.value };
        if (icon.value.trim()) value.icon = icon.value.trim();
        if (action.value === 'page') value.target = Number(page.value) || 0;
        else if (action.value === 'url') value.target = url.value.trim();
        else if (action.value === 'recordPage') {
          value.target = Number(recordPage.select.value) || 0;
          value.record = record.value();
        } else if (action.value === 'addRecord') value.target = Number(type.value) || type.value;
        else if (action.value === 'toggle') value.target = toggleTarget.value;
        else if (action.value === 'savedFilter' && filter.value()) {
          const chosen = filter.value();
          Object.assign(value, { target: chosen.page, ...cmsFilterKeys(chosen), values: chosen.values });
        } else if (action.value === 'search' && searchFilter.value()) {
          const chosen = searchFilter.value();
          Object.assign(value, { target: chosen.page, ...cmsFilterKeys(chosen), values: chosen.values, param: chosen.param });
        }
        if (newTab.input.checked) value.newTab = true;
        if (iconOnly.input.checked && value.icon) value.iconOnly = true;
        if (captions) {
          const labels = Object.fromEntries(Object.entries(captions.translations || {}).map(([code, label]) => [code, String(label || '').trim()])
            .filter(([, label]) => label));
          if (Object.keys(labels).length) value.labels = labels;
        } else if (item.labels) value.labels = item.labels;
        return value;
      }
    });
  };
  const given = single ? (settings.items || []).slice(0, 1) : settings.items || [];
  for (const item of given) addRow(item);
  if (single && !rows.length) addRow({});
  if (!single) {
    sortableList(list, (from, to) => {
      rows.splice(to, 0, ...rows.splice(from, 1));
      list.replaceChildren(...rows.map((entry) => entry.row));
      formChanged(form);
    });
  }
  const add = button('fa-plus', 'Add item', true, 'h-btn h-btn-primary h-cms-add-button');
  add.addEventListener('click', () => {
    addRow({});
    formChanged(form);
  });
  form.append(list);
  if (!single) form.append(add);
  const problems = element('div', 'h-cms-style-problems');
  form.append(problems);
  const read = () => {
    const items = rows.map((entry) => entry.read());
    const missing = items.find((item) => (item.action === 'url' && !item.target) || (item.action === 'page' && !item.target));
    if (missing) {
      problems.textContent = $HR('Every item needs a page or a URL');
      return null;
    }
    if (items.some((item) => item.action === 'toggle' && !item.target)) {
      problems.textContent = $HR('A Show / hide item needs a named element');
      return null;
    }
    if (items.some((item) => item.action === 'recordPage' && (!item.target || !item.record))) {
      problems.textContent = $HR('A Record page item needs a record page and a record');
      return null;
    }
    if (items.some((item) => item.action === 'savedFilter' && (!item.target || !cmsFilterTarget(item)))) {
      problems.textContent = $HR('A Saved filter item needs a query source or saved filter and a target page');
      return null;
    }
    if (items.some((item) => item.action === 'search' && (!item.target || !cmsFilterTarget(item) || !item.param))) {
      problems.textContent = $HR('A search box needs a query source or saved filter with a parameter and a target page');
      return null;
    }
    if (single) return items[0] || null;
    const result = { presentation: presentation.value, items };
    if (presentation.value === 'expand') {
      if (label.value.trim()) result.label = label.value.trim();
      if (icon.value.trim()) result.icon = icon.value.trim();
      if (buttonText.input.checked) result.buttonText = true;
      if (open.value === 'click') result.open = 'click';
    }
    // defaults are not written
    if (style.value !== 'plain') result.style = style.value;
    Object.assign(result, menuLineSettings({ style: style.value, lineWidth: lineWidth.value, lineColor: lineColor.getValue() ?? '' }));
    if (orientation.value === 'vertical') result.orientation = 'vertical';
    if (ITEM_COLORS.includes(colors.value)) result.colors = colors.value;
    if (settings.labels) result.labels = settings.labels;
    return result;
  };
  const cleanup = () => {
    rows.forEach((entry) => entry.destroy());
    lineColor.destroy?.();
  };
  // in the element panel (plan 27n §6): applied after each change
  if (inline && !single) return showDomForm(form, $HR('Action menu'), read, { inline, cleanup });
  const dialog = formDialog(form, single?.title || 'Action menu', 'OK', read, null, single ? 'h-dialog-cms-link' : 'h-dialog-cms-actions');
  return Promise.resolve(dialog).finally(cleanup);
}

/**
 * The record of a Record page item (2026-11-14): HInputResource `addorbrowse` (title, record type icon, the record manager
 * popup with its Add buttons) with the
 * host's `apiClient`, `dbdefs` and `browseRecords`; else a button with the record id.
 *
 * @param {object} services
 * @param {number} value Record id.
 * @returns {{element: HTMLElement, value: () => number, destroy: () => void}}
 */
function recordInput(services, value) {
  const host = element('span', 'h-cms-action-record-input');
  if (services.apiClient && services.dbdefs && typeof services.browseRecords === 'function') {
    const input = createHInput('resource', host, {
      suppressLabel: true,
      value: value || null,
      apiClient: services.apiClient,
      dbdefs: services.dbdefs,
      iconBase: services.iconBase || {},
      // the record manager popup with its Add buttons (2026-11-14)
      pointerMode: 'addorbrowse',
      // without it HInputResource falls back to the value picker (2026-11-14)
      showBrowse: true,
      targetTypes: [],
      browseRecords: (options) => services.browseRecords({ ...options, title: $HR('Record of the record page') }),
      ...(typeof services.addRecord === 'function' ? { addRecord: services.addRecord } : {})
    });
    return { element: host, value: () => Number(input.getValue()) || 0, destroy: () => void input.destroy?.() };
  }
  let recordId = value;
  const choose = button('fa-magnifying-glass', 'Choose the record');
  const caption = element('span');
  choose.append(caption);
  const label = () => { caption.textContent = ` ${recordId ? `#${recordId}` : $HR('Choose the record')}`; };
  label();
  choose.disabled = typeof services.browseRecords !== 'function';
  choose.addEventListener('click', async () => {
    const ids = await services.browseRecords({ selectMode: 'select', title: $HR('Record of the record page') });
    if (Number(ids?.[0]) > 0) {
      recordId = Number(ids[0]);
      label();
    }
  });
  host.append(choose);
  return { element: host, value: () => recordId, destroy: () => {} };
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

/** A caption and several controls (not a label: a click must not go to the first control). */
function block(label, control) {
  const node = element('div', 'h-cms-styles-field');
  const caption = element('span');
  caption.textContent = $HR(label);
  node.append(caption, control);
  return node;
}

/** The label of a line of an action item (Icon, Action), as wide on each line (review 27n §19.23b-c). */
function fieldLabel(text) {
  const label = element('span', 'h-cms-action-label');
  label.textContent = $HR(text);
  return label;
}

/** Class of the controls shown only with Show advanced settings (review 27n §21; designer.css). */
const ADVANCED = 'h-cms-advanced-only';

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

/** A select of [value, label] pairs with the given value. */
function select(options, value) {
  const node = element('select', 'h-select h-compact');
  node.append(...options.map(([key, label]) => option(key, $HR(label))));
  node.value = options.some(([key]) => key === value) ? value : options[0][0];
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
