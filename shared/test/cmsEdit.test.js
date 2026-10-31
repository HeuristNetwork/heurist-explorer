/**
 * @file cmsEdit.test.js
 * @brief Editable website document of the CMS designer (plan 27c §7): parsing, tree, insert, move with the
 *        no-recursion rule, remove without orphans, copy structure / copy all, paste, styles, translations.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CmsRecordDocument, cmsPageStarter, newCmsId, parseCmsHtml, serializeCmsHtml
} from '../src/site/cmsEdit.js';
import { checkCmsDocument, parseCmsConfig } from '../src/site/cmsDocument.js';

const CONTENT = '<div data-h-node="g1" data-h-control="group" data-h-style="columns2">'
  + '<div data-h-node="t1" data-h-text=""><p>One &amp; <b>two</b></p></div>'
  + '<div data-h-node="t2" data-h-text=""><p>Three</p></div></div>'
  + '<div data-h-node="m1" data-h-instance="i1"><p>This page needs JavaScript.</p></div>'
  + '<!-- note --><p>plain <br>text</p>';

const CONFIG = JSON.stringify({
  schema: 'heurist-cms/4',
  instances: { i1: { kind: 'module', type: 'map', configVersion: 1, settings: { a: 1 }, state: null } },
  styles: { nodes: { t1: { padding: '4px' }, m1: { height: '300px' } }, presets: { columns2: { label: 'Two columns', display: 'grid' } } }
});

function documentOf() {
  return new CmsRecordDocument({ parts: { content: CONTENT }, config: CONFIG, translations: { fre: { t1: '<p>Un</p>', t2: '<p>Trois</p>' } } });
}

test('parse and serialize keep the HTML (text blocks and hosts as they are)', () => {
  assert.equal(serializeCmsHtml(parseCmsHtml(CONTENT)), CONTENT);
  const tolerant = serializeCmsHtml(parseCmsHtml('<div data-h-node="a"><img src="x.png"><span>open'));
  assert.equal(tolerant, '<div data-h-node="a"><img src="x.png"><span>open</span></div>');
  assert.equal(serializeCmsHtml(parseCmsHtml('<p title="a &quot;b&quot;">x</p>')), '<p title="a &quot;b&quot;">x</p>');
});

test('tree: nodes with kinds, labels, presets and configured instances', () => {
  const tree = documentOf().tree('content');
  assert.deepEqual(tree.map((item) => [item.id, item.kind]), [['g1', 'control'], ['m1', 'instance']]);
  assert.equal(tree[0].preset, 'columns2');
  assert.deepEqual(tree[0].children.map((item) => item.label), ['One & two', 'Three']);
  assert.equal(tree[1].label, 'map');
  assert.equal(tree[1].configured, true);
});

test('insert: elements of the picker go into a container or after a node', () => {
  const doc = documentOf();
  const tabs = doc.insertElement('content', 'tabs', { id: null, position: 'inside' });
  const tabsItem = doc.tree('content').find((item) => item.id === tabs);
  assert.equal(tabsItem.control, 'tabs');
  assert.deepEqual(tabsItem.children.map((item) => item.label), ['group: Tab 1', 'group: Tab 2']);
  const text = doc.insertElement('content', 'text', { id: 't1', position: 'after' });
  assert.deepEqual(doc.tree('content')[0].children.map((item) => item.id), ['t1', text, 't2']);
  const map = doc.insertElement('content', 'data', { id: 'g1', position: 'inside' });
  const host = doc.tree('content')[0].children.at(-1);
  assert.equal(host.id, map);
  assert.equal(host.configured, false, 'a new module is not configured');
  assert.deepEqual(doc.instance(host.instance), { kind: 'module', type: 'data', configVersion: 1, settings: {}, state: null });
  const menu = doc.insertElement('content', 'menu', { id: null, position: 'inside' });
  assert.deepEqual(doc.nodeStyle(menu), { 'min-height': '0' }, 'a widget host is not given the module min-height');
  assert.throws(() => doc.insertElement('content', 'cardinal'), /Unknown element/);
  assert.equal(doc.check().filter((issue) => issue.level === 'error').length, 0);
});

test('move: only into controls or the root, never into itself or a descendant', () => {
  const doc = documentOf();
  assert.equal(doc.canDrop('t1', { id: 'm1', position: 'inside' }), false, 'a host takes no children');
  assert.equal(doc.canDrop('t1', { id: 't2', position: 'inside' }), false, 'a text block takes no children');
  assert.equal(doc.canDrop('g1', { id: 't1', position: 'before' }), false, 'not into its own descendants');
  assert.equal(doc.canDrop('g1', { id: 'g1', position: 'inside' }), false);
  assert.equal(doc.move('t2', { id: 't1', position: 'before' }), true);
  assert.deepEqual(doc.tree('content')[0].children.map((item) => item.id), ['t2', 't1']);
  assert.equal(doc.move('m1', { id: 'g1', position: 'inside' }), true);
  assert.deepEqual(doc.tree('content')[0].children.map((item) => item.id), ['t2', 't1', 'm1']);
  assert.equal(doc.move('t1', { id: null, position: 'inside', part: 'content' }), true);
  assert.deepEqual(doc.tree('content').map((item) => item.id), ['g1', 't1']);
});

test('remove: node styles, translations and instances go with the node', () => {
  const doc = documentOf();
  doc.remove('g1');
  doc.remove('m1');
  const { parts, configuration, translations } = doc.serialize();
  assert.equal(parts.content, '<!-- note --><p>plain <br>text</p>');
  const config = JSON.parse(configuration);
  assert.deepEqual(config.instances, {});
  assert.deepEqual(config.styles.nodes, {});
  assert.deepEqual(translations, {}, 'a language without blocks is dropped');
});

test('remove: an instance with a host in another part of the record stays', () => {
  const doc = new CmsRecordDocument({
    parts: { header: '<nav data-h-node="h" data-h-instance="menu"></nav>', content: '<div data-h-node="c" data-h-instance="menu"></div>' },
    config: { schema: 'heurist-cms/4', instances: { menu: { kind: 'widget', type: 'menu' } }, styles: {} }
  });
  doc.remove('c');
  assert.ok(doc.instance('menu'));
  assert.deepEqual(doc.partNames(), ['header', 'content']);
});

test('copy structure / copy all and paste with new ids; instances new and not configured', () => {
  const doc = documentOf();
  const all = doc.copy('g1', 'all');
  const pasted = doc.paste(all, 'content', { id: 'm1', position: 'after' });
  assert.ok(pasted && pasted !== 'g1');
  const copyItem = doc.tree('content').find((item) => item.id === pasted);
  assert.deepEqual(copyItem.children.map((item) => item.label), ['One & two', 'Three']);
  const [t1copy] = copyItem.children;
  assert.notEqual(t1copy.id, 't1');
  assert.deepEqual(doc.nodeStyle(t1copy.id), { padding: '4px' }, 'styles copied');
  assert.equal(doc.translation('fre', t1copy.id), '<p>Un</p>', 'translations copied');
  assert.equal(copyItem.preset, 'columns2');

  const structure = doc.copy('g1', 'structure');
  const second = doc.paste(structure, 'content', { id: null, position: 'inside' });
  const structureItem = doc.tree('content').find((item) => item.id === second);
  assert.deepEqual(structureItem.children.map((item) => item.label), ['Text', 'Text'], 'texts empty');
  assert.equal(doc.translation('fre', structureItem.children[0].id), '', 'no translations');

  assert.equal(doc.copy('m1'), null, 'an instance alone can not be copied');
  doc.move('m1', { id: 'g1', position: 'inside' });
  const withHost = doc.copy('g1', 'all');
  assert.equal(doc.paste(withHost, 'content', { id: 't1', position: 'after' }), null, 'not into the copied node itself');
  const third = doc.paste(withHost, 'content', { id: null, position: 'inside' });
  const host = doc.tree('content').find((item) => item.id === third).children.at(-1);
  assert.notEqual(host.instance, 'i1');
  assert.deepEqual(doc.instance(host.instance), { kind: 'module', type: 'map', configVersion: 1, settings: {}, state: null });
  assert.equal(host.configured, false);
  const config = parseCmsConfig(doc.serialize().configuration).config;
  assert.deepEqual(checkCmsDocument(config, [doc.serialize().parts.content]).filter((issue) => issue.code.startsWith('duplicate')), []);
});

test('texts, translations, presets, node styles, common styles and instances', () => {
  const doc = documentOf();
  doc.setText('t2', '<p>New</p>');
  assert.equal(doc.text('t2'), '<p>New</p>');
  assert.equal(doc.setText('g1', 'x'), false, 'only text blocks');
  doc.setTranslation('ger', 't2', '<p>Neu</p>');
  assert.match(doc.html('content', 'ger'), /<p>Neu<\/p>/, 'the preview of a language');
  assert.match(doc.html('content'), /<p>New<\/p>/);
  doc.setTranslation('ger', 't2', '');
  assert.equal(doc.translation('ger', 't2'), '');
  doc.setPreset('t2', 'card');
  doc.setPreset('g1', null);
  assert.match(doc.serialize().parts.content, /data-h-node="t2" data-h-text="" data-h-style="card"/);
  assert.doesNotMatch(doc.serialize().parts.content, /columns2/);
  doc.setNodeStyle('t2', { margin: '1px' });
  doc.setNodeStyle('t1', {});
  assert.deepEqual(JSON.parse(doc.serialize().configuration).styles.nodes, { m1: { height: '300px' }, t2: { margin: '1px' } });
  doc.setCommonStyles({ kinds: { text: { 'line-height': '1.4' } } });
  assert.deepEqual(doc.kinds(), { text: { 'line-height': '1.4' } });
  assert.equal(doc.presets().columns2.label, 'Two columns');
  doc.setInstance('i1', { settings: { b: 2 }, state: { q: 1 } });
  assert.deepEqual(doc.instance('i1').settings, { b: 2 });
  const before = doc.snapshot();
  doc.remove('t2');
  doc.restore(before);
  assert.equal(doc.text('t2'), '<p>New</p>', 'undo by snapshot');
});

test('page starters: text and column combinations', () => {
  const page = cmsPageStarter('textColumns2', 'Team <A>');
  const doc = new CmsRecordDocument({ parts: { content: page.content }, config: page.configuration });
  const tree = doc.tree('content');
  assert.deepEqual(tree.map((item) => item.kind), ['text', 'text', 'control']);
  assert.equal(tree[0].label, 'Team <A>');
  assert.equal(tree[2].preset, 'columns2');
  assert.equal(cmsPageStarter('columns3', 'X').content.match(/data-h-text/g).length, 4);
  assert.equal(doc.check().length, 0);
});

test('new ids are unique', () => {
  const used = new Set(['n000000']);
  const id = newCmsId('n', used);
  assert.match(id, /^n[a-z0-9]{6}$/);
  assert.ok(!used.has(id));
});
