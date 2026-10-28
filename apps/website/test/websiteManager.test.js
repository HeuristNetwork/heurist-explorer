/**
 * @file websiteManager.test.js
 * @brief Website manager (plan 27b): controller (definitions, selection, summary, builds,
 *        editable websites) and the toolbar for a selection.
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
import { installFakeDom, flush } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const { WebsiteApplication } = await import('../src/manager/WebsiteApplication.js');
const { WebsiteManager } = await import('../src/manager/WebsiteManager.js');
const { createWebsiteManagerConfig } = await import('../src/direct.js');

const CODES = { 'rty:99-51': 51, 'rty:99-52': 52, 'dty:2-49': 1149, 'dty:2-928': 928, 'trm:2-6254': 6254 };

const SUMMARIES = {
  10: { id: 10, kind: 'website', version: '4', v4: true, title: 'Site', languages: ['eng'], url: 'http://h/db/site/10', canEdit: true,
    pages: [{ id: 11, title: 'About', children: [] }] },
  20: { id: 20, kind: 'standalone', version: '4', v4: true, title: 'Map page', languages: [], url: 'http://h/db/site/20', canEdit: true, pages: [] },
  30: { id: 30, kind: 'website', version: '3', v4: false, title: 'Old', languages: [], url: 'http://h/db/web/30', canEdit: true, pages: [] }
};

/** Application with fake API clients. */
function createApplication({ bridge = null, status = { installed: true, missing: [], canSetup: true }, jobs = [] } = {}) {
  const calls = [];
  const apiClient = {
    buildUrl: (path) => `http://h/api/db${path}`,
    async request(path, options = {}) {
      calls.push([options.method || 'GET', path, options.query || null, options.body]);
      if (path === '/website/setup') return status;
      if (path === '/records') return { records: [{ rec_ID: '10' }, { rec_ID: '30' }] };
      if (path === '/jobs') return jobs;
      if (path === '/website/publish') return { id: 40, url: 'http://h/db/site/40', title: options.body.title, created: true };
      const match = /^\/website\/(\d+)$/.exec(path);
      if (match) {
        const summary = SUMMARIES[match[1]];
        if (!summary) throw Object.assign(new Error('Website or page was not found'), { status: 404 });
        return summary;
      }
      return {};
    },
    get(path, options = {}) { return this.request(path, { ...options, method: 'GET' }); },
    post(path, options = {}) { return this.request(path, { ...options, method: 'POST' }); }
  };
  const application = new WebsiteApplication({ config: createWebsiteManagerConfig({ runtime: { database: 'db', baseUrl: 'http://h/' } }),
    bridge: { getDbDefs: async () => ({ localId: (kind, code) => CODES[`${kind}:${code}`] || 0, translationLanguages: () => ['eng', 'fre'] }), ...bridge },
    apiClient });
  return { application, calls };
}

test('createWebsiteManagerConfig: API base from the Heurist base URL', () => {
  assert.deepEqual(createWebsiteManagerConfig({ runtime: { database: 'db', baseUrl: 'http://h/heurist', language: 'FRE' } }), {
    database: 'db', baseUrl: 'http://h/heurist/', apiBaseUrl: 'http://h/heurist/api', accessToken: null, requestHeaders: {}, language: 'fre'
  });
});

test('initialize: local ids of the website definitions and the setup status', async () => {
  const { application } = createApplication();
  await application.initialize();
  assert.deepEqual(application.codes, { home: 51, page: 52, version: 1149, pageType: 928, standalonePage: 6254 });
  assert.equal(application.hasRecordTypes(), true);
  assert.equal(application.status.installed, true);
});

test('select: summary and the builds of this record only', async () => {
  const jobs = [
    { id: 'a', type: 'website-build', status: 'done', params: { id: 10 }, result: { file: 'website-10.zip', download: true } },
    { id: 'b', type: 'website-build', status: 'done', params: { id: 20 } }
  ];
  const { application } = createApplication({ jobs });
  await application.initialize();
  let changes = 0;
  application.addEventListener('selectionchange', () => changes++);
  await application.select(10);
  assert.equal(application.summary.title, 'Site');
  assert.deepEqual(application.builds.map((job) => job.id), ['a']);
  assert.ok(changes >= 2);
  await application.select(99);
  assert.equal(application.summary, null);
  assert.match(application.summaryError, /not found/);
});

test('editableWebsites: v4 websites the user can change, with their menus', async () => {
  const { application, calls } = createApplication();
  await application.initialize();
  const websites = await application.editableWebsites();
  assert.deepEqual(websites.map((site) => site.id), [10]);
  const query = calls.find(([, path]) => path === '/records')[2];
  assert.deepEqual(JSON.parse(query.q), [{ t: '51' }, { 'f:1149': '4' }]);
});

test('toolbar: actions of a v4 standalone page, a website and a legacy website', async () => {
  const { application } = createApplication({ bridge: { editRecord: async () => ({ saved: true }), canEditRecords: () => true } });
  await application.initialize();
  // no list in this test: the record types are hidden from the view
  application.hasRecordTypes = () => false;
  const host = document.createElement('div');
  document.body.append(host);
  const view = new WebsiteManager().attach(host, { application });
  const visible = () => Object.entries(view.buttons).filter(([, button]) => !button.hidden).map(([name]) => name);

  await application.select(20);
  view.update();
  assert.deepEqual(visible(), ['create', 'edit', 'open', 'check', 'generate', 'addToMenu', 'remove']);
  await application.select(10);
  view.update();
  assert.deepEqual(visible(), ['create', 'edit', 'open', 'check', 'generate', 'remove']);
  await application.select(30);
  view.update();
  assert.deepEqual(visible(), ['create', 'open']);
  await view.destroy();
});
