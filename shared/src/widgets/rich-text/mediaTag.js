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

import { embedUrl } from '../../utils/mediaEmbed.js';

export { embedUrl };

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

/** Text in HTML. */
function escapeText(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Text in an attribute value. */
function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, '&quot;');
}
