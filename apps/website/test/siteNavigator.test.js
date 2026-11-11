import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from '../../../shared/test/helpers/fakeDom.js';

const document = installFakeDom();
globalThis.Event ??= class Event { constructor(type) { this.type = type; } };
const { SiteNavigator, markMenus, startNavigator } = await import('../src/siteNavigator.js');

const BASE = 'https://h/db/site/5';

/** An element with attributes and children. */
function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'class') node.className = value; else node.setAttribute(name, value);
  }
  for (const child of children) node.append(child);
  return node;
}

/** A section of a page as the server writes it, with a text and optionally a module host; a record page has its record. */
function section(id, module = false, record = 0) {
  return element('section', { class: 'h-site-page', 'data-h-page': String(id), ...(record ? { 'data-h-record': String(record) } : {}) },
    element('div', { 'data-h-text': '' }, `Page ${id}`),
    ...(module ? [element('div', { 'data-h-instance': `m${id}` })] : []));
}

/** A page of the website: header with the menu, main with the section of the first page, a fake document and window. */
function setup({ mode = 'swap', cache = 2 } = {}) {
  const menu = element('ul', { class: 'h-site-menu-list' },
    element('li', { class: 'h-site-menu-item is-current' }, element('a', { href: `${BASE}` }, 'Home')),
    element('li', { class: 'h-site-menu-item has-children' }, element('a', { href: `${BASE}/7` }, 'About'),
      element('ul', { class: 'h-site-menu-sub' }, element('li', { class: 'h-site-menu-item' }, element('a', { href: `${BASE}/8` }, 'Team')))),
    element('li', { class: 'h-site-menu-item h-site-menu-languages' }, element('a', { href: `${BASE}?lang=fre`, hreflang: 'fre' }, 'FRE')));
  const main = element('main', { class: 'h-site-main' }, section(5, true));
  const head = element('head');
  const body = element('body', {}, element('header', { class: 'h-site-header' }, menu), main);
  const html = element('html', {}, head, body);
  const doc = {
    head, body, title: 'Home', baseURI: BASE,
    createElement: (tag) => document.createElement(tag),
    querySelector: (selector) => html.querySelector(selector),
    querySelectorAll: (selector) => html.querySelectorAll(selector),
    getElementById: (id) => html.querySelector(`[id="${id}"]`),
    addEventListener() {},
    removeEventListener() {}
  };
  const calls = { pushed: [], assigned: [], destroyed: [], fetched: [] };
  const win = {
    innerHeight: 800,
    scrollY: 0,
    scrolled: [],
    location: { href: BASE, assign: (url) => calls.assigned.push(url), reload() {} },
    history: { pushState: (state, title, url) => calls.pushed.push(url), replaceState() {} },
    addEventListener() {},
    removeEventListener() {},
    scrollTo(x, y) { this.scrolled.push(y); },
    dispatchEvent() {}
  };
  // plan 27g: a record page and a page hidden in the main menu are not sections of the long page
  const pages = [{ id: 5, url: BASE, title: 'Home' }, { id: 7, url: `${BASE}/7`, title: 'About' }, { id: 8, url: `${BASE}/8`, title: 'Team' },
    { id: 9, url: `${BASE}/9`, title: 'Broken' }, { id: 10, url: `${BASE}/10`, title: 'Person', record: true },
    { id: 11, url: `${BASE}/11`, title: 'Legal', hidden: true }];
  const instances = (id) => ({ [`m${id}`]: { kind: 'module', type: 'data' } });
  const config = {
    runtime: {}, instances: instances(5),
    site: { pageId: 5, layout: { navigation: mode, cache }, pages, languages: [{ code: 'fre', url: `${BASE}?lang=fre` }] }
  };
  const loaders = { data: async () => async () => ({ destroy: () => calls.destroyed.push('module') }) };
  const navigator = new SiteNavigator({
    config, doc, win, loaders,
    mounted: new Map([['m5', { destroy: () => calls.destroyed.push('m5') }], ['menu1', {}]]),
    fetchText: async (url) => {
      calls.fetched.push(url);
      if (url.endsWith('/9')) throw new Error('HTTP 500');
      return url;
    },
    parse: (url) => {
      const [id, record = 0] = (url === BASE ? '5' : url.slice(BASE.length + 1)).split('/').map(Number);
      return {
        section: section(id, true, record),
        config: { site: { languages: [{ code: 'fre', url: `${url}?lang=fre` }] }, instances: instances(id) },
        styles: element('style', { id: 'h-page-styles', 'data-h-page': String(id) }),
        title: `Page ${id} – Site`,
        alternates: []
      };
    }
  });
  return { navigator, doc, main, menu, calls, head, win };
}

/** A click on a link (a plain left click). */
function click(link) {
  const event = { target: link, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  return event;
}

test('swap: a link of the website shows its page in place, header and menu stay', async () => {
  const { navigator, main, menu, calls, doc, head } = setup();
  navigator.start();
  const about = menu.querySelectorAll('a')[1];
  const event = click(about);
  navigator.onClick(event);
  assert.equal(event.defaultPrevented, true);
  await flush();
  await flush();
  assert.deepEqual(calls.pushed, [`${BASE}/7`]);
  const sections = main.children;
  assert.equal(sections.length, 2);
  assert.equal(sections[0].hidden, true, 'the first page is kept hidden');
  assert.equal(sections[1].hidden, false);
  assert.equal(sections[1].getAttribute('data-h-page'), '7');
  assert.equal(doc.title, 'Page 7 – Site');
  assert.equal(head.querySelectorAll('style').length, 1, 'the page styles of the loaded page');
  assert.equal(head.querySelector('style').hasAttribute('id'), false);
  const items = menu.querySelectorAll('.h-site-menu-item');
  assert.equal(items[0].classList.contains('is-current'), false);
  assert.equal(items[1].classList.contains('is-current'), true);
  assert.equal(menu.querySelector('[hreflang]').getAttribute('href'), `${BASE}/7?lang=fre`, 'language link of the shown page');

  // back to the first page: no new load
  await navigator.go(5, { push: false });
  assert.equal(calls.fetched.length, 1);
  assert.equal(sections[0].hidden, false);
  assert.equal(sections[1].hidden, true);
});

test('swap: pages above the cache are removed with their instances; a sub page marks its parent', async () => {
  const { navigator, main, menu, calls } = setup({ cache: 2 });
  navigator.start();
  await navigator.go(7);
  await navigator.go(8);
  assert.deepEqual([...main.children].map((item) => item.getAttribute('data-h-page')), ['7', '8'], 'the page used longest ago went');
  assert.deepEqual(calls.destroyed, ['m5'], 'its module was destroyed; the menu (header) was not');
  const items = menu.querySelectorAll('.h-site-menu-item');
  assert.equal(items[1].classList.contains('is-current-parent'), true);
  assert.equal(items[2].classList.contains('is-current'), true);
});

test('links that are not pages of the website, and pages that can not be loaded, open as usual', async () => {
  const { navigator, menu, calls } = setup();
  navigator.start();
  const language = click(menu.querySelector('[hreflang]'));
  navigator.onClick(language);
  assert.equal(language.defaultPrevented, false, 'language link: full load');
  const outside = click(element('a', { href: 'https://example.org/' }));
  navigator.onClick(outside);
  assert.equal(outside.defaultPrevented, false);
  const blank = click(element('a', { href: `${BASE}/7`, target: '_blank' }));
  navigator.onClick(blank);
  assert.equal(blank.defaultPrevented, false);
  assert.equal(await navigator.go(9), false);
  assert.deepEqual(calls.assigned, [`${BASE}/9`]);
});

test('scroll: placeholders of the other pages in menu order, a page loads into its place', async () => {
  const { navigator, main, calls } = setup({ mode: 'scroll' });
  navigator.start();
  assert.deepEqual([...main.children].map((item) => item.getAttribute('data-h-page')), ['5', '7', '8', '9']);
  assert.ok(main.children[1].classList.contains('h-site-page-pending'));
  await navigator.go(8);
  assert.equal(main.children[2].classList.contains('h-site-page-pending'), false, 'loaded in place of its placeholder');
  assert.equal(main.children.length, 4);
  assert.deepEqual(calls.pushed, [`${BASE}/8`]);
  assert.equal(navigator.current, 8);
});

test('startNavigator: nothing for reload, the designer or without pages', () => {
  assert.equal(startNavigator({ config: { site: { layout: { navigation: 'reload' }, pages: [{ id: 1, url: '/' }] }, runtime: {} } }), null);
  assert.equal(startNavigator({ config: { site: { layout: { navigation: 'swap' }, pages: [{ id: 1, url: '/' }] }, runtime: { design: true } } }), null);
  assert.equal(startNavigator({ config: { site: { layout: { navigation: 'swap' }, pages: [] }, runtime: {} } }), null);
});

test('markMenus: language links are not marked', () => {
  const list = element('ul', {},
    element('li', { class: 'h-site-menu-item' }, element('a', { href: '/a' }, 'A')),
    element('li', { class: 'h-site-menu-item' }, element('a', { href: '/a', hreflang: 'fre' }, 'FRE')));
  const doc = { querySelectorAll: (selector) => list.querySelectorAll(selector) };
  markMenus(doc, '/a', (href) => href);
  const items = list.querySelectorAll('.h-site-menu-item');
  assert.equal(items[0].classList.contains('is-current'), true);
  assert.equal(items[1].classList.contains('is-current'), false);
});

test('record page (plan 27g): a link to a record is a view of its own, a page and its record', async () => {
  const { navigator, main, calls } = setup({ cache: 5 });
  navigator.start();
  assert.equal(navigator.viewOf(`${BASE}/10`).key, 10, 'the record page without a record is a page');
  assert.equal(navigator.viewOf(`${BASE}/7/3`), null, 'a page that is not a record page');
  assert.equal(navigator.viewOf('https://h/?db=db&site=5&pageid=10&rec=3'), null, 'another URL form of another page');
  const event = click(element('a', { href: `${BASE}/10/42` }));
  navigator.onClick(event);
  assert.equal(event.defaultPrevented, true);
  await flush();
  await flush();
  assert.equal(navigator.current, '10/42');
  assert.deepEqual(calls.pushed, [`${BASE}/10/42`]);
  await navigator.go(navigator.viewOf(`${BASE}/10/43`));
  const shown = [...main.children].filter((item) => !item.hidden);
  assert.deepEqual(shown.map((item) => [item.getAttribute('data-h-page'), item.getAttribute('data-h-record')]), [['10', '43']]);
  assert.equal(main.children.length, 3, 'two records of the record page: two sections');
  await navigator.go(navigator.viewOf(`${BASE}/10/42`), { push: false });
  assert.equal(calls.fetched.length, 2, 'the first record again: no new load');
});

test('record page in the parameter form: &rec= of the page URL', () => {
  const { navigator } = setup();
  navigator.pages.push({ id: 12, url: 'https://h/?db=db&site=5&pageid=12', title: 'Place', record: true });
  assert.equal(navigator.viewOf('https://h/?db=db&site=5&pageid=12&rec=7').key, '12/7');
  assert.equal(navigator.viewOf('https://h/?db=db&site=5&pageid=12&rec=7&lang=fre'), null, 'another language: full load');
});

test('scroll (plan 27g): a hidden or record page is shown alone, back on the long page at the same place', async () => {
  const { navigator, main, win } = setup({ mode: 'scroll' });
  navigator.start();
  assert.deepEqual([...main.children].map((item) => item.getAttribute('data-h-page')), ['5', '7', '8', '9'], 'no placeholders of hidden or record pages');
  win.scrollY = 1200;
  await navigator.go(navigator.viewOf(`${BASE}/10/42`));
  assert.deepEqual([...main.children].filter((item) => !item.hidden).map((item) => item.getAttribute('data-h-page')), ['10']);
  assert.ok(navigator.alone);
  await navigator.go(11);
  assert.deepEqual([...main.children].filter((item) => !item.hidden).map((item) => item.getAttribute('data-h-page')), ['11']);
  await navigator.go(5, { push: false });
  assert.equal(navigator.alone, null);
  assert.deepEqual([...main.children].filter((item) => !item.hidden).map((item) => item.getAttribute('data-h-page')), ['5', '7', '8', '9']);
  assert.equal(win.scrolled.at(-1), 1200, 'the scroll position of the long page');
});
