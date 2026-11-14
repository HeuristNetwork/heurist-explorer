/**
 * @file cmsPageTemplates.test.js
 * @brief Page templates of a website (plan 27i §9): each template with all and with no elements ticked gives a valid
 *        page, grid groups, the page as the root group, placeholders and banners of the bundle.
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
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { cmsPageStarter } from '../src/site/cmsEdit.js';
import {
  CMS_ABOUT_TOPICS, CMS_BANNERS, CMS_PLACEHOLDERS, CMS_TEAM_TEMPLATE, CMS_TEMPLATE_ELEMENTS, CMS_TEMPLATE_PAGES, pickBanners
} from '../src/site/cmsPageTemplates.js';
import { buildCmsMedia, buildCmsPlaceholder, cmsAssetUrl } from '../src/site/cmsMedia.js';
import { CMS_ASSET_NAME, checkCmsDocument, parseCmsConfig } from '../src/site/cmsDocument.js';

const baseUrl = 'https://h.org/heurist/';
const urls = {
  file: (key) => `${baseUrl}?db=x&file=${key}`,
  thumb: (key) => `${baseUrl}?db=x&thumb=${key}`,
  osd: () => '', mirador: () => ''
};
const logo = { key: 'abc1', id: 11, name: 'logo.png', ext: 'png' };
const builders = {
  mediaHtml: (file, settings) => buildCmsMedia(file, settings, { urls }),
  placeholderHtml: (name, settings) => buildCmsPlaceholder(name, settings, baseUrl),
  assetUrl: (name) => cmsAssetUrl(baseUrl, name),
  galleryHtml: (names) => ({ def: names.map((name) => `<figure>${buildCmsPlaceholder(name, {}, baseUrl)}</figure>`).join('') }),
  random: () => 0
};
const site = { title: 'My project', subtitle: 'A study', summary: 'First line\n\nSecond', logo, homeId: 7 };

/** A starter and its problems (errors and the warnings of the elements made by the template). */
function built(template, title, options = {}) {
  const page = cmsPageStarter(template, title, { ...builders, site, ...options });
  const config = parseCmsConfig(page.configuration).config;
  const issues = checkCmsDocument(config, [page.content], {}, baseUrl).filter((issue) => issue.level === 'error'
    || ['media_settings', 'style_value', 'style_property', 'duplicate_node', 'widget_settings'].includes(issue.code));
  return { page, config, issues };
}

/** Node styles of a page. */
const styles = (config) => Object.values(config.styles.nodes || {});

test('every template builds a valid page with all elements, with none and without the website values', () => {
  for (const template of CMS_TEMPLATE_PAGES) {
    for (const options of [{}, { values: { elements: [] } }, { site: {} }]) {
      const { page, issues } = built(template, 'Page', options);
      assert.deepEqual(issues, [], `${template} ${JSON.stringify(options)}: no problems`);
      assert.ok(page.content.includes('data-h-node') || template === 'cover', `${template}: has elements`);
    }
  }
});

test('groups are grids, never flex boxes (plan 27i §9 A)', () => {
  for (const template of CMS_TEMPLATE_PAGES) {
    const { config } = built(template, 'Page', { values: { fromDatabase: template === 'team' } });
    for (const style of styles(config).filter((item) => item.display)) assert.equal(style.display, 'grid', template);
    assert.ok(!JSON.stringify(config).includes('flex'), `${template}: no flex`);
  }
});

test('cover: the page is the group, a banner behind it, logo, title, subtitle, summary, Enter site to Home', () => {
  const { page, config } = built('cover', 'Welcome', { layout: { hideHeader: true, hideFooter: true } });
  const style = config.styles.page;
  assert.equal(style.display, 'grid');
  assert.equal(style['justify-items'], 'center');
  assert.equal(style['min-height'], '100vh');
  assert.equal(style['background-image'], `url(${baseUrl}hclient/bundles/heurist-website/assets/${CMS_BANNERS[0]})`);
  assert.equal(style.color, '#ffffff', 'light text over the banner');
  assert.match(page.content, /<h1>My project<\/h1><p>A study<\/p>/);
  assert.match(page.content, /<p>First line<\/p><p>Second<\/p>/);
  assert.match(page.content, /\?db=x&amp;file=abc1/, 'the logo of the website');
  const menu = Object.values(config.instances).find((instance) => instance.type === 'actionmenu');
  assert.deepEqual(menu.settings.items, [{ label: 'Enter site', action: 'page', target: 7 }]);
  assert.deepEqual(config.layout, { hideHeader: true, hideFooter: true });

  const plain = built('cover', 'Welcome', { site: {}, values: { elements: ['title', 'logo'] } });
  assert.equal(plain.config.styles.page['background-image'], undefined, 'no background');
  assert.equal(plain.config.layout, undefined, 'header and footer kept');
  assert.match(plain.page.content, /<h1>Title of the website<\/h1>/, 'a starter title');
  assert.equal(Object.values(plain.config.media)[0].placeholder, CMS_PLACEHOLDERS.logo, 'the placeholder logo');
  assert.match(plain.page.content, /class="h-site-media-placeholder" src="https:\/\/h\.org\/heurist\/hclient\/bundles\/heurist-website\/assets\/cms\/placeholder_logo\.png"/);
});

test('landing: banner group, logo and summary beside a slideshow of three banners, buttons, features and news cards', () => {
  const { page, config } = built('landing', 'Home');
  const banner = styles(config).find((style) => style['min-height'] === '300px');
  assert.match(banner['background-image'], /assets\/cms\/banners\//);
  const gallery = Object.values(config.instances).find((instance) => instance.type === 'gallery');
  assert.equal(gallery.settings.presentation, 'slider');
  assert.equal((gallery.settings.html.def.match(/<figure>/g) || []).length, 3);
  const types = Object.values(config.instances).map((instance) => instance.type).sort();
  assert.deepEqual(types, ['actionmenu', 'cards', 'cards', 'gallery']);
  const buttons = Object.values(config.instances).find((instance) => instance.type === 'actionmenu');
  assert.deepEqual(buttons.settings.items.map((item) => item.label), ['About', 'Explore']);
  assert.match(page.content, /<h2>Features<\/h2>/);
  assert.ok(styles(config).some((style) => style['grid-template-columns'] === 'repeat(3, minmax(0, 1fr))'), 'three cards a row');
});

test('about: a section for each ticked topic, text and a placeholder image on alternate sides', () => {
  const { page, config } = built('about', 'About', { values: { elements: ['origins', 'heurist'] } });
  assert.match(page.content, /Origins of the project/);
  assert.doesNotMatch(page.content, /Aims and methodology/);
  const media = Object.values(config.media);
  assert.deepEqual(media.map((item) => item.placeholder), [CMS_PLACEHOLDERS.image, CMS_PLACEHOLDERS.image]);
  assert.ok(styles(config).some((style) => style['background-color'] === 'var(--h-color-surface)'), 'the second on the surface');
  assert.equal(built('about', 'About').config.media && Object.keys(built('about', 'About').config.media).length, CMS_ABOUT_TOPICS.length);
});

test('features and a static team: N cards on the surface colour, three columns or a list, a caption, an image', () => {
  const { page, config } = built('features', 'Features', { values: { count: 5, orientation: 'columns' } });
  const cards = styles(config).filter((style) => style['background-color'] === 'var(--h-color-surface)');
  assert.equal(cards.length, 5);
  assert.equal((page.content.match(/<h3>Feature<\/h3>/g) || []).length, 5);
  assert.ok(Object.values(config.media).every((item) => item.placeholder === CMS_PLACEHOLDERS.small && item.width === '150px'));
  const list = built('features', 'Features', { values: { count: 2, orientation: 'list' } });
  assert.ok(!styles(list.config).some((style) => style['grid-template-columns'] === 'repeat(3, minmax(0, 1fr))'), 'one under another');
  // each feature: the action menu More (its page chosen later)
  const menus = Object.values(config.instances).filter((instance) => instance.type === 'actionmenu');
  assert.equal(menus.length, 5);
  assert.deepEqual(menus[0].settings, { presentation: 'links', items: [{ label: 'More', action: 'page', target: null }] });
  const team = built('team', 'Team', { values: { fromDatabase: false, count: 4 } });
  assert.equal((team.page.content.match(/Role in the project/g) || []).length, 4);
  assert.ok(!Object.values(team.config.instances || {}).some((instance) => instance.type === 'actionmenu'), 'no More on the team');
  assert.match(team.page.content, /<h1>Project Team<\/h1>/);
});

test('team from the database: cards of the records with the Team member report', () => {
  const { config } = built('team', 'Team', { values: { fromDatabase: true, records: [3, 4], cardTemplate: CMS_TEAM_TEMPLATE } });
  const [cards] = Object.values(config.instances);
  assert.equal(cards.type, 'cards');
  assert.equal(cards.settings.template, CMS_TEAM_TEMPLATE);
  assert.deepEqual(cards.settings.query, [{ ids: '3,4' }, { sortby: 'set' }]);
  // orientation of the cards: columns (auto-fill) or a list
  assert.ok(styles(config).some((style) => String(style['grid-template-columns'] || '').startsWith('repeat(auto-fill')));
  const list = built('team', 'Team', { values: { fromDatabase: true, orientation: 'list' } });
  assert.ok(!styles(list.config).some((style) => style['grid-template-columns']), 'one under another');
});

test('contact: address and contact left, email form right, follow us with Email; sections left out when not ticked', () => {
  const { page, config } = built('contact', 'Contact');
  assert.match(page.content, /Street/);
  const types = Object.values(config.instances).map((instance) => instance.type).sort();
  assert.deepEqual(types, ['actionmenu', 'email']);
  const social = Object.values(config.instances).find((instance) => instance.type === 'actionmenu');
  assert.equal(social.settings.preset, 'social');
  assert.deepEqual(social.settings.items.map((item) => item.label), ['Email']);
  assert.ok(styles(config).some((style) => style['grid-template-columns']), 'two columns');
  const onlyForm = built('contact', 'Contact', { values: { elements: ['email'] } });
  assert.doesNotMatch(onlyForm.page.content, /Street|Email<br>/);
  assert.ok(!styles(onlyForm.config).some((style) => style['grid-template-columns']), 'one column');
});

test('discover and publications: Explorer of 80vh; the generated report opens after Add page', () => {
  const discover = built('discover', 'Discover');
  assert.match(discover.page.content, /Search and explore the records of the database/);
  assert.ok(styles(discover.config).some((style) => style.height === '80vh'));
  const publications = cmsPageStarter('publications', 'Publications', builders);
  assert.equal(publications.configure.length, 1);
});

test('banners: the list is the folder; random order without repeats; asset names pass the check', async () => {
  const folder = path.resolve('apps/website/public/assets/cms/banners');
  const files = (await readdir(folder)).filter((name) => /\.(?:png|jpe?g)$/.test(name)).sort();
  assert.deepEqual(CMS_BANNERS.map((name) => name.replace('cms/banners/', '')).sort(), files);
  for (const name of [...CMS_BANNERS, ...Object.values(CMS_PLACEHOLDERS)]) assert.match(name, CMS_ASSET_NAME);
  const picked = pickBanners(5);
  assert.equal(new Set(picked).size, 5);
  assert.deepEqual(Object.keys(CMS_TEMPLATE_ELEMENTS).sort(), [...CMS_TEMPLATE_PAGES].sort());
});
