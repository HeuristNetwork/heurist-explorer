import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { SOCIAL_NETWORKS, socialSettings, socialUrls, sitePageList } = await import('../src/designer/actionForms.js');
const { buildBadgesHtml } = await import('../src/designer/badgesForm.js');
const { HMenu, actionMenuItems, menuClass } = await import('#shared/widgets/site/HMenu.js');
const { setLayout } = await import('../src/designer/designerStyles.js');

test('social media preset (plan 27f §6): icon items for the networks with an address, and back', () => {
  const settings = socialSettings({ mastodon: 'https://mastodon.social/@heurist', email: 'info@example.org', facebook: ' ' });
  assert.equal(settings.preset, 'social');
  assert.equal(settings.presentation, 'icons');
  assert.deepEqual(settings.items.map((item) => item.label), ['Mastodon', 'Email'], 'in the order of the list, empty ones left out');
  assert.equal(settings.items[1].target, 'mailto:info@example.org');
  assert.equal(settings.items[1].newTab, false);
  assert.equal(settings.items[0].iconOnly, true);
  assert.deepEqual(socialUrls(settings), { mastodon: 'https://mastodon.social/@heurist', email: 'info@example.org' });
  assert.ok(SOCIAL_NETWORKS.every((network) => /^fa-(brands|solid) fa-/.test(network.icon)));
});

test('action menu items (plan 27f §6): pages, URLs, Add record; other actions left out', () => {
  const items = actionMenuItems({
    items: [
      { label: 'About', action: 'page', target: 7 },
      { label: 'Heurist', labels: { fre: 'Heurist (fr)' }, action: 'url', target: 'https://heuristnetwork.org', newTab: true, icon: 'fa-solid fa-globe' },
      { label: 'Add person', action: 'addRecord', target: 10 },
      { label: 'Bad', action: 'script', target: 'x' },
      { label: 'Icon', action: 'url', target: '/x', icon: 'fa-solid fa-x"><script>' }
    ]
  }, { language: 'fre', pageUrl: (id) => `/site/5/${id}` });
  assert.deepEqual(items.map((item) => item.title), ['About', 'Heurist (fr)', 'Add person', 'Icon']);
  assert.equal(items[0].url, '/site/5/7');
  assert.equal(items[1].newTab, true);
  assert.equal(items[1].fa, 'fa-solid fa-globe');
  assert.deepEqual([items[2].action, items[2].target], ['addRecord', '10']);
  assert.equal(items[3].fa, '', 'not an icon class');
  assert.equal(menuClass({ presentation: 'icons' }), 'h-site-menu h-site-menu-icons');
  assert.equal(menuClass({ orientation: 'vertical' }), 'h-site-menu h-site-menu-vertical');
});

test('item styles and presentations (plan 27k §1-2): stored links / buttons = a row with that style', async () => {
  const { menuLook } = await import('#shared/widgets/site/HMenu.js');
  const row = { orientation: 'horizontal', open: 'hover', buttonText: false };
  assert.deepEqual(menuLook({ presentation: 'buttons' }), { presentation: 'row', style: 'buttons', ...row });
  assert.deepEqual(menuLook({ presentation: 'links', style: 'pills' }), { presentation: 'row', style: 'pills', ...row });
  assert.deepEqual(menuLook({}), { presentation: 'menu', style: 'plain', ...row }, 'the website menu');
  // a stored drop-down (review 2026-11-16): behind a button opened by a click, a column, the name on the button
  assert.deepEqual(menuLook({ presentation: 'dropdown' }),
    { presentation: 'expand', style: 'plain', orientation: 'vertical', open: 'click', buttonText: true });
  assert.deepEqual(menuLook({ presentation: 'dropdown', open: 'hover', orientation: 'horizontal', buttonText: false }),
    { presentation: 'expand', style: 'plain', orientation: 'horizontal', open: 'hover', buttonText: false });
  assert.equal(menuClass({ presentation: 'buttons' }), 'h-site-menu h-site-menu-style-buttons');
  assert.equal(menuClass({ style: 'underline', orientation: 'auto' }), 'h-site-menu h-site-menu-auto h-site-menu-style-underline');
  assert.equal(menuClass({ presentation: 'expand', orientation: 'vertical', style: 'pills' }),
    'h-site-menu h-site-menu-vertical h-site-menu-expanding h-site-menu-style-pills');
  assert.equal(menuClass({ presentation: 'dropdown', style: 'buttons' }),
    'h-site-menu h-site-menu-vertical h-site-menu-expanding h-site-menu-style-buttons h-site-menu-open-click', 'a drop-down: expand by a click');
  assert.equal(menuClass({ presentation: 'grow', orientation: 'vertical' }), 'h-site-menu h-site-menu-vertical h-site-menu-grow');
  assert.equal(menuClass({ presentation: 'row', style: 'bad' }), 'h-site-menu', 'an unknown style is plain');
});

test('expanding action menu (plan 27k §2): a button with its icon and name, the list opens and closes', () => {
  const host = document.createElement('div');
  const menu = new HMenu().attach(host, {
    items: actionMenuItems({ items: [{ label: 'Mastodon', icon: 'fa-brands fa-mastodon', iconOnly: true, action: 'url', target: 'https://m' }] }),
    settings: { presentation: 'expand', icon: 'fa-solid fa-plus', label: 'Follow us' }
  }).render();
  const nav = host.querySelector('.h-site-menu');
  assert.ok(nav.classList.contains('h-site-menu-expanding'));
  const toggle = nav.querySelector('.h-site-menu-toggle');
  assert.equal(toggle.getAttribute('aria-label'), 'Follow us');
  assert.equal(toggle.querySelector('i').className, 'fa-solid fa-plus');
  toggle.click();
  assert.ok(nav.classList.contains('is-open'));
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  toggle.click();
  assert.ok(!nav.classList.contains('is-open'));
  menu.destroy();
  const bad = document.createElement('div');
  new HMenu().attach(bad, { items: [], settings: { presentation: 'expand', icon: 'x"><script>' } }).render();
  assert.equal(bad.querySelector('.h-site-menu-toggle').querySelector('i').className, 'fa-solid fa-share-nodes', 'not an icon class: the default');
});

test('full-screen website menu (plan 27k §5): classes, the overlay opens with the list and closes', async () => {
  assert.equal(menuClass({ collapse: 'fullscreen', animation: 'right', alwaysCollapsed: true }),
    'h-site-menu h-site-menu-fullscreen h-site-menu-anim-right h-site-menu-always-collapsed');
  assert.equal(menuClass({ collapse: 'fullscreen', animation: 'down' }), 'h-site-menu h-site-menu-fullscreen', 'down: no class');
  assert.equal(menuClass({ presentation: 'row', collapse: 'fullscreen' }), 'h-site-menu', 'not for an action menu');
  const Observer = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  try {
    const host = document.createElement('nav');
    document.body.append(host);
    const menu = new HMenu().attach(host, {
      items: [{ title: 'About', url: '/a', children: [] }, { title: 'Team', url: '/t', children: [] }],
      settings: { collapse: 'fullscreen', animation: 'fade', alwaysCollapsed: true }
    }).render();
    const nav = host.querySelector('.h-site-menu');
    assert.ok(nav.classList.contains('is-narrow'), 'always collapsed: behind its button');
    nav.querySelector('.h-site-menu-toggle').click();
    const overlay = document.body.querySelector('.h-site-menu-overlay');
    assert.ok(overlay, 'the overlay is in the page');
    assert.ok(overlay.classList.contains('h-site-menu-anim-fade'));
    assert.equal(overlay.getAttribute('role'), 'dialog');
    assert.ok(overlay.querySelector('.h-site-menu-list'), 'the list is in the overlay');
    assert.equal(nav.querySelector('.h-site-menu-list'), null);
    assert.ok(document.documentElement.classList.contains('h-site-menu-locked'), 'the page does not scroll');
    overlay.querySelector('.h-site-menu-close').click();
    assert.ok(!nav.classList.contains('is-open'));
    assert.ok(!document.documentElement.classList.contains('h-site-menu-locked'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.ok(nav.querySelector('.h-site-menu-list'), 'the list is back in the menu after the animation');
    assert.equal(document.body.querySelector('.h-site-menu-overlay'), null);
    menu.destroy();
    host.remove();
  } finally {
    globalThis.ResizeObserver = Observer;
  }
});

test('social media preset (plan 27k §2): expand, style and orientation; defaults not written', () => {
  const settings = socialSettings({ github: 'https://github.com/x' },
    { presentation: 'expand', style: 'outline', orientation: 'vertical', icon: ' fa-solid fa-plus ', label: 'Follow' });
  assert.deepEqual({ ...settings, items: undefined },
    { preset: 'social', presentation: 'expand', style: 'outline', orientation: 'vertical', icon: 'fa-solid fa-plus', label: 'Follow', items: undefined });
  const icons = socialSettings({ github: 'https://github.com/x' }, { presentation: 'icons', style: 'plain', orientation: 'horizontal', icon: 'fa-x' });
  assert.deepEqual(Object.keys(icons), ['preset', 'presentation', 'items']);
});

test('pages of the website for the action menu: Home, then the menu tree with its depth', () => {
  const list = sitePageList({ id: 5, pages: [{ id: 7, title: 'About', children: [{ id: 8, title: 'Team' }] }, { id: 9 }] });
  assert.deepEqual(list.map((page) => [page.id, page.depth]), [[5, 0], [7, 1], [8, 2], [9, 1]]);
  assert.equal(list[3].title, '#9');
  // plan 27g: Go to a page without record pages (they need a record)
  const pages = [{ id: 7, title: 'About' }, { id: 10, title: 'Person', record: true }];
  assert.deepEqual(sitePageList({ id: 5, pages }, 'Home', { records: false }).map((page) => page.id), [5, 7]);
  assert.deepEqual(sitePageList({ id: 5, pages }).map((page) => page.id), [5, 7, 10]);
});

test('badges (plan 27f §7): a link per logo, alignment and gap of the row, grey until hover', async () => {
  const { fileMediaUrls } = await import('#shared/recordview/fileMediaItem.js');
  const urls = fileMediaUrls('/h/', 'db');
  const file = { key: 'abc', name: 'logo.png', ext: 'png', mime: 'image/png' };
  const html = buildBadgesHtml([
    { file, title: 'Sponsor "A"', url: 'https://a.org' },
    { file, title: 'No link', url: 'javascript:alert(1)' },
    { file: null, title: 'Missing' }
  ], { height: 40, align: 'end', gap: 8, grey: true }, { urls });
  // alignment and gap are on the host (siteRuntime badgesLayout): the purifier removes a style of the stored HTML
  assert.match(html, /^<div class="h-site-badges-row is-grey"><a /);
  assert.match(html, /<a class="h-site-badge" href="https:\/\/a.org" target="_blank" rel="noopener" title="Sponsor &quot;A&quot;">/);
  assert.match(html, /<span class="h-site-badge" title="No link">/, 'an unsafe URL is not a link');
  assert.doesNotMatch(html, /javascript:/);
  assert.equal((html.match(/h-site-badge"/g) || []).length, 2, 'a file that is not found is left out');
});

test('layout settings of the Styles popup: defaults are not written', () => {
  const layout = {};
  setLayout(layout, 'navigation', 'scroll');
  setLayout(layout, 'header.position', 'slide');
  setLayout(layout, 'footer.position', 'default');
  setLayout(layout, 'cache', 8);
  assert.deepEqual(layout, { navigation: 'scroll', header: { position: 'slide' } });
  setLayout(layout, 'header.position', 'fixed');
  setLayout(layout, 'navigation', 'reload');
  assert.deepEqual(layout, {});
});

test('layout of plan 27f §13: rows, header and footer themes, own colours; no shrink', async () => {
  const { cmsLayoutProblems, CMS_LAYOUT } = await import('#shared/site/cmsDocument.js');
  assert.deepEqual(CMS_LAYOUT.header.position, ['fixed', 'scroll', 'slide', 'none']);
  assert.deepEqual(cmsLayoutProblems({ header: { rows: 'two', theme: 'own', colors: { bg: '#fff', text: 'rgb(1, 2, 3)' } },
    footer: { theme: 'primary' } }), []);
  assert.equal(cmsLayoutProblems({ header: { position: 'shrink' } }).length, 1);
  assert.equal(cmsLayoutProblems({ header: { colors: { bg: 'url(x)' } } }).length, 1, 'a colour that is not allowed');
  // Search engines (plan 27m §5): true or false (CmsValidator::layoutProblems)
  assert.deepEqual(cmsLayoutProblems({ searchEngines: false }), []);
  assert.equal(cmsLayoutProblems({ searchEngines: 'no' }).length, 1);
  assert.equal(cmsLayoutProblems({ footer: { colors: { border: '#fff' } } }).length, 1, 'only bg and text');
  const layout = {};
  setLayout(layout, 'header.rows', 'two');
  setLayout(layout, 'header.theme', 'own');
  setLayout(layout, 'header.colors', { bg: '#000' });
  assert.deepEqual(layout, { header: { rows: 'two', theme: 'own', colors: { bg: '#000' } } });
  setLayout(layout, 'header.rows', 'auto');
  setLayout(layout, 'header.theme', 'default');
  setLayout(layout, 'header.colors', null);
  assert.deepEqual(layout, {}, 'defaults are not written');
});

test('layout of plan 27k §4: header.onScroll keep | shrink, the default not written', async () => {
  const { cmsLayoutProblems, CMS_LAYOUT } = await import('#shared/site/cmsDocument.js');
  assert.deepEqual(CMS_LAYOUT.header.onScroll, ['keep', 'shrink']);
  assert.deepEqual(cmsLayoutProblems({ header: { onScroll: 'shrink' } }), []);
  assert.equal(cmsLayoutProblems({ header: { onScroll: 'hide' } }).length, 1);
  const layout = {};
  setLayout(layout, 'header.onScroll', 'shrink');
  assert.deepEqual(layout, { header: { onScroll: 'shrink' } });
  setLayout(layout, 'header.onScroll', 'keep');
  assert.deepEqual(layout, {});
});

test('action menu items (plan 27g): Record page and Back shown in the draft', () => {
  const items = actionMenuItems({ items: [{ label: 'Person', action: 'recordPage', target: 10, record: 42 }, { label: 'Back', action: 'back' }] });
  assert.deepEqual(items.map((item) => [item.title, item.url, item.action]), [['Person', '#', undefined], ['Back', '#', 'back']]);
});

test('Back (plan 27g): the page before from this website, else the link (the home page)', async () => {
  const { onAction } = await import('../src/siteRuntime.js');
  const link = { getAttribute: (name) => ({ 'data-h-action': 'back', 'data-h-target': null })[name] };
  const event = () => ({ target: { closest: () => link }, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  const calls = [];
  const history = { length: 3, state: null, back: () => calls.push('back') };
  const location = { href: 'https://h/db/site/5/10/42' };
  const inside = event();
  assert.equal(onAction(inside, { history, location, referrer: 'https://h/db/site/5/7' }), true);
  assert.deepEqual([inside.defaultPrevented, calls], [true, ['back']]);
  const outside = event();
  onAction(outside, { history, location, referrer: 'https://www.google.com/' });
  assert.equal(outside.defaultPrevented, false, 'from a search engine: the link opens the home page');
  const navigated = event();
  onAction(navigated, { history: { ...history, state: { hPage: 10, hRecord: 42 } }, location, referrer: '' });
  assert.equal(navigated.defaultPrevented, true, 'swap / scroll: the navigator has the page before in the history');
});

test('website menu: the description of a page is the rollover in every format; an icon only entry without it: its title', () => {
  const host = document.createElement('div');
  new HMenu().attach(host, { items: [
    { title: 'About', url: '/a', description: 'Who we are' },
    { title: 'Map', url: '/m', format: 'icon', icon: 'map.png' },
    { title: 'Team', url: '/t' }
  ] }).render();
  const links = host.querySelectorAll('a');
  assert.deepEqual(links.map((link) => link.getAttribute('title')), ['Who we are', 'Map', null]);
});

test('record page picker: no record page = the button Define new record page with its caption (2026-11-14)', async () => {
  const { recordPagePicker } = await import('../src/designer/recordPageField.js');
  const empty = recordPagePicker({ recordPageTerms: () => [], createRecordPage: async () => ({ id: 3 }) });
  assert.equal(empty.select.hidden, true, 'no select without record pages');
  assert.match(empty.element.querySelector('.h-cms-new-record-page').textContent, /Define new record page/);
  const some = recordPagePicker({ recordPageTerms: () => [{ id: 3, label: 'Person' }], createRecordPage: async () => ({ id: 4 }) }, 3);
  assert.equal(some.select.hidden, false);
  assert.equal(some.select.value, '3');
  assert.equal(some.element.querySelector('.h-cms-new-record-page-caption'), null, 'an icon only beside the select');
});
