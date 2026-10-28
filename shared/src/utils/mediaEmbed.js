/**
 * @file mediaEmbed.js
 * @brief Player URLs of YouTube, Vimeo and SoundCloud pages (port of legacy getPlayerURL,
 *        hserv/records/search/recordFile.php). A browser can not play these pages in a native
 *        audio / video element; they are shown in the service's own player (an iframe).
 *
 * Used by the HTML editor "Media" button (mediaTag.js) and the file media item of the
 * record view and record editor (fileMediaItem.js). The record view HTML keeps only these
 * player iframes (richTextHtml.js SAFE_IFRAME).
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

/** MIME types of the services (defFileExtToMimetype youtube / vimeo / soundcloud). */
export const EMBED_MIME_TYPES = Object.freeze(['video/youtube', 'video/vimeo', 'audio/soundcloud']);

const YOUTUBE = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{6,})/i;
// vimeo.com/123, vimeo.com/channels/x/123, vimeo.com/123/abcdef (unlisted), player.vimeo.com/video/123?h=abcdef
const VIMEO = /vimeo\.com\/(?:[^?#]*\/)?(\d{3,})(?:\/([\da-f]{6,}))?(?:[^#]*[?&]h=([\da-f]+))?/i;

/**
 * The service of a page: 'youtube', 'vimeo', 'soundcloud' or ''.
 *
 * @param {string} url Page URL.
 * @param {string} [mime] MIME type of the file (video/youtube, video/vimeo, audio/soundcloud).
 * @returns {string}
 */
export function embedService(url, mime = '') {
  const value = String(url ?? '').trim();
  const type = String(mime ?? '').toLowerCase();
  if (!value) return '';
  if (YOUTUBE.test(value)) return 'youtube';
  if (VIMEO.test(value)) return 'vimeo';
  if (/soundcloud\.com\//i.test(value) || type === 'audio/soundcloud') return 'soundcloud';
  return '';
}

/**
 * The player URL of a YouTube, Vimeo or SoundCloud page ('' for other URLs).
 *
 * @param {string} url Page URL.
 * @param {string} [mime] MIME type of the file (video/youtube, video/vimeo, audio/soundcloud).
 * @param {{autoplay?: boolean}} [options] Start playing at once (after a click on the thumbnail).
 * @returns {string}
 */
export function embedUrl(url, mime = '', { autoplay = false } = {}) {
  const value = String(url ?? '').trim();
  const service = embedService(value, mime);
  if (service === 'youtube') {
    const id = YOUTUBE.exec(value)[1];
    return `https://www.youtube.com/embed/${id}${autoplay ? '?autoplay=1' : ''}`;
  }
  if (service === 'vimeo') {
    const [, id, path, query] = VIMEO.exec(value);
    const params = [];
    if (path || query) params.push(`h=${path || query}`);
    if (autoplay) params.push('autoplay=1');
    return `https://player.vimeo.com/video/${id}${params.length ? `?${params.join('&')}` : ''}`;
  }
  if (service === 'soundcloud') {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(value)}${autoplay ? '&auto_play=true' : ''}`;
  }
  return '';
}
