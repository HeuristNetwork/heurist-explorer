/**
 * @file siteExtras.test.js
 * @brief Extras of plan 27k §6: back to top, accordion options, reveal on scroll, section menu, breadcrumbs (path and
 *        history trail), search box of an action menu.
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

const document = installFakeDom();
const { attachBackToTop, enhanceAccordion, enhanceReveal } = await import('../src/siteRuntime.js');
const { TRAIL_MAX, mountBreadcrumbs, readTrail, recordTrail, renderBreadcrumbs } = await import('../src/siteBreadcrumbs.js');
const { menuPath, sectionTree } = await import('#shared/site/cmsMenu.js');
const { actionMenuItems, HMenu } = await import('#shared/widgets/site/HMenu.js');
const { CmsRecordDocument } = await import('#shared/site/cmsEdit.js');
const { cmsLayoutProblems } = await import('#shared/site/cmsDocument.js');

/** An element with attributes and children. */
function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  for (const child of children) node.append(child);
  return node;
}

/** A storage in memory. */
function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

const TREE = [
  { id: 1, title: 'About', url: '/1', children: [
    { id: 2, title: 'Team', url: '/2', children: [] },
    { id: 3, title: 'History', url: '/3', current: true, children: [] },
    { id: 4, title: 'Person', url: '/4', record: true, children: [] }
  ] },
  { id: 5, title: 'Contact', url: '/5', children: [] }
];

test('section menu (plan 27k §6): the page with its sub pages, else its parent and the pages beside it', () => {
  assert.deepEqual(menuPath(TREE).map((item) => item.id), [1, 3]);
  // History has no sub pages: About (no sub entries) and its sub pages without the record page
  const section = sectionTree(TREE);
  assert.deepEqual(section.map((item) => item.id), [1, 2, 3]);
  assert.deepEqual(section[0].children, []);
  // About is the current page: itself and its sub pages
  const about = [{ ...TREE[0], current: true, children: TREE[0].children.map((item) => ({ ...item, current: false })) }, TREE[1]];
  assert.deepEqual(sectionTree(about).map((item) => item.id), [1, 2, 3]);
  // a page of the first level without sub pages, the home page (not in the tree): the first level (review 2026-11-16)
  const home = TREE.map((item) => ({ ...item, children: item.children.map((child) => ({ ...child, current: false })) }));
  assert.deepEqual(sectionTree(home).map((item) => item.id), [1, 5], 'the home page');
  const first = sectionTree([home[0], { ...home[1], current: true }]);
  assert.deepEqual(first.map((item) => item.id), [1, 5]);
  assert.deepEqual(first[0].children, [], 'without sub pages');
});

test('accordion (plan 27k §6): one open at a time unless multiple; the first open at start', () => {
  const sections = () => [element('details'), element('details'), element('details')];
  const single = element('div', { 'data-h-control': 'accordion', 'data-h-first-open': 'true' }, ...sections());
  enhanceAccordion(single);
  const [first, second] = single.children;
  assert.equal(first.open, true, 'the first one open');
  second.open = true;
  second.fire('toggle');
  assert.equal(first.open, false, 'one at a time');
  const multiple = element('div', { 'data-h-control': 'accordion', 'data-h-multiple': 'true' }, ...sections());
  enhanceAccordion(multiple);
  assert.ok(!multiple.children[0].open, 'none open without the option');
  multiple.children[0].open = true;
  multiple.children[1].open = true;
  multiple.children[1].fire('toggle');
  assert.equal(multiple.children[0].open, true, 'several open');
});

test('accordion options and reveal in the document (plan 27k §6): attributes, defaults not written', () => {
  const doc = new CmsRecordDocument({ parts: { content: '' }, config: JSON.stringify({ schema: 'heurist-cms/4' }) });
  const accordion = doc.insertElement('content', 'accordion', { id: null, position: 'inside' });
  assert.deepEqual(doc.accordionLook(accordion), { multiple: false, firstOpen: false });
  assert.equal(doc.setAccordionLook(accordion, { multiple: true, firstOpen: true }), true);
  assert.match(doc.html('content'), /data-h-multiple="true"/);
  assert.match(doc.html('content'), /data-h-first-open="true"/);
  assert.equal(doc.setAccordionLook(accordion, { multiple: true, firstOpen: true }), false, 'no change');
  doc.setAccordionLook(accordion, {});
  assert.doesNotMatch(doc.html('content'), /data-h-multiple|data-h-first-open/);
  const text = doc.insertElement('content', 'text', { id: null, position: 'inside' });
  assert.equal(doc.setReveal(text, 'up'), true);
  assert.equal(doc.reveal(text), 'up');
  assert.equal(doc.setReveal(text, 'spin'), true, 'an unknown value removes it');
  assert.equal(doc.reveal(text), '');
  assert.equal(doc.accordionLook(text), null);
});

test('reveal on scroll (plan 27k §6): hidden until seen; nothing with reduced motion or without the observer', () => {
  let callback = null;
  const observed = [];
  class Observer {
    constructor(handler) { callback = handler; }
    observe(target) { observed.push(target); }
    unobserve(target) { observed.splice(observed.indexOf(target), 1); }
  }
  const item = element('div', { 'data-h-reveal': 'fade' });
  const root = element('div', {}, item);
  enhanceReveal(root, { Observer, reduced: false });
  assert.ok(item.classList.contains('h-site-reveal-pending'));
  callback([{ target: item, isIntersecting: true }]);
  assert.ok(!item.classList.contains('h-site-reveal-pending'));
  assert.ok(item.classList.contains('h-site-reveal-done'));
  assert.equal(observed.length, 0);
  assert.equal(enhanceReveal(root, { Observer, reduced: false }), null, 'a revealed element is not hidden again');
  const other = element('div', {}, element('div', { 'data-h-reveal': 'up' }));
  assert.equal(enhanceReveal(other, { Observer, reduced: true }), null);
  assert.equal(enhanceReveal(other, { Observer: undefined, reduced: false }), null);
  assert.ok(!other.children[0].classList.contains('h-site-reveal-pending'));
});

test('back to top (plan 27k §6): shown after one screen of scrolling, a click scrolls up', () => {
  const listeners = {};
  const calls = [];
  const win = {
    scrollY: 0, innerHeight: 800,
    addEventListener: (type, handler) => { listeners[type] = handler; },
    removeEventListener: (type) => { delete listeners[type]; },
    scrollTo: (options) => calls.push(options)
  };
  const body = element('div');
  const detach = attachBackToTop(body, { win });
  const button = body.querySelector('.h-site-back-to-top-button');
  assert.ok(button);
  assert.ok(!button.classList.contains('is-visible'));
  win.scrollY = 900;
  listeners.scroll();
  assert.ok(button.classList.contains('is-visible'));
  button.click();
  assert.deepEqual(calls, [{ top: 0, behavior: 'smooth' }]);
  detach();
  assert.equal(body.querySelector('.h-site-back-to-top-button'), null);
  assert.deepEqual(cmsLayoutProblems({ backToTop: true }), []);
  assert.equal(cmsLayoutProblems({ backToTop: 'yes' }).length, 1);
});

test('breadcrumbs (plan 27k §6): the trail of record pages, cut when a record comes again, at most TRAIL_MAX', () => {
  const storage = memoryStorage();
  const config = (record, title) => ({ runtime: { database: 'db' }, site: { id: 5, pageId: 10, record, recordTitle: title,
    language: 'eng', languages: [{ code: 'eng', url: `/db/site/5/10/${record}` }] } });
  recordTrail(config(1, 'Smith'), { storage });
  recordTrail(config(2, 'Paris'), { storage });
  recordTrail(config(3, 'London'), { storage });
  assert.deepEqual(readTrail(config(3), storage).map((item) => item.title), ['Smith', 'Paris', 'London']);
  recordTrail(config(2, 'Paris'), { storage });
  assert.deepEqual(readTrail(config(2), storage).map((item) => item.record), [1, 2], 'cut at the record opened again');
  assert.equal(readTrail(config(2), storage)[1].url, '/db/site/5/10/2');
  for (let record = 10; record < 20; record++) recordTrail(config(record, `R${record}`), { storage });
  assert.equal(readTrail(config(1), storage).length, TRAIL_MAX);
  // another page or the designer: nothing added
  const before = readTrail(config(1), storage).length;
  recordTrail({ runtime: { database: 'db' }, site: { id: 5, pageId: 7 } }, { storage });
  recordTrail({ runtime: { database: 'db', design: true }, site: { id: 5, record: 99 } }, { storage });
  assert.equal(readTrail(config(1), storage).length, before);
});

test('breadcrumbs (plan 27k §6): history on a record page shows Home and the trail; the draft shows the path', () => {
  const storage = memoryStorage();
  const config = { runtime: { database: 'db' }, site: { id: 5, pageId: 10, record: 2, recordTitle: 'Paris', language: 'eng',
    languages: [{ code: 'eng', url: '/r/2' }] } };
  recordTrail({ ...config, site: { ...config.site, record: 1, recordTitle: 'Smith', languages: [{ code: 'eng', url: '/r/1' }] } }, { storage });
  recordTrail(config, { storage });
  // the server wrote Home › People › Person page › Paris
  const list = element('ol', { 'data-h-mode': 'history' });
  list.className = 'h-site-breadcrumbs';
  renderBreadcrumbs(list, [{ title: 'Home', url: '/' }, { title: 'People', url: '/p' }, { title: 'Paris' }]);
  const host = element('nav', {}, list);
  mountBreadcrumbs(host, { settings: { mode: 'history' } }, config, { storage });
  assert.deepEqual([...list.children].map((item) => item.textContent), ['Home', 'Smith', 'Paris']);
  assert.equal(list.children[1].querySelector('a').getAttribute('href'), '/r/1');
  assert.equal(list.children[2].getAttribute('aria-current'), 'page');
  // the draft of the designer: the path of the menu tree
  const draft = element('nav');
  mountBreadcrumbs(draft, { settings: {} }, { runtime: { design: true }, site: { homeItem: { title: 'Home', url: '/' }, menu: TREE } });
  assert.deepEqual([...draft.querySelector('.h-site-breadcrumbs').children].map((item) => item.textContent), ['Home', 'About', 'History']);
});

test('search box (plan 27k §6): an item of the action menu as a form; the draft sends nothing', () => {
  const items = actionMenuItems({ items: [{ label: 'Find people', action: 'search', target: 7, source: 3, param: 'X1', values: {} }] });
  assert.deepEqual(items[0].search, { param: 'X1', placeholder: 'Find people' });
  const host = element('nav');
  new HMenu().attach(host, { items, settings: { presentation: 'row' } }).render();
  const entry = host.querySelector('.h-site-menu-search');
  assert.ok(entry);
  const input = entry.querySelector('input');
  assert.equal(input.getAttribute('name') ?? input.name, 'v.X1');
  assert.equal(input.placeholder, 'Find people');
  const form = entry.querySelector('form');
  let prevented = null;
  form.addEventListener('submit', (event) => { prevented = event.defaultPrevented; });
  form.fire('submit', { cancelable: true });
  assert.equal(prevented, true);
});

test('review 2026-11-16: menu variables, Home caption, the name on the button, grow, own style of the header', async () => {
  const { menuStyle } = await import('#shared/site/cmsMenu.js');
  const { compileCmsStyles } = await import('#shared/site/cmsDocument.js');
  assert.equal(menuStyle({ lineWidth: '3px', lineColor: '#c00', overlayBg: 'navy', overlayText: 'url(x)' }),
    '--h-site-menu-line-width:3px;--h-site-menu-line-color:#c00;--h-site-menu-overlay-bg:navy;', 'a value not allowed is left out');
  assert.equal(menuStyle({ lineWidth: '9px' }), '');
  // the website menu: its variables, Home in the language of the page
  const host = element('nav');
  new HMenu().attach(host, {
    items: TREE, settings: { showHome: true, style: 'underline', lineWidth: '4px' },
    homeItem: { title: 'Home', url: '/', home: true, description: 'My site', children: [] }
  }).render();
  const nav = host.querySelector('.h-site-menu');
  assert.equal(nav.getAttribute('style'), '--h-site-menu-line-width:4px;');
  const homeEntry = host.querySelector('.is-home');
  assert.ok(homeEntry);
  assert.equal(homeEntry.querySelector('.h-site-menu-text').textContent, 'Home');
  assert.equal(homeEntry.querySelector('a').getAttribute('title'), 'My site', 'the name of the website is the rollover');
  // behind a button with its name, opened by a click (the former drop-down)
  const dropdown = element('nav');
  new HMenu().attach(dropdown, { items: [], settings: { presentation: 'dropdown', label: 'More' } }).render();
  const toggle = dropdown.querySelector('.h-site-menu-toggle');
  assert.equal(toggle.querySelector('.h-site-menu-toggle-text').textContent, 'More');
  assert.equal(toggle.querySelector('i'), null, 'no icon: the name only');
  assert.ok(dropdown.querySelector('.h-site-menu').classList.contains('h-site-menu-open-click'));
  // grow: the class, the items as always
  const grow = element('nav');
  new HMenu().attach(grow, { items: actionMenuItems({ items: [{ label: 'Mail', icon: 'fa-solid fa-envelope', action: 'url', target: '/m' }] }),
    settings: { presentation: 'grow' } }).render();
  assert.ok(grow.querySelector('.h-site-menu').classList.contains('h-site-menu-grow'));
  // the own style of the header and footer (document, CSS)
  const doc = new CmsRecordDocument({ parts: { header: '' }, config: JSON.stringify({ schema: 'heurist-cms/4' }) });
  doc.setPartStyle('header', { 'background-color': '#123456', height: '120px' });
  doc.setPartStyle('page', { color: 'red' });
  assert.deepEqual(doc.partStyle('header'), { 'background-color': '#123456', height: '120px' });
  assert.deepEqual(doc.partStyle('page'), {}, 'header and footer only');
  const { css } = compileCmsStyles({}, [], '', { parts: { header: doc.partStyle('header') } });
  assert.match(css, /html\.h-site \.h-site-header\{[^}]*background-color:#123456/);
  assert.match(css, /min-height:120px/, 'the height is a minimum');
  doc.setPartStyle('header', {});
  assert.equal(doc.config.styles.header, undefined);
});

test('review 2026-11-16 round 2: breadcrumbs configured, fa-solid by default, search box parameters, colours', async () => {
  const { faIcon, menuStyle } = await import('#shared/site/cmsMenu.js');
  const { searchParameters } = await import('../src/designer/savedFilterField.js');
  // breadcrumbs with mode path (empty settings) are configured
  const doc = new CmsRecordDocument({ parts: { content: '' }, config: JSON.stringify({ schema: 'heurist-cms/4' }) });
  doc.insertElement('content', 'breadcrumbs', { id: null, position: 'inside' });
  assert.equal(doc.tree('content').find((item) => item.type === 'breadcrumbs')?.configured, true);
  // icons: fa-solid when no style is given
  assert.equal(faIcon('fa-star'), 'fa-solid fa-star');
  assert.equal(faIcon('fa-brands fa-github'), 'fa-brands fa-github');
  assert.equal(faIcon('fas fa-star'), 'fas fa-star');
  assert.equal(faIcon('star'), '');
  assert.equal(faIcon('fa-x"><script>'), '');
  assert.equal(actionMenuItems({ items: [{ label: 'A', icon: 'fa-star', action: 'url', target: '/a' }] })[0].fa, 'fa-solid fa-star');
  // colours of the website
  assert.equal(menuStyle({ lineColor: 'var(--h-color-primary)' }), '--h-site-menu-line-color:var(--h-color-primary);');
  // search box: text, number and date parameters only
  const dbdefs = { fieldGlobal: (id) => ({ 1: { type: 'freetext' }, 2: { type: 'enum' }, 3: { type: 'resource' }, 4: { type: 'date' } })[id] };
  const described = {
    A: { type: 'text', fieldId: 1, predicate: 'f' }, B: { type: 'enum', fieldId: 2, predicate: 'f' },
    C: { type: 'text', fieldId: 3, predicate: 'f' }, D: { type: 'date', fieldId: 4, predicate: 'f' },
    E: { type: 'geo', predicate: 'geo' }, F: { type: 'text', predicate: 'title' }, G: { type: 'text', predicate: 'owner' },
    H: { type: 'number', fieldId: 4, predicate: 'f', range: true, endInput: 'I' }, I: { type: 'number', fieldId: 4, predicate: 'f' }
  };
  assert.deepEqual(searchParameters(described, dbdefs), ['A', 'D', 'F']);
});

test('Add page (2026-11-16): the first text field of the form gets the focus', async () => {
  const { focusFirstField } = await import('../src/designer/designerDialogs.js');
  const host = element('div');
  const hidden = element('input', { type: 'hidden' });
  const off = element('input', { type: 'text' });
  off.disabled = true;
  const title = element('input', { type: 'text' });
  let focused = false;
  let selected = false;
  title.focus = () => { focused = true; };
  title.select = () => { selected = true; };
  host.append(hidden, off, title, element('input', { type: 'text' }));
  for (const input of host.children) input.type = input.getAttribute('type');
  assert.equal(focusFirstField(host), title);
  assert.ok(focused && selected);
  assert.equal(focusFirstField(element('div')), null);
});
