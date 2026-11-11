/**
 * @file cmsMedia.js
 * @brief The static HTML of a website media element (plan 27c §33): a `figure` with an image, a video / audio
 *        player or the player of YouTube / Vimeo / SoundCloud, and its caption; links to the viewers (OSD, Mirador,
 *        3D, PDF). It is made in the designer from the registered file and the settings of the element
 *        (configuration `media`), once for each language of the website.
 *
 * Thumbnail mode (both sizes under 200 px, or one under 200 px and the other auto): the thumbnail for every type.
 * Action Player / Viewer (`view`, plan 27e §20): no player and no link around the media; `cmsMediaView` gives the
 * `data-h-view` and `data-h-full` of the figure, HMediaViewer opens them. Both single media and galleries.
 *
 *   const html = buildCmsMedia(file, { width: 'auto', height: 'auto', view: true },
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
  audio: ['mp3', 'mp2', 'mpga', 'wav', 'oga', 'ogg', 'm4a', 'aac', 'flac', 'opus'],
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
  file: '', width: 'auto', height: 'auto', action: 'none', mode: 'files', record: 0
});

/**
 * The action of a media element; an element saved before plan 27e §20 has `player`.
 *
 * @param {{action?: string, player?: boolean}} settings
 * @returns {'none'|'viewer'}
 */
export function cmsMediaAction(settings) {
  return settings?.action === 'viewer' || settings?.player === true ? 'viewer' : 'none';
}

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
  // the file type of the database, then the extension of the name (an .mp3 can be registered as mp2)
  const extensions = [file?.ext, name.split('?')[0].split('.').pop()].map((value) => String(value || '').toLowerCase().replace(/^\./, ''));
  for (const ext of extensions) {
    for (const [type, list] of Object.entries(EXTENSIONS)) if (list.includes(ext)) return type;
  }
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
 * @param {{width?: string, height?: string, view?: boolean}} settings `view`: see the file header.
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
  const view = settings.view === true;
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
    const playerHtml = type === 'service'
      ? `<iframe src="${escape(embedUrl(file.url, file.mime || ''))}"${size}`
        + ` title="${escape(alt)}" loading="lazy" allow="autoplay; fullscreen" allowfullscreen=""></iframe>`
      : `<${type} controls="" preload="metadata" src="${escape(urls.file(key))}"${type === 'audio' ? '' : size}></${type}>`;
    body = view || thumbnail ? thumb : playerHtml;
  } else {
    // images in their size (the file), other types as the thumbnail
    body = type === 'image' && !thumbnail ? image(urls.file(key)) : thumb;
    if (view && viewer?.[0]) link = viewer;
  }
  const linkHtml = link ? `<a href="${escape(link[0])}" target="_blank" rel="noreferrer noopener">${escape(link[1])}</a>` : '';
  const captionHtml = text || linkHtml ? `<figcaption>${escape(text)}${text && linkHtml ? ' ' : ''}${linkHtml}</figcaption>` : '';
  return `${body}${captionHtml}`;
}

/**
 * What the action Player / Viewer of a gallery opens.
 *
 * @param {{key: string, name?: string, ext?: string, url?: string, source?: string, mime?: string}} file
 * @param {object} urls fileMediaUrls(baseUrl, database).
 * @returns {{type: string, url: string}|null} `type`: cmsMediaType; `url`: the file, the player or the viewer.
 */
export function cmsMediaView(file, urls) {
  const type = cmsMediaType(file);
  const key = String(file?.key || '');
  if (!type || !key || !urls) return null;
  const url = {
    service: () => embedUrl(file.url, file.mime || '', { autoplay: true }),
    iiif: () => urls.mirador(key, { manifest: isIiifManifest(file) }),
    '3d': () => urls.viewer3d?.(key, '3d'),
    '3dhop': () => urls.viewer3d?.(key, '3dhop')
  }[type]?.() ?? urls.file(key);
  return url ? { type, url } : null;
}

/**
 * One element of a media gallery (plan 27e §18): a `figure` with the HTML of a media element and, in view mode, the
 * view for HSlider.
 *
 * @param {object} file See buildCmsMedia.
 * @param {object} settings See buildCmsMedia.
 * @param {{urls: object, caption?: string, language?: string, record?: number}} options See buildCmsMedia; `record`: the
 *        record of the figure (Type Any record, `data-h-rec`: the server adds the link of the action, plan 27g §6).
 * @returns {string} HTML; empty when the file can not be media.
 */
export function buildCmsGalleryItem(file, settings = {}, options = {}) {
  const html = buildCmsMedia(file, settings, options);
  if (!html) return '';
  const target = settings.view === true ? cmsMediaView(file, options.urls) : null;
  const view = target ? ` data-h-view="${escape(target.type)}" data-h-full="${escape(target.url)}"` : '';
  const record = Number(options.record) > 0 ? ` data-h-rec="${Number(options.record)}"` : '';
  return `<figure class="h-site-card" data-h-media=""${view}${record}>${html}</figure>`;
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

/** width / height attributes of the settings (px as numbers, % as they are; auto: none). */
function sizeAttributes(settings) {
  let result = '';
  for (const name of ['width', 'height']) {
    const value = String(settings?.[name] || 'auto');
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
