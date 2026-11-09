import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from '../../../shared/test/helpers/fakeDom.js';

const document = installFakeDom();
globalThis.Event ??= class Event { constructor(type) { this.type = type; } };
const { attachHeaderToggle, enhanceTabs, startSite } = await import('../src/siteRuntime.js');

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
  assert.equal(menu.querySelectorAll('.h-site-menu-item').length, 2, 'two pages; the languages are a widget of their own (plan 27f)');
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

test('media with a view: the page serves them, a preview of the designer does not', async () => {
  const page = () => element('div', {}, element('figure', { 'data-h-view': 'image', 'data-h-full': 'a.png' }));
  const opened = () => document.body.children.filter((child) => child.classList.contains('h-media-viewer')).length;
  const designed = page();
  await startSite({ root: designed, config: { runtime: { design: true } } });
  designed.children[0].click();
  assert.equal(opened(), 0);
  const root = page();
  await startSite({ root, config: { runtime: {} } });
  root.children[0].click();
  assert.equal(opened(), 1);
  const { closeMediaView } = await import('#shared/widgets/site/HMediaViewer.js');
  closeMediaView();
  assert.equal(opened(), 0);
});

test('menu options (plan 27f §4): Home first, a parent that only opens its sub pages, vertical expanders, icons', async () => {
  const { HMenu } = await import('#shared/widgets/site/HMenu.js');
  const host = element('nav');
  new HMenu().attach(host, {
    settings: { orientation: 'vertical', showHome: true, selectableParent: false },
    homeItem: { id: 5, title: 'Home', url: '/5', children: [] },
    items: [{ id: 7, title: 'About', url: '/7', children: [{ id: 8, title: 'Team', url: '/8', current: true, children: [
      { id: 9, title: 'Deep', url: '/9', children: [] }] }] },
    { id: 10, title: 'Maps', url: '/10', icon: '/icon.png', format: 'icon', children: [] }]
  }).render();
  const nav = host.querySelector('.h-site-menu');
  assert.ok(nav.classList.contains('h-site-menu-vertical'));
  const items = nav.querySelectorAll('.h-site-menu-item');
  assert.deepEqual(items.map((item) => item.querySelector('.h-site-menu-text').textContent), ['Home', 'About', 'Team', 'Deep', 'Maps'], 'all levels');
  assert.ok(items[1].querySelector('.h-site-menu-label'), 'About has sub pages and is not a link');
  assert.equal(items[3].querySelector('a')?.href, '/9', 'a page without sub pages is a link');
  assert.ok(items[1].classList.contains('is-current-parent') && items[1].classList.contains('is-expanded'), 'the branch of the current page is open');
  const expand = items[1].querySelector('.h-site-menu-expand');
  expand.click();
  assert.equal(items[1].classList.contains('is-expanded'), false);
  assert.ok(items[4].querySelector('img').getAttribute('src') === '/icon.png' || items[4].querySelector('img').src === '/icon.png');
  assert.ok(items[4].querySelector('.h-site-menu-text').classList.contains('h-site-visually-hidden'), 'icon only: the title for screen readers');
});

test('language switch (plan 27f §5): links, a select for appearance select, nothing for one language', async () => {
  const { HLangSwitch } = await import('#shared/widgets/site/HLangSwitch.js');
  const languages = [{ code: 'eng', url: '/e' }, { code: 'fre', url: '/f' }];
  const host = element('div');
  const opened = [];
  new HLangSwitch().attach(host, { languages, language: 'fre', appearance: 'select', navigate: (url) => opened.push(url) }).render();
  const links = host.querySelectorAll('a');
  assert.deepEqual(links.map((link) => link.getAttribute('hreflang')), ['eng', 'fre']);
  assert.ok(links[1].classList.contains('is-current'));
  const select = host.querySelector('select');
  assert.ok(select, 'the drop-down');
  select.value = '/e';
  select.fire('change');
  assert.deepEqual(opened, ['/e']);
  const list = element('div');
  new HLangSwitch().attach(list, { languages, language: 'eng', appearance: 'list' }).render();
  assert.equal(list.querySelector('select'), null);
  const single = element('div');
  new HLangSwitch().attach(single, { languages: [languages[0]], language: 'eng' }).render();
  assert.equal(single.hidden, true);
  assert.equal(single.children.length, 0);
});

test('slide out header (plan 27f §13): a button collapses and expands it, the choice is kept', () => {
  const header = element('header', {}, element('div'));
  header.className = 'h-site-header';
  const body = element('div', {}, header);
  body.className = 'h-site-header-slide';
  document.body.append(body);
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const detach = attachHeaderToggle(body, { key: 'k', storage });
  const button = header.querySelector('.h-site-header-toggle');
  assert.ok(button, 'the button is in the header');
  assert.ok(!body.classList.contains('h-site-header-collapsed'), 'starts expanded');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  button.click();
  assert.ok(body.classList.contains('h-site-header-collapsed'));
  assert.equal(values.get('k'), 'collapsed');
  detach();
  assert.equal(header.querySelector('.h-site-header-toggle'), null);
  // the next page: collapsed at once
  attachHeaderToggle(body, { key: 'k', storage });
  assert.ok(body.classList.contains('h-site-header-collapsed'));
  header.querySelector('.h-site-header-toggle').click();
  assert.ok(!body.classList.contains('h-site-header-collapsed'));
  assert.equal(values.get('k'), 'expanded');
  body.remove();
});
