import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { SOCIAL_NETWORKS, socialSettings, socialUrls, sitePageList } = await import('../src/designer/actionForms.js');
const { buildBadgesHtml } = await import('../src/designer/badgesForm.js');
const { actionMenuItems, menuClass } = await import('#shared/widgets/site/HMenu.js');
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
