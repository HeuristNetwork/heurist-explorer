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

/** A designer on a fake API: requests are recorded. */
function designerOf({ canEdit = true } = {}) {
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
    container, apiClient, websites, bridge: { editRecord: async () => ({ saved: true }) }, runtime: { baseUrl: 'http://h/', database: 'db' }
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
  assert.deepEqual(Object.keys(patch[3].details), ['4'], 'only the home content');
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

test('designer: a website the user can not change is read only', async () => {
  const { designer, container } = designerOf({ canEdit: false });
  await designer.open(10);
  assert.equal(designer.readOnly, true);
  assert.equal(designer._edit((doc) => doc.setText('h1', 'x')), false);
  assert.equal(container.querySelector('.h-cms-picker'), null, 'no element picker');
  designer.destroy();
});
