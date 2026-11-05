/**
 * @file HMediaViewer.js
 * @brief The action Player / Viewer of website media (plan 27e §20): one listener for the whole page serves every single
 *        media element and every gallery. An element with `data-h-view` and `data-h-full` opens on a click or Enter: an
 *        image, video, audio or service player over the page, other views (IIIF, 3D, PDF) in a new window. Nothing
 *        opens inside a rotating slider (`h-slider-running`). In a gallery the view has `<` and `>` (and the arrow keys)
 *        over the other elements that open over the page; it wraps around. It knows nothing about the Heurist API.
 *
 *   const detach = attachMediaViews(document.body);
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

import { $HR } from '../../ui/i18n/HResource.js';
import './HMediaViewer.css';

/** Views shown over the page by HTML element; other views open in a new window. */
const OVERLAY_TAGS = Object.freeze({ image: 'img', video: 'video', audio: 'audio', service: 'iframe' });

/** Players allowed in the view over the page (the iframes HTMLPurifier allows on the server). */
const SAFE_PLAYER = /^https:\/\/(www\.youtube(?:-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/|w\.soundcloud\.com\/player\/)/i;

/** Removes the open view; null when none is open. */
let removeView = null;

/** Whether a view opens over the page. */
function opensOverPage({ view, url }) {
  const tag = OVERLAY_TAGS[view];
  return Boolean(tag) && (tag !== 'iframe' || SAFE_PLAYER.test(url));
}

/** The element of a view. */
function mediaElement({ view, url, title = '' }) {
  const tag = OVERLAY_TAGS[view];
  const media = document.createElement(tag);
  media.setAttribute('src', url);
  if (tag === 'img') media.setAttribute('alt', title);
  if (tag === 'iframe') {
    media.setAttribute('title', title || $HR('Viewer'));
    media.setAttribute('allow', 'autoplay; fullscreen');
    media.setAttribute('allowfullscreen', '');
  }
  if (tag === 'video' || tag === 'audio') {
    media.setAttribute('controls', '');
    media.setAttribute('autoplay', '');
  }
  return media;
}

/** A button of the view. */
function viewerButton(className, icon, title, run) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.title = $HR(title);
  button.setAttribute('aria-label', button.title);
  const glyph = document.createElement('i');
  glyph.className = `fa-solid ${icon}`;
  glyph.setAttribute('aria-hidden', 'true');
  button.append(glyph);
  button.addEventListener('click', run);
  return button;
}

/**
 * Open a view over the page, or in a new window.
 *
 * @param {string} view `data-h-view`: image, video, audio, service, iiif, 3d, 3dhop, pdf.
 * @param {string} url `data-h-full`.
 * @param {string} [title] Text for the screen readers.
 * @param {{items?: Array<{view: string, url: string, title: string}>, index?: number}} [options] The views of a gallery that open
 *        over the page and the position of this one: with two or more the view has `<` and `>`.
 * @returns {void}
 */
export function openMediaView(view, url, title = '', { items = null, index = 0 } = {}) {
  const current = { view, url, title };
  if (!OVERLAY_TAGS[view]) {
    globalThis.open?.(url, '_blank', 'noopener');
    return;
  }
  if (!opensOverPage(current)) return;
  closeMediaView();
  const list = items?.length ? items : [current];
  const opener = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'h-media-viewer';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title || $HR('Viewer'));
  let position = items?.length ? index : 0;
  let media = mediaElement(list[position]);
  const step = (change) => {
    if (list.length < 2) return;
    position = (position + change + list.length) % list.length;
    const next = mediaElement(list[position]);
    media.replaceWith(next); // the player of the last view stops
    media = next;
    overlay.setAttribute('aria-label', list[position].title || $HR('Viewer'));
  };
  const close = viewerButton('h-media-viewer-close', 'fa-xmark', 'Close', closeMediaView);
  overlay.append(media, close);
  if (list.length > 1) {
    overlay.append(
      viewerButton('h-media-viewer-nav h-media-viewer-previous', 'fa-chevron-left', 'Previous', () => step(-1)),
      viewerButton('h-media-viewer-nav h-media-viewer-next', 'fa-chevron-right', 'Next', () => step(1))
    );
  }
  const onKey = (event) => {
    if (event.key === 'Escape') closeMediaView();
    // the arrow keys of a player that has the focus are its own (seek, volume)
    if (event.target === media) return;
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  };
  removeView = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove(); // also stops a player
    removeView = null;
    opener?.focus?.();
  };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeMediaView();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  close.focus?.();
}

/** Close the view over the page. */
export function closeMediaView() {
  removeView?.();
}

/**
 * Serve all media of a page with one listener; elements added later are served too (Enter needs `tabindex`).
 *
 * @param {HTMLElement} root The page (document.body).
 * @returns {() => void} Removes the listeners.
 */
export function attachMediaViews(root) {
  for (const element of root.querySelectorAll('[data-h-view]')) element.setAttribute('tabindex', '0');
  const onClick = (event) => openElement(event, event.target?.closest?.('[data-h-view]'));
  const onKey = (event) => {
    if (event.key === 'Enter' && event.target?.hasAttribute?.('data-h-view')) openElement(event, event.target);
  };
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKey);
  };
}

/** The action of an element. Its links work only when its slider does not rotate. */
function openElement(event, element) {
  if (!element) return;
  if (element.closest('.h-slider-running')) {
    event.preventDefault();
    return;
  }
  const url = element.getAttribute('data-h-full');
  if (!url || event.target?.closest?.('a[href]')) return;
  event.preventDefault();
  const current = viewOf(element);
  const siblings = [...(element.closest('.h-site-gallery')?.children || [])].filter((child) => child.hasAttribute('data-h-full'));
  const items = siblings.filter((child) => opensOverPage(viewOf(child)));
  openMediaView(current.view, current.url, current.title, { items: items.map(viewOf), index: items.indexOf(element) });
}

/** The view of an element. */
function viewOf(element) {
  return {
    view: element.getAttribute('data-h-view'),
    url: element.getAttribute('data-h-full'),
    title: element.querySelector('figcaption')?.textContent?.trim() || ''
  };
}
