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
import { BASE_SETTINGS, CMS_KINDS, CMS_STYLE_PROPERTIES, compileCmsStyles, SCREENS } from '#shared/site/cmsDocument.js';
import { HInputColor } from '#shared/widgets/form/inputs/HInputColor.js';
import { HInputFile } from '#shared/widgets/form/inputs/HInputFile.js';
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
  'color-selected-border': ['Selected border colour']
});

/** Colour themes of the base settings (in the manner of the jQuery UI ThemeRoller / Bootstrap themes). */
export const CMS_THEMES = Object.freeze([
  { name: 'light', label: 'Default light', values: { 'color-text': '#333333', 'color-bg': '#ffffff', 'color-surface': '#f5f5f5', 'color-primary': '#2a6ebb', 'color-link': '#2a6ebb', 'color-border': '#dddddd', 'site-heading-color': '#222222' , 'color-selected': '#dcecff', 'color-selected-border': '#3983b7' } },
  { name: 'dark', label: 'Default dark', values: { 'color-text': '#e6e6e6', 'color-bg': '#1e1e1e', 'color-surface': '#2b2b2b', 'color-primary': '#4f9be8', 'color-link': '#7db8f0', 'color-border': '#444444', 'site-heading-color': '#ffffff' , 'color-selected': '#2f4a66', 'color-selected-border': '#4f9be8' } },
  { name: 'sepia', label: 'Sepia', values: { 'color-text': '#5b4636', 'color-bg': '#f4ecd8', 'color-surface': '#e9dcc0', 'color-primary': '#8b5a2b', 'color-link': '#8b4513', 'color-border': '#d3c4a5', 'site-heading-color': '#4a3426' , 'color-selected': '#ead9b5', 'color-selected-border': '#8b5a2b' } },
  { name: 'green', label: 'Greenish', values: { 'color-text': '#2f3e33', 'color-bg': '#f4f8f4', 'color-surface': '#e3efe5', 'color-primary': '#2e7d32', 'color-link': '#2e7d32', 'color-border': '#c5dcc8', 'site-heading-color': '#1b5e20' , 'color-selected': '#d4ead6', 'color-selected-border': '#2e7d32' } },
  { name: 'blue', label: 'Blueish', values: { 'color-text': '#253645', 'color-bg': '#f3f7fb', 'color-surface': '#e1ebf5', 'color-primary': '#1565c0', 'color-link': '#1565c0', 'color-border': '#c3d4e6', 'site-heading-color': '#0d47a1' , 'color-selected': '#d3e3f5', 'color-selected-border': '#1565c0' } },
  { name: 'monitor', label: 'Monitor (green on black)', values: { 'color-text': '#33ff33', 'color-bg': '#000000', 'color-surface': '#0a1a0a', 'color-primary': '#00aa00', 'color-link': '#66ff66', 'color-border': '#1f5f1f', 'site-heading-color': '#66ff66', 'font-family': '"Courier New", monospace', 'site-heading-font': '"Courier New", monospace' , 'color-selected': '#0f3a0f', 'color-selected-border': '#33ff33' } },
  { name: 'red', label: 'Red and white', values: { 'color-text': '#000000', 'color-bg': '#ffffff', 'color-surface': '#b0b0b0', 'color-primary': '#c62828', 'color-link': '#c62828', 'color-border': '#8a8a8a', 'site-heading-color': '#b71c1c' , 'color-selected': '#f6d5d5', 'color-selected-border': '#c62828' } }
]);

const KIND_LABELS = Object.freeze({
  group: 'Groups', tabs: 'Tabs', accordion: 'Accordions', text: 'Texts', instance: 'Modules and widgets'
});

const HELP = Object.freeze({
  base: 'Colours, fonts and sizes of the whole website. Choose a theme to fill the colours, then change single values.'
    + ' Empty values use the Heurist defaults.',
  kinds: 'The default style of every element of a kind on the website (all groups, tabs, accordions, texts or modules).'
    + ' The preset and the own style of an element are added to it.',
  presets: 'Named styles defined once and applied to elements (Preset in the properties of an element), for example a'
    + ' card or a highlighted box. The kind default applies first, then the preset, then the own style of the element.',
  css: 'Your own CSS rules for the whole website, for what the settings can not do. Select elements with'
    + ' [data-h-style="name"] (presets), [data-h-control="group"], [data-h-text] or [data-h-instance].'
});

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
  instance: '<div data-h-instance="pv"><div class="pv-module">Module or widget</div></div>'
});

/**
 * The content of the Styles popup.
 *
 * @param {{base?: object, kinds?: object, presets?: object, css?: string, javaScriptAllowed?: boolean,
 *        createCodeEditor?: Function, files?: object}} values createCodeEditor(host, {value, language, onChange}): a
 *        code editor (CodeMirror, lazy); without it a plain text area. `files`: the background image picker (styleRows).
 * @returns {{element: HTMLElement, read: () => object, ready: Promise<void>, destroy: () => void, tabs: object}}
 */
export function createStylesForm({ base = {}, kinds = {}, presets = {}, css = '', javaScriptAllowed = false, createCodeEditor = null, files = null } = {}) {
  const state = { base: { ...base }, kinds: structuredClone(kinds), presets: structuredClone(presets), css: String(css ?? '') };
  // two columns: the tabs, and the preview of the selected tab (half as wide)
  const root = element('div', 'h-cms-styles-layout');
  const previews = [];
  const tabs = createTabSet({ prefix: 'h-cms-styles', onSelect: (index) => previews[index]?.() });
  const previewColumn = element('div', 'h-cms-styles-preview-column');
  const previewCaption = element('div', 'h-cms-caption');
  previewCaption.textContent = $HR('Preview');
  const frame = element('iframe', 'h-cms-styles-preview');
  frame.setAttribute('sandbox', '');
  frame.title = $HR('Preview');
  previewColumn.append(previewCaption, frame);
  root.append(tabs.element, previewColumn);
  const show = (html) => { frame.srcdoc = html; };
  const refresh = () => previews[tabs.selected]?.();

  // ------------------------------------------------------------ base settings
  const basePane = pane(tabs, 'Base settings', HELP.base);
  const theme = element('select', 'h-select h-compact');
  theme.append(option('', $HR('(choose a theme)')), ...CMS_THEMES.map((item) => option(item.name, $HR(item.label))));
  basePane.config.append(field('Theme', theme));
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
  previews.push(() => show(previewDocument(state, SAMPLE_PAGE)));

  // ------------------------------------------------------------ layout styles (kind defaults)
  const kindPane = pane(tabs, 'Layout styles', HELP.kinds);
  kindPane.panel.classList.add('h-cms-styles-kinds');
  const kind = element('select', 'h-select h-compact');
  kind.append(...Object.keys(CMS_KINDS).map((name) => option(name, $HR(KIND_LABELS[name] || name))));
  kindPane.config.append(field('Kind', kind));
  const kindEditor = element('div', 'h-cms-styles-editor');
  kindPane.config.append(kindEditor);
  const drawKind = () => {
    kindEditor.replaceChildren();
    const name = kind.value;
    styleRows(kindEditor, state.kinds[name] || {}, (value) => {
      if (Object.keys(value).length) state.kinds[name] = value; else delete state.kinds[name];
      refresh();
    }, { kind: name, files });
  };
  kind.addEventListener('change', () => {
    drawKind();
    refresh();
  });
  previews.push(() => show(previewDocument(state, KIND_SAMPLES[kind.value] || '')));
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
    const labelInput = element('input', 'h-input h-compact');
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
    }, { kind: 'preset', files });
  };
  previews.push(() => {
    const name = currentPreset && state.presets[currentPreset] ? currentPreset : '';
    const label = escapeHtml(state.presets[name]?.label || name);
    show(previewDocument(state, name
      ? `<div data-h-control="group" data-h-style="${escapeHtml(name)}"><div data-h-text=""><h3>${label}</h3>`
        + '<p>An element with this preset. Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p></div></div>'
      : ''));
  });
  drawPresets();

  // ------------------------------------------------------------ custom CSS
  const cssPane = pane(tabs, 'Custom CSS', HELP.css);
  if (!javaScriptAllowed) {
    const warning = element('div', 'h-cms-styles-warning');
    warning.textContent = $HR('JavaScript and CSS are not allowed in this field and will be removed when saving.');
    cssPane.config.append(warning);
  }
  const cssHost = element('div', 'h-cms-styles-css');
  cssPane.config.append(cssHost);
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
  previews.push(() => show(previewDocument(state, SAMPLE_PAGE)));

  tabs.select(0);
  return {
    element: root,
    tabs,
    ready,
    read: () => ({ base: cleanBase(state.base), kinds: state.kinds, presets: state.presets, css: state.css }),
    destroy: () => codeEditor?.destroy?.()
  };
}

/** Whether the style editor shows all properties (Advanced); kept for the session. */
let advancedMode = false;

const SELECT = (...items) => items.map((item) => (Array.isArray(item) ? item : [item, item]));

/**
 * The properties of the simple style editor (§23-§25), in sections; `group: true` only for groups (and presets),
 * `inGroup: true` only for elements in a flex group (and presets); `toggle`: a section with a checkbox, `on` / `off`
 * the values written when it is checked / unchecked.
 * Selector options are [value, label]; the first option (empty) is the default.
 */
export const SIMPLE_STYLE_FIELDS = Object.freeze([
  { section: 'Group layout', group: true,
    // checked: a flex box; unchecked: display block
    toggle: { on: { display: 'flex' }, off: { display: 'block' } }, fields: [
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
    { property: 'font-weight', label: 'Font weight', options: SELECT(['normal', 'Normal'], ['bold', 'Bold'], ['300', 'Light (300)'], ['600', 'Semi bold (600)']) }
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
 *        files?: {apiClient: object, baseUrl: string, database: string}|null}} [options] `kind`: the kind of the
 *        element (group, tabs, accordion, text, instance; `preset` for presets); groups and presets get the group
 *        layout. `inFlexGroup`: the element is in a flex group; it (and a preset) gets *Size in group* (`flex`).
 *        `presets`: [name, label] of the preset selector (null = none) and `preset` its value. `files`: the image
 *        picker of the background (registered image files); without it the image is a text value.
 * @returns {{value: () => object, preset: () => string|null}}
 */
export function styleRows(parent, style, onChange = null, { kind = null, inFlexGroup = false, presets = null, preset = null, files = null } = {}) {
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
  if (presets) {
    const select = element('select', 'h-select h-compact');
    select.append(option('', $HR('(none)')), ...presets.map(([name, label]) => option(name, label || name)));
    select.value = presetValue || '';
    select.addEventListener('change', () => {
      presetValue = select.value || null;
      check();
    });
    parent.append(field('Preset', select, 'h-cms-style-field h-cms-style-preset'));
  }
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
    problems.textContent = [...invalid.values(), ...issues.map((issue) => issue.message)].join('\n');
    onChange?.(value);
  }
  const setValue = (property, value) => {
    // an empty value removes the property in the simple list; Advanced keeps the row
    if (advancedMode || String(value).trim()) values[screen][property] = value; else delete values[screen][property];
    check();
  };
  // a section with a checkbox: on when it has values (or was checked), off with its `off` values
  const isOn = (section) => {
    const current = values[screen];
    const { on = {}, off = {} } = section.toggle;
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
    const color = new HInputColor().attach(host, { suppressLabel: true, clearButton: false, value: String(value ?? ''), placeholder: $HR('(default)') }).render();
    const changed = () => setValue(property, color.getValue() ?? '');
    host.addEventListener('h-input-change', changed);
    host.addEventListener('input', changed);
  };
  // the background image: the current one (thumbnail, Remove) and the picker of registered image files
  const imageInput = (host, property, value) => {
    if (!files?.apiClient) {
      host.append(textInput(property, value, 'url(...)'));
      return;
    }
    const url = /url\(\s*(['"]?)(.*?)\1\s*\)/i.exec(String(value || ''))?.[2] || '';
    if (url) {
      const current = element('div', 'h-cms-style-image');
      const thumb = element('img');
      thumb.src = url;
      thumb.alt = '';
      const remove = button('', 'fa-xmark');
      remove.title = $HR('Remove the image');
      remove.addEventListener('click', () => {
        setValue(property, '');
        draw();
      });
      current.append(thumb, remove);
      host.append(current);
    }
    const pickerHost = element('div');
    host.append(pickerHost);
    const input = new HInputFile().attach(pickerHost, {
      suppressLabel: true, apiClient: files.apiClient, fileQuery: [{ 'f:29': 'image/*' }]
    }).render();
    pickerHost.addEventListener('h-input-change', () => {
      const key = input.file?.ulf_ObfuscatedFileID;
      if (!key) return;
      setValue(property, `url(${fileMediaUrls(baseUrl, files.database).file(key)})`);
      draw();
    });
  };
  const drawSimple = () => {
    for (const section of sections) {
      const head = element('div', 'h-cms-style-section');
      const on = section.toggle ? isOn(section) : true;
      if (section.toggle) {
        const box = element('input');
        box.type = 'checkbox';
        box.checked = on;
        box.addEventListener('change', () => toggleSection(section, box.checked));
        const label = element('label');
        label.append(box, document.createTextNode(` ${$HR(section.section)}`));
        head.append(label);
      } else {
        head.textContent = $HR(section.section);
      }
      list.append(head);
      if (!on) continue;
      for (const item of section.fields) {
        const value = values[screen][item.property] ?? '';
        const host = element('div', 'h-cms-styles-value');
        if (item.options) {
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
        list.append(field(item.label, host, 'h-cms-style-field'));
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
    advanced.classList.toggle('h-cms-style-advanced-on', advancedMode);
    advanced.setAttribute('aria-pressed', String(advancedMode));
    add.hidden = !advancedMode;
    removeAll.hidden = !advancedMode;
    list.classList.toggle('h-cms-style-simple', !advancedMode);
    list.replaceChildren();
    if (advancedMode) drawAdvanced(); else drawSimple();
    check();
  }
  const clearScreen = () => {
    for (const key of [...invalid.keys()]) if (key.startsWith(`${screen}:`)) invalid.delete(key);
    for (const key of [...opened]) if (key.startsWith(`${screen}:`)) opened.delete(key);
  };
  advanced.addEventListener('click', () => {
    advancedMode = !advancedMode;
    draw();
  });
  add.addEventListener('click', () => {
    const free = CMS_STYLE_PROPERTIES.find((property) => !(property in values[screen]));
    if (free) values[screen][free] = '';
    draw();
  });
  reset.addEventListener('click', async () => {
    if (!(await confirmNear(reset, 'Confirm?', { yes: 'Reset' }))) return;
    if (advancedMode) {
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
  return { value: build, preset: () => presetValue };
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
 * @returns {string}
 */
export function previewDocument(state, body) {
  const { css: compiled } = compileCmsStyles(cleanBase(state.base), [], '', { kinds: [state.kinds], presets: [state.presets] });
  const custom = String(state.css || '').replace(/<\/style/gi, '<\\/style');
  return `<!doctype html><html class="h-site"><head><meta charset="utf-8"><style>${defaultVariables()}${PREVIEW_CSS}`
    + `${compiled}\n${custom}</style></head><body class="h-site-body">${body}</body></html>`;
}

/** A tab with its help line and settings (the preview is the second column of the popup). */
function pane(tabs, label, help) {
  const panel = element('div', 'h-cms-styles-pane');
  const helpLine = element('div', 'h-cms-styles-help');
  const icon = element('i', 'fa-solid fa-circle-question');
  icon.setAttribute('aria-hidden', 'true');
  const text = element('span');
  text.textContent = $HR(help);
  helpLine.append(icon, text);
  const config = element('div', 'h-cms-styles-config');
  panel.append(helpLine, config);
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

function field(label, control, className = 'h-cms-styles-field') {
  const line = element('label', className);
  const caption = element('span');
  caption.textContent = $HR(label);
  line.append(caption, control);
  return line;
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
