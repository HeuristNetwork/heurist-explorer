import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from '../../../shared/test/helpers/fakeDom.js';

const document = installFakeDom();
globalThis.Event ??= class Event { constructor(type) { this.type = type; } };
const { enhanceTabs, startSite } = await import('../src/siteRuntime.js');

/** An element with attributes and children. */
function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  for (const child of children) node.append(typeof child === 'string' ? child : child);
  return node;
}

test('tabs: one panel per child, the first heading is the tab label', () => {
  const tabs = element('div', { 'data-h-control': 'tabs' },
    element('section', {}, element('h3', {}, 'Overview'), element('p', {}, 'a')),
    element('section', {}, element('h3', {}, 'Sources'), element('p', {}, 'b')),
    element('section', {}, element('p', {}, 'no heading')));
  const run = enhanceTabs(tabs);
  assert.deepEqual(run.tabs.map((tab) => tab.textContent), ['Overview', 'Sources', '3']);
  assert.equal(run.panels[0].hidden, false);
  assert.equal(run.panels[1].hidden, true);
  run.tabs[1].click();
  assert.equal(run.panels[0].hidden, true);
  assert.equal(run.panels[1].hidden, false);
  assert.ok(run.panels[0].children[0].classList.contains('h-site-tab-heading'));
});

test('hosts: menu, modules, iframe, missing configuration and problems', async () => {
  const root = element('div', {},
    element('nav', { 'data-h-instance': 'menu1' }, 'Menu'),
    element('div', { 'data-h-instance': 'd1' }, 'Loading'),
    element('div', { 'data-h-instance': 'f1' }),
    element('div', { 'data-h-instance': 'none' }),
    element('div', { 'data-h-instance': 'bad' }),
    element('div', { 'data-h-instance': 'broken' }));
  const calls = [];
  const loaders = {
    data: async () => async (options) => { calls.push(options); return { api: 'data' }; },
    map: async () => { throw new Error('no bundle'); }
  };
  const config = {
    runtime: { database: 'db', language: 'fre', moduleBaseUrl: 'https://h/hclient/bundles/', frameUrl: 'https://h/db/site/5/frame/' },
    site: { language: 'fre', languages: [{ code: 'eng', url: '/e' }, { code: 'fre', url: '/f' }],
      menu: [{ id: 1, title: 'Home', url: '/1', current: true, children: [{ id: 2, title: 'Sub', url: '/2', children: [] }] }] },
    instances: {
      menu1: { kind: 'widget', type: 'menu' },
      d1: { kind: 'module', type: 'data', mount: 'direct', settings: { a: 1 }, state: { query: 't:1' } },
      f1: { kind: 'module', type: 'data', mount: 'iframe' },
      bad: { kind: 'module', type: 'chart', problem: 'unknown kind / type' },
      broken: { kind: 'module', type: 'map', mount: 'direct' }
    }
  };
  const mounted = await startSite({ root, config, loaders });
  await flush();

  const menu = root.children[0];
  assert.ok(menu.querySelector('.h-site-menu'));
  assert.equal(menu.querySelectorAll('.h-site-menu-item').length, 3, 'two pages and the languages');
  assert.ok(menu.querySelector('.is-current'));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].container.parentElement, root.children[1], 'the module renders into an element of the host');
  assert.ok(calls[0].container.classList.contains('h-site-module-root'));
  assert.deepEqual(calls[0].bootstrap.settings, { a: 1 });
  assert.deepEqual(calls[0].bootstrap.state, { query: 't:1' });
  assert.equal(calls[0].bootstrap.runtime.language, 'fre');
  assert.equal(calls[0].assetBaseUrl, 'https://h/hclient/bundles/heurist-data/');
  assert.deepEqual(mounted.get('d1'), { api: 'data' });

  const frame = root.children[2].querySelector('iframe');
  assert.equal(frame.src, 'https://h/db/site/5/frame/f1');
  for (const position of [3, 4, 5]) {
    assert.ok(root.children[position].querySelector('.h-site-message'), `message in host ${position}`);
  }
});
