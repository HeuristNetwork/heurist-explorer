/**
 * @file cmsContent.test.js
 * @brief Semi-static content of website pages (plan 27e): fields of text blocks, widgets, templates, HSlider, HMenu.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';
import { CmsRecordDocument, CMS_TEAM_TEMPLATE, cmsPageStarter } from '../src/site/cmsEdit.js';
import { checkCmsDocument, cmsNodes } from '../src/site/cmsDocument.js';

const emptyDoc = () => new CmsRecordDocument({ parts: { content: '', header: '' }, config: { schema: 'heurist-cms/4', instances: {}, styles: {} } });

test('a text block takes the value of a field: the snapshot stays in it, its translations go', () => {
  const doc = emptyDoc();
  const id = doc.insertElement('content', 'text');
  doc.setTranslation('fre', id, '<p>Texte</p>');
  assert.equal(doc.setField(id, '207439.2-1', 'Peter'), true);
  assert.equal(doc.field(id), '207439.2-1');
  assert.equal(doc.text(id), 'Peter');
  assert.equal(doc.translation('fre', id), '');
  assert.match(doc.serialize().parts.content, /data-h-field="207439\.2-1"[^>]*>Peter</);
  assert.equal(doc.setField(id, null), true, 'typed text again');
  assert.equal(doc.field(id), null);
  assert.equal(doc.text(id), 'Peter');
});

test('a Record field element: a text block with a reference, in the same format', () => {
  const doc = emptyDoc();
  const id = doc.insertElement('content', 'field');
  assert.equal(doc.setField(id, 'website.2-1', 'Title'), true);
  assert.equal(doc.serialize().parts.content, `<div data-h-node="${id}" data-h-text="" data-h-field="website.2-1">Title</div>`);
  const [item] = doc.tree('content');
  assert.equal(item.kind, 'text');
  assert.equal(item.field, 'website.2-1');
});

test('tree labels of elements without text: the image or nothing, the reference of a field', () => {
  const doc = emptyDoc();
  const label = (id) => doc.tree('content').find((item) => item.id === id).label;
  const field = doc.insertElement('content', 'field');
  doc.setField(field, 'website.2-38', '<img src="x" alt="">');
  assert.equal(label(field), 'image: website.2-38');
  doc.setField(field, 'website.2-38', '');
  assert.equal(label(field), 'empty: website.2-38');
  const text = doc.insertElement('content', 'text');
  doc.setText(text, '<p><img src="x" alt=""></p>');
  assert.equal(label(text), '(image)');
  doc.setText(text, '');
  assert.equal(label(text), '(empty text)');
  doc.setField(field, 'website.2-1', 'Title');
  assert.equal(label(field), 'Title', 'a text stays the label');
});

test('tree label of a media element: the caption without the link to the viewer', () => {
  const doc = emptyDoc();
  const label = (id) => doc.tree('content').find((item) => item.id === id).label;
  const media = doc.insertElement('content', 'media');
  doc.setMedia(media, { html: '<img src="x" alt=""><figcaption>My Image <a href="y" target="_blank">Open in OSD viewer</a></figcaption>' });
  assert.equal(label(media), 'media: My Image');
  doc.setMedia(media, { html: '<img src="x" alt=""><figcaption><a href="y">Open in OSD viewer</a></figcaption>' });
  assert.equal(label(media), 'media');
});

test('a media element has no field', () => {
  const doc = emptyDoc();
  const id = doc.insertElement('content', 'media');
  assert.equal(doc.setField(id, 'website.2-38', ''), false);
});

test('format: a field reference is checked, a field block is not a translated text', () => {
  const html = '<div data-h-node="a" data-h-text="" data-h-field="website.2-1">x</div><div data-h-node="b" data-h-text="" data-h-field="nonsense">y</div>';
  assert.equal(cmsNodes(html)[0].field, 'website.2-1');
  const issues = checkCmsDocument({ schema: 'heurist-cms/4', instances: {}, styles: {} },
    [html], { fre: {} });
  assert.deepEqual(issues.filter((issue) => issue.code === 'field_reference').map((issue) => issue.node), ['b']);
  assert.equal(issues.filter((issue) => issue.code === 'translation_missing').length, 0);
});

test('widgets are new elements; only a configured one counts as configured', () => {
  const doc = emptyDoc();
  for (const type of ['report', 'cards', 'gallery']) {
    const id = doc.insertElement('content', type);
    const node = doc.tree('content').find((item) => item.id === id);
    assert.equal(node.type, type);
    assert.equal(node.configured, false);
    doc.setInstance(node.instance, { settings: { presentation: 'list' } });
    assert.equal(doc.tree('content').find((item) => item.id === id).configured, true);
  }
});

test('header templates (plan 27f §3.1): logo, title, a subtitle to fill in, menu and language switch', () => {
  for (const template of ['siteHeader', 'headerCompact', 'headerCentered', 'headerBanner', 'headerSidebar']) {
    const doc = emptyDoc();
    doc.insertElement('header', template);
    const html = doc.serialize().parts.header;
    const fields = cmsNodes(html).map((node) => node.field).filter(Boolean);
    assert.deepEqual(fields.sort(), ['website.2-1', 'website.2-38'], template);
    assert.deepEqual(Object.values(doc.config.instances).map((instance) => instance.type).sort(), ['language', 'menu'], template);
    assert.match(html, /class="h-site-logo/, template);
    assert.match(html, /class="h-site-title"/, template);
    if (template !== 'headerCompact') assert.match(html, /class="h-site-subtitle"[^>]*><p>define subtitle<\/p>/, template);
    assert.deepEqual(checkCmsDocument(doc.config, [html]).filter((issue) => issue.level !== 'info'), [], `${template}: valid`);
  }
  const sidebar = emptyDoc();
  sidebar.insertElement('header', 'headerSidebar');
  assert.equal(Object.values(sidebar.config.instances).find((instance) => instance.type === 'menu').settings.orientation, 'auto');
});

test('footer composer (plan 27f §3.2): the chosen blocks in columns, widgets configured', () => {
  const doc = new CmsRecordDocument({ parts: { footer: '' } });
  doc.insertElement('footer', 'siteFooter', { id: null, position: 'inside' }, { blocks: ['host', 'copyright', 'social', 'badges', 'links', 'heurist'], year: 2026 });
  const html = doc.serialize().parts.footer;
  const instances = Object.values(doc.config.instances);
  assert.deepEqual(instances.map((instance) => instance.type), ['badges', 'actionmenu', 'actionmenu', 'badges'], 'in the order of CMS_FOOTER_BLOCKS');
  assert.equal(instances[1].settings.preset, 'social');
  assert.equal(instances[2].settings.presentation, 'links');
  assert.equal(instances[3].settings.source, 'host');
  assert.match(html, /© 2026 Website title/);
  assert.match(html, /Powered by <a href="https:\/\/heuristnetwork.org"/);
  const style = Object.values(doc.config.styles.nodes).find((value) => value.display === 'grid');
  assert.equal(style['grid-template-columns'], 'repeat(4, minmax(0, 1fr))', 'at most four columns');
  const small = new CmsRecordDocument({ parts: { footer: '' } });
  small.insertElement('footer', 'siteFooter', { id: null, position: 'inside' }, { blocks: ['copyright'] });
  assert.equal(Object.keys(small.config.instances).length, 0);
});

test('template Team: a heading and cards of the Team member report, the records to pick', () => {
  const { content, configuration } = cmsPageStarter('team', 'Our team');
  assert.match(content, /<h1>Our team<\/h1>/);
  const config = JSON.parse(configuration);
  const [instance] = Object.values(config.instances);
  assert.equal(instance.type, 'cards');
  assert.equal(instance.settings.template, CMS_TEAM_TEMPLATE);
  assert.equal(instance.settings.mode, 'manual');
});

test('HSlider: one slide visible, wraps around, stops on a choice', async () => {
  installFakeDom();
    const { HSlider } = await import('../src/widgets/site/HSlider.js');
    const host = document.createElement('div');
    const slides = [1, 2, 3].map(() => document.createElement('div'));
    host.append(...slides);
    const slider = new HSlider().attach(host, { presentation: 'slider', slider: { navigation: false } });
    slider.render();
    assert.equal(slides[0].classList.contains('is-active'), true);
    assert.notEqual(slider.timer, null, 'started');
    slider._go(-1);
    assert.equal(slider.index, 2);
    assert.equal(slides[2].classList.contains('is-active'), true);
    assert.equal(slides[0].classList.contains('is-active'), false);
    assert.equal(slider.timer, null, 'a choice stops it');
    slider.show(3);
    assert.equal(slider.index, 0);
    await slider.destroy();
});

test('HSlider: in the designer it shows one slide without rotation, start button and actions', async () => {
  installFakeDom();
  const { HSlider } = await import('../src/widgets/site/HSlider.js');
  const host = document.createElement('div');
  host.classList.add('h-slider-pending');
  const slides = [1, 2].map(() => document.createElement('figure'));
  slides[0].setAttribute('data-h-view', 'image');
  slides[0].setAttribute('data-h-full', 'a.png');
  host.append(...slides);
  const slider = new HSlider().attach(host, { presentation: 'slider', action: 'viewer', design: true,
    slider: { fit: 'cover' } }).render();
  assert.equal(host.classList.contains('h-slider-pending'), false);
  assert.equal(host.classList.contains('h-slider'), true);
  assert.equal(host.getAttribute('data-h-fit'), 'cover');
  assert.equal(slider.timer, null);
  assert.equal(slider.toggle, undefined);
  assert.equal(host.classList.contains('h-slider-running'), false);
  await slider.destroy();
});

test('HSlider: a carousel moves only by its buttons; << and >> from 6 slides (plan 27e §29)', async () => {
  installFakeDom();
  const { HSlider, NAV_ENDS_MIN } = await import('../src/widgets/site/HSlider.js');
  const make = async (count, options) => {
    const host = document.createElement('div');
    host.append(...Array.from({ length: count }, () => document.createElement('div')));
    const slider = new HSlider().attach(host, options).render();
    const titles = [...host.children].find((child) => child.className === 'h-slider-nav')?.children || [];
    return { slider, host, titles: [...titles].map((button) => button.title) };
  };
  const carousel = await make(3, { presentation: 'carousel', slider: { navigation: false } });
  assert.equal(carousel.host.classList.contains('h-slider'), true);
  assert.equal(carousel.slider.timer, null, 'no rotation');
  assert.equal(carousel.slider.toggle, undefined, 'no start / stop');
  assert.deepEqual(carousel.titles, ['Previous', 'Next'], 'navigation always, no << >> below 6');
  await carousel.slider.destroy();
  const show = await make(NAV_ENDS_MIN, { presentation: 'slider' });
  assert.deepEqual(show.titles, ['First', 'Previous', 'Stop', 'Next', 'Last']);
  await show.slider.destroy();
});

test('HSlider: action url makes the cards with a URL links; a list has no slider', async () => {
  installFakeDom();
    const { HSlider } = await import('../src/widgets/site/HSlider.js');
    const host = document.createElement('div');
    const card = document.createElement('div');
    card.setAttribute('data-h-url', 'https://example.org/');
    const plain = document.createElement('div');
    host.append(card, plain);
    const slider = new HSlider().attach(host, { presentation: 'list', action: 'url' }).render();
    assert.equal(card.classList.contains('h-slider-link'), true);
    assert.equal(plain.classList.contains('h-slider-link'), false);
    assert.equal(host.classList.contains('h-slider'), false);
    assert.equal(slider.timer, null);
    await slider.destroy();
});
