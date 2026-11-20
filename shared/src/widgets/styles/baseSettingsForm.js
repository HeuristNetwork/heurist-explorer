/**
 * @file baseSettingsForm.js
 * @brief The Base settings form (theme, colours, fonts and sizes; the `--h-*` variables) and its preview: the first tab
 *        of the CMS Styles popup (plan 27c §6a, §21) and the Base style settings popup of Explorer (2026-11-20).
 *
 * The preview is a sandboxed iframe: the Heurist defaults of the variables, a small copy of the site stylesheet and
 * the compiled base settings around sample content.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-shared
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from '#shared/ui';
import { BASE_SETTINGS, compileCmsStyles } from '#shared/site/cmsDocument.js';
import { HInputColor } from '#shared/widgets/form/inputs/HInputColor.js';
import './baseSettingsForm.css';

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

/** Heurist variables of the site stylesheet (their defaults are read from this page for the previews). */
const VARIABLES = ['--h-font-family', '--h-color-text', '--h-color-text-muted', '--h-color-bg', '--h-color-surface',
  '--h-color-primary', '--h-color-primary-text', '--h-color-link', '--h-color-border', '--h-color-selected',
  '--h-color-selected-border', '--h-radius'];

/** A small copy of the site stylesheet (style.css of the website app) for the previews. */
export const PREVIEW_CSS = `
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

/** Sample content of the Base settings preview. */
export const SAMPLE_PAGE = '<div class="pv-header">Website title <span>Home</span><span>About</span><span>Contact</span></div>'
  + '<div class="pv-box"><h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3><h4>Heading 4</h4>'
  + '<p class="pv-large">Large font text</p><p>Regular font text with <a href="#">a link</a>.</p>'
  + '<p class="pv-small">Small font text</p><p class="pv-tiny">Tiny font text</p><p class="pv-muted">Muted text</p>'
  + '<div class="pv-buttons"><button class="pv-primary" type="button">Primary button</button>'
  + '<button type="button">Standard button</button><button class="pv-icon" type="button" title="Icon button">&#9881;</button></div>'
  + '<div class="pv-buttons"><input type="text" value="Input" aria-label="Input">'
  + '<select aria-label="Selector"><option>Selector</option><option>Second option</option></select></div>'
  + '<div class="pv-list"><div>List item</div><div class="pv-selected">Selected item</div><div>List item</div></div></div>';

/**
 * The Base settings rows: a Theme selector (fills the colours) and one input per base setting.
 *
 * @param {HTMLElement} parent Element the rows are appended to.
 * @param {{base?: object, keys?: string[], onChange?: Function}} [options] `base`: the values, changed in place (an empty
 *        value removes its key); `keys`: the settings shown (default every BASE_SETTINGS key); `onChange()` after every
 *        change.
 * @returns {{base: object, set: (key: string, value: string) => void}}
 */
export function createBaseSettingsPane(parent, { base = {}, keys = BASE_SETTINGS, onChange = null } = {}) {
  const changed = () => onChange?.();
  // Theme and Kind (Layout styles): a selector of normal height close to its caption, a line below (2026-11-12)
  const theme = element('select', 'h-select');
  theme.append(option('', $HR('(choose a theme)')), ...CMS_THEMES.map((item) => option(item.name, $HR(item.label))));
  parent.append(styleField('Theme', theme, 'h-cms-styles-field h-cms-styles-head'));
  const controls = {};
  for (const key of keys) {
    const [label, hint] = BASE_LABELS[key] || [key];
    const host = element('div', 'h-cms-styles-value');
    parent.append(styleField(label, host));
    if (isBaseColor(key)) {
      const color = new HInputColor().attach(host, { suppressLabel: true, clearButton: false, value: base[key] ?? '', placeholder: $HR('Heurist default') }).render();
      const update = () => {
        setBaseValue(base, key, color.getValue());
        changed();
      };
      host.addEventListener('h-input-change', update);
      host.addEventListener('input', update);
      controls[key] = { set: (value) => color.setValue(value) };
    } else {
      const text = element('input', 'h-input h-compact');
      text.type = 'text';
      text.value = base[key] ?? '';
      text.placeholder = $HR(hint || 'Heurist default');
      text.addEventListener('input', () => {
        setBaseValue(base, key, text.value);
        changed();
      });
      host.append(text);
      controls[key] = { set: (value) => { text.value = value; } };
    }
  }
  theme.addEventListener('change', () => {
    const chosen = CMS_THEMES.find((item) => item.name === theme.value);
    if (!chosen) return;
    for (const [key, value] of Object.entries(chosen.values)) {
      if (!keys.includes(key)) continue;
      setBaseValue(base, key, value);
      controls[key]?.set(value);
    }
    changed();
  });
  return {
    base,
    set: (key, value) => {
      setBaseValue(base, key, value);
      controls[key]?.set(value ?? '');
    }
  };
}

/**
 * The preview column of a styles popup: the caption and a sandboxed iframe.
 *
 * @returns {{element: HTMLElement, show: (html: string, columns?: boolean) => void}} `show(html, columns)`: columns (a
 *          grid / flex sample) need a page wider than the narrow screen (640 px).
 */
export function createPreviewColumn() {
  const column = element('div', 'h-cms-styles-preview-column');
  const caption = element('div', 'h-cms-caption');
  caption.textContent = $HR('Preview');
  const frame = element('iframe', 'h-cms-styles-preview');
  // no scripts; the same origin, so registered images that need the login are shown too
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.title = $HR('Preview');
  // the preview page: at least 424 px, 641 px with columns (show); a scroll bar in a narrow column
  const box = element('div', 'h-cms-styles-preview-box');
  box.append(frame);
  column.append(caption, box);
  return {
    element: column,
    show: (html, columns = false) => {
      frame.classList.toggle('h-cms-styles-preview-columns', columns);
      frame.srcdoc = html;
    }
  };
}

/**
 * The HTML of the Base settings preview: the variables' Heurist defaults, the site stylesheet copy and the compiled
 * base settings around sample content.
 *
 * @param {object} base Base settings.
 * @param {string} [body] Sample content.
 * @returns {string}
 */
export function basePreviewHtml(base, body = SAMPLE_PAGE) {
  const { css } = compileCmsStyles(cleanBase(base), []);
  return `<!doctype html><html class="h-site"><head><meta charset="utf-8"><style>${defaultVariables()}${PREVIEW_CSS}`
    + `${css}</style></head><body class="h-site-body">${body}</body></html>`;
}

/** The Heurist defaults of the variables on this page, as a `:root` rule for a preview. */
export function defaultVariables() {
  const style = globalThis.getComputedStyle?.(document.documentElement);
  const values = VARIABLES.map((name) => [name, style?.getPropertyValue?.(name)?.trim()]).filter(([, value]) => value);
  return values.length ? `:root{${values.map(([name, value]) => `${name}:${value}`).join(';')}}\n` : '';
}

/**
 * Set a base setting; an empty value removes it.
 *
 * @param {object} base Changed in place.
 * @param {string} key
 * @param {*} value
 */
export function setBaseValue(base, key, value) {
  if (String(value ?? '').trim()) base[key] = String(value).trim(); else delete base[key];
}

/**
 * The base settings with a value, trimmed.
 *
 * @param {object} base
 * @returns {object}
 */
export function cleanBase(base) {
  return Object.fromEntries(Object.entries(base || {}).filter(([, value]) => String(value ?? '').trim()).map(([key, value]) => [key, String(value).trim()]));
}

/**
 * Whether a base setting is a colour.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isBaseColor(key) {
  return key.startsWith('color-') || key === 'site-heading-color';
}

/**
 * The help line of a tab or popup (question icon and text).
 *
 * @param {string} help
 * @returns {HTMLElement}
 */
export function helpLine(help) {
  const line = element('div', 'h-cms-styles-help');
  const icon = element('i', 'fa-solid fa-circle-question');
  icon.setAttribute('aria-hidden', 'true');
  const text = element('span');
  text.textContent = $HR(help);
  line.append(icon, text);
  return line;
}

/**
 * A caption and its control; `tag` div for a control of several buttons (a label clicks its first one).
 *
 * @param {string} label
 * @param {HTMLElement} control
 * @param {string} [className]
 * @param {string} [tag]
 * @returns {HTMLElement}
 */
export function styleField(label, control, className = 'h-cms-styles-field', tag = 'label') {
  const line = element(tag, className);
  const caption = element('span');
  caption.textContent = $HR(label);
  line.append(caption, control);
  return line;
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
