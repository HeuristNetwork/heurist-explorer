/**
 * @file fileMediaItem.js
 * @brief One uploaded or external file shown as media (moved from RecordViewRenderer,
 *        plan 21 review 2026-10-19): audio / video as a player; other files as a
 *        thumbnail - an image toggles between the thumbnail (zoom-in cursor) and the
 *        large image (zoom-out cursor) on click; below it the links Show in OSD,
 *        Show in Mirador, Download, Show in new tab, and Close when the host gives
 *        `onClose` (the file input of the record editor). YouTube / Vimeo / SoundCloud: the
 *        thumbnail, on click the service's player (2026-10-28).
 *
 * Used by the built-in record view (RecordViewRenderer) and HInputFile.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from '../ui/i18n/HResource.js';
import { embedService, embedUrl } from '../utils/mediaEmbed.js';
import './fileMediaItem.css';

/** File extensions of images (when the MIME type is not known). */
const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|bmp|svg|tiff?)$/i;

/**
 * Viewer and file URLs of a file key in a Heurist installation.
 *
 * @param {string} baseUrl Heurist base URL (ends with `/`).
 * @param {string} database Database name.
 * @returns {{thumb: Function, file: Function, download: Function, osd: Function, mirador: Function}}
 */
export function fileMediaUrls(baseUrl, database) {
  const root = baseUrl ? String(baseUrl).replace(/\/?$/, '/') : '';
  const db = encodeURIComponent(database || '');
  const key = (value) => encodeURIComponent(value);
  return {
    thumb: (fileKey) => `${root}?db=${db}&thumb=${key(fileKey)}`,
    file: (fileKey) => `${root}?db=${db}&file=${key(fileKey)}`,
    download: (fileKey) => `${root}?db=${db}&download=1&file=${key(fileKey)}`,
    osd: (fileKey) => `${root}hclient/widgets/viewers/openSeadragonViewer.php?db=${db}&recID=${key(fileKey)}`,
    mirador: (fileKey) => `${root}hclient/widgets/viewers/miradorViewer.php?db=${db}&id=${key(fileKey)}`
  };
}

/**
 * Whether a file is an image: its MIME type, else the extension of its name.
 *
 * @param {object} file File (legacy form: `fxm_MimeType`, `ulf_OrigFileName`, `ulf_ExternalFileReference`).
 * @returns {boolean}
 */
export function isImageFile(file) {
  const mime = String(file?.fxm_MimeType || '').toLowerCase();
  if (mime) return mime.startsWith('image/');
  const name = String(file?.ulf_OrigFileName || file?.ulf_ExternalFileReference || '').split('?')[0];
  return IMAGE_EXTENSIONS.test(name);
}

/**
 * One media item of a file.
 *
 * @param {object} file File in the legacy form (`ulf_ObfuscatedFileID`, `fxm_MimeType`, `ulf_OrigFileName`,
 *        `ulf_Caption`, `ulf_ExternalFileReference`).
 * @param {object} options
 * @param {object} options.urls `fileMediaUrls(baseUrl, database)`.
 * @param {boolean} [options.download=true] Add the Download link (record view and file input, review 2026-10-20).
 * @param {Function} [options.onClose] Add a Close link that calls it.
 * @param {boolean} [options.play=false] YouTube / Vimeo / SoundCloud: show the player at once (record editor preview).
 * @returns {HTMLElement} `div.heurist-recordview-media-item`.
 */
export function buildFileMediaItem(file, { urls, download = true, onClose = null, play = false } = {}) {
  const fileId = file.ulf_ObfuscatedFileID;
  const mimeType = String(file.fxm_MimeType || '');
  const isImage = isImageFile(file);
  // Matches the legacy renderer's `fileUrl()`: an external reference is embedded directly
  // unless it's plain (insecure) `http://`, in which case it's proxied through Heurist.
  const externalUrl = file.ulf_ExternalFileReference || null;
  const mediaSrc = externalUrl && !/^http:\/\//i.test(externalUrl) ? externalUrl : urls.file(fileId);
  // YouTube / Vimeo / SoundCloud: the service's player, not a native element (2026-10-28)
  const service = externalUrl ? embedService(externalUrl, mimeType) : '';
  const isAudio = !service && mimeType.startsWith('audio/');
  const isVideo = !service && mimeType.startsWith('video/');

  const item = document.createElement('div');
  item.className = 'heurist-recordview-media-item';

  let embedToggle = null;
  if (service) {
    embedToggle = buildEmbedPlayer(item, file, service, urls, play);
  } else if (isAudio || isVideo) {
    item.classList.add('heurist-recordview-media-item-player');
    const player = document.createElement(isVideo ? 'video' : 'audio');
    player.className = 'heurist-recordview-media-player';
    player.controls = true;
    const source = document.createElement('source');
    source.src = mediaSrc;
    if (mimeType) source.type = mimeType;
    player.append(source);
    item.append(player);
  } else {
    const thumb = document.createElement('img');
    thumb.className = 'heurist-recordview-media-thumb';
    thumb.src = urls.thumb(fileId);
    thumb.alt = file.ulf_Caption || file.ulf_OrigFileName || '';
    if (isImage) {
      thumb.classList.add('heurist-recordview-media-thumb-zoomable');
      thumb.title = $HR('Click to zoom in / out');
      thumb.addEventListener('click', () => {
        const expanded = item.classList.toggle('heurist-recordview-media-item-expanded');
        thumb.src = expanded ? mediaSrc : urls.thumb(fileId);
      });
    }
    item.append(thumb);
  }

  const links = document.createElement('div');
  links.className = 'heurist-recordview-media-links';
  if (isImage) links.append(mediaLink(urls.osd(fileId), 'Show in OSD'));
  if (isImage || isAudio || isVideo) links.append(mediaLink(urls.mirador(fileId), 'Show in Mirador'));
  if (download && fileId) links.append(mediaLink(urls.download(fileId), 'Download', { download: true }));
  if (externalUrl) links.append(mediaLink(externalUrl, 'Show in new tab'));
  if (typeof onClose === 'function') {
    const close = document.createElement('a');
    close.className = 'heurist-recordview-media-link heurist-recordview-media-close';
    close.href = '#';
    close.textContent = $HR('Close');
    close.addEventListener('click', (event) => {
      event.preventDefault();
      onClose();
    });
    links.append(close);
  }
  if (embedToggle) links.prepend(embedToggle);
  if (links.children.length) item.append(links);
  return item;
}

/**
 * A YouTube / Vimeo / SoundCloud file: its thumbnail with a play mark; a click shows the
 * service's player (iframe, starts playing) in the expanded item, "Hide player" removes it
 * (and so stops playing). Without a thumbnail the service name is shown instead.
 *
 * @returns {HTMLAnchorElement} The "Hide player" link (for the links row).
 */
function buildEmbedPlayer(item, file, service, urls, play) {
  const fileId = file.ulf_ObfuscatedFileID;
  const label = { youtube: 'YouTube', vimeo: 'Vimeo', soundcloud: 'SoundCloud' }[service];
  item.classList.add('heurist-recordview-media-item-embed', `heurist-recordview-media-item-${service}`);

  const cover = document.createElement('div');
  cover.className = 'heurist-recordview-media-embed-cover';
  cover.title = $HR('Click to play');
  cover.setAttribute('role', 'button');
  cover.tabIndex = 0;
  const name = document.createElement('span');
  name.className = 'heurist-recordview-media-embed-name';
  name.textContent = label;
  if (fileId) {
    const thumb = document.createElement('img');
    thumb.className = 'heurist-recordview-media-thumb';
    thumb.src = urls.thumb(fileId);
    thumb.alt = file.ulf_Caption || label;
    thumb.addEventListener('error', () => {
      thumb.remove();
      cover.classList.add('heurist-recordview-media-embed-nothumb');
    });
    cover.append(thumb);
  } else {
    cover.classList.add('heurist-recordview-media-embed-nothumb');
  }
  const mark = document.createElement('span');
  mark.className = 'heurist-recordview-media-embed-play';
  mark.textContent = '▶';
  cover.append(name, mark);

  const toggle = document.createElement('a');
  toggle.className = 'heurist-recordview-media-link';
  toggle.href = '#';
  toggle.textContent = $HR('Hide player');
  toggle.hidden = true;

  const show = () => {
    const player = document.createElement('iframe');
    player.className = 'heurist-recordview-media-embed-frame';
    player.src = embedUrl(file.ulf_ExternalFileReference, file.fxm_MimeType, { autoplay: true });
    player.title = file.ulf_Caption || label;
    player.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    player.allowFullscreen = true;
    player.referrerPolicy = 'strict-origin-when-cross-origin';
    cover.replaceWith(player);
    item.classList.add('heurist-recordview-media-item-expanded');
    toggle.hidden = false;
  };
  cover.addEventListener('click', show);
  cover.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      show();
    }
  });
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    item.querySelector('.heurist-recordview-media-embed-frame')?.replaceWith(cover);
    item.classList.remove('heurist-recordview-media-item-expanded');
    toggle.hidden = true;
  });

  item.append(cover);
  if (play) show();
  return toggle;
}

/** One `target="_blank"` viewer link of a media item. */
function mediaLink(href, label, { download = false } = {}) {
  const link = document.createElement('a');
  link.className = 'heurist-recordview-media-link';
  link.href = href;
  if (!download) {
    link.target = '_blank';
    link.rel = 'noopener';
  }
  link.textContent = $HR(label);
  return link;
}
