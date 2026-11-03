/**
 * @file cmsMedia.js
 * @brief The static HTML of a website media element (plan 27c §33): a `figure` with an image, a video / audio
 *        player or the player of YouTube / Vimeo / SoundCloud, and its caption; links to the viewers (OSD, Mirador,
 *        3D, PDF). It is made in the designer from the registered file and the settings of the element
 *        (configuration `media`), once for each language of the website.
 *
 * Thumbnail mode (both sizes under 200 px, or one under 200 px and the other auto): the thumbnail for every type.
 * With *player* the thumbnail of audio, video and services opens the player without a script
 * (`details` / `summary`: the player is not loaded while it is closed), in the player size (`playerWidth`,
 * `playerHeight`; auto: the natural size, a service 480 × 270).
 *
 *   const html = buildCmsMedia(file, { width: 'auto', height: 'auto', player: true },
 *     { urls: fileMediaUrls(baseUrl, db), caption: 'A map', language: 'eng' });
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

import { embedService, embedUrl } from '../utils/mediaEmbed.js';

/** File extensions by media type (3D: legacy detect3D_byExt, hserv/records/search/recordFile.php). */
const EXTENSIONS = Object.freeze({
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff', 'jfif', 'avif'],
  video: ['mp4', 'm4v', 'webm', 'ogv', 'mov'],
  audio: ['mp3', 'wav', 'oga', 'ogg', 'm4a', 'aac', 'flac', 'opus'],
  pdf: ['pdf'],
  '3dhop': ['nxz', 'nxs'],
  '3d': ['obj', '3ds', 'stl', 'ply', 'gltf', 'glb', 'off', '3dm', 'fbx', 'dae', 'wrl', '3mf', 'ifc', 'brep', 'step', 'iges',
    'fcstd', 'bim']
});

/** Size under which the thumbnail is shown (px). */
const THUMBNAIL_LIMIT = 200;

/** Labels of the viewer links by language of the website (3 letters); other languages: English. */
const LABELS = Object.freeze({
  eng: { osd: 'Open in OSD viewer', mirador: 'Open in Mirador', viewer3d: 'Open 3D viewer', pdf: 'Open PDF' },
  fre: { osd: 'Ouvrir dans OSD', mirador: 'Ouvrir dans Mirador', viewer3d: 'Ouvrir la visionneuse 3D', pdf: 'Ouvrir le PDF' }
});

/** Default settings of a media element. */
export const CMS_MEDIA_DEFAULTS = Object.freeze({
  file: '', width: 'auto', height: 'auto', player: false, playerWidth: 'auto', playerHeight: 'auto'
});

/** Size of a service player opened from the thumbnail when the player size is auto. */
const SERVICE_PLAYER = Object.freeze({ width: '480px', height: '270px' });

/**
 * The media type of a registered file, or null when it can not be a media element: image, video, audio, service
 * (YouTube, Vimeo, SoundCloud), iiif (a IIIF manifest or image), 3d, 3dhop, pdf.
 *
 * @param {{name?: string, ext?: string, url?: string, source?: string, mime?: string}} file `source`: the preferred
 *        source of the file (local, external, tiled, iiif, iiif_image), `ext` its file type (extension).
 * @returns {string|null}
 */
export function cmsMediaType(file) {
  const url = String(file?.url || '');
  const source = String(file?.source || '').toLowerCase();
  const name = String(file?.name || '');
  if (embedService(url, file?.mime || '')) return 'service';
  if (['iiif', 'iiif_manifest', 'iiif_image'].includes(source) || ['_iiif', '_iiif_image'].includes(name)
    || /\/info\.json(?:[?#].*)?$/.test(url)) return 'iiif';
  const ext = String(file?.ext || name.split('?')[0].split('.').pop() || '').toLowerCase().replace(/^\./, '');
  for (const [type, list] of Object.entries(EXTENSIONS)) if (list.includes(ext)) return type;
  const mime = String(file?.mime || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return mime === 'application/pdf' ? 'pdf' : null;
}

/**
 * Whether a media element shows the thumbnail: both sizes under 200 px, or one under 200 px and the other auto.
 *
 * @param {{width?: string, height?: string}} settings
 * @returns {boolean}
 */
export function isCmsMediaThumbnail(settings) {
  const small = (value) => /^(?:\d+\.?\d*|\.\d+)px$/.test(value) && parseFloat(value) < THUMBNAIL_LIMIT;
  const width = String(settings?.width || 'auto');
  const height = String(settings?.height || 'auto');
  return (small(width) && (small(height) || height === 'auto')) || (small(height) && width === 'auto');
}

/**
 * The inner HTML of the `figure` of a media element (the format the server stores: HTMLPurifier output).
 *
 * @param {{key: string, name?: string, ext?: string, url?: string, source?: string, mime?: string}} file
 * @param {{width?: string, height?: string, player?: boolean}} settings
 * @param {{urls: object, caption?: string, language?: string}} options `urls`: fileMediaUrls(baseUrl, database);
 *        `caption`: plain text; `language`: of the link labels (3 letters).
 * @returns {string}
 */
export function buildCmsMedia(file, settings = {}, { urls, caption = '', language = 'eng' } = {}) {
  const type = cmsMediaType(file);
  const key = String(file?.key || '');
  if (!type || !key || !urls) return '';
  const labels = LABELS[language === 'fra' ? 'fre' : language] || LABELS.eng;
  const text = String(caption ?? '').trim();
  const alt = text || String(file.name || '').replace(/^_+/, '');
  const size = sizeAttributes(settings);
  const thumbnail = isCmsMediaThumbnail(settings);
  const player = settings.player === true;
  const image = (src, sized = true) => `<img src="${escape(src)}" alt="${escape(alt)}"${sized ? size : ''} loading="lazy" />`;
  const thumb = image(urls.thumb(key));
  // the viewer of the full view: OSD (image), Mirador (iiif), 3D, the file (PDF)
  const viewer = {
    image: [urls.osd(key), labels.osd],
    // a registered IIIF manifest opens as `manifest`, an IIIF image (or a media file) as `id`
    iiif: [urls.mirador(key, { manifest: isIiifManifest(file) }), labels.mirador],
    '3d': [urls.viewer3d?.(key, '3d'), labels.viewer3d],
    '3dhop': [urls.viewer3d?.(key, '3dhop'), labels.viewer3d],
    pdf: [urls.file(key), labels.pdf]
  }[type];
  let body;
  let link = null;
  if (type === 'video' || type === 'audio' || type === 'service') {
    // the player opened from the thumbnail: the player size (a service: 480 × 270 when auto)
    const playerSize = !thumbnail ? size
      : sizeAttributes({ width: settings.playerWidth, height: settings.playerHeight }, type === 'service' ? SERVICE_PLAYER : {});
    const playerHtml = type === 'service'
      ? `<iframe src="${escape(embedUrl(file.url, file.mime || '', { autoplay: thumbnail }))}"${playerSize}`
        + ` title="${escape(alt)}" loading="lazy" allow="autoplay; fullscreen" allowfullscreen=""></iframe>`
      : `<${type} controls="" preload="${thumbnail ? 'none' : 'metadata'}" src="${escape(urls.file(key))}"`
        + `${type === 'audio' ? '' : playerSize}></${type}>`;
    // thumbnail mode: the thumbnail, with player a click on it shows the player (no script)
    body = !thumbnail ? playerHtml
      : player ? `<details class="h-site-media-play"><summary>${thumb}</summary>${playerHtml}</details>` : thumb;
  } else {
    // images in their size (the file), other types as the thumbnail
    const shown = type === 'image' && !thumbnail ? image(urls.file(key)) : thumb;
    if (player && viewer?.[0]) {
      link = viewer;
      body = `<a href="${escape(viewer[0])}" target="_blank" rel="noreferrer noopener">${shown}</a>`;
    } else {
      body = shown;
    }
  }
  const linkHtml = link ? `<a href="${escape(link[0])}" target="_blank" rel="noreferrer noopener">${escape(link[1])}</a>` : '';
  const captionHtml = text || linkHtml ? `<figcaption>${escape(text)}${text && linkHtml ? ' ' : ''}${linkHtml}</figcaption>` : '';
  return `${body}${captionHtml}`;
}

/** The plain caption of a media element's HTML (without the viewer link), as buildCmsMedia wrote it. */
export function cmsMediaCaption(html) {
  const caption = /<figcaption>([\s\S]*?)<\/figcaption>/i.exec(String(html ?? ''))?.[1] || '';
  return unescape(caption.replace(/\s*<a\b[\s\S]*?<\/a>\s*$/i, '').replace(/<[^>]*>/g, '')).trim();
}

/** Whether an IIIF file is a manifest (not an IIIF image): its source, or the name of a registered manifest. */
function isIiifManifest(file) {
  const source = String(file?.source || '').toLowerCase();
  return source === 'iiif' || source === 'iiif_manifest' || String(file?.name || '') === '_iiif';
}

/** width / height attributes of the settings (px as numbers, % as they are; auto: the fallback, else none). */
function sizeAttributes(settings, fallback = {}) {
  let result = '';
  for (const name of ['width', 'height']) {
    const given = String(settings?.[name] || 'auto');
    const value = given === 'auto' ? String(fallback[name] || 'auto') : given;
    if (/^(?:\d+\.?\d*|\.\d+)px$/.test(value)) result += ` ${name}="${Math.round(parseFloat(value))}"`;
    else if (/^(?:\d+\.?\d*|\.\d+)%$/.test(value)) result += ` ${name}="${value}"`;
  }
  return result;
}

function escape(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function unescape(text) {
  return String(text).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
