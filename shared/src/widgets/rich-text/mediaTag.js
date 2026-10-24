/**
 * @file mediaTag.js
 * @brief The HTML that the "Media" button of the HTML editor inserts for a registered file
 *        (plan 25; port of legacy fileGetPlayerTag, hserv/records/search/recordFile.php):
 *        an image, a video or audio player, a YouTube / Vimeo / SoundCloud player, or a link.
 *        Local files use the legacy relative URL `./?db=X&file=KEY` (resolved against the
 *        Heurist base URL by the editor and the record view). Only tags the server keeps for
 *        blocktext (StoredText) are used.
 *
 *   const html = mediaTag({ key, mime, name, url, caption }, { database });
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

/**
 * HTML of a registered file.
 *
 * @param {{key?: string, mime?: string, name?: string, url?: string, caption?: string}} file The file:
 *        `key` (rec_Hash / obfuscated id) of a local file, `url` of an external one, its MIME type
 *        and name; `caption`: a figure caption.
 * @param {{database: string}} options Database name.
 * @returns {string} HTML ('' without a key or URL).
 */
export function mediaTag(file, { database }) {
  const key = String(file?.key ?? '').trim();
  const external = String(file?.url ?? '').trim();
  const mime = String(file?.mime ?? '').toLowerCase();
  const name = String(file?.name ?? '').trim();
  if (!key && !external) return '';
  const local = key ? `./?db=${encodeURIComponent(database)}&file=${encodeURIComponent(key)}` : '';
  const src = escapeAttribute(external || local);
  const embed = external ? embedUrl(external, mime) : '';
  let tag;
  if (embed) {
    tag = `<iframe src="${escapeAttribute(embed)}" width="560" height="315" frameborder="0" allowfullscreen></iframe>`;
  } else if (mime.startsWith('image/')) {
    tag = `<img width="300" src="${external ? src : escapeAttribute(`${local}&fancybox=1`)}" alt="${escapeAttribute(name)}">`;
  } else if (mime.startsWith('video/')) {
    tag = `<video controls width="640"><source src="${src}" type="${escapeAttribute(mime)}"></video>`;
  } else if (mime.startsWith('audio/')) {
    tag = `<audio controls><source src="${src}" type="${escapeAttribute(mime)}"></audio>`;
  } else {
    tag = `<a href="${src}" target="_blank">${escapeText(name || external || key)}</a>`;
  }
  const caption = String(file?.caption ?? '').trim();
  return caption ? `<figure>${tag}<figcaption>${escapeText(caption)}</figcaption></figure>` : tag;
}

/**
 * The player URL of a YouTube, Vimeo or SoundCloud page ('' for other URLs).
 *
 * @param {string} url Page URL.
 * @param {string} [mime] MIME type of the file (video/youtube, video/vimeo, audio/soundcloud).
 * @returns {string}
 */
export function embedUrl(url, mime = '') {
  const value = String(url ?? '').trim();
  const youtube = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i.exec(value);
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`;
  const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/i.exec(value);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  if (/soundcloud\.com\//i.test(value) || mime === 'audio/soundcloud') {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(value)}`;
  }
  return '';
}

/** Text in HTML. */
function escapeText(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Text in an attribute value. */
function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, '&quot;');
}
