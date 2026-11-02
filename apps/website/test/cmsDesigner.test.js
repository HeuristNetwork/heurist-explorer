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
const { presetName, cssText } = await import('../src/designer/designerDialogs.js');

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

test('preset names and CSS text of the style forms', () => {
  assert.equal(presetName('Two columns', []), 'twoColumns');
  assert.equal(presetName('Card', ['card']), 'card2');
  assert.equal(presetName('', []), 'preset');
  assert.equal(cssText({ label: 'X', padding: '4px', narrow: { display: 'none' } }), 'padding: 4px; narrow: {display: none}');
});

test('catalogs of Add page and Add element: the available elements are the ones of the document', async () => {
  const { ELEMENT_GROUPS, PAGE_TEMPLATES, previewSvg } = await import('../src/designer/designerCatalog.js');
  const { CMS_ELEMENTS, cmsPageStarter } = await import('#shared/site/cmsEdit.js');
  const elements = ELEMENT_GROUPS.flatMap((group) => group.items);
  assert.deepEqual(ELEMENT_GROUPS.map((group) => group.label), ['Content and layout', 'Modules', 'Widgets']);
  assert.deepEqual(elements.filter((item) => item.available).map((item) => item.value).sort(), [...CMS_ELEMENTS].sort());
  assert.equal(new Set(elements.map((item) => item.value)).size, elements.length, 'unique values');
  const templates = PAGE_TEMPLATES[0].items;
  assert.deepEqual(templates.map((item) => item.value),
    ['blank', 'cover', 'landing', 'about', 'features', 'team', 'discover', 'blog', 'contact', 'record', 'publications']);
  assert.equal(templates[0].defaultTitle, '', 'Blank has no default title');
  assert.ok(templates.every((item) => item.available), 'every template can be added (a blank page for now)');
  assert.deepEqual(templates.filter((item) => !item.pending).map((item) => item.value), ['blank']);
  for (const item of [...elements, ...templates]) {
    assert.ok(item.description && item.preview.length, `${item.value}: description and preview`);
    assert.ok(previewSvg(item.preview));
  }
  const blank = cmsPageStarter('blank', 'News');
  assert.equal(blank.content.match(/data-h-text/g).length, 1, 'one text element');
  assert.match(blank.content, /<h1>News<\/h1><p>Text<\/p>/);
});

test('Styles popup: four tabs, themes, kind defaults, presets, custom CSS with the warning, previews', async () => {
  const { createStylesForm, previewDocument, CMS_THEMES } = await import('../src/designer/designerStyles.js');
  const form = createStylesForm({
    base: { radius: '6px' }, kinds: { text: { padding: '4px' } }, presets: { card: { label: 'Card', padding: '8px' } }, css: '.x{color:red}'
  });
  await form.ready;
  assert.deepEqual(form.tabs.tabs.map((tab) => tab.textContent), ['Base settings', 'Layout styles', 'Presets', 'Custom CSS']);
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
  assert.match(form.tabs.panels[3].textContent, /JavaScript and CSS are not allowed/, 'warning without JavaScript allowed');
  assert.equal(form.tabs.panels[3].querySelector('textarea').value, '.x{color:red}', 'a text area without a code editor');
  form.destroy();
  const allowed = createStylesForm({ javaScriptAllowed: true });
  assert.doesNotMatch(allowed.tabs.panels[3].textContent, /are not allowed/);
  // the preview has the compiled styles of the website and the custom CSS, safely inside its style element
  const html = previewDocument({ base: { 'color-bg': '#000000' }, kinds: {}, presets: { card: { padding: '8px' } }, css: 'a{}</style><script>' }, '<p>x</p>');
  assert.match(html, /html\.h-site\{--h-color-bg:#000000;\}/);
  assert.match(html, /\[data-h-style="card"\]\{padding:8px;\}/);
  assert.doesNotMatch(html, /<\/style><script>/);
});

test('Style editor: simple and advanced lists, group flex box, Reset all, Remove all, numeric check', async () => {
  const { styleRows, checkStyleValue } = await import('../src/designer/designerStyles.js');
  assert.deepEqual(checkStyleValue('width', '12'), { value: '12px', error: null }, 'px added to a plain number');
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
  assert.deepEqual(sections(), ['Group layout', 'Size and spacing', 'Text', 'Background', 'Border'], 'group layout on top');
  assert.match(host.querySelector('.h-cms-style-note').textContent, /box-shadow/, 'other properties named');
  // the checkbox of Group layout: checked = a flex box with its properties, unchecked = display block
  const groupBox = () => host.querySelector('.h-cms-style-section').querySelector('input');
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
  assert.ok(!textSections.includes('Group layout'));
  // Size in group (flex): only for an element in a flex group, and in presets
  assert.ok(!textSections.includes('In the group'));
  assert.equal(text.querySelector('.h-cms-style-preset'), null, 'no preset selector without presets');
  const child = document.createElement('div');
  styleRows(child, {}, null, { kind: 'text', inFlexGroup: true });
  assert.deepEqual(child.querySelectorAll('.h-cms-style-section').map((item) => item.textContent.trim()),
    ['In the group', 'Size and spacing', 'Text', 'Background', 'Border']);
  for (const value of ['1', '2', 'auto', 'none', '1 200px', '1 0 200px', '2 1']) assert.equal(checkStyleValue('flex', value).error, null, value);
  for (const value of ['x', '1 1 1', '-1', '1 2 3 4']) assert.ok(checkStyleValue('flex', value).error, value);
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
  designer.destroy();
});

test('designer: west pane with the tabs Site | Page and help, the preview alone in the center', async () => {
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
  assert.match(container.querySelector('.h-cms-help').textContent, /main menu/);
  // second row: language and page width as selects
  assert.equal(container.querySelector('.h-cms-view-bar').querySelectorAll('select').length, 2);
  assert.equal(container.querySelector('.h-cms-toolbar').querySelectorAll('select').length, 0, 'no language selector in the toolbar');

  await designer._selectSiteItem('page:12');
  assert.equal(designer._siteTabActive(), false, 'a page opens on the Page tab');
  assert.equal(designer._propertiesRecord(), 12, 'Properties = the open page');
  assert.match(container.querySelector('.h-cms-help').textContent, /order on the page/);
  assert.ok(designer.buttons.save.classList.contains('h-btn-primary'), 'Save is the primary button');
  const buttons = [...container.querySelector('.h-cms-pane-bar').querySelectorAll('button')];
  assert.equal(buttons.at(-1), designer.buttons.save, 'Save on the right');
  assert.equal(designer._discardQuestion(), 'Discard the changes of page "News"?');
  await designer.selectPart(10, 'header');
  assert.equal(designer._discardQuestion(), 'Discard the changes of Header?');
  designer.destroy();
});

test('designer: tools of the part tree, + of tabs, captions, copy below the tree', async () => {
  const { designer } = designerOf();
  await designer.open(10);
  const root = designer._nodeTools({ id: '#root' });
  assert.deepEqual(root.map((item) => [item.action, item.label, item.always]), [['add', 'Add element', true]]);
  let tabs = null;
  designer._edit((doc) => { tabs = doc.insertElement('content', 'tabs', { id: null, position: 'inside' }); return true; });
  const actions = (id) => designer._nodeTools({ id }).map((item) => item.action);
  const panel = designer._treeItem(tabs).children[0];
  assert.deepEqual(actions(tabs), ['add', 'delete']);
  assert.deepEqual(actions(panel.id), ['add', 'caption', 'delete']);
  assert.deepEqual(actions(panel.children[0].id), ['edit', 'delete'], 'a text: pen and remove');
  await designer._addElement(tabs);
  assert.equal(designer._treeItem(tabs).children.length, 3, '+ of tabs adds a panel at once');
  // a click on a caption in the preview selects its panel
  designer._selectNode(panel.caption, { fromPreview: true });
  assert.equal(designer.selectedNode, panel.id);
  const picker = () => designer.pickerBox.querySelectorAll('button');
  assert.deepEqual(picker().map((button) => button.textContent.trim()), ['Own style', 'Caption', '', ''],
    'tools of the selected panel, Copy and Paste as icons');
  assert.equal(picker()[2].disabled, false, 'copy of the selected panel');
  designer._copy('all');
  assert.equal(designer.clipboard.sourceId, panel.id);
  designer._selectNode(panel.children[0].id);
  assert.deepEqual(picker().map((button) => button.textContent.trim()).slice(0, 2), ['Own style', 'Edit text']);
  designer._selectNode(null);
  assert.equal(picker().length, 2, 'nothing selected: Copy and Paste only');
  assert.equal(picker()[0].disabled, true, 'nothing selected: no copy');
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
    const select = body.querySelector('select');
    select.value = 'fre';
    select.fire('change');
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
