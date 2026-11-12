/**
 * @file designerStyles.js
 * @brief The Styles popup of the CMS designer (plan 27c §6a, §21, §22): tabs Base settings (themes, colours, fonts),
 *        Layout styles (kind defaults), Presets and Custom CSS (DT_CMS_CSS), each with a help line and its settings,
 *        the preview of the selected tab beside them; and the inline style editor (property rows by screen) used
 *        here and in the style popup.
 *
 * The previews are sandboxed iframes: the CSS the website gets (compileCmsStyles: base variables on html.h-site,
 * kind defaults, presets), the Heurist defaults of the variables, a small copy of the site stylesheet and the
 * custom CSS, around sample content with the real `data-h-*` attributes. Nothing of it reaches the designer page.
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
import {
  BASE_SETTINGS, CMS_KINDS, CMS_LAYOUT, CMS_LAYOUT_CACHE, CMS_LAYOUT_SIZE, CMS_STYLE_PROPERTIES, compileCmsStyles, SCREENS
} from '#shared/site/cmsDocument.js';
import { HInputColor } from '#shared/widgets/form/inputs/HInputColor.js';
import { fileOfRecord, HInputFile } from '#shared/widgets/form/inputs/HInputFile.js';
import { fileMediaUrls } from '#shared/recordview/fileMediaItem.js';
import { createTabSet } from '#shared/widgets/layout/tabs.js';

/** Labels and hints of the base settings. */
export const BASE_LABELS = Object.freeze({
  'font-family': ['Font family', 'e.g. Georgia, serif'],
  'color-text': ['Text colour'],
  'color-bg': ['Background colour'],
  'color-surface': ['Surface colour (bars, panels)'],
  'color-primary': ['Primary colour (buttons, active tab)'],
  'color-link': ['Link colour'],
  'color-border': ['Border colour'],
  radius: ['Corner radius', 'e.g. 4px'],
  'site-font-size': ['Font size', 'e.g. 15px'],
  'site-heading-font': ['Heading font', 'e.g. Arial, sans-serif'],
  'site-heading-color': ['Heading colour'],
  'site-width': ['Page width (max)', 'e.g. 1200px; empty = full width'],
  'color-selected': ['Selected background colour'],
  'color-selected-border': ['Selected border colour'],
  'color-primary-text': ['Text on primary colour (buttons)'],
  'color-text-muted': ['Muted text colour'],
  'site-logo-height': ['Logo height', 'e.g. 64px; smaller on medium and narrow screens']
});

/** Colour themes of the base settings (in the manner of the jQuery UI ThemeRoller / Bootstrap themes). */
export const CMS_THEMES = Object.freeze([
  { name: 'light', label: 'Default light', values: { 'color-text': '#333333', 'color-bg': '#ffffff', 'color-surface': '#f5f5f5', 'color-primary': '#2a6ebb', 'color-link': '#2a6ebb', 'color-border': '#dddddd', 'site-heading-color': '#222222' , 'color-selected': '#dcecff', 'color-selected-border': '#3983b7', 'color-primary-text': '#ffffff', 'color-text-muted': '#777777' } },
  { name: 'dark', label: 'Default dark', values: { 'color-text': '#e6e6e6', 'color-bg': '#1e1e1e', 'color-surface': '#2b2b2b', 'color-primary': '#4f9be8', 'color-link': '#7db8f0', 'color-border': '#444444', 'site-heading-color': '#ffffff' , 'color-selected': '#2f4a66', 'color-selected-border': '#4f9be8', 'color-primary-text': '#ffffff', 'color-text-muted': '#9a9a9a' } },
  { name: 'sepia', label: 'Sepia', values: { 'color-text': '#5b4636', 'color-bg': '#f4ecd8', 'color-surface': '#e9dcc0', 'color-primary': '#8b5a2b', 'color-link': '#8b4513', 'color-border': '#d3c4a5', 'site-heading-color': '#4a3426' , 'color-selected': '#ead9b5', 'color-selected-border': '#8b5a2b', 'color-primary-text': '#ffffff', 'color-text-muted': '#8a7560' } },
  { name: 'green', label: 'Greenish', values: { 'color-text': '#2f3e33', 'color-bg': '#f4f8f4', 'color-surface': '#e3efe5', 'color-primary': '#2e7d32', 'color-link': '#2e7d32', 'color-border': '#c5dcc8', 'site-heading-color': '#1b5e20' , 'color-selected': '#d4ead6', 'color-selected-border': '#2e7d32', 'color-primary-text': '#ffffff', 'color-text-muted': '#64766a' } },
  { name: 'blue', label: 'Blueish', values: { 'color-text': '#253645', 'color-bg': '#f3f7fb', 'color-surface': '#e1ebf5', 'color-primary': '#1565c0', 'color-link': '#1565c0', 'color-border': '#c3d4e6', 'site-heading-color': '#0d47a1' , 'color-selected': '#d3e3f5', 'color-selected-border': '#1565c0', 'color-primary-text': '#ffffff', 'color-text-muted': '#5f7387' } },
  { name: 'monitor', label: 'Monitor (green on black)', values: { 'color-text': '#33ff33', 'color-bg': '#000000', 'color-surface': '#0a1a0a', 'color-primary': '#00aa00', 'color-link': '#66ff66', 'color-border': '#1f5f1f', 'site-heading-color': '#66ff66', 'font-family': '"Courier New", monospace', 'site-heading-font': '"Courier New", monospace' , 'color-selected': '#0f3a0f', 'color-selected-border': '#33ff33', 'color-primary-text': '#000000', 'color-text-muted': '#1faa1f' } },
  { name: 'red', label: 'Red and white', values: { 'color-text': '#000000', 'color-bg': '#ffffff', 'color-surface': '#b0b0b0', 'color-primary': '#c62828', 'color-link': '#c62828', 'color-border': '#8a8a8a', 'site-heading-color': '#b71c1c' , 'color-selected': '#f6d5d5', 'color-selected-border': '#c62828', 'color-primary-text': '#ffffff', 'color-text-muted': '#666666' } }
]);

const KIND_LABELS = Object.freeze({
  group: 'Groups', tabs: 'Tabs', accordion: 'Accordions', text: 'Texts', media: 'Media', instance: 'Modules and widgets'
});

/** The image of the media sample (bundled by Vite; a file URL in the tests). */
const MEDIA_SAMPLE_IMAGE = new URL('./assets/media-sample.png', import.meta.url).href;

const HELP = Object.freeze({
  base: 'Colours, fonts and sizes of the whole website. Choose a theme to fill the colours, then change single values.'
    + ' Empty values use the Heurist defaults.',
  kinds: 'The default style of every element of a kind on the website (all groups, tabs, accordions, texts, media or modules).'
    + ' The preset and the own style of an element are added to it.',
  presets: 'Named styles defined once and applied to elements (Preset in the properties of an element), for example a'
    + ' card or a highlighted box. The kind default applies first, then the preset, then the own style of the element.',
  css: 'Your own CSS rules for the whole website, for what the settings can not do. Select elements with'
    + ' [data-h-style="name"] (presets), [data-h-control="group"], [data-h-text] or [data-h-instance].',
  layout: 'How the pages of the website are opened, and where the header and the footer are. Every page is written'
    + ' in the same way, so you can change these settings at any time.'
});

/** Navigation modes (plan 27f §2): value, label; NAVIGATION_NOTES explain them. */
const NAVIGATION_LABELS = Object.freeze([
  ['reload', 'Load each page completely'], ['swap', 'Keep header and footer, change the page content'],
  ['scroll', 'One long page (pages one after another)']
]);

const NAVIGATION_NOTES = Object.freeze({
  reload: 'Every link opens the whole page again. The simplest way; works everywhere.',
  swap: 'The header and footer stay; only the content of the page changes, without reloading. Pages opened before are kept and show at once.',
  scroll: 'All pages of the menu are shown one after another on one page and are loaded while scrolling; the menu jumps to a page.'
    + ' Only the first page is in the HTML that search engines read for the home address; every page address still works.'
});

const HEADER_POSITIONS = Object.freeze([
  ['fixed', 'Fixed'], ['scroll', 'Scrolls away'], ['slide', 'Slide out (expand / collapse button)'], ['none', 'No header']
]);

/** Header and footer themes (plan 27f §13): colour pairs of the theme of the website, or own colours. */
const PART_THEMES = Object.freeze([
  ['default', 'Default (background and text)'], ['surface', 'Surface'], ['primary', 'Primary'], ['selected', 'Selected'],
  ['own', 'Own colours']
]);

const HEADER_ORIENTATIONS = Object.freeze([['horizontal', 'Horizontal (top)'], ['vertical', 'Vertical (left column)']]);

const FOOTER_POSITIONS = Object.freeze([['default', 'Default'], ['fixed', 'Fixed at the bottom'], ['none', 'No footer']]);

/**
 * Set a layout value (`navigation`, `cache`, `header.position` ...); the default value (first of CMS_LAYOUT) or null
 * removes it, an empty header / footer object goes too.
 *
 * @param {object} layout Changed in place.
 * @param {string} path
 * @param {*} value
 */
export function setLayout(layout, path, value) {
  const [first, second] = path.split('.');
  if (second) {
    const part = { ...(layout[first] || {}) };
    if (value == null || value === CMS_LAYOUT[first]?.[second]?.[0]) delete part[second]; else part[second] = value;
    if (Object.keys(part).length) layout[first] = part; else delete layout[first];
    return;
  }
  const isDefault = first === 'navigation' ? value === CMS_LAYOUT.navigation[0] : first === 'cache' && value === CMS_LAYOUT_CACHE.default;
  if (value == null || isDefault) delete layout[first]; else layout[first] = value;
}

/** A small drawing of the layout: header (top or left), content, footer (preview of the Navigation and layout tab). */
function layoutDiagram(layout = {}) {
  const header = layout.header || {};
  const position = header.position || CMS_LAYOUT.header.position[0];
  const vertical = header.orientation === 'vertical';
  const footer = layout.footer?.position || 'default';
  const note = {
    scroll: 'The header scrolls away with the page (a vertical header: on narrow screens).', fixed: 'The header stays at the top.',
    slide: 'The header stays at the top; a button collapses it to the logo and the title (vertical: a narrow column with the'
      + ' logo) and expands it again. The choice of the visitor is kept.',
    none: 'No header.'
  }[position];
  const box = (label, extra = '') => `<div style="border:1px dashed #999;border-radius:4px;padding:8px;background:#f0f4f8;${extra}">${label}</div>`;
  const button = position === 'slide' ? ' <span style="float:right">&#8963;</span>' : '';
  const rows = header.rows === 'two' && !vertical ? '<br>' : ', ';
  const headerBox = position === 'none' ? '' : box(`${escapeHtml($HR('Logo, title'))}${rows}${escapeHtml($HR('menu, languages'))}${button}`,
    vertical ? 'width:30%;min-height:220px' : (['fixed', 'slide'].includes(position) ? 'position:sticky;top:0' : ''));
  const footerBox = footer === 'none' ? '' : box(escapeHtml($HR(footer === 'fixed' ? 'Footer (fixed at the bottom)' : 'Footer')), 'margin-top:8px');
  const content = `<div style="flex:1">${box(escapeHtml($HR('Page content')), 'min-height:160px;background:#fff')}${footerBox}</div>`;
  return `<!doctype html><html><body style="font:12px sans-serif;margin:12px;color:#333">`
    + `<div style="display:flex;flex-direction:${vertical ? 'row' : 'column'};gap:8px">${headerBox}${content}</div>`
    + `<p>${$HR(note)}</p></body></html>`;
}

/** Named colours of the style editor (colour inputs): the base colours. */
const PALETTE = Object.freeze([
  ...BASE_SETTINGS.filter((key) => isColor(key)).map((key) => [key, BASE_LABELS[key]?.[0] || key])
]);

/** Variables without a Heurist default on this page: the variable (or colour) they fall back to. */
const PALETTE_FALLBACK = Object.freeze({ 'site-heading-color': 'color-text' });

/** Heurist variables of the site stylesheet (their defaults are read from this page for the previews). */
const VARIABLES = ['--h-font-family', '--h-color-text', '--h-color-text-muted', '--h-color-bg', '--h-color-surface',
  '--h-color-primary', '--h-color-primary-text', '--h-color-link', '--h-color-border', '--h-color-selected',
  '--h-color-selected-border', '--h-radius'];

/** A small copy of the site stylesheet (apps/website/src/style.css) for the previews. */
const PREVIEW_CSS = `
html.h-site{--h-site-font-size:15px;--h-site-heading-font:var(--h-font-family);--h-site-heading-color:var(--h-color-text)}
body{margin:0;padding:12px;font-family:var(--h-font-family,sans-serif);font-size:var(--h-site-font-size);line-height:1.5;
color:var(--h-color-text);background:var(--h-color-bg)}
:is(h1,h2,h3,h4,h5,h6){margin:.3em 0;font-family:var(--h-site-heading-font);color:var(--h-site-heading-color)}
p{margin:.3em 0}
a{color:var(--h-color-link)}
section[data-h-control="group"][aria-labelledby]>h3:first-child{grid-column:1/-1}
figure[data-h-media]{margin:0}figure[data-h-media] :is(img,video,audio,iframe){display:block;max-width:100%;border:0}
figure[data-h-media] figcaption{margin-top:4px;font-size:.9em}
.pv-header{display:flex;align-items:center;gap:12px;padding:6px 12px;background:var(--h-color-surface);
border-bottom:1px solid var(--h-color-border);font-weight:600}
.pv-header span{font-weight:normal;color:var(--h-color-link)}
.pv-box{margin-top:10px;padding:10px;border:1px solid var(--h-color-border);border-radius:var(--h-radius,4px)}
.pv-large{font-size:1.25em}.pv-small{font-size:.875em}.pv-tiny{font-size:.75em}
.pv-muted{color:var(--h-color-text-muted,color-mix(in srgb,var(--h-color-text) 60%,var(--h-color-bg)))}
.pv-buttons{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.pv-list{margin-top:8px;border:1px solid var(--h-color-border)}.pv-list>div{padding:2px 8px;border:1px solid transparent}
.pv-list>.pv-selected{background:var(--h-color-selected,#dcecff);border-color:var(--h-color-selected-border,#3983b7)}
button,input,select{padding:4px 12px;border:1px solid var(--h-color-border);border-radius:var(--h-radius,4px);font:inherit;
background:var(--h-color-surface);color:var(--h-color-text)}
input,select{padding:4px 8px;background:var(--h-color-bg)}
button.pv-primary{border-color:var(--h-color-primary);background:var(--h-color-primary);color:var(--h-color-primary-text,#fff)}
button.pv-icon{padding:4px 9px}
.h-site-tab-strip{display:flex;gap:2px;border-bottom:1px solid var(--h-color-border)}
.h-site-tab{padding:4px 12px;border:1px solid transparent;border-bottom:0;border-radius:var(--h-radius,4px) var(--h-radius,4px) 0 0}
.h-site-tab.is-active{border-color:var(--h-color-border);color:var(--h-color-primary)}
details{margin:4px 0;border:1px solid var(--h-color-border);border-radius:var(--h-radius,4px);overflow:hidden}
details>summary{padding:4px 8px;background:var(--h-color-surface);cursor:pointer}
details>:not(summary){padding:4px 8px}
.pv-module{display:flex;align-items:center;justify-content:center;height:100%;min-height:60px;
border:1px dashed var(--h-color-border);color:var(--h-color-primary)}
`;

const SAMPLE_PAGE = '<div class="pv-header">Website title <span>Home</span><span>About</span><span>Contact</span></div>'
  + '<div class="pv-box"><h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3><h4>Heading 4</h4>'
  + '<p class="pv-large">Large font text</p><p>Regular font text with <a href="#">a link</a>.</p>'
  + '<p class="pv-small">Small font text</p><p class="pv-tiny">Tiny font text</p><p class="pv-muted">Muted text</p>'
  + '<div class="pv-buttons"><button class="pv-primary" type="button">Primary button</button>'
  + '<button type="button">Standard button</button><button class="pv-icon" type="button" title="Icon button">&#9881;</button></div>'
  + '<div class="pv-buttons"><input type="text" value="Input" aria-label="Input">'
  + '<select aria-label="Selector"><option>Selector</option><option>Second option</option></select></div>'
  + '<div class="pv-list"><div>List item</div><div class="pv-selected">Selected item</div><div>List item</div></div></div>';

const TEXT = '<div data-h-text=""><p>Text of an element in this style. Lorem ipsum dolor sit amet, consectetur adipiscing.</p></div>';

/** Sample content of each kind (real data-h-* attributes, so the compiled kind styles apply). */
const KIND_SAMPLES = Object.freeze({
  group: `<section data-h-control="group" aria-labelledby="pv-caption"><h3 id="pv-caption" data-h-text="">Caption of the group</h3>${TEXT}${TEXT}</section>`,
  tabs: '<div data-h-control="tabs"><div class="h-site-tab-strip"><span class="h-site-tab is-active">Tab 1</span>'
    + `<span class="h-site-tab">Tab 2</span></div><section data-h-control="group">${TEXT}</section></div>`,
  accordion: `<div data-h-control="accordion"><details open data-h-control="group"><summary>Section 1</summary>${TEXT}</details>`
    + '<details data-h-control="group"><summary>Section 2</summary></details></div>',
  text: '<div data-h-text=""><h2>Heading of a text</h2><p>A paragraph of the text with <a href="#">a link</a>.'
    + ' Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p></div>',
  // as cmsMedia.js makes it (§33)
  media: `<figure data-h-media="pv" data-h-text=""><img src="${MEDIA_SAMPLE_IMAGE}" alt="Heurist" loading="lazy" />`
    + '<figcaption>Caption of the media <a href="#">Open in OSD viewer</a></figcaption></figure>',
  instance: '<div data-h-instance="pv"><div class="pv-module">Module or widget</div></div>'
});

/**
 * The content of the Styles popup.
 *
 * @param {{base?: object, kinds?: object, presets?: object, css?: string, javaScriptAllowed?: boolean,
 *        createCodeEditor?: Function, files?: object, websiteFields?: Function, tab?: string}} values createCodeEditor(host,
 *        {value, language, onChange}): a code editor (CodeMirror, lazy); without it a plain text area. `files`: the
 *        background image picker (styleRows). `websiteFields(host)`: the fields of the website record in the Header block
 *        (websiteFields.js; a website only). `tab`: `layout` opens the tab Navigation and layout.
 * @returns {{element: HTMLElement, read: () => object|null, ready: Promise<void>, destroy: () => void, tabs: object}}
 *          read: null while a website field is not valid; `fields` the changed fields of the website record.
 */
export function createStylesForm({ base = {}, kinds = {}, presets = {}, layout = {}, css = '', javaScriptAllowed = false, createCodeEditor = null,
  files = null, websiteFields = null, tab = '' } = {}) {
  const state = { base: { ...base }, kinds: structuredClone(kinds), presets: structuredClone(presets), layout: structuredClone(layout || {}),
    css: String(css ?? '') };
  // two columns: the tabs, and the preview of the selected tab (half as wide)
  const root = element('div', 'h-cms-styles-layout');
  const previews = [];
  const tabs = createTabSet({ prefix: 'h-cms-styles', onSelect: (index) => previews[index]?.() });
  const previewColumn = element('div', 'h-cms-styles-preview-column');
  const previewCaption = element('div', 'h-cms-caption');
  previewCaption.textContent = $HR('Preview');
  const frame = element('iframe', 'h-cms-styles-preview');
  // no scripts; the same origin, so registered images that need the login are shown too
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.title = $HR('Preview');
  // the preview page: at least 424 px, 641 px with columns (show); a scroll bar in a narrow column
  const frameBox = element('div', 'h-cms-styles-preview-box');
  frameBox.append(frame);
  previewColumn.append(previewCaption, frameBox);
  root.append(tabs.element, previewColumn);
  // columns (a grid / flex preset or group kind) need a page wider than the narrow screen (640 px); else a narrow one
  const show = (html, columns = false) => {
    frame.classList.toggle('h-cms-styles-preview-columns', columns);
    frame.srcdoc = html;
  };
  // background images are allowed from the Heurist base URL only (compileCmsStyles)
  const preview = (body) => previewDocument(javaScriptAllowed ? state : { ...state, css: '' }, body, files?.baseUrl || '');
  const refresh = () => previews[tabs.selected]?.();

  // ------------------------------------------------------------ base settings
  const basePane = pane(tabs, 'Base settings', HELP.base);
  // Theme and Kind (Layout styles): a selector of normal height close to its caption, a line below (2026-11-12)
  const theme = element('select', 'h-select');
  theme.append(option('', $HR('(choose a theme)')), ...CMS_THEMES.map((item) => option(item.name, $HR(item.label))));
  basePane.config.append(field('Theme', theme, 'h-cms-styles-field h-cms-styles-head'));
  const controls = {};
  for (const key of BASE_SETTINGS) {
    const [label, hint] = BASE_LABELS[key] || [key];
    const host = element('div', 'h-cms-styles-value');
    basePane.config.append(field(label, host));
    if (isColor(key)) {
      const color = new HInputColor().attach(host, { suppressLabel: true, clearButton: false, value: state.base[key] ?? '', placeholder: $HR('Heurist default') }).render();
      const changed = () => {
        setBase(state, key, color.getValue());
        refresh();
      };
      host.addEventListener('h-input-change', changed);
      host.addEventListener('input', changed);
      controls[key] = { set: (value) => color.setValue(value) };
    } else {
      const text = element('input', 'h-input h-compact');
      text.type = 'text';
      text.value = state.base[key] ?? '';
      text.placeholder = $HR(hint || 'Heurist default');
      text.addEventListener('input', () => {
        setBase(state, key, text.value);
        refresh();
      });
      host.append(text);
      controls[key] = { set: (value) => { text.value = value; } };
    }
  }
  theme.addEventListener('change', () => {
    const chosen = CMS_THEMES.find((item) => item.name === theme.value);
    if (!chosen) return;
    for (const [key, value] of Object.entries(chosen.values)) {
      setBase(state, key, value);
      controls[key]?.set(value);
    }
    refresh();
  });
  previews.push(() => show(preview(SAMPLE_PAGE)));

  // ------------------------------------------------------------ layout styles (kind defaults)
  const kindPane = pane(tabs, 'Layout styles', HELP.kinds);
  kindPane.panel.classList.add('h-cms-styles-kinds');
  const kind = element('select', 'h-select');
  kind.append(...Object.keys(CMS_KINDS).map((name) => option(name, $HR(KIND_LABELS[name] || name))));
  kindPane.config.append(field('Kind', kind, 'h-cms-styles-field h-cms-styles-head'));
  const kindEditor = element('div', 'h-cms-styles-editor');
  kindPane.config.append(kindEditor);
  const drawKind = () => {
    kindEditor.replaceChildren();
    const name = kind.value;
    styleRows(kindEditor, state.kinds[name] || {}, (value) => {
      if (Object.keys(value).length) state.kinds[name] = value; else delete state.kinds[name];
      refresh();
    }, { kind: name, files, base: () => state.base, advanced: true });
  };
  kind.addEventListener('change', () => {
    drawKind();
    refresh();
  });
  previews.push(() => show(preview(shadowBackdrop(state.kinds[kind.value], KIND_SAMPLES[kind.value] || '')),
    kind.value === 'group' && sampleColumns(state.kinds.group) > 1));
  drawKind();

  // ------------------------------------------------------------ presets
  const presetPane = pane(tabs, 'Presets', HELP.presets);
  // the list (Add preset above it) and the form of the selected preset, each with its own scroll bar
  presetPane.config.classList.add('h-cms-styles-presets');
  const presetSide = element('div', 'h-cms-styles-preset-side');
  const addPreset = button('Add preset', 'fa-plus');
  const presetList = element('div', 'h-cms-styles-preset-list');
  presetList.setAttribute('role', 'listbox');
  presetSide.append(addPreset, presetList);
  const presetEditor = element('div', 'h-cms-styles-editor h-cms-styles-preset-form');
  presetPane.config.append(presetSide, presetEditor);
  let currentPreset = Object.keys(state.presets)[0] || null;
  addPreset.addEventListener('click', () => {
    const labels = Object.values(state.presets).map((preset) => preset?.label);
    let number = 1;
    while (labels.includes(`${$HR('New preset')} (${number})`)) number++;
    const label = `${$HR('New preset')} (${number})`;
    currentPreset = presetName(label, Object.keys(state.presets));
    state.presets[currentPreset] = { label };
    drawPresets();
    refresh();
  });
  const drawPresets = () => {
    presetList.replaceChildren();
    for (const [name, preset] of Object.entries(state.presets)) {
      const item = element('div', 'h-cms-styles-preset');
      item.setAttribute('role', 'option');
      item.textContent = preset?.label || name;
      item.classList.toggle('h-cms-styles-preset-selected', name === currentPreset);
      item.setAttribute('aria-selected', String(name === currentPreset));
      item.addEventListener('click', () => {
        currentPreset = name;
        drawPresets();
        refresh();
      });
      presetList.append(item);
    }
    drawPreset();
  };
  const drawPreset = () => {
    presetEditor.replaceChildren();
    const preset = currentPreset ? state.presets[currentPreset] : null;
    if (!preset) {
      presetEditor.textContent = $HR('No presets yet: add one.');
      return;
    }
    const name = currentPreset;
    const { label = '', ...style } = preset;
    // normal height (2026-11-12)
    const labelInput = element('input', 'h-input');
    labelInput.type = 'text';
    labelInput.value = label;
    labelInput.addEventListener('input', () => {
      state.presets[name].label = labelInput.value;
      const item = presetList.querySelector('.h-cms-styles-preset-selected');
      if (item) item.textContent = labelInput.value || name;
      refresh();
    });
    const remove = button('Delete preset', 'fa-trash');
    remove.addEventListener('click', () => {
      delete state.presets[name];
      currentPreset = Object.keys(state.presets)[0] || null;
      drawPresets();
      refresh();
    });
    const head = element('div', 'h-cms-styles-preset-head');
    head.append(field('Name', labelInput), remove);
    presetEditor.append(head);
    styleRows(presetEditor, style, (value) => {
      state.presets[name] = { label: state.presets[name]?.label ?? labelInput.value, ...value };
      refresh();
    }, { kind: 'preset', files, base: () => state.base, advanced: true });
  };
  previews.push(() => {
    const name = currentPreset && state.presets[currentPreset] ? currentPreset : '';
    const label = escapeHtml(state.presets[name]?.label || name);
    // a text block per column of the preset (Two columns: two texts)
    const count = name ? sampleColumns(state.presets[name]) : 0;
    const texts = Array.from({ length: count }, (item, index) => `<div data-h-text=""><h3>${label}${count > 1 ? ` (${index + 1})` : ''}</h3>`
      + '<p>An element with this preset. Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p></div>').join('');
    show(preview(name ? shadowBackdrop(state.presets[name], `<div data-h-control="group" data-h-style="${escapeHtml(name)}">${texts}</div>`) : ''),
      count > 1);
  });
  drawPresets();

  // ------------------------------------------------------------ custom CSS
  const cssPane = pane(tabs, 'Custom CSS', HELP.css);
  // without JavaScript allowed on the server (isJavaScriptAllowed) no field takes CSS: the warning only, no editor;
  // the CSS is not changed (not saved) and not in the previews (the page does not show it; 2026-11-03)
  if (!javaScriptAllowed) {
    const warning = element('div', 'h-cms-styles-warning');
    warning.textContent = $HR('CSS and Javascript are disabled by default. Request authorisation from server admin if required.');
    cssPane.config.append(warning);
  }
  const cssHost = element('div', 'h-cms-styles-css');
  if (javaScriptAllowed) cssPane.config.append(cssHost);
  let codeEditor = null;
  const plainEditor = () => {
    const area = element('textarea', 'h-input h-cms-styles-css-text');
    area.value = state.css;
    area.spellcheck = false;
    area.addEventListener('input', () => {
      state.css = area.value;
      refresh();
    });
    cssHost.replaceChildren(area);
  };
  const ready = (async () => {
    if (!javaScriptAllowed) return;
    if (!createCodeEditor) {
      plainEditor();
      return;
    }
    try {
      codeEditor = await createCodeEditor(cssHost, {
        value: state.css,
        language: 'css',
        onChange: (value) => {
          state.css = value;
          refresh();
        }
      });
    } catch {
      plainEditor();
    }
  })();
  previews.push(() => show(preview(SAMPLE_PAGE)));

  // ------------------------------------------------------------ navigation and layout (plan 27f §2-3, §13)
  // three blocks with gaps: navigation, header, footer
  const layoutPane = pane(tabs, 'Navigation and layout', HELP.layout);
  const block = () => {
    const node = element('div', 'h-cms-styles-block');
    layoutPane.config.append(node);
    return node;
  };
  const layoutSelect = (parent, label, choices, value, onChange) => {
    const select = element('select', 'h-select h-compact');
    select.append(...choices.map(([key, text]) => option(key, $HR(text))));
    select.value = value;
    select.addEventListener('change', () => {
      onChange(select.value);
      refresh();
    });
    parent.append(field(label, select));
    return select;
  };
  const navigationBlock = block();
  const navigationNote = element('div', 'h-cms-styles-note');
  // swap and scroll work on the website only: the designer shows one page at a time (2026-11-12)
  const designNote = element('div', 'h-cms-styles-note h-cms-styles-note-warning');
  designNote.textContent = $HR('Not visible in design mode: the designer shows one page at a time. Open the website to see it.');
  const cacheInput = element('input', 'h-input h-compact h-cms-styles-cache');
  cacheInput.type = 'number';
  cacheInput.min = String(CMS_LAYOUT_CACHE.min);
  cacheInput.max = String(CMS_LAYOUT_CACHE.max);
  cacheInput.value = String(state.layout.cache ?? CMS_LAYOUT_CACHE.default);
  const cacheField = field('Pages kept in memory', cacheInput);
  const showNavigation = () => {
    const mode = state.layout.navigation || 'reload';
    navigationNote.textContent = $HR(NAVIGATION_NOTES[mode]);
    designNote.hidden = mode === 'reload';
    cacheField.hidden = mode !== 'swap';
  };
  layoutSelect(navigationBlock, 'Page navigation', NAVIGATION_LABELS, state.layout.navigation || 'reload', (value) => {
    setLayout(state.layout, 'navigation', value);
    showNavigation();
  });
  navigationBlock.append(navigationNote, designNote, cacheField);
  cacheInput.addEventListener('input', () => {
    const number = Number(cacheInput.value);
    setLayout(state.layout, 'cache', Number.isInteger(number) ? Math.max(CMS_LAYOUT_CACHE.min, Math.min(CMS_LAYOUT_CACHE.max, number)) : null);
  });
  showNavigation();
  const header = state.layout.header || {};
  const footer = state.layout.footer || {};
  // the theme of the header or footer; own colours: background and text
  const themeSelect = (parent, part, label) => {
    const settings = state.layout[part] || {};
    const colours = element('div', 'h-cms-styles-colours');
    const colour = (key, text) => {
      const host = element('div', 'h-cms-styles-value');
      colours.append(field(text, host));
      const input = new HInputColor().attach(host, { suppressLabel: true, clearButton: false, value: settings.colors?.[key] ?? '',
        placeholder: $HR('Heurist default') }).render();
      const changed = () => {
        const value = { ...(state.layout[part]?.colors || {}) };
        const text = String(input.getValue() ?? '').trim();
        if (text) value[key] = text; else delete value[key];
        setLayout(state.layout, `${part}.colors`, Object.keys(value).length ? value : null);
        refresh();
      };
      host.addEventListener('h-input-change', changed);
      host.addEventListener('input', changed);
    };
    colour('bg', 'Background colour');
    colour('text', 'Text colour');
    const select = layoutSelect(parent, label, PART_THEMES, settings.theme || 'default', (value) => {
      setLayout(state.layout, `${part}.theme`, value);
      colours.hidden = value !== 'own';
      // other themes: no own colours
      if (value !== 'own') setLayout(state.layout, `${part}.colors`, null);
    });
    colours.hidden = select.value !== 'own';
    parent.append(colours);
  };
  // header height / width, footer height (review 2026-11-10): a CSS size; empty = the height of the content, the
  // width of the vertical header 180-260px (PageRenderer::layoutCss)
  const sizeInput = (parent, path, label, placeholder) => {
    const [part, name] = path.split('.');
    const input = element('input', 'h-input h-compact');
    input.value = state.layout[part]?.[name] ?? '';
    input.placeholder = $HR(placeholder);
    input.addEventListener('change', () => {
      const value = input.value.trim();
      const valid = !value || CMS_LAYOUT_SIZE.test(value);
      input.classList.toggle('h-cms-style-invalid', !valid);
      input.title = valid ? '' : $HR('A size such as 120px, 10em or 20%');
      if (!valid) return;
      setLayout(state.layout, path, value || null);
      refresh();
    });
    const line = field(label, input);
    parent.append(line);
    return line;
  };
  const headerBlock = block();
  layoutSelect(headerBlock, 'Header position', HEADER_POSITIONS, header.position || CMS_LAYOUT.header.position[0],
    (value) => setLayout(state.layout, 'header.position', value));
  const showSize = () => {
    const vertical = state.layout.header?.orientation === 'vertical';
    heightField.hidden = vertical;
    widthField.hidden = !vertical;
  };
  layoutSelect(headerBlock, 'Header orientation', HEADER_ORIENTATIONS, header.orientation || 'horizontal', (value) => {
    setLayout(state.layout, 'header.orientation', value);
    showSize();
  });
  const heightField = sizeInput(headerBlock, 'header.height', 'Header height (minimum)', 'height of the content');
  const widthField = sizeInput(headerBlock, 'header.width', 'Header width', '180-260px');
  showSize();
  const rows = element('input');
  rows.type = 'checkbox';
  rows.checked = header.rows === 'two';
  rows.addEventListener('change', () => {
    setLayout(state.layout, 'header.rows', rows.checked ? 'two' : null);
    refresh();
  });
  headerBlock.append(field('Use 2 rows on normal screens', rows));
  themeSelect(headerBlock, 'header', 'Header theme');
  // the fields of the website record: title, subtitle, logo, banner (a website only)
  let fieldsForm = null;
  const fieldsReady = typeof websiteFields === 'function' ? (async () => {
    const host = element('div', 'h-cms-styles-website-fields');
    headerBlock.append(host);
    try {
      fieldsForm = await websiteFields(host);
    } catch (error) {
      host.textContent = error?.message || String(error);
    }
  })() : Promise.resolve();
  const footerBlock = block();
  layoutSelect(footerBlock, 'Footer position', FOOTER_POSITIONS, footer.position || 'default', (value) => setLayout(state.layout, 'footer.position', value));
  sizeInput(footerBlock, 'footer.height', 'Footer height (minimum)', 'height of the content');
  themeSelect(footerBlock, 'footer', 'Footer theme');
  previews.push(() => show(layoutDiagram(state.layout)));

  if (tab === 'layout') tabs.select(previews.length - 1); else tabs.select(0);
  return {
    element: root,
    tabs,
    ready: Promise.all([ready, fieldsReady]).then(() => undefined),
    read: () => {
      if (fieldsForm?.validate().length) {
        tabs.select(previews.length - 1);
        return null;
      }
      return { base: cleanBase(state.base), kinds: state.kinds, presets: state.presets, layout: state.layout, css: state.css,
        fields: fieldsForm?.changed() || {} };
    },
    destroy: () => {
      codeEditor?.destroy?.();
      void fieldsForm?.destroy();
    }
  };
}

/** Whether the style editor shows all properties (Advanced); kept for the session. */
let advancedMode = false;

const SELECT = (...items) => items.map((item) => (Array.isArray(item) ? item : [item, item]));

/**
 * The properties of the simple style editor (§23-§25), in sections; `group: true` only for groups (and presets),
 * `inGroup: true` only for elements in a flex group (and presets); `toggle`: a section with a checkbox, `on` / `off`
 * the values written when it is checked / unchecked; `key`: the section is on when these values are set (on the
 * medium and narrow screens also when the normal screen has them), sections with a key on the same property
 * exclude each other (Grid, Group layout). `columns: true`: the column selector of the grid (§30).
 * Selector options are [value, label]; the first option (empty) is the default.
 */
export const SIMPLE_STYLE_FIELDS = Object.freeze([
  // §30: every direct child of a grid is one cell; the children fill the columns and go on in new rows
  { section: 'Grid (columns)', group: true, note: 'Set Columns to 1 on the Narrow tab to show the elements one above the other.',
    toggle: { key: { display: 'grid' }, on: { display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', gap: '12px' } },
    fields: [
      { property: 'grid-template-columns', label: 'Columns', columns: true },
      { property: 'gap', label: 'Gap between elements', hint: 'e.g. 12px' },
      { property: 'align-items', label: 'Row alignment', options: SELECT(['stretch', 'Stretch'], ['start', 'Top'], ['center', 'Center'],
        ['end', 'Bottom']) }
    ] },
  { section: 'Group layout (flex)', group: true,
    // checked: a flex box; unchecked: display block
    toggle: { key: { display: 'flex' }, on: { display: 'flex' }, off: { display: 'block' } }, fields: [
      { property: 'flex-direction', label: 'Direction', options: SELECT(['row', 'Row (side by side)'], ['column', 'Column (one under another)']) },
      { property: 'flex-wrap', label: 'Wrap', options: SELECT(['nowrap', 'No wrap'], ['wrap', 'Wrap']) },
      { property: 'justify-content', label: 'Alignment', options: SELECT(['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'],
        ['space-between', 'Space between'], ['space-around', 'Space around'], ['space-evenly', 'Space evenly']) },
      { property: 'align-items', label: 'Cross axis alignment', options: SELECT(['stretch', 'Stretch'], ['flex-start', 'Start'],
        ['center', 'Center'], ['flex-end', 'End'], ['baseline', 'Baseline']) },
      { property: 'align-content', label: 'Align content', options: SELECT(['normal', 'Normal'], ['flex-start', 'Start'], ['center', 'Center'],
        ['flex-end', 'End'], ['space-between', 'Space between'], ['space-around', 'Space around'], ['stretch', 'Stretch']) },
      { property: 'gap', label: 'Gap between elements', hint: 'e.g. 12px' }
    ] },
  { section: 'In the group', inGroup: true, fields: [
    { property: 'flex', label: 'Size in group (proportion)', hint: 'e.g. 1 or 2' }
  ] },
  { section: 'Size and spacing', fields: [
    { property: 'height', label: 'Height', hint: 'e.g. 300px, 50vh' },
    { property: 'width', label: 'Width', hint: 'e.g. 600px, 50%' },
    { property: 'margin', label: 'Margin (outside)', hint: 'e.g. 10px or 10px 20px' },
    { property: 'padding', label: 'Padding (inside)', hint: 'e.g. 10px or 10px 20px' }
  ] },
  { section: 'Text', fields: [
    { property: 'color', label: 'Text colour' },
    { property: 'text-align', label: 'Text alignment', options: SELECT(['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify']) },
    { property: 'font-size', label: 'Font size', hint: 'e.g. 14px, 1.2em' },
    { property: 'font-weight', label: 'Font weight', options: SELECT(['normal', 'Normal'], ['bold', 'Bold'], ['300', 'Light (300)'], ['600', 'Semi bold (600)']) },
    // a text over a light or dark banner / background image (2026-11-12)
    { property: 'text-shadow', label: 'Text shadow', options: SELECT(['0 0 4px rgba(255, 255, 255, 0.9)', 'Light shadow (dark text)'],
      ['0 1px 3px rgba(0, 0, 0, 0.8)', 'Dark shadow (light text)'], ['none', 'None']) }
  ] },
  { section: 'Background', toggle: {}, fields: [
    { property: 'background-color', label: 'Background colour' },
    { property: 'background-image', label: 'Image', image: true },
    { property: 'background-position', label: 'Position', options: SELECT(['center', 'Center'], ['top', 'Top'], ['bottom', 'Bottom'],
      ['left', 'Left'], ['right', 'Right'], ['left top', 'Left top'], ['right top', 'Right top'], ['left bottom', 'Left bottom'],
      ['right bottom', 'Right bottom']) },
    { property: 'background-repeat', label: 'Repeat', options: SELECT(['no-repeat', 'No repeat'], ['repeat', 'Repeat'],
      ['repeat-x', 'Horizontally'], ['repeat-y', 'Vertically']) },
    { property: 'background-size', label: 'Size', options: SELECT(['cover', 'Cover (fill, cut)'], ['contain', 'Contain (whole image)'],
      ['auto', 'Original size'], ['100% 100%', 'Stretch']) }
  ] },
  { section: 'Border', toggle: { on: { 'border-style': 'solid', 'border-width': '1px' }, off: { border: 'none' } }, fields: [
    { property: 'border-style', label: 'Border', options: SELECT(['solid', 'Solid'], ['dotted', 'Dotted'], ['dashed', 'Dashed']) },
    { property: 'border-width', label: 'Border width', hint: 'e.g. 1px' },
    { property: 'border-color', label: 'Border colour' },
    { property: 'border-radius', label: 'Border radius', hint: 'e.g. 4px' }
  ] }
]);

const UNITS = ['px', 'em', 'rem', '%', 'vh', 'vw', 'pt', 'ch'];

/** Length properties and the number of values each takes. */
function lengthRule(property) {
  if (/^(?:margin|padding)$/.test(property) || property === 'border-radius') return { count: 4, auto: property === 'margin', negative: property === 'margin' };
  if (/^margin-/.test(property)) return { count: 1, auto: true, negative: true };
  if (/^padding-/.test(property) || /^border(?:-(?:top|right|bottom|left))?-width$/.test(property) || property === 'font-size') return { count: 1 };
  if (property === 'gap') return { count: 2 };
  if (/^(?:min-|max-)?(?:width|height)$/.test(property)) return { count: 1, auto: /^(?:width|height)$/.test(property), none: property.startsWith('max-') };
  return null;
}

/**
 * Check a numeric style value when its input is left (§23): numbers with a unit (px, em, rem, %, vh, vw, pt, ch),
 * 0 without one; a number without a unit gets px.
 *
 * @param {string} property
 * @param {string} value
 * @returns {{value: string, error: string|null}} The (completed) value, or an error.
 */
export function checkStyleValue(property, value) {
  const text = String(value ?? '').trim();
  if (property === 'flex') return checkFlex(text);
  if (property === 'grid-template-columns') return checkGridColumns(text);
  const rule = lengthRule(property);
  if (!rule || !text) return { value: text, error: null };
  const parts = text.split(/\s+/);
  const number = rule.negative ? /^-?(?:\d+\.?\d*|\.\d+)$/ : /^(?:\d+\.?\d*|\.\d+)$/;
  const fixed = [];
  for (const part of parts) {
    if ((rule.auto && part === 'auto') || (rule.none && part === 'none')) {
      fixed.push(part);
      continue;
    }
    if (number.test(part)) {
      fixed.push(Number(part) === 0 ? '0' : `${part}px`);
      continue;
    }
    const unit = UNITS.find((name) => part.endsWith(name) && number.test(part.slice(0, -name.length)));
    if (!unit) {
      return { value: text, error: $HR('A number with a unit is expected (px, em, rem, %, vh, vw), e.g. 12px, 10em, 50%.') };
    }
    fixed.push(part);
  }
  if (parts.length > rule.count) return { value: text, error: $HR(`At most ${rule.count} values are expected.`) };
  return { value: fixed.join(' '), error: null };
}

/** The parts of a value separated by spaces outside parentheses (`minmax(100px, 1fr) 2fr` = two parts). */
function topLevelParts(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (/\s/.test(char) && depth === 0) {
      if (current) parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return depth === 0 ? parts : null;
}

/** `grid-template-columns`: column widths (lengths, `fr`, auto, min-content, max-content), minmax() and repeat(). */
function checkGridColumns(text) {
  if (!text) return { value: text, error: null };
  const length = /^(?:0|(?:\d+\.?\d*|\.\d+)(?:px|em|rem|%|vh|vw|pt|ch))$/;
  const track = (part) => {
    const minmax = /^minmax\((.+)\)$/i.exec(part);
    if (minmax) {
      const items = minmax[1].split(',').map((item) => item.trim());
      return items.length === 2 && items.every(track);
    }
    return /^(?:auto|min-content|max-content)$/.test(part) || /^(?:\d+\.?\d*|\.\d+)fr$/.test(part) || length.test(part);
  };
  const tracks = (value) => {
    const parts = topLevelParts(value);
    return Boolean(parts?.length) && parts.every((part) => {
      const repeat = /^repeat\(\s*(\d+|auto-fill|auto-fit)\s*,(.+)\)$/i.exec(part);
      return repeat ? (repeat[1].startsWith('auto') || Number(repeat[1]) > 0) && tracks(repeat[2].trim()) : track(part);
    });
  };
  return tracks(text)
    ? { value: text.replace(/\s+/g, ' '), error: null }
    : { value: text, error: $HR('Column widths are expected, e.g. 1fr 2fr, 200px 1fr or repeat(3, 1fr).') };
}

/** `flex` of an element in a group: auto, none, or grow [shrink] [basis] (numbers; the basis a length). */
function checkFlex(text) {
  if (!text || text === 'auto' || text === 'none') return { value: text, error: null };
  const parts = text.split(/\s+/);
  const number = /^(?:\d+\.?\d*|\.\d+)$/;
  // grow, then shrink (a number) and / or the basis (a length with a unit, or auto)
  const isBasis = (part) => part === 'auto' || part === '0' || (!number.test(part) && !checkStyleValue('width', part).error);
  const valid = parts.length <= 3 && number.test(parts[0])
    && (parts.length < 2 || number.test(parts[1]) || (parts.length === 2 && isBasis(parts[1])))
    && (parts.length < 3 || isBasis(parts[2]));
  return valid
    ? { value: parts.join(' '), error: null }
    : { value: text, error: $HR('A proportion is expected, e.g. 1 or 2 (or grow shrink basis: 1 1 200px).') };
}

function isColorProperty(property) {
  return property === 'color' || /-color$/.test(property);
}

/**
 * The style editor with Normal / Medium / Narrow tabs (the own style popup, and inline in the Styles popup), §23,
 * §25: the preset of the element (own style only) above the list; Simple (selected properties with plain labels,
 * selectors, colour and image inputs; sections Group layout, Background and Border with a checkbox) or Advanced
 * (all property rows, Add property, Remove all). Reset all clears the values of the screen; Reset all and Remove
 * all are confirmed.
 *
 * @param {HTMLElement} parent
 * @param {object} style
 * @param {(style: object) => void} [onChange] After every change (previews).
 * @param {{kind?: string, inFlexGroup?: boolean, presets?: Array<Array<string>>|null, preset?: string|null,
 *        cssClass?: string, base?: object|Function, files?: {apiClient: object, baseUrl: string, database: string,
 *        browseRecords?: Function, fileRecordType?: number}|null}} [options] `kind`: the kind of the
 *        element (group, tabs, accordion, text, instance; `preset` for presets); groups and presets get the group
 *        layout. `inFlexGroup`: the element is in a flex group; it (and a preset) gets *Size in group* (`flex`).
 *        `presets`: [name, label] of the preset selector (null = none) and `preset` its value; with the selector
 *        the *Custom CSS class* input beside it (`classInput` false: none), `cssClass` its value. `base`: the base settings (or a function
 *        giving them), the named colours of the colour inputs. `files`: the image picker of the background
 *        (registered image files; with `browseRecords` and `fileRecordType` in the record manager, addorbrowse);
 *        without it the image is a text value. `advanced`: start in Simple (false) or Advanced (true), the editor's
 *        own choice; null = the choice of the session.
 * @returns {{value: () => object, preset: () => string|null, cssClass: () => string|null}} `cssClass`: null
 *          while it has characters that are not allowed.
 */
export function styleRows(parent, style, onChange = null, {
  kind = null, inFlexGroup = false, presets = null, preset = null, cssClass = '', classInput = true, base = null, files = null,
  advanced: startAdvanced = null
} = {}) {
  // Simple or Advanced: the session's choice (own style), or the editor's own (Styles popup)
  let isAdvanced = startAdvanced ?? advancedMode;
  const screens = ['normal', ...Object.keys(SCREENS)];
  const values = { normal: {} };
  for (const screen of Object.keys(SCREENS)) values[screen] = { ...(style?.[screen] || {}) };
  for (const [property, value] of Object.entries(style || {})) {
    if (property !== 'label' && !Object.hasOwn(SCREENS, property)) values.normal[property] = value;
  }
  const sections = SIMPLE_STYLE_FIELDS.filter((section) => (!section.group || kind === 'group' || kind === 'preset')
    && (!section.inGroup || inFlexGroup || kind === 'preset'));
  const simpleProperties = new Set(sections.flatMap((section) => [
    ...section.fields.map((item) => item.property), ...Object.keys(section.toggle?.on || {}), ...Object.keys(section.toggle?.off || {})
  ]));
  const baseUrl = files?.baseUrl || '';
  // values that failed the check: not in the style until corrected
  const invalid = new Map();
  // sections checked without values yet (screen:section)
  const opened = new Set();
  let screen = 'normal';
  let presetValue = preset || null;
  let classValue = String(cssClass ?? '').trim();
  let classError = checkCssClass(classValue);
  if (presets) {
    const select = element('select', 'h-select h-compact');
    select.append(option('', $HR('(none)')), ...presets.map(([name, label]) => option(name, label || name)));
    select.value = presetValue || '';
    select.addEventListener('change', () => {
      presetValue = select.value || null;
      check();
    });
    // the class attribute of the element: the user's own rules (Website styles, Custom CSS)
    const classText = element('input', 'h-input h-compact');
    classText.type = 'text';
    classText.value = classValue;
    classText.placeholder = $HR('e.g. my-box');
    const markClass = () => {
      classText.classList.toggle('h-cms-style-invalid', Boolean(classError));
      classText.title = classError || $HR('Class names of your own rules in Custom CSS, separated by spaces');
    };
    markClass();
    classText.addEventListener('input', () => {
      classValue = classText.value;
      classError = checkCssClass(classValue);
      markClass();
      check();
    });
    const head = element('div', 'h-cms-style-preset');
    head.append(field('Preset', select, 'h-cms-style-field'));
    // a class needs rules of the custom CSS: not without JavaScript allowed
    if (classInput) head.append(field('Custom CSS class', classText, 'h-cms-style-field'));
    parent.append(head);
  }
  const palette = () => basePalette(typeof base === 'function' ? base() : base);
  const tabs = element('div', 'h-cms-style-tabs');
  const tools = element('div', 'h-cms-style-tools');
  const advanced = button('Advanced', 'fa-sliders');
  advanced.classList.add('h-cms-style-advanced');
  const add = button('Add property', 'fa-plus');
  add.classList.add('h-btn-primary');
  const reset = button('Reset all', 'fa-eraser');
  reset.title = $HR('Clear the values of this screen');
  const removeAll = button('Remove all', 'fa-trash');
  removeAll.title = $HR('Remove all properties of this screen');
  tools.append(advanced, add, reset, removeAll);
  const list = element('div', 'h-cms-style-rows');
  const problems = element('div', 'h-cms-style-problems');
  parent.append(tabs, list, tools, problems);
  const build = () => {
    const result = {};
    for (const name of screens) {
      const entries = Object.entries(values[name])
        .filter(([property, value]) => String(value).trim() && !invalid.has(`${name}:${property}`))
        .map(([property, value]) => [property, String(value).trim()]);
      if (name === 'normal') Object.assign(result, Object.fromEntries(entries));
      else if (entries.length) result[name] = Object.fromEntries(entries);
    }
    return result;
  };
  function check() {
    const value = build();
    const { issues } = compileCmsStyles({}, [{ n: value }], baseUrl);
    problems.textContent = [...(classError ? [classError] : []), ...invalid.values(), ...issues.map((issue) => issue.message)].join('\n');
    onChange?.(value);
  }
  const setValue = (property, value) => {
    // an empty value removes the property in the simple list; Advanced keeps the row
    if (isAdvanced || String(value).trim()) values[screen][property] = value; else delete values[screen][property];
    check();
  };
  // a section with a checkbox: on when it has values (or was checked), off with its `off` values
  // a section with a key on the medium / narrow screen, the key set on the normal screen only: on, not switched here
  const inherited = (section) => {
    const key = section.toggle?.key;
    return Boolean(key) && screen !== 'normal' && Object.keys(key).every((property) => values[screen][property] === undefined)
      && Object.entries(key).every(([property, value]) => values.normal[property] === value);
  };
  const isOn = (section) => {
    const current = values[screen];
    const { on = {}, off = {}, key = null } = section.toggle;
    if (key) {
      return inherited(section) || Object.entries(key).every(([property, value]) => current[property] === value);
    }
    if (Object.keys(off).length && Object.entries(off).every(([property, value]) => current[property] === value)) return false;
    if (opened.has(`${screen}:${section.section}`)) return true;
    if (Object.keys(on).length && Object.entries(on).some(([property, value]) => current[property] === value)) return true;
    return section.fields.some((item) => String(current[item.property] ?? '').trim());
  };
  const toggleSection = (section, checked) => {
    const current = values[screen];
    const { on = {}, off = {} } = section.toggle;
    const key = `${screen}:${section.section}`;
    for (const item of section.fields) {
      delete current[item.property];
      invalid.delete(`${screen}:${item.property}`);
    }
    for (const property of [...Object.keys(on), ...Object.keys(off)]) delete current[property];
    // Grid and Group layout exclude each other: checking one clears the other
    const keyProperties = Object.keys(section.toggle.key || {});
    if (checked && keyProperties.length) {
      for (const other of sections) {
        if (other === section || !Object.keys(other.toggle?.key || {}).some((property) => keyProperties.includes(property))) continue;
        for (const item of other.fields) delete current[item.property];
        opened.delete(`${screen}:${other.section}`);
      }
    }
    if (checked) {
      opened.add(key);
      Object.assign(current, on);
    } else {
      opened.delete(key);
      Object.assign(current, off);
    }
    draw();
  };
  // a text input; numeric values are checked (and completed) when it is left
  const textInput = (property, value, hint = '') => {
    const text = element('input', 'h-input h-compact');
    text.type = 'text';
    text.value = String(value ?? '');
    if (hint) text.placeholder = $HR(hint);
    const key = `${screen}:${property}`;
    const mark = (error) => {
      text.classList.toggle('h-cms-style-invalid', Boolean(error));
      text.title = error || '';
      if (error) invalid.set(key, `${property}: ${error}`); else invalid.delete(key);
    };
    if (invalid.has(key)) mark(invalid.get(key).slice(property.length + 2));
    text.addEventListener('input', () => setValue(property, text.value));
    text.addEventListener('change', () => {
      const result = checkStyleValue(property, text.value);
      mark(result.error);
      if (!result.error) text.value = result.value;
      setValue(property, text.value);
    });
    return text;
  };
  const colorInput = (host, property, value) => {
    const color = new HInputColor().attach(host, {
      suppressLabel: true, clearButton: false, value: String(value ?? ''), placeholder: $HR('(default)'), palette
    }).render();
    const changed = () => setValue(property, color.getValue() ?? '');
    host.addEventListener('h-input-change', changed);
    host.addEventListener('input', changed);
  };
  // the background image: HInputFile (thumbnail with zoom, clear) on the registered image files, in the record
  // manager when the host has it (Browse, Upload, URL as a file field in addorbrowse mode); the value is
  // url(...&file=KEY), the file of the key is read by GET /files/{key}
  const imageInput = (host, property, value) => {
    if (!files?.apiClient) {
      host.append(textInput(property, value, 'url(...)'));
      return;
    }
    const url = /url\(\s*(['"]?)(.*?)\1\s*\)/i.exec(String(value || ''))?.[2] || '';
    const key = /[?&]file=([A-Za-z0-9]+)/.exec(url)?.[1] || '';
    const input = new HInputFile().attach(host, {
      suppressLabel: true, apiClient: files.apiClient, fileQuery: [{ 'f:29': 'image/*' }],
      browseRecords: files.browseRecords || null, fileRecordType: Number(files.fileRecordType) || 0,
      fileViewer: baseUrl ? { baseUrl, database: files.database } : null
    }).render();
    if (key) {
      void files.apiClient.get(`/files/${key}`, { query: { fields: 'rec_ID,rec_Title,rec_URL,rec_Hash,rec_ThumbnailURL' } })
        .then((response) => {
          const file = fileOfRecord((response?.data ?? response)?.records?.[0]);
          if (file && !input.getValue()) input.setValue(file.ulf_ID, file);
        })
        .catch(() => {});
    }
    host.addEventListener('h-input-change', async () => {
      const id = input.getValue();
      if (!id) {
        setValue(property, '');
        return;
      }
      let fileKey = input.file?.ulf_ObfuscatedFileID;
      // a file chosen in the record manager: its key comes with its title
      if (!fileKey) {
        await input.source?.fetchLabels?.([id]);
        fileKey = input.source?.fileFor?.(id)?.key;
      }
      if (fileKey) setValue(property, `url(${fileMediaUrls(baseUrl, files.database).file(fileKey)})`);
    });
  };
  // the columns of a grid: 1-6 equal columns, or own widths (a text, checked when it is left)
  const columnsInput = (host, property, value) => {
    const equal = [1, 2, 3, 4, 5, 6].map((count) => [`repeat(${count}, minmax(0, 1fr))`, count === 1 ? '1 column' : `${count} columns`]);
    const select = element('select', 'h-select h-compact');
    select.append(option('', $HR('(default)')), ...equal.map(([name, label]) => option(name, $HR(label))), option('own', $HR('Own widths')));
    select.value = !value ? '' : equal.some(([name]) => name === value) ? value : 'own';
    const text = textInput(property, value, 'e.g. 1fr 2fr or 200px 1fr');
    text.hidden = select.value !== 'own';
    select.addEventListener('change', () => {
      text.hidden = select.value !== 'own';
      if (select.value === 'own') {
        text.focus?.();
        return;
      }
      text.value = select.value;
      invalid.delete(`${screen}:${property}`);
      text.classList.remove('h-cms-style-invalid');
      setValue(property, select.value);
    });
    const line = element('div', 'h-cms-style-columns');
    line.append(select, text);
    host.append(line);
  };
  const drawSimple = () => {
    for (const section of sections) {
      const head = element('div', 'h-cms-style-section');
      const on = section.toggle ? isOn(section) : true;
      if (section.toggle) {
        const box = element('input');
        box.type = 'checkbox';
        box.checked = on;
        if (inherited(section)) {
          box.disabled = true;
          box.title = $HR('Set on the Normal tab');
        }
        box.addEventListener('change', () => toggleSection(section, box.checked));
        const label = element('label');
        label.append(box, document.createTextNode(` ${$HR(section.section)}`));
        head.append(label);
      } else {
        head.textContent = $HR(section.section);
      }
      list.append(head);
      if (!on) continue;
      if (section.note) {
        const note = element('div', 'h-cms-style-note');
        note.textContent = $HR(section.note);
        list.append(note);
      }
      for (const item of section.fields) {
        const value = values[screen][item.property] ?? '';
        const host = element('div', 'h-cms-styles-value');
        if (item.columns) {
          columnsInput(host, item.property, value);
        } else if (item.options) {
          const select = element('select', 'h-select h-compact');
          select.append(option('', $HR('(default)')), ...item.options.map(([name, label]) => option(name, $HR(label))));
          // a value set in Advanced that is not an option
          if (value && !item.options.some(([name]) => name === value)) select.append(option(value, value));
          select.value = value;
          select.addEventListener('change', () => setValue(item.property, select.value));
          host.append(select);
        } else if (item.image) {
          imageInput(host, item.property, value);
        } else if (isColorProperty(item.property)) {
          colorInput(host, item.property, value);
        } else {
          host.append(textInput(item.property, value, item.hint));
        }
        // the image input (thumbnail, file button, Upload, URL): not in a label, a click on the thumbnail would open
        // the file manager too
        list.append(field(item.label, host, 'h-cms-style-field', item.image ? 'div' : 'label'));
      }
    }
    const others = Object.keys(values[screen]).filter((property) => !simpleProperties.has(property) && String(values[screen][property]).trim());
    if (others.length) {
      const note = element('div', 'h-cms-style-note');
      note.textContent = `${$HR('Also set (see Advanced)')}: ${others.join(', ')}`;
      list.append(note);
    }
  };
  const drawAdvanced = () => {
    for (const [property, value] of Object.entries(values[screen])) {
      const line = element('div', 'h-cms-style-row');
      const name = element('select', 'h-select h-compact');
      for (const item of CMS_STYLE_PROPERTIES) name.append(option(item, item));
      name.value = property;
      const host = element('div', 'h-cms-styles-value');
      if (isColorProperty(property)) colorInput(host, property, value);
      else host.append(textInput(property, value));
      const remove = button('', 'fa-xmark');
      remove.title = $HR('Remove');
      name.addEventListener('change', () => {
        const entries = Object.entries(values[screen]).map(([key, item]) => (key === property ? [name.value, item] : [key, item]));
        values[screen] = Object.fromEntries(entries);
        invalid.delete(`${screen}:${property}`);
        draw();
      });
      remove.addEventListener('click', () => {
        delete values[screen][property];
        invalid.delete(`${screen}:${property}`);
        draw();
      });
      line.append(name, host, remove);
      list.append(line);
    }
  };
  function draw() {
    tabs.replaceChildren(...screens.map((name) => {
      const tab = button(name === 'normal' ? 'Normal' : name === 'medium' ? 'Medium (≤ 1024 px)' : 'Narrow (≤ 640 px)');
      tab.classList.toggle('h-cms-tab-active', name === screen);
      tab.addEventListener('click', () => { screen = name; draw(); });
      return tab;
    }));
    advanced.classList.toggle('h-cms-style-advanced-on', isAdvanced);
    advanced.setAttribute('aria-pressed', String(isAdvanced));
    add.hidden = !isAdvanced;
    removeAll.hidden = !isAdvanced;
    list.classList.toggle('h-cms-style-simple', !isAdvanced);
    list.replaceChildren();
    if (isAdvanced) drawAdvanced(); else drawSimple();
    check();
  }
  const clearScreen = () => {
    for (const key of [...invalid.keys()]) if (key.startsWith(`${screen}:`)) invalid.delete(key);
    for (const key of [...opened]) if (key.startsWith(`${screen}:`)) opened.delete(key);
  };
  advanced.addEventListener('click', () => {
    isAdvanced = !isAdvanced;
    if (startAdvanced === null) advancedMode = isAdvanced;
    draw();
  });
  add.addEventListener('click', () => {
    const free = CMS_STYLE_PROPERTIES.find((property) => !(property in values[screen]));
    if (free) values[screen][free] = '';
    draw();
  });
  reset.addEventListener('click', async () => {
    if (!(await confirmNear(reset, 'Confirm?', { yes: 'Reset' }))) return;
    if (isAdvanced) {
      for (const property of Object.keys(values[screen])) values[screen][property] = '';
    } else {
      values[screen] = {};
    }
    clearScreen();
    draw();
  });
  removeAll.addEventListener('click', async () => {
    if (!(await confirmNear(removeAll, 'Confirm?'))) return;
    values[screen] = {};
    clearScreen();
    draw();
  });
  draw();
  return { value: build, preset: () => presetValue, cssClass: () => (classError ? null : classValue.trim().split(/\s+/).filter(Boolean).join(' ')) };
}

/**
 * Check the class names of an element: letters, digits, spaces, `_` and `-` only.
 *
 * @param {string} text
 * @returns {string|null} The error, or null.
 */
export function checkCssClass(text) {
  return /^[A-Za-z0-9 _-]*$/.test(String(text ?? '')) ? null
    : $HR('Custom CSS class: only letters, digits, spaces, "_" and "-" are allowed.');
}

/**
 * The named colours of the colour inputs: `var(--h-...)` of the base colours with their colour (the base setting,
 * else the Heurist default of this page).
 *
 * @param {object} [base] Base settings of the website (and page).
 * @returns {Array<{value: string, label: string, color: string}>}
 */
export function basePalette(base = {}) {
  const style = globalThis.getComputedStyle?.(document.documentElement);
  const colorOf = (key) => {
    const value = String(base?.[key] ?? '').trim() || style?.getPropertyValue?.(`--h-${key}`)?.trim();
    if (value) return value;
    const fallback = PALETTE_FALLBACK[key] || '';
    return fallback.startsWith('#') ? fallback : fallback ? colorOf(fallback) : '';
  };
  return PALETTE.map(([key, label]) => ({ value: `var(--h-${key})`, label: $HR(label), color: colorOf(key) }));
}

/** The help line of a tab or popup (question icon and text). */
export function helpLine(help) {
  const line = element('div', 'h-cms-styles-help');
  const icon = element('i', 'fa-solid fa-circle-question');
  icon.setAttribute('aria-hidden', 'true');
  const text = element('span');
  text.textContent = $HR(help);
  line.append(icon, text);
  return line;
}

/** The drag handle of a row of a sortable list (sortableList), its first column. */
export function dragHandle() {
  const handle = element('span', 'h-cms-drag');
  handle.title = $HR('Drag to reorder');
  const icon = element('i', 'fa-solid fa-grip-vertical');
  icon.setAttribute('aria-hidden', 'true');
  handle.append(icon);
  return handle;
}

/**
 * Reorder the rows of a list by drag and drop (review 2026-11-11: badges, action menu). A row is dragged only by
 * its handle (dragHandle), so the inputs of the row keep their text selection. The list does not move the rows:
 * `onMove` changes the data and draws the list again.
 *
 * @param {HTMLElement} list The parent of the rows.
 * @param {(from: number, to: number) => void} onMove Indexes of the dragged row and of the row it was dropped on.
 */
export function sortableList(list, onMove) {
  let dragged = null;
  const rowOf = (node) => {
    let row = node instanceof Element ? node : node?.parentElement;
    while (row && row.parentElement !== list) row = row.parentElement;
    return row || null;
  };
  const clear = () => {
    for (const row of list.children) row.classList.remove('is-drop-target');
  };
  const reset = () => {
    clear();
    for (const row of list.children) {
      row.draggable = false;
      row.classList.remove('is-dragging');
    }
    dragged = null;
  };
  list.addEventListener('pointerdown', (event) => {
    const handle = event.target instanceof Element ? event.target.closest('.h-cms-drag') : null;
    const row = handle ? rowOf(handle) : null;
    if (row) row.draggable = true;
  });
  list.addEventListener('pointerup', () => {
    if (!dragged) reset();
  });
  list.addEventListener('dragstart', (event) => {
    const row = rowOf(event.target);
    if (!row?.draggable) return;
    dragged = row;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', '');
    row.classList.add('is-dragging');
  });
  list.addEventListener('dragover', (event) => {
    if (!dragged) return;
    event.preventDefault();
    const target = rowOf(event.target);
    clear();
    if (target && target !== dragged) target.classList.add('is-drop-target');
  });
  list.addEventListener('drop', (event) => {
    if (!dragged) return;
    event.preventDefault();
    const rows = [...list.children];
    const from = rows.indexOf(dragged);
    const to = rows.indexOf(rowOf(event.target));
    reset();
    if (from >= 0 && to >= 0 && from !== to) onMove(from, to);
  });
  list.addEventListener('dragend', reset);
}

/**
 * A small confirmation next to a button (Remove / No), closed by a click outside or Escape. Inside a modal
 * dialog it is put into the dialog (the page below it is inert).
 *
 * @param {HTMLElement} anchor
 * @param {string} message
 * @param {{yes?: string}} [options]
 * @returns {Promise<boolean>}
 */
export function confirmNear(anchor, message, { yes = 'Remove' } = {}) {
  return new Promise((resolve) => {
    const box = element('div', 'h-cms-popconfirm');
    const text = element('span');
    text.textContent = $HR(message);
    const ok = button(yes);
    ok.classList.add('h-btn-danger');
    const no = button('No');
    box.append(text, ok, no);
    const finish = (value) => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
      box.remove();
      resolve(value);
    };
    const outside = (event) => { if (!box.contains(event.target)) finish(false); };
    const escape = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      finish(false);
    };
    ok.addEventListener('click', () => finish(true));
    no.addEventListener('click', () => finish(false));
    (anchor?.closest?.('dialog') || document.body).append(box);
    const rect = anchor?.getBoundingClientRect?.();
    if (rect) {
      const width = box.offsetWidth || 220;
      box.style.left = `${Math.max(4, Math.min(rect.right + 4, (globalThis.innerWidth || 0) - width - 4))}px`;
      box.style.top = `${Math.max(4, rect.top - 4)}px`;
    }
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    ok.focus?.();
  });
}

/**
 * The number of columns of a preset for its preview: the tracks of `grid-template-columns` (`1fr 1fr`,
 * `repeat(3, 1fr)`), two for a flex box, else one (at most six).
 */
export function sampleColumns(preset) {
  const template = String(preset?.['grid-template-columns'] ?? '').trim();
  let count = 1;
  if (template) {
    const repeat = /^repeat\(\s*(\d+)\s*,/i.exec(template);
    // tracks separated by spaces outside parentheses (minmax(100px, 1fr) is one track)
    count = repeat ? Number(repeat[1]) : template.replace(/\([^()]*\)/g, '()').split(/\s+/).filter(Boolean).length;
  } else if (preset?.display === 'flex') {
    count = 2;
  }
  return Math.max(1, Math.min(6, count || 1));
}

/** A preset name (an id) from a label, not one of `used`. */
export function presetName(label, used = []) {
  const base = String(label || 'preset').normalize('NFKD').replace(/[^A-Za-z0-9]+(.)?/g, (match, next) => (next ? next.toUpperCase() : ''))
    .replace(/^[^A-Za-z]+/, '') || 'preset';
  const name = base.charAt(0).toLowerCase() + base.slice(1);
  let result = name;
  for (let number = 2; used.includes(result); number++) result = `${name}${number}`;
  return result;
}

/**
 * The HTML of a preview iframe: the variables' Heurist defaults, the site stylesheet copy, the compiled website
 * styles and the custom CSS around sample content.
 *
 * @param {{base: object, kinds: object, presets: object, css: string}} state
 * @param {string} body
 * @param {string} [baseUrl] Heurist base URL: background images from it.
 * @returns {string}
 */
export function previewDocument(state, body, baseUrl = '') {
  const { css: compiled } = compileCmsStyles(cleanBase(state.base), [], baseUrl, { kinds: [state.kinds], presets: [state.presets] });
  const custom = String(state.css || '').replace(/<\/style/gi, '<\\/style');
  return `<!doctype html><html class="h-site"><head><meta charset="utf-8"><style>${defaultVariables()}${PREVIEW_CSS}`
    + `${compiled}\n${custom}</style></head><body class="h-site-body">${body}</body></html>`;
}

/** A tab with its help line and settings (the preview is the second column of the popup). */
function pane(tabs, label, help) {
  const panel = element('div', 'h-cms-styles-pane');
  const config = element('div', 'h-cms-styles-config');
  panel.append(helpLine(help), config);
  tabs.add($HR(label), panel);
  return { panel, config };
}

function defaultVariables() {
  const style = globalThis.getComputedStyle?.(document.documentElement);
  const values = VARIABLES.map((name) => [name, style?.getPropertyValue?.(name)?.trim()]).filter(([, value]) => value);
  return values.length ? `:root{${values.map(([name, value]) => `${name}:${value}`).join(';')}}\n` : '';
}

function setBase(state, key, value) {
  if (String(value ?? '').trim()) state.base[key] = String(value).trim(); else delete state.base[key];
}

function cleanBase(base) {
  return Object.fromEntries(Object.entries(base || {}).filter(([, value]) => String(value ?? '').trim()).map(([key, value]) => [key, String(value).trim()]));
}

function isColor(key) {
  return key.startsWith('color-') || key === 'site-heading-color';
}

/** A caption and its control; `tag` div for a control of several buttons (a label clicks its first one). */
function field(label, control, className = 'h-cms-styles-field', tag = 'label') {
  const line = element(tag, className);
  const caption = element('span');
  caption.textContent = $HR(label);
  line.append(caption, control);
  return line;
}

/**
 * A preview sample of a style with a text shadow on a background of the opposite colour, so the shadow is seen
 * (2026-11-12): a light shadow on a dark background, a dark shadow on a light one. Other styles: the sample as it is.
 *
 * @param {object} [style] The style (kind default or preset); the text shadow of the normal screen.
 * @param {string} html The sample.
 * @returns {string}
 */
export function shadowBackdrop(style, html) {
  const shadow = String(style?.['text-shadow'] ?? '').trim();
  if (!html || !shadow || shadow === 'none') return html;
  const lightness = colorLightness(shadow);
  if (lightness === null) return html;
  const background = lightness > 0.5 ? '#3a3a3a' : '#e8e8e8';
  return `<div style="background-color:${background};padding:16px">${html}</div>`;
}

/** Lightness 0..1 of the first colour (#rgb, #rrggbb, rgb(), rgba(), white, black) in a CSS value; null: none found. */
function colorLightness(value) {
  let rgb = null;
  const functional = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value);
  const hex = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(value);
  if (functional) {
    rgb = functional.slice(1, 4).map(Number);
  } else if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((char) => char + char) : hex[1].match(/../g);
    rgb = digits.map((pair) => parseInt(pair, 16));
  } else if (/\bwhite\b/i.test(value)) {
    rgb = [255, 255, 255];
  } else if (/\bblack\b/i.test(value)) {
    rgb = [0, 0, 0];
  }
  return rgb ? (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 : null;
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function element(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function option(value, label) {
  const node = element('option');
  node.value = value;
  node.textContent = label;
  return node;
}

function button(label, icon = null) {
  const node = element('button', 'h-btn h-compact');
  node.type = 'button';
  if (icon) {
    const glyph = element('i', `fa-solid ${icon}`);
    glyph.setAttribute('aria-hidden', 'true');
    node.append(glyph);
  }
  if (label) node.append(document.createTextNode(`${icon ? ' ' : ''}${$HR(label)}`));
  return node;
}
