/**
 * @file cmsDesigner.test.js
 * @brief CMS designer (plan 27c): records as documents, PATCH of the changed fields with rec_Modified,
 *        translations, menu drop places, preview URL, the design hooks of the runtime and a designer session
 *        (open, edit, save, undo) with a fake API.
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
// messages of the designer: no dialogs in the fake DOM
const { HMsg } = await import('#shared/ui');
const messages = [];
HMsg.showMsgFlash = (text) => messages.push(['flash', text]);
HMsg.showMsgErr = (text) => messages.push(['error', text]);
const {
  changedDetails, dropPlace, menuPlace, parseTranslations, previewUrl, recordDocument, subPageIds, translationValues
} = await import('../src/designer/designerData.js');
const { designerHost, designerUrl, designHooks, isFramed } = await import('../src/siteRuntime.js');
const { CmsDesigner } = await import('../src/designer/CmsDesigner.js');
const { readFieldValues, restoreFieldValues } = await import('../src/designer/CmsPreview.js');
const { openAddPageForm, presetName, cssText } = await import('../src/designer/designerDialogs.js');

const CODES = { home: 51, page: 52, name: 1, content: 4, header: 929, footer: 940, configuration: 1187, translations: 1202, version: 980 };
const CONFIG = JSON.stringify({ schema: 'heurist-cms/4', instances: {}, styles: { presets: { card: { label: 'Card', padding: '4px' } } } });

const SITE_RECORD = {
  rec_ID: '10', rec_RecTypeID: '51', rec_Modified: '2026-10-30 10:00:00',
  details: {
    4: ['<section data-h-node="h1" data-h-text=""><p>Home</p></section>'],
    929: ['<div data-h-node="hd" data-h-control="group"><div data-h-node="t" data-h-text=""><p>Site</p></div></div>'],
    940: ['<div data-h-node="ft" data-h-text=""><p>Footer</p></div>'],
    1187: [CONFIG],
    1202: ['fre:{"h1":"<p>Accueil</p>"}']
  }
};

const MENU = [{ id: 11, title: 'About', children: [{ id: 13, title: 'Team', children: [] }] }, { id: 12, title: 'News', children: [] }];

test('a website record as a document; translations; changed fields only', () => {
  const doc = recordDocument(SITE_RECORD, CODES);
  assert.deepEqual(doc.partNames(), ['header', 'content', 'footer']);
  assert.equal(doc.translation('fre', 'h1'), '<p>Accueil</p>');
  const saved = doc.serialize();
  assert.deepEqual(changedDetails(doc.serialize(), saved, CODES), {}, 'nothing changed');
  doc.setText('t', '<p>New</p>');
  doc.setTranslation('ger', 'h1', '<p>Start</p>');
  const details = changedDetails(doc.serialize(), saved, CODES);
  assert.deepEqual(Object.keys(details).sort(), ['1202', '929'], 'header and translations, not content or footer');
  assert.deepEqual(parseTranslations(details[1202]), { fre: { h1: '<p>Accueil</p>' }, ger: { h1: '<p>Start</p>' } });
  assert.deepEqual(translationValues({ fre: { a: 'x' } }), ['fre:{"a":"x"}']);
  assert.deepEqual(parseTranslations(['bad', 'eng:not json', { value: 'FRE:{"a":"b"}' }]), { fre: { a: 'b' } });
  const page = recordDocument({ rec_RecTypeID: '52', details: { 4: ['<p data-h-node="p" data-h-text="">x</p>'] } }, CODES);
  assert.deepEqual(page.partNames(), ['content']);
});

test('a loaded record: legacy file URLs of parts, configuration and translations become ./api/... (plan 34)', () => {
  const config = JSON.stringify({ schema: 'heurist-cms/4', instances: {}, styles: { nodes: { n1: { 'background-image': 'url(http://h/?db=db&file=k2&fullres=1)' } } } });
  const record = { rec_RecTypeID: '52', details: {
    4: ['<p data-h-node="p" data-h-text=""><img src="./?db=db&amp;file=k1&amp;fancybox=1"></p>'],
    1187: [config],
    1202: ['fre:{"p":"<p><video src=\\"http://h/?db=db&amp;file=k3\\"></video></p>"}']
  } };
  const doc = recordDocument(record, CODES, { baseUrl: 'http://h/' });
  const saved = doc.serialize();
  assert.match(saved.parts.content, /<img src="\.\/api\/db\/files\/k1\/web">/);
  assert.match(saved.configuration, /url\(\.\/api\/db\/files\/k2\/asset\)/);
  assert.equal(doc.translation('fre', 'p'), '<p><video src="./api/db/files/k3/asset"></video></p>');
});

test('menu places, sub pages and drop places of the website tree', () => {
  assert.deepEqual(menuPlace(MENU, 13).parent, 11);
  assert.equal(menuPlace(MENU, 12).index, 1);
  assert.deepEqual(subPageIds(menuPlace(MENU, 11).page), [13]);
  assert.deepEqual(dropPlace(MENU, 12, 11, 'before'), { parent: 0, index: 0 });
  assert.deepEqual(dropPlace(MENU, 11, 12, 'after'), { parent: 0, index: 1 }, 'the index without the moved page');
  assert.deepEqual(dropPlace(MENU, 12, 11, 'inside'), { parent: 11, index: null });
  assert.deepEqual(dropPlace(MENU, 13, 0, 'inside'), { parent: 0, index: null }, 'Home = the top menu');
  assert.equal(dropPlace(MENU, 11, 13, 'inside'), null, 'not under its own sub page');
  assert.equal(dropPlace(MENU, 11, 11, 'after'), null);
});

test('preview URL and the design page outside the designer', () => {
  assert.equal(previewUrl('http://h/db/site/10', 0, null), 'http://h/db/site/10?design=1');
  assert.equal(previewUrl('http://h/db/site/10/', 12, 'fre'), 'http://h/db/site/10/12?design=1&lang=fre');
  assert.equal(designerUrl({ database: 'db', baseUrl: 'http://h/', site: 10, page: 12 }),
    'http://h/hclient/modules/explorer/explorerViewer.html?db=db&mode=cms&site=10&page=12');
  assert.equal(designerUrl({ database: 'db', baseUrl: 'http://h/', site: 0, page: 20 }),
    'http://h/hclient/modules/explorer/explorerViewer.html?db=db&mode=cms&site=20');
  const designer = { previewReady() {} };
  const frame = { parent: { hCmsDesigner: designer } };
  assert.equal(designerHost(frame), designer);
  const top = {};
  top.parent = top;
  assert.equal(designerHost(top), null, 'not in an iframe');
  assert.equal(designerHost({ get parent() { throw new Error('cross origin'); } }), null);
  // in an iframe of another origin there is no designer, but the page must not leave the iframe
  assert.equal(isFramed(frame), true);
  assert.equal(isFramed(top), false);
});

test('design hooks mount an instance into a host and remember it', async () => {
  const mounted = new Map();
  const hooks = designHooks({ config: { instances: {} }, mounted, loaders: {} });
  const host = document.createElement('div');
  await hooks.mountInstance(host, 'i1', { instances: { i1: { kind: 'widget', type: 'unknown' } } });
  assert.ok(mounted.has('i1'));
  assert.ok(host.textContent.length > 0, 'a message in the host');
});

test('preview: the values of the server stay in Record fields over the draft; an unknown reference keeps its snapshot', () => {
  const field = (reference, innerHTML) => ({ getAttribute: () => reference, innerHTML });
  const values = readFieldValues({ querySelectorAll: () => [field('204979.2-1', 'Nom')] });
  assert.deepEqual([...values], [['204979.2-1', 'Nom']]);
  const known = field('204979.2-1', 'Name');
  assert.equal(restoreFieldValues({ querySelectorAll: () => [known] }, values), false);
  assert.equal(known.innerHTML, 'Nom', 'the draft has only the snapshot of one language');
  const added = field('page.2-1', 'Title');
  assert.equal(restoreFieldValues({ querySelectorAll: () => [known, added] }, values), true);
  assert.equal(added.innerHTML, 'Title');
});

test('preset names and CSS text of the style forms', () => {
  assert.equal(presetName('Two columns', []), 'twoColumns');
  assert.equal(presetName('Card', ['card']), 'card2');
  assert.equal(presetName('', []), 'preset');
  assert.equal(cssText({ label: 'X', padding: '4px', narrow: { display: 'none' } }), 'padding: 4px; narrow: {display: none}');
});

test('Add element: Generated report in the Content group, after Record cards (plan 27n §5)', async () => {
  const { ELEMENT_GROUPS } = await import('../src/designer/designerCatalog.js');
  const values = ELEMENT_GROUPS[0].items.map((item) => item.value);
  assert.equal(values.indexOf('report'), values.indexOf('cards') + 1);
  assert.equal(ELEMENT_GROUPS[0].items.find((item) => item.value === 'report').label, 'Generated report');
});

test('catalogs of Add page and Add element: the available elements are the ones of the document', async () => {
  const { ELEMENT_GROUPS, PAGE_TEMPLATES, previewSvg } = await import('../src/designer/designerCatalog.js');
  const { CMS_ELEMENTS, cmsPageStarter } = await import('#shared/site/cmsEdit.js');
  const elements = ELEMENT_GROUPS.flatMap((group) => group.items);
  // plan 27n §5: five groups; the Filter widget among the modules (plan 27l §3)
  assert.deepEqual(ELEMENT_GROUPS.map((group) => group.label),
    ['Content', 'Layout', 'Action and navigation', 'Modules', 'Helpers and sets']);
  assert.deepEqual(ELEMENT_GROUPS.map((group) => group.items.map((item) => item.value)), [
    ['text', 'media', 'gallery', 'field', 'cards', 'report'],
    ['group', 'columns2', 'columns3', 'accordion', 'tabs'],
    ['actionmenu', 'menu'],
    ['explorer', 'data', 'map', 'timeline', 'graph', 'recordview', 'filter', 'crosstabs', 'storymap'],
    ['breadcrumbs', 'language', 'badges', 'social', 'email', 'headerSet', 'siteFooter']]);
  assert.deepEqual(elements.filter((item) => item.available).map((item) => item.value).sort(), [...CMS_ELEMENTS].sort());
  assert.equal(new Set(elements.map((item) => item.value)).size, elements.length, 'unique values');
  const templates = PAGE_TEMPLATES[0].items;
  assert.deepEqual(templates.map((item) => item.value),
    ['blank', 'cover', 'landing', 'about', 'features', 'team', 'discover', 'blog', 'contact', 'record', 'publications']);
  assert.equal(templates[0].defaultTitle, '', 'Blank has no default title');
  assert.ok(templates.every((item) => item.available), 'every template can be added (a blank page for now)');
  assert.deepEqual(templates.filter((item) => !item.pending).map((item) => item.value), ['blank', 'cover', 'landing', 'about', 'features', 'team', 'discover', 'contact', 'record', 'publications']);
  for (const item of [...elements, ...templates]) {
    assert.ok(item.description && item.preview.length, `${item.value}: description and preview`);
    assert.ok(previewSvg(item.preview));
  }
  const blank = cmsPageStarter('blank', 'News');
  // the name of the page (a Record field) and one text element without the name (review 27n §22)
  assert.equal(blank.content.match(/data-h-text/g).length, 2);
  assert.match(blank.content, /data-h-field="page\.2-1"[^>]*>News</);
  assert.match(blank.content, />(<p>Text<\/p>)</);
  assert.doesNotMatch(blank.content, /<h1>/);
});

test('Styles popup: four tabs, themes, kind defaults, presets, custom CSS with the warning, previews', async () => {
  const { createStylesForm, previewDocument, sampleColumns, CMS_THEMES } = await import('../src/designer/designerStyles.js');
  const form = createStylesForm({
    base: { radius: '6px' }, kinds: { text: { padding: '4px' } }, presets: { card: { label: 'Card', padding: '8px' } }, css: '.x{color:red}'
  });
  await form.ready;
  assert.deepEqual(form.tabs.tabs.map((tab) => tab.textContent), ['Base settings', 'Layout styles', 'Presets', 'Custom CSS', 'Navigation and layout']);
  for (const panel of form.tabs.panels) {
    assert.ok(panel.querySelector('.h-cms-styles-help') && panel.querySelector('.h-cms-styles-config'), 'help and settings in every tab');
  }
  assert.equal(form.element.querySelectorAll('iframe').length, 1, 'one preview beside the tabs');
  // Add preset: "New preset (n)", above the list
  const add = form.tabs.panels[2].querySelector('.h-cms-styles-preset-side').querySelector('button');
  add.click();
  add.click();
  assert.deepEqual(Object.values(form.read().presets).map((preset) => preset.label), ['Card', 'New preset (1)', 'New preset (2)']);
  assert.equal(form.tabs.panels[2].querySelectorAll('.h-cms-styles-preset').length, 3);
  // a theme fills the colours
  const theme = form.element.querySelector('select');
  theme.value = 'dark';
  theme.fire('change');
  const values = form.read();
  assert.equal(values.base['color-bg'], CMS_THEMES.find((item) => item.name === 'dark').values['color-bg']);
  assert.equal(values.base.radius, '6px', 'other settings kept');
  assert.deepEqual(values.kinds, { text: { padding: '4px' } });
  assert.equal(values.presets.card.label, 'Card');
  assert.equal(values.css, '.x{color:red}');
  // Navigation and layout (plan 27f): default values are not written; Pages kept only for swap
  assert.deepEqual(values.layout, {});
  const [navigation, pageWidth, backToTop, searchEngines, headerPosition] = form.tabs.panels[4].querySelectorAll('select');
  // Search engines (plan 27m §5): false when not allowed, not written when allowed
  searchEngines.value = 'no';
  searchEngines.fire('change');
  assert.equal(form.read().layout.searchEngines, false);
  searchEngines.value = '';
  searchEngines.fire('change');
  assert.equal(form.read().layout.searchEngines, undefined);
  // the Back to top button (plan 27k §6): true when shown, not written when off
  backToTop.value = 'show';
  backToTop.fire('change');
  assert.equal(form.read().layout.backToTop, true);
  backToTop.value = '';
  backToTop.fire('change');
  assert.equal(form.read().layout.backToTop, undefined);
  // Maximum width of page (review 2026-11-15): the base setting site-width
  pageWidth.value = '1280px';
  pageWidth.fire('change');
  assert.equal(form.read().base['site-width'], '1280px');
  pageWidth.value = '';
  pageWidth.fire('change');
  assert.equal(form.read().base['site-width'], undefined);
  const cache = form.tabs.panels[4].querySelector('input');
  assert.equal(cache.parentElement.hidden, true);
  navigation.value = 'swap';
  navigation.fire('change');
  assert.equal(cache.parentElement.hidden, false);
  cache.value = '3';
  cache.fire('input');
  headerPosition.value = 'scroll';
  headerPosition.fire('change');
  assert.deepEqual(form.read().layout, { navigation: 'swap', cache: 3, header: { position: 'scroll' } });
  headerPosition.value = 'fixed';
  headerPosition.fire('change');
  assert.deepEqual(form.read().layout, { navigation: 'swap', cache: 3 });
  assert.match(form.tabs.panels[3].textContent, /CSS and Javascript are disabled by default/, 'warning without JavaScript allowed');
  assert.equal(form.tabs.panels[3].querySelector('textarea'), null, 'no CSS editor without JavaScript allowed');
  assert.equal(form.read().css, '.x{color:red}', 'the CSS is not changed');
  // Layout styles and Presets start in Advanced
  assert.ok(form.tabs.panels[1].querySelector('.h-cms-style-advanced-on'), 'Layout styles: Advanced');
  assert.ok(form.tabs.panels[2].querySelector('.h-cms-style-advanced-on'), 'Presets: Advanced');
  form.destroy();
  const allowed = createStylesForm({ javaScriptAllowed: true });
  assert.doesNotMatch(allowed.tabs.panels[3].textContent, /disabled by default/);
  assert.ok(allowed.tabs.panels[3].querySelector('textarea'), 'a text area without a code editor');
  // the preview of a preset: a text per column
  assert.equal(sampleColumns({ display: 'grid', 'grid-template-columns': '1fr 1fr' }), 2);
  assert.equal(sampleColumns({ display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)' }), 3);
  assert.equal(sampleColumns({ 'grid-template-columns': 'minmax(100px, 1fr) 2fr 1fr' }), 3);
  assert.equal(sampleColumns({ display: 'flex' }), 2);
  assert.equal(sampleColumns({ padding: '8px' }), 1);
  // the preview has the compiled styles of the website and the custom CSS, safely inside its style element
  const html = previewDocument({ base: { 'color-bg': '#000000' }, kinds: {}, presets: { card: { padding: '8px' } }, css: 'a{}</style><script>' }, '<p>x</p>');
  assert.match(html, /html\.h-site\{--h-color-bg:#000000;\}/);
  assert.match(html, /\[data-h-style="card"\]\{padding:8px;\}/);
  assert.doesNotMatch(html, /<\/style><script>/);
});

test('Style editor: simple and advanced lists, group flex box, Reset all, Remove all, numeric check', async () => {
  const { styleRows, checkStyleValue } = await import('../src/designer/designerStyles.js');
  assert.deepEqual(checkStyleValue('width', '12'), { value: '12px', error: null }, 'px added to a plain number');
  // plan 27n §1: a font size from the Heurist variables
  assert.deepEqual(checkStyleValue('font-size', 'var(--h-font-size-large)'), { value: 'var(--h-font-size-large)', error: null });
  assert.ok(checkStyleValue('font-size', 'var(--other)').error, 'only Heurist variables');
  assert.deepEqual(checkStyleValue('margin', '0 auto -5em 50%'), { value: '0 auto -5em 50%', error: null });
  assert.ok(checkStyleValue('padding', '-5px').error, 'no negative padding');
  assert.ok(checkStyleValue('font-size', '12x').error);
  assert.ok(checkStyleValue('padding', '1px 2px 3px 4px 5px').error, 'at most 4 values');
  assert.equal(checkStyleValue('color', 'red').error, null, 'not a length: not checked');
  let last = null;
  const host = document.createElement('div');
  document.body.append(host);
  const editor = styleRows(host, { padding: '4px', 'box-shadow': '0 0 2px #000' }, (value) => { last = value; },
    { kind: 'group', presets: [['card', 'Card']], preset: 'card' });
  assert.equal(host.querySelector('.h-cms-style-preset').querySelector('select').value, 'card', 'the preset above the list');
  const rows = () => host.querySelector('.h-cms-style-rows');
  const tools = host.querySelector('.h-cms-style-tools').querySelectorAll('button');
  assert.deepEqual(tools.map((item) => item.textContent.trim()), ['Advanced', 'Add property', 'Reset all', 'Remove all']);
  assert.ok(tools[1].hidden && tools[3].hidden, 'Add property and Remove all only in Advanced');
  const sections = () => host.querySelectorAll('.h-cms-style-section').map((item) => item.textContent.trim());
  assert.deepEqual(sections(), ['Grid (columns)', 'Group layout (flex)', 'Size and spacing', 'Text', 'Background', 'Border'], 'grid and group layout on top');
  assert.match(host.querySelector('.h-cms-style-note').textContent, /box-shadow/, 'other properties named');
  // the checkbox of Group layout: checked = a flex box with its properties, unchecked = display block
  const groupBox = () => host.querySelectorAll('.h-cms-style-section')[1].querySelector('input');
  assert.equal(groupBox().checked, false);
  groupBox().checked = true;
  groupBox().fire('change');
  assert.equal(last.display, 'flex');
  const direction = rows().querySelector('select');
  direction.value = 'column';
  direction.fire('change');
  assert.deepEqual(last, { padding: '4px', 'box-shadow': '0 0 2px #000', display: 'flex', 'flex-direction': 'column' });
  groupBox().checked = false;
  groupBox().fire('change');
  assert.deepEqual(editor.value(), { padding: '4px', 'box-shadow': '0 0 2px #000', display: 'block' }, 'unchecked: display block');
  // Border: checked starts a solid 1px border, unchecked writes border: none
  const borderBox = () => host.querySelectorAll('.h-cms-style-section').at(-1).querySelector('input');
  borderBox().checked = true;
  borderBox().fire('change');
  assert.equal(editor.value()['border-style'], 'solid');
  borderBox().checked = false;
  borderBox().fire('change');
  assert.equal(editor.value().border, 'none');
  assert.equal(editor.value()['border-style'], undefined);
  // a numeric value is checked when the input is left
  const width = rows().querySelectorAll('input').filter((input) => input.type === 'text')[1]; // height, width
  width.value = 'wide';
  width.fire('input');
  width.fire('change');
  assert.ok(width.classList.contains('h-cms-style-invalid'));
  assert.equal(editor.value().width, undefined, 'a wrong value is not in the style');
  width.value = '50';
  width.fire('change');
  assert.equal(editor.value().width, '50px');
  // Reset all and Remove all are confirmed next to the button
  const confirmed = async (button) => {
    button.click();
    const box = document.body.querySelector('.h-cms-popconfirm');
    assert.ok(box, 'a confirmation');
    box.querySelector('.h-btn-danger').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  tools[0].click();
  assert.ok(!tools[1].hidden && !tools[3].hidden, 'Advanced shows Add property and Remove all');
  const count = host.querySelectorAll('.h-cms-style-row').length;
  await confirmed(tools[2]);
  assert.deepEqual(editor.value(), {}, 'Reset all clears the values');
  assert.equal(host.querySelectorAll('.h-cms-style-row').length, count, 'the rows stay');
  await confirmed(tools[3]);
  assert.equal(host.querySelectorAll('.h-cms-style-row').length, 0, 'Remove all removes the rows');
  tools[0].click();
  assert.equal(editor.preset(), 'card');
  host.remove();
  const text = document.createElement('div');
  styleRows(text, {}, null, { kind: 'text' });
  const textSections = text.querySelectorAll('.h-cms-style-section').map((item) => item.textContent.trim());
  assert.ok(!textSections.includes('Group layout (flex)') && !textSections.includes('Grid (columns)'));
  // Size in group (flex): only for an element in a flex group, and in presets
  assert.ok(!textSections.includes('In the group'));
  assert.equal(text.querySelector('.h-cms-style-preset'), null, 'no preset selector without presets');
  const child = document.createElement('div');
  styleRows(child, {}, null, { kind: 'text', inFlexGroup: true });
  assert.deepEqual(child.querySelectorAll('.h-cms-style-section').map((item) => item.textContent.trim()),
    ['In the group', 'Size and spacing', 'Text', 'Background', 'Border']);
  // the simple form of the element panel (review 27n §21): no Group layout, Grid with Columns and Gap, Normal screen only,
  // the Advanced button always (plan 27n1 §7); setSimple(false) as before
  const group = document.createElement('div');
  const simple = styleRows(group, {}, null, { kind: 'group', simple: true, advanced: false });
  const sectionsOf = () => group.querySelectorAll('.h-cms-style-section').map((item) => item.textContent.trim());
  assert.ok(!sectionsOf().includes('Group layout (flex)') && sectionsOf().includes('Grid (columns)'));
  assert.equal(group.querySelector('.h-cms-style-advanced').hidden, false, 'Advanced styles always');
  assert.equal(group.querySelector('.h-cms-style-tabs').hidden, true, 'no screen selector');
  simple.setSimple(false);
  assert.ok(sectionsOf().includes('Group layout (flex)'));
  assert.equal(group.querySelector('.h-cms-style-advanced').hidden, false);
  for (const value of ['1', '2', 'auto', 'none', '1 200px', '1 0 200px', '2 1']) assert.equal(checkStyleValue('flex', value).error, null, value);
  for (const value of ['x', '1 1 1', '-1', '1 2 3 4']) assert.ok(checkStyleValue('flex', value).error, value);
});

test('Style editor: Grid (columns) section, excluding the flex layout; inherited on the narrow tab; column widths check', async () => {
  const { styleRows, checkStyleValue } = await import('../src/designer/designerStyles.js');
  for (const value of ['1fr 2fr', '200px 1fr', 'repeat(3, 1fr)', 'repeat(2, minmax(0, 1fr))', 'minmax(100px, 1fr) auto', 'repeat(auto-fill, minmax(200px, 1fr))']) {
    assert.equal(checkStyleValue('grid-template-columns', value).error, null, value);
  }
  for (const value of ['1fr x', '12', 'repeat(0, 1fr)', 'minmax(1fr)', 'repeat(2, 1fr']) {
    assert.ok(checkStyleValue('grid-template-columns', value).error, value);
  }
  const host = document.createElement('div');
  document.body.append(host);
  const editor = styleRows(host, { display: 'flex', 'flex-direction': 'row' }, null, { kind: 'group', advanced: false });
  const box = (index) => host.querySelectorAll('.h-cms-style-section')[index].querySelector('input');
  assert.equal(box(0).checked, false, 'grid off');
  assert.equal(box(1).checked, true, 'flex on');
  box(0).checked = true;
  box(0).fire('change');
  assert.deepEqual(editor.value(), { display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', gap: '12px' }, 'grid replaces flex');
  assert.equal(box(1).checked, false);
  const columns = host.querySelector('.h-cms-style-columns').querySelector('select');
  assert.equal(columns.value, 'repeat(2, minmax(0, 1fr))');
  columns.value = 'repeat(3, minmax(0, 1fr))';
  columns.fire('change');
  assert.equal(editor.value()['grid-template-columns'], 'repeat(3, minmax(0, 1fr))');
  // the narrow tab: grid inherited (checkbox disabled), Columns 1 there
  const screen = host.querySelector('.h-cms-style-screen');
  screen.value = 'narrow';
  screen.fire('change');
  assert.equal(box(0).checked, true);
  assert.equal(box(0).disabled, true, 'set on the Normal tab');
  const narrow = host.querySelector('.h-cms-style-columns').querySelector('select');
  narrow.value = 'repeat(1, minmax(0, 1fr))';
  narrow.fire('change');
  assert.deepEqual(editor.value().narrow, { 'grid-template-columns': 'repeat(1, minmax(0, 1fr))' });
  host.remove();
});

test('Background image: HInputFile with the file of the key (GET /files/{key}); preview keeps Heurist images', async () => {
  const { styleRows, previewDocument } = await import('../src/designer/designerStyles.js');
  const asked = [];
  const apiClient = {
    get: async (path) => {
      asked.push(path);
      return { records: [{ rec_ID: '21', rec_Title: 'banner.jpg', rec_Hash: 'abc123' }] };
    },
    buildUrl: (path) => `http://h/api/db${path}`
  };
  const host = document.createElement('div');
  document.body.append(host);
  const style = { 'background-image': 'url(http://h/?db=db&file=abc123)' };
  styleRows(host, style, null, { kind: 'preset', advanced: false, files: { apiClient, baseUrl: 'http://h/', database: 'db' } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(asked, ['/files/abc123'], 'the file of the key');
  assert.equal(host.querySelector('.h-cms-style-image'), null, 'no own thumbnail');
  const thumb = host.querySelector('.h-input-file-thumb');
  assert.ok(thumb && !thumb.hidden, 'the HInputFile thumbnail');
  host.remove();
  const html = previewDocument({ base: {}, kinds: {}, presets: { banner: style }, css: '' }, '', 'http://h/');
  // a legacy URL of the Heurist base URL: the file endpoint in the preview (plan 34)
  assert.match(html, /background-image:url\(http:\/\/h\/api\/db\/files\/abc123\/web\)/, 'the image of the Heurist base URL in the preview');
});

test('Own style: custom CSS class beside the preset (checked), named base colours of the colour inputs', async () => {
  const { styleRows, checkCssClass, basePalette } = await import('../src/designer/designerStyles.js');
  assert.equal(checkCssClass('my-box second_one 2'), null);
  assert.ok(checkCssClass('box.red'), 'a dot is not allowed');
  assert.ok(checkCssClass('a{b}'));
  const host = document.createElement('div');
  document.body.append(host);
  const editor = styleRows(host, { color: 'var(--h-color-primary)' }, null,
    { kind: 'text', presets: [['card', 'Card']], cssClass: 'my-box', base: { 'color-primary': '#123456' } });
  const hidden = document.createElement('div');
  styleRows(hidden, {}, null, { kind: 'text', presets: [['card', 'Card']], cssClass: 'x', classInput: false });
  assert.equal(hidden.querySelector('.h-cms-style-preset').querySelectorAll('input').length, 0, 'no class input without JavaScript allowed');
  const classInput = host.querySelector('.h-cms-style-preset').querySelectorAll('input')[0];
  assert.equal(classInput.value, 'my-box', 'the class beside the preset');
  classInput.value = ' one  two ';
  classInput.fire('input');
  assert.equal(editor.cssClass(), 'one two');
  classInput.value = 'one;two';
  classInput.fire('input');
  assert.equal(editor.cssClass(), null, 'not allowed characters: no value');
  assert.ok(classInput.classList.contains('h-cms-style-invalid'));
  // a colour input with var(--h-color-primary): the swatch shows the base colour
  const swatch = host.querySelector('.h-input-color-swatch');
  assert.equal(swatch.value, '#123456');
  assert.ok(host.querySelector('.h-input-color-palette'), 'the dropdown of named colours');
  host.remove();
  const palette = basePalette({ 'color-text': '#111111' });
  assert.ok(palette.some((entry) => entry.value === 'var(--h-color-primary-text)'));
  assert.equal(palette.find((entry) => entry.value === 'var(--h-site-heading-color)').color, '#111111', 'heading colour falls back to the text colour');
});

/** A designer on a fake API: requests are recorded. */
function designerOf({ canEdit = true, loadEditor = undefined } = {}) {
  const requests = [];
  const record = structuredClone(SITE_RECORD);
  const apiClient = {
    async request(path, options = {}) {
      requests.push([options.method || 'GET', path, options.query || null, options.body]);
      if (options.method === 'PATCH') {
        record.rec_Modified = '2026-10-30 11:00:00';
        for (const [field, values] of Object.entries(options.body.details)) record.details[field] = values;
        // ?fields= of the header: the answer has no details (plan 32)
        if (options.query?.fields) {
          const { rec_ID, rec_RecTypeID, rec_Title, rec_Modified } = record;
          return { records: [{ rec_ID, rec_RecTypeID, rec_Title, rec_Modified, details: [] }], meta: { changed: {} } };
        }
        return { records: [structuredClone(record)] };
      }
      return { records: [structuredClone(record)], meta: { canEdit } };
    }
  };
  const websites = {
    codes: async () => CODES,
    summary: async () => ({ id: 10, kind: 'website', v4: true, title: 'Site', url: 'http://h/db/site/10', languages: ['eng', 'fre'], canEdit, pages: MENU })
  };
  const container = document.createElement('div');
  document.body.append(container);
  const designer = new CmsDesigner({
    container, apiClient, websites, bridge: { editRecord: async () => ({ saved: true }) }, runtime: { baseUrl: 'http://h/', database: 'db' },
    loadEditor
  });
  return { designer, requests, container };
}

test('designer: open the home, edit, save only the changed field with rec_Modified, undo / redo', async () => {
  const { designer, requests } = designerOf();
  assert.equal(await designer.open(10), true);
  assert.deepEqual(designer.current, { recordId: 10, part: 'content' });
  assert.equal(designer.isDirty(), false);
  assert.deepEqual(designer.siteTree.ids(), ['part:header', 'part:content', 'page:11', 'page:13', 'page:12', 'part:footer']);
  assert.deepEqual(designer.partTree.ids(), ['#root', 'h1']);

  designer._edit((doc) => Boolean(doc.insertElement('content', 'columns2', { id: null, position: 'inside' })));
  assert.equal(designer.isDirty(), true);
  assert.equal(designer.partTree.ids().length, 5, 'root, h1, the group and its two texts');
  designer.undo();
  assert.equal(designer.isDirty(), false);
  designer.redo();
  assert.equal(designer.isDirty(), true);

  assert.equal(await designer.save(), true);
  const patch = requests.find(([method]) => method === 'PATCH');
  assert.equal(patch[1], '/website/10');
  assert.equal(patch[3].rec_Modified, '2026-10-30 10:00:00');
  assert.deepEqual(Object.keys(patch[3].details), ['4', '1187'], 'only the home content and configuration (styles of the columns)');
  assert.equal(designer.isDirty(), false);
  assert.equal(designer.records.get(10).modified, '2026-10-30 11:00:00', 'rec_Modified of the record for the next save');

  // the header is the same record: its save sends the new rec_Modified (no false conflict)
  await designer.selectPart(10, 'header');
  designer._edit((doc) => doc.setText('t', '<p>Changed</p>'));
  await designer.save();
  const second = requests.filter(([method]) => method === 'PATCH')[1];
  assert.equal(second[3].rec_Modified, '2026-10-30 11:00:00');
  assert.deepEqual(Object.keys(second[3].details), ['929']);
  assert.equal(second[2].fields, 'rec_ID,rec_RecTypeID,rec_Title,rec_Modified', 'the answer of the PATCH is the header only (plan 32)');

  // Discard after a save goes back to the saved state, not to the state of the load
  const saved = JSON.stringify(designer.records.get(10).doc.serialize());
  designer.discard();
  assert.equal(JSON.stringify(designer.records.get(10).doc.serialize()), saved, 'the sent fields are the saved state');
  designer.destroy();
});

test('designer: west pane with the tabs Site | Page, the preview alone in the center', async () => {
  const { designer, container } = designerOf();
  await designer.open(10);
  assert.equal(container.querySelector('.h-cms-bar'), null, 'no header bar');
  const tabs = [...container.querySelectorAll('.h-cms-tab')];
  assert.deepEqual(tabs.map((tab) => tab.textContent.replace('●', '').trim()), ['Site', 'Page']);
  assert.equal(designer._siteTabActive(), true, 'the Site tab first');
  assert.equal(designer._propertiesRecord(), 10, 'Properties = the website on the Site tab');
  const home = [...container.querySelectorAll('.h-tree-row')].find((row) => row.dataset.id === 'part:content');
  const tool = home.querySelector('.h-tree-tool');
  assert.equal(tool.dataset.action, 'add');
  assert.ok(tool.classList.contains('h-tree-tool-always'), 'Add page always on Home');
  assert.equal(tool.textContent.trim(), 'Add page', 'with a caption');
  assert.deepEqual(designer._siteTools({ id: 'page:11' }).map((item) => [item.action, item.icon]),
    [['edit', 'fa-pen'], ['add', 'fa-plus'], ['remove', 'fa-xmark']], 'one tool to remove a page from the website');
  // plan 27n §2.4: no help panel below the trees; Help of the toolbar opens the manual
  assert.equal(container.querySelector('.h-cms-help'), null);
  // second row: language and page width as selects
  assert.equal(container.querySelector('.h-cms-view-bar').querySelectorAll('select').length, 2);
  assert.equal(container.querySelector('.h-cms-toolbar').querySelectorAll('select').length, 0, 'no language selector in the toolbar');

  await designer._selectSiteItem('page:12');
  assert.equal(designer._siteTabActive(), false, 'a page opens on the Page tab');
  assert.equal(designer._propertiesRecord(), 12, 'Properties = the open page');
  assert.ok(designer.buttons.save.classList.contains('h-btn-primary'), 'Save is the primary button');
  const topBar = container.querySelector('.h-cms-pane-bar-top');
  const bottomBar = designer.pageBar;
  // above the tree: Copy, Paste, Layout ... Save Page; below it: the panel (gear), Undo, Redo, Discard ... Save Page (2026-11-14)
  const { style, undo, redo, discard, copy, paste, layout, save, saveTop } = designer.buttons;
  assert.ok(topBar.classList.contains('h-cms-pane-bar-top'));
  assert.deepEqual([...topBar.querySelectorAll('button')], [copy, paste, layout, saveTop]);
  assert.deepEqual([...bottomBar.querySelectorAll('button')], [style, undo, redo, discard, save]);
  assert.equal(save.textContent.trim(), 'Save Page');
  assert.equal(saveTop.textContent.trim(), 'Save Page');
  assert.equal(saveTop.disabled, true, 'nothing to save yet');
  assert.equal(layout.hidden, true, 'Layout for the header and footer only');
  assert.equal(designer._discardQuestion(), 'Discard the changes of page "News"?');
  await designer.selectPart(10, 'header');
  assert.equal(designer._discardQuestion(), 'Discard the changes of Header?');
  assert.equal(designer.buttons.layout.hidden, false);
  assert.equal(designer.buttons.style.disabled, false, 'the header has an own style (review 2026-11-16)');
  designer.destroy();
});

test('designer: tools of the part tree, + of tabs, captions, copy below the tree', async () => {
  const { designer } = designerOf();
  await designer.open(10);
  const root = designer._nodeTools({ id: '#root' });
  // the page is the root group (plan 27i §9 B): Add element, its panel (plan 27n §4)
  assert.deepEqual(root.map((item) => [item.action, item.label, item.always]),
    [['add', 'Add element', true], ['panel', undefined, undefined]]);
  let tabs = null;
  designer._edit((doc) => { tabs = doc.insertElement('content', 'tabs', { id: null, position: 'inside' }); return true; });
  const actions = (id) => designer._nodeTools({ id }).map((item) => item.action);
  const panel = designer._treeItem(tabs).children[0];
  // plan 27n §4: + of groups, tabs and accordions, the gear (panel) and remove on every element
  assert.deepEqual(actions(tabs), ['add', 'panel', 'delete']);
  assert.deepEqual(actions(panel.id), ['add', 'panel', 'delete']);
  const doc = designer._currentRecord().doc;
  assert.deepEqual(doc.panels(tabs), designer._treeItem(tabs).children.map((item) => item.id));
  assert.equal(doc.panelControl(panel.id), tabs);
  assert.equal(doc.panelControl(tabs), null);
  assert.deepEqual(actions(panel.children[0].id), ['edit', 'panel', 'delete'], 'a text: pen, gear and remove');
  let group = null;
  designer._edit((doc) => { group = doc.insertElement('content', 'group', { id: null, position: 'inside' }); return true; });
  if (group) assert.deepEqual(actions(group), ['add', 'panel', 'delete']);
  await designer._addElement(tabs);
  assert.equal(designer._treeItem(tabs).children.length, 3, '+ of tabs adds a panel at once');
  // a click on a caption in the preview selects its panel
  designer._selectNode(panel.caption, { fromPreview: true });
  assert.equal(designer.selectedNode, panel.id);
  // Copy and Paste in the bar below the tree
  assert.equal(designer.buttons.copy.disabled, false, 'copy of the selected panel');
  designer._copy('all');
  assert.equal(designer.clipboard.sourceId, panel.id);
  assert.equal(designer.buttons.paste.disabled, false);
  designer._selectNode(null);
  assert.equal(designer.buttons.copy.disabled, true, 'nothing selected: no copy');
  designer.destroy();
});

test('designer: a media element has the gear of its panel; its file is read by its key (GET /files/{key})', async () => {
  const { designer } = designerOf();
  await designer.open(10);
  let media = null;
  designer._edit((doc) => { media = doc.insertElement('content', 'media', { id: null, position: 'inside' }); return true; });
  assert.deepEqual(designer._nodeTools({ id: media }).map((item) => item.action), ['panel', 'delete']);
  assert.equal(designer._treeItem(media).configured, false, 'no file yet: marked');
  const asked = [];
  designer.apiClient = {
    ...designer.apiClient,
    get: async (path, options) => {
      asked.push([path, options?.query?.fields]);
      return { records: [{ rec_ID: '21', rec_Title: 'Map', rec_URL: '', rec_NonOwnerVisibility: 'viewable', details: { 5: ['map.jpg'], 6: ['61'], 7: ['70'] } }] };
    }
  };
  designer.options.dbdefs = {
    localId: (table, concept) => ({ '2-1185': 5, '2-29': 6, '2-1186': 7 })[concept] || 0,
    termLabel: (id) => ({ 61: 'jpg', 70: 'Local' })[id] || ''
  };
  assert.deepEqual(await designer._mediaFile('abc123'),
    { key: 'abc123', id: 21, name: 'map.jpg', ext: 'jpg', source: 'local', url: '', public: false });
  assert.deepEqual(asked, [['/files/abc123', '_all']]);
  designer.destroy();
});

test('designer: a double click on a text opens the text popup; all languages are one undo step', async () => {
  const editors = [];
  const loadEditor = async () => async (host, { value }) => {
    const editor = { value, getValue: () => editor.value, setValue: (text) => { editor.value = text; }, focus() {}, destroy() {} };
    editors.push(editor);
    return editor;
  };
  const { designer } = designerOf({ loadEditor });
  await designer.open(10);
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  const dialogs = [];
  HMsg.showMsgDlg = (body, options) => { dialogs.push({ body, ...options }); return null; };
  HMsg.closeMsgDlg = () => {};
  try {
    const row = designer.partTree.root.querySelectorAll('.h-tree-row').find((element) => element.dataset.id === 'h1');
    row.fire('dblclick');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(designer.selectedNode, 'h1');
    const languageButtons = dialogs[0].body.querySelectorAll('.h-translation-language');
    assert.deepEqual(languageButtons.map((button) => button.textContent), ['ENG', 'FRE'], 'the languages of the website');
    const original = designer._currentRecord().doc.text('h1');
    const originalFre = designer._currentRecord().doc.translation('fre', 'h1');
    assert.equal(editors[0].value, original);
    editors[0].value = '<h1>Home page</h1>';
    languageButtons[1].click();
    editors[0].value = '<h1>Accueil</h1>';
    dialogs[0].buttons[0].onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const doc = () => designer._currentRecord().doc;
    assert.equal(doc().text('h1'), '<h1>Home page</h1>');
    assert.equal(doc().translation('fre', 'h1'), '<h1>Accueil</h1>');
    designer.undo();
    assert.equal(doc().text('h1'), original, 'one undo step');
    assert.equal(doc().translation('fre', 'h1'), originalFre);
  } finally {
    HMsg.showMsgDlg = show;
    HMsg.closeMsgDlg = close;
    designer.destroy();
  }
});

test('designer: the caption of a group in the translation popup; a translation added', async () => {
  const { designer } = designerOf();
  await designer.open(10);
  let group = null;
  designer._edit((doc) => { group = doc.insertElement('content', 'group', { id: null, position: 'inside' }); return true; });
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  const dialogs = [];
  HMsg.showMsgDlg = (body, options) => { dialogs.push({ body, ...options }); return null; };
  HMsg.closeMsgDlg = () => {};
  try {
    const done = designer._editCaption(group);
    const body = dialogs[0].body;
    assert.deepEqual(body.querySelectorAll('.h-input-text-lang').map((badge) => badge.textContent), ['ENG'], 'the caption in the first language');
    body.querySelectorAll('input')[0].value = 'News';
    // two languages: a button "Add FRE" (review 27n §18.17b)
    body.querySelector('.h-translation-add-one').click();
    body.querySelectorAll('input')[1].value = 'Nouvelles';
    dialogs[0].buttons[0].onClick();
    await done;
    assert.deepEqual(designer._currentRecord().doc.caption(group), { id: designer._currentRecord().doc.caption(group).id, text: 'News', translations: { fre: 'Nouvelles' } });
  } finally {
    HMsg.showMsgDlg = show;
    HMsg.closeMsgDlg = close;
    designer.destroy();
  }
});

test('designer: a website the user can not change is read only', async () => {
  const { designer, container } = designerOf({ canEdit: false });
  await designer.open(10);
  assert.equal(designer.readOnly, true);
  assert.equal(designer._edit((doc) => doc.setText('h1', 'x')), false);
  assert.equal(container.querySelector('.h-cms-picker'), null, 'no element picker');
  designer.destroy();
});

test('designer: element panel (plan 27n §2): Configuration | Own style, docked or a popup, Cancel, applied at once', async () => {
  const { designer } = designerOf();
  await designer.open(10);
  designer.formPanel.setMode('docked');
  let group = null;
  designer._edit((doc) => { group = doc.insertElement('content', 'group', { id: null, position: 'inside' }); return true; });
  assert.equal(designer.formPanel.isOpen(), false);
  const tabsOf = (id) => designer._panelTabs(id).map((tab) => `${tab.id}:${tab.sections.map((section) => section.label).join('+')}`);
  // the page: its fields in the panel (review §14.9) and its own style; a group: caption, presentation, identification
  assert.deepEqual(tabsOf('#root'), ['config:', 'style:']);
  // one help (review §14.6): a widget form has its own, Reveal has its help with the input
  assert.equal(designer._panelTabs('h1')[0].help.some((text) => /Reveal/.test(text)), false);
  assert.deepEqual(tabsOf(group), ['config:Caption+Presentation+Identification', 'style:']);
  assert.deepEqual(tabsOf('h1'), ['config:+Presentation+Identification', 'style:'], 'a text: Edit text, reveal, name');
  assert.ok(designer._revealField('h1'), 'Reveal on scroll in Presentation');
  // plan 27n §6: tabs: their options with Reveal, the captions of the panels; a widget: its form with the sections
  let tabsNode = null;
  let menuNode = null;
  designer._edit((doc) => { tabsNode = doc.insertElement('content', 'tabs', { id: null, position: 'inside' }); return true; });
  designer._edit((doc) => { menuNode = doc.insertElement('content', 'menu', { id: null, position: 'inside' }); return true; });
  assert.deepEqual(tabsOf(tabsNode), ['config:Presentation+Captions+Identification', 'style:']);
  // a panel of tabs shows the form of its tabs (review §15.18)
  await designer._openForm(designer._treeItem(tabsNode).children[0].id);
  assert.equal(designer.formNode, tabsNode);
  await designer._closeForm();
  assert.deepEqual(tabsOf(menuNode), ['config:', 'style:'], 'one form: Source, Presentation (Reveal), Identification in it');
  const fields = designer._commonFields(menuNode, designer._treeItem(menuNode));
  assert.deepEqual(fields.fields.identification.map((field) => field.name), ['__systemId', '__name']);
  assert.equal(fields.values.__systemId, designer._treeItem(menuNode).instance, 'the system id of a widget: its instance id');
  fields.onChange('__name', 'mainMenu');
  assert.equal(designer._currentRecord().doc.name(menuNode), 'mainMenu');
  assert.deepEqual(fields.validate({ __name: 'mainMenu' }), [], 'its own name');
  designer._edit((doc) => { doc.remove(tabsNode); doc.remove(menuNode); return true; });
  designer._selectNode(group);
  const west = [];
  designer.layout.getSize = () => 300;
  designer.layout.setSize = (region, size) => west.push(size);
  await designer._toggleStyleForm();
  const panel = designer.formPanel.element;
  assert.equal(designer.formPanel.isOpen(), true, 'the gear of the bar opens the panel');
  assert.deepEqual([designer.layout.options.minWest, west], [380, [380]], 'the west pane as wide as the panel');
  assert.deepEqual(panel.querySelectorAll('.h-cms-panel-tab').map((tab) => tab.textContent), ['Configuration', 'Own style']);
  assert.equal(panel.parentElement, designer.pagePanel, 'docked in a narrow pane: below the tree');
  designer._panelSide = true;
  designer._placePanel();
  assert.equal(panel.parentElement, designer.westRow, 'a wide pane: beside the tabs Site / Page');
  assert.equal(panel.querySelector('.h-cms-panel-foot').hidden, true, 'no footer when docked');
  // the help of the form (header help and the help of the inputs) on and off
  const tips = designer.formPanel.tipsShown();
  const icons = panel.querySelector('.h-cms-panel-head').querySelectorAll('.h-cms-panel-icon');
  icons[1].click();
  assert.equal(designer.formPanel.tipsShown(), !tips);
  // Show advanced settings before Help (review 27n §21)
  assert.ok(icons[0].classList.contains('h-cms-panel-advanced'));
  const advanced = designer.formPanel.advancedShown();
  icons[0].click();
  assert.equal(designer.formPanel.advancedShown(), !advanced);
  assert.equal(panel.classList.contains('is-advanced'), !advanced);
  icons[0].click();
  // undock: a popup with Dock, Cancel and Apply; Cancel returns to the draft of its opening
  designer._panelMode('popup');
  assert.equal(panel.classList.contains('is-popup'), true);
  assert.equal(panel.parentElement, designer.root);
  assert.equal(panel.querySelector('.h-cms-panel-foot').hidden, false);
  assert.equal(designer.layout.options.minWest, 280, 'a popup needs no room in the pane');
  designer._formEdit(`caption:${group}`, (doc) => doc.setCaption(group, 'Changed'));
  await designer._cancelPanel();
  assert.equal(designer.formPanel.isOpen(), false);
  assert.equal(designer._currentRecord().doc.caption(group), null, 'Cancel: the caption as before');
  await designer._openForm(group);
  designer._formEdit(`caption:${group}`, (doc) => doc.setCaption(group, 'Kept'));
  await designer._applyPanel();
  assert.equal(designer._currentRecord().doc.caption(group).text, 'Kept', 'Apply keeps the changes');
  designer._panelMode('docked');
  await designer._toggleStyleForm();
  await designer._toggleStyleForm();
  assert.equal(designer.formPanel.isOpen(), false, 'the gear of the bar closes it');
  assert.equal(designer.layout.options.minWest, 280, 'closed: the usual minimum');
  await designer.selectPart(10, 'header', { force: true });
  // the header: its layout (a button) and its own style (review 2026-11-16); no reveal
  assert.deepEqual(tabsOf('#root'), ['config:', 'style:'], 'the own style of the header');
  assert.equal(designer._revealField('h1'), null, 'no reveal in the header');
  await designer.selectPart(10, 'content', { force: true });
  designer._edit((doc) => { group = doc.insertElement('content', 'group', { id: null, position: 'inside' }); return true; });
  const steps = designer.undoStack.length;
  designer._formEdit(`caption:${group}`, (doc) => doc.setCaption(group, 'A'));
  designer._formEdit(`caption:${group}`, (doc) => doc.setCaption(group, 'Ab'));
  assert.equal(designer.undoStack.length, steps + 1, 'typing in one field: one undo step');
  assert.equal(designer._currentRecord().doc.caption(group).text, 'Ab');
  let restyled = 0;
  let applied = 0;
  designer.preview.restyle = () => { restyled += 1; };
  const apply = designer.preview.apply.bind(designer.preview);
  designer.preview.apply = (draft) => { applied += 1; apply(draft); };
  designer._formEdit(`style:${group}`, (doc) => (doc.setNodeStyle(group, { padding: '8px' }), true));
  assert.deepEqual([restyled, applied], [1, 0], 'a style: the styles of the preview only');
  assert.equal(designer.undoStack.length, steps + 2, 'another field: another step');
  designer._formEdit('style:page', (doc) => (doc.setPageStyle({ display: 'grid' }), true));
  assert.deepEqual(designer._currentRecord().doc.pageStyle(), { display: 'grid' });
  designer.undo();
  assert.deepEqual(designer._currentRecord().doc.pageStyle(), {});
  // page fields of the page popup wait for Save Page
  designer._currentRecord().fieldChanges = { 3: ['Menu text'] };
  assert.equal(designer.isDirty(), true, 'changed page fields: unsaved');
  designer.discard();
  assert.equal(designer._currentRecord().fieldChanges, undefined);
  designer.destroy();
});

test('Add page (review 2026-11-14): list and preview, then Add shows the form of the template in the same popup', async () => {
  const show = HMsg.showMsgDlg;
  const close = HMsg.closeMsgDlg;
  const get = HMsg.getMsgDlg;
  HMsg.getMsgDlg = () => null;
  const dialogs = [];
  HMsg.showMsgDlg = (body, options) => { dialogs.push({ body, ...options }); return null; };
  HMsg.closeMsgDlg = () => {};
  const made = [];
  try {
    const answer = openAddPageForm({
      createForm: (host, template, title) => {
        const form = { template, title, destroyed: false, read: async () => ({ details: { 1: [title] }, values: {}, layout: {} }),
          destroy: async () => { form.destroyed = true; } };
        made.push(form);
        return form;
      }
    });
    const body = dialogs[0].body;
    assert.equal(dialogs[0].title, 'Add page', 'the title of the popup stays');
    assert.equal(body.querySelector('input'), null, 'no Title input');
    assert.ok(body.querySelector('.h-cms-catalog-info').children.length >= 3, 'name, description and preview of the template');
    assert.equal(made.length, 0, 'no form before Add');
    const cover = body.querySelectorAll('.h-cms-catalog-item').find((item) => item.textContent === 'Cover');
    cover.click();
    await dialogs[0].buttons[0].onClick();
    assert.deepEqual([made[0].template, made[0].title], ['cover', 'Cover'], 'Add: the form of the chosen template');
    assert.equal(body.querySelector('.h-cms-catalog-main').hidden, true, 'list and preview hidden');
    assert.ok(body.querySelector('.h-cms-catalog-form'));
    await dialogs[0].buttons[0].onClick();
    const result = await answer;
    assert.deepEqual(result, { template: 'cover', title: 'Cover', form: { details: { 1: ['Cover'] }, values: {}, layout: {} } });
    assert.ok(made.every((form) => form.destroyed), 'the form is destroyed');
  } finally {
    HMsg.showMsgDlg = show;
    HMsg.closeMsgDlg = close;
    HMsg.getMsgDlg = get;
  }
});

test('designer: the modules of an Explorer instance are its child items (2026-11-14)', async () => {
  const { explorerModuleSettings, explorerModuleTypes, moduleItemId, parseModuleItemId, withExplorerModuleSettings } =
    await import('../src/designer/explorerModules.js');
  const settings = {
    ui: { regions: { data: 'west', map: 'center', graph: 'unused', timeline: 'south', recordview: 'center' }, order: ['data', 'recordview', 'map'] },
    layout: [{ id: 'map', type: 'map', region: 'center', settings: { x: 1 } }],
    modules: {}
  };
  assert.deepEqual(explorerModuleTypes(settings), ['data', 'recordview', 'map', 'timeline']);
  assert.deepEqual(explorerModuleTypes({ layout: [{ type: 'data' }, { type: 'map' }] }), ['data', 'map'], 'no layout configuration');
  const id = moduleItemId('n1', 'map');
  assert.deepEqual(parseModuleItemId(id), { node: 'n1', type: 'map' });
  assert.equal(parseModuleItemId('n1'), null);
  assert.deepEqual(explorerModuleSettings(settings, 'map'), { x: 1 }, 'the settings of its layout item');
  const next = withExplorerModuleSettings(settings, 'map', { y: 2 });
  assert.deepEqual(next.modules.map, { y: 2 });
  assert.deepEqual(next.layout[0].settings, { y: 2 }, 'the layout item too (it wins on the page)');
  assert.deepEqual(settings.layout[0].settings, { x: 1 }, 'not changed in place');

  const { designer } = designerOf();
  await designer.open(10);
  const tools = designer._nodeTools({ id: moduleItemId('n1', 'map') });
  assert.deepEqual(tools.map((tool) => tool.action), ['panel'], 'the gear only, no delete');
  assert.equal(designer._canDropNode(moduleItemId('n1', 'map'), '#root', 'inside'), false, 'not dragged');
  designer.destroy();
});

test('designer navigation (plan 27k §13): the page of a link of the preview, opened as in the website tree', async () => {
  const { previewPageOf, CmsPreview } = await import('../src/designer/CmsPreview.js');
  const { draftPageUrl } = await import('../src/siteRuntime.js');
  const site = { database: 'db', siteId: 10 };
  assert.deepEqual(previewPageOf('http://h/heurist/db/site/10/12?lang=fre&source=3&v.X1=a', site), { pageId: 12, record: 0 });
  assert.deepEqual(previewPageOf('/heurist/db/site/10/13/555', site), { pageId: 13, record: 555 }, 'a record page');
  assert.deepEqual(previewPageOf('/heurist/db/site/10', site), { pageId: 0, record: 0 }, 'the website: home or Startup page');
  assert.deepEqual(previewPageOf('http://h/heurist/?db=db&site=10&pageid=11', site), { pageId: 11, record: 0 });
  assert.equal(previewPageOf('/heurist/db/site/99/12', site), null, 'another website');
  assert.equal(previewPageOf('/heurist/other/site/10/12', site), null, 'another database');
  assert.equal(previewPageOf('https://example.org/', site), null);
  assert.equal(previewPageOf('#', site), null);
  // only the links of navigation widgets, not actions or new tabs
  const preview = Object.create(CmsPreview.prototype);
  const config = { runtime: { database: 'db' }, site: { id: 10 } };
  const link = (container, attributes = {}) => {
    const host = document.createElement('div');
    host.className = container;
    const anchor = document.createElement('a');
    anchor.setAttribute('href', '/heurist/db/site/10/12');
    for (const [name, value] of Object.entries(attributes)) anchor.setAttribute(name, value);
    host.append(anchor);
    return anchor;
  };
  assert.deepEqual(preview._navigationTarget(link('h-site-menu'), config), { pageId: 12, record: 0 });
  assert.deepEqual(preview._navigationTarget(link('h-site-breadcrumbs'), config), { pageId: 12, record: 0 });
  assert.equal(preview._navigationTarget(link('h-site-text'), config), null, 'a link in a text selects it');
  assert.equal(preview._navigationTarget(link('h-site-menu', { 'data-h-action': 'back' }), config), null);
  assert.equal(preview._navigationTarget(link('h-site-menu', { target: '_blank' }), config), null);
  // the draft action menu: Go to a page has the URL of the page
  const draft = { runtime: { design: true }, site: { id: 10, homeItem: { url: '/h' }, menu: [{ id: 11, url: '/a', children: [{ id: 13, url: '/t', children: [] }] }] } };
  assert.equal(draftPageUrl(draft, 13), '/t');
  assert.equal(draftPageUrl(draft, 10), '/h');
  assert.equal(draftPageUrl(draft, 99), '#');
  assert.equal(draftPageUrl({ ...draft, runtime: {} }, 13), '#', 'a published page has the links of the server');
  // the designer opens the page as a click on the website tree
  const { designer } = designerOf();
  await designer.open(10);
  const opened = [];
  designer._selectSiteItem = async (id) => { opened.push(id); };
  await designer._navigate({ pageId: 13 });
  await designer._navigate({ pageId: 0 });
  await designer._navigate({ pageId: 10 });
  const flashes = [];
  const flash = HMsg.showMsgFlash;
  HMsg.showMsgFlash = (text) => flashes.push(text);
  await designer._navigate({ pageId: 99 });
  HMsg.showMsgFlash = flash;
  assert.deepEqual(opened, ['page:13'], 'Home is open already; a page not in the website: nothing');
  assert.equal(flashes.length, 1);
  // a Startup page
  const siteRecord = designer.records.get(10);
  siteRecord.doc.setLayout({ ...siteRecord.doc.layout(), startPage: 12 });
  await designer._navigate({ pageId: 0 });
  assert.deepEqual(opened, ['page:13', 'page:12']);
  // the id of the website in a link (written with a Startup page, "Enter site" of a Cover): Home itself
  designer.current = { recordId: 12, part: 'content' };
  await designer._navigate({ pageId: 10 });
  assert.deepEqual(opened, ['page:13', 'page:12', 'part:content']);
  designer.destroy();
});

test('designer (plan 27k §13.1): the language switch of the page changes the language of the preview, in design mode', async () => {
  const { CmsPreview } = await import('../src/designer/CmsPreview.js');
  const { designer } = await (async () => {
    const made = designerOf();
    await made.designer.open(10);
    return made;
  })();
  const loads = [];
  designer.preview.load = (url) => loads.push(url);
  assert.equal(designer._previewLanguage('FRE'), true);
  assert.equal(designer.language, 'fre');
  assert.match(loads[0], /design=1/);
  assert.match(loads[0], /lang=fre/);
  assert.equal(designer.languageSelect?.value, 'fre', 'the toolbar follows');
  assert.equal(designer._previewLanguage('fre'), false, 'shown already');
  assert.equal(designer._previewLanguage('ger'), false, 'not a language of the website');
  assert.equal(designer._previewLanguage('eng'), true);
  assert.equal(designer.language, null, 'the first language');
  designer.destroy();
  // the preview document: the drop-down of the switch is stopped before its own listener, a link gives its hreflang
  const chosen = [];
  const preview = Object.create(CmsPreview.prototype);
  preview.options = { onLanguage: (code) => chosen.push(code), onSelect: () => chosen.push('selected') };
  preview.frame = {};
  const doc = document.createElement('div');
  doc.closest = () => null;
  const listeners = {};
  doc.addEventListener = (type, handler) => { listeners[type] = handler; };
  const win = { document: doc };
  preview.frame.contentWindow = win;
  preview._ready(win, { config: { runtime: { database: 'db' }, site: { id: 10 } } });
  const box = document.createElement('div');
  box.className = 'h-site-lang';
  const select = document.createElement('select');
  const option = document.createElement('option');
  option.setAttribute('data-h-lang-code', 'fre');
  option.selected = true;
  select.append(option);
  box.append(select);
  let stopped = false;
  listeners.change({ target: select, stopPropagation: () => { stopped = true; } });
  assert.ok(stopped);
  const link = document.createElement('a');
  link.setAttribute('href', '/x?lang=eng');
  link.setAttribute('hreflang', 'eng');
  box.append(link);
  // the fake DOM has no attribute selectors in closest()
  link.closest = (selector) => ({ 'a[href]': link, '.h-site-lang': box }[selector] ?? null);
  listeners.click({ target: link, preventDefault: () => {} });
  assert.deepEqual(chosen, ['fre', 'eng'], 'no node selected');
});
