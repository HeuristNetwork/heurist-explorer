/**
 * @file mediaViewer.test.js
 * @brief The action Player / Viewer of website media (plan 27e §20): one listener serves all media of a page.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

installFakeDom();
const { attachMediaViews, closeMediaView, openMediaView } = await import('../src/widgets/site/HMediaViewer.js');

/** A figure with a view, inside `parent`. */
function figure(parent, view, url) {
  const element = document.createElement('figure');
  element.setAttribute('data-h-view', view);
  element.setAttribute('data-h-full', url);
  parent.append(element);
  return element;
}

const views = () => document.body.children.filter((child) => child.classList.contains('h-media-viewer'));

/** A click that reaches the root listener; returns whether the default was prevented. */
function click(element) {
  let prevented = false;
  const event = { type: 'click', bubbles: true, target: element, preventDefault: () => { prevented = true; } };
  element.dispatchEvent?.(event);
  return prevented;
}

test('one listener serves several single media and a gallery on a page', () => {
  const root = document.createElement('div');
  const first = figure(root, 'image', 'one.png');
  const second = figure(root, 'video', 'two.mp4');
  const gallery = document.createElement('div');
  root.append(gallery);
  const slide = figure(gallery, 'service', 'https://www.youtube.com/embed/abc?autoplay=1');
  const detach = attachMediaViews(root);
  assert.equal(first.getAttribute('tabindex'), '0');
  for (const [element, tag, url] of [[first, 'IMG', 'one.png'], [second, 'VIDEO', 'two.mp4'], [slide, 'IFRAME', 'https://www.youtube.com/embed/abc?autoplay=1']]) {
    click(element);
    const [overlay] = views();
    assert.equal(overlay.children[0].tagName, tag);
    assert.equal(overlay.children[0].getAttribute('src'), url);
    closeMediaView();
    assert.equal(views().length, 0);
  }
  detach();
  click(first);
  assert.equal(views().length, 0, 'detached');
});

test('nothing opens inside a rotating slider; a stopped one opens; IIIF, 3D and PDF go to a new window', () => {
  const root = document.createElement('div');
  const slider = document.createElement('div');
  slider.classList.add('h-slider-running');
  root.append(slider);
  const slide = figure(slider, 'image', 'a.png');
  const model = figure(root, '3d', 'viewer.php');
  const detach = attachMediaViews(root);
  const opened = [];
  globalThis.open = (url) => opened.push(url);
  try {
    assert.equal(click(slide), true, 'the click is blocked');
    assert.equal(views().length, 0);
    slider.classList.remove('h-slider-running');
    click(slide);
    assert.equal(views().length, 1);
    closeMediaView();
    click(model);
    assert.deepEqual(opened, ['viewer.php']);
    assert.equal(views().length, 0);
  } finally {
    delete globalThis.open;
    detach();
  }
});

test('only the players the server allows open in the view', () => {
  openMediaView('service', 'https://evil.example/soundcloud.com/x');
  assert.equal(views().length, 0);
  openMediaView('service', 'https://www.youtube.com/embed/abc?autoplay=1');
  assert.equal(views().length, 1);
  openMediaView('image', 'a.png');
  assert.equal(views().length, 1, 'one view at a time');
  closeMediaView();
  assert.equal(views().length, 0);
});

test('a gallery: < and > go over the views that open over the page, skip others, wrap around; arrow keys too', () => {
  const root = document.createElement('div');
  const gallery = document.createElement('div');
  gallery.classList.add('h-site-gallery');
  root.append(gallery);
  const first = figure(gallery, 'image', 'one.png');
  figure(gallery, '3d', 'viewer.php');
  figure(gallery, 'pdf', 'file.pdf');
  const video = figure(gallery, 'video', 'two.mp4');
  figure(gallery, 'service', 'https://evil.example/x');
  gallery.append(document.createElement('nav'));
  const detach = attachMediaViews(root);
  const shown = () => views()[0].children[0].getAttribute('src');
  const button = (name) => views()[0].children.find((child) => child.classList.contains(name));
  // the keydown listener of the view (the fake document has no dispatch)
  const add = document.addEventListener;
  let press = null;
  document.addEventListener = (type, handler) => {
    if (type === 'keydown') press = handler;
    add(type, handler);
  };
  click(video);
  document.addEventListener = add;
  assert.equal(shown(), 'two.mp4');
  press({ key: 'ArrowRight', target: views()[0].children[0] });
  assert.equal(shown(), 'two.mp4', 'the arrow keys of a player with the focus are its own');
  press({ key: 'ArrowRight', target: document.body });
  assert.equal(shown(), 'one.png');
  press({ key: 'ArrowLeft', target: document.body });
  assert.equal(shown(), 'two.mp4');
  button('h-media-viewer-next').click();
  assert.equal(shown(), 'one.png', 'wraps around, skips 3D, PDF and a player that is not allowed');
  assert.equal(views()[0].children[0].tagName, 'IMG');
  button('h-media-viewer-previous').click();
  assert.equal(shown(), 'two.mp4');
  closeMediaView();
  click(first);
  assert.equal(shown(), 'one.png');
  closeMediaView();
  assert.equal(views().length, 0);
  detach();
});

test('single media has no < and >; nor a gallery with one element that opens over the page', () => {
  const root = document.createElement('div');
  const single = figure(root, 'image', 'one.png');
  const gallery = document.createElement('div');
  gallery.classList.add('h-site-gallery');
  root.append(gallery);
  const only = figure(gallery, 'image', 'two.png');
  figure(gallery, 'iiif', 'mirador.php');
  const detach = attachMediaViews(root);
  for (const element of [single, only]) {
    click(element);
    assert.equal(views()[0].children.some((child) => child.classList.contains('h-media-viewer-nav')), false);
    closeMediaView();
  }
  detach();
});
